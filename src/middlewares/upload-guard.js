"use strict";

/**
 * Guard of the public upload route (POST /api/upload), attached by
 * src/extensions/upload/strapi-server.js. The admin media library does not
 * go through it.
 *
 * Refusals are answered, not thrown: strapi::body then deletes the
 * temporary files of the request.
 *
 * Accepted files get the account that sent them in uploaded_by, the column
 * that lets her put them on her profile and lets the media sweep remove
 * them if she never does (src/utils/media-sweep.js).
 */

const fs = require("fs/promises");
const {
  checkUploadFile,
  checkUploadRequest,
  withTypeExtension,
} = require("../utils/upload-rules");
const {
  FILE_UID,
  removeUnusedFiles,
  uniqueIds,
} = require("../utils/media-files");

const readHead = async (filePath) => {
  const handle = await fs.open(filePath, "r");
  try {
    const { buffer, bytesRead } = await handle.read(Buffer.alloc(12), 0, 12, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
};

/**
 * Writes uploaded_by on the files the upload route just created. If that
 * fails, the files are removed (nobody could ever attach them) and the
 * request fails.
 */
const recordUploader = async (ctx) => {
  const userId = ctx.state.user?.id;
  const ids = uniqueIds([].concat(ctx.body ?? []).map((file) => file?.id));

  if (!userId || ids.length === 0) {
    return;
  }

  try {
    await strapi.db.query(FILE_UID).updateMany({
      where: { id: { $in: ids } },
      data: { uploaded_by: userId },
    });
  } catch (error) {
    strapi.log.error(
      `[upload] could not record the uploader of files ${ids.join(", ")}: ${
        error.message
      }`
    );
    await removeUnusedFiles(strapi, ids, "upload without uploader");
    throw error;
  }
};

const refuse = (ctx, { status, message }) => {
  if (status === 413) {
    return ctx.payloadTooLarge(message);
  }
  if (status === 403) {
    return ctx.forbidden(message);
  }
  return ctx.badRequest(message);
};

module.exports = () => async (ctx, next) => {
  const requestProblem = checkUploadRequest({
    query: ctx.query,
    body: ctx.request.body,
  });

  if (requestProblem) {
    return refuse(ctx, requestProblem);
  }

  const files = Object.values(ctx.request.files ?? {}).flat();

  for (const file of files) {
    const result = checkUploadFile({
      type: file.type,
      size: file.size,
      head: await readHead(file.path),
    });

    if (result.status !== 200) {
      return refuse(ctx, result);
    }

    // store the type read from the content, not the one the client declared,
    // and the matching extension
    file.type = result.type;
    file.name = withTypeExtension(file.name, result.type);
  }

  await next();

  if (ctx.status >= 200 && ctx.status < 300) {
    await recordUploader(ctx);
  }
};
