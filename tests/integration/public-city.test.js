// UI-11: the public read paths return the public city of a profile
// (« Annecy (74) »), never the street a few artists typed in the city field;
// the artist's space (/api/me-makeup) keeps what she typed. Made-up
// addresses only (« des Essais Fictifs »).
const { describe, it, expect, beforeAll, afterAll } = require("@jest/globals");
const { setupStrapi, stopStrapi } = require("../helpers/strapi");
const { http, createAccount, findKeys } = require("../helpers/fixtures");

const PROFILE_UID = "api::makeup-artiste.makeup-artiste";

// typed by the artist → returned by the public API
const TYPED = {
  adresse: "12 rue des Essais Fictifs, 74000 Annecy",
  "rue-seule": "9 impasse des Essais Fictifs",
  lieux: "Paris, Lyon et Annecy",
  "code-postal": "Annecy 74000",
};
const PUBLIC = {
  adresse: "Annecy (74)",
  "rue-seule": null,
  lieux: "Paris, Lyon et Annecy",
  "code-postal": "Annecy (74)",
};
// words of the made-up streets: never in a public response
const STREET = /Essais|Fictifs|impasse|rue des/;

let nextAddress = 1;
// each search from its own client address (proxy: true, rate limit)
const newClient = () => `198.51.100.${200 + nextAddress++}`;

const publicCities = (entries) =>
  Object.fromEntries(
    entries.map((entry) => {
      const attributes = entry.attributes ?? entry;
      return [attributes.username, attributes.city];
    })
  );

describe("UI-11 - public city on the public read paths", () => {
  const accounts = {};

  beforeAll(async () => {
    await setupStrapi();
    const picture = await strapi.entityService.create("plugin::upload.file", {
      data: {
        name: "fictive.webp",
        hash: "fictive_hash",
        ext: ".webp",
        mime: "image/webp",
        size: 1,
        url: "https://r2.example.test/fictive.webp",
        provider: "local",
        folderPath: "/",
      },
    });
    for (const [username, city] of Object.entries(TYPED)) {
      accounts[username] = await createAccount(username, {
        city,
        available: true,
        main_picture: picture.id,
        image_gallery: [picture.id],
        network: {
          email: `${username}.contact@example.test`,
          phone: "0600000000",
        },
      });
    }
  }, 60000);

  afterAll(async () => {
    await stopStrapi();
  });

  it("find (list, sitemap): the public city of every profile", async () => {
    const response = await http()
      .get("/api/makeup-artistes?populate=*&sort=username")
      .expect(200);

    expect(publicCities(response.body.data)).toEqual(PUBLIC);
    expect(JSON.stringify(response.body)).not.toMatch(STREET);
  });

  it("find (profile page query, one username): the public city", async () => {
    const response = await http()
      .get(
        "/api/makeup-artistes?filters[username][$eq]=adresse&populate=service_offers.options,network,language,image_gallery,courses,experiences,skills,main_picture"
      )
      .expect(200);

    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].attributes.city).toBe("Annecy (74)");
    expect(JSON.stringify(response.body)).not.toMatch(STREET);
  });

  it("find with fields=city: the public city", async () => {
    const response = await http()
      .get("/api/makeup-artistes?fields[0]=username&fields[1]=city")
      .expect(200);

    expect(publicCities(response.body.data)).toEqual(PUBLIC);
  });

  it.each([
    "filters[city][$startsWith]=12",
    "filters[$or][0][city][$contains]=rue",
    "sort=city",
    "sort[0]=city:desc",
  ])("find refuses a filter or sort on the city (%s)", async (query) => {
    const response = await http()
      .get(`/api/makeup-artistes?${query}`)
      .expect(400);

    expect(response.body.data).toBeNull();
    expect(JSON.stringify(response.body)).not.toMatch(STREET);
  });

  it("find without the city field: no city added", async () => {
    const response = await http()
      .get("/api/makeup-artistes?fields[0]=username")
      .expect(200);

    expect(findKeys(response.body, ["city"])).toEqual([]);
  });

  it.each(Object.keys(TYPED))("findOne (%s): the public city", async (name) => {
    const response = await http()
      .get(`/api/makeup-artistes/${accounts[name].profile.id}?populate=*`)
      .expect(200);

    expect(response.body.data.attributes.city).toBe(PUBLIC[name]);
    expect(JSON.stringify(response.body)).not.toMatch(STREET);
  });

  it("search: matches on the city as typed, returns the public one", async () => {
    // « Essais Fictifs » is only in what two artists typed
    const response = await http()
      .get("/api/searching")
      .set("X-Forwarded-For", newClient())
      .query({ search: "Essais Fictifs" })
      .expect(200);

    expect(
      response.body
        .slice(0, 2)
        .map((result) => result.username)
        .sort()
    ).toEqual(["adresse", "rue-seule"]);
    for (const result of response.body) {
      expect(result.city).toBe(PUBLIC[result.username]);
    }
    expect(JSON.stringify(response.body)).not.toMatch(STREET);
  });

  it("search without a term: the public city", async () => {
    const response = await http()
      .get("/api/searching")
      .set("X-Forwarded-For", newClient())
      .expect(200);

    expect(publicCities(response.body)).toEqual(PUBLIC);
    expect(JSON.stringify(response.body)).not.toMatch(STREET);
  });

  // the `related` relation of a picture lists the profiles that use it, as
  // stored: city as typed, and populated further, network and account
  it.each([
    "/api/makeup-artistes?populate[main_picture][populate]=related",
    "/api/makeup-artistes?populate[main_picture][populate]=*",
    "/api/makeup-artistes?populate[main_picture][populate][related][populate]=*",
    "/api/makeup-artistes?populate[main_picture][populate][related][fields][0]=city",
    "/api/makeup-artistes?populate[image_gallery][populate]=related",
    "/api/makeup-artistes/:id?populate[main_picture][populate][related][populate]=*",
  ])("%s: no related entries, never the city as typed", async (url) => {
    const response = await http()
      .get(url.replace(":id", accounts.adresse.profile.id))
      .expect(200);

    expect(findKeys(response.body, ["related", "user", "email"])).toEqual([]);
    expect(JSON.stringify(response.body)).not.toMatch(STREET);
  });

  it.each(["/api/upload/files?populate=related", "/api/users?populate=*"])(
    "%s: not public",
    async (url) => {
      const response = await http().get(url).expect(403);

      expect(JSON.stringify(response.body)).not.toMatch(STREET);
    }
  );

  it("me-makeup (GET, PATCH): the city as the artist typed it, unchanged", async () => {
    const owner = accounts.adresse;
    const mine = await http()
      .get("/api/me-makeup")
      .set("Authorization", `Bearer ${owner.jwt}`)
      .expect(200);

    expect(mine.body.city).toBe(TYPED.adresse);

    const typed = "3 place des Essais Fictifs 74200 Thonon-les-Bains";
    const updated = await http()
      .patch("/api/me-makeup")
      .set("Authorization", `Bearer ${owner.jwt}`)
      .send({ city: typed })
      .expect(200);

    expect(updated.body.city).toBe(typed);

    // stored as typed, published as the commune
    const stored = await strapi.entityService.findOne(
      PROFILE_UID,
      owner.profile.id
    );
    expect(stored.city).toBe(typed);
    const published = await http()
      .get(`/api/makeup-artistes/${owner.profile.id}`)
      .expect(200);
    expect(published.body.data.attributes.city).toBe("Thonon-les-Bains (74)");
  });
});
