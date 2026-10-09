// S05, S06, S07: the profile space endpoints (/api/me-makeup), the
// 2-character names of UI-01, and the pictures of UI-03 (only her own
// files, a replaced or removed picture deleted, her files deleted with her
// account). URG-11: what the removed Cypress specs checked against the
// production API (front cypress/e2e/auth, removed by front #956), on the
// in-process Strapi only: the profile created at the onboarding, the exact
// bodies the profile modals send, the length limits and the reset.
const fs = require("fs");
const path = require("path");
const _ = require("lodash");
const { describe, it, expect, beforeAll, afterAll } = require("@jest/globals");
const { setupStrapi, stopStrapi } = require("../helpers/strapi");
const {
  http,
  createAccount,
  findKeys,
  picture,
  uploadPicture,
} = require("../helpers/fixtures");
const { sweepOrphanMedia } = require("../../src/utils/media-sweep");

const PROFILE_UID = "api::makeup-artiste.makeup-artiste";
const USER_UID = "plugin::users-permissions.user";
const FILE_UID = "plugin::upload.file";
const ARTICLE_UID = "api::article.article";
const DAY = 24 * 60 * 60 * 1000;

// Values of the Cypress specs, with fictional contact details. The
// speciality has 65 characters and an accent: under the limit of 70.
const SPECIALITY =
  "Maquilleur professionnel et coiffeur professionnel pour le cinéma";
const NETWORK = {
  youtube: "https://youtube.com/@fictional",
  facebook: "https://facebook.com/fictional",
  instagram: "https://instagram.com/fictional",
  website: "https://my-makeup.example.test",
  linkedin: "https://linkedin.com/in/fictional",
  email: "contact@example.test",
  phone: "0606060606",
};
const EMPTY_NETWORK = _.mapValues(NETWORK, () => null);
const EXPERIENCE = {
  company: "Studio Fictif",
  job_name: "Maquilleuse plateau",
  city: "Nantes",
  date_start: "2021-05-01",
  date_end: "2023-05-01",
  description: "Maquillage de tournage",
};
const COURSE = {
  diploma: "Epsi",
  school: "epsi",
  date_graduation: "2022-12-15",
  course_description: "informatique",
};
// An offer as the offers modal sends it (offresAEnvoyer: every option, no
// id); profil-edge.cy.js edited it with the suffix " Modified"
const offer = (suffix = "") => ({
  name: `Maquillage${suffix}`,
  description: `Maquillage de soirée${suffix}`,
  price: `50€${suffix}`,
  options: [1, 2, 3].map((n) => ({
    name: `Maquillage ${n}${suffix}`,
    description: `Maquillage de soirée ${n}${suffix}`,
    price: `50€ ${n}${suffix}`,
  })),
});

// A value without the ids Strapi gives its components, as the modals send it
const withoutIds = (value) => {
  if (Array.isArray(value)) {
    return value.map(withoutIds);
  }
  if (_.isPlainObject(value)) {
    return _.mapValues(_.omit(value, "id"), withoutIds);
  }
  return value;
};

// The profile as stored, every component with the options of its offers
const storedSections = (account) =>
  strapi.entityService.findOne(PROFILE_UID, account.profile.id, {
    populate: {
      skills: true,
      experiences: true,
      courses: true,
      language: true,
      network: true,
      service_offers: { populate: { options: true } },
    },
  });

const SECRET_KEYS = ["password", "resetPasswordToken", "confirmationToken"];

const expectNoAccountSecrets = (body) => {
  expect(findKeys(body, SECRET_KEYS)).toEqual([]);
  expect(JSON.stringify(body)).not.toMatch(/\$2[aby]\$/);
};

