<script lang="ts">
	import type { Entry } from '../client/protocol';
	import { evaluateStrength } from '../crypto/password';
	import CopyButton from './CopyButton.svelte';
	import Icon from './Icon.svelte';

	let {
		entry,
		reused = false,
		onopen
	}: { entry: Entry; reused?: boolean; onopen: () => void } = $props();

	let d = $derived(entry.data);
	let weak = $derived(
		d.password.length > 0 && (d.password.length < 10 || evaluateStrength(d.password).score <= 1)
	);

	// Seuls http(s) sont rendus cliquables : jamais de lien javascript: ou data: venant d'une entrée
	let safeUrl = $derived.by(() => {
		try {
			const u = new URL(d.url);
			return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
		} catch {
			return null;
		}
	});

	const hues = [255, 200, 150, 30, 330, 10, 90, 280];
	let hue = $derived(hues[[...d.title].reduce((a, c) => a + c.charCodeAt(0), 0) % hues.length]);
</script>

<li class="group flex items-center gap-3 px-3 py-2.5 hover:bg-surface-2">
	<button class="flex min-w-0 flex-1 items-center gap-3 text-left" onclick={onopen}>
		<span
			class="grid size-9 shrink-0 place-items-center rounded-lg text-sm font-bold"
			style:background="hsl({hue} 70% 92%)"
			style:color="hsl({hue} 55% 35%)"
			aria-hidden="true"
		>
			{(d.title[0] ?? '?').toUpperCase()}
		</span>
		<span class="min-w-0">
			<span class="flex items-center gap-2">
				<span class="truncate font-semibold">{d.title}</span>
				{#if weak}<span class="badge badge-danger">Faible</span>{/if}
				{#if reused}<span class="badge badge-warn">Réutilisé</span>{/if}
			</span>
			<span class="block truncate text-sm text-muted">{d.username || d.url || '—'}</span>
		</span>
	</button>
	<div
		class="flex shrink-0 items-center opacity-100 md:opacity-0 md:transition-opacity md:group-focus-within:opacity-100 md:group-hover:opacity-100"
	>
		{#if safeUrl}
			<!-- eslint-disable svelte/no-navigation-without-resolve -- lien externe vers le site de l’entrée, restreint à http(s) par safeUrl -->
			<a
				class="btn btn-ghost btn-icon text-muted"
				href={safeUrl}
				target="_blank"
				rel="noopener noreferrer"
				aria-label="Ouvrir {d.title}"
				title="Ouvrir le site"
			>
				<Icon name="external" size={16} />
			</a>
			<!-- eslint-enable svelte/no-navigation-without-resolve -->
		{/if}
		<CopyButton text={d.username} label="Copier l’identifiant" />
		<CopyButton text={d.password} label="Copier le mot de passe" secret />
	</div>
</li>
