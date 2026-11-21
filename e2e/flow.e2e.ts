import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import postgres from 'postgres';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { setFetch, api } from '../src/lib/client/api';
import * as p from '../src/lib/client/protocol';
import { decryptEntry, fromB64, generateSpaceKey } from '../src/lib/crypto/index';

const BASE = process.env.E2E_BASE_URL!;
const DB_URL = process.env.E2E_DATABASE_URL!;
const ORIGIN = new URL(BASE).origin;

/** Client HTTP avec son propre jar de cookies, comme un navigateur. */
function makeClient(origin: string | null = ORIGIN) {
	const jar = new Map<string, string>();
	const f = async (path: string, init: RequestInit = {}) => {
		const headers = new Headers(init.headers);
		if (origin) headers.set('origin', origin);
		if (jar.size) headers.set('cookie', [...jar].map(([k, v]) => `${k}=${v}`).join('; '));
		const res = await fetch(BASE + path, { ...init, headers });
		for (const c of res.headers.getSetCookie()) {
			const [pair, ...attrs] = c.split(';');
			const [k, ...v] = pair.split('=');
			if (/max-age=0|expires=thu, 01 jan 1970/i.test(attrs.join(';')) || v.join('=') === '')
				jar.delete(k);
			else jar.set(k, v.join('='));
		}
		return res;
	};
	return { f, jar };
}
type Client = ReturnType<typeof makeClient>;
const as = <T>(c: Client, fn: () => Promise<T>) => {
	setFetch(c.f);
	return fn();
};
const fails = async (fn: () => Promise<unknown>, status?: number) => {
	try {
		await fn();
	} catch (e) {
		if (status) expect((e as { status?: number }).status).toBe(status);
		return e as Error;
	}
	throw new Error('Une erreur était attendue');
};

const sql = postgres(DB_URL);
const started = Date.now();

function mails(to: string) {
	if (!existsSync('.dev-mail.log')) return [];
	return readFileSync('.dev-mail.log', 'utf8')
		.trim()
		.split('\n')
		.map((l) => JSON.parse(l) as { at: string; to: string; subject: string; text: string })
		.filter((m) => m.to === to && new Date(m.at).getTime() >= started - 1000);
}
const lastOtp = (to: string) => {
	const m = mails(to)
		.filter((x) => /code Idixus/.test(x.subject))
		.at(-1);
	return m!.subject.match(/(\d{6})/)![1];
};
const inviteToken = (to: string) =>
	mails(to)
		.filter((x) => /Invitation/.test(x.subject))
		.at(-1)!
		.text.match(/\/invite\/(\S+)/)![1];
/** Les envois de code sont espacés de 45 s côté serveur : on antidate pour enchaîner les scénarios. */
const skipCooldown = () => sql`update otp_codes set created_at = created_at - interval '2 minutes'`;

const PW = 'Correct-Horse-Battery-42';
const alice = makeClient();
const bob = makeClient();
let aliceVault: p.Unlocked;
let bobVault: p.Unlocked;
let aliceRecovery = '';

beforeAll(async () => {
	if (!/_e2e$/.test(new URL(DB_URL).pathname))
		throw new Error('E2E: refus de vider une base non _e2e');
	await sql`truncate users, invitations, otp_codes, sessions, spaces, space_members, entries cascade`;
});
afterAll(() => sql.end());

