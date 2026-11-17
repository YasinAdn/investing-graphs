(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.MarketData = factory();
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const TAB_PRESETS = {
    savings: [
      {
        id: 'savings-screenshot',
        label: '3-Year Baseline (10% profit vs 10% rising prices)',
        badge: 'Baseline',
        risk: 'Low Risk',
        startingPkr: 30000,
        monthlyPkr: 22500,
        returnPct: 10,
        inflationPct: 10,
        years: 3
      },
      {
        id: 'pkr-money-market',
        label: 'Safe Bank / Cash Fund (13% profit vs 9% inflation)',
        badge: 'Low Risk',
        risk: 'Low Risk',
        startingPkr: 100000,
        monthlyPkr: 35000,
        returnPct: 13,
        inflationPct: 9,
        years: 5
      },
      {
        id: 'cash-idle',
        label: 'Cash Sitting Idle (0% growth vs 10% inflation)',
        badge: 'Cash Loss Test',
        risk: 'Loses Buying Power',
        startingPkr: 500000,
        monthlyPkr: 25000,
        returnPct: 0,
        inflationPct: 10,
        years: 5
      }
    ],
    psx: [
      {
        id: 'psx-mm-baseline',
        label: 'PSX & Money Market Mix (10% / 5 yrs)',
        badge: 'Baseline',
        risk: 'Low–Med Risk',
        startingPkr: 30000,
        monthlyPkr: 23500,
        returnPct: 10,
        inflationPct: 10,
        years: 5,
        volatilitySpreadPct: 4
      },
      {
        id: 'psx-kse100',
        label: 'Top 100 Pakistan Companies — KSE-100 (17% est.)',
        badge: 'Stocks',
        risk: 'Medium–High Risk',
        startingPkr: 100000,
        monthlyPkr: 30000,
        returnPct: 17,
        inflationPct: 10,
        years: 10,
        volatilitySpreadPct: 9
      },
      {
        id: 'psx-kmi30',
        label: 'Islamic Shariah Stocks — KMI-30 (15% est.)',
        badge: 'Islamic',
        risk: 'Medium–High Risk',
        startingPkr: 100000,
        monthlyPkr: 25000,
        returnPct: 15,
        inflationPct: 9.5,
        years: 10,
        volatilitySpreadPct: 8
      }
    ],
    nasdaq: [
      {
        id: 'nasdaq-qqq',
        label: 'US Tech Index — NASDAQ-100 (14% est.)',
        badge: 'US Tech',
        risk: 'Medium–High Risk',
        startingPkr: 150000,
        monthlyPkr: 30000,
        returnPct: 14,
        inflationPct: 3,
        years: 10,
        fxDriftPct: 4,
        volatilitySpreadPct: 8
      },
      {
        id: 'nasdaq-sp500',
        label: 'Top 500 US Companies — S&P 500 (10% est.)',
        badge: 'Broad US',
        risk: 'Medium Risk',
        startingPkr: 150000,
        monthlyPkr: 30000,
        returnPct: 10,
        inflationPct: 3,
        years: 10,
        fxDriftPct: 4,
        volatilitySpreadPct: 6
      },
      {
        id: 'nasdaq-megacap',
        label: 'AI & Big Tech Giants (Apple, Nvidia — 17% est.)',
        badge: 'High Growth',
        risk: 'High Risk',
        startingPkr: 200000,
        monthlyPkr: 40000,
        returnPct: 17,
        inflationPct: 3,
        years: 7,
        fxDriftPct: 4,
        volatilitySpreadPct: 11
      }
    ],
    crypto: [
      {
        id: 'crypto-btc-base',
        label: 'Bitcoin Monthly Buying (20% est.)',
        badge: 'BTC',
        risk: 'High Risk',
        coin: 'BTC',
        startingPkr: 100000,
        monthlyPkr: 20000,
        returnPct: 20,
        inflationPct: 9,
        years: 5,
        fxDriftPct: 4,
        volatilitySpreadPct: 18
      },
      {
        id: 'crypto-eth',
        label: 'Ethereum Monthly Buying (18% est.)',
        badge: 'ETH',
        risk: 'High Risk',
        coin: 'ETH',
        startingPkr: 100000,
        monthlyPkr: 20000,
        returnPct: 18,
        inflationPct: 9,
        years: 5,
        fxDriftPct: 4,
        volatilitySpreadPct: 20
      }
    ]
  };

  async function fetchBrowserFxRates(currencyCodes) {
    const out = {};
    let source = null;

    const endpoints = [
      {
        name: 'open.er-api.com',
        url: 'https://open.er-api.com/v6/latest/USD',
        extract: (j) => (j && j.rates) || null
      },
      {
        name: 'currency-api',
        url: 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json',
        extract: (j) => {
          if (!j || !j.usd) return null;
          const mapped = {};
          for (const c of currencyCodes) {
            const v = j.usd[c.toLowerCase()];
            if (typeof v === 'number' && v > 0) mapped[c] = v;
          }
          return mapped;
        }
      }
    ];

    for (const ep of endpoints) {
      try {
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timer = controller ? setTimeout(() => controller.abort(), 5000) : null;
        const res = await fetch(ep.url, { signal: controller ? controller.signal : undefined, cache: 'no-store' });
        if (timer) clearTimeout(timer);
        if (!res.ok) continue;
        const json = await res.json();
        const extracted = ep.extract(json);
        if (extracted) {
          for (const c of currencyCodes) {
            if (typeof extracted[c] === 'number' && extracted[c] > 0) out[c] = extracted[c];
          }
          if (Object.keys(out).length >= 5) {
            source = `${ep.name} (Live)`;
            break;
          }
        }
      } catch (_) {
        // try next endpoint
      }
    }
    return { rates: out, source };
  }

  async function fetchBrowserCryptoPrices() {
    const meta = {
      BTC: { id: 'bitcoin', name: 'Bitcoin' },
      ETH: { id: 'ethereum', name: 'Ethereum' },
      SOL: { id: 'solana', name: 'Solana' },
      BNB: { id: 'binancecoin', name: 'BNB' },
      XRP: { id: 'ripple', name: 'XRP' }
    };
    const cryptoPrices = {};
    let source = null;

    try {
      const symbols = encodeURIComponent(JSON.stringify(['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT']));
      const res = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbols=${symbols}`, { cache: 'no-store' });
      if (res.ok) {
        const arr = await res.json();
        if (Array.isArray(arr)) {
          for (const row of arr) {
            const sym = String(row.symbol || '').replace(/USDT$/, '');
            if (meta[sym] && Number(row.lastPrice) > 0) {
              cryptoPrices[sym] = {
                id: meta[sym].id,
                symbol: sym,
                name: meta[sym].name,
                priceUsd: Number(row.lastPrice),
                change24h: Number(Number(row.priceChangePercent || 0).toFixed(2))
              };
            }
          }
          cryptoPrices.USDT = { id: 'tether', symbol: 'USDT', name: 'Tether (Digital USD)', priceUsd: 1.0, change24h: 0.0 };
          source = 'Binance REST (Live)';
        }
      }
    } catch (_) {
      // Fallback below
    }

    if (!source) {
      try {
        const res = await fetch(
          'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,binancecoin,ripple,tether&vs_currencies=usd&include_24hr_change=true',
          { cache: 'no-store' }
        );
        if (res.ok) {
          const cg = await res.json();
          for (const [sym, info] of Object.entries(meta)) {
            if (cg && cg[info.id] && typeof cg[info.id].usd === 'number') {
              cryptoPrices[sym] = {
                id: info.id,
                symbol: sym,
                name: info.name,
                priceUsd: cg[info.id].usd,
                change24h: Number((cg[info.id].usd_24h_change || 0).toFixed(2))
              };
            }
          }
          cryptoPrices.USDT = { id: 'tether', symbol: 'USDT', name: 'Tether (Digital USD)', priceUsd: 1.0, change24h: 0.0 };
          source = 'CoinGecko REST (Live)';
        }
      } catch (_) {
        // unavailable
      }
    }

    return { cryptoPrices, source };
  }

  /**
   * Fetches real live historical price points (zero mock/test points).
   */
  async function fetchLiveHistory(kind, symbol, range = '1y') {
    const canUseServer = typeof window !== 'undefined'
      && window.location
      && (window.location.protocol === 'http:' || window.location.protocol === 'https:');

    if (canUseServer) {
      try {
        const url = `/api/live/history?kind=${encodeURIComponent(kind)}&symbol=${encodeURIComponent(symbol)}&range=${encodeURIComponent(range)}`;
        const res = await fetch(url, { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          if (data && Array.isArray(data.points) && data.points.length > 0) {
            return data;
          }
        }
      } catch (_) {
        // Fallback to direct Binance klines for crypto
      }
    }

    if (kind === 'crypto') {
      const cleanSym = String(symbol || 'BTC').toUpperCase();
      const mapCfg = {
        '1d': { interval: '15m', limit: 96 },
        '1w': { interval: '2h', limit: 84 },
        '1m': { interval: '6h', limit: 120 },
        '1y': { interval: '3d', limit: 122 },
        '5y': { interval: '1w', limit: 260 }
      };
      const cfg = mapCfg[range] || mapCfg['1y'];
      try {
        const url = `https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(cleanSym + 'USDT')}&interval=${cfg.interval}&limit=${cfg.limit}`;
        const res = await fetch(url, { cache: 'no-store' });
        if (res.ok) {
          const klines = await res.json();
          const points = Array.isArray(klines)
            ? klines.map((k) => ({ time: Number(k[0]), value: Number(k[4]) })).filter((p) => Number.isFinite(p.time) && p.value > 0)
            : [];
          let periodChangePct = null;
          let annualizedCagrPct = null;
          if (points.length >= 2) {
            const first = points[0];
            const last = points[points.length - 1];
            periodChangePct = Number((((last.value - first.value) / first.value) * 100).toFixed(2));
            const yrs = (last.time - first.time) / (365.25 * 24 * 3600 * 1000);
            if (yrs >= 0.4) {
              annualizedCagrPct = Number(((Math.pow(last.value / first.value, 1 / yrs) - 1) * 100).toFixed(1));
            }
          }
          return { kind, symbol, range, baseCurrency: 'USD', source: 'Binance Historical (Live)', periodChangePct, annualizedCagrPct, points };
        }
      } catch (_) {
        // failed
      }
    }

    return { kind, symbol, range, baseCurrency: 'USD', source: 'Unavailable', points: [] };
  }

  class RealtimeMarketClient {
    constructor(currencyCodes, onUpdate) {
      this.currencyCodes = currencyCodes;
      this.onUpdate = onUpdate;
      this.paused = false;
      this.sse = null;
      this.binanceWs = null;
      this.pollTimer = null;
      this.wsRetryTimer = null;
      this.sseAvailable = false;
      this.state = {
        fxRates: {},
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
    }

    start() {
      this.connectBinanceWs();
      this.tryLocalServerStreamOrFallback();
    }

    stop() {
      if (this.sse) { this.sse.close(); this.sse = null; }
      if (this.binanceWs) { this.binanceWs.close(); this.binanceWs = null; }
      if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
      if (this.wsRetryTimer) { clearTimeout(this.wsRetryTimer); this.wsRetryTimer = null; }
    }

    setPaused(paused) {
      this.paused = Boolean(paused);
      if (!this.paused) this.refreshNow();
    }

    emit(kind) {
      if (typeof this.onUpdate === 'function') {
        this.onUpdate({ ...this.state, eventKind: kind });
      }
    }

    connectBinanceWs() {
      if (typeof WebSocket === 'undefined') return;
      const names = { BTC: 'Bitcoin', ETH: 'Ethereum', SOL: 'Solana', BNB: 'BNB', XRP: 'XRP' };
      try {
        const streams = 'btcusdt@miniTicker/ethusdt@miniTicker/solusdt@miniTicker/bnbusdt@miniTicker/xrpusdt@miniTicker';
        const ws = new WebSocket(`wss://stream.binance.com:9443/stream?streams=${streams}`);
        this.binanceWs = ws;

        ws.onmessage = (event) => {
          if (this.paused) return;
          try {
            const msg = JSON.parse(event.data);
            const d = msg && msg.data;
            if (!d || !d.s) return;
            const sym = String(d.s).replace(/USDT$/, '');
            const price = Number(d.c);
            const open = Number(d.o);
            if (!names[sym] || !Number.isFinite(price) || price <= 0) return;

            this.state.cryptoPrices[sym] = {
              id: sym.toLowerCase(),
              symbol: sym,
              name: names[sym],
              priceUsd: price,
              change24h: Number.isFinite(open) && open > 0 ? Number((((price - open) / open) * 100).toFixed(2)) : 0
            };
            this.state.cryptoPrices.USDT = { id: 'tether', symbol: 'USDT', name: 'Tether (Digital USD)', priceUsd: 1.0, change24h: 0.0 };
            this.state.sources.crypto = 'Binance WS (Live 1s)';
            this.state.lastUpdatedAt = Date.now();
            this.emit('crypto');
          } catch (_) {
            // ignore
          }
        };

        ws.onclose = () => {
          this.binanceWs = null;
          if (!this.paused) {
            this.wsRetryTimer = setTimeout(() => this.connectBinanceWs(), 8000);
          }
        };
      } catch (_) {
        // REST polling still runs
      }
    }

    async tryLocalServerStreamOrFallback() {
      const canUseServer = typeof window !== 'undefined'
        && window.location
        && (window.location.protocol === 'http:' || window.location.protocol === 'https:');

      if (canUseServer) {
        try {
          const probe = await fetch('/api/live/all', { cache: 'no-store' });
          if (probe.ok) {
            const data = await probe.json();
            this.applyServerSnapshot(data);
            this.sseAvailable = true;
            if (data && data.sseSupported) {
              this.openServerSse();
            } else {
              // Vercel serverless deployment: poll /api/live/all cleanly every 5s (plus live Binance WS)
              this.pollTimer = setInterval(() => {
                if (!this.paused) this.refreshNow();
              }, 5000);
            }
            return;
          }
        } catch (_) {
          // static server fallback
        }
      }

      this.state.sources.psx = 'Requires Local Server (npm start)';
      this.state.sources.nasdaq = 'Requires Local Server (npm start)';
      await this.refreshBrowserApis();
      this.pollTimer = setInterval(() => {
        if (!this.paused) this.refreshBrowserApis();
      }, 15000);
    }

    openServerSse() {
      if (typeof EventSource === 'undefined') {
        this.pollTimer = setInterval(() => {
          if (!this.paused) this.refreshNow();
        }, 5000);
        return;
      }

      if (this.sse) this.sse.close();
      const es = new EventSource('/api/live/stream');
      this.sse = es;
      es.onmessage = (ev) => {
        if (this.paused) return;
        try {
          this.applyServerSnapshot(JSON.parse(ev.data));
        } catch (_) {
          // ignore
        }
      };
      es.onerror = () => {
        if (!this.pollTimer) {
          this.pollTimer = setInterval(() => {
            if (!this.paused) this.refreshNow();
          }, 8000);
        }
      };
    }

    applyServerSnapshot(data) {
      if (!data) return;
      if (data.fxRates && Object.keys(data.fxRates).length > 0) {
        this.state.fxRates = { ...this.state.fxRates, ...data.fxRates };
      }
      if (data.fxChanges) {
        this.state.fxChanges = { ...this.state.fxChanges, ...data.fxChanges };
      }
      if (data.cryptoPrices && Object.keys(data.cryptoPrices).length > 0 && !this.state.sources.crypto.includes('Binance WS')) {
        this.state.cryptoPrices = { ...this.state.cryptoPrices, ...data.cryptoPrices };
      }
      if (data.indices && Object.keys(data.indices).length > 0) {
        this.state.indices = { ...this.state.indices, ...data.indices };
      }
      if (data.equities) {
        if (Array.isArray(data.equities.PSX) && data.equities.PSX.length > 0) {
          this.state.equities.PSX = data.equities.PSX;
        }
        if (Array.isArray(data.equities.NASDAQ) && data.equities.NASDAQ.length > 0) {
          this.state.equities.NASDAQ = data.equities.NASDAQ;
        }
      }
      if (data.psxMarketStatus) {
        this.state.psxMarketStatus = data.psxMarketStatus;
      }
      if (data.sources) {
        this.state.sources = {
          ...this.state.sources,
          ...data.sources,
          crypto: this.state.sources.crypto.includes('Binance WS')
            ? this.state.sources.crypto
            : (data.sources.crypto || this.state.sources.crypto)
        };
      }
      this.state.lastUpdatedAt = data.timestamp || Date.now();
      this.emit('server');
    }

    async refreshBrowserApis() {
      const [fxRes, cryptoRes] = await Promise.all([
        fetchBrowserFxRates(this.currencyCodes),
        fetchBrowserCryptoPrices()
      ]);

      if (fxRes && fxRes.source && Object.keys(fxRes.rates).length > 0) {
        this.state.fxRates = { ...this.state.fxRates, ...fxRes.rates };
        this.state.sources.fx = fxRes.source;
      }
      if (cryptoRes && cryptoRes.source && Object.keys(cryptoRes.cryptoPrices).length > 0) {
        if (!this.state.sources.crypto.includes('Binance WS')) {
          this.state.cryptoPrices = { ...this.state.cryptoPrices, ...cryptoRes.cryptoPrices };
          this.state.sources.crypto = cryptoRes.source;
        }
      }
      this.state.lastUpdatedAt = Date.now();
      this.emit('browser');
    }

    async refreshNow() {
      if (this.sseAvailable) {
        try {
          const res = await fetch('/api/live/all?force=1', { cache: 'no-store' });
          if (res.ok) {
            this.applyServerSnapshot(await res.json());
            return;
          }
        } catch (_) {
          // fall through
        }
      }
      await this.refreshBrowserApis();
    }
  }

  return {
    TAB_PRESETS,
    fetchBrowserFxRates,
    fetchBrowserCryptoPrices,
    fetchLiveHistory,
    RealtimeMarketClient
  };
}));
