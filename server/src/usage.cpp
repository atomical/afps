#include "usage.h"

#include <sstream>

std::string UsageText(const char *argv0) {
  std::ostringstream out;
  out << "Usage: " << argv0
      << " --cert <path> --key <path> --auth-token <token> [--host <host>] [--port <port>]\n";
  out << "\nOptions:\n";
  out << "  --cert <path>   Path to TLS certificate (PEM)\n";
  out << "  --key <path>    Path to TLS private key (PEM)\n";
  out << "  --auth-token <token> Shared secret for session issuance\n";
  out << "  --host <host>   Bind host (default 0.0.0.0)\n";
  out << "  --port <port>   Bind port (default 8443)\n";
  out << "  --ice <url>     ICE server URL (repeatable)\n";
  out << "  --snapshot-keyframe-interval <n> Keyframe interval in snapshots (default 5, 0=all)\n";
  out << "  -h, --help      Show this help text\n";
  return out.str();
}
