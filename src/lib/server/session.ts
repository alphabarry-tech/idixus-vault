import { and, eq, ne } from 'drizzle-orm';
import type { RequestEvent } from '@sveltejs/kit';
import { db } from './db';
import { sessions, users } from './db/schema';
import { randomToken, sha256 } from './security';

export const SESSION_COOKIE = 'vault_session';
/** Session créée avant la validation du code OTP : courte, et sans accès au coffre. */
const PENDING_TTL_MS = 15 * 60_000;
const ACTIVE_TTL_MS = 12 * 3_600_000;

function setCookie(event: RequestEvent, token: string, ttlMs: number) {
	event.cookies.set(SESSION_COOKIE, token, {
		path: '/',
		httpOnly: true,
		sameSite: 'strict',
		secure: event.url.protocol === 'https:',
		maxAge: Math.floor(ttlMs / 1000)
	});
}

export async function createSession(event: RequestEvent, userId: string, mfaVerified = false) {
	const token = randomToken();
	const ttl = mfaVerified ? ACTIVE_TTL_MS : PENDING_TTL_MS;
	await db.insert(sessions).values({
		id: sha256(token),
		userId,
		mfaVerified,
		ip: event.getClientAddress(),
		userAgent: event.request.headers.get('user-agent')?.slice(0, 300) ?? null,
		expiresAt: new Date(Date.now() + ttl)
	});
	setCookie(event, token, ttl);
}

export async function loadSession(token: string) {
	const id = sha256(token);
	const [row] = await db
		.select({ session: sessions, user: users })
		.from(sessions)
		.innerJoin(users, eq(users.id, sessions.userId))
		.where(eq(sessions.id, id))
		.limit(1);
	if (!row) return null;
	if (row.session.expiresAt.getTime() < Date.now() || row.user.disabledAt) {
		await db.delete(sessions).where(eq(sessions.id, id));
		return null;
	}
	return {
		session: { id, mfaVerified: row.session.mfaVerified },
		user: {
			id: row.user.id,
			email: row.user.email,
			name: row.user.name,
			appRole: row.user.appRole,
			activated: row.user.activatedAt !== null
		}
	};
}

/** Remplace la session en attente par une session complète (nouveau jeton : évite la fixation de session). */
export async function promoteSession(event: RequestEvent) {
	const { session, user } = event.locals;
	if (!session || !user) return;
	await db.delete(sessions).where(eq(sessions.id, session.id));
	await createSession(event, user.id, true);
}

export async function destroySession(event: RequestEvent) {
	if (event.locals.session) {
		await db.delete(sessions).where(eq(sessions.id, event.locals.session.id));
	}
	event.cookies.delete(SESSION_COOKIE, { path: '/' });
}

export async function destroyUserSessions(userId: string, exceptId?: string) {
	await db
		.delete(sessions)
		.where(
			exceptId
				? and(eq(sessions.userId, userId), ne(sessions.id, exceptId))
				: eq(sessions.userId, userId)
		);
}
