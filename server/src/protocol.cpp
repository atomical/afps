#include "protocol.h"

#include <algorithm>
#include <cmath>
#include <cstring>
#include <limits>

#include <flatbuffers/flatbuffers.h>

#include "afps_protocol_generated.h"

namespace {
constexpr size_t kMagicOffset = 0;
constexpr size_t kProtocolOffset = 4;
constexpr size_t kTypeOffset = 6;
constexpr size_t kPayloadSizeOffset = 8;
constexpr size_t kMsgSeqOffset = 12;
constexpr size_t kAckOffset = 16;

bool IsFinite(double value) {
  return std::isfinite(value);
}

uint16_t ReadU16(const uint8_t *data) {
  return static_cast<uint16_t>(data[0] | (static_cast<uint16_t>(data[1]) << 8));
}

uint32_t ReadU32(const uint8_t *data) {
  return static_cast<uint32_t>(data[0] | (static_cast<uint32_t>(data[1]) << 8) |
                               (static_cast<uint32_t>(data[2]) << 16) |
                               (static_cast<uint32_t>(data[3]) << 24));
}

void WriteU16(uint8_t *data, uint16_t value) {
  data[0] = static_cast<uint8_t>(value & 0xFF);
  data[1] = static_cast<uint8_t>((value >> 8) & 0xFF);
}

void WriteU32(uint8_t *data, uint32_t value) {
  data[0] = static_cast<uint8_t>(value & 0xFF);
  data[1] = static_cast<uint8_t>((value >> 8) & 0xFF);
  data[2] = static_cast<uint8_t>((value >> 16) & 0xFF);
  data[3] = static_cast<uint8_t>((value >> 24) & 0xFF);
}

bool IsValidMessageType(uint16_t value) {
  return value >= static_cast<uint16_t>(MessageType::ClientHello) &&
         value <= static_cast<uint16_t>(MessageType::WeaponReloadEvent);
}

template <typename T>
const T *VerifyPayload(const std::vector<uint8_t> &payload, std::string &error) {
  if (payload.empty()) {
    error = "empty_payload";
    return nullptr;
  }
  flatbuffers::Verifier verifier(payload.data(), payload.size());
  const T *root = flatbuffers::GetRoot<T>(payload.data());
  if (!root || !root->Verify(verifier)) {
    error = "invalid_flatbuffer";
    return nullptr;
  }
  return root;
}

afps::protocol::GameEventType ToGameEventType(const std::string &event) {
  if (event == "ProjectileSpawn") {
    return afps::protocol::GameEventType::ProjectileSpawn;
  }
  if (event == "ProjectileRemove") {
    return afps::protocol::GameEventType::ProjectileRemove;
  }
  return afps::protocol::GameEventType::HitConfirmed;
}
}  // namespace

bool DecodeEnvelope(const std::vector<uint8_t> &message, DecodedEnvelope &out, std::string &error) {
  if (message.size() < kProtocolHeaderBytes) {
    error = "message_too_small";
    return false;
  }
  if (message.size() > kMaxClientMessageBytes) {
    error = "message_too_large";
    return false;
  }
  if (std::memcmp(message.data() + kMagicOffset, kProtocolMagic, sizeof(kProtocolMagic)) != 0) {
    error = "invalid_magic";
    return false;
  }

  const uint16_t protocol_version = ReadU16(message.data() + kProtocolOffset);
  const uint16_t msg_type_value = ReadU16(message.data() + kTypeOffset);
  const uint32_t payload_bytes = ReadU32(message.data() + kPayloadSizeOffset);
  const uint32_t msg_seq = ReadU32(message.data() + kMsgSeqOffset);
  const uint32_t server_seq_ack = ReadU32(message.data() + kAckOffset);

  if (!IsValidMessageType(msg_type_value)) {
    error = "invalid_msg_type";
    return false;
  }
  if (payload_bytes + kProtocolHeaderBytes != message.size()) {
    error = "payload_size_mismatch";
    return false;
  }

  out.header.protocol_version = protocol_version;
  out.header.msg_type = static_cast<MessageType>(msg_type_value);
  out.header.payload_bytes = payload_bytes;
  out.header.msg_seq = msg_seq;
  out.header.server_seq_ack = server_seq_ack;
  out.payload.assign(message.begin() + static_cast<long>(kProtocolHeaderBytes), message.end());
  return true;
}

