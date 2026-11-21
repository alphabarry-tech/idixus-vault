<script lang="ts">
	import { copyPlain, copySecret } from '../client/clipboard';
	import Icon from './Icon.svelte';

	let { text, label, secret = false }: { text: string; label: string; secret?: boolean } = $props();

	let done = $state(false);
	let timer: ReturnType<typeof setTimeout>;

	async function copy(event: MouseEvent) {
		event.stopPropagation();
		try {
			await (secret ? copySecret(text) : copyPlain(text));
			done = true;
			clearTimeout(timer);
			timer = setTimeout(() => (done = false), 1500);
		} catch {
			// presse-papiers indisponible (contexte non sécurisé ou permission refusée)
		}
	}
</script>

<button
	type="button"
	class="btn btn-ghost btn-icon {done ? 'text-ok' : 'text-muted'}"
	onclick={copy}
	aria-label={done ? 'Copié' : label}
	title={done ? 'Copié' : label}
	disabled={!text}
>
	<Icon name={done ? 'check' : 'copy'} size={16} />
</button>
