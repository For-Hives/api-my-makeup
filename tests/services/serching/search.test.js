const {
  searchingMakeup,
} = require("../../../src/api/searching/services/searching");
const { describe, expect, it, beforeAll, afterAll } = require("@jest/globals");
const fs = require("fs");
const { setupStrapi, stopStrapi } = require("../../helpers/strapi");
const schema = require("../../../src/api/makeup-artiste/content-types/makeup-artiste/schema.json");
const skillsSchema = require("../../../src/components/makeupartists/skills.json");
const serviceOffersSchema = require("../../../src/components/makeupartists/service-offers.json");
const optionsSchema = require("../../../src/components/service-offers/options.json");
const networksSchema = require("../../../src/components/makeupartists/network.json");

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

  it("check the structure of the makeup artiste", async () => {
    // check the structure of the makeup artiste

    expect(schema).toHaveProperty("attributes");
    expect(schema).toHaveProperty("attributes.last_name");
    expect(schema).toHaveProperty("attributes.first_name");
    expect(schema).toHaveProperty("attributes.city");
    expect(schema).toHaveProperty("attributes.description");
    expect(schema).toHaveProperty("attributes.speciality");

    expect(schema).toHaveProperty("attributes.skills");
    expect(skillsSchema).toHaveProperty("attributes.name");
    expect(skillsSchema).toHaveProperty("attributes.description");

    expect(schema).toHaveProperty("attributes.service_offers");
    expect(serviceOffersSchema).toHaveProperty("attributes.name");
    expect(serviceOffersSchema).toHaveProperty("attributes.description");
    expect(serviceOffersSchema).toHaveProperty("attributes.options");
    expect(optionsSchema).toHaveProperty("attributes.name");
    expect(optionsSchema).toHaveProperty("attributes.description");

    expect(schema).toHaveProperty("attributes.network");
    expect(networksSchema).toHaveProperty("attributes.phone");
    expect(networksSchema).toHaveProperty("attributes.email");
    expect(networksSchema).toHaveProperty("attributes.website");
    expect(networksSchema).toHaveProperty("attributes.facebook");
    expect(networksSchema).toHaveProperty("attributes.instagram");
    expect(networksSchema).toHaveProperty("attributes.linkedin");
    expect(networksSchema).toHaveProperty("attributes.youtube");
  });

  describe("test de la function searchingMakeup", () => {
    it("should throw an error if search params is not defined", async () => {
      await expect(searchingMakeup()).rejects.toThrow(
        "No search parameters found"
      );
    });

    // todo : test search params if it is empty

    it("should return an error if search params is empty", async () => {
      await expect(searchingMakeup({})).rejects.toThrow(
        "No search parameters found"
      );
    });

    // todo : test search params if it is not empty and city is not defined

    it("should return all makeup artiste if search params is not empty and city is not defined", async () => {
      const allMakeupArtiste = await strapi.entityService.findMany(
        "api::makeup-artiste.makeup-artiste",
        {}
      );
      const makeupArtiste = await searchingMakeup({ search: "John" });
      expect(makeupArtiste).toEqual(allMakeupArtiste);
    });

    it("should return the whole profile a skill matches, with its score", async () => {
      strapi.entityService = {
        findMany: jest.fn().mockResolvedValue(allMakeupArtiste),
      };

      // only the description of one skill holds « toboggan »: every other
      // key adds its weight, 9.4 in all
      const makeupArtiste = await searchingMakeup({ search: "Toboggan" });
      expect(makeupArtiste).toEqual([
        { ...profileById(5), search_score: 9.400000014901162 },
      ]);
    });

    // the network is not searched: an email or a phone finds nothing, even
    // when the profile holds them (UI-07)

    it.each(["sarah@example.test", "0600000001"])(
      "should return nothing for the email or phone of a profile (%s)",
      async (search) => {
        strapi.entityService = {
          findMany: jest.fn().mockResolvedValue(allMakeupArtiste),
        };

        await expect(searchingMakeup({ search })).resolves.toEqual([]);
      }
    );

    it("should rank the profiles of the city first, never add them", async () => {
      strapi.entityService = {
        findMany: jest.fn().mockResolvedValue(allMakeupArtiste),
      };

      // every profile has a « mains » skill: the two in Nantes come first
      const makeupArtiste = await searchingMakeup({
        search: "mains",
        city: "Nantes",
      });
      expect(makeupArtiste.map((profile) => profile.id).slice(0, 2)).toEqual([
        1, 2,
      ]);
      expect(makeupArtiste).toHaveLength(allMakeupArtiste.length);

      // an unknown term finds nothing, whatever the city
      await expect(
        searchingMakeup({ search: "sarah@example.test", city: "Nantes" })
      ).resolves.toEqual([]);
    });

    it("should find the profiles that match every word, in any key", async () => {
      strapi.entityService = {
        findMany: jest.fn().mockResolvedValue(allMakeupArtiste),
      };

      // « mains » is a skill of every profile, « Nantes » the city of two
      const makeupArtiste = await searchingMakeup({ search: "mains Nantes" });
      expect(makeupArtiste.map((profile) => profile.id)).toEqual([1, 2]);

      await expect(searchingMakeup({ search: "mains zzqq" })).resolves.toEqual(
        []
      );
    });

    it("should ignore the accents of the term and of the profile", async () => {
      // under 5 letters a term must match without any error: « Sete » used
      // to miss « Sète »
      const sete = {
        id: 8,
        username: "lou",
        last_name: "Martin",
        first_name: "Lou",
        speciality: "Teint",
        city: "Sète",
        available: true,
        description: "Je fais le maquillage d'un événement",
        skills: [],
        service_offers: [],
      };
      strapi.entityService = {
        findMany: jest.fn().mockResolvedValue([...allMakeupArtiste, sete]),
      };

      for (const search of ["Sete", "evenement", "événement"]) {
        const makeupArtiste = await searchingMakeup({ search });
        expect(makeupArtiste.map((profile) => profile.id)).toEqual([8]);
      }
    });

    it("should find a word deep in a long description", async () => {
      // with distance 100, a word past the first 150 characters was lost
      const deep = {
        id: 7,
        last_name: "Durand",
        first_name: "Lea",
        speciality: "Teint",
        city: "Lille",
        available: true,
        description: `${"Je me déplace avec mes produits dans toute la région, du lundi au samedi. ".repeat(
          3
        )}Je fais aussi le maquillage de mariage.`,
        skills: [],
        service_offers: [],
      };
      expect(deep.description.indexOf("mariage")).toBeGreaterThan(150);
      strapi.entityService = {
        findMany: jest.fn().mockResolvedValue([...allMakeupArtiste, deep]),
      };

      const makeupArtiste = await searchingMakeup({ search: "mariage" });
      expect(makeupArtiste.map((profile) => profile.id)).toEqual([7]);
    });
  });
});

