// R05 on a test server: no /documentation outside development, no
// X-Powered-By header.
const { describe, it, expect, beforeAll, afterAll } = require("@jest/globals");
const { setupStrapi, stopStrapi } = require("../helpers/strapi");
const { http } = require("../helpers/fixtures");

describe("what the server tells about itself", () => {
  beforeAll(async () => {
    await setupStrapi();
  }, 60000);

  afterAll(async () => {
    await stopStrapi();
  });

  it("serves no /documentation outside development", async () => {
    expect(strapi.plugin("documentation")).toBeUndefined();
    await http().get("/documentation").expect(404);
    await http().get("/documentation/v1.0.0").expect(404);
  });

  it.each(["/api/talents", "/_health", "/api/nothing-here"])(
    "sends no X-Powered-By on %s",
    async (url) => {
      const response = await http().get(url);
      expect(response.headers["x-powered-by"]).toBeUndefined();
    }
  );
});
