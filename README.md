# My-Makeup API 💄

![My-Makeup Logo](https://r2-andycinquin.andy-cinquin.fr/pres_mymakeup_0824c6b79e.webp)

## Project Overview

This is the backend API for My-Makeup, a platform connecting professional makeup artists with clients seeking personalized makeup services. The API is built with Strapi, providing a robust and flexible content management system.

## 📦 Requirements

- [Node.js](https://nodejs.org/en/download/) 20 (`.nvmrc`; Strapi 4 refuses Node 22)
- [Yarn](https://yarnpkg.com/getting-started/install) 1, with the committed `yarn.lock`
- [Docker](https://docs.docker.com/get-docker/) or Podman, for the image and a test Postgres

## 🧰 Development

Start your Strapi application with autoReload enabled:

```
yarn develop
```

## Getting Started

### Installation

1. Clone the repository:
   ```
   git clone https://github.com/For-Hives/api-my-makeup.git
   ```

2. Navigate to the project directory:
   ```
   cd api-my-makeup
   ```

3. Install dependencies:
   ```
   yarn install
   ```

4. Create a `.env` file in the root directory with the following content:
   ```
   HOST=0.0.0.0
   PORT=1337
   APP_KEYS=key1,key2
   API_TOKEN_SALT=salt_key
   ADMIN_JWT_SECRET=secret
   JWT_SECRET=secret

   DB_CLIENT='sqlite'
   DB_FILENAME=".tmp/data.db"

   CORS_ORIGINS=http://localhost:3000
   ```

   `.env.example` lists the other variables (Cloudflare R2, Postgres,
   Mailgun).

5. Run the development server:
   ```
   yarn develop
   ```

6. Go to `localhost:1337/admin` and create an admin user.

## ⚙️ Deployment

Production runs on Coolify, which builds the `Dockerfile` (multi-stage,
`node:20-bookworm-slim`, `USER node`) from `main`. The image healthcheck
is `node /app/scripts/healthcheck.js` (`GET /_health` → 204).

The CI (`.github/workflows/build-only.yml`, job `just-build`) installs the
locked dependencies on Node 20, builds the admin panel, runs the jest
suite on a Postgres service and builds the image, on every pull request
and push to `main`. It deploys nothing.

### Docker Environment Variables

| Variable                | Description                                                      |
| ----------------------- | ---------------------------------------------------------------- |
| `HOST`                  | Strapi host listener                                             |
| `PORT`                  | Strapi port listener                                             |
| `APP_KEYS`              | Application keys                                                 |
| `API_TOKEN_SALT`        | API token salt                                                   |
| `ADMIN_JWT_SECRET`      | Admin JWT secret                                                 |
| `JWT_SECRET`            | users-permissions JWT secret                                     |
| `DB_CLIENT`             | Database client (`postgres` in the image)                        |
| `DATABASE_HOST`         | Database host                                                    |
| `DATABASE_PORT`         | Database port                                                    |
| `DATABASE_NAME`         | Database name                                                    |
| `DATABASE_USERNAME`     | Database username                                                |
| `DATABASE_PASSWORD`     | Database password                                                |
| `CF_*`                  | Cloudflare R2 upload provider (`.env.example`)                   |
| `CORS_ORIGINS`          | Browser origins, comma separated (default: the two my-makeup.fr) |
| `MAILGUN_API_KEY`       | With `MAILGUN_DOMAIN`, sends emails through Mailgun              |
| `MAILGUN_DOMAIN`        | Mailgun sending domain                                           |
| `MAILGUN_REGION`        | `eu` (default) or `us`                                           |
| `EMAIL_FROM`            | Default sender (default: `no-reply@<MAILGUN_DOMAIN>`)            |
| `EMAIL_REPLY_TO`        | Default reply-to (default: the sender)                           |
| `DOCUMENTATION_ENABLED` | `true` serves `/documentation` outside development               |
| `PERMISSIONS_SYNC`      | `false` skips applying `config/permissions.js` at start          |

## 🧪 Tests

The jest suite boots Strapi once per test file, each file on its own
database, so files run in parallel. Strapi needs `APP_KEYS`, `JWT_SECRET`,
`ADMIN_JWT_SECRET` and `API_TOKEN_SALT` to start (any fake value, from `.env`
or the environment, as in `.github/workflows/build-only.yml`); without them
every file fails and its SQLite database stays in `.tmp/`.

- SQLite (default): `yarn test`
- Postgres, like production and the CI:

  ```
  docker run -d --name api-test-pg -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:16-alpine
  TEST_DB_CLIENT=postgres TEST_DATABASE_HOST=127.0.0.1 TEST_DATABASE_PASSWORD=postgres yarn test
  ```

Only `TEST_*` variables choose the test database, never `DATABASE_*`, and
`config/env/test/database.js` refuses any host other than `localhost`,
`127.0.0.1`, `::1` or `postgres`. Each file creates then drops a
`mm_<file>_<pid>_test` database.

## Full Stack Development Setup

To set up both the API and the My-Makeup frontend app:

1. Clone both repositories (api-my-makeup and my-makeup).
2. Follow the installation steps for the API as described above.
3. For the frontend (my-makeup):
   - Run `bun install` in the my-makeup directory.
   - Create a `.env` file with the following content:
     ```
     NEXTAUTH_SECRET="nextauthsecret"
     NEXT_PUBLIC_API_URL=http://localhost:1337
     NEXT_PUBLIC_URL=http://localhost:3000/
     NEXT_PUBLIC_DATABASE_URL=sqlite:///path/to/api-my-makeup/.tmp/data.db
     NEXTAUTH_URL=http://localhost:3000/
     ```
   - Replace the `NEXT_PUBLIC_DATABASE_URL` path with the actual path to your api-my-makeup `.tmp/data.db` file.
4. Start both servers:
   - API: `yarn develop` in the api-my-makeup directory
   - Frontend: `bun dev` in the my-makeup directory
5. Nothing to tick in Settings > Roles & Permissions: the Public and
   Authenticated permissions are declared in `config/permissions.js` and
   applied at every start (anything else ticked on these two roles is
   removed). Change that file, not the admin. `PERMISSIONS_SYNC=false`
   skips the sync, for an emergency change made from the admin.


## Contact

For more information about the My-Makeup API or to report issues, please open an issue in this repository or contact the development team at [contact@andy-cinquin.fr]
