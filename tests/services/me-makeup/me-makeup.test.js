const {
  createMakeupArtist,
  updateMakeupArtist,
  meMakeupArtist,
  refusedFileIds,
  requestedFileIds,
} = require("../../../src/api/makeup-artiste/services/me-makeup");
const { describe, expect, it, beforeAll, afterAll } = require("@jest/globals");
const fs = require("fs");
const { setupStrapi, stopStrapi } = require("../../helpers/strapi");

describe("test du service init-makeup", () => {
  beforeAll(async () => {
    await setupStrapi();
  }, 20000);

  afterAll(async () => {
    await stopStrapi();
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
        findOne: jest
          .fn()
          .mockResolvedValue({ ...existing[0], last_name: "Jones" }),
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

  describe("ownership rule of the pictures (UI-03)", () => {
    const HER = 7;
    const rule = (requestedIds, files, currentIds = [10, 11]) =>
      refusedFileIds({ userId: HER, currentIds, requestedIds, files });

    it("allows the files already on her profile", () => {
      expect(rule([10, 11], [])).toEqual([]);
    });

    it("allows a file she uploaded that nothing uses", () => {
      expect(
        rule([10, 20], [{ id: 20, uploaded_by: HER, used: false }])
      ).toEqual([]);
    });

    it("refuses a file she uploaded that an entry already uses", () => {
      expect(rule([20], [{ id: 20, uploaded_by: HER, used: true }])).toEqual([
        20,
      ]);
    });

    it("refuses another account's file, used or not", () => {
      expect(
        rule(
          [21, 22],
          [
            { id: 21, uploaded_by: 8, used: false },
            { id: 22, uploaded_by: 8, used: true },
          ]
        )
      ).toEqual([21, 22]);
    });

    it("refuses a file without uploader (admin upload, file sent before UI-03)", () => {
      expect(
        rule(
          [23, 24],
          [
            { id: 23, uploaded_by: null, used: false },
            { id: 24, used: false },
          ]
        )
      ).toEqual([23, 24]);
    });

    it("refuses an id that matches no file", () => {
      expect(rule([99], [])).toEqual([99]);
    });

    it("compares ids whatever their type (Postgres, SQLite)", () => {
      expect(
        refusedFileIds({
          userId: "7",
          currentIds: ["10"],
          requestedIds: [10, "20"],
          files: [{ id: "20", uploaded_by: 7, used: false }],
        })
      ).toEqual([]);
    });
  });

  describe("file ids of a PATCH body (UI-03)", () => {
    it("reads ids, numeric strings and { id } objects of both media fields", () => {
      expect(
        requestedFileIds({
          main_picture: { id: 3 },
          image_gallery: [4, "5", 4],
          city: "Annecy",
        })
      ).toEqual({ ids: [3, 4, 5], valid: true });
    });

    it("takes null and an empty list as no file", () => {
      expect(
        requestedFileIds({ main_picture: null, image_gallery: [] })
      ).toEqual({ ids: [], valid: true });
      expect(requestedFileIds({ first_name: "Al" })).toEqual({
        ids: [],
        valid: true,
      });
    });

    it.each([
      ["a connect object", { image_gallery: { connect: [{ id: 1 }] } }],
      ["a set object", { main_picture: { set: [1] } }],
      ["a whole file object", { main_picture: { id: 1, url: "/x.png" } }],
      ["a word", { image_gallery: ["x"] }],
      ["zero", { main_picture: 0 }],
      ["a negative id", { main_picture: -1 }],
      ["a decimal id", { main_picture: 1.5 }],
    ])("rejects %s", (_label, fields) => {
      expect(requestedFileIds(fields)).toEqual({ ids: [], valid: false });
    });
  });
});
