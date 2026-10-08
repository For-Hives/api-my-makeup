// S13: POST /api/upload takes JPEG, PNG and WebP pictures up to 10 MB, read
// from their content, and nothing else: no SVG, AVIF, HEIC, PDF or video,
// no replacing an existing file, no attaching the file to an entry.
const { describe, it, expect, beforeAll, afterAll } = require("@jest/globals");
const sharp = require("sharp");
const { setupStrapi, stopStrapi } = require("../helpers/strapi");
const { http, createAccount } = require("../helpers/fixtures");

const FILE_UID = "plugin::upload.file";

// Noise compresses badly: a 1400 x 1400 JPEG of noise weighs about 2 MB
const noise = (width, height) => {
  const pixels = Buffer.alloc(width * height * 3);
  let seed = 42;
  for (let i = 0; i < pixels.length; i++) {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    pixels[i] = seed >> 16;
  }
  return sharp(pixels, { raw: { width, height, channels: 3 } });
};

const svg = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
);
const isoMedia = (brand) =>
  Buffer.concat([
    Buffer.from([0, 0, 0, 0x20]),
    Buffer.from(`ftyp${brand}`),
    Buffer.alloc(64),
  ]);
const pdf = Buffer.from("%PDF-1.4\n%fictional\n");

describe("POST /api/upload", () => {
  let artist;
  let other;
  let jpeg;
  let png;
  let webp;
  let avif;
  const uploaded = [];

  const upload = (buffer, filename, contentType) =>
    http()
      .post("/api/upload")
      .set("Authorization", `Bearer ${artist.jwt}`)
      .attach("files", buffer, { filename, contentType });

  const fileCount = () => strapi.query(FILE_UID).count();

  beforeAll(async () => {
    await setupStrapi();
    artist = await createAccount("uploader", { first_name: "Photo" });
    other = await createAccount("victim", { first_name: "Victime" });

    jpeg = await noise(1400, 1400).jpeg({ quality: 95 }).toBuffer();
    png = await noise(40, 40).png().toBuffer();
    webp = await noise(40, 40).webp().toBuffer();
    avif = await noise(40, 40).avif().toBuffer();
  }, 60000);

  afterAll(async () => {
    const service = strapi.plugin("upload").service("upload");
    for (const file of uploaded) {
      await service.remove(await service.findOne(file.id));
    }
    await stopStrapi();
  });

  it("S13 - accepts a 2 MB JPEG", async () => {
    expect(jpeg.length).toBeGreaterThan(1.5 * 1024 * 1024);
    expect(jpeg.length).toBeLessThan(3 * 1024 * 1024);

    const response = await upload(jpeg, "mariage.jpg", "image/jpeg").expect(
      200
    );
    uploaded.push(...response.body);

    expect(response.body).toHaveLength(1);
    expect(response.body[0].mime).toBe("image/jpeg");
    expect(response.body[0].url).toMatch(/^\/uploads\/.+\.jpg$/);
  });

  it.each([
    ["PNG", () => png, "portrait.png", "image/png"],
    ["WebP", () => webp, "portrait.webp", "image/webp"],
  ])("S13 - accepts a %s", async (_label, buffer, filename, type) => {
    const response = await upload(buffer(), filename, type).expect(200);
    uploaded.push(...response.body);

    expect(response.body[0].mime).toBe(type);
  });

  it("S13 - stores the type read from the content, not the declared one", async () => {
    const response = await upload(png, "portrait.jpg", "image/jpeg").expect(
      200
    );
    uploaded.push(...response.body);

    expect(response.body[0].mime).toBe("image/png");
    expect(response.body[0].ext).toBe(".png");
  });

  it("S13 - stores a picture named .html with the extension of its content", async () => {
    const response = await upload(png, "page.html", "image/png").expect(200);
    uploaded.push(...response.body);

    expect(response.body[0].mime).toBe("image/png");
    expect(response.body[0].ext).toBe(".png");
    expect(response.body[0].url).not.toMatch(/\.html$/);
  });

  it.each([
    ["SVG", () => svg, "logo.svg", "image/svg+xml"],
    ["SVG declared as PNG", () => svg, "logo.png", "image/png"],
    ["AVIF", () => avif, "photo.avif", "image/avif"],
    ["AVIF declared as JPEG", () => avif, "photo.jpg", "image/jpeg"],
    ["HEIC", () => isoMedia("heic"), "IMG_0001.HEIC", "image/heic"],
    ["PDF", () => pdf, "cv.pdf", "application/pdf"],
    ["PDF declared as JPEG", () => pdf, "cv.jpg", "image/jpeg"],
    ["MP4 video", () => isoMedia("isom"), "video.mp4", "video/mp4"],
  ])("S13 - refuses %s", async (_label, buffer, filename, type) => {
    const before = await fileCount();

    const response = await upload(buffer(), filename, type).expect(400);

    expect(response.body.error.message).toBe(
      "Only JPEG, PNG and WebP pictures can be uploaded"
    );
    expect(await fileCount()).toBe(before);
  });

  it("S13 - refuses a 12 MB file", async () => {
    const before = await fileCount();
    const big = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
      Buffer.alloc(12 * 1024 * 1024),
    ]);

    await upload(big, "grande.jpg", "image/jpeg").expect(413);

    expect(await fileCount()).toBe(before);
  });

  it("refuses to replace an existing file (?id=)", async () => {
    const [target] = uploaded;
    const before = await strapi
      .query(FILE_UID)
      .findOne({ where: { id: target.id } });

    await http()
      .post(`/api/upload?id=${target.id}`)
      .set("Authorization", `Bearer ${artist.jwt}`)
      .attach("files", png, { filename: "x.png", contentType: "image/png" })
      .expect(403);
    await http()
      .post(`/api/upload?id=${target.id}`)
      .set("Authorization", `Bearer ${artist.jwt}`)
      .field("fileInfo", JSON.stringify({ name: "renamed" }))
      .expect(403);

    const after = await strapi
      .query(FILE_UID)
      .findOne({ where: { id: target.id } });
    expect(after.hash).toBe(before.hash);
    expect(after.name).toBe(before.name);
  });

  it("refuses to attach the file to an entry (ref, refId, field)", async () => {
    const before = await fileCount();

    await http()
      .post("/api/upload")
      .set("Authorization", `Bearer ${artist.jwt}`)
      .field("ref", "api::makeup-artiste.makeup-artiste")
      .field("refId", String(other.profile.id))
      .field("field", "main_picture")
      .attach("files", png, { filename: "x.png", contentType: "image/png" })
      .expect(400);

    expect(await fileCount()).toBe(before);
  });

  it("refuses visitors without an account", async () => {
    await http()
      .post("/api/upload")
      .attach("files", png, { filename: "x.png", contentType: "image/png" })
      .expect(403);
  });
});
