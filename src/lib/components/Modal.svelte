<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from './Icon.svelte';

	let {
		title,
		onclose,
		children,
		size = 'md'
	}: {
		title: string;
		onclose: () => void;
		children: Snippet;
		size?: 'sm' | 'md' | 'lg';
	} = $props();

	const widths = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl' };

	// <dialog> natif : focus piégé, Échap et inertie du reste de la page gérés par le navigateur
	function modal(node: HTMLDialogElement) {
		node.showModal();
		return () => node.close();
	}
</script>

<dialog
	{@attach modal}
	{onclose}
	onclick={(e) => {
		if (e.target === e.currentTarget) onclose();
	}}
	aria-labelledby="modal-title"
	class="m-auto max-h-[90vh] w-[calc(100%-2rem)] {widths[
		size
	]} overflow-visible rounded-2xl border border-line bg-surface p-0 text-ink shadow-[var(--shadow)]"
>
	<div class="flex items-center justify-between border-b border-line px-5 py-3.5">
		<h2 id="modal-title" class="text-base font-semibold">{title}</h2>
		<button class="btn btn-ghost btn-icon" onclick={onclose} aria-label="Fermer"
			><Icon name="x" /></button
		>
	</div>
	<div class="max-h-[calc(90vh-4rem)] overflow-y-auto p-5">
		{@render children()}
	</div>
</dialog>
