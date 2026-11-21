import { eq } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { spaceMembers, spaces, users } from '#lib/server/db/schema.ts';
import { requireUser } from '#lib/server/guard.ts';
import type { RequestHandler } from './$types';

/** Profil, matériel de clés chiffré (inutilisable sans le mot de passe maître) et espaces de l'utilisateur. */
export const GET: RequestHandler = async ({ locals }) => {
	const me = requireUser(locals);
	const [user] = await db.select().from(users).where(eq(users.id, me.id)).limit(1);

	const memberships = await db
		.select({
			id: spaces.id,
			name: spaces.name,
			kind: spaces.kind,
			keyVersion: spaces.keyVersion,
			needsRotation: spaces.needsRotation,
			role: spaceMembers.role,
			wrappedSpaceKey: spaceMembers.wrappedSpaceKey,
			memberKeyVersion: spaceMembers.keyVersion
		})
		.from(spaceMembers)
		.innerJoin(spaces, eq(spaces.id, spaceMembers.spaceId))
		.where(eq(spaceMembers.userId, me.id));

	return Response.json({
		user: {
			id: user.id,
			email: user.email,
			name: user.name,
			appRole: user.appRole,
			publicKey: user.publicKey,
			encPrivateKey: user.encPrivateKey,
			kdfSalt: user.kdfSalt,
			kdfParams: user.kdfParams
		},
		spaces: memberships
	});
};
