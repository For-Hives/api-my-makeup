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
  updateMakeupArtist: async (user, json) => {
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

    if (!existing || existing.length !== 1) {
      throw new Error("Makeup artist does not exist for this user");
    }

    // update the makeup artist linked to user
    let updated = await strapi.entityService.update(
      "api::makeup-artiste.makeup-artiste",
      existing[0].id, // id of makeup artist linked to user
      {
        data: json,
      }
    );

    return strapi.entityService.findOne(
      "api::makeup-artiste.makeup-artiste",
      updated.id,
      {
        populate: "*",
      }
    );
  },
  meMakeupArtist: async (user) => {
    if (!user) {
      throw new Error("User not found");
    }

    // find if makeup artist already exists for user
    const existing = await strapi.entityService.findMany(
      "api::makeup-artiste.makeup-artiste",
      {
        populate: {
          main_picture: {
            populate: "*",
          },
          skills: {
            populate: "*",
          },
          experiences: {
            populate: "*",
          },
          courses: {
            populate: "*",
          },
          service_offers: {
            populate: "*",
          },
          network: {
            populate: "*",
          },
          language: {
            populate: "*",
          },
          user: {
            populate: "*",
          },
          image_gallery: {
            populate: "*",
          },
        },
        filters: {
          user: {
            id: {
              $eq: user.id,
            },
          },
        },
      }
    );

    if (!existing || existing.length !== 1) {
      throw new Error("Makeup artist does not exist for this user");
    }

    // return the makeup artist linked to user
    return existing;
  },
};
