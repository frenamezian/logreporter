"""Antigravity (Google's agentic IDE) — one record per LLM request.

Where the data is
-----------------
Not in the IDE's VS Code storage, which is where you would look first and where
there is nothing: the agent half of Antigravity is a separate language-server
process with its own data directory, named after the `--app_data_dir` it was
launched with.

    ~/.gemini/antigravity-ide/conversations/<cascade-uuid>.db     (current)
    ~/.gemini/antigravity/conversations/<cascade-uuid>.db         (older install)

Each file is a SQLite database for one conversation. `gen_metadata(idx, data,
size)` holds one row per LLM request, `data` being a raw protobuf blob — no
base64 wrapper, unlike the IDE-side state. `trajectory_metadata_blob` holds the
workspace, git remote and branch; `trajectory_meta` holds the ids.

The field map, and how it was checked
--------------------------------------
The stored blob wraps one `exa.cortex_pb.ChatModelMetadata` in field 1, and
that message's field 4 is `usage`, an `exa.codeium_common_pb.ModelUsageStats`.
Both schemas are compiled into the IDE bundle as protobuf
`FileDescriptorProto`s, so the field *names* below are the real ones rather
than a guess from value shapes:

    1.4.1   Model  model            1.4.5   uint64 cache_read_tokens
    1.4.2   uint64 input_tokens     1.4.6   APIProvider api_provider
    1.4.3   uint64 output_tokens    1.4.9   uint64 thinking_output_tokens
    1.4.4   uint64 cache_write_tokens       1.4.10 uint64 response_output_tokens
    1.4.11  string response_id
    1.19    an alias, NOT a model identity — see below
    1.21    string model_display_name ("Gemini 3.5 Flash (Medium)"), on 42% of
            requests; the resolved name, written at request time
    1.9.4   the request's timestamp, {seconds, nanos}

`ChatModelMetadata` also declares `model_cost` (field 5) and `credit_cost`
(field 13). Neither is ever written: absent from all 11,795 requests across
both installs, so there is no per-request price to read and cost stays the
dashboard's job.

How `model_id` is resolved, and why not from field 19
------------------------------------------------------
Field 19 is an alias and is not one-to-one with anything: `gemini-3-flash-a`
appears against model enums 1020 *and* 1132, and enum 1020 appears as
`gemini-3-flash-a`, `gemini-3-flash-b` and `gemini-default`. The `-a`/`-b`
pairs run concurrently on the same enum, so they read as experiment arms.
Reporting it verbatim left 11,079 of 11,795 requests unpriced, because
cost-model.js looks a model id up by exact match and no alias is a registry id.

The identity is the enum in field 1.4.1. Three steps, in order:

  1. **field 21**, `model_display_name`, when the request carries one. This is
     the name Antigravity itself resolved, written at the time of the request,
     so it cannot be retrospectively wrong. 42% of requests, and effectively
     all recent ones.
  2. **`_ENUM_NAMES`**, for the older requests written before field 21 existed.
  3. otherwise the field 19 alias, unchanged and unpriced.

What is deliberately *not* done is read the IDE's live catalog
(`antigravityUnifiedStateSync.userStatus`, field 33 `cascade_model_config_data`)
at parse time. It is a server-provided snapshot and the enums are **renumbered
over time**: enum 1133 meant "Gemini 3.5 Flash (High)" in the older install's
catalog, is absent from the current one where 1084 now holds that label, and
1132 carried the same label in July while appearing in neither. Mapping today's
catalog onto 2026-05 rows would label them confidently and wrongly.

`_ENUM_NAMES` avoids that because it is the opposite thing: observed history,
pinned, and consulted *only* for a request that carries no name of its own.
Those requests are finished and frozen, so nothing can change underneath them —
and if an enum is ever reused, the new requests will carry field 21, which wins
at step 1. An enum nobody has observed falls through to step 3 and stays
unpriced, which is the right direction to fail in: never a guessed rate.

`extra_json.model_id_source` records which of the three steps answered, so a
derived name can be shown as derived rather than passed off as recorded — the
same contract `cache_write_ttl: "implied_5m"` has in the ccusage adapter.

Checked against every request on the machine this was written on — 7,679 of
them across 69 conversations:

  * `thinking + response == output` held on all 7,679, so field 3 is the output
    total and 9/10 are its split, not three separate counters to be summed.
  * `response_id` was unique across all 7,650 rows that had one, which is what
    makes it usable as the dedupe key rather than something synthesized.
  * field 4, `cache_write_tokens`, **never appeared** — the schema has it, this
    agent does not write it. So cache writes are NULL here, not 0: see rule 2
    in CONTRIBUTING.md. Reporting 0 would claim Antigravity's cache writes were
    measured and free.

Why `discover()` returns a `-wal` path
---------------------------------------
These databases are in WAL mode and Antigravity holds them open for weeks at a
time, so a new request lands in `<uuid>.db-wal` and the `.db` file's size and
mtime do not move at all. The reader skips a file whose size and mtime are
unchanged — which would mean every new request stayed invisible until Antigravity
happened to checkpoint. So the path handed to the reader is the one that
actually changes. When the WAL is checkpointed away the `.db` path is returned
instead; that is a new watermark key and costs exactly one re-read, which
`INSERT OR IGNORE` on `response_id` absorbs.

Why the databases are opened read-only, and never copied
---------------------------------------------------------
`mode=ro` on the live file. This is another process's data and it is 745 MB of
it, so copying on every refresh is out of the question, and opening read-write
could let SQLite checkpoint or recover — writing to a running agent's store.
A read-only open still updates `<uuid>.db-shm`, SQLite's shared-memory index;
that file is ephemeral and rebuildable and Antigravity rewrites it constantly,
and the two files that hold data are left untouched.

What is deliberately not read
------------------------------
Field `1.9.10` of the same blob is a context breakdown: section names, the
user's rule and skill names, tool names, per-section token counts. It is not
message content but it is close enough, and none of it belongs in a usage
database. This parser reaches for named fields and never walks the tree, so
nothing outside the map above is ever decoded.
"""

