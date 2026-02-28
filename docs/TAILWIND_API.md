# Tailwind Local Control API Documentation

Based on [Scott--R/Tailwind_Local_Control_API](https://github.com/Scott--R/Tailwind_Local_Control_API).

## Device Discovery
Devices are discovered using mDNS (Bonjour/Zeroconf):
- Service type: `_http._tcp`
- Device name contains: `TW-WebServer`
- TXT records include:
  - `vendor`: `"tailwind"`
  - `HW ver`: Hardware version (e.g., `"V1.3"`)
  - `SW ver`: Firmware version (e.g., `"9.97"`)
  - `device_id`: Unique identifier
  - `HomeKit`: Support indicator (`1`/`0`)
  - `Product`: Model type (e.g., `"iQ3"`)

Device addresses follow the pattern: `tailwind-<mac_address>.local`
Example: `tailwind-30aea4801880.local`

## API Endpoint

All commands use `POST http://<device-ip-or-hostname>/json` with JSON payloads.

### Authentication
All requests require a 6-digit Local Control Key in the header:
```
TOKEN:<6-digit-key>
```
The token is generated via the Tailwind web dashboard (web.gotailwind.com).

### Request Format
```json
{
    "version": "0.1",
    "product": "iQ3",
    "data": {
        "type": "get|set",
        "name": "<command_name>",
        "value": { }
    }
}
```

### Protocol Versions
- `"0.1"` — Basic commands (device status, door control, LED, notifications)
- `"0.2"` — Extended commands (identify, reboot, server monitoring)

### Response Format
Success:
```json
{ "result": "OK" }
```

Failure:
```json
{ "result": "Fail", "info": "<error_details>" }
```

## Commands

### Get Device Status
```json
{
    "version": "0.1",
    "data": {
        "type": "get",
        "name": "dev_st"
    }
}
```
Response includes: product type, device ID, protocol version, firmware version, door count, individual door statuses (`"open"` or `"close"`), night mode, LED brightness, WiFi signal strength, and server monitoring state.

### Control Door
```json
{
    "version": "0.1",
    "product": "iQ3",
    "data": {
        "type": "set",
        "name": "door_op",
        "value": {
            "door_idx": 0,
            "cmd": "open"
        }
    }
}
```
- `door_idx`: 0-2 (0-based door index)
- `cmd`: `"open"` or `"close"`
- `partial_time` (optional): milliseconds for partial opening

### Status Notifications
```json
{
    "version": "0.1",
    "product": "iQ3",
    "data": {
        "type": "set",
        "name": "notify_url",
        "value": {
            "url": "<http-or-udp-address>",
            "proto": "http",
            "enable": 1
        }
    }
}
```
- `proto`: `"http"` or `"udp"`
- `enable`: `1` (enable) or `0` (disable)
- Notification events: `open`, `close`, `lock`, `enable`, `disable`, `reboot`

### LED Brightness
```json
{
    "version": "0.1",
    "product": "iQ3",
    "data": {
        "type": "set",
        "name": "status_led",
        "value": {
            "brightness": 50
        }
    }
}
```
- `brightness`: 0-100

### Identify Device (v10.10+)
```json
{
    "version": "0.2",
    "product": "iQ3",
    "data": {
        "type": "set",
        "name": "identify"
    }
}
```
Blinks the white LED three times.

### Reboot Device (v10.10+)
```json
{
    "version": "0.2",
    "product": "iQ3",
    "data": {
        "type": "set",
        "name": "reboot"
    }
}
```

### Server Monitoring (v10.61+)
```json
{
    "version": "0.2",
    "product": "iQ3",
    "data": {
        "type": "set",
        "name": "server_monitor",
        "value": {
            "enable": true
        }
    }
}
```
Controls automatic rebooting when MQTT connection is lost.

## Firmware Requirements
- v9.96+: JSON command format support
- v10.10+: Identify and reboot commands
- v10.61+: Server monitoring control

## Implementation Notes
- Poll status every 10-30 seconds for state updates
- Door status values are `"open"` or `"close"` (not `"closed"`)
- Handle up to 3 doors per controller (indices 0-2)
- Store Local Control Key securely
