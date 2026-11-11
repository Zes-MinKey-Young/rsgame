<script lang="ts">
	import { onDestroy, onMount, tick } from 'svelte';
	import { page } from '$app/state';
	import { api } from '$lib/api';
	import { session } from '$lib/session.svelte';
	import { startPolling } from '$lib/realtime';
	import { canRecallAny } from '$lib/perm';
	import { locale, t } from '$lib/i18n';
	import type { ChatMessage, Room } from '$lib/types';

	const roomId = $derived(page.params.id ?? '');

	let room = $state<Room | null>(null);
	let isOwner = $state(false);
	let canClose = $state(false);
	let messages = $state<ChatMessage[]>([]);
	let input = $state('');
	let error = $state('');
	let busy = $state(false);
	let atBot = $state(false);
	let expanded = $state<Record<string, boolean>>({});
	let scroller: HTMLDivElement | undefined = $state();
	/** 视口是否贴在底部 */
	let atBottom = $state(true);
	/** 有新消息但用户在看上面，显示悬浮的下箭头 */
	let hasNew = $state(false);

	// 非响应式：轮询游标
	let cursor = 0;
	let stopPolling: (() => void) | null = null;

	type Item =
		| { kind: 'single'; key: string; msg: ChatMessage }
		| { kind: 'batch'; key: string; messages: ChatMessage[] };

	const items = $derived.by<Item[]>(() => {
		const out: Item[] = [];
		for (let i = 0; i < messages.length; i++) {
			const msg = messages[i];
			if (!msg.batchId) {
				out.push({ kind: 'single', key: `m${msg.id}`, msg });
				continue;
			}
			const group: ChatMessage[] = [msg];
			while (i + 1 < messages.length && messages[i + 1].batchId === msg.batchId) {
				i += 1;
				group.push(messages[i]);
			}
			if (group.length >= 4) {
				out.push({ kind: 'batch', key: `b${msg.batchId}`, messages: group });
			} else {
				for (const single of group) out.push({ kind: 'single', key: `m${single.id}`, msg: single });
			}
		}
		return out;
	});

	const closed = $derived(room?.closed === true);

	function merge(incoming: ChatMessage[], forceStick = false) {
		if (incoming.length === 0) return;
		const seen = new Set(messages.map((m) => m.id));
		const fresh = incoming.filter((m) => !seen.has(m.id));
		if (fresh.length === 0) return;

		// 已经贴在底部（或是自己刚发的）才自动滚，否则保持阅读位置
		const stick = forceStick || atBottom;

		messages = [...messages, ...fresh].sort((a, b) => a.id - b.id);
		for (const m of fresh) if (m.id > cursor) cursor = m.id;

		if (stick) void scrollToBottom();
		else hasNew = true;
	}

	async function scrollToBottom() {
		await tick();
		if (!scroller) return;
		scroller.scrollTop = scroller.scrollHeight;
		atBottom = true;
		hasNew = false;
	}

	function onScroll() {
		if (!scroller) return;
		const distance = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
		atBottom = distance < 48;
		if (atBottom) hasNew = false;
	}

	function jumpToLatest() {
		void scrollToBottom();
	}

	async function init() {
		try {
			const detail = await api.get<{ room: Room; canClose: boolean; isOwner: boolean }>(
				`/rooms/${roomId}`
			);
			room = detail.room;
			canClose = detail.canClose;
			isOwner = detail.isOwner;

			const history = await api.get<{ messages: ChatMessage[] }>(
				`/rooms/${roomId}/messages?limit=100`
			);
			messages = history.messages;
			cursor = messages.length ? messages[messages.length - 1].id : 0;
			await scrollToBottom();

			if (!closed) {
				stopPolling = startPolling(async () => {
					const fresh = await api.get<{ messages: ChatMessage[] }>(
						`/rooms/${roomId}/messages?after=${cursor}`
					);
					merge(fresh.messages);
				}, 2000);
			}
		} catch (err) {
			error = (err as Error).message;
		}
	}

	async function send(forceAtBot = false) {
		const content = input.trim();
		if (!content || busy || closed) return;
		busy = true;
		error = '';
		try {
			const res = await api.post<{ messages: ChatMessage[] }>(`/rooms/${roomId}/messages`, {
				content,
				at: atBot || forceAtBot ? ['bot'] : undefined
			});
			input = '';
			merge(res.messages, true);
		} catch (err) {
			error = (err as Error).message;
		} finally {
			busy = false;
		}
	}

	function onKeydown(event: KeyboardEvent) {
		if (event.key !== 'Enter' || event.isComposing) return;
		// Shift+Enter 换行；Ctrl/Cmd+Enter 发送并 @bot；Enter 直接发送
		if (event.shiftKey) return;
		event.preventDefault();
		void send(event.ctrlKey || event.metaKey);
	}

	async function recall(id: number) {
		if (!confirm($t('room.recallConfirm'))) return;
		try {
			const res = await api.post<{ message: ChatMessage }>(`/messages/${id}/recall`);
			messages = messages.map((m) => (m.id === id ? res.message : m));
		} catch (err) {
			error = (err as Error).message;
		}
	}

	async function closeRoom() {
		if (!confirm($t('room.closeConfirm'))) return;
		try {
			await api.post(`/rooms/${roomId}/close`);
			room = room ? { ...room, closed: true } : room;
			canClose = false;
			stopPolling?.();
			stopPolling = null;
		} catch (err) {
			error = (err as Error).message;
		}
	}

	function mayRecall(msg: ChatMessage): boolean {
		if (msg.recalled || msg.sender !== 'user' || !session.user) return false;
		if (msg.user?.username === session.user.username) return true;
		return canRecallAny(session.user.permission);
	}

	function isMine(msg: ChatMessage): boolean {
		return !!msg.user && msg.user.username === session.user?.username;
	}

	function time(iso: string): string {
		return new Date(iso).toLocaleTimeString($locale ?? 'zh-hans', { hour12: false });
	}

	onMount(async () => {
		if (!roomId) return;
		await init();
	});

	onDestroy(() => {
		stopPolling?.();
		stopPolling = null;
	});
