// A7 through Resend: with RESEND_API_KEY set, Strapi sends its emails over
// Resend's SMTP (nodemailer), and every start writes the reset link and the
// French templates to the users-permissions store. Fictional key; the email
// service (then a nodemailer JSON transport) replaces the SMTP connection,
// nothing leaves the machine.
const FAKE_KEY = "re_fictional_integration_key";
process.env.RESEND_API_KEY = FAKE_KEY;
// Empty values (dotenv never overrides them): the defaults apply
process.env.EMAIL_FROM = "";
process.env.EMAIL_REPLY_TO = "";
process.env.FRONT_RESET_PASSWORD_URL = "";
process.env.EMAIL_SETTINGS_SYNC = "";

const winston = require("winston");
const { describe, it, expect, beforeAll, afterAll } = require("@jest/globals");
const { setupStrapi, stopStrapi } = require("../helpers/strapi");
const { http, createAccount } = require("../helpers/fixtures");
const {
  TEMPLATES,
  syncEmailSettings,
  wantedEmailSettings,
} = require("../../src/utils/email-settings");

const RESET_URL = "https://my-makeup.fr/auth/reinitialiser";
const FROM = "My Makeup <no-reply@send.my-makeup.fr>";
const REPLY_TO = "contact@my-makeup.fr";
const SUBJECT = "Réinitialise ton mot de passe My Makeup";
const WANTED = wantedEmailSettings({
  from: FROM,
  replyTo: REPLY_TO,
  resetPasswordUrl: RESET_URL,
});

// Every line Strapi logs, from its first one (winston console transport)
const MESSAGE = Symbol.for("message");
const logged = [];
const consoleLog = winston.transports.Console.prototype.log;
winston.transports.Console.prototype.log = function log(info, callback) {
  logged.push(String(info[MESSAGE] ?? info.message));
  return consoleLog.call(this, info, callback);
};

const store = () => strapi.store({ type: "plugin", name: "users-permissions" });

const storeRows = () =>
  strapi.query("strapi::core-store").findMany({
    where: {
      key: {
        $in: [
          "plugin_users-permissions_advanced",
          "plugin_users-permissions_email",
        ],
      },
    },
    orderBy: { key: "asc" },
  });

const resetTokenOf = async (id) =>
  (
    await strapi
      .query("plugin::users-permissions.user")
      .findOne({ where: { id } })
  ).resetPasswordToken;

const forgot = (email, forwardedFor) =>
  http()
    .post("/api/auth/forgot-password")
    .set("X-Forwarded-For", forwardedFor)
    .send({ email });

