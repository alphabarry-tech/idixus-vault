import { error } from '@sveltejs/kit';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { spaceMembers, spaces, users } from '#lib/server/db/schema.ts';
import { requireAppAdmin } from '#lib/server/guard.ts';
import { destroyUserSessions } from '#lib/server/session.ts';
import { readBody, uuid } from '#lib/server/validate.ts';
import type { RequestHandler } from './$types';

/**
 * Désactive (ou réactive) un compte. À la désactivation : sessions coupées, retrait des espaces partagés,
 * et ces espaces sont marqués « rotation requise » : un admin de l'espace doit renouveler la clé,
 * sinon l'ancien membre garderait la possibilité de déchiffrer s'il avait copié sa clé.
 */
export const POST: RequestHandler = async ({ params, request, locals }) => {
	const admin = requireAppAdmin(locals);
	const targetId = uuid(params.id);
	const disabled = (await readBody(request)).disabled === true;
	if (targetId === admin.id) error(400, 'Vous ne pouvez pas désactiver votre propre compte');

	const [target] = await db
		.select({ id: users.id })
		.from(users)
		.where(eq(users.id, targetId))
		.limit(1);
	if (!target) error(404, 'Utilisateur introuvable');

	await db.transaction(async (tx) => {
		await tx
			.update(users)
			.set({ disabledAt: disabled ? new Date() : null })
			.where(eq(users.id, targetId));
		if (!disabled) return;

		const shared = await tx
			.select({ id: spaces.id })
			.from(spaceMembers)
			.innerJoin(spaces, eq(spaces.id, spaceMembers.spaceId))
			.where(and(eq(spaceMembers.userId, targetId), eq(spaces.kind, 'shared')));
		const ids = shared.map((s) => s.id);
		if (ids.length > 0) {
			await tx
				.delete(spaceMembers)
				.where(and(eq(spaceMembers.userId, targetId), inArray(spaceMembers.spaceId, ids)));
			await tx.update(spaces).set({ needsRotation: true }).where(inArray(spaces.id, ids));
		}
	});
	if (disabled) await destroyUserSessions(targetId);
	return Response.json({ ok: true });
};
