# AFPS Protocol (HTTP + WebRTC DataChannels)

This document describes the current signaling and gameplay protocol in M0. All payloads are JSON.

---

## Versioning & constants

- Protocol version: `2`
- DataChannel labels:
  - Reliable: `afps_reliable`
  - Unreliable: `afps_unreliable`
- Server tick rate: `60` Hz
- Snapshot rate: `20` Hz
- Snapshot keyframe interval: `5` snapshots (configurable via `--snapshot-keyframe-interval`)
- Max DataChannel message size: `4096` bytes
- Max pending inputs per connection: `128`
- ClientHello attempts: `3`

---

## Signaling HTTP API

Base URL = `VITE_SIGNALING_URL` (HTTPS). All requests and responses are JSON.

### POST /session

Creates a short-lived session token.

Headers:
- `Authorization: Bearer <token>` (required when server auth token is configured)

Response:
```json
{
  "sessionToken": "<hex>",
  "expiresAt": "2026-01-31T12:34:56Z"
}
```

Errors are JSON:
```json
{ "error": "<code>", "message": "<detail>" }
```

### POST /webrtc/connect

Request:
```json
{ "sessionToken": "<token>" }
```

Response:
```json
{
  "connectionId": "<hex>",
  "offer": { "type": "offer", "sdp": "..." },
  "iceServers": [ { "urls": ["stun:..."] } ],
  "expiresAt": "2026-01-31T12:34:56Z"
}
```

### POST /webrtc/answer

Request:
```json
{
  "sessionToken": "<token>",
  "connectionId": "<id>",
  "answer": { "type": "answer", "sdp": "..." }
}
```

The server also accepts a flattened format:
```json
{
  "sessionToken": "<token>",
  "connectionId": "<id>",
  "sdp": "...",
  "type": "answer"
}
```

Response:
```json
{ "status": "ok" }
```

### POST /webrtc/candidate

Request:
```json
{
  "sessionToken": "<token>",
  "connectionId": "<id>",
  "candidate": "candidate:...",
  "sdpMid": "0"
}
```

Server also accepts `mid` instead of `sdpMid`.

Response:
```json
{ "status": "ok" }
```

### GET /webrtc/candidates

Query params: `sessionToken`, `connectionId`

Response:
```json
{
  "candidates": [
    { "candidate": "candidate:...", "sdpMid": "0" }
  ]
}
```

---

## DataChannel handshake (reliable)

### ClientHello (client -> server)

```json
{
  "type": "ClientHello",
  "protocolVersion": 2,
  "sessionToken": "<token>",
  "connectionId": "<id>",
  "build": "dev"
}
```

Validation rules:
- `protocolVersion` must equal 2.
- `sessionToken` and `connectionId` must match the signaling session.
- `build` is optional but if present must be non-empty.

### ServerHello (server -> client)

```json
{
  "type": "ServerHello",
  "protocolVersion": 2,
  "connectionId": "<id>",
  "clientId": "<id>",
  "serverTickRate": 60,
  "snapshotRate": 20,
  "snapshotKeyframeInterval": 5,
  "motd": "...",
  "connectionNonce": "<hex>"
}
```

`clientId`, `motd`, `connectionNonce`, and `snapshotKeyframeInterval` may be omitted.
If present, `snapshotKeyframeInterval` must be a non-negative integer.

### Protocol error

On invalid handshake, the server may send:
```json
{ "type": "Error", "code": "<code>", "message": "<detail>" }
```

---

## Gameplay messages (unreliable)

### InputCmd (client -> server)

```json
{
  "type": "InputCmd",
  "inputSeq": 123,
  "moveX": 0.0,
  "moveY": 1.0,
  "lookDeltaX": 0.0,
  "lookDeltaY": 0.0,
  "viewYaw": 0.0,
  "viewPitch": 0.0,
  "weaponSlot": 0,
  "jump": false,
  "fire": false,
  "sprint": false,
  "dash": false,
  "grapple": false,
  "shield": false,
  "shockwave": false
}
```

