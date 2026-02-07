#include "protocol.h"

#include <algorithm>
#include <cmath>
#include <cstring>
#include <limits>
#include <type_traits>
#include <variant>

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
         value <= static_cast<uint16_t>(MessageType::SetLoadoutRequest);
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
  out.ads = cmd->ads();
  out.sprint = cmd->sprint();
  out.dash = cmd->dash();
  out.grapple = cmd->grapple();
  out.shield = cmd->shield();
  out.shockwave = cmd->shockwave();
  out.crouch = cmd->crouch();
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
  out.debug_enabled = req->debug_enabled();
  out.debug_player_pos_x = req->debug_player_pos_x();
  out.debug_player_pos_y = req->debug_player_pos_y();
  out.debug_player_pos_z = req->debug_player_pos_z();
  out.debug_view_yaw = req->debug_view_yaw();
  out.debug_view_pitch = req->debug_view_pitch();
  out.debug_projection_telemetry_enabled = req->debug_projection_telemetry_enabled();
  if (!IsFinite(out.origin_x) || !IsFinite(out.origin_y) || !IsFinite(out.origin_z) ||
      !IsFinite(out.dir_x) || !IsFinite(out.dir_y) || !IsFinite(out.dir_z) ||
      !IsFinite(out.debug_player_pos_x) || !IsFinite(out.debug_player_pos_y) ||
      !IsFinite(out.debug_player_pos_z) || !IsFinite(out.debug_view_yaw) ||
      !IsFinite(out.debug_view_pitch)) {
    error = "invalid_field: origin_dir";
    return false;
  }
  return true;
}

bool ParseSetLoadoutRequestPayload(const std::vector<uint8_t> &payload, SetLoadoutRequest &out,
                                   std::string &error) {
  const auto *req = VerifyPayload<afps::protocol::SetLoadoutRequest>(payload, error);
  if (!req) {
    return false;
  }
  out.loadout_bits = req->loadout_bits();
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
      nonce,
      hello.map_seed);
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

