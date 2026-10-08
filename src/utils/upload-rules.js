"use strict";

/**
 * What a logged-in artist may send to POST /api/upload: pictures only.
 *
 * SVG (scripts), AVIF (the Next.js image optimizer RCE), HEIC, PDF and
 * videos are refused. The declared type is not enough, the first bytes of
 * the file must match.
 */

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

// The only body field the upload route needs (file name, alt, caption).
// ref, refId, field and path would attach the file to any entry or put it
// anywhere in the bucket.
const ALLOWED_BODY_FIELDS = ["fileInfo"];

const startsWith = (head, bytes, offset = 0) =>
  head.length >= offset + bytes.length &&
  bytes.every((byte, index) => head[offset + index] === byte);

const ascii = (text) => [...text].map((char) => char.charCodeAt(0));

/**
 * Recognizes a JPEG, PNG or WebP picture from its first 12 bytes.
 *
 * @param {Uint8Array} head - First bytes of the file
 * @returns {string|null} Its media type, or null for anything else
 */
const sniffImageType = (head) => {
  if (startsWith(head, [0xff, 0xd8, 0xff])) {
    return "image/jpeg";
  }
  if (startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png";
  }
  if (startsWith(head, ascii("RIFF")) && startsWith(head, ascii("WEBP"), 8)) {
    return "image/webp";
  }
  return null;
};

/**
 * Checks one uploaded file.
 *
 * @param {{ type?: string, size: number, head: Uint8Array }} file
 * @returns {{ status: number, message: string, type?: string }}
 *   status 200 with the detected type when the file is accepted
 */
const checkUploadFile = ({ type, size, head }) => {
  if (size > MAX_UPLOAD_BYTES) {
    return { status: 413, message: "The file is larger than 10 MB" };
  }

  const detected = sniffImageType(head);

  if (!ALLOWED_TYPES.includes(type) || !detected) {
    return {
      status: 400,
      message: "Only JPEG, PNG and WebP pictures can be uploaded",
    };
  }

  return { status: 200, message: "ok", type: detected };
};

/**
 * Checks the query and the body fields of an upload request.
 *
 * @param {{ query?: object, body?: object }} request
 * @returns {{ status: number, message: string }|null} null when accepted
 */
const checkUploadRequest = ({ query, body }) => {
  if (query && Object.prototype.hasOwnProperty.call(query, "id")) {
    return {
      status: 403,
      message: "Existing files cannot be replaced or edited here",
    };
  }

  const unknown = Object.keys(body ?? {}).filter(
    (field) => !ALLOWED_BODY_FIELDS.includes(field)
  );

  if (unknown.length > 0) {
    return {
      status: 400,
      message: `Unexpected upload fields: ${unknown.join(", ")}`,
    };
  }

  return null;
};

module.exports = {
  ALLOWED_TYPES,
  MAX_UPLOAD_BYTES,
  checkUploadFile,
  checkUploadRequest,
  sniffImageType,
};
