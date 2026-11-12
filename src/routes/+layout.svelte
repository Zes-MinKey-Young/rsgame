<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { session } from '$lib/session.svelte';
	import { canBan, canInvite, isRoot, permissionKey } from '$lib/perm';
	import { locale, setLocale, SUPPORTED_LOCALES, t, type Locale } from '$lib/i18n';

	let { children } = $props();

	const PUBLIC_PATHS = ['/login', '/register'];
	const isPublic = $derived(PUBLIC_PATHS.includes(page.url.pathname));
	let redirecting = $state(false);

	onMount(() => {
		void session.refresh();
	});

	$effect(() => {
		if (session.loading || redirecting) return;
		if (!session.user && !isPublic) {
			redirecting = true;
			void goto('/login').finally(() => (redirecting = false));
		}
		if (session.user && isPublic) {
			redirecting = true;
			void goto('/').finally(() => (redirecting = false));
		}
	});

	async function handleLogout() {
		await session.logout();
		void goto('/login');
	}

	function onLocaleChange(event: Event) {
		setLocale((event.currentTarget as HTMLSelectElement).value as Locale);
	}
</script>

<div class="app">
	<header class="topbar">
		<a class="brand" href="/">{$t('app.name')}</a>
		{#if session.user}
			<nav>
				<a href="/">{$t('nav.rooms')}</a>
				{#if canBan(session.user.permission)}<a href="/admin/users">{$t('nav.users')}</a>{/if}
				{#if canInvite(session.user.permission)}<a href="/admin/invites">{$t('nav.invites')}</a>{/if}
				{#if isRoot(session.user.permission)}<a href="/admin/data">{$t('nav.botData')}</a>{/if}
				<a href="/me">{$t('nav.me')}</a>
			</nav>
		{/if}
		<div class="who">
			<select class="locale" value={$locale ?? 'zh-hans'} onchange={onLocaleChange}>
				{#each SUPPORTED_LOCALES as item (item.value)}
					<option value={item.value}>{item.label}</option>
				{/each}
			</select>
			{#if session.user}
				<span class="name">{session.user.displayName}</span>
				<span class="tag">{$t(permissionKey(session.user.permission))}</span>
				<button class="link" onclick={handleLogout}>{$t('nav.logout')}</button>
			{/if}
		</div>
	</header>

	<main>
		{#if session.loading}
			<p class="muted center">{$t('app.loading')}</p>
		{:else}
			{@render children()}
		{/if}
	</main>
</div>

<style>
	:global(:root) {
		--bg: #0f1115;
		--panel: #161a21;
		--panel-2: #1d232c;
		--border: #2a313c;
		--text: #e6e9ef;
		--muted: #8b95a5;
		--accent: #4f8cff;
		--danger: #e5534b;
		--ok: #3fb950;
		color-scheme: dark;
	}

	:global(*) {
		box-sizing: border-box;
	}

	:global(body) {
		margin: 0;
		background: var(--bg);
		color: var(--text);
		font-family:
			system-ui,
			-apple-system,
			'Segoe UI',
			'PingFang SC',
			'Microsoft YaHei',
			sans-serif;
		font-size: 14px;
	}

	:global(a) {
		color: var(--accent);
		text-decoration: none;
	}

	:global(a:hover) {
		text-decoration: underline;
	}

	:global(button) {
		font: inherit;
		cursor: pointer;
		border-radius: 6px;
		border: 1px solid var(--border);
		background: var(--panel-2);
		color: var(--text);
		padding: 6px 12px;
	}

	:global(button:hover:not(:disabled)) {
		border-color: var(--accent);
	}

	:global(button:disabled) {
		opacity: 0.5;
		cursor: not-allowed;
	}

	:global(button.primary) {
		background: var(--accent);
		border-color: var(--accent);
		color: #fff;
	}

	:global(button.danger) {
		color: var(--danger);
	}

	:global(button.link) {
		background: none;
		border: none;
		color: var(--muted);
		padding: 0;
	}

	:global(button.link:hover) {
		color: var(--text);
	}

	:global(input) {
		font: inherit;
		background: var(--panel);
		color: var(--text);
		border: 1px solid var(--border);
		border-radius: 6px;
		padding: 8px 10px;
		width: 100%;
	}

	:global(input:focus) {
		outline: none;
		border-color: var(--accent);
	}

	:global(.card) {
		background: var(--panel);
		border: 1px solid var(--border);
		border-radius: 10px;
		padding: 16px;
	}

	:global(.muted) {
		color: var(--muted);
	}

	:global(.center) {
		text-align: center;
	}

	:global(.error) {
		color: var(--danger);
	}

	.app {
		height: 100dvh;
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}

	.topbar {
		display: flex;
		align-items: center;
		gap: 20px;
		padding: 10px 20px;
		border-bottom: 1px solid var(--border);
		background: var(--panel);
		flex: none;
	}

	.brand {
		font-weight: 700;
		color: var(--text);
	}

	nav {
		display: flex;
		gap: 16px;
	}

	nav a {
		color: var(--muted);
	}

	nav a:hover {
		color: var(--text);
		text-decoration: none;
	}

	.who {
		margin-left: auto;
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.locale {
		font: inherit;
		font-size: 12px;
		background: var(--panel-2);
		color: var(--muted);
		border: 1px solid var(--border);
		border-radius: 6px;
		padding: 3px 6px;
	}

	.locale:focus {
		outline: none;
		border-color: var(--accent);
	}

	.name {
		font-weight: 600;
	}

	.tag {
		font-size: 12px;
		color: var(--muted);
		border: 1px solid var(--border);
		border-radius: 999px;
		padding: 1px 8px;
	}

	main {
		flex: 1;
		display: flex;
		flex-direction: column;
		min-height: 0;
		/* 整体不滚动，滚动交给各页面自己 */
		overflow: hidden;
	}
</style>
