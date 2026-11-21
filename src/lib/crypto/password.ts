import sodium from 'libsodium-wrappers-sumo';
import { initCrypto } from './index';

export type GeneratorOptions = {
	length: number;
	lower: boolean;
	upper: boolean;
	digits: boolean;
	symbols: boolean;
};

export const DEFAULT_OPTIONS: GeneratorOptions = {
	length: 20,
	lower: true,
	upper: true,
	digits: true,
	symbols: true
};

const SETS = {
	lower: 'abcdefghijklmnopqrstuvwxyz',
	upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
	digits: '0123456789',
	symbols: '!@#$%^&*()-_=+[]{};:,.?'
} as const;

/** Génère un mot de passe avec un tirage uniforme (sans biais) et au moins un caractère par jeu activé. */
export async function generatePassword(opts: GeneratorOptions = DEFAULT_OPTIONS): Promise<string> {
	await initCrypto();
	const sets = (Object.keys(SETS) as (keyof typeof SETS)[])
		.filter((k) => opts[k])
		.map((k) => SETS[k]);
	if (sets.length === 0) throw new Error('Au moins un jeu de caractères est requis');
	if (opts.length < sets.length || opts.length > 128) throw new Error('Longueur invalide');

	const pool = sets.join('');
	const chars = sets.map((s) => s[sodium.randombytes_uniform(s.length)]);
	while (chars.length < opts.length) chars.push(pool[sodium.randombytes_uniform(pool.length)]);

	// Mélange Fisher-Yates pour ne pas révéler la position des caractères imposés
	for (let i = chars.length - 1; i > 0; i--) {
		const j = sodium.randombytes_uniform(i + 1);
		[chars[i], chars[j]] = [chars[j], chars[i]];
	}
	return chars.join('');
}

export type Strength = { score: 0 | 1 | 2 | 3 | 4; bits: number; issues: string[] };

const COMMON = [
	'password',
	'motdepasse',
	'azerty',
	'qwerty',
	'123456',
	'admin',
	'idixus',
	'soleil'
];

/** Estimation simple de l'entropie, calculée localement (aucun appel externe). */
export function evaluateStrength(pw: string): Strength {
	const issues: string[] = [];
	let pool = 0;
	if (/[a-z]/.test(pw)) pool += 26;
	if (/[A-Z]/.test(pw)) pool += 26;
	if (/\d/.test(pw)) pool += 10;
	if (/[^A-Za-z0-9]/.test(pw)) pool += 32;

	const unique = new Set(pw).size;
	let bits = pw.length === 0 ? 0 : Math.log2(Math.max(pool, 1)) * Math.min(pw.length, unique * 2);

	if (pw.length < 12) issues.push('Moins de 12 caractères');
	if (/(.)\1{2,}/.test(pw)) {
		issues.push('Caractères répétés');
		bits *= 0.8;
	}
	if (/(0123|1234|2345|3456|4567|5678|6789|abcd|bcde|cdef)/i.test(pw)) {
		issues.push('Suite de caractères prévisible');
		bits *= 0.7;
	}
	const lower = pw.toLowerCase();
	if (COMMON.some((w) => lower.includes(w))) {
		issues.push('Contient un mot courant');
		bits *= 0.5;
	}

	const score = bits < 28 ? 0 : bits < 45 ? 1 : bits < 60 ? 2 : bits < 80 ? 3 : 4;
	return { score, bits: Math.round(bits), issues };
}

/** Repère les mots de passe identiques entre plusieurs entrées (comparaison locale uniquement). */
export function findReused(entries: { id: string; password: string }[]): string[][] {
	const groups = new Map<string, string[]>();
	for (const e of entries) {
		if (!e.password) continue;
		groups.set(e.password, [...(groups.get(e.password) ?? []), e.id]);
	}
	return [...groups.values()].filter((ids) => ids.length > 1);
}
