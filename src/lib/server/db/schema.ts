import { sql } from 'drizzle-orm';
import {
	pgTable,
	pgEnum,
	uuid,
	text,
	integer,
	boolean,
	timestamp,
	jsonb,
	primaryKey,
	index,
	uniqueIndex
} from 'drizzle-orm/pg-core';

/**
 * Le serveur ne stocke que des données chiffrées ou des empreintes.
 * Jamais de mot de passe maître, de clé privée ni de contenu d'entrée en clair.
 */

export const appRole = pgEnum('app_role', ['admin', 'member']);
export const spaceKind = pgEnum('space_kind', ['personal', 'shared']);
export const spaceRole = pgEnum('space_role', ['admin', 'member']);
export const otpPurpose = pgEnum('otp_purpose', ['signup', 'login', 'recovery']);

export const users = pgTable('users', {
	id: uuid('id').primaryKey().defaultRandom(),
	email: text('email').notNull().unique(),
	name: text('name').notNull(),
	appRole: appRole('app_role').notNull().default('member'),
	/** Argon2id du `authKey` envoyé par le client (jamais le mot de passe maître). */
	authHash: text('auth_hash').notNull(),
	kdfSalt: text('kdf_salt').notNull(),
	kdfParams: jsonb('kdf_params').$type<{ opslimit: number; memlimit: number }>().notNull(),
	publicKey: text('public_key').notNull(),
	/** Clé privée chiffrée par la KEK (JSON { nonce, ciphertext }). */
	encPrivateKey: jsonb('enc_private_key').$type<{ nonce: string; ciphertext: string }>().notNull(),
	/** Clé privée chiffrée par la clé de récupération, affichée une seule fois à l'inscription. */
	encPrivateKeyRecovery: jsonb('enc_private_key_recovery').$type<{
		nonce: string;
		ciphertext: string;
	}>(),
	/** Renseigné une fois le code OTP d'inscription validé. Un compte non activé ne peut pas se connecter. */
	activatedAt: timestamp('activated_at', { withTimezone: true }),
	disabledAt: timestamp('disabled_at', { withTimezone: true }),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

/** Invitation envoyée par un admin. Seul le hash du jeton est conservé. */
export const invitations = pgTable(
	'invitations',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		email: text('email').notNull(),
		tokenHash: text('token_hash').notNull().unique(),
		role: appRole('role').notNull().default('member'),
		/** null pour l'invitation du tout premier admin (créée par `npm run create-admin`). */
		invitedBy: uuid('invited_by').references(() => users.id),
		expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
		usedAt: timestamp('used_at', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [index('invitations_email_idx').on(t.email)]
);

/** Code à 6 chiffres envoyé par email (SMTP). Seul son hash est stocké. */
export const otpCodes = pgTable(
	'otp_codes',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		/** Utilisateur pour une connexion ; null à l'inscription (rattaché à l'invitation). */
		userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
		invitationId: uuid('invitation_id').references(() => invitations.id, { onDelete: 'cascade' }),
		purpose: otpPurpose('purpose').notNull(),
		codeHash: text('code_hash').notNull(),
		attempts: integer('attempts').notNull().default(0),
		expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
		consumedAt: timestamp('consumed_at', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [index('otp_user_idx').on(t.userId), index('otp_invitation_idx').on(t.invitationId)]
);

export const sessions = pgTable(
	'sessions',
	{
		/** Hash SHA-256 du jeton de session présent dans le cookie. */
		id: text('id').primaryKey(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		/** false tant que le code OTP n'a pas été validé. */
		mfaVerified: boolean('mfa_verified').notNull().default(false),
		ip: text('ip'),
		userAgent: text('user_agent'),
		expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [index('sessions_user_idx').on(t.userId)]
);

export const spaces = pgTable(
	'spaces',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		name: text('name').notNull(),
		kind: spaceKind('kind').notNull(),
		createdBy: uuid('created_by')
			.notNull()
			.references(() => users.id),
		/** Incrémentée à chaque rotation de la clé d'espace. */
		keyVersion: integer('key_version').notNull().default(1),
		/** Un membre a été retiré sans rotation : un admin de l'espace doit renouveler la clé. */
		needsRotation: boolean('needs_rotation').notNull().default(false),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [
		// Un seul coffre personnel par utilisateur
		uniqueIndex('spaces_one_personal_per_user')
			.on(t.createdBy)
			.where(sql`${t.kind} = 'personal'`)
	]
);

export const spaceMembers = pgTable(
	'space_members',
	{
		spaceId: uuid('space_id')
			.notNull()
			.references(() => spaces.id, { onDelete: 'cascade' }),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		role: spaceRole('role').notNull().default('member'),
		/** Clé d'espace enveloppée avec la clé publique du membre (sealed box, base64). */
		wrappedSpaceKey: text('wrapped_space_key').notNull(),
		keyVersion: integer('key_version').notNull().default(1),
		addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [
		primaryKey({ columns: [t.spaceId, t.userId] }),
		index('space_members_user_idx').on(t.userId)
	]
);

export const entries = pgTable(
	'entries',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		spaceId: uuid('space_id')
			.notNull()
			.references(() => spaces.id, { onDelete: 'cascade' }),
		/** Titre, identifiant, mot de passe, URL et notes sont tous dans ce blob chiffré. */
		nonce: text('nonce').notNull(),
		ciphertext: text('ciphertext').notNull(),
		keyVersion: integer('key_version').notNull(),
		updatedBy: uuid('updated_by')
			.notNull()
			.references(() => users.id),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [index('entries_space_idx').on(t.spaceId)]
);
