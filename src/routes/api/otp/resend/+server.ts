import { error } from '@sveltejs/kit';
import { and, desc, eq, gt, isNull } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { invitations } from '#lib/server/db/schema.ts';
import { issueOtp } from '#lib/server/otp.ts';
import { limit } from '#lib/server/ratelimit.ts';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals, getClientAddress }) => {
	const { user, session } = locals;
	if (!user || !session || session.mfaVerified) error(401, 'Session expirée, recommencez.');
	limit(`otp-resend:${user.id}`, 5, 600_000);
	limit(`otp-resend-ip:${getClientAddress()}`, 20, 600_000);

	if (user.activated) {
		await issueOtp({ userId: user.id, email: user.email, purpose: 'login' });
	} else {
		const [invitation] = await db
			.select({ id: invitations.id })
			.from(invitations)
			.where(
				and(
					eq(invitations.email, user.email),
					isNull(invitations.usedAt),
					gt(invitations.expiresAt, new Date())
				)
			)
			.orderBy(desc(invitations.createdAt))
			.limit(1);
		if (!invitation)
			error(400, 'Invitation expirée. Demandez-en une nouvelle à un administrateur.');
		await issueOtp({
			userId: user.id,
			email: user.email,
			purpose: 'signup',
			invitationId: invitation.id
		});
	}
	return Response.json({ ok: true });
};
