"use strict";

/**
 * makeup-artiste controller
 */

const { createCoreController } = require("@strapi/strapi").factories;
const {
  isSingleProfileQuery,
  hidePrivateFields,
  queriesTypedCity,
} = require("../../../utils/public-profile");

module.exports = createCoreController(
  "api::makeup-artiste.makeup-artiste",
  () => ({
    // Lists lose the email and phone, except the profile page query (one
    // username), which shows the contact details the artist published.
    // No filter nor sort on the city: they would read the stored value.
    async find(ctx) {
      if (queriesTypedCity(ctx.query)) {
        return ctx.badRequest(
          "The city of a profile cannot be filtered or sorted on"
        );
      }

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
