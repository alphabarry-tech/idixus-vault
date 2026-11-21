import { destroySession } from '#lib/server/session.ts';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async (event) => {
	await destroySession(event);
	return Response.json({ ok: true });
};