describe("/api/me-makeup", () => {
  let owner;
  let other;

  beforeAll(async () => {
    await setupStrapi();
    owner = await createAccount("owner", {
      first_name: "Prenom",
      city: "Annecy",
      available: true,
    });
    other = await createAccount("other", { first_name: "Autre" });

    // a pending reset makes resetPasswordToken non null on the account
    await strapi.query(USER_UID).update({
      where: { id: owner.user.id },
      data: {
        resetPasswordToken: "fictional-reset-token",
        confirmationToken: "fictional-confirmation-token",
      },
    });
  }, 60000);

  afterAll(async () => {
    // the pictures left on the profiles, out of public/uploads
    const upload = strapi.plugin("upload").service("upload");
    for (const file of await strapi.query(FILE_UID).findMany()) {
      await upload.remove(file);
    }
    await stopStrapi();
  });

  const as = (account, method, body) => {
    const call = http()
      [method]("/api/me-makeup")
      .set("Authorization", `Bearer ${account.jwt}`);
    return body ? call.send(body) : call;
  };

  it("S06 - GET returns the profile with only id, username and email of the account", async () => {
    const response = await as(owner, "get").expect(200);

    expect(response.body.id).toBe(owner.profile.id);
    expect(response.body.first_name).toBe("Prenom");
    expect(response.body.user).toEqual({
      id: owner.user.id,
      username: "owner",
      email: "owner@example.test",
    });
    expectNoAccountSecrets(response.body);
  });

  it("S06 - PATCH returns the same trimmed account", async () => {
    const response = await as(owner, "patch", { city: "Annemasse" }).expect(
      200
    );

    expect(response.body.city).toBe("Annemasse");
    expect(Object.keys(response.body.user).sort()).toEqual([
      "email",
      "id",
      "username",
    ]);
    expectNoAccountSecrets(response.body);
  });

  it("S05 - PATCH ignores pro, score, user, username and other unlisted fields", async () => {
    const response = await as(owner, "patch", {
      first_name: "Nouveau",
      network: { instagram: "https://instagram.com/fictional" },
      pro: true,
      score: 5,
      username: "taken-over",
      user: other.user.id,
      createdAt: "2001-01-01T00:00:00.000Z",
    }).expect(200);

    expect(response.body.first_name).toBe("Nouveau");
    expect(response.body.network.instagram).toBe(
      "https://instagram.com/fictional"
    );

    const stored = await strapi.entityService.findOne(
      PROFILE_UID,
      owner.profile.id,
      { populate: { user: { fields: ["id"] } } }
    );
    expect(stored.pro).toBe(false);
    expect(stored.score).toBeNull();
    expect(stored.username).toBe("owner");
    expect(stored.user.id).toBe(owner.user.id);
    expect(stored.createdAt).not.toMatch(/^2001/);
  });

  it("UI-01 - PATCH stores a 2-character first and last name", async () => {
    const shortName = await createAccount("short-name", {
      first_name: "Prenom",
      last_name: "Nom",
    });

    const response = await as(shortName, "patch", {
      first_name: "Al",
      last_name: "Bo",
    }).expect(200);

    expect(response.body.first_name).toBe("Al");
    expect(response.body.last_name).toBe("Bo");
    const stored = await strapi.entityService.findOne(
      PROFILE_UID,
      shortName.profile.id
    );
    expect(stored.first_name).toBe("Al");
    expect(stored.last_name).toBe("Bo");
  });

  it.each(["first_name", "last_name"])(
    "UI-01 - PATCH refuses a 1-character %s and changes nothing",
    async (field) => {
      const oneLetter = await createAccount(`one-letter-${field}`, {
        first_name: "Prenom",
        last_name: "Nom",
      });

      const response = await as(oneLetter, "patch", {
        [field]: "A",
        city: "Chambery",
      }).expect(400);

      // the front turns this rule into « … au moins 2 caractères »
      expect(response.body.error.details.moreDetails).toBe(
        `${field} must be at least 2 characters`
      );
      const stored = await strapi.entityService.findOne(
        PROFILE_UID,
        oneLetter.profile.id
      );
      expect(stored.first_name).toBe("Prenom");
      expect(stored.last_name).toBe("Nom");
      expect(stored.city).toBeNull();
    }
  );

  it("UI-01 - a stored name below the rule does not block saving other fields", async () => {
    const legacy = await createAccount("legacy-name", { first_name: "Prenom" });
    // written without validation, like a profile saved before the rule
    await strapi.query(PROFILE_UID).update({
      where: { id: legacy.profile.id },
      data: { first_name: "A", last_name: "" },
    });

    const response = await as(legacy, "patch", { city: "Annecy" }).expect(200);

    expect(response.body.city).toBe("Annecy");
    expect(response.body.first_name).toBe("A");
  });

  it("S05 - PATCH with only refused fields changes nothing", async () => {
    await as(owner, "patch", { pro: true }).expect(200);
    const stored = await strapi.entityService.findOne(
      PROFILE_UID,
      owner.profile.id
    );
    expect(stored.pro).toBe(false);
  });

  it("S07 - DELETE keeps the account when the profile cannot be deleted", async () => {
    const victim = await createAccount("profile-fails", {
      first_name: "Echec",
    });
    const entityService = strapi.entityService;
    const realDelete = entityService.delete;
    entityService.delete = async (uid, ...rest) => {
      if (uid === PROFILE_UID) throw new Error("simulated profile failure");
      return realDelete.call(entityService, uid, ...rest);
    };
    try {
      await as(victim, "delete").expect(400);
    } finally {
      entityService.delete = realDelete;
    }

    expect(
      await strapi.query(USER_UID).findOne({ where: { id: victim.user.id } })
    ).not.toBeNull();
    expect(
      await strapi.query(PROFILE_UID).findOne({
        where: { id: victim.profile.id },
      })
    ).not.toBeNull();
  });

  it("S07 - DELETE keeps the profile when the account cannot be deleted", async () => {
    const victim = await createAccount("account-fails", {
      first_name: "Echec",
    });
    const userService = strapi.plugins["users-permissions"].services.user;
    const realRemove = userService.remove;
    userService.remove = async () => {
      throw new Error("simulated account failure");
    };
    try {
      await as(victim, "delete").expect(400);
    } finally {
      userService.remove = realRemove;
    }

    expect(
      await strapi.query(PROFILE_UID).findOne({
        where: { id: victim.profile.id },
      })
    ).not.toBeNull();
    expect(
      await strapi.query(USER_UID).findOne({ where: { id: victim.user.id } })
    ).not.toBeNull();
  });

  it("S07 - DELETE removes the profile and the account", async () => {
    const leaving = await createAccount("leaving", { first_name: "Depart" });

    const response = await as(leaving, "delete").expect(200);
    expect(response.body).toEqual({ message: "User deleted" });

    expect(
      await strapi.query(PROFILE_UID).findOne({
        where: { id: leaving.profile.id },
      })
    ).toBeNull();
    expect(
      await strapi.query(USER_UID).findOne({ where: { id: leaving.user.id } })
    ).toBeNull();
  });

  it("S07 - DELETE also removes an account that never created its profile", async () => {
    const empty = await createAccount("no-profile");

    await as(empty, "delete").expect(200);

    expect(
      await strapi.query(USER_UID).findOne({ where: { id: empty.user.id } })
    ).toBeNull();
  });

  it("S07 - DELETE leaves the other accounts alone", async () => {
    expect(
      await strapi.query(PROFILE_UID).findOne({
        where: { id: other.profile.id },
      })
    ).not.toBeNull();
  });

  describe("POST, the profile of a new account (URG-11)", () => {
    const profilesOf = (account) =>
      strapi.entityService.findMany(PROFILE_UID, {
        fields: ["id"],
        filters: { user: { id: { $eq: account.user.id } } },
        populate: { user: { fields: ["id"] } },
      });

    it("URG-11 - POST creates the profile of a new account, then its PATCH and GET work", async () => {
      const fresh = await createAccount("fresh");
      // before it, the name step's PATCH is refused: the onboarding waits for
      // the POST answer (front init-account)
      for (const call of [
        () => as(fresh, "get"),
        () => as(fresh, "patch", { first_name: "Al" }),
      ]) {
        const refused = await call().expect(400);
        expect(refused.body.error.details.moreDetails).toBe(
          "Makeup artist does not exist for this user"
        );
      }

      const created = await as(fresh, "post", {}).expect(200);

      expect(created.body).toMatchObject({
        username: "fresh",
        first_name: null,
        last_name: null,
        speciality: "",
        city: "",
        description: "",
      });
      expectNoAccountSecrets(created.body);
      expect(
        (await profilesOf(fresh)).map((profile) => [
          profile.id,
          profile.user.id,
        ])
      ).toEqual([[created.body.id, fresh.user.id]]);

      await as(fresh, "patch", { first_name: "Al", last_name: "Bo" }).expect(
        200
      );
      const read = await as(fresh, "get").expect(200);
      expect(read.body).toMatchObject({
        id: created.body.id,
        first_name: "Al",
        last_name: "Bo",
        user: {
          id: fresh.user.id,
          username: "fresh",
          email: "fresh@example.test",
        },
      });
    });

    it("URG-11 - a second POST answers 400 « already exists » and creates nothing", async () => {
      const twice = await createAccount("twice");
      const first = await as(twice, "post", {}).expect(200);

      const second = await as(twice, "post", {}).expect(400);

      expect(second.body.error.message).toBe(
        "Makeup artist initialisation error"
      );
      // the front reads /already exists/ as « the profile is there »
      // (profilCree in src/lib/sauvegarde-profil.js)
      expect(second.body.error.details.moreDetails).toBe(
        "Makeup artist already exists for this user"
      );
      expect((await profilesOf(twice)).map((profile) => profile.id)).toEqual([
        first.body.id,
      ]);
    });

    it("URG-11 - POST without a valid JWT is refused and creates nothing", async () => {
      const before = await strapi.query(PROFILE_UID).count();

      await http().post("/api/me-makeup").send({}).expect(403);
      await http()
        .post("/api/me-makeup")
        .set("Authorization", "Bearer not-a-jwt")
        .send({})
        .expect(401);

      expect(await strapi.query(PROFILE_UID).count()).toBe(before);
    });
  });

  describe("sections saved from the profile modals (URG-11)", () => {
    let count = 0;
    // a stored offer other than the ones the tests send
    const STORED_OFFER = {
      name: "Offre A",
      description: "Forfait mariée",
      price: "120€",
      options: [{ name: "Essai", description: "Un essai", price: "40€" }],
    };
    // an artist with one item in every section
    const filledAccount = (prefix) =>
      createAccount(`${prefix}-${++count}`, {
        first_name: "Prenom",
        last_name: "Nom",
        speciality: "Mariage",
        company_artist_name: "Studio Test",
        city: "Annecy",
        action_radius: 20,
        available: true,
        description: "Description initiale",
        skills: [{ name: "Teint" }],
        experiences: [EXPERIENCE],
        courses: [
          {
            diploma: "CAP esthétique",
            school: "Lycée Fictif",
            date_graduation: "2015-06-30",
            course_description: "Soins et maquillage",
          },
        ],
        service_offers: [STORED_OFFER],
        language: [{ name: "Français" }],
        network: NETWORK,
      });

    // The exact bodies the modals send (front ModalUpdate*Profil.js), which
    // Cypress sent to the production API and only the fake Strapi of the
    // front receives now. Stored as sent, unless a third value says how.
    it.each([
      [
        "the resume modal",
        {
          first_name: "Utilisateur",
          last_name: "DE TEST",
          speciality: SPECIALITY,
          company_artist_name: "My Makeup Artist",
          available: false,
        },
      ],
      ["an emptied description", { description: "" }],
      ["an emptied location", { city: "", action_radius: null }],
      // the location form sends the radius as typed, a string, to an
      // integer field
      [
        "the location modal",
        { city: "Nantes", action_radius: "5" },
        { city: "Nantes", action_radius: 5 },
      ],
      ["no skill left", { skills: [] }],
      [
        "a new skill",
        { skills: [{ name: "pieds" }] },
        { skills: [{ name: "pieds", description: null }] },
      ],
      ["no language left", { language: [] }],
      ["the languages modal", { language: [{ name: "Anglais" }] }],
      // a channel left empty is sent as ""
      ["the social media modal", { network: { ...NETWORK, linkedin: "" } }],
      ["an emptied network", { network: EMPTY_NETWORK }],
      // date_end left empty is sent as null
      [
        "the experiences modal",
        { experiences: [{ ...EXPERIENCE, date_end: null }] },
      ],
      ["no experience left", { experiences: [] }],
      ["no course left", { courses: [] }],
      ["the courses modal", { courses: [COURSE] }],
    ])(
      "URG-11 - PATCH from %s: 200, answered and read back as stored",
      async (label, body, expected = body) => {
        const artist = await filledAccount("contract");
        const fields = Object.keys(expected);

        const response = await as(artist, "patch", body).expect(200);

        expect(withoutIds(_.pick(response.body, fields))).toEqual(expected);
        const read = await as(artist, "get").expect(200);
        expect(withoutIds(_.pick(read.body, fields))).toEqual(expected);
        expect(
          withoutIds(_.pick(await storedSections(artist), fields))
        ).toEqual(expected);
      }
    );

    it("URG-11 - the courses are replaced at each save, never appended", async () => {
      const artist = await filledAccount("courses");

      // the stored course deleted in the modal, a new one added
      await as(artist, "patch", { courses: [COURSE] }).expect(200);
      expect(withoutIds((await storedSections(artist)).courses)).toEqual([
        COURSE,
      ]);

      // then edited in place (profil-edge.cy.js)
      const edited = {
        diploma: "EpsiModified",
        school: "epsiModified",
        date_graduation: "2022-10-10",
        course_description: "informatiqueModified",
      };
      await as(artist, "patch", { courses: [edited] }).expect(200);

      const read = await as(artist, "get").expect(200);
      expect(withoutIds(read.body.courses)).toEqual([edited]);
    });

    it("URG-11 - an offer with 3 options: stored, read back in order, replaced when edited", async () => {
      const artist = await filledAccount("offers");
      const optionRows = () =>
        strapi.db.query("service-offers.options").count();
      const rowsBefore = await optionRows();

      const response = await as(artist, "patch", {
        service_offers: [offer()],
      }).expect(200);

      // populated one level: the front keeps the options it sent
      // (listeApresSauvegarde in src/lib/sauvegarde-profil.js)
      expect(response.body.service_offers).toHaveLength(1);
      expect(response.body.service_offers[0]).toMatchObject({
        name: "Maquillage",
        description: "Maquillage de soirée",
        price: "50€",
      });
      expect(response.body.service_offers[0]).not.toHaveProperty("options");
      let read = await as(artist, "get").expect(200);
      expect(withoutIds(read.body.service_offers)).toEqual([offer()]);

      await as(artist, "patch", {
        service_offers: [offer(" Modified")],
      }).expect(200);
      read = await as(artist, "get").expect(200);
      expect(withoutIds(read.body.service_offers)).toEqual([
        offer(" Modified"),
      ]);

      // an offer sent without its options loses them: the modal always
      // sends every option (offresAEnvoyer)
      const bare = _.omit(offer(), "options");
      await as(artist, "patch", { service_offers: [bare] }).expect(200);
      read = await as(artist, "get").expect(200);
      expect(withoutIds(read.body.service_offers)).toEqual([
        { ...bare, options: [] },
      ]);

      await as(artist, "patch", { service_offers: [] }).expect(200);
      read = await as(artist, "get").expect(200);
      expect(read.body.service_offers).toEqual([]);
      // her stored option and the 6 sent are all gone, none left behind
      expect(await optionRows()).toBe(rowsBefore - 1);
    });

    it("URG-11 - one PATCH with every section, as Cypress sent it: 200 and every value stored", async () => {
      const artist = await createAccount("complete", { first_name: "Prenom" });
      const main = await uploadPicture(artist.jwt, await picture(201));
      const gallery = await uploadPicture(artist.jwt, await picture(202));
      const scalars = {
        last_name: "DE TEST",
        first_name: "Utilisateur",
        speciality: SPECIALITY,
        city: "Nantes",
        available: true,
        description:
          "Je suis une maquilleuse passionnée avec plus de 10 ans d'expérience...",
        company_artist_name: "My Makeup Artist",
      };
      const sections = {
        skills: [{ name: "pieds" }],
        experiences: [EXPERIENCE],
        courses: [COURSE],
        service_offers: [offer()],
        network: NETWORK,
        language: [{ name: "Anglais" }],
      };

      // the pictures as the front sends them: ids of her own uploads
      // (Cypress sent the ids of two production files)
      const response = await as(artist, "patch", {
        ...scalars,
        ...sections,
        action_radius: "5",
        main_picture: main.id,
        image_gallery: [gallery.id],
      }).expect(200);

      expect(response.body).toMatchObject({ ...scalars, action_radius: 5 });
      expect(response.body.main_picture.id).toBe(main.id);
      expect(response.body.image_gallery.map((file) => file.id)).toEqual([
        gallery.id,
      ]);
      const stored = await storedSections(artist);
      expect(stored).toMatchObject({ ...scalars, action_radius: 5 });
      expect(withoutIds(_.pick(stored, Object.keys(sections)))).toEqual({
        ...sections,
        skills: [{ name: "pieds", description: null }],
      });
    });

    // The limits of the content type and of its components, which the
    // modals repeat in their zod schemas. For the profile fields, the front
    // turns « <field> must be at most <n> characters » into French.
    it.each([
      ["first_name", 70, (value) => ({ first_name: value })],
      ["last_name", 70, (value) => ({ last_name: value })],
      ["speciality", 70, (value) => ({ speciality: value })],
      ["company_artist_name", 70, (value) => ({ company_artist_name: value })],
      ["city", 70, (value) => ({ city: value })],
      ["description", 2000, (value) => ({ description: value })],
      [
        "courses[0].diploma",
        70,
        (value) => ({ courses: [{ ...COURSE, diploma: value }] }),
      ],
      [
        "courses[0].course_description",
        2000,
        (value) => ({ courses: [{ ...COURSE, course_description: value }] }),
      ],
      [
        "experiences[0].company",
        70,
        (value) => ({ experiences: [{ ...EXPERIENCE, company: value }] }),
      ],
      [
        "experiences[0].description",
        2000,
        (value) => ({ experiences: [{ ...EXPERIENCE, description: value }] }),
      ],
      ["language[0].name", 70, (value) => ({ language: [{ name: value }] })],
      [
        "network.website",
        200,
        (value) => ({ network: { ...NETWORK, website: value } }),
      ],
      [
        "network.phone",
        20,
        (value) => ({ network: { ...NETWORK, phone: value } }),
      ],
      [
        "service_offers[0].name",
        70,
        (value) => ({ service_offers: [{ ...offer(), name: value }] }),
      ],
      [
        "service_offers[0].price",
        70,
        (value) => ({ service_offers: [{ ...offer(), price: value }] }),
      ],
      [
        "service_offers[0].options[0].price",
        70,
        (value) => ({
          service_offers: [
            { ...offer(), options: [{ ...offer().options[0], price: value }] },
          ],
        }),
      ],
      [
        "service_offers[0].options[0].description",
        2000,
        (value) => ({
          service_offers: [
            {
              ...offer(),
              options: [{ ...offer().options[0], description: value }],
            },
          ],
        }),
      ],
    ])(
      "URG-11 - PATCH refuses %s over %i characters and changes nothing",
      async (field, max, bodyWith) => {
        const artist = await filledAccount("limit");
        const before = await storedSections(artist);

        const refused = await as(artist, "patch", {
          ...bodyWith("a".repeat(max + 1)),
          available: false,
        }).expect(400);

        expect(refused.body.error.details.moreDetails).toBe(
          `${field} must be at most ${max} characters`
        );
        expect(await storedSections(artist)).toEqual(before);

        // the limit itself is stored
        await as(artist, "patch", bodyWith("a".repeat(max))).expect(200);
        expect(_.get(await storedSections(artist), field)).toBe(
          "a".repeat(max)
        );
      }
    );

    it("URG-11 - an experience start date sent as '' is refused and changes nothing, null is stored", async () => {
      // the experiences modal sends date_start '' when the date is left
      // empty (only date_end becomes null). The database refuses it once
      // Strapi has deleted the stored components of the PATCH: without a
      // transaction, that 400 emptied her experiences and her skills.
      const artist = await filledAccount("no-start");
      const before = await storedSections(artist);
      const skillRows = () => strapi.db.query("makeupartists.skills").count();
      const skillRowsBefore = await skillRows();
      const added = {
        company: "Studio Fictif",
        job_name: "Assistante",
        city: "Nantes",
        date_end: null,
        description: "Défilés",
      };

      const refused = await as(artist, "patch", {
        skills: [{ name: "Ongles" }],
        experiences: [{ ...added, date_start: "" }],
        city: "Lyon",
      }).expect(400);

      expect(refused.body.error.details.moreDetails).toBe(
        "Invalid format, expected yyyy-MM-dd"
      );
      expect(await storedSections(artist)).toEqual(before);
      const read = await as(artist, "get").expect(200);
      expect(withoutIds(read.body.experiences)).toEqual([EXPERIENCE]);
      expect(withoutIds(read.body.skills)).toEqual([
        { name: "Teint", description: null },
      ]);
      // the skill written before the refusal is not left behind either
      expect(await skillRows()).toBe(skillRowsBefore);

      await as(artist, "patch", {
        experiences: [{ ...added, date_start: null }],
      }).expect(200);
      expect(withoutIds((await storedSections(artist)).experiences)).toEqual([
        { ...added, date_start: null },
      ]);
    });
  });

  describe("pictures (UI-03)", () => {
    let seed = 0;
    // a new picture of `account`, sent through POST /api/upload
    const upload = async (account) =>
      uploadPicture(account.jwt, await picture(++seed));

    const fileRow = (file) =>
      strapi.query(FILE_UID).findOne({ where: { id: file.id } });
    // the local provider writes public/uploads/<hash><ext>
    const onDisk = (file) =>
      fs.existsSync(path.join(strapi.dirs.static.public, file.url));

    const expectRemoved = async (file) => {
      expect(await fileRow(file)).toBeNull();
      expect(onDisk(file)).toBe(false);
    };
    const expectKept = async (file) => {
      expect(await fileRow(file)).not.toBeNull();
      expect(onDisk(file)).toBe(true);
    };

    const storedMedia = async (account) => {
      const stored = await strapi.entityService.findOne(
        PROFILE_UID,
        account.profile.id,
        { populate: { main_picture: true, image_gallery: true } }
      );
      return {
        main: stored.main_picture?.id ?? null,
        gallery: (stored.image_gallery ?? []).map((file) => file.id),
        city: stored.city,
      };
    };

    // an article (admin content) with these pictures in its gallery
    const articleWith = (files, slug) =>
      strapi.entityService.create(ARTICLE_UID, {
        data: {
          title: "Article",
          content: "Contenu",
          author: "Equipe",
          seo_title: "Titre",
          seo_description: "Description",
          slug,
          galery: files.map((file) => file.id),
        },
      });

    // what a picture sent before uploaded_by existed looks like
    const makeLegacy = (file) =>
      strapi.query(FILE_UID).update({
        where: { id: file.id },
        data: { uploaded_by: null },
      });
    const age = (file, milliseconds) =>
      strapi.query(FILE_UID).update({
        where: { id: file.id },
        data: { createdAt: new Date(Date.now() - milliseconds) },
      });
    // the upload plugin's removal fails (R2 unreachable) during `run`
    const withFailingRemoval = async (run) => {
      const remove = jest
        .spyOn(strapi.plugin("upload").service("upload"), "remove")
        .mockRejectedValue(new Error("simulated storage failure"));
      try {
        return await run();
      } finally {
        remove.mockRestore();
      }
    };

    it("UI-03 - PATCH attaches her own uploads and never returns uploaded_by", async () => {
      const artist = await createAccount("pictures-own", {
        first_name: "Photo",
      });
      const main = await upload(artist);
      const first = await upload(artist);
      const second = await upload(artist);

      const response = await as(artist, "patch", {
        main_picture: main.id,
        image_gallery: [first.id, second.id],
      }).expect(200);

      expect(response.body.main_picture.id).toBe(main.id);
      expect(response.body.image_gallery.map((file) => file.id)).toEqual([
        first.id,
        second.id,
      ]);
      expect(findKeys(response.body, ["uploaded_by"])).toEqual([]);

      const read = await as(artist, "get").expect(200);
      expect(read.body.main_picture.id).toBe(main.id);
      expect(findKeys(read.body, ["uploaded_by"])).toEqual([]);
    });

    it("UI-03 - a PATCH without picture fields keeps every picture", async () => {
      const artist = await createAccount("pictures-other-fields", {
        first_name: "Photo",
      });
      const main = await upload(artist);
      const gallery = await upload(artist);
      await as(artist, "patch", {
        main_picture: main.id,
        image_gallery: [gallery.id],
      }).expect(200);

      await as(artist, "patch", { city: "Annecy" }).expect(200);

      expect(await storedMedia(artist)).toEqual({
        main: main.id,
        gallery: [gallery.id],
        city: "Annecy",
      });
      await expectKept(main);
      await expectKept(gallery);
    });

    it("UI-03 - a new main_picture deletes the previous file", async () => {
      const artist = await createAccount("pictures-replace", {
        first_name: "Photo",
      });
      const before = await upload(artist);
      await as(artist, "patch", { main_picture: before.id }).expect(200);
      await expectKept(before);

      const after = await upload(artist);
      const response = await as(artist, "patch", {
        main_picture: after.id,
      }).expect(200);

      expect(response.body.main_picture.id).toBe(after.id);
      await expectRemoved(before);
      await expectKept(after);
    });

    it("UI-03 - image_gallery without one id deletes only that file", async () => {
      const artist = await createAccount("pictures-gallery", {
        first_name: "Photo",
      });
      const [a, b, c] = [
        await upload(artist),
        await upload(artist),
        await upload(artist),
      ];
      await as(artist, "patch", { image_gallery: [a.id, b.id, c.id] }).expect(
        200
      );

      await as(artist, "patch", { image_gallery: [a.id, c.id] }).expect(200);

      expect((await storedMedia(artist)).gallery).toEqual([a.id, c.id]);
      await expectRemoved(b);
      await expectKept(a);
      await expectKept(c);
    });

    it("UI-03 - a gallery picture moved to main_picture is kept", async () => {
      const artist = await createAccount("pictures-move", {
        first_name: "Photo",
      });
      const main = await upload(artist);
      const moved = await upload(artist);
      await as(artist, "patch", {
        main_picture: main.id,
        image_gallery: [moved.id],
      }).expect(200);

      await as(artist, "patch", {
        main_picture: moved.id,
        image_gallery: [],
      }).expect(200);

      expect(await storedMedia(artist)).toMatchObject({
        main: moved.id,
        gallery: [],
      });
      await expectKept(moved);
      await expectRemoved(main);
    });

    it("URG-11 - a gallery of 10 of her pictures is saved in order, then emptied and every file removed", async () => {
      const artist = await createAccount("pictures-ten", {
        first_name: "Photo",
      });
      const files = [];
      for (let i = 0; i < 10; i++) {
        files.push(await upload(artist));
      }
      const ids = files.map((file) => file.id);

      const saved = await as(artist, "patch", { image_gallery: ids }).expect(
        200
      );

      expect(saved.body.image_gallery.map((file) => file.id)).toEqual(ids);
      expect((await storedMedia(artist)).gallery).toEqual(ids);

      // every picture removed in the portfolio modal, then saved
      await as(artist, "patch", { image_gallery: [] }).expect(200);

      expect((await storedMedia(artist)).gallery).toEqual([]);
      const read = await as(artist, "get").expect(200);
      expect(read.body.image_gallery ?? []).toEqual([]);
      for (const file of files) {
        await expectRemoved(file);
      }
    });

    it("URG-11 - the Cypress reset, a PATCH emptying every section and both pictures, answers 200", async () => {
      const artist = await createAccount("pictures-reset", {
        first_name: "Prenom",
        last_name: "Nom",
        speciality: "Mariage",
        company_artist_name: "Studio Test",
        city: "Annecy",
        action_radius: 20,
        available: true,
        description: "Description initiale",
        skills: [{ name: "Teint" }],
        experiences: [EXPERIENCE],
        courses: [COURSE],
        service_offers: [offer()],
        language: [{ name: "Français" }],
        network: NETWORK,
      });
      const main = await upload(artist);
      const first = await upload(artist);
      const second = await upload(artist);
      await as(artist, "patch", {
        main_picture: main.id,
        image_gallery: [first.id, second.id],
      }).expect(200);

      // the body of profil.cy.js, score included (ignored)
      await as(artist, "patch", {
        last_name: "TEST",
        first_name: "test",
        speciality: "",
        city: null,
        action_radius: null,
        score: null,
        available: null,
        description: null,
        company_artist_name: null,
        network: EMPTY_NETWORK,
        skills: [],
        experiences: [],
        courses: [],
        service_offers: [],
        language: [],
        image_gallery: null,
        main_picture: null,
      }).expect(200);

      const read = await as(artist, "get").expect(200);
      expect(read.body).toMatchObject({
        last_name: "TEST",
        first_name: "test",
        speciality: "",
        city: null,
        action_radius: null,
        available: null,
        description: null,
        company_artist_name: null,
        skills: [],
        experiences: [],
        courses: [],
        service_offers: [],
        language: [],
        main_picture: null,
      });
      expect(withoutIds(read.body.network)).toEqual(EMPTY_NETWORK);
      expect(read.body.image_gallery ?? []).toEqual([]);
      expect(await storedMedia(artist)).toEqual({
        main: null,
        gallery: [],
        city: null,
      });
      for (const file of [main, first, second]) {
        await expectRemoved(file);
      }
    });

    it("UI-03 - a removed picture that an article also uses is kept", async () => {
      const artist = await createAccount("pictures-shared", {
        first_name: "Photo",
      });
      const shared = await upload(artist);
      await as(artist, "patch", { image_gallery: [shared.id] }).expect(200);
      // put in an article by the admin afterwards
      await articleWith([shared], "article-shared-picture");

      await as(artist, "patch", { image_gallery: [] }).expect(200);

      await expectKept(shared);
    });

    it("UI-03 - another account's file id answers 400, and nothing changes", async () => {
      const artist = await createAccount("pictures-thief", {
        first_name: "Photo",
        city: "Annecy",
      });
      const victim = await createAccount("pictures-victim", {
        first_name: "Victime",
      });
      const own = await upload(artist);
      await as(artist, "patch", { main_picture: own.id }).expect(200);
      const attached = await upload(victim);
      const loose = await upload(victim);
      await as(victim, "patch", { main_picture: attached.id }).expect(200);

      for (const body of [
        { main_picture: attached.id, city: "Lyon" },
        { image_gallery: [own.id, loose.id], city: "Lyon" },
        { main_picture: { id: attached.id }, city: "Lyon" },
        { main_picture: String(attached.id), city: "Lyon" },
      ]) {
        const response = await as(artist, "patch", body).expect(400);
        expect(response.body.error.message).toBe("File not allowed");
      }

      expect(await storedMedia(artist)).toEqual({
        main: own.id,
        gallery: [],
        city: "Annecy",
      });
      expect((await storedMedia(victim)).main).toBe(attached.id);
      await expectKept(own);
      await expectKept(attached);
      await expectKept(loose);
    });

    it("UI-03 - a file attached to an article answers 400", async () => {
      const artist = await createAccount("pictures-article", {
        first_name: "Photo",
      });
      const hers = await upload(artist);
      await articleWith([hers], "article-her-picture");

      const response = await as(artist, "patch", {
        image_gallery: [hers.id],
      }).expect(400);

      expect(response.body.error.message).toBe("File not allowed");
      expect((await storedMedia(artist)).gallery).toEqual([]);
      await expectKept(hers);
    });

    it("UI-03 - an admin upload, an unknown id or a connect object answers 400", async () => {
      const artist = await createAccount("pictures-refused", {
        first_name: "Photo",
      });
      const admin = await upload(artist);
      // what an admin upload looks like: no uploader
      await strapi
        .query(FILE_UID)
        .update({ where: { id: admin.id }, data: { uploaded_by: null } });

      for (const body of [
        { main_picture: admin.id },
        { main_picture: 999999 },
        { image_gallery: { connect: [{ id: admin.id }] } },
        { image_gallery: ["x"] },
      ]) {
        const response = await as(artist, "patch", body).expect(400);
        expect(response.body.error.message).toBe("File not allowed");
      }
      expect(await storedMedia(artist)).toMatchObject({
        main: null,
        gallery: [],
      });
    });

    it("UI-03 - a file sent before uploaded_by existed stays usable on her profile", async () => {
      const artist = await createAccount("pictures-legacy", {
        first_name: "Photo",
      });
      const legacy = await upload(artist);
      await strapi
        .query(FILE_UID)
        .update({ where: { id: legacy.id }, data: { uploaded_by: null } });
      await strapi.entityService.update(PROFILE_UID, artist.profile.id, {
        data: { image_gallery: [legacy.id] },
      });
      const added = await upload(artist);

      await as(artist, "patch", {
        image_gallery: [legacy.id, added.id],
      }).expect(200);

      expect((await storedMedia(artist)).gallery).toEqual([
        legacy.id,
        added.id,
      ]);
    });

    it("UI-03 - a replaced picture sent before R2 is deleted from the bucket root", async () => {
      const artist = await createAccount("pictures-minio", {
        first_name: "Photo",
      });
      const publicUrl = "https://r2.example.test";
      const legacy = await strapi.query(FILE_UID).create({
        data: {
          name: "ancienne.jpg",
          hash: "ancienne_0123456789",
          ext: ".jpg",
          mime: "image/jpeg",
          size: 12.5,
          url: `${publicUrl}/ancienne_0123456789.jpg`,
          provider: "minio-for-strapi-v4",
          folderPath: "/1",
          formats: {
            thumbnail: {
              name: "thumbnail_ancienne.jpg",
              hash: "thumbnail_ancienne_0123456789",
              ext: ".jpg",
              mime: "image/jpeg",
              path: null,
              url: `${publicUrl}/thumbnail_ancienne_0123456789.jpg`,
            },
          },
        },
      });
      await strapi.entityService.update(PROFILE_UID, artist.profile.id, {
        data: { main_picture: legacy.id },
      });
      const after = await upload(artist);

      // a fake provider: the test environment never calls R2
      const provider = strapi.plugin("upload").provider;
      const realDelete = provider.delete;
      const deleted = [];
      provider.delete = async (file) => {
        deleted.push(file);
      };
      const options = "plugin.upload.providerOptions";
      const realOptions = strapi.config.get(options);
      strapi.config.set(options, {
        ...realOptions,
        cloudflarePublicAccessUrl: publicUrl,
      });
      try {
        await as(artist, "patch", { main_picture: after.id }).expect(200);
      } finally {
        provider.delete = realDelete;
        strapi.config.set(options, realOptions);
      }

      expect(await fileRow(legacy)).toBeNull();
      expect(
        deleted.map(({ hash, ext, folderPath, path: filePath }) => ({
          hash,
          ext,
          folderPath,
          filePath,
        }))
      ).toEqual([
        {
          hash: "ancienne_0123456789",
          ext: ".jpg",
          folderPath: "/",
          filePath: undefined,
        },
        {
          hash: "thumbnail_ancienne_0123456789",
          ext: ".jpg",
          folderPath: "/",
          filePath: undefined,
        },
      ]);
    });

    it("UI-03 - a failed file deletion does not fail the saved PATCH", async () => {
      const artist = await createAccount("pictures-remove-fails", {
        first_name: "Photo",
      });
      const before = await upload(artist);
      await as(artist, "patch", { main_picture: before.id }).expect(200);
      const after = await upload(artist);

      const service = strapi.plugin("upload").service("upload");
      const realRemove = service.remove;
      service.remove = async () => {
        throw new Error("simulated storage failure");
      };
      try {
        const response = await as(artist, "patch", {
          main_picture: after.id,
        }).expect(200);
        expect(response.body.main_picture.id).toBe(after.id);
      } finally {
        service.remove = realRemove;
      }

      expect((await storedMedia(artist)).main).toBe(after.id);
      // left for the sweep: uploaded_by set, used by nothing
      await expectKept(before);
      expect((await fileRow(before)).uploaded_by).toBe(artist.user.id);
    });

    it("UI-03 - a picture sent before uploaded_by that cannot be removed is left for the sweep", async () => {
      const artist = await createAccount("pictures-legacy-fails", {
        first_name: "Photo",
      });
      const legacy = await upload(artist);
      await makeLegacy(legacy);
      await age(legacy, 30 * DAY);
      await strapi.entityService.update(PROFILE_UID, artist.profile.id, {
        data: { main_picture: legacy.id },
      });
      const after = await upload(artist);
      const warn = jest.spyOn(strapi.log, "warn");

      try {
        await withFailingRemoval(() =>
          as(artist, "patch", { main_picture: after.id }).expect(200)
        );
        expect(warn).toHaveBeenCalledWith(
          `[media] replaced picture: left for the next media sweep: ${legacy.id}`
        );
      } finally {
        warn.mockRestore();
      }

      // hers now, so the next sweep removes it
      expect((await fileRow(legacy)).uploaded_by).toBe(artist.user.id);
      const { removed } = await sweepOrphanMedia(strapi, { mode: "delete" });
      expect(removed).toContain(legacy.id);
      await expectRemoved(legacy);
      await expectKept(after);
    });

    it("UI-03 - with MEDIA_REMOVAL=log, a replaced picture is only logged", async () => {
      const artist = await createAccount("pictures-removal-log", {
        first_name: "Photo",
      });
      const before = await upload(artist);
      await as(artist, "patch", { main_picture: before.id }).expect(200);
      const after = await upload(artist);
      const warn = jest.spyOn(strapi.log, "warn");
      const saved = process.env.MEDIA_REMOVAL;
      process.env.MEDIA_REMOVAL = "log";

      try {
        await as(artist, "patch", { main_picture: after.id }).expect(200);
        expect(warn).toHaveBeenCalledWith(
          `[media] replaced picture: MEDIA_REMOVAL=log, would remove 1 file(s): ${before.id}`
        );
      } finally {
        warn.mockRestore();
        if (saved === undefined) {
          delete process.env.MEDIA_REMOVAL;
        } else {
          process.env.MEDIA_REMOVAL = saved;
        }
      }

      expect((await storedMedia(artist)).main).toBe(after.id);
      await expectKept(before);
    });

    it("UI-03 - a removal of 300 ms is over when the PATCH answers", async () => {
      const artist = await createAccount("pictures-wait", {
        first_name: "Photo",
      });
      const before = await upload(artist);
      await as(artist, "patch", { main_picture: before.id }).expect(200);
      const after = await upload(artist);

      const service = strapi.plugin("upload").service("upload");
      const realRemove = service.remove;
      service.remove = async (...args) => {
        await new Promise((resolve) => setTimeout(resolve, 300));
        return realRemove.apply(service, args);
      };
      try {
        await as(artist, "patch", { main_picture: after.id }).expect(200);
      } finally {
        service.remove = realRemove;
      }

      await expectRemoved(before);
    });

    it("UI-03 - a removal slower than 5 s ends after the PATCH answer", async () => {
      const artist = await createAccount("pictures-slow", {
        first_name: "Photo",
      });
      const before = await upload(artist);
      await as(artist, "patch", { main_picture: before.id }).expect(200);
      const after = await upload(artist);

      const service = strapi.plugin("upload").service("upload");
      const realRemove = service.remove;
      service.remove = async (...args) => {
        await new Promise((resolve) => setTimeout(resolve, 7000));
        return realRemove.apply(service, args);
      };
      let elapsed;
      try {
        const started = Date.now();
        await as(artist, "patch", { main_picture: after.id }).expect(200);
        elapsed = Date.now() - started;
      } finally {
        service.remove = realRemove;
      }

      // answered after the 5 s cap, before the removal ended
      expect(elapsed).toBeGreaterThanOrEqual(4900);
      expect(elapsed).toBeLessThan(7000);
      expect(await fileRow(before)).not.toBeNull();
      // then the removal finishes on its own
      const deadline = Date.now() + 10000;
      while ((await fileRow(before)) !== null && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      await expectRemoved(before);
    }, 30000);

    it("S07 - DELETE removes her main picture, her gallery and her unattached uploads", async () => {
      const leaving = await createAccount("pictures-leaving", {
        first_name: "Depart",
      });
      const staying = await createAccount("pictures-staying", {
        first_name: "Reste",
      });
      const main = await upload(leaving);
      const first = await upload(leaving);
      const second = await upload(leaving);
      const loose = await upload(leaving);
      await as(leaving, "patch", {
        main_picture: main.id,
        image_gallery: [first.id, second.id],
      }).expect(200);
      const others = await upload(staying);
      await as(staying, "patch", { main_picture: others.id }).expect(200);

      const emit = jest.spyOn(strapi.eventHub, "emit");
      try {
        await as(leaving, "delete").expect(200);
        // a deletion, never announced as an update (webhooks)
        const profileEvents = emit.mock.calls
          .filter(([, payload]) => payload?.uid === PROFILE_UID)
          .map(([event]) => event);
        expect(profileEvents).toEqual(["entry.delete"]);
      } finally {
        emit.mockRestore();
      }

      for (const file of [main, first, second, loose]) {
        await expectRemoved(file);
      }
      // no row of the join table still points at the deleted profile
      // (Strapi 4.26 leaves them on Postgres when it deletes an entry)
      const { joinTable } = strapi.db.metadata.get(FILE_UID).attributes.related;
      const { idColumn, typeColumn } = joinTable.morphColumn;
      const links = await strapi.db
        .queryBuilder(joinTable.name)
        .select(["id"])
        .where({
          [idColumn.name]: leaving.profile.id,
          [typeColumn.name]: PROFILE_UID,
        })
        .execute({ mapResults: false });
      expect(links).toEqual([]);
      await expectKept(others);
      expect((await storedMedia(staying)).main).toBe(others.id);
    });

    it("S07 - DELETE keeps every picture when the profile cannot be deleted", async () => {
      const victim = await createAccount("pictures-delete-fails", {
        first_name: "Echec",
      });
      const main = await upload(victim);
      const first = await upload(victim);
      const second = await upload(victim);
      await as(victim, "patch", {
        main_picture: main.id,
        image_gallery: [first.id, second.id],
      }).expect(200);

      const entityService = strapi.entityService;
      const realDelete = entityService.delete;
      entityService.delete = async (uid, ...rest) => {
        if (uid === PROFILE_UID) throw new Error("simulated profile failure");
        return realDelete.call(entityService, uid, ...rest);
      };
      try {
        await as(victim, "delete").expect(400);
      } finally {
        entityService.delete = realDelete;
      }

      expect(await storedMedia(victim)).toMatchObject({
        main: main.id,
        gallery: [first.id, second.id],
      });
      for (const file of [main, first, second]) {
        await expectKept(file);
      }
    });

    it("S07 - DELETE answers 200 when her files cannot be removed, and leaves them for the sweep", async () => {
      const leaving = await createAccount("pictures-leaving-fails", {
        first_name: "Depart",
      });
      const main = await upload(leaving);
      const loose = await upload(leaving);
      const legacy = await upload(leaving);
      await makeLegacy(legacy);
      await strapi.entityService.update(PROFILE_UID, leaving.profile.id, {
        data: { main_picture: main.id, image_gallery: [legacy.id] },
      });

      const response = await withFailingRemoval(() =>
        as(leaving, "delete").expect(200)
      );

      expect(response.body).toEqual({ message: "User deleted" });
      expect(
        await strapi.query(USER_UID).findOne({ where: { id: leaving.user.id } })
      ).toBeNull();
      for (const file of [main, loose, legacy]) {
        await expectKept(file);
        expect((await fileRow(file)).uploaded_by).toBe(leaving.user.id);
        await age(file, 2 * DAY);
      }

      // the next sweep removes them
      const { removed } = await sweepOrphanMedia(strapi, { mode: "delete" });
      expect(removed).toEqual(
        expect.arrayContaining([main.id, loose.id, legacy.id])
      );
      for (const file of [main, loose, legacy]) {
        await expectRemoved(file);
      }
    });

    it("S07 - DELETE of an account without a profile removes her unattached uploads", async () => {
      const lonely = await createAccount("pictures-no-profile");
      const loose = await upload(lonely);
      const others = await upload(owner);

      await as(lonely, "delete").expect(200);

      expect(
        await strapi.query(USER_UID).findOne({ where: { id: lonely.user.id } })
      ).toBeNull();
      await expectRemoved(loose);
      await expectKept(others);
    });
  });
});
