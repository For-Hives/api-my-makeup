"use strict";
const _ = require("lodash");
const Fuse = require("fuse.js");
const {
  avecVillePublique,
  villePublique,
} = require("../../../utils/public-city");

const PROFILE_UID = "api::makeup-artiste.makeup-artiste";

// Search results are public and only fill the result cards of the search
// page (front src/pages/search.js, and its split by place of UI-10): an
// explicit list of fields, without the account, the internal scores and the
// email and phone (one search used to return the contact details of every
// artist). 50 full profiles weighed about 300 KB.
const PUBLIC_RESULT_FIELDS = [
  "id",
  "username",
  "first_name",
  "last_name",
  "company_artist_name",
  "speciality",
  "city",
  "action_radius",
  "pro",
];
const PUBLIC_PICTURE_FIELDS = [
  "id",
  "url",
  "width",
  "height",
  "alternativeText",
];
// One answer holds every match, the front cuts it in pages of 20 (UI-07):
// 95 searchable profiles in October 2026
const MAX_PUBLIC_RESULTS = 200;
// Longer terms only slow Fuse down
const MAX_TERM_LENGTH = 100;

/**
 * Keeps the fields of a result card of a profile found by the search, with
 * the public city (« Annecy (74) », never a street: UI-11,
 * src/utils/public-city.js), the skill names and the picture's scalars.
 * @param {object} profile
 * @returns {object}
 */
const toPublicResult = (profile) =>
  avecVillePublique({
    ..._.pick(profile, PUBLIC_RESULT_FIELDS),
    skills: (profile.skills ?? []).map((skill) => ({ name: skill.name })),
    main_picture: profile.main_picture
      ? _.pick(profile.main_picture, PUBLIC_PICTURE_FIELDS)
      : null,
  });

const searchTerm = (value) =>
  typeof value === "string" ? value.trim().slice(0, MAX_TERM_LENGTH) : "";

// available is null on the profiles where it was never set (47 in
// production): they count as available instead of never showing up.
const SEARCHABLE_FILTER = {
  $or: [{ available: { $eq: true } }, { available: { $null: true } }],
};

// What the search matches on and what a result card shows, nothing more
// (no network: the email and phone are neither searched nor returned)
const PROFILE_POPULATE = {
  // Media scalars only: populating the file relations ("*") also
  // returned createdBy/updatedBy, i.e. the admin users (email,
  // bcrypt hash, resetPasswordToken) behind admin uploads.
  main_picture: true,
  skills: true,
  service_offers: true,
};

// Accents are removed from the profiles and from the term: fuse.js 6 does not
// ignore them, and at threshold 0.2 « evenement » missed « événement » (two
// errors in 9 letters) and « Sete » missed « Sète »
const withoutAccents = (text) =>
  typeof text === "string"
    ? text.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    : text;

const withoutAccentsAll = (value) =>
  Array.isArray(value)
    ? value.filter((text) => typeof text === "string").map(withoutAccents)
    : withoutAccents(value);

// What the search matches on, each key with the weight a profile it does not
// match pays. The city is the public one (UI-11): a street or a postal code
// typed in the city field is never searchable (« Lilas » does not find « 12
// rue des Lilas, 74000 Annecy », « Annecy » does).
const balancedKeys = [
  {
    name: "city",
    weight: 3,
    getFn: (makeupArtiste) => villePublique(makeupArtiste.city),
  },
  {
    name: "speciality",
    weight: 2,
    getFn: (makeupArtiste) => makeupArtiste.speciality,
  },
  {
    name: "description",
    weight: 1.5,
    getFn: (makeupArtiste) => makeupArtiste.description,
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
    name: "last_name",
    weight: 0.5,
    getFn: (makeupArtiste) => makeupArtiste.last_name,
  },
  {
    name: "first_name",
    weight: 0.5,
    getFn: (makeupArtiste) => makeupArtiste.first_name,
  },
];

// Words that say nothing of what is looked for, dropped from a term of
// several words with those under 3 letters: « maquillage pour un mariage »
// looks for « maquillage » and « mariage »
const STOP_WORDS = new Set([
  "aux",
  "avec",
  "chez",
  "dans",
  "des",
  "est",
  "les",
  "mes",
  "mon",
  "par",
  "pour",
  "que",
  "qui",
  "ses",
  "son",
  "sur",
  "une",
]);

// Words of the request itself, or that every profile of the site is about:
// required, they would only drop the profiles that do not repeat them.
// « je cherche une maquilleuse pour mon mariage » looks for « mariage », as
// « mariage » alone does. Accents are already removed.
const QUERY_WORDS = new Set([
  "artist",
  "artiste",
  "besoin",
  "cherche",
  "recherche",
  "maquillage",
  "maquillages",
  "maquilleur",
  "maquilleurs",
  "maquilleuse",
  "maquilleuses",
  "makeup",
  "souhaite",
  "trouver",
  "veux",
  "voudrais",
]);

