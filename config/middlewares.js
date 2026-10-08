module.exports = ({ env }) => {
  return [
    "strapi::errors",
    {
      name: "strapi::security",
      config: {
        cors: {},
        contentSecurityPolicy: {
          useDefaults: true,
          directives: {
            "connect-src": ["'self'", "https:"],
            "img-src": [
              "'self'",
              "data:",
              "blob:",
              env("CF_PUBLIC_ACCESS_URL")?.replace(/^https?:\/\//, ""),
            ],
            "media-src": [
              "'self'",
              "data:",
              "blob:",
              env("CF_PUBLIC_ACCESS_URL")?.replace(/^https?:\/\//, ""),
            ],
            upgradeInsecureRequests: null,
          },
        },
      },
    },
    {
      name: "strapi::cors",
      config: {
        // Browsers may call the API from the site only (no header for any
        // other origin). CORS_ORIGINS, comma separated, replaces the list,
        // e.g. CORS_ORIGINS=http://localhost:3000 for local development.
        origin: env.array("CORS_ORIGINS", [
          "https://my-makeup.fr",
          "https://www.my-makeup.fr",
        ]),
      },
    },
    "strapi::logger",
    "strapi::query",
    {
      name: "strapi::body",
      config: {
        // Stop reading an upload past 10 MB (413) instead of writing up to
        // 200 MB to the disk before refusing it
        formidable: { maxFileSize: 10 * 1024 * 1024 },
      },
    },
    "strapi::session",
    "strapi::favicon",
    "strapi::public",
  ];
};
