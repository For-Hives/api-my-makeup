// S05, S06, S07: the profile space endpoints (/api/me-makeup), the
// 2-character names of UI-01, and the pictures of UI-03 (only her own
// files, a replaced or removed picture deleted, her files deleted with her
// account).
const fs = require("fs");
const path = require("path");
const { describe, it, expect, beforeAll, afterAll } = require("@jest/globals");
const { setupStrapi, stopStrapi } = require("../helpers/strapi");
const {
  http,
  createAccount,
  findKeys,
  picture,
  uploadPicture,
} = require("../helpers/fixtures");

const PROFILE_UID = "api::makeup-artiste.makeup-artiste";
const USER_UID = "plugin::users-permissions.user";
const FILE_UID = "plugin::upload.file";
const ARTICLE_UID = "api::article.article";

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
    });

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
  });
});