std::vector<uint8_t> EncodeEnvelope(MessageType type, const uint8_t *payload, size_t payload_size,
                                    uint32_t msg_seq, uint32_t server_seq_ack,
                                    uint16_t protocol_version) {
  if (payload_size > std::numeric_limits<uint32_t>::max()) {
    return {};
  }
  const size_t total_size = kProtocolHeaderBytes + payload_size;
  std::vector<uint8_t> message(total_size);
  std::memcpy(message.data() + kMagicOffset, kProtocolMagic, sizeof(kProtocolMagic));
  WriteU16(message.data() + kProtocolOffset, protocol_version);
  WriteU16(message.data() + kTypeOffset, static_cast<uint16_t>(type));
  WriteU32(message.data() + kPayloadSizeOffset, static_cast<uint32_t>(payload_size));
  WriteU32(message.data() + kMsgSeqOffset, msg_seq);
  WriteU32(message.data() + kAckOffset, server_seq_ack);
  if (payload_size > 0) {
    std::memcpy(message.data() + kProtocolHeaderBytes, payload, payload_size);
  }
  return message;
}

bool ParseClientHelloPayload(const std::vector<uint8_t> &payload, ClientHello &out, std::string &error) {
  const auto *hello = VerifyPayload<afps::protocol::ClientHello>(payload, error);
  if (!hello) {
    return false;
  }
  if (hello->protocol_version() == 0) {
    error = "invalid_field: protocol_version";
    return false;
  }
  const auto *session_token = hello->session_token();
  if (!session_token || session_token->size() == 0) {
    error = "missing_field: sessionToken";
    return false;
  }
  const auto *connection_id = hello->connection_id();
  if (!connection_id || connection_id->size() == 0) {
    error = "missing_field: connectionId";
    return false;
  }

  out.protocol_version = hello->protocol_version();
  out.session_token = session_token->str();
  out.connection_id = connection_id->str();
  if (const auto *build = hello->build()) {
    out.build = build->str();
  }
  if (const auto *nickname = hello->nickname()) {
    out.nickname = nickname->str();
  }
  if (const auto *character_id = hello->character_id()) {
    out.character_id = character_id->str();
  }
  return true;
}

