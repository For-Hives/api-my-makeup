"use strict";

/**
 * init-makeup service
 */

module.exports = {
  createMakeupArtist: async (user) => {
    if (!user) {
      throw new Error("User not found");
    }

    // find if makeup artist already exists for user
    const existing = await strapi.entityService.findMany(
      "api::makeup-artiste.makeup-artiste",
      {
        fields: ["id"],
        filters: {
          user: {
            id: {
              $eq: user.id,
            },
          },
        },
      }
    );

    if (existing && existing.length > 0) {
      throw new Error("Makeup artist already exists for this user");
    }

    // create a new makeup artist for user id

    return strapi.entityService.create("api::makeup-artiste.makeup-artiste", {
      data: {
        user: {
          connect: [{ id: user.id }],
        },
      },
    });
  },
};
