#include "signaling.h"

#include "protocol.h"

#include <algorithm>
#include <cctype>
#include <cstddef>
#include <iomanip>
#include <iostream>
#include <sstream>

#ifdef AFPS_ENABLE_OPENSSL
#include <openssl/evp.h>
#include <openssl/hmac.h>
#endif

namespace {
constexpr int kMaxClientHelloAttempts = 3;
constexpr size_t kMaxPendingInputs = 128;
constexpr size_t kMaxPendingFireRequests = 128;

std::string TrimWhitespace(const std::string &value) {
  const auto start = value.find_first_not_of(" \t\r\n");
  if (start == std::string::npos) {
    return "";
  }
  const auto end = value.find_last_not_of(" \t\r\n");
  return value.substr(start, end - start + 1);
}

bool IsNicknameChar(char ch) {
  const unsigned char uch = static_cast<unsigned char>(ch);
  return std::isalnum(uch) || ch == '_' || ch == '-' || ch == ' ';
}

std::string DefaultNickname(const std::string &seed) {
  unsigned int hash = 0;
  for (unsigned char ch : seed) {
    hash = (hash * 131u) + ch;
  }
  const int suffix = static_cast<int>(hash % 10000u);
  std::ostringstream output;
  output << "Player" << std::setw(4) << std::setfill('0') << suffix;
  return output.str();
}

std::string NormalizeNickname(const std::string &value, const std::string &seed) {
  const std::string trimmed = TrimWhitespace(value);
  if (trimmed.size() < 3 || trimmed.size() > 16) {
    return DefaultNickname(seed);
  }
  for (char ch : trimmed) {
    if (!IsNicknameChar(ch)) {
      return DefaultNickname(seed);
    }
  }
  return trimmed;
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

std::string RedactToken(const std::string &token) {
  if (token.empty()) {
    return "";
  }
  const size_t keep = std::min<size_t>(8, token.size());
  return token.substr(0, keep);
}

struct TurnCredentials {
  std::string username;
  std::string credential;
};

bool IsTurnUrl(const std::string &url) {
  return url.rfind("turn:", 0) == 0 || url.rfind("turns:", 0) == 0;
}

rtc::binary ToRtcBinary(const std::vector<uint8_t> &message) {
  rtc::binary out;
  out.reserve(message.size());
  for (uint8_t byte : message) {
    out.push_back(static_cast<std::byte>(byte));
  }
  return out;
}

std::vector<uint8_t> ToByteVector(const rtc::binary &message) {
  std::vector<uint8_t> out;
  out.reserve(message.size());
  for (std::byte byte : message) {
    out.push_back(static_cast<uint8_t>(byte));
  }
  return out;
}

#ifdef AFPS_ENABLE_OPENSSL
std::string Base64Encode(const unsigned char *data, size_t length) {
  if (!data || length == 0) {
    return "";
  }
  const int output_length = 4 * static_cast<int>((length + 2) / 3);
  std::string output(static_cast<size_t>(output_length), '\0');
  const int written = EVP_EncodeBlock(reinterpret_cast<unsigned char *>(&output[0]), data,
                                      static_cast<int>(length));
  if (written <= 0) {
    return "";
  }
  output.resize(static_cast<size_t>(written));
  return output;
}

std::optional<TurnCredentials> BuildTurnCredentials(const SignalingConfig &config,
                                                    std::chrono::system_clock::time_point now) {
  if (config.turn_secret.empty() || config.turn_ttl_seconds <= 0) {
    return std::nullopt;
  }
  const auto now_seconds = std::chrono::duration_cast<std::chrono::seconds>(now.time_since_epoch()).count();
  const auto expiry = now_seconds + static_cast<long long>(config.turn_ttl_seconds);
  std::string username = std::to_string(expiry);
  const std::string suffix = TrimWhitespace(config.turn_user);
  if (!suffix.empty()) {
    username += ":" + suffix;
  }
  unsigned char digest[EVP_MAX_MD_SIZE];
  unsigned int digest_len = 0;
  const auto *secret_bytes = reinterpret_cast<const unsigned char *>(config.turn_secret.data());
  const auto *user_bytes = reinterpret_cast<const unsigned char *>(username.data());
  if (!HMAC(EVP_sha1(), secret_bytes, static_cast<int>(config.turn_secret.size()),
            user_bytes, static_cast<int>(username.size()),
            digest, &digest_len)) {
    return std::nullopt;
  }
  const std::string credential = Base64Encode(digest, digest_len);
  if (credential.empty()) {
    return std::nullopt;
  }
  return TurnCredentials{username, credential};
}
#else
std::optional<TurnCredentials> BuildTurnCredentials(const SignalingConfig &,
                                                    std::chrono::system_clock::time_point) {
  return std::nullopt;
}
#endif

void LogAudit(const std::string &timestamp,
              const std::string &event,
              const std::string &connection_id,
              const std::string &session,
              const std::string &detail) {
  std::cout << "{\"ts\":\"" << EscapeJson(timestamp)
            << "\",\"event\":\"" << EscapeJson(event) << "\"";
  if (!connection_id.empty()) {
    std::cout << ",\"connection_id\":\"" << EscapeJson(connection_id) << "\"";
  }
  if (!session.empty()) {
    std::cout << ",\"session\":\"" << EscapeJson(RedactToken(session)) << "\"";
  }
  if (!detail.empty()) {
    std::cout << ",\"detail\":\"" << EscapeJson(detail) << "\"";
  }
  std::cout << "}\n";
}

bool IsCharacterIdChar(char ch) {
  const unsigned char uch = static_cast<unsigned char>(ch);
  return std::isalnum(uch) || ch == '_' || ch == '-';
}

std::unordered_set<std::string> BuildAllowedCharacterIds(const std::vector<std::string> &ids) {
  std::unordered_set<std::string> allowed;
  for (const auto &entry : ids) {
    const std::string trimmed = TrimWhitespace(entry);
    if (trimmed.empty() || trimmed.size() > 32) {
      continue;
    }
    bool valid = true;
    for (char ch : trimmed) {
      if (!IsCharacterIdChar(ch)) {
        valid = false;
        break;
      }
    }
    if (valid) {
      allowed.insert(trimmed);
    }
  }
  if (!allowed.empty() || !ids.empty()) {
    allowed.insert("default");
  }
  return allowed;
}

std::string NormalizeCharacterId(const std::string &value,
                                 const std::unordered_set<std::string> &allowed_ids) {
  const std::string trimmed = TrimWhitespace(value);
  if (trimmed.empty() || trimmed.size() > 32) {
    return "default";
  }
  for (char ch : trimmed) {
    if (!IsCharacterIdChar(ch)) {
      return "default";
    }
  }
  if (!allowed_ids.empty() && allowed_ids.find(trimmed) == allowed_ids.end()) {
    return "default";
  }
  return trimmed;
}
}

SignalingStore::SignalingStore(SignalingConfig config)
    : config_(std::move(config)),
      input_limiter_(config_.input_max_tokens, config_.input_refill_per_second),
      rng_(std::random_device{}()) {
  allowed_character_ids_ = BuildAllowedCharacterIds(config_.allowed_character_ids);
}

SessionInfo SignalingStore::CreateSession() {
  const auto now = std::chrono::system_clock::now();
  const auto expires_at = now + config_.session_ttl;

  Session session;
  session.token = GenerateToken(16);
  session.expires_at = expires_at;

  {
    std::scoped_lock lock(mutex_);
    PruneExpiredSessionsLocked();
    sessions_[session.token] = session;
  }

  SessionInfo info;
  info.token = session.token;
  info.expires_at_time = expires_at;
  info.expires_at = FormatUtc(expires_at);
  LogAudit(FormatUtc(now), "session_created", "", session.token, info.expires_at);
  return info;
}

SignalingResult<ConnectionOffer> SignalingStore::CreateConnection(const std::string &session_token,
                                                                  std::chrono::milliseconds wait) {
  std::shared_ptr<ConnectionState> connection;
  std::chrono::system_clock::time_point expires_at;
  {
    std::scoped_lock lock(mutex_);
    PruneExpiredSessionsLocked();
    SignalingError error = SignalingError::None;
    if (!IsSessionValidLocked(session_token, error)) {
      return {false, std::nullopt, error};
    }

    auto session_iter = sessions_.find(session_token);
    expires_at = session_iter->second.expires_at;

    connection = std::make_shared<ConnectionState>();
    connection->id = GenerateToken(12);
    connection->session = session_token;
    connections_[connection->id] = connection;
  }

  connection->connection_nonce = GenerateToken(8);

  const auto now = std::chrono::system_clock::now();
  auto ice_servers = BuildIceServers(now);
  auto rtc_config = BuildRtcConfig(ice_servers);
  connection->peer = std::make_shared<RtcEchoPeer>(rtc_config, false);
  LogAudit(FormatUtc(std::chrono::system_clock::now()), "connection_created",
           connection->id, session_token, "");
  connection->peer->SetCallbacks({
      [connection](const rtc::Description &description) {
        std::scoped_lock lock(connection->mutex);
        connection->local_description = description;
        connection->cv.notify_all();
      },
      [connection](const rtc::Candidate &candidate) {
        std::scoped_lock lock(connection->mutex);
        IceCandidate ice;
        ice.candidate = candidate.candidate();
        ice.mid = candidate.mid();
        connection->local_candidates.push_back(std::move(ice));
      },
      [connection]() {
        std::scoped_lock lock(connection->mutex);
        connection->channel_open = true;
      },
      // Mark the connection as closed when any data channel closes. Avoid touching the
      // SignalingStore from this callback because it can fire during teardown.
      [connection]() {
        std::scoped_lock lock(connection->mutex);
        connection->closed = true;
      },
      nullptr,
      [this, connection](const std::string &label, const rtc::binary &message) {
        HandleClientMessage(connection, label, message);
      }});

  connection->peer->CreateDataChannel(kReliableChannelLabel);
  rtc::DataChannelInit unreliable_init;
  unreliable_init.reliability.unordered = true;
  unreliable_init.reliability.maxRetransmits = 0;
  connection->peer->CreateDataChannel(kUnreliableChannelLabel, unreliable_init);
  connection->peer->SetLocalDescription();

  std::optional<rtc::Description> description;
  {
    std::unique_lock lock(connection->mutex);
    const bool ready = connection->cv.wait_for(lock, wait, [&connection] {
      return connection->local_description.has_value();
    });
    if (!ready) {
      std::scoped_lock store_lock(mutex_);
      connections_.erase(connection->id);
      return {false, std::nullopt, SignalingError::OfferTimeout};
    }
    description = connection->local_description;
  }

  ConnectionOffer offer{connection->id, *description, std::move(ice_servers), FormatUtc(expires_at)};
  return {true, offer, SignalingError::None};
}

SignalingError SignalingStore::ApplyAnswer(const std::string &session_token,
                                          const std::string &connection_id,
                                          const std::string &sdp, const std::string &type) {
  std::shared_ptr<ConnectionState> connection;
  {
    std::scoped_lock lock(mutex_);
    PruneExpiredSessionsLocked();
    SignalingError error = SignalingError::None;
    if (!IsSessionValidLocked(session_token, error)) {
      return error;
    }

    auto iter = connections_.find(connection_id);
    if (iter == connections_.end()) {
      return SignalingError::ConnectionNotFound;
    }
    connection = iter->second;
  }

  rtc::Description description(sdp, type);
  connection->peer->SetRemoteDescription(description);
  return SignalingError::None;
}

SignalingError SignalingStore::AddRemoteCandidate(const std::string &session_token,
                                                  const std::string &connection_id,
                                                  const std::string &candidate,
                                                  const std::string &mid) {
  std::shared_ptr<ConnectionState> connection;
  {
    std::scoped_lock lock(mutex_);
    PruneExpiredSessionsLocked();
    SignalingError error = SignalingError::None;
    if (!IsSessionValidLocked(session_token, error)) {
      return error;
    }

    auto iter = connections_.find(connection_id);
    if (iter == connections_.end()) {
      return SignalingError::ConnectionNotFound;
    }
    connection = iter->second;
  }

  if (mid.empty()) {
    connection->peer->AddRemoteCandidate(rtc::Candidate(candidate));
  } else {
    connection->peer->AddRemoteCandidate(rtc::Candidate(candidate, mid));
  }
  return SignalingError::None;
}

SignalingResult<std::vector<IceCandidate>> SignalingStore::DrainLocalCandidates(
    const std::string &session_token, const std::string &connection_id) {
  std::shared_ptr<ConnectionState> connection;
  {
    std::scoped_lock lock(mutex_);
    PruneExpiredSessionsLocked();
    SignalingError error = SignalingError::None;
    if (!IsSessionValidLocked(session_token, error)) {
      return {false, std::nullopt, error};
    }

    auto iter = connections_.find(connection_id);
    if (iter == connections_.end()) {
      return {false, std::nullopt, SignalingError::ConnectionNotFound};
    }
    connection = iter->second;
  }

  std::vector<IceCandidate> drained;
  {
    std::scoped_lock lock(connection->mutex);
    drained.swap(connection->local_candidates);
  }

  return {true, drained, SignalingError::None};
}

SignalingResult<std::vector<InputCmd>> SignalingStore::DrainInputs(
    const std::string &session_token, const std::string &connection_id) {
  std::shared_ptr<ConnectionState> connection;
  {
    std::scoped_lock lock(mutex_);
    PruneExpiredSessionsLocked();
    SignalingError error = SignalingError::None;
    if (!IsSessionValidLocked(session_token, error)) {
      return {false, std::nullopt, error};
    }

    auto iter = connections_.find(connection_id);
    if (iter == connections_.end()) {
      return {false, std::nullopt, SignalingError::ConnectionNotFound};
    }
    connection = iter->second;
  }

  std::vector<InputCmd> drained;
  {
    std::scoped_lock lock(connection->mutex);
    drained.swap(connection->pending_inputs);
  }

  return {true, drained, SignalingError::None};
}

std::vector<InputBatch> SignalingStore::DrainAllInputs() {
  std::vector<std::shared_ptr<ConnectionState>> connections;
  {
    std::scoped_lock lock(mutex_);
    PruneExpiredSessionsLocked();
    connections.reserve(connections_.size());
    for (const auto &entry : connections_) {
      connections.push_back(entry.second);
    }
  }

  std::vector<InputBatch> batches;
  for (const auto &connection : connections) {
    InputBatch batch;
    {
      std::scoped_lock lock(connection->mutex);
      if (connection->pending_inputs.empty()) {
        continue;
      }
      batch.connection_id = connection->id;
      batch.inputs.swap(connection->pending_inputs);
    }
    batches.push_back(std::move(batch));
  }

  return batches;
}

std::vector<FireRequestBatch> SignalingStore::DrainAllFireRequests() {
  std::vector<std::shared_ptr<ConnectionState>> connections;
  {
    std::scoped_lock lock(mutex_);
    PruneExpiredSessionsLocked();
    connections.reserve(connections_.size());
    for (const auto &entry : connections_) {
      connections.push_back(entry.second);
    }
  }

  std::vector<FireRequestBatch> batches;
  for (const auto &connection : connections) {
    FireRequestBatch batch;
    {
      std::scoped_lock lock(connection->mutex);
      if (connection->pending_fire_requests.empty()) {
        continue;
      }
      batch.connection_id = connection->id;
      batch.requests.swap(connection->pending_fire_requests);
    }
    batches.push_back(std::move(batch));
  }

  return batches;
}

std::vector<std::string> SignalingStore::ReadyConnectionIds() {
  std::vector<std::shared_ptr<ConnectionState>> connections;
  {
    std::scoped_lock lock(mutex_);
    PruneExpiredSessionsLocked();
    connections.reserve(connections_.size());
    for (const auto &entry : connections_) {
      connections.push_back(entry.second);
    }
  }

  std::vector<std::string> ready;
  for (const auto &connection : connections) {
    std::scoped_lock lock(connection->mutex);
    if (connection->handshake_complete && !connection->closed) {
      ready.push_back(connection->id);
    }
  }

  return ready;
}

bool SignalingStore::SendUnreliable(const std::string &connection_id, const std::vector<uint8_t> &message) {
  std::shared_ptr<ConnectionState> connection;
  {
    std::scoped_lock lock(mutex_);
    auto iter = connections_.find(connection_id);
    if (iter == connections_.end()) {
      return false;
    }
    connection = iter->second;
  }

  {
    std::scoped_lock lock(connection->mutex);
    if (!connection->handshake_complete || connection->closed) {
      return false;
    }
  }

  return connection->peer->SendOn(kUnreliableChannelLabel, ToRtcBinary(message));
}

uint32_t SignalingStore::NextServerMessageSeq(const std::string &connection_id) {
  std::shared_ptr<ConnectionState> connection;
  {
    std::scoped_lock lock(mutex_);
    auto iter = connections_.find(connection_id);
    if (iter == connections_.end()) {
      return 0;
    }
    connection = iter->second;
  }
  std::scoped_lock lock(connection->mutex);
  connection->next_server_msg_seq += 1;
  return connection->next_server_msg_seq;
}

uint32_t SignalingStore::LastClientMessageSeq(const std::string &connection_id) {
  std::shared_ptr<ConnectionState> connection;
  {
    std::scoped_lock lock(mutex_);
    auto iter = connections_.find(connection_id);
    if (iter == connections_.end()) {
      return 0;
    }
    connection = iter->second;
  }
  std::scoped_lock lock(connection->mutex);
  return connection->last_client_msg_seq;
}

size_t SignalingStore::SessionCount() const {
  std::scoped_lock lock(mutex_);
  return sessions_.size();
}

size_t SignalingStore::ConnectionCount() const {
  std::scoped_lock lock(mutex_);
  return connections_.size();
}

const char *SignalingStore::ErrorCode(SignalingError error) {
  switch (error) {
    case SignalingError::None:
      return "none";
    case SignalingError::SessionNotFound:
      return "session_not_found";
    case SignalingError::SessionExpired:
      return "session_expired";
    case SignalingError::ConnectionNotFound:
      return "connection_not_found";
    case SignalingError::OfferTimeout:
      return "offer_timeout";
    case SignalingError::InvalidRequest:
      return "invalid_request";
  }
  return "unknown";
}

bool SignalingStore::IsSessionValidLocked(const std::string &session_token,
                                          SignalingError &error) const {
  auto iter = sessions_.find(session_token);
  if (iter == sessions_.end()) {
    error = SignalingError::SessionNotFound;
    return false;
  }

  const auto now = std::chrono::system_clock::now();
  if (now >= iter->second.expires_at) {
    error = SignalingError::SessionExpired;
    return false;
  }

  error = SignalingError::None;
  return true;
}

void SignalingStore::PruneExpiredSessionsLocked() {
  const auto now = std::chrono::system_clock::now();
  std::vector<std::string> expired_tokens;
  expired_tokens.reserve(sessions_.size());

  for (const auto &entry : sessions_) {
    if (now >= entry.second.expires_at) {
      expired_tokens.push_back(entry.first);
    }
  }

  if (expired_tokens.empty()) {
    return;
  }

  for (const auto &token : expired_tokens) {
    sessions_.erase(token);
  }

  for (auto iter = connections_.begin(); iter != connections_.end();) {
    const bool expired = std::find(expired_tokens.begin(), expired_tokens.end(),
                                   iter->second->session) != expired_tokens.end();
    bool closed = false;
    {
      std::scoped_lock lock(iter->second->mutex);
      closed = iter->second->closed;
    }
    if (expired || closed) {
      iter = connections_.erase(iter);
    } else {
      ++iter;
    }
  }
}

std::string SignalingStore::GenerateToken(size_t bytes) {
  std::uniform_int_distribution<int> dist(0, 255);
  std::ostringstream out;
  out << std::hex << std::setfill('0');
  for (size_t i = 0; i < bytes; ++i) {
    out << std::setw(2) << dist(rng_);
  }
  return out.str();
}

std::string SignalingStore::FormatUtc(std::chrono::system_clock::time_point time_point) {
  const auto time = std::chrono::system_clock::to_time_t(time_point);
  std::tm utc_tm{};
#if defined(_WIN32)
  gmtime_s(&utc_tm, &time);
#else
  gmtime_r(&time, &utc_tm);
#endif
  std::ostringstream out;
  out << std::put_time(&utc_tm, "%Y-%m-%dT%H:%M:%SZ");
  return out.str();
}

rtc::Configuration SignalingStore::BuildRtcConfig(const std::vector<IceServerConfig> &ice_servers) const {
  rtc::Configuration config;
  config.iceServers.clear();
  for (const auto &entry : ice_servers) {
    rtc::IceServer server(entry.url);
    if (!entry.username.empty() || !entry.credential.empty()) {
      server.username = entry.username;
      server.password = entry.credential;
    }
    config.iceServers.emplace_back(std::move(server));
  }
  return config;
}

std::vector<IceServerConfig> SignalingStore::BuildIceServers(
    std::chrono::system_clock::time_point now) const {
  std::vector<IceServerConfig> ice_servers;
  ice_servers.reserve(config_.ice_servers.size());
  const auto turn_credentials = BuildTurnCredentials(config_, now);
  for (const auto &url : config_.ice_servers) {
    IceServerConfig entry{url, {}, {}};
    if (turn_credentials.has_value() && IsTurnUrl(url)) {
      entry.username = turn_credentials->username;
      entry.credential = turn_credentials->credential;
    }
    ice_servers.push_back(std::move(entry));
  }
  return ice_servers;
}

void SignalingStore::HandleClientMessage(const std::shared_ptr<ConnectionState> &connection,
                                         const std::string &label, const rtc::binary &message) {
  const auto message_bytes = ToByteVector(message);
  auto log_event = [&connection, this](const std::string &event, const std::string &detail) {
    LogAudit(FormatUtc(std::chrono::system_clock::now()),
             event,
             connection->id,
             connection->session,
             detail);
  };

  auto close_connection = [&connection, &log_event, this](const std::string &reason) {
    bool do_close = false;
    {
      std::scoped_lock lock(connection->mutex);
      if (!connection->closed) {
        connection->closed = true;
        do_close = true;
      }
    }
    if (do_close) {
      log_event("connection_closed", reason);
      connection->peer->Close();
      std::scoped_lock lock(mutex_);
      connections_.erase(connection->id);
    }
  };

  auto record_invalid = [&connection, &close_connection, &log_event, this](const std::string &reason) {
    bool should_close = false;
    {
      std::scoped_lock lock(connection->mutex);
      connection->invalid_input_count += 1;
      if (connection->invalid_input_count >= config_.max_invalid_inputs) {
        should_close = true;
      }
    }
    log_event("invalid_message", reason);
    if (should_close) {
      close_connection("invalid_message_limit");
    }
  };

  auto record_rate_limit = [&connection, &close_connection, &log_event, this](const std::string &reason) {
    bool should_close = false;
    {
      std::scoped_lock lock(connection->mutex);
      connection->rate_limit_count += 1;
      if (connection->rate_limit_count >= config_.max_rate_limit_drops) {
        should_close = true;
      }
    }
    log_event("rate_limited", reason);
    if (should_close) {
      close_connection("rate_limit_exceeded");
    }
  };

  if (label == kReliableChannelLabel) {
    auto register_attempt = [&connection]() {
      std::scoped_lock lock(connection->mutex);
      if (connection->handshake_complete) {
        return false;
      }
      if (connection->handshake_attempts >= kMaxClientHelloAttempts) {
        return false;
      }
      connection->handshake_attempts += 1;
      return true;
    };

    if (!register_attempt()) {
      log_event("handshake_rejected", "attempts_exceeded");
      return;
    }

    if (message_bytes.size() > kMaxClientMessageBytes) {
      log_event("handshake_error", "message_too_large");
      const auto seq = NextServerMessageSeq(connection->id);
      const auto ack = LastClientMessageSeq(connection->id);
      connection->peer->Send(ToRtcBinary(BuildProtocolError("message_too_large",
                                                            "client message exceeds size limit",
                                                            seq, ack)));
      return;
    }

    DecodedEnvelope envelope;
    std::string envelope_error;
    if (!DecodeEnvelope(message_bytes, envelope, envelope_error)) {
      log_event("handshake_error", "invalid_envelope");
      const auto seq = NextServerMessageSeq(connection->id);
      const auto ack = LastClientMessageSeq(connection->id);
      connection->peer->Send(ToRtcBinary(BuildProtocolError("invalid_envelope",
                                                            envelope_error,
                                                            seq, ack)));
      return;
    }

    bool valid_seq = false;
    {
      std::scoped_lock lock(connection->mutex);
      if (envelope.header.msg_seq > connection->last_client_msg_seq) {
        connection->last_client_msg_seq = envelope.header.msg_seq;
        connection->last_client_seq_ack = envelope.header.server_seq_ack;
        valid_seq = true;
      }
    }
    if (!valid_seq) {
      log_event("handshake_error", "invalid_sequence");
      const auto seq = NextServerMessageSeq(connection->id);
      const auto ack = LastClientMessageSeq(connection->id);
      connection->peer->Send(ToRtcBinary(BuildProtocolError("invalid_sequence",
                                                            "non-monotonic msgSeq",
                                                            seq, ack)));
      return;
    }

    if (envelope.header.msg_type != MessageType::ClientHello) {
      log_event("handshake_error", "invalid_type");
      const auto seq = NextServerMessageSeq(connection->id);
      const auto ack = LastClientMessageSeq(connection->id);
      connection->peer->Send(ToRtcBinary(BuildProtocolError("invalid_type",
                                                            "expected ClientHello",
                                                            seq, ack)));
      return;
    }

    if (envelope.header.protocol_version != kProtocolVersion) {
      log_event("handshake_error", "protocol_mismatch");
      const auto seq = NextServerMessageSeq(connection->id);
      const auto ack = LastClientMessageSeq(connection->id);
      connection->peer->Send(ToRtcBinary(BuildProtocolError("protocol_mismatch",
                                                            "unsupported protocol",
                                                            seq, ack)));
      return;
    }

    ClientHello hello;
    std::string error;
    if (!ParseClientHelloPayload(envelope.payload, hello, error)) {
      log_event("handshake_error", "invalid_client_hello");
      const auto seq = NextServerMessageSeq(connection->id);
      const auto ack = LastClientMessageSeq(connection->id);
      connection->peer->Send(ToRtcBinary(BuildProtocolError("invalid_client_hello",
                                                            error,
                                                            seq, ack)));
      return;
    }

    if (hello.protocol_version != kProtocolVersion) {
      log_event("handshake_error", "protocol_mismatch");
      const auto seq = NextServerMessageSeq(connection->id);
      const auto ack = LastClientMessageSeq(connection->id);
      connection->peer->Send(ToRtcBinary(BuildProtocolError("protocol_mismatch",
                                                            "unsupported protocol",
                                                            seq, ack)));
      return;
    }

    if (hello.session_token != connection->session) {
      log_event("handshake_error", "session_mismatch");
      const auto seq = NextServerMessageSeq(connection->id);
      const auto ack = LastClientMessageSeq(connection->id);
      connection->peer->Send(ToRtcBinary(BuildProtocolError("invalid_session",
                                                            "session token mismatch",
                                                            seq, ack)));
      return;
    }

    if (hello.connection_id != connection->id) {
      log_event("handshake_error", "connection_mismatch");
      const auto seq = NextServerMessageSeq(connection->id);
      const auto ack = LastClientMessageSeq(connection->id);
      connection->peer->Send(ToRtcBinary(BuildProtocolError("invalid_connection",
                                                            "connection id mismatch",
                                                            seq, ack)));
      return;
    }

    const std::string nickname = NormalizeNickname(hello.nickname, connection->id);
    const std::string character_id =
        NormalizeCharacterId(hello.character_id, allowed_character_ids_);

    {
      std::scoped_lock lock(connection->mutex);
      if (connection->closed) {
        return;
      }
      connection->handshake_complete = true;
      connection->client_build = hello.build;
      connection->nickname = nickname;
      connection->character_id = character_id;
    }
    log_event("handshake_complete", hello.build);

    ServerHello response;
    response.protocol_version = kProtocolVersion;
    response.connection_id = connection->id;
    response.client_id = connection->id;
    response.server_tick_rate = kServerTickRate;
    response.snapshot_rate = kSnapshotRate;
    response.snapshot_keyframe_interval = config_.snapshot_keyframe_interval;
    response.connection_nonce = connection->connection_nonce;
    {
      const auto seq = NextServerMessageSeq(connection->id);
      const auto ack = LastClientMessageSeq(connection->id);
      connection->peer->Send(ToRtcBinary(BuildServerHello(response, seq, ack)));
    }

    PlayerProfile self_profile;
    self_profile.client_id = connection->id;
    self_profile.nickname = nickname;
    self_profile.character_id = character_id;

    struct ProfileTarget {
      std::shared_ptr<ConnectionState> connection;
      PlayerProfile profile;
    };
    std::vector<ProfileTarget> profiles;
    {
      std::vector<std::shared_ptr<ConnectionState>> connections;
      {
        std::scoped_lock lock(mutex_);
        connections.reserve(connections_.size());
        for (const auto &entry : connections_) {
          connections.push_back(entry.second);
        }
      }
      for (const auto &peer : connections) {
        std::scoped_lock lock(peer->mutex);
        if (peer->closed || !peer->handshake_complete || !peer->channel_open) {
          continue;
        }
        PlayerProfile profile;
        profile.client_id = peer->id;
        profile.nickname = peer->nickname;
        profile.character_id = peer->character_id;
        profiles.push_back({peer, profile});
      }
    }

    for (const auto &entry : profiles) {
      if (entry.profile.client_id == connection->id) {
        continue;
      }
      connection->peer->SendOn(
          kReliableChannelLabel,
          ToRtcBinary(BuildPlayerProfile(entry.profile,
                                         NextServerMessageSeq(connection->id),
                                         LastClientMessageSeq(connection->id))));
    }
    for (const auto &entry : profiles) {
      if (entry.profile.client_id == connection->id) {
        continue;
      }
      entry.connection->peer->SendOn(
          kReliableChannelLabel,
          ToRtcBinary(BuildPlayerProfile(self_profile,
                                         NextServerMessageSeq(entry.connection->id),
                                         LastClientMessageSeq(entry.connection->id))));
    }
    connection->peer->SendOn(
        kReliableChannelLabel,
        ToRtcBinary(BuildPlayerProfile(self_profile,
                                       NextServerMessageSeq(connection->id),
                                       LastClientMessageSeq(connection->id))));
    return;
  }

  if (label != kUnreliableChannelLabel) {
    return;
  }

  bool handshake_complete = false;
  bool closed = false;
  {
    std::scoped_lock lock(connection->mutex);
    handshake_complete = connection->handshake_complete;
    closed = connection->closed;
  }

  if (!handshake_complete) {
    record_invalid("unreliable_before_handshake");
    return;
  }
  if (closed) {
    return;
  }

  if (message_bytes.size() > kMaxClientMessageBytes) {
    record_invalid("message_too_large");
    return;
  }

  DecodedEnvelope envelope;
  std::string envelope_error;
  if (!DecodeEnvelope(message_bytes, envelope, envelope_error)) {
    record_invalid("invalid_envelope");
    return;
  }

  bool valid_seq = false;
  {
    std::scoped_lock lock(connection->mutex);
    if (envelope.header.msg_seq > connection->last_client_msg_seq) {
      connection->last_client_msg_seq = envelope.header.msg_seq;
      connection->last_client_seq_ack = envelope.header.server_seq_ack;
      valid_seq = true;
    }
  }
  if (!valid_seq) {
    record_invalid("invalid_sequence");
    return;
  }

  if (envelope.header.protocol_version != kProtocolVersion) {
    record_invalid("protocol_mismatch");
    return;
  }

  if (!input_limiter_.AllowNow(connection->id)) {
    record_rate_limit("input_rate_limit");
    return;
  }

  if (envelope.header.msg_type == MessageType::Ping) {
    Ping ping;
    std::string ping_error;
    if (!ParsePingPayload(envelope.payload, ping, ping_error)) {
      record_invalid("invalid_ping_payload");
      return;
    }
    Pong pong;
    pong.client_time_ms = ping.client_time_ms;
    const auto seq = NextServerMessageSeq(connection->id);
    const auto ack = LastClientMessageSeq(connection->id);
    connection->peer->SendOn(kUnreliableChannelLabel, ToRtcBinary(BuildPong(pong, seq, ack)));
    return;
  }

  if (envelope.header.msg_type == MessageType::FireWeaponRequest) {
    FireWeaponRequest request;
    std::string error;
    if (!ParseFireWeaponRequestPayload(envelope.payload, request, error)) {
      record_invalid("invalid_fire_weapon_request");
      return;
    }
    {
      std::scoped_lock lock(connection->mutex);
      if (connection->pending_fire_requests.size() >= kMaxPendingFireRequests) {
        connection->pending_fire_requests.erase(connection->pending_fire_requests.begin());
      }
      connection->pending_fire_requests.push_back(std::move(request));
    }
    return;
  }

  if (envelope.header.msg_type != MessageType::InputCmd) {
    record_invalid("unexpected_type");
    return;
  }

  InputCmd cmd;
  std::string error;
  if (!ParseInputCmdPayload(envelope.payload, cmd, error)) {
    record_invalid("invalid_input_cmd");
    return;
  }

  bool invalid_seq = false;
  {
    std::scoped_lock lock(connection->mutex);
    if (cmd.input_seq <= connection->last_input_seq) {
      invalid_seq = true;
    } else {
      connection->last_input_seq = cmd.input_seq;
      if (connection->pending_inputs.size() >= kMaxPendingInputs) {
        connection->pending_inputs.erase(connection->pending_inputs.begin());
      }
      connection->pending_inputs.push_back(cmd);
    }
  }

  if (invalid_seq) {
    record_invalid("non_monotonic_input_seq");
  }
}
