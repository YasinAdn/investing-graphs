'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const FE = require('./public/finance-engine.js');
const MD = require('./public/market-data.js');
const CR = require('./public/chart-renderer.js');

test('Screenshot 1 benchmark: 3-Year Savings vs. Inflation Purchasing Power matches exact numbers', () => {
  const proj = FE.projectGrowth({
    startingAmount: 30000,
    monthlyContribution: 22500,
    annualReturnPct: 10,
    annualInflationPct: 10,
    years: 3
  });

  assert.equal(Math.round(proj.summary.finalBalance), 980536);
  assert.equal(Math.round(proj.summary.realBuyingPower), 736692);
  assert.equal(Math.round(proj.summary.inflationErosion), 243845);

  assert.equal(FE.formatCurrency(proj.summary.finalBalance, 'PKR', { mode: 'smart' }), 'PKR 980,536');
  assert.equal(FE.formatCurrency(proj.summary.realBuyingPower, 'PKR', { mode: 'smart' }), 'PKR 736,692');
  assert.equal(FE.formatCurrency(proj.summary.inflationErosion, 'PKR', { mode: 'smart' }), 'PKR 243,845');
});

test('Screenshot 2 benchmark: PSX & Money Market Growth Projection matches exact numbers', () => {
  const proj = FE.projectGrowth({
    startingAmount: 30000,
    monthlyContribution: 23500,
    annualReturnPct: 10,
    annualInflationPct: 10,
    years: 5
  });

  assert.equal(Math.round(proj.summary.cashPutIn), 1440000);
  assert.equal(Math.round(proj.summary.profitEarned), 429130);
  assert.equal(Math.round(proj.summary.finalBalance), 1869130);

  assert.equal(FE.formatCurrency(proj.summary.cashPutIn, 'PKR', { mode: 'smart' }), 'PKR 1.4M');
  assert.equal(FE.formatCurrency(proj.summary.profitEarned, 'PKR', { mode: 'smart' }), 'PKR 429,130');
  assert.equal(FE.formatCurrency(proj.summary.finalBalance, 'PKR', { mode: 'smart' }), 'PKR 1.9M');
});

test('Zero years, zero return, and negative crypto return edge cases', () => {
  const zeroYrs = FE.projectGrowth({
    startingAmount: 50000,
    monthlyContribution: 10000,
    annualReturnPct: 12,
    annualInflationPct: 10,
    years: 0
  });
  assert.equal(zeroYrs.monthlySeries.length, 1);
  assert.equal(zeroYrs.summary.finalBalance, 50000);
  assert.equal(zeroYrs.summary.profitEarned, 0);

  const zeroRet = FE.projectGrowth({
    startingAmount: 100000,
    monthlyContribution: 5000,
    annualReturnPct: 0,
    annualInflationPct: 10,
    years: 2
  });
  assert.equal(zeroRet.summary.cashPutIn, 220000);
  assert.equal(zeroRet.summary.finalBalance, 220000);
  assert.equal(zeroRet.summary.profitEarned, 0);
  assert.ok(zeroRet.summary.realBuyingPower < 220000);

  const bearCrypto = FE.projectGrowth({
    startingAmount: 1000,
    monthlyContribution: 0,
    annualReturnPct: -20,
    annualInflationPct: 3,
    years: 2
  });
  assert.ok(bearCrypto.summary.finalBalance < 1000);
  assert.ok(bearCrypto.summary.profitEarned < 0);
});

test('Currency conversion across PKR, USD, AED, SAR, GBP, EUR, JPY, KWD', () => {
  const rates = {
    PKR: 276.56,
    USD: 1.0,
    AED: 3.6725,
    SAR: 3.75,
    GBP: 0.7583,
    EUR: 0.9086,
    JPY: 159.58,
    KWD: 0.3112
  };

  assert.equal(FE.CURRENCIES.length >= 18, true);
  assert.ok(FE.CURRENCIES.some((c) => c.code === 'PKR'));
  assert.ok(FE.CURRENCIES.some((c) => c.code === 'USD'));
  assert.ok(FE.CURRENCIES.some((c) => c.code === 'AED'));

  const pkrFromUsd = FE.convertAmount(100, 'USD', 'PKR', rates);
  assert.equal(Math.round(pkrFromUsd), 27656);

  const roundTrip = FE.convertAmount(pkrFromUsd, 'PKR', 'USD', rates);
  assert.ok(Math.abs(roundTrip - 100) < 1e-9);

  const aedToPkr = FE.convertAmount(1000, 'AED', 'PKR', rates);
  assert.ok(aedToPkr > 75000 && aedToPkr < 76000);
});

test('Currency formatting modes (smart, exact, compact, axis) and negatives', () => {
  assert.equal(FE.formatCurrency(0, 'PKR', { mode: 'axis' }), 'PKR 0');
  assert.equal(FE.formatCurrency(200000, 'PKR', { mode: 'axis' }), 'PKR 200K');
  assert.equal(FE.formatCurrency(1000000, 'PKR', { mode: 'axis' }), 'PKR 1.0M');
  assert.equal(FE.formatCurrency(1600000, 'PKR', { mode: 'axis' }), 'PKR 1.6M');
  assert.equal(FE.formatCurrency(1440000, 'PKR', { mode: 'exact' }), 'PKR 1,440,000');
  assert.equal(FE.formatCurrency(1250, 'USD', { mode: 'smart' }), '$1,250');
  assert.equal(FE.formatCurrency(-4500, 'USD', { mode: 'smart' }), '-$4,500');
  assert.equal(FE.formatCurrency(-4500, 'PKR', { mode: 'smart' }), '-PKR 4,500');
});

