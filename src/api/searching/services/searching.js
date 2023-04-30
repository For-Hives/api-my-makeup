"use strict";
const Fuse = require("fuse.js");

const balancedKeys = [
  {
    name: "speciality",
    weight: 2,
  },
  {
    name: "city",
    weight: 3,
  },
  {
    name: "skills_name",
    weight: 1.5,
    getFn: (makeupArtiste) => makeupArtiste.skills.map((skill) => skill.name),
  },
  {
    name: "skills_description",
    weight: 1.5,
    getFn: (makeupArtiste) =>
      makeupArtiste.skills.map((skill) => skill.short_description),
  },
  "description",
  {
    name: "service_offers_description",
    weight: 1.5,
    getFn: (makeupArtiste) =>
      makeupArtiste.service_offers.map((service) => service.description),
  },
  {
    name: "service_offers_option_description",
    weight: 1.2,
    getFn: (makeupArtiste) =>
      makeupArtiste.service_offers.map((option) => option.description),
  },
  {
    name: "courses_course_description",
    weight: 0.5,
    getFn: (makeupArtiste) =>
      makeupArtiste.courses.map((course) => course.course_description),
  },
  {
    name: "experiences_description",
    weight: 0.5,
    getFn: (makeupArtiste) =>
      makeupArtiste.experiences.map((experience) => experience.description),
  },
  {
    name: "last_name",
    weight: 0.2,
  },
  {
    name: "first_name",
    weight: 0.2,
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
        service_offers_option_description: params.search ?? "",
        courses_course_description: params.search ?? "",
        experiences_description: params.search ?? "",
        last_name: params.search ?? "",
        first_name: params.search ?? "",
      };

      // create a new fuse instance
      const fuse = new Fuse(allMakeupArtiste, {
        keys: balancedKeys,
        threshold: 1,
        includeScore: true,
        findAllMatches: true,
        ignoreLocation: true,
        ignoreFieldNorm: true,
      });

      // search for the user
      return fuse.search(params);
    } catch (err) {
      throw err;
    }
  },
};
