// S09: GET /api/searching answers without a term, returns every match in one
// answer (200 at most), counts available=null as available, keeps the fields
// of a result card only (no contact details, account or score), finds
// nothing for an unknown term nor for an email or phone (UI-07), and brakes
// at 60 requests per minute per client address.
const { describe, it, expect, beforeAll, afterAll } = require("@jest/globals");
const { setupStrapi, stopStrapi } = require("../helpers/strapi");
const { http, createAccount, findKeys } = require("../helpers/fixtures");

const PROFILE_UID = "api::makeup-artiste.makeup-artiste";

// The fields of a result card (front src/pages/search.js) and of the split
// by place of UI-10
const CARD_KEYS = [
  "action_radius",
  "city",
  "company_artist_name",
  "first_name",
  "id",
  "last_name",
  "main_picture",
  "pro",
  "skills",
  "speciality",
  "username",
];

// More matches than the 50 the API used to return, and than its old
// internal cap of 100
const LYON_PROFILES = 120;

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
  let picture;

  beforeAll(async () => {
    await setupStrapi();

    // 120 searchable profiles in Lyon: 70 available, 50 never set (null)
    for (let i = 0; i < LYON_PROFILES; i++) {
      await createProfile(`lyon-${i}`, {
        city: "Lyon",
        available: i < 70 ? true : null,
      });
    }
    await createProfile("chamonix-null", {
      city: "Chamonix",
      available: null,
    });
    await createProfile("chamonix-off", {
      city: "Chamonix",
      available: false,
    });
    // a placeholder skill: « zzqq » found it at threshold 0.65
    await createProfile("placeholder", {
      city: "Grenoble",
      available: true,
      skills: [{ name: "zzz" }],
    });
    picture = await strapi.entityService.create("plugin::upload.file", {
      data: {
        name: "portrait.webp",
        hash: "portrait_searching",
        ext: ".webp",
        mime: "image/webp",
        size: 1,
        width: 800,
        height: 600,
        url: "https://r2.example.test/portrait.webp",
        provider: "local",
        folderPath: "/",
      },
    });
    // a profile with its account, which must never come out
    await createAccount("compte", {
      city: "Annecy",
      speciality: "Mariage",
      available: true,
      skills: [{ name: "Maquillage mariage", description: "Teint et yeux" }],
      main_picture: picture.id,
      network: { email: "compte@example.test", phone: "0611111111" },
    });
  }, 300000);

  afterAll(async () => {
    await stopStrapi();
  });

  const expectPublicOnly = (results) => {
    expect(findKeys(results, ["email", "phone", "user", "score"])).toEqual([]);
    expect(JSON.stringify(results)).not.toContain("@example.test");
  };

  it("S09 - without a term: 200, every searchable profile, no contact details", async () => {
    const response = await search(newClient()).expect(200);
    const usernames = response.body.map((result) => result.username);

    // the Lyon profiles, chamonix-null, placeholder and compte
    expect(response.body).toHaveLength(LYON_PROFILES + 3);
    expect(usernames).not.toContain("chamonix-off");
    expectPublicOnly(response.body);
  });

  it("S09 - with a term: every match in one answer, no contact details", async () => {
    const response = await search(newClient(), { search: "Lyon" }).expect(200);

    expect(response.body).toHaveLength(LYON_PROFILES);
    expect(response.body.every((result) => result.city === "Lyon")).toBe(true);
    expectPublicOnly(response.body);
  });

  it("S09 - keeps what the search page shows, nothing more", async () => {
    const response = await search(newClient(), { search: "Annecy" }).expect(
      200
    );
    const [first] = response.body;

    expect(response.body).toHaveLength(1);
    expect(Object.keys(first).sort()).toEqual(CARD_KEYS);
    expect(first).toMatchObject({
      username: "compte",
      city: "Annecy",
      speciality: "Mariage",
      pro: false,
    });
    expect(first.skills).toEqual([{ name: "Maquillage mariage" }]);
    expect(first.main_picture).toEqual({
      id: picture.id,
      url: picture.url,
      width: 800,
      height: 600,
      alternativeText: null,
    });
    expectPublicOnly(response.body);
  });

  it("S09 - a profile without picture nor skill: null and []", async () => {
    const response = await search(newClient(), { search: "Chamonix" }).expect(
      200
    );

    expect(Object.keys(response.body[0]).sort()).toEqual(CARD_KEYS);
    expect(response.body[0].main_picture).toBeNull();
    expect(response.body[0].skills).toEqual([]);
  });

  it.each(["zzqq", "blah", "xqzvwk"])(
    "S09 - an unknown term (%s) finds nothing",
    async (term) => {
      const response = await search(newClient(), { search: term }).expect(200);

      expect(response.body).toEqual([]);
    }
  );

  it("S09 - a word typed with its city still finds the profile there", async () => {
    const response = await search(newClient(), {
      search: "Annecy",
      city: "Annecy",
    }).expect(200);

    expect(response.body.map((result) => result.username)).toEqual(["compte"]);
  });

  it.each(["compte@example.test", "lyon-1@example.test", "0611111111"])(
    "S09 - the email or phone of a profile (%s) finds nothing",
    async (term) => {
      const response = await search(newClient(), { search: term }).expect(200);

      expect(response.body).toEqual([]);
    }
  );

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
  }, 60000);
});
