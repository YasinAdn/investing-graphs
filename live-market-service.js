'use strict';

const FinanceEngine = require('./public/finance-engine.js');

const CURRENCY_CODES = FinanceEngine.CURRENCIES.map((c) => c.code);

const PSX_WATCH_SYMBOLS = {
  MEBL: 'Meezan Bank',
  UBL: 'United Bank Ltd.',
  MCB: 'MCB Bank',
  HBL: 'Habib Bank Ltd.',
  ENGROH: 'Engro Holdings',
  LUCK: 'Lucky Cement',
  SYS: 'Systems Limited',
  MARI: 'Mari Energies',
  POL: 'Pakistan Oilfields',
  EFERT: 'Engro Fertilizers',
  PSO: 'Pakistan State Oil'
};

const NASDAQ_WATCH_SYMBOLS = [
  { symbol: 'QQQ', name: 'Invesco QQQ (Top 100 Tech)' },
  { symbol: 'NVDA', name: 'NVIDIA Corp.' },
  { symbol: 'AAPL', name: 'Apple Inc.' },
  { symbol: 'MSFT', name: 'Microsoft Corp.' },
  { symbol: 'AMZN', name: 'Amazon.com' },
  { symbol: 'GOOGL', name: 'Alphabet (Google)' }
];

const cache = {
  snapshot: null,
  lastFetchedMs: 0,
  psxLastFetchedMs: 0,
  psxCache: null,
  inFlight: null,
  history: new Map()
};

