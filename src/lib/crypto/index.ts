import sodium from 'libsodium-wrappers-sumo';

/**
 * Chiffrement côté client uniquement. Le serveur ne reçoit que des données opaques.
 * Aucune primitive maison : tout vient de libsodium.
 */

export type KdfParams = { opslimit: number; memlimit: number };

export type Sealed = { nonce: string; ciphertext: string };

export type UserKeyPair = { publicKey: Uint8Array; privateKey: Uint8Array };

const KDF_CTX_AUTH = 'idxauth_';
const KDF_CTX_KEK = 'idxkek__';

let ready: Promise<void> | undefined;

export function initCrypto(): Promise<void> {
	return (ready ??= sodium.ready);
}

/** Paramètres Argon2id par défaut (OWASP-compatibles : ~256 Mo, 3 passes). */
export async function defaultKdfParams(): Promise<KdfParams> {
	await initCrypto();
	return {
		opslimit: sodium.crypto_pwhash_OPSLIMIT_MODERATE,
		memlimit: sodium.crypto_pwhash_MEMLIMIT_MODERATE
	};
}

export async function newSalt(): Promise<Uint8Array> {
	await initCrypto();
	return sodium.randombytes_buf(sodium.crypto_pwhash_SALTBYTES);
}

/**
 * Dérive deux clés indépendantes du mot de passe maître :
 * - `authKey` : envoyée au serveur pour s'authentifier (le serveur la re-hache) ;
 * - `kek` : ne quitte jamais le navigateur, chiffre la clé privée.
 */
export async function deriveKeys(
	masterPassword: string,
	salt: Uint8Array,
	params: KdfParams
): Promise<{ authKey: Uint8Array; kek: Uint8Array }> {
	await initCrypto();
	const master = sodium.crypto_pwhash(
		32,
		masterPassword.normalize('NFKC'),
		salt,
		params.opslimit,
		params.memlimit,
		sodium.crypto_pwhash_ALG_ARGON2ID13
	);
	const authKey = sodium.crypto_kdf_derive_from_key(32, 1, KDF_CTX_AUTH, master);
	const kek = sodium.crypto_kdf_derive_from_key(32, 2, KDF_CTX_KEK, master);
	sodium.memzero(master);
	return { authKey, kek };
}

export async function generateUserKeyPair(): Promise<UserKeyPair> {
	await initCrypto();
	const { publicKey, privateKey } = sodium.crypto_box_keypair();
	return { publicKey, privateKey };
}

export async function generateSpaceKey(): Promise<Uint8Array> {
	await initCrypto();
	return sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_KEYBYTES);
}

/** Chiffre des octets avec XChaCha20-Poly1305. `aad` lie le chiffré à son contexte. */
export async function seal(key: Uint8Array, plaintext: Uint8Array, aad = ''): Promise<Sealed> {
	await initCrypto();
	const nonce = sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
	const ciphertext = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
		plaintext,
		aad,
		null,
		nonce,
		key
	);
	return { nonce: toB64(nonce), ciphertext: toB64(ciphertext) };
}

/** Lève une erreur si la clé, le contexte (`aad`) ou les données sont incorrects. */
export async function open(key: Uint8Array, sealed: Sealed, aad = ''): Promise<Uint8Array> {
	await initCrypto();
	return sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
		null,
		fromB64(sealed.ciphertext),
		aad,
		fromB64(sealed.nonce),
		key
	);
}

/** Clé privée utilisateur chiffrée par la KEK (stockée côté serveur). */
export function encryptPrivateKey(kek: Uint8Array, privateKey: Uint8Array, userId: string) {
	return seal(kek, privateKey, `user-key:${userId}`);
}

export function decryptPrivateKey(kek: Uint8Array, sealed: Sealed, userId: string) {
	return open(kek, sealed, `user-key:${userId}`);
}

/** Enveloppe la clé d'un espace pour un membre (sealed box, clé publique du membre). */
export async function wrapSpaceKey(spaceKey: Uint8Array, memberPublicKey: Uint8Array) {
	await initCrypto();
	return toB64(sodium.crypto_box_seal(spaceKey, memberPublicKey));
}

export async function unwrapSpaceKey(wrapped: string, keys: UserKeyPair) {
	await initCrypto();
	return sodium.crypto_box_seal_open(fromB64(wrapped), keys.publicKey, keys.privateKey);
}

/** Chiffre le contenu d'une entrée. L'AAD empêche de déplacer un blob vers une autre entrée/espace. */
export function encryptEntry(
	spaceKey: Uint8Array,
	data: unknown,
	ctx: { spaceId: string; entryId: string; keyVersion: number }
) {
	return seal(spaceKey, new TextEncoder().encode(JSON.stringify(data)), entryAad(ctx));
}

export async function decryptEntry<T = unknown>(
	spaceKey: Uint8Array,
	sealed: Sealed,
	ctx: { spaceId: string; entryId: string; keyVersion: number }
): Promise<T> {
	const bytes = await open(spaceKey, sealed, entryAad(ctx));
	return JSON.parse(new TextDecoder().decode(bytes)) as T;
}

function entryAad(c: { spaceId: string; entryId: string; keyVersion: number }) {
	return `entry:${c.spaceId}:${c.entryId}:${c.keyVersion}`;
}

export function toB64(bytes: Uint8Array): string {
	return sodium.to_base64(bytes, sodium.base64_variants.URLSAFE_NO_PADDING);
}

export function fromB64(s: string): Uint8Array {
	return sodium.from_base64(s, sodium.base64_variants.URLSAFE_NO_PADDING);
}

export function wipe(...buffers: Uint8Array[]) {
	for (const b of buffers) sodium.memzero(b);
}
