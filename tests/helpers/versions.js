// Plain x.y.z version comparison for the dependency guards (no semver
// package: it is not a direct dependency).

const parts = (version) => version.split(".").map(Number);

/**
 * @param {string} version - "0.35.5"
 * @param {string} minimum - "0.35.4"
 * @returns {boolean} true when version >= minimum
 */
const atLeast = (version, minimum) => {
  const [a, b] = [parts(version), parts(minimum)];
  const index = a.findIndex((part, i) => part !== b[i]);
  return index === -1 || a[index] > b[index];
};

module.exports = { atLeast };
