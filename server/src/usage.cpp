#include "usage.h"

#include <sstream>

std::string UsageText(const char *argv0) {
  std::ostringstream out;
  out << "Usage: " << argv0
      << " --auth-token <token> [--host <host>] [--port <port>] [--cert <path> --key <path>] [--http]\n";
  out << "\nOptions:\n";
  out << "  --cert <path>   Path to TLS certificate (PEM, required for HTTPS)\n";
  out << "  --key <path>    Path to TLS private key (PEM, required for HTTPS)\n";
  out << "  --auth-token <token> Shared secret for session issuance\n";
  out << "  --host <host>   Bind host (default 0.0.0.0)\n";
  out << "  --port <port>   Bind port (default 8443)\n";
  out << "  --ice <url>     ICE server URL (repeatable)\n";
  out << "  --turn-secret <secret> TURN REST shared secret (enables time-limited credentials)\n";
  out << "  --turn-user <user> TURN REST username suffix (default afps)\n";
  out << "  --turn-ttl <seconds> TURN REST credential TTL (default 3600)\n";
  out << "  --snapshot-keyframe-interval <n> Keyframe interval in snapshots (default 5, 0=all)\n";
  out << "  --map-seed <n> Deterministic procedural map seed (default 0)\n";
  out << "  --map-mode <legacy|static> Authoritative map mode (default legacy)\n";
  out << "  --map-manifest <path> Static map manifest JSON path (required for --map-mode static)\n";
  out << "  --dump-map-signature Print deterministic map collider/pickup signature JSON and exit\n";
  out << "  --character-manifest <path> Character manifest JSON for allowlisting character ids\n";
  out << "  --http          Disable TLS (local development only)\n";
  out << "  -h, --help      Show this help text\n";
  return out.str();
}
