#pragma once

#include <functional>
#include <memory>
#include <mutex>
#include <string>
#include <unordered_map>

#include <rtc/rtc.hpp>

struct RtcEchoCallbacks {
  std::function<void(const rtc::Description &)> on_local_description;
  std::function<void(const rtc::Candidate &)> on_local_candidate;
  std::function<void()> on_channel_open;
  std::function<void()> on_channel_closed;
  std::function<void(const std::string &, const std::string &)> on_text_message;
  std::function<void(const std::string &, const rtc::binary &)> on_binary_message;
};

struct RtcEchoPeerState {
  std::mutex mutex;
  std::unordered_map<std::string, std::shared_ptr<rtc::DataChannel>> channels;
  std::string primary_label;
  bool echo_incoming = true;
  RtcEchoCallbacks callbacks;
};

class RtcEchoPeer {
public:
  RtcEchoPeer(const rtc::Configuration &config, bool echo_incoming);

  void SetCallbacks(RtcEchoCallbacks callbacks);
  void CreateDataChannel(const std::string &label);
  void CreateDataChannel(const std::string &label, const rtc::DataChannelInit &init);
  void SetLocalDescription();
  void SetRemoteDescription(const rtc::Description &description);
  void AddRemoteCandidate(const rtc::Candidate &candidate);
  void Close();

  bool Send(const std::string &message);
  bool SendOn(const std::string &label, const std::string &message);
  bool Send(const rtc::binary &message);
  bool SendOn(const std::string &label, const rtc::binary &message);

private:
  std::string PrimaryLabel();

  rtc::PeerConnection peer_;
  // Keep the callback state in a shared object so libdatachannel callbacks never capture `this`.
  // This prevents use-after-free when callbacks fire during teardown.
  std::shared_ptr<RtcEchoPeerState> state_;
};
