# Idixus Vault

Gestionnaire de mots de passe interne d'Idixus, inspiré de LockPass. Chiffrement de bout en bout : le serveur ne voit jamais un mot de passe ni une clé en clair. Détails dans [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Fonctionnalités

- Coffre personnel et espaces partagés par équipe ou par projet
- Inscription **sur invitation** d'un admin (lien unique par email, valable 48 h)
- Double authentification par **code à 6 chiffres envoyé par email** (SMTP) à l'inscription et à chaque connexion
- Générateur de mots de passe, détection des mots de passe faibles et réutilisés (calcul local)
- Tableau de santé des mots de passe
- Retrait d'un membre = renouvellement automatique de la clé de l'espace
- Clé de récupération, changement de mot de passe maître, verrouillage automatique après 5 min

## Démarrage en développement

```sh
npm install
npm run db:start         # Postgres 16 (Docker) sur 127.0.0.1:5440
npm run db:migrate
npm run dev
```

Premier administrateur (aucun mot de passe n'est saisi dans le terminal) :

```sh
npm run create-admin -- prenom.nom@idixus.com
```

Ouvrir le lien affiché, choisir le mot de passe maître, noter la clé de récupération, valider le code reçu.

## Configuration (`.env`)

| Variable                                                                  | Rôle                                                                                                                          |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                                            | Connexion Postgres                                                                                                            |
| `SESSION_SECRET`                                                          | Secret serveur (≥ 32 caractères). `openssl rand -hex 32`. Ne jamais le changer sans prévenir : il invalide les codes en cours |
| `APP_URL`                                                                 | URL publique, utilisée dans les liens d'invitation                                                                            |
| `ALLOWED_EMAIL_DOMAIN`                                                    | Domaine autorisé pour les invitations (défaut `idixus.com`)                                                                   |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` / `SMTP_SECURE` | Serveur SMTP. `SMTP_HOST` vide = les emails sont écrits dans `.dev-mail.log`                                                  |
| `SMTP_FROM`                                                               | Expéditeur des emails                                                                                                         |

Sans SMTP configuré, les codes et invitations se lisent dans `.dev-mail.log` (développement uniquement).

## Tests

```sh
npm test            # unitaires : crypto, générateur, santé, limiteur
npm run check       # types
npm run lint
npm run test:e2e    # parcours complet contre un vrai serveur, sur la base dédiée vault_e2e
```

Le test e2e couvre : invitation, inscription, code email (usage unique, 5 essais max), coffre, partage, rotation de clé après retrait d'un membre, désactivation de compte, changement de mot de passe, récupération de compte, CSRF.

## Mise en production : points d'attention

- **HTTPS obligatoire** (les cookies de session passent en `Secure`, HSTS est envoyé). Le chiffrement côté client exige aussi un contexte sécurisé.
- Derrière un reverse proxy, définir `ORIGIN` (ex. `https://vault.idixus.com`) et `ADDRESS_HEADER=X-Forwarded-For` + `XFF_DEPTH` pour adapter-node : le contrôle CSRF et la limitation de débit par IP en dépendent.
- Définir `BODY_SIZE_LIMIT` (ex. `5M`) : la rotation de clé d'un gros espace envoie toutes les entrées en une requête.
- Le limiteur de tentatives est **en mémoire** : une seule instance du serveur. Pour plusieurs instances, le déplacer dans Redis ou Postgres.
- Sauvegarder la base Postgres : elle ne contient que des données chiffrées, mais la perdre revient à tout perdre.
- Changer le mot de passe Postgres de `compose.yaml` / `.env`, et ne pas exposer le port de la base.
- Lancer `npm run build` puis `node build` (adapter-node), avec les variables d'environnement ci-dessus.

## Limites connues

- Une personne retirée d'un espace a pu **voir et copier** les mots de passe avant son départ : la rotation protège l'avenir, pas le passé. Changer les mots de passe sensibles lors d'un départ.
- Un administrateur ne peut pas réinitialiser le mot de passe maître d'un collaborateur (conséquence du chiffrement de bout en bout) ; le collaborateur doit utiliser sa clé de récupération.
- Le code OTP par email protège contre un mot de passe volé, mais pas contre l'accès à la boîte mail. Une application d'authentification (TOTP) serait un renforcement.
- Pas encore : journal d'audit, extension navigateur, SSO, import KeePass, droits en lecture seule.
