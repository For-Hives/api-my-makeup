# 🚀 Getting started with Strapi

## 📦 Requirements

- [Node.js](https://nodejs.org/en/download/)
- [Yarn](https://yarnpkg.com/getting-started/install)
- [Docker](https://docs.docker.com/get-docker/)
- [Minio](https://docs.min.io/docs/minio-docker-quickstart-guide.html)
- [Caprover](https://caprover.com/docs/get-started.html)
- [Docker Hub](https://hub.docker.com/)
- [Postgres Docker](https://hub.docker.com/_/postgres)

## 🧰 Development

Start your Strapi application with autoReload
enabled. [Learn more](https://docs.strapi.io/developer-docs/latest/developer-resources/cli/CLI.html#strapi-develop)

```
yarn develop
```

## ⚙️ Deployment

### CI / CD environments variables

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

### Docker environments variables

| Variable            | Description                                   |
| ------------------- | --------------------------------------------- |
| `HOST`              | Straip host listener                          |
| `PORT`              | Straip port listener                          |
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


---

## Install dev mode, with my-makeup app too
1. clone the repo, and the my-makeup repo
2. run bun install in my-makeup
3. run yarn install in api-my-makeup
4. add the .env file in api-my-makeup
    with the following content:
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
4. run yarn develop in api-my-makeup
add the .env file in my-makeup
    with the following content:
```
NEXTAUTH_SECRET="nextauthsecret"
NEXT_PUBLIC_API_URL=http://localhost:1337
NEXT_PUBLIC_URL=http://localhost:3000/
NEXT_PUBLIC_DATABASE_URL=sqlite:///home/andycinquin/ClonedRepo/api-my-makeup/.tmp/data.db
NEXTAUTH_URL=http://localhost:3000/
```
5. change the 'NEXT_PUBLIC_DATABASE_URL' path to the path of the api-my-makeup .tmp/data.db file (you can find it in the api-my-makeup folder)
6. go to localhost:1337/admin and create a user 
7. run bun dev in my-makeup
8. go to localhost:3000/auth/signup and create a user (wath ever you want)
9. follow the stepper
10. at the last step, you will get an error, it's "normal"
11. go to localhost:1337/admin and go in settings
12. go in roles and permissions
13. go in public and check all the boxes in "makeup-artists"
14. then go in authenticated and check all the boxes everywhere
15. then go back to localhost:3000/auth/signup and follow the stepper
16. you should be able to create a makeup artist now
