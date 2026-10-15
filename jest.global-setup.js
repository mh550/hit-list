// Runs once before Jest spawns workers, which inherit it: every test sees the same clock zone, so
// local-time formatting (spot labels) asserts the same way on a laptop and in CI.
module.exports = () => {
  process.env.TZ = 'UTC';
};
