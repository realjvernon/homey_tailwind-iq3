# Homey SDK v3 Reference

How this app uses the Homey SDK. For project layout and tooling, see [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md).

## App Manifest (app.json)

Key fields:
- `"sdk": 3` — SDK version
- `"platforms": ["local"]` — local-only (no Homey Cloud)
- `"permissions"` — `homey:manager:api` for local URL discovery
- `"discovery"` — mDNS-SD strategy for finding Tailwind controllers
- `"drivers"` — defines the `tailwind` driver with `garagedoor_closed` capability
- `"flow"` — trigger, condition, and action card definitions
- `"api"` — public POST `/notification` endpoint; private GET `/notification-log`
- `"pair"` — pairing view sequence: `start` → `list_devices` → `add_devices`

## Device Capabilities

This app uses:
- `garagedoor_closed` (boolean) — `true` when door is closed, `false` when open

Other common capabilities for reference:
- `onoff` (boolean), `dim` (number 0-1), `measure_temperature` (number)
- `alarm_generic` (boolean), `measure_battery` (number 0-100)

Full list: [Capabilities Reference](https://apps.developer.homey.app/the-basics/devices/capabilities)

## Pairing

The driver uses a custom `onPair()` session with three handlers:

1. **`discover_controllers`** — reads Homey's built-in mDNS discovery cache to list Tailwind controllers on the network
2. **`save_credentials`** — stores the selected controller host + local key from the UI
3. **`list_devices`** — authenticates with the controller, enumerates doors, returns device list

Each door becomes a separate Homey device. Device `store` holds: `controllerHost`, `localKey`, `doorIndex`, `discoveryId`.

## Discovery

The app uses Homey's built-in Discovery API with `mdns-sd` type:
- Service: `_http._tcp`
- Condition: `txt.vendor == "tailwind"`

The device implements `onDiscoveryResult`, `onDiscoveryAvailable`, and `onDiscoveryLastSeenChanged` for discovery lifecycle events. `onDiscoveryResult` matches by `discoveryId` first, then falls back to hostname matching.

## Real-Time Notifications

The Tailwind iQ3 supports push notifications via `notify_url`. On device init, the app registers a callback URL (with the controller hostname embedded as a query parameter) with the controller. When a door event occurs, the controller POSTs a status payload to the Homey API endpoint.

**Flow:** Controller → POST `/api/app/com.dn.tailwind/notification?host=<controllerHost>` → `api.ts` extracts `query.host` → `app.handleNotification()` → `homey.emit('tailwind:notification', payload, sourceHost)` → device listener filters by host match

**Events:** `open`, `close`, `lock`, `enable`, `disable`, `reboot`

- Registration is fire-and-forget; polling remains as fallback
- Re-registration happens on every successful poll cycle (idempotent) — catches IP changes, silent deregistration, firmware updates
- Re-registration also triggers after device settings change (host/key update)
- Controller reboot triggers automatic re-registration
- Each device matches notifications by `sourceHost` (extracted from the callback URL query param) and reads its own door status from the full payload

### Notification Diagnostics

- **App settings page** shows a live notification log (last 10 events, auto-refreshes every 5s)
- **GET `/notification-log`** API endpoint returns the in-memory log (authenticated only)
- **External test script** at `scripts/test-notification.ts` sends simulated notifications:
  ```bash
  npx ts-node scripts/test-notification.ts --homey-url http://<homey-ip> --host <controller-hostname> --event open --door 0
  ```

## Flow Cards

### Trigger Cards ("When...")

| ID | Title | Scope |
|----|-------|-------|
| `garage_door_opened` | Garage door opened | Per-door |
| `garage_door_closed` | Garage door closed | Per-door |
| `garage_door_locked` | Garage door locked | Per-door |
| `controller_rebooted` | Controller rebooted | Per-device (all doors) |

Registered in `device.ts onInit()`. Fired from both `onNotification()` (instant) and `pollDeviceStatus()` (fallback on state change).

### Condition Cards ("And...")

| ID | Title |
|----|-------|
| `garage_door_is_open` | The garage door is open/closed |

Registered in `driver.ts onInit()`. Checks `garagedoor_closed` capability value.

### Action Cards ("Then...")

| ID | Title |
|----|-------|
| `open_garage_door` | Open the garage door |
| `close_garage_door` | Close the garage door |

Registered in `driver.ts onInit()`. Calls `device.onCapabilityGarageDoorClosed()`.

## Device Lifecycle

```
onInit()           → read store, create client, sync settings, register flow cards,
                     register notification listener, register notify_url, start polling
pollDeviceStatus() → GET status every 30s, update garagedoor_closed, fire triggers on
                     state change, set available/unavailable, re-register notify_url
onNotification()   → push event from controller → filter by host → update capability →
                     fire flow triggers → re-register on reboot
onCapability()     → user toggles door → send open/close command
onSettings()       → validate connection with new settings, update stored host/key,
                     re-register notify_url
onDeleted()        → remove notification listener, clear timers, null trigger refs,
                     release client
```

**Gotcha:** Don't call `this.getStore()` in the constructor — only in `onInit()` or later.

## Homey CLI Commands

```bash
homey login               # Authenticate with Homey account
homey select              # Switch between Homey devices
homey app run             # Deploy to Homey Pro (live logs)
homey app install         # Deploy without keeping terminal open
homey app validate        # Validate manifest
homey app validate --level=publish  # Validate for App Store
homey app version         # Update app version
homey app publish         # Publish to App Store
```

## Resources

- [Homey Developer Documentation](https://apps.developer.homey.app)
- [Homey Community Forums](https://community.homey.app)
- [Homey Apps SDK Issue Tracker](https://github.com/athombv/homey-apps-sdk-issues)
