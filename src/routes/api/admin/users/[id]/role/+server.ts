import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { users } from '#lib/server/db/schema.ts';
import { requireAppAdmin } from '#lib/server/guard.ts';
import { oneOf, readBody, uuid } from '#lib/server/validate.ts';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request, locals }) => {
	const admin = requireAppAdmin(locals);
	const targetId = uuid(params.id);
	const role = oneOf((await readBody(request)).role, 'rôle', ['admin', 'member'] as const);
	if (targetId === admin.id) error(400, 'Vous ne pouvez pas modifier votre propre rôle');

	const updated = await db
		.update(users)
		.set({ appRole: role })
		.where(eq(users.id, targetId))
		.returning({ id: users.id });
	if (updated.length === 0) error(404, 'Utilisateur introuvable');
	return Response.json({ ok: true });
};
