#pragma once

#include <cstddef>
#include <cstdint>
#include <string>
#include <vector>

constexpr int kProtocolVersion = 4;
constexpr int kServerTickRate = 60;
constexpr int kSnapshotRate = 20;
constexpr int kSnapshotKeyframeInterval = 5;
constexpr size_t kMaxClientMessageBytes = 4096;
constexpr size_t kProtocolHeaderBytes = 20;
constexpr const char *kReliableChannelLabel = "afps_reliable";
constexpr const char *kUnreliableChannelLabel = "afps_unreliable";
constexpr uint8_t kProtocolMagic[4] = {'A', 'F', 'P', 'S'};
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

enum class MessageType : uint16_t {
  ClientHello = 1,
  ServerHello = 2,
  JoinRequest = 3,
  JoinAccept = 4,
  InputCmd = 5,
  StateSnapshot = 6,
  StateSnapshotDelta = 7,
  GameEvent = 8,
  Ping = 9,
  Pong = 10,
  PlayerProfile = 11,
  Error = 12,
  Disconnect = 13
};

struct MessageHeader {
  uint16_t protocol_version = 0;
  MessageType msg_type = MessageType::Error;
  uint32_t payload_bytes = 0;
  uint32_t msg_seq = 0;
  uint32_t server_seq_ack = 0;
};

struct DecodedEnvelope {
  MessageHeader header;
  std::vector<uint8_t> payload;
};

bool DecodeEnvelope(const std::vector<uint8_t> &message, DecodedEnvelope &out, std::string &error);
std::vector<uint8_t> EncodeEnvelope(MessageType type, const uint8_t *payload, size_t payload_size,
                                    uint32_t msg_seq, uint32_t server_seq_ack,
                                    uint16_t protocol_version = static_cast<uint16_t>(kProtocolVersion));

bool ParseClientHelloPayload(const std::vector<uint8_t> &payload, ClientHello &out, std::string &error);
bool ParseInputCmdPayload(const std::vector<uint8_t> &payload, InputCmd &out, std::string &error);
bool ParsePingPayload(const std::vector<uint8_t> &payload, Ping &out, std::string &error);
std::vector<uint8_t> BuildServerHello(const ServerHello &hello, uint32_t msg_seq, uint32_t server_seq_ack);
std::vector<uint8_t> BuildProtocolError(const std::string &code, const std::string &message,
                                        uint32_t msg_seq, uint32_t server_seq_ack);
std::vector<uint8_t> BuildPong(const Pong &pong, uint32_t msg_seq, uint32_t server_seq_ack);
std::vector<uint8_t> BuildGameEvent(const GameEvent &event, uint32_t msg_seq, uint32_t server_seq_ack);
std::vector<uint8_t> BuildStateSnapshot(const StateSnapshot &snapshot, uint32_t msg_seq, uint32_t server_seq_ack);
std::vector<uint8_t> BuildStateSnapshotDelta(const StateSnapshotDelta &delta, uint32_t msg_seq,
                                             uint32_t server_seq_ack);
std::vector<uint8_t> BuildPlayerProfile(const PlayerProfile &profile, uint32_t msg_seq, uint32_t server_seq_ack);
