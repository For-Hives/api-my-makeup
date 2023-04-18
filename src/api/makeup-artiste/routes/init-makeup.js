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
  ],
};
