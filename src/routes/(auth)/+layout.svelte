<script lang="ts">
	import Icon from '#lib/components/Icon.svelte';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
</script>

<main class="grid min-h-dvh place-items-center px-4 py-10">
	<div class="w-full max-w-md">
		<div class="mb-6 flex items-center justify-center gap-2.5">
			<span class="grid size-10 place-items-center rounded-xl bg-brand text-[var(--on-brand)]">
				<Icon name="shield" size={22} />
			</span>
			<span class="text-xl font-bold tracking-tight">Idixus Vault</span>
		</div>
		<div class="card p-6 shadow-[var(--shadow)] sm:p-8">
			{@render children()}
		</div>
		<p class="mt-5 text-center text-xs text-muted">
			Chiffrement de bout en bout : Idixus ne peut pas lire vos mots de passe.
		</p>
	</div>
</main>
