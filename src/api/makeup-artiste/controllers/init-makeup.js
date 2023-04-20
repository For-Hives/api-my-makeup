"use strict";

/**
 * A set of functions called "actions" for `init-makeup`
 */

module.exports = {
  async initMakeup(ctx, next) {
    try {
      const data = await strapi
        .service("api::makeup-artiste.init-makeup")
        .createMakeupArtist(ctx.state.user);

      ctx.body = data;
    } catch (err) {
      console.log(err);
      ctx.badRequest("Makeup artist initialisation error", {
        moreDetails: err.message,
      });
    }
  },
  async updateMakeup(ctx, next) {
    try {
      const { json } = ctx.request.body;

      const data = await strapi
        .service("api::makeup-artiste.init-makeup")
        .updateMakeupArtist(ctx.state.user, json);

      ctx.body = data;
    } catch (err) {
      console.log(err);
      ctx.badRequest("updating Makeup Artist error", {
        moreDetails: err.message,
      });
    }
  },
};
