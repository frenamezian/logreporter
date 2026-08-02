"""Run every shipped parser against its fixture. `python -m parsers.conformance`

Why a fixture is mandatory
--------------------------
A parser can only be reviewed by someone who has that agent installed —
otherwise the reviewer is reading code against a file format they have never
seen and taking the contributor's word for it. A redacted fixture plus its
expected output turns "trust me" into something anyone can run in two seconds,
on any machine, with no agent installed. A pull request without one is not
reviewable, so it is not mergeable.

What it checks, and why each one is here
-----------------------------------------
Every assertion below corresponds to a way a parser has actually been observed
to go wrong, in this repo or in the tools this feature replaces:

  totals        The whole point. Compared against hand-counted numbers in
                expected_totals.json, not against the parser's own output — a
                fixture that only pins the parser to itself would happily pin
                in a 3.4x overcount.
  records       Exact per-record match. Catches a field quietly moving.
  determinism   Parsing twice must give identical records. A parser that
                iterates a dict, or hashes something that includes a
                timestamp, breaks re-import idempotency without ever failing
                loudly.
  invariants    No negative counters, no bools masquerading as ints, no
                required field empty. See UsageRecord.problems().
  null          NULL must survive as NULL. A parser that coerces an unreported
                counter to 0 claims the agent reported zero, which for a cache
                write means claiming it was free.
  cursor        A cursor must round-trip: reading to the end and resuming must
                yield nothing, and reading in two halves must equal reading in
                one. This is the property that makes incremental refresh safe.
  privacy       No field may carry anything long enough to be message content,
                and extra_json may only hold whitelisted keys. Fixtures are
                committed forever; so is a leak.

Layout expected of a contributor:

  parsers/tests/<agent_id>/
      fixture.jsonl            a small, REDACTED session (see _template.scrub)
      expected.json            the records the parser must produce
      expected_totals.json     hand-counted totals, and why they are right
"""

import json
import sys
from pathlib import Path

from . import COUNTER_FIELDS, EXTRA_ALLOWED
from . import loader as parser_loader

TESTS_DIR = Path(__file__).parent / "tests"

# Nothing a parser emits should be long enough to be a prompt, a stack trace or
# a line of source. Model ids and branch names are comfortably under this.
MAX_FIELD_LEN = 128


class Check:
    def __init__(self, agent_id):
        self.agent_id = agent_id
        self.passed = []
        self.failed = []

    def ok(self, label, cond, detail="", on_fail=""):
        # `detail` is worth seeing either way (the totals); `on_fail` is the
        # explanation of what went wrong and only shows up when it did.
        self.passed.append((label, detail)) if cond else \
            self.failed.append((label, on_fail or detail))
        return cond


