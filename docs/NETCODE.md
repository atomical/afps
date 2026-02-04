# Netcode Overview

This document explains the current netcode flow: signaling, handshake, input, prediction, snapshots, and metrics.

See also:
- `docs/NETWORK_STACK.md` for transport/signaling stack details.
- `docs/PROTOCOL.md` for message schemas and envelope format.

---

## Connection flow

1. **HTTPS signaling**
   - Client calls `POST /session` to get `sessionToken`.
   - Client calls `POST /webrtc/connect` to get an SDP offer and ICE servers.
   - Client sets the offer as remote description, creates an answer, and sends it to `POST /webrtc/answer`.
   - Client sends ICE candidates via `POST /webrtc/candidate` and polls `GET /webrtc/candidates`.

2. **DataChannels**
   - Server creates two channels: `afps_reliable` and `afps_unreliable`.
   - Client waits for both channels to open.

3. **Handshake**
   - Client sends `ClientHello` (FlatBuffers payload) on **reliable**.
   - Server validates the hello and responds with `ServerHello` on **reliable**.

4. **Gameplay**
   - Client sends `InputCmd` and `Ping` on **unreliable**.
   - Server sends `StateSnapshot` keyframes, `StateSnapshotDelta` updates, `GameEvent`, and `Pong` on **unreliable**.

---

## Envelope sequencing

Every DataChannel message includes a binary header:

- `msgSeq`: monotonically increasing client sequence.
- `serverSeqAck`: last seen server `msgSeq`.

The server rejects non-monotonic sequences and logs abuse events.

---

## Tick model

- Server tick: `60 Hz`.
- Snapshot rate: `20 Hz`.
- Client prediction uses the server tick rate after `ServerHello`.
- Clients can read `snapshotKeyframeInterval` from `ServerHello` for diagnostics.

---

## Snapshots

- The server sends a full `StateSnapshot` every 5 snapshots by default (keyframe interval, configurable on the server).
- Between keyframes, the server sends `StateSnapshotDelta` with a bitmask of changed fields.
- The client applies deltas to the last keyframe; if the keyframe is missing, the delta is ignored.
  - Deltas with `mask: 0` are valid and indicate no field changes for that tick.

---

## Input sampling & sending

- The client samples input every frame and emits an `InputCmd` per simulation tick.
- Input commands are serialized via FlatBuffers and sent over the **unreliable** channel.
- `inputSeq` is strictly monotonic per connection and used for reconciliation.

---

## Prediction & reconciliation

- Client prediction uses a deterministic sim step per tick.
- When a `StateSnapshot` arrives:
  1. Reset predicted state to the snapshot position.
  2. Restore predicted velocity from the snapshot (including vertical Z velocity).
  3. Replay un-acked inputs from history.
- History is capped (`MAX_HISTORY = 120`).

---

## Interpolation

- A snapshot buffer interpolates between the two latest snapshots.
- If prediction has not started yet, rendering uses the interpolated snapshot.

---

## Latency metrics

- Client sends `Ping` every second with `clientTimeMs`.
- Server replies `Pong` echoing the same timestamp.
- Client computes RTT and displays:
  - `rtt` (ms)
  - `snap` (snapshot age)
  - `drift` (prediction error)
- The HUD metrics also show `kf` (snapshot keyframe interval) from `ServerHello`, even before the first snapshot arrives.

---

## Determinism & WASM

- The shared C++ sim is the source of truth for movement.
- The client can load the WASM sim by setting:
  - `VITE_WASM_SIM_URL=/wasm/afps_sim.js`
- Optional parity check on startup:
  - `VITE_WASM_SIM_PARITY=1`
- Deterministic replay fixtures live in `shared/sim/replays/`.

---

## Known gaps

- Grapple rope state is not replicated yet (client predicts rope locally).
