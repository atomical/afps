#include "doctest.h"

#include "signaling_json.h"

TEST_CASE("ParseConnectRequest accepts valid payload") {
  const std::string body = R"({"sessionToken":"token"})";
  const auto result = ParseConnectRequest(body);

  CHECK(result.ok);
  CHECK(result.request.session_token == "token");
}

TEST_CASE("ParseConnectRequest rejects missing sessionToken") {
  const auto result = ParseConnectRequest("{}");

  CHECK_FALSE(result.ok);
  CHECK(result.error.find("sessionToken") != std::string::npos);
}

TEST_CASE("ParseAnswerRequest accepts nested answer") {
  const std::string body =
      R"({"sessionToken":"token","connectionId":"abc","answer":{"type":"answer","sdp":"v=0"}})";
  const auto result = ParseAnswerRequest(body);

  CHECK(result.ok);
  CHECK(result.request.type == "answer");
  CHECK(result.request.sdp == "v=0");
}

TEST_CASE("ParseCandidateRequest accepts sdpMid") {
  const std::string body =
      R"({"sessionToken":"token","connectionId":"abc","candidate":"cand","sdpMid":"0"})";
  const auto result = ParseCandidateRequest(body);

  CHECK(result.ok);
  CHECK(result.request.mid == "0");
}

TEST_CASE("BuildConnectResponse emits offer and ice") {
  ConnectionOffer offer{
      "id",
      rtc::Description("v=0", "offer"),
      {"stun:stun.example.com:3478"},
      "2026-01-31T00:00:00Z"
  };

  const auto payload = BuildConnectResponse(offer);

  CHECK(payload.find("connectionId") != std::string::npos);
  CHECK(payload.find("stun:stun.example.com:3478") != std::string::npos);
  CHECK(payload.find("offer") != std::string::npos);
}

TEST_CASE("BuildCandidatesResponse includes candidates") {
  std::vector<IceCandidate> candidates = {
      {"cand", "0"},
      {"cand2", "1"}
  };

  const auto payload = BuildCandidatesResponse(candidates);

  CHECK(payload.find("cand2") != std::string::npos);
  CHECK(payload.find("sdpMid") != std::string::npos);
}

TEST_CASE("BuildErrorResponse includes error code") {
  const auto payload = BuildErrorResponse("invalid_request", "bad");

  CHECK(payload.find("invalid_request") != std::string::npos);
  CHECK(payload.find("bad") != std::string::npos);
}
