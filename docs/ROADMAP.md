# Roadmap

## Phase 1: Tailwind iQ3 Simulator

Stand up N fake controllers on the LAN so the Homey app discovers and interacts with them identically to real hardware. Enables testing multi-controller pairing, notification routing, failover, and reboot recovery.

**Location:** `scripts/simulator/`

### HTTP Server (`POST /json`)

The simulator accepts the same requests `TailwindClient` sends and returns matching response shapes.

**Authentication:** Validate `TOKEN` header against a configurable 6-digit key. Return `{ "result": "Fail", "info": "Invalid token" }` on mismatch.

#### Command: `dev_st` (get device status)

Request (from `TailwindClient.getDeviceStatus`):
```json
{
  "version": "0.1",
  "data": { "type": "get", "name": "dev_st" }
}
```

Response (`TailwindStatusResponse`):
```json
{
  "result": "OK",
  "product": "iQ3",
  "dev_id": "_sim_01_",
  "proto_ver": "0.1",
  "door_num": 2,
  "fw_ver": "10.10",
  "led_brightness": 100,
  "router_rssi": -45,
  "server_monitor": false,
  "data": {
    "door1": { "index": 0, "status": "close", "lockup": 0, "disabled": 0 },
    "door2": { "index": 1, "status": "open", "lockup": 0, "disabled": 0 }
  }
}
```

#### Command: `door_op` (control door)

Request (from `TailwindClient.controlDoor`):
```json
{
  "version": "0.1",
  "product": "iQ3",
  "data": {
    "type": "set",
    "name": "door_op",
    "value": { "door_idx": 0, "cmd": "open" }
  }
}
```

Behavior:
- Validate `door_idx` < `door_num`, return `Fail` if out of range
- Update in-memory door state (`close` -> `open` or vice versa)
- If a `notify_url` is registered, POST a `TailwindNotificationPayload` to it after state change

Response: `{ "result": "OK" }`

#### Command: `notify_url` (register/unregister)

Register (from `TailwindClient.registerNotifyUrl`):
```json
{
  "version": "0.1",
  "product": "iQ3",
  "data": {
    "type": "set",
    "name": "notify_url",
    "value": { "enable": 1, "proto": "http", "url": "http://..." }
  }
}
```

Unregister (from `TailwindClient.unregisterNotifyUrl`):
```json
{
  "version": "0.1",
  "product": "iQ3",
  "data": {
    "type": "set",
    "name": "notify_url",
    "value": { "enable": 0 }
  }
}
```

Behavior:
- Store URL in memory; new registration replaces previous
- Unregister clears stored URL
- Response: `{ "result": "OK" }`

### Push Notifications (outbound POST)

When door state changes (via `door_op`), POST to the registered URL:

```json
{
  "result": "OK",
  "dev_id": "_sim_01_",
  "door_num": 2,
  "data": {
    "door1": { "index": 0, "status": "open", "lockup": 0, "disabled": 0 },
    "door2": { "index": 1, "status": "close", "lockup": 0, "disabled": 0 }
  },
  "notify": {
    "door_idx": 0,
    "event": "open"
  }
}
```

This matches `TailwindNotificationPayload` — full door state + `notify` block identifying which door and event.

### mDNS Advertisement

Must advertise on the network so Homey's discovery (`app.json`) finds it:
- Service: `_http._tcp`
- TXT records: `vendor=tailwind` (required by discovery condition), plus `product=iQ3`, `device_id=<dev_id>`
- Hostname: `tailwind-sim-{n}.local` (matches the `tailwind-*.local` pattern)
- Library: `bonjour-service` (pure JS, no native deps) or `@homebridge/ciao` (well-maintained)

### State Model

Per simulator instance:
```typescript
interface SimulatorState {
  devId: string;           // e.g., "_sim_01_"
  localKey: string;        // 6-digit auth token
  hostname: string;        // e.g., "tailwind-sim-1.local"
  port: number;            // HTTP server port (default 80, or configurable)
  doorCount: number;       // 1-3
  doors: DoorStatus[];     // mutable state per door
  notifyUrl: string | null; // registered callback URL
  fwVer: string;           // "10.10"
}
```

### CLI Interface

