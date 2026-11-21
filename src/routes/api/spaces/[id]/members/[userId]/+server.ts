import { error } from '@sveltejs/kit';
import { and, eq, ne } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { spaceMembers, spaces } from '#lib/server/db/schema.ts';
import { requireMember, requireUser } from '#lib/server/guard.ts';
import { oneOf, readBody, uuid } from '#lib/server/validate.ts';
import type { RequestHandler } from './$types';

/**
 * Retire un membre (ou quitte l'espace si c'est soi-même). L'espace passe en « rotation requise » :
 * le membre sortant connaissait l'ancienne clé, un admin doit la renouveler (voir /rotate).
 */
export const DELETE: RequestHandler = async ({ params, locals }) => {
	const me = requireUser(locals);
	const spaceId = uuid(params.id);
	const targetId = uuid(params.userId);
	const leaving = targetId === me.id;
	const { space } = await requireMember(me.id, spaceId, !leaving);
	if (space.kind === 'personal') error(400, 'Le coffre personnel ne peut pas être quitté');

	await db.transaction(async (tx) => {
		await tx.select({ id: spaces.id }).from(spaces).where(eq(spaces.id, spaceId)).for('update');
		const [target] = await tx
			.select({ role: spaceMembers.role })
			.from(spaceMembers)
			.where(and(eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.userId, targetId)));
		if (!target) error(404, 'Membre introuvable');
		if (target.role === 'admin') {
			const others = await tx
				.select({ userId: spaceMembers.userId })
				.from(spaceMembers)
				.where(
					and(
						eq(spaceMembers.spaceId, spaceId),
						eq(spaceMembers.role, 'admin'),
						ne(spaceMembers.userId, targetId)
					)
				);
			if (others.length === 0)
				error(400, 'Il doit rester au moins un administrateur dans l’espace');
		}
		await tx
			.delete(spaceMembers)
			.where(and(eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.userId, targetId)));
		await tx.update(spaces).set({ needsRotation: true }).where(eq(spaces.id, spaceId));
	});
	return Response.json({ ok: true, needsRotation: true });
};

/** Change le rôle d'un membre (admin de l'espace). */
export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	const me = requireUser(locals);
	const spaceId = uuid(params.id);
	const targetId = uuid(params.userId);
	await requireMember(me.id, spaceId, true);
	const role = oneOf((await readBody(request)).role, 'rôle', ['admin', 'member'] as const);

	await db.transaction(async (tx) => {
		await tx.select({ id: spaces.id }).from(spaces).where(eq(spaces.id, spaceId)).for('update');
		if (role === 'member') {
			const others = await tx
				.select({ userId: spaceMembers.userId })
				.from(spaceMembers)
				.where(
					and(
						eq(spaceMembers.spaceId, spaceId),
						eq(spaceMembers.role, 'admin'),
						ne(spaceMembers.userId, targetId)
					)
				);
			if (others.length === 0)
				error(400, 'Il doit rester au moins un administrateur dans l’espace');
		}
		const updated = await tx
			.update(spaceMembers)
			.set({ role })
			.where(and(eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.userId, targetId)))
			.returning({ userId: spaceMembers.userId });
		if (updated.length === 0) error(404, 'Membre introuvable');
	});
	return Response.json({ ok: true });
};
