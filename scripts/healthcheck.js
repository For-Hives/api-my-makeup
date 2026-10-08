"use strict";

/**
 * Container healthcheck for the Strapi API.
 *
 * The runtime image (node:20-bookworm-slim) ships neither curl nor wget, so
 * Coolify's HTTP healthcheck cannot run in it. This check only needs Node.
 * It backs the Dockerfile HEALTHCHECK and can also be used as a Coolify
 * "cmd" healthcheck (no quotes or parentheses needed):
 *   node /app/scripts/healthcheck.js
 *
 * Exits 0 when GET /_health answers 2xx (Strapi answers 204), 1 otherwise.
 */
const http = require("http");

const TIMEOUT_MS = 4000;
const WILDCARD_HOSTS = ["", "0.0.0.0", "::"];

const configuredHost = process.env.HOST || "";
const host = WILDCARD_HOSTS.includes(configuredHost)
  ? "127.0.0.1"
  : configuredHost;
const port = Number(process.env.PORT) || 1337;

const fail = (reason) => {
  console.error(`healthcheck failed: ${reason}`);
  process.exit(1);
};

const request = http.get(
  { host, port, path: "/_health", timeout: TIMEOUT_MS },
  (response) => {
    response.resume();
    const { statusCode } = response;
    if (statusCode >= 200 && statusCode < 300) {
      console.log(`healthcheck ok: GET /_health ${statusCode}`);
      process.exit(0);
    }
    fail(`GET /_health ${statusCode}`);
  }
);

request.on("timeout", () => {
  request.destroy(new Error(`no answer within ${TIMEOUT_MS} ms`));
});
request.on("error", (error) => fail(error.message));
