import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { users } from '#lib/server/db/schema.ts';
import { hashAuthKey } from '#lib/server/authkey.ts';
import { limit } from '#lib/server/ratelimit.ts';
import { sha256, verifyToken } from '#lib/server/security.ts';
import { destroyUserSessions } from '#lib/server/session.ts';
import { b64, kdfParams, readBody, sealed, str } from '#lib/server/validate.ts';
import type { RequestHandler } from './$types';

/**
 * Récupération de compte, étape 3 : nouveau mot de passe maître. La paire de clés ne change pas
 * (le client a déchiffré la clé privée avec la clé de récupération), donc les espaces restent accessibles.
 */
export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	limit(`recover-finish:${getClientAddress()}`, 10, 3_600_000);
	const body = await readBody(request);
	const token = verifyToken<{ uid: string; ver: string }>(str(body.recoveryToken, 'jeton', 500));
	if (!token) error(400, 'Étape expirée, recommencez la récupération.');

	const authKey = b64(body.authKey, 'authKey', 100, 20);
	const kdfSalt = b64(body.kdfSalt, 'kdfSalt', 64, 16);
	const params = kdfParams(body.kdfParams);
	const encPrivateKey = sealed(body.encPrivateKey, 'encPrivateKey', 1000);
	const encPrivateKeyRecovery = sealed(body.encPrivateKeyRecovery, 'encPrivateKeyRecovery', 1000);

	const [user] = await db.select().from(users).where(eq(users.id, token.uid)).limit(1);
	if (!user || sha256(user.authHash).slice(0, 16) !== token.ver) {
		error(400, 'Étape expirée, recommencez la récupération.');
	}

	await db
		.update(users)
		.set({
			authHash: await hashAuthKey(authKey),
			kdfSalt,
			kdfParams: params,
			encPrivateKey,
			encPrivateKeyRecovery
		})
		.where(eq(users.id, user.id));
	await destroyUserSessions(user.id);
	return Response.json({ ok: true });
};
