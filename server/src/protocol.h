#pragma once

#include <cstddef>
#include <cstdint>
#include <string>
#include <variant>
#include <vector>

constexpr int kProtocolVersion = 7;
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
constexpr int kSnapshotMaskAmmoInMag = 1 << 11;
constexpr int kSnapshotMaskViewYawQ = 1 << 12;
constexpr int kSnapshotMaskViewPitchQ = 1 << 13;
constexpr int kSnapshotMaskPlayerFlags = 1 << 14;
constexpr int kSnapshotMaskWeaponHeatQ = 1 << 15;
constexpr int kSnapshotMaskLoadoutBits = 1 << 16;
constexpr int kSnapshotMaskAll =
    kSnapshotMaskPosX | kSnapshotMaskPosY | kSnapshotMaskPosZ |
    kSnapshotMaskVelX | kSnapshotMaskVelY | kSnapshotMaskVelZ |
    kSnapshotMaskDashCooldown | kSnapshotMaskHealth | kSnapshotMaskKills |
    kSnapshotMaskDeaths | kSnapshotMaskWeaponSlot | kSnapshotMaskAmmoInMag |
    kSnapshotMaskViewYawQ | kSnapshotMaskViewPitchQ | kSnapshotMaskPlayerFlags |
    kSnapshotMaskWeaponHeatQ | kSnapshotMaskLoadoutBits;

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
  uint32_t map_seed = 0;
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
  bool ads = false;
  bool sprint = false;
  bool dash = false;
  bool grapple = false;
  bool shield = false;
  bool shockwave = false;
};

struct FireWeaponRequest {
  int client_shot_seq = 0;
  std::string weapon_id;
  int weapon_slot = 0;
  double origin_x = 0.0;
  double origin_y = 0.0;
  double origin_z = 0.0;
  double dir_x = 0.0;
  double dir_y = 0.0;
  double dir_z = 0.0;
};

struct SetLoadoutRequest {
  uint32_t loadout_bits = 0;
};

struct Ping {
  double client_time_ms = 0.0;
};

struct Pong {
  double client_time_ms = 0.0;
};

enum class HitKind : uint8_t {
  None = 0,
  World = 1,
  Player = 2,
};

enum class SurfaceType : uint8_t {
  Stone = 0,
  Metal = 1,
  Dirt = 2,
  Energy = 3,
};

enum class PickupKind : uint8_t {
  Health = 1,
  Weapon = 2,
};

struct ShotFiredFx {
  std::string shooter_id;
  uint8_t weapon_slot = 0;
  int shot_seq = 0;
  bool dry_fire = false;
};

struct ShotTraceFx {
  std::string shooter_id;
  uint8_t weapon_slot = 0;
  int shot_seq = 0;
  int16_t dir_oct_x = 0;
  int16_t dir_oct_y = 0;
  uint16_t hit_dist_q = 0;
  HitKind hit_kind = HitKind::None;
  SurfaceType surface_type = SurfaceType::Stone;
  int16_t normal_oct_x = 0;
  int16_t normal_oct_y = 0;
  bool show_tracer = false;
  int16_t hit_pos_x_q = 0;
  int16_t hit_pos_y_q = 0;
  int16_t hit_pos_z_q = 0;
};

struct ReloadFx {
  std::string shooter_id;
  uint8_t weapon_slot = 0;
};

struct NearMissFx {
  std::string shooter_id;
  int shot_seq = 0;
  uint8_t strength = 0;
};

struct OverheatFx {
  std::string shooter_id;
  uint8_t weapon_slot = 0;
  uint16_t heat_q = 0;
};

struct VentFx {
  std::string shooter_id;
  uint8_t weapon_slot = 0;
};

struct HitConfirmedFx {
  std::string target_id;
  double damage = 0.0;
  bool killed = false;
};

