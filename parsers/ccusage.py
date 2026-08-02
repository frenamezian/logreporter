"""Fallback: whatever `ccusage` can see, for agents with no native parser yet.

ccusage (https://ccusage.com) reads the local session logs of 16+ coding agents
and reports token totals. Wrapping it means an agent nobody has written a
parser for still shows a number, instead of being invisible — and it is the
honest version of that, because the source column says where it came from.

What you give up by using it, and why the native path always wins
------------------------------------------------------------------
ccusage reports **aggregates**: per day, per month, or per session. It has no
per-request identity and does not split cache writes by TTL. Three consequences
run through this whole file:

  1. **No request_id.** Ours are synthesized from (agent, session, model). They
     are stable, so re-import is still idempotent, but they are not the API's
     request ids and cannot be reconciled with a native parser's.
  2. **The numbers move.** A session's totals grow as the session continues, so
     a row keyed on that session is not immutable the way a finished API
     request is. INSERT OR IGNORE would freeze the first snapshot forever.
     Hence SOURCE_KIND = "command": the reader deletes this parser's whole
     `source` namespace and rewrites it on every run.
  3. **Timestamps are coarse.** A session is attributed at its last activity,
     so §7 puts the whole session's spend in whichever task span contains that
     instant. Flagged as `grain: session` in extra_json so the UI can say so.

A native parser therefore beats this for the same agent, always — enforced by
`exclude_agents()`, which the reader calls with the agent ids that already have
one. PRIORITY is low as a second line of defence.

Why this never installs anything
---------------------------------
`detect()` looks for a ccusage on PATH and stops there. It does not run
`npx ccusage@latest`, which would download and execute a package from the
network as a side effect of opening a dashboard. If ccusage is absent the
agents it would have covered are simply listed as unsupported, with the install
command shown — §3.3's third branch, and never a silent zero.

    npm install -g ccusage        # then refresh
"""

import json
import os
import re
import shutil
import subprocess
from pathlib import Path

from . import UsageRecord

AGENT_ID = "ccusage"
AGENT_NAME = "ccusage (fallback)"
HOMEPAGE = "https://ccusage.com"
# Deliberately low: any native parser outranks the fallback for the same agent.
PRIORITY = 1

# Sources are a CLI producing aggregates, not files on disk. The reader reads
# this and switches off stat/watermark, replacing the namespace each run.
SOURCE_KIND = "command"

# Shown when detect() is False, so "these agents have no usage" reads as "the
# tool that would have covered them is not installed" rather than as zero.
UNAVAILABLE_HINT = ("ccusage is not on PATH, so agents without a native parser "
                    "are unsupported. Install with `npm install -g ccusage`.")

PARSE_VERSION = 1
TIMEOUT_S = 120

# ccusage's agent namespaces, as of its 2026 docs. Each is invoked separately
# (`ccusage <agent> session --json`) rather than through the combined
# `ccusage session`, because the combined report does not attribute rows back
# to the agent that produced them — and the `source` column has to say.
KNOWN_AGENTS = (
    "claude", "codex", "gemini", "copilot", "opencode", "amp", "droid",
    "codebuff", "goose", "kilo", "qwen", "antigravity", "kimi", "openclaw",
    "hermes", "pi-agent",
)

# ccusage's name for an agent -> the AGENT_ID a native parser would use. Only
# needed where the two differ; this is ccusage's vocabulary, not a registry of
# our parsers.
NATIVE_EQUIVALENT = {
    "claude": "claude_code",
    "codex": "codex_cli",
    "gemini": "gemini_cli",
    "copilot": "copilot_cli",
}

