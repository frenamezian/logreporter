"""Build `fixture.db`. Run: `python -m parsers.tests.antigravity.make_fixture`

Why this fixture is constructed rather than scrubbed
----------------------------------------------------
`_template.scrub` is a whitelist over a JSONL session, and it works because a
JSONL line is a dict whose keys you can keep or drop. Antigravity's rows are
protobuf blobs with no field names in them, so "keep these keys" has nothing to
match on: scrubbing would mean re-encoding the message anyway.

And the message really does need scrubbing. Alongside the counters, every real
blob carries field 1.9.10 — a context breakdown naming the user's rules, their
skills, and every tool the agent was offered, with a token count each. The
parser never reads it, but a fixture is committed forever, so the safe thing is
a blob that never contained it.

So this writes the same protobuf shape with invented contents — every number,
id, path, repository and branch below is made up, including the response ids,
which in life are opaque server-side identifiers but are still somebody's.
What that buys and what it costs:

  * the numbers in expected_totals.json are hand-chosen, so "hand-counted" is
    literally true, and a parser regression that inflates a total fails here;
  * it cannot prove the field *map* is right — a fixture the parser's own author
    encoded would agree with the parser even if both were wrong about
    Antigravity.

That second point is the real risk, so the map was pinned down separately, and
the module docstring of parsers/antigravity.py records how: the field names come
from the protobuf descriptors compiled into the IDE bundle, and the invariants
(`thinking + response == output`, `response_id` unique, `cache_write_tokens`
never present) were checked against 7,679 real requests across 69 conversations.
This file pins the parser's behaviour; that pinned the parser's premises.

The five rows cover: no cache read; a cache read; a model that reports no
thinking split; a request with neither a response id nor a model string; and a
step that ran no model at all and must produce no record.
"""

import sqlite3
from pathlib import Path

OUT = Path(__file__).parent / "fixture.db"


# --- protobuf encoding -------------------------------------------------------

def _varint(n: int) -> bytes:
    out = bytearray()
    while True:
        b = n & 0x7F
        n >>= 7
        out.append(b | (0x80 if n else 0))
        if not n:
            return bytes(out)


def _tag(field: int, wire: int) -> bytes:
    return _varint((field << 3) | wire)


def num(field: int, value: int) -> bytes:
    return _tag(field, 0) + _varint(value)


def blob(field: int, value: bytes) -> bytes:
    return _tag(field, 2) + _varint(len(value)) + value


def text(field: int, value: str) -> bytes:
    return blob(field, value.encode("utf-8"))


def msg(field: int, *parts: bytes) -> bytes:
    return blob(field, b"".join(parts))


# --- the shapes the parser reads ---------------------------------------------

def usage(*, model_enum, input_tokens, output_tokens, provider,
          cache_read=None, thinking=None, response=None, response_id=None):
    """exa.codeium_common_pb.ModelUsageStats, as field 4 of the step.

    Absent counters are absent, exactly as proto3 leaves them — that is the
    whole point of the NULL-is-not-zero rule, and a fixture that encoded an
    explicit 0 for cache_read would not test it.
    """
    parts = [num(1, model_enum), num(2, input_tokens), num(3, output_tokens)]
    if cache_read is not None:
        parts.append(num(5, cache_read))
    parts.append(num(6, provider))
    if thinking is not None:
        parts.append(num(9, thinking))
    if response is not None:
        parts.append(num(10, response))
    if response_id is not None:
        parts.append(text(11, response_id))
    return msg(4, *parts)


def when(seconds: int, nanos: int) -> bytes:
    """Field 9 of the step, whose field 4 is the {seconds, nanos} timestamp."""
    return msg(9, msg(4, num(1, seconds), num(2, nanos)))


def step(*parts: bytes) -> bytes:
    """The stored blob: CortexStepMetadata wrapped in field 1."""
    return msg(1, *parts)


ROWS = [
    # 0 — a plain request, nothing cached.
    step(usage(model_enum=1020, input_tokens=25706, output_tokens=542,
               provider=24, thinking=459, response=83,
               response_id="ExampleResponseId000001"),
         when(1782197970, 725446800),
         text(19, "gemini-3-flash-a")),
    # 1 — the same conversation once the prompt cache is warm.
    step(usage(model_enum=1020, input_tokens=27119, output_tokens=246,
               cache_read=24679, provider=24, thinking=146, response=100,
               response_id="ExampleResponseId000002"),
         when(1782197975, 303773700),
         text(19, "gemini-3-flash-a")),
    # 2 — a different provider, reporting no thinking/response split at all.
    #     extra_json must come out NULL rather than {"reasoning_output_tokens": 0}.
    step(usage(model_enum=1035, input_tokens=1000, output_tokens=200,
               cache_read=50000, provider=26,
               response_id="ExampleResponseId000003"),
         when(1782198100, 0),
         text(19, "claude-sonnet-4-6")),
    # 3 — no response_id and no model string: 29 of 7,679 real rows had no
    #     response_id and 32 had no model. The id must be synthesized and
    #     stable; model_id must stay NULL rather than be guessed.
    step(usage(model_enum=1020, input_tokens=500, output_tokens=10,
               provider=24, thinking=6, response=4),
         when(1782198200, 500000000)),
    # 4 — a step that ran no model. No ModelUsageStats, so no record: emitting
    #     one with zeros would invent a request that never happened.
    step(when(1782198300, 0), text(19, "gemini-3-flash-a")),
]

# The workspace folder and the git remote deliberately disagree, because they do
# in life: the parser must take the repo name from the remote, which is what
# log_activity.py records and therefore what attribution joins on.
META = blob(1, b"".join([
    text(1, "file:///c:/Users/example/src/ExampleRepo-worktree"),
    text(2, "file:///c:/Users/example/src/ExampleRepo-worktree"),
    msg(3, text(1, "example-org/ExampleRepo"),
        text(2, "https://github.com/example-org/ExampleRepo.git")),
    text(4, "feature/example"),
])) + msg(2, num(1, 1782197970), num(2, 607106500))

CASCADE_ID = "11111111-2222-3333-4444-555555555555"
TRAJECTORY_ID = "66666666-7777-8888-9999-aaaaaaaaaaaa"


def main():
    if OUT.exists():
        OUT.unlink()
    con = sqlite3.connect(OUT)
    con.execute("CREATE TABLE gen_metadata (idx INTEGER PRIMARY KEY, "
                "data BLOB, size INTEGER)")
    con.execute("CREATE TABLE trajectory_meta (trajectory_id TEXT, "
                "cascade_id TEXT, trajectory_type INTEGER, source INTEGER)")
    con.execute("CREATE TABLE trajectory_metadata_blob (id TEXT PRIMARY KEY, "
                "data BLOB)")
    con.executemany("INSERT INTO gen_metadata (idx, data, size) VALUES (?,?,?)",
                    [(i, r, len(r)) for i, r in enumerate(ROWS)])
    con.execute("INSERT INTO trajectory_meta VALUES (?,?,?,?)",
                (TRAJECTORY_ID, CASCADE_ID, 4, 1))
    con.execute("INSERT INTO trajectory_metadata_blob VALUES (?,?)",
                ("main", META))
    con.commit()
    con.close()
    print(f"wrote {OUT} ({OUT.stat().st_size} bytes, {len(ROWS)} steps)")


if __name__ == "__main__":
    main()
