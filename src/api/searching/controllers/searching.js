"use strict";

/**
 * A set of functions called "actions" for `searching`
 */

module.exports = {
  searchMakeup: async (ctx, next) => {
    try {
      const data = await strapi
        .service("api::searching.searching")
        .searchingMakeup(ctx.state.user, json);

      ctx.body = "ok";
    } catch (err) {
      ctx.body = err;
    }
  },
};
