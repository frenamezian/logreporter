"""Naming a repository the way every side of the join agrees on.

`_`-prefixed, so the loader treats this as infrastructure rather than a parser
(see loader.py) and never asks it for the six names.

Attribution (§7) joins usage rows to tasks on `repo_name`, and the two sides
name repositories independently: `log_activity.py` records what the agent was
working on, a parser records what it can infer from a transcript's `cwd`. A
folder name cannot carry that agreement, because it is a local accident chosen
at clone time and never resynchronised afterwards:

    C:/Users/.../github/log_reporter   ->  github.com/frenamezian/logreporter
    C:/Users/.../github/Playground-Harness -> github.com/frenamezian/Playground

Both of those are real cases in this repository's own history, and the first
one silently orphaned every usage row it produced.

So the name is taken from the **origin remote URL**, which is the identity the
repository actually has: shared by every checkout, unchanged by renaming or
moving the folder, and already what `parsers/antigravity.py` reads out of
Antigravity's workspace metadata.

Worktrees and submodules need no special case here, which is the pleasant part.
The walk up to the nearest `.git` already lands in the right git directory for
every shape, and `config` sits in that directory:

    normal clone     .git/            -> its own remote
    linked worktree  .git file -> <main>/.git/worktrees/<id>, config is shared
                                  with <main>       -> the MAIN repo's remote
    submodule        .git file -> <super>/.git/modules/<sub>
                                                    -> the submodule's own remote

which gives exactly the intended semantics: worktrees of one repo stay one node
on the dashboard, submodules stay their own node.

No subprocess. `git rev-parse` costs ~70ms on Windows and a history holds
hundreds of distinct directories; this is a stat walk, one small file read, and
a cache.

`log_activity.py` implements the same rule against `git rev-parse
--git-common-dir`. It deliberately does NOT import this module - it is the
ground-truth writer and must not acquire a dependency on the parser package -
so the URL rule is duplicated there. Change both.
"""

import re
from pathlib import Path

__all__ = ["repo_from_cwd", "repo_name_from_url", "origin_url"]

_repo_cache: dict[str, str | None] = {}

# scheme://user:token@host/... - credentials must never reach the database.
_CREDS = re.compile(r"^([a-z][a-z0-9+.\-]*://)[^/@]*@", re.I)
_SECTION = re.compile(r"^\[([^\]]+)\]$")
_REMOTE = re.compile(r'^remote\s+"?([^"]+)"?$', re.I)


def repo_name_from_url(url):
    """The repository name from a remote URL, or None.

    Handles the three shapes git accepts, plus credentials:

        https://github.com/frenamezian/logreporter.git   -> logreporter
        git@github.com:frenamezian/logreporter.git       -> logreporter
        https://user:token@github.com/owner/name.git     -> name
        C:\\srv\\mirrors\\thing.git                        -> thing
    """
    if not isinstance(url, str) or not url.strip():
        return None
    u = _CREDS.sub(r"\1", url.strip()).replace("\\", "/").rstrip("/")
    if u.lower().endswith(".git"):
        u = u[:-4].rstrip("/")
    name = u.rsplit("/", 1)[-1]
    if ":" in name:
        # scp-like with no path separator after the colon: git@host:name
        name = name.rsplit(":", 1)[-1]
    return name[:64] or None


def _remotes(config_text):
    """{remote name: url} from a git config file.

    Hand-rolled rather than configparser: git allows `[remote "origin"]`
    subsections and repeats `url` when a remote has several, both of which
    configparser either mangles or raises on.
    """
    urls = {}
    section = None
    for raw in config_text.splitlines():
        line = raw.strip()
        if not line or line[0] in "#;":
            continue
        m = _SECTION.match(line)
        if m:
            section = m.group(1).strip()
            continue
        if not section or "=" not in line:
            continue
        key, _, value = line.partition("=")
        if key.strip().lower() != "url":
            continue
        rm = _REMOTE.match(section)
        if rm:
            urls.setdefault(rm.group(1), value.strip())   # first url wins
    return urls


def origin_url(git_dir):
    """The origin remote's URL for a resolved git directory, or None.

    Falls back to the sole remote when there is exactly one and it is not
    called origin; with several non-origin remotes there is no defensible
    choice, so it returns None and the caller degrades to a folder name.
    """
    try:
        text = (Path(git_dir) / "config").read_text(encoding="utf-8", errors="replace")
    except (OSError, ValueError):
        return None
    urls = _remotes(text)
    if "origin" in urls:
        return urls["origin"]
    if len(urls) == 1:
        return next(iter(urls.values()))
    return None


def _git_dir_and_folder(cwd):
    """Walk up to the nearest `.git`. Returns (git_dir, folder_name).

    `git_dir` is where `config` lives - already resolved through a worktree or
    submodule pointer file. Either element is None when the walk finds nothing,
    which happens for a directory that is not a repository and for a transcript
    that outlived its checkout.
    """
    p = Path(cwd)
    for d in (p, *p.parents):
        dot = d / ".git"
        try:
            if dot.is_dir():
                return dot, d.name
            if dot.is_file():
                text = dot.read_text(encoding="utf-8", errors="replace").strip()
                target = text[len("gitdir:"):].strip() if text.startswith("gitdir:") else ""
                norm = target.replace("\\", "/")
                if "/.git/worktrees/" in norm:
                    # <main>/.git/worktrees/<id> -> config lives in <main>/.git
                    main = norm.split("/.git/worktrees/")[0]
                    return Path(main) / ".git", Path(main).name
                # submodule (<super>/.git/modules/<sub>), or anything unusual:
                # its config is its own, and so is its name.
                git_dir = Path(target) if target else None
                if git_dir is not None and not git_dir.is_absolute():
                    git_dir = (d / git_dir).resolve()
                return git_dir, d.name
        except OSError:
            continue
    return None, None


def repo_from_cwd(cwd):
    """The repository name for a working directory, by the §7 join's rule.

    The ladder, degrading rather than guessing:

      1. the origin remote's name  - the repository's real identity
      2. the folder holding `.git` - a repo with no usable remote
      3. the cwd's own basename    - not a repository, or the checkout is gone

    Rung 3 is what a deleted checkout falls to: the walk has no filesystem left
    to inspect, so a transcript recorded in `.../<repo>/docs` can only report
    `docs`. Those rows are orphans by construction, which is what the usage
    page's orphan-repo warning is for.
    """
    if not cwd:
        return None
    if cwd in _repo_cache:
        return _repo_cache[cwd]

    name = None
    try:
        p = Path(cwd)
        git_dir, folder = _git_dir_and_folder(cwd)
        if git_dir is not None:
            name = repo_name_from_url(origin_url(git_dir))
        name = name or folder or p.name or None
    except (OSError, ValueError):
        name = None

    _repo_cache[cwd] = name
    return name
