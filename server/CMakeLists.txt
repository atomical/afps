cmake_minimum_required(VERSION 3.20)
project(afps_server LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_POLICY_VERSION_MINIMUM 3.5)

option(AFPS_ENABLE_HTTPS "Enable HTTPS server (requires OpenSSL)" ON)
option(AFPS_ENABLE_WEBRTC "Enable libdatachannel integration" ON)

if (AFPS_ENABLE_WEBRTC)
  include(FetchContent)
  set(NO_EXAMPLES ON CACHE BOOL "" FORCE)
  set(NO_TESTS ON CACHE BOOL "" FORCE)
  set(NO_MEDIA ON CACHE BOOL "" FORCE)
  set(NO_WEBSOCKET ON CACHE BOOL "" FORCE)
  FetchContent_Declare(
    libdatachannel
    GIT_REPOSITORY https://github.com/paullouisageneau/libdatachannel.git
    GIT_TAG v0.21.1
  )
  FetchContent_MakeAvailable(libdatachannel)
endif()

set(AFPS_SERVER_SOURCES
  src/auth.cpp
  src/combat.cpp
  src/config.cpp
  src/health.cpp
  src/rate_limiter.cpp
  src/security_headers.cpp
  src/tick.cpp
  src/usage.cpp
)

if (AFPS_ENABLE_WEBRTC)
  list(APPEND AFPS_SERVER_SOURCES
    src/protocol.cpp
    src/rtc_echo.cpp
    src/signaling.cpp
    src/signaling_json.cpp
  )
endif()

add_library(afps_server_lib ${AFPS_SERVER_SOURCES})

target_include_directories(afps_server_lib PUBLIC src third_party ${CMAKE_CURRENT_SOURCE_DIR}/../shared)

if (AFPS_ENABLE_WEBRTC)
  target_link_libraries(afps_server_lib PUBLIC datachannel)
  target_compile_definitions(afps_server_lib PUBLIC AFPS_ENABLE_WEBRTC)
endif()

add_executable(afps_server src/main.cpp)

if (AFPS_ENABLE_HTTPS)
  find_package(OpenSSL REQUIRED)
  target_compile_definitions(afps_server PRIVATE CPPHTTPLIB_OPENSSL_SUPPORT)
  target_link_libraries(afps_server PRIVATE OpenSSL::SSL OpenSSL::Crypto)
endif()

target_link_libraries(afps_server PRIVATE afps_server_lib)

enable_testing()

set(AFPS_SERVER_TEST_SOURCES
  tests/main.cpp
  tests/test_auth.cpp
  tests/test_combat.cpp
  tests/test_config.cpp
  tests/test_health.cpp
  tests/test_rate_limiter.cpp
  tests/test_security_headers.cpp
  tests/test_shared_sim.cpp
  tests/test_tick.cpp
  tests/test_usage.cpp
)

if (AFPS_ENABLE_WEBRTC)
  list(APPEND AFPS_SERVER_TEST_SOURCES
    tests/test_protocol.cpp
    tests/test_rtc_echo.cpp
    tests/test_signaling.cpp
    tests/test_signaling_json.cpp
  )
endif()

add_executable(afps_server_tests ${AFPS_SERVER_TEST_SOURCES})

target_include_directories(afps_server_tests PRIVATE third_party)

target_link_libraries(afps_server_tests PRIVATE afps_server_lib)

add_test(NAME afps_server_tests COMMAND afps_server_tests)
