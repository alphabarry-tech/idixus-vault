import {
	decryptEntry,
	decryptPrivateKey,
	defaultKdfParams,
	deriveKeys,
	encryptEntry,
	encryptPrivateKey,
	fromB64,
	generateSpaceKey,
	generateUserKeyPair,
	initCrypto,
	newSalt,
	toB64,
	unwrapSpaceKey,
	wipe,
	wrapSpaceKey,
	type KdfParams,
	type Sealed,
	type UserKeyPair
} from '../crypto/index';
import {
	decryptPrivateKeyWithRecovery,
	encryptPrivateKeyForRecovery,
	formatRecoveryKey,
	generateRecoveryKey,
	parseRecoveryKey
} from '../crypto/recovery';
import { evaluateStrength } from '../crypto/password';
import { api } from './api';

/**
 * Tout le protocole côté navigateur. Aucun mot de passe maître ni clé ne part vers le serveur :
 * il reçoit uniquement `authKey` (dérivée) et des blobs chiffrés.
 * Ce module ne dépend d'aucun framework : les tests de bout en bout l'utilisent tel quel.
 */

export type MeUser = {
	id: string;
	email: string;
	name: string;
	appRole: 'admin' | 'member';
	publicKey: string;
	encPrivateKey: Sealed;
	kdfSalt: string;
	kdfParams: KdfParams;
};

export type SpaceInfo = {
	id: string;
	name: string;
	kind: 'personal' | 'shared';
	keyVersion: number;
	needsRotation: boolean;
	role: 'admin' | 'member';
	wrappedSpaceKey: string;
	memberKeyVersion: number;
};

export type Member = {
	userId: string;
	name: string;
	email: string;
	publicKey: string;
	role: 'admin' | 'member';
};

export type EntryData = {
	title: string;
	username: string;
	password: string;
	url: string;
	notes: string;
};

export type Entry = {
	id: string;
	data: EntryData;
	keyVersion: number;
	updatedAt: string;
};

type RawEntry = {
	id: string;
	nonce: string;
	ciphertext: string;
	keyVersion: number;
	updatedAt: string;
};

/** Clés dérivées conservées en mémoire le temps de la validation du code OTP. */
export type Pending = { kek: Uint8Array };

export type Unlocked = {
	user: MeUser;
	keys: UserKeyPair;
	spaces: SpaceInfo[];
};

export const MIN_PASSWORD_LENGTH = 12;

export function checkMasterPassword(pw: string): string | null {
	if (pw.length < MIN_PASSWORD_LENGTH) {
		return `Le mot de passe maître doit faire au moins ${MIN_PASSWORD_LENGTH} caractères`;
	}
	if (evaluateStrength(pw).score < 2)
		return 'Mot de passe trop faible : allongez-le ou variez les caractères';
	return null;
}

// ─── Inscription ────────────────────────────────────────────────────────────

export async function checkInvitation(token: string) {
	return api<{ email: string }>('GET', `/api/invite/${encodeURIComponent(token)}`);
}

/** Crée le compte. Retourne la clé de récupération, à afficher une seule fois. */
export async function register(token: string, name: string, password: string) {
	await initCrypto();
	const userId = crypto.randomUUID();
	const kdfSalt = await newSalt();
	const kdfParams = await defaultKdfParams();
	const { authKey, kek } = await deriveKeys(password, kdfSalt, kdfParams);

	const pair = await generateUserKeyPair();
	const recoveryKey = await generateRecoveryKey();
	const spaceKey = await generateSpaceKey();

	await api('POST', `/api/invite/${encodeURIComponent(token)}/register`, {
		userId,
		name,
		authKey: toB64(authKey),
		kdfSalt: toB64(kdfSalt),
		kdfParams,
		publicKey: toB64(pair.publicKey),
		encPrivateKey: await encryptPrivateKey(kek, pair.privateKey, userId),
		encPrivateKeyRecovery: await encryptPrivateKeyForRecovery(recoveryKey, pair.privateKey, userId),
		personalSpace: { wrappedSpaceKey: await wrapSpaceKey(spaceKey, pair.publicKey) }
	});

	const formatted = formatRecoveryKey(recoveryKey);
	wipe(authKey, pair.privateKey, spaceKey, recoveryKey);
	return { recoveryKey: formatted, pending: { kek } satisfies Pending };
}

