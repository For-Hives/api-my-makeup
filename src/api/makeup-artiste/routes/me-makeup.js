"use strict";

module.exports = {
  routes: [
    {
      method: "POST",
      path: "/me-makeup",
      handler: "me-makeup.initMakeup",
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: "PATCH",
      path: "/me-makeup",
      handler: "me-makeup.updateMakeup",
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: "GET",
      path: "/me-makeup",
      handler: "me-makeup.meMakeup",
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: "DELETE",
      path: "/me-makeup",
      handler: "me-makeup.deleteMakeup",
      config: {
        policies: [],
        middlewares: [],
      }
    }
  ],
};
