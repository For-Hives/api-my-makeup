// LEGACY_READ_ONLY=true: reads, search and sign-in stay, writes and
// registration answer 403 and write nothing; one variable and a restart
// (the bootstrap run again) bring everything back.
const { describe, it, expect, beforeAll, afterAll } = require("@jest/globals");
const { setupStrapi, stopStrapi } = require("../helpers/strapi");
const { http, findRole, createAccount, picture } = require("../helpers/fixtures");
const permissions = require("../../config/permissions");
const { bootstrap } = require("../../src/index");

const PERMISSION_UID = "plugin::users-permissions.permission";
const USER_UID = "plugin::users-permissions.user";
const PROFILE_UID = "api::makeup-artiste.makeup-artiste";

// A restart with these variables: the bootstrap again, on the same database
const restart = async (env) => {
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  await bootstrap({ strapi });
};

const actionsOf = async (type) => {
  const role = await findRole(type);
  const rows = await strapi.query(PERMISSION_UID).findMany({
    select: ["action"],
    where: { role: { id: role.id } },
  });
  return rows.map((row) => row.action).sort();
};

describe("read-only mode", () => {
  let owner;
  const as = (verb, path) =>
    http()[verb](path).set("Authorization", `Bearer ${owner.jwt}`);
  const register = (name) =>
    http()
      .post("/api/auth/local/register")
      .send({
        username: name,
        email: `${name}@example.test`,
        password: "Fictional-1234",
      });

  beforeAll(async () => {
    await setupStrapi();
    owner = await createAccount("readonly", { city: "Annecy" });
  }, 60000);

  afterAll(async () => {
    await stopStrapi();
  });

  it("starts as usual: writes work", async () => {
    await as("patch", "/api/me-makeup").send({ city: "Lyon" }).expect(200);
    await register("before").expect(200);
  });

  it("with the variable: writes and registration answer 403, nothing is written", async () => {
    // PERMISSIONS_SYNC=false does not lift the freeze
    await restart({ LEGACY_READ_ONLY: "true", PERMISSIONS_SYNC: "false" });

    const profileBefore = await strapi.entityService.findOne(
      PROFILE_UID,
      owner.profile.id
    );
    const usersBefore = await strapi.query(USER_UID).count();

    await as("post", "/api/me-makeup").expect(403);
    await as("patch", "/api/me-makeup").send({ city: "Paris" }).expect(403);
    await as("delete", "/api/me-makeup").expect(403);
    await as("post", "/api/upload")
      .attach("files", await picture(), {
        filename: "photo.png",
        contentType: "image/png",
      })
      .expect(403);
    await register("after").expect(403);
    await http()
      .post("/api/auth/forgot-password")
      .send({ email: "readonly@example.test" })
      .expect(403);
    await http()
      .post("/api/auth/reset-password")
      .send({ code: "x", password: "Fictional-5678", passwordConfirmation: "Fictional-5678" })
      .expect(403);

    expect(
      await strapi.entityService.findOne(PROFILE_UID, owner.profile.id)
    ).toEqual(profileBefore);
    expect(await strapi.query(USER_UID).count()).toBe(usersBefore);
  });

  it("with the variable: reads, search and sign-in are unchanged", async () => {
    const me = await as("get", "/api/me-makeup").expect(200);
    expect(me.body.city).toBe("Lyon");
    expect(me.headers["x-read-only"]).toBe("true");
    await as("get", "/api/users/me").expect(200);
    await http().get("/api/makeup-artistes").expect(200);
    await http().get("/api/articles").expect(200);
    await http().get("/api/talents").expect(200);
    await http()
      .get("/api/searching")
      .set("X-Forwarded-For", "203.0.113.171")
      .expect(200);
    const login = await http()
      .post("/api/auth/local")
      .set("X-Forwarded-For", "203.0.113.172")
      .send({ identifier: "readonly@example.test", password: "Fictional-1234" })
      .expect(200);
    expect(login.body.jwt).toBeTruthy();
  });

  it("logs the mode without any data", async () => {
    const messages = [];
    const warn = strapi.log.warn;
    strapi.log.warn = (message) => messages.push(message);
    try {
      await restart({ LEGACY_READ_ONLY: "true" });
    } finally {
      strapi.log.warn = warn;
    }
    expect(messages).toEqual([
      "[read-only] LEGACY_READ_ONLY=true: writes and registration refused",
    ]);
  });

  it("without the variable, one restart brings back the permissions and registration", async () => {
    await restart({ LEGACY_READ_ONLY: undefined, PERMISSIONS_SYNC: undefined });

    expect(await actionsOf("public")).toEqual([...permissions.public].sort());
    expect(await actionsOf("authenticated")).toEqual(
      [...permissions.authenticated].sort()
    );

    const me = await as("get", "/api/me-makeup").expect(200);
    expect(me.headers["x-read-only"]).toBeUndefined();
    await as("patch", "/api/me-makeup").send({ city: "Paris" }).expect(200);
    await register("restored").expect(200);
  });

  it("no account is created while the mode is on, whatever the path (Google sign-in included)", async () => {
    const role = await findRole("authenticated");
    const add = () =>
      strapi.plugins["users-permissions"].services.user.add({
        username: "google-newcomer",
        email: "google-newcomer@example.test",
        provider: "google",
        confirmed: true,
        role: role.id,
      });

    await restart({ LEGACY_READ_ONLY: "true" });
    await expect(add()).rejects.toThrow("read-only");
    await restart({ LEGACY_READ_ONLY: undefined });
    expect(
      await strapi
        .query(USER_UID)
        .count({ where: { email: "google-newcomer@example.test" } })
    ).toBe(0);

    await add();
    expect(
      await strapi
        .query(USER_UID)
        .count({ where: { email: "google-newcomer@example.test" } })
    ).toBe(1);
  });
});