// ─── Connexion ──────────────────────────────────────────────────────────────

/** Étape 1 : prouve la connaissance du mot de passe (sans l'envoyer) ; le serveur envoie le code par email. */
export async function login(email: string, password: string): Promise<Pending> {
	await initCrypto();
	const { kdfSalt, kdfParams } = await api<{ kdfSalt: string; kdfParams: KdfParams }>(
		'POST',
		'/api/auth/prelogin',
		{ email }
	);
	const { authKey, kek } = await deriveKeys(password, fromB64(kdfSalt), kdfParams);
	await api('POST', '/api/auth/login', { email, authKey: toB64(authKey) });
	wipe(authKey);
	return { kek };
}

export function verifyOtp(code: string) {
	return api('POST', '/api/otp/verify', { code });
}

export function resendOtp() {
	return api('POST', '/api/otp/resend', {});
}

/** Étape 3 : après le code OTP, récupère le profil et déchiffre la clé privée. */
export async function openVault(pending: Pending): Promise<Unlocked> {
	const me = await api<{ user: MeUser; spaces: SpaceInfo[] }>('GET', '/api/me');
	const privateKey = await decryptPrivateKey(pending.kek, me.user.encPrivateKey, me.user.id);
	wipe(pending.kek);
	return {
		user: me.user,
		keys: { publicKey: fromB64(me.user.publicKey), privateKey },
		spaces: me.spaces
	};
}

/** Réouverture après verrouillage : la session serveur est encore valide, seul le mot de passe est redemandé. */
export async function unlock(password: string): Promise<Unlocked> {
	await initCrypto();
	const me = await api<{ user: MeUser; spaces: SpaceInfo[] }>('GET', '/api/me');
	const { authKey, kek } = await deriveKeys(password, fromB64(me.user.kdfSalt), me.user.kdfParams);
	wipe(authKey);
	let privateKey: Uint8Array;
	try {
		privateKey = await decryptPrivateKey(kek, me.user.encPrivateKey, me.user.id);
	} catch {
		throw new Error('Mot de passe maître incorrect');
	}
	wipe(kek);
	return {
		user: me.user,
		keys: { publicKey: fromB64(me.user.publicKey), privateKey },
		spaces: me.spaces
	};
}

export function logout() {
	return api('POST', '/api/auth/logout', {});
}

export async function refreshSpaces(): Promise<SpaceInfo[]> {
	return (await api<{ spaces: SpaceInfo[] }>('GET', '/api/me')).spaces;
}

// ─── Entrées ────────────────────────────────────────────────────────────────

export async function getSpaceKey(space: SpaceInfo, keys: UserKeyPair): Promise<Uint8Array> {
	if (space.memberKeyVersion !== space.keyVersion) {
		throw new Error('Clé de l’espace en cours de renouvellement, réessayez dans un instant');
	}
	return unwrapSpaceKey(space.wrappedSpaceKey, keys);
}

export async function listEntries(space: SpaceInfo, spaceKey: Uint8Array): Promise<Entry[]> {
	const { entries } = await api<{ entries: RawEntry[] }>('GET', `/api/spaces/${space.id}/entries`);
	const out: Entry[] = [];
	for (const e of entries) {
		try {
			const data = await decryptEntry<EntryData>(spaceKey, e, {
				spaceId: space.id,
				entryId: e.id,
				keyVersion: e.keyVersion
			});
			out.push({ id: e.id, data, keyVersion: e.keyVersion, updatedAt: e.updatedAt });
		} catch {
			// Entrée illisible (corrompue ou altérée) : on l'ignore plutôt que de bloquer tout l'espace
			console.warn('Entrée illisible ignorée', e.id);
		}
	}
	return out;
}