function parseNum(str) {
  if (typeof str === 'number') return Number.isFinite(str) ? str : null;
  const cleaned = String(str || '').replace(/[,%\s]/g, '');
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

async function fetchJsonWithTimeout(url, timeoutMs = 4500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (InvestGraph/1.0)' }
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (_) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchTextWithTimeout(url, timeoutMs = 5500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (InvestGraph/1.0)' }
    });
    if (!res.ok) return null;
    return await res.text();
  } catch (_) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchYahooSymbol(sym) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=2d`;
  const json = await fetchJsonWithTimeout(url, 4000);
  const meta = json && json.chart && json.chart.result && json.chart.result[0] && json.chart.result[0].meta;
  if (!meta || !Number.isFinite(meta.regularMarketPrice)) return null;
  return {
    symbol: meta.symbol,
    price: Number(meta.regularMarketPrice),
    change: Number((meta.fulldayChange ?? 0).toFixed(2)),
    changePct: Number((meta.regularMarketChangePercent ?? 0).toFixed(2)),
    currency: meta.currency || 'USD',
    time: meta.regularMarketTime || Math.floor(Date.now() / 1000)
  };
}

async function fetchFxLive() {
  const fxRates = {};
  const fxChanges = {};
  let source = 'Unavailable';

  const erJson = await fetchJsonWithTimeout('https://open.er-api.com/v6/latest/USD', 4000);
  if (erJson && erJson.rates) {
    for (const code of CURRENCY_CODES) {
      if (typeof erJson.rates[code] === 'number' && erJson.rates[code] > 0) {
        fxRates[code] = erJson.rates[code];
      }
    }
    source = 'open.er-api.com (Live)';
  }

  const yahooFxCodes = CURRENCY_CODES.filter((c) => c !== 'USD');
  const results = await Promise.allSettled(
    yahooFxCodes.map((code) => fetchYahooSymbol(`${code}=X`).then((q) => ({ code, q })))
  );

  let yahooHits = 0;
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value && r.value.q && r.value.q.price > 0) {
      const { code, q } = r.value;
      fxRates[code] = q.price;
      fxChanges[code] = q.changePct;
      yahooHits += 1;
    }
  }
  if (Object.keys(fxRates).length > 0) {
    fxRates.USD = 1.0;
    fxChanges.USD = 0;
  }

  if (yahooHits > 0) {
    source = 'Yahoo Intraday FX + ER-API (Live)';
  }

  return { fxRates, fxChanges, source };
}

async function fetchNasdaqLive() {
  const indices = {};
  const watchlist = [];
  const indexSymbols = [
    { key: 'NDX', sym: '^NDX', name: 'NASDAQ-100', market: 'NASDAQ' },
    { key: 'IXIC', sym: '^IXIC', name: 'NASDAQ Composite', market: 'NASDAQ' },
    { key: 'SPX', sym: '^GSPC', name: 'S&P 500', market: 'US' },
    { key: 'QQQ', sym: 'QQQ', name: 'Invesco QQQ ETF', market: 'NASDAQ' }
  ];

  const [idxRes, stockRes] = await Promise.all([
    Promise.allSettled(indexSymbols.map((item) => fetchYahooSymbol(item.sym).then((q) => ({ item, q })))),
    Promise.allSettled(NASDAQ_WATCH_SYMBOLS.map((item) => fetchYahooSymbol(item.symbol).then((q) => ({ item, q }))))
  ]);

  let hits = 0;
  for (const r of idxRes) {
    if (r.status === 'fulfilled' && r.value && r.value.q) {
      const { item, q } = r.value;
      indices[item.key] = {
        symbol: item.sym,
        market: item.market,
        name: item.name,
        value: q.price,
        change: q.change,
        changePct: q.changePct,
        currency: 'USD'
      };
      hits += 1;
    }
  }

  for (const r of stockRes) {
    if (r.status === 'fulfilled' && r.value && r.value.q) {
      const { item, q } = r.value;
      watchlist.push({
        symbol: item.symbol,
        name: item.name,
        price: q.price,
        changePct: q.changePct,
        currency: 'USD'
      });
      hits += 1;
    }
  }

  return {
    indices,
    watchlist,
    source: hits > 0 ? 'Yahoo Finance (Live)' : 'Unavailable'
  };
}

async function fetchPsxLive() {
  const now = Date.now();
  if (cache.psxCache && (now - cache.psxLastFetchedMs) < 12000) {
    return cache.psxCache;
  }

  const indices = {};
  const watchlist = [];
  let marketStatus = null;

  const [idxHtml, scrHtml, tpHtml] = await Promise.all([
    fetchTextWithTimeout('https://dps.psx.com.pk/indices', 5000),
    fetchTextWithTimeout('https://dps.psx.com.pk/screener', 6500),
    fetchTextWithTimeout('https://dps.psx.com.pk/trading-panel', 5000)
  ]);

  let hits = 0;
  if (idxHtml) {
    const rows = [...idxHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
    const indexMeta = {
      KSE100: 'PSX KSE-100',
      KMI30: 'PSX KMI-30 (Shariah)',
      KSE30: 'PSX KSE-30',
      ALLSHR: 'PSX All Share'
    };
    for (const r of rows) {
      const cells = [...r[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)]
        .map((c) => c[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
      if (cells.length >= 6 && indexMeta[cells[0]]) {
        const val = parseNum(cells[3]);
        const chg = parseNum(cells[4]);
        const chgPct = parseNum(cells[5]);
        if (val !== null) {
          indices[cells[0]] = {
            symbol: cells[0],
            market: 'PSX',
            name: indexMeta[cells[0]],
            value: val,
            change: chg ?? 0,
            changePct: chgPct ?? 0,
            currency: 'PKR'
          };
          hits += 1;
        }
      }
    }
  }

  if (scrHtml) {
    const rows = [...scrHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
    const bySym = {};
    for (const r of rows) {
      const cells = [...r[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)]
        .map((c) => c[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
      if (cells.length >= 9 && PSX_WATCH_SYMBOLS[cells[0]]) {
        const price = parseNum(cells[4]);
        const changePct = parseNum(cells[5]);
        const change1Y = parseNum(cells[6]);
        const peRatio = parseNum(cells[7]);
        const divYield = parseNum(cells[8]);
        if (price !== null) {
          bySym[cells[0]] = {
            symbol: cells[0],
            name: PSX_WATCH_SYMBOLS[cells[0]],
            price,
            changePct: changePct ?? 0,
            change1Y,
            peRatio,
            divYield: divYield ?? 0,
            currency: 'PKR'
          };
          hits += 1;
        }
      }
    }
    for (const sym of Object.keys(PSX_WATCH_SYMBOLS)) {
      if (bySym[sym]) watchlist.push(bySym[sym]);
    }
  }

  if (tpHtml) {
    const rows = [...tpHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
    let dateStr = null;
    let timeStr = null;
    let advance = null;
    let decline = null;
    let stateStr = null;
    for (const r of rows) {
      const cells = [...r[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)]
        .map((c) => c[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
      if (cells.length >= 9 && /\d{4}/.test(cells[0])) {
        dateStr = cells[0];
        timeStr = cells[1];
        advance = parseNum(cells[3]);
        decline = parseNum(cells[4]);
      } else if (cells.length >= 5 && cells[0] === 'Regular') {
        stateStr = cells[1];
      }
    }
    if (dateStr) {
      marketStatus = { date: dateStr, time: timeStr, state: stateStr || 'Unknown', advance, decline };
    }
  }

  const out = {
    indices,
    watchlist,
    marketStatus,
    source: hits > 0 ? 'PSX DPS (Live)' : 'Unavailable'
  };
  if (hits > 0) {
    cache.psxCache = out;
    cache.psxLastFetchedMs = now;
  }
  return out;
}

async function fetchCryptoLive() {
  const cryptoPrices = {};
  let source = 'Unavailable';
  const meta = {
    BTC: { id: 'bitcoin', name: 'Bitcoin' },
    ETH: { id: 'ethereum', name: 'Ethereum' },
    SOL: { id: 'solana', name: 'Solana' },
    BNB: { id: 'binancecoin', name: 'BNB' },
    XRP: { id: 'ripple', name: 'XRP' }
  };

  const symbols = encodeURIComponent(JSON.stringify(['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT']));
  const bin = await fetchJsonWithTimeout(`https://api.binance.com/api/v3/ticker/24hr?symbols=${symbols}`, 3500);
  if (Array.isArray(bin)) {
    for (const row of bin) {
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
    source = 'Binance (Live)';
  }
  return { cryptoPrices, source };
}

