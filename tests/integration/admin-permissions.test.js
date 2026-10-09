// The admin permission engine runs on @casl/ability (resolution in
// package.json, NT-SHARP-API): admin login, the permissions of the signed-in
// admin, and the admin::is-creator condition of the default Author role in
// the content manager. Fictional admins only (example.test addresses).
const { describe, it, expect, beforeAll, afterAll } = require("@jest/globals");
const { setupStrapi, stopStrapi } = require("../helpers/strapi");
const { http } = require("../helpers/fixtures");

const UID = "api::makeup-artiste.makeup-artiste";
const CONTENT_MANAGER = `/content-manager/collection-types/${UID}`;
const PASSWORD = "Fictional-Admin-1234";

describe("admin permissions", () => {
  let superToken;
  let authorToken;
  let superEntry;
  let authorEntry;

  const as = (token, request) =>
    request.set("Authorization", `Bearer ${token}`);

  const createAdmin = (email, roleId) =>
    strapi.admin.services.user.create({
      email,
      firstname: "Fictif",
      lastname: "Admin",
      password: PASSWORD,
      isActive: true,
      registrationToken: null,
      roles: [roleId],
    });

  const login = async (email) => {
    const response = await http()
      .post("/admin/login")
      .send({ email, password: PASSWORD })
      .expect(200);
    return response.body.data.token;
  };

  beforeAll(async () => {
    await setupStrapi();
    const superAdmin = await strapi.admin.services.role.getSuperAdmin();
    const author = await strapi
      .query("admin::role")
      .findOne({ where: { code: "strapi-author" } });
    await createAdmin("super-admin@example.test", superAdmin.id);
    await createAdmin("author-admin@example.test", author.id);

    superToken = await login("super-admin@example.test");
    authorToken = await login("author-admin@example.test");

    const create = async (token, first_name) =>
      (
        await as(token, http().post(CONTENT_MANAGER))
          .send({ first_name })
          .expect(200)
      ).body;
    superEntry = await create(superToken, "Super");
    authorEntry = await create(authorToken, "Auteur");
  }, 60000);

  afterAll(async () => {
    await stopStrapi();
  });

  it("gives the author the content manager read on profiles, with is-creator", async () => {
    const response = await as(
      authorToken,
      http().get("/admin/users/me/permissions")
    ).expect(200);

    const read = response.body.data.find(
      (permission) =>
        permission.action === "plugin::content-manager.explorer.read" &&
        permission.subject === UID
    );
    expect(read.conditions).toEqual(["admin::is-creator"]);
  });

  it("lists every profile to the super admin, only his own to the author", async () => {
    const ids = async (token) =>
      (await as(token, http().get(CONTENT_MANAGER)).expect(200)).body.results
        .map((entry) => entry.id)
        .sort((a, b) => a - b);

    expect(await ids(superToken)).toEqual(
      [superEntry.id, authorEntry.id].sort((a, b) => a - b)
    );
    expect(await ids(authorToken)).toEqual([authorEntry.id]);
  });

  it("refuses the author another admin's profile", async () => {
    await as(
      authorToken,
      http().get(`${CONTENT_MANAGER}/${superEntry.id}`)
    ).expect(403);
    await as(authorToken, http().put(`${CONTENT_MANAGER}/${superEntry.id}`))
      .send({ first_name: "Pirate" })
      .expect(403);

    const entry = await strapi.entityService.findOne(UID, superEntry.id);
    expect(entry.first_name).toBe("Super");
  });

  it("lets the author read and edit his own profile", async () => {
    await as(
      authorToken,
      http().get(`${CONTENT_MANAGER}/${authorEntry.id}`)
    ).expect(200);
    const response = await as(
      authorToken,
      http().put(`${CONTENT_MANAGER}/${authorEntry.id}`)
    )
      .send({ first_name: "Auteure" })
      .expect(200);

    expect(response.body.first_name).toBe("Auteure");
  });
});
