# Network Stack

This document describes AFPS networking from signaling to gameplay transport. It is a high-level map of the code paths described in `docs/PROTOCOL.md` and `docs/NETCODE.md`.

---

## Overview

- **Signaling:** JSON over HTTPS (cpp-httplib + OpenSSL) with bearer-token auth (optional in dev).
- **Transport:** WebRTC DataChannels (DTLS/SCTP) via libdatachannel.
- **Payloads:** FlatBuffers serialized into a fixed binary envelope.
- **Flow:** HTTPS session + offer/answer + ICE → DataChannels → ClientHello/ServerHello → gameplay stream.

---

## Signaling (HTTPS)

### Libraries

- **Server HTTP:** `cpp-httplib` (`server/src/main.cpp`).
- **TLS:** OpenSSL (HTTPS default; `--http` for local dev).

### Endpoints (JSON)

- `POST /session`
  - Issues a short-lived `sessionToken`.
  - Requires `Authorization: Bearer <token>` if `--auth-token` is configured.
- `POST /webrtc/connect`
  - Accepts `sessionToken` and returns an SDP offer + ICE servers.
  - If TURN REST is enabled, returns `username` + `credential` for TURN entries.
- `POST /webrtc/answer`
  - Accepts `sessionToken`, `connectionId`, and the SDP answer.
- `POST /webrtc/candidate`
  - Accepts ICE candidates from the client.
- `GET /webrtc/candidates`
  - Client polls for server ICE candidates.

See `docs/PROTOCOL.md` for request/response examples.

### Request controls

- **Payload cap:** 32 KiB at the HTTP layer.
- **Rate limiting:** Token buckets keyed by remote address (pre-routing) and by session/connection.
- **CORS:** `Access-Control-*` headers are injected and preflight `OPTIONS` requests are handled.
- **Observability:** Every request includes an `X-Request-Id` header and JSON logs.

---

## ICE + TURN

- **STUN/TURN list:** Configured via repeated `--ice` flags.
- **TURN REST:** `--turn-secret`, `--turn-user`, `--turn-ttl` generate short-lived credentials per connection.
- **Response payload:** `iceServers` array includes `{ urls, username, credential }` when TURN is enabled.
- **Docs:** `docs/TURN.md` contains a coturn recipe and a credential generator.

---

## WebRTC Transport

### DataChannels

- **Reliable channel:** label `afps_reliable` (default ordered/reliable).
- **Unreliable channel:** label `afps_unreliable` configured as unordered with `maxRetransmits = 0`.
- **Server creation:** `server/src/signaling.cpp` creates both channels before setting local description.
- **Client behavior:** `client/src/net/webrtc.ts` waits for both channels to open.

### Message size

- **Max DataChannel payload:** 4096 bytes (enforced in protocol validation).

---

## Binary Envelope

All DataChannel messages share a fixed header (little-endian) followed by a FlatBuffers payload:

| Offset | Size | Field |
| --- | --- | --- |
| 0 | 4 | Magic "AFPS" |
| 4 | 2 | protocolVersion (u16) |
| 6 | 2 | msgType (u16) |
| 8 | 4 | payloadBytes (u32) |
| 12 | 4 | msgSeq (u32) |
| 16 | 4 | serverSeqAck (u32) |

- `msgSeq` is monotonic per client connection.
- `serverSeqAck` echoes the last seen server `msgSeq`.
- Non-monotonic sequences are rejected and logged.

Schema: `shared/schema/afps_protocol.fbs`.

---

## Handshake

1. Client connects via HTTPS and receives the SDP offer + ICE servers.
2. Client submits the SDP answer and exchanges ICE candidates.
3. DataChannels open.
4. Client sends **ClientHello** on `afps_reliable`.
5. Server validates and responds with **ServerHello** on `afps_reliable`.

**ClientHello** fields include:
- `protocolVersion`, `sessionToken`, `connectionId`, optional `build`, and optional player profile.

**ServerHello** fields include:
- `protocolVersion`, `connectionId`, `clientId`, `serverTickRate`, `snapshotRate`, `snapshotKeyframeInterval`.
- `mapSeed` (deterministic procedural map seed used by clients to build matching map/collider state).

---

## Gameplay Message Flow

### Client → Server (unreliable)

- **InputCmd:** Per-tick input packet with `inputSeq` (monotonic).
- **Ping:** Every second with `clientTimeMs`.

### Server → Client (unreliable)

- **StateSnapshot:** Full snapshot keyframes.
- **StateSnapshotDelta:** Masked deltas between keyframes.
- **GameEvent:** Hit confirmations, projectile events, pickup spawn/taken events, etc.
- **Pong:** Echoes `clientTimeMs`.

### Server → Client (reliable)

- **PlayerProfile:** Profile + team info for remote players.

---

## Tick + Snapshot Model

- **Server tick:** 60 Hz.
- **Snapshot rate:** 20 Hz.
- **Keyframe interval:** Default 5 snapshots; configurable via `--snapshot-keyframe-interval`.
- **World seed:** `ServerHello.mapSeed` drives deterministic map/collider generation on clients.
- **Delta application:** Client applies deltas on top of the most recent keyframe; deltas before the first keyframe are ignored.
- **Mask semantics:** A delta with `mask = 0` is valid and means "no field changes".

---

## Client Prediction + Interpolation

- **Prediction:** Client sim advances using the server tick rate from `ServerHello`.
- **Reconciliation:** On snapshot arrival, predicted state is reset to server state and un-acked inputs are replayed.
- **Interpolation:** Rendering uses a snapshot buffer that interpolates between the latest snapshots; before prediction starts, interpolation-only is used.

---

## Validation + Abuse Resistance

- **Envelope validation:** Magic/version/payload size must match; payloads are FlatBuffers-verified before parsing.
- **Input validation:** Finite numeric checks and bounds enforcement.
- **Rate limits:**
  - Input token bucket per connection (`input_max_tokens = 120`, `input_refill_per_second = 120`).
  - Pending input queue cap: 128.
  - Invalid input and rate-limit drops close the connection after configured thresholds.

---

## Observability

- **HTTP logs:** JSON lines with timestamp, method, path, status, request id, and remote address.
- **Audit events:** Auth failures, session issuance, connection create/close, invalid data channel messages.
- **Client metrics:** RTT, snapshot age, drift, and keyframe interval displayed in the HUD.

---

## Related docs

- Protocol reference: `docs/PROTOCOL.md`
- Netcode flow: `docs/NETCODE.md`
- Security notes: `docs/SECURITY.md`
- TURN setup: `docs/TURN.md`
