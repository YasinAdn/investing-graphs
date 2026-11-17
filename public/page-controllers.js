(function (root) {
  'use strict';

  const FE = root.FinanceEngine;
  const MD = root.MarketData;
  const CR = root.ChartRenderer;
  const Shell = root.AppShell;

  const pageKey = document.body.dataset.page || 'savings';
  const PAGE_STATE_PREFIX = 'investgraph_page_state_v1_';

  function loadPageState(key, defaults) {
    try {
      const raw = localStorage.getItem(PAGE_STATE_PREFIX + key);
      if (!raw) return { ...defaults, savedCurrency: 'PKR' };
      return { ...defaults, savedCurrency: 'PKR', ...JSON.parse(raw) };
    } catch (_) {
      return { ...defaults, savedCurrency: 'PKR' };
    }
  }

  function syncModelToShellCurrency(model, shellState) {
    const active = shellState.currency;
    const prev = model.savedCurrency || 'PKR';
    if (prev === active) return;
    if (shellState.convertOnCurrencySwitch) {
      const meta = FE.getCurrencyMeta(active);
      if (typeof model.startingAmount === 'number') {
        model.startingAmount = FE.roundForSlider(FE.convertAmount(model.startingAmount, prev, active, shellState.fxRates), meta.sliderStepStart);
      }
      if (typeof model.monthlyContribution === 'number') {
        model.monthlyContribution = FE.roundForSlider(FE.convertAmount(model.monthlyContribution, prev, active, shellState.fxRates), meta.sliderStepMonthly);
      }
      if (typeof model.targetGoalAmount === 'number') {
        model.targetGoalAmount = Math.round(FE.convertAmount(model.targetGoalAmount, prev, active, shellState.fxRates));
      }
    }
    model.savedCurrency = active;
  }

  function savePageState(key, data, activeCurrency) {
    try {
      const payload = activeCurrency ? { ...data, savedCurrency: activeCurrency } : data;
      localStorage.setItem(PAGE_STATE_PREFIX + key, JSON.stringify(payload));
    } catch (_) {
      // ignore
    }
  }

  function killKpiTween(el) {
    if (el && el._kpiTween) {
      el._kpiTween.kill();
      el._kpiTween = null;
    }
  }

  function formatEditable(val, dec = 0) {
    const n = Number(val);
    if (!Number.isFinite(n)) return '0';
    return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: dec });
  }

  function parseEditable(raw) {
    const cleaned = String(raw || '').replace(/[^0-9.\-]/g, '');
    if (!cleaned) return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }

  /**
   * Smoothly animates KPI currency numbers using GSAP proxy tween + Intl.NumberFormat.
   */
  function animateKpiCurrency(el, targetVal, curr, mode = 'smart', decimals = 0) {
    if (!el) return;
    const target = Number(targetVal);
    if (!Number.isFinite(target)) {
      el.textContent = '—';
      return;
    }

    const formatNumber = (val) => {
      const meta = FE.getCurrencyMeta(curr);
      const abs = Math.abs(val);
      const sign = val < 0 ? '-' : '';
      const prefix = `${sign}${meta.symbol}${meta.spaceAfterSymbol ? ' ' : ''}`;
      if (mode === 'smart' && abs >= 1e6) {
        return FE.formatCurrency(val, curr, { mode: 'smart' });
      }
      const fmt = new Intl.NumberFormat('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
      });
      return `${prefix}${fmt.format(decimals === 0 ? Math.round(abs) : abs)}`;
    };

    const gsap = root.gsap;
    if (!gsap) {
      el.textContent = formatNumber(target);
      return;
    }

    if (!el._kpiProxy || el._kpiCurr !== curr) {
      el._kpiProxy = { val: target * 0.85 };
      el._kpiCurr = curr;
    }
    if (el._kpiTween) el._kpiTween.kill();

    el._kpiTween = gsap.to(el._kpiProxy, {
      val: target,
      duration: 0.35,
      ease: 'power2.out',
      onUpdate: () => {
        el.textContent = formatNumber(el._kpiProxy.val);
      },
      onComplete: () => {
        el.textContent = formatNumber(target);
      }
    });
  }

  function updateRail(slider) {
    const min = Number(slider.min) || 0;
    const max = Number(slider.max) || 100;
    const val = Number(slider.value) || 0;
    const pct = max > min ? Math.max(0, Math.min(100, ((val - min) / (max - min)) * 100)) : 0;
    slider.style.setProperty('--pct', `${pct}%`);
  }

  function getMonthlyQuickPicks(currencyCode) {
    const meta = FE.getCurrencyMeta(currencyCode);
    const approx = (usdVal) => {
      const raw = FE.convertAmount(usdVal, 'USD', currencyCode, FE.getDefaultRates());
      const step = meta.sliderStepMonthly || 25;
      return Math.max(step, FE.roundForSlider(raw, step));
    };
    if (currencyCode === 'PKR') return [10000, 22500, 50000, 100000];
    if (currencyCode === 'USD' || currencyCode === 'EUR' || currencyCode === 'GBP') return [100, 250, 500, 1000];
    if (currencyCode === 'AED' || currencyCode === 'SAR' || currencyCode === 'QAR') return [500, 1000, 2500, 5000];
    return [approx(50), approx(100), approx(250), approx(500)];
  }

  function createSlider({ id, label, helper, helpDetail, value, min, max, step, prefix = '', suffix = '', decimals = 0, quickPicks = null, quickFormat = null, onChange }) {
    const effectiveMax = Math.max(max, Number(value) || 0);
    const wrap = document.createElement('div');
    wrap.className = 'slider-control';

    const labelRow = document.createElement('div');
    labelRow.className = 'slider-label-row';

    const lblWrap = document.createElement('div');
    lblWrap.className = 'slider-label-wrap';

    const lbl = document.createElement('label');
    lbl.className = 'slider-label';
    lbl.htmlFor = `${id}_input`;
    lbl.textContent = label;
    lblWrap.appendChild(lbl);

    let popoverEl = null;
    if (helpDetail) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'help-badge';
      btn.textContent = '?';
      btn.setAttribute('aria-label', `Explain ${label}`);
      btn.addEventListener('click', () => {
        if (popoverEl) popoverEl.classList.toggle('hidden');
      });
      lblWrap.appendChild(btn);
    }

    labelRow.appendChild(lblWrap);
    wrap.appendChild(labelRow);

    if (helpDetail) {
      popoverEl = document.createElement('div');
      popoverEl.className = 'help-popover hidden';
      popoverEl.textContent = helpDetail;
      wrap.appendChild(popoverEl);
    }

    if (helper) {
      const h = document.createElement('div');
      h.className = 'slider-helper-text';
      h.textContent = helper;
      wrap.appendChild(h);
    }

    const inputRow = document.createElement('div');
    inputRow.className = 'slider-input-row';

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.className = 'range-slider';
    slider.id = `${id}_slider`;
    slider.min = String(min);
    slider.max = String(effectiveMax);
    slider.step = String(step);
    slider.value = String(value);
    updateRail(slider);

    const pill = document.createElement('div');
    pill.className = 'value-pill-box';
    if (prefix) {
      const p = document.createElement('span');
      p.className = 'pill-affix';
      p.textContent = prefix;
      pill.appendChild(p);
    }

    const numInput = document.createElement('input');
    numInput.type = 'text';
    numInput.inputMode = 'decimal';
    numInput.className = 'pill-number-input';
    numInput.id = `${id}_input`;
    numInput.value = formatEditable(value, decimals);
    pill.appendChild(numInput);

    if (suffix) {
      const s = document.createElement('span');
      s.className = 'pill-affix';
      s.textContent = suffix;
      pill.appendChild(s);
    }

    function applyValue(nextVal) {
      if (nextVal > Number(slider.max)) slider.max = String(nextVal);
      slider.value = String(nextVal);
      numInput.value = formatEditable(nextVal, decimals);
      updateRail(slider);
      onChange(nextVal);
    }

    slider.addEventListener('input', () => {
      const next = Number(slider.value);
      numInput.value = formatEditable(next, decimals);
      updateRail(slider);
      onChange(next);
    });

    numInput.addEventListener('input', () => {
      const parsed = parseEditable(numInput.value);
      if (parsed === null) return;
      const clamped = Math.max(min, parsed);
      if (clamped > Number(slider.max)) slider.max = String(clamped);
      slider.value = String(clamped);
      updateRail(slider);
      onChange(clamped);
    });

    numInput.addEventListener('blur', () => {
      const parsed = parseEditable(numInput.value);
      const finalVal = parsed === null ? min : Math.max(min, parsed);
      applyValue(finalVal);
    });

    inputRow.appendChild(slider);
    inputRow.appendChild(pill);
    wrap.appendChild(inputRow);

    if (Array.isArray(quickPicks) && quickPicks.length > 0) {
      const row = document.createElement('div');
      row.className = 'quick-picks-row';
      quickPicks.forEach((qp) => {
        const qb = document.createElement('button');
        qb.type = 'button';
        qb.className = 'quick-pick-btn';
        qb.textContent = quickFormat ? quickFormat(qp) : String(qp);
        qb.addEventListener('click', () => applyValue(qp));
        row.appendChild(qb);
      });
      wrap.appendChild(row);
    }

    return wrap;
  }

  function renderLegend(el, items) {
    if (!el) return;
    el.innerHTML = items.map(
      (i) => `<div class="legend-item"><span class="legend-swatch" style="background:${i.color}"></span><span>${i.label}</span></div>`
    ).join('');
  }

  function attachCollapsibleLedger(hostEl, proj, curr, inflationFocus, tabTag) {
    if (!hostEl) return;
    let granularity = hostEl.dataset.granularity || 'yearly';
    let isOpen = hostEl.dataset.open === 'true';

    function draw() {
      const rows = granularity === 'monthly' && proj.monthlySeries.length <= 241
        ? proj.monthlySeries
        : proj.yearlySeries;

      const headers = inflationFocus
        ? ['Time', 'Cash You Put In', 'Account Value', 'Profit Earned', 'What It Buys Today', 'Lost to Rising Prices']
        : ['Time', 'Cash You Put In', 'Profit Earned', 'Total Value', 'What It Buys Today', 'Money Multiplied'];

      const csvRows = [];
      const tbodyRows = rows.map((pt, idx) => {
        const periodLabel = granularity === 'monthly'
          ? (pt.month === 0 ? 'Day 1' : `Month ${pt.month} (Yr ${(pt.month / 12).toFixed(1)})`)
          : (Math.round(pt.year) === 0 ? 'Day 1' : `After ${Math.round(pt.year)} ${Math.round(pt.year) === 1 ? 'Year' : 'Years'}`);
        const isLast = idx === rows.length - 1;
        const cashStr = FE.formatCurrency(pt.contributed, curr, { mode: 'exact' });
        const balStr = FE.formatCurrency(pt.balance, curr, { mode: 'exact' });
        const profStr = FE.formatCurrency(pt.profitEarned, curr, { mode: 'exact' });
        const realStr = FE.formatCurrency(pt.realBalance, curr, { mode: 'exact' });
        const eroStr = FE.formatCurrency(pt.inflationErosion, curr, { mode: 'exact' });
        const multStr = `${(pt.contributed > 0 ? pt.balance / pt.contributed : 1).toFixed(2)}x`;

        if (inflationFocus) {
          csvRows.push([periodLabel, Math.round(pt.contributed), Math.round(pt.balance), Math.round(pt.profitEarned), Math.round(pt.realBalance), Math.round(pt.inflationErosion)]);
          return `<tr class="${isLast ? 'final-row' : ''}"><td>${periodLabel}</td><td>${cashStr}</td><td>${balStr}</td><td class="${pt.profitEarned >= 0 ? 'chg-pos' : 'chg-neg'}">${profStr}</td><td class="chg-pos">${realStr}</td><td>${eroStr}</td></tr>`;
        }
        csvRows.push([periodLabel, Math.round(pt.contributed), Math.round(pt.profitEarned), Math.round(pt.balance), Math.round(pt.realBalance), multStr]);
        return `<tr class="${isLast ? 'final-row' : ''}"><td>${periodLabel}</td><td>${cashStr}</td><td class="${pt.profitEarned >= 0 ? 'chg-pos' : 'chg-neg'}">${profStr}</td><td>${balStr}</td><td>${realStr}</td><td>${multStr}</td></tr>`;
      }).join('');

      hostEl.innerHTML = `
        <div class="ledger-toggle-bar">
          <div>
            <h3 class="panel-title">See Every Number — Year by Year</h3>
            <p class="panel-sub">Open this whenever you want the full breakdown in ${curr}</p>
          </div>
          <div class="panel-actions">
            ${isOpen ? `
              <div class="format-toggle">
                <button type="button" class="fmt-btn ${granularity === 'yearly' ? 'active' : ''}" data-act="yr">By Year</button>
                <button type="button" class="fmt-btn ${granularity === 'monthly' ? 'active' : ''}" data-act="mo">By Month</button>
              </div>
              <button type="button" class="btn-ghost btn-sm" data-act="csv">Save CSV</button>
            ` : ''}
            <button type="button" class="btn-ghost" data-act="toggle">${isOpen ? 'Hide Table ▴' : 'Show Year-by-Year Table ▾'}</button>
          </div>
        </div>
        ${isOpen ? `
          <div class="table-scroll">
            <table class="numbers-table">
              <thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead>
              <tbody>${tbodyRows}</tbody>
            </table>
          </div>
        ` : ''}
      `;

      hostEl.querySelector('[data-act="toggle"]').addEventListener('click', () => {
        isOpen = !isOpen;
        hostEl.dataset.open = String(isOpen);
        draw();
      });

      const yrBtn = hostEl.querySelector('[data-act="yr"]');
      const moBtn = hostEl.querySelector('[data-act="mo"]');
      const csvBtn = hostEl.querySelector('[data-act="csv"]');
      if (yrBtn) yrBtn.addEventListener('click', () => { granularity = 'yearly'; hostEl.dataset.granularity = 'yearly'; draw(); });
      if (moBtn) moBtn.addEventListener('click', () => { granularity = 'monthly'; hostEl.dataset.granularity = 'monthly'; draw(); });
      if (csvBtn) csvBtn.addEventListener('click', () => {
        const csv = FE.buildCsv(headers, csvRows);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${tabTag}-${curr.toLowerCase()}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      });
    }

    draw();
  }

  /* ======================================================================
   * 1. SAVINGS CALCULATOR PAGE (index.html)
   * ====================================================================== */
  function initSavingsPage() {
    const defaults = {
      presetId: 'savings-screenshot',
      mode: 'grow', // 'grow' | 'goal'
      startingAmount: 30000,
      monthlyContribution: 22500,
      annualReturnPct: 10,
      annualInflationPct: 10,
      years: 3,
      targetGoalAmount: 3000000,
      moreOpen: false
    };
    const model = loadPageState('savings', defaults);

    const els = {
      modeGrow: document.getElementById('savModeGrow'),
      modeGoal: document.getElementById('savModeGoal'),
      goalBox: document.getElementById('savGoalBox'),
      goalTargetInput: document.getElementById('savGoalTargetInput'),
      goalCurrencyLabel: document.getElementById('savGoalCurrencyLabel'),
      goalResultText: document.getElementById('savGoalResultText'),
      goalApplyBtn: document.getElementById('savGoalApplyBtn'),
      title: document.getElementById('cardTitle'),
      meta: document.getElementById('cardMeta'),
      kpi1Val: document.getElementById('kpi1Value'),
      kpi1Lbl: document.getElementById('kpi1Label'),
      kpi1Sub: document.getElementById('kpi1Sub'),
      kpi2Val: document.getElementById('kpi2Value'),
      kpi2Lbl: document.getElementById('kpi2Label'),
      kpi2Sub: document.getElementById('kpi2Sub'),
      kpi3Val: document.getElementById('kpi3Value'),
      kpi3Lbl: document.getElementById('kpi3Label'),
      kpi3Sub: document.getElementById('kpi3Sub'),
      plainText: document.getElementById('plainEnglishText'),
      chartEl: document.getElementById('chartContainer'),
      tooltipEl: document.getElementById('chartTooltip'),
      legendEl: document.getElementById('chartLegend'),
      presetBar: document.getElementById('presetBar'),
      slidersGrid: document.getElementById('slidersGrid'),
      moreBtn: document.getElementById('moreOptionsBtn'),
      advDrawer: document.getElementById('advancedOptionsDrawer'),
      advGrid: document.getElementById('advancedSlidersGrid'),
      ledgerCard: document.getElementById('ledgerCard')
    };

    let shell;
    let lastChartCfg = null;

    function fmt(v, m) {
      return FE.formatCurrency(v, shell.state.currency, { mode: m || shell.state.formatMode });
    }

    function updateGoalDisplay() {
      const curr = shell.state.currency;
      els.goalCurrencyLabel.textContent = `Target amount (${curr})`;
      const needed = FE.calculateRequiredMonthlySavings({
        startingAmount: model.startingAmount,
        targetAmount: model.targetGoalAmount,
        annualReturnPct: model.annualReturnPct,
        years: model.years
      });
      els.goalResultText.textContent = `Save ${FE.formatCurrency(needed, curr, { mode: 'exact' })} / month`;
      return needed;
    }

    function renderOutputs(skipChart = false) {
      const curr = shell.state.currency;
      const proj = FE.projectGrowth(model);
      const s = proj.summary;
      const yrWord = model.years === 1 ? 'year' : 'years';

      els.title.textContent = `${model.years}-Year Savings vs. Inflation Purchasing Power`;
      els.meta.textContent = `Earning ${model.annualReturnPct}% per year, while everyday prices rise ${model.annualInflationPct}% per year`;

      const crossCurr = curr === 'USD' ? 'PKR' : 'USD';
      const crossFuture = FE.formatCurrency(FE.convertAmount(s.finalBalance, curr, crossCurr, shell.state.fxRates), crossCurr, { mode: shell.state.formatMode });

      animateKpiCurrency(els.kpi1Val, s.finalBalance, curr, shell.state.formatMode);
      els.kpi1Lbl.textContent = 'Future Account Balance';
      els.kpi1Sub.textContent = `You put in ${fmt(s.cashPutIn)} • Worth ${crossFuture}`;

      animateKpiCurrency(els.kpi2Val, s.realBuyingPower, curr, shell.state.formatMode);
      els.kpi2Lbl.textContent = "Today's Buying Power";
      els.kpi2Sub.textContent = 'What that money buys at today’s prices';

      animateKpiCurrency(els.kpi3Val, s.inflationErosion, curr, shell.state.formatMode);
      els.kpi3Lbl.textContent = 'Inflation Erosion';
      els.kpi3Sub.textContent = 'Buying power lost to rising prices';

      els.plainText.innerHTML = `You put in <strong>${fmt(s.cashPutIn, 'exact')}</strong> over <strong>${model.years} ${yrWord}</strong>. Your account grows to <strong>${fmt(s.finalBalance, 'exact')}</strong> — ${
        model.annualInflationPct > 0
          ? `but because prices rise ${model.annualInflationPct}% every year, it will only buy as much as <strong>${fmt(s.realBuyingPower, 'exact')}</strong> buys today.`
          : 'and with 0% inflation, your money keeps all of its buying power.'
      }`;

      updateGoalDisplay();

      lastChartCfg = {
        renderMode: shell.state.renderMode,
        xMode: 'years',
        yZeroBase: true,
        yAxisTitle: `Value in ${curr}`,
        xAxisTitle: 'Years',
        currencyCode: curr,
        years: model.years,
        series: [
          {
            id: 'future',
            label: `Account Balance (Future ${curr})`,
            shortLabel: 'Account Balance',
            color: '#E6C775',
            fillTop: true,
            fillTopOpacity: 0.24,
            fillBottomOpacity: 0.03,
            points: proj.monthlySeries.map((p) => ({ xYear: p.year, value: p.balance }))
          },
          {
            id: 'real',
            label: `Real Buying Power (Today's ${curr})`,
            shortLabel: 'What It Buys Today',
            color: '#34D399',
            fillTop: true,
            fillTopOpacity: 0.14,
            fillBottomOpacity: 0.01,
            points: proj.monthlySeries.map((p) => ({ xYear: p.year, value: p.realBalance }))
          }
        ]
      };

      renderLegend(els.legendEl, lastChartCfg.series);
      if (!skipChart) CR.renderChart(els.chartEl, els.tooltipEl, lastChartCfg, FE);
      attachCollapsibleLedger(els.ledgerCard, proj, curr, true, 'savings');
      savePageState('savings', model, curr);
    }

    function renderControls() {
      const curr = shell.state.currency;
      const meta = FE.getCurrencyMeta(curr);
      const prefix = meta.spaceAfterSymbol ? `${meta.symbol} ` : meta.symbol;
      const quickMonthly = getMonthlyQuickPicks(curr);

      els.slidersGrid.innerHTML = '';
      els.advGrid.innerHTML = '';

      els.slidersGrid.appendChild(createSlider({
        id: 'sav_monthly',
        label: 'Monthly money saved',
        helper: 'How much you add every month',
        helpDetail: 'Putting away a steady amount every month builds savings steadily over time.',
        value: model.monthlyContribution,
        min: 0,
        max: meta.sliderMaxMonthly,
        step: meta.sliderStepMonthly,
        prefix,
        quickPicks: quickMonthly,
        quickFormat: (v) => FE.formatCurrency(v, curr, { mode: 'compact' }),
        onChange: (v) => { model.presetId = null; model.monthlyContribution = v; renderOutputs(); }
      }));

      els.slidersGrid.appendChild(createSlider({
        id: 'sav_return',
        label: 'Yearly profit / interest (%)',
        helper: 'How much % your bank or savings fund pays per year',
        helpDetail: 'For example, 10% turns 100,000 into 110,000 over one year.',
        value: model.annualReturnPct,
        min: 0,
        max: 35,
        step: 0.25,
        decimals: 2,
        suffix: '%',
        quickPicks: [0, 5, 10, 13, 18],
        quickFormat: (v) => `${v}%`,
        onChange: (v) => { model.presetId = null; model.annualReturnPct = v; renderOutputs(); }
      }));

      els.slidersGrid.appendChild(createSlider({
        id: 'sav_inf',
        label: 'Yearly inflation — prices rising (%)',
        helper: 'How fast food, rent & bills get more expensive per year',
        helpDetail: 'Inflation means the same cash buys slightly less next year than today.',
        value: model.annualInflationPct,
        min: 0,
        max: 35,
        step: 0.25,
        decimals: 2,
        suffix: '%',
        quickPicks: [3, 7, 10, 15],
        quickFormat: (v) => `${v}%`,
        onChange: (v) => { model.presetId = null; model.annualInflationPct = v; renderOutputs(); }
      }));

      els.slidersGrid.appendChild(createSlider({
        id: 'sav_years',
        label: 'How many years',
        helper: 'How long you keep saving',
        value: model.years,
        min: 1,
        max: 40,
        step: 1,
        quickPicks: [1, 3, 5, 10, 20],
        quickFormat: (v) => `${v}y`,
        onChange: (v) => { model.presetId = null; model.years = v; renderOutputs(); }
      }));

      els.advGrid.appendChild(createSlider({
        id: 'sav_start',
        label: 'Starting money (already saved on Day 1)',
        helper: 'Optional amount you already have today',
        value: model.startingAmount,
        min: 0,
        max: meta.sliderMaxStart,
        step: meta.sliderStepStart,
        prefix,
        onChange: (v) => { model.presetId = null; model.startingAmount = v; renderOutputs(); }
      }));

      els.moreBtn.textContent = model.moreOpen ? 'Hide Starting Savings ▴' : 'Starting Savings / More ▾';
      els.advDrawer.classList.toggle('hidden', !model.moreOpen);

      // Presets
      els.presetBar.innerHTML = '';
      MD.TAB_PRESETS.savings.forEach((p) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `preset-pill ${model.presetId === p.id ? 'active' : ''}`;
        b.innerHTML = `<span>${p.label}</span><span class="preset-badge">${p.risk}</span>`;
        b.addEventListener('click', () => {
          model.presetId = p.id;
          model.startingAmount = curr === 'PKR' ? p.startingPkr : FE.roundForSlider(FE.convertAmount(p.startingPkr, 'PKR', curr, shell.state.fxRates), meta.sliderStepStart);
          model.monthlyContribution = curr === 'PKR' ? p.monthlyPkr : FE.roundForSlider(FE.convertAmount(p.monthlyPkr, 'PKR', curr, shell.state.fxRates), meta.sliderStepMonthly);
          model.annualReturnPct = p.returnPct;
          model.annualInflationPct = p.inflationPct;
          model.years = p.years;
          renderControls();
          renderOutputs();
        });
        els.presetBar.appendChild(b);
      });
    }

    function syncModeUi() {
      const isGoal = model.mode === 'goal';
      els.modeGrow.classList.toggle('active', !isGoal);
      els.modeGoal.classList.toggle('active', isGoal);
      els.goalBox.classList.toggle('hidden', !isGoal);
      els.goalTargetInput.value = String(model.targetGoalAmount);
    }

    shell = Shell.createSharedShell('savings', {
      onCurrencyChange(nextCurr, prevCurr, doConvert) {
        const meta = FE.getCurrencyMeta(nextCurr);
        if (doConvert) {
          model.startingAmount = FE.roundForSlider(FE.convertAmount(model.startingAmount, prevCurr, nextCurr, shell.state.fxRates), meta.sliderStepStart);
          model.monthlyContribution = FE.roundForSlider(FE.convertAmount(model.monthlyContribution, prevCurr, nextCurr, shell.state.fxRates), meta.sliderStepMonthly);
          model.targetGoalAmount = Math.round(FE.convertAmount(model.targetGoalAmount, prevCurr, nextCurr, shell.state.fxRates));
          els.goalTargetInput.value = String(model.targetGoalAmount);
        }
        renderControls();
        renderOutputs();
      },
      onFormatChange() { renderOutputs(true); },
      onRenderModeChange() {
        if (lastChartCfg) {
          lastChartCfg.renderMode = shell.state.renderMode;
          CR.renderChart(els.chartEl, els.tooltipEl, lastChartCfg, FE);
        }
      },
      onLiveUpdate() { renderOutputs(true); }
    });

    syncModelToShellCurrency(model, shell.state);

    shell.enableResetButton(() => {
      Object.assign(model, defaults, { savedCurrency: 'PKR' });
      syncModelToShellCurrency(model, shell.state);
      syncModeUi();
      renderControls();
      renderOutputs();
    });

    els.modeGrow.addEventListener('click', () => { model.mode = 'grow'; syncModeUi(); savePageState('savings', model); });
    els.modeGoal.addEventListener('click', () => { model.mode = 'goal'; syncModeUi(); updateGoalDisplay(); savePageState('savings', model); });
    els.moreBtn.addEventListener('click', () => {
      model.moreOpen = !model.moreOpen;
      els.moreBtn.textContent = model.moreOpen ? 'Hide Starting Savings ▴' : 'Starting Savings / More ▾';
      els.advDrawer.classList.toggle('hidden', !model.moreOpen);
      savePageState('savings', model);
    });
    els.goalTargetInput.addEventListener('input', () => {
      model.targetGoalAmount = Math.max(0, Number(els.goalTargetInput.value) || 0);
      updateGoalDisplay();
      savePageState('savings', model);
    });
    els.goalApplyBtn.addEventListener('click', () => {
      const needed = Math.round(updateGoalDisplay());
      model.monthlyContribution = needed;
      model.presetId = null;
      renderControls();
      renderOutputs();
    });

    window.addEventListener('resize', () => {
      if (lastChartCfg) CR.renderChart(els.chartEl, els.tooltipEl, lastChartCfg, FE);
    });

    syncModeUi();
    renderControls();
    renderOutputs();
  }

  /* ======================================================================
   * 2. PAKISTAN STOCKS (psx.html)
   * ====================================================================== */
  function initPsxPage() {
    const defaults = {
      presetId: 'psx-mm-baseline',
      startingAmount: 30000,
      monthlyContribution: 23500,
      annualReturnPct: 10,
      annualInflationPct: 10,
      years: 5,
      volatilitySpreadPct: 4,
      showRealLine: false,
      showBand: false,
      selectedStock: null
    };
    const model = loadPageState('psx', defaults);

    const els = {
      liveIndexStrip: document.getElementById('psxLiveStrip'),
      title: document.getElementById('cardTitle'),
      riskBadge: document.getElementById('riskBadge'),
      meta: document.getElementById('cardMeta'),
      useRealAvgBtn: document.getElementById('useRealPsxAvgBtn'),
      toggleRealBtn: document.getElementById('toggleRealLineBtn'),
      toggleBandBtn: document.getElementById('toggleBandBtn'),
      kpi1Val: document.getElementById('kpi1Value'),
      kpi1Lbl: document.getElementById('kpi1Label'),
      kpi1Sub: document.getElementById('kpi1Sub'),
      kpi2Val: document.getElementById('kpi2Value'),
      kpi2Lbl: document.getElementById('kpi2Label'),
      kpi2Sub: document.getElementById('kpi2Sub'),
      kpi3Val: document.getElementById('kpi3Value'),
      kpi3Lbl: document.getElementById('kpi3Label'),
      kpi3Sub: document.getElementById('kpi3Sub'),
      plainText: document.getElementById('plainEnglishText'),
      chartEl: document.getElementById('chartContainer'),
      tooltipEl: document.getElementById('chartTooltip'),
      legendEl: document.getElementById('chartLegend'),
      presetBar: document.getElementById('presetBar'),
      slidersGrid: document.getElementById('slidersGrid'),
      stocksSource: document.getElementById('psxStocksSource'),
      stocksGrid: document.getElementById('psxStocksGrid'),
      ledgerCard: document.getElementById('ledgerCard')
    };

    let shell;
    let lastChartCfg = null;

    function fmt(v, m) {
      return FE.formatCurrency(v, shell.state.currency, { mode: m || shell.state.formatMode });
    }

    function renderLivePsxSection() {
      const curr = shell.state.currency;
      const st = shell.state;
      els.stocksSource.textContent = st.sources.psx;

      if (!st.indices.KSE100) {
        els.liveIndexStrip.innerHTML = `<div class="market-quote-card"><div class="mq-sym">PSX Live Status</div><div class="mq-meta">${st.sources.psx}</div></div>`;
      } else {
        const cards = [];
        ['KSE100', 'KMI30', 'KSE30'].forEach((k) => {
          const idx = st.indices[k];
          if (!idx) return;
          const cls = idx.changePct >= 0 ? 'chg-pos' : 'chg-neg';
          const sign = idx.changePct >= 0 ? '▲ +' : '▼ ';
          cards.push(`
            <div class="market-quote-card">
              <div class="mq-top"><span class="mq-sym">${idx.symbol}</span><span class="${cls}">${sign}${idx.changePct.toFixed(2)}%</span></div>
              <div class="mq-name">${k === 'KSE100' ? 'Top 100 Companies Score' : k === 'KMI30' ? 'Top 30 Islamic Companies' : 'Top 30 Liquid Companies'}</div>
              <div class="mq-price">${idx.value.toLocaleString('en-US', { maximumFractionDigits: 2 })}</div>
              <div class="mq-meta">${idx.change >= 0 ? '+' : ''}${idx.change.toFixed(2)} pts today</div>
            </div>
          `);
        });
        if (st.psxMarketStatus) {
          const ms = st.psxMarketStatus;
          cards.push(`
            <div class="market-quote-card">
              <div class="mq-top"><span class="mq-sym">Market Status</span><span class="chg-flat">${ms.state}</span></div>
              <div class="mq-name">${ms.date} (${ms.time})</div>
              <div class="mq-price">${ms.advance ?? '-'} Up / ${ms.decline ?? '-'} Down</div>
              <div class="mq-meta">Live from dps.psx.com.pk</div>
            </div>
          `);
        }
        els.liveIndexStrip.innerHTML = cards.join('');
      }

      const stocks = st.equities.PSX || [];
      if (stocks.length === 0) {
        els.stocksGrid.innerHTML = `<div class="market-quote-card"><div class="mq-sym">Loading Live PSX Companies...</div><div class="mq-meta">${st.sources.psx}</div></div>`;
        return;
      }

      els.stocksGrid.innerHTML = '';
      stocks.forEach((s) => {
        const converted = FE.convertAmount(s.price, 'PKR', curr, st.fxRates);
        const cls = s.changePct >= 0 ? 'chg-pos' : 'chg-neg';
        const sign = s.changePct >= 0 ? '▲ +' : '▼ ';
        const card = document.createElement('div');
        card.className = `market-quote-card clickable ${model.selectedStock === s.symbol ? 'selected-asset' : ''}`;
        card.innerHTML = `
          <div class="mq-top"><span class="mq-sym">${s.symbol}</span><span class="${cls}">${sign}${s.changePct.toFixed(2)}% today</span></div>
          <div class="mq-name">${s.name}</div>
          <div class="mq-price">${FE.formatCurrency(converted, curr, { mode: 'exact', decimals: 2 })} / share</div>
          <div class="mq-meta">Real 1-Yr: ${s.change1Y !== null ? `${s.change1Y >= 0 ? '+' : ''}${s.change1Y.toFixed(1)}%` : 'N/A'} • Dividend: ${Number(s.divYield || 0).toFixed(1)}%</div>
        `;
        card.addEventListener('click', () => {
          const total1Y = Math.max(-30, Math.min(45, Number(((s.change1Y ?? 10) + (s.divYield ?? 0)).toFixed(1))));
          model.selectedStock = s.symbol;
          model.presetId = null;
          model.annualReturnPct = total1Y;
          renderControls();
          renderOutputs();
          renderLivePsxSection();
        });
        els.stocksGrid.appendChild(card);
      });
    }

    function renderOutputs(skipChart = false) {
      const curr = shell.state.currency;
      const scenarios = FE.projectWithScenarios(model, model.volatilitySpreadPct || 6);
      const proj = scenarios.base;
      const s = proj.summary;
      const yrWord = model.years === 1 ? 'year' : 'years';

      els.title.textContent = model.selectedStock
        ? `${model.years}-Year Simulation Based on ${model.selectedStock} (${model.annualReturnPct}%/yr)`
        : model.presetId === 'psx-mm-baseline'
          ? 'PSX & Money Market Growth Projection'
          : `${model.years}-Year Pakistan Stocks (PSX) Projection`;

      els.riskBadge.className = `risk-pill ${model.annualReturnPct <= 13 ? 'risk-low' : 'risk-med'}`;
      els.riskBadge.textContent = model.annualReturnPct <= 13 ? 'Low–Medium Risk • Cash/Blended' : 'Medium–High Risk • Company Shares';
      els.meta.textContent = `Assuming ${model.annualReturnPct}% yearly growth${shell.state.indices.KSE100 ? ` • Live KSE-100: ${shell.state.indices.KSE100.value.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : ''}`;

      animateKpiCurrency(els.kpi1Val, s.cashPutIn, curr, shell.state.formatMode);
      els.kpi1Lbl.textContent = 'Cash Put In';
      els.kpi1Sub.textContent = 'Your own money invested';

      animateKpiCurrency(els.kpi2Val, s.profitEarned, curr, shell.state.formatMode);
      els.kpi2Val.className = `kpi-value ${s.profitEarned >= 0 ? 'kpi-green' : 'kpi-red'}`;
      els.kpi2Lbl.textContent = s.profitEarned >= 0 ? 'Profit Earned' : 'Estimated Loss';
      els.kpi2Sub.textContent = `${s.totalReturnPct >= 0 ? '+' : ''}${s.totalReturnPct.toFixed(0)}% on cash put in`;

      animateKpiCurrency(els.kpi3Val, s.finalBalance, curr, shell.state.formatMode);
      els.kpi3Lbl.textContent = 'Final Total';
      els.kpi3Sub.textContent = `${s.multiple.toFixed(2)}x your money`;

      els.plainText.innerHTML = `You invest <strong>${fmt(s.cashPutIn, 'exact')}</strong> over <strong>${model.years} ${yrWord}</strong>. At ${model.annualReturnPct}% average yearly growth, you earn <strong>${fmt(s.profitEarned, 'exact')}</strong> in profit, ending with <strong>${fmt(s.finalBalance, 'exact')}</strong>.`;

      const series = [
        { id: 'portfolio', label: 'Projected Portfolio Value', shortLabel: 'Portfolio Value', color: '#E6C775', fillTop: true, fillTopOpacity: 0.24, fillBottomOpacity: 0.03, points: proj.monthlySeries.map((p) => ({ xYear: p.year, value: p.balance })) },
        { id: 'cash', label: 'Total Cash You Put In', shortLabel: 'Cash Put In', color: '#34D399', fillTop: true, fillTopOpacity: 0.14, fillBottomOpacity: 0.01, points: proj.monthlySeries.map((p) => ({ xYear: p.year, value: p.contributed })) }
      ];
      if (model.showRealLine) {
        series.push({ id: 'real', label: `What It Buys Today (${model.annualInflationPct}% inflation)`, shortLabel: 'Buying Power', color: '#7EA8F8', dashed: true, width: 2, points: proj.monthlySeries.map((p) => ({ xYear: p.year, value: p.realBalance })) });
      }

      lastChartCfg = {
        renderMode: shell.state.renderMode,
        xMode: 'years',
        yZeroBase: true,
        yAxisTitle: 'Total Savings Value',
        xAxisTitle: 'Years',
        currencyCode: curr,
        years: model.years,
        series,
        band: model.showBand ? {
          upper: scenarios.bull.monthlySeries.map((p) => ({ xYear: p.year, value: p.balance })),
          lower: scenarios.bear.monthlySeries.map((p) => ({ xYear: p.year, value: p.balance }))
        } : null
      };

      renderLegend(els.legendEl, series);
      if (!skipChart) CR.renderChart(els.chartEl, els.tooltipEl, lastChartCfg, FE);
      attachCollapsibleLedger(els.ledgerCard, proj, curr, false, 'psx');
      savePageState('psx', model, curr);
    }

    function renderControls() {
      const curr = shell.state.currency;
      const meta = FE.getCurrencyMeta(curr);
      const prefix = meta.spaceAfterSymbol ? `${meta.symbol} ` : meta.symbol;

      els.slidersGrid.innerHTML = '';
      els.slidersGrid.appendChild(createSlider({
        id: 'psx_start', label: 'Starting savings', helper: 'Cash you already have on Day 1',
        value: model.startingAmount, min: 0, max: meta.sliderMaxStart, step: meta.sliderStepStart, prefix,
        onChange: (v) => { model.presetId = null; model.startingAmount = v; renderOutputs(); }
      }));
      els.slidersGrid.appendChild(createSlider({
        id: 'psx_monthly', label: 'Monthly contribution', helper: 'Money you invest every month',
        value: model.monthlyContribution, min: 0, max: meta.sliderMaxMonthly, step: meta.sliderStepMonthly, prefix,
        quickPicks: getMonthlyQuickPicks(curr), quickFormat: (v) => FE.formatCurrency(v, curr, { mode: 'compact' }),
        onChange: (v) => { model.presetId = null; model.monthlyContribution = v; renderOutputs(); }
      }));
      els.slidersGrid.appendChild(createSlider({
        id: 'psx_return', label: 'Expected yearly return (%)', helper: 'Click any PSX stock card below to use its real 1-year return',
        value: model.annualReturnPct, min: -25, max: 45, step: 0.5, decimals: 1, suffix: '%',
        quickPicks: [10, 13, 16, 20], quickFormat: (v) => `${v}%`,
        onChange: (v) => { model.presetId = null; model.selectedStock = null; model.annualReturnPct = v; renderOutputs(); }
      }));
      els.slidersGrid.appendChild(createSlider({
        id: 'psx_years', label: 'How many years', helper: 'Time you stay invested',
        value: model.years, min: 1, max: 40, step: 1,
        quickPicks: [1, 3, 5, 10, 20], quickFormat: (v) => `${v}y`,
        onChange: (v) => { model.presetId = null; model.years = v; renderOutputs(); }
      }));

      els.presetBar.innerHTML = '';
      MD.TAB_PRESETS.psx.forEach((p) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `preset-pill ${model.presetId === p.id ? 'active' : ''}`;
        b.innerHTML = `<span>${p.label}</span><span class="preset-badge">${p.risk}</span>`;
        b.addEventListener('click', () => {
          model.presetId = p.id;
          model.selectedStock = null;
          model.startingAmount = curr === 'PKR' ? p.startingPkr : FE.roundForSlider(FE.convertAmount(p.startingPkr, 'PKR', curr, shell.state.fxRates), meta.sliderStepStart);
          model.monthlyContribution = curr === 'PKR' ? p.monthlyPkr : FE.roundForSlider(FE.convertAmount(p.monthlyPkr, 'PKR', curr, shell.state.fxRates), meta.sliderStepMonthly);
          model.annualReturnPct = p.returnPct;
          model.years = p.years;
          renderControls();
          renderOutputs();
          renderLivePsxSection();
        });
        els.presetBar.appendChild(b);
      });

      els.toggleRealBtn.classList.toggle('active', model.showRealLine);
      els.toggleBandBtn.classList.toggle('active', model.showBand);
    }

    shell = Shell.createSharedShell('psx', {
      onCurrencyChange(nextCurr, prevCurr, doConvert) {
        const meta = FE.getCurrencyMeta(nextCurr);
        if (doConvert) {
          model.startingAmount = FE.roundForSlider(FE.convertAmount(model.startingAmount, prevCurr, nextCurr, shell.state.fxRates), meta.sliderStepStart);
          model.monthlyContribution = FE.roundForSlider(FE.convertAmount(model.monthlyContribution, prevCurr, nextCurr, shell.state.fxRates), meta.sliderStepMonthly);
        }
        renderControls();
        renderOutputs();
        renderLivePsxSection();
      },
      onFormatChange() { renderOutputs(true); },
      onRenderModeChange() {
        if (lastChartCfg) {
          lastChartCfg.renderMode = shell.state.renderMode;
          CR.renderChart(els.chartEl, els.tooltipEl, lastChartCfg, FE);
        }
      },
      onLiveUpdate() { renderLivePsxSection(); renderOutputs(true); }
    });

    syncModelToShellCurrency(model, shell.state);

    shell.enableResetButton(() => {
      Object.assign(model, defaults, { savedCurrency: 'PKR' });
      syncModelToShellCurrency(model, shell.state);
      renderControls();
      renderOutputs();
      renderLivePsxSection();
    });

    els.useRealAvgBtn.addEventListener('click', () => {
      const stocks = (shell.state.equities.PSX || []).filter((s) => typeof s.change1Y === 'number');
      if (stocks.length === 0) return;
      const avg = stocks.reduce((sum, s) => sum + s.change1Y + (s.divYield || 0), 0) / stocks.length;
      model.annualReturnPct = Number(Math.max(-25, Math.min(45, avg)).toFixed(1));
      model.presetId = null;
      model.selectedStock = 'Top PSX Avg';
      renderControls();
      renderOutputs();
    });

    els.toggleRealBtn.addEventListener('click', () => { model.showRealLine = !model.showRealLine; els.toggleRealBtn.classList.toggle('active', model.showRealLine); renderOutputs(); });
    els.toggleBandBtn.addEventListener('click', () => { model.showBand = !model.showBand; els.toggleBandBtn.classList.toggle('active', model.showBand); renderOutputs(); });
    window.addEventListener('resize', () => { if (lastChartCfg) CR.renderChart(els.chartEl, els.tooltipEl, lastChartCfg, FE); });

    renderControls();
    renderOutputs();
    renderLivePsxSection();
  }

  /* ======================================================================
   * 3 & 4. LIVE MARKET + CALCULATOR PAGES (nasdaq.html & crypto.html)
   * ====================================================================== */
  function initMarketAndCalcPage(kind) {
    const isCrypto = kind === 'crypto';
    const defaults = isCrypto
      ? { view: 'live', symbol: 'BTC', range: '1y', startingAmount: 100000, monthlyContribution: 20000, annualReturnPct: 20, annualInflationPct: 9, years: 5, fxDriftPct: 4, volatilitySpreadPct: 18, showBand: false }
      : { view: 'live', symbol: '^NDX', range: '1y', startingAmount: 150000, monthlyContribution: 30000, annualReturnPct: 14, annualInflationPct: 3, years: 10, fxDriftPct: 4, volatilitySpreadPct: 8, showBand: false };

    const model = loadPageState(kind, defaults);

    const els = {
      viewLiveBtn: document.getElementById('viewLiveBtn'),
      viewCalcBtn: document.getElementById('viewCalcBtn'),
      rangeBar: document.getElementById('rangeBar'),
      symbolPills: document.getElementById('symbolPills'),
      title: document.getElementById('cardTitle'),
      riskBadge: document.getElementById('riskBadge'),
      meta: document.getElementById('cardMeta'),
      kpi1Val: document.getElementById('kpi1Value'),
      kpi1Lbl: document.getElementById('kpi1Label'),
      kpi1Sub: document.getElementById('kpi1Sub'),
      kpi2Val: document.getElementById('kpi2Value'),
      kpi2Lbl: document.getElementById('kpi2Label'),
      kpi2Sub: document.getElementById('kpi2Sub'),
      kpi3Val: document.getElementById('kpi3Value'),
      kpi3Lbl: document.getElementById('kpi3Label'),
      kpi3Sub: document.getElementById('kpi3Sub'),
      plainText: document.getElementById('plainEnglishText'),
      chartEl: document.getElementById('chartContainer'),
      tooltipEl: document.getElementById('chartTooltip'),
      legendEl: document.getElementById('chartLegend'),
      calcControlsWrap: document.getElementById('calcControlsWrap'),
      slidersGrid: document.getElementById('slidersGrid'),
      useHistBtn: document.getElementById('useHistReturnBtn'),
      watchSource: document.getElementById('watchSource'),
      watchGrid: document.getElementById('watchGrid'),
      ledgerCard: document.getElementById('ledgerCard')
    };

    let shell;
    let lastHist = null;
    let lastChartCfg = null;

    function fmt(v, m) {
      return FE.formatCurrency(v, shell.state.currency, { mode: m || shell.state.formatMode });
    }

    function getLiveSpotUsd(sym) {
      if (isCrypto) {
        return shell.state.cryptoPrices[sym] ? shell.state.cryptoPrices[sym].priceUsd : null;
      }
      const idx = Object.values(shell.state.indices).find((i) => i.symbol === sym);
      if (idx) return idx.value;
      const eq = (shell.state.equities.NASDAQ || []).find((s) => s.symbol === sym);
      return eq ? eq.price : null;
    }

    async function loadAndDrawHistory() {
      if (model.view !== 'live') return;
      const curr = shell.state.currency;
      els.chartEl.innerHTML = '<div class="chart-loading-state">Loading real live market history...</div>';
      const hist = await MD.fetchLiveHistory(kind, model.symbol, model.range);
      lastHist = hist;

      if (!hist || !hist.points || hist.points.length === 0) {
        killKpiTween(els.kpi1Val);
        killKpiTween(els.kpi2Val);
        killKpiTween(els.kpi3Val);
        els.kpi1Val.textContent = '—';
        els.kpi2Val.textContent = '—';
        els.kpi3Val.textContent = '—';
        els.plainText.innerHTML = isCrypto
          ? 'Could not reach Binance historical endpoint right now. Click <strong>↻</strong> at the top to retry.'
          : 'Live US Stock history requires running the local server (<strong>npm start</strong> or <strong>start.bat</strong>).';
        els.chartEl.innerHTML = `<div class="chart-loading-state">${els.plainText.innerHTML}</div>`;
        return;
      }

      drawLiveHistoryChart();
    }

    function drawLiveHistoryChart() {
      if (!lastHist || !lastHist.points || lastHist.points.length === 0 || model.view !== 'live') return;
      const curr = shell.state.currency;
      const isIndexScore = !isCrypto && model.symbol.startsWith('^');
      const liveSpot = getLiveSpotUsd(model.symbol);

      const convertedPts = lastHist.points.map((p) => ({
        x: p.time,
        value: isIndexScore ? p.value : FE.convertAmount(p.value, 'USD', curr, shell.state.fxRates)
      }));

      if (liveSpot && liveSpot > 0) {
        const lastConverted = isIndexScore ? liveSpot : FE.convertAmount(liveSpot, 'USD', curr, shell.state.fxRates);
        convertedPts[convertedPts.length - 1] = { x: Date.now(), value: lastConverted };
      }

      const first = convertedPts[0].value;
      const latest = convertedPts[convertedPts.length - 1].value;
      const pctChange = first > 0 ? ((latest - first) / first) * 100 : 0;

      els.title.textContent = isCrypto
        ? `${model.symbol} Live Real Price (${model.range.toUpperCase()}) in ${curr}`
        : `${model.symbol.replace('^', '')} Live Real Chart (${model.range.toUpperCase()})`;
      els.riskBadge.className = `risk-pill ${isCrypto ? 'risk-high' : 'risk-med'}`;
      els.riskBadge.textContent = isCrypto ? 'Live 1s Real-Time • High Swings' : 'Live Real Market Data';
      els.meta.textContent = `Source: ${lastHist.source} • Real prices (zero test data)`;

      killKpiTween(els.kpi1Val);
      killKpiTween(els.kpi2Val);
      killKpiTween(els.kpi3Val);
      els.kpi1Val.textContent = isIndexScore
        ? latest.toLocaleString('en-US', { maximumFractionDigits: 2 })
        : FE.formatCurrency(latest, curr, { mode: 'exact', decimals: latest < 100 ? 2 : 0 });
      els.kpi1Lbl.textContent = isIndexScore ? 'Current Index Score' : `1 ${model.symbol} Right Now`;
      els.kpi1Sub.textContent = isIndexScore ? 'NASDAQ points' : (curr === 'USD' ? 'Live USD price' : `≈ $${(liveSpot || lastHist.points[lastHist.points.length - 1].value).toLocaleString('en-US', { maximumFractionDigits: 2 })} USD`);

      els.kpi2Val.textContent = `${pctChange >= 0 ? '+' : ''}${pctChange.toFixed(2)}%`;
      els.kpi2Val.className = `kpi-value ${pctChange >= 0 ? 'kpi-green' : 'kpi-red'}`;
      els.kpi2Lbl.textContent = `Change (${model.range.toUpperCase()})`;
      els.kpi2Sub.textContent = `From ${isIndexScore ? first.toLocaleString('en-US', { maximumFractionDigits: 0 }) : FE.formatCurrency(first, curr, { mode: 'compact' })}`;

      els.kpi3Val.textContent = lastHist.annualizedCagrPct !== null ? `${lastHist.annualizedCagrPct >= 0 ? '+' : ''}${lastHist.annualizedCagrPct}% / yr` : `${convertedPts.length} pts`;
      els.kpi3Lbl.textContent = lastHist.annualizedCagrPct !== null ? 'Real Yearly Avg' : 'Data Points';
      els.kpi3Sub.textContent = lastHist.annualizedCagrPct !== null ? 'Measured from actual history' : `Range: ${model.range.toUpperCase()}`;

      els.plainText.innerHTML = `Real market check: <strong>${model.symbol.replace('^', '')}</strong> ${
        pctChange >= 0 ? `went up <strong>+${pctChange.toFixed(2)}%</strong>` : `dropped <strong>${pctChange.toFixed(2)}%</strong>`
      } over the last <strong>${model.range.toUpperCase()}</strong>. Switch to <strong>Future Calculator</strong> above to test monthly investing.`;

      lastChartCfg = {
        renderMode: shell.state.renderMode,
        xMode: 'datetime',
        yZeroBase: false,
        yAxisTitle: isIndexScore ? 'Index Points' : `Price in ${curr}`,
        xAxisTitle: 'Date / Time (Real Data)',
        currencyCode: isIndexScore ? null : curr,
        series: [{
          id: 'live',
          label: `${model.symbol.replace('^', '')} Real Market Price`,
          shortLabel: model.symbol.replace('^', ''),
          color: pctChange >= 0 ? '#34D399' : '#F87171',
          fillTop: true,
          fillTopOpacity: 0.2,
          fillBottomOpacity: 0.02,
          points: convertedPts
        }]
      };

      renderLegend(els.legendEl, lastChartCfg.series);
      CR.renderChart(els.chartEl, els.tooltipEl, lastChartCfg, FE);
    }

    function renderCalculatorView(skipChart = false) {
      if (model.view !== 'calc') return;
      const curr = shell.state.currency;
      const effectiveFx = curr === 'USD' ? 0 : (model.fxDriftPct || 0);
      const spotLocal = isCrypto && shell.state.cryptoPrices[model.symbol]
        ? FE.convertAmount(shell.state.cryptoPrices[model.symbol].priceUsd, 'USD', curr, shell.state.fxRates)
        : 0;

      const scenarios = FE.projectWithScenarios({ ...model, fxDriftPct: effectiveFx, assetUnitPrice: spotLocal }, model.volatilitySpreadPct);
      const proj = scenarios.base;
      const s = proj.summary;
      const yrWord = model.years === 1 ? 'year' : 'years';

      els.title.textContent = `${model.years}-Year ${model.symbol.replace('^', '')} Future Growth Calculator`;
      els.riskBadge.className = `risk-pill ${isCrypto ? 'risk-high' : 'risk-med'}`;
      els.riskBadge.textContent = isCrypto ? 'High Risk • Volatile Crypto' : 'Medium–High Risk • US Equities';
      els.meta.textContent = `Guess: ${model.annualReturnPct}%/yr${effectiveFx ? ` + ${effectiveFx}% USD boost` : ''}${spotLocal ? ` • Live 1 ${model.symbol} = ${FE.formatCurrency(spotLocal, curr, { mode: 'exact' })}` : ''}`;

      animateKpiCurrency(els.kpi1Val, s.cashPutIn, curr, shell.state.formatMode);
      els.kpi1Lbl.textContent = 'Cash Put In';
      els.kpi1Sub.textContent = 'Your own money added';

      animateKpiCurrency(els.kpi2Val, s.profitEarned, curr, shell.state.formatMode);
      els.kpi2Val.className = `kpi-value ${s.profitEarned >= 0 ? 'kpi-green' : 'kpi-red'}`;
      els.kpi2Lbl.textContent = s.profitEarned >= 0 ? 'Estimated Profit' : 'Estimated Loss';
      els.kpi2Sub.textContent = `${s.totalReturnPct >= 0 ? '+' : ''}${s.totalReturnPct.toFixed(0)}% on your cash`;

      animateKpiCurrency(els.kpi3Val, s.finalBalance, curr, shell.state.formatMode);
      els.kpi3Lbl.textContent = 'Estimated Final Total';
      els.kpi3Sub.textContent = isCrypto && spotLocal > 0 ? `Could collect ~${s.unitsAccumulated.toFixed(model.symbol === 'BTC' ? 4 : 2)} ${model.symbol}` : `${s.multiple.toFixed(2)}x cash put in`;

      els.plainText.innerHTML = `You put in <strong>${fmt(s.cashPutIn, 'exact')}</strong> over <strong>${model.years} ${yrWord}</strong>. If ${model.symbol.replace('^', '')} grows ~${model.annualReturnPct}% per year on average, you could end up with <strong>${fmt(s.finalBalance, 'exact')}</strong>.`;

      lastChartCfg = {
        renderMode: shell.state.renderMode,
        xMode: 'years',
        yZeroBase: true,
        yAxisTitle: `Value in ${curr}`,
        xAxisTitle: 'Years',
        currencyCode: curr,
        years: model.years,
        series: [
          { id: 'proj', label: 'Projected Value', shortLabel: 'Projected Value', color: '#E6C775', fillTop: true, fillTopOpacity: 0.24, fillBottomOpacity: 0.03, points: proj.monthlySeries.map((p) => ({ xYear: p.year, value: p.balance })) },
          { id: 'cash', label: 'Cash Put In', shortLabel: 'Cash Put In', color: '#34D399', fillTop: true, fillTopOpacity: 0.14, fillBottomOpacity: 0.01, points: proj.monthlySeries.map((p) => ({ xYear: p.year, value: p.contributed })) }
        ],
        band: model.showBand ? {
          upper: scenarios.bull.monthlySeries.map((p) => ({ xYear: p.year, value: p.balance })),
          lower: scenarios.bear.monthlySeries.map((p) => ({ xYear: p.year, value: p.balance }))
        } : null
      };

      renderLegend(els.legendEl, lastChartCfg.series);
      if (!skipChart) CR.renderChart(els.chartEl, els.tooltipEl, lastChartCfg, FE);
      attachCollapsibleLedger(els.ledgerCard, proj, curr, false, kind);
    }

    function renderCalcControls() {
      const curr = shell.state.currency;
      const meta = FE.getCurrencyMeta(curr);
      const prefix = meta.spaceAfterSymbol ? `${meta.symbol} ` : meta.symbol;

      els.slidersGrid.innerHTML = '';
      els.slidersGrid.appendChild(createSlider({
        id: `${kind}_start`, label: 'Starting money', helper: 'Amount on Day 1',
        value: model.startingAmount, min: 0, max: meta.sliderMaxStart, step: meta.sliderStepStart, prefix,
        onChange: (v) => { model.startingAmount = v; renderCalculatorView(); savePageState(kind, model); }
      }));
      els.slidersGrid.appendChild(createSlider({
        id: `${kind}_monthly`, label: 'Monthly amount you buy', helper: 'Steady monthly buying smooths out ups & downs',
        value: model.monthlyContribution, min: 0, max: meta.sliderMaxMonthly, step: meta.sliderStepMonthly, prefix,
        quickPicks: getMonthlyQuickPicks(curr), quickFormat: (v) => FE.formatCurrency(v, curr, { mode: 'compact' }),
        onChange: (v) => { model.monthlyContribution = v; renderCalculatorView(); savePageState(kind, model); }
      }));
      els.slidersGrid.appendChild(createSlider({
        id: `${kind}_ret`, label: 'Yearly growth guess (%)', helper: 'Can be positive OR negative (try negative to see risk)',
        value: model.annualReturnPct, min: -40, max: isCrypto ? 100 : 45, step: 1, decimals: 1, suffix: '%',
        quickPicks: isCrypto ? [-10, 10, 20, 35] : [8, 12, 14, 18], quickFormat: (v) => `${v}%`,
        onChange: (v) => { model.annualReturnPct = v; renderCalculatorView(); savePageState(kind, model); }
      }));
      els.slidersGrid.appendChild(createSlider({
        id: `${kind}_yrs`, label: 'How many years', helper: 'Longer time helps smooth bad years',
        value: model.years, min: 1, max: 30, step: 1,
        quickPicks: [1, 3, 5, 10, 20], quickFormat: (v) => `${v}y`,
        onChange: (v) => { model.years = v; renderCalculatorView(); savePageState(kind, model); }
      }));
    }

    function renderWatchlist() {
      const curr = shell.state.currency;
      const st = shell.state;
      els.watchSource.textContent = isCrypto ? st.sources.crypto : st.sources.nasdaq;

      const list = isCrypto
        ? Object.values(st.cryptoPrices).filter((c) => c.symbol !== 'USDT').map((c) => ({
          sym: c.symbol,
          name: c.name,
          priceText: FE.formatCurrency(FE.convertAmount(c.priceUsd, 'USD', curr, st.fxRates), curr, { mode: 'exact', decimals: c.priceUsd < 10 ? 2 : 0 }),
          chg: c.change24h,
          meta: `$${c.priceUsd.toLocaleString('en-US', { maximumFractionDigits: c.priceUsd < 10 ? 4 : 2 })} USD`
        }))
        : [
          ...['NDX', 'IXIC', 'SPX', 'QQQ'].map((k) => st.indices[k]).filter(Boolean).map((x) => ({
            sym: x.symbol,
            name: x.name,
            priceText: x.symbol === 'QQQ' ? FE.formatCurrency(FE.convertAmount(x.value, 'USD', curr, st.fxRates), curr, { mode: 'exact', decimals: 2 }) : `${x.value.toLocaleString('en-US', { maximumFractionDigits: 2 })} pts`,
            chg: x.changePct,
            meta: x.symbol === 'QQQ' ? `$${x.value.toFixed(2)} USD` : 'Live Index'
          })),
          ...(st.equities.NASDAQ || []).filter((s) => s.symbol !== 'QQQ').map((s) => ({
            sym: s.symbol,
            name: s.name,
            priceText: FE.formatCurrency(FE.convertAmount(s.price, 'USD', curr, st.fxRates), curr, { mode: 'exact', decimals: 2 }),
            chg: s.changePct,
            meta: `$${s.price.toFixed(2)} USD / share`
          }))
        ];

      if (list.length === 0) {
        els.watchGrid.innerHTML = `<div class="market-quote-card"><div class="mq-sym">Waiting for Live Feed...</div><div class="mq-meta">${els.watchSource.textContent}</div></div>`;
        return;
      }

      els.watchGrid.innerHTML = '';
      list.forEach((c) => {
        const card = document.createElement('div');
        card.className = `market-quote-card clickable ${model.symbol === c.sym ? 'selected-asset' : ''}`;
        const cls = c.chg >= 0 ? 'chg-pos' : 'chg-neg';
        const sign = c.chg >= 0 ? '▲ +' : '▼ ';
        card.innerHTML = `
          <div class="mq-top"><span class="mq-sym">${c.sym.replace('^', '')}</span><span class="${cls}">${sign}${Number(c.chg || 0).toFixed(2)}%</span></div>
          <div class="mq-name">${c.name}</div>
          <div class="mq-price">${c.priceText}</div>
          <div class="mq-meta">${c.meta}</div>
        `;
        card.addEventListener('click', () => {
          model.symbol = c.sym;
          syncViewUi();
          if (model.view === 'live') loadAndDrawHistory();
          else renderCalculatorView();
          renderWatchlist();
          savePageState(kind, model);
        });
        els.watchGrid.appendChild(card);
      });
    }

    function syncViewUi() {
      const isLive = model.view === 'live';
      els.viewLiveBtn.classList.toggle('active', isLive);
      els.viewCalcBtn.classList.toggle('active', !isLive);
      els.rangeBar.classList.toggle('hidden', !isLive);
      els.calcControlsWrap.classList.toggle('hidden', isLive);
      els.ledgerCard.classList.toggle('hidden', isLive);

      els.rangeBar.querySelectorAll('.toggle-chip').forEach((b) => {
        b.classList.toggle('active', b.dataset.range === model.range);
      });
      els.symbolPills.querySelectorAll('.toggle-chip').forEach((b) => {
        b.classList.toggle('active', b.dataset.sym === model.symbol);
      });
    }

    shell = Shell.createSharedShell(kind, {
      onCurrencyChange(nextCurr, prevCurr, doConvert) {
        const meta = FE.getCurrencyMeta(nextCurr);
        if (doConvert) {
          model.startingAmount = FE.roundForSlider(FE.convertAmount(model.startingAmount, prevCurr, nextCurr, shell.state.fxRates), meta.sliderStepStart);
          model.monthlyContribution = FE.roundForSlider(FE.convertAmount(model.monthlyContribution, prevCurr, nextCurr, shell.state.fxRates), meta.sliderStepMonthly);
        }
        renderCalcControls();
        if (model.view === 'live') drawLiveHistoryChart();
        else renderCalculatorView();
        renderWatchlist();
      },
      onFormatChange() {
        if (model.view === 'live') drawLiveHistoryChart();
        else renderCalculatorView(true);
      },
      onRenderModeChange() {
        if (lastChartCfg) {
          lastChartCfg.renderMode = shell.state.renderMode;
          CR.renderChart(els.chartEl, els.tooltipEl, lastChartCfg, FE);
        }
      },
      onLiveUpdate() {
        renderWatchlist();
        if (model.view === 'live') {
          if (shell.state.renderMode !== '3d') drawLiveHistoryChart();
        } else {
          renderCalculatorView(true);
        }
      }
    });

    syncModelToShellCurrency(model, shell.state);

    shell.enableResetButton(() => {
      Object.assign(model, defaults, { savedCurrency: 'PKR' });
      syncModelToShellCurrency(model, shell.state);
      syncViewUi();
      renderCalcControls();
      if (model.view === 'live') loadAndDrawHistory();
      else renderCalculatorView();
      renderWatchlist();
    });

    els.viewLiveBtn.addEventListener('click', () => { model.view = 'live'; syncViewUi(); loadAndDrawHistory(); savePageState(kind, model); });
    els.viewCalcBtn.addEventListener('click', () => { model.view = 'calc'; syncViewUi(); renderCalcControls(); renderCalculatorView(); savePageState(kind, model); });

    els.rangeBar.addEventListener('click', (e) => {
      const b = e.target.closest('[data-range]');
      if (!b) return;
      model.range = b.dataset.range;
      syncViewUi();
      loadAndDrawHistory();
      savePageState(kind, model);
    });

    els.symbolPills.addEventListener('click', (e) => {
      const b = e.target.closest('[data-sym]');
      if (!b) return;
      model.symbol = b.dataset.sym;
      syncViewUi();
      if (model.view === 'live') loadAndDrawHistory();
      else renderCalculatorView();
      renderWatchlist();
      savePageState(kind, model);
    });

    els.useHistBtn.addEventListener('click', async () => {
      const orig = els.useHistBtn.textContent;
      els.useHistBtn.textContent = 'Fetching 5-Yr Real Avg...';
      const hist = await MD.fetchLiveHistory(kind, model.symbol, '5y');
      if (hist && typeof hist.annualizedCagrPct === 'number') {
        model.annualReturnPct = Math.max(-40, Math.min(isCrypto ? 100 : 45, hist.annualizedCagrPct));
        renderCalcControls();
        renderCalculatorView();
        savePageState(kind, model, shell.state.currency);
        els.useHistBtn.textContent = `Applied ${model.annualReturnPct}%/yr ✓`;
      } else {
        els.useHistBtn.textContent = '5-Yr data unavailable';
      }
      setTimeout(() => { els.useHistBtn.textContent = orig; }, 1800);
    });

    window.addEventListener('resize', () => {
      if (lastChartCfg) CR.renderChart(els.chartEl, els.tooltipEl, lastChartCfg, FE);
    });

    syncViewUi();
    renderCalcControls();
    renderWatchlist();
    if (model.view === 'live') loadAndDrawHistory();
    else renderCalculatorView();
  }

  /* ======================================================================
   * 5. CURRENCIES & LIVE FX PAGE (currencies.html)
   * ====================================================================== */
  function initCurrenciesPage() {
    const model = loadPageState('currencies', { amount: 100000, fromCurrency: 'PKR', chartTarget: 'PKR', chartBase: 'USD', range: '1y' });
    const els = {
      amountInput: document.getElementById('fxAmountInput'),
      fromSelect: document.getElementById('fxFromSelect'),
      swapBtn: document.getElementById('fxSwapPkrBtn'),
      sourceBadge: document.getElementById('fxSourceBadge'),
      cardsGrid: document.getElementById('fxCardsGrid'),
      pairPills: document.getElementById('fxPairPills'),
      rangeBar: document.getElementById('fxRangeBar'),
      chartTitle: document.getElementById('fxChartTitle'),
      chartMeta: document.getElementById('fxChartMeta'),
      chartEl: document.getElementById('fxChartContainer'),
      tooltipEl: document.getElementById('fxChartTooltip')
    };

    els.fromSelect.innerHTML = FE.CURRENCIES.map((c) => `<option value="${c.code}">${c.code} — ${c.name}</option>`).join('');
    els.fromSelect.value = model.fromCurrency;
    els.amountInput.value = String(model.amount);

    let shell;
    let lastHist = null;
    let lastChartCfg = null;

    function renderGrid() {
      const amount = Math.max(0, Number(model.amount) || 0);
      const from = model.fromCurrency;
      els.sourceBadge.textContent = shell.state.sources.fx;

      els.cardsGrid.innerHTML = '';
      FE.CURRENCIES.forEach((c) => {
        const converted = FE.convertAmount(amount, from, c.code, shell.state.fxRates);
        const unit = FE.convertAmount(1, from, c.code, shell.state.fxRates);
        const chg = shell.state.fxChanges[c.code] ?? 0;
        const dec = converted > 0 && converted < 100 ? 2 : 0;

        const card = document.createElement('div');
        card.className = `fx-card ${c.code === shell.state.currency ? 'selected' : ''}`;
        card.innerHTML = `
          <div class="fx-card-top">
            <span class="fx-code">${c.code}</span>
            <span class="${chg > 0.001 ? 'chg-pos' : chg < -0.001 ? 'chg-neg' : 'chg-flat'}">${c.code === 'USD' ? 'Global Base' : `${chg > 0 ? '+' : ''}${Number(chg).toFixed(2)}%`}</span>
          </div>
          <div class="fx-name">${c.name} (${c.region})</div>
          <div class="fx-converted">${FE.formatCurrency(converted, c.code, { mode: 'exact', decimals: dec })}</div>
          <div class="fx-unit-rate">1 ${from} = ${unit.toFixed(unit >= 10 ? 2 : 4)} ${c.code}</div>
        `;
        card.addEventListener('click', () => {
          shell.changeCurrency(c.code);
          renderGrid();
        });
        els.cardsGrid.appendChild(card);
      });
    }

    async function loadFxHistory() {
      els.chartEl.innerHTML = '<div class="chart-loading-state">Loading live exchange rate history...</div>';
      const sym = model.chartBase === 'USD' ? `${model.chartTarget}=X` : `${model.chartBase}=X`;
      const hist = await MD.fetchLiveHistory('fx', sym, model.range);
      lastHist = hist;

      if (!hist || !hist.points || hist.points.length === 0) {
        els.chartEl.innerHTML = '<div class="chart-loading-state">Live exchange rate history requires running the local server (<strong>npm start</strong>).</div>';
        return;
      }

      drawFxHistory();
    }

    function drawFxHistory() {
      if (!lastHist || !lastHist.points || lastHist.points.length === 0) return;
      const pts = lastHist.points.map((p) => {
        if (model.chartBase === 'USD') return { x: p.time, value: p.value };
        // Convert base -> target via USD rate
        const baseToUsd = p.value > 0 ? 1 / p.value : 0;
        const targetPerUsd = shell.state.fxRates[model.chartTarget] || 1;
        return { x: p.time, value: baseToUsd * targetPerUsd };
      });

      const first = pts[0].value;
      const latest = pts[pts.length - 1].value;
      const chg = first > 0 ? ((latest - first) / first) * 100 : 0;

      els.chartTitle.textContent = `Live Exchange Rate: 1 ${model.chartBase} in ${model.chartTarget} (${model.range.toUpperCase()})`;
      els.chartMeta.textContent = `Today: 1 ${model.chartBase} = ${latest.toFixed(2)} ${model.chartTarget} (${chg >= 0 ? '+' : ''}${chg.toFixed(2)}% over ${model.range.toUpperCase()})`;

      lastChartCfg = {
        renderMode: shell.state.renderMode,
        xMode: 'datetime',
        yZeroBase: false,
        isFxRate: true,
        yAxisTitle: `1 ${model.chartBase} in ${model.chartTarget}`,
        xAxisTitle: 'Date (Live Market)',
        currencyCode: model.chartTarget,
        series: [{
          id: 'fx',
          label: `1 ${model.chartBase} in ${model.chartTarget}`,
          shortLabel: `${model.chartBase}/${model.chartTarget}`,
          color: '#E6C775',
          fillTop: true,
          fillTopOpacity: 0.22,
          fillBottomOpacity: 0.02,
          points: pts
        }]
      };
      CR.renderChart(els.chartEl, els.tooltipEl, lastChartCfg, FE);
    }

    shell = Shell.createSharedShell('currencies', {
      onCurrencyChange() { renderGrid(); },
      onRenderModeChange() {
        if (lastChartCfg) {
          lastChartCfg.renderMode = shell.state.renderMode;
          CR.renderChart(els.chartEl, els.tooltipEl, lastChartCfg, FE);
        }
      },
      onLiveUpdate() { renderGrid(); if (shell.state.renderMode !== '3d') drawFxHistory(); }
    });

    els.amountInput.addEventListener('input', () => {
      model.amount = Math.max(0, Number(els.amountInput.value) || 0);
      renderGrid();
      savePageState('currencies', model);
    });

    els.fromSelect.addEventListener('change', () => {
      model.fromCurrency = els.fromSelect.value;
      renderGrid();
      savePageState('currencies', model);
    });

    els.swapBtn.addEventListener('click', () => {
      if (model.fromCurrency === 'USD') {
        model.fromCurrency = 'PKR';
        model.amount = 100000;
        els.swapBtn.textContent = 'Switch to 1,000 USD';
      } else {
        model.fromCurrency = 'USD';
        model.amount = 1000;
        els.swapBtn.textContent = 'Switch to 100k PKR';
      }
      els.fromSelect.value = model.fromCurrency;
      els.amountInput.value = String(model.amount);
      renderGrid();
      savePageState('currencies', model);
    });

    els.pairPills.addEventListener('click', (e) => {
      const b = e.target.closest('[data-pair]');
      if (!b) return;
      const [base, target] = b.dataset.pair.split(':');
      model.chartBase = base;
      model.chartTarget = target;
      els.pairPills.querySelectorAll('.toggle-chip').forEach((c) => c.classList.toggle('active', c === b));
      loadFxHistory();
      savePageState('currencies', model);
    });

    els.rangeBar.addEventListener('click', (e) => {
      const b = e.target.closest('[data-range]');
      if (!b) return;
      model.range = b.dataset.range;
      els.rangeBar.querySelectorAll('.toggle-chip').forEach((c) => c.classList.toggle('active', c === b));
      loadFxHistory();
      savePageState('currencies', model);
    });

    window.addEventListener('resize', () => { if (lastChartCfg) CR.renderChart(els.chartEl, els.tooltipEl, lastChartCfg, FE); });

    renderGrid();
    loadFxHistory();
  }

  /* ======================================================================
   * 6. COMPARE EVERYTHING PAGE (compare.html)
   * ====================================================================== */
  function initComparePage() {
    const defaults = {
      startingAmount: 100000,
      monthlyContribution: 25000,
      annualInflationPct: 9,
      years: 10,
      savingsReturnPct: 11,
      psxReturnPct: 16,
      nasdaqReturnPct: 14,
      cryptoReturnPct: 22,
      usdFxDriftPct: 4,
      weights: { savings: 25, psx: 30, nasdaq: 30, crypto: 15 }
    };
    const model = loadPageState('compare', defaults);

    const els = {
      title: document.getElementById('cardTitle'),
      meta: document.getElementById('cardMeta'),
      kpi1Val: document.getElementById('kpi1Value'),
      kpi1Lbl: document.getElementById('kpi1Label'),
      kpi1Sub: document.getElementById('kpi1Sub'),
      kpi2Val: document.getElementById('kpi2Value'),
      kpi2Lbl: document.getElementById('kpi2Label'),
      kpi2Sub: document.getElementById('kpi2Sub'),
      kpi3Val: document.getElementById('kpi3Value'),
      kpi3Lbl: document.getElementById('kpi3Label'),
      kpi3Sub: document.getElementById('kpi3Sub'),
      plainText: document.getElementById('plainEnglishText'),
      chartEl: document.getElementById('chartContainer'),
      tooltipEl: document.getElementById('chartTooltip'),
      legendEl: document.getElementById('chartLegend'),
      slidersGrid: document.getElementById('slidersGrid'),
      mixerGrid: document.getElementById('mixerGrid'),
      blendBadge: document.getElementById('mixerBlendedRateBadge'),
      normBtn: document.getElementById('normalizeWeightsBtn'),
      starterMixBar: document.getElementById('starterMixBar'),
      applyLiveBtn: document.getElementById('applyLiveReturnsBtn')
    };

    let shell;
    let lastChartCfg = null;

    function fmt(v, m) {
      return FE.formatCurrency(v, shell.state.currency, { mode: m || shell.state.formatMode });
    }

    function renderOutputs() {
      const curr = shell.state.currency;
      const fxDrift = curr === 'USD' ? 0 : model.usdFxDriftPct;
      const blend = FE.computeBlendedPortfolio(
        [
          { key: 'savings', label: 'Savings', weight: model.weights.savings, fxDriftPct: 0 },
          { key: 'psx', label: 'PSX', weight: model.weights.psx, fxDriftPct: 0 },
          { key: 'nasdaq', label: 'NASDAQ', weight: model.weights.nasdaq, fxDriftPct: fxDrift },
          { key: 'crypto', label: 'Crypto', weight: model.weights.crypto, fxDriftPct: fxDrift }
        ],
        { savings: model.savingsReturnPct, psx: model.psxReturnPct, nasdaq: model.nasdaqReturnPct, crypto: model.cryptoReturnPct }
      );

      els.blendBadge.textContent = `Average Growth: ${blend.blendedReturnPct.toFixed(1)}% / year`;

      const multi = FE.projectMultiMarket(
        { startingAmount: model.startingAmount, monthlyContribution: model.monthlyContribution, annualInflationPct: model.annualInflationPct, years: model.years },
        [
          { key: 'savings', label: 'Safe Savings', annualReturnPct: model.savingsReturnPct },
          { key: 'psx', label: 'Pakistan Stocks', annualReturnPct: model.psxReturnPct },
          { key: 'nasdaq', label: 'US Tech Stocks', annualReturnPct: model.nasdaqReturnPct, fxDriftPct: fxDrift },
          { key: 'crypto', label: 'Crypto', annualReturnPct: model.cryptoReturnPct, fxDriftPct: fxDrift },
          { key: 'blended', label: 'Your Mixed Plan', annualReturnPct: blend.blendedReturnPct }
        ]
      );

      const bSum = multi.blended.projection.summary;
      const top = [
        { name: 'Savings', v: multi.savings.projection.summary.finalBalance },
        { name: 'Pakistan Stocks', v: multi.psx.projection.summary.finalBalance },
        { name: 'US Stocks', v: multi.nasdaq.projection.summary.finalBalance },
        { name: 'Crypto', v: multi.crypto.projection.summary.finalBalance }
      ].sort((a, b) => b.v - a.v)[0];

      els.title.textContent = `${model.years}-Year Comparison: Savings vs. PSX vs. NASDAQ vs. Crypto`;
      els.meta.textContent = `Same starting money (${fmt(model.startingAmount)}) and monthly savings (${fmt(model.monthlyContribution)}) across all 4`;

      animateKpiCurrency(els.kpi1Val, bSum.cashPutIn, curr, shell.state.formatMode);
      els.kpi1Lbl.textContent = 'Cash Put In';
      els.kpi1Sub.textContent = 'Your total cash added';

      animateKpiCurrency(els.kpi2Val, bSum.profitEarned, curr, shell.state.formatMode);
      els.kpi2Lbl.textContent = 'Your Mixed Profit';
      els.kpi2Sub.textContent = `Buys ${fmt(bSum.realBuyingPower)} at today’s prices`;

      animateKpiCurrency(els.kpi3Val, bSum.finalBalance, curr, shell.state.formatMode);
      els.kpi3Lbl.textContent = 'Your Mixed Total';
      els.kpi3Sub.textContent = `Biggest market: ${top.name}`;

      els.plainText.innerHTML = `Putting the exact same money into each option for <strong>${model.years} years</strong>: <strong>${top.name}</strong> finishes highest at <strong>${fmt(top.v, 'exact')}</strong> (highest swings), while spreading your money across all 4 ends at <strong>${fmt(bSum.finalBalance, 'exact')}</strong>.`;

      lastChartCfg = {
        renderMode: shell.state.renderMode,
        xMode: 'years',
        yZeroBase: true,
        yAxisTitle: `Value in ${curr}`,
        xAxisTitle: 'Years',
        currencyCode: curr,
        years: model.years,
        series: [
          { id: 'blended', label: `Your Mix (${blend.blendedReturnPct}%)`, shortLabel: 'Your Mix', color: '#E6C775', fillTop: true, fillTopOpacity: 0.22, fillBottomOpacity: 0.02, width: 2.5, points: multi.blended.projection.monthlySeries.map((p) => ({ xYear: p.year, value: p.balance })) },
          { id: 'crypto', label: `Crypto (${model.cryptoReturnPct}%)`, shortLabel: 'Crypto', color: '#B392F0', width: 1.9, points: multi.crypto.projection.monthlySeries.map((p) => ({ xYear: p.year, value: p.balance })) },
          { id: 'nasdaq', label: `NASDAQ (${model.nasdaqReturnPct}%)`, shortLabel: 'US Stocks', color: '#7EA8F8', width: 1.9, points: multi.nasdaq.projection.monthlySeries.map((p) => ({ xYear: p.year, value: p.balance })) },
          { id: 'psx', label: `PSX (${model.psxReturnPct}%)`, shortLabel: 'Pakistan Stocks', color: '#2DD4BF', width: 1.9, points: multi.psx.projection.monthlySeries.map((p) => ({ xYear: p.year, value: p.balance })) },
          { id: 'savings', label: `Savings (${model.savingsReturnPct}%)`, shortLabel: 'Savings', color: '#9CA3AF', width: 1.7, points: multi.savings.projection.monthlySeries.map((p) => ({ xYear: p.year, value: p.balance })) },
          { id: 'cash', label: 'Cash Put In', shortLabel: 'Cash Put In', color: '#34D399', dashed: true, width: 1.8, points: multi.blended.projection.monthlySeries.map((p) => ({ xYear: p.year, value: p.contributed })) }
        ]
      };

      renderLegend(els.legendEl, lastChartCfg.series);
      CR.renderChart(els.chartEl, els.tooltipEl, lastChartCfg, FE);
      savePageState('compare', model, curr);
    }

    function renderControls() {
      const curr = shell.state.currency;
      const meta = FE.getCurrencyMeta(curr);
      const prefix = meta.spaceAfterSymbol ? `${meta.symbol} ` : meta.symbol;

      els.slidersGrid.innerHTML = '';
      els.slidersGrid.appendChild(createSlider({
        id: 'cmp_start', label: 'Starting money', helper: 'Cash on Day 1',
        value: model.startingAmount, min: 0, max: meta.sliderMaxStart, step: meta.sliderStepStart, prefix,
        onChange: (v) => { model.startingAmount = v; renderOutputs(); }
      }));
      els.slidersGrid.appendChild(createSlider({
        id: 'cmp_monthly', label: 'Monthly money added', helper: 'Invested each month',
        value: model.monthlyContribution, min: 0, max: meta.sliderMaxMonthly, step: meta.sliderStepMonthly, prefix,
        quickPicks: getMonthlyQuickPicks(curr), quickFormat: (v) => FE.formatCurrency(v, curr, { mode: 'compact' }),
        onChange: (v) => { model.monthlyContribution = v; renderOutputs(); }
      }));
      els.slidersGrid.appendChild(createSlider({
        id: 'cmp_years', label: 'How many years', helper: 'Longer time lowers short-term risk',
        value: model.years, min: 1, max: 40, step: 1,
        quickPicks: [3, 5, 10, 15, 20], quickFormat: (v) => `${v}y`,
        onChange: (v) => { model.years = v; renderOutputs(); }
      }));
      els.slidersGrid.appendChild(createSlider({
        id: 'cmp_inf', label: 'Yearly rising prices (%)', helper: 'Inflation benchmark',
        value: model.annualInflationPct, min: 0, max: 35, step: 0.5, decimals: 1, suffix: '%',
        onChange: (v) => { model.annualInflationPct = v; renderOutputs(); }
      }));

      els.mixerGrid.innerHTML = '';
      [
        { key: 'savings', label: 'Safe Savings / Bank (%)', helper: 'Very steady' },
        { key: 'psx', label: 'Pakistan Stocks — PSX (%)', helper: 'Local shares' },
        { key: 'nasdaq', label: 'US Tech Stocks — NASDAQ (%)', helper: 'Global big tech' },
        { key: 'crypto', label: 'Crypto (%)', helper: 'Highest swings' }
      ].forEach((b) => {
        els.mixerGrid.appendChild(createSlider({
          id: `mix_${b.key}`, label: b.label, helper: b.helper,
          value: model.weights[b.key], min: 0, max: 100, step: 5, suffix: '%',
          onChange: (v) => { model.weights[b.key] = v; renderOutputs(); }
        }));
      });
    }

    shell = Shell.createSharedShell('compare', {
      onCurrencyChange(nextCurr, prevCurr, doConvert) {
        const meta = FE.getCurrencyMeta(nextCurr);
        if (doConvert) {
          model.startingAmount = FE.roundForSlider(FE.convertAmount(model.startingAmount, prevCurr, nextCurr, shell.state.fxRates), meta.sliderStepStart);
          model.monthlyContribution = FE.roundForSlider(FE.convertAmount(model.monthlyContribution, prevCurr, nextCurr, shell.state.fxRates), meta.sliderStepMonthly);
        }
        renderControls();
        renderOutputs();
      },
      onFormatChange() { renderOutputs(); },
      onRenderModeChange() {
        if (lastChartCfg) {
          lastChartCfg.renderMode = shell.state.renderMode;
          CR.renderChart(els.chartEl, els.tooltipEl, lastChartCfg, FE);
        }
      }
    });

    syncModelToShellCurrency(model, shell.state);

    shell.enableResetButton(() => {
      Object.assign(model, defaults, { savedCurrency: 'PKR' });
      syncModelToShellCurrency(model, shell.state);
      renderControls();
      renderOutputs();
    });

    els.starterMixBar.addEventListener('click', (e) => {
      const b = e.target.closest('[data-mix]');
      if (!b) return;
      const [s, p, n, c] = b.dataset.mix.split(',').map(Number);
      model.weights = { savings: s, psx: p, nasdaq: n, crypto: c };
      renderControls();
      renderOutputs();
    });

    els.normBtn.addEventListener('click', () => {
      const w = model.weights;
      const t = w.savings + w.psx + w.nasdaq + w.crypto;
      if (t <= 0) { w.savings = 25; w.psx = 25; w.nasdaq = 25; w.crypto = 25; }
      else {
        w.savings = Math.round((w.savings / t) * 100);
        w.psx = Math.round((w.psx / t) * 100);
        w.nasdaq = Math.round((w.nasdaq / t) * 100);
        w.crypto = Math.max(0, 100 - w.savings - w.psx - w.nasdaq);
      }
      renderControls();
      renderOutputs();
    });

    els.applyLiveBtn.addEventListener('click', async () => {
      els.applyLiveBtn.textContent = 'Fetching live 1Y returns...';
      const [ndxHist, btcHist] = await Promise.all([
        MD.fetchLiveHistory('nasdaq', '^NDX', '5y'),
        MD.fetchLiveHistory('crypto', 'BTC', '5y')
      ]);
      const psxStocks = (shell.state.equities.PSX || []).filter((s) => typeof s.change1Y === 'number');
      if (psxStocks.length > 0) {
        const avg = psxStocks.reduce((sum, s) => sum + s.change1Y + (s.divYield || 0), 0) / psxStocks.length;
        model.psxReturnPct = Number(Math.max(-10, Math.min(45, avg)).toFixed(1));
      }
      if (ndxHist && typeof ndxHist.annualizedCagrPct === 'number') model.nasdaqReturnPct = ndxHist.annualizedCagrPct;
      if (btcHist && typeof btcHist.annualizedCagrPct === 'number') model.cryptoReturnPct = btcHist.annualizedCagrPct;
      els.applyLiveBtn.textContent = 'Applied Live Returns ✓';
      setTimeout(() => { els.applyLiveBtn.textContent = 'Use Real Live Returns'; }, 2000);
      renderOutputs();
    });

    window.addEventListener('resize', () => { if (lastChartCfg) CR.renderChart(els.chartEl, els.tooltipEl, lastChartCfg, FE); });

    renderControls();
    renderOutputs();
  }

  if (pageKey === 'savings') initSavingsPage();
  else if (pageKey === 'psx') initPsxPage();
  else if (pageKey === 'nasdaq') initMarketAndCalcPage('nasdaq');
  else if (pageKey === 'crypto') initMarketAndCalcPage('crypto');
  else if (pageKey === 'currencies') initCurrenciesPage();
  else if (pageKey === 'compare') initComparePage();
})(window);