Validation rules:
- `inputSeq` must be an integer >= 0 and strictly increasing per connection.
- `moveX`, `moveY` must be finite and in [-1, 1].
- `lookDeltaX`, `lookDeltaY` must be finite numbers.
- `viewYaw`, `viewPitch` must be finite numbers when present.
- `weaponSlot` must be an integer >= 0 when present.
- `jump`, `fire`, `sprint`, `dash`, `grapple`, `shield`, `shockwave` must be booleans.

### Ping (client -> server)

```json
{ "type": "Ping", "clientTimeMs": 12345.0 }
```

`clientTimeMs` must be finite and >= 0.

### Pong (server -> client)

```json
{ "type": "Pong", "clientTimeMs": 12345.0 }
```

### GameEvent (server -> client)

Hit confirmation:
```json
{ "type": "GameEvent", "event": "HitConfirmed", "targetId": "<id>", "damage": 12.5, "killed": true }
```

Projectile spawn:
```json
{
  "type": "GameEvent",
  "event": "ProjectileSpawn",
  "ownerId": "<id>",
  "projectileId": 7,
  "posX": 1.0,
  "posY": 2.0,
  "posZ": 3.0,
  "velX": 4.0,
  "velY": 5.0,
  "velZ": 6.0,
  "ttl": 0.5
}
```

Projectile remove:
```json
{ "type": "GameEvent", "event": "ProjectileRemove", "ownerId": "<id>", "projectileId": 7 }
```

Validation rules:
- `event` must be a known event name (`HitConfirmed`, `ProjectileSpawn`, `ProjectileRemove`).
- For `HitConfirmed`:
  - `targetId` is optional; if present it must be a non-empty string.
  - `damage` is optional; if present it must be a finite number >= 0.
  - `killed` is optional; if present it must be a boolean.
- For `ProjectileSpawn`:
  - `ownerId` must be a non-empty string.
  - `projectileId` is optional; if present it must be an integer >= 0.
  - `posX`, `posY`, `posZ`, `velX`, `velY`, `velZ` must be finite numbers.
  - `ttl` must be a finite number >= 0.
- For `ProjectileRemove`:
  - `projectileId` must be an integer >= 0.
  - `ownerId` is optional; if present it must be a non-empty string.

### StateSnapshot (server -> client)

```json
{
  "type": "StateSnapshot",
  "serverTick": 900,
  "lastProcessedInputSeq": 120,
  "posX": 1.5,
  "posY": -2.0,
  "posZ": 0.75,
  "velX": 0.25,
  "velY": -0.75,
  "velZ": 0.5,
  "dashCooldown": 0.25,
  "health": 100,
  "kills": 0,
  "deaths": 0,
  "clientId": "<id>"
}
```

Validation rules:
- `serverTick` must be an integer >= 0.
- `lastProcessedInputSeq` must be an integer >= -1.
- `posX`, `posY`, `posZ` must be finite numbers.
- `velX`, `velY`, `velZ` must be finite numbers.
- `dashCooldown` must be a finite number >= 0.
- `health` must be a finite number >= 0.
- `kills`, `deaths` must be integers >= 0.
- `clientId` is optional.

The server sends full `StateSnapshot` keyframes every `5` snapshots. Deltas in between reference the
last keyframe via `StateSnapshotDelta`.

### StateSnapshotDelta (server -> client)

```json
{
  "type": "StateSnapshotDelta",
  "serverTick": 905,
  "baseTick": 900,
  "lastProcessedInputSeq": 121,
  "mask": 17,
  "posX": 1.75,
  "velY": -0.5,
  "clientId": "<id>"
}
```

Mask bitfield (`mask`):
- `1` (1 << 0): `posX`
- `2` (1 << 1): `posY`
- `4` (1 << 2): `posZ`
- `8` (1 << 3): `velX`
- `16` (1 << 4): `velY`
- `32` (1 << 5): `velZ`
- `64` (1 << 6): `dashCooldown`
- `128` (1 << 7): `health`
- `256` (1 << 8): `kills`
- `512` (1 << 9): `deaths`

Validation rules:
- `serverTick` must be an integer >= 0.
- `baseTick` must be an integer >= 0 and <= `serverTick`.
- `lastProcessedInputSeq` must be an integer >= -1.
- `mask` must be an integer containing only the known bits above.
- Fields are present **iff** their bit is set in `mask`; when present they must be finite numbers.
- `mask` may be `0` to indicate no field changes.
- `clientId` is optional.
