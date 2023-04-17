'use strict';

/**
 * init-makeup service
 */

module.exports = {
  createMakeupArtist: async (user) => {
    try {

      if (!user) {
        throw new Error('User not found');
      }

      // find if makeup artist already exists for user
      const existing = await strapi.entityService.findMany('api::makeup-artiste.makeup-artiste', {
        fields: ['id'], filters: {
          user: {
            id: {
              $eq: user.id
            }
          }
        }
      });

      if (existing) {
        throw new Error('Makeup artist already exists for user');
      }

      // create a new makeup artist for user id

      const makeupArtiste = await strapi.entityService.create('api::makeup-artiste.makeup-artiste', {
        data: {
          user: {
            connect: [{id: user.id}]
          }
        }
      });

      return makeupArtiste;
    } catch (err) {
      throw err;
    }
  }
};
