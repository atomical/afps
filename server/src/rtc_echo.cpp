#include "rtc_echo.h"

#include <utility>

namespace {
using State = RtcEchoPeerState;

void AttachDataChannel(const std::shared_ptr<State> &state, const std::shared_ptr<rtc::DataChannel> &channel) {
  const auto label = channel->label();
  {
    std::scoped_lock lock(state->mutex);
    state->channels[label] = channel;
    if (state->primary_label.empty()) {
      state->primary_label = label;
    }
  }

  std::weak_ptr<State> weak_state = state;

  channel->onOpen([weak_state]() {
    const auto locked = weak_state.lock();
    if (!locked) {
      return;
    }
    std::function<void()> cb;
    {
      std::scoped_lock lock(locked->mutex);
      cb = locked->callbacks.on_channel_open;
    }
    if (cb) {
      cb();
    }
  });

  channel->onClosed([weak_state]() {
    const auto locked = weak_state.lock();
    if (!locked) {
      return;
    }
    std::function<void()> cb;
    {
      std::scoped_lock lock(locked->mutex);
      cb = locked->callbacks.on_channel_closed;
    }
    if (cb) {
      cb();
    }
  });

  channel->onMessage([weak_state, channel, label](rtc::message_variant message) {
    const auto locked = weak_state.lock();
    if (!locked) {
      return;
    }

    bool echo_incoming = true;
    std::function<void(const std::string &, const std::string &)> on_text_message;
    std::function<void(const std::string &, const rtc::binary &)> on_binary_message;
    {
      std::scoped_lock lock(locked->mutex);
      echo_incoming = locked->echo_incoming;
      on_text_message = locked->callbacks.on_text_message;
      on_binary_message = locked->callbacks.on_binary_message;
    }

    if (const auto text = std::get_if<std::string>(&message)) {
      if (echo_incoming && channel->isOpen()) {
        try {
          channel->send(*text);
        } catch (...) {
          // ignore send failures during teardown
        }
      }
      if (on_text_message) {
        on_text_message(label, *text);
      }
      return;
    }

    if (const auto binary = std::get_if<rtc::binary>(&message)) {
      if (echo_incoming && channel->isOpen()) {
        try {
          channel->send(*binary);
        } catch (...) {
          // ignore send failures during teardown
        }
      }
      if (on_binary_message) {
        on_binary_message(label, *binary);
      }
    }
  });
}
}  // namespace

RtcEchoPeer::RtcEchoPeer(const rtc::Configuration &config, bool echo_incoming)
    : peer_(config), state_(std::make_shared<State>()) {
  state_->echo_incoming = echo_incoming;
  std::weak_ptr<State> weak_state = state_;

  peer_.onLocalDescription([weak_state](const rtc::Description &description) {
    const auto locked = weak_state.lock();
    if (!locked) {
      return;
    }
    std::function<void(const rtc::Description &)> cb;
    {
      std::scoped_lock lock(locked->mutex);
      cb = locked->callbacks.on_local_description;
    }
    if (cb) {
      cb(description);
    }
  });

  peer_.onLocalCandidate([weak_state](const rtc::Candidate &candidate) {
    const auto locked = weak_state.lock();
    if (!locked) {
      return;
    }
    std::function<void(const rtc::Candidate &)> cb;
    {
      std::scoped_lock lock(locked->mutex);
      cb = locked->callbacks.on_local_candidate;
    }
    if (cb) {
      cb(candidate);
    }
  });

  peer_.onDataChannel([weak_state](const std::shared_ptr<rtc::DataChannel> &channel) {
    const auto locked = weak_state.lock();
    if (!locked) {
      return;
    }
    AttachDataChannel(locked, channel);
  });
}

void RtcEchoPeer::SetCallbacks(RtcEchoCallbacks callbacks) {
  std::scoped_lock lock(state_->mutex);
  state_->callbacks = std::move(callbacks);
}

void RtcEchoPeer::CreateDataChannel(const std::string &label) {
  AttachDataChannel(state_, peer_.createDataChannel(label));
}

void RtcEchoPeer::CreateDataChannel(const std::string &label, const rtc::DataChannelInit &init) {
  AttachDataChannel(state_, peer_.createDataChannel(label, init));
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
    std::scoped_lock lock(state_->mutex);
    auto iter = state_->channels.find(label);
    if (iter == state_->channels.end()) {
      return false;
    }
    channel = iter->second;
  }
  if (!channel || !channel->isOpen()) {
    return false;
  }
  try {
    channel->send(message);
    return true;
  } catch (...) {
    // libdatachannel may throw if the SCTP transport is torn down mid-send.
    return false;
  }
}

bool RtcEchoPeer::Send(const rtc::binary &message) {
  return SendOn(PrimaryLabel(), message);
}

bool RtcEchoPeer::SendOn(const std::string &label, const rtc::binary &message) {
  if (label.empty()) {
    return false;
  }
  std::shared_ptr<rtc::DataChannel> channel;
  {
    std::scoped_lock lock(state_->mutex);
    auto iter = state_->channels.find(label);
    if (iter == state_->channels.end()) {
      return false;
    }
    channel = iter->second;
  }
  if (!channel || !channel->isOpen()) {
    return false;
  }
  try {
    channel->send(message);
    return true;
  } catch (...) {
    return false;
  }
}

std::string RtcEchoPeer::PrimaryLabel() {
  std::scoped_lock lock(state_->mutex);
  return state_->primary_label;
}
