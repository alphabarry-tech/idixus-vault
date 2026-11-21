import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { SESSION_SECRET } from '$app/env/private';

export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');

/** HMAC-SHA256 avec le secret serveur, séparé par un libellé de contexte. */
export const hmac = (label: string, data: string) =>
	createHmac('sha256', SESSION_SECRET).update(`${label}:${data}`).digest();

export function safeEqual(a: Uint8Array | string, b: Uint8Array | string): boolean {
	const x = Buffer.from(a);
	const y = Buffer.from(b);
	return x.length === y.length && timingSafeEqual(x, y);
}

/** Jeton signé à durée de vie courte (ex. étape intermédiaire de la récupération de compte). */
export function signToken(payload: Record<string, unknown>, ttlMs: number): string {
	const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + ttlMs })).toString(
		'base64url'
	);
	return `${body}.${hmac('token', body).toString('base64url')}`;
}

export function verifyToken<T extends Record<string, unknown>>(token: string): T | null {
	const [body, sig] = token.split('.');
	if (!body || !sig) return null;
	if (!safeEqual(hmac('token', body).toString('base64url'), sig)) return null;
	try {
		const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as T & { exp: number };
		return payload.exp > Date.now() ? payload : null;
	} catch {
		return null;
	}
}
