import { error } from '@sveltejs/kit';
import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { users } from '#lib/server/db/schema.ts';
import { requireUser } from '#lib/server/guard.ts';
import { limit } from '#lib/server/ratelimit.ts';
import { email as parseEmail } from '#lib/server/validate.ts';
import type { RequestHandler } from './$types';

/** Retrouve un collaborateur par email pour l'ajouter à un espace : le client a besoin de sa clé publique. */
export const GET: RequestHandler = async ({ url, locals }) => {
	const me = requireUser(locals);
	limit(`lookup:${me.id}`, 30, 60_000);
	const email = parseEmail(url.searchParams.get('email'));

	const [user] = await db
		.select({ id: users.id, name: users.name, email: users.email, publicKey: users.publicKey })
		.from(users)
		.where(and(eq(users.email, email), isNotNull(users.activatedAt), isNull(users.disabledAt)))
		.limit(1);
	if (!user) error(404, 'Aucun collaborateur actif avec cet email');
	return Response.json(user);
};