describe('inscription et double authentification', () => {
	it('crée le premier admin par invitation, sans mot de passe dans le terminal', async () => {
		const out = execFileSync('node', ['scripts/create-admin.mjs', 'alice@idixus.com', '--force'], {
			env: { ...process.env, DATABASE_URL: DB_URL, APP_URL: BASE },
			encoding: 'utf8'
		});
		const token = out.match(/\/invite\/(\S+)/)![1];

		expect((await as(alice, () => p.checkInvitation(token))).email).toBe('alice@idixus.com');
		expect(p.checkMasterPassword('court')).toBeTruthy();
		expect(p.checkMasterPassword(PW)).toBeNull();

		const { recoveryKey, pending } = await as(alice, () => p.register(token, 'Alice', PW));
		aliceRecovery = recoveryKey;
		expect(recoveryKey).toMatch(/^([0-9A-Z]{4}-){12}[0-9A-Z]{4}$/);

		// Avant le code, la session ne donne accès à rien
		await fails(() => as(alice, () => api('GET', '/api/me')), 401);
		await fails(() => as(alice, () => p.verifyOtp('000000')), 400);
		await as(alice, () => p.verifyOtp(lastOtp('alice@idixus.com')));
		aliceVault = await as(alice, () => p.openVault(pending));

		expect(aliceVault.user.appRole).toBe('admin');
		expect(aliceVault.spaces).toHaveLength(1);
		expect(aliceVault.spaces[0].kind).toBe('personal');
	});

	it("le lien d'invitation est à usage unique", async () => {
		const [{ token_hash }] = await sql`select token_hash from invitations limit 1`;
		expect(token_hash).toBeTruthy();
		const used = await sql`select used_at from invitations where email = 'alice@idixus.com'`;
		expect(used[0].used_at).not.toBeNull();
	});

	it('le serveur ne stocke aucun secret lisible', async () => {
		const [u] = await sql`select * from users where email = 'alice@idixus.com'`;
		const dump = JSON.stringify(u);
		expect(dump).not.toContain(PW);
		expect(u.auth_hash).toMatch(/^\$argon2id\$/);
	});
});

describe('coffre personnel', () => {
	const data = {
		title: 'Gmail',
		username: 'alice@idixus.com',
		password: 'S3cret!xyz',
		url: 'https://mail.google.com',
		notes: 'n'
	};
	it('crée, lit, modifie et supprime une entrée chiffrée', async () => {
		const space = aliceVault.spaces[0];
		const key = await p.getSpaceKey(space, aliceVault.keys);
		await as(alice, async () => {
			const id = await p.createEntry(space, key, data);
			let list = await p.listEntries(space, key);
			expect(list).toHaveLength(1);
			expect(list[0].data).toEqual(data);

			await p.updateEntry(space, key, id, { ...data, password: 'N3w-pass!' });
			list = await p.listEntries(space, key);
			expect(list[0].data.password).toBe('N3w-pass!');

			// Rien de lisible côté base
			const raw = await sql`select nonce, ciphertext from entries`;
			expect(JSON.stringify(raw)).not.toContain('N3w-pass');

			await p.deleteEntry(space, id);
			expect(await p.listEntries(space, key)).toHaveLength(0);
		});
	});

	it('refuse une écriture avec une mauvaise version de clé', async () => {
		const space = aliceVault.spaces[0];
		const key = await p.getSpaceKey(space, aliceVault.keys);
		await fails(() => as(alice, () => p.createEntry({ ...space, keyVersion: 9 }, key, data)), 409);
	});
});

describe('connexion', () => {
	it('refuse un mauvais mot de passe sans révéler si le compte existe', async () => {
		const wrong = await fails(
			() => as(alice, () => p.login('alice@idixus.com', 'Mauvais-mot-de-passe-1')),
			401
		);
		const unknown = await fails(
			() => as(alice, () => p.login('inconnu@idixus.com', 'Mauvais-mot-de-passe-1')),
			401
		);
		expect(wrong.message).toBe(unknown.message);
	});

	it('exige le code email, et le code est à usage unique', async () => {
		const c = makeClient();
		const pending = await as(c, () => p.login('alice@idixus.com', PW));
		await fails(() => as(c, () => api('GET', '/api/me')), 401);
		const code = lastOtp('alice@idixus.com');
		await as(c, () => p.verifyOtp(code));
		const v = await as(c, () => p.openVault(pending));
		expect(v.user.email).toBe('alice@idixus.com');
		// Un code ne sert qu'une fois
		await as(c, () => p.logout());
		await skipCooldown();
		await as(c, () => p.login('alice@idixus.com', PW));
		await fails(() => as(c, () => p.verifyOtp(code)), 400);
	});

	it('bloque après 5 essais de code, même avec le bon code ensuite', async () => {
		await skipCooldown();
		const c = makeClient();
		await as(c, () => p.login('alice@idixus.com', PW));
		const good = lastOtp('alice@idixus.com');
		const wrong = good === '111111' ? '222222' : '111111';
		for (let i = 0; i < 5; i++) await fails(() => as(c, () => p.verifyOtp(wrong)), 400);
		const e = await fails(() => as(c, () => p.verifyOtp(good)), 400);
		expect(e.message).toMatch(/essais|expiré/i);
		await fails(() => as(c, () => api('GET', '/api/me')), 401);
	});

	it('rejette une écriture sans en-tête Origin (CSRF)', async () => {
		const c = makeClient(null);
		await fails(
			() => as(c, () => api('POST', '/api/auth/prelogin', { email: 'alice@idixus.com' })),
			403
		);
	});
});

