"use strict";

/**
 * Guard of the public upload route (POST /api/upload), attached by
 * src/extensions/upload/strapi-server.js. The admin media library does not
 * go through it.
 *
 * Refusals are answered, not thrown: strapi::body then deletes the
 * temporary files of the request.
 */

const fs = require("fs/promises");
const {
  checkUploadFile,
  checkUploadRequest,
} = require("../utils/upload-rules");

const readHead = async (filePath) => {
  const handle = await fs.open(filePath, "r");
  try {
    const { buffer, bytesRead } = await handle.read(Buffer.alloc(12), 0, 12, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
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

    // store the type read from the content, not the one the client declared
    file.type = result.type;
  }

  return next();
};