```bash
# Start 1 simulator with 2 doors on port 8080
npx ts-node scripts/simulator/index.ts --doors 2 --port 8080 --key 123456

# Start 3 simulators (ports 8080, 8081, 8082)
npx ts-node scripts/simulator/index.ts --count 3 --doors 2 --port 8080 --key 123456

# Named simulators for easier identification
npx ts-node scripts/simulator/index.ts --name garage --doors 3 --port 8080 --key 123456
```

Options:
| Flag | Description | Default |
|------|-------------|---------|
| `--count <n>` | Number of instances (ports auto-increment) | 1 |
| `--doors <n>` | Doors per controller, 1-3 | 1 |
| `--port <n>` | Starting HTTP port | 80 |
| `--key <digits>` | 6-digit local control key | random |
| `--name <name>` | Hostname prefix, produces `tailwind-sim-{name}-{n}.local` | (none) |

### Interactive Keyboard Commands

While running, accept keyboard input to simulate events that can't be triggered via the API:

| Key | Action |
|-----|--------|
| `r` | Simulate controller reboot (POST reboot notification, restart mDNS) |
| `l <door>` | Toggle lock on a door (POST lock notification) |
| `e <door>` | Toggle enable/disable on a door (POST enable/disable notification) |
| `s` | Print current state of all doors + registered notify_url |
| `q` | Graceful shutdown (unpublish mDNS, close HTTP server) |

### File Structure

```
scripts/simulator/
├── index.ts              # CLI entry point, arg parsing, spawns instances
├── simulator.ts          # SimulatorInstance class (HTTP server + state + notifications)
├── mdns.ts               # mDNS advertisement helpers (wraps bonjour-service)
└── README.md             # Usage documentation
```

---

## Phase 2: Interactive Developer CLI

Replace the manual-args test-notification script with an interactive tool that discovers devices on the network and lets you fire events with a menu.

**Location:** `scripts/dev-cli.ts` (replaces or complements `scripts/test-notification.ts`)

### mDNS Discovery

Discover both device types on the LAN:
- **Tailwind controllers** (real + simulated): `_http._tcp` with `txt.vendor=tailwind`
- **Homey Pro instances**: Homey advertises via mDNS — discover by known service type or allow manual URL entry as fallback

Share mDNS utility code with the simulator:
```
scripts/lib/discovery.ts   # findTailwindControllers(), findHomeyInstances()
```

### Interactive Flow

Using `prompts` or `inquirer`:

1. **Scan network** — discover Tailwind controllers and Homey instances
2. **Select Tailwind controller** — list discovered controllers with hostname + IP + door count
3. **Select door** — pick door index (0-based)
4. **Select Homey target** — list discovered Homey instances (or enter URL manually)
5. **Choose event** — `open`, `close`, `lock`, `enable`, `disable`, `reboot`
6. **Fire notification** — POST to Homey's `/api/app/com.dn.tailwind/notification?host=<controllerHost>`
7. **Repeat or quit** — loop back to step 5 (same controller/door/homey) or step 1

### Backward Compatibility

Keep `--flags` mode for scripting/CI — if all required args are provided, skip interactive prompts:

```bash
# Interactive mode (no args)
npx ts-node scripts/dev-cli.ts

# Non-interactive (all args provided, same as current test-notification.ts)
npx ts-node scripts/dev-cli.ts --homey-url http://... --host tailwind-abc.local --event open --door 0
```

### Shared Dependencies

New npm dev dependencies for both phases:

| Package | Purpose | Phase |
|---------|---------|-------|
| `bonjour-service` | mDNS discovery + advertisement | 1 & 2 |
| `prompts` or `inquirer` | Interactive CLI prompts | 2 |

---

## Verification Checklist

- [ ] Run the simulator, confirm it appears in Homey's pairing discovery
- [ ] Pair a simulated controller through the Homey UI, verify doors appear
- [ ] Open/close doors from Homey, confirm simulator state changes
- [ ] Confirm push notifications arrive at Homey from the simulator
- [ ] Run the interactive CLI, verify it discovers both real and simulated controllers
- [ ] Test multi-controller scenario: 2+ simulators paired simultaneously, verify notification routing by host
