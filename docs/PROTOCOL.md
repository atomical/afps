# AFPS Protocol (HTTP + WebRTC DataChannels)

This document describes the current signaling and gameplay protocol. Signaling is JSON over HTTPS; gameplay messages are FlatBuffers in a binary envelope over DataChannels.

---

## Versioning & constants

- Protocol version: `7`
- DataChannel labels:
  - Reliable: `afps_reliable`
  - Unreliable: `afps_unreliable`
- Server tick rate: `60` Hz
- Snapshot rate: `20` Hz
- Snapshot keyframe interval: `5` snapshots (configurable via `--snapshot-keyframe-interval`)
- Max DataChannel message size: `4096` bytes
- Max pending inputs per connection: `128`
- FlatBuffers schema: `shared/schema/afps_protocol.fbs`

---

## DataChannel envelope (binary)

All DataChannel messages use this header (little-endian), followed by a FlatBuffers payload:

| Offset | Size | Field |
| --- | --- | --- |
| 0 | 4 | Magic `"AFPS"` |
| 4 | 2 | `protocolVersion` (u16) |
| 6 | 2 | `msgType` (u16) |
| 8 | 4 | `payloadBytes` (u32) |
| 12 | 4 | `msgSeq` (u32) |
| 16 | 4 | `serverSeqAck` (u32) |

`payloadBytes` is the length of the FlatBuffers root object that follows immediately after the header.

### Sequencing

- `msgSeq` must monotonically increase per client connection.
- `serverSeqAck` echoes the last seen server `msgSeq`.
- The server rejects non-monotonic client sequences and logs abuse events.

---

## Signaling HTTP API (JSON)

Base URL = `VITE_SIGNALING_URL` (HTTPS by default). All requests and responses are JSON.

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
  "iceServers": [
    { "urls": ["stun:..."] },
    { "urls": ["turn:turn.example.com:3478"], "username": "<turn-user>", "credential": "<turn-pass>" }
  ],
  "expiresAt": "2026-01-31T12:34:56Z"
}
```
TURN entries include `username` + `credential` (short-lived TURN REST password). `credentialType` may be supplied
as `"password"` by the server.

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

## DataChannel handshake (FlatBuffers payloads)

### ClientHello (client → server, reliable)

Fields (see schema):
- `protocolVersion`
- `sessionToken`
- `connectionId`
- `build`

Validation rules:
- `protocolVersion` must match server expectations.
- `sessionToken` and `connectionId` must match signaling session.
- `build` is optional but if present must be non-empty.

### ServerHello (server → client, reliable)

Fields (see schema):
- `protocolVersion`
- `connectionId`
- `clientId`
- `serverTickRate`
- `snapshotRate`
- `snapshotKeyframeInterval`
- `motd` (optional)
- `connectionNonce` (optional)
- `mapSeed` (u32, deterministic world seed; `0` by default)

### Error (server → client, reliable)

Fields:
- `code`
- `message`

---

## Gameplay messages (FlatBuffers payloads)

### InputCmd (client → server, unreliable)

Fields include:
- `inputSeq` (monotonic)
- `moveX`, `moveY`
- `lookDeltaX`, `lookDeltaY`
- `viewYaw`, `viewPitch`
- `weaponSlot`, `jump`, `fire`, `sprint`, `dash`, `grapple`, `shield`, `shockwave`

### FireWeaponRequest / SetLoadoutRequest (client → server, unreliable)

Fields include:
- `FireWeaponRequest`: `weaponSlot`, `clientShotSeq`
- `SetLoadoutRequest`: `loadoutBits`

### StateSnapshot / StateSnapshotDelta (server → client, unreliable)

Snapshots include:
- `serverTick`, `lastProcessedInputSeq`
- `posX/posY/posZ`, `velX/velY/velZ`
- `weaponSlot`, `dashCooldown`, `health`, `kills`, `deaths`

Deltas include a `mask` describing which fields are present.

### GameEvent (server → client, unreliable)

Examples:
- `HitConfirmed`
- `ShotTrace` (hitscan impact/tracer metadata)
- `ProjectileSpawn`
- `ProjectileRemove`
- `PickupSpawned`
- `PickupTaken`

Pickup event fields:
- `PickupSpawned`: `pickupId`, `kind` (`Health`/`Weapon`), `posXQ`, `posYQ`, `posZQ`, `weaponSlot`, `amount`
- `PickupTaken`: `pickupId`, optional `takerId`, `serverTick`
- `ShotTrace`: `dirOct*`, `hitDistQ`, `hitKind`, `surfaceType`, `normalOct*`, `showTracer`, `hitPosXQ/YQ/ZQ`

Quantization notes:
- `ShotTrace` hit positions use signed int16 quantization (`hitPos*Q`) at `0.01m` step.
- Pickup positions use signed int16 quantization (`*_Q`) with the same shared helpers as other gameplay FX.
- Server and client currently use a pickup position step of `1/16` meter.

### Ping / Pong (client ↔ server, unreliable)

- `Ping` carries `clientTimeMs`; `Pong` echoes it.

### PlayerProfile (server → client, reliable)

- `clientId`, `displayName`, `characterId`, `team`

---

## Validation

- Envelope header must match magic, version, and payload length.
- Payloads are verified with FlatBuffers verifiers before parsing.
- Numerical inputs must be finite and within expected ranges.
- Input sequences are monotonic and bounded by rate limits.
