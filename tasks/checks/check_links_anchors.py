"""No link and no anchor was lost in the landing redesign.

    python tasks/checks/check_links_anchors.py

WHY THIS EXISTS
---------------
Task 0010 acceptance criterion: "#how, #cost, #disclaimer anchors resolve;
every pre-existing link (incl. the sponsor UTM link and all app/index.html#…
demo links) survives." The brief repeats it ("Keep the existing anchors … and
all links"). These are the page's external contract: an anchor is what someone
else's bookmark points at, the UTM link is how the sponsor is credited, and the
demo links are the only route from the landing into the app. A redesign that
re-nests every section is exactly how one of them is dropped silently.

Beyond survival, this also asserts that every in-page #fragment RESOLVES, which
the old page could not have told you either — a surviving href to a deleted id
is a link that is present and broken.

WHAT WOULD MAKE THIS RED
  - deleting or renaming any id or href that existed before
  - pointing a nav link at a fragment with no matching element
  - dropping the sponsor UTM tail, or any of the six demo deep links
"""

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _lib import BASELINE, Check, attr_values, git_show, read  # noqa: E402

PAGE = "site/index.html"

# Named explicitly because the task names them. A generic "nothing was lost"
# assertion would go quiet if BOTH revisions lost them.
REQUIRED_ANCHORS = ["#how", "#cost", "#disclaimer"]
REQUIRED_SUBSTRINGS = {
    "sponsor UTM link": "utm_source=logreporter",
    "demo entry link": "app/index.html",
}


def main() -> None:
    c = Check(f"{PAGE} links and anchors survive vs {BASELINE}")

    old, new = git_show(PAGE), read(PAGE)
    old_ids, new_ids = set(attr_values(old, "id")), set(attr_values(new, "id"))
    old_href, new_href = set(attr_values(old, "href")), set(attr_values(new, "href"))

    if not c.expect(len(old_ids) > 5 and len(old_href) > 20,
                    f"baseline parse found {len(old_ids)} ids / {len(old_href)} hrefs (sanity)"):
        c.done()

    lost_ids = sorted(old_ids - new_ids)
    lost_href = sorted(old_href - new_href)
    c.expect(not lost_ids, f"no id was lost {lost_ids}")
    c.expect(not lost_href, f"no href was lost {lost_href}")

    for i in sorted(new_ids - old_ids):
        c.note(f"id added: {i}")
    for h in sorted(new_href - old_href):
        c.note(f"href added: {h}")

    # The three named anchors, as ids AND as something that links to them.
    for anchor in REQUIRED_ANCHORS:
        c.expect(anchor.lstrip("#") in new_ids, f"{anchor} exists as an element id")
        c.expect(anchor in new_href, f"{anchor} is linked from the page")

    for label, needle in REQUIRED_SUBSTRINGS.items():
        c.expect(any(needle in h for h in new_href), f"{label} survives ({needle})")

    # Every deep link into the demo still points at a real app page anchor.
    demo = sorted(h for h in new_href if h.startswith("app/index.html"))
    old_demo = sorted(h for h in old_href if h.startswith("app/index.html"))
    c.expect(set(old_demo) <= set(demo),
             f"all {len(old_demo)} pre-existing demo links survive ({len(demo)} now)")

    # Every in-page fragment resolves to an id in the same document.
    dangling = sorted(
        h for h in new_href
        if h.startswith("#") and h != "#" and h.lstrip("#") not in new_ids
    )
    c.expect(not dangling, f"every in-page #fragment resolves {dangling}")

    # url(#id) references (the SVG brand mark's clip paths and hatch patterns)
    # resolve too — a broken one silently renders the mark without its foot.
    url_refs = sorted(set(re.findall(r'url\(#([A-Za-z0-9_-]+)\)', new)))
    missing = [r for r in url_refs if r not in new_ids]
    c.expect(url_refs, f"found {len(url_refs)} url(#id) references to verify")
    c.expect(not missing, f"every url(#id) reference resolves {missing}")

    c.done()


if __name__ == "__main__":
    main()
