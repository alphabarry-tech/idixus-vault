import { describe, it, expect } from 'vitest';
import {
	deriveKeys,
	newSalt,
	generateUserKeyPair,
	generateSpaceKey,
	encryptPrivateKey,
	decryptPrivateKey,
	wrapSpaceKey,
	unwrapSpaceKey,
	encryptEntry,
	decryptEntry,
	toB64,
	type KdfParams
} from './index';
import { generatePassword, evaluateStrength, findReused } from './password';

// Paramètres réduits pour que les tests restent rapides (la prod utilise MODERATE)
const FAST: KdfParams = { opslimit: 2, memlimit: 8 * 1024 * 1024 };
const ctx = { spaceId: 's1', entryId: 'e1', keyVersion: 1 };

describe('dérivation de clés', () => {
	it('est déterministe pour le même mot de passe et le même sel', async () => {
		const salt = await newSalt();
		const a = await deriveKeys('correct horse', salt, FAST);
		const b = await deriveKeys('correct horse', salt, FAST);
		expect(toB64(a.kek)).toBe(toB64(b.kek));
		expect(toB64(a.authKey)).toBe(toB64(b.authKey));
	});

	it('produit des clés différentes selon le mot de passe', async () => {
		const salt = await newSalt();
		const a = await deriveKeys('mdp-un', salt, FAST);
		const b = await deriveKeys('mdp-deux', salt, FAST);
		expect(toB64(a.kek)).not.toBe(toB64(b.kek));
	});

	it('sépare authKey et kek : le serveur qui connaît authKey ne peut pas déchiffrer', async () => {
		const { authKey, kek } = await deriveKeys('mdp', await newSalt(), FAST);
		expect(toB64(authKey)).not.toBe(toB64(kek));
	});
});

describe('clé privée utilisateur', () => {
	it('fait un aller-retour avec la bonne KEK', async () => {
		const { kek } = await deriveKeys('mdp', await newSalt(), FAST);
		const pair = await generateUserKeyPair();
		const sealed = await encryptPrivateKey(kek, pair.privateKey, 'u1');
		const back = await decryptPrivateKey(kek, sealed, 'u1');
		expect(toB64(back)).toBe(toB64(pair.privateKey));
	});

	it('échoue avec une mauvaise KEK', async () => {
		const good = await deriveKeys('bon', await newSalt(), FAST);
		const bad = await deriveKeys('mauvais', await newSalt(), FAST);
		const pair = await generateUserKeyPair();
		const sealed = await encryptPrivateKey(good.kek, pair.privateKey, 'u1');
		await expect(decryptPrivateKey(bad.kek, sealed, 'u1')).rejects.toThrow();
	});

	it('échoue si le blob est rattaché à un autre utilisateur', async () => {
		const { kek } = await deriveKeys('mdp', await newSalt(), FAST);
		const pair = await generateUserKeyPair();
		const sealed = await encryptPrivateKey(kek, pair.privateKey, 'u1');
		await expect(decryptPrivateKey(kek, sealed, 'u2')).rejects.toThrow();
	});
});

describe('partage d’un espace', () => {
	it('un membre récupère la clé qui lui a été enveloppée', async () => {
		const spaceKey = await generateSpaceKey();
		const bob = await generateUserKeyPair();
		const wrapped = await wrapSpaceKey(spaceKey, bob.publicKey);
		const back = await unwrapSpaceKey(wrapped, bob);
		expect(toB64(back)).toBe(toB64(spaceKey));
	});

	it('un non-membre ne peut pas ouvrir l’enveloppe', async () => {
		const spaceKey = await generateSpaceKey();
		const bob = await generateUserKeyPair();
		const eve = await generateUserKeyPair();
		const wrapped = await wrapSpaceKey(spaceKey, bob.publicKey);
		await expect(unwrapSpaceKey(wrapped, eve)).rejects.toThrow();
	});
});

