'use strict';

module.exports = {
  lifecycles: {
    async afterCreate(data, model) {
      try {
        // Create a new MakeupArtiste entry and link it to the user
        const makeupArtiste = await strapi.services['makeup-artiste'].create({
          user: model.id
        });
        console.log(`New MakeupArtiste entry created for user ${model.id}`);
        console.log(makeupArtiste)
      } catch (error) {
        console.error('Error creating MakeupArtiste entry:', error);
      }
    },
  },
};
