"""
Convert script/llm_registry.py -> script/llm_registry.js, preserving every comment.

The registry is refreshed by pasting the UPDATE PROMPT (in the module docstring)
into Claude. That prompt, and the section comments inside the data, are the
reason this is a transformer and not a hand-port: re-running it after a refresh
must be a no-brainer.

    python seed/py2js_registry.py

Transformations (all applied only OUTSIDE string literals):
    None            -> null
    True / False    -> true / false
    1_000_000       -> 1000000        (but "intro_..._2026_08_31" is left alone)
    # comment       -> // comment
    implicit string concatenation inside (...) -> explicit `+`
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "script" / "llm_registry.py"
DST = ROOT / "script" / "llm_registry.js"

# A double- or single-quoted literal, honouring backslash escapes.
STRING_RE = re.compile(r'"(?:[^"\\]|\\.)*"' + r"|'(?:[^'\\]|\\.)*'")


def split_code_comment(line):
    """Split a line at the first `#` that is outside a string literal.

    Walks characters rather than regex-matching, because a comment may itself
    contain quotes or apostrophes ("# don't halve this") which would desync a
    quote-based tokenizer.
    """
    quote, i = None, 0
    while i < len(line):
        ch = line[i]
        if quote:
            if ch == "\\":
                i += 2
                continue
            if ch == quote:
                quote = None
        elif ch in "\"'":
            quote = ch
        elif ch == "#":
            return line[:i], line[i:]
        i += 1
    return line, ""


def split_strings(line):
    """Split a line into (is_string, text) segments so edits skip literals."""
    out, pos = [], 0
    for m in STRING_RE.finditer(line):
        if m.start() > pos:
            out.append((False, line[pos:m.start()]))
        out.append((True, m.group(0)))
        pos = m.end()
    if pos < len(line):
        out.append((False, line[pos:]))
    return out


def convert_code(seg):
    """Python -> JS on a non-string segment."""
    seg = re.sub(r"\bNone\b", "null", seg)
    seg = re.sub(r"\bTrue\b", "true", seg)
    seg = re.sub(r"\bFalse\b", "false", seg)
    # 1_000_000 -> 1000000 (repeat: the regex consumes the digit it matches on)
    while re.search(r"\d_\d", seg):
        seg = re.sub(r"(\d)_(\d)", r"\1\2", seg)
    return seg


def convert_line(line):
    """Apply code conversions, leaving string literals and comments untouched."""
    code, comment = split_code_comment(line)
    converted = "".join(
        t if is_str else convert_code(t) for is_str, t in split_strings(code)
    )
    if comment:
        converted += "//" + comment[1:]
    return converted


def main():
    src = SRC.read_text(encoding="utf-8")

    # ---- 1. lift the module docstring (it carries the UPDATE PROMPT) --------
    m = re.match(r'\s*"""(.*?)"""\s*\n', src, re.S)
    if not m:
        sys.exit("ERROR: expected a module docstring holding the UPDATE PROMPT")
    docstring, body = m.group(1).strip("\n"), src[m.end():]

    # The prompt tells the reader which file to edit and how to validate it.
    # Both are Python-specific and would be wrong on a .js file, so they are
    # retargeted here rather than shipped broken. Everything else is verbatim.
    docstring = docstring.replace(
        "Update the LLM registry in data/llm_registry_from_claude.py.",
        "Update the LLM registry in script/llm_registry.py, then regenerate the\n"
        "JavaScript the dashboard reads with `python seed/py2js_registry.py`.",
    ).replace(
        "5. VALIDATE. Execute the file with Python; assert every model has all",
        "5. VALIDATE. Execute the file with Python AND regenerate + `node --check`\n"
        "   script/llm_registry.js; assert every model has all",
    )

    # ---- 2. keep only the literal, dropping any trailing Python -------------
    # The source ends with an `if __name__ == "__main__":` self-check that has
    # no JS meaning. The dict's closing brace is the only `}` in column 0.
    body_lines = body.split("\n")
    try:
        end = next(i for i, l in enumerate(body_lines) if l.rstrip() == "}")
    except StopIteration:
        sys.exit("ERROR: could not find the top-level `}` closing llm_registry")
    body_lines = body_lines[: end + 1]

    # ---- 3. line pass: comments, literals, implicit string concatenation ----
    out, in_concat, prev_str_idx = [], False, None

    for raw in body_lines:
        stripped = raw.strip()

        # whole-line `#` comment -> `//`, text preserved exactly
        if stripped.startswith("#"):
            out.append(raw.replace("#", "//", 1))
            continue

        line = convert_line(raw)

        code_only = split_code_comment(raw)[0].rstrip()

        if in_concat:
            if stripped.startswith(")"):
                in_concat, prev_str_idx = False, None
            elif stripped.startswith(('"', "'")):
                # adjacent literals: Python concatenates, JS needs an operator.
                # Insert before any trailing comment so it stays commented out.
                if prev_str_idx is not None:
                    p_code, p_comment = split_code_comment(out[prev_str_idx])
                    out[prev_str_idx] = p_code.rstrip() + " +" + (
                        "  " + p_comment if p_comment else ""
                    )
                prev_str_idx = len(out)
        elif re.search(r":\s*\($", code_only):
            in_concat, prev_str_idx = True, None

        out.append(line)

    body_js = "\n".join(out).strip()

    # `llm_registry = {` -> a const the IIFE can export
    body_js = re.sub(r"^llm_registry\s*=\s*\{", "const llmRegistry = {", body_js)
    body_js = body_js.rstrip().rstrip(";")
    body_js = re.sub(r"\}\s*$", "};", body_js)

    # ---- 4. emit, in the project's IIFE style ------------------------------
    js = f"""// GENERATED FILE - do not edit by hand.
// Source: script/llm_registry.py   Regenerate: python seed/py2js_registry.py
//
// Edit the Python file (it is the one the UPDATE PROMPT below refers to), then
// re-run the generator. Editing this file directly means the next refresh
// silently discards your change.

/*
{docstring}
*/

(function (window) {{
'use strict';

{body_js}

window.LLM_REGISTRY = llmRegistry;
}})(window);
"""

    DST.write_text(js, encoding="utf-8", newline="\n")
    print(f"wrote {DST.relative_to(ROOT)}  ({len(js.splitlines())} lines)")


if __name__ == "__main__":
    main()