bool ParseInputCmdPayload(const std::vector<uint8_t> &payload, InputCmd &out, std::string &error) {
  const auto *cmd = VerifyPayload<afps::protocol::InputCmd>(payload, error);
  if (!cmd) {
    return false;
  }

  out.input_seq = cmd->input_seq();
  if (out.input_seq < 0) {
    error = "invalid_field: inputSeq";
    return false;
  }

  out.move_x = cmd->move_x();
  out.move_y = cmd->move_y();
  if (!IsFinite(out.move_x) || !IsFinite(out.move_y)) {
    error = "invalid_field: move";
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

  out.look_delta_x = cmd->look_delta_x();
  out.look_delta_y = cmd->look_delta_y();
  if (!IsFinite(out.look_delta_x) || !IsFinite(out.look_delta_y)) {
    error = "invalid_field: lookDelta";
    return false;
  }

  out.view_yaw = cmd->view_yaw();
  out.view_pitch = cmd->view_pitch();
  if (!IsFinite(out.view_yaw) || !IsFinite(out.view_pitch)) {
    error = "invalid_field: view";
    return false;
  }

  out.weapon_slot = cmd->weapon_slot();
  if (out.weapon_slot < 0) {
    error = "invalid_field: weaponSlot";
    return false;
  }

  out.jump = cmd->jump();
  out.fire = cmd->fire();
  out.sprint = cmd->sprint();
  out.dash = cmd->dash();
  out.grapple = cmd->grapple();
  out.shield = cmd->shield();
  out.shockwave = cmd->shockwave();
  return true;
}

bool ParseFireWeaponRequestPayload(const std::vector<uint8_t> &payload, FireWeaponRequest &out, std::string &error) {
  const auto *req = VerifyPayload<afps::protocol::FireWeaponRequest>(payload, error);
  if (!req) {
    return false;
  }
  out.client_shot_seq = req->client_shot_seq();
  if (out.client_shot_seq < 0) {
    error = "invalid_field: clientShotSeq";
    return false;
  }
  if (const auto *weapon_id = req->weapon_id()) {
    out.weapon_id = weapon_id->str();
  }
  out.weapon_slot = req->weapon_slot();
  if (out.weapon_slot < 0) {
    error = "invalid_field: weaponSlot";
    return false;
  }
  out.origin_x = req->origin_x();
  out.origin_y = req->origin_y();
  out.origin_z = req->origin_z();
  out.dir_x = req->dir_x();
  out.dir_y = req->dir_y();
  out.dir_z = req->dir_z();
  if (!IsFinite(out.origin_x) || !IsFinite(out.origin_y) || !IsFinite(out.origin_z) ||
      !IsFinite(out.dir_x) || !IsFinite(out.dir_y) || !IsFinite(out.dir_z)) {
    error = "invalid_field: origin_dir";
    return false;
  }
  return true;
}

bool ParsePingPayload(const std::vector<uint8_t> &payload, Ping &out, std::string &error) {
  const auto *ping = VerifyPayload<afps::protocol::Ping>(payload, error);
  if (!ping) {
    return false;
  }
  out.client_time_ms = ping->client_time_ms();
  if (!IsFinite(out.client_time_ms)) {
    error = "invalid_field: clientTimeMs";
    return false;
  }
  return true;
}

std::vector<uint8_t> BuildServerHello(const ServerHello &hello, uint32_t msg_seq, uint32_t server_seq_ack) {
  flatbuffers::FlatBufferBuilder builder(256);
  const auto connection_id = builder.CreateString(hello.connection_id);
  const auto client_id = builder.CreateString(hello.client_id);
  const auto motd = hello.motd.empty() ? 0 : builder.CreateString(hello.motd);
  const auto nonce = hello.connection_nonce.empty() ? 0 : builder.CreateString(hello.connection_nonce);
  const auto offset = afps::protocol::CreateServerHello(
      builder,
      static_cast<uint16_t>(hello.protocol_version),
      connection_id,
      client_id,
      static_cast<uint16_t>(hello.server_tick_rate),
      static_cast<uint16_t>(hello.snapshot_rate),
      static_cast<uint16_t>(hello.snapshot_keyframe_interval),
      motd,
      nonce);
  builder.Finish(offset);
  return EncodeEnvelope(MessageType::ServerHello, builder.GetBufferPointer(), builder.GetSize(), msg_seq,
                        server_seq_ack);
}

std::vector<uint8_t> BuildProtocolError(const std::string &code, const std::string &message,
                                        uint32_t msg_seq, uint32_t server_seq_ack) {
  flatbuffers::FlatBufferBuilder builder(128);
  const auto code_offset = builder.CreateString(code);
  const auto message_offset = builder.CreateString(message);
  const auto offset = afps::protocol::CreateError(builder, code_offset, message_offset);
  builder.Finish(offset);
  return EncodeEnvelope(MessageType::Error, builder.GetBufferPointer(), builder.GetSize(), msg_seq, server_seq_ack);
}

std::vector<uint8_t> BuildPong(const Pong &pong, uint32_t msg_seq, uint32_t server_seq_ack) {
  flatbuffers::FlatBufferBuilder builder(64);
  const auto offset = afps::protocol::CreatePong(builder, pong.client_time_ms);
  builder.Finish(offset);
  return EncodeEnvelope(MessageType::Pong, builder.GetBufferPointer(), builder.GetSize(), msg_seq, server_seq_ack);
}

std::vector<uint8_t> BuildGameEvent(const GameEvent &event, uint32_t msg_seq, uint32_t server_seq_ack) {
  flatbuffers::FlatBufferBuilder builder(192);
  const auto target_id = event.target_id.empty() ? 0 : builder.CreateString(event.target_id);
  const auto owner_id = event.owner_id.empty() ? 0 : builder.CreateString(event.owner_id);
  const auto offset = afps::protocol::CreateGameEvent(
      builder,
      ToGameEventType(event.event),
      target_id,
      owner_id,
      event.projectile_id,
      event.damage,
      event.killed,
      event.pos_x,
      event.pos_y,
      event.pos_z,
      event.vel_x,
      event.vel_y,
      event.vel_z,
      event.ttl);
  builder.Finish(offset);
  return EncodeEnvelope(MessageType::GameEvent, builder.GetBufferPointer(), builder.GetSize(), msg_seq, server_seq_ack);
}

std::vector<uint8_t> BuildWeaponFiredEvent(const WeaponFiredEvent &event, uint32_t msg_seq,
                                           uint32_t server_seq_ack) {
  flatbuffers::FlatBufferBuilder builder(256);
  const auto shooter_id = builder.CreateString(event.shooter_id);
  const auto weapon_id = builder.CreateString(event.weapon_id);
  const auto offset = afps::protocol::CreateWeaponFiredEvent(
      builder,
      shooter_id,
      weapon_id,
      event.weapon_slot,
      event.server_tick,
      event.shot_seq,
      event.muzzle_pos_x,
      event.muzzle_pos_y,
      event.muzzle_pos_z,
      event.dir_x,
      event.dir_y,
      event.dir_z,
      event.dry_fire,
      event.casing_enabled,
      event.casing_pos_x,
      event.casing_pos_y,
      event.casing_pos_z,
      event.casing_rot_x,
      event.casing_rot_y,
      event.casing_rot_z,
      event.casing_vel_x,
      event.casing_vel_y,
      event.casing_vel_z,
      event.casing_ang_x,
      event.casing_ang_y,
      event.casing_ang_z,
      event.casing_seed);
  builder.Finish(offset);
  return EncodeEnvelope(MessageType::WeaponFiredEvent, builder.GetBufferPointer(), builder.GetSize(), msg_seq,
                        server_seq_ack);
}

std::vector<uint8_t> BuildWeaponReloadEvent(const WeaponReloadEvent &event, uint32_t msg_seq,
                                            uint32_t server_seq_ack) {
  flatbuffers::FlatBufferBuilder builder(128);
  const auto shooter_id = builder.CreateString(event.shooter_id);
  const auto weapon_id = builder.CreateString(event.weapon_id);
  const auto offset = afps::protocol::CreateWeaponReloadEvent(
      builder,
      shooter_id,
      weapon_id,
      event.weapon_slot,
      event.server_tick,
      event.reload_seconds);
  builder.Finish(offset);
  return EncodeEnvelope(MessageType::WeaponReloadEvent, builder.GetBufferPointer(), builder.GetSize(), msg_seq,
                        server_seq_ack);
}

std::vector<uint8_t> BuildStateSnapshot(const StateSnapshot &snapshot, uint32_t msg_seq,
                                        uint32_t server_seq_ack) {
  flatbuffers::FlatBufferBuilder builder(256);
  const auto client_id = builder.CreateString(snapshot.client_id);
  const auto offset = afps::protocol::CreateStateSnapshot(
      builder,
      snapshot.server_tick,
      snapshot.last_processed_input_seq,
      client_id,
      snapshot.pos_x,
      snapshot.pos_y,
      snapshot.pos_z,
      snapshot.vel_x,
      snapshot.vel_y,
      snapshot.vel_z,
      snapshot.weapon_slot,
      snapshot.ammo_in_mag,
      snapshot.dash_cooldown,
      snapshot.health,
      snapshot.kills,
      snapshot.deaths);
  builder.Finish(offset);
  return EncodeEnvelope(MessageType::StateSnapshot, builder.GetBufferPointer(), builder.GetSize(), msg_seq,
                        server_seq_ack);
}

std::vector<uint8_t> BuildStateSnapshotDelta(const StateSnapshotDelta &delta, uint32_t msg_seq,
                                             uint32_t server_seq_ack) {
  flatbuffers::FlatBufferBuilder builder(256);
  const auto client_id = builder.CreateString(delta.client_id);
  const auto offset = afps::protocol::CreateStateSnapshotDelta(
      builder,
      delta.server_tick,
      delta.base_tick,
      delta.last_processed_input_seq,
      delta.mask,
      client_id,
      delta.pos_x,
      delta.pos_y,
      delta.pos_z,
      delta.vel_x,
      delta.vel_y,
      delta.vel_z,
      delta.weapon_slot,
      delta.ammo_in_mag,
      delta.dash_cooldown,
      delta.health,
      delta.kills,
      delta.deaths);
  builder.Finish(offset);
  return EncodeEnvelope(MessageType::StateSnapshotDelta, builder.GetBufferPointer(), builder.GetSize(), msg_seq,
                        server_seq_ack);
}

std::vector<uint8_t> BuildPlayerProfile(const PlayerProfile &profile, uint32_t msg_seq, uint32_t server_seq_ack) {
  flatbuffers::FlatBufferBuilder builder(128);
  const auto client_id = builder.CreateString(profile.client_id);
  const auto nickname = builder.CreateString(profile.nickname);
  const auto character_id = builder.CreateString(profile.character_id);
  const auto offset = afps::protocol::CreatePlayerProfile(builder, client_id, nickname, character_id);
  builder.Finish(offset);
  return EncodeEnvelope(MessageType::PlayerProfile, builder.GetBufferPointer(), builder.GetSize(), msg_seq,
                        server_seq_ack);
}
