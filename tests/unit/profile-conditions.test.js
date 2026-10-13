// The six conditions of a publishable profile and the entirely empty profile
// the search no longer lists, ported from the measurement tool
// (plans/mesures/outil/src/completude.ts): the cases of its tests
// (tests/completude.test.ts, « règles élémentaires » and U04 to U06), then
// the six conditions one by one. Fictional values only.
const { describe, it, expect } = require("@jest/globals");
const {
  CANAUX,
  aMedia,
  villeExploitable,
  prixNumerique,
  longueurDescription,
  aCanalDeContact,
  profileConditions,
  isEntirelyEmpty,
} = require("../../src/utils/profile-conditions");

const NONE = {
  pricedOffer: false,
  description: false,
  mainPicture: false,
  contactChannel: false,
  usableCity: false,
  speciality: false,
};

describe("the rules of the measurement tool", () => {
  it("usable city: a commune or a postal code, never an address nor a country", () => {
    for (const city of [
      "Annecy",
      "74000",
      "74000 Annecy",
      "Saint-Julien-en-Genevois",
      "Paris, Lyon et Annecy",
    ]) {
      expect(villeExploitable(city)).toBe(true);
    }
    for (const city of [
      "",
      "   ",
      "France",
      "FRANCE",
      "null",
      "12 rue des Lilas 74000 Annecy",
      "3 avenue X",
      null,
      42,
    ]) {
      expect(villeExploitable(city)).toBe(false);
    }
  });

  it("numeric price read in the text, from 5 to 10 000", () => {
    expect(prixNumerique("80€")).toBe(80);
    expect(prixNumerique("à partir de 82,50 €")).toBe(82.5);
    expect(prixNumerique("1 200 €")).toBe(1200);
    expect(prixNumerique("Sur devis")).toBeNull();
    expect(prixNumerique("2")).toBeNull();
    expect(prixNumerique(null)).toBeNull();
    // the bounds
    expect(prixNumerique("4,99")).toBeNull();
    expect(prixNumerique("5")).toBe(5);
    expect(prixNumerique("10 000 €")).toBe(10000);
    expect(prixNumerique("10 001 €")).toBeNull();
    // a number stored as such is no text price
    expect(prixNumerique(80)).toBeNull();
  });

  it("description length: spaces at both ends ignored, runs counted once", () => {
    expect(longueurDescription(`   ${"a".repeat(199)}   `)).toBe(199);
    expect(longueurDescription(`a${" ".repeat(50)}b`)).toBe(3);
    expect(longueurDescription(null)).toBe(0);
  });

  it("Strapi v4 and flat media", () => {
    expect(aMedia({ data: null })).toBe(false);
    expect(aMedia({ data: [] })).toBe(false);
    expect(aMedia({ data: { id: 1 } })).toBe(true);
    expect(aMedia({ data: [{ id: 1 }] })).toBe(true);
    expect(aMedia([])).toBe(false);
    expect(aMedia({ id: 1, url: "/x.jpg" })).toBe(true);
    expect(aMedia(null)).toBe(false);
    expect(aMedia(undefined)).toBe(false);
  });

  it("contact channel: one filled field of the network", () => {
    expect(aCanalDeContact({ instagram: "", email: null })).toBe(false);
    expect(aCanalDeContact({ id: 1, instagram: "   " })).toBe(false);
    expect(aCanalDeContact({})).toBe(false);
    expect(aCanalDeContact(null)).toBe(false);
    expect(aCanalDeContact(undefined)).toBe(false);
  });

  it.each(CANAUX)("contact channel: %s alone is one", (channel) => {
    expect(aCanalDeContact({ id: 1, [channel]: "fictif" })).toBe(true);
  });
});

describe("the six conditions and the entirely empty profile", () => {
  it.each([[{}], [null], [undefined]])(
    "nothing at all (%p): none, entirely empty",
    (profile) => {
      expect(profileConditions(profile)).toEqual(NONE);
      expect(isEntirelyEmpty(profile)).toBe(true);
    }
  );

  it("a profile just under each condition is entirely empty", () => {
    const profile = {
      id: 1,
      username: "presque",
      first_name: "Prenom",
      last_name: "Nom",
      company_artist_name: "Studio Fictif",
      action_radius: 30,
      available: true,
      pro: true,
      score: 4,
      speciality: "   ",
      // a country, as a street without commune (public city: nothing)
      city: "France",
      description: "a".repeat(199),
      main_picture: null,
      image_gallery: [{ id: 2 }],
      skills: [{ id: 1, name: "Teint" }],
      service_offers: [
        { id: 1, name: "Forfait", price: "Sur devis" },
        { id: 2, name: "Retouche", price: "2" },
        { id: 3, name: "Tournage", price: "12 000 €" },
        { id: 4, name: "Essai", price: null },
        null,
      ],
      network: { id: 1, instagram: " ", email: "", phone: null },
    };

    expect(profileConditions(profile)).toEqual(NONE);
    expect(isEntirelyEmpty(profile)).toBe(true);
    expect(
      isEntirelyEmpty({ ...profile, city: "9 impasse des Essais Fictifs" })
    ).toBe(true);
  });

  it.each([
    [
      "pricedOffer",
      { service_offers: [{ price: "Sur devis" }, { price: "80€" }] },
    ],
    ["description", { description: "a".repeat(200) }],
    ["mainPicture", { main_picture: { id: 1, url: "/m/1.webp" } }],
    ["contactChannel", { network: { id: 1, phone: "0600000000" } }],
    ["usableCity", { city: "Annecy" }],
    ["speciality", { speciality: "Mariage" }],
  ])("%s alone: one condition, not entirely empty", (condition, data) => {
    const profile = { id: 1, username: "seul", first_name: "Prenom", ...data };

    expect(profileConditions(profile)).toEqual({ ...NONE, [condition]: true });
    expect(isEntirelyEmpty(profile)).toBe(false);
  });

  it("usable city: read on the public city, an address counts by its commune", () => {
    expect(
      profileConditions({ city: "12 rue des Essais Fictifs, 74000 Annecy" })
        .usableCity
    ).toBe(true);
    expect(
      profileConditions({ city: "9 impasse des Essais Fictifs" }).usableCity
    ).toBe(false);
    expect(profileConditions({ city: "74 et alentours" }).usableCity).toBe(
      false
    );
  });
});