describe("emails through Resend, settings in code", () => {
  const tokens = [];
  let marie;

  beforeAll(async () => {
    await setupStrapi();
    marie = await createAccount("marie");
  }, 60000);

  afterAll(async () => {
    await stopStrapi();
    winston.transports.Console.prototype.log = consoleLog;
  });

  it("loads Resend's SMTP (smtp.resend.com:465, TLS) through nodemailer", () => {
    expect(strapi.config.get("plugin.email.provider")).toBe("nodemailer");
    expect(strapi.config.get("plugin.email.providerOptions")).toMatchObject({
      host: "smtp.resend.com",
      port: 465,
      secure: true,
      auth: { user: "resend" },
    });
    expect(strapi.config.get("plugin.email.settings")).toEqual({
      defaultFrom: FROM,
      defaultReplyTo: REPLY_TO,
    });
  });

  it("the start wrote the reset link and left the other settings alone", async () => {
    expect(await store().get({ key: "advanced" })).toEqual({
      // users-permissions defaults, untouched: registration open, email
      // confirmation off
      unique_email: true,
      allow_register: true,
      email_confirmation: false,
      email_confirmation_redirection: null,
      default_role: "authenticated",
      email_reset_password: RESET_URL,
    });
  });

  it("the start wrote both templates in French, from My Makeup, answering to contact@", async () => {
    const email = await store().get({ key: "email" });

    expect(Object.keys(email).sort()).toEqual([
      "email_confirmation",
      "reset_password",
    ]);
    expect(email.reset_password).toEqual({
      display: "Email.template.reset_password",
      icon: "sync",
      options: {
        from: { name: "My Makeup", email: "no-reply@send.my-makeup.fr" },
        response_email: REPLY_TO,
        object: SUBJECT,
        message: TEMPLATES.reset_password.message,
      },
    });
    expect(email.email_confirmation).toEqual({
      display: "Email.template.email_confirmation",
      icon: "check-square",
      options: {
        from: { name: "My Makeup", email: "no-reply@send.my-makeup.fr" },
        response_email: REPLY_TO,
        object: "Confirme ton adresse email My Makeup",
        message: TEMPLATES.email_confirmation.message,
      },
    });
  });

  it("the start logged which keys it wrote, and nothing else", () => {
    expect(logged.filter((line) => line.includes("[email-settings]"))).toEqual([
      expect.stringMatching(
        /\[email-settings\] advanced\.email_reset_password updated; email\.reset_password updated; email\.email_confirmation updated$/
      ),
    ]);
  });

  it("is idempotent: the next start writes nothing", async () => {
    const before = await storeRows();
    const coreStore = strapi.query("strapi::core-store");
    const update = jest.spyOn(coreStore, "update");
    const create = jest.spyOn(coreStore, "create");
    let writes;

    try {
      expect(await syncEmailSettings(strapi, WANTED)).toEqual({
        "advanced.email_reset_password": "unchanged",
        "email.reset_password": "unchanged",
        "email.email_confirmation": "unchanged",
      });
    } finally {
      // mockRestore also clears the calls: count them first
      writes = update.mock.calls.length + create.mock.calls.length;
      update.mockRestore();
      create.mockRestore();
    }

    expect(writes).toBe(0);
    expect(await storeRows()).toEqual(before);
    expect(before).toHaveLength(2);
  });

  it("the next start undoes a change made in the admin, and keeps the rest", async () => {
    const advanced = await store().get({ key: "advanced" });
    const email = await store().get({ key: "email" });
    await store().set({
      key: "advanced",
      value: {
        ...advanced,
        allow_register: false,
        email_reset_password: "https://ailleurs.example.test/reset",
      },
    });
    await store().set({
      key: "email",
      value: {
        ...email,
        reset_password: {
          ...email.reset_password,
          options: {
            ...email.reset_password.options,
            object: "Reset password",
            from: { name: "Administration Panel", email: "no-reply@strapi.io" },
          },
        },
      },
    });

    expect(await syncEmailSettings(strapi, WANTED)).toEqual({
      "advanced.email_reset_password": "updated",
      "email.reset_password": "updated",
      "email.email_confirmation": "unchanged",
    });

    expect(await store().get({ key: "advanced" })).toEqual({
      ...advanced,
      allow_register: false,
    });
    expect(await store().get({ key: "email" })).toEqual(email);

    // back to the users-permissions default for the next tests
    await store().set({ key: "advanced", value: advanced });
  });

  it("POST /api/auth/forgot-password sends the French email with the link /auth/reinitialiser reads", async () => {
    const sent = [];
    const smtpCalls = [];
    const send = jest
      .spyOn(strapi.plugin("email").service("email"), "send")
      .mockImplementation(async (options) => {
        sent.push(options);
      });
    // the SMTP provider must not be reached (and cannot reach Resend)
    const smtp = jest
      .spyOn(strapi.plugin("email").provider, "send")
      .mockImplementation(async (options) => {
        smtpCalls.push(options);
        throw new Error("no network in tests");
      });

    try {
      const response = await forgot("marie@example.test", "203.0.113.80");
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ ok: true });
    } finally {
      send.mockRestore();
      smtp.mockRestore();
    }

    const token = await resetTokenOf(marie.user.id);
    tokens.push(token);
    const link = `${RESET_URL}?code=${token}`;

    expect(smtpCalls).toEqual([]);
    expect(sent).toHaveLength(1);
    const [email] = sent;
    expect(email).toMatchObject({
      to: "marie@example.test",
      from: FROM,
      replyTo: REPLY_TO,
      subject: SUBJECT,
    });
    expect(email.html).toContain(`<a href="${link}">${link}</a>`);
    expect(email.text).toBe(email.html);
    expect(token).toMatch(/^[0-9a-f]{128}$/);

    // the code of the link is the one POST /api/auth/reset-password takes
    const reset = await http()
      .post("/api/auth/reset-password")
      .set("X-Forwarded-For", "203.0.113.81")
      .send({
        code: new URL(link).searchParams.get("code"),
        password: "Nouveau-mdp-5",
        passwordConfirmation: "Nouveau-mdp-5",
      });
    expect(reset.status).toBe(200);
    expect(reset.body.jwt).toBeDefined();
  });

  it("the nodemailer provider builds that email with the same headers, without network", async () => {
    const plugin = strapi.plugin("email");
    const smtpProvider = plugin.provider;
    const json = require("@strapi/provider-email-nodemailer").init(
      { jsonTransport: true },
      strapi.config.get("plugin.email.settings")
    );
    const built = [];
    plugin.provider = {
      send: async (options) => {
        const info = await json.send(options);
        built.push(JSON.parse(info.message));
        return info;
      },
    };

    try {
      await forgot("marie@example.test", "203.0.113.82").expect(200);
    } finally {
      plugin.provider = smtpProvider;
    }

    const token = await resetTokenOf(marie.user.id);
    tokens.push(token);
    expect(built).toHaveLength(1);
    expect(built[0]).toMatchObject({
      from: { address: "no-reply@send.my-makeup.fr", name: "My Makeup" },
      replyTo: [{ address: REPLY_TO, name: "" }],
      to: [{ address: "marie@example.test", name: "" }],
      subject: SUBJECT,
    });
    expect(built[0].html).toContain(`href="${RESET_URL}?code=${token}"`);
  });

  it("an unknown address gets no email", async () => {
    const sent = [];
    const send = jest
      .spyOn(strapi.plugin("email").service("email"), "send")
      .mockImplementation(async (options) => {
        sent.push(options);
      });

    try {
      await forgot("nobody@example.test", "203.0.113.83").expect(200);
    } finally {
      send.mockRestore();
    }

    expect(sent).toEqual([]);
  });

  it("nothing in the logs looks like a key or a reset code", () => {
    const all = logged.join("\n");

    expect(logged.length).toBeGreaterThan(0);
    expect(all).not.toContain(FAKE_KEY);
    expect(all).not.toMatch(/\bre_[A-Za-z0-9_]{6,}/);
    expect(tokens).toHaveLength(2);
    for (const token of tokens) {
      expect(all).not.toContain(token);
    }
    expect(all).not.toMatch(/[0-9a-f]{64,}/);
  });
});
