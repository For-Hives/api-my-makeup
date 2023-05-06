const {
  searchingMakeup,
} = require("../../../src/api/searching/services/searching");
const { describe, expect, it, beforeAll, afterAll } = require("@jest/globals");
const fs = require("fs");
const { setupStrapi, stopStrapi } = require("../../helpers/strapi");

describe("test du service searching", () => {
  beforeAll(async () => {
    await setupStrapi();
  }, 20000);

  afterAll(async () => {
    await stopStrapi();
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

    // it("should return all makeup artiste if search params is not empty and city is not defined", async () => {
    //
    //
    //   expectedResult = [{
    //     "id": 1,
    //     "last_name": "Doe",
    //     "first_name": "John",
    //     "city": "Paris",
    //     "description": "Je suis un maquilleur professionnel",
    //     "speciality": "Mains",
    //     "skills": [{
    //       "id": 1, "name": "Mains", "short_description": "Je fait les mains",
    //     }],
    //     "service_offers": [{
    //       "id": 1, "description": "les manos",
    //     }],
    //     "score": 1,
    //   }, {
    //     "id": 2,
    //     "last_name": "Doe",
    //     "first_name": "Jane",
    //     "city": "Nantes",
    //     "description": "Je suis une maquilleuse professionnelle",
    //     "speciality": "Pieds",
    //     "skills": [{
    //       "id": 1, "name": "Pieds", "short_description": "Je fait les pieds",
    //     }],
    //     "service_offers": [{
    //       "id": 1, "description": "les pedis",
    //     }],
    //     "score": 1,
    //   }, {
    //     "id": 3,
    //     "last_name": "Doe",
    //     "first_name": "Jack",
    //     "city": "Angers",
    //     "description": "Je suis un maquilleur professionnel",
    //     "speciality": "Joue",
    //     "skills": [{
    //       "id": 1, "name": "Joue", "short_description": "Je fait les joue",
    //     }],
    //     "service_offers": [{
    //       "id": 1, "description": "les joues",
    //     }],
    //     "score": 1,
    //
    //   }];
    //
    //   const dbMakeupArtiste = [{
    //     "id": 1,
    //     "last_name": "Doe",
    //     "first_name": "John",
    //     "city": "Paris",
    //     "description": "Je suis un maquilleur professionnel",
    //     "speciality": "Mains",
    //     "skills": [{
    //       "id": 1, "name": "Mains", "short_description": "Je fait les mains",
    //     }],
    //     "service_offers": [{
    //       "id": 1, "description": "les manos",
    //     }],
    //   }, {
    //     "id": 2,
    //     "last_name": "Doe",
    //     "first_name": "Jane",
    //     "city": "Nantes",
    //     "description": "Je suis une maquilleuse professionnelle",
    //     "speciality": "Pieds",
    //     "skills": [{
    //       "id": 1, "name": "Pieds", "short_description": "Je fait les pieds",
    //     }],
    //     "service_offers": [{
    //       "id": 1, "description": "les pedis",
    //     }],
    //   }, {
    //     "id": 3,
    //     "last_name": "Doe",
    //     "first_name": "Jack",
    //     "city": "Angers",
    //     "description": "Je suis un maquilleur professionnel",
    //     "speciality": "Joue",
    //     "skills": [{
    //       "id": 1, "name": "Joue", "short_description": "Je fait les joue",
    //     }],
    //     "service_offers": [{
    //       "id": 1, "description": "les joues",
    //     }],
    //   }]
    //
    //   strapi.entityService = {
    //     findMany: jest.fn().mockResolvedValue(dbMakeupArtiste),
    //   };
    //
    //   const makeupArtiste = await searchingMakeup({
    //     city: "Nantes", search: "Mains"
    //   });
    //
    //   expect(makeupArtiste).toEqual(expectedResult);
    //
    //
    // });

    // todo : test search params if makeup artiste is not fully completed
  });
});
