"use strict";

/**
 * Daily sweep of the pictures sent from the artist space and never put on a
 * profile (UI-03): a save that failed before the modal was closed, another
 * pick after a failed save, an upload whose answer could not be read, a tab
 * closed during a save. Scheduled by config/server.js.
 *
 * Only files with uploaded_by set, used by no entry and older than 24 h are
 * eligible. Files with uploaded_by null (everything sent before this column,
 * the admin's media, article and talent pictures) are never touched.
 *
 * MEDIA_SWEEP chooses what a run does:
 * - delete (default): removes at most MAX_REMOVALS_PER_RUN eligible files,
 *   database row and stored object (R2 in production);
 * - log (also for any unknown value, so that a typo deletes nothing): logs
 *   the count and the ids of the eligible files, deletes nothing;
 * - off: nothing.
 * MEDIA_REMOVAL=log (src/utils/media-files.js) keeps every file as well.
 */

const {
  FILE_UID,
  referencedFileIds,
  removeUnusedFiles,
} = require("./media-files");

const SWEEP_MODES = ["off", "log", "delete"];
const DEFAULT_SWEEP_MODE = "delete";
const MIN_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_REMOVALS_PER_RUN = 50;

/**
 * Reads MEDIA_SWEEP.
 *
 * @param {string|undefined} value
 * @returns {{ mode: string, unknown: boolean }} unknown is true when the
 *   value was not one of off, log or delete (the mode is then log)
 */
const sweepMode = (value) => {
  const mode = String(value ?? "")
    .trim()
    .toLowerCase();

  if (mode === "") {
    return { mode: DEFAULT_SWEEP_MODE, unknown: false };
  }
  if (SWEEP_MODES.includes(mode)) {
    return { mode, unknown: false };
  }
  return { mode: "log", unknown: true };
};

/**
 * Ids of the eligible files, oldest first: uploaded_by set, created before
 * `now - minAgeMs`, used by no entry.
 *
 * @param {object} strapi
 * @param {{ now?: Date, minAgeMs?: number }} [options]
 * @returns {Promise<number[]>}
 */
const findOrphanUploads = async (
  strapi,
  { now = new Date(), minAgeMs = MIN_AGE_MS } = {}
) => {
  const rows = await strapi.db.query(FILE_UID).findMany({
    select: ["id"],
    where: {
      uploaded_by: { $notNull: true },
      createdAt: { $lt: new Date(now.getTime() - minAgeMs) },
    },
    orderBy: { id: "asc" },
  });
  const ids = rows.map((row) => Number(row.id));
  const used = await referencedFileIds(strapi, ids);

  return ids.filter((id) => !used.has(id));
};

/**
 * One run of the sweep. Logs one "[media-sweep]" line in every mode, and
 * never throws.
 *
 * @param {object} strapi
 * @param {{ mode?: string, now?: Date, limit?: number }} [options] - mode
 *   defaults to MEDIA_SWEEP
 * @returns {Promise<{ mode: string, eligible: number[], removed: number[],
 *   failed: number[] }>}
 */
const sweepOrphanMedia = async (
  strapi,
  { mode: requestedMode, now = new Date(), limit = MAX_REMOVALS_PER_RUN } = {}
) => {
  const { mode, unknown } = sweepMode(
    requestedMode === undefined ? process.env.MEDIA_SWEEP : requestedMode
  );
  const result = { mode, eligible: [], removed: [], failed: [] };

  if (unknown) {
    strapi.log.warn(
      "[media-sweep] unknown MEDIA_SWEEP value, running in log mode (off, log or delete)"
    );
  }

  if (mode === "off") {
    strapi.log.info("[media-sweep] off (MEDIA_SWEEP=off): nothing checked");
    return result;
  }

  try {
    result.eligible = await findOrphanUploads(strapi, { now });
    const batch = result.eligible.slice(0, limit);

    if (mode === "log") {
      strapi.log.info(
        `[media-sweep] log mode: ${
          result.eligible.length
        } orphan upload(s) older than 24 h, removed 0${
          batch.length > 0 ? `, would remove: ${batch.join(", ")}` : ""
        }`
      );
      return result;
    }

    const { removed, failed, logged } = await removeUnusedFiles(
      strapi,
      batch,
      "media sweep"
    );
    result.removed = removed;
    result.failed = failed;
    strapi.log.info(
      `[media-sweep] removed ${removed.length} of ${
        result.eligible.length
      } orphan upload(s) older than 24 h (at most ${limit} per run)${
        failed.length > 0 ? `, failed: ${failed.join(", ")}` : ""
      }${
        logged.length > 0
          ? `, kept by MEDIA_REMOVAL=log: ${logged.join(", ")}`
          : ""
      }`
    );
  } catch (error) {
    strapi.log.error(`[media-sweep] failed: ${error.message}`);
  }

  return result;
};

module.exports = {
  MAX_REMOVALS_PER_RUN,
  MIN_AGE_MS,
  findOrphanUploads,
  sweepMode,
  sweepOrphanMedia,
};
