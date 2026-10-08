// Configuration read from environment variables
const { describe, it, expect, afterEach } = require("@jest/globals");
const { env } = require("@strapi/utils");
const middlewares = require("../../config/middlewares");
const plugins = require("../../config/plugins");

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

describe("config/plugins.js, documentation", () => {
  const documentationEnabled = () => plugins({ env }).documentation.enabled;

  it.each([
    [undefined, true],
    ["development", true],
    ["test", false],
    ["production", false],
  ])("NODE_ENV=%s -> enabled %s", (nodeEnv, expected) => {
    delete process.env.DOCUMENTATION_ENABLED;
    if (nodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = nodeEnv;
    }
    expect(documentationEnabled()).toBe(expected);
  });

  it("DOCUMENTATION_ENABLED=true turns it on in production", () => {
    process.env.NODE_ENV = "production";
    process.env.DOCUMENTATION_ENABLED = "true";
    expect(documentationEnabled()).toBe(true);
  });
});

describe("config/middlewares.js, X-Powered-By", () => {
  it("does not load strapi::poweredBy", () => {
    const names = middlewares({ env }).map((item) => item.name ?? item);
    expect(names).not.toContain("strapi::poweredBy");
  });
});
