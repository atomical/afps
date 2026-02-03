#pragma once

#include <chrono>
#include <condition_variable>
#include <memory>
#include <mutex>
#include <optional>
#include <random>
#include <string>
#include <unordered_map>
#include <unordered_set>
#include <vector>

#include "protocol.h"
#include "rate_limiter.h"
#include "rtc_echo.h"

struct SessionInfo {
  std::string token;
  std::string expires_at;
  std::chrono::system_clock::time_point expires_at_time;
};

struct IceCandidate {
  std::string candidate;
  std::string mid;
};

struct IceServerConfig {
  std::string url;
  std::string username;
  std::string credential;
};

struct ConnectionOffer {
  std::string connection_id;
  rtc::Description offer;
  std::vector<IceServerConfig> ice_servers;
  std::string expires_at;
};

struct InputBatch {
  std::string connection_id;
  std::vector<InputCmd> inputs;
};

enum class SignalingError {
  None,
  SessionNotFound,
  SessionExpired,
  ConnectionNotFound,
  OfferTimeout,
  InvalidRequest
};

struct SignalingConfig {
  std::chrono::seconds session_ttl = std::chrono::seconds(900);
  std::vector<std::string> ice_servers;
  std::string turn_secret;
  std::string turn_user = "afps";
  int turn_ttl_seconds = 3600;
  double input_max_tokens = 120.0;
  double input_refill_per_second = 120.0;
  int max_invalid_inputs = 5;
  int max_rate_limit_drops = 20;
  int snapshot_keyframe_interval = kSnapshotKeyframeInterval;
  std::vector<std::string> allowed_character_ids;
};

template <typename T>
struct SignalingResult {
  bool ok = false;
  std::optional<T> value;
  SignalingError error = SignalingError::None;
};

class SignalingStore {
public:
  explicit SignalingStore(SignalingConfig config);

  SessionInfo CreateSession();
  SignalingResult<ConnectionOffer> CreateConnection(const std::string &session_token,
                                                    std::chrono::milliseconds wait);
  SignalingError ApplyAnswer(const std::string &session_token, const std::string &connection_id,
                             const std::string &sdp, const std::string &type);
  SignalingError AddRemoteCandidate(const std::string &session_token, const std::string &connection_id,
                                    const std::string &candidate, const std::string &mid);
  SignalingResult<std::vector<IceCandidate>> DrainLocalCandidates(const std::string &session_token,
                                                                  const std::string &connection_id);
  SignalingResult<std::vector<InputCmd>> DrainInputs(const std::string &session_token,
                                                     const std::string &connection_id);
  std::vector<InputBatch> DrainAllInputs();
  std::vector<std::string> ReadyConnectionIds();
  bool SendUnreliable(const std::string &connection_id, const std::vector<uint8_t> &message);
  uint32_t NextServerMessageSeq(const std::string &connection_id);
  uint32_t LastClientMessageSeq(const std::string &connection_id);

  size_t SessionCount() const;
  size_t ConnectionCount() const;
  static const char *ErrorCode(SignalingError error);

private:
  struct Session {
    std::string token;
    std::chrono::system_clock::time_point expires_at;
  };

  struct ConnectionState {
    std::string id;
    std::string session;
    std::shared_ptr<RtcEchoPeer> peer;
    std::vector<IceCandidate> local_candidates;
    std::optional<rtc::Description> local_description;
    bool channel_open = false;
    bool handshake_complete = false;
    int handshake_attempts = 0;
    std::string client_build;
    std::string nickname;
    std::string character_id;
    std::string connection_nonce;
    std::vector<InputCmd> pending_inputs;
    int last_input_seq = -1;
    uint32_t last_client_msg_seq = 0;
    uint32_t last_client_seq_ack = 0;
    uint32_t next_server_msg_seq = 0;
    int invalid_input_count = 0;
    int rate_limit_count = 0;
    bool closed = false;
    std::mutex mutex;
    std::condition_variable cv;
  };

  bool IsSessionValidLocked(const std::string &session_token, SignalingError &error) const;
  void PruneExpiredSessionsLocked();
  std::string GenerateToken(size_t bytes);
  static std::string FormatUtc(std::chrono::system_clock::time_point time_point);
  rtc::Configuration BuildRtcConfig(const std::vector<IceServerConfig> &ice_servers) const;
  std::vector<IceServerConfig> BuildIceServers(std::chrono::system_clock::time_point now) const;
  void HandleClientMessage(const std::shared_ptr<ConnectionState> &connection,
                           const std::string &label, const rtc::binary &message);

  SignalingConfig config_;
  RateLimiter input_limiter_;
  mutable std::mutex mutex_;
  std::unordered_map<std::string, Session> sessions_;
  std::unordered_map<std::string, std::shared_ptr<ConnectionState>> connections_;
  std::unordered_set<std::string> allowed_character_ids_;
  std::mt19937 rng_;
};
