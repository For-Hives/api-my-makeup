"use strict";

/**
 * makeup-artiste controller
 */

const { createCoreController } = require("@strapi/strapi").factories;
const {
  isSingleProfileQuery,
  hidePrivateFields,
} = require("../../../utils/public-profile");

module.exports = createCoreController(
  "api::makeup-artiste.makeup-artiste",
  () => ({
    // Lists lose the email and phone, except the profile page query (one
    // username), which shows the contact details the artist published.
    async find(ctx) {
      const response = await super.find(ctx);
      const keepContacts = isSingleProfileQuery(ctx.query);

      response?.data?.forEach((entry) =>
        hidePrivateFields(entry, { keepContacts })
      );

      return response;
    },

    // One profile: its published contact details, never its account.
    async findOne(ctx) {
      const response = await super.findOne(ctx);

      hidePrivateFields(response?.data, { keepContacts: true });

      return response;
    },
  })
);
