#!/usr/bin/env python3
import argparse
import base64
import hashlib
import hmac
import json
import time


def build_credentials(secret: str, user: str, ttl: int) -> tuple[str, str]:
    expiry = int(time.time()) + ttl
    username = f"{expiry}:{user}" if user else str(expiry)
    digest = hmac.new(secret.encode("utf-8"), username.encode("utf-8"), hashlib.sha1).digest()
    credential = base64.b64encode(digest).decode("utf-8")
    return username, credential


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate TURN REST credentials (coturn compatible).")
    parser.add_argument("--secret", required=True, help="TURN REST shared secret")
    parser.add_argument("--user", default="afps", help="Username suffix (default: afps)")
    parser.add_argument("--ttl", type=int, default=3600, help="Credential TTL in seconds (default: 3600)")
    parser.add_argument("--ice", action="append", default=[], help="TURN URL to include in JSON output (repeatable)")
    parser.add_argument("--json", action="store_true", help="Emit JSON instead of plain text")
    args = parser.parse_args()

    if args.ttl <= 0:
        raise SystemExit("ttl must be > 0")

    username, credential = build_credentials(args.secret, args.user, args.ttl)
    if args.json:
        payload = {"username": username, "credential": credential}
        if args.ice:
            payload["iceServers"] = [
                {
                    "urls": [url],
                    "username": username,
                    "credential": credential,
                    "credentialType": "password",
                }
                for url in args.ice
            ]
        print(json.dumps(payload, indent=2))
    else:
        print(username)
        print(credential)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
