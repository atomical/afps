#include "auth.h"
#include "character_manifest.h"
#include "config.h"
#include "health.h"
#include "map_world.h"
#include "rate_limiter.h"
#include "security_headers.h"
#include "tick.h"
#include "usage.h"

#include "httplib.h"

#ifdef AFPS_ENABLE_WEBRTC
#include "protocol.h"
#include "signaling.h"
#include "signaling_json.h"
#include <rtc/rtc.hpp>
#endif

#include <algorithm>
#include <cctype>
#include <cmath>
#include <cstdint>
#include <filesystem>
#include <iomanip>
#include <iostream>
#include <random>
#include <sstream>
#include <string>
#include <tuple>
#include <vector>

namespace {
constexpr size_t kMaxPayloadBytes = 32 * 1024;
constexpr size_t kMaxRequestIdBytes = 64;
constexpr int kMapSignatureTickRate = 60;
const char *kTooLargeJson = "{\"error\":\"payload_too_large\"}";
const char *kRateLimitedJson = "{\"error\":\"rate_limited\"}";
const char *kNotFoundJson = "{\"error\":\"not_found\"}";
const char *kRequestIdHeader = "X-Request-Id";
constexpr uint64_t kFnvOffsetBasis = 1469598103934665603ull;
constexpr uint64_t kFnvPrime = 1099511628211ull;

int64_t QuantizeCenti(double value) {
  if (!std::isfinite(value)) {
    return 0;
  }
  return static_cast<int64_t>(std::llround(value * 100.0));
}

uint64_t HashByte(uint64_t hash, uint8_t value) {
  const uint64_t mixed = hash ^ static_cast<uint64_t>(value);
  return mixed * kFnvPrime;
}

uint64_t HashString(uint64_t hash, const std::string &value) {
  for (char ch : value) {
    hash = HashByte(hash, static_cast<uint8_t>(ch));
  }
  return hash;
}

std::string HashToHex(uint64_t hash) {
  std::ostringstream out;
  out << std::hex << std::setw(16) << std::setfill('0') << hash;
  return out.str();
}

struct ColliderRow {
  int64_t min_x = 0;
  int64_t max_x = 0;
  int64_t min_y = 0;
  int64_t max_y = 0;
  int64_t min_z = 0;
  int64_t max_z = 0;
  int64_t surface_type = 0;
};

struct PickupRow {
  int64_t kind = 0;
  int64_t pos_x = 0;
  int64_t pos_y = 0;
  int64_t pos_z = 0;
  int64_t radius = 0;
  int64_t weapon_slot = 0;
  int64_t amount = 0;
  int64_t respawn_ticks = 0;
};

std::vector<ColliderRow> BuildColliderRows(const afps::sim::CollisionWorld &world) {
  std::vector<ColliderRow> rows;
  rows.reserve(world.colliders.size());
  for (const auto &collider : world.colliders) {
    rows.push_back({
        QuantizeCenti(collider.min_x),
        QuantizeCenti(collider.max_x),
        QuantizeCenti(collider.min_y),
        QuantizeCenti(collider.max_y),
        QuantizeCenti(collider.min_z),
        QuantizeCenti(collider.max_z),
        static_cast<int64_t>(collider.surface_type),
    });
  }
  std::sort(rows.begin(), rows.end(), [](const ColliderRow &a, const ColliderRow &b) {
    return std::tie(a.min_x, a.max_x, a.min_y, a.max_y, a.min_z, a.max_z, a.surface_type) <
           std::tie(b.min_x, b.max_x, b.min_y, b.max_y, b.min_z, b.max_z, b.surface_type);
  });
  return rows;
}

std::string ComputeColliderHash(const std::vector<ColliderRow> &rows) {
  std::ostringstream canonical;
  for (const auto &row : rows) {
    canonical << row.min_x << "," << row.max_x << "," << row.min_y << "," << row.max_y << ","
              << row.min_z << "," << row.max_z << "," << row.surface_type << ";";
  }
  const uint64_t hash = HashString(kFnvOffsetBasis, canonical.str());
  return HashToHex(hash);
}

std::vector<PickupRow> BuildPickupRows(const std::vector<afps::world::PickupSpawn> &pickups) {
  std::vector<PickupRow> rows;
  rows.reserve(pickups.size());
  for (const auto &pickup : pickups) {
    rows.push_back({
        static_cast<int64_t>(pickup.kind),
        QuantizeCenti(pickup.position.x),
        QuantizeCenti(pickup.position.y),
        QuantizeCenti(pickup.position.z),
        QuantizeCenti(pickup.radius),
        static_cast<int64_t>(pickup.weapon_slot),
        static_cast<int64_t>(pickup.amount),
        static_cast<int64_t>(pickup.respawn_ticks),
    });
  }
  std::sort(rows.begin(), rows.end(), [](const PickupRow &a, const PickupRow &b) {
    return std::tie(a.kind, a.pos_x, a.pos_y, a.pos_z, a.radius, a.weapon_slot, a.amount,
                    a.respawn_ticks) <
           std::tie(b.kind, b.pos_x, b.pos_y, b.pos_z, b.radius, b.weapon_slot, b.amount,
                    b.respawn_ticks);
  });
  return rows;
}

std::string ComputePickupHash(const std::vector<PickupRow> &rows) {
  std::ostringstream canonical;
  for (const auto &row : rows) {
    canonical << row.kind << "," << row.pos_x << "," << row.pos_y << "," << row.pos_z << ","
              << row.radius << "," << row.weapon_slot << "," << row.amount << ","
              << row.respawn_ticks << ";";
  }
  const uint64_t hash = HashString(kFnvOffsetBasis, canonical.str());
  return HashToHex(hash);
}

afps::world::MapWorldOptions BuildMapOptions(const ServerConfig &config) {
  afps::world::MapWorldOptions options;
  if (config.map_mode == "static") {
    options.mode = afps::world::MapWorldMode::Static;
    options.static_manifest_path = config.map_manifest_path;
  } else {
    options.mode = afps::world::MapWorldMode::Legacy;
    options.static_manifest_path.clear();
  }
  return options;
}

int DumpMapSignature(const ServerConfig &config) {
  const auto options = BuildMapOptions(config);
  const auto generated =
      afps::world::GenerateMapWorld(afps::sim::kDefaultSimConfig, config.map_seed,
                                    kMapSignatureTickRate, options);
  const auto collider_rows = BuildColliderRows(generated.collision_world);
  const auto pickup_rows = BuildPickupRows(generated.pickups);
  std::ostringstream out;
  out << "{\"seed\":" << generated.seed << ",\"mode\":\"" << config.map_mode
      << "\",\"colliderCount\":" << generated.collision_world.colliders.size()
      << ",\"pickupCount\":" << generated.pickups.size()
      << ",\"colliderHash\":\"" << ComputeColliderHash(collider_rows)
      << "\",\"pickupHash\":\"" << ComputePickupHash(pickup_rows) << "\""
      << ",\"colliderRows\":[";
  for (size_t i = 0; i < collider_rows.size(); ++i) {
    const auto &row = collider_rows[i];
    if (i > 0) {
      out << ",";
    }
    out << "[" << row.min_x << "," << row.max_x << "," << row.min_y << "," << row.max_y << ","
        << row.min_z << "," << row.max_z << "," << row.surface_type << "]";
  }
  out << "],\"pickupRows\":[";
  for (size_t i = 0; i < pickup_rows.size(); ++i) {
    const auto &row = pickup_rows[i];
    if (i > 0) {
      out << ",";
    }
    out << "[" << row.kind << "," << row.pos_x << "," << row.pos_y << "," << row.pos_z << ","
        << row.radius << "," << row.weapon_slot << "," << row.amount << "," << row.respawn_ticks
        << "]";
  }
  out << "]}";
  std::cout << out.str() << "\n";
  return 0;
}

bool IsValidRequestIdChar(char ch) {
  return std::isalnum(static_cast<unsigned char>(ch)) || ch == '-' || ch == '_';
}

std::string SanitizeRequestId(const std::string &value) {
  if (value.empty() || value.size() > kMaxRequestIdBytes) {
    return "";
  }
  for (char ch : value) {
    if (!IsValidRequestIdChar(ch)) {
      return "";
    }
  }
  return value;
}

std::string GenerateRequestId() {
  static thread_local std::mt19937 rng{std::random_device{}()};
  static constexpr char kHex[] = "0123456789abcdef";
  std::string out(16, '0');
  std::uniform_int_distribution<int> dist(0, 15);
  for (char &ch : out) {
    ch = kHex[dist(rng)];
  }
  return out;
}

std::string EscapeJson(const std::string &value) {
  std::string out;
  out.reserve(value.size() + 8);
  for (char ch : value) {
    switch (ch) {
      case '\\':
        out += "\\\\";
        break;
      case '"':
        out += "\\\"";
        break;
      case '\n':
        out += "\\n";
        break;
      case '\r':
        out += "\\r";
        break;
      case '\t':
        out += "\\t";
        break;
      default:
        if (static_cast<unsigned char>(ch) < 0x20) {
          out += '?';
        } else {
          out += ch;
        }
        break;
    }
  }
  return out;
}

void LogAuditEvent(const httplib::Request &req,
                   const httplib::Response &res,
                   const std::string &event,
                   const std::string &detail) {
  const std::string request_id = res.get_header_value(kRequestIdHeader);
  std::cout << "{\"ts\":\"" << EscapeJson(NowUtcTimestamp())
            << "\",\"event\":\"" << EscapeJson(event)
            << "\",\"request_id\":\"" << EscapeJson(request_id)
            << "\",\"remote\":\"" << EscapeJson(req.remote_addr) << "\"";
  if (!detail.empty()) {
    std::cout << ",\"detail\":\"" << EscapeJson(detail) << "\"";
  }
  std::cout << "}\n";
}

void ApplyCorsHeaders(const httplib::Request &req, httplib::Response &res) {
  if (res.has_header("Access-Control-Allow-Origin")) {
    return;
  }
  auto origin = req.get_header_value("Origin");
  if (origin.empty()) {
    origin = "*";
  }
  res.set_header("Access-Control-Allow-Origin", origin);
  res.set_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.set_header("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Request-Id");
  res.set_header("Access-Control-Expose-Headers", "X-Request-Id");
  res.set_header("Access-Control-Max-Age", "86400");
  res.set_header("Vary", "Origin");
}

bool EnsureBodySize(const httplib::Request &req, httplib::Response &res) {
  if (req.body.size() > kMaxPayloadBytes) {
    res.status = 413;
    res.set_content(kTooLargeJson, "application/json");
    return false;
  }
  return true;
}

void RespondJson(httplib::Response &res, const std::string &body, int status = 200) {
  res.status = status;
  res.set_content(body, "application/json");
}

#ifdef AFPS_ENABLE_WEBRTC
void RespondError(httplib::Response &res, int status, const std::string &code,
                  const std::string &message) {
  RespondJson(res, BuildErrorResponse(code, message), status);
}
#endif
}

