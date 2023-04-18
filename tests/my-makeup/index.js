const request = require("supertest");
const { expect } = require("@jest/globals");

// user mock data
const mockUserData = {
  username: "tester",
  email: "tester@strapi.com",
  provider: "local",
  password: "1234abc",
  confirmed: true,
  blocked: null,
};

// custom mock data
const mockJsonData = {
  key1: "value1",
  key2: "value2",
};

it("should create a new makeup artist for the authenticated user", async () => {
  // Create a new user
  const user = await strapi.plugins["users-permissions"].services.user.add({
    ...mockUserData,
    username: "tester3",
    email: "tester3@strapi.com",
  });

  // Generate JWT token
  const jwt = strapi.plugins["users-permissions"].services.jwt.issue({
    id: user.id,
  });

  // Test the /init-makeup endpoint
  await request(strapi.server.httpServer)
    .post("/api/init-makeup")
    .set("accept", "*/*")
    .set("Content-Type", "application/json")
    .set("Authorization", "Bearer " + jwt)
    .send({ json: mockJsonData })
    .expect("Content-Type", /json|text\/plain/)
    .expect(200)
    .then((data) => {
      expect(data.body).toBeDefined();
      expect(data.body.user).toBeDefined();
      expect(data.body.user.connect[0].id).toBe(user.id);
    });
});

it("should throw an error if makeup artist already exists for the authenticated user", async () => {
  // Create a new user
  const user = await strapi.plugins["users-permissions"].services.user.add({
    ...mockUserData,
    username: "tester4",
    email: "tester4@strapi.com",
  });

  // Generate JWT token
  const jwt = strapi.plugins["users-permissions"].services.jwt.issue({
    id: user.id,
  });

  // Call the /init-makeup endpoint once
  await request(strapi.server.httpServer)
    .post("/api/init-makeup")
    .set("accept", "*/*")
    .set("Content-Type", "application/json")
    .set("Authorization", "Bearer " + jwt)
    .send({ json: mockJsonData })
    .expect("Content-Type", /json|text\/plain/)
    .expect(200);

  // Call the /init-makeup endpoint again, expecting an error
  await request(strapi.server.httpServer)
    .post("/api/init-makeup")
    .set("accept", "*/*")
    .set("Content-Type", "application/json")
    .set("Authorization", "Bearer " + jwt)
    .send({ json: mockJsonData })
    .expect("Content-Type", /json|text\/plain/)
    .expect(400)
    .then((data) => {
      expect(data.body.message).toBe("Makeup artist already exists for user");
    });
});