test('niceAxisScale produces clean steps covering ceiling', () => {
  const scale1 = FE.niceAxisScale(980536, 5);
  assert.equal(scale1.ticks[0], 0);
  assert.ok(scale1.max >= 980536);
  assert.equal(scale1.step, 200000);
  assert.deepEqual(scale1.ticks, [0, 200000, 400000, 600000, 800000, 1000000]);

  const scale2 = FE.niceAxisScale(1869130, 5);
  assert.equal(scale2.step, 400000);
  assert.deepEqual(scale2.ticks, [0, 400000, 800000, 1200000, 1600000, 2000000]);
});

test('FX drift compounds multiplicatively with asset return and multi-market comparison aligns', () => {
  const eff = FE.computeEffectiveAnnualRate(14, 0, 4);
  // (1.14 * 1.04) - 1 = 0.1856 => 18.56%
  assert.ok(Math.abs(eff - 0.1856) < 1e-9);

  const blend = FE.computeBlendedPortfolio(
    [
      { key: 'savings', label: 'Savings', weight: 25, fxDriftPct: 0 },
      { key: 'psx', label: 'PSX', weight: 25, fxDriftPct: 0 },
      { key: 'nasdaq', label: 'NASDAQ', weight: 25, fxDriftPct: 4 },
      { key: 'crypto', label: 'Crypto', weight: 25, fxDriftPct: 4 }
    ],
    { savings: 10, psx: 16, nasdaq: 14, crypto: 26 }
  );
  // 0.25*10 + 0.25*16 + 0.25*18.56 + 0.25*31.04 = 18.90
  assert.equal(blend.blendedReturnPct, 18.9);

  const multi = FE.projectMultiMarket(
    { startingAmount: 100000, monthlyContribution: 25000, annualInflationPct: 9, years: 5 },
    [
      { key: 'savings', label: 'Savings', annualReturnPct: 10 },
      { key: 'psx', label: 'PSX', annualReturnPct: 16 },
      { key: 'nasdaq', label: 'NASDAQ', annualReturnPct: 14, fxDriftPct: 4 },
      { key: 'crypto', label: 'Crypto', annualReturnPct: 25, fxDriftPct: 4 }
    ]
  );

  assert.equal(multi.savings.projection.yearlySeries.length, 6);
  assert.equal(multi.crypto.projection.yearlySeries.length, 6);
  assert.ok(multi.crypto.projection.summary.finalBalance > multi.nasdaq.projection.summary.finalBalance);
  assert.ok(multi.psx.projection.summary.finalBalance > multi.savings.projection.summary.finalBalance);
});

test('CSV export properly quotes commas and quotes, and market presets are complete', () => {
  const csv = FE.buildCsv(['Period', 'Note'], [['Year 1', '1,000 "PKR"']]);
  assert.equal(csv, 'Period,Note\r\nYear 1,"1,000 ""PKR"""');
  assert.ok(Array.isArray(MD.TAB_PRESETS.savings) && MD.TAB_PRESETS.savings.length >= 3);
  assert.ok(Array.isArray(MD.TAB_PRESETS.psx) && MD.TAB_PRESETS.psx.length >= 3);
  assert.ok(Array.isArray(MD.TAB_PRESETS.nasdaq) && MD.TAB_PRESETS.nasdaq.length >= 3);
  assert.ok(Array.isArray(MD.TAB_PRESETS.crypto) && MD.TAB_PRESETS.crypto.length >= 2);
});

test('Reverse Goal Calculator (calculateRequiredMonthlySavings) round-trips accurately', () => {
  const needed = FE.calculateRequiredMonthlySavings({
    startingAmount: 30000,
    targetAmount: 1869130.49,
    annualReturnPct: 10,
    years: 5
  });
  assert.ok(Math.abs(needed - 23500) < 0.05);

  const checkProj = FE.projectGrowth({
    startingAmount: 30000,
    monthlyContribution: needed,
    annualReturnPct: 10,
    annualInflationPct: 0,
    years: 5
  });
  assert.ok(Math.abs(checkProj.summary.finalBalance - 1869130.49) < 1);

  const zeroRateNeed = FE.calculateRequiredMonthlySavings({
    startingAmount: 100000,
    targetAmount: 700000,
    annualReturnPct: 0,
    years: 5
  });
  assert.equal(Math.round(zeroRateNeed), 10000);
});

test('niceRangeTicks bounds FX and live market price ranges cleanly', () => {
  const r = CR.niceRangeTicks(275.4, 281.2, 5);
  assert.ok(r.min <= 275.4);
  assert.ok(r.max >= 281.2);
  assert.ok(r.ticks.length >= 4 && r.ticks.length <= 8);
});
