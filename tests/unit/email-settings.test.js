// src/utils/email-settings.js: the reset link and the users-permissions
// email templates, checked without Strapi (fictional addresses only).
const crypto = require("crypto");
const path = require("path");
const { describe, it, expect, afterEach } = require("@jest/globals");

// users-permissions' own code (its package exports only package.json and
// the strapi-* entries)
const usersPermissions = (file) =>
  require(path.join(
    path.dirname(
      require.resolve("@strapi/plugin-users-permissions/package.json")
    ),
    "server",
    file
  ));
const { isValidEmailTemplate } = usersPermissions(
  "controllers/validation/email-template"
);
const usersPermissionsService = usersPermissions("services/users-permissions");
const {
  DEFAULT_EMAIL_FROM,
  DEFAULT_EMAIL_REPLY_TO,
  DEFAULT_RESET_PASSWORD_URL,
  TEMPLATES,
  addressOf,
  emailSenders,
  isResetPasswordUrl,
  wantedEmailSettings,
} = require("../../src/utils/email-settings");

const saved = { ...process.env };

afterEach(() => {
  process.env = { ...saved };
});

const DEFAULTS = {
  from: DEFAULT_EMAIL_FROM,
  replyTo: DEFAULT_EMAIL_REPLY_TO,
  resetPasswordUrl: DEFAULT_RESET_PASSWORD_URL,
};

// Rendered the way users-permissions renders it for forgot-password
const render = (layout, data) =>
  usersPermissionsService({ strapi: {} }).template(layout, data);

const hrefOf = (html) => html.match(/href="([^"]+)"/)[1];

describe("defaults", () => {
  it("send from send.my-makeup.fr, answer to contact@, link to the front page", () => {
    expect(DEFAULT_EMAIL_FROM).toBe("My Makeup <no-reply@send.my-makeup.fr>");
    expect(DEFAULT_EMAIL_REPLY_TO).toBe("contact@my-makeup.fr");
    expect(DEFAULT_RESET_PASSWORD_URL).toBe(
      "https://my-makeup.fr/auth/reinitialiser"
    );
  });
});

describe("addressOf", () => {
  it.each([
    ["My Makeup <no-reply@send.my-makeup.fr>", "no-reply@send.my-makeup.fr"],
    ['"Equipe" <bonjour@example.test>', "bonjour@example.test"],
    ["  contact@example.test ", "contact@example.test"],
  ])("%s -> %s", (mailbox, address) => {
    expect(addressOf(mailbox)).toBe(address);
  });

  it.each([
    [undefined],
    [""],
    ["My Makeup"],
    ["My Makeup <>"],
    ["a@b.test, c@d.test"],
    ["<a@b.test> <c@d.test>"],
    ["no-reply@localhost"],
  ])("%s -> null", (mailbox) => {
    expect(addressOf(mailbox)).toBeNull();
  });
});

describe("isResetPasswordUrl", () => {
  it.each([
    ["https://my-makeup.fr/auth/reinitialiser", true],
    ["http://localhost:3000/auth/reinitialiser", true],
    ["https://my-makeup.fr/auth/reinitialiser?x=1", false],
    ["https://my-makeup.fr/auth/reinitialiser?", false],
    ["https://my-makeup.fr/auth/reinitialiser#a", false],
    ["javascript:alert(1)", false],
    ["/auth/reinitialiser", false],
    ["", false],
    [undefined, false],
  ])("%s -> %s", (value, expected) => {
    expect(isResetPasswordUrl(value)).toBe(expected);
  });
});

describe("emailSenders", () => {
  const resend = {
    provider: "nodemailer",
    settings: {
      defaultFrom: "My Makeup <no-reply@send.example.test>",
      defaultReplyTo: "aide@example.test",
    },
  };

  it("takes EMAIL_FROM and EMAIL_REPLY_TO first", () => {
    expect(
      emailSenders(
        {
          EMAIL_FROM: "Equipe <bonjour@example.test>",
          EMAIL_REPLY_TO: "contact@example.test",
        },
        resend
      )
    ).toEqual({
      from: "Equipe <bonjour@example.test>",
      replyTo: "contact@example.test",
    });
  });

  it("then the sender of the configured provider", () => {
    expect(emailSenders({}, resend)).toEqual({
      from: "My Makeup <no-reply@send.example.test>",
      replyTo: "aide@example.test",
    });
  });

  it("then the defaults, never Strapi's sendmail sender", () => {
    expect(
      emailSenders(
        { EMAIL_FROM: "" },
        {
          provider: "sendmail",
          settings: { defaultFrom: "Strapi <no-reply@strapi.io>" },
        }
      )
    ).toEqual({
      from: DEFAULT_EMAIL_FROM,
      replyTo: DEFAULT_EMAIL_REPLY_TO,
    });
    expect(emailSenders({})).toEqual({
      from: DEFAULT_EMAIL_FROM,
      replyTo: DEFAULT_EMAIL_REPLY_TO,
    });
  });
});

