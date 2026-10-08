const { describe, it, expect } = require("@jest/globals");
const {
  isSingleProfileQuery,
  hidePrivateFields,
  queriesTypedCity,
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

  it.each([
    ["12 rue des Essais Fictifs 74000 Annecy", "Annecy (74)"],
    ["Annecy 74000", "Annecy (74)"],
    ["Paris, Lyon et Annecy", "Paris, Lyon et Annecy"],
    ["3 avenue des Essais", null],
    ["", null],
    [null, null],
  ])("replaces the city %p by the public one %p", (city, expected) => {
    for (const keepContacts of [true, false]) {
      const value = { id: 3, attributes: { username: "carla", city } };
      hidePrivateFields(value, { keepContacts });
      expect(value.attributes).toEqual({ username: "carla", city: expected });
    }
  });

  it("removes the related entries of the pictures", () => {
    const file = (id) => ({
      id,
      attributes: {
        url: `https://r2.example.test/${id}.webp`,
        related: [{ __type: "api::makeup-artiste.makeup-artiste", id: 1 }],
      },
    });
    const value = {
      id: 1,
      attributes: {
        main_picture: { data: file(1) },
        image_gallery: { data: [file(2), file(3)] },
      },
    };
    hidePrivateFields(value, { keepContacts: true });
    expect(value.attributes).toEqual({
      main_picture: {
        data: { id: 1, attributes: { url: "https://r2.example.test/1.webp" } },
      },
      image_gallery: {
        data: [
          { id: 2, attributes: { url: "https://r2.example.test/2.webp" } },
          { id: 3, attributes: { url: "https://r2.example.test/3.webp" } },
        ],
      },
    });
    const empty = {
      id: 2,
      attributes: { main_picture: { data: null }, image_gallery: null },
    };
    hidePrivateFields(empty, { keepContacts: false });
    expect(empty.attributes).toEqual({
      main_picture: { data: null },
      image_gallery: null,
    });
  });

  it("does not add a city the response did not hold (fields=...)", () => {
    const value = { id: 4, attributes: { username: "dora" } };
    hidePrivateFields(value, { keepContacts: false });
    expect(value.attributes).toEqual({ username: "dora" });
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

describe("queriesTypedCity", () => {
  it.each([
    [{ filters: { city: { $startsWith: "12 r" } } }, true],
    [{ filters: { city: "Annecy" } }, true],
    [
      { filters: { $or: [{ username: "a" }, { city: { $contains: "rue" } }] } },
      true,
    ],
    [{ filters: { $and: [{ $not: { city: { $null: true } } }] } }, true],
    [{ sort: "city" }, true],
    [{ sort: "city:desc" }, true],
    [{ sort: "username,city:asc" }, true],
    [{ sort: ["id:asc", "city:desc"] }, true],
    [{ sort: { city: "asc" } }, true],
    [{ sort: [{ city: "asc" }] }, true],
    [{ filters: { username: { $eq: "alice" } } }, false],
    [{ sort: ["id:asc"], fields: ["username", "city"] }, false],
    [{ sort: "username" }, false],
    [{ populate: { main_picture: true } }, false],
    [{}, false],
    [undefined, false],
  ])("%j -> %s", (query, expected) => {
    expect(queriesTypedCity(query)).toBe(expected);
  });
});
