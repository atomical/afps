# Reliable Decal Streaming

## Goal

Make bullet-impact decals visible to other connected players even when unreliable FX packets are dropped.

## Implementation Summary

Decals are still rendered client-side, but the world-hit events that drive them are now sent on a reliable path in addition to the existing unreliable FX path.

### Server changes

- File: `server/src/tick.cpp`
- For hitscan world impacts (`ShotTraceFx` with `HitKind::World`):
  - Continue sending standard FX over unreliable.
  - Also queue the same event for reliable delivery per recipient.
- For projectile world impacts (`ProjectileImpactFx` with `hit_world=true`):
  - Continue sending standard FX over unreliable.
  - Also queue the same event for reliable delivery to all recipients.
- Reliable decal events are batched into `GameEvent` messages and sent with `SendReliable`.
- Chunking logic is used to stay under `kMaxClientMessageBytes`.

### Client networking changes

- File: `client/src/net/webrtc.ts`
- Reliable channel handler now also parses `MessageType.GameEvent` and forwards it to `onGameEvent`.

### Client runtime dedupe changes

- File: `client/src/main.ts`
- Added dedupe caches for:
  - `ShotTraceFx` by `{shooterId}:{shotSeq}`
  - `ProjectileImpactFx` by `projectileId`
- This prevents double decals/impacts when both unreliable and reliable copies arrive.
- Added TTL and max-entry pruning for dedupe caches.

### Legacy FX setting migration

- File: `client/src/main.ts`
- Old stored FX settings with `decals=false` are automatically normalized to `decals=true`.
- Settings updates also enforce `decals=true` to match current UI behavior (decal toggle removed).

## Operational Behavior

- Connected players should now see the same world-hit decals much more consistently.
- Reliability here means transport reliability for connected recipients.
- Decals are not currently persisted for late joiners or reconnect replay.

## Debugging

Enable FX debug logs in browser console:

```js
window.__afpsDebugFx = true
```

This emits `[afps][fx]` logs for:

- incoming FX batch type counts
- trace/decal processing
- duplicate suppression events

## Tests

- `client/tests/net/webrtc.test.ts`:
  - added reliable-channel `GameEvent` forwarding coverage.
- `client/tests/main.test.ts`:
  - added repeated shot-trace dedupe coverage.
- Full suite run via `tools/run_all_tests.sh`.
- If client coverage debt is known, run with `CLIENT_COVERAGE_MODE=optional` to keep parity/UI/perf checks blocking while allowing non-coverage unit pass fallback.
