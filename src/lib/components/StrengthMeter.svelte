<script lang="ts">
	import { evaluateStrength } from '../crypto/password';

	let { password, showIssues = true }: { password: string; showIssues?: boolean } = $props();

	const labels = ['Très faible', 'Faible', 'Correct', 'Fort', 'Excellent'];
	const colors = ['var(--danger)', 'var(--danger)', 'var(--warn)', 'var(--ok)', 'var(--ok)'];

	let result = $derived(evaluateStrength(password));
	// Au moins un segment dès qu'on tape, quatre pour « Excellent »
	let filled = $derived(Math.max(1, result.score));
</script>

{#if password}
	<div class="mt-2" aria-live="polite">
		<div class="flex gap-1" role="presentation">
			{#each [0, 1, 2, 3] as i (i)}
				<div
					class="h-1.5 flex-1 rounded-full"
					style:background={i < filled ? colors[result.score] : 'var(--line)'}
				></div>
			{/each}
		</div>
		<p class="mt-1 text-xs text-muted">
			<span style:color={colors[result.score]} class="font-semibold">{labels[result.score]}</span>
			{#if showIssues && result.issues.length}· {result.issues.join(' · ')}{/if}
		</p>
	</div>
{/if}
