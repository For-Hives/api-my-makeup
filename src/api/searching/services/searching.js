"use strict";
const _ = require("lodash");
const Fuse = require("fuse.js");

const PROFILE_UID = "api::makeup-artiste.makeup-artiste";

// Search results are public: an explicit list of fields, without the
// account, the internal score and the email and phone (one search used to
// return the contact details of every artist).
const PUBLIC_RESULT_FIELDS = [
  "id",
  "username",
  "first_name",
  "last_name",
  "company_artist_name",
  "speciality",
  "city",
  "action_radius",
  "available",
  "pro",
  "description",
  "skills",
  "experiences",
  "courses",
  "service_offers",
  "language",
  "main_picture",
  "image_gallery",
  "search_score",
];
const PUBLIC_NETWORK_FIELDS = [
  "id",
  "youtube",
  "facebook",
  "instagram",
  "website",
  "linkedin",
];
// Until the search page paginates (UI-07, then 20 per page)
const MAX_PUBLIC_RESULTS = 50;
// Longer terms only slow Fuse down
const MAX_TERM_LENGTH = 100;

/**
 * Keeps the public fields of a profile found by the search.
 * @param {object} profile
 * @returns {object}
 */
const toPublicResult = (profile) => {
  const result = _.pick(profile, PUBLIC_RESULT_FIELDS);
  if (profile.network !== undefined) {
    result.network = profile.network
      ? _.pick(profile.network, PUBLIC_NETWORK_FIELDS)
      : null;
  }
  return result;
};

const searchTerm = (value) =>
  typeof value === "string" ? value.trim().slice(0, MAX_TERM_LENGTH) : "";

// available is null on the profiles where it was never set (47 in
// production): they count as available instead of never showing up.
const SEARCHABLE_FILTER = {
  $or: [{ available: { $eq: true } }, { available: { $null: true } }],
};

const PROFILE_POPULATE = {
  // Media scalars only: populating the file relations ("*") also
  // returned createdBy/updatedBy, i.e. the admin users (email,
  // bcrypt hash, resetPasswordToken) behind admin uploads.
  main_picture: true,
  skills: {
    populate: "*",
  },
  experiences: {
    populate: "*",
  },
  courses: {
    populate: "*",
  },
  service_offers: {
    populate: "*",
  },
  network: {
    populate: "*",
  },
  language: {
    populate: "*",
  },
  user: {
    select: ["username"],
  },
  image_gallery: true,
};

const balancedKeys = [
  {
    name: "city",
    weight: 3,
  },
  {
    name: "speciality",
    weight: 2,
  },
  {
    name: "description",
    weight: 1.5,
  },
  {
    name: "skills_description",
    weight: 1,
    getFn: (makeupArtiste) =>
      makeupArtiste.skills?.map((skill) => skill.description),
  },
  {
    name: "service_offers_description",
    weight: 1,
    getFn: (makeupArtiste) =>
      makeupArtiste.service_offers?.map((service) => service.description),
  },
  {
    name: "skills_name",
    weight: 0.9,
    getFn: (makeupArtiste) => makeupArtiste.skills?.map((skill) => skill.name),
  },
  {
    name: "network_phone",
    weight: 0.8,
    getFn: (makeupArtiste) => makeupArtiste.network?.phone,
  },
  {
    name: "network_email",
    weight: 0.8,
    getFn: (makeupArtiste) => makeupArtiste.network?.email,
  },
  {
    name: "last_name",
    weight: 0.5,
  },
  {
    name: "first_name",
    weight: 0.5,
  },
];

/**
 * searching service
 */

