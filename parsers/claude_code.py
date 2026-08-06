"""Usage from Claude Code's own session transcripts.

Where the data is
-----------------
`~/.claude/projects/<encoded-cwd>/<session-uuid>.jsonl`, one JSON object per
line, appended as the session runs. Subagent runs live one level deeper in
`<session-uuid>/subagents/agent-*.jsonl`, so discovery is recursive: a subagent
often runs a *different model* than its parent (sonnet under an opus lead), and
a top-level-only scan would omit that spend entirely while still presenting a
confident-looking total.

The two rules this parser exists to encode
------------------------------------------
1. **Dedupe on `requestId`.** One API response is written as several lines —
   one per content block — each carrying a byte-identical `usage` object.
   Summing lines overcounts by ~3.4x on a real session here. The dedupe is
   belt-and-braces: within a parse pass by the `seen` set, and across passes by
   `request_id` being the table's primary key.

2. **`input_tokens` is the uncached remainder, not the input.** In the sampled
   session it was 1,449 against a real input of ~1.09M. Total input is
   `input_tokens + cache_read + cache_write_5m + cache_write_1h`, computed at
   render time. This parser's job is to keep the four apart.

What is deliberately not extracted
----------------------------------
`message.content` — the prompts, the model's replies, tool arguments, file
contents and whatever secrets passed through them. This parser reads the
numeric counters and a short envelope, and nothing else in the line is ever
touched. Adding a field here means adding it to the whitelist in usage_reader
too, which is the second place someone has to think about it.
"""

import hashlib
import json
import os
from pathlib import Path

from . import UsageRecord
from ._gitname import repo_from_cwd

AGENT_ID = "claude_code"
AGENT_NAME = "Claude Code"
HOMEPAGE = "https://claude.com/claude-code"
PRIORITY = 100

# Bump when the meaning of what this parser emits changes — a new counter, a
# different dedupe key, a corrected mapping. It travels inside the cursor, so
# every file is re-read once after a bump. See _read_cursor.
#
# 2: repo_name comes from the origin remote rather than the folder name, so a
#    checkout whose directory was never renamed to match its repository
#    (log_reporter -> github.com/frenamezian/logreporter) stops orphaning every
#    row it produces. See _gitname.py.
#
# A bump invalidates stored cursors, but that is NOT what updates rows already
# in the database: the reader skips a file whose size and mtime are unchanged
# without consulting the cursor, and rows are written INSERT OR IGNORE on
# request_id, so re-reading an imported request changes nothing. Correcting
# what this parser emits for already-imported requests needs the escape hatch,
# `python usage_reader.py --rebuild`, which is safe precisely because
# token_usage.db is a cache and nothing else.
PARSE_VERSION = 2

# Envelope fields worth keeping. Every one of these is a short enum-like token
# or a version string; none of them can carry message content.
_EXTRA_KEYS = {
    "isSidechain": "sidechain",
    "entrypoint": "entrypoint",
    "version": "cli_version",
    "effort": "effort",
}

# Optional, and deliberately outside the seven-name contract: the reader reads
# this if a parser defines it and ignores it otherwise. It is how "lines this
# parser could not make sense of" reaches the source-transparency panel instead
# of being swallowed. Counts only — nothing derived from a line's content.
PARSE_STATS: dict[str, int] = {}


def _bump(key: str, n: int = 1) -> None:
    PARSE_STATS[key] = PARSE_STATS.get(key, 0) + n


def _root() -> Path:
    # Claude Code honours CLAUDE_CONFIG_DIR; a user who moved their config
    # would otherwise look like a user who has never run it.
    base = os.environ.get("CLAUDE_CONFIG_DIR") or os.path.join(Path.home(), ".claude")
    return Path(base) / "projects"


def detect() -> bool:
    """A path test, no parsing — this runs on every refresh."""
    try:
        return _root().is_dir()
    except OSError:
        return False


def discover() -> list[Path]:
    """Every transcript, including the subagent sidechains one level down."""
    root = _root()
    if not root.is_dir():
        return []
    try:
        return sorted(root.rglob("*.jsonl"))
    except OSError:
        return []


# --- cursor -----------------------------------------------------------------

