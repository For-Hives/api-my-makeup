// Fictional accounts and profiles for the integration tests (example.test
// addresses only, never real data).
const request = require("supertest");
const sharp = require("sharp");

const http = () => request(strapi.server.httpServer);

const findRole = (type) =>
  strapi.query("plugin::users-permissions.role").findOne({ where: { type } });

/**
 * Creates a confirmed account with the Authenticated role, optionally with
 * its profile, and returns a JWT for it.
 */
const createAccount = async (username, profileData) => {
  const authenticated = await findRole("authenticated");
  const user = await strapi.plugins["users-permissions"].services.user.add({
    username,
    email: `${username}@example.test`,
    provider: "local",
    password: "Fictional-1234",
    confirmed: true,
    blocked: false,
    role: authenticated.id,
  });

  const profile = profileData
    ? await strapi.entityService.create("api::makeup-artiste.makeup-artiste", {
        data: { username, user: user.id, ...profileData },
      })
    : null;

  const jwt = strapi.plugins["users-permissions"].services.jwt.issue({
    id: user.id,
  });

  return { user, profile, jwt };
};

/**
 * A small PNG picture, a different one for each seed.
 */
const picture = (seed = 0) =>
  sharp({
    create: {
      width: 8,
      height: 8,
      channels: 3,
      background: { r: seed % 256, g: 128, b: 64 },
    },
  })
    .png()
    .toBuffer();

/**
 * Sends a picture through POST /api/upload as the account of `jwt`, like
 * the artist space (local provider in the test environment, never R2), and
 * returns the stored file as the route answers it.
 */
const uploadPicture = async (jwt, buffer) => {
  const response = await http()
    .post("/api/upload")
    .set("Authorization", `Bearer ${jwt}`)
    .attach("files", buffer ?? (await picture()), {
      filename: "photo.png",
      contentType: "image/png",
    })
    .expect(200);

  return response.body[0];
};

/**
 * Walks a JSON value and returns the paths of the keys named in `keys`.
 */
const findKeys = (value, keys, path = "$", found = []) => {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      findKeys(item, keys, `${path}[${index}]`, found)
    );
  } else if (value && typeof value === "object") {
    Object.entries(value).forEach(([key, child]) => {
      if (keys.includes(key)) {
        found.push(`${path}.${key}`);
      }
      findKeys(child, keys, `${path}.${key}`, found);
    });
  }
  return found;
};

module.exports = {
  http,
  findRole,
  createAccount,
  findKeys,
  picture,
  uploadPicture,
};
