"use strict";

const {
  DEFAULT_RESET_PASSWORD_URL,
  emailSenders,
  syncEmailSettings,
  wantedEmailSettings,
} = require("./utils/email-settings");
const { syncRolePermissions } = require("./utils/permissions");
const { subscribeRetiredProviders } = require("./utils/retired-providers");

module.exports = {
  /**
   * An asynchronous register function that runs before
   * your application is initialized.
   *
   * This gives you an opportunity to extend code.
   */
  register({ strapi }) {
    // With proxy: true (config/server.js), trust only the LAST entry of
    // X-Forwarded-For, the one Traefik adds: the entries before it come
    // from the client and are free to lie.
    strapi.server.app.maxIpsCount = 1;

    // The documentation plugin (development only) generates the core
    // routes of each API, never the custom ones: /me-makeup comes from its
    // own file
    const documentation = strapi.plugin("documentation");
    if (documentation) {
      documentation.service("override").registerOverride({
        paths: require("./api/makeup-artiste/documentation/1.0.0/me-makeup.json"),
      });
    }
  },

  /**
   * An asynchronous bootstrap function that runs before
   * your application gets started.
   *
   * This gives you an opportunity to set up your data model,
   * run jobs, or perform some special logic.
   */
  async bootstrap({ strapi }) {
    // Former Facebook accounts sign in with a password once they set one
    subscribeRetiredProviders(strapi);

    // Public and Authenticated permissions come from config/permissions.js
    if (process.env.PERMISSIONS_SYNC === "false") {
      strapi.log.warn(
        "[permissions] PERMISSIONS_SYNC=false: role permissions left as they are in the database"
      );
    } else {
      await syncRolePermissions(strapi, strapi.config.get("permissions"));
    }

    // Reset link and email templates come from src/utils/email-settings.js
    if (process.env.EMAIL_SETTINGS_SYNC === "false") {
      strapi.log.warn(
        "[email-settings] EMAIL_SETTINGS_SYNC=false: email settings left as they are in the database"
      );
    } else {
      await syncEmailSettings(
        strapi,
        wantedEmailSettings({
          ...emailSenders(process.env, strapi.config.get("plugin.email")),
          resetPasswordUrl:
            process.env.FRONT_RESET_PASSWORD_URL || DEFAULT_RESET_PASSWORD_URL,
        })
      );
    }
  },
};
