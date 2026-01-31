#include "auth.h"
#include "config.h"
#include "health.h"
#include "rate_limiter.h"
#include "tick.h"
#include "usage.h"

#include "httplib.h"

#ifdef AFPS_ENABLE_WEBRTC
#include "protocol.h"
#include "signaling.h"
#include "signaling_json.h"
#include <rtc/rtc.hpp>
#endif

#include <filesystem>
#include <iostream>
#include <string>
#include <vector>

namespace {
constexpr size_t kMaxPayloadBytes = 32 * 1024;
const char *kTooLargeJson = "{\"error\":\"payload_too_large\"}";
const char *kRateLimitedJson = "{\"error\":\"rate_limited\"}";
const char *kNotFoundJson = "{\"error\":\"not_found\"}";

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

  if (!parse.config.show_help) {
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

  RateLimiter limiter(40.0, 20.0);
#ifdef AFPS_ENABLE_WEBRTC
  rtc::InitLogger(rtc::LogLevel::Warning);

  SignalingConfig signaling_config;
  signaling_config.ice_servers = parse.config.ice_servers;
  SignalingStore signaling_store(signaling_config);
  TickLoop tick_loop(signaling_store, kServerTickRate);
  tick_loop.Start();
#endif

  httplib::SSLServer server(parse.config.cert_path.c_str(), parse.config.key_path.c_str());

  server.set_pre_routing_handler([&](const httplib::Request &req, httplib::Response &res) {
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

  server.set_error_handler([](const httplib::Request &, httplib::Response &res) {
    if (res.status == 404) {
      res.set_content(kNotFoundJson, "application/json");
    }
  });

  server.Get("/health", [](const httplib::Request &, httplib::Response &res) {
    HealthStatus status;
    status.status = "ok";
    status.build = "dev";
    status.utc_timestamp = NowUtcTimestamp();
    status.https = true;
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
      RespondError(res, 401, auth.code, auth.message);
      return;
    }
    const auto session = signaling_store.CreateSession();
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
    auto result = signaling_store.DrainLocalCandidates(session_token, connection_id);
    if (!result.ok || !result.value.has_value()) {
      RespondError(res, 400, SignalingStore::ErrorCode(result.error), "candidate drain failed");
      return;
    }
    RespondJson(res, BuildCandidatesResponse(*result.value));
  });
#endif

  std::cout << "Starting HTTPS server on " << parse.config.host << ":" << parse.config.port
            << "\n";

  if (!server.listen(parse.config.host.c_str(), parse.config.port)) {
    std::cerr << "Failed to bind to " << parse.config.host << ":" << parse.config.port << "\n";
#ifdef AFPS_ENABLE_WEBRTC
    tick_loop.Stop();
#endif
    return 1;
  }

#ifdef AFPS_ENABLE_WEBRTC
  tick_loop.Stop();
#endif

  return 0;
}
