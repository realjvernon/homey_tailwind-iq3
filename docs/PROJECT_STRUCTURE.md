# Project Structure

## Directory Layout

```
com.dn.tailwind/
├── app.json                       # App manifest (source of truth, edited directly)
├── app.ts                         # App entry point — notification relay
├── api.ts                         # Homey Web API handler (POST /notification, GET /notification-log)
├── lib/
│   ├── TailwindClient.ts          # Stateless HTTP client for the Tailwind local API
│   └── __tests__/
│       └── TailwindClient.test.ts
├── drivers/tailwind/
│   ├── driver.ts                  # Pairing flow + condition/action flow cards
│   ├── device.ts                  # Device lifecycle, polling, notification handling, trigger flow cards
│   ├── pair/
│   │   └── start.html             # Custom pairing UI (controller selection + key input)
│   ├── assets/images/             # Driver icons (small, large, xlarge)
│   └── __tests__/
│       ├── driver.test.ts
│       └── device.test.ts
├── __tests__/
│   ├── app.test.ts
│   └── api.test.ts
├── __mocks__/
│   └── homey.ts                   # Shared Homey SDK mock for all tests
├── assets/
│   ├── icon.svg                   # App icon
│   └── images/                    # App Store images (small, large, xlarge)
├── locales/
│   └── en.json                    # English translations
├── settings/
│   └── index.html                 # App settings page (notification log viewer)
├── scripts/
│   └── test-notification.ts       # Sends simulated notifications for manual testing
├── docs/
│   ├── PROJECT_STRUCTURE.md       # This file
│   ├── HOMEY.md                   # Homey SDK patterns and APIs used
│   ├── TAILWIND_API.md            # Tailwind iQ3 local control API reference
│   └── ROADMAP.md                 # Future plans
├── CLAUDE.md                      # AI-assisted development rules (TDD, coverage, PR checklist)
├── README.md                      # Getting started guide
├── README.txt                     # App Store description
├── tsconfig.json                  # TypeScript config (outDir: .homeybuild/)
├── jest.config.js                 # Test config (thresholds, mocks)
├── stryker.config.mjs             # Mutation testing config
├── eslint.config.mjs              # Linting rules
├── .prettierrc                    # Formatting rules
└── .husky/                        # Git hooks (pre-commit, pre-push)
```

## Design Decisions

### No Homey Compose

This project edits `app.json` directly. We do **not** use Homey Compose — there is no `.homeycompose/` directory or `driver.compose.json`. The root `app.json` is the single source of truth for the app manifest.

### Build Output

TypeScript compiles to `.homeybuild/` (`tsconfig.json` `outDir`). The Homey CLI requires this exact path — changing it will break `homey app run`. Test files, mocks, and scripts are excluded from compilation.

### One Device Per Door

Each garage door becomes a separate Homey device. A single Tailwind controller with 3 doors creates 3 Homey devices. All share the same `controllerHost` and `localKey` but have different `doorIndex` values (0, 1, 2).

### Host-Based Notification Routing

The Tailwind controller POSTs events to a callback URL registered via `notify_url`. To route notifications to the correct device, the controller hostname is embedded as a query parameter in the callback URL:

```
https://<homey>/api/app/com.dn.tailwind/notification?host=tailwind-abc123.local
```

The `api.ts` handler extracts `query.host`, passes it through `app.ts` as `sourceHost`, and each device filters by matching against its stored `controllerHost`.

## Architecture

### Notification Flow

```
Tailwind Controller
  → POST /api/app/com.dn.tailwind/notification?host=<controllerHost>
    → api.ts: receiveNotification() extracts query.host
      → app.ts: handleNotification() stores in log, emits event with sourceHost
        → device.ts: onNotification() filters by host, updates capability, fires flow triggers
```

### Polling Fallback

Every 30 seconds, each device polls its controller via `TailwindClient.getDeviceStatus()`. This catches state changes missed by notifications (e.g., if notification registration failed or the controller rebooted silently). The poll also re-registers the `notify_url` on each cycle to stay resilient.

### Flow Cards

- **Trigger cards** (4) — registered per-device in `device.ts onInit()`, fired from both `onNotification()` and `pollDeviceStatus()`
- **Condition + action cards** (3) — registered once in `driver.ts onInit()`, receive `args.device` from Homey automatically

Trigger deduplication: a `lastKnownClosed` field prevents double-firing when both notification and poll report the same state change.

## Testing & Quality

### Test Stack

- **Jest** with `ts-jest` — unit tests in `__tests__/` directories
- **Stryker** — mutation testing to validate test quality
- **Homey SDK mock** at `__mocks__/homey.ts` — shared across all test files

### Coverage Thresholds (enforced)

| Metric     | Threshold |
|------------|-----------|
| Branches   | >= 85%    |
| Functions  | >= 90%    |
| Lines      | >= 95%    |
| Statements | >= 95%    |
| Mutations  | >= 70%    |

### Git Hooks

| Hook        | Runs                                    |
|-------------|----------------------------------------|
| Pre-commit  | `lint-staged` (ESLint + Prettier on staged `.ts` files) |
| Pre-push    | `npm run qa` (type-check + lint + tests with coverage)  |

### PR Checklist

- [ ] Tests written before implementation
- [ ] `npm run qa` passes
- [ ] `npm run test:mutate` mutation score >= 70%
- [ ] No `any` types without `eslint-disable` comment
