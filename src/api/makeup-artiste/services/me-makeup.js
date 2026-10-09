"use strict";

/**
 * init-makeup service
 */

const _ = require("lodash");
const {
  FILE_UID,
  hideUploader,
  mediaIds,
  referencedFileIds,
  removeUnusedFiles,
  uniqueIds,
  waitAtMost,
} = require("../../../utils/media-files");

const PROFILE_UID = "api::makeup-artiste.makeup-artiste";

const MEDIA_FIELDS = ["main_picture", "image_gallery"];

// Code of the error thrown for a file the artist may not put on her profile
// (the controller answers 400 "File not allowed")
const FILE_NOT_ALLOWED = "FILE_NOT_ALLOWED";

// How long an answer waits for the removal of her old files (R2); a
// slower removal finishes after the answer
const REMOVAL_WAIT_MS = 5000;

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

/**
 * File ids asked for in the media fields of a PATCH body: an id, an
 * { id } object, or a list of them; null or an empty list empties the
 * field.
 *
 * @param {object} fields - Editable fields of the PATCH body
 * @returns {{ ids: number[], valid: boolean }} valid is false when a value
 *   is not a file id (connect/disconnect objects included)
 */
const requestedFileIds = (fields) => {
  const values = MEDIA_FIELDS.filter((field) => field in fields).flatMap(
    (field) => [].concat(fields[field] ?? [])
  );
  const ids = values.map((value) =>
    _.isPlainObject(value) && Object.keys(value).length === 1 ? value.id : value
  );
  const valid = ids.every(
    (id) =>
      (Number.isInteger(id) && id > 0) ||
      (typeof id === "string" && /^[1-9][0-9]*$/.test(id))
  );

  return { ids: valid ? uniqueIds(ids) : [], valid };
};

/**
 * Ownership rule of the pictures of a profile (UI-03): a requested file is
 * allowed when it is already on her profile, or when she uploaded it and
 * nothing uses it yet. Any other file (another artist's picture, an article
 * picture, an admin upload, an unknown id) is refused.
 *
 * @param {object} input
 * @param {number} input.userId - Her account
 * @param {number[]} input.currentIds - Files on her profile now
 * @param {number[]} input.requestedIds - Files asked for in the PATCH
 * @param {Array<{ id: number, uploaded_by: number|null, used: boolean }>}
 *   input.files - Rows of the requested files that exist, with whether an
 *   entry uses them
 * @returns {number[]} the refused ids, empty when everything is allowed
 */
const refusedFileIds = ({ userId, currentIds, requestedIds, files }) => {
  const current = new Set(uniqueIds(currentIds));
  const byId = new Map(files.map((file) => [Number(file.id), file]));

  return uniqueIds(requestedIds).filter((id) => {
    if (current.has(id)) {
      return false;
    }
    const file = byId.get(id);
    return !(
      file &&
      file.uploaded_by !== null &&
      file.uploaded_by !== undefined &&
      Number(file.uploaded_by) === Number(userId) &&
      !file.used
    );
  });
};

const fileNotAllowed = (ids) => {
  const error = new Error("File not allowed");
  error.code = FILE_NOT_ALLOWED;
  error.fileIds = ids;
  return error;
};

/**
 * Throws FILE_NOT_ALLOWED unless every file of the media fields of the
 * PATCH may go on her profile (see refusedFileIds).
 */
const checkRequestedFiles = async (user, profile, fields) => {
  const { ids, valid } = requestedFileIds(fields);

  if (!valid) {
    throw fileNotAllowed([]);
  }

  const currentIds = mediaIds(profile.main_picture, profile.image_gallery);
  const unknown = ids.filter((id) => !currentIds.includes(id));

  if (unknown.length === 0) {
    return;
  }

  const rows = await strapi.db.query(FILE_UID).findMany({
    select: ["id", "uploaded_by"],
    where: { id: { $in: unknown } },
  });
  const used = await referencedFileIds(strapi, unknown);
  const refused = refusedFileIds({
    userId: user.id,
    currentIds,
    requestedIds: ids,
    files: rows.map((row) => ({ ...row, used: used.has(Number(row.id)) })),
  });

  if (refused.length > 0) {
    throw fileNotAllowed(refused);
  }
};

const PROFILE_MEDIA_POPULATE = {
  main_picture: { fields: ["id"] },
  image_gallery: { fields: ["id"] },
};

module.exports = {
  EDITABLE_FIELDS,
  FILE_NOT_ALLOWED,
  pickEditableFields,
  refusedFileIds,
  requestedFileIds,
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

    // find if makeup artist already exists for user, with her pictures
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
        populate: PROFILE_MEDIA_POPULATE,
      }
    );

    if (!existing || existing.length !== 1) {
      throw new Error("Makeup artist does not exist for this user");
    }

    const fields = pickEditableFields(json);
    // before writing anything: only her own pictures
    await checkRequestedFiles(user, existing[0], fields);

    // update the makeup artist linked to user, in one transaction: Strapi
    // 4.26 deletes the stored components of a section before it writes the
    // new ones, outside any transaction, so a value the database refuses (a
    // date sent as "") answered 400 after her stored sections were emptied
    let updated = await strapi.db.transaction(() =>
      strapi.entityService.update(
        "api::makeup-artiste.makeup-artiste",
        existing[0].id, // id of makeup artist linked to user
        {
          data: fields,
        }
      )
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

    // A replaced or removed picture is deleted for good (R2 included),
    // once the profile is saved, unless another entry uses it
    const kept = new Set(
      mediaIds(profile?.main_picture, profile?.image_gallery)
    );
    const dropped = mediaIds(
      existing[0].main_picture,
      existing[0].image_gallery
    ).filter((id) => !kept.has(id));
    await waitAtMost(
      removeUnusedFiles(strapi, dropped, "replaced picture", {
        ownerId: user.id,
      }),
      REMOVAL_WAIT_MS
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
    // Her pictures and the files she uploaded are listed inside it and
    // removed once it is committed: a failed deletion keeps them all.
    const fileIds = await strapi.db.transaction(async () => {
      const profiles = await strapi.entityService.findMany(PROFILE_UID, {
        fields: ["id"],
        filters: {
          user: {
            id: {
              $eq: user.id,
            },
          },
        },
        populate: PROFILE_MEDIA_POPULATE,
      });
      const uploads = await strapi.db.query(FILE_UID).findMany({
        select: ["id"],
        where: { uploaded_by: user.id },
      });

      for (const profile of profiles) {
        // Pictures detached first: on Postgres, Strapi 4.26 deletes an
        // entry without its rows in files_related_morphs (deleteRelations
        // stops at its first relation when the database has foreign keys),
        // and the files would look used for ever. Query layer: no
        // entry.update event (webhooks) for a deletion
        await strapi.db.query(PROFILE_UID).update({
          where: { id: profile.id },
          data: { main_picture: null, image_gallery: [] },
        });
        await strapi.entityService.delete(PROFILE_UID, profile.id);
      }

      await strapi.plugins["users-permissions"].services.user.remove({
        id: user.id,
      });

      return mediaIds(
        ...profiles.flatMap((profile) => [
          profile.main_picture,
          profile.image_gallery,
        ]),
        uploads
      );
    });

    await waitAtMost(
      removeUnusedFiles(strapi, fileIds, "deleted account", {
        ownerId: user.id,
      }),
      REMOVAL_WAIT_MS
    );

    // return 200
    return { message: "User deleted" };
  },
};