/**
 * The words a profile must all match, accents removed. Split on spaces
 * only, so that an email stays one word. A term of one word, or of short
 * words only, is looked for as typed.
 * @param {string} term - accents already removed
 * @returns {string[]}
 */
const searchWords = (term) => {
  const words = [...new Set(term.toLowerCase().split(/\s+/).filter(Boolean))];
  const significant = words.filter(
    (word) =>
      word.length >= 3 && !STOP_WORDS.has(word) && !QUERY_WORDS.has(word)
  );
  return words.length > 1 && significant.length ? significant : [term];
};

/**
 * searching service
 */

module.exports = {
  /**
   * Public search (GET /api/searching): the ranked profiles for `search`
   * (or `city` alone), or the last updated profiles without any term,
   * MAX_PUBLIC_RESULTS at most, the fields of a result card only.
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

  /**
   * The searchable profiles that match every word of `search` (each word
   * in at least one key), best first. Each word adds, for each key, the
   * Fuse score of its match (0 is exact) or the key's weight when it does
   * not match. A `city` other than the term only ranks: it never adds a
   * profile the term did not find (UI-07, UI-10).
   *
   * @param {{ search: string, city?: string }} params
   * @returns {Promise<object[]>} the profiles, with their search_score
   */
  searchingMakeup: async (params) => {
    try {
      const term =
        typeof params?.search === "string"
          ? withoutAccents(params.search).trim()
          : "";
      if (!term) {
        throw new Error("No search parameters found");
      }

      const allMakeupArtiste = await strapi.entityService.findMany(
        PROFILE_UID,
        {
          populate: PROFILE_POPULATE,
          filters: SEARCHABLE_FILTER,
        }
      );

      if (!allMakeupArtiste) {
        throw new Error("No makeup artiste found");
      }

      const searchByKey = balancedKeys.map((key) => ({
        key,
        search: keySearch(allMakeupArtiste, key),
      }));

      const scoreTotalByID = {};
      const addScore = (key, resultIDs) => {
        allMakeupArtiste.forEach(({ id }) => {
          scoreTotalByID[id] =
            (scoreTotalByID[id] ?? 0) + (resultIDs[id] ?? key.weight);
        });
      };

      // a profile must match every word, in any key: an unknown word
      // returns nothing (UI-07)
      const words = searchWords(term);
      const matchedWordsByID = {};

      words.forEach((word) => {
        const matchedIDs = new Set();
        searchByKey.forEach(({ key, search }) => {
          const resultIDs = search(word);
          addScore(key, resultIDs);
          Object.keys(resultIDs).forEach((id) => matchedIDs.add(id));
        });
        matchedIDs.forEach((id) => {
          matchedWordsByID[id] = (matchedWordsByID[id] ?? 0) + 1;
        });
      });

      // the city of the search, when it is not the term, puts its profiles
      // first among those the term found
      const city =
        typeof params.city === "string"
          ? withoutAccents(params.city).trim()
          : "";
      if (city && city.toLowerCase() !== term.toLowerCase()) {
        const { key, search } = searchByKey.find(
          ({ key }) => key.name === "city"
        );
        addScore(key, search(city));
      }

      // return the makeup artiste sorted by score, then by id
      return allMakeupArtiste
        .filter(({ id }) => matchedWordsByID[id] === words.length)
        .map((makeupArtiste) => ({
          ...makeupArtiste,
          search_score: scoreTotalByID[makeupArtiste.id],
        }))
        .sort((a, b) => a.search_score - b.search_score || a.id - b.id)
        .slice(0, MAX_PUBLIC_RESULTS);
    } catch (err) {
      console.log(err);
      throw err;
    }
  },
};

/**
 * Indexes the profiles on one key, accents removed.
 * @param {object[]} allMakeupArtiste
 * @param {{ name: string, getFn: Function }} key
 * @returns {(pattern: string) => Object<string, number>} the Fuse score of
 * each profile the pattern matches, by id
 */
function keySearch(allMakeupArtiste, key) {
  const keyFuse = new Fuse(allMakeupArtiste, {
    keys: [
      {
        name: key.name,
        getFn: (makeupArtiste) => withoutAccentsAll(key.getFn(makeupArtiste)),
      },
    ],
    // A real match (UI-07): one typo per 5 letters of a word (« Anecy »
    // finds Annecy), none in a shorter one. At 0.65 « blah » found 42 of the
    // 95 profiles; at 0.4, with ignoreLocation, « test » still found 34.
    threshold: 0.2,
    // A word deep in a long description matches as well as at its start
    ignoreLocation: true,
    includeScore: true,
    findAllMatches: true,
    ignoreFieldNorm: true,
    includeMatches: true,
  });

  return (pattern) => {
    const keyResultScoreByID = {};

    // a query on the key, as before: its scores (√ε for an exact match)
    // keep the ranking unchanged
    keyFuse.search({ [key.name]: pattern }).forEach((result) => {
      keyResultScoreByID[result.item.id] = result.score;
    });

    return keyResultScoreByID;
  };
}
