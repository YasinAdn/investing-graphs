(function (root) {
  'use strict';

  const FE = root.FinanceEngine;
  const MD = root.MarketData;
  const CURRENCY_CODES = FE.CURRENCIES.map((c) => c.code);
  const STORAGE_KEY = 'investgraph_prefs_v1';

  const NAV_PAGES = [
    { key: 'savings', href: 'index.html', label: 'Savings Calculator' },
    { key: 'psx', href: 'psx.html', label: 'Pakistan Stocks (PSX)' },
    { key: 'nasdaq', href: 'nasdaq.html', label: 'US Stocks (NASDAQ)' },
    { key: 'crypto', href: 'crypto.html', label: 'Crypto' },
    { key: 'currencies', href: 'currencies.html', label: 'Currencies & FX' },
    { key: 'compare', href: 'compare.html', label: 'Compare All' }
  ];

  function loadPrefs() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      return JSON.parse(raw) || {};
    } catch (_) {
      return {};
    }
  }

  function savePrefs(patch) {
    try {
      const next = { ...loadPrefs(), ...patch };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch (_) {
      // ignore storage quota errors
    }
  }

  function createSharedShell(pageKey, callbacks = {}) {
    const prefs = loadPrefs();
    const state = {
      pageKey,
      currency: FE.CURRENCY_MAP[prefs.currency] ? prefs.currency : 'PKR',
      formatMode: prefs.formatMode === 'exact' ? 'exact' : 'smart',
      renderMode: prefs.renderMode === '3d' ? '3d' : '2d',
      convertOnCurrencySwitch: prefs.convertOnCurrencySwitch !== false,
      livePaused: false,
      fxRates: FE.getDefaultRates(),
      fxRatesLive: false,
      fxChanges: {},
      cryptoPrices: {},
      indices: {},
      equities: { PSX: [], NASDAQ: [] },
      psxMarketStatus: null,
      sources: {
        fx: 'Connecting...',
        crypto: 'Connecting...',
        psx: 'Connecting...',
        nasdaq: 'Connecting...'
      },
      lastUpdatedAt: Date.now()
    };

    const headerRoot = document.getElementById('sharedShellTop');
    const footerRoot = document.getElementById('sharedShellFooter');

    const currencyOptions = FE.CURRENCIES.map(
      (c) => `<option value="${c.code}">${c.code} — ${c.name}</option>`
    ).join('');

    const navHtml = NAV_PAGES.map(
      (p) => `<a href="${p.href}" class="nav-link ${p.key === pageKey ? 'active' : ''}">${p.label}</a>`
    ).join('');

    headerRoot.innerHTML = `
      <header class="top-header">
        <a href="index.html" class="brand-link">
          <div class="brand-logo" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M4 18L9.5 12.5L13.5 15.5L20 7" stroke="#ECD078" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
              <path d="M4 18L10 15L14 17L20 12" stroke="#34D399" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </div>
          <div>
            <h1 class="brand-title">InvestGraph</h1>
            <p class="brand-sub">Simple live graphs &amp; savings calculator</p>
          </div>
        </a>

        <div class="header-controls">
          <div class="live-status-pill" id="shellLivePill" title="Live market & exchange rate status">
            <span class="live-dot" id="shellLiveDot"></span>
            <span id="shellLiveText">Connecting...</span>
            <button type="button" class="mini-icon-btn" id="shellPauseBtn">Pause</button>
            <button type="button" class="mini-icon-btn" id="shellRefreshBtn" title="Refresh live data">↻</button>
          </div>

          <div class="quick-currency-pills" id="shellQuickCurrencies" role="group" aria-label="Popular currencies">
            ${['PKR', 'USD', 'AED', 'SAR', 'GBP', 'EUR'].map((c) => `<button type="button" class="curr-pill ${state.currency === c ? 'active' : ''}" data-curr="${c}">${c}</button>`).join('')}
          </div>

          <select id="shellCurrencySelect" class="currency-select" aria-label="All 18 currencies">${currencyOptions}</select>

          <button type="button" class="mini-icon-btn" id="shellGuideBtn" style="padding:7px 12px;font-size:0.8rem;">How It Works ?</button>
        </div>
      </header>

      <nav class="page-nav" aria-label="Website pages">
        ${navHtml}
      </nav>

      <div class="sub-toolbar">
        <div class="sub-toolbar-left" id="pageSubToolbarLeft">
          <div class="format-toggle" role="group" aria-label="Chart view dimension">
            <button type="button" class="fmt-btn ${state.renderMode === '2d' ? 'active' : ''}" id="shellMode2d">2D Graph</button>
            <button type="button" class="fmt-btn ${state.renderMode === '3d' ? 'active' : ''}" id="shellMode3d">3D Pillars View</button>
          </div>
        </div>
        <div class="sub-toolbar-right">
          <div class="format-toggle" role="group" aria-label="Number format">
            <button type="button" class="fmt-btn ${state.formatMode === 'smart' ? 'active' : ''}" id="shellFmtSmart">Short (1.4M)</button>
            <button type="button" class="fmt-btn ${state.formatMode === 'exact' ? 'active' : ''}" id="shellFmtExact">Full Numbers</button>
          </div>
          <label class="fx-convert-toggle" title="When switching currencies, automatically convert your typed money using live rates">
            <input type="checkbox" id="shellAutoConvert" ${state.convertOnCurrencySwitch ? 'checked' : ''} />
            <span>Auto-convert currency</span>
          </label>
          <button type="button" class="btn-ghost btn-sm hidden" id="shellResetPageBtn">Reset Defaults</button>
        </div>
      </div>

      <div class="modal-backdrop hidden" id="shellGuideModal" role="dialog" aria-modal="true" aria-labelledby="guideTitle">
        <div class="modal-card">
          <div class="modal-head">
            <h3 class="modal-title" id="guideTitle">How Investing &amp; This Website Work (No Jargon)</h3>
            <button type="button" class="btn-ghost btn-sm" id="shellCloseGuideBtn">Close ✕</button>
          </div>
          <div class="guide-grid">
            <div class="guide-item">
              <h4>1. Why does cash lose value in Savings?</h4>
              <p>If prices of food, fuel, and rent go up 10% every year (called <strong>inflation</strong>), sitting cash buys less next year. Putting money where it grows faster than inflation protects your buying power.</p>
            </div>
            <div class="guide-item">
              <h4>2. Safe Savings vs. Stocks vs. Crypto</h4>
              <p><strong>Bank / Money Market:</strong> Very steady, low risk.<br><strong>Pakistan Stocks (PSX) &amp; US Stocks (NASDAQ):</strong> Owning small pieces of real companies — goes up over years, but drops during bad months.<br><strong>Crypto (Bitcoin, etc.):</strong> Moves wildly up and down every day — highest risk.</p>
            </div>
            <div class="guide-item">
              <h4>3. How to read the graphs</h4>
              <p>Move your mouse or finger over any graph to see exact numbers for that date or year. Use <strong>PKR, USD, AED, SAR, GBP, EUR</strong> at the top to see everything in your currency automatically.</p>
            </div>
          </div>
        </div>
      </div>
    `;

    if (footerRoot) {
      footerRoot.innerHTML = `
        <span>Live prices come directly from Binance, Yahoo Finance, PSX DPS &amp; ExchangeRate-API. Educational calculator — not financial advice.</span>
        <span id="shellFooterStatus">Connecting...</span>
      `;
    }

    const els = {
      liveDot: document.getElementById('shellLiveDot'),
      liveText: document.getElementById('shellLiveText'),
      pauseBtn: document.getElementById('shellPauseBtn'),
      refreshBtn: document.getElementById('shellRefreshBtn'),
      quickCurrencies: document.getElementById('shellQuickCurrencies'),
      currencySelect: document.getElementById('shellCurrencySelect'),
      mode2d: document.getElementById('shellMode2d'),
      mode3d: document.getElementById('shellMode3d'),
      fmtSmart: document.getElementById('shellFmtSmart'),
      fmtExact: document.getElementById('shellFmtExact'),
      autoConvert: document.getElementById('shellAutoConvert'),
      resetPageBtn: document.getElementById('shellResetPageBtn'),
      guideBtn: document.getElementById('shellGuideBtn'),
      guideModal: document.getElementById('shellGuideModal'),
      closeGuideBtn: document.getElementById('shellCloseGuideBtn'),
      footerStatus: document.getElementById('shellFooterStatus')
    };

    els.currencySelect.value = state.currency;

    function updateStatusUi() {
      if (state.livePaused) {
        els.liveDot.className = 'live-dot paused';
        els.liveText.textContent = 'Live Paused';
        els.pauseBtn.textContent = 'Resume';
      } else {
        const liveFeeds = Object.values(state.sources).filter((s) => s.includes('Live')).length;
        els.liveDot.className = liveFeeds > 0 ? 'live-dot' : 'live-dot offline';
        els.liveText.textContent = liveFeeds > 0 ? `Live (${liveFeeds}/4 feeds)` : 'Connecting...';
        els.pauseBtn.textContent = 'Pause';
      }

      if (els.footerStatus) {
        const t = new Date(state.lastUpdatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        els.footerStatus.textContent = `Updated ${t} • FX: ${state.sources.fx} • Crypto: ${state.sources.crypto}`;
      }
    }

    function changeCurrency(nextCode) {
      const code = String(nextCode || 'PKR').toUpperCase();
      if (code === state.currency) return;
      const prevCode = state.currency;
      state.currency = code;
      savePrefs({ currency: code });

      els.currencySelect.value = code;
      els.quickCurrencies.querySelectorAll('.curr-pill').forEach((b) => {
        b.classList.toggle('active', b.dataset.curr === code);
      });

      if (typeof callbacks.onCurrencyChange === 'function') {
        callbacks.onCurrencyChange(code, prevCode, state.convertOnCurrencySwitch);
      }
    }

    els.currencySelect.addEventListener('change', (e) => changeCurrency(e.target.value));
    els.quickCurrencies.addEventListener('click', (e) => {
      const b = e.target.closest('.curr-pill');
      if (b) changeCurrency(b.dataset.curr);
    });

    els.fmtSmart.addEventListener('click', () => {
      state.formatMode = 'smart';
      savePrefs({ formatMode: 'smart' });
      els.fmtSmart.classList.add('active');
      els.fmtExact.classList.remove('active');
      if (typeof callbacks.onFormatChange === 'function') callbacks.onFormatChange('smart');
    });

    els.fmtExact.addEventListener('click', () => {
      state.formatMode = 'exact';
      savePrefs({ formatMode: 'exact' });
      els.fmtExact.classList.add('active');
      els.fmtSmart.classList.remove('active');
      if (typeof callbacks.onFormatChange === 'function') callbacks.onFormatChange('exact');
    });

    els.mode2d.addEventListener('click', () => {
      state.renderMode = '2d';
      savePrefs({ renderMode: '2d' });
      els.mode2d.classList.add('active');
      els.mode3d.classList.remove('active');
      if (typeof callbacks.onRenderModeChange === 'function') callbacks.onRenderModeChange('2d');
    });

    els.mode3d.addEventListener('click', () => {
      state.renderMode = '3d';
      savePrefs({ renderMode: '3d' });
      els.mode3d.classList.add('active');
      els.mode2d.classList.remove('active');
      if (typeof callbacks.onRenderModeChange === 'function') callbacks.onRenderModeChange('3d');
    });

    els.autoConvert.addEventListener('change', (e) => {
      state.convertOnCurrencySwitch = e.target.checked;
      savePrefs({ convertOnCurrencySwitch: state.convertOnCurrencySwitch });
    });

    els.guideBtn.addEventListener('click', () => els.guideModal.classList.remove('hidden'));
    els.closeGuideBtn.addEventListener('click', () => els.guideModal.classList.add('hidden'));
    els.guideModal.addEventListener('click', (e) => {
      if (e.target === els.guideModal) els.guideModal.classList.add('hidden');
    });

    const marketClient = new MD.RealtimeMarketClient(CURRENCY_CODES, (snapshot) => {
      if (snapshot.fxRates && Object.keys(snapshot.fxRates).length > 0) {
        state.fxRates = { ...state.fxRates, ...snapshot.fxRates };
        state.fxRatesLive = true;
      }
      if (snapshot.fxChanges) state.fxChanges = { ...state.fxChanges, ...snapshot.fxChanges };
      if (snapshot.cryptoPrices && Object.keys(snapshot.cryptoPrices).length > 0) {
        state.cryptoPrices = snapshot.cryptoPrices;
      }
      if (snapshot.indices && Object.keys(snapshot.indices).length > 0) {
        state.indices = snapshot.indices;
      }
      if (snapshot.equities) state.equities = snapshot.equities;
      if (snapshot.psxMarketStatus) state.psxMarketStatus = snapshot.psxMarketStatus;
      if (snapshot.sources) state.sources = snapshot.sources;
      state.lastUpdatedAt = snapshot.lastUpdatedAt || Date.now();

      updateStatusUi();
      if (typeof callbacks.onLiveUpdate === 'function') {
        callbacks.onLiveUpdate(snapshot);
      }
    });

    els.pauseBtn.addEventListener('click', () => {
      state.livePaused = !state.livePaused;
      marketClient.setPaused(state.livePaused);
      updateStatusUi();
    });

    els.refreshBtn.addEventListener('click', () => {
      marketClient.refreshNow();
    });

    updateStatusUi();
    marketClient.start();

    return {
      state,
      changeCurrency,
      enableResetButton(onReset) {
        els.resetPageBtn.classList.remove('hidden');
        els.resetPageBtn.addEventListener('click', onReset);
      }
    };
  }

  root.AppShell = { createSharedShell, loadPrefs, savePrefs };
})(window);
