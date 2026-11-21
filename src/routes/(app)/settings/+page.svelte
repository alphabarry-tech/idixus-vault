<script lang="ts">
	import Icon from '#lib/components/Icon.svelte';
	import PasswordField from '#lib/components/PasswordField.svelte';
	import {
		changePassword,
		checkMasterPassword,
		regenerateRecoveryKey
	} from '#lib/client/protocol.ts';
	import { vault } from '#lib/client/vault.svelte.ts';

	let current = $state('');
	let next = $state('');
	let confirmNext = $state('');
	let pwError = $state('');
	let pwDone = $state(false);
	let pwBusy = $state(false);

	let recoveryPassword = $state('');
	let recoveryKey = $state('');
	let recoveryError = $state('');
	let recoveryBusy = $state(false);

	async function submitPassword(event: SubmitEvent) {
		event.preventDefault();
		pwDone = false;
		pwError =
			checkMasterPassword(next) ??
			(next !== confirmNext ? 'Les mots de passe ne correspondent pas' : '');
		if (pwError || !vault.session) return;
		pwBusy = true;
		try {
			await changePassword(vault.session.user, vault.session.keys, current, next);
			current = next = confirmNext = '';
			pwDone = true;
		} catch (e) {
			pwError = e instanceof Error ? e.message : 'Changement impossible';
		} finally {
			pwBusy = false;
		}
	}

	async function submitRecovery(event: SubmitEvent) {
		event.preventDefault();
		if (!vault.session) return;
		recoveryBusy = true;
		recoveryError = '';
		try {
			recoveryKey = await regenerateRecoveryKey(
				vault.session.user,
				vault.session.keys,
				recoveryPassword
			);
			recoveryPassword = '';
		} catch (e) {
			recoveryError = e instanceof Error ? e.message : 'Opération impossible';
		} finally {
			recoveryBusy = false;
		}
	}
</script>

<svelte:head><title>Paramètres · Idixus Vault</title></svelte:head>

<h1 class="mb-6 text-xl font-bold">Paramètres</h1>

<div class="space-y-6">
	<section class="card p-5">
		<h2 class="mb-1 font-semibold">Mot de passe maître</h2>
		<p class="mb-4 text-sm text-muted">
			Vos autres appareils seront déconnectés. Vos données restent intactes.
		</p>
		<form onsubmit={submitPassword} class="max-w-md space-y-4">
			<PasswordField id="cur" label="Mot de passe actuel" bind:value={current} />
			<PasswordField
				id="new"
				label="Nouveau mot de passe"
				autocomplete="new-password"
				strength
				bind:value={next}
			/>
			<PasswordField
				id="new2"
				label="Confirmer le nouveau mot de passe"
				autocomplete="new-password"
				bind:value={confirmNext}
			/>
			{#if pwError}<p class="alert alert-danger" role="alert">{pwError}</p>{/if}
			{#if pwDone}<p class="alert alert-ok" role="status">Mot de passe maître modifié.</p>{/if}
			<button class="btn btn-primary" disabled={pwBusy}
				>{pwBusy ? 'Modification…' : 'Changer le mot de passe'}</button
			>
		</form>
	</section>

	<section class="card p-5">
		<h2 class="mb-1 font-semibold">Clé de récupération</h2>
		<p class="mb-4 text-sm text-muted">
			Elle permet de retrouver l’accès si vous oubliez votre mot de passe maître. En générer une
			nouvelle invalide l’ancienne.
		</p>
		{#if recoveryKey}
			<div class="max-w-md">
				<div
					class="rounded-xl border border-line bg-surface-2 p-4 text-center font-mono text-[0.95rem] leading-7 tracking-wide break-words select-all"
				>
					{recoveryKey}
				</div>
				<p class="alert alert-warn mt-3">Notez-la maintenant : elle ne sera plus affichée.</p>
				<button class="btn mt-3" onclick={() => (recoveryKey = '')}>J’ai conservé la clé</button>
			</div>
		{:else}
			<form onsubmit={submitRecovery} class="max-w-md space-y-4">
				<PasswordField
					id="rec-pw"
					label="Mot de passe maître (confirmation)"
					bind:value={recoveryPassword}
				/>
				{#if recoveryError}<p class="alert alert-danger" role="alert">{recoveryError}</p>{/if}
				<button class="btn" disabled={recoveryBusy}
					><Icon name="key" size={16} /> Générer une nouvelle clé</button
				>
			</form>
		{/if}
	</section>

	<section class="card p-5">
		<h2 class="mb-1 font-semibold">Verrouillage</h2>
		<p class="mb-4 text-sm text-muted">
			Le coffre se verrouille automatiquement après 5 minutes d’inactivité, et à chaque rechargement
			de la page. Vos clés sont alors effacées de la mémoire du navigateur.
		</p>
		<button class="btn" onclick={() => vault.lock()}
			><Icon name="lock" size={16} /> Verrouiller maintenant</button
		>
	</section>
</div>
