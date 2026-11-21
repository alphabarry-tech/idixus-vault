import { evaluateStrength, findReused } from '../crypto/password';
import type { Entry, SpaceInfo } from './protocol';

export type HealthItem = { space: SpaceInfo; entry: Entry };

export type Health = {
	weak: HealthItem[];
	reused: HealthItem[][];
	old: HealthItem[];
	empty: HealthItem[];
	/** Part (0-100) des mots de passe ni faibles ni réutilisés. */
	score: number;
};

const ONE_YEAR_MS = 365 * 24 * 3_600_000;

/** Analyse locale des mots de passe : aucune donnée ne quitte le navigateur. */
export function analyzeHealth(items: HealthItem[], now = Date.now()): Health {
	const withPassword = items.filter((i) => i.entry.data.password);
	const weak = withPassword.filter((i) => {
		const pw = i.entry.data.password;
		return pw.length < 10 || evaluateStrength(pw).score <= 1;
	});
	const groups = findReused(
		withPassword.map((i) => ({ id: i.entry.id, password: i.entry.data.password }))
	);
	const byId = new Map(items.map((i) => [i.entry.id, i]));
	const reused = groups.map((ids) => ids.map((id) => byId.get(id)!));
	const old = withPassword.filter((i) => now - new Date(i.entry.updatedAt).getTime() > ONE_YEAR_MS);
	const empty = items.filter((i) => !i.entry.data.password);

	const problematic = new Set([
		...weak.map((i) => i.entry.id),
		...reused.flat().map((i) => i.entry.id)
	]);
	const score =
		withPassword.length === 0
			? 100
			: Math.round(((withPassword.length - problematic.size) / withPassword.length) * 100);
	return { weak, reused, old, empty, score };
}
