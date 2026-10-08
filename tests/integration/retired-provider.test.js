// Facebook sign-in is gone from the site (front A3), but 9 accounts were
// created with it and have no password. Strapi's password login only looks
// for provider=local accounts, so a reset password alone would not let them
// in: the reset must also turn such an account into a local one. Google
// accounts keep their provider, since Google sign-in still works.
const { describe, it, expect, beforeAll, afterAll } = require("@jest/globals");
const { setupStrapi, stopStrapi } = require("../helpers/strapi");
const { http, findRole } = require("../helpers/fixtures");

const PASSWORD = "Nouveau-1234";

const createProviderAccount = async (username, provider, resetToken) => {
  const authenticated = await findRole("authenticated");
  return strapi.query("plugin::users-permissions.user").create({
    data: {
      username,
      email: `${username}@example.test`,
      provider,
      confirmed: true,
      blocked: false,
      role: authenticated.id,
      resetPasswordToken: resetToken,
    },
  });
};

const resetPassword = (code) =>
  http()
    .post("/api/auth/reset-password")
    .send({ code, password: PASSWORD, passwordConfirmation: PASSWORD });

const login = (identifier) =>
  http()
    .post("/api/auth/local")
    .set("X-Forwarded-For", "203.0.113.80")
    .send({ identifier, password: PASSWORD });

const providerOf = async (id) =>
  (
    await strapi
      .query("plugin::users-permissions.user")
      .findOne({ where: { id }, select: ["provider"] })
  ).provider;

describe("password reset of an account from a retired provider", () => {
  beforeAll(async () => {
    await setupStrapi();
  }, 60000);

  afterAll(async () => {
    await stopStrapi();
  });

  it("turns a Facebook account into a local account that can sign in", async () => {
    const user = await createProviderAccount("ancienfb", "facebook", "tok-fb");

    await login("ancienfb@example.test").expect(400);
    await resetPassword("tok-fb").expect(200);

    expect(await providerOf(user.id)).toBe("local");
    const response = await login("ancienfb@example.test").expect(200);
    expect(response.body.jwt).toBeDefined();
  });

  it("keeps a Google account on Google", async () => {
    const user = await createProviderAccount("comptegoogle", "google", "tok-g");

    await resetPassword("tok-g").expect(200);

    expect(await providerOf(user.id)).toBe("google");
  });

  it("keeps a local account local", async () => {
    const user = await createProviderAccount("comptelocal", "local", "tok-l");

    await resetPassword("tok-l").expect(200);

    expect(await providerOf(user.id)).toBe("local");
    await login("comptelocal@example.test").expect(200);
  });
});
