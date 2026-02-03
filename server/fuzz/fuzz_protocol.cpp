#include "protocol.h"

#include <string>
#include <vector>

extern "C" int LLVMFuzzerTestOneInput(const uint8_t *data, size_t size) {
  std::vector<uint8_t> message;
  message.reserve(size);
  message.insert(message.end(), data, data + size);

  DecodedEnvelope envelope;
  std::string error;
  if (!DecodeEnvelope(message, envelope, error)) {
    return 0;
  }

  switch (envelope.header.type) {
    case MessageType::ClientHello: {
      ClientHello hello;
      ParseClientHelloPayload(envelope.payload, hello, error);
      break;
    }
    case MessageType::InputCmd: {
      InputCmd cmd;
      ParseInputCmdPayload(envelope.payload, cmd, error);
      break;
    }
    case MessageType::Ping: {
      Ping ping;
      ParsePingPayload(envelope.payload, ping, error);
      break;
    }
    default:
      break;
  }

  return 0;
}
