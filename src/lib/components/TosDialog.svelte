<script lang="ts">
	import { OPERATOR, TOS_VERSION } from '$lib/config';
	import { t } from '$lib/i18n';

	interface Props {
		onaccept: () => void;
	}

	let { onaccept }: Props = $props();

	const operator = $derived(OPERATOR || $t('operatorFallback'));

	const sections = $derived([
		{ title: $t('tos.s1Title'), body: $t('tos.s1Body', { operator }) },
		{ title: $t('tos.s2Title'), body: $t('tos.s2Body') },
		{ title: $t('tos.s3Title'), body: $t('tos.s3Body') },
		{ title: $t('tos.s4Title'), body: $t('tos.s4Body') },
		{ title: $t('tos.s5Title'), body: $t('tos.s5Body') }
	]);
</script>

<div class="overlay" role="presentation">
	<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="tos-title">
		<header>
			<h2 id="tos-title">{$t('tos.title')}</h2>
			<span class="version">{$t('tos.updated', { date: TOS_VERSION })}</span>
		</header>

		<div class="body">
			<p class="lead">{$t('tos.lead')}</p>

			{#each sections as section (section.title)}
				<section>
					<h3>{section.title}</h3>
					<p>{section.body}</p>
				</section>
			{/each}
		</div>

		<footer>
			<button class="primary" onclick={onaccept}>{$t('tos.agree')}</button>
		</footer>
	</div>
</div>

<style>
	.overlay {
		position: fixed;
		inset: 0;
		background: rgb(0 0 0 / 65%);
		display: grid;
		place-items: center;
		padding: 20px;
		z-index: 100;
		backdrop-filter: blur(2px);
	}

	.dialog {
		width: min(680px, 100%);
		max-height: min(80vh, 720px);
		display: flex;
		flex-direction: column;
		background: var(--panel);
		border: 1px solid var(--border);
		border-radius: 12px;
		overflow: hidden;
		box-shadow: 0 24px 60px rgb(0 0 0 / 55%);
	}

	header {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 12px;
		padding: 16px 20px;
		border-bottom: 1px solid var(--border);
	}

	h2 {
		margin: 0;
		font-size: 17px;
	}

	.version {
		font-size: 12px;
		color: var(--muted);
	}

	.body {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: 16px 20px;
		line-height: 1.75;
	}

	.lead {
		margin: 0 0 16px;
		color: var(--muted);
	}

	section + section {
		margin-top: 18px;
	}

	h3 {
		margin: 0 0 6px;
		font-size: 14px;
		color: var(--text);
	}

	section p {
		margin: 0;
		font-size: 13.5px;
	}

	footer {
		padding: 12px 20px 16px;
		border-top: 1px solid var(--border);
		display: flex;
		justify-content: flex-end;
	}

	footer button {
		padding: 9px 18px;
	}
</style>
