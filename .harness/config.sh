# .harness/config.sh — this project's harness settings. Everything not set here is a harness default or detected:
# the suite (.harness/check.sh, npm run check/test, pytest…), the smoke check (.harness/smoke.*), the init (.harness/init.sh).
POLICY=build-only          # build-only | live-staged (live-staged needs a "## Live system" section in CLAUDE.md)
CHECK_CMD="npx expo lint && npx tsc --noEmit && npx jest --silent"   # the same three gates as CI (.github/workflows/ci.yml)
