const { describe, it, expect } = require("@jest/globals");
const {
  isSingleProfileQuery,
  hidePrivateFields,
} = require("../../src/utils/public-profile");

describe("isSingleProfileQuery", () => {
  it.each([
    [{ filters: { username: { $eq: "alice" } } }, true],
    [{ filters: { username: "alice" } }, true],
    [{ filters: { username: { $eq: "alice" }, city: "Annecy" } }, true],
    [{}, false],
    [undefined, false],
    [{ filters: { city: "Annecy" } }, false],
    [{ filters: { username: { $in: ["alice", "bob"] } } }, false],
    [{ filters: { username: { $eq: ["alice", "bob"] } } }, false],
    [{ filters: { username: { $contains: "a" } } }, false],
    [{ filters: { username: { $eq: "alice", $ne: "bob" } } }, false],
    [{ filters: { $or: [{ username: "alice" }, { username: "bob" }] } }, false],
  ])("%j -> %s", (query, expected) => {
    expect(isSingleProfileQuery(query)).toBe(expected);
  });
});

describe("hidePrivateFields", () => {
  const entry = () => ({
    id: 1,
    attributes: {
      username: "alice",
      network: { email: "a@example.test", phone: "06", instagram: "i" },
      user: { data: { id: 1 } },
    },
  });

  it("removes the account, email and phone of a list entry", () => {
    const value = entry();
    hidePrivateFields(value, { keepContacts: false });
    expect(value.attributes).toEqual({
      username: "alice",
      network: { instagram: "i" },
    });
  });

  it("keeps the contact details for the profile page", () => {
    const value = entry();
    hidePrivateFields(value, { keepContacts: true });
    expect(value.attributes.network.email).toBe("a@example.test");
    expect(value.attributes.user).toBeUndefined();
  });

  it("accepts entries without network or attributes", () => {
    expect(() =>
      hidePrivateFields(undefined, { keepContacts: false })
    ).not.toThrow();
    const value = { id: 2, attributes: { network: null } };
    hidePrivateFields(value, { keepContacts: false });
    expect(value.attributes.network).toBeNull();
  });
});