def _read_cursor(cursor: str | None) -> int:
    """Byte offset to resume from, or 0 to read the whole file.

    The framework treats the cursor as opaque, so the parser is free to put its
    own version and priority inside it. That is what makes "the parser changed,
    re-read everything" work without a column in the watermark table — and it
    is self-healing: a cursor this version does not recognise is simply not
    trusted, and the file is read from the top.
    """
    if not cursor:
        return 0
    try:
        c = json.loads(cursor)
        if (c.get("parser") == AGENT_ID
                and c.get("parse_version") == PARSE_VERSION
                and c.get("priority") == PRIORITY):
            off = c.get("offset")
            if isinstance(off, int) and off >= 0:
                return off
    except (json.JSONDecodeError, AttributeError, TypeError):
        pass
    return 0


def _write_cursor(offset: int) -> str:
    return json.dumps({
        "parser": AGENT_ID,
        "parse_version": PARSE_VERSION,
        "priority": PRIORITY,
        "offset": offset,
    }, separators=(",", ":"))


# --- repo naming ------------------------------------------------------------

def _repo_from_cwd(cwd: str | None) -> str | None:
    """The repository name log_activity.py records for this cwd.

    Transcripts record the *working directory*, which is frequently a
    subdirectory deep inside the repo. Attribution (§7) joins on repo name, so
    `.../template_project/frontend/src` has to come back as the repo, not as
    `src`. The rule — origin remote, then the folder holding `.git`, then the
    bare directory name — lives in `_gitname` because log_activity.py and every
    other parser have to agree with it exactly or the join silently produces
    zeroes.
    """
    return repo_from_cwd(cwd)


# --- parse ------------------------------------------------------------------

def _int_or_none(v):
    """Keep NULL and 0 apart, and refuse anything that is not a plain int."""
    if v is None or isinstance(v, bool) or not isinstance(v, int):
        return None
    return v


def _str_or_none(v):
    if isinstance(v, str) and v.strip():
        return v
    return None


def _timestamp(v):
    # Transcripts already write ISO-8601 UTC ("2026-08-01T14:45:19.955Z"),
    # which is what §4 asks for. Accept it verbatim rather than round-tripping
    # 99k strings through datetime on every full scan.
    if isinstance(v, str) and v.endswith("Z") and "T" in v:
        return v
    return None


def _synthetic_id(session_id, uuid_, path: Path) -> str:
    """A stable id for a line that carries no requestId.

    Stability is the whole requirement: the same line must hash the same way on
    every run or `INSERT OR IGNORE` stops making re-import idempotent. The line
    uuid is unique and immutable; the session and file name disambiguate the
    (unlikely) case of a uuid reused across sessions.
    """
    h = hashlib.sha256(f"{session_id}|{uuid_}|{path.name}".encode()).hexdigest()
    return "syn_" + h[:24]


def parse(path: Path, cursor: str | None):
    """Yield UsageRecords appended since `cursor`; return the new cursor.

    Returns `(iterator, new_cursor)`. The iterator is a generator, so the
    cursor has to be computable before the file is read — it is not: the new
    offset is only known once the last complete line has been consumed. The
    file is therefore read eagerly into a list here. Session files reach ~14 MB
    and only the *appended* part is read on a normal refresh, so the memory is
    bounded by one file's growth between refreshes, not by history.
    """
    path = Path(path)
    start = _read_cursor(cursor)
    records: list[UsageRecord] = []
    seen: set[str] = set()
    agent_type = _subagent_type(path)

    try:
        size = path.stat().st_size
    except OSError:
        return iter(()), cursor
    if start > size:
        start = 0          # file shrank under us; the watermark check will agree

    offset = start
    try:
        # Binary, not text: a text-mode tell() returns an opaque cookie rather
        # than a byte offset, so it could not be compared with the file size or
        # stored as a resumable position.
        with open(path, "rb") as f:
            f.seek(start)
            for raw in f:
                if not raw.endswith(b"\n"):
                    # A partial final line: the agent is mid-write. Leave the
                    # offset before it so the complete line is read next time.
                    break
                offset += len(raw)
                _bump("lines_read")
                line = raw.strip()
                if not line:
                    continue
                try:
                    o = json.loads(line)
                except (json.JSONDecodeError, UnicodeDecodeError):
                    _bump("malformed_lines")
                    continue
                if not isinstance(o, dict) or o.get("type") != "assistant":
                    continue
                msg = o.get("message")
                if not isinstance(msg, dict):
                    continue
                usage = msg.get("usage")
                if not isinstance(usage, dict):
                    continue
                # usage_lines == skipped_api_errors + skipped_no_timestamp
                #                + deduped_lines + records
                _bump("usage_lines")

                # API-error placeholders: model "<synthetic>", every counter
                # zero, no request identity. They represent no spend, and
                # emitting them would put "<synthetic>" in front of the user as
                # an unpriceable model with a "go add it to the registry" hint,
                # which is advice that makes no sense.
                if o.get("isApiErrorMessage") or msg.get("model") == "<synthetic>":
                    _bump("skipped_api_errors")
                    continue

                ts = _timestamp(o.get("timestamp"))
                if ts is None:
                    _bump("skipped_no_timestamp")
                    continue

                rid = _str_or_none(o.get("requestId"))
                if rid is None:
                    rid = _synthetic_id(o.get("sessionId"), o.get("uuid"), path)
                    _bump("synthesized_request_ids")
                if rid in seen:
                    _bump("deduped_lines")
                    continue
                seen.add(rid)

                _bump("records")
                records.append(_record(o, msg, usage, ts, rid, agent_type))
    except OSError:
        # Mid-rotation, a lock, a vanished file. Keep the old cursor so the
        # next refresh retries from the same place.
        return iter(records), cursor

    return iter(records), _write_cursor(offset)


