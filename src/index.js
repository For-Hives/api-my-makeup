"use strict";

const { syncRolePermissions } = require("./utils/permissions");

module.exports = {
  /**
   * An asynchronous register function that runs before
   * your application is initialized.
   *
   * This gives you an opportunity to extend code.
   */
  register(/*{ strapi }*/) {},

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