describe('entrées', () => {
	const data = {
		title: 'Gmail',
		login: 'a@idixus.com',
		password: 'S3cret!',
		url: 'https://mail.google.com'
	};

	it('fait un aller-retour', async () => {
		const key = await generateSpaceKey();
		const sealed = await encryptEntry(key, data, ctx);
		expect(await decryptEntry(key, sealed, ctx)).toEqual(data);
	});

	it('ne laisse rien de lisible dans le blob chiffré', async () => {
		const key = await generateSpaceKey();
		const sealed = await encryptEntry(key, data, ctx);
		expect(JSON.stringify(sealed)).not.toContain('S3cret');
	});

	it('utilise un nonce différent à chaque chiffrement', async () => {
		const key = await generateSpaceKey();
		const a = await encryptEntry(key, data, ctx);
		const b = await encryptEntry(key, data, ctx);
		expect(a.nonce).not.toBe(b.nonce);
		expect(a.ciphertext).not.toBe(b.ciphertext);
	});

	it('refuse un blob déplacé vers une autre entrée ou une autre version de clé', async () => {
		const key = await generateSpaceKey();
		const sealed = await encryptEntry(key, data, ctx);
		await expect(decryptEntry(key, sealed, { ...ctx, entryId: 'e2' })).rejects.toThrow();
		await expect(decryptEntry(key, sealed, { ...ctx, keyVersion: 2 })).rejects.toThrow();
	});

	it('détecte une altération du chiffré', async () => {
		const key = await generateSpaceKey();
		const sealed = await encryptEntry(key, data, ctx);
		const flipped =
			sealed.ciphertext.slice(0, -2) + (sealed.ciphertext.endsWith('AA') ? 'BB' : 'AA');
		await expect(decryptEntry(key, { ...sealed, ciphertext: flipped }, ctx)).rejects.toThrow();
	});
});

describe('générateur de mots de passe', () => {
	it('respecte la longueur et inclut chaque jeu activé', async () => {
		for (let i = 0; i < 50; i++) {
			const pw = await generatePassword({
				length: 12,
				lower: true,
				upper: true,
				digits: true,
				symbols: true
			});
			expect(pw).toHaveLength(12);
			expect(pw).toMatch(/[a-z]/);
			expect(pw).toMatch(/[A-Z]/);
			expect(pw).toMatch(/\d/);
			expect(pw).toMatch(/[^A-Za-z0-9]/);
		}
	});

	it('n’utilise que les jeux demandés', async () => {
		const pw = await generatePassword({
			length: 30,
			lower: false,
			upper: false,
			digits: true,
			symbols: false
		});
		expect(pw).toMatch(/^\d{30}$/);
	});

	it('refuse une configuration invalide', async () => {
		await expect(
			generatePassword({ length: 20, lower: false, upper: false, digits: false, symbols: false })
		).rejects.toThrow();
		await expect(
			generatePassword({ length: 2, lower: true, upper: true, digits: true, symbols: true })
		).rejects.toThrow();
	});

	it('ne produit pas deux fois la même valeur', async () => {
		const set = new Set(await Promise.all(Array.from({ length: 20 }, () => generatePassword())));
		expect(set.size).toBe(20);
	});
});

describe('force et réutilisation', () => {
	it('note faible un mot de passe courant et court', () => {
		const r = evaluateStrength('password1');
		expect(r.score).toBeLessThanOrEqual(1);
		expect(r.issues.length).toBeGreaterThan(0);
	});

	it('note fort un mot de passe généré', async () => {
		const r = evaluateStrength(await generatePassword());
		expect(r.score).toBeGreaterThanOrEqual(3);
	});

	it('repère les mots de passe réutilisés', () => {
		const groups = findReused([
			{ id: '1', password: 'abc' },
			{ id: '2', password: 'xyz' },
			{ id: '3', password: 'abc' }
		]);
		expect(groups).toEqual([['1', '3']]);
	});
});