std::vector<uint8_t> BuildGameEventBatch(const GameEventBatch &event, uint32_t msg_seq,
                                         uint32_t server_seq_ack) {
  flatbuffers::FlatBufferBuilder builder(256);

  std::vector<afps::protocol::FxEvent> types;
  std::vector<flatbuffers::Offset<void>> payloads;
  types.reserve(event.events.size());
  payloads.reserve(event.events.size());

  for (const auto &entry : event.events) {
    std::visit(
        [&](const auto &typed) {
          using T = std::decay_t<decltype(typed)>;
          if constexpr (std::is_same_v<T, ShotFiredFx>) {
            if (typed.shooter_id.empty()) {
              return;
            }
            const auto shooter_id = builder.CreateString(typed.shooter_id);
            const auto offset = afps::protocol::CreateShotFiredFx(
                builder,
                shooter_id,
                typed.weapon_slot,
                typed.shot_seq,
                typed.dry_fire);
            types.push_back(afps::protocol::FxEvent::ShotFiredFx);
            payloads.push_back(offset.Union());
            return;
          }

          if constexpr (std::is_same_v<T, ShotTraceFx>) {
            if (typed.shooter_id.empty()) {
              return;
            }
            const auto shooter_id = builder.CreateString(typed.shooter_id);
            const auto offset = afps::protocol::CreateShotTraceFx(
                builder,
                shooter_id,
                typed.weapon_slot,
                typed.shot_seq,
                typed.dir_oct_x,
                typed.dir_oct_y,
                typed.hit_dist_q,
                static_cast<afps::protocol::HitKind>(typed.hit_kind),
                static_cast<afps::protocol::SurfaceType>(typed.surface_type),
                typed.normal_oct_x,
                typed.normal_oct_y,
                typed.show_tracer,
                typed.hit_pos_x_q,
                typed.hit_pos_y_q,
                typed.hit_pos_z_q);
            types.push_back(afps::protocol::FxEvent::ShotTraceFx);
            payloads.push_back(offset.Union());
            return;
          }

          if constexpr (std::is_same_v<T, ReloadFx>) {
            if (typed.shooter_id.empty()) {
              return;
            }
            const auto shooter_id = builder.CreateString(typed.shooter_id);
            const auto offset = afps::protocol::CreateReloadFx(
                builder,
                shooter_id,
                typed.weapon_slot);
            types.push_back(afps::protocol::FxEvent::ReloadFx);
            payloads.push_back(offset.Union());
            return;
          }

          if constexpr (std::is_same_v<T, NearMissFx>) {
            if (typed.shooter_id.empty()) {
              return;
            }
            const auto shooter_id = builder.CreateString(typed.shooter_id);
            const auto offset = afps::protocol::CreateNearMissFx(
                builder,
                shooter_id,
                typed.shot_seq,
                typed.strength);
            types.push_back(afps::protocol::FxEvent::NearMissFx);
            payloads.push_back(offset.Union());
            return;
          }

          if constexpr (std::is_same_v<T, OverheatFx>) {
            if (typed.shooter_id.empty()) {
              return;
            }
            const auto shooter_id = builder.CreateString(typed.shooter_id);
            const auto offset = afps::protocol::CreateOverheatFx(
                builder,
                shooter_id,
                typed.weapon_slot,
                typed.heat_q);
            types.push_back(afps::protocol::FxEvent::OverheatFx);
            payloads.push_back(offset.Union());
            return;
          }

          if constexpr (std::is_same_v<T, VentFx>) {
            if (typed.shooter_id.empty()) {
              return;
            }
            const auto shooter_id = builder.CreateString(typed.shooter_id);
            const auto offset = afps::protocol::CreateVentFx(
                builder,
                shooter_id,
                typed.weapon_slot);
            types.push_back(afps::protocol::FxEvent::VentFx);
            payloads.push_back(offset.Union());
            return;
          }

          if constexpr (std::is_same_v<T, HitConfirmedFx>) {
            if (typed.target_id.empty()) {
              return;
            }
            const auto target_id = builder.CreateString(typed.target_id);
            const auto offset = afps::protocol::CreateHitConfirmedFx(
                builder,
                target_id,
                typed.damage,
                typed.killed);
            types.push_back(afps::protocol::FxEvent::HitConfirmedFx);
            payloads.push_back(offset.Union());
            return;
          }

          if constexpr (std::is_same_v<T, KillFeedFx>) {
            if (typed.killer_id.empty() || typed.victim_id.empty()) {
              return;
            }
            const auto killer_id = builder.CreateString(typed.killer_id);
            const auto victim_id = builder.CreateString(typed.victim_id);
            const auto offset = afps::protocol::CreateKillFeedFx(
                builder,
                killer_id,
                victim_id);
            types.push_back(afps::protocol::FxEvent::KillFeedFx);
            payloads.push_back(offset.Union());
            return;
          }

          if constexpr (std::is_same_v<T, ProjectileSpawnFx>) {
            if (typed.shooter_id.empty()) {
              return;
            }
            const auto shooter_id = builder.CreateString(typed.shooter_id);
            const auto offset = afps::protocol::CreateProjectileSpawnFx(
                builder,
                shooter_id,
                typed.weapon_slot,
                typed.shot_seq,
                typed.projectile_id,
                typed.pos_x_q,
                typed.pos_y_q,
                typed.pos_z_q,
                typed.vel_x_q,
                typed.vel_y_q,
                typed.vel_z_q,
                typed.ttl_q);
            types.push_back(afps::protocol::FxEvent::ProjectileSpawnFx);
            payloads.push_back(offset.Union());
            return;
          }

          if constexpr (std::is_same_v<T, ProjectileImpactFx>) {
            const auto target_id = typed.target_id.empty() ? 0 : builder.CreateString(typed.target_id);
            const auto offset = afps::protocol::CreateProjectileImpactFx(
                builder,
                typed.projectile_id,
                typed.hit_world,
                target_id,
                typed.pos_x_q,
                typed.pos_y_q,
                typed.pos_z_q,
                typed.normal_oct_x,
                typed.normal_oct_y,
                static_cast<afps::protocol::SurfaceType>(typed.surface_type));
            types.push_back(afps::protocol::FxEvent::ProjectileImpactFx);
            payloads.push_back(offset.Union());
            return;
          }

          if constexpr (std::is_same_v<T, ProjectileRemoveFx>) {
            const auto offset = afps::protocol::CreateProjectileRemoveFx(
                builder,
                typed.projectile_id);
            types.push_back(afps::protocol::FxEvent::ProjectileRemoveFx);
            payloads.push_back(offset.Union());
            return;
          }

          if constexpr (std::is_same_v<T, PickupSpawnedFx>) {
            const auto offset = afps::protocol::CreatePickupSpawnedFx(
                builder,
                typed.pickup_id,
                static_cast<afps::protocol::PickupKind>(typed.kind),
                typed.pos_x_q,
                typed.pos_y_q,
                typed.pos_z_q,
                typed.weapon_slot,
                typed.amount);
            types.push_back(afps::protocol::FxEvent::PickupSpawnedFx);
            payloads.push_back(offset.Union());
            return;
          }

          if constexpr (std::is_same_v<T, PickupTakenFx>) {
            const auto taker_id = typed.taker_id.empty() ? 0 : builder.CreateString(typed.taker_id);
            const auto offset = afps::protocol::CreatePickupTakenFx(
                builder,
                typed.pickup_id,
                taker_id,
                typed.server_tick);
            types.push_back(afps::protocol::FxEvent::PickupTakenFx);
            payloads.push_back(offset.Union());
            return;
          }
        },
        entry);
  }

  const auto types_vec = builder.CreateVector(types);
  const auto payloads_vec = builder.CreateVector(payloads);
  const auto offset = afps::protocol::CreateGameEvent(
      builder,
      event.server_tick,
      types_vec,
      payloads_vec);
  builder.Finish(offset);
  return EncodeEnvelope(MessageType::GameEvent, builder.GetBufferPointer(), builder.GetSize(), msg_seq, server_seq_ack);
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
      snapshot.deaths,
      snapshot.view_yaw_q,
      snapshot.view_pitch_q,
      snapshot.player_flags,
      snapshot.weapon_heat_q,
      snapshot.loadout_bits);
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
      delta.deaths,
      delta.view_yaw_q,
      delta.view_pitch_q,
      delta.player_flags,
      delta.weapon_heat_q,
      delta.loadout_bits);
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
