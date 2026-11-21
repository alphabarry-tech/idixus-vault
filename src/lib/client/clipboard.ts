const CLEAR_AFTER_MS = 30_000;
let timer: ReturnType<typeof setTimeout> | undefined;

/** Copie un secret et le retire du presse-papiers après 30 s s'il n'a pas été remplacé entre-temps. */
export async function copySecret(text: string): Promise<void> {
	await navigator.clipboard.writeText(text);
	clearTimeout(timer);
	timer = setTimeout(async () => {
		try {
			if ((await navigator.clipboard.readText()) !== text) return;
		} catch {
			// lecture refusée : on efface quand même, c'est le comportement le plus sûr
		}
		navigator.clipboard.writeText('').catch(() => {});
	}, CLEAR_AFTER_MS);
}

export async function copyPlain(text: string): Promise<void> {
	await navigator.clipboard.writeText(text);
}
