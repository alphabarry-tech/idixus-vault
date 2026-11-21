<script lang="ts">
	import { DEFAULT_OPTIONS, generatePassword, type GeneratorOptions } from '../crypto/password';
	import CopyButton from './CopyButton.svelte';
	import Icon from './Icon.svelte';
	import StrengthMeter from './StrengthMeter.svelte';

	let { onuse }: { onuse?: (password: string) => void } = $props();

	let opts = $state<GeneratorOptions>({ ...DEFAULT_OPTIONS });
	let password = $state('');
	let error = $state('');

	async function regenerate() {
		error = '';
		try {
			password = await generatePassword(opts);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Erreur';
		}
	}

	regenerate();

	const sets = [
		['lower', 'a–z'],
		['upper', 'A–Z'],
		['digits', '0–9'],
		['symbols', '!@#']
	] as const;
</script>

<div class="space-y-3 rounded-xl border border-line bg-surface-2 p-3.5">
	<div class="flex items-center gap-1.5">
		<output class="field flex-1 font-mono text-sm break-all select-all" aria-live="polite"
			>{password}</output
		>
		<button
			type="button"
			class="btn btn-icon"
			onclick={regenerate}
			aria-label="Générer un autre mot de passe"
		>
			<Icon name="refresh" size={16} />
		</button>
		<CopyButton text={password} label="Copier le mot de passe généré" secret />
	</div>
	<StrengthMeter {password} showIssues={false} />

	<div>
		<label class="label flex justify-between" for="gen-length">
			<span>Longueur</span><span class="font-mono text-muted">{opts.length}</span>
		</label>
		<input
			id="gen-length"
			type="range"
			min="8"
			max="64"
			bind:value={opts.length}
			oninput={regenerate}
			class="w-full accent-[var(--brand)]"
		/>
	</div>
	<div class="flex flex-wrap gap-x-4 gap-y-1.5">
		{#each sets as [key, text] (key)}
			<label class="flex items-center gap-1.5 text-sm">
				<input type="checkbox" class="rounded" bind:checked={opts[key]} onchange={regenerate} />
				<span class="font-mono">{text}</span>
			</label>
		{/each}
	</div>
	{#if error}<p class="text-xs text-danger" role="alert">{error}</p>{/if}
	{#if onuse}
		<button
			type="button"
			class="btn btn-primary w-full"
			onclick={() => onuse(password)}
			disabled={!password}
		>
			Utiliser ce mot de passe
		</button>
	{/if}
</div>
