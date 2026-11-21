import { limit } from '#lib/server/ratelimit.ts';
import { db } from '#lib/server/db/index.ts';
import { spaceMembers, spaces } from '#lib/server/db/schema.ts';
import { requireUser } from '#lib/server/guard.ts';
import { b64, readBody, str } from '#lib/server/validate.ts';
import type { RequestHandler } from './$types';

/** Crée un espace partagé. La clé de l'espace est générée par le client et arrive déjà enveloppée. */
export const POST: RequestHandler = async ({ request, locals }) => {
	const me = requireUser(locals);
	limit(`create-space:${me.id}`, 30, 3_600_000);
	const body = await readBody(request);
	const name = str(body.name, 'nom', 80);
	const wrappedSpaceKey = b64(body.wrappedSpaceKey, 'wrappedSpaceKey', 300, 40);

	const space = await db.transaction(async (tx) => {
		const [created] = await tx
			.insert(spaces)
			.values({ name, kind: 'shared', createdBy: me.id })
			.returning({ id: spaces.id, keyVersion: spaces.keyVersion });
		await tx.insert(spaceMembers).values({
			spaceId: created.id,
			userId: me.id,
			role: 'admin',
			wrappedSpaceKey,
			keyVersion: created.keyVersion
		});
		return created;
	});
	return Response.json({ id: space.id, name, keyVersion: space.keyVersion }, { status: 201 });
};
