'use strict';

/**
 * A set of functions called "actions" for `init-makeup`
 */

module.exports = {
  async initMakeup(ctx, next) {
    try {

      console.log("initMakeup controller called")
      console.log(ctx.request.body);

      const { test } = ctx.request.body;

      const data = await strapi
        .service("api::makeup-artiste.init-makeup")
        .createMakeupArtist(test);

      console.log(data, "data");

      ctx.body = data;

    } catch (err) {
      ctx.badRequest("Post report controller error", { moreDetails: err });
    }
  }
};
