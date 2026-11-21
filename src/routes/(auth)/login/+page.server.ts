import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	// Déjà connecté : le coffre demandera simplement le mot de passe maître pour se déverrouiller
	if (locals.user?.activated && locals.session?.mfaVerified) redirect(303, '/');
};