int main(int argc, char **argv) {
  auto parse = ParseArgs(argc, argv);
  auto config_errors = ValidateConfig(parse.config);
  parse.errors.insert(parse.errors.end(), config_errors.begin(), config_errors.end());

  if (!parse.config.show_help && !parse.config.dump_map_signature && parse.config.use_https) {
    if (!parse.config.cert_path.empty() && !std::filesystem::exists(parse.config.cert_path)) {
      parse.errors.push_back("Certificate file not found: " + parse.config.cert_path);
    }
    if (!parse.config.key_path.empty() && !std::filesystem::exists(parse.config.key_path)) {
      parse.errors.push_back("Key file not found: " + parse.config.key_path);
    }
  }

  if (parse.config.show_help || !parse.errors.empty()) {
    for (const auto &error : parse.errors) {
      std::cerr << error << "\n";
    }
    std::cout << UsageText(argv[0]);
    return parse.errors.empty() ? 0 : 1;
  }

  if (parse.config.dump_map_signature) {
    return DumpMapSignature(parse.config);
  }

  RateLimiter limiter(40.0, 20.0);
  RateLimiter session_limiter(30.0, 15.0);
  RateLimiter connection_limiter(60.0, 30.0);
#ifdef AFPS_ENABLE_WEBRTC
  rtc::InitLogger(rtc::LogLevel::Warning);

  SignalingConfig signaling_config;
  signaling_config.ice_servers = parse.config.ice_servers;
  signaling_config.turn_secret = parse.config.turn_secret;
  signaling_config.turn_user = parse.config.turn_user;
  signaling_config.turn_ttl_seconds = parse.config.turn_ttl_seconds;
  signaling_config.snapshot_keyframe_interval = parse.config.snapshot_keyframe_interval;
  signaling_config.map_seed = parse.config.map_seed;
  std::filesystem::path manifest_path;
  if (!parse.config.character_manifest_path.empty()) {
    manifest_path = parse.config.character_manifest_path;
  } else {
    auto default_path = std::filesystem::current_path() /
                        "client/public/assets/characters/ultimate_modular_men/manifest.json";
    if (std::filesystem::exists(default_path)) {
      manifest_path = std::move(default_path);
    }
  }
  if (!manifest_path.empty()) {
    std::string manifest_error;
    signaling_config.allowed_character_ids =
        LoadCharacterManifestIds(manifest_path, manifest_error);
    if (!manifest_error.empty()) {
      std::cerr << "[warn] " << manifest_error << "\n";
      signaling_config.allowed_character_ids = {"default"};
    }
  }
  SignalingStore signaling_store(signaling_config);
  afps::world::MapWorldOptions map_options = BuildMapOptions(parse.config);
  TickLoop tick_loop(signaling_store, kServerTickRate,
                     parse.config.snapshot_keyframe_interval, parse.config.map_seed, map_options);
  tick_loop.Start();
#endif

  auto configure_server = [&](auto &server) {
    if (parse.config.use_https) {
      server.set_default_headers(BuildSecurityHeaders());
    }

    server.set_pre_routing_handler([&](const httplib::Request &req, httplib::Response &res) {
      const std::string incoming_id = SanitizeRequestId(req.get_header_value(kRequestIdHeader));
      const std::string request_id = incoming_id.empty() ? GenerateRequestId() : incoming_id;
      res.set_header(kRequestIdHeader, request_id);

      if (req.method == "OPTIONS") {
        ApplyCorsHeaders(req, res);
        res.status = 204;
        return httplib::Server::HandlerResponse::Handled;
      }

      const std::string key = req.remote_addr.empty() ? "unknown" : req.remote_addr;
      if (!limiter.AllowNow(key)) {
        res.status = 429;
        res.set_content(kRateLimitedJson, "application/json");
        return httplib::Server::HandlerResponse::Handled;
      }

      const auto content_length = req.get_header_value_u64("Content-Length");
      if (content_length > kMaxPayloadBytes) {
        res.status = 413;
        res.set_content(kTooLargeJson, "application/json");
        return httplib::Server::HandlerResponse::Handled;
      }

      return httplib::Server::HandlerResponse::Unhandled;
    });

    server.set_post_routing_handler([&](const httplib::Request &req, httplib::Response &res) {
      ApplyCorsHeaders(req, res);
    });

    server.set_error_handler([](const httplib::Request &, httplib::Response &res) {
      if (res.status == 404) {
        res.set_content(kNotFoundJson, "application/json");
      }
    });

    server.set_logger([](const httplib::Request &req, const httplib::Response &res) {
      const std::string request_id = res.get_header_value(kRequestIdHeader);
      std::cout << "{\"ts\":\"" << EscapeJson(NowUtcTimestamp())
                << "\",\"request_id\":\"" << EscapeJson(request_id)
                << "\",\"method\":\"" << EscapeJson(req.method)
                << "\",\"path\":\"" << EscapeJson(req.path)
                << "\",\"status\":" << res.status
                << ",\"remote\":\"" << EscapeJson(req.remote_addr) << "\"}\n";
    });

    server.Get("/health", [&](const httplib::Request &, httplib::Response &res) {
      HealthStatus status;
      status.status = "ok";
      status.build = "dev";
      status.utc_timestamp = NowUtcTimestamp();
      status.https = parse.config.use_https;
      res.set_content(BuildHealthJson(status), "application/json");
    });

#ifdef AFPS_ENABLE_WEBRTC
    server.Post("/session", [&](const httplib::Request &req, httplib::Response &res) {
      if (!EnsureBodySize(req, res)) {
        return;
      }
      const auto auth = ValidateBearerAuth(req.get_header_value("Authorization"),
                                           parse.config.auth_token);
      if (!auth.ok) {
        LogAuditEvent(req, res, "auth_failed", auth.code);
        RespondError(res, 401, auth.code, auth.message);
        return;
      }
      const auto session = signaling_store.CreateSession();
      LogAuditEvent(req, res, "session_issued", session.expires_at);
      RespondJson(res, BuildSessionResponse(session));
    });

    server.Post("/webrtc/connect", [&](const httplib::Request &req, httplib::Response &res) {
      if (!EnsureBodySize(req, res)) {
        return;
      }
      const auto parsed = ParseConnectRequest(req.body);
      if (!parsed.ok) {
        RespondError(res, 400, "invalid_request", parsed.error);
        return;
      }
      if (!session_limiter.AllowNow(parsed.request.session_token)) {
        res.status = 429;
        res.set_content(kRateLimitedJson, "application/json");
        return;
      }

      auto result = signaling_store.CreateConnection(parsed.request.session_token,
                                                      std::chrono::milliseconds(2000));
      if (!result.ok || !result.value.has_value()) {
        RespondError(res, 401, SignalingStore::ErrorCode(result.error),
                     "failed to create connection");
        return;
      }
      RespondJson(res, BuildConnectResponse(*result.value));
    });

    server.Post("/webrtc/answer", [&](const httplib::Request &req, httplib::Response &res) {
      if (!EnsureBodySize(req, res)) {
        return;
      }
      const auto parsed = ParseAnswerRequest(req.body);
      if (!parsed.ok) {
        RespondError(res, 400, "invalid_request", parsed.error);
        return;
      }
      if (!session_limiter.AllowNow(parsed.request.session_token) ||
          !connection_limiter.AllowNow(parsed.request.connection_id)) {
        res.status = 429;
        res.set_content(kRateLimitedJson, "application/json");
        return;
      }

      const auto error = signaling_store.ApplyAnswer(parsed.request.session_token,
                                                     parsed.request.connection_id,
                                                     parsed.request.sdp, parsed.request.type);
      if (error != SignalingError::None) {
        RespondError(res, 400, SignalingStore::ErrorCode(error), "answer rejected");
        return;
      }
      RespondJson(res, BuildOkResponse());
    });

    server.Post("/webrtc/candidate", [&](const httplib::Request &req, httplib::Response &res) {
      if (!EnsureBodySize(req, res)) {
        return;
      }
      const auto parsed = ParseCandidateRequest(req.body);
      if (!parsed.ok) {
        RespondError(res, 400, "invalid_request", parsed.error);
        return;
      }
      if (!session_limiter.AllowNow(parsed.request.session_token) ||
          !connection_limiter.AllowNow(parsed.request.connection_id)) {
        res.status = 429;
        res.set_content(kRateLimitedJson, "application/json");
        return;
      }
      const auto error = signaling_store.AddRemoteCandidate(parsed.request.session_token,
                                                            parsed.request.connection_id,
                                                            parsed.request.candidate,
                                                            parsed.request.mid);
      if (error != SignalingError::None) {
        RespondError(res, 400, SignalingStore::ErrorCode(error), "candidate rejected");
        return;
      }
      RespondJson(res, BuildOkResponse());
    });

    server.Get("/webrtc/candidates", [&](const httplib::Request &req, httplib::Response &res) {
      if (!req.has_param("sessionToken") || !req.has_param("connectionId")) {
        RespondError(res, 400, "invalid_request", "missing sessionToken or connectionId");
        return;
      }
      const auto session_token = req.get_param_value("sessionToken");
      const auto connection_id = req.get_param_value("connectionId");
      if (!session_limiter.AllowNow(session_token) || !connection_limiter.AllowNow(connection_id)) {
        res.status = 429;
        res.set_content(kRateLimitedJson, "application/json");
        return;
      }
      auto result = signaling_store.DrainLocalCandidates(session_token, connection_id);
      if (!result.ok || !result.value.has_value()) {
        RespondError(res, 400, SignalingStore::ErrorCode(result.error), "candidate drain failed");
        return;
      }
      RespondJson(res, BuildCandidatesResponse(*result.value));
    });
#endif
  };

  auto run_server = [&](auto &server) -> int {
    configure_server(server);
    const std::string scheme = parse.config.use_https ? "HTTPS" : "HTTP";
    std::cout << "Starting " << scheme << " server on " << parse.config.host << ":" << parse.config.port
              << "\n";

    if (!server.listen(parse.config.host.c_str(), parse.config.port)) {
      std::cerr << "Failed to bind to " << parse.config.host << ":" << parse.config.port << "\n";
#ifdef AFPS_ENABLE_WEBRTC
      tick_loop.Stop();
#endif
      return 1;
    }
    return 0;
  };

  int result = 0;
  if (parse.config.use_https) {
    httplib::SSLServer server(parse.config.cert_path.c_str(), parse.config.key_path.c_str());
    result = run_server(server);
  } else {
    httplib::Server server;
    result = run_server(server);
  }

#ifdef AFPS_ENABLE_WEBRTC
  tick_loop.Stop();
#endif

  return result;
}
