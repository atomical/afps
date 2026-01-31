#pragma once

#include <string>
#include <vector>

#include "signaling.h"

struct ConnectRequest {
  std::string session_token;
};

struct AnswerRequest {
  std::string session_token;
  std::string connection_id;
  std::string sdp;
  std::string type;
};

struct CandidateRequest {
  std::string session_token;
  std::string connection_id;
  std::string candidate;
  std::string mid;
};

struct JsonParseResult {
  bool ok = false;
  std::string error;
};

struct JsonParseConnectResult : JsonParseResult {
  ConnectRequest request;
};

struct JsonParseAnswerResult : JsonParseResult {
  AnswerRequest request;
};

struct JsonParseCandidateResult : JsonParseResult {
  CandidateRequest request;
};

JsonParseConnectResult ParseConnectRequest(const std::string &body);
JsonParseAnswerResult ParseAnswerRequest(const std::string &body);
JsonParseCandidateResult ParseCandidateRequest(const std::string &body);

std::string BuildSessionResponse(const SessionInfo &session);
std::string BuildConnectResponse(const ConnectionOffer &offer);
std::string BuildCandidatesResponse(const std::vector<IceCandidate> &candidates);
std::string BuildOkResponse();
std::string BuildErrorResponse(const std::string &code, const std::string &message);
