(function (window) {
'use strict';
const LogComponent = window.LogComponent;

class AppShell extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <log-header></log-header>
      <div class="layout">
        <log-filters></log-filters>
        <div class="content">
          <div class="page-host" id="pages"></div>
          <div class="right-panel">
            <log-list></log-list>
            <log-details></log-details>
          </div>
        </div>
      </div>
    `;
    this._pages = this.querySelector('#pages');
    this._pages.innerHTML = `
      <div data-page="hierarchy"><log-tree></log-tree></div>
      <div data-page="chronology" hidden><log-timeline></log-timeline></div>
      <div data-page="timegoes" hidden><log-timegoes></log-timegoes></div>
      <div data-page="metrics" hidden><log-metrics></log-metrics></div>
      <div data-page="maintenance" hidden><log-maintenance></log-maintenance></div>
      <div data-page="help" hidden><log-help></log-help></div>
    `;
    this._on = () => this.setPage();
    window.addEventListener('logapp:update', this._on);
    this.setPage();
  }
  setPage() {
    const p = window.LogApp?.state?.page || 'hierarchy';
    this._pages.querySelectorAll('[data-page]').forEach((el) => { el.hidden = el.getAttribute('data-page') !== p; });
  }
}
customElements.define('app-shell', AppShell);
})(window);
