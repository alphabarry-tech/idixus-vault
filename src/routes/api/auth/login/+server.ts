import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { users } from '#lib/server/db/schema.ts';
import { fakeVerify, verifyAuthKey } from '#lib/server/authkey.ts';
import { issueOtp } from '#lib/server/otp.ts';
import { limit } from '#lib/server/ratelimit.ts';
import { createSession } from '#lib/server/session.ts';
import { b64, email as parseEmail, readBody } from '#lib/server/validate.ts';
import type { RequestHandler } from './$types';

/** Étape 1 de la connexion : vérifie `authKey`, ouvre une session en attente et envoie le code OTP. */
export const POST: RequestHandler = async (event) => {
	const ip = event.getClientAddress();
	limit(`login-ip:${ip}`, 20, 600_000);
	const body = await readBody(event.request);
	const email = parseEmail(body.email);
	const authKey = b64(body.authKey, 'authKey', 100, 20);
	limit(`login-email:${email}`, 8, 600_000);

	const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
	const valid =
		user && user.activatedAt && !user.disabledAt
			? await verifyAuthKey(user.authHash, authKey)
			: await fakeVerify(authKey);
	if (!user || !valid) error(401, 'Email ou mot de passe incorrect');

	await createSession(event, user.id, false);
	await issueOtp({ userId: user.id, email: user.email, purpose: 'login' });
	return Response.json({ otp: true });
};
