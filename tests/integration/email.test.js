// A7 (API side) and S12: with MAILGUN_API_KEY and MAILGUN_DOMAIN set,
// Strapi sends its emails through Mailgun, and POST
// /api/auth/forgot-password answers the same whether the email exists or
// not. Fictional key and domain; the provider's send is replaced, nothing
// leaves the machine.
process.env.MAILGUN_API_KEY = "fictional-key";
process.env.MAILGUN_DOMAIN = "mg.example.test";

const { describe, it, expect, beforeAll, afterAll } = require("@jest/globals");
const { setupStrapi, stopStrapi } = require("../helpers/strapi");
const { http, createAccount } = require("../helpers/fixtures");

describe("emails", () => {
  const sent = [];
  let marie;

  beforeAll(async () => {
    await setupStrapi();
    marie = await createAccount("marie");
    strapi.plugin("email").provider.send = async (options) => {
      sent.push(options);
    };
  }, 60000);

  afterAll(async () => {
    await stopStrapi();
  });

  it("loads the Mailgun provider in the EU region", () => {
    expect(strapi.config.get("plugin.email.provider")).toBe("mailgun");
    expect(strapi.config.get("plugin.email.providerOptions.url")).toBe(
      "https://api.eu.mailgun.net"
    );
  });

  it("S12 - forgot-password answers the same for a known and an unknown email", async () => {
    const forgot = (email) =>
      http()
        .post("/api/auth/forgot-password")
        .set("X-Forwarded-For", "203.0.113.70")
        .send({ email });

    const known = await forgot("marie@example.test");
    const unknown = await forgot("nobody@example.test");

    expect(known.status).toBe(200);
    expect(unknown.status).toBe(known.status);
    expect(unknown.body).toEqual(known.body);
    expect(known.body).toEqual({ ok: true });

    // only the known address gets an email, with its reset code
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("marie@example.test");
    const account = await strapi
      .query("plugin::users-permissions.user")
      .findOne({ where: { id: marie.user.id } });
    expect(account.resetPasswordToken).toBeTruthy();
    expect(sent[0].html).toContain(account.resetPasswordToken);
  });
});
