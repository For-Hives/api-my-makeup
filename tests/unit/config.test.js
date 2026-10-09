// Configuration read from environment variables
const { describe, it, expect, afterEach } = require("@jest/globals");
const { env } = require("@strapi/utils");
const middlewares = require("../../config/middlewares");
const plugins = require("../../config/plugins");
const server = require("../../config/server");

const saved = { ...process.env };

afterEach(() => {
  process.env = { ...saved };
});

const corsOrigins = () =>
  middlewares({ env }).find((item) => item.name === "strapi::cors").config
    .origin;

describe("config/middlewares.js", () => {
  it("allows the site's two origins by default", () => {
    delete process.env.CORS_ORIGINS;
    expect(corsOrigins()).toEqual([
      "https://my-makeup.fr",
      "https://www.my-makeup.fr",
    ]);
  });

  it("CORS_ORIGINS replaces the list", () => {
    process.env.CORS_ORIGINS = "http://localhost:3000, http://127.0.0.1:3000";
    expect(corsOrigins()).toEqual([
      "http://localhost:3000",
      "http://127.0.0.1:3000",
    ]);
  });
});

describe("config/plugins.js, documentation", () => {
  const documentationEnabled = () => plugins({ env }).documentation.enabled;

  it.each([
    [undefined, true],
    ["development", true],
    ["test", false],
    ["production", false],
  ])("NODE_ENV=%s -> enabled %s", (nodeEnv, expected) => {
    delete process.env.DOCUMENTATION_ENABLED;
    if (nodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = nodeEnv;
    }
    expect(documentationEnabled()).toBe(expected);
  });

  it("DOCUMENTATION_ENABLED=true turns it on in production", () => {
    process.env.NODE_ENV = "production";
    process.env.DOCUMENTATION_ENABLED = "true";
    expect(documentationEnabled()).toBe(true);
  });
});

describe("config/middlewares.js, X-Powered-By", () => {
  it("does not load strapi::poweredBy", () => {
    const names = middlewares({ env }).map((item) => item.name ?? item);
    expect(names).not.toContain("strapi::poweredBy");
  });
});

describe("config/plugins.js, email", () => {
  const MAILGUN = {
    MAILGUN_API_KEY: "fictional-key",
    MAILGUN_DOMAIN: "mg.example.test",
  };

  it.each([
    ["no variable", {}],
    ["the key only", { MAILGUN_API_KEY: "fictional-key" }],
    ["the domain only", { MAILGUN_DOMAIN: "mg.example.test" }],
    ["an empty RESEND_API_KEY", { RESEND_API_KEY: "" }],
  ])("keeps the default provider with %s", (_label, vars) => {
    delete process.env.RESEND_API_KEY;
    delete process.env.MAILGUN_API_KEY;
    delete process.env.MAILGUN_DOMAIN;
    Object.assign(process.env, vars);
    expect(plugins({ env }).email).toBeUndefined();
  });

  it("uses Mailgun in the EU region when both are set", () => {
    delete process.env.RESEND_API_KEY;
    Object.assign(process.env, MAILGUN);
    delete process.env.MAILGUN_REGION;
    delete process.env.EMAIL_FROM;
    delete process.env.EMAIL_REPLY_TO;

    expect(plugins({ env }).email.config).toEqual({
      provider: "mailgun",
      providerOptions: {
        key: "fictional-key",
        domain: "mg.example.test",
        url: "https://api.eu.mailgun.net",
      },
      settings: {
        defaultFrom: "My Makeup <no-reply@mg.example.test>",
        defaultReplyTo: "My Makeup <no-reply@mg.example.test>",
      },
    });
  });

  it("MAILGUN_REGION=us, EMAIL_FROM and EMAIL_REPLY_TO", () => {
    delete process.env.RESEND_API_KEY;
    Object.assign(process.env, MAILGUN, {
      MAILGUN_REGION: "us",
      EMAIL_FROM: "Equipe <bonjour@example.test>",
      EMAIL_REPLY_TO: "contact@example.test",
    });

    const { providerOptions, settings } = plugins({ env }).email.config;
    expect(providerOptions.url).toBe("https://api.mailgun.net");
    expect(settings).toEqual({
      defaultFrom: "Equipe <bonjour@example.test>",
      defaultReplyTo: "contact@example.test",
    });
  });

  it("builds a working @strapi/provider-email-mailgun client, without sending", () => {
    delete process.env.RESEND_API_KEY;
    Object.assign(process.env, MAILGUN);
    const { providerOptions, settings } = plugins({ env }).email.config;
    const provider = require("@strapi/provider-email-mailgun").init(
      providerOptions,
      settings
    );
    expect(typeof provider.send).toBe("function");
  });
});

