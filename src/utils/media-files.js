"use strict";

/**
 * Files of the upload plugin sent from the artist space: who sent them,
 * whether anything uses them, and their removal (database row and stored
 * object, R2 in production).
 *
 * uploaded_by (src/extensions/upload/strapi-server.js) holds the account
 * that sent a file through POST /api/upload, and is null for the admin's
 * uploads and for every file sent before it existed.
 */

const _ = require("lodash");

const FILE_UID = "plugin::upload.file";

// SQLite refuses queries with too many bound values
const CHUNK_SIZE = 500;

/**
 * Integer ids, without duplicates.
 *
 * @param {Array<unknown>} ids
 * @returns {number[]}
 */
const uniqueIds = (ids) =>
  _.uniq((ids ?? []).map(Number).filter((id) => Number.isInteger(id)));

/**
 * Ids of the files of media fields as entityService returns them (one file,
 * a list of files, or null).
 *
 * @param {...(object|object[]|null|undefined)} media
 * @returns {number[]}
 */
const mediaIds = (...media) =>
  uniqueIds(
    media.flatMap((value) => [].concat(value ?? []).map((file) => file?.id))
  );

/**
 * The ids among `ids` of the files that an entry still uses (main picture,
 * gallery, article picture...), read from the join table of the `related`
 * relation of the files. A row left behind by an entry deleted without its
 * links (Strapi 4.26 on Postgres, see deleteMakeupArtist) counts as a use:
 * such a file is kept, never removed by mistake.
 *
 * @param {object} strapi
 * @param {number[]} ids
 * @returns {Promise<Set<number>>}
 */
const referencedFileIds = async (strapi, ids) => {
  const { joinTable } = strapi.db.metadata.get(FILE_UID).attributes.related;
  const column = joinTable.joinColumn.name;
  const referenced = new Set();

  for (const chunk of _.chunk(uniqueIds(ids), CHUNK_SIZE)) {
    const rows = await strapi.db
      .queryBuilder(joinTable.name)
      .select([column])
      .where({ [column]: { $in: chunk } })
      .execute({ mapResults: false });
    rows.forEach((row) => referenced.add(Number(row[column])));
  }

  return referenced;
};

/**
 * The file as the upload plugin must see it to delete its stored object.
 *
 * The plugin only deletes the object of a file sent by the current
 * provider. Files sent before R2 (provider minio-for-strapi-v4, 44 profile
 * pictures in October 2026) are served from the root of the same bucket:
 * when the file and each of its formats are served from the public R2 URL
 * at <hash><ext>, they are given to the current provider with that key.
 * Any other file keeps its provider, and only its row is deleted.
 *
 * @param {object} file - Row of plugin::upload.file
 * @param {{ provider?: string, providerOptions?: object }} uploadConfig
 * @returns {object}
 */
const storageFile = (file, { provider, providerOptions } = {}) => {
  if (!file || !provider || file.provider === provider) {
    return file;
  }

  const publicUrl = String(
    providerOptions?.cloudflarePublicAccessUrl ?? ""
  ).replace(/\/+$/, "");
  const atBucketRoot = (item) =>
    Boolean(publicUrl) &&
    typeof item?.hash === "string" &&
    typeof item?.ext === "string" &&
    item.url === `${publicUrl}/${item.hash}${item.ext}`;
  const formats = Object.values(file.formats ?? {});

  if (!atBucketRoot(file) || !formats.every(atBucketRoot)) {
    return file;
  }

  const atRoot = (item) => ({ ...item, path: undefined, folderPath: "/" });

  return {
    ...atRoot(file),
    provider,
    formats: file.formats ? _.mapValues(file.formats, atRoot) : file.formats,
  };
};

/**
 * Files that could not be removed: the media sweep retries those with
 * uploaded_by set. A file sent before that column (uploaded_by null) gets
 * `ownerId` when given, the artist whose picture it was; any file still
 * without one is logged for a manual cleanup. Never throws.
 *
 * @param {object} strapi
 * @param {number[]} ids
 * @param {string} reason
 * @param {number} [ownerId]
 */
