"use strict";

/**
 * What the public API shows of a makeup artist profile.
 *
 * An artist publishes her email and phone for her profile page. Lists
 * (search, directory) never carry them: one request used to return every
 * email and phone of the site. The account linked to the profile is never
 * public. The city is the public one (« Annecy (74) »), never the street a
 * few artists typed there (UI-11, src/utils/public-city.js).
 *
 * The pictures of a profile can be populated with their `related` relation
 * (populate[main_picture][populate]=related, or =*): every entry that uses
 * the file, as stored, with the city as typed, the score and, populated
 * further, the network and the account. It never leaves the API.
 */

const _ = require("lodash");
const { villePublique } = require("./public-city");

const CONTACT_FIELDS = ["email", "phone"];

const MEDIA_FIELDS = ["main_picture", "image_gallery"];

/**
 * True when a /api/makeup-artistes query asks for one profile by its
 * username, as the profile page does: `filters[username][$eq]=<name>` or
 * `filters[username]=<name>`, and no other operator on the username.
 *
 * @param {object} query - Parsed query string (ctx.query)
 * @returns {boolean}
 */
const isSingleProfileQuery = (query) => {
  const username = query?.filters?.username;

  if (typeof username === "string") {
    return true;
  }

  return (
    _.isPlainObject(username) &&
    Object.keys(username).length === 1 &&
    typeof username.$eq === "string"
  );
};

/**
 * True when a query filters or sorts on the city: the public API returns
 * the public city, but a filter (`filters[city][$startsWith]=12 r`) or a
 * sort on the stored value would let anyone rebuild, letter by letter, the
 * street a few artists typed there. The front never does either.
 *
 * @param {object} query - Parsed query string (ctx.query)
 * @returns {boolean}
 */
const queriesTypedCity = (query) => {
  const hasCityKey = (value) =>
    Array.isArray(value)
      ? value.some(hasCityKey)
      : _.isPlainObject(value) &&
        Object.entries(value).some(
          ([key, inner]) => key === "city" || hasCityKey(inner)
        );
  const sortsOnCity = (value) => {
    if (typeof value === "string") {
      return value
        .split(",")
        .some((part) => part.trim().split(":")[0] === "city");
    }
    return Array.isArray(value) ? value.some(sortsOnCity) : hasCityKey(value);
  };

  return hasCityKey(query?.filters) || sortsOnCity(query?.sort);
};

/**
 * Removes the `related` relation of the files of a media field
 * (`{ data: file }` or `{ data: [file] }`), in place.
 *
 * @param {object} media
 */
const hideFileRelations = (media) => {
  [].concat(media?.data ?? []).forEach((file) => {
    if (file?.attributes) {
      delete file.attributes.related;
    }
  });
};

/**
 * Removes the account, the `related` relation of the pictures, and unless
 * `keepContacts` the email and phone, from one entry of a content API
 * response (`{ id, attributes }`), and replaces its city by the public one
 * (null when nothing can be shown), in place.
 *
 * @param {object} entry
 * @param {{ keepContacts: boolean }} options
 */
const hidePrivateFields = (entry, { keepContacts }) => {
  const attributes = entry?.attributes;

  if (!attributes) {
    return;
  }

  delete attributes.user;
  MEDIA_FIELDS.forEach((field) => hideFileRelations(attributes[field]));

  if ("city" in attributes) {
    attributes.city = villePublique(attributes.city) || null;
  }

  if (!keepContacts && _.isPlainObject(attributes.network)) {
    CONTACT_FIELDS.forEach((field) => delete attributes.network[field]);
  }
};

module.exports = {
  CONTACT_FIELDS,
  isSingleProfileQuery,
  queriesTypedCity,
  hidePrivateFields,
};
