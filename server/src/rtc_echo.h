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
  std::function<void(const std::string &, const std::string &)> on_message;
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

private:
  void AttachDataChannel(const std::shared_ptr<rtc::DataChannel> &channel);
  std::string PrimaryLabel();

  rtc::PeerConnection peer_;
  std::unordered_map<std::string, std::shared_ptr<rtc::DataChannel>> channels_;
  std::mutex channel_mutex_;
  std::string primary_label_;
  bool echo_incoming_ = true;
  RtcEchoCallbacks callbacks_;
};
