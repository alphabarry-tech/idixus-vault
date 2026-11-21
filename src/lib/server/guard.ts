import { and, eq } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { db } from './db';
import { spaceMembers, spaces } from './db/schema';

type Locals = App.Locals;

/** Utilisateur connecté, activé, avec double authentification validée. */
export function requireUser(locals: Locals) {
	if (!locals.user || !locals.session?.mfaVerified || !locals.user.activated) {
		error(401, 'Authentification requise');
	}
	return locals.user;
}

export function requireAppAdmin(locals: Locals) {
	const user = requireUser(locals);
	if (user.appRole !== 'admin') error(403, 'Réservé aux administrateurs');
	return user;
}

/** Retourne l'espace et le rôle de l'utilisateur, ou 404 (on ne révèle pas l'existence des espaces). */
export async function requireMember(userId: string, spaceId: string, needAdmin = false) {
	const [row] = await db
		.select({ space: spaces, member: spaceMembers })
		.from(spaceMembers)
		.innerJoin(spaces, eq(spaces.id, spaceMembers.spaceId))
		.where(and(eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.userId, userId)))
		.limit(1);
	if (!row) error(404, 'Espace introuvable');
	if (needAdmin && row.member.role !== 'admin')
		error(403, 'Réservé aux administrateurs de l’espace');
	return row;
}
