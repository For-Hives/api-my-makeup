// Content API permissions of the two users-permissions roles (plan 01,
// section 1.3), applied at every start by src/index.js: listed actions
// missing from the database are added, any other action of these two roles
// is removed. A box ticked by hand in the admin is therefore undone at the
// next restart: change this file instead. PERMISSIONS_SYNC=false skips the
// sync, for an emergency change made from the admin.
//
// Calls made by the front (my-makeup), checked one by one:
// - public: /api/articles, /api/talents, /api/makeup-artistes (sitemap,
//   profile page), /api/searching, /api/auth/local and
//   /api/auth/local/register (NextAuth credentials),
//   /api/auth/:provider/callback (NextAuth Google). forgotPassword and
//   resetPassword are for the forgotten password pages (A7).
//   emailConfirmation and sendEmailConfirmation stay open so that the link
//   of the confirmation email works the day confirmation is turned on.
// - authenticated: /api/users/me (NextAuth, onboarding), GET POST PATCH
//   DELETE /api/me-makeup (profile space), POST /api/upload (pictures).
module.exports = {
  public: [
    "api::article.article.find",
    "api::article.article.findOne",
    "api::talent.talent.find",
    "api::talent.talent.findOne",
    "api::makeup-artiste.makeup-artiste.find",
    "api::makeup-artiste.makeup-artiste.findOne",
    "api::searching.searching.searchMakeup",
    "plugin::users-permissions.auth.callback",
    "plugin::users-permissions.auth.connect",
    "plugin::users-permissions.auth.register",
    "plugin::users-permissions.auth.forgotPassword",
    "plugin::users-permissions.auth.resetPassword",
    "plugin::users-permissions.auth.emailConfirmation",
    "plugin::users-permissions.auth.sendEmailConfirmation",
  ],
  authenticated: [
    "api::makeup-artiste.me-makeup.initMakeup",
    "api::makeup-artiste.me-makeup.meMakeup",
    "api::makeup-artiste.me-makeup.updateMakeup",
    "api::makeup-artiste.me-makeup.deleteMakeup",
    "plugin::upload.content-api.upload",
    "plugin::users-permissions.user.me",
  ],
};
