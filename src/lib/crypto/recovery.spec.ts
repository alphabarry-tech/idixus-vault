import { describe, it, expect } from 'vitest';
import { generateUserKeyPair, toB64 } from './index';
import {
	decryptPrivateKeyWithRecovery,
	encryptPrivateKeyForRecovery,
	formatRecoveryKey,
	generateRecoveryKey,
	parseRecoveryKey
} from './recovery';

describe('clé de récupération', () => {
	it('fait un aller-retour texte ↔ octets', async () => {
		const key = await generateRecoveryKey();
		const text = formatRecoveryKey(key);
		expect(text).toMatch(/^([0-9A-Z]{4}-){12}[0-9A-Z]{4}$/);
		expect(toB64(parseRecoveryKey(text))).toBe(toB64(key));
	});

	it('tolère minuscules, espaces et confusions de caractères', async () => {
		const key = await generateRecoveryKey();
		const text = formatRecoveryKey(key).toLowerCase().replace(/-/g, ' ');
		expect(toB64(parseRecoveryKey(text))).toBe(toB64(key));
	});

	it('refuse une clé tronquée ou avec un caractère interdit', async () => {
		const text = formatRecoveryKey(await generateRecoveryKey());
		expect(() => parseRecoveryKey(text.slice(0, -5))).toThrow();
		expect(() => parseRecoveryKey('!' + text.slice(1))).toThrow();
	});

	it('déchiffre la clé privée avec la bonne clé seulement', async () => {
		const pair = await generateUserKeyPair();
		const key = await generateRecoveryKey();
		const sealed = await encryptPrivateKeyForRecovery(key, pair.privateKey, 'u1');
		const back = await decryptPrivateKeyWithRecovery(key, sealed, 'u1');
		expect(toB64(back)).toBe(toB64(pair.privateKey));
		await expect(
			decryptPrivateKeyWithRecovery(await generateRecoveryKey(), sealed, 'u1')
		).rejects.toThrow();
	});
});