# Field-name drift is the norm here: the docs show `session` in one place and
# `sessions` in another, `modelName` and `model` for the same thing, and
# ccusage-codex is known to emit `costUSD` where the others emit `totalCost`.
# Read by alias rather than by one blessed spelling.
_ROWS_KEYS = ("sessions", "session", "daily", "monthly", "data")
_ALIASES = {
    "input": ("inputTokens", "input_tokens", "input"),
    "output": ("outputTokens", "output_tokens", "output"),
    "cache_write": ("cacheCreationTokens", "cache_creation_tokens",
                    "cacheCreationInputTokens", "cacheWrite"),
    "cache_read": ("cacheReadTokens", "cache_read_tokens",
                   "cacheReadInputTokens", "cacheRead"),
    "model": ("modelName", "model", "modelId"),
    "session": ("sessionId", "session", "id"),
    "project": ("projectPath", "project", "projectName"),
    "last": ("lastActivity", "last_activity", "date", "month"),
}

PARSE_STATS: dict[str, int] = {}
_excluded: set[str] = set()


def _bump(key, n=1):
    PARSE_STATS[key] = PARSE_STATS.get(key, 0) + n


def _binary():
    return shutil.which("ccusage")


def detect() -> bool:
    """Is ccusage installed? A PATH lookup - no subprocess, no network."""
    return _binary() is not None


def exclude_agents(agent_ids: set) -> None:
    """Told by the reader which agents already have a native parser.

    Optional hook, outside the seven-name contract, and only a fallback adapter
    needs it. Without it this parser would re-report Claude Code alongside
    claude_code.py — and because the two use different request ids, the dedupe
    that normally makes double-counting impossible would not catch it.
    """
    global _excluded
    _excluded = set(agent_ids or ())


def _is_excluded(cc_agent: str) -> bool:
    return NATIVE_EQUIVALENT.get(cc_agent, cc_agent) in _excluded


def discover() -> list[Path]:
    """One pseudo-path per agent namespace ccusage can report on.

    These are not files. The reader knows that from SOURCE_KIND and neither
    stats them nor watermarks them; `parse()` turns each back into a CLI call.
    """
    if not detect():
        return []
    # `ccusage:codex`, not `ccusage://codex`: Path() rewrites the double slash
    # to a backslash on Windows, and the agent name comes back mangled.
    return [Path(f"{AGENT_ID}:{a}") for a in KNOWN_AGENTS if not _is_excluded(a)]


def _run(agent: str):
    """`ccusage <agent> session --json`, or None if that namespace is unusable.

    An agent the installed ccusage does not know about exits non-zero; that is
    an expected outcome, not an error worth surfacing, because this parser asks
    about every namespace it has ever heard of.
    """
    exe = _binary()
    if not exe:
        return None
    cmd = [exe, agent, "session", "--json", "--offline"]
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True,
                              timeout=TIMEOUT_S, check=False)
    except (OSError, subprocess.SubprocessError) as e:
        _bump("invocation_errors")
        raise RuntimeError(f"ccusage {agent}: {type(e).__name__}: {e}") from e
    if proc.returncode != 0:
        _bump("unsupported_namespaces")
        return None
    try:
        return json.loads(proc.stdout)
    except json.JSONDecodeError:
        _bump("unparseable_output")
        return None


def parse(path, cursor=None):
    """Yield one record per (session, model) ccusage reports for this agent.

    `path` is either a `ccusage://<agent>` pseudo-path, or - for conformance -
    a real .json file holding recorded ccusage output. Accepting both is what
    lets the fixture be checked on a machine with no ccusage installed.

    The cursor is always None going out: there is no incremental position to
    keep when the tool re-reads its whole corpus on every invocation.
    """
    path = Path(path)
    raw = str(path)

    if raw.startswith(AGENT_ID + ":"):
        # Tolerate both `ccusage:codex` and a `ccusage://codex` that a previous
        # version stored, however the platform mangled its separators.
        agent = re.split(r"[\\/:]+", raw)[-1] or "claude"
        data = _run(agent)
    else:
        # A recorded-output file names the agent it came from somewhere in its
        # path: parsers/tests/ccusage/fixture.codex.json, or codex/latest.json.
        tokens = set(path.parts) | set(path.name.split("."))
        agent = next((a for a in KNOWN_AGENTS if a in tokens), "claude")
        try:
            with open(path, encoding="utf-8") as f:
                data = json.load(f)
        except (OSError, json.JSONDecodeError):
            _bump("unparseable_output")
            data = None

    if not isinstance(data, dict):
        return iter(()), None
    if _is_excluded(agent):
        _bump("skipped_native_agents")
        return iter(()), None

    rows = None
    for k in _ROWS_KEYS:
        if isinstance(data.get(k), list):
            rows = data[k]
            break
    if rows is None:
        _bump("unrecognised_shape")
        return iter(()), None

    records = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        _bump("aggregate_rows")
        records.extend(_records_for(row, agent))
    return iter(records), None


