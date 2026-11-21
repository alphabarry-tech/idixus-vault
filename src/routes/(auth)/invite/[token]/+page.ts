import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, params }) => {
	const res = await fetch(`/api/invite/${encodeURIComponent(params.token)}`);
	return {
		token: params.token,
		email: res.ok ? ((await res.json()) as { email: string }).email : null
	};
};
