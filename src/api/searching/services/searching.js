"use strict";
const Fuse = require("fuse.js");

const balancedKeys = [
  {
    name: "speciality",
    weight: 0.8,
  },
  {
    name: "city",
    weight: 1,
  },
  {
    name: "skills_name",
    weight: 0.4,
    getFn: (makeupArtiste) => makeupArtiste.skills?.map((skill) => skill.name),
  },
  {
    name: "skills_description",
    weight: 0.4,
    getFn: (makeupArtiste) =>
      makeupArtiste.skills?.map((skill) => skill.short_description),
  },
  "description",
  {
    name: "service_offers_description",
    weight: 0.4,
    getFn: (makeupArtiste) =>
      makeupArtiste.service_offers?.map((service) => service.description),
  },
  {
    name: "last_name",
    weight: 0.1,
  },
  {
    name: "first_name",
    weight: 0.1,
  },
];

/**
 * searching service
 */

module.exports = {
  searchingMakeup: async (params) => {
    try {
      if (!params) {
        throw new Error("No search parameters found");
      }

      const allMakeupArtiste = await strapi.entityService.findMany(
        "api::makeup-artiste.makeup-artiste",
        {
          populate: [
            "skills",
            "experiences",
            "courses",
            "service_offers",
            "network",
          ],
          filters: {
            available: {
              $eq: true,
            },
          },
        }
      );

      if (!allMakeupArtiste) {
        throw new Error("No makeup artiste found");
      }

      // map params "search" field to match the keys in balancedKeys
      params = {
        speciality: params.search ?? "",
        city: params.city ?? params.search,
        skills_name: params.search ?? "",
        skills_description: params.search ?? "",
        description: params.search ?? "",
        service_offers_description: params.search ?? "",
        // todo : social network
        last_name: params.search ?? "",
        first_name: params.search ?? "",
      };

      // create a new fuse instance
      const fuse = new Fuse(allMakeupArtiste, {
        keys: balancedKeys,
        threshold: 1, // Increase the threshold value
        distance: 5000, // Increase the distance value
        includeScore: true,
        findAllMatches: true,
        ignoreLocation: true,
      });

      // search for the user
      const results = fuse.search(params);

      // Get the item IDs from the search results
      const resultIDs = results.map((result) => result.item.id);

      // Get the items missing from the search results
      const missingItems = allMakeupArtiste.filter(
        (item) => !resultIDs.includes(item.id)
      );

      // Add the missing items to the end of the search results
      return [...results, ...missingItems.map((item) => ({ item, score: 1 }))];
    } catch (err) {
      throw err;
    }
  },
};
