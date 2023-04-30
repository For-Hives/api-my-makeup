const {
  searchingMakeup,
} = require("../../../src/api/searching/services/searching");
const { describe, expect, it, beforeAll, afterAll } = require("@jest/globals");
const fs = require("fs");
const { setupStrapi, cleanupStrapi } = require("../../helpers/strapi");

describe("test du service searching", () => {
  beforeAll(async () => {
    await setupStrapi();
  }, 20000);

  afterAll(async () => {
    await cleanupStrapi();
  });

  it("strapi is defined", () => {
    expect(strapi).toBeDefined();
  });

  describe("test de la function searchingMakeup", () => {
    it("should throw an error if search params is not defined", async () => {
      await expect(searchingMakeup()).rejects.toThrow(
        "No search parameters found"
      );
    });

    // todo : test search params if it is empty

    // it("should return all makeup artiste if search params is empty", async () => {
    //   const allMakeupArtiste = await strapi.entityService.findMany(
    //     "api::makeup-artiste.makeup-artiste",
    //     {}
    //   );
    //   const makeupArtiste = await searchingMakeup({});
    //   expect(makeupArtiste).toEqual(allMakeupArtiste);
    // );
    //

    // todo : test search params if it is not empty and city is not defined

    // todo : test search params if it is not empty and city is defined

    // todo : test search params if makeup artiste is not fully completed
  });
});
