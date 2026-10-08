"use strict";

const { syncRolePermissions } = require("./utils/permissions");

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
  },

  /**
   * An asynchronous bootstrap function that runs before
   * your application gets started.
   *
   * This gives you an opportunity to set up your data model,
   * run jobs, or perform some special logic.
   */
  async bootstrap({ strapi }) {
    // Public and Authenticated permissions come from config/permissions.js
    if (process.env.PERMISSIONS_SYNC === "false") {
      strapi.log.warn(
        "[permissions] PERMISSIONS_SYNC=false: role permissions left as they are in the database"
      );
    } else {
      await syncRolePermissions(strapi, strapi.config.get("permissions"));
    }
  },
};
