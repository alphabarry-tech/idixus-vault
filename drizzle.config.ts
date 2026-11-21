import { defineConfig } from 'drizzle-kit';

// drizzle-kit ne lit pas .env tout seul
try {
	process.loadEnvFile();
} catch {
	// pas de fichier .env : DATABASE_URL doit venir de l'environnement
}

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');

export default defineConfig({
	schema: './src/lib/server/db/schema.ts',
	dialect: 'postgresql',
	dbCredentials: { url: process.env.DATABASE_URL },
	verbose: true,
	strict: true
});
