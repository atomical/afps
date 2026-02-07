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
      "stun:stun.example.com:3478",
      "--turn-secret",
      "turnsecret",
      "--turn-user",
      "afps",
      "--turn-ttl",
      "600",
      "--snapshot-keyframe-interval",
      "3",
      "--map-seed",
      "42",
      "--map-mode",
      "legacy"};
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
  CHECK(result.config.turn_secret == "turnsecret");
  CHECK(result.config.turn_user == "afps");
  CHECK(result.config.turn_ttl_seconds == 600);
  CHECK(result.config.snapshot_keyframe_interval == 3);
  CHECK(result.config.map_seed == 42u);
  CHECK(result.config.map_mode == "legacy");
  CHECK(result.config.use_https);
}

TEST_CASE("ParseArgs reports missing values") {
  const char *argv[] = {"afps_server", "--port"};
  const int argc = static_cast<int>(sizeof(argv) / sizeof(argv[0]));

  const auto result = ParseArgs(argc, argv);

  CHECK(result.errors.size() == 1);
  CHECK(result.errors[0] == "Missing value for --port");
}

TEST_CASE("ValidateConfig requires cert and key when HTTPS") {
  ServerConfig config;
  config.cert_path = "";
  config.key_path = "";
  config.auth_token = "";

  const auto errors = ValidateConfig(config);

  CHECK(errors.size() == 3);
}

TEST_CASE("ValidateConfig skips cert and key when HTTP") {
  ServerConfig config;
  config.use_https = false;
  config.cert_path = "";
  config.key_path = "";
  config.auth_token = "";

  const auto errors = ValidateConfig(config);

  CHECK(errors.size() == 1);
}

TEST_CASE("ValidateConfig requires TURN ttl when secret set") {
  ServerConfig config;
  config.use_https = false;
  config.auth_token = "secret";
  config.turn_secret = "turnsecret";
  config.turn_ttl_seconds = 0;

  const auto errors = ValidateConfig(config);

  CHECK(errors.size() == 1);
  CHECK(errors[0].find("TURN TTL") != std::string::npos);
}

TEST_CASE("ParseArgs accepts --http") {
  const char *argv[] = {
      "afps_server",
      "--http",
      "--auth-token",
      "secret"};
  const int argc = static_cast<int>(sizeof(argv) / sizeof(argv[0]));

  const auto result = ParseArgs(argc, argv);

  CHECK(result.errors.empty());
  CHECK(result.config.use_https == false);
  CHECK(result.config.auth_token == "secret");
}

TEST_CASE("ParseArgs accepts --character-manifest") {
  const char *argv[] = {
      "afps_server",
      "--character-manifest",
      "manifest.json",
      "--auth-token",
      "secret"};
  const int argc = static_cast<int>(sizeof(argv) / sizeof(argv[0]));

  const auto result = ParseArgs(argc, argv);

  CHECK(result.errors.empty());
  CHECK(result.config.character_manifest_path == "manifest.json");
}

TEST_CASE("ParseArgs accepts static map mode + manifest") {
  const char *argv[] = {
      "afps_server",
      "--map-mode",
      "static",
      "--map-manifest",
      "map.json",
      "--auth-token",
      "secret"};
  const int argc = static_cast<int>(sizeof(argv) / sizeof(argv[0]));

  const auto result = ParseArgs(argc, argv);

  CHECK(result.errors.empty());
  CHECK(result.config.map_mode == "static");
  CHECK(result.config.map_manifest_path == "map.json");
}

TEST_CASE("ParseArgs accepts --dump-map-signature") {
  const char *argv[] = {
      "afps_server",
      "--dump-map-signature",
      "--map-mode",
      "legacy"};
  const int argc = static_cast<int>(sizeof(argv) / sizeof(argv[0]));

  const auto result = ParseArgs(argc, argv);

  CHECK(result.errors.empty());
  CHECK(result.config.dump_map_signature == true);
}

TEST_CASE("ValidateConfig requires static manifest path in static mode") {
  ServerConfig config;
  config.use_https = false;
  config.auth_token = "secret";
  config.map_mode = "static";
  config.map_manifest_path.clear();

  const auto errors = ValidateConfig(config);

  CHECK(errors.size() == 1);
  CHECK(errors[0].find("--map-manifest") != std::string::npos);
}

TEST_CASE("ValidateConfig skips auth and TLS requirements for map signature dump mode") {
  ServerConfig config;
  config.use_https = true;
  config.auth_token.clear();
  config.dump_map_signature = true;
  config.map_mode = "legacy";

  const auto errors = ValidateConfig(config);

  CHECK(errors.empty());
}