export async function createEntry(space: SpaceInfo, spaceKey: Uint8Array, data: EntryData) {
	const id = crypto.randomUUID();
	const sealed = await encryptEntry(spaceKey, data, {
		spaceId: space.id,
		entryId: id,
		keyVersion: space.keyVersion
	});
	await api('POST', `/api/spaces/${space.id}/entries`, {
		id,
		...sealed,
		keyVersion: space.keyVersion
	});
	return id;
}

export async function updateEntry(
	space: SpaceInfo,
	spaceKey: Uint8Array,
	id: string,
	data: EntryData
) {
	const sealed = await encryptEntry(spaceKey, data, {
		spaceId: space.id,
		entryId: id,
		keyVersion: space.keyVersion
	});
	await api('PUT', `/api/spaces/${space.id}/entries/${id}`, {
		...sealed,
		keyVersion: space.keyVersion
	});
}

export function deleteEntry(space: SpaceInfo, id: string) {
	return api('DELETE', `/api/spaces/${space.id}/entries/${id}`);
}

// ─── Espaces partagés ───────────────────────────────────────────────────────

export async function createSpace(name: string, keys: UserKeyPair): Promise<string> {
	const spaceKey = await generateSpaceKey();
	const { id } = await api<{ id: string }>('POST', '/api/spaces', {
		name,
		wrappedSpaceKey: await wrapSpaceKey(spaceKey, keys.publicKey)
	});
	wipe(spaceKey);
	return id;
}

export async function listMembers(space: SpaceInfo) {
	return (await api<{ members: Member[] }>('GET', `/api/spaces/${space.id}/members`)).members;
}

export async function addMember(
	space: SpaceInfo,
	spaceKey: Uint8Array,
	email: string,
	role: 'admin' | 'member'
) {
	const target = await api<{ id: string; publicKey: string }>(
		'GET',
		`/api/users/lookup?email=${encodeURIComponent(email)}`
	);
	await api('POST', `/api/spaces/${space.id}/members`, {
		userId: target.id,
		role,
		keyVersion: space.keyVersion,
		wrappedSpaceKey: await wrapSpaceKey(spaceKey, fromB64(target.publicKey))
	});
}

/**
 * Renouvelle la clé de l'espace : nouvelle clé, entrées ré-chiffrées, clé ré-enveloppée pour chaque
 * membre restant. À faire après le départ d'un membre. Retourne la nouvelle clé d'espace.
 */
export async function rotateSpace(space: SpaceInfo, oldKey: Uint8Array): Promise<Uint8Array> {
	const [members, entries] = await Promise.all([listMembers(space), listEntries(space, oldKey)]);
	const rawCount = (await api<{ entries: RawEntry[] }>('GET', `/api/spaces/${space.id}/entries`))
		.entries.length;
	if (entries.length !== rawCount) {
		throw new Error(
			'Une entrée illisible empêche la rotation de la clé. Contactez un administrateur.'
		);
	}

	const newKey = await generateSpaceKey();
	const version = space.keyVersion + 1;
	const newEntries = await Promise.all(
		entries.map(async (e) => ({
			id: e.id,
			...(await encryptEntry(newKey, e.data, {
				spaceId: space.id,
				entryId: e.id,
				keyVersion: version
			}))
		}))
	);
	const wrapped = await Promise.all(
		members.map(async (m) => ({
			userId: m.userId,
			wrappedSpaceKey: await wrapSpaceKey(newKey, fromB64(m.publicKey))
		}))
	);
	await api('POST', `/api/spaces/${space.id}/rotate`, {
		expectedVersion: space.keyVersion,
		members: wrapped,
		entries: newEntries
	});
	return newKey;
}

export function removeMember(space: SpaceInfo, userId: string) {
	return api('DELETE', `/api/spaces/${space.id}/members/${userId}`);
}

export function setMemberRole(space: SpaceInfo, userId: string, role: 'admin' | 'member') {
	return api('PATCH', `/api/spaces/${space.id}/members/${userId}`, { role });
}

