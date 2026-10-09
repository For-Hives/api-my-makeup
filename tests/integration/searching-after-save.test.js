// URG-11: what the removed Cypress spec profil-update-then-search.cy.js
// checked against the production API, on the in-process Strapi only. A
// profile saved through PATCH /api/me-makeup is found right away by the
// public search, by its first and last name, with its new values and never
// the previous ones, and leaves the search once its availability is turned
// off. Its own file, so its own database: the counts of searching.test.js
// stay as they are.
const { describe, it, expect, beforeAll, afterAll } = require("@jest/globals");
const { setupStrapi, stopStrapi } = require("../helpers/strapi");
const { http, createAccount } = require("../helpers/fixtures");

let nextAddress = 1;
// each search from its own client address (60 searches per minute each)
const search = (query) =>
  http()
    .get("/api/searching")
    .set("X-Forwarded-For", `203.0.113.${nextAddress++}`)
    .query(query)
    .expect(200);

const usernames = (response) => response.body.map((result) => result.username);

const patch = (account, body) =>
  http()
    .patch("/api/me-makeup")
    .set("Authorization", `Bearer ${account.jwt}`)
    .send(body)
    .expect(200);

describe("a profile saved through /api/me-makeup, then searched", () => {
  beforeAll(async () => {
    await setupStrapi();
    // searchable profiles that share one of the names only
    await createAccount("same-first-name", {
      first_name: "Utilisateur",
      last_name: "Martin",
      speciality: "Mariage",
      city: "Lyon",
      available: true,
    });
    await createAccount("same-last-name", {
      first_name: "Camille",
      last_name: "Test",
      speciality: "Mariage",
      city: "Lyon",
      available: true,
    });
  }, 60000);

  afterAll(async () => {
    await stopStrapi();
  });

  it("URG-11 - the first and last name saved are found right away", async () => {
    const artist = await createAccount("complete", {
      first_name: "Prenom",
      speciality: "Mariage",
    });

    await patch(artist, {
      first_name: "Utilisateur",
      last_name: "DE TEST",
      speciality:
        "Maquilleur professionnel et coiffeur professionnel pour le cinéma",
      city: "Nantes",
      action_radius: "5",
      available: true,
      company_artist_name: "My Makeup Artist",
    });

    // « de » is dropped (under 3 letters), « utilisateur » and « test » must
    // both match: the profiles with one of the names only are left out
    const response = await search({ search: "Utilisateur DE TEST" });
    expect(usernames(response)).toEqual(["complete"]);
    expect(response.body[0]).toMatchObject({
      first_name: "Utilisateur",
      last_name: "DE TEST",
      city: "Nantes",
      action_radius: 5,
      company_artist_name: "My Makeup Artist",
    });
  });

  it("URG-11 - the search returns the saved values, never the previous ones", async () => {
    const artist = await createAccount("renamed", {
      first_name: "Ancien",
      last_name: "Patronyme",
      speciality: "Mariage",
      city: "Annecy",
      available: true,
    });
    expect(usernames(await search({ search: "Ancien" }))).toEqual(["renamed"]);

    await patch(artist, {
      first_name: "Utilisatrice",
      last_name: "De Recette",
      city: "Nantes",
      available: true,
    });

    const response = await search({ search: "Utilisatrice De Recette" });
    expect(usernames(response)).toEqual(["renamed"]);
    expect(response.body[0]).toMatchObject({
      first_name: "Utilisatrice",
      last_name: "De Recette",
      city: "Nantes",
    });
    expect(usernames(await search({ search: "Ancien" }))).toEqual([]);
    expect(usernames(await search({ search: "Patronyme" }))).toEqual([]);
  });

  it("URG-11 - available false saved through PATCH hides the profile, null shows it again", async () => {
    const artist = await createAccount("paused", {
      first_name: "Prenom",
      speciality: "Mariage",
    });
    const term = { search: "Utilisatrice En Pause" };
    await patch(artist, {
      first_name: "Utilisatrice",
      last_name: "En Pause",
      available: true,
    });
    expect(usernames(await search(term))).toEqual(["paused"]);

    await patch(artist, { available: false });

    expect(usernames(await search(term))).toEqual([]);
    // nor in the directory without a term
    expect(usernames(await search({}))).not.toContain("paused");

    // the reset of the Cypress specs sent null: counted as available
    await patch(artist, { available: null });

    expect(usernames(await search(term))).toEqual(["paused"]);
    expect(usernames(await search({}))).toContain("paused");
  });
});
