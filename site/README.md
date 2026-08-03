# site/ — the LogReporter website

The source of the landing page and the live demo, published to GitHub Pages at

    https://frenamezian.github.io/log_reporter/

**Everything here is source. Nothing here is output.** `gh-pages` is the output,
and it is a build artifact: it is regenerated from this directory and replaced
wholesale, never edited by hand and never merged into. If it is ever lost, one
command rebuilds it.

That split is the point of this directory. The site used to be authored directly
on `gh-pages` — twelve hand-written files sitting in a tree of a hundred and
twelve generated ones, absent from every clone, invisible in pull requests, and
gone for good if the branch were ever rebuilt. They are ordinary source files
and they live with the rest of the source now.

## Layout

```
index.html              the landing page
404.html                served for any miss under /log_reporter/
assets/css/site.css     its only stylesheet — no build step, no framework
assets/img/             screenshots (.png + .webp), the sponsor image, the
                        favicon, and og-card.png. GENERATED — see below
app/index.html          a placeholder; build.py replaces it with the real demo
robots.txt              crawl policy — inert today, see below
sitemap.xml             the two real pages, for Search Console
llms.txt                the site in Markdown, for assistants
.nojekyll               serve files verbatim; do not run Jekyll

build.py                assembles _build/
publish.py              commits _build/ to gh-pages
tools/                  the four scripts build.py drives
_build/                 the assembled site. Gitignored; rebuilt every run
```

Two of those need a word.

**`assets/img/` is generated but tracked.** It is the only generated thing in
here that is committed, and the reason is the next section: opening
`index.html` from a clone has to show the page, not thirty-six broken images.
Re-run `build.py --images` and commit the result when a screenshot changes.

**`app/index.html` is a placeholder.** Every "Try the live demo" link on the
landing page is relative — it has to be, the site is a project page at a
subpath — so in a clone they would all land on a dead path. They land on that
page instead, which explains where the demo is and how to run the real
dashboard. `build.py` deletes the whole directory and replaces it with the
export, so the placeholder is never published.

## Reading it locally

Double-click `index.html`. That is the whole procedure — the landing page makes
**zero network calls**: HTML, one stylesheet, `<img>` and two inline scripts that
only touch `localStorage`, each in a `try`. No fonts, no CDN, no analytics, no
`fetch`. It renders identically from `file://` and from Pages.

One exception, deliberate: **`404.html` will look unstyled from a clone.** Its
paths are root-absolute (`/log_reporter/assets/…`) because a 404 is served for a
miss at *any* depth, and a relative path would resolve differently for each one.
That is correct on Pages and cannot be correct locally; it is not a regression.

## Rebuilding

```bash
python site/build.py
```

That is it. It assembles `_build/` from four steps:

1. copies the authored files above, verbatim
2. `tools/export_app.py` — the dashboard, from **`HEAD`**, into `_build/app/`,
   plus `window.LR_HOME` and the sample logs
3. `tools/make_demo_usage.py` — synthetic usage rows keyed to those logs
4. nothing else. There is no bundler, no static-site generator and no npm.

Two steps are opt-in, because they write into *tracked* files rather than
`_build/`:

```bash
python site/build.py --images     # resize docs/img/ into assets/img/
python site/build.py --og-card    # redraw assets/img/og-card.png
```

Run `--images` when a screenshot in `docs/img/` changes, `--og-card` when the
mark, the headline or the tagline changes, and commit what they produce. Both
need Pillow; nothing else here does.

`export_app.py` injects `window.LR_HOME = '../'` into `_build/app/index.html`.
That is what makes the header brand a link back to the landing page; the app
leaves it a plain `<div>` whenever the variable is unset, which is every local
checkout.

Three things to keep in mind:

- **The demo is exported from `HEAD`, not the working tree.** It should be a
  known-good commit someone can point at, not whatever is half-finished locally.
  Commit before you build.
- **Never copy the real `token_usage.db` or `activity_logs.db` from the
  repository root.** They contain actual repository names, branch names and
  working patterns. `make_demo_usage.py` generates a synthetic sibling from a
  fixed seed instead, and `publish.py` refuses to publish any database that is
  not one of the two demo fixtures.
- **Bump `?v=` on the app's assets** when you re-export, or returning visitors
  keep the cached copies. That is already the rule on `main`.

## Publishing

```bash
python site/publish.py            # commit _build/ onto gh-pages, locally
python site/publish.py --push     # ... and push it
```

