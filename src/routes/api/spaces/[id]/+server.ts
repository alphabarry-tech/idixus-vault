import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { spaces } from '#lib/server/db/schema.ts';
import { requireMember, requireUser } from '#lib/server/guard.ts';
import { readBody, str, uuid } from '#lib/server/validate.ts';
import type { RequestHandler } from './$types';

/** Renomme un espace partagé (admin de l'espace). */
export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	const me = requireUser(locals);
	const { space } = await requireMember(me.id, uuid(params.id), true);
	if (space.kind === 'personal') error(400, 'Le coffre personnel ne peut pas être renommé');
	const name = str((await readBody(request)).name, 'nom', 80);
	await db.update(spaces).set({ name }).where(eq(spaces.id, space.id));
	return Response.json({ ok: true });
};

/** Supprime un espace partagé et toutes ses entrées (admin de l'espace). */
export const DELETE: RequestHandler = async ({ params, locals }) => {
	const me = requireUser(locals);
	const { space } = await requireMember(me.id, uuid(params.id), true);
	if (space.kind === 'personal') error(400, 'Le coffre personnel ne peut pas être supprimé');
	await db.delete(spaces).where(eq(spaces.id, space.id));
	return Response.json({ ok: true });
};
