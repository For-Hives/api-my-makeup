// S04: public lists of profiles never carry email, phone or the account;
// the profile page (one username) still gets the published contact details.
// S08: public filters on createdBy, updatedBy, publishedBy are refused
// (CVE-2026-27886), like filters on the account.
const { describe, it, expect, beforeAll, afterAll } = require("@jest/globals");
const { setupStrapi, stopStrapi } = require("../helpers/strapi");
const { http, createAccount, findKeys } = require("../helpers/fixtures");

const CONTACT = (name) => ({
  email: `${name}.contact@example.test`,
  phone: "0600000000",
  instagram: `https://instagram.com/${name}`,
});

// The exact query of the profile page (my-makeup, profil/[username].js)
const profilePageQuery = (username) =>
  `/api/makeup-artistes?filters[username][$eq]=${encodeURIComponent(
    username
  )}&populate=service_offers.options,network,language,image_gallery,courses,experiences,skills,main_picture`;

const contactsIn = (body) => findKeys(body, ["email", "phone"]);

describe("GET /api/makeup-artistes", () => {
  let alice;

  beforeAll(async () => {
    await setupStrapi();
    alice = await createAccount("alice", {
      first_name: "Alice",
      city: "Annecy",
      network: CONTACT("alice"),
    });
    await createAccount("bob", {
      first_name: "Bob",
      city: "Annemasse",
      network: CONTACT("bob"),
    });
  }, 60000);

  afterAll(async () => {
    await stopStrapi();
  });

  it.each([
    ["no populate", "/api/makeup-artistes"],
    ["populate=*", "/api/makeup-artistes?populate=*"],
    ["populate network and user", "/api/makeup-artistes?populate=network,user"],
    [
      "populate[network][fields]",
      "/api/makeup-artistes?populate[network][fields][0]=email&populate[network][fields][1]=phone",
    ],
    [
      "a page of 100",
      "/api/makeup-artistes?populate=*&pagination[pageSize]=100",
    ],
    [
      "two usernames",
      "/api/makeup-artistes?populate=network&filters[username][$in][0]=alice&filters[username][$in][1]=bob",
    ],
    [
      "a username pattern",
      "/api/makeup-artistes?populate=network&filters[username][$contains]=a",
    ],
    [
      "a username and another operator",
      "/api/makeup-artistes?populate=network&filters[username][$eq]=alice&filters[username][$ne]=bob",
    ],
  ])("S04 - list (%s): no email, no phone, no account", async (_label, url) => {
    const response = await http().get(url).expect(200);

    expect(response.body.data.length).toBeGreaterThan(0);
    expect(contactsIn(response.body)).toEqual([]);
    expect(findKeys(response.body, ["user"])).toEqual([]);
  });

  it("S04 - list keeps the rest of the public profile", async () => {
    const response = await http()
      .get("/api/makeup-artistes?populate=network&sort=username")
      .expect(200);

    expect(
      response.body.data.map((entry) => entry.attributes.username)
    ).toEqual(["alice", "bob"]);
    expect(response.body.data[0].attributes.network.instagram).toBe(
      "https://instagram.com/alice"
    );
    expect(response.body.meta.pagination.total).toBe(2);
  });

  it("S04 - the profile page query keeps the published email and phone", async () => {
    const response = await http().get(profilePageQuery("alice")).expect(200);

    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].attributes.network).toMatchObject(
      CONTACT("alice")
    );
    expect(findKeys(response.body, ["user"])).toEqual([]);
  });

  it("S04 - filters[username]=<name> counts as the profile page too", async () => {
    const response = await http()
      .get("/api/makeup-artistes?filters[username]=bob&populate=network")
      .expect(200);

    expect(response.body.data[0].attributes.network.phone).toBe("0600000000");
  });

  it("S04 - one profile by id: contact details, never the account", async () => {
    const response = await http()
      .get(`/api/makeup-artistes/${alice.profile.id}?populate=network,user`)
      .expect(200);

    expect(response.body.data.attributes.network.email).toBe(
      "alice.contact@example.test"
    );
    expect(response.body.data.attributes.user).toBeUndefined();
  });

  it.each([
    "/api/articles?filters[createdBy][id]=1",
    "/api/articles?filters[updatedBy][id][$gt]=0",
    "/api/talents?filters[createdBy][email][$startsWith]=a",
    "/api/makeup-artistes?filters[updatedBy][password][$startsWith]=$2",
    "/api/makeup-artistes?filters[publishedBy][id]=1",
    "/api/articles?filters[$or][0][createdBy][id]=1",
    "/api/makeup-artistes?filters[user][email][$startsWith]=a",
    "/api/makeup-artistes?sort=createdBy.email",
  ])("S08 - %s is refused", async (url) => {
    const response = await http().get(url);

    expect(response.status).toBe(400);
    expect(response.body.data).toBeNull();
  });
});
