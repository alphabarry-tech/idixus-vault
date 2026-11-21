import sodium from 'libsodium-wrappers-sumo';
import { initCrypto, open, seal, type Sealed } from './index';

/**
 * Clé de récupération : 256 bits aléatoires, affichés une seule fois à l'inscription sous la forme
 * XXXX-XXXX-… (base32 Crockford, sans ambiguïtés I/L/O/U). Elle chiffre une copie de la clé privée.
 */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export async function generateRecoveryKey(): Promise<Uint8Array> {
	await initCrypto();
	return sodium.randombytes_buf(32);
}

export function formatRecoveryKey(bytes: Uint8Array): string {
	let bits = 0;
	let value = 0;
	let out = '';
	for (const byte of bytes) {
		value = (value << 8) | byte;
		bits += 8;
		while (bits >= 5) {
			out += ALPHABET[(value >>> (bits - 5)) & 31];
			bits -= 5;
		}
	}
	if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
	return out.match(/.{1,4}/g)!.join('-');
}

/** Tolère les minuscules, les espaces, les tirets et les confusions courantes (O→0, I/L→1). */
export function parseRecoveryKey(input: string): Uint8Array {
	const clean = input.toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
	let bits = 0;
	let value = 0;
	const out: number[] = [];
	for (const ch of clean) {
		const idx = ALPHABET.indexOf(ch);
		if (idx === -1) throw new Error('Clé de récupération invalide');
		value = (value << 5) | idx;
		bits += 5;
		if (bits >= 8) {
			out.push((value >>> (bits - 8)) & 255);
			bits -= 8;
		}
	}
	if (out.length !== 32) throw new Error('Clé de récupération invalide');
	return Uint8Array.from(out);
}

export function encryptPrivateKeyForRecovery(
	recoveryKey: Uint8Array,
	privateKey: Uint8Array,
	userId: string
): Promise<Sealed> {
	return seal(recoveryKey, privateKey, `user-key-recovery:${userId}`);
}

export function decryptPrivateKeyWithRecovery(
	recoveryKey: Uint8Array,
	sealed: Sealed,
	userId: string
): Promise<Uint8Array> {
	return open(recoveryKey, sealed, `user-key-recovery:${userId}`);
}
