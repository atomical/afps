#include "rtc_echo.h"

#include <utility>

RtcEchoPeer::RtcEchoPeer(const rtc::Configuration &config, bool echo_incoming)
    : peer_(config), echo_incoming_(echo_incoming) {
  peer_.onLocalDescription([this](const rtc::Description &description) {
    if (callbacks_.on_local_description) {
      callbacks_.on_local_description(description);
    }
  });

  peer_.onLocalCandidate([this](const rtc::Candidate &candidate) {
    if (callbacks_.on_local_candidate) {
      callbacks_.on_local_candidate(candidate);
    }
  });

  peer_.onDataChannel([this](const std::shared_ptr<rtc::DataChannel> &channel) {
    AttachDataChannel(channel);
  });
}

void RtcEchoPeer::SetCallbacks(RtcEchoCallbacks callbacks) {
  callbacks_ = std::move(callbacks);
}

void RtcEchoPeer::CreateDataChannel(const std::string &label) {
  AttachDataChannel(peer_.createDataChannel(label));
}

void RtcEchoPeer::CreateDataChannel(const std::string &label, const rtc::DataChannelInit &init) {
  AttachDataChannel(peer_.createDataChannel(label, init));
}

void RtcEchoPeer::SetLocalDescription() {
  peer_.setLocalDescription();
}

void RtcEchoPeer::SetRemoteDescription(const rtc::Description &description) {
  peer_.setRemoteDescription(description);
}

void RtcEchoPeer::AddRemoteCandidate(const rtc::Candidate &candidate) {
  peer_.addRemoteCandidate(candidate);
}

void RtcEchoPeer::Close() {
  peer_.close();
}

bool RtcEchoPeer::Send(const std::string &message) {
  return SendOn(PrimaryLabel(), message);
}

bool RtcEchoPeer::SendOn(const std::string &label, const std::string &message) {
  if (label.empty()) {
    return false;
  }
  std::shared_ptr<rtc::DataChannel> channel;
  {
    std::scoped_lock lock(channel_mutex_);
    auto iter = channels_.find(label);
    if (iter == channels_.end()) {
      return false;
    }
    channel = iter->second;
  }
  if (!channel || !channel->isOpen()) {
    return false;
  }
  channel->send(message);
  return true;
}

void RtcEchoPeer::AttachDataChannel(const std::shared_ptr<rtc::DataChannel> &channel) {
  const auto label = channel->label();
  {
    std::scoped_lock lock(channel_mutex_);
    channels_[label] = channel;
    if (primary_label_.empty()) {
      primary_label_ = label;
    }
  }

  channel->onOpen([this]() {
    if (callbacks_.on_channel_open) {
      callbacks_.on_channel_open();
    }
  });

  channel->onMessage([this, channel, label](rtc::message_variant message) {
    if (const auto text = std::get_if<std::string>(&message)) {
      if (echo_incoming_) {
        if (channel->isOpen()) {
          channel->send(*text);
        }
      }
      if (callbacks_.on_message) {
        callbacks_.on_message(label, *text);
      }
      return;
    }

    if (const auto binary = std::get_if<rtc::binary>(&message)) {
      if (echo_incoming_) {
        if (channel->isOpen()) {
          channel->send(*binary);
        }
      }
    }
  });
}

std::string RtcEchoPeer::PrimaryLabel() {
  std::scoped_lock lock(channel_mutex_);
  return primary_label_;
}