import json
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from . import UsageRecord

AGENT_ID = "antigravity"
AGENT_NAME = "Antigravity"
HOMEPAGE = "https://antigravity.google"
# Native, so it beats the ccusage fallback (PRIORITY 1) for this agent. In
# practice ccusage never reaches it — the reader passes this AGENT_ID to
# ccusage's exclude_agents() — but priority is the rule that makes it certain.
PRIORITY = 100

# 2: model_id became a registry id rather than the raw field-19 alias.
#
# A bump invalidates this parser's stored cursors, but that is NOT what updates
# rows already in the database, and it is worth being clear about why. The
# reader skips a file whose size and mtime are unchanged without ever looking at
# the cursor, and rows are written INSERT OR IGNORE on request_id, so a re-read
# of an already-imported request changes nothing. Both are deliberate: they are
# what make a wrong cursor cost time instead of correctness.
#
# Changing what this parser *emits* for requests it has already imported
# therefore needs the escape hatch — `python usage_reader.py --rebuild`, which
# drops the cache and every watermark and reads the corpus again. That is safe
# precisely because token_usage.db is a cache and nothing else.
PARSE_VERSION = 2

UNAVAILABLE_HINT = ("Antigravity's conversation store was not found under "
                    "~/.gemini/*/conversations. Open a conversation in "
                    "Antigravity once, then refresh.")

# `--app_data_dir` values seen in the wild, newest first.
_APP_DIRS = ("antigravity-ide", "antigravity")

# Model enum -> the display name Antigravity recorded for it, for requests
# written before field 21 existed. Every entry was read back out of this
# machine's own corpus: each of these enums appears on requests that *do* carry
# field 21, and the name there was identical every time — except 1133 and 1026,
# which never carry one and are taken from the older install's catalog, where
# 1133 is listed as "Gemini 3.5 Flash (High)".
#
# Observed 2026-05-28 .. 2026-08-04 across 11,795 requests. This is history, not
# a copy of the live catalog: see the module docstring for why that distinction
# is the whole point. Field 21 always wins over this table.
_ENUM_NAMES = {
    1020: "Gemini 3.5 Flash (Medium)",
    1026: "Claude Opus 4.6 (Thinking)",
    1035: "Claude Sonnet 4.6 (Thinking)",
    1072: "Gemini 3.6 Flash (Medium)",
    1132: "Gemini 3.5 Flash (High)",
    1133: "Gemini 3.5 Flash (High)",
    1187: "Gemini 3.5 Flash (Low)",
}

