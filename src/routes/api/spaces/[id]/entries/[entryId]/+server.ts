import { error } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { entries, spaces } from '#lib/server/db/schema.ts';
import { requireMember, requireUser } from '#lib/server/guard.ts';
import { limit } from '#lib/server/ratelimit.ts';
import { int, readBody, sealed, uuid } from '#lib/server/validate.ts';
import type { RequestHandler } from './$types';

export const PUT: RequestHandler = async ({ params, request, locals }) => {
	const me = requireUser(locals);
	limit(`write-entry:${me.id}`, 300, 60_000);
	const spaceId = uuid(params.id);
	const entryId = uuid(params.entryId);
	await requireMember(me.id, spaceId);
	const body = await readBody(request);
	const blob = sealed(body, 'entrée');
	const keyVersion = int(body.keyVersion, 'keyVersion', 1, 1_000_000);

	await db.transaction(async (tx) => {
		const [space] = await tx
			.select({ keyVersion: spaces.keyVersion })
			.from(spaces)
			.where(eq(spaces.id, spaceId))
			.for('share');
		if (!space || space.keyVersion !== keyVersion) {
			error(409, 'La clé de l’espace a changé. Rechargez la page.');
		}
		const updated = await tx
			.update(entries)
			.set({ ...blob, keyVersion, updatedBy: me.id, updatedAt: new Date() })
			.where(and(eq(entries.id, entryId), eq(entries.spaceId, spaceId)))
			.returning({ id: entries.id });
		if (updated.length === 0) error(404, 'Entrée introuvable');
	});
	return Response.json({ ok: true });
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
	const me = requireUser(locals);
	const spaceId = uuid(params.id);
	await requireMember(me.id, spaceId);
	const deleted = await db
		.delete(entries)
		.where(and(eq(entries.id, uuid(params.entryId)), eq(entries.spaceId, spaceId)))
		.returning({ id: entries.id });
	if (deleted.length === 0) error(404, 'Entrée introuvable');
	return Response.json({ ok: true });
};
