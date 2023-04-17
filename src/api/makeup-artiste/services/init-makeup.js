'use strict';

/**
 * init-makeup service
 */

module.exports = {
  createMakeupArtist: async (user, test) => {
    try {

      console.log(user)

      // todo - create a new makeup artist for user id

      const makeupArtiste = await strapi.entityService.create('api::makeup-artiste.makeup-artiste', {
        data: {
          user: {
            connect: [{ id: user.id }]
          }, first_name: "test", last_name: "test"

        }
      });

      return makeupArtiste;
    } catch (err) {
      return err;
    }
    //   // EXEMPLE FROM STRAPI DOCS
    //   const entries = await strapi.entityService.findMany(
    //     "api::article.article",
    //     {
    //       fields: ["id", "title", "slug", "createdAt"],
    //       populate: {
    //         author: {
    //           fields: ["name", "email"]
    //         },
    //         category: {
    //           fields: ["name"]
    //         }
    //       }
    //     }
    //   );
    //
    //   // reduce the data to the format we want to return
    //   let entriesReduced;
    //   if (entries && Array.isArray(entries)) {
    //     entriesReduced = entries.reduce((acc, item) => {
    //       acc = acc || [];
    //       acc.push({
    //         id: item.id,
    //         title: item.title || "",
    //         category: item.category.name || "",
    //         publishedDate: new Date(item.createdAt).toDateString() || "",
    //         authorName: item.author?.name || "",
    //         authorEmail: item.author?.email || ""
    //       });
    //       return acc;
    //     }, []);
    //   }
    //
    //   // return the reduced data
    //   return entriesReduced;
    // } catch (err) {
    //   return err;
    // }
  }
};
