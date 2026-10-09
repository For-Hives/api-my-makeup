// UI-03: the daily sweep of the pictures sent from the artist space and
// never put on a profile. MEDIA_SWEEP=delete (the default) removes the files
// with uploaded_by set, used by nothing and older than 24 h, and never a
// file with uploaded_by null; log only logs. Local provider: never R2.
const fs = require("fs");
const path = require("path");
const {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  afterEach,
} = require("@jest/globals");
const { setupStrapi, stopStrapi } = require("../helpers/strapi");
const {
  http,
  createAccount,
  picture,
  uploadPicture,
} = require("../helpers/fixtures");
const {
  MAX_REMOVALS_PER_RUN,
  sweepMode,
  sweepOrphanMedia,
} = require("../../src/utils/media-sweep");

const FILE_UID = "plugin::upload.file";
const ARTICLE_UID = "api::article.article";
const DAY = 24 * 60 * 60 * 1000;

describe("media sweep", () => {
  let artist;
  let other;
  let seed = 0;
  const savedMode = process.env.MEDIA_SWEEP;

  const upload = async (account) =>
    uploadPicture(account.jwt, await picture(++seed));
  const fileRow = (file) =>
    strapi.query(FILE_UID).findOne({ where: { id: file.id } });
  const onDisk = (file) =>
    fs.existsSync(path.join(strapi.dirs.static.public, file.url));
  const age = (file, milliseconds) =>
    strapi.query(FILE_UID).update({
      where: { id: file.id },
      data: { createdAt: new Date(Date.now() - milliseconds) },
    });
  const exists = async (file) => (await fileRow(file)) !== null;

  // every kind of file the sweep meets
  let oldOrphan;
  let othersOldOrphan;
  let youngOrphan;
  let oldOnProfile;
  let oldInArticle;
  let oldWithoutUploader;
  let oldAdminUpload;

  // the admin media library: POST /upload, not the artist route
  const adminUpload = async () => {
    const superAdmin = await strapi.admin.services.role.getSuperAdmin();
    await strapi.admin.services.user.create({
      email: "sweep-admin@example.test",
      firstname: "Fictif",
      lastname: "Admin",
      password: "Fictional-Admin-1234",
      isActive: true,
      registrationToken: null,
      roles: [superAdmin.id],
    });
    const login = await http()
      .post("/admin/login")
      .send({
        email: "sweep-admin@example.test",
        password: "Fictional-Admin-1234",
      })
      .expect(200);
    const response = await http()
      .post("/upload")
      .set("Authorization", `Bearer ${login.body.data.token}`)
      .attach("files", await picture(++seed), {
        filename: "admin.png",
        contentType: "image/png",
      });
    expect([200, 201]).toContain(response.status);
    return response.body[0];
  };

  const logs = () => {
    const info = jest.spyOn(strapi.log, "info");
    const warn = jest.spyOn(strapi.log, "warn");
    return () =>
      [...info.mock.calls, ...warn.mock.calls]
        .map(([line]) => line)
        .filter((line) => String(line).startsWith("[media-sweep]"));
  };

  beforeAll(async () => {
    await setupStrapi();
    artist = await createAccount("sweep-artist", { first_name: "Photo" });
    other = await createAccount("sweep-other", { first_name: "Autre" });

    oldOrphan = await upload(artist);
    othersOldOrphan = await upload(other);
    youngOrphan = await upload(artist);
    oldOnProfile = await upload(artist);
    oldInArticle = await upload(artist);
    oldWithoutUploader = await upload(artist);
    oldAdminUpload = await adminUpload();

    await http()
      .patch("/api/me-makeup")
      .set("Authorization", `Bearer ${artist.jwt}`)
      .send({ main_picture: oldOnProfile.id })
      .expect(200);
    await strapi.entityService.create(ARTICLE_UID, {
      data: {
        title: "Article",
        content: "Contenu",
        author: "Equipe",
        seo_title: "Titre",
        seo_description: "Description",
        slug: "article-sweep",
        galery: [oldInArticle.id],
      },
    });
    // an admin upload, or a file sent before uploaded_by existed
    await strapi.query(FILE_UID).update({
      where: { id: oldWithoutUploader.id },
      data: { uploaded_by: null },
    });

    for (const file of [
      oldOrphan,
      othersOldOrphan,
      oldOnProfile,
      oldInArticle,
      oldWithoutUploader,
      oldAdminUpload,
    ]) {
      await age(file, 2 * DAY);
    }
    await age(youngOrphan, 23 * 60 * 60 * 1000);
  }, 60000);

  afterEach(() => {
    jest.restoreAllMocks();
    if (savedMode === undefined) {
      delete process.env.MEDIA_SWEEP;
    } else {
      process.env.MEDIA_SWEEP = savedMode;
    }
  });

  afterAll(async () => {
    const service = strapi.plugin("upload").service("upload");
    const files = await strapi.query(FILE_UID).findMany();
    for (const file of files) {
      await service.remove(file);
    }
    await stopStrapi();
  });

  it("an upload from the admin media library has no uploader", async () => {
    expect((await fileRow(oldAdminUpload)).uploaded_by).toBeNull();
    expect((await fileRow(oldOrphan)).uploaded_by).toBe(artist.user.id);
  });

  it("reads MEDIA_SWEEP: off, log or delete, delete by default, log for anything else", () => {
    expect(sweepMode(undefined)).toEqual({ mode: "delete", unknown: false });
    expect(sweepMode("")).toEqual({ mode: "delete", unknown: false });
    expect(sweepMode("off")).toEqual({ mode: "off", unknown: false });
    expect(sweepMode(" DELETE ")).toEqual({ mode: "delete", unknown: false });
    expect(sweepMode("log")).toEqual({ mode: "log", unknown: false });
    expect(sweepMode("true")).toEqual({ mode: "log", unknown: true });
  });

  it("is scheduled every day at 04:00, Paris time", () => {
    const { enabled, tasks } = strapi.config.get("server.cron");
    expect(enabled).toBe(true);
    expect(tasks.mediaSweep.options).toEqual({
      rule: "0 4 * * *",
      tz: "Europe/Paris",
    });
    // node-schedule really planned it: a wrong rule or time zone leaves a
    // job that never runs
    const { job } = strapi.cron.jobs.find(({ name }) => name === "mediaSweep");
    const next = job.nextInvocation();
    expect(next).not.toBeNull();
    const parisTime = new Date(next).toLocaleString("fr-FR", {
      timeZone: "Europe/Paris",
      hour: "2-digit",
      minute: "2-digit",
    });
    expect(parisTime).toBe("04:00");
    // within a day, 25 h on the night the clocks go back
    expect(new Date(next).getTime() - Date.now()).toBeLessThanOrEqual(
      DAY + 60 * 60 * 1000
    );
  });

  it("MEDIA_SWEEP=log logs the eligible files and deletes nothing", async () => {
    process.env.MEDIA_SWEEP = "log";
    const lines = logs();

    const result = await sweepOrphanMedia(strapi);

    expect(result.mode).toBe("log");
    expect(result.eligible).toEqual([oldOrphan.id, othersOldOrphan.id]);
    expect(result.removed).toEqual([]);
    expect(lines()).toEqual([
      `[media-sweep] log mode: 2 orphan upload(s) older than 24 h, removed 0, would remove: ${oldOrphan.id}, ${othersOldOrphan.id}`,
    ]);
    for (const file of [
      oldOrphan,
      othersOldOrphan,
      youngOrphan,
      oldOnProfile,
      oldInArticle,
      oldWithoutUploader,
      oldAdminUpload,
    ]) {
      expect(await exists(file)).toBe(true);
      expect(onDisk(file)).toBe(true);
    }
  });

  it("an unknown MEDIA_SWEEP value runs in log mode", async () => {
    process.env.MEDIA_SWEEP = "yes";
    const lines = logs();

    const result = await sweepOrphanMedia(strapi);

    expect(result.mode).toBe("log");
    expect(result.removed).toEqual([]);
    expect(lines()).toContain(
      "[media-sweep] unknown MEDIA_SWEEP value, running in log mode (off, log or delete)"
    );
    expect(await exists(oldOrphan)).toBe(true);
  });

  it("MEDIA_SWEEP=off checks nothing", async () => {
    process.env.MEDIA_SWEEP = "off";
    const lines = logs();

    const result = await sweepOrphanMedia(strapi);

    expect(result).toEqual({
      mode: "off",
      eligible: [],
      removed: [],
      failed: [],
    });
    expect(lines()).toEqual([
      "[media-sweep] off (MEDIA_SWEEP=off): nothing checked",
    ]);
  });

  it("without MEDIA_SWEEP, removes only the unused artist uploads older than 24 h", async () => {
    delete process.env.MEDIA_SWEEP;
    const lines = logs();

    const result = await sweepOrphanMedia(strapi);

    expect(result.mode).toBe("delete");
    expect(result.eligible).toEqual([oldOrphan.id, othersOldOrphan.id]);
    expect(result.removed).toEqual([oldOrphan.id, othersOldOrphan.id]);
    expect(lines()).toEqual([
      "[media-sweep] removed 2 of 2 orphan upload(s) older than 24 h (at most 50 per run)",
    ]);
    for (const file of [oldOrphan, othersOldOrphan]) {
      expect(await exists(file)).toBe(false);
      expect(onDisk(file)).toBe(false);
    }
    for (const file of [
      youngOrphan,
      oldOnProfile,
      oldInArticle,
      oldWithoutUploader,
      oldAdminUpload,
    ]) {
      expect(await exists(file)).toBe(true);
      expect(onDisk(file)).toBe(true);
    }
  });

  it("removes at most the cap of a run", async () => {
    expect(MAX_REMOVALS_PER_RUN).toBe(50);
    const extra = [
      await upload(artist),
      await upload(other),
      await upload(artist),
    ];
    for (const file of extra) {
      await age(file, 3 * DAY);
    }
    const lines = logs();

    const result = await sweepOrphanMedia(strapi, { mode: "delete", limit: 1 });

    expect(result.eligible).toEqual(extra.map((file) => file.id));
    // oldest id first
    expect(result.removed).toEqual([extra[0].id]);
    expect(lines()).toContain(
      "[media-sweep] removed 1 of 3 orphan upload(s) older than 24 h (at most 1 per run)"
    );
    expect(await exists(extra[0])).toBe(false);
    expect(onDisk(extra[0])).toBe(false);
    expect(await exists(extra[1])).toBe(true);

    // the next run takes the rest
    const next = await sweepOrphanMedia(strapi, { mode: "delete" });
    expect(next.removed).toEqual([extra[1].id, extra[2].id]);
  });

  it("MEDIA_SWEEP=delete removes an unused artist upload once it is 24 h old", async () => {
    const orphan = await upload(other);
    await age(orphan, 25 * 60 * 60 * 1000);
    process.env.MEDIA_SWEEP = "delete";

    const result = await sweepOrphanMedia(strapi);

    expect(result.mode).toBe("delete");
    expect(result.removed).toEqual([orphan.id]);
    expect(await exists(orphan)).toBe(false);
    expect(onDisk(orphan)).toBe(false);
    expect(await exists(youngOrphan)).toBe(true);
  });
});
