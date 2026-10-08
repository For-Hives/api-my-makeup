// Custom endpoints return entityService results without the content API
// output sanitizer, so nothing they populate may reach admin::user rows
// (email, bcrypt hash, resetPasswordToken: enough to take over the admin).
process.env.DATABASE_FILENAME = ".tmp/test-admin-exposure.db";

const request = require("supertest");
const { describe, it, expect, beforeAll, afterAll } = require("@jest/globals");
const { setupStrapi, stopStrapi } = require("./helpers/strapi");

// Fake admin values, only used to look for them in the responses
const fakeAdmin = {
  firstname: "Fake",
  lastname: "Admin",
  email: "fake-admin-exposure@example.com",
  password: "$2a$10$fakefakefakefakefakefuNotARealBcryptHashForTestsOnly1",
  resetPasswordToken: "fake-reset-token-admin-exposure-0123456789",
  isActive: true,
};

const adminKeys = ["createdBy", "updatedBy"];

const findKeys = (value, keys, path = "$", found = []) => {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      findKeys(item, keys, `${path}[${index}]`, found)
    );
  } else if (value && typeof value === "object") {
    Object.entries(value).forEach(([key, child]) => {
      if (keys.includes(key)) {
        found.push(`${path}.${key}`);
      }
      findKeys(child, keys, `${path}.${key}`, found);
    });
  }
  return found;
};

const expectNoAdminData = (body) => {
  const text = JSON.stringify(body);
  expect(findKeys(body, adminKeys)).toEqual([]);
  expect(text).not.toContain(fakeAdmin.email);
  expect(text).not.toContain(fakeAdmin.password);
  expect(text).not.toContain(fakeAdmin.resetPasswordToken);
};

const grant = async (roleType, action) => {
  const role = await strapi
    .query("plugin::users-permissions.role")
    .findOne({ where: { type: roleType } });
  await strapi
    .query("plugin::users-permissions.permission")
    .create({ data: { action, role: role.id } });
};

describe("admin users never reach the custom endpoints", () => {
  let file;

  beforeAll(async () => {
    await setupStrapi();

    const admin = await strapi.query("admin::user").create({ data: fakeAdmin });
    const byAdmin = { createdBy: admin.id, updatedBy: admin.id };

    // A media uploaded from the admin panel carries created_by_id
    file = await strapi.query("plugin::upload.file").create({
      data: {
        name: "portrait.jpg",
        hash: "portrait_admin_exposure",
        ext: ".jpg",
        mime: "image/jpeg",
        size: 1,
        url: "/uploads/portrait_admin_exposure.jpg",
        provider: "local",
        ...byAdmin,
      },
    });

    const authenticated = await strapi
      .query("plugin::users-permissions.role")
      .findOne({ where: { type: "authenticated" } });
    const user = await strapi.plugins["users-permissions"].services.user.add({
      username: "exposure",
      email: "exposure@example.com",
      provider: "local",
      password: "Exposure1234",
      confirmed: true,
      blocked: false,
      role: authenticated.id,
    });
    await strapi
      .query("plugin::users-permissions.user")
      .update({ where: { id: user.id }, data: byAdmin });

    const profile = await strapi.entityService.create(
      "api::makeup-artiste.makeup-artiste",
      {
        data: {
          first_name: "Prenom",
          last_name: "Nom",
          speciality: "mariage",
          city: "Annecy",
          available: true,
          description: "Maquillage mariage",
          username: "exposure",
          user: user.id,
          main_picture: file.id,
          image_gallery: [file.id],
        },
      }
    );
    // A profile edited from the admin panel carries updated_by_id
    await strapi
      .query("api::makeup-artiste.makeup-artiste")
      .update({ where: { id: profile.id }, data: byAdmin });

    await grant("public", "api::searching.searching.searchMakeup");
  }, 60000);

  afterAll(async () => {
    await stopStrapi();
  });

  it("GET /api/searching keeps the pictures but no admin data", async () => {
    const response = await request(strapi.server.httpServer)
      .get("/api/searching")
      .query({ search: "Annecy" })
      .expect(200);

    expect(response.body).toHaveLength(1);
    expect(response.body[0].main_picture.url).toBe(file.url);
    expect(response.body[0].image_gallery[0].url).toBe(file.url);
    expect(response.body[0].user).toEqual({ username: "exposure" });
    expect(findKeys(response.body, ["password", "resetPasswordToken"])).toEqual(
      []
    );
    expectNoAdminData(response.body);
  });
});