async function fetchLiveHistory(kind, symbol, range = '1y') {
  const cacheKey = `${kind}:${symbol}:${range}`;
  const cached = cache.history.get(cacheKey);
  const ttl = range === '1d' ? 30000 : 180000;
  if (cached && (Date.now() - cached.fetchedAt) < ttl) {
    return cached.data;
  }

  let points = [];
  let source = 'Unavailable';
  let baseCurrency = 'USD';

  if (kind === 'crypto') {
    const cleanSym = String(symbol || 'BTC').toUpperCase();
    if (cleanSym === 'USDT') {
      return { symbol: 'USDT', baseCurrency: 'USD', range, source: 'Fixed 1 USD Peg', points: [] };
    }
    const mapCfg = {
      '1d': { interval: '15m', limit: 96 },
      '1w': { interval: '2h', limit: 84 },
      '1m': { interval: '6h', limit: 120 },
      '1y': { interval: '3d', limit: 122 },
      '5y': { interval: '1w', limit: 260 }
    };
    const cfg = mapCfg[range] || mapCfg['1y'];
    const url = `https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(cleanSym + 'USDT')}&interval=${cfg.interval}&limit=${cfg.limit}`;
    const klines = await fetchJsonWithTimeout(url, 5000);
    if (Array.isArray(klines)) {
      points = klines
        .map((k) => ({ time: Number(k[0]), value: Number(k[4]) }))
        .filter((p) => Number.isFinite(p.time) && Number.isFinite(p.value) && p.value > 0);
      source = 'Binance Historical (Live)';
      baseCurrency = 'USD';
    }
  } else {
    const mapCfg = {
      '1d': { interval: '15m', yRange: '1d' },
      '1w': { interval: '1h', yRange: '5d' },
      '1m': { interval: '1d', yRange: '1mo' },
      '1y': { interval: '1wk', yRange: '1y' },
      '5y': { interval: '1mo', yRange: '5y' }
    };
    const cfg = mapCfg[range] || mapCfg['1y'];
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${cfg.interval}&range=${cfg.yRange}`;
    const json = await fetchJsonWithTimeout(url, 5500);
    const result = json && json.chart && json.chart.result && json.chart.result[0];
    if (result && Array.isArray(result.timestamp)) {
      const ts = result.timestamp;
      const closes = result.indicators && result.indicators.quote && result.indicators.quote[0] && result.indicators.quote[0].close;
      if (Array.isArray(closes)) {
        for (let i = 0; i < ts.length; i += 1) {
          const val = closes[i];
          if (typeof val === 'number' && Number.isFinite(val) && val > 0) {
            points.push({ time: ts[i] * 1000, value: val });
          }
        }
        source = 'Yahoo Finance (Live)';
        baseCurrency = (result.meta && result.meta.currency) || 'USD';
      }
    }
  }

  let annualizedCagrPct = null;
  let periodChangePct = null;
  if (points.length >= 2) {
    const first = points[0];
    const last = points[points.length - 1];
    periodChangePct = Number((((last.value - first.value) / first.value) * 100).toFixed(2));
    const yearsElapsed = (last.time - first.time) / (365.25 * 24 * 3600 * 1000);
    if (yearsElapsed >= 0.4 && first.value > 0 && last.value > 0) {
      annualizedCagrPct = Number(((Math.pow(last.value / first.value, 1 / yearsElapsed) - 1) * 100).toFixed(1));
    }
  }

  const payload = {
    kind,
    symbol,
    range,
    baseCurrency,
    source,
    periodChangePct,
    annualizedCagrPct,
    points
  };

  if (points.length > 0) {
    cache.history.set(cacheKey, { fetchedAt: Date.now(), data: payload });
  }
  return payload;
}

async function getLiveSnapshot(force = false) {
  const now = Date.now();
  if (!force && cache.snapshot && (now - cache.lastFetchedMs) < 4000) {
    return cache.snapshot;
  }
  if (cache.inFlight) return cache.inFlight;

  cache.inFlight = (async () => {
    try {
      const [fx, nasdaq, psx, crypto] = await Promise.all([
        fetchFxLive(),
        fetchNasdaqLive(),
        fetchPsxLive(),
        fetchCryptoLive()
      ]);

      const snapshot = {
        timestamp: Date.now(),
        fxRates: fx.fxRates,
        fxChanges: fx.fxChanges,
        cryptoPrices: crypto.cryptoPrices,
        indices: { ...psx.indices, ...nasdaq.indices },
        equities: {
          PSX: psx.watchlist,
          NASDAQ: nasdaq.watchlist
        },
        psxMarketStatus: psx.marketStatus,
        sources: {
          fx: fx.source,
          psx: psx.source,
          nasdaq: nasdaq.source,
          crypto: crypto.source
        }
      };
      cache.snapshot = snapshot;
      cache.lastFetchedMs = Date.now();
      return snapshot;
    } finally {
      cache.inFlight = null;
    }
  })();

  return cache.inFlight;
}

module.exports = {
  getLiveSnapshot,
  fetchLiveHistory
};
