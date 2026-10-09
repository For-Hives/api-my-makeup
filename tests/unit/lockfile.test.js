// What yarn.lock installs (CI and the Docker image both use
// --frozen-lockfile). CI runs no yarn audit: this guard stops a lockfile
// regeneration from bringing back the versions with known advisories that
// the resolutions of package.json replaced (NT-SHARP-API).
const fs = require("fs");
const path = require("path");
const { describe, it, expect } = require("@jest/globals");
const { atLeast } = require("../helpers/versions");

const lockfile = fs.readFileSync(
  path.join(__dirname, "..", "..", "yarn.lock"),
  "utf8"
);

// "@casl/ability@6.5.0" -> "@casl/ability"
const nameOf = (pattern) => pattern.slice(0, pattern.lastIndexOf("@"));

// ".../@casl/ability/-/ability-6.7.5.tgz#..." -> "@casl/ability" (also
// catches an alias such as old-sharp@npm:sharp@0.32.6)
const packageOf = (url) => new URL(url).pathname.split("/-/")[0].slice(1);

// One entry per block: the requested patterns, then the resolved version
//   sharp@0.32.6, sharp@0.35.5:
//     version "0.35.5"
//     resolved "https://registry.yarnpkg.com/sharp/-/sharp-0.35.5.tgz#..."
const entries = lockfile
  .split(/\n\n+/)
  .filter((block) => /^\S.*:$/.test(block.split("\n")[0]))
  .map((block) => {
    const [header] = block.split("\n");
    const patterns = header
      .slice(0, -1)
      .split(", ")
      .map((pattern) => pattern.replace(/^"|"$/g, ""));
    const version = block.match(/^ {2}version "([^"]+)"$/m);
    const url = block.match(/^ {2}resolved "([^"]+)"$/m);
    return {
      names: [
        ...new Set([
          ...patterns.map(nameOf),
          ...(url ? [packageOf(url[1])] : []),
        ]),
      ],
      version: version && version[1],
    };
  });

const resolved = (name) =>
  entries
    .filter((entry) => entry.names.includes(name))
    .map((entry) => entry.version);

describe("tests/helpers/versions.js", () => {
  it.each([
    ["0.35.5", "0.35.5", true],
    ["0.35.4", "0.35.5", false],
    ["0.36.0", "0.35.5", true],
    ["0.32.6", "0.35.5", false],
    ["10.0.10", "10.0.9", true],
    ["9.1.1", "10.0.9", false],
  ])("atLeast(%s, %s) is %s", (version, minimum, expected) => {
    expect(atLeast(version, minimum)).toBe(expected);
  });
});

describe("yarn.lock", () => {
  it("is read entry by entry", () => {
    expect(entries.length).toBeGreaterThan(1000);
    expect(entries.every((entry) => entry.version)).toBe(true);
    expect(
      packageOf(
        "https://registry.yarnpkg.com/@casl/ability/-/ability-6.7.5.tgz#9468"
      )
    ).toBe("@casl/ability");
  });

  it.each([
    // libvips CVEs reached through POST /api/upload: GHSA-f88m-g3jw-g9cj,
    // GHSA-rgj7-g3m4-5g8c, GHSA-wq5f-xc86-pv6w
    ["sharp", "0.35.5"],
    // GHSA-x9vf-53q3-cvx6
    ["@casl/ability", "6.7.5"],
    // GHSA-v53p-9fqp-m79j (10.0.6) and GHSA-g57g-f23g-4646 (10.0.9)
    ["nodemailer", "10.0.9"],
  ])("resolves every %s to %s or later", (name, minimum) => {
    const versions = resolved(name);

    expect(versions.length).toBeGreaterThan(0);
    expect(versions.filter((version) => !atLeast(version, minimum))).toEqual(
      []
    );
  });

  it("lists sharp's Linux x64 binaries, which the Docker image installs", () => {
    const [sharp] = resolved("sharp");

    expect(resolved("@img/sharp-linux-x64")).toEqual([sharp]);
    expect(resolved("@img/sharp-libvips-linux-x64")).toHaveLength(1);
  });
});
