// S09: GET /api/searching answers without a term, returns 50 profiles at
// most, counts available=null as available, carries no contact details,
// account or internal score, and brakes at 60 requests per minute per
// client address.
const { describe, it, expect, beforeAll, afterAll } = require("@jest/globals");
const { setupStrapi, stopStrapi } = require("../helpers/strapi");
const { http, createAccount, findKeys } = require("../helpers/fixtures");

const PROFILE_UID = "api::makeup-artiste.makeup-artiste";

let nextAddress = 1;
// each test searches from its own client address (proxy: true)
const newClient = () => `198.51.100.${nextAddress++}`;

const search = (client, query = {}) =>
  http().get("/api/searching").set("X-Forwarded-For", client).query(query);

const createProfile = (username, data) =>
  strapi.entityService.create(PROFILE_UID, {
    data: {
      username,
      first_name: `Prenom ${username}`,
      speciality: "Mariage",
      description: "Maquillage de mariee",
      score: 4,
      network: {
        email: `${username}@example.test`,
        phone: "0600000000",
        instagram: `https://instagram.com/${username}`,
      },
      ...data,
    },
  });

describe("GET /api/searching", () => {
  beforeAll(async () => {
    await setupStrapi();

    // 60 searchable profiles: 35 available, 25 never set (null)
    for (let i = 0; i < 35; i++) {
      await createProfile(`dispo-${i}`, { city: "Lyon", available: true });
    }
    for (let i = 0; i < 25; i++) {
      await createProfile(`jamais-${i}`, { city: "Lyon", available: null });
    }
    await createProfile("chamonix-null", {
      city: "Chamonix",
      available: null,
    });
    await createProfile("chamonix-off", {
      city: "Chamonix",
      available: false,
    });
    // a profile with its account, which must never come out
    await createAccount("compte", {
      city: "Annecy",
      speciality: "Mariage",
      available: true,
      network: { email: "compte@example.test", phone: "0611111111" },
    });
  }, 120000);

  afterAll(async () => {
    await stopStrapi();
  });

  const expectPublicOnly = (results) => {
    expect(findKeys(results, ["email", "phone", "user", "score"])).toEqual([]);
    expect(JSON.stringify(results)).not.toContain("@example.test");
  };

  it("S09 - without a term: 200, 50 profiles at most, no contact details", async () => {
    const response = await search(newClient()).expect(200);

    expect(response.body).toHaveLength(50);
    expectPublicOnly(response.body);
    expect(response.body.every((result) => result.available !== false)).toBe(
      true
    );
  });

  it("S09 - with a term: ranked, 50 profiles at most, no contact details", async () => {
    const response = await search(newClient(), { search: "Lyon" }).expect(200);

    expect(response.body).toHaveLength(50);
    expect(response.body[0].city).toBe("Lyon");
    expect(typeof response.body[0].search_score).toBe("number");
    expectPublicOnly(response.body);
  });

  it("S09 - keeps what the search page shows", async () => {
    const response = await search(newClient(), { search: "Annecy" }).expect(
      200
    );
    const first = response.body[0];

    expect(first).toMatchObject({
      username: "compte",
      city: "Annecy",
      speciality: "Mariage",
      pro: false,
    });
    expect(first.network).toEqual({
      id: expect.any(Number),
      instagram: null,
      facebook: null,
      linkedin: null,
      website: null,
      youtube: null,
    });
    expect(first).toHaveProperty("main_picture");
    expect(first).toHaveProperty("skills");
    expectPublicOnly(response.body);
  });

  it("S09 - available=null is searchable, available=false is not", async () => {
    const response = await search(newClient(), {
      search: "Chamonix",
      city: "Chamonix",
    }).expect(200);
    const usernames = response.body.map((result) => result.username);

    expect(usernames[0]).toBe("chamonix-null");
    expect(usernames).not.toContain("chamonix-off");
  });

  it("S09 - a city alone is a search", async () => {
    const response = await search(newClient(), { city: "Chamonix" }).expect(
      200
    );

    expect(response.body[0].username).toBe("chamonix-null");
  });

  it("S09 - the 61st search of the minute from one address gets a 429", async () => {
    const client = newClient();
    for (let i = 0; i < 60; i++) {
      await search(client, { search: "Lyon" }).expect(200);
    }

    await search(client, { search: "Lyon" }).expect(429);
    // another visitor is not affected
    await search(newClient(), { search: "Lyon" }).expect(200);
  });
});