describe("wantedEmailSettings", () => {
  it("builds both templates in French, from My Makeup, answering to contact@", () => {
    const { resetPasswordUrl, templates } = wantedEmailSettings(DEFAULTS);

    expect(resetPasswordUrl).toBe("https://my-makeup.fr/auth/reinitialiser");
    expect(Object.keys(templates)).toEqual([
      "reset_password",
      "email_confirmation",
    ]);
    expect(templates.reset_password).toEqual({
      from: { name: "My Makeup", email: "no-reply@send.my-makeup.fr" },
      response_email: "contact@my-makeup.fr",
      object: "Réinitialise ton mot de passe My Makeup",
      message: TEMPLATES.reset_password.message,
    });
    expect(templates.email_confirmation).toEqual({
      from: { name: "My Makeup", email: "no-reply@send.my-makeup.fr" },
      response_email: "contact@my-makeup.fr",
      object: "Confirme ton adresse email My Makeup",
      message: TEMPLATES.email_confirmation.message,
    });
  });

  it.each([
    ["EMAIL_FROM", { from: "My Makeup" }],
    ["EMAIL_REPLY_TO", { replyTo: "pas-une-adresse" }],
    [
      "FRONT_RESET_PASSWORD_URL",
      { resetPasswordUrl: "https://my-makeup.fr/auth/reinitialiser?a=1" },
    ],
  ])(
    "refuses an invalid %s, without echoing the value",
    (variable, override) => {
      const value = Object.values(override)[0];
      let error;
      try {
        wantedEmailSettings({ ...DEFAULTS, ...override });
      } catch (caught) {
        error = caught;
      }
      expect(error.message).toContain(variable);
      expect(error.message).not.toContain(value);
    }
  );

  it("passes the users-permissions template check of the admin", () => {
    const { templates } = wantedEmailSettings(DEFAULTS);
    for (const { object, message } of Object.values(templates)) {
      expect(isValidEmailTemplate(object)).toBe(true);
      expect(isValidEmailTemplate(message)).toBe(true);
    }
  });

  it("reset_password renders the link /auth/reinitialiser reads: <URL>?code=<token>", () => {
    const { resetPasswordUrl, templates } = wantedEmailSettings(DEFAULTS);
    // what users-permissions generates for forgot-password
    const token = crypto.randomBytes(64).toString("hex");

    const html = render(templates.reset_password.message, {
      URL: resetPasswordUrl,
      SERVER_URL: "http://localhost:1337",
      ADMIN_URL: "http://localhost:1337/admin",
      USER: { email: "marie@example.test", username: "marie" },
      TOKEN: token,
    });
    const link = `https://my-makeup.fr/auth/reinitialiser?code=${token}`;

    expect(hrefOf(html)).toBe(link);
    expect(html).toContain(`>${link}</a>`);
    // the front keeps codes of this shape (my-makeup: codeReinitialisation)
    expect(new URL(link).searchParams.get("code")).toMatch(
      /^[A-Za-z0-9_-]{16,512}$/
    );
    expect(html).not.toContain("<%");
  });

  it("email_confirmation renders <URL>?confirmation=<code>", () => {
    const { templates } = wantedEmailSettings(DEFAULTS);
    const html = render(templates.email_confirmation.message, {
      URL: "http://localhost:1337/api/auth/email-confirmation",
      SERVER_URL: "http://localhost:1337",
      ADMIN_URL: "http://localhost:1337/admin",
      USER: { email: "marie@example.test", username: "marie" },
      CODE: "abc123",
    });

    expect(hrefOf(html)).toBe(
      "http://localhost:1337/api/auth/email-confirmation?confirmation=abc123"
    );
  });

  it("never interpolates the username (Strapi does not escape it)", () => {
    for (const { message, object } of Object.values(TEMPLATES)) {
      expect(`${object}${message}`).not.toMatch(/USER/);
    }
  });
});

describe("src/index.js bootstrap", () => {
  const { bootstrap } = require("../../src/index");

  const fakeStrapi = () => {
    const warnings = [];
    return {
      warnings,
      strapi: {
        log: { warn: (message) => warnings.push(message), info: () => {} },
        db: { lifecycles: { subscribe: () => {} } },
        config: { get: () => ({}) },
        store: () => {
          throw new Error("the store must not be touched");
        },
      },
    };
  };

  it("EMAIL_SETTINGS_SYNC=false leaves the email settings alone and says so", async () => {
    process.env.PERMISSIONS_SYNC = "false";
    process.env.EMAIL_SETTINGS_SYNC = "false";
    const { strapi, warnings } = fakeStrapi();

    await bootstrap({ strapi });

    expect(warnings).toContain(
      "[email-settings] EMAIL_SETTINGS_SYNC=false: email settings left as they are in the database"
    );
  });

  it("an invalid FRONT_RESET_PASSWORD_URL stops the start before any write", async () => {
    process.env.PERMISSIONS_SYNC = "false";
    delete process.env.EMAIL_SETTINGS_SYNC;
    process.env.FRONT_RESET_PASSWORD_URL = "my-makeup.fr/auth/reinitialiser";
    const { strapi } = fakeStrapi();

    await expect(bootstrap({ strapi })).rejects.toThrow(
      "FRONT_RESET_PASSWORD_URL"
    );
  });
});
