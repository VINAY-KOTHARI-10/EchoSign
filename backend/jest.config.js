// jest.config.js
// Unit tests only (databases and email mocked). Controllers and sockets are exercised end to end by `npm run e2e`
// against real databases, which Jest's coverage cannot see, so this floor reflects the unit tests alone and exists
// to catch regressions, not to claim overall coverage.
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  collectCoverageFrom: ['src/**/*.js', '!src/server.js'],
  coverageThreshold: { global: { lines: 35 } },
  testTimeout: 10000,
};
