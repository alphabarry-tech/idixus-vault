import { error } from '@sveltejs/kit';

/**
 * Limiteur à fenêtre glissante, en mémoire (une seule instance du serveur).
 * Si l'application passe sur plusieurs instances, déplacer ce compteur dans Redis ou Postgres.
 */
const hits = new Map<string, number[]>();

export function rateLimited(key: string, max: number, windowMs: number, now = Date.now()): boolean {
	const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
	if (recent.length >= max) {
		hits.set(key, recent);
		return true;
	}
	recent.push(now);
	hits.set(key, recent);
	return false;
}

/** Lève une erreur 429 si la limite est dépassée. */
export function limit(key: string, max: number, windowMs: number) {
	if (rateLimited(key, max, windowMs)) {
		error(429, 'Trop de tentatives. Réessayez dans quelques minutes.');
	}
}

setInterval(() => {
	const now = Date.now();
	for (const [key, times] of hits) {
		if (times.every((t) => now - t > 3_600_000)) hits.delete(key);
	}
}, 600_000).unref();
