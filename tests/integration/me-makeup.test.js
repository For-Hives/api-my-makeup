// S05, S06: the profile space endpoints (/api/me-makeup).
const { describe, it, expect, beforeAll, afterAll } = require("@jest/globals");
const { setupStrapi, stopStrapi } = require("../helpers/strapi");
const { http, createAccount, findKeys } = require("../helpers/fixtures");

const PROFILE_UID = "api::makeup-artiste.makeup-artiste";
const USER_UID = "plugin::users-permissions.user";

const SECRET_KEYS = ["password", "resetPasswordToken", "confirmationToken"];

const expectNoAccountSecrets = (body) => {
  expect(findKeys(body, SECRET_KEYS)).toEqual([]);
  expect(JSON.stringify(body)).not.toMatch(/\$2[aby]\$/);
};

describe("/api/me-makeup", () => {
  let owner;
  let other;

  beforeAll(async () => {
    await setupStrapi();
    owner = await createAccount("owner", {
      first_name: "Prenom",
      city: "Annecy",
      available: true,
    });
    other = await createAccount("other", { first_name: "Autre" });

    // a pending reset makes resetPasswordToken non null on the account
    await strapi.query(USER_UID).update({
      where: { id: owner.user.id },
      data: {
        resetPasswordToken: "fictional-reset-token",
        confirmationToken: "fictional-confirmation-token",
      },
    });
  }, 60000);

  afterAll(async () => {
    await stopStrapi();
  });

  const as = (account, method, body) => {
    const call = http()
      [method]("/api/me-makeup")
      .set("Authorization", `Bearer ${account.jwt}`);
    return body ? call.send(body) : call;
  };

  it("S06 - GET returns the profile with only id, username and email of the account", async () => {
    const response = await as(owner, "get").expect(200);

    expect(response.body.id).toBe(owner.profile.id);
    expect(response.body.first_name).toBe("Prenom");
    expect(response.body.user).toEqual({
      id: owner.user.id,
      username: "owner",
      email: "owner@example.test",
    });
    expectNoAccountSecrets(response.body);
  });

  it("S06 - PATCH returns the same trimmed account", async () => {
    const response = await as(owner, "patch", { city: "Annemasse" }).expect(
      200
    );

    expect(response.body.city).toBe("Annemasse");
    expect(Object.keys(response.body.user).sort()).toEqual([
      "email",
      "id",
      "username",
    ]);
    expectNoAccountSecrets(response.body);
  });

  it("S05 - PATCH ignores pro, score, user, username and other unlisted fields", async () => {
    const response = await as(owner, "patch", {
      first_name: "Nouveau",
      network: { instagram: "https://instagram.com/fictional" },
      pro: true,
      score: 5,
      username: "taken-over",
      user: other.user.id,
      createdAt: "2001-01-01T00:00:00.000Z",
    }).expect(200);

    expect(response.body.first_name).toBe("Nouveau");
    expect(response.body.network.instagram).toBe(
      "https://instagram.com/fictional"
    );

    const stored = await strapi.entityService.findOne(
      PROFILE_UID,
      owner.profile.id,
      { populate: { user: { fields: ["id"] } } }
    );
    expect(stored.pro).toBe(false);
    expect(stored.score).toBeNull();
    expect(stored.username).toBe("owner");
    expect(stored.user.id).toBe(owner.user.id);
    expect(stored.createdAt).not.toMatch(/^2001/);
  });

  it("S05 - PATCH with only refused fields changes nothing", async () => {
    await as(owner, "patch", { pro: true }).expect(200);
    const stored = await strapi.entityService.findOne(
      PROFILE_UID,
      owner.profile.id
    );
    expect(stored.pro).toBe(false);
  });
});
