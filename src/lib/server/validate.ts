import { error } from '@sveltejs/kit';

/** Validation minimale des corps JSON. Toute valeur inattendue renvoie une erreur 400. */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const B64URL = /^[A-Za-z0-9_-]+$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function readBody(request: Request): Promise<Record<string, unknown>> {
	let data: unknown;
	try {
		data = await request.json();
	} catch {
		error(400, 'Corps de requête invalide');
	}
	if (typeof data !== 'object' || data === null || Array.isArray(data)) {
		error(400, 'Corps de requête invalide');
	}
	return data as Record<string, unknown>;
}

export function str(v: unknown, name: string, max = 200, min = 1): string {
	if (typeof v !== 'string' || v.length < min || v.length > max) error(400, `${name} invalide`);
	return v.trim();
}

export function email(v: unknown): string {
	const s = str(v, 'email', 254).toLowerCase();
	if (!EMAIL.test(s)) error(400, 'email invalide');
	return s;
}

export function uuid(v: unknown, name = 'identifiant'): string {
	if (typeof v !== 'string' || !UUID.test(v)) error(400, `${name} invalide`);
	return v.toLowerCase();
}

export function isUuid(v: unknown): v is string {
	return typeof v === 'string' && UUID.test(v);
}

export function b64(v: unknown, name: string, max = 512, min = 1): string {
	if (typeof v !== 'string' || v.length < min || v.length > max || !B64URL.test(v)) {
		error(400, `${name} invalide`);
	}
	return v;
}

export function int(v: unknown, name: string, min: number, max: number): number {
	if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max)
		error(400, `${name} invalide`);
	return v;
}

export function oneOf<T extends string>(v: unknown, name: string, allowed: readonly T[]): T {
	if (typeof v !== 'string' || !allowed.includes(v as T)) error(400, `${name} invalide`);
	return v as T;
}

export type Sealed = { nonce: string; ciphertext: string };

/** `{ nonce, ciphertext }` produits par `seal()` côté client. */
export function sealed(v: unknown, name: string, maxCipher = 200_000): Sealed {
	if (typeof v !== 'object' || v === null) error(400, `${name} invalide`);
	const o = v as Record<string, unknown>;
	return {
		nonce: b64(o.nonce, `${name}.nonce`, 64, 32),
		ciphertext: b64(o.ciphertext, `${name}.ciphertext`, maxCipher, 16)
	};
}

export function kdfParams(v: unknown): { opslimit: number; memlimit: number } {
	if (typeof v !== 'object' || v === null) error(400, 'kdfParams invalide');
	const o = v as Record<string, unknown>;
	return {
		opslimit: int(o.opslimit, 'kdfParams.opslimit', 2, 12),
		memlimit: int(o.memlimit, 'kdfParams.memlimit', 64 * 1024 * 1024, 1024 * 1024 * 1024)
	};
}
