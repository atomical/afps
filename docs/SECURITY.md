# Security Notes (M0)

This document summarizes the current security posture and known gaps.

---

## Transport security

- HTTPS is required for all signaling endpoints.
- WebRTC DataChannels run over DTLS/SCTP.

---

## Authentication

- `/session` requires a Bearer token **if** the server is configured with `--auth-token`.
- If `--auth-token` is empty, the endpoint is open (dev mode).

Auth errors are returned as:
```json
{ "error": "<code>", "message": "<detail>" }
```

---

## Rate limits & size limits

HTTP layer (pre-routing):
- Token bucket keyed by `remote_addr`.
- Capacity: `40` tokens, refill: `20`/sec.
- Max request payload: `32 KiB`.

DataChannel layer:
- Max message size: `4096` bytes.
- Input rate limiter per connection:
  - `input_max_tokens = 120`
  - `input_refill_per_second = 120`
- Pending input queue cap: `128` inputs.

Abuse handling:
- Invalid inputs increment a counter; connection closes after `max_invalid_inputs = 5`.
- Rate-limit drops increment a counter; connection closes after `max_rate_limit_drops = 20`.

---

## Validation

- All JSON messages are parsed as objects and validated for required fields.
- Numerical inputs must be finite.
- Movement axes must be within [-1, 1].
- `inputSeq` must be monotonic per connection.

---

## Session lifecycle

- Sessions expire after 900 seconds (15 minutes) by default.
- Expired sessions and closed connections are pruned.

---

## Known gaps / TODOs

- No TURN deployment yet (only configured ICE servers).
- No CSRF protection (only relevant if cookies are added).
- No structured audit logging or request IDs.
- No TLS certificate rotation or pinning policy.
