import { randomInt } from 'node:crypto';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { db } from './db';
import { otpCodes } from './db/schema';
import { sendOtp } from './mail';
import { hmac, safeEqual } from './security';

const OTP_TTL_MS = 5 * 60_000;
const RESEND_COOLDOWN_MS = 45_000;
const MAX_ATTEMPTS = 5;

type Purpose = 'signup' | 'login' | 'recovery';

const hashCode = (id: string, code: string) => hmac('otp', `${id}:${code}`).toString('hex');

/** Génère un code à 6 chiffres, invalide les précédents et l'envoie par email (SMTP). */
export async function issueOtp(opts: {
	userId: string;
	email: string;
	purpose: Purpose;
	invitationId?: string;
}) {
	const [last] = await db
		.select({ createdAt: otpCodes.createdAt })
		.from(otpCodes)
		.where(and(eq(otpCodes.userId, opts.userId), eq(otpCodes.purpose, opts.purpose)))
		.orderBy(desc(otpCodes.createdAt))
		.limit(1);
	if (last && Date.now() - last.createdAt.getTime() < RESEND_COOLDOWN_MS) {
		error(
			429,
			'Un code vient d’être envoyé. Patientez quelques secondes avant d’en demander un autre.'
		);
	}

	const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
	const id = crypto.randomUUID();
	await db.transaction(async (tx) => {
		await tx
			.update(otpCodes)
			.set({ consumedAt: new Date() })
			.where(
				and(
					eq(otpCodes.userId, opts.userId),
					eq(otpCodes.purpose, opts.purpose),
					isNull(otpCodes.consumedAt)
				)
			);
		await tx.insert(otpCodes).values({
			id,
			userId: opts.userId,
			invitationId: opts.invitationId ?? null,
			purpose: opts.purpose,
			codeHash: hashCode(id, code),
			expiresAt: new Date(Date.now() + OTP_TTL_MS)
		});
	});
	await sendOtp(opts.email, code);
}

/**
 * Vérifie un code. Le compteur d'essais est incrémenté *avant* la comparaison, en une seule requête
 * atomique, pour qu'on ne puisse pas tester plusieurs codes en parallèle.
 * Retourne l'invitation liée (inscription) ou null.
 */
export async function verifyOtp(
	userId: string,
	purpose: Purpose,
	code: string
): Promise<{ invitationId: string | null }> {
	const [candidate] = await db
		.select({ id: otpCodes.id })
		.from(otpCodes)
		.where(
			and(
				eq(otpCodes.userId, userId),
				eq(otpCodes.purpose, purpose),
				isNull(otpCodes.consumedAt),
				sql`${otpCodes.expiresAt} > now()`
			)
		)
		.orderBy(desc(otpCodes.createdAt))
		.limit(1);
	if (!candidate) error(400, 'Code expiré. Demandez-en un nouveau.');

	const [row] = await db
		.update(otpCodes)
		.set({ attempts: sql`${otpCodes.attempts} + 1` })
		.where(and(eq(otpCodes.id, candidate.id), isNull(otpCodes.consumedAt)))
		.returning();
	if (!row) error(400, 'Code expiré. Demandez-en un nouveau.');
	if (row.attempts > MAX_ATTEMPTS) {
		await db.update(otpCodes).set({ consumedAt: new Date() }).where(eq(otpCodes.id, row.id));
		error(400, 'Trop d’essais. Demandez un nouveau code.');
	}
	if (!safeEqual(hashCode(row.id, code), row.codeHash)) error(400, 'Code incorrect.');

	// Consommation atomique : un code ne peut servir qu'une fois
	const consumed = await db
		.update(otpCodes)
		.set({ consumedAt: new Date() })
		.where(and(eq(otpCodes.id, row.id), isNull(otpCodes.consumedAt)))
		.returning({ id: otpCodes.id });
	if (consumed.length === 0) error(400, 'Code expiré. Demandez-en un nouveau.');
	return { invitationId: row.invitationId };
}
