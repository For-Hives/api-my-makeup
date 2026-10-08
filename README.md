# My-Makeup API 💄

![My-Makeup Logo](https://r2-andycinquin.andy-cinquin.fr/pres_mymakeup_0824c6b79e.webp)

## Project Overview

This is the backend API for My-Makeup, a platform connecting professional makeup artists with clients seeking personalized makeup services. The API is built with Strapi, providing a robust and flexible content management system.

## 📦 Requirements

- [Node.js](https://nodejs.org/en/download/)
- [Yarn](https://yarnpkg.com/getting-started/install)
- [Docker](https://docs.docker.com/get-docker/)
- [Minio](https://docs.min.io/docs/minio-docker-quickstart-guide.html)
- [Caprover](https://caprover.com/docs/get-started.html)
- [Docker Hub](https://hub.docker.com/)
- [Postgres Docker](https://hub.docker.com/_/postgres)

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

   S3_BUCKET='bucket'
   S3_ACCESS_KEY_ID='ACCESS_KEY_ID'
   S3_ACCESS_SECRET='S3_ACCESS_SECRET'
   S3_ENDPOINT='localhost'
   S3_SSL=false
   S3_PORT=9000
   ```

5. Run the development server:
   ```
   yarn develop
   ```

6. Go to `localhost:1337/admin` and create an admin user.

## ⚙️ Deployment

### CI / CD Environment Variables

| Variable          | Description         |
| ----------------- | ------------------- |
| `APP_URL`         | Caprover app url    |
| `APP_NAME`        | Caprover app name   |
| `APP_TOKEN`       | Caprover app token  |
| `DOCKER_USERNAME` | Docker hub username |
| `DOCKER_PASSWORD` | Docker hub password |
| `APP_IMAGE`       | Docker image name   |
| `S3_ENDPOINT`     | Minio endpoint      |
| `S3_PORT`         | Minio port          |
| `S3_SSL`          | Minio ssl enable    |

### Docker Environment Variables

| Variable            | Description                                   |
| ------------------- | --------------------------------------------- |
| `HOST`              | Strapi host listener                          |
| `PORT`              | Strapi port listener                          |
| `APP_KEY`           | Set the application key                       |
| `API_TOKEN_SALT`    | Set the API token salt                        |
| `ADMIN_JWT_SECRET`  | Set the admin JWT secret                      |
| `DB_CLIENT`         | Set the database client ( postgres / sqlite ) |
| `DATABASE_HOST`     | Set the database host                         |
| `DATABASE_PORT`     | Set the database port                         |
| `DATABASE_NAME`     | Set the database name                         |
| `DATABASE_USERNAME` | Set the database username                     |
| `DATABASE_PASSWORD` | Set the database password                     |
| `S3_ENDPOINT`       | Minio endpoint                                |
| `S3_PORT`           | Minio port                                    |
| `S3_SSL`            | Minio ssl enable                              |
| `S3_BUCKET`         | Minio bucket name                             |
| `S3_ACCESS_KEY_ID`  | Minio access key id                           |
| `S3_ACCESS_SECRET`  | Minio access secret                           |

## 🧪 Tests

The jest suite boots Strapi once per test file, each file on its own
database, so files run in parallel.

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
