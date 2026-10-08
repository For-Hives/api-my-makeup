// S10: browsers may call the API from https://my-makeup.fr and
// https://www.my-makeup.fr only (CORS_ORIGINS replaces the list).
const { describe, it, expect, beforeAll, afterAll } = require("@jest/globals");
const { setupStrapi, stopStrapi } = require("../helpers/strapi");
const { http } = require("../helpers/fixtures");

describe("CORS", () => {
  beforeAll(async () => {
    await setupStrapi();
  }, 60000);

  afterAll(async () => {
    await stopStrapi();
  });

  it.each(["https://my-makeup.fr", "https://www.my-makeup.fr"])(
    "allows %s",
    async (origin) => {
      const response = await http()
        .get("/api/talents")
        .set("Origin", origin)
        .expect(200);

      expect(response.headers["access-control-allow-origin"]).toBe(origin);
      expect(response.headers["access-control-allow-credentials"]).toBe("true");
    }
  );

  it("answers the preflight of the profile space from the site", async () => {
    const response = await http()
      .options("/api/me-makeup")
      .set("Origin", "https://my-makeup.fr")
      .set("Access-Control-Request-Method", "PATCH")
      .set("Access-Control-Request-Headers", "authorization,content-type")
      .expect(204);

    expect(response.headers["access-control-allow-origin"]).toBe(
      "https://my-makeup.fr"
    );
    expect(response.headers["access-control-allow-methods"]).toContain("PATCH");
  });

  it.each([
    "https://evil.example",
    "http://my-makeup.fr",
    "https://my-makeup.fr.evil.example",
    "null",
  ])("S10 - sends no Access-Control-Allow-Origin to %s", async (origin) => {
    const response = await http()
      .get("/api/talents")
      .set("Origin", origin)
      .expect(200);
    const preflight = await http()
      .options("/api/me-makeup")
      .set("Origin", origin)
      .set("Access-Control-Request-Method", "DELETE");

    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
    expect(
      response.headers["access-control-allow-credentials"]
    ).toBeUndefined();
    expect(preflight.headers["access-control-allow-origin"]).toBeUndefined();
  });
});
