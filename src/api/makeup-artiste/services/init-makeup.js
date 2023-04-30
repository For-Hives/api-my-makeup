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

    // Prepare update data
    const updateData = {
      speciality: json.speciality,
      city: json.city,
      action_radius: json.action_radius,
      score: json.score,
      mileage_charge: json.mileage_charge,
      available: json.available,
      description: json.description,
      last_name: json.last_name,
      first_name: json.first_name,
      skills: json.skills,
      network: json.network,
      experiences: json.experiences,
      courses: json.courses,
      service_offers: json.service_offers,
      image_gallery: json.image_gallery,
      main_picture: json.main_picture,
      language: json.language,
    };

    // update the makeup artist linked to user
    return strapi.entityService.update(
      "api::makeup-artiste.makeup-artiste",
      existing[0].id, // id of makeup artist linked to user
      {
        data: updateData,
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
