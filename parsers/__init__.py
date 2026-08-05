"""The parser plugin package — and the record shape every parser emits.

Why UsageRecord lives here and not in usage_reader.py
-----------------------------------------------------
Parsers import the record; the reader imports the parsers. Defining the record
in usage_reader.py would make that a cycle. Here it is a leaf: this package
imports nothing of ours, so `from parsers import UsageRecord` is safe no matter
who is doing the importing — the reader, the conformance harness, or a parser
being loaded by the loader. usage_reader re-exports the name for convenience.

Why `problems()` is on the record rather than in the writer
-----------------------------------------------------------
The writer and the conformance harness must agree on what "a valid record"
means, or a parser passes conformance and then produces rows the writer
rejects. One definition, in the same file as the fields it talks about.

NULL is not zero
----------------
Every counter is Optional and stays Optional all the way to the browser. `0`
means the agent reported zero; `None` means the agent does not report that
counter at all. Codex has no cache-write equivalent — rendering that as `0`
would claim its cache writes were free. Anything that coerces one to the other
is a bug, and `problems()` is where that gets caught.
"""

from dataclasses import dataclass, fields
from typing import Optional

__all__ = ["UsageRecord", "COUNTER_FIELDS", "CONTRACT", "EXTRA_ALLOWED",
           "EXTRA_MAX_LEN"]

# The only keys allowed through to extra_json, and the only place they are
# listed. The writer enforces it and the conformance harness asserts it; when
# this lived in both files they drifted within an hour, and the symptom was a
# parser's fields being silently dropped on the way to the database.
#
# Adding a key here is a deliberate act: extra_json is the one open-ended field
# in the record, and the rule it exists to uphold is that nothing resembling a
# prompt, a path, or a response can reach token_usage.db.
EXTRA_ALLOWED = {
    "sidechain",                # bool  - was this a subagent run
    "agent_type",               # str   - which kind of subagent
    "entrypoint",               # str   - how the agent was launched
    "cli_version",              # str   - the agent's own version
    "effort",                   # str   - reasoning effort setting
    "cache_write_ttl",          # str   - "implied_5m" when the TTL was assumed
    "model_id_source",          # str   - how model_id was arrived at, when the
                                #         agent did not record a usable one:
                                #         "recorded" | "enum_table" | "alias"
    "spawn_depth",              # int   - subagent nesting depth
    "reasoning_output_tokens",  # int   - where an agent reports it separately
    "grain",                    # str   - "session"/"daily" for aggregate sources
    "ccusage_agent",            # str   - which namespace a fallback row came from
}

# Long enough for a model id or a version, far too short for a sentence.
EXTRA_MAX_LEN = 64

# The seven names a parser module must expose (§3.1 of TASK_token_usage.md
# calls it six; the list there is four constants plus three functions).
CONTRACT = (
    "AGENT_ID",
    "AGENT_NAME",
    "HOMEPAGE",
    "PRIORITY",
    "detect",
    "discover",
    "parse",
)

# The five numeric counters, named once so validation, the writer and the
# conformance harness cannot drift apart.
COUNTER_FIELDS = (
    "input_tokens",
    "cache_read_tokens",
    "cache_write_5m",
    "cache_write_1h",
    "output_tokens",
)


@dataclass(slots=True)
class UsageRecord:
    """One API request's usage, normalized out of one agent's private format.

    `request_id` is the dedupe key and the primary key of the table. An agent
    that writes several lines per response (Claude Code writes one per content
    block, each carrying an identical `usage` object) collapses to one row by
    construction rather than by the writer remembering to. An agent with no
    request identity of its own must synthesize a *stable* one — the same input
    must hash to the same id on every run, or re-import stops being idempotent.

    `input_tokens` is the uncached remainder only, never the total input. The
    total is `input_tokens + cache_read_tokens + cache_write_5m + cache_write_1h`
    and is computed at render time, not stored.
    """

    request_id: str
    timestamp: str                      # ISO-8601 UTC
    source: str                         # AGENT_ID, or "ccusage:<agent>"
    session_id: Optional[str] = None
    model_id: Optional[str] = None
    repo_name: Optional[str] = None
    branch_name: Optional[str] = None
    input_tokens: Optional[int] = None
    cache_read_tokens: Optional[int] = None
    cache_write_5m: Optional[int] = None
    cache_write_1h: Optional[int] = None
    output_tokens: Optional[int] = None
    service_tier: Optional[str] = None
    speed: Optional[str] = None
    extra_json: Optional[str] = None

    def problems(self) -> list[str]:
        """Return the reasons this record is not writable. Empty means valid.

        Called by the writer on every record and by the conformance harness on
        every fixture, so a parser cannot pass one and fail the other.
        """
        out = []
        for name in ("request_id", "timestamp", "source"):
            v = getattr(self, name)
            if not isinstance(v, str) or not v.strip():
                out.append(f"{name} must be a non-empty string, got {v!r}")
        for name in COUNTER_FIELDS:
            v = getattr(self, name)
            if v is None:
                continue
            # bool is an int subclass; True would silently become 1 token.
            if isinstance(v, bool) or not isinstance(v, int):
                out.append(f"{name} must be int or None, got {v!r}")
            elif v < 0:
                out.append(f"{name} must not be negative, got {v}")
        for name in ("session_id", "model_id", "repo_name", "branch_name",
                     "service_tier", "speed", "extra_json"):
            v = getattr(self, name)
            if v is not None and not isinstance(v, str):
                out.append(f"{name} must be str or None, got {v!r}")
        return out

    def as_dict(self) -> dict:
        return {f.name: getattr(self, f.name) for f in fields(self)}
