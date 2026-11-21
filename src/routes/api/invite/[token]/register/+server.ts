import { error } from '@sveltejs/kit';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { invitations, spaceMembers, spaces, users } from '#lib/server/db/schema.ts';
import { hashAuthKey } from '#lib/server/authkey.ts';
import { issueOtp } from '#lib/server/otp.ts';
import { limit } from '#lib/server/ratelimit.ts';
import { sha256 } from '#lib/server/security.ts';
import { createSession } from '#lib/server/session.ts';
import { b64, kdfParams, readBody, sealed, str, uuid } from '#lib/server/validate.ts';
import type { RequestHandler } from './$types';

/**
 * Création du compte à partir d'une invitation. Le navigateur envoie uniquement des données déjà
 * chiffrées ou dérivées : jamais le mot de passe maître. Le compte reste inactif jusqu'à la validation
 * du code OTP envoyé par email.
 */
export const POST: RequestHandler = async (event) => {
	limit(`register:${event.getClientAddress()}`, 10, 3_600_000);
	const body = await readBody(event.request);

	const userId = uuid(body.userId, 'userId');
	const name = str(body.name, 'nom', 100);
	const authKey = b64(body.authKey, 'authKey', 100, 20);
	const kdfSalt = b64(body.kdfSalt, 'kdfSalt', 64, 16);
	const params = kdfParams(body.kdfParams);
	const publicKey = b64(body.publicKey, 'publicKey', 64, 40);
	const encPrivateKey = sealed(body.encPrivateKey, 'encPrivateKey', 1000);
	const encPrivateKeyRecovery = sealed(body.encPrivateKeyRecovery, 'encPrivateKeyRecovery', 1000);
	const personal = (body.personalSpace ?? {}) as Record<string, unknown>;
	const wrappedSpaceKey = b64(personal.wrappedSpaceKey, 'wrappedSpaceKey', 300, 40);
	const authHash = await hashAuthKey(authKey);

	const invitation = await db.transaction(async (tx) => {
		const [inv] = await tx
			.select()
			.from(invitations)
			.where(
				and(
					eq(invitations.tokenHash, sha256(event.params.token)),
					isNull(invitations.usedAt),
					gt(invitations.expiresAt, new Date())
				)
			)
			.for('update')
			.limit(1);
		if (!inv) error(404, 'Invitation invalide ou expirée');

		const [existing] = await tx.select().from(users).where(eq(users.email, inv.email)).limit(1);
		if (existing?.activatedAt) error(409, 'Un compte existe déjà pour cet email');
		if (existing) {
			// Inscription précédemment abandonnée avant la validation du code : on repart de zéro
			await tx.delete(spaces).where(eq(spaces.createdBy, existing.id));
			await tx.delete(users).where(eq(users.id, existing.id));
		}

		await tx.insert(users).values({
			id: userId,
			email: inv.email,
			name,
			appRole: inv.role,
			authHash,
			kdfSalt,
			kdfParams: params,
			publicKey,
			encPrivateKey,
			encPrivateKeyRecovery
		});
		const [space] = await tx
			.insert(spaces)
			.values({ name: 'Coffre personnel', kind: 'personal', createdBy: userId })
			.returning({ id: spaces.id });
		await tx.insert(spaceMembers).values({
			spaceId: space.id,
			userId,
			role: 'admin',
			wrappedSpaceKey
		});
		return inv;
	});

	await createSession(event, userId, false);
	await issueOtp({
		userId,
		email: invitation.email,
		purpose: 'signup',
		invitationId: invitation.id
	});
	return Response.json({ otp: true });
};
