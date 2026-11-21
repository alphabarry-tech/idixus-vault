import { defineConfig } from 'vitest/config';

// Tests de bout en bout : nécessitent `npm run dev` et la base Postgres démarrés.
export default defineConfig({
	test: {
		include: ['e2e/**/*.e2e.ts'],
		testTimeout: 60_000,
		fileParallelism: false
	}
});
