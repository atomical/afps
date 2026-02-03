# TURN Setup (coturn + TURN REST)

This project uses TURN REST credentials (time-limited) so TURN passwords never ship long-term.

---

## Server configuration

Enable TURN REST on the signaling server:

```bash
./build/afps_server \
  --cert certs/cert.pem \
  --key certs/key.pem \
  --auth-token devtoken \
  --ice stun:stun.l.google.com:19302 \
  --ice turn:turn.example.com:3478 \
  --turn-secret supersecret \
  --turn-user afps \
  --turn-ttl 3600
```

The `/webrtc/connect` response will include `username` + `credential` for TURN entries.

---

## Local coturn (Docker)

Use the sample config in `tools/turn/`:

```bash
cd tools/turn
# Edit turnserver.conf: set static-auth-secret=...
docker compose up -d
```

If you want TLS (turns), provide certificates and uncomment the TLS lines:

- `tools/turn/certs/turn.pem`
- `tools/turn/certs/turn.key`

Then use `turns:turn.example.com:5349` in your `--ice` list.

---

## Standalone credential generator

```bash
./tools/turn_rest_credentials.py --secret supersecret --user afps --ttl 3600 --json \
  --ice turn:turn.example.com:3478
```

This prints a ready-to-paste `iceServers` entry.
