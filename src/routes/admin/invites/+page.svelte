<script lang="ts">
	import { onMount } from 'svelte';
	import { api } from '$lib/api';
	import { locale, t } from '$lib/i18n';
	import type { Invite } from '$lib/types';

	let invites = $state<Invite[]>([]);
	let loading = $state(true);
	let error = $state('');
	let busy = $state(false);
	let maxUses = $state(1);
	let expiresInHours = $state<number | ''>('');
	let copied = $state('');

	async function load() {
		try {
			const data = await api.get<{ invites: Invite[] }>('/invites');
			invites = data.invites;
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

	async function create(event: SubmitEvent) {
		event.preventDefault();
		if (busy) return;
		busy = true;
		error = '';
		try {
			await api.post<{ invite: Invite }>('/invites', {
				maxUses: Number(maxUses),
				expiresInHours: expiresInHours === '' ? null : Number(expiresInHours)
			});
			await load();
		} catch (err) {
			error = (err as Error).message;
		} finally {
			busy = false;
		}
	}

	async function revoke(invite: Invite) {
		if (!confirm($t('admin.revokeConfirm', { code: invite.code }))) return;
		try {
			const data = await api.post<{ invite: Invite }>(`/invites/${invite.code}/revoke`);
			invites = invites.map((i) => (i.code === invite.code ? data.invite : i));
		} catch (err) {
			error = (err as Error).message;
		}
	}

	async function copy(code: string) {
		try {
			await navigator.clipboard.writeText(code);
			copied = code;
			setTimeout(() => (copied = ''), 1500);
		} catch {
			/* 剪贴板不可用时忽略 */
		}
	}

	function statusKey(invite: Invite): 'admin.statusRevoked' | 'admin.statusExpired' | 'admin.statusExhausted' | 'admin.statusActive' {
		if (invite.revokedAt) return 'admin.statusRevoked';
		if (invite.expired) return 'admin.statusExpired';
		if (invite.exhausted) return 'admin.statusExhausted';
		return 'admin.statusActive';
	}

	function formatDate(iso: string): string {
		return new Date(iso).toLocaleString($locale ?? 'zh-hans', { hour12: false });
	}
</script>

<div class="page">
	<h1>{$t('admin.invitesTitle')}</h1>

	<form class="card create" onsubmit={create}>
		<label>
			{$t('admin.maxUses')}
			<input type="number" min="0" max="1000" bind:value={maxUses} />
		</label>
		<label>
			{$t('admin.expiresIn')}
			<input type="number" min="1" max="8760" bind:value={expiresInHours} placeholder={$t('admin.expiresPlaceholder')} />
		</label>
		<button class="primary" type="submit" disabled={busy}>{$t('admin.createInvite')}</button>
	</form>

	{#if error}<p class="error">{error}</p>{/if}

	{#if loading}
		<p class="muted">{$t('app.loading')}</p>
	{:else if invites.length === 0}
		<p class="muted">{$t('admin.invitesEmpty')}</p>
	{:else}
		<div class="table card">
			<table>
				<thead>
					<tr>
						<th>{$t('admin.colCode')}</th>
						<th>{$t('admin.colUsage')}</th>
						<th>{$t('admin.colStatus')}</th>
						<th>{$t('admin.colExpires')}</th>
						<th>{$t('admin.colActions')}</th>
					</tr>
				</thead>
				<tbody>
					{#each invites as invite (invite.code)}
						<tr>
							<td><code>{invite.code}</code></td>
							<td>
								{invite.usedCount} / {invite.maxUses === 0 ? $t('admin.infinite') : invite.maxUses}
							</td>
							<td>{$t(statusKey(invite))}</td>
							<td class="muted small">
								{invite.expiresAt ? formatDate(invite.expiresAt) : '—'}
							</td>
							<td class="actions">
								<button onclick={() => copy(invite.code)}>
									{copied === invite.code ? $t('common.copied') : $t('common.copy')}
								</button>
								{#if !invite.revokedAt}
									<button class="danger" onclick={() => revoke(invite)}>{$t('common.revoke')}</button>
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
		max-width: 880px;
		width: 100%;
		margin: 0 auto;
		overflow-y: auto;
	}

	h1 {
		font-size: 20px;
		margin: 0 0 16px;
	}

	.create {
		display: flex;
		flex-wrap: wrap;
		gap: 12px;
		align-items: flex-end;
		margin-bottom: 20px;
	}

	label {
		display: flex;
		flex-direction: column;
		gap: 6px;
		font-size: 13px;
		color: var(--muted);
		flex: 1;
		min-width: 160px;
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

	code {
		font-family: ui-monospace, Consolas, monospace;
		letter-spacing: 0.5px;
	}

	.small {
		font-size: 12px;
	}

	.actions {
		display: flex;
		gap: 6px;
	}
</style>