def _subagent_type(path: Path) -> str | None:
    """The kind of subagent a sidechain transcript belongs to.

    Claude Code writes `agent-<id>.meta.json` beside `agent-<id>.jsonl` holding
    `{"agentType": "general-purpose", ...}`. Knowing that a run was an Explore
    sweep rather than a code review is the difference between "subagents cost
    40% of this task" and a number nobody can act on. One small read per file,
    not per line, and only the agent type is taken.
    """
    if not path.name.startswith("agent-"):
        return None
    meta = path.with_suffix(".meta.json")
    try:
        with open(meta, "rb") as f:
            data = json.loads(f.read())
    except (OSError, json.JSONDecodeError, UnicodeDecodeError):
        return None
    v = data.get("agentType") if isinstance(data, dict) else None
    return v[:64] if isinstance(v, str) and v.strip() else None


def _record(o: dict, msg: dict, usage: dict, ts: str, rid: str,
            agent_type: str | None) -> UsageRecord:
    cc = usage.get("cache_creation")
    if isinstance(cc, dict):
        cw5 = _int_or_none(cc.get("ephemeral_5m_input_tokens"))
        cw1 = _int_or_none(cc.get("ephemeral_1h_input_tokens"))
        implied = None
    else:
        # Transcripts written before the 1-hour cache existed carry only the
        # `cache_creation_input_tokens` total, and every cache write back then
        # was 5-minute ephemeral — so this is a fact about the old format, not
        # a guess about the TTL. Flagged in extra_json either way, because it
        # changes which price tier applies.
        cw5 = _int_or_none(usage.get("cache_creation_input_tokens"))
        cw1 = None
        implied = "5m" if cw5 else None

    extra = {}
    for src, dst in _EXTRA_KEYS.items():
        v = o.get(src)
        if isinstance(v, bool):
            extra[dst] = v
        elif isinstance(v, str) and v.strip():
            extra[dst] = v[:64]
    if implied:
        extra["cache_write_ttl"] = "implied_" + implied
    if agent_type:
        extra["agent_type"] = agent_type

    return UsageRecord(
        request_id=rid,
        timestamp=ts,
        source=AGENT_ID,
        session_id=_str_or_none(o.get("sessionId")),
        model_id=_str_or_none(msg.get("model")),
        repo_name=_repo_from_cwd(o.get("cwd")),
        branch_name=_str_or_none(o.get("gitBranch")),
        input_tokens=_int_or_none(usage.get("input_tokens")),
        cache_read_tokens=_int_or_none(usage.get("cache_read_input_tokens")),
        cache_write_5m=cw5,
        cache_write_1h=cw1,
        output_tokens=_int_or_none(usage.get("output_tokens")),
        service_tier=_str_or_none(usage.get("service_tier")),
        speed=_str_or_none(usage.get("speed")),
        extra_json=json.dumps(extra, separators=(",", ":")) if extra else None,
    )