describe("config/plugins.js, email through Resend", () => {
  // Fictional key, never a real one
  const RESEND = { RESEND_API_KEY: "re_fictional_test_key" };

  const clearSenders = () => {
    delete process.env.EMAIL_FROM;
    delete process.env.EMAIL_REPLY_TO;
  };

  it("uses Resend's SMTP through nodemailer, before Mailgun", () => {
    clearSenders();
    Object.assign(process.env, RESEND, {
      MAILGUN_API_KEY: "fictional-key",
      MAILGUN_DOMAIN: "mg.example.test",
    });

    expect(plugins({ env }).email.config).toEqual({
      provider: "nodemailer",
      providerOptions: {
        host: "smtp.resend.com",
        port: 465,
        secure: true,
        auth: {
          user: "resend",
          pass: "re_fictional_test_key",
        },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 10000,
      },
      settings: {
        defaultFrom: "My Makeup <no-reply@send.my-makeup.fr>",
        defaultReplyTo: "contact@my-makeup.fr",
      },
    });
  });

  it("EMAIL_FROM and EMAIL_REPLY_TO replace the defaults, empty ones do not", () => {
    Object.assign(process.env, RESEND, {
      EMAIL_FROM: "Equipe <bonjour@send.example.test>",
      EMAIL_REPLY_TO: "aide@example.test",
    });
    expect(plugins({ env }).email.config.settings).toEqual({
      defaultFrom: "Equipe <bonjour@send.example.test>",
      defaultReplyTo: "aide@example.test",
    });

    Object.assign(process.env, { EMAIL_FROM: "", EMAIL_REPLY_TO: "" });
    expect(plugins({ env }).email.config.settings).toEqual({
      defaultFrom: "My Makeup <no-reply@send.my-makeup.fr>",
      defaultReplyTo: "contact@my-makeup.fr",
    });
  });

  it("builds a working @strapi/provider-email-nodemailer client over TLS, without connecting", () => {
    clearSenders();
    Object.assign(process.env, RESEND);
    const net = require("net");
    const tls = require("tls");
    const netConnect = jest.spyOn(net, "connect");
    const tlsConnect = jest.spyOn(tls, "connect");

    try {
      const { providerOptions, settings } = plugins({ env }).email.config;
      const provider = require("@strapi/provider-email-nodemailer").init(
        providerOptions,
        settings
      );
      expect(typeof provider.send).toBe("function");

      const transport = require("nodemailer").createTransport(providerOptions);
      expect(transport.transporter.name).toBe("SMTP");
      expect(transport.transporter.options).toMatchObject({
        host: "smtp.resend.com",
        port: 465,
        secure: true,
      });
      transport.close();

      expect(netConnect).not.toHaveBeenCalled();
      expect(tlsConnect).not.toHaveBeenCalled();
    } finally {
      netConnect.mockRestore();
      tlsConnect.mockRestore();
    }
  });
});

describe("config/server.js, scheduled tasks", () => {
  it("runs the media sweep every day at 04:00, Paris time", () => {
    delete process.env.CRON_ENABLED;
    const { cron } = server({ env });
    expect(cron.enabled).toBe(true);
    expect(Object.keys(cron.tasks)).toEqual(["mediaSweep"]);
    expect(cron.tasks.mediaSweep.options).toEqual({
      rule: "0 4 * * *",
      tz: "Europe/Paris",
    });
  });

  it("CRON_ENABLED=false turns the scheduled tasks off", () => {
    process.env.CRON_ENABLED = "false";
    expect(server({ env }).cron.enabled).toBe(false);
  });
});
