const fs = require("fs");
const { setupStrapi, cleanupStrapi } = require("./helpers/strapi");
const { beforeAll, afterAll, expect } = require("@jest/globals");
beforeAll(async () => {
  await setupStrapi();
}, 20000);

afterAll(async () => {
  await cleanupStrapi();
});

it("strapi is defined", () => {
  expect(strapi).toBeDefined();
});

require("./user");
// todo fix this test
// require("./my-makeup");
