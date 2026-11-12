<script lang="ts">
	import { onMount } from 'svelte';
	import { api } from '$lib/api';
	import { session } from '$lib/session.svelte';
	import { isRoot } from '$lib/perm';
	import { locale, t } from '$lib/i18n';

	interface BotDataStatus {
		source: 'blob' | 'bundled';
		updatedAt: string | null;
		uploadedBy: string | null;
		bytes: number;
		keys: string[];
		lastError?: string;
	}

	let status = $state<BotDataStatus | null>(null);
	let loading = $state(true);
	let error = $state('');
	let message = $state('');
	let uploading = $state(false);
	let pending = $state<{ name: string; data: unknown } | null>(null);

	const allowed = $derived(session.user ? isRoot(session.user.permission) : false);

	onMount(async () => {
		if (!allowed) {
			loading = false;
			return;
		}
		try {
			const data = await api.get<{ status: BotDataStatus }>('/bot-data');
			status = data.status;
		} catch (err) {
			error = (err as Error).message;
		} finally {
			loading = false;
		}
	});

	async function onFile(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;

		error = '';
		message = '';

		let parsed: unknown;
		try {
			parsed = JSON.parse(await file.text());
		} catch {
			pending = null;
			error = $t('botData.badJson');
			return;
		}
		pending = { name: file.name, data: parsed };
	}

	async function upload() {
		if (!pending || uploading) return;
		uploading = true;
		error = '';
		message = '';
		try {
			const res = await api.post<{ status: BotDataStatus }>('/bot-data', pending.data);
			status = res.status;
			pending = null;
			message = $t('botData.success');
		} catch (err) {
			error = (err as Error).message;
		} finally {
			uploading = false;
		}
	}

	function formatBytes(bytes: number): string {
		if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
		if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${bytes} B`;
	}

	function formatDate(iso: string | null): string {
		if (!iso) return '—';
		return new Date(iso).toLocaleString($locale ?? 'zh-hans', { hour12: false });
	}
</script>

<div class="page">
	<h1>{$t('botData.title')}</h1>

	{#if !allowed}
		<p class="muted">{$t('botData.notRoot')}</p>
	{:else if loading}
		<p class="muted">{$t('app.loading')}</p>
	{:else}
		<p class="muted desc">{$t('botData.desc')}</p>

		<div class="card">
			<dl>
				<dt>{$t('botData.source')}</dt>
				<dd>
					{status?.source === 'blob' ? $t('botData.sourceBlob') : $t('botData.sourceBundled')}
				</dd>
				<dt>{$t('botData.updatedAt')}</dt>
				<dd>{formatDate(status?.updatedAt ?? null)}</dd>
				<dt>{$t('botData.uploadedBy')}</dt>
				<dd>{status?.uploadedBy ?? '—'}</dd>
				<dt>{$t('botData.size')}</dt>
				<dd>{status ? formatBytes(status.bytes) : '—'}</dd>
				<dt>{$t('botData.keys')}</dt>
				<dd class="keys">
					{#each status?.keys ?? [] as key (key)}
						<code>{key}</code>
					{/each}
				</dd>
			</dl>

			{#if status?.lastError}
				<p class="warn">{$t('botData.sourceBundled')} · {status.lastError}</p>
			{/if}
		</div>

		<div class="card uploader">
			<label class="pick">
				<span>{$t('botData.choose')}</span>
				<input type="file" accept="application/json,.json" onchange={onFile} />
			</label>

			{#if pending}
				<p class="pending">{pending.name}</p>
			{/if}

			<button class="primary" onclick={upload} disabled={!pending || uploading}>
				{uploading ? $t('botData.uploading') : $t('botData.upload')}
			</button>

			{#if error}<p class="error">{error}</p>{/if}
			{#if message}<p class="ok">{message}</p>{/if}
		</div>
	{/if}
</div>

<style>
	.page {
		flex: 1;
		min-height: 0;
		padding: 24px;
		max-width: 760px;
		width: 100%;
		margin: 0 auto;
		overflow-y: auto;
	}

	h1 {
		font-size: 20px;
		margin: 0 0 8px;
	}

	.desc {
		margin: 0 0 16px;
		font-size: 13px;
	}

	dl {
		display: grid;
		grid-template-columns: 110px 1fr;
		gap: 10px 14px;
		margin: 0;
	}

	dt {
		color: var(--muted);
		font-size: 13px;
	}

	dd {
		margin: 0;
		font-size: 13px;
		word-break: break-all;
	}

	.keys {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}

	code {
		font-family: ui-monospace, Consolas, monospace;
		font-size: 12px;
		background: var(--panel-2);
		border: 1px solid var(--border);
		border-radius: 5px;
		padding: 1px 6px;
	}

	.warn {
		margin: 14px 0 0;
		font-size: 12px;
		color: var(--muted);
	}

	.uploader {
		margin-top: 16px;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.pick {
		display: flex;
		flex-direction: column;
		gap: 6px;
		font-size: 13px;
		color: var(--muted);
	}

	.pick input {
		width: auto;
		color: var(--text);
	}

	.pending {
		margin: 0;
		font-size: 13px;
	}

	.ok {
		color: var(--ok);
		margin: 0;
		font-size: 13px;
	}
</style>
