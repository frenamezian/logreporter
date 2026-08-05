"""Run every Task 0010 check and summarise.

    python tasks/checks/run_all.py

Each check is also runnable on its own — this only saves typing and gives one
exit code. A check that SKIPS (node absent, no _build present) is reported as
such and does not turn the run red: a skip is the check declining to make a
claim, which is different from making one and being wrong.
"""

import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _lib import REPO, utf8_stdout  # noqa: E402

HERE = Path(__file__).resolve().parent


def main() -> None:
    utf8_stdout()
    scripts = sorted(p for p in HERE.glob("check_*.py"))
    if not scripts:
        sys.exit("no checks found — wrong directory?")

    results = []
    for script in scripts:
        proc = subprocess.run(
            [sys.executable, str(script)], cwd=REPO,
            capture_output=True, text=True, encoding="utf-8", errors="replace",
        )
        out = proc.stdout or ""
        skipped = "-> SKIPPED" in out
        status = "SKIP" if skipped else ("PASS" if proc.returncode == 0 else "FAIL")
        results.append((status, script.name, out, proc.stderr))
        print(f"[{status}] {script.name}")
        if status == "FAIL":
            print(out)
            if proc.stderr:
                print(proc.stderr)

    failed = [n for s, n, _, _ in results if s == "FAIL"]
    print(f"\n{len(results)} checks · "
          f"{sum(s == 'PASS' for s, *_ in results)} pass · "
          f"{sum(s == 'SKIP' for s, *_ in results)} skip · "
          f"{len(failed)} fail")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
