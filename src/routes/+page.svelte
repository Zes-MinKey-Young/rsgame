<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { api } from '$lib/api';
	import { session } from '$lib/session.svelte';
	import { startPolling } from '$lib/realtime';
	import { canOpenRoom } from '$lib/perm';
	import { locale, t } from '$lib/i18n';
	import type { Room } from '$lib/types';

	let rooms = $state<Room[]>([]);
	let loading = $state(true);
	let error = $state('');
	let creating = $state(false);
	let newName = $state('');

	const mayCreate = $derived(session.user ? canOpenRoom(session.user.permission) : false);

	async function load() {
		try {
			const data = await api.get<{ rooms: Room[] }>('/rooms');
			rooms = data.rooms;
			error = '';
		} catch (err) {
			error = (err as Error).message;
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		void load();
		return startPolling(load, 5000);
	});

	async function createRoom(event: SubmitEvent) {
		event.preventDefault();
		if (creating) return;
		creating = true;
		error = '';
		try {
			const data = await api.post<{ room: Room }>('/rooms', { name: newName.trim() });
			newName = '';
			await goto(`/rooms/${data.room.id}`);
		} catch (err) {
			error = (err as Error).message;
		} finally {
			creating = false;
		}
	}

	function formatTime(iso: string | null): string {
		if (!iso) return '—';
		return new Date(iso).toLocaleString($locale ?? 'zh-hans', { hour12: false });
	}
</script>

<div class="page">
	<section class="head">
		<h1>{$t('rooms.title')}</h1>
		{#if mayCreate}
			<form class="create" onsubmit={createRoom}>
				<input bind:value={newName} placeholder={$t('rooms.newRoomPlaceholder')} maxlength="30" required />
				<button class="primary" type="submit" disabled={creating}>{$t('rooms.create')}</button>
			</form>
		{:else}
			<p class="muted">{$t('rooms.needBan')}</p>
		{/if}
	</section>

	{#if error}<p class="error">{error}</p>{/if}

	{#if loading}
		<p class="muted">{$t('app.loading')}</p>
	{:else if rooms.length === 0}
		<p class="muted">{$t('rooms.empty')}</p>
	{:else}
		<ul class="rooms">
			{#each rooms as room (room.id)}
				<li class="card room">
					<a class="title" href={`/rooms/${room.id}`}>{room.name}</a>
					<p class="muted meta">
						{$t('rooms.meta', {
							id: room.id,
							owner: room.ownerDisplayName ?? $t('common.unknown'),
							count: room.messageCount
						})}
					</p>
					<p class="muted meta">{$t('rooms.recent', { time: formatTime(room.lastMessageAt) })}</p>
				</li>
			{/each}
		</ul>
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

	.head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		margin-bottom: 20px;
	}

	h1 {
		margin: 0;
		font-size: 20px;
	}

	.create {
		display: flex;
		gap: 8px;
	}

	.create input {
		width: 200px;
	}

	.rooms {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.room .title {
		font-size: 16px;
		font-weight: 600;
	}

	.meta {
		margin: 4px 0 0;
		font-size: 12px;
	}
</style>
