const Strapi = require("@strapi/strapi");
const fs = require("fs");
const path = require("path");
const _ = require("lodash");
const { expect } = require("@jest/globals");

let instance;

const sleep = (milliseconds) => {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
};

// One database per test file, named after it, so that jest can run the
// files in parallel (SQLite file, or Postgres database with TEST_DB_CLIENT).
const testDatabaseName = () => {
  const file = path.basename(expect.getState().testPath || "app", ".test.js");
  const slug = file.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 40);
  return `mm_${slug}_${process.pid}_test`;
};

// Postgres: the database is created before Strapi connects and dropped
// after. config/env/test/database.js has already refused any non local host
// or any name not ending with _test.
const withPostgresAdmin = async (connection, run) => {
  const { Client } = require("pg");
  const client = new Client({
    host: connection.host,
    port: connection.port,
    user: connection.user,
    password: connection.password,
    database: "postgres",
  });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
};

const dropDatabase = (client, name) =>
  client.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);

/**
 * Setups strapi for futher testing
 */
async function setupStrapi() {
  if (!instance) {
    process.env.STRAPI_TELEMETRY_DISABLED = "true";
    const name = testDatabaseName();
    process.env.TEST_DATABASE_NAME = name;
    if (!process.env.DATABASE_FILENAME) {
      process.env.DATABASE_FILENAME = `.tmp/${name}.db`;
    }

    const app = Strapi();
    const { client, connection } = app.config.get("database.connection");
    if (client === "postgres") {
      await withPostgresAdmin(connection, async (admin) => {
        await dropDatabase(admin, connection.database);
        await admin.query(`CREATE DATABASE "${connection.database}"`);
      });
    }

    await app.load();
    instance = app;

    await instance.server.mount();
  }
  return instance;
}

/**
 * Closes strapi after testing
 */
async function stopStrapi() {
  if (instance) {
    const { client, connection } = instance.config.get("database.connection");

    await instance.destroy();
    instance = undefined;

    if (client === "postgres") {
      await withPostgresAdmin(connection, (admin) =>
        dropDatabase(admin, connection.database)
      );
    } else if (connection.filename && fs.existsSync(connection.filename)) {
      fs.unlinkSync(connection.filename);
    }
  }
  return instance;
}

/**
 * Returns valid JWT token for authenticated
 * @param {String | number} idOrEmail, either user id, or email
 */
const jwt = (idOrEmail) =>
  strapi.plugins["users-permissions"].services.jwt.issue({
    [Number.isInteger(idOrEmail) ? "id" : "email"]: idOrEmail,
  });

/**
 * Grants database `permissions` table that role can access an endpoint/controllers
 *
 * @param {int} roleID, 1 Autentihected, 2 Public, etc
 * @param {string} value, in form or dot string eg `"permissions.users-permissions.controllers.auth.changepassword"`
 * @param {boolean} enabled, default true
 * @param {string} policy, default ''
 */
const grantPrivilege = async (
  roleID = 1,
  path,
  enabled = true,
  policy = ""
) => {
  const service = strapi.plugin("users-permissions").service("role");

  const role = await service.findOne(roleID);

  _.set(role.permissions, path, {enabled, policy});

  return service.updateRole(roleID, role);
};

/** Updates database `permissions` that role can access an endpoint
 * @see grantPrivilege
 */

const grantPrivileges = async (roleID = 1, values = []) => {
  await Promise.all(values.map((val) => grantPrivilege(roleID, val)));
};

/**
 * Updates the core of strapi
 * @param {*} pluginName
 * @param {*} key
 * @param {*} newValues
 * @param {*} environment
 */
const updatePluginStore = async (
  pluginName,
  key,
  newValues,
  environment = ""
) => {
  const pluginStore = strapi.store({
    environment: environment,
    type: "plugin",
    name: pluginName,
  });

  const oldValues = await pluginStore.get({key});
  const newValue = Object.assign({}, oldValues, newValues);

  return pluginStore.set({key: key, value: newValue});
};

/**
 * Get plugin settings from store
 * @param {*} pluginName
 * @param {*} key
 * @param {*} environment
 */
const getPluginStore = (pluginName, key, environment = "") => {
  const pluginStore = strapi.store({
    environment: environment,
    type: "plugin",
    name: pluginName,
  });

  return pluginStore.get({key});
};

/**
 * Check if response error contains error with given ID
 * @param {string} errorId ID of given error
 * @param {object} response Response object from strapi controller
 * @example
 *
 * const response =  {
      data: null,
      error: {
        status: 400,
        name: 'ApplicationError',
        message: 'Your account email is not confirmed',
        details: {}
      }
    }
 * responseHasError("ApplicationError", response) // true
 */
const responseHasError = (errorId, response) => {
  return response && response.error && response.error.name === errorId;
};

module.exports = {
  setupStrapi,
  stopStrapi,
  jwt,
  grantPrivilege,
  grantPrivileges,
  updatePluginStore,
  getPluginStore,
  responseHasError,
  sleep,
};
