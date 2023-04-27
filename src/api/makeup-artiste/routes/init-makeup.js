"use strict";

module.exports = {
  routes: [
    {
      method: "POST",
      path: "/init-makeup",
      handler: "init-makeup.initMakeup",
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: "PATCH",
      path: "/update-makeup",
      handler: "init-makeup.updateMakeup",
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: "GET",
      path: "/me-makeup",
      handler: "init-makeup.meMakeup",
      config: {
        policies: [],
        middlewares: [],
      },
    },
  ],
};
