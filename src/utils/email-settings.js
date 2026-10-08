"use strict";

/**
 * Emails sent by users-permissions (forgotten password, A7): the link of
 * the reset email, and the sender, reply-to, subject and text of its two
 * templates, kept in code and written to the plugin store at every start
 * instead of being typed in the admin.
 */

const _ = require("lodash");

const DEFAULT_EMAIL_FROM = "My Makeup <no-reply@send.my-makeup.fr>";
const DEFAULT_EMAIL_REPLY_TO = "contact@my-makeup.fr";
// The front page that reads ?code= (my-makeup: src/pages/auth/reinitialiser.js)
const DEFAULT_RESET_PASSWORD_URL = "https://my-makeup.fr/auth/reinitialiser";
const FROM_NAME = "My Makeup";

// Strapi renders these with lodash templates, and only the variables it
// passes (<%= URL %>, <%= TOKEN %>, <%= CODE %>...): no <%= USER.username %>
// here, Strapi does not escape it in the HTML.
const TEMPLATES = {
  reset_password: {
    display: "Email.template.reset_password",
    icon: "sync",
    object: "Réinitialise ton mot de passe My Makeup",
    message: `<p>Bonjour,</p>

<p>Tu as demandé à changer le mot de passe de ton compte My Makeup. Pour en choisir un nouveau, ouvre ce lien :</p>

<p><a href="<%= URL %>?code=<%= TOKEN %>"><%= URL %>?code=<%= TOKEN %></a></p>

<p>Si tu n'es pas à l'origine de cette demande, ignore cet email : ton mot de passe ne change pas.</p>

<p>L'équipe My Makeup</p>`,
  },
  // Email confirmation stays off (advanced.email_confirmation): the
  // template only follows the same sender and language.
  email_confirmation: {
    display: "Email.template.email_confirmation",
    icon: "check-square",
    object: "Confirme ton adresse email My Makeup",
    message: `<p>Bonjour,</p>

<p>Merci pour ton inscription sur My Makeup ! Pour confirmer ton adresse email, ouvre ce lien :</p>

<p><a href="<%= URL %>?confirmation=<%= CODE %>"><%= URL %>?confirmation=<%= CODE %></a></p>

<p>Si tu n'as pas créé de compte, ignore cet email.</p>

<p>L'équipe My Makeup</p>`,
  },
};

const ADDRESS = /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/;

/**
 * The address of a mailbox: `Name <address>` or a bare address.
 *
 * @param {unknown} mailbox
 * @returns {string|null} null when there is no single valid address
 */
const addressOf = (mailbox) => {
  if (typeof mailbox !== "string") {
    return null;
  }
  const match = mailbox.trim().match(/^(?:[^<>]*<([^<>]+)>|([^<>]+))$/);
  const address = match ? (match[1] ?? match[2]).trim() : "";
  return ADDRESS.test(address) ? address : null;
};

/**
 * The URL the reset email links to, followed by `?code=<token>`: http(s),
 * without a query string or a fragment of its own.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
const isResetPasswordUrl = (value) => {
  if (typeof value !== "string" || /[?#\s]/.test(value)) {
    return false;
  }
  try {
    return ["https:", "http:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
};

/**
 * Sender and reply-to of the users-permissions emails: EMAIL_FROM and
 * EMAIL_REPLY_TO when set, otherwise those of the email provider
 * (config/plugins.js), otherwise the defaults above (Strapi's default
 * provider, in development and tests).
 *
 * @param {Record<string, string|undefined>} env - process.env
 * @param {{ provider?: string, settings?: object }} [emailConfig] - plugin.email
 * @returns {{ from: string, replyTo: string }}
 */
const emailSenders = (env, emailConfig = {}) => {
  const ours = emailConfig.provider && emailConfig.provider !== "sendmail";
  const settings = (ours && emailConfig.settings) || {};
  return {
    from: env.EMAIL_FROM || settings.defaultFrom || DEFAULT_EMAIL_FROM,
    replyTo:
      env.EMAIL_REPLY_TO || settings.defaultReplyTo || DEFAULT_EMAIL_REPLY_TO,
  };
};

/**
 * The store values the sync writes. Throws on an invalid sender, reply-to
 * or reset URL (the message names the variable, never its value).
 *
 * @param {{ from: string, replyTo: string, resetPasswordUrl: string }} input
 * @returns {{ resetPasswordUrl: string, templates: object }}
 */
const wantedEmailSettings = ({ from, replyTo, resetPasswordUrl }) => {
  const fromAddress = addressOf(from);
  const replyToAddress = addressOf(replyTo);

  if (!fromAddress) {
    throw new Error("[email-settings] EMAIL_FROM is not a valid sender");
  }
  if (!replyToAddress) {
    throw new Error("[email-settings] EMAIL_REPLY_TO is not a valid address");
  }
  if (!isResetPasswordUrl(resetPasswordUrl)) {
    throw new Error(
      "[email-settings] FRONT_RESET_PASSWORD_URL must be an http(s) URL without ? or #"
    );
  }

  const templates = _.mapValues(TEMPLATES, ({ object, message }) => ({
    from: { name: FROM_NAME, email: fromAddress },
    response_email: replyToAddress,
    object,
    message,
  }));

  return { resetPasswordUrl, templates };
};

/**
 * Writes the reset URL (advanced.email_reset_password) and the email
 * templates to the users-permissions store, in one transaction, only where
 * they differ. Every other setting (allow_register, email_confirmation...)
 * is left as it is. Logs which keys changed, never their values.
 *
 * @param {object} strapi
 * @param {{ resetPasswordUrl: string, templates: object }} wanted
 * @returns {Promise<Record<string, "updated"|"unchanged">>}
 */
const syncEmailSettings = async (strapi, wanted) => {
  const store = strapi.store({ type: "plugin", name: "users-permissions" });

  const summary = await strapi.db.transaction(async () => {
    const result = {};
    const advanced = await store.get({ key: "advanced" });
    const email = await store.get({ key: "email" });

    if (!advanced || !email) {
      throw new Error(
        '[email-settings] users-permissions store "advanced" or "email" not found'
      );
    }

    const nextAdvanced = {
      ...advanced,
      email_reset_password: wanted.resetPasswordUrl,
    };
    result["advanced.email_reset_password"] = _.isEqual(advanced, nextAdvanced)
      ? "unchanged"
      : "updated";

    const nextEmail = { ...email };
    for (const [name, options] of Object.entries(wanted.templates)) {
      const current = email[name] ?? {};
      nextEmail[name] = {
        display: TEMPLATES[name].display,
        icon: TEMPLATES[name].icon,
        ...current,
        options: { ...current.options, ...options },
      };
      result[`email.${name}`] = _.isEqual(current, nextEmail[name])
        ? "unchanged"
        : "updated";
    }

    if (result["advanced.email_reset_password"] === "updated") {
      await store.set({ key: "advanced", value: nextAdvanced });
    }
    if (!_.isEqual(email, nextEmail)) {
      await store.set({ key: "email", value: nextEmail });
    }

    return result;
  });

  strapi.log.info(
    `[email-settings] ${Object.entries(summary)
      .map(([key, state]) => `${key} ${state}`)
      .join("; ")}`
  );

  return summary;
};

module.exports = {
  DEFAULT_EMAIL_FROM,
  DEFAULT_EMAIL_REPLY_TO,
  DEFAULT_RESET_PASSWORD_URL,
  FROM_NAME,
  TEMPLATES,
  addressOf,
  emailSenders,
  isResetPasswordUrl,
  syncEmailSettings,
  wantedEmailSettings,
};
