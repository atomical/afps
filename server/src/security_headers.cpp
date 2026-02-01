#include "security_headers.h"

httplib::Headers BuildSecurityHeaders() {
  httplib::Headers headers;
  headers.emplace("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  return headers;
}
