module.exports = ({ env }) => ({
  "users-permissions": {
    config: {
      jwtSecret: env("JWT_SECRET"),
    },
  },

  // ...

  upload: {
    config: {
      provider: "minio-for-strapi-v4",
      providerOptions: {
        endPoint: env("S3_ENDPOINT"), //s3.example.com
        port: 443, // parseInt(env("S3_PORT"), 9000), //9000
        useSSL: env("S3_SSL", false) === "true", //true or false
        accessKey: env("S3_ACCESS_KEY_ID"),
        secretKey: env("S3_ACCESS_SECRET"),
        bucket: env("S3_BUCKET"),
      },
    },
  },

  // ...
});
