// S01, S02, S03: the Public and Authenticated permissions come from
// config/permissions.js, applied at bootstrap and again at every start.
const { describe, it, expect, beforeAll, afterAll } = require("@jest/globals");
const { setupStrapi, stopStrapi } = require("../helpers/strapi");
const { http, findRole, createAccount } = require("../helpers/fixtures");
const permissions = require("../../config/permissions");
const {
  diffPermissions,
  contentApiActions,
  syncRolePermissions,
} = require("../../src/utils/permissions");

const PERMISSION_UID = "plugin::users-permissions.permission";

// The snapshot: changing a role's permissions means changing this list too
const EXPECTED = {
  public: [
    "api::article.article.find",
    "api::article.article.findOne",
    "api::makeup-artiste.makeup-artiste.find",
    "api::makeup-artiste.makeup-artiste.findOne",
    "api::searching.searching.searchMakeup",
    "api::talent.talent.find",
    "api::talent.talent.findOne",
    "plugin::users-permissions.auth.callback",
    "plugin::users-permissions.auth.connect",
    "plugin::users-permissions.auth.forgotPassword",
    "plugin::users-permissions.auth.register",
    "plugin::users-permissions.auth.resetPassword",
  ],
  authenticated: [
    "api::makeup-artiste.me-makeup.deleteMakeup",
    "api::makeup-artiste.me-makeup.initMakeup",
    "api::makeup-artiste.me-makeup.meMakeup",
    "api::makeup-artiste.me-makeup.updateMakeup",
    "plugin::upload.content-api.upload",
    "plugin::users-permissions.user.me",
  ],
};

const rowsOf = async (type) => {
  const role = await findRole(type);
  return strapi.query(PERMISSION_UID).findMany({
    select: ["id", "action"],
    where: { role: { id: role.id } },
  });
};

const actionsOf = async (type) =>
  (await rowsOf(type)).map((row) => row.action).sort();

describe("diffPermissions", () => {
  it("adds the missing actions and removes the others and the duplicates", () => {
    const rows = [
      { id: 1, action: "a" },
      { id: 2, action: "b" },
      { id: 3, action: "a" },
      { id: 4, action: "x" },
    ];
    expect(diffPermissions(rows, ["a", "b", "c"])).toEqual({
      toAdd: ["c"],
      toRemove: [
        { id: 3, action: "a" },
        { id: 4, action: "x" },
      ],
    });
  });

  it("changes nothing when the rows already match", () => {
    expect(diffPermissions([{ id: 1, action: "a" }], ["a"])).toEqual({
      toAdd: [],
      toRemove: [],
    });
  });
});

describe("role permissions declared in config/permissions.js", () => {
  let jwt;

  beforeAll(async () => {
    await setupStrapi();
    ({ jwt } = await createAccount("permissions"));
  }, 60000);

  afterAll(async () => {
    await stopStrapi();
  });

  it("S03 - the bootstrap leaves exactly the listed actions on both roles", async () => {
    expect(await actionsOf("public")).toEqual(EXPECTED.public);
    expect(await actionsOf("authenticated")).toEqual(EXPECTED.authenticated);
    expect([...permissions.public].sort()).toEqual(EXPECTED.public);
    expect([...permissions.authenticated].sort()).toEqual(
      EXPECTED.authenticated
    );
  });

  it("S03 - every listed action exists in this Strapi", () => {
    const known = contentApiActions(strapi);
    expect(
      [...EXPECTED.public, ...EXPECTED.authenticated].filter(
        (action) => !known.includes(action)
      )
    ).toEqual([]);
  });

  it("S01, S02 - the next sync undoes boxes ticked in the admin", async () => {
    const publicRole = await findRole("public");
    const authenticatedRole = await findRole("authenticated");
    for (const action of [
      "plugin::upload.content-api.find",
      "plugin::users-permissions.user.find",
    ]) {
      for (const role of [publicRole, authenticatedRole]) {
        await strapi
          .query(PERMISSION_UID)
          .create({ data: { action, role: role.id } });
      }
    }
    // a duplicate and a missing action
    await strapi.query(PERMISSION_UID).create({
      data: { action: "api::talent.talent.find", role: publicRole.id },
    });
    await strapi.query(PERMISSION_UID).deleteMany({
      where: { action: "plugin::users-permissions.user.me" },
    });

    // the drift is real before the sync
    await http().get("/api/upload/files").expect(200);
    await http().get("/api/users").expect(200);

    await syncRolePermissions(strapi, permissions);

    expect(await actionsOf("public")).toEqual(EXPECTED.public);
    expect(await actionsOf("authenticated")).toEqual(EXPECTED.authenticated);
  });

  it("S01 - GET /api/upload/files is refused to Public and Authenticated", async () => {
    await http().get("/api/upload/files").expect(403);
    await http()
      .get("/api/upload/files")
      .set("Authorization", `Bearer ${jwt}`)
      .expect(403);
  });

  it("S02 - GET /api/users is refused to Public and Authenticated", async () => {
    await http().get("/api/users").expect(403);
    await http()
      .get("/api/users")
      .set("Authorization", `Bearer ${jwt}`)
      .expect(403);
  });

  it("keeps working endpoints working: /api/users/me with a JWT", async () => {
    const response = await http()
      .get("/api/users/me")
      .set("Authorization", `Bearer ${jwt}`)
      .expect(200);
    expect(response.body.username).toBe("permissions");
  });

  it("is idempotent and logs a summary without data", async () => {
    const before = await rowsOf("public");
    const messages = [];
    const info = strapi.log.info;
    strapi.log.info = (message) => messages.push(message);
    try {
      await syncRolePermissions(strapi, permissions);
    } finally {
      strapi.log.info = info;
    }

    expect(await rowsOf("public")).toEqual(before);
    expect(messages).toEqual([
      "[permissions] public: 12 actions, 0 added, 0 removed; authenticated: 6 actions, 0 added, 0 removed",
    ]);
  });

  it("refuses an action that does not exist, before writing anything", async () => {
    const before = await actionsOf("public");
    await expect(
      syncRolePermissions(strapi, {
        public: ["api::makeup-artiste.makeup-artiste.findd"],
        authenticated: [],
      })
    ).rejects.toThrow(
      "unknown actions: api::makeup-artiste.makeup-artiste.findd"
    );
    expect(await actionsOf("public")).toEqual(before);
  });
});
