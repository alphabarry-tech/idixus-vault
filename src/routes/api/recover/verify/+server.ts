import { error } from '@sveltejs/kit';
import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { users } from '#lib/server/db/schema.ts';
import { verifyOtp } from '#lib/server/otp.ts';
import { limit } from '#lib/server/ratelimit.ts';
import { sha256, signToken } from '#lib/server/security.ts';
import { email as parseEmail, readBody, str } from '#lib/server/validate.ts';
import type { RequestHandler } from './$types';

/** Récupération de compte, étape 2 : vérifie le code et renvoie la clé privée chiffrée par la clé de récupération. */
export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	limit(`recover-verify-ip:${getClientAddress()}`, 20, 3_600_000);
	const body = await readBody(request);
	const email = parseEmail(body.email);
	const code = str(body.code, 'code', 6, 6);
	if (!/^\d{6}$/.test(code)) error(400, 'Code incorrect.');

	const [user] = await db
		.select()
		.from(users)
		.where(and(eq(users.email, email), isNotNull(users.activatedAt), isNull(users.disabledAt)))
		.limit(1);
	if (!user) error(400, 'Code incorrect.');

	await verifyOtp(user.id, 'recovery', code);
	if (!user.encPrivateKeyRecovery) error(400, 'Aucune clé de récupération pour ce compte.');

	return Response.json({
		userId: user.id,
		encPrivateKeyRecovery: user.encPrivateKeyRecovery,
		// Valable 10 min et lié au mot de passe actuel : inutilisable une fois le mot de passe changé
		recoveryToken: signToken({ uid: user.id, ver: sha256(user.authHash).slice(0, 16) }, 600_000)
	});
};
