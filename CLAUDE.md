# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Status

This is a **specification-phase project** - no source code has been written yet. The repository contains detailed application specifications and AI skill configurations in preparation for implementation.

## Plan Mode
- Make the plan extremely concise. Sacrifice grammar for the sake of concision.
- At the end of each plan, give me a list of unresolved questions to answer, if any.

## Specifications

- `spot_finder_app_spec.md` - Original application specification
- `spot_finder_app_spec_refined.md` - Refined specification with `[DEVIATION]`, `[ADDITION]`, and `[CLARIFICATION]` markers showing changes from original

**HitList** is a mobile-first application for action sports athletes (street snowboarders/skateboarders) to track geographic "spots", which have many "features" (rails, ledges, banks, and other urban features that action sports athletes ride). The spots and features have properties like geolocation, gear/build requirements, and other metadata.

## Intended Tech Stack

Based on configured skills, the project targets **React Native with Expo**. Key architectural decisions from the spec:

- Offline-first with SQLite for local data
- PostgreSQL + PostGIS for geospatial backend
- Mapbox for offline map tile support
- S3-compatible storage for media

## Git Workflow

Commit frequently using the git CLI to maintain a revertable history. No branch strategy needed — commit directly to main.

- Commit after each meaningful unit of work (new feature, bug fix, passing test, config change).
- Write short, descriptive commit messages stating what changed.
- No need for PRs, code review, or branch protection — this is a solo project.
- `git init` if the repo isn't initialized yet; `git add -p` to stage selectively if needed.

## Testing

### Test-Driven Development
- Write tests before or alongside implementation.
- Backend: unit/integration tests for API endpoints, DB queries, geospatial logic, auth.
- E2E: use playwright-cli for browser-based flows (web admin, API explorer, etc.).

### Backend Tests
- Test framework TBD per backend language (e.g., Jest/Vitest for Node, pytest for Python).
- Cover: CRUD for spots/features, PostGIS queries, auth/authorization, media upload/sync logic.
- Use a separate test DB; never run tests against production.

### E2E Tests with playwright-cli
Full CLI reference: `.playwright-cli/README.md`

Key commands:
```bash
playwright-cli open <url>       # open browser
playwright-cli snapshot         # capture page + element refs
playwright-cli click <ref>      # interact
playwright-cli screenshot       # capture screenshot
playwright-cli console          # view console messages
```

**Sessions** — use named sessions to isolate concurrent Claude Code instances:
```bash
# Start a named session
playwright-cli -s=backend open http://localhost:3000
playwright-cli -s=frontend open http://localhost:8081

# Or set via env var for the whole agent session
PLAYWRIGHT_CLI_SESSION=backend claude .

# List / close sessions
playwright-cli list
playwright-cli -s=backend close
playwright-cli close-all
```

Rules for session usage:
- Each Claude Code instance working on a separate app **must** use a distinct `-s=<name>` session (e.g., `-s=api`, `-s=app`).
- Default (no `-s=`) is a shared persistent profile — avoid for concurrent work.
- Sessions persist cookies/storage between calls; use `playwright-cli -s=<name> delete-data` to reset.
- Playwright CLI is headless by default; pass `--headed` to `open` only when visual debugging is needed.

## AI Skills Available

Skills in `.agents/skills/` provide coding guidelines for implementation:

| Skill | Use When |
|-------|----------|
| `vercel-react-native-skills` | Building components, list performance, animations, native modules |
| `vercel-react-best-practices` | React patterns, async handling, bundle optimization, rendering |
| `vercel-composition-patterns` | Component architecture, compound components, context patterns |
| `web-design-guidelines` | UI/UX review and accessibility |

Each skill has a `SKILL.md` (overview) and `AGENTS.md` (full rules). Priority rules from React Native skills:

1. **List Performance** (CRITICAL) - FlashList, memoization, callback stability
2. **Animation** (HIGH) - GPU properties only (transform/opacity), useDerivedValue
3. **Navigation** (HIGH) - Native stack/tabs over JS navigators
4. **UI Patterns** (HIGH) - expo-image, Pressable, native modals
