(function (window) {
'use strict';

// Sponsor strip across the bottom of the app.
//
// Deliberately NOT a LogComponent: that base class re-renders on every
// `logapp:update`, and this element must survive them. Rebuilding it on each
// state change would restart the rotation, re-request the images and make the
// strip flicker every time a filter moved. It renders once, owns its own
// timer, and never reads application state.
//
// It also lives OUTSIDE <app-shell> (see app.js) for the same reason: the shell
// rewrites its whole innerHTML on every render.
//
// Ads are data, not code: docs/lespirant/ads.json lists them. Remove that file
// and the strip degrades to a one-line text credit; empty the `ads` array and
// it does the same. Nothing else needs editing to change what runs here.

const MANIFEST = 'docs/lespirant/ads.json';
const DEFAULT_ROTATE_MS = 7000;
const FALLBACK = { link: 'https://www.lespirant.com', label: "LESPIRANT", ads: [] };

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

class LogFooter extends HTMLElement {
  connectedCallback() {
    if (this._mounted) return;   // custom elements re-run this on DOM moves
    this._mounted = true;
    this._i = 0;
    this._paused = false;

    // Rotation is wall-clock work that nobody is watching while the tab is in
    // the background; browsers throttle the timer anyway, so stop it cleanly
    // rather than letting it fire in a burst on return.
    this._onVis = () => (document.hidden ? this._stop() : this._start());
    document.addEventListener('visibilitychange', this._onVis);

    this._load();
  }

  disconnectedCallback() {
    this._stop();
    document.removeEventListener('visibilitychange', this._onVis);
  }

  async _load() {
    let cfg = FALLBACK;
    try {
      const res = await fetch(MANIFEST, { cache: 'no-cache' });
      if (res.ok) cfg = Object.assign({}, FALLBACK, await res.json());
    } catch (e) {
      // No manifest (or bad JSON, or a file:// origin): fall through to the
      // text credit. A missing ad must never be a visible error.
    }
    this._cfg = cfg;
    this._ads = Array.isArray(cfg.ads) ? cfg.ads.filter((a) => a && a.img) : [];
    this._rotateMs = Math.max(2000, +cfg.rotateMs || DEFAULT_ROTATE_MS);
    this.innerHTML = this._ads.length ? this._adsHTML() : this._creditHTML();
    if (this._ads.length) {
      this._wire();
      this._start();
    }
  }

  _creditHTML() {
    const c = this._cfg;
    return `
      <div class="footer-inner footer-credit">
        <a class="footer-credit-link" href="${esc(c.link)}" target="_blank" rel="noopener sponsored">
          ${esc(c.label)} — ${esc(String(c.link).replace(/^https?:\/\//, ''))}
        </a>
      </div>`;
  }

  _adsHTML() {
    const c = this._cfg;
    const base = 'docs/lespirant/';
    const slides = this._ads.map((ad, i) => `
      <a class="footer-ad${i === 0 ? ' active' : ''}"
         href="${esc(ad.href || c.link)}" target="_blank" rel="noopener sponsored"
         aria-hidden="${i === 0 ? 'false' : 'true'}"
         tabindex="${i === 0 ? '0' : '-1'}">
        <img src="${esc(base + ad.img)}" alt="${esc(ad.alt || c.label)}" loading="lazy">
      </a>`).join('');

    const dots = this._ads.length > 1 ? `
      <div class="footer-dots" role="tablist" aria-label="Sponsor messages">
        ${this._ads.map((ad, i) => `
          <button class="footer-dot${i === 0 ? ' active' : ''}" data-i="${i}"
                  role="tab" aria-selected="${i === 0}"
                  title="${esc(ad.alt || 'Ad ' + (i + 1))}"></button>`).join('')}
      </div>` : '<div class="footer-dots"></div>';

    return `
      <div class="footer-inner">
        <span class="footer-label">Sponsored</span>
        <div class="footer-stage">${slides}</div>
        ${dots}
      </div>`;
  }

  _wire() {
    this.querySelectorAll('.footer-dot').forEach((b) => {
      b.onclick = () => { this._show(+b.getAttribute('data-i')); this._start(); };
    });
    // Hovering is how someone reads an ad before clicking it — moving the
    // banner out from under the pointer at that moment is the one thing a
    // rotator must not do.
    this.onmouseenter = () => this._stop();
    this.onmouseleave = () => { if (!document.hidden) this._start(); };
    this.onfocusin = () => this._stop();
    this.onfocusout = () => { if (!document.hidden) this._start(); };
  }

  _show(i) {
    const slides = this.querySelectorAll('.footer-ad');
    const dots = this.querySelectorAll('.footer-dot');
    if (!slides.length) return;
    this._i = ((i % slides.length) + slides.length) % slides.length;
    slides.forEach((el, n) => {
      const on = n === this._i;
      el.classList.toggle('active', on);
      el.setAttribute('aria-hidden', on ? 'false' : 'true');
      el.tabIndex = on ? 0 : -1;
    });
    dots.forEach((el, n) => {
      el.classList.toggle('active', n === this._i);
      el.setAttribute('aria-selected', String(n === this._i));
    });
  }

  _start() {
    this._stop();
    if (this._ads && this._ads.length > 1) {
      this._timer = setInterval(() => this._show(this._i + 1), this._rotateMs);
    }
  }

  _stop() {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
  }
}

customElements.define('log-footer', LogFooter);
})(window);
