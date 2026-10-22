"use strict";

const { errors } = require("@strapi/utils");

const { ForbiddenError } = errors;

/**
 * Read-only mode of the API (LEGACY_READ_ONLY=true), for the freeze that
 * precedes the switch to the new site: reads, search and sign-in keep
 * working, every write and registration is refused with a 403.
 *
 * Permissions are re-applied at every start (src/utils/permissions.js), so
 * removing boxes by hand in the admin would not last. The mode is a view on
 * config/permissions.js, applied by the same sync: one variable and one
 * restart turn it on, the same restart without it turns it off.
 */

const READ_ONLY_MESSAGE = "The site is read-only for a maintenance";

// What stays open while the mode is on. Anything else of config/permissions.js
// is dropped: it either writes (profile, upload, registration, password
// reset, email confirmation) or has no reason to stay once nobody can write.
const KEPT_PUBLIC = [
  "api::article.article.find",
  "api::article.article.findOne",
  "api::talent.talent.find",
  "api::talent.talent.findOne",
  "api::makeup-artiste.makeup-artiste.find",
  "api::makeup-artiste.makeup-artiste.findOne",
  "api::searching.searching.searchMakeup",
  // sign-in: local password (POST /auth/local) and Google (connect, callback)
  "plugin::users-permissions.auth.callback",
  "plugin::users-permissions.auth.connect",
];
const KEPT_AUTHENTICATED = [
  "api::makeup-artiste.me-makeup.meMakeup",
  "plugin::users-permissions.user.me",
];

/**
 * @param {Record<string, string | undefined>} env
 * @returns {boolean} true only for the exact value "true"
 */
const isReadOnly = (env) => env.LEGACY_READ_ONLY === "true";

/**
 * @param {{ public: string[], authenticated: string[] }} wanted
 *   Permissions of config/permissions.js
 * @returns {{ public: string[], authenticated: string[] }} The same lists,
 *   reduced to the read and sign-in actions
 */
const readOnlyPermissions = (wanted) => ({
  public: wanted.public.filter((action) => KEPT_PUBLIC.includes(action)),
  authenticated: wanted.authenticated.filter((action) =>
    KEPT_AUTHENTICATED.includes(action)
  ),
});

/**
 * Users lifecycle: while the mode is on, no account is created by any path.
 * The public route is already refused by the permissions; this one stops
 * the account a Google sign-in would create (users-permissions registers it
 * when none matches), and an account added from the admin. The mode is read
 * at each call, so nothing is stored: a restart without the variable is
 * enough.
 *
 * @param {object} strapi
 */
const subscribeReadOnly = (strapi) => {
  strapi.db.lifecycles.subscribe({
    models: ["plugin::users-permissions.user"],
    beforeCreate() {
      if (isReadOnly(process.env)) {
        throw new ForbiddenError(READ_ONLY_MESSAGE);
      }
    },
  });
};

module.exports = {
  READ_ONLY_MESSAGE,
  isReadOnly,
  readOnlyPermissions,
  subscribeReadOnly,
};