# Antigravity's display name minus its effort suffix -> the id that
# script/llm_registry.py prices on. It has to be exact: cost-model.js's
# lookupModel() is a map lookup and does no normalising of its own.
#
# Antigravity's other catalogued models are absent on purpose. "Gemini 3.1 Pro"
# is the interesting one: the registry has `gemini-3.1-pro-preview` and nothing
# else 3.1-Pro-shaped, and pricing a GA model at preview rates because the names
# nearly match is exactly the guess this parser refuses to make elsewhere. It
# has never been observed here; if it appears it goes unpriced and shows up in
# cost-model's unknownModels, which is a visible prompt to add it deliberately.
_REGISTRY_IDS = {
    "Gemini 3.5 Flash": "gemini-3.5-flash",
    "Gemini 3.6 Flash": "gemini-3.6-flash",
    "Claude Sonnet 4.6": "claude-sonnet-4-6",
    "Claude Opus 4.6": "claude-opus-4-6",
}

PARSE_STATS: dict[str, int] = {}


def _bump(key, n=1):
    PARSE_STATS[key] = PARSE_STATS.get(key, 0) + n


# --- protobuf, only as much as is needed ------------------------------------

def _varint(b, i):
    r = s = 0
    while i < len(b):
        x = b[i]
        r |= (x & 0x7F) << s
        i += 1
        if not x & 0x80:
            return r, i
        s += 7
        if s > 63:
            raise ValueError("varint too long")
    raise ValueError("truncated varint")


def _fields(b):
    """One level of protobuf: {field_no: [value, ...]}, nothing recursive.

    Values are ints for the numeric wire types and `bytes` for length-delimited
    ones — the caller decides whether a given field is a nested message, a
    string, or neither. Nothing is decoded speculatively, which is what keeps
    the context breakdown in field 1.9.10 from ever being touched.
    """
    out, i = {}, 0
    while i < len(b):
        key, i = _varint(b, i)
        f, w = key >> 3, key & 7
        if f == 0:
            raise ValueError("field number 0")
        if w == 0:
            v, i = _varint(b, i)
        elif w == 2:
            n, i = _varint(b, i)
            if n < 0 or i + n > len(b):
                raise ValueError("truncated length-delimited field")
            v, i = b[i:i + n], i + n
        elif w == 5:
            v, i = int.from_bytes(b[i:i + 4], "little"), i + 4
        elif w == 1:
            v, i = int.from_bytes(b[i:i + 8], "little"), i + 8
        else:
            raise ValueError(f"unsupported wire type {w}")
        out.setdefault(f, []).append(v)
    return out


def _one(d, f):
    v = d.get(f)
    return v[0] if v else None


def _sub(d, f):
    """Field `f` of `d` parsed as a nested message, or {} if it is not one."""
    v = _one(d, f)
    if not isinstance(v, bytes):
        return {}
    try:
        return _fields(v)
    except ValueError:
        return {}


def _text(d, f, limit=64):
    v = _one(d, f)
    if not isinstance(v, bytes):
        return None
    try:
        s = v.decode("utf-8").strip()
    except UnicodeDecodeError:
        return None
    return s[:limit] or None


def _count(d, f):
    """A counter field: an int, or None when the agent did not report it."""
    v = _one(d, f)
    if not isinstance(v, int) or isinstance(v, bool) or v < 0:
        return None
    return v


# --- discovery ---------------------------------------------------------------

def _roots():
    home = Path(os.path.expanduser("~"))
    return [d for d in (home / ".gemini" / a / "conversations" for a in _APP_DIRS)
            if d.is_dir()]


def detect() -> bool:
    """Is Antigravity's conversation store on this machine? A path test only."""
    return bool(_roots())


def discover() -> list[Path]:
    """One path per conversation — the `-wal` when there is a live one.

    See the module docstring: the `.db` mtime does not move while Antigravity
    is running, so returning it would make the reader skip every file forever.
    """
    out = []
    for root in _roots():
        for db in sorted(root.glob("*.db")):
            wal = db.with_name(db.name + "-wal")
            try:
                live_wal = wal.is_file() and wal.stat().st_size > 0
            except OSError:
                live_wal = False
            out.append(wal if live_wal else db)
    return out


def _db_path(path: Path) -> Path:
    """The database itself, given either it or its write-ahead log."""
    return path.with_name(path.name[:-4]) if path.name.endswith("-wal") else path


