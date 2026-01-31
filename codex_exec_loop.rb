#!/usr/bin/env ruby
# codex_exec_loop.rb
# Usage:
#   ruby codex_exec_loop.rb <SESSION_ID> "<PROMPT>"
#
# Env vars (optional):
#   CODEX_BIN=codex   # path/name of codex binary
#   COUNT=0           # number of loops; 0=infinite
#   DELAY=0           # seconds to sleep between loops
#   USE_STDIN=0       # 1 to pipe prompt via stdin instead of argv
#   STOP_ON_ERROR=0   # 1 to exit on first nonzero exit status
#
# NOTE: This script uses --dangerously-bypass-approvals-and-sandbox on purpose.

require "open3"
require "io/console"

def usage!
  abort <<~TXT
    Usage:
      #{File.basename($0)} <SESSION_ID> "<PROMPT>"
    Example:
      #{File.basename($0)} 019a0e4a-21cf-7fd1-9616-370b66157436 "Continue with the 1:1 port of the 'siege' directory. Stop when complete."
  TXT
end

session_id, *rest = ARGV
usage! unless session_id && !rest.empty?
prompt = rest.join(" ")

codex_bin     = ENV.fetch("CODEX_BIN", "codex")
count         = Integer(ENV.fetch("COUNT", "0")) rescue 0
delay_s       = Float(ENV.fetch("DELAY", "0"))   rescue 0.0
use_stdin     = ENV.fetch("USE_STDIN", "0") == "1"
stop_on_error = ENV.fetch("STOP_ON_ERROR", "0") == "1"

danger_flag = "--dangerously-bypass-approvals-and-sandbox"

puts "Session: #{session_id}"
puts "Prompt:  #{prompt}"
puts "Loops:   #{count.zero? ? 'infinite' : count}"
puts "Delay:   #{delay_s}s"
puts "Mode:    #{use_stdin ? 'stdin' : 'argv'}"
puts "Flag:    #{danger_flag}"

stop = false
stop_after_round = false
notified_exit_after_round = false
Signal.trap("INT")  { stop = true; puts "\nStopping (INT)..." }
Signal.trap("TERM") { stop = true; puts "\nStopping (TERM)..." }

if STDIN.tty?
  Thread.new do
    loop do
      begin
        ch = STDIN.getch
      rescue IOError
        break
      end
      next unless ch
      if ch.downcase == "q"
        stop_after_round = true
        unless notified_exit_after_round
          puts "\nExit requested. Will exit after this round finishes."
          notified_exit_after_round = true
        end
      end
    end
  end
end

i = 0
loop do
  break if stop
  break if stop_after_round
  if count > 0 && i >= count
    puts "Reached loop limit (#{count})."
    break
  end

  puts "[#{Time.now.strftime('%H:%M:%S')}] ▶ #{codex_bin} exec #{danger_flag} resume #{session_id} (loop #{i+1})"

  ok =
    if use_stdin
      Open3.popen2e(codex_bin, "exec", danger_flag, "resume", session_id) do |stdin, stdout_err, wait_thr|
        stdin.puts prompt
        stdin.close
        stdout_err.each { |line| print line }
        wait_thr.value.success?
      end
    else
      system(codex_bin, "exec", danger_flag, "resume", session_id, prompt)
    end

  unless ok
    warn "[warn] exec failed (exit #{($?.exitstatus rescue 'unknown')})"
    exit($?.exitstatus || 1) if stop_on_error
  end

  i += 1
  break if stop
  break if stop_after_round
  sleep delay_s if delay_s.positive?
end

puts "Done. Loops: #{i}"
