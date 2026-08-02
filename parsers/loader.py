"""Find, import and validate the parser plugins. No registration list.

Why there is no list to edit
----------------------------
Every file in this directory that does not start with `_` is a parser, found by
globbing. A central registry would mean every contributor's pull request edits
the same file, so every pull request conflicts with every other one. Adding an
agent has to be *one new file and nothing else*, or nobody adds one.

Why every failure is caught and reported instead of raised
-----------------------------------------------------------
These are third-party files. One community parser with a typo, an import of a
library the user does not have, or a `detect()` that throws on an exotic
filesystem must cost exactly that parser — never the dashboard. Failures are
collected with their traceback and handed back to the caller, which surfaces
them in the source-transparency panel. A total that is quietly partial is the
worst outcome this feature can produce, so a parser that did not load is a
thing the user gets told about, not a thing that silently reads as zero.
"""

import importlib
import traceback
from dataclasses import dataclass, field
from pathlib import Path

from . import CONTRACT

PARSER_DIR = Path(__file__).parent
PACKAGE = __package__ or "parsers"


@dataclass
class LoadedParser:
    """A module that passed contract validation."""
    module_name: str
    module: object
    agent_id: str
    agent_name: str
    homepage: str
    priority: int

    def __repr__(self):
        return f"<parser {self.module_name} agent={self.agent_id} pri={self.priority}>"


@dataclass
class Failure:
    """A module that could not be used, and why. Shown in the UI."""
    module_name: str
    stage: str          # "import" | "contract" | "detect"
    error: str
    detail: str = ""


@dataclass
class LoadResult:
    parsers: list = field(default_factory=list)
    failures: list = field(default_factory=list)
    # Modules in parsers/ that declare none of the contract: the framework's
    # own files. Listed rather than dropped, so "why is my parser not showing
    # up" has an answer that does not require reading this file.
    not_parsers: list = field(default_factory=list)


def _module_names(dirpath: Path) -> list[str]:
    # `_`-prefixed files are infrastructure, not parsers: _template.py is the
    # contributor's starting point and would otherwise be loaded as a real
    # agent, and any future _helpers.py must stay invisible here too.
    return sorted(
        p.stem for p in dirpath.glob("*.py")
        if not p.name.startswith("_")
    )


def _validate(module_name: str, mod) -> tuple[LoadedParser | None, Failure | None]:
    present = [n for n in CONTRACT if hasattr(mod, n)]
    if not present:
        # Not a parser at all — loader.py and conformance.py live in this
        # directory too. Distinguishing them by "declares none of the contract"
        # rather than by name keeps the framework from owning a list of its own
        # files that someone has to remember to update. A module declaring
        # *some* of the contract is a parser with a mistake in it, and falls
        # through to the error below where the contributor can see it.
        return None, None
    missing = [n for n in CONTRACT if n not in present]
    if missing:
        return None, Failure(module_name, "contract",
                             f"missing required name(s): {', '.join(missing)}")

    for n in ("detect", "discover", "parse"):
        if not callable(getattr(mod, n)):
            return None, Failure(module_name, "contract", f"{n} is not callable")

    agent_id = getattr(mod, "AGENT_ID")
    if not isinstance(agent_id, str) or not agent_id.strip():
        return None, Failure(module_name, "contract",
                             f"AGENT_ID must be a non-empty string, got {agent_id!r}")

    priority = getattr(mod, "PRIORITY")
    if isinstance(priority, bool) or not isinstance(priority, int):
        return None, Failure(module_name, "contract",
                             f"PRIORITY must be an int, got {priority!r}")

    return LoadedParser(
        module_name=module_name,
        module=mod,
        agent_id=agent_id,
        agent_name=str(getattr(mod, "AGENT_NAME") or agent_id),
        homepage=str(getattr(mod, "HOMEPAGE") or ""),
        priority=priority,
    ), None


def load(dirpath: Path | None = None) -> LoadResult:
    """Import every parser module in `dirpath` and validate the contract."""
    dirpath = Path(dirpath) if dirpath else PARSER_DIR
    result = LoadResult()
    for name in _module_names(dirpath):
        try:
            mod = importlib.import_module(f"{PACKAGE}.{name}")
        except BaseException as e:  # noqa: BLE001 - a plugin may raise anything
            result.failures.append(Failure(
                name, "import", f"{type(e).__name__}: {e}",
                traceback.format_exc(limit=4),
            ))
            continue
        parser, failure = _validate(name, mod)
        if parser:
            result.parsers.append(parser)
        elif failure:
            result.failures.append(failure)
        else:
            result.not_parsers.append(name)
    return result


def resolve(result: LoadResult) -> list[LoadedParser]:
    """Return the parsers that claim this machine, one per agent.

    Highest PRIORITY wins a contested AGENT_ID; ties break on module name so
    two installs of the same repo resolve identically. A native parser
    outranking the ccusage fallback for the same agent is just this rule with
    ccusage's PRIORITY set low — no special case for it.
    """
    claimed: dict[str, LoadedParser] = {}
    for p in result.parsers:
        try:
            if not p.module.detect():
                continue
        except BaseException as e:  # noqa: BLE001
            result.failures.append(Failure(
                p.module_name, "detect", f"{type(e).__name__}: {e}",
                traceback.format_exc(limit=4),
            ))
            continue
        cur = claimed.get(p.agent_id)
        if cur is None or (p.priority, p.module_name) > (cur.priority, cur.module_name):
            claimed[p.agent_id] = p
    return sorted(claimed.values(), key=lambda p: p.agent_id)
