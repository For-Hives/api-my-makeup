// The documentation plugin only generates the core routes of each API:
// register() adds the /me-makeup paths from their own file, with the PATCH
// 400 "File not allowed" of UI-03.
const { describe, it, expect } = require("@jest/globals");
const { register } = require("../../src/index");

const fakeStrapi = (plugins) => {
  const overrides = [];
  return {
    overrides,
    strapi: {
      server: { app: {} },
      plugin: (name) =>
        plugins.includes(name)
          ? {
              service: (service) =>
                service === "override"
                  ? { registerOverride: (doc) => overrides.push(doc) }
                  : undefined,
            }
          : undefined,
    },
  };
};

describe("src/index.js register, documentation", () => {
  it("adds the /me-makeup paths when the documentation plugin runs", () => {
    const { strapi, overrides } = fakeStrapi(["documentation"]);

    register({ strapi });

    expect(overrides).toHaveLength(1);
    const { paths } = overrides[0];
    expect(Object.keys(paths)).toEqual(["/me-makeup"]);
    expect(Object.keys(paths["/me-makeup"]).sort()).toEqual([
      "delete",
      "get",
      "patch",
      "post",
    ]);
    expect(
      JSON.stringify(paths["/me-makeup"].patch.responses["400"])
    ).toContain("File not allowed");
  });

  it("does nothing without the documentation plugin (tests, production)", () => {
    const { strapi, overrides } = fakeStrapi([]);

    register({ strapi });

    expect(overrides).toEqual([]);
    expect(strapi.server.app.maxIpsCount).toBe(1);
  });
});
