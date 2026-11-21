<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { replaceState } from '$app/navigation';
	import EntryDialog from '#lib/components/EntryDialog.svelte';
	import EntryRow from '#lib/components/EntryRow.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import SpaceDialog from '#lib/components/SpaceDialog.svelte';
	import { findReused } from '#lib/crypto/password.ts';
	import type { Entry } from '#lib/client/protocol.ts';
	import { vault } from '#lib/client/vault.svelte.ts';

	let search = $state('');
	let editing = $state<Entry | 'new' | null>(null);
	let managing = $state(false);

	let space = $derived(vault.current);

	let visible = $derived.by(() => {
		const q = search.trim().toLowerCase();
		const list = q
			? vault.entries.filter((e) =>
					[e.data.title, e.data.username, e.data.url].some((v) => v.toLowerCase().includes(q))
				)
			: vault.entries;
		return [...list].sort((a, b) => a.data.title.localeCompare(b.data.title, 'fr'));
	});

	let reusedIds = $derived(
		new Set(findReused(vault.entries.map((e) => ({ id: e.id, password: e.data.password }))).flat())
	);

	// Lien profond depuis le tableau de santé : /?space=…&entry=…
	let handledDeepLink = false;
	$effect(() => {
		const spaceId = page.url.searchParams.get('space');
		const entryId = page.url.searchParams.get('entry');
		if (handledDeepLink || !spaceId || !vault.unlocked) return;
		handledDeepLink = true;
		(async () => {
			if (vault.currentId !== spaceId) await vault.select(spaceId);
			const found = vault.entries.find((e) => e.id === entryId);
			if (found) editing = found;
			replaceState(resolve('/(app)'), {});
		})();
	});
</script>

<svelte:head><title>{space?.name ?? 'Coffre'} · Idixus Vault</title></svelte:head>

{#if space}
	<div class="mb-5 flex flex-wrap items-center gap-3">
		<div class="min-w-0 flex-1">
			<h1 class="flex items-center gap-2 text-xl font-bold">
				<Icon name={space.kind === 'personal' ? 'lock' : 'users'} size={20} />
				<span class="truncate">{space.name}</span>
			</h1>
			<p class="text-sm text-muted">
				{space.kind === 'personal' ? 'Visible par vous seul' : 'Espace partagé'} · {vault.entries
					.length}
				{vault.entries.length > 1 ? 'entrées' : 'entrée'}
			</p>
		</div>
		{#if space.kind === 'shared'}
			<button class="btn" onclick={() => (managing = true)}
				><Icon name="users" size={16} /> Membres</button
			>
		{/if}
		<button class="btn btn-primary" onclick={() => (editing = 'new')}
			><Icon name="plus" size={16} /> Nouvelle entrée</button
		>
	</div>

	{#if vault.error}<p class="alert alert-danger mb-4" role="alert">{vault.error}</p>{/if}
	{#if space.needsRotation && space.role !== 'admin'}
		<p class="alert alert-warn mb-4">
			Un membre a quitté cet espace. Un administrateur de l’espace doit renouveler la clé à sa
			prochaine visite.
		</p>
	{/if}

	<div class="relative mb-4">
		<span class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted"
			><Icon name="search" size={16} /></span
		>
		<input
			class="field pl-9"
			type="search"
			placeholder="Rechercher par nom, identifiant ou site"
			aria-label="Rechercher"
			bind:value={search}
		/>
	</div>

	{#if vault.loading && vault.entries.length === 0}
		<p class="py-10 text-center text-sm text-muted">Déchiffrement…</p>
	{:else if visible.length === 0}
		<div class="card px-6 py-12 text-center">
			<span
				class="mx-auto mb-3 grid size-12 place-items-center rounded-2xl bg-brand-soft text-brand"
			>
				<Icon name={search ? 'search' : 'key'} size={22} />
			</span>
			{#if search}
				<p class="font-semibold">Aucun résultat</p>
				<p class="text-sm text-muted">Aucune entrée ne correspond à « {search} ».</p>
			{:else}
				<p class="font-semibold">Aucune entrée pour l’instant</p>
				<p class="mb-4 text-sm text-muted">
					Ajoutez votre premier accès : il sera chiffré dans votre navigateur.
				</p>
				<button class="btn btn-primary" onclick={() => (editing = 'new')}
					><Icon name="plus" size={16} /> Nouvelle entrée</button
				>
			{/if}
		</div>
	{:else}
		<ul class="card divide-y divide-line overflow-hidden">
			{#each visible as entry (entry.id)}
				<EntryRow {entry} reused={reusedIds.has(entry.id)} onopen={() => (editing = entry)} />
			{/each}
		</ul>
	{/if}

	{#if editing}
		<EntryDialog
			entry={editing === 'new' ? undefined : editing}
			spaceName={space.name}
			onsave={(data) =>
				vault.save(data, editing === 'new' || editing === null ? undefined : editing.id)}
			ondelete={editing === 'new' ? undefined : () => vault.remove((editing as Entry).id)}
			onclose={() => (editing = null)}
		/>
	{/if}

	{#if managing}
		<SpaceDialog {space} onclose={() => (managing = false)} />
	{/if}
{:else if vault.error}
	<p class="alert alert-danger" role="alert">{vault.error}</p>
{:else}
	<p class="py-10 text-center text-sm text-muted">Chargement…</p>
{/if}
