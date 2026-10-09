"use strict";

// Puts global::upload-guard (src/middlewares/upload-guard.js) in front of
// the public upload route, POST /api/upload. Fails the start rather than
// running without it if the route ever changes.
//
// Adds the private uploaded_by column to the files: the account that sent
// the file from the artist space (set by the guard), null for admin
// uploads and for every file sent before it existed. The content API drops
// private attributes from its answers; /api/me-makeup, which reads
// entityService, removes it itself (src/utils/media-files.js).
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

  plugin.contentTypes.file.schema.attributes.uploaded_by = {
    type: "integer",
    private: true,
    configurable: false,
  };

  return plugin;
};