export function renameSpace(space: SpaceInfo, name: string) {
	return api('PATCH', `/api/spaces/${space.id}`, { name });
}

export function deleteSpace(space: SpaceInfo) {
	return api('DELETE', `/api/spaces/${space.id}`);
}

// ─── Compte ─────────────────────────────────────────────────────────────────

export async function changePassword(
	user: MeUser,
	keys: UserKeyPair,
	current: string,
	next: string
) {
	await initCrypto();
	const cur = await deriveKeys(current, fromB64(user.kdfSalt), user.kdfParams);
	const kdfSalt = await newSalt();
	const kdfParams = await defaultKdfParams();
	const fresh = await deriveKeys(next, kdfSalt, kdfParams);
	await api('POST', '/api/account/password', {
		currentAuthKey: toB64(cur.authKey),
		authKey: toB64(fresh.authKey),
		kdfSalt: toB64(kdfSalt),
		kdfParams,
		encPrivateKey: await encryptPrivateKey(fresh.kek, keys.privateKey, user.id)
	});
	wipe(cur.authKey, cur.kek, fresh.authKey, fresh.kek);
}

/** Génère une nouvelle clé de récupération (l'ancienne cesse de fonctionner). À afficher une seule fois. */
export async function regenerateRecoveryKey(
	user: MeUser,
	keys: UserKeyPair,
	password: string
): Promise<string> {
	await initCrypto();
	const { authKey, kek } = await deriveKeys(password, fromB64(user.kdfSalt), user.kdfParams);
	const recoveryKey = await generateRecoveryKey();
	await api('POST', '/api/account/recovery', {
		currentAuthKey: toB64(authKey),
		encPrivateKeyRecovery: await encryptPrivateKeyForRecovery(recoveryKey, keys.privateKey, user.id)
	});
	const formatted = formatRecoveryKey(recoveryKey);
	wipe(authKey, kek, recoveryKey);
	return formatted;
}

// ─── Récupération de compte ─────────────────────────────────────────────────

export function startRecovery(email: string) {
	return api('POST', '/api/recover/start', { email });
}

export type RecoveryStep = { userId: string; recoveryToken: string; privateKey: Uint8Array };

/** Vérifie le code email puis déchiffre la clé privée avec la clé de récupération saisie. */
export async function verifyRecovery(
	email: string,
	code: string,
	recoveryKeyText: string
): Promise<RecoveryStep> {
	const recoveryKey = parseRecoveryKey(recoveryKeyText);
	const res = await api<{ userId: string; recoveryToken: string; encPrivateKeyRecovery: Sealed }>(
		'POST',
		'/api/recover/verify',
		{ email, code }
	);
	let privateKey: Uint8Array;
	try {
		privateKey = await decryptPrivateKeyWithRecovery(
			recoveryKey,
			res.encPrivateKeyRecovery,
			res.userId
		);
	} catch {
		throw new Error('Clé de récupération incorrecte');
	}
	return { userId: res.userId, recoveryToken: res.recoveryToken, privateKey };
}

/** Définit un nouveau mot de passe maître. Retourne la nouvelle clé de récupération (l'ancienne reste valide mais à remplacer). */
export async function finishRecovery(step: RecoveryStep, newPassword: string) {
	await initCrypto();
	const kdfSalt = await newSalt();
	const kdfParams = await defaultKdfParams();
	const { authKey, kek } = await deriveKeys(newPassword, kdfSalt, kdfParams);
	const recoveryKey = await generateRecoveryKey();
	await api('POST', '/api/recover/finish', {
		recoveryToken: step.recoveryToken,
		authKey: toB64(authKey),
		kdfSalt: toB64(kdfSalt),
		kdfParams,
		encPrivateKey: await encryptPrivateKey(kek, step.privateKey, step.userId),
		encPrivateKeyRecovery: await encryptPrivateKeyForRecovery(
			recoveryKey,
			step.privateKey,
			step.userId
		)
	});
	const formatted = formatRecoveryKey(recoveryKey);
	wipe(authKey, kek, step.privateKey, recoveryKey);
	return formatted;
}
