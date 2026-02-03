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
  out << "  --snapshot-keyframe-interval <n> Keyframe interval in snapshots (default 5, 0=all)\n";
  out << "  --character-manifest <path> Character manifest JSON for allowlisting character ids\n";
  out << "  --http          Disable TLS (local development only)\n";
  out << "  -h, --help      Show this help text\n";
  return out.str();
}
