#include "doctest.h"

#include "signaling.h"

#include <algorithm>
#include <chrono>
#include <condition_variable>
#include <mutex>
#include <thread>
#include <nlohmann/json.hpp>

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
  std::string server_hello_payload;
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
      [&](const std::string &label, const std::string &message) {
        if (label == kReliableChannelLabel &&
            message.find("ServerHello") != std::string::npos) {
          std::scoped_lock lock(mutex);
          server_hello = true;
          server_hello_payload = message;
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

  const std::string hello =
      std::string("{\"type\":\"ClientHello\",\"protocolVersion\":2,\"sessionToken\":\"") +
      session.token + "\",\"connectionId\":\"" + connect.value->connection_id + "\",\"build\":\"test\"}";
  const std::string input =
      R"({"type":"InputCmd","inputSeq":1,"moveX":1,"moveY":0,"lookDeltaX":0,"lookDeltaY":0,"jump":false,"fire":true,"sprint":false})";

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
      hello_sent = remote.SendOn(kReliableChannelLabel, hello);
    }

    if (server_hello && !input_sent) {
      input_sent = remote.SendOn(kUnreliableChannelLabel, input);
    }

    std::this_thread::sleep_for(std::chrono::milliseconds(10));
  }

  CHECK(input_sent);
  REQUIRE(!server_hello_payload.empty());
  const auto server_json = nlohmann::json::parse(server_hello_payload);
  CHECK(server_json.contains("snapshotKeyframeInterval"));
  CHECK(server_json.at("snapshotKeyframeInterval") == config.snapshot_keyframe_interval);

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

TEST_CASE("SignalingStore exposes ready connections and sends unreliable messages") {
  rtc::InitLogger(rtc::LogLevel::None);

  SignalingConfig config;
  SignalingStore store(config);

  const auto session = store.CreateSession();
  auto connect = store.CreateConnection(session.token, std::chrono::milliseconds(2000));
  REQUIRE(connect.ok);
  REQUIRE(connect.value.has_value());

  CHECK(store.ReadyConnectionIds().empty());
  CHECK_FALSE(store.SendUnreliable(connect.value->connection_id, "snapshot"));

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
      [&](const std::string &label, const std::string &message) {
        if (label == kReliableChannelLabel &&
            message.find("ServerHello") != std::string::npos) {
          std::scoped_lock lock(mutex);
          server_hello = true;
          cv.notify_all();
          return;
        }
        if (label == kUnreliableChannelLabel && message == "snapshot") {
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

  const std::string hello =
      std::string("{\"type\":\"ClientHello\",\"protocolVersion\":2,\"sessionToken\":\"") +
      session.token + "\",\"connectionId\":\"" + connect.value->connection_id + "\",\"build\":\"test\"}";

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
      hello_sent = remote.SendOn(kReliableChannelLabel, hello);
    }

    {
      std::unique_lock lock(mutex);
      if (!server_hello) {
        cv.wait_for(lock, std::chrono::milliseconds(10));
      }
    }

    if (server_hello && !sent) {
      sent = store.SendUnreliable(connect.value->connection_id, "snapshot");
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
      [&](const std::string &label, const std::string &message) {
        if (label == kReliableChannelLabel &&
            message.find("ServerHello") != std::string::npos) {
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

  const std::string hello =
      std::string("{\"type\":\"ClientHello\",\"protocolVersion\":2,\"sessionToken\":\"") +
      session.token + "\",\"connectionId\":\"" + connect.value->connection_id + "\",\"build\":\"test\"}";
  const std::string input_one =
      R"({"type":"InputCmd","inputSeq":1,"moveX":0,"moveY":0,"lookDeltaX":0,"lookDeltaY":0,"jump":false,"fire":false,"sprint":false})";
  const std::string input_two =
      R"({"type":"InputCmd","inputSeq":2,"moveX":0,"moveY":0,"lookDeltaX":0,"lookDeltaY":0,"jump":false,"fire":false,"sprint":false})";

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
      hello_sent = remote.SendOn(kReliableChannelLabel, hello);
    }

    {
      std::unique_lock lock(mutex);
      if (!server_hello) {
        cv.wait_for(lock, std::chrono::milliseconds(10));
      }
    }

    if (server_hello && !sent_one) {
      sent_one = remote.SendOn(kUnreliableChannelLabel, input_one);
    }
    if (server_hello && sent_one && !sent_two) {
      sent_two = remote.SendOn(kUnreliableChannelLabel, input_two);
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

  const std::string input =
      R"({"type":"InputCmd","inputSeq":1,"moveX":0,"moveY":0,"lookDeltaX":0,"lookDeltaY":0,"jump":false,"fire":false,"sprint":false})";

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

    sent = remote.SendOn(kUnreliableChannelLabel, input);
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
      [&](const std::string &label, const std::string &message) {
        if (label == kReliableChannelLabel &&
            message.find("ServerHello") != std::string::npos) {
          std::scoped_lock lock(mutex);
          server_hello = true;
          cv.notify_all();
          return;
        }
        if (label == kUnreliableChannelLabel &&
            message.find("\"type\":\"Pong\"") != std::string::npos) {
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

  const std::string hello =
      std::string("{\"type\":\"ClientHello\",\"protocolVersion\":2,\"sessionToken\":\"") +
      session.token + "\",\"connectionId\":\"" + connect.value->connection_id + "\",\"build\":\"test\"}";
  const std::string ping = R"({"type":"Ping","clientTimeMs":5})";

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
      hello_sent = remote.SendOn(kReliableChannelLabel, hello);
    }

    {
      std::unique_lock lock(mutex);
      if (!server_hello) {
        cv.wait_for(lock, std::chrono::milliseconds(10));
      }
    }

    if (server_hello && !ping_sent) {
      ping_sent = remote.SendOn(kUnreliableChannelLabel, ping);
    }

    std::this_thread::sleep_for(std::chrono::milliseconds(10));
  }

  CHECK(hello_sent);
  CHECK(ping_sent);
  CHECK(pong_received);
}
