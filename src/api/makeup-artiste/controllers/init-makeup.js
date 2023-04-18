"use strict";

/**
 * A set of functions called "actions" for `init-makeup`
 */

module.exports = {
  async initMakeup(ctx, next) {
    try {
      const { json } = ctx.request.body;

      const data = await strapi
        .service("api::makeup-artiste.init-makeup")
        .createMakeupArtist(ctx.state.user, json);

      ctx.body = data;
    } catch (err) {
      console.log(err);
      ctx.badRequest("Init Makeup artist controller error", {
        moreDetails: err,
      });
    }
  },
  async updateMakeup(ctx, next) {
    try {
      const { json } = ctx.request.body;

      const data = await strapi
        .service("api::makeup-artiste.init-makeup")
        .createMakeupArtist(ctx.state.user, json);

      ctx.body = data;
    } catch (err) {
      console.log(err);
      ctx.badRequest("Init Makeup artist controller error", {
        moreDetails: err,
      });
    }
  },
};
