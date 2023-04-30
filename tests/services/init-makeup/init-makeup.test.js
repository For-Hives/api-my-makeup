const {
  createMakeupArtist,
  updateMakeupArtist,
  meMakeupArtist,
} = require("../../../src/api/makeup-artiste/services/init-makeup");
const { describe, expect, it, beforeAll, afterAll } = require("@jest/globals");
const fs = require("fs");
const { setupStrapi, cleanupStrapi } = require("../../helpers/strapi");

describe("test du service init-makeup", () => {
  beforeAll(async () => {
    await setupStrapi();
  }, 20000);

  afterAll(async () => {
    await cleanupStrapi();
  });

  it("strapi is defined", () => {
    expect(strapi).toBeDefined();
  });

  describe("test de la function createMakeupArtist", () => {
    it("should throw an error if user is not defined", async () => {
      await expect(createMakeupArtist()).rejects.toThrow("User not found");
    });

    it("should throw an error if makeup artist already exists for user", async () => {
      const user = {
        id: 1,
      };

      const existing = [
        {
          id: 1,
        },
      ];

      strapi.entityService = {
        findMany: jest.fn().mockResolvedValue(existing),
      };

      await expect(createMakeupArtist(user)).rejects.toThrow(
        "Makeup artist already exists for this user"
      );
    });

    it("should create a new makeup artist for user id", async () => {
      const user = {
        id: 1,
      };

      const existing = [];

      strapi.entityService = {
        findMany: jest.fn().mockResolvedValue(existing),
        create: jest.fn().mockResolvedValue({
          id: 1,
        }),
      };

      const result = await createMakeupArtist(user);

      expect(result).toEqual({
        id: 1,
      });
    });
  });

  describe("test de la function updateMakeupArtist", () => {
    it("should throw an error if user is not defined", async () => {
      await expect(updateMakeupArtist()).rejects.toThrow("User not found");
    });

    it("should throw an error if makeup artist does not exist for user", async () => {
      const user = {
        id: 1,
      };

      const existing = [];

      strapi.entityService = {
        findMany: jest.fn().mockResolvedValue(existing),
      };

      await expect(updateMakeupArtist(user)).rejects.toThrow(
        "Makeup artist does not exist for this user"
      );
    });

    it("should update a makeup artist for user id", async () => {
      const user = {
        id: 1,
      };

      const existing = [
        {
          id: 1,
          last_name: "Smith",
        },
      ];

      updatedJson = {
        last_name: "Jones",
      };

      strapi.entityService = {
        findMany: jest.fn().mockResolvedValue(existing),
        update: jest.fn().mockResolvedValue({
          id: 1,
          last_name: "Jones",
        }),
      };

      const result = await updateMakeupArtist(user, updatedJson);

      expect(result).toEqual({
        id: 1,
        last_name: "Jones",
      });
    });
  });

  describe("test de la function meMakeupArtist", () => {
    it("should throw an error if user is not defined", async () => {
      await expect(meMakeupArtist()).rejects.toThrow("User not found");
    });

    it("should throw an error if makeup artist does not exist for user", async () => {
      const user = {
        id: 1,
      };

      const existing = [];

      strapi.entityService = {
        findMany: jest.fn().mockResolvedValue(existing),
      };

      await expect(meMakeupArtist(user)).rejects.toThrow(
        "Makeup artist does not exist for this user"
      );
    });

    it("should return a makeup artist for user id", async () => {
      const user = {
        id: 1,
      };

      const existing = [
        {
          id: 1,
          last_name: "Smith",
        },
      ];

      strapi.entityService = {
        findMany: jest.fn().mockResolvedValue(existing),
      };

      const result = await meMakeupArtist(user);

      expect(result).toEqual({
        id: 1,
        last_name: "Smith",
      });
    });
  });
});
