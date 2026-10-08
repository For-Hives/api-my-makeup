"use strict";

/**
 * A set of functions called "actions" for `searching`
 */

module.exports = {
  searchMakeup: async (ctx, next) => {
    try {
      const params = ctx.request.query;

      const data = await strapi
        .service("api::searching.searching")
        .searchPublicMakeup(params);

      ctx.body = data;
    } catch (err) {
      ctx.badRequest("searching error", {
        moreDetails: err.message,
      });
    }
  },
};
