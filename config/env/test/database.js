// Tests run on SQLite by default, or on a local Postgres when
// TEST_DB_CLIENT=postgres (tests/helpers/strapi.js gives each test file its
// own database). Only TEST_* variables are read here: DATABASE_* may point at
// a real database through .env, and the tests write and delete data.
const LOCAL_HOSTS = ["localhost", "127.0.0.1", "::1", "postgres"];

module.exports = ({ env }) => {
  if (env("TEST_DB_CLIENT", "sqlite") !== "postgres") {
    return {
      connection: {
        client: "sqlite",
        connection: {
          filename: env("DATABASE_FILENAME", ".tmp/test.db"),
        },
        useNullAsDefault: true,
        debug: false,
      },
    };
  }

  const host = env("TEST_DATABASE_HOST", "127.0.0.1");
  const database = env("TEST_DATABASE_NAME", "");

  if (!LOCAL_HOSTS.includes(host) || !database.endsWith("_test")) {
    throw new Error(
      `Refusing test database "${database}" on "${host}": expected a local host (${LOCAL_HOSTS.join(
        ", "
      )}) and a name ending with _test`
    );
  }

  return {
    connection: {
      client: "postgres",
      connection: {
        host,
        port: env.int("TEST_DATABASE_PORT", 5432),
        database,
        user: env("TEST_DATABASE_USERNAME", "postgres"),
        password: env("TEST_DATABASE_PASSWORD", "postgres"),
        ssl: false,
        schema: "public",
      },
      pool: { min: 0, max: 5 },
      debug: false,
    },
  };
};
