module.exports = ({ env }) => ({
  host: env("HOST", "0.0.0.0"),
  url: env("PUBLIC_URL"),
  port: env.int("PORT", 1337),
  // Behind Traefik: the client address comes from X-Forwarded-For (see
  // maxIpsCount in src/index.js), not from the proxy's own address that
  // every visitor used to share in the login and search brakes.
  proxy: true,
  app: {
    keys: env.array("APP_KEYS"),
  },
});
