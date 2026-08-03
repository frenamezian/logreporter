"""
Publish site/_build/ to the gh-pages branch.

    python site/publish.py             commit _build/ onto gh-pages, locally
    python site/publish.py --push      ... and push it to origin
    python site/publish.py --orphan    ... starting the branch's history over

gh-pages is build output. Nothing there is edited by hand and nothing is merged
into it — it is regenerated from site/ and replaced wholesale. Its source of
truth is this branch.

How it works, and why there is no checkout. The commit is built with plumbing:
a throwaway index is filled from _build/ with GIT_WORK_TREE pointed at it, and
the resulting tree is committed straight onto the branch. Nothing is checked
out, so publishing cannot disturb your working tree, cannot trip the
activity_logs.db checkout hazard that .gitignore documents at length, and needs
no second worktree — which on Windows is a directory git routinely cannot
delete afterwards.

By default the new commit's parent is whatever gh-pages already points at, so
the branch keeps a history and `git push` fast-forwards. --orphan drops that and
starts clean; the next push then needs --force.
"""

import argparse
import os
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "tools"))
from _paths import BUILD, REPO  # noqa: E402

BRANCH = "gh-pages"


def git(*args: str, env=None) -> str:
    r = subprocess.run(
        ["git", "-C", str(REPO), *args],
        capture_output=True, text=True, env=env,
    )
    if r.returncode:
        sys.exit(f"git {' '.join(args)}\n{r.stderr.strip()}")
    return r.stdout.strip()


def check_build() -> None:
    """Refuse to publish something that is not a built site, or that carries a
    database we have no business publishing."""
    if not (BUILD / "index.html").exists():
        sys.exit("no site/_build/index.html — run: python site/build.py")
    if not (BUILD / "app" / "index.html").exists():
        sys.exit("no site/_build/app/ — run: python site/build.py")

    # The only databases that may be published are the demo fixtures: the sample
    # logs, byte-identical to the tracked seed, and the synthetic usage sibling
    # generated beside them. A live activity_logs.db or token_usage.db reaching
    # a public branch would publish real repository names, branch names and
    # working patterns — see .gitignore and .githooks/pre-commit.
    seed = (REPO / "seed" / "activity_logs.db").read_bytes()
    for db in BUILD.rglob("*.db"):
        rel = db.relative_to(BUILD).as_posix()
        if rel == "app/activity_logs.db":
            if db.read_bytes() != seed:
                sys.exit(f"{rel} is not seed/activity_logs.db — refusing to publish")
        elif rel != "app/token_usage.db":
            sys.exit(f"unexpected database in the build: {rel} — refusing to publish")


def build_commit(orphan: bool) -> str:
    # Not git(): a missing branch is the normal first-publish case, not an error.
    parent = ""
    if not orphan:
        r = subprocess.run(
            ["git", "-C", str(REPO), "rev-parse", "--verify", "--quiet", f"refs/heads/{BRANCH}"],
            capture_output=True, text=True,
        )
        parent = r.stdout.strip()

    gitdir = git("rev-parse", "--absolute-git-dir")

    with tempfile.TemporaryDirectory() as tmp:
        env = dict(os.environ)
        env["GIT_DIR"] = gitdir
        env["GIT_WORK_TREE"] = str(BUILD)
        env["GIT_INDEX_FILE"] = str(Path(tmp) / "index")

        # -f because _build/ is gitignored from the repository's point of view;
        # with the work tree moved onto it, paths are recorded relative to
        # _build/, which is exactly the layout the branch needs.
        subprocess.run(["git", "add", "-A", "-f", "."],
                       cwd=BUILD, env=env, check=True)
        tree = subprocess.run(["git", "write-tree"], cwd=BUILD, env=env,
                              capture_output=True, text=True, check=True).stdout.strip()

    head = git("rev-parse", "--short", "HEAD")
    branch = git("rev-parse", "--abbrev-ref", "HEAD")
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    msg = f"Publish the site built from {branch}@{head} on {stamp}"

    args = ["commit-tree", tree, "-m", msg]
    if parent:
        args += ["-p", parent]
    return git(*args)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--push", action="store_true", help="push the branch to origin")
    ap.add_argument("--orphan", action="store_true",
                    help="drop gh-pages history and start it over")
    args = ap.parse_args()

    check_build()
    sha = build_commit(args.orphan)
    git("branch", "-f", BRANCH, sha)

    n = len(git("ls-tree", "-r", "--name-only", BRANCH).splitlines())
    print(f"{BRANCH} -> {sha[:9]}  ({n} files)")

    if args.push:
        force = ["--force"] if args.orphan else []
        print(git("push", *force, "origin", f"{BRANCH}:{BRANCH}"))
        print("pushed. GitHub Pages redeploys within a minute or so.")
    else:
        cmd = "git push --force origin gh-pages" if args.orphan else "git push origin gh-pages"
        print(f"not pushed. When you are happy with it:  {cmd}")


if __name__ == "__main__":
    main()
