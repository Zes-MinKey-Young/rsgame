<script lang="ts">
	import { goto } from '$app/navigation';
	import { session } from '$lib/session.svelte';
	import { t } from '$lib/i18n';

	let username = $state('');
	let password = $state('');
	let error = $state('');
	let busy = $state(false);

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (busy) return;
		error = '';
		busy = true;
		try {
			await session.login(username.trim(), password);
			await goto('/');
		} catch (err) {
			error = (err as Error).message;
		} finally {
			busy = false;
		}
	}
</script>

<div class="wrap">
	<div class="card form">
		<h1>{$t('auth.loginTitle')}</h1>
		<p class="muted">{$t('auth.loginHint')}</p>

		<form onsubmit={submit}>
			<label>
				{$t('auth.username')}
				<input bind:value={username} autocomplete="username" required />
			</label>
			<label>
				{$t('auth.password')}
				<input type="password" bind:value={password} autocomplete="current-password" required />
			</label>

			{#if error}<p class="error">{error}</p>{/if}

			<button class="primary" type="submit" disabled={busy}>
				{busy ? $t('auth.loggingIn') : $t('auth.login')}
			</button>
		</form>

		<p class="muted">{$t('auth.hasInvite')}<a href="/register">{$t('auth.goRegister')}</a></p>
	</div>
</div>

<style>
	.wrap {
		flex: 1;
		min-height: 0;
		display: grid;
		place-items: center;
		padding: 40px 20px;
		overflow-y: auto;
	}

	.form {
		width: min(360px, 100%);
	}

	h1 {
		margin: 0 0 8px;
		font-size: 20px;
	}

	form {
		display: flex;
		flex-direction: column;
		gap: 12px;
		margin: 16px 0;
	}

	label {
		display: flex;
		flex-direction: column;
		gap: 6px;
		font-size: 13px;
		color: var(--muted);
	}

	button {
		margin-top: 4px;
		padding: 9px 12px;
	}
</style>
