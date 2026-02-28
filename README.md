# Tailwind Garage Door Opener for Homey

A Homey Pro app for local control of Tailwind iQ3 garage door openers. No cloud dependency — all communication stays on your local network.

## Features

- Automatic device discovery via mDNS
- Open/close control with real-time status updates (push notifications + 30s polling fallback)
- Flow cards for Homey automations (4 triggers, 1 condition, 2 actions)
- Per-device settings UI with connection validation
- Multi-door and multi-controller support

## Quick Start

### Prerequisites

- Node.js v18+
- A Homey Pro on the same network
- A Tailwind iQ3 with a Local Control Key (from [web.gotailwind.com](https://web.gotailwind.com))

### Setup

```bash
git clone <repo-url>
cd com.dn.tailwind
npm install

# Install and configure the Homey CLI
npm install --global --no-optional homey
homey login
homey select    # choose your Homey Pro
```

### Build and Run

```bash
npm run build       # compile TypeScript → .homeybuild/
homey app run       # deploy to Homey Pro with live logs
```

## Development Commands

| Command | Purpose |
|---------|---------|
| `npm run build` | Compile TypeScript |
| `npm test` | Run all tests |
| `npm run test:watch` | Tests in watch mode |
| `npm run test:coverage` | Tests + coverage report + threshold check |
| `npm run test:mutate` | Mutation testing (Stryker, >= 70% threshold) |
| `npm run qa` | Type-check + lint + tests with coverage |
| `npm run check-types` | TypeScript type checking only |
| `npm run lint` | ESLint |
| `npm run lint:fix` | ESLint with auto-fix |
| `npm run format` | Prettier |
| `homey app run` | Deploy to Homey Pro (live logs) |
| `homey app install` | Deploy without keeping terminal open |

## Manual Testing

Send a simulated notification from any machine on the LAN:

```bash
npx ts-node scripts/test-notification.ts \
  --homey-url https://<homey-local-url> \
  --host <controller-hostname> \
  --event open \
  --door 0
```

The `--host` value must match the `controllerHost` stored during pairing (visible in device settings). Run with `--help` for all options.

## Documentation

| Document | Contents |
|----------|----------|
| [docs/PROJECT_STRUCTURE.md](docs/PROJECT_STRUCTURE.md) | Directory layout, architecture, design decisions, testing setup |
| [docs/HOMEY.md](docs/HOMEY.md) | Homey SDK patterns, capabilities, pairing, discovery, flow cards |
| [docs/TAILWIND_API.md](docs/TAILWIND_API.md) | Tailwind iQ3 local HTTP API reference |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Future plans |
| [CLAUDE.md](CLAUDE.md) | AI-assisted development rules (TDD workflow, coverage, PR checklist) |

## License

MIT
