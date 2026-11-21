import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { entries, spaces } from '#lib/server/db/schema.ts';
import { requireMember, requireUser } from '#lib/server/guard.ts';
import { limit } from '#lib/server/ratelimit.ts';
import { int, readBody, sealed, uuid } from '#lib/server/validate.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals }) => {
	const me = requireUser(locals);
	const spaceId = uuid(params.id);
	await requireMember(me.id, spaceId);
	const rows = await db
		.select({
			id: entries.id,
			nonce: entries.nonce,
			ciphertext: entries.ciphertext,
			keyVersion: entries.keyVersion,
			updatedAt: entries.updatedAt
		})
		.from(entries)
		.where(eq(entries.spaceId, spaceId));
	return Response.json({ entries: rows });
};

/**
 * Crée une entrée. L'identifiant est choisi par le client : il fait partie des données authentifiées
 * du chiffrement, ce qui empêche de déplacer un blob chiffré vers une autre entrée.
 */
export const POST: RequestHandler = async ({ params, request, locals }) => {
	const me = requireUser(locals);
	limit(`write-entry:${me.id}`, 300, 60_000);
	const spaceId = uuid(params.id);
	await requireMember(me.id, spaceId);
	const body = await readBody(request);
	const id = uuid(body.id, 'id');
	const blob = sealed(body, 'entrée');
	const keyVersion = int(body.keyVersion, 'keyVersion', 1, 1_000_000);

	await db.transaction(async (tx) => {
		// Verrou partagé : attend la fin d'une rotation de clé en cours et lit la version à jour
		const [space] = await tx
			.select({ keyVersion: spaces.keyVersion })
			.from(spaces)
			.where(eq(spaces.id, spaceId))
			.for('share');
		if (!space || space.keyVersion !== keyVersion) {
			error(409, 'La clé de l’espace a changé. Rechargez la page.');
		}
		const inserted = await tx
			.insert(entries)
			.values({ id, spaceId, ...blob, keyVersion, updatedBy: me.id })
			.onConflictDoNothing()
			.returning({ id: entries.id });
		if (inserted.length === 0) error(409, 'Cette entrée existe déjà');
	});
	return Response.json({ id }, { status: 201 });
};
