<script lang="ts">
	import { goto } from '$app/navigation';
	import { session } from '$lib/session.svelte';
	import { t } from '$lib/i18n';
	import TosDialog from '$lib/components/TosDialog.svelte';

	let inviteCode = $state('');
	let username = $state('');
	let displayName = $state('');
	let password = $state('');
	let confirm = $state('');
	let error = $state('');
	let busy = $state(false);

	// 进入注册页即弹出服务条款，同意后才能提交
	let showTos = $state(true);
	let agreed = $state(false);

	function acceptTos() {
		showTos = false;
		agreed = true;
	}

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (busy) return;
		error = '';

		if (!agreed) {
			error = $t('tos.required');
			showTos = true;
			return;
		}
		if (password !== confirm) {
			error = $t('auth.passwordMismatch');
			return;
		}
		if (password.length < 8) {
			error = $t('auth.passwordTooShort');
			return;
		}

		busy = true;
		try {
			await session.register({
				inviteCode: inviteCode.trim(),
				username: username.trim().toLowerCase(),
				password,
				displayName: displayName.trim() || undefined
			});
			await goto('/');
		} catch (err) {
			error = (err as Error).message;
		} finally {
			busy = false;
		}
	}
</script>

{#if showTos}
	<TosDialog onaccept={acceptTos} />
{/if}

<div class="wrap">
	<div class="card form">
		<h1>{$t('auth.registerTitle')}</h1>
		<p class="muted">{$t('auth.registerHint')}</p>

		<form onsubmit={submit}>
			<label>
				{$t('auth.inviteCode')}
				<input bind:value={inviteCode} required placeholder={$t('auth.invitePlaceholder')} />
			</label>
			<label>
				{$t('auth.username')}
				<input
					bind:value={username}
					required
					placeholder={$t('auth.usernamePlaceholder')}
					autocomplete="username"
				/>
			</label>
			<label>
				{$t('auth.displayName')}
				<input bind:value={displayName} placeholder={$t('auth.displayNamePlaceholder')} maxlength="20" />
			</label>
			<label>
				{$t('auth.password')}
				<input type="password" bind:value={password} required autocomplete="new-password" />
			</label>
			<label>
				{$t('auth.passwordConfirm')}
				<input type="password" bind:value={confirm} required autocomplete="new-password" />
			</label>

			{#if error}<p class="error">{error}</p>{/if}

			<button class="primary" type="submit" disabled={busy}>
				{busy ? $t('auth.registering') : $t('auth.register')}
			</button>
		</form>

		<p class="muted">
			<button class="link" onclick={() => (showTos = true)}>{$t('tos.view')}</button>
		</p>
		<p class="muted">{$t('auth.haveAccount')}<a href="/login">{$t('auth.goLogin')}</a></p>
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
		width: min(380px, 100%);
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

	button.link {
		margin: 0;
		padding: 0;
		font-size: 13px;
	}
</style>
