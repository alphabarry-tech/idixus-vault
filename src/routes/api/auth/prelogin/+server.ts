import { eq } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { users } from '#lib/server/db/schema.ts';
import { limit } from '#lib/server/ratelimit.ts';
import { hmac } from '#lib/server/security.ts';
import { email as parseEmail, readBody } from '#lib/server/validate.ts';
import { defaultKdfParams, toB64 } from '#lib/crypto/index.ts';
import type { RequestHandler } from './$types';

/**
 * Renvoie le sel et les paramètres Argon2id nécessaires pour dériver les clés dans le navigateur.
 * Pour un email inconnu on renvoie un sel déterministe factice : impossible de savoir qui a un compte.
 */
export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	limit(`prelogin:${getClientAddress()}`, 30, 60_000);
	const email = parseEmail((await readBody(request)).email);

	const [user] = await db
		.select({ kdfSalt: users.kdfSalt, kdfParams: users.kdfParams })
		.from(users)
		.where(eq(users.email, email))
		.limit(1);
	if (user) return Response.json(user);

	return Response.json({
		kdfSalt: toB64(hmac('fake-salt', email).subarray(0, 16)),
		kdfParams: await defaultKdfParams()
	});
};
