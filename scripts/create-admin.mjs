// Crée l'invitation du tout premier administrateur.
// Usage : npm run create-admin -- prenom.nom@idixus.com
//
// Le mot de passe maître est choisi dans le navigateur (jamais dans ce terminal) via le lien affiché.
import { createHash, randomBytes } from 'node:crypto';
import postgres from 'postgres';

const email = process.argv[2]?.trim().toLowerCase();
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
	console.error('Usage : npm run create-admin -- email@idixus.com');
	process.exit(1);
}
if (!process.env.DATABASE_URL) {
	console.error('DATABASE_URL manquant (lancez via npm run create-admin).');
	process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL);
try {
	const [{ count }] =
		await sql`select count(*)::int as count from users where app_role = 'admin' and activated_at is not null`;
	if (count > 0 && !process.argv.includes('--force')) {
		console.error(
			'Un administrateur existe déjà. Invitez les autres depuis l’interface (ou ajoutez --force).'
		);
		process.exit(1);
	}

	const token = randomBytes(32).toString('base64url');
	const tokenHash = createHash('sha256').update(token).digest('hex');
	await sql`delete from invitations where email = ${email} and used_at is null`;
	await sql`
		insert into invitations (email, token_hash, role, invited_by, expires_at)
		values (${email}, ${tokenHash}, 'admin', null, now() + interval '48 hours')`;

	const appUrl = (process.env.APP_URL || 'http://localhost:5173').replace(/\/$/, '');
	console.log(`\nInvitation administrateur créée pour ${email} (valable 48 h, usage unique) :\n`);
	console.log(`  ${appUrl}/invite/${token}\n`);
	console.log('Ouvrez ce lien pour choisir votre mot de passe maître et activer le compte.');
} finally {
	await sql.end();
}
