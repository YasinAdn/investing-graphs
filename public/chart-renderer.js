(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ChartRenderer = factory();
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const SAMPLE_COUNT = 64;

  function createSvgEl(tag, attrs = {}) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v !== undefined && v !== null) {
        el.setAttribute(k, String(v));
      }
    }
    return el;
  }

  function niceRangeTicks(minVal, maxVal, desiredIntervals = 5) {
    if (!Number.isFinite(minVal) || !Number.isFinite(maxVal)) {
      return { min: 0, max: 100, ticks: [0, 25, 50, 75, 100] };
    }
    if (Math.abs(maxVal - minVal) < 1e-9) {
      const pad = Math.max(1, Math.abs(maxVal) * 0.05);
      minVal -= pad;
      maxVal += pad;
    }
    const span = maxVal - minVal;
    const rawStep = span / Math.max(2, desiredIntervals);
    const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const norm = rawStep / mag;

    let niceNorm;
    if (norm <= 1) niceNorm = 1;
    else if (norm <= 1.25) niceNorm = 1.25;
    else if (norm <= 1.5) niceNorm = 1.5;
    else if (norm <= 2) niceNorm = 2;
    else if (norm <= 2.5) niceNorm = 2.5;
    else if (norm <= 5) niceNorm = 5;
    else niceNorm = 10;

    const step = niceNorm * mag;
    const niceMin = Math.floor(minVal / step) * step;
    const niceMax = Math.ceil(maxVal / step) * step;
    const ticks = [];
    for (let v = niceMin; v <= niceMax + step * 0.01; v += step) {
      ticks.push(Number(v.toPrecision(12)));
    }
    return { min: niceMin, max: niceMax, ticks };
  }

  function formatTimeTick(tsMs, spanMs) {
    const d = new Date(tsMs);
    if (spanMs <= 2 * 24 * 3600 * 1000) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    if (spanMs <= 45 * 24 * 3600 * 1000) {
      return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
    return d.toLocaleDateString([], { month: 'short', year: '2-digit' });
  }

  function formatFullDateTime(tsMs, spanMs) {
    const d = new Date(tsMs);
    if (spanMs <= 2 * 24 * 3600 * 1000) {
      return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function formatTickValue(val, currencyCode, isFxPair, FinanceEngine) {
    if (!currencyCode) {
      return val.toLocaleString('en-US', { maximumFractionDigits: 2 });
    }
    if (isFxPair || Math.abs(val) < 1000) {
      const dec = Math.abs(val) < 10 ? 3 : Math.abs(val) < 1000 ? 2 : 0;
      return FinanceEngine.formatCurrency(val, currencyCode, { mode: 'exact', decimals: dec });
    }
    return FinanceEngine.formatCurrency(val, currencyCode, { mode: 'axis' });
  }

  function resamplePxPoints(pts, count = SAMPLE_COUNT) {
    if (!pts || pts.length === 0) return [];
    if (pts.length === 1) return Array.from({ length: count }, () => ({ x: pts[0].x, y: pts[0].y }));
    const out = [];
    for (let i = 0; i < count; i += 1) {
      const t = (i / (count - 1)) * (pts.length - 1);
      const lo = Math.floor(t);
      const hi = Math.min(pts.length - 1, lo + 1);
      const frac = t - lo;
      out.push({
        x: pts[lo].x + (pts[hi].x - pts[lo].x) * frac,
        y: pts[lo].y + (pts[hi].y - pts[lo].y) * frac
      });
    }
    return out;
  }

  function pointsToLineD(pxPts) {
    return pxPts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
  }

  function pointsToAreaD(pxPts, baseY) {
    if (!pxPts.length) return '';
    const lineD = pointsToLineD(pxPts);
    return `${lineD} L${pxPts[pxPts.length - 1].x.toFixed(2)},${baseY.toFixed(2)} L${pxPts[0].x.toFixed(2)},${baseY.toFixed(2)} Z`;
  }

  function drawAxesLayer(axesGroup, width, height, padLeft, plotW, plotH, padTop, yScaleInfo, xMode, minX, maxX, xSpan, xToPx, yToPx, config, FinanceEngine) {
    axesGroup.innerHTML = '';

    axesGroup.appendChild(createSvgEl('text', {
      x: 6,
      y: 17,
      fill: '#F6F3EB',
      'font-size': '14',
      'font-weight': '600',
      'font-family': 'inherit'
    })).textContent = config.yAxisTitle || `Value in ${config.currencyCode}`;

    for (const tick of yScaleInfo.ticks) {
      const y = yToPx(tick);
      if (y < padTop - 4 || y > padTop + plotH + 4) continue;

      axesGroup.appendChild(createSvgEl('line', {
        x1: padLeft,
        y1: y,
        x2: padLeft + plotW,
        y2: y,
        stroke: tick === 0 || tick === yScaleInfo.min ? 'rgba(212, 175, 55, 0.28)' : 'rgba(212, 175, 55, 0.1)',
        'stroke-width': 1,
        'stroke-dasharray': tick === 0 ? undefined : '3 3'
      }));

      const tickText = createSvgEl('text', {
        x: padLeft - 10,
        y: y + 4,
        'text-anchor': 'end',
        fill: '#CFC9BA',
        'font-size': '12',
        'font-weight': '500',
        'font-variant-numeric': 'tabular-nums'
      });
      tickText.textContent = formatTickValue(tick, config.currencyCode, Boolean(config.isFxRate), FinanceEngine);
      axesGroup.appendChild(tickText);
    }

    axesGroup.appendChild(createSvgEl('line', {
      x1: padLeft,
      y1: padTop,
      x2: padLeft,
      y2: padTop + plotH,
      stroke: 'rgba(212, 175, 55, 0.28)',
      'stroke-width': 1.2
    }));

    if (xMode === 'years') {
      const maxYears = maxX;
      let yearStep = 1;
      if (maxYears > 30) yearStep = 5;
      else if (maxYears > 18) yearStep = 4;
      else if (maxYears > 11) yearStep = 2;

      for (let yr = 0; yr <= maxYears; yr += yearStep) {
        const tickEl = createSvgEl('text', {
          x: xToPx(yr),
          y: padTop + plotH + 22,
          'text-anchor': 'middle',
          fill: '#EAE4D5',
          'font-size': '12.5',
          'font-weight': '600',
          'font-variant-numeric': 'tabular-nums'
        });
        tickEl.textContent = String(yr);
        axesGroup.appendChild(tickEl);
      }
      if (maxYears % yearStep !== 0) {
        const endTick = createSvgEl('text', {
          x: xToPx(maxYears),
          y: padTop + plotH + 22,
          'text-anchor': 'middle',
          fill: '#EAE4D5',
          'font-size': '12.5',
          'font-weight': '600',
          'font-variant-numeric': 'tabular-nums'
        });
        endTick.textContent = String(maxYears);
        axesGroup.appendChild(endTick);
      }
    } else {
      const tickCount = width < 520 ? 4 : 6;
      for (let i = 0; i <= tickCount; i += 1) {
        const ts = minX + (xSpan * i) / tickCount;
        const anchor = i === 0 ? 'start' : i === tickCount ? 'end' : 'middle';
        const tickEl = createSvgEl('text', {
          x: xToPx(ts),
          y: padTop + plotH + 22,
          'text-anchor': anchor,
          fill: '#CFC9BA',
          'font-size': '11.5',
          'font-weight': '500'
        });
        tickEl.textContent = formatTimeTick(ts, xSpan);
        axesGroup.appendChild(tickEl);
      }
    }

    axesGroup.appendChild(createSvgEl('text', {
      x: padLeft + plotW / 2,
      y: padTop + plotH + 44,
      'text-anchor': 'middle',
      fill: '#F6F3EB',
      'font-size': '13',
      'font-weight': '600'
    })).textContent = config.xAxisTitle || (xMode === 'datetime' ? 'Date / Time (Live)' : 'Years');
  }

  /**
   * Renders an interactive financial chart in 2D SVG (with GSAP draw, morphing,
   * and quickTo hover crosshair) or delegates to 3D Three.js view when `renderMode === '3d'`.
   */
  function renderChart(containerEl, tooltipEl, config, FinanceEngine, options = {}) {
    if (!containerEl) return;

    if (config.renderMode === '3d' && typeof window.Chart3DRenderer !== 'undefined') {
      containerEl._chartState = null;
      window.Chart3DRenderer.render3DChart(containerEl, tooltipEl, config, FinanceEngine);
      return;
    }

    if (containerEl._threeCleanup) {
      containerEl._threeCleanup();
      containerEl._threeCleanup = null;
    }

    const gsap = typeof window !== 'undefined' ? window.gsap : null;
    const width = Math.max(320, containerEl.clientWidth || 720);
    const height = Math.max(290, Math.min(380, Math.round(width * 0.45)));
    const padLeft = width < 480 ? 78 : 94;
    const padRight = 24;
    const padTop = 36;
    const padBottom = 52;
    const plotW = Math.max(120, width - padLeft - padRight);
    const plotH = Math.max(120, height - padTop - padBottom);
    const baseY = padTop + plotH;

    const seriesList = config.series || [];
    const xMode = config.xMode || 'years';
    const yZeroBase = config.yZeroBase !== false;

    let minVal = Infinity;
    let maxVal = -Infinity;
    let minX = Infinity;
    let maxX = -Infinity;

    for (const s of seriesList) {
      for (const p of s.points) {
        const xv = xMode === 'datetime' ? p.x : p.xYear;
        if (xv < minX) minX = xv;
        if (xv > maxX) maxX = xv;
        if (p.value > maxVal) maxVal = p.value;
        if (p.value < minVal) minVal = p.value;
      }
    }

    if (config.band) {
      for (const p of config.band.upper) if (p.value > maxVal) maxVal = p.value;
      for (const p of config.band.lower) if (p.value < minVal) minVal = p.value;
    }

    if (!Number.isFinite(maxVal) || !Number.isFinite(minVal)) {
      minVal = 0;
      maxVal = 1000;
    }

    if (xMode === 'years') {
      minX = 0;
      maxX = Math.max(1, Number(config.years) || 1);
    } else if (!Number.isFinite(minX) || !Number.isFinite(maxX) || maxX <= minX) {
      const now = Date.now();
      minX = now - 86400000;
      maxX = now;
    }

    const xSpan = Math.max(1, maxX - minX);

    let yScaleInfo;
    if (yZeroBase) {
      yScaleInfo = FinanceEngine.niceAxisScale(Math.max(10, maxVal * 1.04), 5);
      yScaleInfo.min = Math.min(0, minVal);
    } else {
      const pad = (maxVal - minVal) * 0.08;
      yScaleInfo = niceRangeTicks(minVal - pad, maxVal + pad, 5);
    }

    const yMin = yScaleInfo.min;
    const yMax = yScaleInfo.max;
    const ySpan = Math.max(1e-9, yMax - yMin);

    const xToPx = (xv) => padLeft + (Math.max(0, Math.min(1, (xv - minX) / xSpan))) * plotW;
    const yToPx = (val) => padTop + plotH - ((val - yMin) / ySpan) * plotH;

    // Target resampled px coordinates for smooth morphing
    const targetSampled = seriesList.map((s) => {
      const rawPx = (s.points || []).map((p) => ({
        x: xToPx(xMode === 'datetime' ? p.x : p.xYear),
        y: yToPx(p.value)
      }));
      return resamplePxPoints(rawPx, SAMPLE_COUNT);
    });

    const targetBand = config.band && config.band.upper.length > 1
      ? {
        upper: resamplePxPoints(config.band.upper.map((p) => ({ x: xToPx(xMode === 'datetime' ? p.x : p.xYear), y: yToPx(p.value) })), SAMPLE_COUNT),
        lower: resamplePxPoints(config.band.lower.map((p) => ({ x: xToPx(xMode === 'datetime' ? p.x : p.xYear), y: yToPx(p.value) })), SAMPLE_COUNT)
      }
      : null;

    const prevState = containerEl._chartState;
    const canMorph = Boolean(
      options.morph !== false
      && prevState
      && prevState.width === width
      && prevState.seriesCount === seriesList.length
      && prevState.xMode === xMode
      && prevState.hasBand === Boolean(targetBand)
      && prevState.seriesKeys === seriesList.map((s) => s.id).join(',')
    );

    if (canMorph) {
      // Update axes & hover state smoothly while GSAP morphs paths (0.25s power2.out)
      drawAxesLayer(prevState.axesGroup, width, height, padLeft, plotW, plotH, padTop, yScaleInfo, xMode, minX, maxX, xSpan, xToPx, yToPx, config, FinanceEngine);
      prevState.latestConfig = config;
      prevState.xToPx = xToPx;
      prevState.yToPx = yToPx;
      prevState.minX = minX;
      prevState.xSpan = xSpan;

      const startSampled = prevState.currentSampled;
      const startBand = prevState.currentBand;

      if (prevState.morphTween) prevState.morphTween.kill();

      const applyInterpolated = (t) => {
        const currAll = [];
        seriesList.forEach((s, idx) => {
          const fromPts = startSampled[idx] || targetSampled[idx];
          const toPts = targetSampled[idx];
          const interp = toPts.map((pt, j) => ({
            x: fromPts[j].x + (pt.x - fromPts[j].x) * t,
            y: fromPts[j].y + (pt.y - fromPts[j].y) * t
          }));
          currAll.push(interp);
          if (prevState.lineEls[idx]) prevState.lineEls[idx].setAttribute('d', pointsToLineD(interp));
          if (prevState.areaEls[idx]) prevState.areaEls[idx].setAttribute('d', pointsToAreaD(interp, baseY));
        });
        prevState.currentSampled = currAll;

        if (targetBand && prevState.bandPolyEl) {
          const fU = (startBand && startBand.upper) || targetBand.upper;
          const fL = (startBand && startBand.lower) || targetBand.lower;
          const tU = targetBand.upper.map((p, j) => ({ x: fU[j].x + (p.x - fU[j].x) * t, y: fU[j].y + (p.y - fU[j].y) * t }));
          const tL = targetBand.lower.map((p, j) => ({ x: fL[j].x + (p.x - fL[j].x) * t, y: fL[j].y + (p.y - fL[j].y) * t }));
          prevState.currentBand = { upper: tU, lower: tL };
          const polyPts = [...tU.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`), ...[...tL].reverse().map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`)];
          prevState.bandPolyEl.setAttribute('points', polyPts.join(' '));
          prevState.bandUpperEl.setAttribute('d', pointsToLineD(tU));
          prevState.bandLowerEl.setAttribute('d', pointsToLineD(tL));
        }
      };

      if (gsap) {
        const proxy = { t: 0 };
        prevState.morphTween = gsap.to(proxy, {
          t: 1,
          duration: 0.25,
          ease: 'power2.out',
          onUpdate: () => applyInterpolated(proxy.t)
        });
      } else {
        applyInterpolated(1);
      }
      return;
    }

    // Fresh SVG build + GSAP Line Draw & Gradient Fill Reveal
    containerEl.innerHTML = '';

    const svg = createSvgEl('svg', {
      viewBox: `0 0 ${width} ${height}`,
      width: '100%',
      height: height,
      class: 'invest-svg-chart',
      role: 'img',
      'aria-label': config.yAxisTitle || 'Investment chart'
    });

    const defs = createSvgEl('defs');
    const uid = 'grad_' + Math.random().toString(36).slice(2, 8);

    // Glow filter for active hover markers
    const glowFilter = createSvgEl('filter', { id: `${uid}_glow`, x: '-60%', y: '-60%', width: '220%', height: '220%' });
    glowFilter.appendChild(createSvgEl('feGaussianBlur', { stdDeviation: '3', result: 'blur' }));
    const merge = createSvgEl('feMerge');
    merge.appendChild(createSvgEl('feMergeNode', { in: 'blur' }));
    merge.appendChild(createSvgEl('feMergeNode', { in: 'SourceGraphic' }));
    glowFilter.appendChild(merge);
    defs.appendChild(glowFilter);

    seriesList.forEach((s, idx) => {
      if (!s.fillTop) return;
      const grad = createSvgEl('linearGradient', { id: `${uid}_${idx}`, x1: '0', y1: '0', x2: '0', y2: '1' });
      grad.appendChild(createSvgEl('stop', { offset: '0%', 'stop-color': s.color, 'stop-opacity': s.fillTopOpacity ?? '0.24' }));
      grad.appendChild(createSvgEl('stop', { offset: '100%', 'stop-color': s.color, 'stop-opacity': s.fillBottomOpacity ?? '0.02' }));
      defs.appendChild(grad);
    });
    svg.appendChild(defs);

    const axesGroup = createSvgEl('g');
    drawAxesLayer(axesGroup, width, height, padLeft, plotW, plotH, padTop, yScaleInfo, xMode, minX, maxX, xSpan, xToPx, yToPx, config, FinanceEngine);
    svg.appendChild(axesGroup);

    let bandPolyEl = null;
    let bandUpperEl = null;
    let bandLowerEl = null;
    if (targetBand) {
      const polyPts = [...targetBand.upper.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`), ...[...targetBand.lower].reverse().map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`)];
      bandPolyEl = createSvgEl('polygon', { points: polyPts.join(' '), fill: 'rgba(124, 184, 247, 0.11)' });
      bandUpperEl = createSvgEl('path', { d: pointsToLineD(targetBand.upper), fill: 'none', stroke: 'rgba(124, 184, 247, 0.38)', 'stroke-width': 1.2, 'stroke-dasharray': '4 4' });
      bandLowerEl = createSvgEl('path', { d: pointsToLineD(targetBand.lower), fill: 'none', stroke: 'rgba(124, 184, 247, 0.38)', 'stroke-width': 1.2, 'stroke-dasharray': '4 4' });
      svg.appendChild(bandPolyEl);
      svg.appendChild(bandUpperEl);
      svg.appendChild(bandLowerEl);
    }

    const areaEls = [];
    const lineEls = [];

    seriesList.forEach((s, idx) => {
      const pxPts = targetSampled[idx];
      if (!pxPts || pxPts.length === 0) {
        areaEls.push(null);
        lineEls.push(null);
        return;
      }

      let areaPath = null;
      if (s.fillTop) {
        areaPath = createSvgEl('path', {
          d: pointsToAreaD(pxPts, baseY),
          fill: `url(#${uid}_${idx})`,
          style: gsap ? 'opacity: 0;' : undefined
        });
        svg.appendChild(areaPath);
      }
      areaEls.push(areaPath);

      const linePath = createSvgEl('path', {
        d: pointsToLineD(pxPts),
        fill: 'none',
        stroke: s.color,
        'stroke-width': s.width || 2.2,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
        'stroke-dasharray': s.dashed ? '5 4' : undefined
      });
      svg.appendChild(linePath);
      lineEls.push(linePath);
    });

    // Interactive Hover Layer powered by gsap.quickTo() on SVG <g> transforms
    const hoverGroup = createSvgEl('g', { style: 'display:none; pointer-events:none;' });
    const crosshairGroup = createSvgEl('g');
    const crosshair = createSvgEl('line', {
      x1: 0,
      y1: padTop,
      x2: 0,
      y2: padTop + plotH,
      stroke: 'rgba(236, 208, 120, 0.45)',
      'stroke-width': 1.2,
      'stroke-dasharray': '3 3'
    });
    crosshairGroup.appendChild(crosshair);
    hoverGroup.appendChild(crosshairGroup);

    const markerGroups = [];
    seriesList.forEach((s) => {
      const mg = createSvgEl('g');
      const halo = createSvgEl('circle', {
        cx: 0,
        cy: 0,
        r: 9,
        fill: s.color,
        opacity: '0.28',
        filter: `url(#${uid}_glow)`
      });
      const dot = createSvgEl('circle', {
        cx: 0,
        cy: 0,
        r: 4.5,
        fill: s.color,
        stroke: '#0a0b10',
        'stroke-width': 2
      });
      mg.appendChild(halo);
      mg.appendChild(dot);
      hoverGroup.appendChild(mg);
      markerGroups.push(mg);
    });
    svg.appendChild(hoverGroup);

    const hitRect = createSvgEl('rect', {
      x: padLeft,
      y: padTop,
      width: plotW,
      height: plotH,
      fill: 'transparent',
      style: 'cursor: crosshair;'
    });
    svg.appendChild(hitRect);
    containerEl.appendChild(svg);

    // Run GSAP Line Draw & Gradient Fill Reveal on initial load
    if (gsap) {
      const drawTargets = lineEls.filter(Boolean);
      drawTargets.forEach((p, idx) => {
        if (seriesList[idx].dashed) {
          gsap.fromTo(p, { opacity: 0 }, { opacity: 1, duration: 0.65, delay: 0.2 });
          return;
        }
        try {
          const totalLen = p.getTotalLength();
          p.style.strokeDasharray = String(totalLen);
          p.style.strokeDashoffset = String(totalLen);
          gsap.to(p, {
            strokeDashoffset: 0,
            duration: 0.85,
            delay: idx * 0.1,
            ease: 'power2.out',
            onComplete: () => {
              p.style.strokeDasharray = '';
              p.style.strokeDashoffset = '';
            }
          });
        } catch (_) {
          // ignore if element disconnected
        }
      });

      const validAreas = areaEls.filter(Boolean);
      if (validAreas.length > 0) {
        gsap.to(validAreas, {
          opacity: 1,
          duration: 0.65,
          delay: 0.22,
          ease: 'power2.out'
        });
      }
    }

    const chartState = {
      width,
      seriesCount: seriesList.length,
      seriesKeys: seriesList.map((s) => s.id).join(','),
      xMode,
      hasBand: Boolean(targetBand),
      axesGroup,
      lineEls,
      areaEls,
      bandPolyEl,
      bandUpperEl,
      bandLowerEl,
      currentSampled: targetSampled,
      currentBand: targetBand,
      latestConfig: config,
      xToPx,
      yToPx,
      minX,
      xSpan,
      morphTween: null
    };
    containerEl._chartState = chartState;

    if (!tooltipEl) return;

    // Ultra-smooth 60fps cursor tracking via gsap.quickTo() on transforms
    if (gsap) tooltipEl.style.left = '0px';
    const quickLineX = gsap ? gsap.quickTo(crosshairGroup, 'x', { duration: 0.08, ease: 'power3.out' }) : null;
    const quickDotMovers = gsap
      ? markerGroups.map((mg) => ({
        mx: gsap.quickTo(mg, 'x', { duration: 0.08, ease: 'power3.out' }),
        my: gsap.quickTo(mg, 'y', { duration: 0.08, ease: 'power3.out' })
      }))
      : null;
    const quickTipX = gsap ? gsap.quickTo(tooltipEl, 'x', { duration: 0.1, ease: 'power3.out' }) : null;

    function updateHoverFromClientX(clientX) {
      const activeCfg = chartState.latestConfig;
      const activeSeries = activeCfg.series || [];
      const primaryPoints = activeSeries[0] ? activeSeries[0].points : [];
      if (!primaryPoints.length) return;

      const rect = svg.getBoundingClientRect();
      if (!rect.width) return;
      const svgX = ((clientX - rect.left) / rect.width) * width;
      const clampedX = Math.max(padLeft, Math.min(padLeft + plotW, svgX));
      const ratio = (clampedX - padLeft) / plotW;
      const targetX = chartState.minX + ratio * chartState.xSpan;

      let nearestIdx = 0;
      let bestDist = Infinity;
      for (let i = 0; i < primaryPoints.length; i += 1) {
        const xv = xMode === 'datetime' ? primaryPoints[i].x : primaryPoints[i].xYear;
        const d = Math.abs(xv - targetX);
        if (d < bestDist) {
          bestDist = d;
          nearestIdx = i;
        }
      }

      const snapXVal = xMode === 'datetime' ? primaryPoints[nearestIdx].x : primaryPoints[nearestIdx].xYear;
      const snapX = chartState.xToPx(snapXVal);

      hoverGroup.style.display = 'block';
      if (quickLineX) {
        quickLineX(snapX);
      } else {
        crosshairGroup.setAttribute('transform', `translate(${snapX.toFixed(2)}, 0)`);
      }

      const rowsHtml = [];
      activeSeries.forEach((s, i) => {
        const pt = s.points[Math.min(nearestIdx, s.points.length - 1)];
        const cy = chartState.yToPx(pt.value);
        if (quickDotMovers && quickDotMovers[i]) {
          quickDotMovers[i].mx(snapX);
          quickDotMovers[i].my(cy);
        } else {
          markerGroups[i].setAttribute('transform', `translate(${snapX.toFixed(2)}, ${cy.toFixed(2)})`);
        }

        let formatted;
        if (!activeCfg.currencyCode) {
          formatted = pt.value.toLocaleString('en-US', { maximumFractionDigits: 2 });
        } else if (activeCfg.isFxRate || Math.abs(pt.value) < 200) {
          const dec = Math.abs(pt.value) < 10 ? 4 : 2;
          formatted = FinanceEngine.formatCurrency(pt.value, activeCfg.currencyCode, { mode: 'exact', decimals: dec });
        } else {
          formatted = FinanceEngine.formatCurrency(pt.value, activeCfg.currencyCode, { mode: 'exact' });
        }

        rowsHtml.push(`
          <div class="tt-row">
            <span class="tt-label"><span class="tt-swatch" style="background:${s.color}"></span>${s.shortLabel || s.label}</span>
            <span class="tt-val">${formatted}</span>
          </div>
        `);
      });

      if (xMode === 'datetime' && primaryPoints.length >= 2) {
        const firstVal = primaryPoints[0].value;
        const currVal = primaryPoints[nearestIdx].value;
        if (firstVal > 0) {
          const pct = ((currVal - firstVal) / firstVal) * 100;
          rowsHtml.push(`
            <div class="tt-row tt-band-row">
              <span class="tt-label">Change from start</span>
              <span class="tt-val ${pct >= 0 ? 'chg-pos' : 'chg-neg'}">${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%</span>
            </div>
          `);
        }
      } else if (activeCfg.band) {
        const bullPt = activeCfg.band.upper[Math.min(nearestIdx, activeCfg.band.upper.length - 1)];
        const bearPt = activeCfg.band.lower[Math.min(nearestIdx, activeCfg.band.lower.length - 1)];
        rowsHtml.push(`
          <div class="tt-row tt-band-row">
            <span class="tt-label">Worst–Best Range</span>
            <span class="tt-val">${FinanceEngine.formatCurrency(bearPt.value, activeCfg.currencyCode, { mode: 'compact' })} – ${FinanceEngine.formatCurrency(bullPt.value, activeCfg.currencyCode, { mode: 'compact' })}</span>
          </div>
        `);
      }

      let timeLabel;
      if (xMode === 'datetime') {
        timeLabel = formatFullDateTime(snapXVal, chartState.xSpan);
      } else {
        const monthNum = Math.round(snapXVal * 12);
        const yrsWhole = Math.floor(monthNum / 12);
        const remMos = monthNum % 12;
        timeLabel = monthNum === 0
          ? 'Day 1 (Start)'
          : remMos === 0
            ? `After ${yrsWhole} ${yrsWhole === 1 ? 'Year' : 'Years'}`
            : `Year ${yrsWhole}, Month ${remMos}`;
      }

      tooltipEl.innerHTML = `<div class="tt-head">${timeLabel}</div>${rowsHtml.join('')}`;
      tooltipEl.classList.add('visible');

      const ttW = tooltipEl.offsetWidth || 225;
      const pctX = (snapX / width) * rect.width;
      const leftPos = pctX + 14 + ttW > rect.width ? Math.max(8, pctX - ttW - 14) : pctX + 14;
      if (quickTipX) quickTipX(leftPos);
      else tooltipEl.style.left = `${leftPos}px`;
      tooltipEl.style.top = '12px';
    }

    function hideHover() {
      hoverGroup.style.display = 'none';
      tooltipEl.classList.remove('visible');
    }

    hitRect.addEventListener('mousemove', (e) => updateHoverFromClientX(e.clientX));
    hitRect.addEventListener('mouseleave', hideHover);
    hitRect.addEventListener('touchstart', (e) => {
      if (e.touches && e.touches[0]) updateHoverFromClientX(e.touches[0].clientX);
    }, { passive: true });
    hitRect.addEventListener('touchmove', (e) => {
      if (e.touches && e.touches[0]) updateHoverFromClientX(e.touches[0].clientX);
    }, { passive: true });
    hitRect.addEventListener('touchend', hideHover);
  }

  return { renderChart, niceRangeTicks };
}));