</script>

<div class="room">
	<header class="room-head">
		<div>
			<a href="/">← {$t('room.back')}</a>
			<h1>{room?.name ?? '…'}</h1>
			<p class="muted">
				{$t('room.headMeta', {
					id: roomId,
					owner: room?.ownerDisplayName ?? $t('common.unknown')
				})}
				{#if closed}<span class="badge">{$t('room.closed')}</span>{/if}
			</p>
		</div>
		{#if canClose}
			<button class="danger" onclick={closeRoom}>{$t('room.close')}</button>
		{/if}
	</header>

	<div class="messages" bind:this={scroller} onscroll={onScroll}>
		{#each items as item (item.key)}
			{#if item.kind === 'batch'}
				<div class="msg bot batch">
					<div class="meta">
						<span class="who">萨卡班</span>
						<button class="link" onclick={() => (expanded[item.key] = !expanded[item.key])}>
							{expanded[item.key]
								? $t('room.collapse')
								: $t('room.expand', { count: item.messages.length })}
						</button>
					</div>
					{#if expanded[item.key]}
						<div class="batch-body">
							{#each item.messages as m (m.id)}
								<div class="batch-line">{m.content}</div>
							{/each}
						</div>
					{/if}
				</div>
			{:else}
				<div class="msg" class:mine={isMine(item.msg)} class:bot={item.msg.sender === 'bot'}>
					<div class="meta">
						<span class="who">{item.msg.user?.displayName ?? item.msg.sender}</span>
						<span class="time">{time(item.msg.createdAt)}</span>
						{#if mayRecall(item.msg)}
							<button class="link" onclick={() => recall(item.msg.id)}>{$t('room.recall')}</button>
						{/if}
					</div>
					{#if item.msg.recalled}
						<div class="content recalled">{$t('room.recalled')}</div>
					{:else}
						<div class="content">{#if item.msg.at?.includes('bot')}<span class="at">@bot</span>{/if}{item.msg.content}</div>
					{/if}
				</div>
			{/if}
		{/each}

		{#if messages.length === 0}
			<p class="muted empty">{$t('room.empty')}</p>
		{/if}
	</div>

	{#if hasNew}
		<button class="jump" onclick={jumpToLatest} title={$t('room.jump')} aria-label={$t('room.jump')}>
			↓
		</button>
	{/if}

	{#if error}<p class="error bar">{error}</p>{/if}

	<div class="composer">
		<textarea
			bind:value={input}
			onkeydown={onKeydown}
			placeholder={closed ? $t('room.placeholderClosed') : $t('room.placeholder')}
			disabled={closed}
			rows="2"
		></textarea>
		<div class="send-col">
			<label class="at-bot" title={$t('room.atBotHint')}>
				<input type="checkbox" bind:checked={atBot} />
				@bot
			</label>
			<button class="primary" onclick={() => send()} disabled={busy || closed || !input.trim()}>
				{$t('room.send')}
			</button>
		</div>
	</div>
</div>

<style>
	.room {
		flex: 1;
		display: flex;
		flex-direction: column;
		min-height: 0;
		max-width: 880px;
		width: 100%;
		margin: 0 auto;
		position: relative;
	}

	.room-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12px;
		padding: 16px 20px;
		border-bottom: 1px solid var(--border);
	}

	h1 {
		margin: 4px 0;
		font-size: 18px;
	}

	.room-head p {
		margin: 0;
		font-size: 12px;
	}

	.badge {
		margin-left: 8px;
		border: 1px solid var(--danger);
		color: var(--danger);
		border-radius: 999px;
		padding: 0 6px;
		font-size: 11px;
	}

	.messages {
		flex: 1;
		overflow-y: auto;
		padding: 16px 20px;
		display: flex;
		flex-direction: column;
		gap: 12px;
		min-height: 0;
	}

	.msg {
		max-width: 78%;
		width: fit-content;
		align-self: flex-start;
		/* 让气泡按文字宽度收缩，不被父容器拉满 */
		display: flex;
		flex-direction: column;
		align-items: flex-start;
	}

	.msg.mine {
		align-self: flex-end;
		align-items: flex-end;
	}

	.msg.mine .meta {
		justify-content: flex-end;
	}

	.bot {
		align-self: flex-start;
	}

	.meta {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 12px;
		color: var(--muted);
		margin-bottom: 3px;
	}

	.who {
		font-weight: 600;
		color: var(--text);
	}

	.msg.bot .who {
		color: var(--accent);
	}

	.content {
		display: inline-block;
		max-width: 100%;
		background: var(--panel-2);
		border-radius: 8px;
		padding: 8px 12px;
		white-space: pre-wrap;
		word-break: break-word;
		text-align: left;
		line-height: 1.5;
	}

	.msg.mine .content {
		background: #24405f;
	}

	.content.recalled {
		color: var(--muted);
		font-style: italic;
		background: transparent;
		border: 1px dashed var(--border);
	}

	.at {
		color: var(--accent);
		margin-right: 4px;
	}

	.batch-body {
		background: var(--panel-2);
		border-radius: 8px;
		padding: 8px 12px;
		display: flex;
		flex-direction: column;
		gap: 4px;
		max-height: 320px;
		max-width: 100%;
		overflow-y: auto;
	}

	.batch-line {
		white-space: pre-wrap;
		word-break: break-word;
		font-family: ui-monospace, 'Cascadia Code', Consolas, monospace;
		font-size: 12.5px;
		line-height: 1.5;
	}

	.empty {
		text-align: center;
		margin-top: 40px;
	}

	.bar {
		margin: 0;
		padding: 6px 20px;
		font-size: 12px;
	}

	.jump {
		position: absolute;
		right: 24px;
		bottom: 96px;
		width: 34px;
		height: 34px;
		padding: 0;
		display: grid;
		place-items: center;
		border-radius: 50%;
		font-size: 16px;
		line-height: 1;
		background: var(--accent);
		border-color: var(--accent);
		color: #fff;
		box-shadow: 0 4px 14px rgb(0 0 0 / 45%);
		z-index: 5;
	}

	.jump:hover {
		filter: brightness(1.1);
	}

	.composer {
		display: flex;
		gap: 8px;
		padding: 12px 20px 16px;
		border-top: 1px solid var(--border);
	}

	textarea {
		flex: 1;
		resize: none;
		font: inherit;
		background: var(--panel);
		color: var(--text);
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 8px 10px;
	}

	textarea:focus {
		outline: none;
		border-color: var(--accent);
	}

	.send-col {
		display: flex;
		flex-direction: column;
		justify-content: flex-end;
		gap: 6px;
	}

	.at-bot {
		display: flex;
		align-items: center;
		gap: 4px;
		font-size: 12px;
		color: var(--muted);
		cursor: pointer;
		user-select: none;
	}

	.at-bot input {
		width: auto;
		accent-color: var(--accent);
	}
</style>
