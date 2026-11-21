import { desc } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { users } from '#lib/server/db/schema.ts';
import { requireAppAdmin } from '#lib/server/guard.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	requireAppAdmin(locals);
	const rows = await db
		.select({
			id: users.id,
			email: users.email,
			name: users.name,
			appRole: users.appRole,
			activatedAt: users.activatedAt,
			disabledAt: users.disabledAt,
			createdAt: users.createdAt
		})
		.from(users)
		.orderBy(desc(users.createdAt));
	return Response.json({ users: rows });
};