describe('administration et partage', () => {
	it("n'invite que les adresses du domaine autorisé", async () => {
		await fails(
			() => as(alice, () => api('POST', '/api/admin/invitations', { email: 'x@gmail.com' })),
			400
		);
	});

	it('un admin invite un collaborateur par email ; il finalise avec son code', async () => {
		await as(alice, () =>
			api('POST', '/api/admin/invitations', { email: 'bob@idixus.com', role: 'member' })
		);
		const token = inviteToken('bob@idixus.com');
		const { pending } = await as(bob, () => p.register(token, 'Bob', PW));
		await as(bob, () => p.verifyOtp(lastOtp('bob@idixus.com')));
		bobVault = await as(bob, () => p.openVault(pending));
		expect(bobVault.user.appRole).toBe('member');
		await fails(() => as(bob, () => api('GET', '/api/admin/users')), 403);
	});

	it('partage un espace : le membre lit les entrées, un tiers ne voit rien', async () => {
		let space: p.SpaceInfo;
		let key: Uint8Array;
		await as(alice, async () => {
			const id = await p.createSpace('Équipe', aliceVault.keys);
			aliceVault.spaces = await p.refreshSpaces();
			space = aliceVault.spaces.find((s) => s.id === id)!;
			key = await p.getSpaceKey(space, aliceVault.keys);
			await p.createEntry(space, key, {
				title: 'AWS',
				username: 'root',
				password: 'aws-secret',
				url: '',
				notes: ''
			});
			await p.addMember(space, key, 'bob@idixus.com', 'member');
		});

		await as(bob, async () => {
			bobVault.spaces = await p.refreshSpaces();
			const shared = bobVault.spaces.find((s) => s.id === space.id)!;
			const bobKey = await p.getSpaceKey(shared, bobVault.keys);
			const list = await p.listEntries(shared, bobKey);
			expect(list.map((e) => e.data.password)).toEqual(['aws-secret']);

			// Bob ne peut pas administrer l'espace ni lire le coffre personnel d'Alice
			await fails(() => p.addMember(shared, bobKey, 'alice@idixus.com', 'member'), 403);
			await fails(() => api('GET', `/api/spaces/${aliceVault.spaces[0].id}/entries`), 404);
		});
		await as(alice, async () => {
			await fails(() => api('GET', `/api/spaces/${bobVault.spaces[0].id}/entries`), 404);
		});
	});

	it("retirer un membre renouvelle la clé : l'ancienne clé ne déchiffre plus rien", async () => {
		const shared = aliceVault.spaces.find((s) => s.name === 'Équipe')!;
		const oldKey = await p.getSpaceKey(shared, aliceVault.keys);

		await as(alice, async () => {
			await p.removeMember(shared, bobVault.user.id);
			const [flagged] = (await p.refreshSpaces()).filter((s) => s.id === shared.id);
			expect(flagged.needsRotation).toBe(true);
			await p.rotateSpace(flagged, oldKey);
			aliceVault.spaces = await p.refreshSpaces();
		});
		const after = aliceVault.spaces.find((s) => s.id === shared.id)!;
		expect(after.keyVersion).toBe(2);
		expect(after.needsRotation).toBe(false);

		// Alice relit tout avec la nouvelle clé
		const newKey = await p.getSpaceKey(after, aliceVault.keys);
		const list = await as(alice, () => p.listEntries(after, newKey));
		expect(list[0].data.password).toBe('aws-secret');

		// Bob est dehors, et l'ancienne clé qu'il possédait est inutile
		await fails(() => as(bob, () => api('GET', `/api/spaces/${shared.id}/entries`)), 404);
		const [raw] =
			await sql`select id, nonce, ciphertext, key_version from entries where space_id = ${shared.id}`;
		await expect(
			decryptEntry(
				oldKey,
				{ nonce: raw.nonce, ciphertext: raw.ciphertext },
				{ spaceId: shared.id, entryId: raw.id, keyVersion: 2 }
			)
		).rejects.toThrow();
		await expect(
			decryptEntry(
				oldKey,
				{ nonce: raw.nonce, ciphertext: raw.ciphertext },
				{ spaceId: shared.id, entryId: raw.id, keyVersion: 1 }
			)
		).rejects.toThrow();
		expect(raw.key_version).toBe(2);
	});

	it('refuse une rotation incomplète (entrée oubliée)', async () => {
		const shared = aliceVault.spaces.find((s) => s.name === 'Équipe')!;
		const members = await as(alice, () => p.listMembers(shared));
		const k = await generateSpaceKey();
		await fails(
			() =>
				as(alice, () =>
					api('POST', `/api/spaces/${shared.id}/rotate`, {
						expectedVersion: shared.keyVersion,
						members: members.map((m) => ({ userId: m.userId, wrappedSpaceKey: 'A'.repeat(107) })),
						entries: []
					})
				),
			409
		);
		expect(k).toBeTruthy();
	});

	it('désactiver un compte coupe ses sessions et empêche la connexion', async () => {
		await as(alice, () =>
			api('POST', `/api/admin/users/${bobVault.user.id}/disable`, { disabled: true })
		);
		await fails(() => as(bob, () => api('GET', '/api/me')), 401);
		await skipCooldown();
		await fails(() => as(makeClient(), () => p.login('bob@idixus.com', PW)), 401);
	});
});

