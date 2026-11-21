import { error } from '@sveltejs/kit';
import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { spaceMembers, spaces, users } from '#lib/server/db/schema.ts';
import { requireMember, requireUser } from '#lib/server/guard.ts';
import { b64, int, oneOf, readBody, uuid } from '#lib/server/validate.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals }) => {
	const me = requireUser(locals);
	const spaceId = uuid(params.id);
	await requireMember(me.id, spaceId);
	const rows = await db
		.select({
			userId: users.id,
			name: users.name,
			email: users.email,
			publicKey: users.publicKey,
			role: spaceMembers.role
		})
		.from(spaceMembers)
		.innerJoin(users, eq(users.id, spaceMembers.userId))
		.where(eq(spaceMembers.spaceId, spaceId));
	return Response.json({ members: rows });
};

/** Ajoute un membre. Le client a déjà enveloppé la clé de l'espace avec la clé publique du nouveau membre. */
export const POST: RequestHandler = async ({ params, request, locals }) => {
	const me = requireUser(locals);
	const spaceId = uuid(params.id);
	const { space } = await requireMember(me.id, spaceId, true);
	if (space.kind === 'personal') error(400, 'Le coffre personnel ne se partage pas');

	const body = await readBody(request);
	const userId = uuid(body.userId, 'userId');
	const role = oneOf(body.role ?? 'member', 'rôle', ['admin', 'member'] as const);
	const wrappedSpaceKey = b64(body.wrappedSpaceKey, 'wrappedSpaceKey', 300, 40);
	const keyVersion = int(body.keyVersion, 'keyVersion', 1, 1_000_000);

	await db.transaction(async (tx) => {
		const [current] = await tx
			.select({ keyVersion: spaces.keyVersion })
			.from(spaces)
			.where(eq(spaces.id, spaceId))
			.for('share');
		if (!current || current.keyVersion !== keyVersion) {
			error(409, 'La clé de l’espace a changé. Rechargez la page.');
		}
		const [target] = await tx
			.select({ id: users.id })
			.from(users)
			.where(and(eq(users.id, userId), isNotNull(users.activatedAt), isNull(users.disabledAt)));
		if (!target) error(404, 'Collaborateur introuvable');
		const inserted = await tx
			.insert(spaceMembers)
			.values({ spaceId, userId, role, wrappedSpaceKey, keyVersion })
			.onConflictDoNothing()
			.returning({ userId: spaceMembers.userId });
		if (inserted.length === 0) error(409, 'Déjà membre de cet espace');
	});
	return Response.json({ ok: true }, { status: 201 });
};
