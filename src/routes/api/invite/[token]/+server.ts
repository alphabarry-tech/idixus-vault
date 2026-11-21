import { error } from '@sveltejs/kit';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { invitations } from '#lib/server/db/schema.ts';
import { limit } from '#lib/server/ratelimit.ts';
import { sha256 } from '#lib/server/security.ts';
import type { RequestHandler } from './$types';

/** Indique si un lien d'invitation est valide (page d'inscription). */
export const GET: RequestHandler = async ({ params, getClientAddress }) => {
	limit(`invite-check:${getClientAddress()}`, 30, 60_000);
	const [invitation] = await db
		.select({ email: invitations.email })
		.from(invitations)
		.where(
			and(
				eq(invitations.tokenHash, sha256(params.token)),
				isNull(invitations.usedAt),
				gt(invitations.expiresAt, new Date())
			)
		)
		.limit(1);
	if (!invitation) error(404, 'Invitation invalide ou expirée');
	return Response.json({ email: invitation.email });
};
