const { describe, it, expect } = require("@jest/globals");
const permissions = require("../../config/permissions");
const { isReadOnly, readOnlyPermissions } = require("../../src/utils/read-only");

describe("isReadOnly", () => {
  it("is on only for the exact value true", () => {
    expect(isReadOnly({ LEGACY_READ_ONLY: "true" })).toBe(true);
    for (const value of [undefined, "", "false", "1", "TRUE", "yes"]) {
      expect(isReadOnly({ LEGACY_READ_ONLY: value })).toBe(false);
    }
  });
});

describe("readOnlyPermissions", () => {
  const reduced = readOnlyPermissions(permissions);

  it("keeps reads, search and sign-in, nothing that writes", () => {
    expect([...reduced.public].sort()).toEqual([
      "api::article.article.find",
      "api::article.article.findOne",
      "api::makeup-artiste.makeup-artiste.find",
      "api::makeup-artiste.makeup-artiste.findOne",
      "api::searching.searching.searchMakeup",
      "api::talent.talent.find",
      "api::talent.talent.findOne",
      "plugin::users-permissions.auth.callback",
      "plugin::users-permissions.auth.connect",
    ]);
    expect([...reduced.authenticated].sort()).toEqual([
      "api::makeup-artiste.me-makeup.meMakeup",
      "plugin::users-permissions.user.me",
    ]);
  });

  it("only ever removes actions of config/permissions.js", () => {
    expect(permissions.public).toEqual(expect.arrayContaining(reduced.public));
    expect(permissions.authenticated).toEqual(
      expect.arrayContaining(reduced.authenticated)
    );
  });
});