// What searchingMakeup loads (PROFILE_POPULATE: skills and service offers,
// no picture here), and one network block to show it is never searched.
// Fictional values only.
const skills = (firstId, description = null) => [
  { id: firstId, name: "mains", description: null },
  { id: firstId + 1, name: "les pieds", description },
];
const serviceOffers = (id) => [
  {
    id,
    name: "mains",
    description: "je te colorie les mains en bleu comme shrek",
    price: "69.0",
  },
];

const allMakeupArtiste = [
  {
    id: 3,
    username: "sarah.dx",
    last_name: "Gimber",
    first_name: "Sarah",
    speciality: "Joue",
    city: "Paris",
    action_radius: 25,
    available: true,
    description: "Je suis Sarah",
    skills: skills(23),
    service_offers: serviceOffers(16),
    network: {
      id: 16,
      instagram: "https://instagram.com/sarah.dx",
      phone: "0600000001",
      email: "sarah@example.test",
    },
  },
  {
    id: 1,
    username: "milo.dx",
    last_name: "Lagrange",
    first_name: "Milo",
    speciality: "mains",
    city: "Nantes",
    action_radius: 25,
    available: true,
    description: "Je suis steph",
    skills: skills(19),
    service_offers: serviceOffers(14),
  },
  {
    id: 2,
    username: "julie.dx",
    last_name: "Dubois",
    first_name: "Julie",
    speciality: "Pieds",
    city: "Nantes",
    action_radius: 25,
    available: true,
    description: "Je suis Julie",
    skills: skills(21),
    service_offers: serviceOffers(15),
  },
  {
    id: 4,
    username: "eva.dx",
    last_name: "Tapernier",
    first_name: "Eva",
    speciality: "Cheveux",
    city: "Anger",
    action_radius: 25,
    available: true,
    description: "Je suis Eva",
    skills: skills(25),
    service_offers: serviceOffers(17),
  },
  {
    id: 5,
    username: "fanny",
    last_name: "Chevalier",
    first_name: "Fanny",
    speciality: "Ongles",
    city: "Tours",
    action_radius: 25,
    available: true,
    description: "Je suis Fanny",
    skills: skills(27, "toboggan"),
    service_offers: serviceOffers(18),
  },
  {
    id: 6,
    username: "edwige",
    last_name: "Cinquin",
    first_name: "Edwina",
    speciality: "Fesses",
    city: "Monpelier",
    action_radius: 25,
    available: true,
    description: "Je suis Edwige",
    skills: skills(29),
    service_offers: serviceOffers(19),
  },
];

const profileById = (id) =>
  allMakeupArtiste.find((makeupArtiste) => makeupArtiste.id === id);
