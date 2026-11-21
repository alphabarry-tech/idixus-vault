<script lang="ts">
	import type { Entry, EntryData } from '../client/protocol';
	import GeneratorPanel from './GeneratorPanel.svelte';
	import Icon from './Icon.svelte';
	import Modal from './Modal.svelte';
	import PasswordField from './PasswordField.svelte';

	let {
		entry,
		spaceName,
		onsave,
		ondelete,
		onclose
	}: {
		entry?: Entry;
		spaceName: string;
		onsave: (data: EntryData) => Promise<boolean>;
		ondelete?: () => Promise<void>;
		onclose: () => void;
	} = $props();

	// Valeurs initiales seulement : le formulaire ne doit pas être écrasé si l'entrée est rechargée
	/* svelte-ignore state_referenced_locally */
	let form = $state<EntryData>({
		title: entry?.data.title ?? '',
		username: entry?.data.username ?? '',
		password: entry?.data.password ?? '',
		url: entry?.data.url ?? '',
		notes: entry?.data.notes ?? ''
	});
	let showGenerator = $state(false);
	let confirmDelete = $state(false);
	let busy = $state(false);
	let error = $state('');

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		const url = form.url.trim();
		if (url && !/^https?:\/\//i.test(url)) form.url = `https://${url}`;
		busy = true;
		error = '';
		const ok = await onsave({ ...form, title: form.title.trim(), url: form.url.trim() });
		busy = false;
		if (ok) onclose();
		else error = 'L’enregistrement a échoué. Vérifiez le message affiché sur la page.';
	}

	async function remove() {
		busy = true;
		await ondelete?.();
		busy = false;
		onclose();
	}
</script>

<Modal title={entry ? 'Modifier l’entrée' : 'Nouvelle entrée'} {onclose}>
	<form onsubmit={submit} class="space-y-4">
		<p class="text-xs text-muted">
			Enregistré dans <strong class="text-ink">{spaceName}</strong>, chiffré avant envoi.
		</p>
		<div>
			<label class="label" for="e-title">Nom</label>
			<input
				id="e-title"
				class="field"
				required
				maxlength="200"
				bind:value={form.title}
				placeholder="ex. Google Workspace"
			/>
		</div>
		<div class="grid gap-4 sm:grid-cols-2">
			<div>
				<label class="label" for="e-user">Identifiant</label>
				<input
					id="e-user"
					class="field"
					autocomplete="off"
					maxlength="300"
					bind:value={form.username}
				/>
			</div>
			<div>
				<label class="label" for="e-url">Site web</label>
				<input
					id="e-url"
					class="field"
					inputmode="url"
					maxlength="500"
					bind:value={form.url}
					placeholder="exemple.com"
				/>
			</div>
		</div>

		<div>
			<PasswordField
				id="e-pass"
				label="Mot de passe"
				autocomplete="off"
				required={false}
				strength
				mono
				bind:value={form.password}
			/>
			<button
				type="button"
				class="btn btn-ghost mt-1 px-2 text-sm text-brand"
				onclick={() => (showGenerator = !showGenerator)}
			>
				<Icon name="key" size={15} />
				{showGenerator ? 'Masquer le générateur' : 'Générer un mot de passe'}
			</button>
			{#if showGenerator}
				<div class="mt-2">
					<GeneratorPanel
						onuse={(pw) => {
							form.password = pw;
							showGenerator = false;
						}}
					/>
				</div>
			{/if}
		</div>

		<div>
			<label class="label" for="e-notes">Notes</label>
			<textarea id="e-notes" class="field" rows="3" maxlength="5000" bind:value={form.notes}
			></textarea>
		</div>

		{#if error}<p class="alert alert-danger" role="alert">{error}</p>{/if}

		<div class="flex flex-wrap items-center justify-between gap-2 pt-1">
			<div>
				{#if entry && ondelete}
					{#if confirmDelete}
						<button type="button" class="btn btn-danger" onclick={remove} disabled={busy}
							>Confirmer la suppression</button
						>
					{:else}
						<button type="button" class="btn btn-danger" onclick={() => (confirmDelete = true)}>
							<Icon name="trash" size={16} /> Supprimer
						</button>
					{/if}
				{/if}
			</div>
			<div class="flex gap-2">
				<button type="button" class="btn" onclick={onclose}>Annuler</button>
				<button class="btn btn-primary" disabled={busy}
					>{busy ? 'Enregistrement…' : 'Enregistrer'}</button
				>
			</div>
		</div>
	</form>
</Modal>
