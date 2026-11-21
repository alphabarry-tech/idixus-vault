<script lang="ts">
	import { resolve } from '$app/paths';
	import Icon from '#lib/components/Icon.svelte';
	import PasswordField from '#lib/components/PasswordField.svelte';
	import {
		checkMasterPassword,
		finishRecovery,
		startRecovery,
		verifyRecovery,
		type RecoveryStep
	} from '#lib/client/protocol.ts';

	let step = $state<'email' | 'verify' | 'password' | 'done'>('email');
	let email = $state('');
	let code = $state('');
	let recoveryText = $state('');
	let password = $state('');
	let confirm = $state('');
	let error = $state('');
	let busy = $state(false);
	let recovery = $state.raw<RecoveryStep | null>(null);
	let newKey = $state('');

	async function run(fn: () => Promise<void>) {
		busy = true;
		error = '';
		try {
			await fn();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Une erreur est survenue';
		} finally {
			busy = false;
		}
	}

	const sendCode = (e: SubmitEvent) => {
		e.preventDefault();
		return run(async () => {
			await startRecovery(email.trim().toLowerCase());
			step = 'verify';
		});
	};

	const verify = (e: SubmitEvent) => {
		e.preventDefault();
		return run(async () => {
			recovery = await verifyRecovery(email.trim().toLowerCase(), code, recoveryText);
			step = 'password';
		});
	};

	const finish = (e: SubmitEvent) => {
		e.preventDefault();
		return run(async () => {
			const problem =
				checkMasterPassword(password) ??
				(password !== confirm ? 'Les mots de passe ne correspondent pas' : '');
			if (problem) throw new Error(problem);
			newKey = await finishRecovery(recovery!, password);
			recovery = null;
			password = confirm = '';
			step = 'done';
		});
	};
</script>

<svelte:head><title>Récupération · Idixus Vault</title></svelte:head>

{#if step === 'email'}
	<h1 class="mb-1 text-xl font-semibold">Mot de passe maître oublié</h1>
	<p class="mb-5 text-sm text-muted">
		Il vous faut votre <strong class="text-ink">clé de récupération</strong> et l’accès à votre boîte
		mail.
	</p>
	<form onsubmit={sendCode} class="space-y-4">
		<div>
			<label class="label" for="email">Email professionnel</label>
			<input
				id="email"
				class="field"
				type="email"
				required
				autocomplete="username"
				bind:value={email}
			/>
		</div>
		{#if error}<p class="alert alert-danger" role="alert">{error}</p>{/if}
		<button class="btn btn-primary w-full" disabled={busy}
			><Icon name="mail" /> Envoyer un code</button
		>
	</form>
{:else if step === 'verify'}
	<h1 class="mb-1 text-xl font-semibold">Vérification</h1>
	<p class="mb-5 text-sm text-muted">
		Si un compte existe pour cette adresse, un code vient d’être envoyé. Saisissez-le avec votre clé
		de récupération.
	</p>
	<form onsubmit={verify} class="space-y-4">
		<div>
			<label class="label" for="code">Code reçu par email</label>
			<input
				id="code"
				class="field text-center font-mono text-xl tracking-[0.4em]"
				inputmode="numeric"
				maxlength="6"
				autocomplete="one-time-code"
				required
				bind:value={code}
			/>
		</div>
		<div>
			<label class="label" for="rk">Clé de récupération</label>
			<textarea
				id="rk"
				class="field font-mono text-sm"
				rows="3"
				required
				spellcheck="false"
				autocapitalize="characters"
				placeholder="XXXX-XXXX-XXXX-…"
				bind:value={recoveryText}></textarea>
		</div>
		{#if error}<p class="alert alert-danger" role="alert">{error}</p>{/if}
		<button class="btn btn-primary w-full" disabled={busy || code.length !== 6}>
			{busy ? 'Vérification…' : 'Continuer'}
		</button>
	</form>
{:else if step === 'password'}
	<h1 class="mb-1 text-xl font-semibold">Nouveau mot de passe maître</h1>
	<p class="mb-5 text-sm text-muted">
		Vos données sont intactes. Choisissez un nouveau mot de passe.
	</p>
	<form onsubmit={finish} class="space-y-4">
		<PasswordField
			id="pw"
			label="Nouveau mot de passe maître"
			autocomplete="new-password"
			strength
			bind:value={password}
		/>
		<PasswordField id="pw2" label="Confirmer" autocomplete="new-password" bind:value={confirm} />
		{#if error}<p class="alert alert-danger" role="alert">{error}</p>{/if}
		<button class="btn btn-primary w-full" disabled={busy}>
			{busy ? 'Enregistrement…' : 'Changer le mot de passe'}
		</button>
	</form>
{:else}
	<h1 class="mb-1 text-xl font-semibold">Mot de passe changé</h1>
	<p class="mb-4 text-sm text-muted">
		Voici votre <strong class="text-ink">nouvelle clé de récupération</strong>. L’ancienne ne
		fonctionne plus. Conservez-la en lieu sûr : elle ne sera plus affichée.
	</p>
	<div
		class="rounded-xl border border-line bg-surface-2 p-4 text-center font-mono text-[0.95rem] leading-7 tracking-wide break-words select-all"
	>
		{newKey}
	</div>
	<a class="btn btn-primary mt-5 w-full" href={resolve('/(auth)/login')}>Me connecter</a>
{/if}
