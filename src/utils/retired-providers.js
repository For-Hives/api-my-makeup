"use strict";

/**
 * Sign-in providers the site no longer offers. Their accounts have no
 * password, and Strapi's password login only looks for provider=local
 * accounts: once such an account gets a password (forgotten password, then
 * reset), it becomes a local account so that the password works.
 * Google is not listed: Google sign-in still works and its accounts keep it.
 */
const RETIRED_PROVIDERS = ["facebook"];

/**
 * Users lifecycle: before an update that sets a password, switch an account
 * of a retired provider to local.
 *
 * @param {object} strapi
 */
const subscribeRetiredProviders = (strapi) => {
  strapi.db.lifecycles.subscribe({
    models: ["plugin::users-permissions.user"],
    async beforeUpdate(event) {
      const { data, where } = event.params;
      if (!data || !data.password || data.provider) {
        return;
      }

      const user = await strapi.db
        .query("plugin::users-permissions.user")
        .findOne({ where, select: ["id", "provider"] });

      if (user && RETIRED_PROVIDERS.includes(user.provider)) {
        data.provider = "local";
        strapi.log.info(
          `[auth] retired provider ${user.provider}: account switched to local on password set`
        );
      }
    },
  });
};

module.exports = { RETIRED_PROVIDERS, subscribeRetiredProviders };
