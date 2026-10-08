module.exports = {
  routes: [
    {
      method: "GET",
      path: "/searching",
      handler: "searching.searchMakeup",
      config: {
        policies: [],
        // 60 searches per minute and per client address (proxy: true in
        // config/server.js), with the brake users-permissions puts on login
        middlewares: [
          {
            name: "plugin::users-permissions.rateLimit",
            config: { interval: { min: 1 }, max: 60 },
          },
        ],
      },
    },
  ],
};