module.exports = {
  /**
   * Public search (GET /api/searching): the ranked profiles for `search`
   * (or `city` alone), or the last updated profiles without any term,
   * 50 at most, public fields only.
   *
   * @param {{ search?: string, city?: string }} params - Query string
   * @returns {Promise<object[]>}
   */
  searchPublicMakeup: async (params) => {
    const city = searchTerm(params?.city);
    const search = searchTerm(params?.search) || city;

    const profiles = search
      ? await module.exports.searchingMakeup({
          search,
          ...(city && { city }),
        })
      : await strapi.entityService.findMany(PROFILE_UID, {
          populate: PROFILE_POPULATE,
          filters: SEARCHABLE_FILTER,
          sort: { updatedAt: "desc" },
          limit: MAX_PUBLIC_RESULTS,
        });

    return profiles.slice(0, MAX_PUBLIC_RESULTS).map(toPublicResult);
  },

  toPublicResult,

  searchingMakeup: async (params) => {
    try {
      if (!params || !params.search) {
        throw new Error("No search parameters found");
      }

      const allMakeupArtisteUsers = await strapi.entityService.findMany(
        PROFILE_UID,
        {
          populate: PROFILE_POPULATE,
          filters: SEARCHABLE_FILTER,
        }
      );

      const allMakeupArtiste = allMakeupArtisteUsers.map((makeupArtiste) => ({
        ...makeupArtiste,
        user: { username: makeupArtiste.user?.username },
      }));

      if (!allMakeupArtiste) {
        throw new Error("No makeup artiste found");
      }

      // find the makeup artiste with best city match

      const cityKey = balancedKeys.find((key) => key.name === "city");

      const cityParams = {
        city: params.city ?? params.search,
      };

      const cityResultIDs = findIdByKey(allMakeupArtiste, cityKey, cityParams);

      // find the makeup artiste with best speciality match

      const specialityKey = balancedKeys.find(
        (key) => key.name === "speciality"
      );

      const specialityParams = {
        speciality: params.search ?? "",
      };

      const specialityResultIDs = findIdByKey(
        allMakeupArtiste,
        specialityKey,
        specialityParams
      );

      // find the makeup artiste with best skills match

      const skillsNameKey = balancedKeys.find(
        (key) => key.name === "skills_name"
      );

      const skillsNameParams = {
        skills_name: params.search ?? "",
      };

      const skillsNameResultIDs = findIdByKey(
        allMakeupArtiste,
        skillsNameKey,
        skillsNameParams
      );

      // find the makeup artiste with best skills description match

      const skillsDescriptionKey = balancedKeys.find(
        (key) => key.name === "skills_description"
      );

      const skillsDescriptionParams = {
        skills_description: params.search ?? "",
      };

      const skillsDescriptionResultIDs = findIdByKey(
        allMakeupArtiste,
        skillsDescriptionKey,
        skillsDescriptionParams
      );

      // find the makeup artiste with best description match

      const descriptionKey = balancedKeys.find(
        (key) => key.name === "description"
      );

      const descriptionParams = {
        description: params.search ?? "",
      };

      const descriptionResultIDs = findIdByKey(
        allMakeupArtiste,
        descriptionKey,
        descriptionParams
      );

      // find the makeup artiste with best service offers match

      const serviceOffersDescriptionKey = balancedKeys.find(
        (key) => key.name === "service_offers_description"
      );

      const serviceOffersDescriptionParams = {
        service_offers_description: params.search ?? "",
      };

      const serviceOffersDescriptionResultIDs = findIdByKey(
        allMakeupArtiste,
        serviceOffersDescriptionKey,
        serviceOffersDescriptionParams
      );

      // find the makeup artiste with best social network match

      const networkPhoneKey = balancedKeys.find(
        (key) => key.name === "network_phone"
      );

      const networkPhoneParams = {
        network_phone: params.search ?? "",
      };

      const networkPhoneResultIDs = findIdByKey(
        allMakeupArtiste,
        networkPhoneKey,
        networkPhoneParams
      );

      const networkEmailKey = balancedKeys.find(
        (key) => key.name === "network_email"
      );

      const networkEmailParams = {
        network_email: params.search ?? "",
      };

      const networkEmailResultIDs = findIdByKey(
        allMakeupArtiste,
        networkEmailKey,
        networkEmailParams
      );

      // find the makeup artiste with best last name match

      const lastNameKey = balancedKeys.find((key) => key.name === "last_name");

      const lastNameParams = {
        last_name: params.search ?? "",
      };

      const lastNameResultIDs = findIdByKey(
        allMakeupArtiste,
        lastNameKey,
        lastNameParams
      );

      // find the makeup artiste with best first name match

      const firstNameKey = balancedKeys.find(
        (key) => key.name === "first_name"
      );

      const firstNameParams = {
        first_name: params.search ?? "",
      };

      const firstNameResultIDs = findIdByKey(
        allMakeupArtiste,
        firstNameKey,
        firstNameParams
      );

      // add up the score of each makeup artiste given by each search

      const scoreTotalByID = {};

      // for makeup.id in allMakeupArtiste

      for (let key in allMakeupArtiste) {
        key = allMakeupArtiste[key].id;

        if (cityResultIDs[key] === undefined) {
          scoreTotalByID[key] = scoreTotalByID[key] ?? 0;
          scoreTotalByID[key] += balancedKeys.find(
            (key) => key.name === "city"
          ).weight;
        }

        if (specialityResultIDs[key] === undefined) {
          scoreTotalByID[key] = scoreTotalByID[key] ?? 0;
          scoreTotalByID[key] += balancedKeys.find(
            (key) => key.name === "speciality"
          ).weight;
        }

        if (skillsNameResultIDs[key] === undefined) {
          scoreTotalByID[key] = scoreTotalByID[key] ?? 0;
          scoreTotalByID[key] += balancedKeys.find(
            (key) => key.name === "skills_name"
          ).weight;
        }

        if (skillsDescriptionResultIDs[key] === undefined) {
          scoreTotalByID[key] = scoreTotalByID[key] ?? 0;
          scoreTotalByID[key] += balancedKeys.find(
            (key) => key.name === "skills_description"
          ).weight;
        }

        if (descriptionResultIDs[key] === undefined) {
          scoreTotalByID[key] = scoreTotalByID[key] ?? 0;
          scoreTotalByID[key] += balancedKeys.find(
            (key) => key.name === "description"
          ).weight;
        }

        if (serviceOffersDescriptionResultIDs[key] === undefined) {
          scoreTotalByID[key] = scoreTotalByID[key] ?? 0;
          scoreTotalByID[key] += balancedKeys.find(
            (key) => key.name === "service_offers_description"
          ).weight;
        }

        if (networkPhoneResultIDs[key] === undefined) {
          scoreTotalByID[key] = scoreTotalByID[key] ?? 0;
          scoreTotalByID[key] += balancedKeys.find(
            (key) => key.name === "network_phone"
          ).weight;
        }

        if (networkEmailResultIDs[key] === undefined) {
          scoreTotalByID[key] = scoreTotalByID[key] ?? 0;
          scoreTotalByID[key] += balancedKeys.find(
            (key) => key.name === "network_email"
          ).weight;
        }

        if (lastNameResultIDs[key] === undefined) {
          scoreTotalByID[key] = scoreTotalByID[key] ?? 0;
          scoreTotalByID[key] += balancedKeys.find(
            (key) => key.name === "last_name"
          ).weight;
        }

        if (firstNameResultIDs[key] === undefined) {
          scoreTotalByID[key] = scoreTotalByID[key] ?? 0;
          scoreTotalByID[key] += balancedKeys.find(
            (key) => key.name === "first_name"
          ).weight;
        }
      }

      for (let key in cityResultIDs) {
        scoreTotalByID[key] = scoreTotalByID[key] ?? 0;
        scoreTotalByID[key] += cityResultIDs[key];
      }

      for (let key in specialityResultIDs) {
        scoreTotalByID[key] = scoreTotalByID[key] ?? 0;
        scoreTotalByID[key] += specialityResultIDs[key];
      }

      for (let key in skillsNameResultIDs) {
        scoreTotalByID[key] = scoreTotalByID[key] ?? 0;
        scoreTotalByID[key] += skillsNameResultIDs[key];
      }

      for (let key in skillsDescriptionResultIDs) {
        scoreTotalByID[key] = scoreTotalByID[key] ?? 0;
        scoreTotalByID[key] += skillsDescriptionResultIDs[key];
      }

      for (let key in descriptionResultIDs) {
        scoreTotalByID[key] = scoreTotalByID[key] ?? 0;
        scoreTotalByID[key] += descriptionResultIDs[key];
      }

      for (let key in serviceOffersDescriptionResultIDs) {
        scoreTotalByID[key] = scoreTotalByID[key] ?? 0;
        scoreTotalByID[key] += serviceOffersDescriptionResultIDs[key];
      }

      for (let key in networkPhoneResultIDs) {
        scoreTotalByID[key] = scoreTotalByID[key] ?? 0;
        scoreTotalByID[key] += networkPhoneResultIDs[key];
      }

      for (let key in networkEmailResultIDs) {
        scoreTotalByID[key] = scoreTotalByID[key] ?? 0;
        scoreTotalByID[key] += networkEmailResultIDs[key];
      }

      for (let key in lastNameResultIDs) {
        scoreTotalByID[key] = scoreTotalByID[key] ?? 0;
        scoreTotalByID[key] += lastNameResultIDs[key];
      }

      for (let key in firstNameResultIDs) {
        scoreTotalByID[key] = scoreTotalByID[key] ?? 0;
        scoreTotalByID[key] += firstNameResultIDs[key];
      }

      // complete the makeup artiste with the makeup artiste data

      const makeupArtisteWithScore = [];

      for (let key in scoreTotalByID) {
        makeupArtisteWithScore.push({
          ...allMakeupArtiste.find(
            (makeupArtiste) => String(makeupArtiste.id) === key
          ),
          search_score: scoreTotalByID[key],
        });
      }

      // return the makeup artiste sorted by score
      let res = makeupArtisteWithScore
        .sort((a, b) => a.search_score - b.search_score)
        .filter((makeupArtiste) => makeupArtiste.search_score <= 12)
        .slice(0, 100);

      return res;
    } catch (err) {
      console.log(err);
      throw err;
    }
  },
};

function findIdByKey(allMakeupArtiste, key, params) {
  const keyFuse = new Fuse(allMakeupArtiste, {
    keys: [key],
    threshold: 0.65, // Increase the threshold value
    distance: 100, // Increase the distance value
    includeScore: true,
    findAllMatches: true,
    ignoreFieldNorm: true,
    includeMatches: true,
  });

  const keyResults = keyFuse.search(params);

  const keyResultScoreByID = {};

  keyResults.forEach((result) => {
    keyResultScoreByID[result.item.id] = result.score;
  });

  return keyResultScoreByID;
}