const leaveForSweep = async (strapi, ids, reason, ownerId) => {
  try {
    if (ownerId) {
      await strapi.db.query(FILE_UID).updateMany({
        where: { id: { $in: ids }, uploaded_by: { $null: true } },
        data: { uploaded_by: ownerId },
      });
    }
    const untracked = await strapi.db.query(FILE_UID).findMany({
      select: ["id"],
      where: { id: { $in: ids }, uploaded_by: { $null: true } },
    });
    const manual = untracked.map((row) => Number(row.id));
    const swept = ids.filter((id) => !manual.includes(id));

    if (swept.length > 0) {
      strapi.log.warn(
        `[media] ${reason}: left for the next media sweep: ${swept.join(", ")}`
      );
    }
    if (manual.length > 0) {
      strapi.log.error(
        `[media] manual cleanup: ${reason}: the media sweep skips files ${manual.join(
          ", "
        )} (no uploaded_by)`
      );
    }
  } catch (error) {
    strapi.log.error(
      `[media] manual cleanup: ${reason}: files ${ids.join(", ")}: ${
        error.message
      }`
    );
  }
};

/**
 * Removes the files that nothing uses any more, with their stored objects
 * (R2 in production), through the upload plugin. A file still used by an
 * entry is kept. A failure is logged with the file id and never thrown:
 * callers run after their own change succeeded. A file that could not be
 * removed is left for the media sweep (see leaveForSweep).
 *
 * @param {object} strapi
 * @param {number[]} ids
 * @param {string} reason - Short label for the logs
 * @param {{ ownerId?: number }} [options] - ownerId: the artist whose
 *   pictures these were, given to a failed file sent before uploaded_by
 * @returns {Promise<{ removed: number[], kept: number[], failed: number[] }>}
 */
const removeUnusedFiles = async (strapi, ids, reason, { ownerId } = {}) => {
  const result = { removed: [], kept: [], failed: [] };
  const candidates = uniqueIds(ids);

  if (candidates.length === 0) {
    return result;
  }

  let referenced;
  let upload;
  let uploadConfig;
  try {
    referenced = await referencedFileIds(strapi, candidates);
    upload = strapi.plugin("upload").service("upload");
    uploadConfig = strapi.config.get("plugin.upload");
  } catch (error) {
    strapi.log.error(
      `[media] ${reason}: could not check files ${candidates.join(", ")}: ${
        error.message
      }`
    );
    await leaveForSweep(strapi, candidates, reason, ownerId);
    return { ...result, failed: candidates };
  }

  for (const id of candidates) {
    if (referenced.has(id)) {
      result.kept.push(id);
      continue;
    }
    try {
      const file = await strapi.db.query(FILE_UID).findOne({ where: { id } });
      // already gone: nothing to do
      if (file) {
        await upload.remove(storageFile(file, uploadConfig));
        result.removed.push(id);
      }
    } catch (error) {
      result.failed.push(id);
      strapi.log.error(
        `[media] ${reason}: could not remove file ${id}: ${error.message}`
      );
    }
  }

  if (result.removed.length > 0) {
    strapi.log.info(
      `[media] ${reason}: removed ${
        result.removed.length
      } file(s): ${result.removed.join(", ")}`
    );
  }
  if (result.failed.length > 0) {
    await leaveForSweep(strapi, result.failed, reason, ownerId);
  }

  return result;
};

/**
 * Waits for `promise` at most `milliseconds`; past that, it goes on after
 * the caller returns. A slow or unreachable R2 must not hold the answer of
 * a profile already saved.
 *
 * @param {Promise<unknown>} promise - Must not reject
 * @param {number} milliseconds
 * @returns {Promise<void>}
 */
const waitAtMost = async (promise, milliseconds) => {
  let timer;
  try {
    await Promise.race([
      promise,
      new Promise((resolve) => {
        timer = setTimeout(resolve, milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
};

/**
 * Removes uploaded_by from the files of the media fields of a profile, in
 * place: entityService does not sanitize, and the column must not leave the
 * API.
 *
 * @param {object} profile
 * @param {string[]} fields - Media fields of the profile
 * @returns {object} the same profile
 */
const hideUploader = (profile, fields) => {
  fields.forEach((field) => {
    [].concat(profile?.[field] ?? []).forEach((file) => {
      if (file && typeof file === "object") {
        delete file.uploaded_by;
      }
    });
  });
  return profile;
};

module.exports = {
  FILE_UID,
  hideUploader,
  mediaIds,
  referencedFileIds,
  removeUnusedFiles,
  storageFile,
  uniqueIds,
  waitAtMost,
};
