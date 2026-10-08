const http = require("http");
const path = require("path");
const { execFile } = require("child_process");
const { describe, it, expect } = require("@jest/globals");

const script = path.join(__dirname, "..", "scripts", "healthcheck.js");

const runHealthcheck = (port) =>
  new Promise((resolve) => {
    execFile(
      process.execPath,
      [script],
      { env: { ...process.env, HOST: "", PORT: String(port) } },
      (error) => resolve(error ? error.code : 0)
    );
  });

const listen = (handler) =>
  new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });

const close = (server) => new Promise((resolve) => server.close(resolve));

const withServer = async (status, test) => {
  const server = await listen((request, response) => {
    response.statusCode = request.url === "/_health" ? status : 404;
    response.end();
  });
  try {
    return await test(server.address().port);
  } finally {
    await close(server);
  }
};

describe("scripts/healthcheck.js", () => {
  it("exits 0 when /_health answers 204", async () => {
    await withServer(204, async (port) => {
      expect(await runHealthcheck(port)).toBe(0);
    });
  });

  it("exits 1 when /_health answers an error status", async () => {
    await withServer(503, async (port) => {
      expect(await runHealthcheck(port)).toBe(1);
    });
  });

  it("exits 1 when nothing listens on the port", async () => {
    const server = await listen(() => {});
    const { port } = server.address();
    await close(server);
    expect(await runHealthcheck(port)).toBe(1);
  });
});
