# Security Notes

This document summarizes the current security posture and remaining gaps.

---

## Transport security

- HTTPS is the default for all signaling endpoints, with HSTS enabled.
- HTTP is allowed only with `--http` for local dev.
- WebRTC DataChannels run over DTLS/SCTP (encrypted by default).

---

## Authentication

- `/session` requires a Bearer token when `--auth-token` is configured.
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

Signaling layer:
- Rate limit per session token and per connection ID.

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

- All DataChannel messages are validated via the binary header (magic/version/length).
- FlatBuffers payloads are verified before parsing.
- Numerical inputs must be finite and within expected ranges.
- `msgSeq` and `inputSeq` must be monotonic per connection.

---

## Observability

- HTTP requests include `X-Request-Id` and are logged in JSON.
- Audit logs capture:
  - auth failures
  - session issuance
  - connection creation/handshake completion/closure
  - invalid DataChannel messages and rate limits

---

## TURN

- A coturn deployment recipe lives in `tools/turn/`.
- TURN REST credentials are generated per connection when `--turn-secret` is set.
- Configure signaling with:
  - `--ice turn:turn.example.com:3478`
  - `--turn-secret <shared-secret>`
  - `--turn-user <suffix>`
  - `--turn-ttl <seconds>`
- A helper generator is available: `tools/turn_rest_credentials.py`.

---

## Known gaps / TODOs

- CSRF protection (only relevant if cookies are introduced).
- TLS certificate rotation/pinning policy.
