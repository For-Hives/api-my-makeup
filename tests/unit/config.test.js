// Configuration read from environment variables
const { describe, it, expect, afterEach } = require("@jest/globals");
const { env } = require("@strapi/utils");
const middlewares = require("../../config/middlewares");

const saved = { ...process.env };

afterEach(() => {
  process.env = { ...saved };
});

const corsOrigins = () =>
  middlewares({ env }).find((item) => item.name === "strapi::cors").config
    .origin;

describe("config/middlewares.js", () => {
  it("allows the site's two origins by default", () => {
    delete process.env.CORS_ORIGINS;
    expect(corsOrigins()).toEqual([
      "https://my-makeup.fr",
      "https://www.my-makeup.fr",
    ]);
  });

  it("CORS_ORIGINS replaces the list", () => {
    process.env.CORS_ORIGINS = "http://localhost:3000, http://127.0.0.1:3000";
    expect(corsOrigins()).toEqual([
      "http://localhost:3000",
      "http://127.0.0.1:3000",
    ]);
  });
});
