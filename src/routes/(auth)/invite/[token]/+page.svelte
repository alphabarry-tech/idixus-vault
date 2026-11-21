<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import Icon from '#lib/components/Icon.svelte';
	import OtpForm from '#lib/components/OtpForm.svelte';
	import PasswordField from '#lib/components/PasswordField.svelte';
	import { checkMasterPassword, openVault, register, type Pending } from '#lib/client/protocol.ts';
	import { vault } from '#lib/client/vault.svelte.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let step = $state<'form' | 'recovery' | 'otp'>('form');
	let name = $state('');
	let password = $state('');
	let confirm = $state('');
	let error = $state('');
	let busy = $state(false);
	let recoveryKey = $state('');
	let saved = $state(false);
	let pending = $state.raw<Pending | null>(null);

	let mismatch = $derived(confirm.length > 0 && confirm !== password);

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		error =
			checkMasterPassword(password) ??
			(password !== confirm ? 'Les mots de passe ne correspondent pas' : '');
		if (error) return;
		busy = true;
		try {
			const res = await register(data.token, name.trim(), password);
			recoveryKey = res.recoveryKey;
			pending = res.pending;
			password = confirm = '';
			step = 'recovery';
		} catch (e) {
			error = e instanceof Error ? e.message : 'Inscription impossible';
		} finally {
			busy = false;
		}
	}

	function downloadHref(key: string) {
		const text = `Clé de récupération Idixus Vault\n${data.email}\n\n${key}\n\nConservez ce fichier hors de votre ordinateur de travail (coffre-fort physique, gestionnaire personnel…).\n`;
		return URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
	}

	async function verified() {
		const unlocked = await openVault(pending!);
		pending = null;
		await vault.open(unlocked);
		await goto(resolve('/(app)'));
	}
</script>

<svelte:head><title>Créer mon compte · Idixus Vault</title></svelte:head>

{#if !data.email}
	<h1 class="mb-2 text-xl font-semibold">Invitation invalide</h1>
	<p class="text-sm text-muted">
		Ce lien a expiré, a déjà été utilisé ou n’existe pas. Demandez à un administrateur de vous
		envoyer une nouvelle invitation.
	</p>
	<a class="btn mt-5 w-full" href={resolve('/(auth)/login')}>Aller à la connexion</a>
{:else if step === 'form'}
	<h1 class="mb-1 text-xl font-semibold">Créer mon compte</h1>
	<p class="mb-5 text-sm text-muted">
		Invitation pour <strong class="text-ink">{data.email}</strong>. Choisissez un mot de passe
		maître : il ne quitte jamais votre navigateur.
	</p>
	<form onsubmit={submit} class="space-y-4">
		<div>
			<label class="label" for="name">Nom complet</label>
			<input
				id="name"
				class="field"
				required
				maxlength="100"
				autocomplete="name"
				bind:value={name}
			/>
		</div>
		<PasswordField
			id="pw"
			label="Mot de passe maître"
			autocomplete="new-password"
			strength
			bind:value={password}
		/>
		<PasswordField
			id="pw2"
			label="Confirmer le mot de passe"
			autocomplete="new-password"
			bind:value={confirm}
		/>
		{#if mismatch}<p class="text-xs text-danger">Les mots de passe ne correspondent pas.</p>{/if}
		<div class="alert alert-warn">
			<strong>Important :</strong> personne ne peut réinitialiser ce mot de passe à votre place. Une clé
			de récupération vous sera donnée à l’étape suivante.
		</div>
		{#if error}<p class="alert alert-danger" role="alert">{error}</p>{/if}
		<button class="btn btn-primary w-full" disabled={busy}>
			{busy ? 'Création du compte…' : 'Créer mon compte'}
		</button>
	</form>
{:else if step === 'recovery'}
	<h1 class="mb-1 text-xl font-semibold">Votre clé de récupération</h1>
	<p class="mb-4 text-sm text-muted">
		Si vous oubliez votre mot de passe maître, cette clé est le <strong class="text-ink"
			>seul moyen</strong
		> de retrouver vos données. Elle ne sera plus jamais affichée.
	</p>
	<div
		class="rounded-xl border border-line bg-surface-2 p-4 text-center font-mono text-[0.95rem] leading-7 tracking-wide break-words select-all"
	>
		{recoveryKey}
	</div>
	<!-- eslint-disable svelte/no-navigation-without-resolve -- URL blob: locale pour le téléchargement, pas une navigation -->
	<a
		class="btn mt-3 w-full"
		href={downloadHref(recoveryKey)}
		download="cle-de-recuperation-idixus-vault.txt"
	>
		<Icon name="download" /> Télécharger la clé
	</a>
	<!-- eslint-enable svelte/no-navigation-without-resolve -->
	<label class="mt-5 flex items-start gap-2.5 text-sm">
		<input type="checkbox" class="mt-0.5 rounded" bind:checked={saved} />
		<span>J’ai conservé cette clé dans un endroit sûr, en dehors de cet ordinateur.</span>
	</label>
	<button class="btn btn-primary mt-4 w-full" disabled={!saved} onclick={() => (step = 'otp')}>
		Continuer
	</button>
{:else}
	<h1 class="mb-1 text-xl font-semibold">Dernière étape</h1>
	<div class="mt-3">
		<OtpForm email={data.email} onverified={verified} />
	</div>
{/if}
