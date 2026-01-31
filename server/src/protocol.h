#pragma once

#include <cstddef>
#include <string>

constexpr int kProtocolVersion = 1;
constexpr int kServerTickRate = 60;
constexpr int kSnapshotRate = 20;
constexpr size_t kMaxClientMessageBytes = 4096;
constexpr const char *kReliableChannelLabel = "afps_reliable";
constexpr const char *kUnreliableChannelLabel = "afps_unreliable";

struct ClientHello {
  int protocol_version = 0;
  std::string session_token;
  std::string connection_id;
  std::string build;
};

struct ServerHello {
  int protocol_version = 0;
  std::string connection_id;
  std::string client_id;
  int server_tick_rate = 0;
  int snapshot_rate = 0;
  std::string motd;
  std::string connection_nonce;
};

struct InputCmd {
  int input_seq = 0;
  double move_x = 0.0;
  double move_y = 0.0;
  double look_delta_x = 0.0;
  double look_delta_y = 0.0;
  bool jump = false;
  bool fire = false;
  bool sprint = false;
};

struct Ping {
  double client_time_ms = 0.0;
};

struct Pong {
  double client_time_ms = 0.0;
};

struct StateSnapshot {
  int server_tick = 0;
  int last_processed_input_seq = -1;
  std::string client_id;
  double pos_x = 0.0;
  double pos_y = 0.0;
};

bool ParseClientHello(const std::string &message, ClientHello &out, std::string &error);
bool ParseInputCmd(const std::string &message, InputCmd &out, std::string &error);
bool ParsePing(const std::string &message, Ping &out, std::string &error);
std::string BuildServerHello(const ServerHello &hello);
std::string BuildProtocolError(const std::string &code, const std::string &message);
std::string BuildPong(const Pong &pong);
std::string BuildStateSnapshot(const StateSnapshot &snapshot);