struct ProjectileSpawnFx {
  std::string shooter_id;
  uint8_t weapon_slot = 0;
  int shot_seq = 0;
  int projectile_id = 0;
  int16_t pos_x_q = 0;
  int16_t pos_y_q = 0;
  int16_t pos_z_q = 0;
  int16_t vel_x_q = 0;
  int16_t vel_y_q = 0;
  int16_t vel_z_q = 0;
  uint16_t ttl_q = 0;
};

struct ProjectileImpactFx {
  int projectile_id = 0;
  bool hit_world = false;
  std::string target_id;
  int16_t pos_x_q = 0;
  int16_t pos_y_q = 0;
  int16_t pos_z_q = 0;
  int16_t normal_oct_x = 0;
  int16_t normal_oct_y = 0;
  SurfaceType surface_type = SurfaceType::Stone;
};

struct ProjectileRemoveFx {
  int projectile_id = 0;
};

struct PickupSpawnedFx {
  uint32_t pickup_id = 0;
  PickupKind kind = PickupKind::Health;
  int16_t pos_x_q = 0;
  int16_t pos_y_q = 0;
  int16_t pos_z_q = 0;
  uint8_t weapon_slot = 0;
  uint16_t amount = 0;
};

struct PickupTakenFx {
  uint32_t pickup_id = 0;
  std::string taker_id;
  int server_tick = 0;
};

using FxEventData = std::variant<ShotFiredFx,
                                 ShotTraceFx,
                                 ReloadFx,
                                 NearMissFx,
                                 OverheatFx,
                                 VentFx,
                                 HitConfirmedFx,
                                 ProjectileSpawnFx,
                                 ProjectileImpactFx,
                                 ProjectileRemoveFx,
                                 PickupSpawnedFx,
                                 PickupTakenFx>;

struct GameEventBatch {
  int server_tick = 0;
  std::vector<FxEventData> events;
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
  int ammo_in_mag = 0;
  double dash_cooldown = 0.0;
  double health = 100.0;
  int kills = 0;
  int deaths = 0;
  int16_t view_yaw_q = 0;
  int16_t view_pitch_q = 0;
  uint8_t player_flags = 0;
  uint16_t weapon_heat_q = 0;
  uint32_t loadout_bits = 0;
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
  int ammo_in_mag = 0;
  double dash_cooldown = 0.0;
  double health = 0.0;
  int kills = 0;
  int deaths = 0;
  int16_t view_yaw_q = 0;
  int16_t view_pitch_q = 0;
  uint8_t player_flags = 0;
  uint16_t weapon_heat_q = 0;
  uint32_t loadout_bits = 0;
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
  Disconnect = 13,
  FireWeaponRequest = 14,
  SetLoadoutRequest = 15
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
bool ParseFireWeaponRequestPayload(const std::vector<uint8_t> &payload, FireWeaponRequest &out,
                                   std::string &error);
bool ParseSetLoadoutRequestPayload(const std::vector<uint8_t> &payload, SetLoadoutRequest &out,
                                   std::string &error);
bool ParsePingPayload(const std::vector<uint8_t> &payload, Ping &out, std::string &error);
std::vector<uint8_t> BuildServerHello(const ServerHello &hello, uint32_t msg_seq, uint32_t server_seq_ack);
std::vector<uint8_t> BuildProtocolError(const std::string &code, const std::string &message,
                                        uint32_t msg_seq, uint32_t server_seq_ack);
std::vector<uint8_t> BuildPong(const Pong &pong, uint32_t msg_seq, uint32_t server_seq_ack);
std::vector<uint8_t> BuildGameEventBatch(const GameEventBatch &event, uint32_t msg_seq, uint32_t server_seq_ack);
std::vector<uint8_t> BuildStateSnapshot(const StateSnapshot &snapshot, uint32_t msg_seq, uint32_t server_seq_ack);
std::vector<uint8_t> BuildStateSnapshotDelta(const StateSnapshotDelta &delta, uint32_t msg_seq,
                                             uint32_t server_seq_ack);
std::vector<uint8_t> BuildPlayerProfile(const PlayerProfile &profile, uint32_t msg_seq, uint32_t server_seq_ack);
