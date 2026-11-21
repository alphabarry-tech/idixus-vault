import { error } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { invitations } from '#lib/server/db/schema.ts';
import { requireAppAdmin } from '#lib/server/guard.ts';
import { uuid } from '#lib/server/validate.ts';
import type { RequestHandler } from './$types';

/** Révoque une invitation non utilisée. */
export const DELETE: RequestHandler = async ({ params, locals }) => {
	requireAppAdmin(locals);
	const deleted = await db
		.delete(invitations)
		.where(and(eq(invitations.id, uuid(params.id)), isNull(invitations.usedAt)))
		.returning({ id: invitations.id });
	if (deleted.length === 0) error(404, 'Invitation introuvable');
	return Response.json({ ok: true });
};
