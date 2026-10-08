"use strict";

// Puts global::upload-guard (src/middlewares/upload-guard.js) in front of
// the public upload route, POST /api/upload. Fails the start rather than
// running without it if the route ever changes.
module.exports = (plugin) => {
  const route = plugin.routes["content-api"].routes.find(
    (candidate) =>
      candidate.method === "POST" && candidate.handler === "content-api.upload"
  );

  if (!route) {
    throw new Error("upload: POST content-api.upload route not found");
  }

  route.config = {
    ...route.config,
    middlewares: [...(route.config?.middlewares ?? []), "global::upload-guard"],
  };

  return plugin;
};
