import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { users } from '#lib/server/db/schema.ts';
import { hashAuthKey, verifyAuthKey } from '#lib/server/authkey.ts';
import { requireUser } from '#lib/server/guard.ts';
import { limit } from '#lib/server/ratelimit.ts';
import { destroyUserSessions } from '#lib/server/session.ts';
import { b64, kdfParams, readBody, sealed } from '#lib/server/validate.ts';
import type { RequestHandler } from './$types';

/** Changement du mot de passe maître. Le client re-chiffre la clé privée avec la nouvelle KEK. */
export const POST: RequestHandler = async ({ request, locals }) => {
	const me = requireUser(locals);
	limit(`change-password:${me.id}`, 5, 600_000);
	const body = await readBody(request);
	const currentAuthKey = b64(body.currentAuthKey, 'currentAuthKey', 100, 20);
	const authKey = b64(body.authKey, 'authKey', 100, 20);
	const kdfSalt = b64(body.kdfSalt, 'kdfSalt', 64, 16);
	const params = kdfParams(body.kdfParams);
	const encPrivateKey = sealed(body.encPrivateKey, 'encPrivateKey', 1000);

	const [user] = await db.select().from(users).where(eq(users.id, me.id)).limit(1);
	if (!(await verifyAuthKey(user.authHash, currentAuthKey)))
		error(403, 'Mot de passe actuel incorrect');

	await db
		.update(users)
		.set({ authHash: await hashAuthKey(authKey), kdfSalt, kdfParams: params, encPrivateKey })
		.where(eq(users.id, me.id));
	// Les autres appareils doivent se reconnecter
	await destroyUserSessions(me.id, locals.session!.id);
	return Response.json({ ok: true });
};
