// Tests upload to public/uploads (removed by the tests), never to R2
module.exports = () => ({
  upload: {
    config: {
      provider: "local",
      providerOptions: {},
    },
  },
});
