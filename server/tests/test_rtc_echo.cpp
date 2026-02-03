#include "doctest.h"

#include "rtc_echo.h"

#include <chrono>
#include <condition_variable>
#include <mutex>

TEST_CASE("RtcEchoPeer performs a loopback message exchange") {
  rtc::InitLogger(rtc::LogLevel::None);

  rtc::Configuration config;
  config.iceServers.clear();

  RtcEchoPeer offerer(config, false);
  RtcEchoPeer answerer(config, true);

  std::mutex mutex;
  std::condition_variable cv;
  bool opened = false;
  bool echoed = false;

  offerer.SetCallbacks({
      [&](const rtc::Description &description) {
        answerer.SetRemoteDescription(description);
        answerer.SetLocalDescription();
      },
      [&](const rtc::Candidate &candidate) { answerer.AddRemoteCandidate(candidate); },
      [&]() {
        std::scoped_lock lock(mutex);
        opened = true;
        offerer.Send("ping");
      },
      nullptr,
      [&](const std::string &label, const std::string &message) {
        std::scoped_lock lock(mutex);
        echoed = (label == "echo" && message == "ping");
        cv.notify_all();
      }});

  answerer.SetCallbacks({
      [&](const rtc::Description &description) { offerer.SetRemoteDescription(description); },
      [&](const rtc::Candidate &candidate) { offerer.AddRemoteCandidate(candidate); },
      nullptr,
      nullptr,
      nullptr});

  offerer.CreateDataChannel("echo");
  offerer.SetLocalDescription();

  std::unique_lock lock(mutex);
  const bool completed = cv.wait_for(lock, std::chrono::seconds(5), [&] {
    return opened && echoed;
  });

  CHECK(completed);
}
