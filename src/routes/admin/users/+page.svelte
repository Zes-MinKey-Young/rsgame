<script lang="ts">
	import { onMount } from 'svelte';
	import { api } from '$lib/api';
	import { session } from '$lib/session.svelte';
	import {
		canBan,
		canDeleteUser,
		canSetPermission,
		permissionChoices,
		permissionKey
	} from '$lib/perm';
	import { locale, t } from '$lib/i18n';
	import type { User } from '$lib/types';

	let users = $state<User[]>([]);
	let loading = $state(true);
	let error = $state('');
	let busyName = $state('');

	const me = $derived(session.user);
	const choices = permissionChoices();

	async function load() {
		try {
			const data = await api.get<{ users: User[] }>('/users');
			users = data.users;
			error = '';
		} catch (err) {
			error = (err as Error).message;
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		void load();
	});

	function replace(user: User) {
		users = users.map((u) => (u.id === user.id ? user : u));
	}

	async function toggleBan(user: User) {
		const shouldBan = user.permission !== 0;
		if (shouldBan && !confirm($t('admin.banConfirm', { name: user.username }))) return;
		busyName = user.username;
		try {
			const data = await api.post<{ user: User }>(`/users/${user.username}/ban`, {
				banned: shouldBan
			});
			replace(data.user);
			error = '';
		} catch (err) {
			error = (err as Error).message;
		} finally {
			busyName = '';
		}
	}

	async function changePermission(user: User, value: number) {
		busyName = user.username;
		try {
			const data = await api.post<{ user: User }>(`/users/${user.username}/permission`, {
				permission: value
			});
			replace(data.user);
			error = '';
		} catch (err) {
			error = (err as Error).message;
			void load();
		} finally {
			busyName = '';
		}
	}

	async function removeUser(user: User) {
		if (!confirm($t('admin.deleteConfirm', { name: user.username }))) return;
		busyName = user.username;
		try {
			await api.post(`/users/${user.username}/delete`);
			users = users.filter((u) => u.id !== user.id);
			error = '';
		} catch (err) {
			error = (err as Error).message;
		} finally {
			busyName = '';
		}
	}

	function canTouch(user: User): boolean {
		if (!me || me.id === user.id) return true;
		return user.permission < me.permission;
	}

	function formatDate(iso: string): string {
		return new Date(iso).toLocaleDateString($locale ?? 'zh-hans');
	}
</script>

<div class="page">
	<h1>{$t('admin.usersTitle')}</h1>
	{#if error}<p class="error">{error}</p>{/if}

	{#if loading}
		<p class="muted">{$t('app.loading')}</p>
	{:else}
		<div class="table card">
			<table>
				<thead>
					<tr>
						<th>{$t('admin.colUser')}</th>
						<th>{$t('admin.colName')}</th>
						<th>{$t('admin.colPermission')}</th>
						<th>{$t('admin.colCreated')}</th>
						<th>{$t('admin.colActions')}</th>
					</tr>
				</thead>
				<tbody>
					{#each users as user (user.id)}
						<tr class:banned={user.permission === 0}>
							<td>
								{user.username}
								{#if me?.id === user.id}<span class="muted">{$t('admin.self')}</span>{/if}
							</td>
							<td>{user.displayName}</td>
							<td>
								{#if me && canSetPermission(me.permission) && canTouch(user)}
									<select
										value={user.permission}
										disabled={busyName === user.username}
										onchange={(e) => changePermission(user, Number(e.currentTarget.value))}
									>
										{#each choices as choice (choice.value)}
											<option value={choice.value}>{$t(choice.key)}</option>
										{/each}
										{#if !choices.some((c) => c.value === user.permission)}
											<option value={user.permission}>{$t(permissionKey(user.permission))}</option>
										{/if}
									</select>
								{:else}
									{$t(permissionKey(user.permission))}
								{/if}
							</td>
							<td class="muted small">{formatDate(user.createdAt)}</td>
							<td class="actions">
								{#if me && canBan(me.permission) && canTouch(user) && me.id !== user.id}
									<button
										class="danger"
										disabled={busyName === user.username}
										onclick={() => toggleBan(user)}
									>
										{user.permission === 0 ? $t('admin.unban') : $t('admin.ban')}
									</button>
								{/if}
								{#if me && canDeleteUser(me.permission) && canTouch(user) && me.id !== user.id}
									<button
										class="danger"
										disabled={busyName === user.username}
										onclick={() => removeUser(user)}
									>
										{$t('admin.deleteUser')}
									</button>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>

<style>
	.page {
		flex: 1;
		min-height: 0;
		padding: 24px;
		max-width: 960px;
		width: 100%;
		margin: 0 auto;
		overflow-y: auto;
	}

	h1 {
		font-size: 20px;
		margin: 0 0 16px;
	}

	.table {
		padding: 4px 8px;
		overflow-x: auto;
	}

	table {
		width: 100%;
		border-collapse: collapse;
	}

	th,
	td {
		text-align: left;
		padding: 10px 8px;
		border-bottom: 1px solid var(--border);
		font-size: 13px;
	}

	th {
		color: var(--muted);
		font-weight: 500;
	}

	tr:last-child td {
		border-bottom: none;
	}

	tr.banned td {
		opacity: 0.55;
	}

	.small {
		font-size: 12px;
	}

	.actions {
		display: flex;
		gap: 6px;
	}

	select {
		font: inherit;
		background: var(--panel-2);
		color: var(--text);
		border: 1px solid var(--border);
		border-radius: 6px;
		padding: 4px 6px;
	}
</style>
