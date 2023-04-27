module.exports = {
  routes: [
    {
      method: "GET",
      path: "/searching",
      handler: "searching.searchMakeup",
      config: {
        policies: [],
        middlewares: [],
      },
    },
  ],
};
