# Idixus Vault — architecture (MVP)

Gestionnaire de mots de passe interne pour les collaborateurs Idixus, inspiré de LockPass.
Principe : **zero-knowledge**. Le serveur ne voit jamais un mot de passe ni une clé en clair.

## Périmètre MVP

- Coffre personnel
- Espaces partagés (équipe / projet) avec membres
- Générateur de mots de passe
- Détection de mots de passe faibles / courts / réutilisés (calculée côté client, sans appel externe)

Hors MVP : rôles fins, journal d'audit, extension navigateur, SSO, comptes invités, import KeePass.

## Stack

- SvelteKit (Svelte 5) + TypeScript
- PostgreSQL (Docker Compose en dev, serveur Idixus en prod)
- Chiffrement côté client uniquement : Web Crypto API + libsodium (`libsodium-wrappers-sumo`, qui inclut Argon2id) ; pas de primitive maison
- Argon2id pour dériver la clé du mot de passe maître

## Modèle de chiffrement

| Clé                                 | Origine                                          | Rôle                                                  |
| ----------------------------------- | ------------------------------------------------ | ----------------------------------------------------- |
| Mot de passe maître                 | saisi par l'utilisateur, jamais envoyé           | —                                                     |
| `authKey`                           | KDF(Argon2id(mdp, sel), contexte "auth")         | prouve l'identité au serveur (le serveur la re-hache) |
| `KEK`                               | KDF(Argon2id(mdp, sel), contexte "kek")          | chiffre la clé privée de l'utilisateur                |
| Paire X25519 utilisateur            | générée à l'inscription                          | clé privée chiffrée par `KEK`, clé publique en clair  |
| Clé d'espace (`spaceKey`, 256 bits) | aléatoire à la création de l'espace              | chiffre les entrées de l'espace                       |
| `spaceKey` enveloppée               | sealed box avec la clé publique de chaque membre | une copie par membre                                  |
| Entrée (login, mdp, URL, notes)     | JSON chiffré XChaCha20-Poly1305 avec `spaceKey`  | stockée en blob opaque                                |

Le coffre personnel est un espace à un seul membre.
Ajouter un membre : le client déchiffre `spaceKey`, la ré-enveloppe avec la clé publique du nouveau membre.
Retirer un membre : **rotation** de `spaceKey` (nouvelle clé, ré-chiffrement des entrées, ré-enveloppe pour les membres restants).

## Schéma de données (Postgres)

- `users(id, email, name, app_role, auth_hash, kdf_salt, kdf_params, public_key, enc_private_key, enc_private_key_recovery, disabled_at)`
- `invitations(id, email, token_hash, invited_by, expires_at, used_at)`
- `otp_codes(id, user_id, invitation_id, purpose[signup|login], code_hash, attempts, expires_at, consumed_at)`
- `sessions(id = hash du jeton, user_id, mfa_verified, ip, user_agent, expires_at)`
- `spaces(id, name, kind[personal|shared], created_by, key_version)`, avec un seul coffre personnel par utilisateur
- `space_members(space_id, user_id, role[admin|member], wrapped_space_key, key_version)`
- `entries(id, space_id, nonce, ciphertext, key_version, updated_by, created_at, updated_at)`

Titre et URL restent dans le blob chiffré : le serveur ne peut ni chercher ni indexer ; la recherche se fait côté client.

## Décisions à confirmer

1. **Récupération** : MVP sans récupération admin. Une clé de récupération est affichée une fois à l'inscription ; perdue avec le mot de passe, le coffre personnel est perdu.
2. **Inscription** (validé) : l'admin invite par email (adresse `@idixus.com`). Le mail contient un lien à usage unique, valable 48 h. Le collaborateur choisit son mot de passe maître, puis finalise avec un code OTP reçu par email.
3. **2FA** (validé) : code OTP à 6 chiffres envoyé par email via le SMTP d'Idixus (remplace WhatsApp). Il sert à finaliser l'inscription et à valider chaque nouvelle connexion. Code valable 5 min, usage unique, 5 essais max, stocké sous forme de hash, rate limiting par compte et par IP. Le 2FA protège l'accès au serveur ; il ne remplace pas le mot de passe maître, qui seul déchiffre le coffre.
   - Limite connue : l'invitation et le code partent vers la même boîte mail. À l'inscription, le code prouve seulement que la boîte est contrôlée. Un TOTP (application d'authentification) reste l'amélioration à prévoir.
   - Configuration SMTP via variables d'environnement : `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`, `APP_URL`.
4. **Détection de fuite** (reporté, hors MVP) : contrôle HIBP en k-anonymity, à reconsidérer plus tard. Le MVP détecte seulement les mots de passe faibles, courts ou réutilisés, sans aucun appel externe.

## Étapes

1. ✅ Scaffold SvelteKit + Docker Compose Postgres (port 5440)
2. ✅ Module crypto (`src/lib/crypto/`) : Argon2id, XChaCha20-Poly1305, sealed boxes, clé de récupération
3. ✅ Invitation par email, inscription, code OTP par email (SMTP), connexion, sessions, récupération de compte
4. ✅ Coffre personnel : création, lecture, modification, suppression d'entrées chiffrées
5. ✅ Espaces partagés : création, membres, rôles, rotation de clé au retrait, désactivation de compte
6. ✅ Générateur + tableau de santé des mots de passe (faibles, réutilisés, anciens)
7. ✅ Sécurité : CSP, en-têtes, contrôle d'origine (CSRF), limitation de débit, verrouillage automatique, presse-papiers effacé après 30 s

Voir `README.md` pour l'exploitation, les points d'attention de mise en production et les limites connues.
