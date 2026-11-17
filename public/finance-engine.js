(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.FinanceEngine = factory();
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /**
   * Popular global & regional currencies with PKR first, matching typical
   * retail & diaspora investor needs, plus slider scales tailored per currency.
   */
  const CURRENCIES = [
    {
      code: 'PKR',
      name: 'Pakistani Rupee',
      symbol: 'PKR',
      spaceAfterSymbol: true,
      region: 'Pakistan',
      defaultRateFromUSD: 276.56,
      decimals: 0,
      sliderMaxStart: 5000000,
      sliderStepStart: 5000,
      sliderMaxMonthly: 250000,
      sliderStepMonthly: 500
    },
    {
      code: 'USD',
      name: 'US Dollar',
      symbol: '$',
      spaceAfterSymbol: false,
      region: 'United States',
      defaultRateFromUSD: 1.0,
      decimals: 0,
      sliderMaxStart: 100000,
      sliderStepStart: 100,
      sliderMaxMonthly: 10000,
      sliderStepMonthly: 25
    },
    {
      code: 'AED',
      name: 'UAE Dirham',
      symbol: 'AED',
      spaceAfterSymbol: true,
      region: 'UAE',
      defaultRateFromUSD: 3.6725,
      decimals: 0,
      sliderMaxStart: 250000,
      sliderStepStart: 500,
      sliderMaxMonthly: 25000,
      sliderStepMonthly: 100
    },
    {
      code: 'SAR',
      name: 'Saudi Riyal',
      symbol: 'SAR',
      spaceAfterSymbol: true,
      region: 'Saudi Arabia',
      defaultRateFromUSD: 3.75,
      decimals: 0,
      sliderMaxStart: 250000,
      sliderStepStart: 500,
      sliderMaxMonthly: 25000,
      sliderStepMonthly: 100
    },
    {
      code: 'GBP',
      name: 'British Pound',
      symbol: '£',
      spaceAfterSymbol: false,
      region: 'United Kingdom',
      defaultRateFromUSD: 0.7583,
      decimals: 0,
      sliderMaxStart: 100000,
      sliderStepStart: 100,
      sliderMaxMonthly: 10000,
      sliderStepMonthly: 25
    },
    {
      code: 'EUR',
      name: 'Euro',
      symbol: '€',
      spaceAfterSymbol: false,
      region: 'Eurozone',
      defaultRateFromUSD: 0.9086,
      decimals: 0,
      sliderMaxStart: 100000,
      sliderStepStart: 100,
      sliderMaxMonthly: 10000,
      sliderStepMonthly: 25
    },
    {
      code: 'CAD',
      name: 'Canadian Dollar',
      symbol: 'C$',
      spaceAfterSymbol: false,
      region: 'Canada',
      defaultRateFromUSD: 1.4294,
      decimals: 0,
      sliderMaxStart: 120000,
      sliderStepStart: 100,
      sliderMaxMonthly: 12000,
      sliderStepMonthly: 25
    },
    {
      code: 'AUD',
      name: 'Australian Dollar',
      symbol: 'A$',
      spaceAfterSymbol: false,
      region: 'Australia',
      defaultRateFromUSD: 1.4831,
      decimals: 0,
      sliderMaxStart: 120000,
      sliderStepStart: 100,
      sliderMaxMonthly: 12000,
      sliderStepMonthly: 25
    },
    {
      code: 'INR',
      name: 'Indian Rupee',
      symbol: '₹',
      spaceAfterSymbol: false,
      region: 'India',
      defaultRateFromUSD: 93.96,
      decimals: 0,
      sliderMaxStart: 2500000,
      sliderStepStart: 2500,
      sliderMaxMonthly: 150000,
      sliderStepMonthly: 500
    },
    {
      code: 'JPY',
      name: 'Japanese Yen',
      symbol: '¥',
      spaceAfterSymbol: false,
      region: 'Japan',
      defaultRateFromUSD: 159.58,
      decimals: 0,
      sliderMaxStart: 5000000,
      sliderStepStart: 5000,
      sliderMaxMonthly: 300000,
      sliderStepMonthly: 1000
    },
    {
      code: 'CNY',
      name: 'Chinese Yuan',
      symbol: 'CN¥',
      spaceAfterSymbol: false,
      region: 'China',
      defaultRateFromUSD: 6.6793,
      decimals: 0,
      sliderMaxStart: 500000,
      sliderStepStart: 500,
      sliderMaxMonthly: 40000,
      sliderStepMonthly: 100
    },
    {
      code: 'CHF',
      name: 'Swiss Franc',
      symbol: 'CHF',
      spaceAfterSymbol: true,
      region: 'Switzerland',
      defaultRateFromUSD: 0.8398,
      decimals: 0,
      sliderMaxStart: 100000,
      sliderStepStart: 100,
      sliderMaxMonthly: 10000,
      sliderStepMonthly: 25
    },
    {
      code: 'TRY',
      name: 'Turkish Lira',
      symbol: '₺',
      spaceAfterSymbol: false,
      region: 'Turkey',
      defaultRateFromUSD: 50.42,
      decimals: 0,
      sliderMaxStart: 1500000,
      sliderStepStart: 1000,
      sliderMaxMonthly: 100000,
      sliderStepMonthly: 250
    },
    {
      code: 'QAR',
      name: 'Qatari Riyal',
      symbol: 'QAR',
      spaceAfterSymbol: true,
      region: 'Qatar',
      defaultRateFromUSD: 3.64,
      decimals: 0,
      sliderMaxStart: 250000,
      sliderStepStart: 500,
      sliderMaxMonthly: 25000,
      sliderStepMonthly: 100
    },
    {
      code: 'KWD',
      name: 'Kuwaiti Dinar',
      symbol: 'KWD',
      spaceAfterSymbol: true,
      region: 'Kuwait',
      defaultRateFromUSD: 0.3112,
      decimals: 2,
      sliderMaxStart: 30000,
      sliderStepStart: 50,
      sliderMaxMonthly: 3000,
      sliderStepMonthly: 10
    },
    {
      code: 'SGD',
      name: 'Singapore Dollar',
      symbol: 'S$',
      spaceAfterSymbol: false,
      region: 'Singapore',
      defaultRateFromUSD: 1.2889,
      decimals: 0,
      sliderMaxStart: 120000,
      sliderStepStart: 100,
      sliderMaxMonthly: 12000,
      sliderStepMonthly: 25
    },
    {
      code: 'MYR',
      name: 'Malaysian Ringgit',
      symbol: 'RM',
      spaceAfterSymbol: true,
      region: 'Malaysia',
      defaultRateFromUSD: 4.0942,
      decimals: 0,
      sliderMaxStart: 300000,
      sliderStepStart: 500,
      sliderMaxMonthly: 25000,
      sliderStepMonthly: 100
    },
    {
      code: 'HKD',
      name: 'Hong Kong Dollar',
      symbol: 'HK$',
      spaceAfterSymbol: false,
      region: 'Hong Kong',
      defaultRateFromUSD: 7.847,
      decimals: 0,
      sliderMaxStart: 500000,
      sliderStepStart: 500,
      sliderMaxMonthly: 40000,
      sliderStepMonthly: 100
    }
  ];

  const CURRENCY_MAP = Object.fromEntries(CURRENCIES.map((c) => [c.code, c]));

  function getCurrencyMeta(code) {
    return CURRENCY_MAP[String(code || 'PKR').toUpperCase()] || CURRENCY_MAP.PKR;
  }

  function getDefaultRates() {
    const out = {};
    for (const c of CURRENCIES) {
      out[c.code] = c.defaultRateFromUSD;
    }
    return out;
  }

  function clampNumber(value, min, max, fallback = 0) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    if (typeof min === 'number' && n < min) return min;
    if (typeof max === 'number' && n > max) return max;
    return n;
  }

  function convertAmount(amount, fromCode, toCode, rates) {
    const val = Number(amount);
    if (!Number.isFinite(val)) return 0;
    const from = String(fromCode || 'PKR').toUpperCase();
    const to = String(toCode || 'PKR').toUpperCase();
    if (from === to) return val;

    const map = rates || getDefaultRates();
    const fromRate = Number(map[from]) || getCurrencyMeta(from).defaultRateFromUSD;
    const toRate = Number(map[to]) || getCurrencyMeta(to).defaultRateFromUSD;
    if (fromRate <= 0 || toRate <= 0) return val;

    const inUsd = val / fromRate;
    return inUsd * toRate;
  }

  function roundForSlider(value, step) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    if (!step || step <= 0) return Math.round(n);
    return Math.round(n / step) * step;
  }

  function formatPrefix(meta, isNegative) {
    const sign = isNegative ? '-' : '';
    const space = meta.spaceAfterSymbol ? ' ' : '';
    return `${sign}${meta.symbol}${space}`;
  }

  function formatGroupedNumber(absVal, decimals = 0) {
    return absVal.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  }

  /**
   * Formats currency values cleanly:
   * - mode = 'smart' (default, matches reference screenshots):
   *   - < 1,000,000 => full grouped integer (e.g. PKR 980,536 or PKR 429,130)
   *   - >= 1,000,000 => compact 1-decimal (e.g. PKR 1.4M, PKR 1.9M, $2.5B)
   * - mode = 'exact': always full grouped figure (e.g. PKR 1,440,000)
   * - mode = 'compact': compact even for >= 1,000 (e.g. PKR 200K, PKR 1.0M)
   * - mode = 'axis': clean Y-axis ticks matching screenshot style (PKR 0, PKR 200K, PKR 1.0M)
   */
  function formatCurrency(amount, currencyCode = 'PKR', options = {}) {
    const meta = getCurrencyMeta(currencyCode);
    const mode = options.mode || 'smart';
    const numeric = Number(amount);
    if (!Number.isFinite(numeric)) return `${formatPrefix(meta, false)}0`;

    const isNegative = numeric < 0;
    const abs = Math.abs(numeric);
    const prefix = formatPrefix(meta, isNegative);

    if (mode === 'axis') {
      if (abs < 1e-6) return `${prefix}0`;
      if (abs >= 1e12) {
        const scaled = abs / 1e12;
        return `${prefix}${scaled >= 100 ? Math.round(scaled) : scaled.toFixed(1)}T`;
      }
      if (abs >= 1e9) {
        const scaled = abs / 1e9;
        return `${prefix}${scaled >= 100 ? Math.round(scaled) : scaled.toFixed(1)}B`;
      }
      if (abs >= 1e6) {
        const scaled = abs / 1e6;
        return `${prefix}${scaled >= 100 ? Math.round(scaled) : scaled.toFixed(1)}M`;
      }
      if (abs >= 1e3) {
        const scaled = abs / 1e3;
        const text = Number.isInteger(Number(scaled.toFixed(1))) && scaled >= 10
          ? String(Math.round(scaled))
          : (Math.abs(scaled - Math.round(scaled)) < 0.05 ? String(Math.round(scaled)) : scaled.toFixed(1));
        return `${prefix}${text}K`;
      }
      return `${prefix}${formatGroupedNumber(Math.round(abs), 0)}`;
    }

    if (mode === 'exact') {
      const dec = typeof options.decimals === 'number'
        ? options.decimals
        : (abs > 0 && abs < 100 && meta.decimals > 0 ? meta.decimals : 0);
      return `${prefix}${formatGroupedNumber(dec === 0 ? Math.round(abs) : abs, dec)}`;
    }

    if (mode === 'compact') {
      if (abs >= 1e12) return `${prefix}${(abs / 1e12).toFixed(1)}T`;
      if (abs >= 1e9) return `${prefix}${(abs / 1e9).toFixed(1)}B`;
      if (abs >= 1e6) return `${prefix}${(abs / 1e6).toFixed(1)}M`;
      if (abs >= 1e4) return `${prefix}${(abs / 1e3).toFixed(1).replace(/\.0$/, '')}K`;
      return `${prefix}${formatGroupedNumber(Math.round(abs), 0)}`;
    }

    // 'smart' mode: full integer under 1M, compact M/B/T at >= 1M (like screenshots!)
    if (abs >= 1e12) return `${prefix}${(abs / 1e12).toFixed(2).replace(/\.?0+$/, '')}T`;
    if (abs >= 1e9) return `${prefix}${(abs / 1e9).toFixed(1)}B`;
    if (abs >= 1e6) return `${prefix}${(abs / 1e6).toFixed(1)}M`;
    const dec = typeof options.decimals === 'number'
      ? options.decimals
      : (abs > 0 && abs < 100 && meta.decimals > 0 ? meta.decimals : 0);
    return `${prefix}${formatGroupedNumber(dec === 0 ? Math.round(abs) : abs, dec)}`;
  }

  /**
   * Computes clean financial tick values from 0 to a rounded ceiling >= maxValue.
   */
  function niceAxisScale(maxValue, desiredIntervals = 5) {
    const safeMax = Number.isFinite(maxValue) && maxValue > 0 ? maxValue : 100;
    const rawStep = safeMax / Math.max(1, desiredIntervals);
    const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const normalized = rawStep / magnitude;

    let niceNorm;
    if (normalized <= 1) niceNorm = 1;
    else if (normalized <= 1.25) niceNorm = 1.25;
    else if (normalized <= 1.5) niceNorm = 1.5;
    else if (normalized <= 2) niceNorm = 2;
    else if (normalized <= 2.5) niceNorm = 2.5;
    else if (normalized <= 4) niceNorm = 4;
    else if (normalized <= 5) niceNorm = 5;
    else niceNorm = 10;

    const step = niceNorm * magnitude;
    const tickCount = Math.max(2, Math.ceil(safeMax / step));
    const ceiling = tickCount * step;
    const ticks = [];
    for (let i = 0; i <= tickCount; i += 1) {
      ticks.push(Number((i * step).toPrecision(12)));
    }
    return { step, max: ceiling, ticks };
  }

  /**
   * Computes effective annual return rate (as decimal, e.g. 0.10) factoring
   * in asset return, optional annual fee/tax drag, and optional FX drift.
   */
  function computeEffectiveAnnualRate(annualReturnPct, taxDragPct = 0, fxDriftPct = 0) {
    const netAssetPct = Number(annualReturnPct || 0) - Number(taxDragPct || 0);
    const rAsset = netAssetPct / 100;
    const rFx = Number(fxDriftPct || 0) / 100;
    return (1 + rAsset) * (1 + rFx) - 1;
  }

  /**
   * Core monthly-compounding projection engine.
   * Matches end-of-month deposit + monthly compounding (r_annual / 12):
   * - balance_0 = startingAmount
   * - balance_m = balance_{m-1} * (1 + r_annual / 12) + monthlyContribution
   * - realBalance_m = balance_m / (1 + inflation)^(m / 12)
   */
  function projectGrowth(params = {}) {
    const startingAmount = clampNumber(params.startingAmount, 0, 1e15, 0);
    const monthlyContribution = clampNumber(params.monthlyContribution, 0, 1e14, 0);
    const annualReturnPct = clampNumber(params.annualReturnPct, -95, 500, 10);
    const annualInflationPct = clampNumber(params.annualInflationPct, 0, 200, 0);
    const years = clampNumber(params.years, 0, 60, 5);
    const taxDragPct = clampNumber(params.taxDragPct, 0, 50, 0);
    const fxDriftPct = clampNumber(params.fxDriftPct, -80, 200, 0);
    const assetUnitPrice = clampNumber(params.assetUnitPrice, 0, 1e15, 0);

    const effectiveAnnualRate = computeEffectiveAnnualRate(annualReturnPct, taxDragPct, fxDriftPct);
    const monthlyRate = Math.max(-0.99, effectiveAnnualRate / 12);
    const inflationRate = annualInflationPct / 100;
    const totalMonths = Math.max(0, Math.round(years * 12));

    let balance = startingAmount;
    let contributed = startingAmount;
    let unitsAccumulated = assetUnitPrice > 0 ? startingAmount / assetUnitPrice : 0;

    const monthlySeries = [];
    const yearlySeries = [];

    function pushPoint(monthIndex) {
      const yearTime = monthIndex / 12;
      const discountFactor = Math.pow(1 + inflationRate, yearTime);
      const realBalance = discountFactor > 0 ? balance / discountFactor : balance;
      const inflationErosion = balance - realBalance;
      const profitEarned = balance - contributed;
      const realProfit = realBalance - contributed;

      const point = {
        month: monthIndex,
        year: Number(yearTime.toFixed(4)),
        contributed,
        balance,
        realBalance,
        profitEarned,
        realProfit,
        inflationErosion,
        unitsAccumulated
      };
      monthlySeries.push(point);
      if (monthIndex % 12 === 0 || monthIndex === totalMonths) {
        yearlySeries.push(point);
      }
    }

    pushPoint(0);

    for (let m = 1; m <= totalMonths; m += 1) {
      balance = Math.max(0, balance * (1 + monthlyRate) + monthlyContribution);
      contributed += monthlyContribution;

      if (assetUnitPrice > 0 && monthlyContribution > 0) {
        const projectedUnitPrice = assetUnitPrice * Math.pow(1 + Math.max(-0.95, annualReturnPct / 100), m / 12);
        if (projectedUnitPrice > 0) {
          unitsAccumulated += monthlyContribution / projectedUnitPrice;
        }
      }

      pushPoint(m);
    }

    const last = monthlySeries[monthlySeries.length - 1];
    const multiple = last.contributed > 0 ? last.balance / last.contributed : 1;
    const totalReturnPct = last.contributed > 0 ? ((last.balance - last.contributed) / last.contributed) * 100 : 0;

    return {
      params: {
        startingAmount,
        monthlyContribution,
        annualReturnPct,
        annualInflationPct,
        years,
        taxDragPct,
        fxDriftPct,
        effectiveAnnualReturnPct: Number((effectiveAnnualRate * 100).toFixed(2))
      },
      monthlySeries,
      yearlySeries,
      summary: {
        cashPutIn: last.contributed,
        finalBalance: last.balance,
        profitEarned: last.profitEarned,
        realBuyingPower: last.realBalance,
        inflationErosion: last.inflationErosion,
        realProfit: last.realProfit,
        multiple,
        totalReturnPct,
        unitsAccumulated: last.unitsAccumulated
      }
    };
  }

  /**
   * Produces Bear / Base / Bull scenario projections for volatile asset classes
   * (PSX equities, NASDAQ tech stocks, Crypto).
   */
  function projectWithScenarios(params = {}, volatilitySpreadPct = 8) {
    const baseReturn = Number(params.annualReturnPct ?? 10);
    const spread = Math.max(0, Number(volatilitySpreadPct) || 0);

    const base = projectGrowth(params);
    const bear = projectGrowth({
      ...params,
      annualReturnPct: Math.max(-65, baseReturn - spread)
    });
    const bull = projectGrowth({
      ...params,
      annualReturnPct: Math.min(250, baseReturn + spread)
    });

    return { base, bear, bull };
  }

  /**
   * Computes normalized weights (summing to 100) and blended portfolio return.
   */
  function computeBlendedPortfolio(allocations = [], marketReturns = {}) {
    const cleaned = allocations.map((item) => ({
      key: item.key,
      label: item.label,
      weight: Math.max(0, Number(item.weight) || 0),
      annualReturnPct: Number(marketReturns[item.key] ?? item.defaultReturnPct ?? 0),
      fxDriftPct: Number(item.fxDriftPct || 0)
    }));

    const totalWeight = cleaned.reduce((sum, item) => sum + item.weight, 0);
    if (totalWeight <= 0) {
      const equal = 100 / Math.max(1, cleaned.length);
      cleaned.forEach((item) => {
        item.normalizedPct = equal;
      });
    } else {
      cleaned.forEach((item) => {
        item.normalizedPct = (item.weight / totalWeight) * 100;
      });
    }

    const blendedReturnPct = cleaned.reduce((sum, item) => {
      const effectiveSingle = computeEffectiveAnnualRate(item.annualReturnPct, 0, item.fxDriftPct) * 100;
      return sum + (item.normalizedPct / 100) * effectiveSingle;
    }, 0);

    return {
      totalWeight,
      allocations: cleaned,
      blendedReturnPct: Number(blendedReturnPct.toFixed(2))
    };
  }

  /**
   * Runs simultaneous projections across multiple asset classes (Savings, PSX,
   * NASDAQ, Crypto, and Blended Portfolio) using identical cash flows & horizon.
   */
  function projectMultiMarket(sharedParams = {}, marketConfigs = []) {
    const results = {};
    for (const m of marketConfigs) {
      results[m.key] = {
        config: m,
        projection: projectGrowth({
          startingAmount: sharedParams.startingAmount,
          monthlyContribution: sharedParams.monthlyContribution,
          annualReturnPct: m.annualReturnPct,
          annualInflationPct: sharedParams.annualInflationPct,
          years: sharedParams.years,
          taxDragPct: m.taxDragPct || 0,
          fxDriftPct: m.fxDriftPct || 0
        })
      };
    }
    return results;
  }

  function escapeCsvCell(value) {
    const str = String(value ?? '');
    if (/[",\r\n]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  function buildCsv(headers, rows) {
    const lines = [headers.map(escapeCsvCell).join(',')];
    for (const row of rows) {
      lines.push(row.map(escapeCsvCell).join(','));
    }
    return lines.join('\r\n');
  }

  /**
   * Computes exact monthly contribution required to reach targetAmount
   * over `years` given startingAmount and annualReturnPct.
   */
  function calculateRequiredMonthlySavings(params = {}) {
    const startingAmount = clampNumber(params.startingAmount, 0, 1e15, 0);
    const targetAmount = clampNumber(params.targetAmount, 0, 1e15, 0);
    const annualReturnPct = clampNumber(params.annualReturnPct, -95, 500, 10);
    const years = clampNumber(params.years, 0.25, 60, 5);
    const fxDriftPct = clampNumber(params.fxDriftPct, -80, 200, 0);
    const taxDragPct = clampNumber(params.taxDragPct, 0, 50, 0);

    const totalMonths = Math.max(1, Math.round(years * 12));
    const effectiveAnnualRate = computeEffectiveAnnualRate(annualReturnPct, taxDragPct, fxDriftPct);
    const monthlyRate = Math.max(-0.99, effectiveAnnualRate / 12);

    if (Math.abs(monthlyRate) < 1e-10) {
      return Math.max(0, (targetAmount - startingAmount) / totalMonths);
    }

    const growthFactor = Math.pow(1 + monthlyRate, totalMonths);
    const futureOfStart = startingAmount * growthFactor;
    if (futureOfStart >= targetAmount) return 0;

    const annuityFactor = (growthFactor - 1) / monthlyRate;
    if (annuityFactor <= 0) return 0;
    return Math.max(0, (targetAmount - futureOfStart) / annuityFactor);
  }

  return {
    CURRENCIES,
    CURRENCY_MAP,
    getCurrencyMeta,
    getDefaultRates,
    clampNumber,
    convertAmount,
    roundForSlider,
    formatCurrency,
    niceAxisScale,
    computeEffectiveAnnualRate,
    projectGrowth,
    projectWithScenarios,
    computeBlendedPortfolio,
    projectMultiMarket,
    calculateRequiredMonthlySavings,
    buildCsv
  };
}));
