import { defineEnvVars } from '@sveltejs/kit/env';

const optional = (value: string | undefined) => (value ? value : undefined);

export const variables = defineEnvVars({
	DATABASE_URL: { description: 'The database connection string.' },
	SESSION_SECRET: {
		description:
			'Secret serveur (>= 32 caractères) pour les HMAC. Générer avec: openssl rand -hex 32',
		schema: (value) => {
			if (!value || value.length < 32)
				throw new Error('SESSION_SECRET doit faire au moins 32 caractères');
			return value;
		}
	},
	APP_URL: {
		description: "URL publique de l'application, utilisée dans les liens d'invitation.",
		schema: (value) => (value || 'http://localhost:5173').replace(/\/$/, '')
	},
	ALLOWED_EMAIL_DOMAIN: {
		description: 'Domaine email autorisé pour les invitations (vide = tous).',
		schema: (value) => (value === undefined ? 'idixus.com' : value.replace(/^@/, '').toLowerCase())
	},
	SMTP_HOST: {
		description: 'Serveur SMTP. Vide = emails écrits dans .dev-mail.log',
		schema: optional
	},
	SMTP_PORT: {
		description: 'Port SMTP',
		schema: (value) => (value ? Number(value) : 587)
	},
	SMTP_USER: { description: 'Utilisateur SMTP', schema: optional },
	SMTP_PASSWORD: { description: 'Mot de passe SMTP', schema: optional },
	SMTP_FROM: {
		description: 'Expéditeur des emails',
		schema: (value) => value || 'Idixus Vault <no-reply@idixus.com>'
	},
	SMTP_SECURE: {
		description: 'true pour TLS implicite (port 465)',
		schema: (value) => value === 'true'
	}
});
