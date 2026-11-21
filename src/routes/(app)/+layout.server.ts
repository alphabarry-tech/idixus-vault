import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals }) => {
	if (!locals.user || !locals.session?.mfaVerified || !locals.user.activated)
		redirect(303, '/login');
	return {
		account: { name: locals.user.name, email: locals.user.email, appRole: locals.user.appRole }
	};
};
