"use strict";

/**
 * What the public API shows of a makeup artist profile.
 *
 * An artist publishes her email and phone for her profile page. Lists
 * (search, directory) never carry them: one request used to return every
 * email and phone of the site. The account linked to the profile is never
 * public.
 */

const _ = require("lodash");

const CONTACT_FIELDS = ["email", "phone"];

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
 * Removes the account, and unless `keepContacts` the email and phone, from
 * one entry of a content API response (`{ id, attributes }`), in place.
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

  if (!keepContacts && _.isPlainObject(attributes.network)) {
    CONTACT_FIELDS.forEach((field) => delete attributes.network[field]);
  }
};

module.exports = {
  CONTACT_FIELDS,
  isSingleProfileQuery,
  hidePrivateFields,
};
