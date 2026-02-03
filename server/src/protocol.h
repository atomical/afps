#pragma once

#include <cstddef>
#include <string>

constexpr int kProtocolVersion = 3;
constexpr int kServerTickRate = 60;
constexpr int kSnapshotRate = 20;
constexpr int kSnapshotKeyframeInterval = 5;
constexpr size_t kMaxClientMessageBytes = 4096;
constexpr const char *kReliableChannelLabel = "afps_reliable";
constexpr const char *kUnreliableChannelLabel = "afps_unreliable";
constexpr int kSnapshotMaskPosX = 1 << 0;
constexpr int kSnapshotMaskPosY = 1 << 1;
constexpr int kSnapshotMaskPosZ = 1 << 2;
constexpr int kSnapshotMaskVelX = 1 << 3;
constexpr int kSnapshotMaskVelY = 1 << 4;
constexpr int kSnapshotMaskVelZ = 1 << 5;
constexpr int kSnapshotMaskDashCooldown = 1 << 6;
constexpr int kSnapshotMaskHealth = 1 << 7;
constexpr int kSnapshotMaskKills = 1 << 8;
constexpr int kSnapshotMaskDeaths = 1 << 9;
constexpr int kSnapshotMaskWeaponSlot = 1 << 10;
constexpr int kSnapshotMaskAll = kSnapshotMaskPosX | kSnapshotMaskPosY | kSnapshotMaskPosZ |
                                 kSnapshotMaskVelX | kSnapshotMaskVelY | kSnapshotMaskVelZ |
                                 kSnapshotMaskDashCooldown | kSnapshotMaskHealth | kSnapshotMaskKills |
                                 kSnapshotMaskDeaths | kSnapshotMaskWeaponSlot;

struct ClientHello {
  int protocol_version = 0;
  std::string session_token;
  std::string connection_id;
  std::string build;
  std::string nickname;
  std::string character_id;
};

struct ServerHello {
  int protocol_version = 0;
  std::string connection_id;
  std::string client_id;
  int server_tick_rate = 0;
  int snapshot_rate = 0;
  int snapshot_keyframe_interval = 0;
  std::string motd;
  std::string connection_nonce;
};

struct InputCmd {
  int input_seq = 0;
  double move_x = 0.0;
  double move_y = 0.0;
  double look_delta_x = 0.0;
  double look_delta_y = 0.0;
  double view_yaw = 0.0;
  double view_pitch = 0.0;
  int weapon_slot = 0;
  bool jump = false;
  bool fire = false;
  bool sprint = false;
  bool dash = false;
  bool grapple = false;
  bool shield = false;
  bool shockwave = false;
};

struct Ping {
  double client_time_ms = 0.0;
};

struct Pong {
  double client_time_ms = 0.0;
};

struct GameEvent {
  std::string event;
  std::string target_id;
  std::string owner_id;
  int projectile_id = -1;
  double damage = 0.0;
  bool killed = false;
  double pos_x = 0.0;
  double pos_y = 0.0;
  double pos_z = 0.0;
  double vel_x = 0.0;
  double vel_y = 0.0;
  double vel_z = 0.0;
  double ttl = 0.0;
};

struct StateSnapshot {
  int server_tick = 0;
  int last_processed_input_seq = -1;
  std::string client_id;
  double pos_x = 0.0;
  double pos_y = 0.0;
  double pos_z = 0.0;
  double vel_x = 0.0;
  double vel_y = 0.0;
  double vel_z = 0.0;
  int weapon_slot = 0;
  double dash_cooldown = 0.0;
  double health = 100.0;
  int kills = 0;
  int deaths = 0;
};

struct StateSnapshotDelta {
  int server_tick = 0;
  int base_tick = 0;
  int last_processed_input_seq = -1;
  int mask = 0;
  std::string client_id;
  double pos_x = 0.0;
  double pos_y = 0.0;
  double pos_z = 0.0;
  double vel_x = 0.0;
  double vel_y = 0.0;
  double vel_z = 0.0;
  int weapon_slot = 0;
  double dash_cooldown = 0.0;
  double health = 0.0;
  int kills = 0;
  int deaths = 0;
};

struct PlayerProfile {
  std::string client_id;
  std::string nickname;
  std::string character_id;
};

bool ParseClientHello(const std::string &message, ClientHello &out, std::string &error);
bool ParseInputCmd(const std::string &message, InputCmd &out, std::string &error);
bool ParsePing(const std::string &message, Ping &out, std::string &error);
std::string BuildServerHello(const ServerHello &hello);
std::string BuildProtocolError(const std::string &code, const std::string &message);
std::string BuildPong(const Pong &pong);
std::string BuildGameEvent(const GameEvent &event);
std::string BuildStateSnapshot(const StateSnapshot &snapshot);
std::string BuildStateSnapshotDelta(const StateSnapshotDelta &delta);
std::string BuildPlayerProfile(const PlayerProfile &profile);
