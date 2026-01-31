#include "doctest.h"

#include "config.h"

TEST_CASE("ParseArgs parses required flags") {
  const char *argv[] = {
      "afps_server",
      "--host",
      "127.0.0.1",
      "--port",
      "9000",
      "--cert",
      "cert.pem",
      "--key",
      "key.pem",
      "--auth-token",
      "secret",
      "--ice",
      "stun:stun.example.com:3478"};
  const int argc = static_cast<int>(sizeof(argv) / sizeof(argv[0]));

  const auto result = ParseArgs(argc, argv);

  CHECK(result.errors.empty());
  CHECK(result.config.host == "127.0.0.1");
  CHECK(result.config.port == 9000);
  CHECK(result.config.cert_path == "cert.pem");
  CHECK(result.config.key_path == "key.pem");
  CHECK(result.config.auth_token == "secret");
  CHECK(result.config.ice_servers.size() == 1);
  CHECK(result.config.ice_servers[0] == "stun:stun.example.com:3478");
}

TEST_CASE("ParseArgs reports missing values") {
  const char *argv[] = {"afps_server", "--port"};
  const int argc = static_cast<int>(sizeof(argv) / sizeof(argv[0]));

  const auto result = ParseArgs(argc, argv);

  CHECK(result.errors.size() == 1);
  CHECK(result.errors[0] == "Missing value for --port");
}

TEST_CASE("ValidateConfig requires cert and key") {
  ServerConfig config;
  config.cert_path = "";
  config.key_path = "";
  config.auth_token = "";

  const auto errors = ValidateConfig(config);

  CHECK(errors.size() == 3);
}
