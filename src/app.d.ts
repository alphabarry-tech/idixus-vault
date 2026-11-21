// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		interface Locals {
			user?: {
				id: string;
				email: string;
				name: string;
				appRole: 'admin' | 'member';
				activated: boolean;
			};
			session?: { id: string; mfaVerified: boolean };
		}
	}
}

export {};
