import sodium from 'libsodium-wrappers-sumo';

/**
 * Le client n'envoie jamais le mot de passe maître, seulement `authKey` (dérivée par Argon2id).
 * Le serveur la re-hache : une fuite de la base ne permet pas de se connecter.
 */

export async function hashAuthKey(authKey: string): Promise<string> {
	await sodium.ready;
	return sodium.crypto_pwhash_str(
		authKey,
		sodium.crypto_pwhash_OPSLIMIT_INTERACTIVE,
		sodium.crypto_pwhash_MEMLIMIT_INTERACTIVE
	);
}

export async function verifyAuthKey(hash: string, authKey: string): Promise<boolean> {
	await sodium.ready;
	try {
		return sodium.crypto_pwhash_str_verify(hash, authKey);
	} catch {
		return false;
	}
}

let dummy: Promise<string> | undefined;

/** Fait le même travail pour un compte inexistant, afin de ne pas révéler quels emails existent. */
export async function fakeVerify(authKey: string): Promise<false> {
	dummy ??= hashAuthKey('dummy');
	await verifyAuthKey(await dummy, authKey);
	return false;
}
