<script lang="ts">
	import { api } from '$lib/api';
	import { session } from '$lib/session.svelte';
	import { permissionKey } from '$lib/perm';
	import { locale, t } from '$lib/i18n';
	import type { User } from '$lib/types';

	let displayName = $state('');
	let error = $state('');
	let saved = $state(false);
	let busy = $state(false);

	$effect(() => {
		if (session.user) displayName = session.user.displayName;
	});

	async function save(event: SubmitEvent) {
		event.preventDefault();
		if (busy) return;
		busy = true;
		error = '';
		saved = false;
		try {
			const data = await api.post<{ user: User }>('/me', { displayName: displayName.trim() });
			session.setUser(data.user);
			saved = true;
		} catch (err) {
			error = (err as Error).message;
		} finally {
			busy = false;
		}
	}

	function formatDate(iso: string): string {
		return new Date(iso).toLocaleString($locale ?? 'zh-hans', { hour12: false });
	}
</script>

<div class="page">
	<h1>{$t('me.title')}</h1>

	{#if session.user}
		<div class="card">
			<dl>
				<dt>{$t('me.username')}</dt>
				<dd>{session.user.username}</dd>
				<dt>{$t('me.permission')}</dt>
				<dd>{$t(permissionKey(session.user.permission))}</dd>
				<dt>{$t('me.createdAt')}</dt>
				<dd>{formatDate(session.user.createdAt)}</dd>
			</dl>

			<form class="rename" onsubmit={save}>
				<label>
					{$t('me.displayName')}
					<input bind:value={displayName} maxlength="20" required />
				</label>
				<button class="primary" type="submit" disabled={busy}>{$t('common.save')}</button>
			</form>

			{#if error}<p class="error">{error}</p>{/if}
			{#if saved}<p class="ok">{$t('common.saved')}</p>{/if}
		</div>
	{/if}
</div>

<style>
	.page {
		flex: 1;
		min-height: 0;
		padding: 24px;
		max-width: 560px;
		width: 100%;
		margin: 0 auto;
		overflow-y: auto;
	}

	h1 {
		font-size: 20px;
		margin: 0 0 16px;
	}

	dl {
		display: grid;
		grid-template-columns: 90px 1fr;
		gap: 8px 12px;
		margin: 0 0 20px;
	}

	dt {
		color: var(--muted);
	}

	dd {
		margin: 0;
	}

	.rename {
		display: flex;
		gap: 8px;
		align-items: flex-end;
		border-top: 1px solid var(--border);
		padding-top: 16px;
	}

	label {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 6px;
		font-size: 13px;
		color: var(--muted);
	}

	.ok {
		color: var(--ok);
	}
</style>
