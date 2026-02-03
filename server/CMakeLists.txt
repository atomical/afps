cmake_minimum_required(VERSION 3.20)
project(afps_server LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_POLICY_VERSION_MINIMUM 3.5)

option(AFPS_ENABLE_HTTPS "Enable HTTPS server (requires OpenSSL)" ON)
option(AFPS_ENABLE_WEBRTC "Enable libdatachannel integration" ON)
option(AFPS_ENABLE_FUZZ "Enable libFuzzer targets" OFF)

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

  FetchContent_Declare(
    flatbuffers
    GIT_REPOSITORY https://github.com/google/flatbuffers.git
    GIT_TAG v25.12.19
  )
  set(FLATBUFFERS_BUILD_TESTS OFF CACHE BOOL "" FORCE)
  set(FLATBUFFERS_BUILD_FLATC OFF CACHE BOOL "" FORCE)
  set(FLATBUFFERS_BUILD_SHAREDLIB OFF CACHE BOOL "" FORCE)
  FetchContent_MakeAvailable(flatbuffers)
endif()

include(FetchContent)
FetchContent_Declare(
  rapidcheck
  GIT_REPOSITORY https://github.com/emil-e/rapidcheck.git
  GIT_TAG 9e4a55d77bffdd08fd4bd6bad5f93153a721d836
)
FetchContent_MakeAvailable(rapidcheck)

set(AFPS_SERVER_SOURCES
  src/auth.cpp
  src/character_manifest.cpp
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

target_include_directories(afps_server_lib PUBLIC src third_party ${CMAKE_CURRENT_SOURCE_DIR}/../shared
  ${CMAKE_CURRENT_SOURCE_DIR}/../shared/schema/generated/cpp)

if (AFPS_ENABLE_WEBRTC)
  target_link_libraries(afps_server_lib PUBLIC datachannel)
  target_link_libraries(afps_server_lib PUBLIC flatbuffers)
  target_compile_definitions(afps_server_lib PUBLIC AFPS_ENABLE_WEBRTC)
endif()

add_executable(afps_server src/main.cpp)

if (AFPS_ENABLE_HTTPS)
  find_package(OpenSSL REQUIRED)
  target_compile_definitions(afps_server_lib PUBLIC AFPS_ENABLE_OPENSSL)
  target_link_libraries(afps_server_lib PUBLIC OpenSSL::Crypto)
  target_compile_definitions(afps_server PRIVATE CPPHTTPLIB_OPENSSL_SUPPORT)
  target_link_libraries(afps_server PRIVATE OpenSSL::SSL OpenSSL::Crypto)
endif()

target_link_libraries(afps_server PRIVATE afps_server_lib)

add_executable(afps_server_loadtest src/load_test.cpp)
target_link_libraries(afps_server_loadtest PRIVATE afps_server_lib)

if (AFPS_ENABLE_FUZZ AND AFPS_ENABLE_WEBRTC)
  add_executable(afps_fuzz_protocol fuzz/fuzz_protocol.cpp)
  target_link_libraries(afps_fuzz_protocol PRIVATE afps_server_lib)
  target_compile_options(afps_fuzz_protocol PRIVATE -fsanitize=fuzzer,address,undefined -fno-omit-frame-pointer)
  target_link_options(afps_fuzz_protocol PRIVATE -fsanitize=fuzzer,address,undefined)
endif()

enable_testing()
configure_file(${CMAKE_CURRENT_SOURCE_DIR}/CTestCustom.cmake
  ${CMAKE_CURRENT_BINARY_DIR}/CTestCustom.cmake
  COPYONLY)

set(AFPS_SERVER_TEST_SOURCES
  tests/main.cpp
  tests/test_auth.cpp
  tests/test_combat.cpp
  tests/test_config.cpp
  tests/test_health.cpp
  tests/test_property.cpp
  tests/test_rate_limiter.cpp
  tests/test_security_headers.cpp
  tests/test_shared_sim.cpp
  tests/test_snapshot_bandwidth.cpp
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

target_link_libraries(afps_server_tests PRIVATE afps_server_lib rapidcheck)

add_test(NAME afps_server_tests COMMAND afps_server_tests)

get_property(afps_all_tests GLOBAL PROPERTY TESTS)
foreach(test_name IN LISTS afps_all_tests)
  if (test_name STREQUAL "flattests" OR test_name STREQUAL "flattests_cpp17")
    set_tests_properties(${test_name} PROPERTIES DISABLED TRUE)
  endif()
endforeach()
