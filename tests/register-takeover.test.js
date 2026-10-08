// Public registration must only accept username, email and password.
// Without an explicit allowedFields list, Strapi 4 accepts every public user
// field, including the makeup_artiste relation: anyone could register a new
// account linked to an existing profile and take it over through /me-makeup.
process.env.DATABASE_FILENAME = ".tmp/test-register-takeover.db";

const request = require("supertest");
const { describe, it, expect, beforeAll, afterAll } = require("@jest/globals");
const { setupStrapi, stopStrapi } = require("./helpers/strapi");

describe("public registration", () => {
  let victimUser;
  let victimProfile;

  beforeAll(async () => {
    await setupStrapi();

    victimUser = await strapi.plugins["users-permissions"].services.user.add({
      username: "victim",
      email: "victim@example.test",
      provider: "local",
      password: "Victim-1234",
      confirmed: true,
      blocked: false,
    });

    victimProfile = await strapi.entityService.create(
      "api::makeup-artiste.makeup-artiste",
      { data: { username: "victim", user: victimUser.id } }
    );
  }, 60000);

  afterAll(async () => {
    await stopStrapi();
  });

  it("ignores a makeup_artiste field and leaves the profile with its owner", async () => {
    // Strapi 4 drops fields outside allowedFields instead of rejecting them
    const response = await request(strapi.server.httpServer)
      .post("/api/auth/local/register")
      .set("Content-Type", "application/json")
      .send({
        username: "attacker",
        email: "attacker@example.test",
        password: "Attacker-1234",
        makeup_artiste: victimProfile.id,
      });

    expect(response.status).toBe(200);

    const profile = await strapi.entityService.findOne(
      "api::makeup-artiste.makeup-artiste",
      victimProfile.id,
      { populate: { user: { fields: ["id"] } } }
    );
    expect(profile.user.id).toBe(victimUser.id);

    const attacker = await strapi.entityService.findOne(
      "plugin::users-permissions.user",
      response.body.user.id,
      { populate: { makeup_artiste: { fields: ["id"] } } }
    );
    expect(attacker.makeup_artiste).toBeNull();
  });

  it("still registers a regular account", async () => {
    const response = await request(strapi.server.httpServer)
      .post("/api/auth/local/register")
      .set("Content-Type", "application/json")
      .send({
        username: "newcomer",
        email: "newcomer@example.test",
        password: "Newcomer-1234",
      });

    expect(response.status).toBe(200);
    expect(response.body.jwt).toBeDefined();
  });
});
