#include "doctest.h"

#include "signaling.h"

#include <algorithm>
#include <chrono>
#include <condition_variable>
#include <cstddef>
#include <mutex>
#include <thread>
#include <flatbuffers/flatbuffers.h>

#include "afps_protocol_generated.h"

namespace {
std::vector<uint8_t> BuildClientHelloBinary(const std::string &session_token,
                                            const std::string &connection_id,
                                            const std::string &nickname = {},
                                            const std::string &character_id = {}) {
  flatbuffers::FlatBufferBuilder builder(256);
  const auto session = builder.CreateString(session_token);
  const auto connection = builder.CreateString(connection_id);
  const auto build = builder.CreateString("test");
  const auto nickname_offset = nickname.empty() ? 0 : builder.CreateString(nickname);
  const auto character_offset = character_id.empty() ? 0 : builder.CreateString(character_id);
  const auto offset = afps::protocol::CreateClientHello(builder, kProtocolVersion, session, connection, build,
                                                        nickname_offset, character_offset);
  builder.Finish(offset);
  return EncodeEnvelope(MessageType::ClientHello, builder.GetBufferPointer(), builder.GetSize(), 1, 0);
}

std::vector<uint8_t> BuildInputCmdBinary(int input_seq, uint32_t msg_seq = 2, uint32_t ack = 0) {
  flatbuffers::FlatBufferBuilder builder(256);
  const auto offset = afps::protocol::CreateInputCmd(
      builder,
      input_seq,
      1.0,
      0.0,
      0.0,
      0.0,
      0.0,
      0.0,
      0,
      false,
      true,
      false,
      false,
      false,
      false,
      false);
  builder.Finish(offset);
  return EncodeEnvelope(MessageType::InputCmd, builder.GetBufferPointer(), builder.GetSize(), msg_seq, ack);
}

std::vector<uint8_t> BuildPingBinary(double client_time_ms, uint32_t msg_seq = 4, uint32_t ack = 0) {
  flatbuffers::FlatBufferBuilder builder(64);
  const auto offset = afps::protocol::CreatePing(builder, client_time_ms);
  builder.Finish(offset);
  return EncodeEnvelope(MessageType::Ping, builder.GetBufferPointer(), builder.GetSize(), msg_seq, ack);
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
}  // namespace
TEST_CASE("SignalingStore creates sessions and connections") {
  SignalingConfig config;
  config.session_ttl = std::chrono::seconds(30);
  SignalingStore store(config);

  const auto session = store.CreateSession();
  CHECK(!session.token.empty());
  CHECK(store.SessionCount() == 1);

  auto result = store.CreateConnection(session.token, std::chrono::milliseconds(2000));
  CHECK(result.ok);
  REQUIRE(result.value.has_value());
  CHECK(!result.value->connection_id.empty());
  CHECK(result.value->offer.typeString() == "offer");
  CHECK(store.ConnectionCount() == 1);
}

#ifdef AFPS_ENABLE_OPENSSL
TEST_CASE("SignalingStore attaches TURN REST credentials") {
  SignalingConfig config;
  config.ice_servers = {"stun:stun.example.com:3478", "turn:turn.example.com:3478"};
  config.turn_secret = "turnsecret";
  config.turn_user = "afps";
  config.turn_ttl_seconds = 600;
  SignalingStore store(config);

  const auto session = store.CreateSession();
  auto result = store.CreateConnection(session.token, std::chrono::milliseconds(2000));
  REQUIRE(result.ok);
  REQUIRE(result.value.has_value());

  const auto &servers = result.value->ice_servers;
  REQUIRE(servers.size() == 2);
  CHECK(servers[0].username.empty());
  CHECK(servers[0].credential.empty());
  CHECK(servers[1].username.find("afps") != std::string::npos);
  CHECK_FALSE(servers[1].credential.empty());
}
#endif

TEST_CASE("SignalingStore rejects invalid sessions") {
  SignalingConfig config;
  SignalingStore store(config);

  auto result = store.CreateConnection("missing", std::chrono::milliseconds(50));
  CHECK_FALSE(result.ok);
  CHECK(result.error == SignalingError::SessionNotFound);
}

TEST_CASE("SignalingStore handles answer and candidate flow") {
  SignalingConfig config;
  SignalingStore store(config);

  const auto session = store.CreateSession();
  auto connect = store.CreateConnection(session.token, std::chrono::milliseconds(2000));
  REQUIRE(connect.ok);
  REQUIRE(connect.value.has_value());

  rtc::Configuration rtc_config;
  rtc_config.iceServers.clear();
  RtcEchoPeer remote(rtc_config, false);

  std::mutex mutex;
  std::condition_variable cv;
  std::optional<rtc::Description> answer;

  remote.SetCallbacks({
      [&](const rtc::Description &description) {
        std::scoped_lock lock(mutex);
        answer = description;
        cv.notify_all();
      },
      nullptr,
      nullptr,
      nullptr,
      nullptr,
      nullptr});

  remote.SetRemoteDescription(connect.value->offer);
  remote.SetLocalDescription();

  {
    std::unique_lock lock(mutex);
    cv.wait_for(lock, std::chrono::seconds(2), [&] { return answer.has_value(); });
  }

  REQUIRE(answer.has_value());

  const auto answer_error = store.ApplyAnswer(session.token, connect.value->connection_id,
                                              std::string(*answer), answer->typeString());
  CHECK(answer_error == SignalingError::None);

  const std::string candidate =
      "candidate:0 1 UDP 2122252543 192.0.2.1 54400 typ host";
  const auto candidate_error = store.AddRemoteCandidate(session.token, connect.value->connection_id,
                                                        candidate, "0");
  CHECK(candidate_error == SignalingError::None);

  auto drained = store.DrainLocalCandidates(session.token, connect.value->connection_id);
  CHECK(drained.ok);
  CHECK(drained.value.has_value());
}

TEST_CASE("SignalingStore treats non-actionable remote candidates as no-op") {
  SignalingConfig config;
  SignalingStore store(config);

  const auto session = store.CreateSession();
  auto connect = store.CreateConnection(session.token, std::chrono::milliseconds(2000));
  REQUIRE(connect.ok);
  REQUIRE(connect.value.has_value());

  const auto candidate_error = store.AddRemoteCandidate(session.token, connect.value->connection_id, "", "0");
  CHECK(candidate_error == SignalingError::None);

  const auto malformed_error =
      store.AddRemoteCandidate(session.token, connect.value->connection_id, "not-a-valid-candidate", "0");
  CHECK(malformed_error == SignalingError::None);
}

TEST_CASE("SignalingStore expires sessions") {
  SignalingConfig config;
  config.session_ttl = std::chrono::seconds(0);
  SignalingStore store(config);

  const auto session = store.CreateSession();
  auto result = store.CreateConnection(session.token, std::chrono::milliseconds(10));
  CHECK_FALSE(result.ok);
  CHECK((result.error == SignalingError::SessionExpired ||
         result.error == SignalingError::SessionNotFound));
}

TEST_CASE("SignalingStore queues input commands after handshake") {
  rtc::InitLogger(rtc::LogLevel::None);

  SignalingConfig config;
  config.snapshot_keyframe_interval = 7;
  config.map_seed = 777u;
  SignalingStore store(config);

  const auto session = store.CreateSession();
  auto connect = store.CreateConnection(session.token, std::chrono::milliseconds(2000));
  REQUIRE(connect.ok);
  REQUIRE(connect.value.has_value());

  rtc::Configuration rtc_config;
  rtc_config.iceServers.clear();
  RtcEchoPeer remote(rtc_config, false);

  std::mutex mutex;
  std::condition_variable cv;
  std::optional<rtc::Description> answer;
  bool server_hello = false;
  std::vector<uint8_t> server_hello_payload;
  bool input_sent = false;
  bool hello_sent = false;

  remote.SetCallbacks({
      [&](const rtc::Description &description) {
        std::scoped_lock lock(mutex);
        answer = description;
        cv.notify_all();
      },
      [&](const rtc::Candidate &candidate) {
        store.AddRemoteCandidate(session.token, connect.value->connection_id, candidate.candidate(),
                                 candidate.mid());
      },
      nullptr,
      nullptr,
      nullptr,
      [&](const std::string &label, const rtc::binary &message) {
        if (label != kReliableChannelLabel) {
          return;
        }
        const auto message_bytes = ToByteVector(message);
        DecodedEnvelope envelope;
        std::string error;
        if (!DecodeEnvelope(message_bytes, envelope, error)) {
          return;
        }
        if (envelope.header.msg_type != MessageType::ServerHello) {
          return;
        }
        std::scoped_lock lock(mutex);
        server_hello = true;
        server_hello_payload.assign(message_bytes.begin(), message_bytes.end());
        cv.notify_all();
      }});

  remote.SetRemoteDescription(connect.value->offer);
  remote.SetLocalDescription();

  {
    std::unique_lock lock(mutex);
    cv.wait_for(lock, std::chrono::seconds(2), [&] { return answer.has_value(); });
  }

  REQUIRE(answer.has_value());

  const auto answer_error = store.ApplyAnswer(session.token, connect.value->connection_id,
                                              std::string(*answer), answer->typeString());
  CHECK(answer_error == SignalingError::None);

  const auto hello = BuildClientHelloBinary(session.token, connect.value->connection_id);
  const auto input = BuildInputCmdBinary(1);

  const auto deadline = std::chrono::steady_clock::now() + std::chrono::seconds(3);
  while (std::chrono::steady_clock::now() < deadline && !input_sent) {
    auto candidates = store.DrainLocalCandidates(session.token, connect.value->connection_id);
    if (candidates.ok && candidates.value.has_value()) {
      for (const auto &candidate : *candidates.value) {
        if (candidate.mid.empty()) {
          remote.AddRemoteCandidate(rtc::Candidate(candidate.candidate));
        } else {
          remote.AddRemoteCandidate(rtc::Candidate(candidate.candidate, candidate.mid));
        }
      }
    }

    if (!hello_sent) {
      hello_sent = remote.SendOn(kReliableChannelLabel, ToRtcBinary(hello));
    }

    if (server_hello && !input_sent) {
      input_sent = remote.SendOn(kUnreliableChannelLabel, ToRtcBinary(input));
    }

    std::this_thread::sleep_for(std::chrono::milliseconds(10));
  }

  CHECK(input_sent);
  REQUIRE(!server_hello_payload.empty());
  DecodedEnvelope envelope;
  std::string error;
  REQUIRE(DecodeEnvelope(server_hello_payload, envelope, error));
  CHECK(envelope.header.msg_type == MessageType::ServerHello);
  const auto *parsed = flatbuffers::GetRoot<afps::protocol::ServerHello>(envelope.payload.data());
  CHECK(parsed->snapshot_keyframe_interval() == config.snapshot_keyframe_interval);
  CHECK(static_cast<uint32_t>(parsed->map_seed()) == config.map_seed);

  auto batches = store.DrainAllInputs();
  REQUIRE(batches.size() == 1);
  CHECK(batches[0].connection_id == connect.value->connection_id);
  REQUIRE(batches[0].inputs.size() == 1);
  CHECK(batches[0].inputs[0].input_seq == 1);
  CHECK(batches[0].inputs[0].fire);

  auto drained = store.DrainInputs(session.token, connect.value->connection_id);
  CHECK(drained.ok);
  REQUIRE(drained.value.has_value());
  CHECK(drained.value->empty());
}

TEST_CASE("SignalingStore normalizes character ids in PlayerProfile") {
  rtc::InitLogger(rtc::LogLevel::None);

  SignalingConfig config;
  SignalingStore store(config);

  const auto session = store.CreateSession();
  auto connect = store.CreateConnection(session.token, std::chrono::milliseconds(2000));
  REQUIRE(connect.ok);
  REQUIRE(connect.value.has_value());

  rtc::Configuration rtc_config;
  rtc_config.iceServers.clear();
  RtcEchoPeer remote(rtc_config, false);

  std::mutex mutex;
  std::condition_variable cv;
  std::optional<rtc::Description> answer;
  std::optional<std::string> character_id;
  bool hello_sent = false;

  remote.SetCallbacks({
      [&](const rtc::Description &description) {
        std::scoped_lock lock(mutex);
        answer = description;
        cv.notify_all();
      },
      [&](const rtc::Candidate &candidate) {
        store.AddRemoteCandidate(session.token, connect.value->connection_id, candidate.candidate(),
                                 candidate.mid());
      },
      nullptr,
      nullptr,
      nullptr,
      [&](const std::string &label, const rtc::binary &message) {
        if (label != kReliableChannelLabel) {
          return;
        }
        const auto message_bytes = ToByteVector(message);
        DecodedEnvelope envelope;
        std::string error;
        if (!DecodeEnvelope(message_bytes, envelope, error)) {
          return;
        }
        if (envelope.header.msg_type != MessageType::PlayerProfile) {
          return;
        }
        const auto *parsed = flatbuffers::GetRoot<afps::protocol::PlayerProfile>(envelope.payload.data());
        if (!parsed->character_id()) {
          return;
        }
        std::scoped_lock lock(mutex);
        character_id = parsed->character_id()->str();
        cv.notify_all();
      }});

  remote.SetRemoteDescription(connect.value->offer);
  remote.SetLocalDescription();

  {
    std::unique_lock lock(mutex);
    cv.wait_for(lock, std::chrono::seconds(2), [&] { return answer.has_value(); });
  }

  REQUIRE(answer.has_value());

  const auto answer_error = store.ApplyAnswer(session.token, connect.value->connection_id,
                                              std::string(*answer), answer->typeString());
  CHECK(answer_error == SignalingError::None);

  const auto hello = BuildClientHelloBinary(session.token, connect.value->connection_id, "Ada", "bad id!");

  const auto deadline = std::chrono::steady_clock::now() + std::chrono::seconds(3);
  while (std::chrono::steady_clock::now() < deadline && !character_id.has_value()) {
    auto candidates = store.DrainLocalCandidates(session.token, connect.value->connection_id);
    if (candidates.ok && candidates.value.has_value()) {
      for (const auto &candidate : *candidates.value) {
        if (candidate.mid.empty()) {
          remote.AddRemoteCandidate(rtc::Candidate(candidate.candidate));
        } else {
          remote.AddRemoteCandidate(rtc::Candidate(candidate.candidate, candidate.mid));
        }
      }
    }

    if (!hello_sent) {
      hello_sent = remote.SendOn(kReliableChannelLabel, ToRtcBinary(hello));
    }

    std::this_thread::sleep_for(std::chrono::milliseconds(10));
  }

  REQUIRE(character_id.has_value());
  CHECK(character_id == "default");
}

TEST_CASE("SignalingStore enforces character allowlist") {
  rtc::InitLogger(rtc::LogLevel::None);

  SignalingConfig config;
  config.allowed_character_ids = {"casual-a"};
  SignalingStore store(config);

  const auto session = store.CreateSession();
  auto connect = store.CreateConnection(session.token, std::chrono::milliseconds(2000));
  REQUIRE(connect.ok);
  REQUIRE(connect.value.has_value());

  rtc::Configuration rtc_config;
  rtc_config.iceServers.clear();
  RtcEchoPeer remote(rtc_config, false);

  std::mutex mutex;
  std::condition_variable cv;
  std::optional<rtc::Description> answer;
  std::optional<std::string> character_id;
  bool hello_sent = false;

  remote.SetCallbacks({
      [&](const rtc::Description &description) {
        std::scoped_lock lock(mutex);
        answer = description;
        cv.notify_all();
      },
      [&](const rtc::Candidate &candidate) {
        store.AddRemoteCandidate(session.token, connect.value->connection_id, candidate.candidate(),
                                 candidate.mid());
      },
      nullptr,
      nullptr,
      nullptr,
      [&](const std::string &label, const rtc::binary &message) {
        if (label != kReliableChannelLabel) {
          return;
        }
        const auto message_bytes = ToByteVector(message);
        DecodedEnvelope envelope;
        std::string error;
        if (!DecodeEnvelope(message_bytes, envelope, error)) {
          return;
        }
        if (envelope.header.msg_type != MessageType::PlayerProfile) {
          return;
        }
        const auto *parsed = flatbuffers::GetRoot<afps::protocol::PlayerProfile>(envelope.payload.data());
        if (!parsed->character_id()) {
          return;
        }
        std::scoped_lock lock(mutex);
        character_id = parsed->character_id()->str();
        cv.notify_all();
      }});

  remote.SetRemoteDescription(connect.value->offer);
  remote.SetLocalDescription();

  {
    std::unique_lock lock(mutex);
    cv.wait_for(lock, std::chrono::seconds(2), [&] { return answer.has_value(); });
  }

  REQUIRE(answer.has_value());

  const auto answer_error = store.ApplyAnswer(session.token, connect.value->connection_id,
                                              std::string(*answer), answer->typeString());
  CHECK(answer_error == SignalingError::None);

  const auto hello = BuildClientHelloBinary(session.token, connect.value->connection_id, "Ada", "casual-b");

  const auto deadline = std::chrono::steady_clock::now() + std::chrono::seconds(3);
  while (std::chrono::steady_clock::now() < deadline && !character_id.has_value()) {
    auto candidates = store.DrainLocalCandidates(session.token, connect.value->connection_id);
    if (candidates.ok && candidates.value.has_value()) {
      for (const auto &candidate : *candidates.value) {
        if (candidate.mid.empty()) {
          remote.AddRemoteCandidate(rtc::Candidate(candidate.candidate));
        } else {
          remote.AddRemoteCandidate(rtc::Candidate(candidate.candidate, candidate.mid));
        }
      }
    }

    if (!hello_sent) {
      hello_sent = remote.SendOn(kReliableChannelLabel, ToRtcBinary(hello));
    }

    std::this_thread::sleep_for(std::chrono::milliseconds(10));
  }

  REQUIRE(character_id.has_value());
  CHECK(character_id == "default");
}

TEST_CASE("SignalingStore exposes ready connections and sends unreliable messages") {
  rtc::InitLogger(rtc::LogLevel::None);

  SignalingConfig config;
  SignalingStore store(config);

  const auto session = store.CreateSession();
  auto connect = store.CreateConnection(session.token, std::chrono::milliseconds(2000));
  REQUIRE(connect.ok);
  REQUIRE(connect.value.has_value());

  CHECK(store.ReadyConnectionIds().empty());
  Pong pong_payload;
  pong_payload.client_time_ms = 0.0;
  CHECK_FALSE(store.SendUnreliable(connect.value->connection_id, BuildPong(pong_payload, 1, 0)));

  rtc::Configuration rtc_config;
  rtc_config.iceServers.clear();
  RtcEchoPeer remote(rtc_config, false);

  std::mutex mutex;
  std::condition_variable cv;
  std::optional<rtc::Description> answer;
  bool server_hello = false;
  bool received = false;

  remote.SetCallbacks({
      [&](const rtc::Description &description) {
        std::scoped_lock lock(mutex);
        answer = description;
        cv.notify_all();
      },
      [&](const rtc::Candidate &candidate) {
        store.AddRemoteCandidate(session.token, connect.value->connection_id, candidate.candidate(),
                                 candidate.mid());
      },
      nullptr,
      nullptr,
      nullptr,
      [&](const std::string &label, const rtc::binary &message) {
        const auto message_bytes = ToByteVector(message);
        DecodedEnvelope envelope;
        std::string error;
        if (!DecodeEnvelope(message_bytes, envelope, error)) {
          return;
        }
        if (label == kReliableChannelLabel && envelope.header.msg_type == MessageType::ServerHello) {
          std::scoped_lock lock(mutex);
          server_hello = true;
          cv.notify_all();
          return;
        }
        if (label == kUnreliableChannelLabel && envelope.header.msg_type == MessageType::Pong) {
          std::scoped_lock lock(mutex);
          received = true;
          cv.notify_all();
        }
      }});

  remote.SetRemoteDescription(connect.value->offer);
  remote.SetLocalDescription();

  {
    std::unique_lock lock(mutex);
    cv.wait_for(lock, std::chrono::seconds(2), [&] { return answer.has_value(); });
  }

  REQUIRE(answer.has_value());

  const auto answer_error = store.ApplyAnswer(session.token, connect.value->connection_id,
                                              std::string(*answer), answer->typeString());
  CHECK(answer_error == SignalingError::None);

  const auto hello = BuildClientHelloBinary(session.token, connect.value->connection_id);

  bool hello_sent = false;
  bool sent = false;
  const auto deadline = std::chrono::steady_clock::now() + std::chrono::seconds(3);

  while (std::chrono::steady_clock::now() < deadline && !received) {
    auto candidates = store.DrainLocalCandidates(session.token, connect.value->connection_id);
    if (candidates.ok && candidates.value.has_value()) {
      for (const auto &candidate : *candidates.value) {
        if (candidate.mid.empty()) {
          remote.AddRemoteCandidate(rtc::Candidate(candidate.candidate));
        } else {
          remote.AddRemoteCandidate(rtc::Candidate(candidate.candidate, candidate.mid));
        }
      }
    }

    if (!hello_sent) {
      hello_sent = remote.SendOn(kReliableChannelLabel, ToRtcBinary(hello));
    }

    {
      std::unique_lock lock(mutex);
      if (!server_hello) {
        cv.wait_for(lock, std::chrono::milliseconds(10));
      }
    }

    if (server_hello && !sent) {
      sent = store.SendUnreliable(connect.value->connection_id, BuildPong(pong_payload, 2, 1));
    }

    std::this_thread::sleep_for(std::chrono::milliseconds(10));
  }

  CHECK(sent);
  CHECK(received);

  const auto ready = store.ReadyConnectionIds();
  const bool found =
      std::find(ready.begin(), ready.end(), connect.value->connection_id) != ready.end();
  CHECK(found);
}

TEST_CASE("SignalingStore rate limits input commands") {
  rtc::InitLogger(rtc::LogLevel::None);

  SignalingConfig config;
  config.input_max_tokens = 1.0;
  config.input_refill_per_second = 0.0;
  SignalingStore store(config);

  const auto session = store.CreateSession();
  auto connect = store.CreateConnection(session.token, std::chrono::milliseconds(2000));
  REQUIRE(connect.ok);
  REQUIRE(connect.value.has_value());

  rtc::Configuration rtc_config;
  rtc_config.iceServers.clear();
  RtcEchoPeer remote(rtc_config, false);

  std::mutex mutex;
  std::condition_variable cv;
  bool server_hello = false;
  std::optional<rtc::Description> answer;

  remote.SetCallbacks({
      [&](const rtc::Description &description) {
        std::scoped_lock lock(mutex);
        answer = description;
        cv.notify_all();
      },
      [&](const rtc::Candidate &candidate) {
        store.AddRemoteCandidate(session.token, connect.value->connection_id, candidate.candidate(),
                                 candidate.mid());
      },
      nullptr,
      nullptr,
      nullptr,
      [&](const std::string &label, const rtc::binary &message) {
        if (label != kReliableChannelLabel) {
          return;
        }
        const auto message_bytes = ToByteVector(message);
        DecodedEnvelope envelope;
        std::string error;
        if (!DecodeEnvelope(message_bytes, envelope, error)) {
          return;
        }
        if (envelope.header.msg_type == MessageType::ServerHello) {
          std::scoped_lock lock(mutex);
          server_hello = true;
          cv.notify_all();
        }
      }});

  remote.SetRemoteDescription(connect.value->offer);
  remote.SetLocalDescription();

  {
    std::unique_lock lock(mutex);
    cv.wait_for(lock, std::chrono::seconds(2), [&] { return answer.has_value(); });
  }

  REQUIRE(answer.has_value());

  const auto answer_error = store.ApplyAnswer(session.token, connect.value->connection_id,
                                              std::string(*answer), answer->typeString());
  CHECK(answer_error == SignalingError::None);

  const auto hello = BuildClientHelloBinary(session.token, connect.value->connection_id);
  const auto input_one = BuildInputCmdBinary(1, 2);
  const auto input_two = BuildInputCmdBinary(2, 3);

  const auto deadline = std::chrono::steady_clock::now() + std::chrono::seconds(3);
  bool hello_sent = false;
  bool sent_one = false;
  bool sent_two = false;

  while (std::chrono::steady_clock::now() < deadline && !sent_two) {
    auto candidates = store.DrainLocalCandidates(session.token, connect.value->connection_id);
    if (candidates.ok && candidates.value.has_value()) {
      for (const auto &candidate : *candidates.value) {
        if (candidate.mid.empty()) {
          remote.AddRemoteCandidate(rtc::Candidate(candidate.candidate));
        } else {
          remote.AddRemoteCandidate(rtc::Candidate(candidate.candidate, candidate.mid));
        }
      }
    }

    if (!hello_sent) {
      hello_sent = remote.SendOn(kReliableChannelLabel, ToRtcBinary(hello));
    }

    {
      std::unique_lock lock(mutex);
      if (!server_hello) {
        cv.wait_for(lock, std::chrono::milliseconds(10));
      }
    }

    if (server_hello && !sent_one) {
      sent_one = remote.SendOn(kUnreliableChannelLabel, ToRtcBinary(input_one));
    }
    if (server_hello && sent_one && !sent_two) {
      sent_two = remote.SendOn(kUnreliableChannelLabel, ToRtcBinary(input_two));
    }
  }

  REQUIRE(server_hello);
  REQUIRE(sent_one);
  REQUIRE(sent_two);

  std::vector<InputBatch> drained;
  const auto drain_deadline = std::chrono::steady_clock::now() + std::chrono::seconds(1);
  while (std::chrono::steady_clock::now() < drain_deadline) {
    drained = store.DrainAllInputs();
    if (!drained.empty()) {
      break;
    }
    std::this_thread::sleep_for(std::chrono::milliseconds(10));
  }

  REQUIRE(drained.size() == 1);
  REQUIRE(drained[0].inputs.size() == 1);
  CHECK(drained[0].inputs[0].input_seq == 1);
}

TEST_CASE("SignalingStore closes connection after invalid inputs") {
  rtc::InitLogger(rtc::LogLevel::None);

  SignalingConfig config;
  config.max_invalid_inputs = 1;
  SignalingStore store(config);

  const auto session = store.CreateSession();
  auto connect = store.CreateConnection(session.token, std::chrono::milliseconds(2000));
  REQUIRE(connect.ok);
  REQUIRE(connect.value.has_value());

  rtc::Configuration rtc_config;
  rtc_config.iceServers.clear();
  RtcEchoPeer remote(rtc_config, false);

  std::mutex mutex;
  std::condition_variable cv;
  std::optional<rtc::Description> answer;

  remote.SetCallbacks({
      [&](const rtc::Description &description) {
        std::scoped_lock lock(mutex);
        answer = description;
        cv.notify_all();
      },
      [&](const rtc::Candidate &candidate) {
        store.AddRemoteCandidate(session.token, connect.value->connection_id, candidate.candidate(),
                                 candidate.mid());
      },
      nullptr,
      nullptr,
      nullptr,
      nullptr});

  remote.SetRemoteDescription(connect.value->offer);
  remote.SetLocalDescription();

  {
    std::unique_lock lock(mutex);
    cv.wait_for(lock, std::chrono::seconds(2), [&] { return answer.has_value(); });
  }

  REQUIRE(answer.has_value());

  const auto answer_error = store.ApplyAnswer(session.token, connect.value->connection_id,
                                              std::string(*answer), answer->typeString());
  CHECK(answer_error == SignalingError::None);

  const auto input = BuildInputCmdBinary(1, 2);

  bool sent = false;
  const auto deadline = std::chrono::steady_clock::now() + std::chrono::seconds(2);
  while (std::chrono::steady_clock::now() < deadline && !sent) {
    auto candidates = store.DrainLocalCandidates(session.token, connect.value->connection_id);
    if (candidates.ok && candidates.value.has_value()) {
      for (const auto &candidate : *candidates.value) {
        if (candidate.mid.empty()) {
          remote.AddRemoteCandidate(rtc::Candidate(candidate.candidate));
        } else {
          remote.AddRemoteCandidate(rtc::Candidate(candidate.candidate, candidate.mid));
        }
      }
    }

    sent = remote.SendOn(kUnreliableChannelLabel, ToRtcBinary(input));
    std::this_thread::sleep_for(std::chrono::milliseconds(10));
  }

  REQUIRE(sent);

  SignalingResult<std::vector<InputCmd>> result;
  const auto close_deadline = std::chrono::steady_clock::now() + std::chrono::seconds(2);
  while (std::chrono::steady_clock::now() < close_deadline) {
    result = store.DrainInputs(session.token, connect.value->connection_id);
    if (!result.ok && result.error == SignalingError::ConnectionNotFound) {
      break;
    }
    std::this_thread::sleep_for(std::chrono::milliseconds(10));
  }

  REQUIRE_FALSE(result.ok);
  CHECK(result.error == SignalingError::ConnectionNotFound);
}

TEST_CASE("SignalingStore responds to ping with pong") {
  rtc::InitLogger(rtc::LogLevel::None);

  SignalingConfig config;
  SignalingStore store(config);

  const auto session = store.CreateSession();
  auto connect = store.CreateConnection(session.token, std::chrono::milliseconds(2000));
  REQUIRE(connect.ok);
  REQUIRE(connect.value.has_value());

  rtc::Configuration rtc_config;
  rtc_config.iceServers.clear();
  RtcEchoPeer remote(rtc_config, false);

  std::mutex mutex;
  std::condition_variable cv;
  std::optional<rtc::Description> answer;
  bool server_hello = false;
  bool pong_received = false;

  remote.SetCallbacks({
      [&](const rtc::Description &description) {
        std::scoped_lock lock(mutex);
        answer = description;
        cv.notify_all();
      },
      [&](const rtc::Candidate &candidate) {
        store.AddRemoteCandidate(session.token, connect.value->connection_id, candidate.candidate(),
                                 candidate.mid());
      },
      nullptr,
      nullptr,
      nullptr,
      [&](const std::string &label, const rtc::binary &message) {
        const auto message_bytes = ToByteVector(message);
        DecodedEnvelope envelope;
        std::string error;
        if (!DecodeEnvelope(message_bytes, envelope, error)) {
          return;
        }
        if (label == kReliableChannelLabel && envelope.header.msg_type == MessageType::ServerHello) {
          std::scoped_lock lock(mutex);
          server_hello = true;
          cv.notify_all();
          return;
        }
        if (label == kUnreliableChannelLabel && envelope.header.msg_type == MessageType::Pong) {
          std::scoped_lock lock(mutex);
          pong_received = true;
          cv.notify_all();
        }
      }});

  remote.SetRemoteDescription(connect.value->offer);
  remote.SetLocalDescription();

  {
    std::unique_lock lock(mutex);
    cv.wait_for(lock, std::chrono::seconds(2), [&] { return answer.has_value(); });
  }

  REQUIRE(answer.has_value());

  const auto answer_error = store.ApplyAnswer(session.token, connect.value->connection_id,
                                              std::string(*answer), answer->typeString());
  CHECK(answer_error == SignalingError::None);

  const auto hello = BuildClientHelloBinary(session.token, connect.value->connection_id);
  const auto ping = BuildPingBinary(5.0, 4);

  bool hello_sent = false;
  bool ping_sent = false;
  const auto deadline = std::chrono::steady_clock::now() + std::chrono::seconds(3);

  while (std::chrono::steady_clock::now() < deadline && !pong_received) {
    auto candidates = store.DrainLocalCandidates(session.token, connect.value->connection_id);
    if (candidates.ok && candidates.value.has_value()) {
      for (const auto &candidate : *candidates.value) {
        if (candidate.mid.empty()) {
          remote.AddRemoteCandidate(rtc::Candidate(candidate.candidate));
        } else {
          remote.AddRemoteCandidate(rtc::Candidate(candidate.candidate, candidate.mid));
        }
      }
    }

    if (!hello_sent) {
      hello_sent = remote.SendOn(kReliableChannelLabel, ToRtcBinary(hello));
    }

    {
      std::unique_lock lock(mutex);
      if (!server_hello) {
        cv.wait_for(lock, std::chrono::milliseconds(10));
      }
    }

    if (server_hello && !ping_sent) {
      ping_sent = remote.SendOn(kUnreliableChannelLabel, ToRtcBinary(ping));
    }

    std::this_thread::sleep_for(std::chrono::milliseconds(10));
  }

  CHECK(hello_sent);
  CHECK(ping_sent);
  CHECK(pong_received);
}
