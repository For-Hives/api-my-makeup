"use strict";

/**
 * The six conditions of a publishable profile, and the « entirely empty »
 * profile that meets none of them: the public search no longer lists it
 * (src/api/searching, decision of 13/10/2026: 13 profiles left by sign-up
 * spam were listed). Its page stays reachable by its address.
 *
 * 1. an offer with a price: the first number read in the price of one of the
 *    service offers is between 5 and 10 000 (« à partir de 80 € »,
 *    « 1 200 € », not « Sur devis »);
 * 2. a description of 200 characters at least, the spaces at both ends
 *    ignored and a run of spaces counted once;
 * 3. a main picture;
 * 4. a contact channel: the youtube, instagram, facebook, website, linkedin,
 *    phone or email of the network is filled;
 * 5. a usable city: the public city (src/utils/public-city.js) is a commune
 *    or a postal code, not a country, a street nor free text;
 * 6. a speciality.
 *
 * PORTED from the tool that measures the profiles every week,
 * plans/mesures/outil/src/completude.ts (texte, rempli, aMedia, normaliser,
 * villeExploitable, prixNumerique, longueurDescription, aCanalDeContact).
 * The French names are kept so that the two files can be compared side by
 * side, as in public-city.js: both MUST change together.
 * tests/unit/profile-conditions.test.js holds the cases of the tool's tests.
 *
 * The rules are the tool's, what they read is what the API holds:
 * - the tool reads the lists of the public API, which return the public
 *   city: villeExploitable() gets the public city here too (a postal
 *   address counts by its commune);
 * - those lists hide the email and phone, the whole network is read here: a
 *   profile whose only channel is an email or a phone has a contact channel;
 * - the quote form (option formulaireDevis of the tool) is no channel here:
 *   every profile would have one.
 */

const { villePublique } = require("./public-city");

/** Contact channels of the `network` component */
const CANAUX = [
  "youtube",
  "instagram",
  "facebook",
  "website",
  "linkedin",
  "phone",
  "email",
];

const DESCRIPTION_MIN = 200;

const texte = (v) => (typeof v === "string" ? v.trim() : "");

const rempli = (v) => texte(v) !== "";

/**
 * Strapi v4 media (`{ data: … }`) or flat (entity service): true when there
 * is at least one picture.
 * @param {unknown} v
 * @returns {boolean}
 */
function aMedia(v) {
  if (v === null || v === undefined) return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return "data" in v ? aMedia(v.data) : true;
  return false;
}

/**
 * Lower case, no accents, single spaces.
 * @param {unknown} v
 * @returns {string}
 */
function normaliser(v) {
  return texte(v)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ");
}

const PAS_UNE_VILLE = new Set([
  "france",
  "fr",
  "toute la france",
  "partout",
  "partout en france",
  "monde",
  "europe",
  "international",
  "null",
  "undefined",
  "-",
  ".",
]);

const VOIE =
  /\b(rue|avenue|av|chemin|allee|bd|boulevard|impasse|route|place|lieu-dit|residence|bis|quai|cours)\b/;

/**
 * Usable city: a commune or a postal code, not a country, not a postal
 * address, not free text.
 * @param {unknown} city
 * @returns {boolean}
 */
function villeExploitable(city) {
  const v = normaliser(city);
  if (v === "" || PAS_UNE_VILLE.has(v)) return false;
  if (VOIE.test(v)) return false;
  const codePostal = /\b\d{5}\b/.test(v);
  if (/^\d+,? /.test(v) && !/^\d{5}\b/.test(v)) return false;
  if (!/[a-z]/.test(v) && !codePostal) return false;
  return v.split(" ").length <= 6;
}

/**
 * First amount read in a text price (« à partir de 80 € », « 1 200 € »), or
 * null (« Sur devis », out of 5 to 10 000).
 * @param {unknown} price
 * @returns {number|null}
 */
function prixNumerique(price) {
  const v = texte(price)
    .replace(/(\d)[\s  ](?=\d{3}\b)/g, "$1")
    .replace(",", ".");
  const m = /(\d+(?:\.\d+)?)/.exec(v);
  if (m === null) return null;
  const montant = Number(m[1]);
  return montant >= 5 && montant <= 10000 ? montant : null;
}

/**
 * Length of the description, leading and trailing spaces ignored, runs of
 * spaces counted once.
 * @param {unknown} description
 * @returns {number}
 */
function longueurDescription(description) {
  return texte(description).replace(/\s+/g, " ").length;
}

/**
 * @param {Record<string, unknown>|null|undefined} network
 * @returns {boolean}
 */
function aCanalDeContact(network) {
  if (network === null || network === undefined) return false;
  return CANAUX.some((canal) => rempli(network[canal]));
}

/**
 * Which of the six conditions of a publishable profile a profile meets.
 *
 * @param {object} profile - as the entity service returns it, with its
 * service_offers, main_picture and network populated
 * @returns {{ pricedOffer: boolean, description: boolean, mainPicture: boolean, contactChannel: boolean, usableCity: boolean, speciality: boolean }}
 */
function profileConditions(profile) {
  const p = profile ?? {};
  const offers = Array.isArray(p.service_offers) ? p.service_offers : [];

  return {
    pricedOffer: offers.some((offer) => prixNumerique(offer?.price) !== null),
    description: longueurDescription(p.description) >= DESCRIPTION_MIN,
    mainPicture: aMedia(p.main_picture),
    contactChannel: aCanalDeContact(p.network),
    usableCity: villeExploitable(villePublique(p.city)),
    speciality: rempli(p.speciality),
  };
}

/**
 * True when a profile meets none of the six conditions.
 *
 * @param {object} profile - see profileConditions()
 * @returns {boolean}
 */
const isEntirelyEmpty = (profile) =>
  !Object.values(profileConditions(profile)).some(Boolean);

module.exports = {
  CANAUX,
  DESCRIPTION_MIN,
  aMedia,
  villeExploitable,
  prixNumerique,
  longueurDescription,
  aCanalDeContact,
  profileConditions,
  isEntirelyEmpty,
};