# --- cursor ------------------------------------------------------------------

# "Resume after idx -1", i.e. read everything. It cannot be 0: `gen_metadata.idx`
# starts at 0, so `WHERE idx > 0` would silently drop each conversation's very
# first request — a whole request per conversation, which no total would show as
# obviously wrong.
_FROM_THE_START = -1


def _read_cursor(cursor):
    """The `gen_metadata.idx` to resume after, or -1 for a full read.

    `idx` is the table's INTEGER PRIMARY KEY and rows are appended one per
    request, so "greater than the last one seen" is the whole of it. A cursor
    from another parser or another PARSE_VERSION is not an error — it costs one
    full re-read, which inserts nothing new because `response_id` is the key.
    """
    if not cursor:
        return _FROM_THE_START
    try:
        c = json.loads(cursor)
    except (TypeError, ValueError):
        return _FROM_THE_START
    if not isinstance(c, dict) or c.get("parse_version") != PARSE_VERSION:
        return _FROM_THE_START
    idx = c.get("idx")
    if isinstance(idx, int) and not isinstance(idx, bool) and idx >= 0:
        return idx
    return _FROM_THE_START


def _make_cursor(idx: int) -> str:
    return json.dumps({
        "parser": AGENT_ID,
        "parse_version": PARSE_VERSION,
        "priority": PRIORITY,
        "idx": idx,
    }, separators=(",", ":"))


# --- reading -----------------------------------------------------------------

def _connect(db: Path):
    """Read-only connection to a database another process is writing."""
    uri = "file:" + db.as_posix().replace("?", "%3f").replace("#", "%23") + "?mode=ro"
    return sqlite3.connect(uri, uri=True, timeout=5.0)


def _trajectory_context(con, db: Path):
    """(session_id, repo_name, branch_name) for the whole conversation.

    repo_name comes from the git remote's repository name rather than the
    workspace folder's, because those differ — a folder called
    `Playground-Harness` cloned from `frenamezian/Playground` — and it is the
    remote's name that log_activity.py records, which is the join attribution
    depends on. The folder name is the fallback for a workspace with no remote.
    """
    session = db.stem
    try:
        row = con.execute(
            "SELECT cascade_id FROM trajectory_meta LIMIT 1").fetchone()
        if row and isinstance(row[0], str) and row[0].strip():
            session = row[0].strip()[:64]
    except sqlite3.Error:
        pass

    repo = branch = None
    try:
        row = con.execute(
            "SELECT data FROM trajectory_metadata_blob WHERE id = 'main'").fetchone()
    except sqlite3.Error:
        row = None
    if row and isinstance(row[0], (bytes, bytearray)):
        try:
            ws = _sub(_fields(bytes(row[0])), 1)
        except ValueError:
            ws = {}
        remote = _text(_sub(ws, 3), 1)          # "frenamezian/Playground"
        if remote:
            repo = remote.rsplit("/", 1)[-1] or None
        if not repo:
            folder = _text(ws, 1, limit=512)     # "file:///c:/.../Playground"
            if folder:
                repo = folder.rstrip("/").rsplit("/", 1)[-1][:64] or None
        branch = _text(ws, 4)
    return session, repo, branch


