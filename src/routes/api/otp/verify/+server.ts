import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { invitations, users } from '#lib/server/db/schema.ts';
import { limit } from '#lib/server/ratelimit.ts';
import { verifyOtp } from '#lib/server/otp.ts';
import { promoteSession } from '#lib/server/session.ts';
import { readBody, str } from '#lib/server/validate.ts';
import type { RequestHandler } from './$types';

/** Étape 2 (inscription et connexion) : valide le code reçu par email et ouvre la session complète. */
export const POST: RequestHandler = async (event) => {
	const { user, session } = event.locals;
	if (!user || !session) error(401, 'Session expirée, recommencez.');
	if (session.mfaVerified) return Response.json({ ok: true });
	limit(`otp-ip:${event.getClientAddress()}`, 30, 600_000);

	const code = str((await readBody(event.request)).code, 'code', 6, 6);
	if (!/^\d{6}$/.test(code)) error(400, 'Code incorrect.');

	const purpose = user.activated ? 'login' : 'signup';
	const { invitationId } = await verifyOtp(user.id, purpose, code);

	if (purpose === 'signup') {
		await db.transaction(async (tx) => {
			await tx.update(users).set({ activatedAt: new Date() }).where(eq(users.id, user.id));
			if (invitationId) {
				await tx
					.update(invitations)
					.set({ usedAt: new Date() })
					.where(eq(invitations.id, invitationId));
			}
		});
	}
	await promoteSession(event);
	return Response.json({ ok: true });
};
