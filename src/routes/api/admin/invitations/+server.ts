import { error } from '@sveltejs/kit';
import { and, desc, eq, gt, isNull } from 'drizzle-orm';
import { ALLOWED_EMAIL_DOMAIN } from '$app/env/private';
import { db } from '#lib/server/db/index.ts';
import { invitations, users } from '#lib/server/db/schema.ts';
import { requireAppAdmin } from '#lib/server/guard.ts';
import { sendInvitation } from '#lib/server/mail.ts';
import { limit } from '#lib/server/ratelimit.ts';
import { randomToken, sha256 } from '#lib/server/security.ts';
import { email as parseEmail, oneOf, readBody } from '#lib/server/validate.ts';
import type { RequestHandler } from './$types';

const INVITATION_TTL_MS = 48 * 3_600_000;

export const GET: RequestHandler = async ({ locals }) => {
	requireAppAdmin(locals);
	const rows = await db
		.select({
			id: invitations.id,
			email: invitations.email,
			role: invitations.role,
			expiresAt: invitations.expiresAt,
			createdAt: invitations.createdAt
		})
		.from(invitations)
		.where(and(isNull(invitations.usedAt), gt(invitations.expiresAt, new Date())))
		.orderBy(desc(invitations.createdAt));
	return Response.json({ invitations: rows });
};

/** Crée une invitation à usage unique (48 h) et l'envoie par email. */
export const POST: RequestHandler = async ({ request, locals }) => {
	const admin = requireAppAdmin(locals);
	limit(`invite:${admin.id}`, 30, 3_600_000);
	const body = await readBody(request);
	const email = parseEmail(body.email);
	const role = oneOf(body.role ?? 'member', 'rôle', ['admin', 'member'] as const);

	if (ALLOWED_EMAIL_DOMAIN && !email.endsWith(`@${ALLOWED_EMAIL_DOMAIN}`)) {
		error(400, `Seules les adresses @${ALLOWED_EMAIL_DOMAIN} peuvent être invitées`);
	}
	const [existing] = await db
		.select({ activatedAt: users.activatedAt })
		.from(users)
		.where(eq(users.email, email))
		.limit(1);
	if (existing?.activatedAt) error(409, 'Cet utilisateur a déjà un compte');

	const token = randomToken();
	const [created] = await db.transaction(async (tx) => {
		// Une seule invitation valide par adresse
		await tx
			.delete(invitations)
			.where(and(eq(invitations.email, email), isNull(invitations.usedAt)));
		return tx
			.insert(invitations)
			.values({
				email,
				role,
				tokenHash: sha256(token),
				invitedBy: admin.id,
				expiresAt: new Date(Date.now() + INVITATION_TTL_MS)
			})
			.returning({ id: invitations.id, expiresAt: invitations.expiresAt });
	});

	try {
		await sendInvitation(email, token, admin.name);
	} catch (e) {
		console.error('[invitation] échec de l’envoi SMTP', e);
		await db.delete(invitations).where(eq(invitations.id, created.id));
		error(502, 'L’email n’a pas pu être envoyé. Vérifiez la configuration SMTP.');
	}
	return Response.json(
		{ id: created.id, email, role, expiresAt: created.expiresAt },
		{ status: 201 }
	);
};
