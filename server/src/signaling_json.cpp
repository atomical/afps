#include "signaling_json.h"

#include <nlohmann/json.hpp>

namespace {
using nlohmann::json;

JsonParseResult ParseJson(const std::string &body, json &out) {
  try {
    out = json::parse(body);
  } catch (const json::exception &ex) {
    return {false, std::string("invalid_json: ") + ex.what()};
  }
  if (!out.is_object()) {
    return {false, "invalid_json_object"};
  }
  return {true, {}};
}

bool ReadString(const json &payload, const char *key, std::string &out, std::string &error) {
  if (!payload.contains(key)) {
    error = std::string("missing_field: ") + key;
    return false;
  }
  if (!payload.at(key).is_string()) {
    error = std::string("invalid_field: ") + key;
    return false;
  }
  out = payload.at(key).get<std::string>();
  if (out.empty()) {
    error = std::string("empty_field: ") + key;
    return false;
  }
  return true;
}

json IceServersJson(const std::vector<IceServerConfig> &servers) {
  json ice_servers = json::array();
  for (const auto &server : servers) {
    json entry;
    entry["urls"] = json::array({server.url});
    if (!server.username.empty()) {
      entry["username"] = server.username;
    }
    if (!server.credential.empty()) {
      entry["credential"] = server.credential;
      entry["credentialType"] = "password";
    }
    ice_servers.push_back(entry);
  }
  return ice_servers;
}
}

JsonParseConnectResult ParseConnectRequest(const std::string &body) {
  json payload;
  auto parsed = ParseJson(body, payload);
  if (!parsed.ok) {
    return {false, parsed.error, {}};
  }

  ConnectRequest request;
  std::string error;
  if (!ReadString(payload, "sessionToken", request.session_token, error)) {
    return {false, error, {}};
  }

  return {true, {}, request};
}

JsonParseAnswerResult ParseAnswerRequest(const std::string &body) {
  json payload;
  auto parsed = ParseJson(body, payload);
  if (!parsed.ok) {
    return {false, parsed.error, {}};
  }

  AnswerRequest request;
  std::string error;
  if (!ReadString(payload, "sessionToken", request.session_token, error)) {
    return {false, error, {}};
  }
  if (!ReadString(payload, "connectionId", request.connection_id, error)) {
    return {false, error, {}};
  }

  const json *answer = &payload;
  if (payload.contains("answer")) {
    if (!payload.at("answer").is_object()) {
      return {false, "invalid_field: answer", {}};
    }
    answer = &payload.at("answer");
  }

  if (!ReadString(*answer, "sdp", request.sdp, error)) {
    return {false, error, {}};
  }
  if (!ReadString(*answer, "type", request.type, error)) {
    return {false, error, {}};
  }

  return {true, {}, request};
}

JsonParseCandidateResult ParseCandidateRequest(const std::string &body) {
  json payload;
  auto parsed = ParseJson(body, payload);
  if (!parsed.ok) {
    return {false, parsed.error, {}};
  }

  CandidateRequest request;
  std::string error;
  if (!ReadString(payload, "sessionToken", request.session_token, error)) {
    return {false, error, {}};
  }
  if (!ReadString(payload, "connectionId", request.connection_id, error)) {
    return {false, error, {}};
  }
  if (!ReadString(payload, "candidate", request.candidate, error)) {
    return {false, error, {}};
  }

  if (payload.contains("mid") && payload.at("mid").is_string()) {
    request.mid = payload.at("mid").get<std::string>();
  } else if (payload.contains("sdpMid") && payload.at("sdpMid").is_string()) {
    request.mid = payload.at("sdpMid").get<std::string>();
  }

  return {true, {}, request};
}

std::string BuildSessionResponse(const SessionInfo &session) {
  nlohmann::json payload;
  payload["sessionToken"] = session.token;
  payload["expiresAt"] = session.expires_at;
  return payload.dump();
}

std::string BuildConnectResponse(const ConnectionOffer &offer) {
  nlohmann::json payload;
  payload["connectionId"] = offer.connection_id;
  payload["offer"] = {
      {"type", offer.offer.typeString()},
      {"sdp", offer.offer.generateSdp()}
  };
  payload["iceServers"] = IceServersJson(offer.ice_servers);
  payload["expiresAt"] = offer.expires_at;
  return payload.dump();
}

std::string BuildCandidatesResponse(const std::vector<IceCandidate> &candidates) {
  nlohmann::json payload;
  payload["candidates"] = nlohmann::json::array();
  for (const auto &candidate : candidates) {
    nlohmann::json entry;
    entry["candidate"] = candidate.candidate;
    entry["sdpMid"] = candidate.mid;
    payload["candidates"].push_back(entry);
  }
  return payload.dump();
}

std::string BuildOkResponse() {
  nlohmann::json payload;
  payload["status"] = "ok";
  return payload.dump();
}

std::string BuildErrorResponse(const std::string &code, const std::string &message) {
  nlohmann::json payload;
  payload["error"] = code;
  payload["message"] = message;
  return payload.dump();
}
