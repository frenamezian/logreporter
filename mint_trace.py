#!/usr/bin/env python3
"""Mint a unique trace_id for a new task.

Only the LEAD ARCHITECT calls this. Subagents never mint a trace — they
reuse the trace_id passed to them by the lead and set parent_trace_id.

Usage:
  python mint_trace.py            # prints an 8-char hex trace_id, e.g. 9f2c41a8
  python mint_trace.py --len 12    # longer trace (default 8)

Exit 0, prints the trace_id on stdout (nothing else). Designed to be
captured by the lead architect and passed to every log_activity.py call
and every subagent dispatch for the same task.
"""
import argparse
import secrets


def main():
    p = argparse.ArgumentParser(description="Mint a unique trace_id (lead architect only)")
    p.add_argument("--len", type=int, default=8,
                   help="number of hex characters (default 8, minimum 8)")
    args = p.parse_args()
    n = max(8, args.len)
    # token_hex(n//2) gives n hex chars; ensure even count
    nbytes = (n + 1) // 2
    print(secrets.token_hex(nbytes)[:n])


if __name__ == "__main__":
    main()
