"""Copy this file to `parsers/<your_agent>.py` and fill in the seven names.

This file is `_`-prefixed, so the loader skips it. Your copy must not be.

Adding an agent is one new file and nothing else. There is no registration list
to append to, no import to add, no schema to extend. That is deliberate: a
central list would put every contributor's pull request in the same file, and
every pull request would conflict.

------------------------------------------------------------------------------
The contract
------------------------------------------------------------------------------
    AGENT_ID    str   stable key; also the `source` column value
    AGENT_NAME  str   shown in the UI
    HOMEPAGE    str   linked from the source panel
    PRIORITY    int   higher wins if two parsers claim the same agent
    detect()    -> bool
    discover()  -> list[Path]
    parse(path, cursor) -> (Iterator[UsageRecord], new_cursor)

------------------------------------------------------------------------------
Four rules that are worth more than the rest of this file
------------------------------------------------------------------------------
1. **Dedupe.** If your agent writes several lines per API response — most do,
   one per content block — they carry the *same* usage object. Summing them
   overcounts, in one measured case by 3.4x. Emit one record per request.

2. **NULL is not zero.** If your agent does not report a counter, leave it
   `None`. `0` claims it reported zero. An agent with no cache-write counter
   rendered as `0` tells the reader its cache writes were free.

3. **The bare "input" field is usually not the input.** Anthropic's
   `input_tokens` is the *uncached remainder*; the real input includes cache
   reads and cache writes. Check what your agent means before you map it.

4. **Never emit message content.** Session files hold source code, prompts and
   secrets. Numeric counters and the short envelope only. The writer filters
   `extra_json` against a whitelist, so anything else you put there is dropped
   — but do not rely on that; do not read it in the first place.

------------------------------------------------------------------------------
Before you open a pull request
------------------------------------------------------------------------------
    python -m parsers._template scrub <real-session-file> parsers/tests/<agent>/session.jsonl
    python -m parsers.conformance

A fixture is required, and it must be redacted — scrub it *first*, then read
what came out before you commit it. See parsers/CONTRIBUTING.md.
"""

import json
from pathlib import Path

from . import UsageRecord

AGENT_ID = "template"
AGENT_NAME = "Template Agent"
HOMEPAGE = "https://example.com/your-agent"
PRIORITY = 50

# Bump when the meaning of what you emit changes. It travels inside the cursor
# (see _read_cursor below), which makes every file re-read once after a bump —
# the corrected rows then replace the old ones by primary key.
PARSE_VERSION = 1


def detect() -> bool:
    """Is this agent present on this machine?

    Cheap — a path test. This runs on every refresh, for every parser, before
    anything is read. Do not shell out, do not open a database, do not import a
    heavy library at module scope to answer it.
    """
    return (Path.home() / ".your-agent").is_dir()


def discover() -> list[Path]:
    """The session files or databases this parser owns.

    Called on every refresh. Return everything you can read; the framework
    decides which ones are stale and skips the rest by size and mtime, so you
    do not need to filter for freshness here.
    """
    root = Path.home() / ".your-agent" / "sessions"
    if not root.is_dir():
        return []
    return sorted(root.rglob("*.jsonl"))


def parse(path: Path, cursor: str | None):
    """Yield records added since `cursor`, and return the new cursor.

    `cursor` is opaque to the framework — you define it. A JSONL parser stores
    a byte offset and resumes with seek(). A SQLite-backed agent stores a max
    rowid. A protobuf store might need something else entirely. `None` means
    read the whole source.

    Getting the cursor wrong costs time, never correctness: `request_id` is the
    primary key and inserts are OR IGNORE, so a resume that is too early
    re-reads rows that are already there and inserts nothing.
    """
    start = _read_cursor(cursor)
    records, offset = [], start
    seen = set()

    with open(path, "rb") as f:
        f.seek(start)
        for raw in f:
            if not raw.endswith(b"\n"):
                break                      # partial line: the agent is mid-write
            offset += len(raw)
            try:
                o = json.loads(raw)
            except (json.JSONDecodeError, UnicodeDecodeError):
                continue                   # fail soft: skip the line, never raise

            usage = (o.get("message") or {}).get("usage")
            if not isinstance(usage, dict):
                continue

            request_id = o.get("requestId")
            if not request_id:
                # No request identity of its own: synthesize a *stable* hash.
                # The same line must produce the same id on every run, or
                # re-import stops being idempotent.
                import hashlib
                request_id = "syn_" + hashlib.sha256(
                    f"{o.get('sessionId')}|{o.get('uuid')}".encode()
                ).hexdigest()[:24]
            if request_id in seen:
                continue                   # rule 1: one record per request
            seen.add(request_id)

            records.append(UsageRecord(
                request_id=request_id,
                timestamp=o["timestamp"],           # ISO-8601 UTC
                source=AGENT_ID,
                session_id=o.get("sessionId"),
                model_id=o.get("model"),            # must match llm_registry to be priced
                repo_name=_repo_from_cwd(o.get("cwd")),
                branch_name=o.get("gitBranch"),
                input_tokens=usage.get("input_tokens"),        # uncached remainder only
                cache_read_tokens=usage.get("cache_read_input_tokens"),
                cache_write_5m=None,                # rule 2: None, not 0, if unreported
                cache_write_1h=None,
                output_tokens=usage.get("output_tokens"),
                service_tier=usage.get("service_tier"),
                speed=None,
                extra_json=None,
            ))

    return iter(records), _write_cursor(offset)


