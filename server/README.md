# AFPS Server (C++)

## Build (HTTPS)

```bash
cmake -S . -B build
cmake --build build
```

Build uses FetchContent to pull libdatachannel by default. To disable WebRTC integration:

```bash
cmake -S . -B build -DAFPS_ENABLE_WEBRTC=OFF
cmake --build build
```

## Generate dev certs

```bash
cd certs
openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 365 -nodes -subj "/CN=localhost"
```

## Run

```bash
./build/afps_server --cert certs/cert.pem --key certs/key.pem --host 0.0.0.0 --port 8443
```

Deterministic procedural world seed:

```bash
./build/afps_server --cert certs/cert.pem --key certs/key.pem --map-seed 1337 --host 0.0.0.0 --port 8443
```

Optional: provide ICE servers (repeatable):

```bash
./build/afps_server --cert certs/cert.pem --key certs/key.pem --ice stun:stun.example.com:3478
```

## Tests

```bash
cmake -S . -B build
cmake --build build
ctest --test-dir build
```