def _timestamp(step):
    """ISO-8601 UTC, to the millisecond, from field 1.9.4 {seconds, nanos}."""
    t = _sub(_sub(step, 9), 4)
    secs = _one(t, 1)
    if not isinstance(secs, int) or isinstance(secs, bool) or secs <= 0:
        return None
    nanos = _one(t, 2)
    ms = (nanos // 1_000_000) if isinstance(nanos, int) and 0 <= nanos < 10**9 else 0
    try:
        dt = datetime.fromtimestamp(secs, timezone.utc)
    except (OverflowError, OSError, ValueError):
        return None
    return f"{dt:%Y-%m-%dT%H:%M:%S}.{ms:03d}Z"


def _split_effort(name):
    """"Gemini 3.5 Flash (Medium)" -> ("Gemini 3.5 Flash", "Medium").

    The suffix is a reasoning-effort setting, not a different model: the same
    tokens at the same price. It is split off so the name matches a registry id
    and kept in extra_json, where it informs without ever moving the cost.
    """
    if name.endswith(")") and "(" in name:
        base, _, effort = name.rpartition("(")
        return base.strip(), (effort[:-1].strip() or None)
    return name.strip(), None


def _model(step, usage):
    """(model_id, effort, source) — see "How model_id is resolved" above."""
    name, source = _text(step, 21, limit=128), "recorded"
    if not name:
        enum = _one(usage, 1)
        if isinstance(enum, int) and not isinstance(enum, bool):
            name, source = _ENUM_NAMES.get(enum), "enum_table"

    if name:
        base, effort = _split_effort(name)
        registry_id = _REGISTRY_IDS.get(base)
        if registry_id:
            return registry_id, effort, source
        # A name we have never mapped to a price list. Counting it separately
        # from "no name at all" is what makes a newly-offered model visible
        # here rather than silently joining the unpriced pile.
        _bump("unmapped_display_names")

    return _text(step, 19), None, "alias"


def _record(blob, idx, session, repo, branch):
    """One UsageRecord, or None if this step was not an LLM request."""
    try:
        step = _sub(_fields(blob), 1)
    except ValueError:
        _bump("undecodable_rows")
        return None
    if not step:
        _bump("undecodable_rows")
        return None

    usage = _sub(step, 4)
    if not usage:
        # Steps that ran no model at all (tool-only bookkeeping rows) have no
        # ModelUsageStats. Skipping is right; emitting zeros would invent
        # requests that never happened.
        _bump("steps_without_usage")
        return None

    ts = _timestamp(step)
    if ts is None:
        _bump("skipped_no_timestamp")
        return None

    # `response_id` is the server's own id and was unique across every request
    # on the machine this was written against. The 29 rows that lacked one fall
    # back to a synthesized id that is stable for the same (conversation, row),
    # so re-import stays idempotent either way.
    req = _text(usage, 11, limit=128)
    if req:
        request_id = f"{AGENT_ID}:{req}"
    else:
        _bump("synthesized_request_ids")
        request_id = f"{AGENT_ID}:{session}:{idx}"

    thinking = _count(usage, 9)
    model_id, effort, model_source = _model(step, usage)
    _bump(f"model_from_{model_source}")

    extra = {"model_id_source": model_source}
    if thinking is not None:
        extra["reasoning_output_tokens"] = thinking
    if effort:
        extra["effort"] = effort

    return UsageRecord(
        request_id=request_id,
        timestamp=ts,
        source=AGENT_ID,
        session_id=session,
        model_id=model_id,
        repo_name=repo,
        branch_name=branch,
        input_tokens=_count(usage, 2),
        cache_read_tokens=_count(usage, 5),
        # Field 4 is `cache_write_tokens` and this agent has never been observed
        # to write it. NULL, therefore — not 0, which would claim a measurement.
        cache_write_5m=None,
        cache_write_1h=None,
        output_tokens=_count(usage, 3),
        service_tier=None,
        speed=None,
        extra_json=json.dumps(extra, separators=(",", ":")),
    )


def parse(path, cursor=None):
    """Yield the requests in one conversation recorded after `cursor`."""
    db = _db_path(Path(path))
    after = _read_cursor(cursor)

    try:
        con = _connect(db)
    except sqlite3.Error:
        _bump("unreadable_databases")
        return iter(()), cursor

    try:
        session, repo, branch = _trajectory_context(con, db)
        try:
            rows = con.execute(
                "SELECT idx, data FROM gen_metadata WHERE idx > ? ORDER BY idx",
                (after,)).fetchall()
        except sqlite3.Error:
            # Not a conversation database — the older installs keep legacy
            # `<uuid>.pb` files and other tables alongside these.
            _bump("databases_without_gen_metadata")
            return iter(()), cursor
    finally:
        con.close()

    records, high = [], after
    for idx, blob in rows:
        if not isinstance(idx, int):
            continue
        high = max(high, idx)
        if not isinstance(blob, (bytes, bytearray)):
            _bump("undecodable_rows")
            continue
        _bump("rows_read")
        rec = _record(bytes(blob), idx, session, repo, branch)
        if rec is not None:
            records.append(rec)

    _bump("records", len(records))
    # An empty conversation leaves nothing to resume after; a NULL cursor reads
    # it from the start next time, which is what we want.
    return iter(records), (_make_cursor(high) if high >= 0 else None)
