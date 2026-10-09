"use strict";

/**
 * init-makeup service
 */

const _ = require("lodash");
const { hideUploader } = require("../../../utils/media-files");

const PROFILE_UID = "api::makeup-artiste.makeup-artiste";

const MEDIA_FIELDS = ["main_picture", "image_gallery"];

// Fields an artist may change on her profile. Anything else in the PATCH
// body (pro, score, username, user, timestamps...) is ignored.
const EDITABLE_FIELDS = [
  "first_name",
  "last_name",
  "company_artist_name",
  "speciality",
  "city",
  "action_radius",
  "available",
  "description",
  "skills",
  "experiences",
  "courses",
  "language",
  "network",
  "service_offers",
  "main_picture",
  "image_gallery",
];

// The account as returned with the profile: never its password hash or
// tokens (entityService does not sanitize, every user field would come out).
const ACCOUNT_FIELDS = ["id", "username", "email"];

/**
 * Keeps only the fields an artist may change on her profile.
 * @param {object} json - PATCH body
 * @returns {object}
 */
const pickEditableFields = (json) =>
  _.isPlainObject(json) ? _.pick(json, EDITABLE_FIELDS) : {};

module.exports = {
  EDITABLE_FIELDS,
  pickEditableFields,
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
        speciality: "",
        city: "",
        network: {},
        description: "",
        username: user.username,
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
        data: pickEditableFields(json),
      }
    );

    // Same shape as populate: "*" without createdBy/updatedBy, which
    // returned the admin users (email, bcrypt hash, resetPasswordToken).
    const profile = await strapi.entityService.findOne(
      "api::makeup-artiste.makeup-artiste",
      updated.id,
      {
        populate: {
          main_picture: true,
          skills: true,
          experiences: true,
          courses: true,
          service_offers: true,
          network: true,
          language: true,
          user: { fields: ACCOUNT_FIELDS },
          image_gallery: true,
        },
      }
    );

    return hideUploader(profile, MEDIA_FIELDS);
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
          // Media scalars only, and the user without its createdBy/updatedBy:
          // populate: "*" on them returned the admin users (email, bcrypt
          // hash, resetPasswordToken).
          main_picture: true,
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
            fields: ACCOUNT_FIELDS,
          },
          image_gallery: true,
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
    return hideUploader(existing[0], MEDIA_FIELDS);
  },

  deleteMakeupArtist: async (user) => {
    if (!user) {
      throw new Error("User not found");
    }

    // One transaction: if the profile cannot be deleted, the account stays
    // (it used to be deleted anyway, leaving an orphan profile), and the
    // other way round. An account without a profile can still be deleted.
    await strapi.db.transaction(async () => {
      const profiles = await strapi.entityService.findMany(PROFILE_UID, {
        fields: ["id"],
        filters: {
          user: {
            id: {
              $eq: user.id,
            },
          },
        },
      });

      for (const profile of profiles) {
        await strapi.entityService.delete(PROFILE_UID, profile.id);
      }

      await strapi.plugins["users-permissions"].services.user.remove({
        id: user.id,
      });
    });

    // return 200
    return { message: "User deleted" };
  },
};