describe('compte', () => {
	it('change le mot de passe maître sans perdre le coffre', async () => {
		const personal = aliceVault.spaces[0];
		const key = await p.getSpaceKey(personal, aliceVault.keys);
		await as(alice, () =>
			p.createEntry(personal, key, {
				title: 'Garde-moi',
				username: '',
				password: 'pw',
				url: '',
				notes: ''
			})
		);

		const NEW = 'Nouveau-Mot-De-Passe-77!';
		await as(alice, () => p.changePassword(aliceVault.user, aliceVault.keys, PW, NEW));
		await fails(() => as(makeClient(), () => p.login('alice@idixus.com', PW)), 401);
		await skipCooldown();

		const c = makeClient();
		const pending = await as(c, () => p.login('alice@idixus.com', NEW));
		await as(c, () => p.verifyOtp(lastOtp('alice@idixus.com')));
		const v = await as(c, () => p.openVault(pending));
		const k = await p.getSpaceKey(
			v.spaces.find((s) => s.kind === 'personal')!,
			v.keys
		);
		const list = await as(c, () =>
			p.listEntries(
				v.spaces.find((s) => s.kind === 'personal')!,
				k
			)
		);
		expect(list.map((e) => e.data.title)).toContain('Garde-moi');
		aliceVault = v;
	});

	it('récupère un compte avec le code email + la clé de récupération', async () => {
		const c = makeClient();
		await skipCooldown();
		await as(c, () => p.startRecovery('alice@idixus.com'));
		const code = lastOtp('alice@idixus.com');

		// Mauvaise clé de récupération : refusée
		await fails(() => as(c, () => p.verifyRecovery('alice@idixus.com', code, 'AAAA-BBBB')));
		await skipCooldown();
		await as(c, () => p.startRecovery('alice@idixus.com'));
		const code2 = lastOtp('alice@idixus.com');
		const step = await as(c, () => p.verifyRecovery('alice@idixus.com', code2, aliceRecovery));

		const RECOVERED = 'Mot-De-Passe-Retrouve-99!';
		const newRecovery = await as(c, () => p.finishRecovery(step, RECOVERED));
		expect(newRecovery).not.toBe(aliceRecovery);

		await skipCooldown();
		const c2 = makeClient();
		const pending = await as(c2, () => p.login('alice@idixus.com', RECOVERED));
		await as(c2, () => p.verifyOtp(lastOtp('alice@idixus.com')));
		const v = await as(c2, () => p.openVault(pending));
		const personal = v.spaces.find((s) => s.kind === 'personal')!;
		const list = await as(c2, async () =>
			p.listEntries(personal, await p.getSpaceKey(personal, v.keys))
		);
		expect(list.map((e) => e.data.title)).toContain('Garde-moi');
		expect(toBytes(v.keys.publicKey)).toEqual(toBytes(fromB64(aliceVault.user.publicKey)));
	});
});

const toBytes = (u: Uint8Array) => Array.from(u);
