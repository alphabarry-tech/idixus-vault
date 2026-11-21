import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { users } from '#lib/server/db/schema.ts';
import { issueOtp } from '#lib/server/otp.ts';
import { limit } from '#lib/server/ratelimit.ts';
import { email as parseEmail, readBody } from '#lib/server/validate.ts';
import type { RequestHandler } from './$types';

/** Récupération de compte, étape 1 : envoie un code par email. Même réponse que le compte existe ou non. */
export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	limit(`recover-ip:${getClientAddress()}`, 10, 3_600_000);
	const email = parseEmail((await readBody(request)).email);
	limit(`recover-email:${email}`, 5, 3_600_000);

	const [user] = await db
		.select({ id: users.id, email: users.email })
		.from(users)
		.where(and(eq(users.email, email), isNotNull(users.activatedAt), isNull(users.disabledAt)))
		.limit(1);
	if (user) {
		try {
			await issueOtp({ userId: user.id, email: user.email, purpose: 'recovery' });
		} catch {
			// Délai entre deux envois non écoulé : on ne le révèle pas
		}
	}
	return Response.json({ ok: true });
};