No checkout happens. The commit is built with plumbing — a throwaway index
filled from `_build/`, committed straight onto the branch — so publishing cannot
disturb your working tree and cannot trip the `activity_logs.db` checkout hazard
that `/.gitignore` documents at length.

The new commit's parent is whatever `gh-pages` already points at, so the branch
keeps a history and the push fast-forwards. `--orphan` starts that history over;
the push then needs `--force`.

Inspect what you are about to publish first — it is a directory, so just open
`_build/index.html`.

## Discoverability

Three files exist for machines rather than people. Keeping them true is part of
editing the page, not a separate chore.

| File | What it is | When to touch it |
| --- | --- | --- |
| `sitemap.xml` | The two real pages, with their images | Bump `<lastmod>` whenever `index.html` changes |
| `llms.txt` | The whole site as Markdown, for assistants that fetch a URL and summarise it | Whenever a claim on the page changes — especially the limitations |
| `robots.txt` | Crawl policy, opening the site to search *and* AI crawlers | Only if the policy changes |

Two things about this setup are easy to get wrong:

- **`robots.txt` is inert.** It is only honoured at the root of an origin, and
  this site lives at `frenamezian.github.io/log_reporter/` — the file crawlers
  fetch is `frenamezian.github.io/robots.txt`, which belongs to a different
  repository. Submit `sitemap.xml` directly in Google Search Console; the
  `Sitemap:` line in `robots.txt` will not be read. The file becomes real the
  day this site gets a `CNAME`.
- **The landing page's metadata is absolute, the app's is injected.** Every
  canonical and `og:` URL in `index.html` names `https://frenamezian.github.io/…`
  in full, because a card is unfurled by a server that never saw the page. The
  same tags for the demo are added by `tools/export_app.py`, alongside
  `window.LR_HOME` — they cannot live in the app's tracked `index.html`, where
  the same file is served from `127.0.0.1:8250` and a canonical pointing at
  github.io would be false. The `<meta name="description">` and the `<noscript>`
  fallback *are* tracked, because they are true wherever the app is served.

If the site ever moves to a custom domain, the URLs to change are: the canonical
and `og:`/`twitter:` tags plus the `@id`s in the JSON-LD block in `index.html`,
every `<loc>` in `sitemap.xml`, the links in `llms.txt`, the root-absolute paths
in `404.html`, the placeholder link in `app/index.html`, and `INJECT` in
`tools/export_app.py`.

## Why the demo works at all

The dashboard is a static page that reads a SQLite file in the browser with
`sql.js`. GitHub Pages serves over HTTPS, so it runs unmodified — no server, no
build.

**The demo is read-only.** Maintenance deletes and database saves go through
`serve.py`, which is not published. The Maintenance page will report that the
write endpoint is missing. That is expected.

The in-app **Help** guide is reached through the demo — `app/index.html` →
*Help*. The landing page links there rather than duplicating the documentation.

## Images

Every screenshot exists twice — `.png` and `.webp` — and the page serves them
through `<picture>`. WebP is 72–76% smaller at q90 and, measured at 1:1 on the
densest crop of the hero, indistinguishable; the PNG is the fallback for a
browser that cannot decode WebP. The page went from ~1.1 MB of images on a first
desktop view to 287 KB, and from ~470 KB to 134 KB on a phone.

Two rules that are easy to break:

- **The `<head>` preload must name the WebP *and* carry `type="image/webp"`.**
  Without the type, a browser with no WebP support downloads a file it cannot
  use; naming the PNG instead means downloading 476 KB the `<picture>` then
  ignores in favour of the 122 KB WebP. Either mistake makes the page slower
  than having no preload at all.
- **`og:image` stays PNG.** Several link unfurlers will not render a WebP card.

`og-card.png` is drawn by `tools/build_og_card.py`, not screenshotted. A card
renders at about 524px wide, where the 1800px hero turns to grey mush and names
the product nowhere. Its colours are the dark theme's tokens, copied — like
`favicon.svg`, it is a document that cannot reach `site.css`, so it is one of the
two deliberate exceptions to the no-colour-literals rule.

The sponsor image has no WebP yet: its source
(`docs/lespirant/post_lcut_problem_solutionn_1650x1141px.png`) is not tracked, so
`build_assets.py` skips it. Put the source back and re-run `build.py --images`,
and the pair appears — then wrap that `<img>` in a `<picture>` like the others.

## Enabling Pages

Settings → Pages → Source: *Deploy from a branch* → `gh-pages` / `/ (root)`.
