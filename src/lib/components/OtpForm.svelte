<script lang="ts">
	import { resendOtp, verifyOtp } from '../client/protocol';

	let { email, onverified }: { email: string; onverified: () => void | Promise<void> } = $props();

	const COOLDOWN = 45;

	let code = $state('');
	let error = $state('');
	let info = $state('');
	let busy = $state(false);
	let wait = $state(COOLDOWN);

	// Compte à rebours avant de pouvoir redemander un code
	$effect(() => {
		if (wait <= 0) return;
		const t = setTimeout(() => wait--, 1000);
		return () => clearTimeout(t);
	});

	async function submit(event?: SubmitEvent) {
		event?.preventDefault();
		if (busy || code.length !== 6) return;
		busy = true;
		error = '';
		try {
			await verifyOtp(code);
			await onverified();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Erreur';
			code = '';
		} finally {
			busy = false;
		}
	}

	async function resend() {
		error = '';
		info = '';
		try {
			await resendOtp();
			info = 'Un nouveau code vient d’être envoyé.';
			wait = COOLDOWN;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Erreur';
		}
	}

	function oninput() {
		code = code.replace(/\D/g, '').slice(0, 6);
		if (code.length === 6) submit();
	}
</script>

<form onsubmit={submit} class="space-y-4">
	<p class="text-sm text-muted">
		Un code à 6 chiffres a été envoyé à <strong class="text-ink">{email}</strong>. Il est valable 5
		minutes.
	</p>
	<div>
		<label class="label" for="otp">Code de vérification</label>
		<input
			id="otp"
			class="field text-center font-mono text-2xl tracking-[0.5em]"
			inputmode="numeric"
			autocomplete="one-time-code"
			maxlength="6"
			placeholder="······"
			bind:value={code}
			{oninput}
			disabled={busy}
		/>
	</div>
	{#if error}<p class="alert alert-danger" role="alert">{error}</p>{/if}
	{#if info}<p class="alert alert-ok" role="status">{info}</p>{/if}
	<button class="btn btn-primary w-full" disabled={busy || code.length !== 6}>
		{busy ? 'Vérification…' : 'Valider'}
	</button>
	<button type="button" class="btn btn-ghost w-full" onclick={resend} disabled={wait > 0}>
		{wait > 0 ? `Renvoyer le code (${wait} s)` : 'Renvoyer le code'}
	</button>
</form>
