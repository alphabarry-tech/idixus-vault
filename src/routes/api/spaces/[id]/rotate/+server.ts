import { error } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { entries, spaceMembers, spaces } from '#lib/server/db/schema.ts';
import { requireMember, requireUser } from '#lib/server/guard.ts';
import { b64, int, readBody, sealed, uuid } from '#lib/server/validate.ts';
import type { RequestHandler } from './$types';

/**
 * Rotation de la clé d'un espace : le client génère une nouvelle clé, ré-chiffre toutes les entrées et
 * ré-enveloppe la clé pour chaque membre restant. Tout est appliqué dans une transaction, et le serveur
 * exige que les listes soient exactement complètes pour qu'aucune entrée ni aucun membre ne soit laissé
 * sur l'ancienne clé.
 */
export const POST: RequestHandler = async ({ params, request, locals }) => {
	const me = requireUser(locals);
	const spaceId = uuid(params.id);
	await requireMember(me.id, spaceId, true);

	const body = await readBody(request);
	const expectedVersion = int(body.expectedVersion, 'expectedVersion', 1, 1_000_000);
	if (!Array.isArray(body.members) || !Array.isArray(body.entries)) error(400, 'Corps invalide');
	if (body.members.length > 500 || body.entries.length > 20_000)
		error(413, 'Espace trop volumineux');

	const members = body.members.map((m: Record<string, unknown>) => ({
		userId: uuid(m.userId, 'userId'),
		wrappedSpaceKey: b64(m.wrappedSpaceKey, 'wrappedSpaceKey', 300, 40)
	}));
	const newEntries = body.entries.map((e: Record<string, unknown>) => ({
		id: uuid(e.id, 'id'),
		...sealed(e, 'entrée')
	}));

	const newVersion = await db.transaction(async (tx) => {
		const [space] = await tx.select().from(spaces).where(eq(spaces.id, spaceId)).for('update');
		if (!space || space.keyVersion !== expectedVersion) {
			error(409, 'La clé de l’espace a changé entre-temps. Rechargez la page.');
		}

		const currentMembers = await tx
			.select({ userId: spaceMembers.userId })
			.from(spaceMembers)
			.where(eq(spaceMembers.spaceId, spaceId));
		const currentEntries = await tx
			.select({ id: entries.id })
			.from(entries)
			.where(eq(entries.spaceId, spaceId));

		const sameSet = (a: string[], b: string[]) =>
			a.length === b.length && new Set(a).size === a.length && b.every((x) => new Set(a).has(x));
		if (
			!sameSet(
				members.map((m) => m.userId),
				currentMembers.map((m) => m.userId)
			)
		) {
			error(409, 'La liste des membres a changé. Rechargez la page.');
		}
		if (
			!sameSet(
				newEntries.map((e) => e.id),
				currentEntries.map((e) => e.id)
			)
		) {
			error(409, 'Les entrées ont changé. Rechargez la page.');
		}

		const version = space.keyVersion + 1;
		for (const m of members) {
			await tx
				.update(spaceMembers)
				.set({ wrappedSpaceKey: m.wrappedSpaceKey, keyVersion: version })
				.where(and(eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.userId, m.userId)));
		}
		for (const e of newEntries) {
			await tx
				.update(entries)
				.set({ nonce: e.nonce, ciphertext: e.ciphertext, keyVersion: version })
				.where(eq(entries.id, e.id));
		}
		await tx
			.update(spaces)
			.set({ keyVersion: version, needsRotation: false })
			.where(eq(spaces.id, spaceId));
		return version;
	});
	return Response.json({ keyVersion: newVersion });
};