# --- cursor helpers ---------------------------------------------------------

def _read_cursor(cursor: str | None) -> int:
    if not cursor:
        return 0
    try:
        c = json.loads(cursor)
        if c.get("parser") == AGENT_ID and c.get("parse_version") == PARSE_VERSION:
            off = c.get("offset")
            if isinstance(off, int) and off >= 0:
                return off
    except (json.JSONDecodeError, AttributeError, TypeError):
        pass
    return 0                               # unrecognised cursor: read it all again


def _write_cursor(offset: int) -> str:
    return json.dumps({"parser": AGENT_ID, "parse_version": PARSE_VERSION,
                       "offset": offset}, separators=(",", ":"))


def _repo_from_cwd(cwd):
    """Nearest ancestor containing .git, else the directory name."""
    if not cwd:
        return None
    p = Path(cwd)
    for d in (p, *p.parents):
        if (d / ".git").exists():
            return d.name
    return p.name or None


# --- the scrubber -----------------------------------------------------------
#
# Step one of contributing a fixture. Session files contain source code,
# prompts, and whatever secrets passed through them; a fixture is committed to
# a public repository forever.
#
# This is a *whitelist*, not a blacklist — it keeps the handful of keys a
# parser reads and drops everything else, including `message.content` in its
# entirety. A blacklist of "sensitive-looking" keys would let the next format
# change quietly reintroduce a field nobody thought to ban.

KEEP_TOP = {"type", "timestamp", "requestId", "uuid", "sessionId", "cwd",
            "gitBranch", "isSidechain", "version", "entrypoint", "effort",
            "isApiErrorMessage"}
KEEP_MESSAGE = {"model", "role", "type", "usage"}
PLACEHOLDER_CWD = "/home/dev/example-repo"


def scrub_line(o: dict) -> dict | None:
    if not isinstance(o, dict):
        return None
    out = {k: v for k, v in o.items() if k in KEEP_TOP}
    if "cwd" in out:
        out["cwd"] = PLACEHOLDER_CWD          # the path carries a username
    msg = o.get("message")
    if isinstance(msg, dict):
        out["message"] = {k: v for k, v in msg.items() if k in KEEP_MESSAGE}
    return out or None


def scrub_file(src, dst) -> int:
    n = 0
    Path(dst).parent.mkdir(parents=True, exist_ok=True)
    with open(src, "rb") as fin, open(dst, "w", encoding="utf-8", newline="\n") as fout:
        for raw in fin:
            try:
                o = json.loads(raw)
            except (json.JSONDecodeError, UnicodeDecodeError):
                continue
            clean = scrub_line(o)
            if clean:
                fout.write(json.dumps(clean, separators=(",", ":")) + "\n")
                n += 1
    return n


if __name__ == "__main__":
    import sys
    if len(sys.argv) != 4 or sys.argv[1] != "scrub":
        sys.exit("usage: python -m parsers._template scrub <src.jsonl> <dst.jsonl>")
    count = scrub_file(sys.argv[2], sys.argv[3])
    print(f"wrote {count} scrubbed line(s) to {sys.argv[3]}")
    print("Read the output before committing it. Redaction is your "
          "responsibility, not the scrubber's.")
