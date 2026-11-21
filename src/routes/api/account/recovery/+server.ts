import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { users } from '#lib/server/db/schema.ts';
import { verifyAuthKey } from '#lib/server/authkey.ts';
import { requireUser } from '#lib/server/guard.ts';
import { limit } from '#lib/server/ratelimit.ts';
import { b64, readBody, sealed } from '#lib/server/validate.ts';
import type { RequestHandler } from './$types';

/** Remplace la clé de récupération (perdue ou compromise). Exige le mot de passe maître actuel. */
export const POST: RequestHandler = async ({ request, locals }) => {
	const me = requireUser(locals);
	limit(`change-recovery:${me.id}`, 5, 600_000);
	const body = await readBody(request);
	const currentAuthKey = b64(body.currentAuthKey, 'currentAuthKey', 100, 20);
	const encPrivateKeyRecovery = sealed(body.encPrivateKeyRecovery, 'encPrivateKeyRecovery', 1000);

	const [user] = await db.select().from(users).where(eq(users.id, me.id)).limit(1);
	if (!(await verifyAuthKey(user.authHash, currentAuthKey)))
		error(403, 'Mot de passe maître incorrect');

	await db.update(users).set({ encPrivateKeyRecovery }).where(eq(users.id, me.id));
	return Response.json({ ok: true });
};
