// Mailgun (A7, forgotten password) once MAILGUN_API_KEY and MAILGUN_DOMAIN
// are both set; until then Strapi keeps its default provider (sendmail).
// EU region unless MAILGUN_REGION=us.
const mailgunEmail = (env) => {
  const key = env("MAILGUN_API_KEY");
  const domain = env("MAILGUN_DOMAIN");

  if (!key || !domain) {
    return {};
  }

  const from = env("EMAIL_FROM", `My Makeup <no-reply@${domain}>`);

  return {
    email: {
      config: {
        provider: "mailgun",
        providerOptions: {
          key,
          domain,
          url:
            env("MAILGUN_REGION", "eu") === "us"
              ? "https://api.mailgun.net"
              : "https://api.eu.mailgun.net",
        },
        settings: {
          defaultFrom: from,
          defaultReplyTo: env("EMAIL_REPLY_TO", from),
        },
      },
    },
  };
};

module.exports = ({ env }) => ({
  ...mailgunEmail(env),
  // /documentation lists every route and field of the API: development
  // only (tests and production run without it). DOCUMENTATION_ENABLED=true
  // turns it on anyway.
  documentation: {
    enabled: env.bool(
      "DOCUMENTATION_ENABLED",
      env("NODE_ENV", "development") === "development"
    ),
  },
  "users-permissions": {
    config: {
      jwtSecret: env("JWT_SECRET"),
      // The users-permissions default, written down: the front's session
      // ends with this token (AUTH-02).
      jwt: {
        expiresIn: "30d",
      },
      // Registration only takes username, email and password: any other user
      // field (makeup_artiste above all) would let a new account claim an
      // existing profile.
      register: {
        allowedFields: [],
      },
    },
  },
  upload: {
    config: {
      // Every upload, the admin's included (the public route also checks
      // the type: src/middlewares/upload-guard.js)
      sizeLimit: 10 * 1024 * 1024,
      provider: "strapi-provider-cloudflare-r2",
      providerOptions: {
        accessKeyId: env("CF_ACCESS_KEY_ID"),
        secretAccessKey: env("CF_ACCESS_SECRET"),
        /**
         * `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`
         */
        endpoint: env("CF_ENDPOINT"),
        params: {
          Bucket: env("CF_BUCKET"),
        },
        /**
         * Set this Option to store the CDN URL of your files and not the R2 endpoint URL in your DB.
         * Can be used in Cloudflare R2 with Domain-Access or Public URL: https://pub-<YOUR_PULIC_BUCKET_ID>.r2.dev
         * This option is required to upload files larger than 5MB, and is highly recommended to be set.
         * Check the cloudflare docs for the setup: https://developers.cloudflare.com/r2/data-access/public-buckets/#enable-public-access-for-your-bucket
         */
        cloudflarePublicAccessUrl: env("CF_PUBLIC_ACCESS_URL"),
      },
      actionOptions: {
        upload: {},
        uploadStream: {},
        delete: {},
      },
    }
  },
});
