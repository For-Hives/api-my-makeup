// S11: login errors are readable, and the login brake is per client
// address behind Traefik (proxy: true, last X-Forwarded-For entry only).
// The JWT lifetime is explicit.
const { describe, it, expect, beforeAll, afterAll } = require("@jest/globals");
const { setupStrapi, stopStrapi } = require("../helpers/strapi");
const { http, createAccount } = require("../helpers/fixtures");

const login = (forwardedFor, identifier, password) =>
  http()
    .post("/api/auth/local")
    .set("X-Forwarded-For", forwardedFor)
    .send({ identifier, password });

describe("POST /api/auth/local", () => {
  beforeAll(async () => {
    await setupStrapi();
    await createAccount("marie");
  }, 60000);

  afterAll(async () => {
    await stopStrapi();
  });

  it("issues a JWT valid for 30 days", async () => {
    const response = await login(
      "203.0.113.60",
      "marie@example.test",
      "Fictional-1234"
    ).expect(200);
    const payload = JSON.parse(
      Buffer.from(response.body.jwt.split(".")[1], "base64url").toString()
    );

    expect(payload.exp - payload.iat).toBe(30 * 24 * 3600);
    expect(strapi.config.get("plugin.users-permissions.jwt.expiresIn")).toBe(
      "30d"
    );
  });

  it("S11 - a wrong password answers 400 with a readable error", async () => {
    const response = await login(
      "203.0.113.50",
      "marie@example.test",
      "Wrong-1234"
    );

    expect(response.status).toBe(400);
    expect(response.body.data).toBeNull();
    expect(response.body.error.message).toBe("Invalid identifier or password");
  });

  it("S11 - two client addresses do not share the brake, and the first X-Forwarded-For entry cannot dodge it", async () => {
    const attacker = "198.51.100.7";
    const statuses = [];
    // users-permissions default: 10 attempts per minute
    for (let i = 0; i < 11; i++) {
      statuses.push(
        (await login(`1.2.3.4, ${attacker}`, "nobody@example.test", "x")).status
      );
    }
    expect(statuses).toEqual([...Array(10).fill(400), 429]);

    // the real user, elsewhere, behind the same proxy
    const legit = await login(
      "1.2.3.4, 203.0.113.9",
      "marie@example.test",
      "Fictional-1234"
    );
    expect(legit.status).toBe(200);
    expect(legit.body.jwt).toBeDefined();

    // changing the client-supplied part of the header changes nothing
    const spoofed = await login(
      `9.9.9.9, ${attacker}`,
      "nobody@example.test",
      "x"
    );
    expect(spoofed.status).toBe(429);
  });
});
