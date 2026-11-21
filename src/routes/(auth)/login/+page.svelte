<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import OtpForm from '#lib/components/OtpForm.svelte';
	import PasswordField from '#lib/components/PasswordField.svelte';
	import { login, openVault, type Pending } from '#lib/client/protocol.ts';
	import { vault } from '#lib/client/vault.svelte.ts';

	let email = $state('');
	let password = $state('');
	let error = $state('');
	let busy = $state(false);
	let pending = $state.raw<Pending | null>(null);

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		busy = true;
		error = '';
		try {
			pending = await login(email.trim().toLowerCase(), password);
			password = '';
		} catch (e) {
			error = e instanceof Error ? e.message : 'Connexion impossible';
		} finally {
			busy = false;
		}
	}

	async function verified() {
		const unlocked = await openVault(pending!);
		pending = null;
		await vault.open(unlocked);
		await goto(resolve('/(app)'));
	}
</script>

<svelte:head><title>Connexion · Idixus Vault</title></svelte:head>

{#if pending}
	<h1 class="mb-1 text-xl font-semibold">Vérification en deux étapes</h1>
	<div class="mt-3">
		<OtpForm email={email.trim().toLowerCase()} onverified={verified} />
	</div>
{:else}
	<h1 class="mb-1 text-xl font-semibold">Connexion</h1>
	<p class="mb-5 text-sm text-muted">Accédez au coffre-fort de mots de passe d’Idixus.</p>
	<form onsubmit={submit} class="space-y-4">
		<div>
			<label class="label" for="email">Email professionnel</label>
			<input
				id="email"
				class="field"
				type="email"
				autocomplete="username"
				required
				bind:value={email}
				placeholder="prenom.nom@idixus.com"
			/>
		</div>
		<PasswordField id="password" label="Mot de passe maître" bind:value={password} />
		{#if error}<p class="alert alert-danger" role="alert">{error}</p>{/if}
		<button class="btn btn-primary w-full" disabled={busy}>
			{busy ? 'Vérification…' : 'Continuer'}
		</button>
		<p class="text-center text-sm">
			<a class="text-brand underline-offset-2 hover:underline" href={resolve('/(auth)/recover')}>
				Mot de passe maître oublié ?
			</a>
		</p>
	</form>
{/if}
