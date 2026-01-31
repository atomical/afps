#include "protocol.h"

#include <cmath>
#include <nlohmann/json.hpp>

namespace {
using nlohmann::json;

bool ParseJsonObject(const std::string &message, json &out, std::string &error) {
  try {
    out = json::parse(message);
  } catch (const json::exception &ex) {
    error = std::string("invalid_json: ") + ex.what();
    return false;
  }
  if (!out.is_object()) {
    error = "invalid_json_object";
    return false;
  }
  return true;
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

bool ReadInt(const json &payload, const char *key, int &out, std::string &error) {
  if (!payload.contains(key)) {
    error = std::string("missing_field: ") + key;
    return false;
  }
  if (!payload.at(key).is_number_integer()) {
    error = std::string("invalid_field: ") + key;
    return false;
  }
  out = payload.at(key).get<int>();
  return true;
}

bool ReadNumber(const json &payload, const char *key, double &out, std::string &error) {
  if (!payload.contains(key)) {
    error = std::string("missing_field: ") + key;
    return false;
  }
  if (!payload.at(key).is_number()) {
    error = std::string("invalid_field: ") + key;
    return false;
  }
  out = payload.at(key).get<double>();
  if (!std::isfinite(out)) {
    error = std::string("invalid_field: ") + key;
    return false;
  }
  return true;
}

bool ReadBool(const json &payload, const char *key, bool &out, std::string &error) {
  if (!payload.contains(key)) {
    error = std::string("missing_field: ") + key;
    return false;
  }
  if (!payload.at(key).is_boolean()) {
    error = std::string("invalid_field: ") + key;
    return false;
  }
  out = payload.at(key).get<bool>();
  return true;
}
}

bool ParseClientHello(const std::string &message, ClientHello &out, std::string &error) {
  json payload;
  if (!ParseJsonObject(message, payload, error)) {
    return false;
  }

  if (payload.contains("type")) {
    if (!payload.at("type").is_string()) {
      error = "invalid_field: type";
      return false;
    }
    if (payload.at("type").get<std::string>() != "ClientHello") {
      error = "invalid_type";
      return false;
    }
  }

  if (!ReadInt(payload, "protocolVersion", out.protocol_version, error)) {
    return false;
  }
  if (!ReadString(payload, "sessionToken", out.session_token, error)) {
    return false;
  }
  if (!ReadString(payload, "connectionId", out.connection_id, error)) {
    return false;
  }

  if (payload.contains("build")) {
    if (!payload.at("build").is_string()) {
      error = "invalid_field: build";
      return false;
    }
    out.build = payload.at("build").get<std::string>();
  }

  return true;
}

bool ParseInputCmd(const std::string &message, InputCmd &out, std::string &error) {
  json payload;
  if (!ParseJsonObject(message, payload, error)) {
    return false;
  }

  if (!payload.contains("type") || !payload.at("type").is_string() ||
      payload.at("type").get<std::string>() != "InputCmd") {
    error = "invalid_type";
    return false;
  }

  if (!ReadInt(payload, "inputSeq", out.input_seq, error)) {
    return false;
  }
  if (out.input_seq < 0) {
    error = "invalid_field: inputSeq";
    return false;
  }

  if (!ReadNumber(payload, "moveX", out.move_x, error)) {
    return false;
  }
  if (!ReadNumber(payload, "moveY", out.move_y, error)) {
    return false;
  }
  if (out.move_x < -1.0 || out.move_x > 1.0) {
    error = "out_of_range: moveX";
    return false;
  }
  if (out.move_y < -1.0 || out.move_y > 1.0) {
    error = "out_of_range: moveY";
    return false;
  }

  if (!ReadNumber(payload, "lookDeltaX", out.look_delta_x, error)) {
    return false;
  }
  if (!ReadNumber(payload, "lookDeltaY", out.look_delta_y, error)) {
    return false;
  }
  if (!ReadBool(payload, "jump", out.jump, error)) {
    return false;
  }
  if (!ReadBool(payload, "fire", out.fire, error)) {
    return false;
  }
  if (!ReadBool(payload, "sprint", out.sprint, error)) {
    return false;
  }

  return true;
}

bool ParsePing(const std::string &message, Ping &out, std::string &error) {
  json payload;
  if (!ParseJsonObject(message, payload, error)) {
    return false;
  }

  if (!payload.contains("type") || !payload.at("type").is_string() ||
      payload.at("type").get<std::string>() != "Ping") {
    error = "invalid_type";
    return false;
  }

  if (!ReadNumber(payload, "clientTimeMs", out.client_time_ms, error)) {
    return false;
  }
  if (out.client_time_ms < 0.0) {
    error = "invalid_field: clientTimeMs";
    return false;
  }

  return true;
}

std::string BuildServerHello(const ServerHello &hello) {
  json payload;
  payload["type"] = "ServerHello";
  payload["protocolVersion"] = hello.protocol_version;
  payload["connectionId"] = hello.connection_id;
  if (!hello.client_id.empty()) {
    payload["clientId"] = hello.client_id;
  }
  payload["serverTickRate"] = hello.server_tick_rate;
  payload["snapshotRate"] = hello.snapshot_rate;
  if (!hello.motd.empty()) {
    payload["motd"] = hello.motd;
  }
  if (!hello.connection_nonce.empty()) {
    payload["connectionNonce"] = hello.connection_nonce;
  }
  return payload.dump();
}

std::string BuildProtocolError(const std::string &code, const std::string &message) {
  json payload;
  payload["type"] = "Error";
  payload["code"] = code;
  payload["message"] = message;
  return payload.dump();
}

std::string BuildPong(const Pong &pong) {
  json payload;
  payload["type"] = "Pong";
  payload["clientTimeMs"] = pong.client_time_ms;
  return payload.dump();
}

std::string BuildStateSnapshot(const StateSnapshot &snapshot) {
  json payload;
  payload["type"] = "StateSnapshot";
  payload["serverTick"] = snapshot.server_tick;
  payload["lastProcessedInputSeq"] = snapshot.last_processed_input_seq;
  if (!snapshot.client_id.empty()) {
    payload["clientId"] = snapshot.client_id;
  }
  payload["posX"] = snapshot.pos_x;
  payload["posY"] = snapshot.pos_y;
  return payload.dump();
}
