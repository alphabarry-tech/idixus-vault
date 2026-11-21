<script lang="ts">
	import type { Member, SpaceInfo } from '../client/protocol';
	import { vault } from '../client/vault.svelte';
	import Icon from './Icon.svelte';
	import Modal from './Modal.svelte';

	let { space, onclose }: { space: SpaceInfo; onclose: () => void } = $props();

	let members = $state<Member[]>([]);
	let loaded = $state(false);
	let email = $state('');
	let role = $state<'admin' | 'member'>('member');
	// Valeur initiale seulement : le champ de renommage ne doit pas suivre les rechargements
	/* svelte-ignore state_referenced_locally */
	let renameTo = $state(space.name);
	let busy = $state(false);
	let confirmDelete = $state(false);
	let notice = $state('');

	let isAdmin = $derived(space.role === 'admin');
	let myId = $derived(vault.user?.id);
	let adminCount = $derived(members.filter((m) => m.role === 'admin').length);

	async function load() {
		members = (await vault.members()) ?? [];
		loaded = true;
	}
	load();

	async function act(fn: () => Promise<boolean | void>, success: string) {
		busy = true;
		notice = '';
		const ok = await fn();
		busy = false;
		if (ok === false) return;
		notice = success;
		await load();
	}

	function add(event: SubmitEvent) {
		event.preventDefault();
		return act(async () => {
			const ok = await vault.addMember(email.trim().toLowerCase(), role);
			if (ok) email = '';
			return ok;
		}, 'Membre ajouté. Il retrouvera l’espace à sa prochaine ouverture.');
	}

	const remove = (m: Member) =>
		act(
			() => vault.removeMember(m.userId),
			`${m.name} a été retiré et la clé de l’espace a été renouvelée.`
		);

	async function leave() {
		busy = true;
		if (await vault.removeMember(myId!)) onclose();
		busy = false;
	}

	async function destroy() {
		busy = true;
		if (await vault.deleteSpace()) onclose();
		busy = false;
	}
</script>

<Modal title="Espace « {space.name} »" {onclose} size="lg">
	<div class="space-y-6">
		{#if vault.error}<p class="alert alert-danger" role="alert">{vault.error}</p>{/if}
		{#if notice}<p class="alert alert-ok" role="status">{notice}</p>{/if}

		{#if isAdmin}
			<form
				class="flex gap-2"
				onsubmit={(e) => {
					e.preventDefault();
					act(async () => (await vault.renameSpace(renameTo.trim()), true), 'Espace renommé.');
				}}
			>
				<input
					class="field"
					aria-label="Nom de l’espace"
					required
					maxlength="80"
					bind:value={renameTo}
				/>
				<button class="btn" disabled={busy || renameTo.trim() === space.name}>Renommer</button>
			</form>
		{/if}

		<section>
			<h3 class="mb-2 text-sm font-semibold">Membres ({members.length})</h3>
			{#if !loaded}
				<p class="text-sm text-muted">Chargement…</p>
			{:else}
				<ul class="divide-y divide-line rounded-xl border border-line">
					{#each members as m (m.userId)}
						<li class="flex flex-wrap items-center gap-3 px-3 py-2.5">
							<div class="min-w-0 flex-1">
								<p class="truncate text-sm font-semibold">
									{m.name}{#if m.userId === myId}<span class="font-normal text-muted"
											>&nbsp;(vous)</span
										>{/if}
								</p>
								<p class="truncate text-xs text-muted">{m.email}</p>
							</div>
							{#if isAdmin && m.userId !== myId}
								<select
									class="field w-auto py-1.5 text-sm"
									aria-label="Rôle de {m.name}"
									value={m.role}
									disabled={busy || (m.role === 'admin' && adminCount < 2)}
									onchange={(e) =>
										act(
											() => vault.setRole(m.userId, e.currentTarget.value as 'admin' | 'member'),
											'Rôle mis à jour.'
										)}
								>
									<option value="member">Membre</option>
									<option value="admin">Administrateur</option>
								</select>
								<button
									class="btn btn-danger btn-icon"
									disabled={busy}
									onclick={() => remove(m)}
									aria-label="Retirer {m.name}"
									title="Retirer de l’espace"
								>
									<Icon name="trash" size={16} />
								</button>
							{:else}
								<span class="badge {m.role === 'admin' ? 'badge-ok' : ''}">
									{m.role === 'admin' ? 'Administrateur' : 'Membre'}
								</span>
							{/if}
						</li>
					{/each}
				</ul>
				<p class="mt-2 text-xs text-muted">
					Retirer un membre renouvelle la clé de l’espace : tout est ré-chiffré, et la personne
					retirée ne peut plus rien lire de nouveau.
				</p>
			{/if}
		</section>

		{#if isAdmin}
			<section>
				<h3 class="mb-2 text-sm font-semibold">Ajouter un collaborateur</h3>
				<form class="flex flex-wrap gap-2" onsubmit={add}>
					<input
						class="field min-w-0 flex-1 basis-56"
						type="email"
						required
						aria-label="Email du collaborateur"
						placeholder="prenom.nom@idixus.com"
						bind:value={email}
					/>
					<select class="field w-auto" aria-label="Rôle" bind:value={role}>
						<option value="member">Membre</option>
						<option value="admin">Administrateur</option>
					</select>
					<button class="btn btn-primary" disabled={busy}
						><Icon name="plus" size={16} /> Ajouter</button
					>
				</form>
				<p class="mt-2 text-xs text-muted">Le collaborateur doit déjà avoir activé son compte.</p>
			</section>
		{/if}

		<section class="flex flex-wrap gap-2 border-t border-line pt-4">
			{#if !isAdmin || adminCount > 1}
				<button class="btn btn-danger" disabled={busy} onclick={leave}>Quitter l’espace</button>
			{/if}
			{#if isAdmin}
				{#if confirmDelete}
					<button class="btn btn-danger" disabled={busy} onclick={destroy}>
						Confirmer : supprimer l’espace et toutes ses entrées
					</button>
				{:else}
					<button class="btn btn-danger" onclick={() => (confirmDelete = true)}
						>Supprimer l’espace</button
					>
				{/if}
			{/if}
		</section>
	</div>
</Modal>
