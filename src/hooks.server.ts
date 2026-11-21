import { error } from '@sveltejs/kit';
import type { Handle } from '@sveltejs/kit/hooks';
import { loadSession, SESSION_COOKIE } from '#lib/server/session.ts';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export const handle: Handle = async ({ event, resolve }) => {
	// Protection CSRF en plus du cookie SameSite=Strict : toute écriture doit venir de notre origine
	if (!SAFE_METHODS.has(event.request.method)) {
		const origin = event.request.headers.get('origin');
		if (origin !== event.url.origin) error(403, 'Origine non autorisée');
	}

	const token = event.cookies.get(SESSION_COOKIE);
	if (token) {
		const found = await loadSession(token);
		if (found) {
			event.locals.user = found.user;
			event.locals.session = found.session;
		} else {
			event.cookies.delete(SESSION_COOKIE, { path: '/' });
		}
	}

	const response = await resolve(event);

	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('Referrer-Policy', 'no-referrer');
	response.headers.set('X-Frame-Options', 'DENY');
	response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
	response.headers.set(
		'Permissions-Policy',
		'camera=(), microphone=(), geolocation=(), payment=()'
	);
	if (event.url.protocol === 'https:') {
		response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
	}
	// Aucune réponse de l'API ni page authentifiée ne doit être mise en cache
	if (event.url.pathname.startsWith('/api/') || event.locals.user) {
		response.headers.set('Cache-Control', 'no-store');
	}
	return response;
};