def _pick(d: dict, key: str):
    for name in _ALIASES[key]:
        if name in d:
            return d[name]
    return None


def _int_or_none(v):
    if v is None or isinstance(v, bool):
        return None
    if isinstance(v, int):
        return v
    if isinstance(v, float) and v.is_integer():
        return int(v)
    return None


def _records_for(row: dict, agent: str) -> list[UsageRecord]:
    session = _pick(row, "session")
    session = str(session)[:64] if session is not None else None
    ts = _timestamp(_pick(row, "last"))
    if ts is None:
        _bump("skipped_no_timestamp")
        return []
    repo = _repo_from_project(_pick(row, "project"))
    source = f"{AGENT_ID}:{agent}"

    # Prefer the per-model breakdown: a session that used two models has to
    # become two rows, or neither can be priced. Fall back to the row itself
    # when no breakdown is present, with model_id NULL - which renders tokens
    # and a "—" cost rather than a guessed rate.
    breakdowns = row.get("modelBreakdowns")
    parts = breakdowns if isinstance(breakdowns, list) and breakdowns else [row]

    out = []
    for i, part in enumerate(parts):
        if not isinstance(part, dict):
            continue
        model = _pick(part, "model") if part is not row else None
        model = str(model)[:64] if model else None
        cache_write = _int_or_none(_pick(part, "cache_write"))

        extra = {"grain": "session", "ccusage_agent": agent[:64]}
        if cache_write:
            # ccusage reports one cache-creation number with no TTL. Anthropic
            # bills 5-minute writes unless 1-hour is asked for, and the agents
            # that reach this path mostly have no TTL concept at all, so 5m is
            # the conservative reading - but it is an assumption, it changes
            # the price, and it says so here so the UI can mark the row.
            extra["cache_write_ttl"] = "implied_5m"

        out.append(UsageRecord(
            # Stable across runs: same session, same model, same id. Prefixed
            # with the source so it can never collide with a native parser's.
            request_id=f"{source}:{session or 'unknown'}:{model or i}",
            timestamp=ts,
            source=source,
            session_id=session,
            model_id=model,
            repo_name=repo,
            branch_name=None,          # ccusage does not record a branch
            input_tokens=_int_or_none(_pick(part, "input")),
            cache_read_tokens=_int_or_none(_pick(part, "cache_read")),
            cache_write_5m=cache_write,
            # Not "0": ccusage does not report a 1-hour counter at all, and a
            # zero here would claim it had measured one.
            cache_write_1h=None,
            output_tokens=_int_or_none(_pick(part, "output")),
            service_tier=None,
            speed=None,
            extra_json=json.dumps(extra, separators=(",", ":")),
        ))
    return out


def _timestamp(v):
    """ccusage emits RFC-3339, or a bare date for daily/monthly reports."""
    if not isinstance(v, str) or not v.strip():
        return None
    v = v.strip()
    if v.endswith("Z") and "T" in v:
        return v
    if len(v) == 10 and v[4] == "-" and v[7] == "-":
        return v + "T00:00:00.000Z"
    if len(v) == 7 and v[4] == "-":
        return v + "-01T00:00:00.000Z"
    return None


def _repo_from_project(v):
    """The repository name from ccusage's project path, if it gave one."""
    if not isinstance(v, str) or not v.strip():
        return None
    name = os.path.basename(v.replace("\\", "/").rstrip("/"))
    return name[:64] or None