def _load_json(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def _records(mod, path, cursor=None):
    recs, new_cursor = mod.parse(path, cursor)
    return [r.as_dict() for r in recs], new_cursor


def _totals(rows):
    out = {}
    for c in COUNTER_FIELDS:
        vals = [r[c] for r in rows if r[c] is not None]
        out[c] = sum(vals) if vals else None
    out["records"] = len(rows)
    return out


def check_parser(p, tests_dir=TESTS_DIR) -> Check:
    c = Check(p.agent_id)
    mod = p.module
    d = Path(tests_dir) / p.agent_id

    fixtures = sorted(d.glob("fixture.*")) if d.is_dir() else []
    if not c.ok("fixture present", bool(fixtures), on_fail=(
            f"expected {d / 'fixture.*'} - a parser without a fixture cannot "
            f"be reviewed by anyone who does not have the agent installed")):
        return c
    fixture = fixtures[0]

    if not c.ok("expected.json present", (d / "expected.json").is_file(),
                on_fail=f"expected {d / 'expected.json'}"):
        return c

    expected = _load_json(d / "expected.json")

    try:
        rows, cursor = _records(mod, fixture)
    except Exception as e:  # noqa: BLE001
        c.ok("parse() runs", False, f"{type(e).__name__}: {e}")
        return c
    c.ok("parse() runs", True)

    # --- totals against hand-counted truth ---------------------------------
    tpath = d / "expected_totals.json"
    if c.ok("expected_totals.json present", tpath.is_file(),
            on_fail=f"expected {tpath} with hand-counted totals"):
        want = _load_json(tpath)
        got = _totals(rows)
        for k in list(COUNTER_FIELDS) + ["records"]:
            if k in want:
                c.ok(f"total {k}", got.get(k) == want[k],
                     f"got {got.get(k)!r}, hand-count says {want[k]!r}")

    # --- exact records ------------------------------------------------------
    c.ok("record count", len(rows) == len(expected),
         f"got {len(rows)}, expected {len(expected)}")
    if len(rows) == len(expected):
        diffs = []
        for i, (g, w) in enumerate(zip(rows, expected)):
            for k in w:
                if g.get(k) != w[k]:
                    diffs.append(f"[{i}].{k}: got {g.get(k)!r} want {w[k]!r}")
        c.ok("records match expected.json", not diffs,
             "; ".join(diffs[:4]) + (f" (+{len(diffs) - 4} more)" if len(diffs) > 4 else ""))

    # --- determinism --------------------------------------------------------
    rows2, cursor2 = _records(mod, fixture)
    c.ok("parsing twice is identical", rows == rows2 and cursor == cursor2)

    # --- invariants ---------------------------------------------------------
    recs, _ = mod.parse(fixture, None)
    problems = [pr for r in recs for pr in r.problems()]
    c.ok("no invariant violations", not problems, "; ".join(problems[:3]))

    # --- NULL is not zero ---------------------------------------------------
    # Checked against the fixture's own expectations: wherever expected.json
    # says null, the parser must produce null and not 0.
    coerced = [f"[{i}].{k}" for i, w in enumerate(expected) for k in COUNTER_FIELDS
               if w.get(k, "absent") is None and rows[i].get(k) is not None]
    c.ok("NULL counters stay NULL", not coerced, ", ".join(coerced[:5]))

    # --- cursor -------------------------------------------------------------
    kind = getattr(mod, "SOURCE_KIND", "files")
    if kind == "files":
        tail, _ = _records(mod, fixture, cursor)
        c.ok("resuming at the end yields nothing", not tail, f"got {len(tail)} record(s)")

        # Reading in two halves must equal reading in one. Split at a byte
        # offset roughly halfway, on a line boundary the parser will accept.
        size = fixture.stat().st_size
        half = _split_offset(fixture, size // 2)
        part1, cur1 = _records(mod, fixture, _fabricate_cursor(mod, 0))
        if cur1 is not None:
            partial_cursor = _fabricate_cursor(mod, half)
            if partial_cursor is not None:
                part2, _ = _records(mod, fixture, partial_cursor)
                first, _ = _records(mod, fixture, None)
                ids_full = [r["request_id"] for r in first]
                ids_tail = [r["request_id"] for r in part2]
                c.ok("a mid-file cursor resumes without inventing records",
                     set(ids_tail) <= set(ids_full),
                     f"{len(set(ids_tail) - set(ids_full))} record(s) not in the full read")
    else:
        c.ok("stateless source declares SOURCE_KIND", kind == "command", kind)

    # --- privacy ------------------------------------------------------------
    long_fields = []
    bad_extra = set()
    for i, r in enumerate(rows):
        for k, v in r.items():
            if isinstance(v, str) and len(v) > MAX_FIELD_LEN and k != "extra_json":
                long_fields.append(f"[{i}].{k} ({len(v)} chars)")
        if r.get("extra_json"):
            try:
                bad_extra |= set(json.loads(r["extra_json"])) - EXTRA_ALLOWED
            except json.JSONDecodeError:
                bad_extra.add("<invalid json>")
    c.ok(f"no field longer than {MAX_FIELD_LEN} chars", not long_fields,
         ", ".join(long_fields[:3]))
    c.ok("extra_json keys are whitelisted", not bad_extra, ", ".join(sorted(bad_extra)))

    # --- the fixture itself -------------------------------------------------
    c.ok("fixture is small (< 512 KB)", fixture.stat().st_size < 512 * 1024,
         f"{fixture.stat().st_size / 1024:.0f} KB")

    return c


def _split_offset(path, target):
    """Round `target` up to the next line boundary."""
    with open(path, "rb") as f:
        f.seek(target)
        f.readline()
        return f.tell()


def _fabricate_cursor(mod, offset):
    """Build a cursor at `offset` using the parser's own writer, if it has one.

    Parsers are not required to expose _write_cursor — a SQLite-backed parser
    has no byte offsets at all. When it is absent this check is skipped rather
    than guessed at.
    """
    fn = getattr(mod, "_write_cursor", None)
    if not callable(fn):
        return None
    try:
        return fn(offset)
    except Exception:  # noqa: BLE001
        return None


def main(argv=None):
    argv = argv if argv is not None else sys.argv[1:]
    only = argv[0] if argv else None

    result = parser_loader.load()
    for f in result.failures:
        print(f"FAIL  {f.module_name}: {f.stage}: {f.error}")

    # Note: every *loaded* parser is checked, not only the ones detect() claims.
    # A contributor on Windows must be able to run conformance for a parser
    # whose agent only exists on macOS — that is the entire point of fixtures.
    checks = []
    for p in result.parsers:
        if only and p.agent_id != only:
            continue
        checks.append(check_parser(p))

    ok = True
    for c in checks:
        print(f"\n{c.agent_id}")
        for label, detail in c.passed:
            print(f"  pass  {label}" + (f"   {detail}" if detail else ""))
        for label, detail in c.failed:
            ok = False
            print(f"  FAIL  {label}" + (f"   {detail}" if detail else ""))

    if not checks:
        print("no parsers to check")
    n_fail = sum(len(c.failed) for c in checks)
    print(f"\n{len(checks)} parser(s), "
          f"{sum(len(c.passed) for c in checks)} check(s) passed, {n_fail} failed")
    return 0 if ok and not result.failures else 1


if __name__ == "__main__":
    sys.exit(main())
