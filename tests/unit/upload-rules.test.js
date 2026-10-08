const { describe, it, expect } = require("@jest/globals");
const {
  MAX_UPLOAD_BYTES,
  checkUploadFile,
  checkUploadRequest,
  sniffImageType,
  withTypeExtension,
} = require("../../src/utils/upload-rules");

const bytes = (...values) => Uint8Array.from(values);
const text = (value) => Uint8Array.from(Buffer.from(value, "latin1"));

const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46);
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0);
const WEBP = text("RIFF\x24\x00\x00\x00WEBPVP8 ");

describe("sniffImageType", () => {
  it.each([
    ["JPEG", JPEG, "image/jpeg"],
    ["PNG", PNG, "image/png"],
    ["WebP", WEBP, "image/webp"],
    ["AVIF", text("\x00\x00\x00\x20ftypavif"), null],
    ["HEIC", text("\x00\x00\x00\x18ftypheic"), null],
    ["SVG", text("<svg xmlns="), null],
    ["PDF", text("%PDF-1.7\n"), null],
    ["RIFF that is not WebP (WAV)", text("RIFF\x24\x00\x00\x00WAVEfmt "), null],
    ["empty", bytes(), null],
    ["truncated PNG", bytes(0x89, 0x50, 0x4e), null],
  ])("%s", (_label, head, expected) => {
    expect(sniffImageType(head)).toBe(expected);
  });
});

describe("checkUploadFile", () => {
  it("accepts a picture and returns the type read from it", () => {
    expect(
      checkUploadFile({ type: "image/jpeg", size: 2_000_000, head: PNG })
    ).toEqual({ status: 200, message: "ok", type: "image/png" });
  });

  it("accepts exactly 10 MB and refuses one byte more", () => {
    expect(
      checkUploadFile({
        type: "image/jpeg",
        size: MAX_UPLOAD_BYTES,
        head: JPEG,
      }).status
    ).toBe(200);
    expect(
      checkUploadFile({
        type: "image/jpeg",
        size: MAX_UPLOAD_BYTES + 1,
        head: JPEG,
      }).status
    ).toBe(413);
  });

  it.each([
    ["an SVG type", "image/svg+xml", JPEG],
    ["a missing type", undefined, JPEG],
    ["an AVIF type", "image/avif", JPEG],
    ["SVG content declared as PNG", "image/png", text("<svg xmlns=")],
  ])("refuses %s", (_label, type, head) => {
    expect(checkUploadFile({ type, size: 10, head }).status).toBe(400);
  });
});

describe("checkUploadRequest", () => {
  it("accepts files with or without fileInfo", () => {
    expect(checkUploadRequest({ query: {}, body: {} })).toBeNull();
    expect(
      checkUploadRequest({ query: {}, body: { fileInfo: "{}" } })
    ).toBeNull();
    expect(checkUploadRequest({})).toBeNull();
  });

  it("refuses to replace or edit a file by id", () => {
    expect(checkUploadRequest({ query: { id: "3" }, body: {} }).status).toBe(
      403
    );
  });

  it("refuses ref, refId, field and path", () => {
    expect(
      checkUploadRequest({
        query: {},
        body: { ref: "x", refId: "1", field: "main_picture", path: "../x" },
      })
    ).toEqual({
      status: 400,
      message: "Unexpected upload fields: ref, refId, field, path",
    });
  });
});

describe("withTypeExtension", () => {
  it.each([
    ["x.html", "image/jpeg", "x.jpg"],
    ["photo.JPEG", "image/jpeg", "photo.jpg"],
    ["portrait.png", "image/webp", "portrait.webp"],
    ["no-extension", "image/png", "no-extension.png"],
    ["archive.tar.gz", "image/png", "archive.tar.png"],
    [undefined, "image/jpeg", "image.jpg"],
    [".htaccess", "image/png", "image.png"],
  ])("%s as %s -> %s", (name, type, expected) => {
    expect(withTypeExtension(name, type)).toBe(expected);
  });
});
