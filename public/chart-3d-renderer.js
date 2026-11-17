(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Chart3DRenderer = factory();
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /**
   * Renders an interactive Three.js 3D Extruded Area Ribbon & Yearly Milestone Pillars scene.
   */
  function render3DChart(containerEl, tooltipEl, config, FinanceEngine) {
    if (!containerEl || typeof window.THREE === 'undefined') {
      if (containerEl) {
        containerEl.innerHTML = '<div class="chart-loading-state">3D View requires Three.js WebGL support.</div>';
      }
      return;
    }

    const THREE = window.THREE;
    const gsap = window.gsap;

    // Dispose any prior 3D instance cleanly before rebuilding
    if (containerEl._threeCleanup) {
      containerEl._threeCleanup();
      containerEl._threeCleanup = null;
    }

    const width = Math.max(320, containerEl.clientWidth || 720);
    const height = Math.max(320, Math.min(410, Math.round(width * 0.48)));

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch (_) {
      containerEl.innerHTML = '<div class="chart-loading-state">WebGL is unavailable in this browser — switch to 2D Graph.</div>';
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    containerEl.innerHTML = '';

    const wrap = document.createElement('div');
    wrap.className = 'three-canvas-wrap';
    wrap.style.position = 'relative';
    wrap.style.width = '100%';
    wrap.style.height = `${height}px`;
    wrap.appendChild(renderer.domElement);

    const hint = document.createElement('div');
    hint.className = 'three-orbit-hint';
    hint.textContent = 'Drag to rotate 3D • Hover pillars for exact numbers';
    wrap.appendChild(hint);
    containerEl.appendChild(wrap);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 100);

    // Slight isometric angle, subtly adjusting tilt when time horizon grows
    const yearsCount = Math.max(1, Number(config.years) || 5);
    const horizonRatio = Math.min(1, yearsCount / 25);
    const orbit = {
      theta: 0.46 + horizonRatio * 0.16,
      phi: 0.48 - horizonRatio * 0.08,
      radius: 13.5 + horizonRatio * 2.2
    };

    function syncCameraPos() {
      camera.position.x = orbit.radius * Math.sin(orbit.theta) * Math.cos(orbit.phi);
      camera.position.y = orbit.radius * Math.sin(orbit.phi) + 1.4;
      camera.position.z = orbit.radius * Math.cos(orbit.theta) * Math.cos(orbit.phi);
      camera.lookAt(0, 1.4, 0);
    }

    // Animate camera tilt on load / time horizon change with GSAP
    if (gsap) {
      const targetTheta = orbit.theta;
      const targetPhi = orbit.phi;
      orbit.theta = targetTheta - 0.28;
      orbit.phi = targetPhi + 0.14;
      syncCameraPos();
      gsap.to(orbit, {
        theta: targetTheta,
        phi: targetPhi,
        duration: 0.75,
        ease: 'power2.out',
        onUpdate: syncCameraPos
      });
    } else {
      syncCameraPos();
    }

    // Regal warm lighting & grid
    scene.add(new THREE.AmbientLight(0xf6f3eb, 0.72));
    const dirLight = new THREE.DirectionalLight(0xfff5d6, 1.15);
    dirLight.position.set(6, 11, 8);
    scene.add(dirLight);
    const rimLight = new THREE.DirectionalLight(0xd4af37, 0.6);
    rimLight.position.set(-7, 5, -6);
    scene.add(rimLight);

    const grid = new THREE.GridHelper(13, 13, 0x4c3f1d, 0x181b25);
    grid.position.y = 0;
    scene.add(grid);

    const seriesList = (config.series || []).slice(0, 4);
    const xMode = config.xMode || 'years';

    let maxVal = 0;
    let minVal = Infinity;
    for (const s of seriesList) {
      for (const p of s.points) {
        if (p.value > maxVal) maxVal = p.value;
        if (p.value < minVal) minVal = p.value;
      }
    }
    const rawSpan = Math.max(1e-6, maxVal - minVal);
    const baseMin = config.yZeroBase === false
      ? (minVal >= 0 ? Math.max(0, minVal - rawSpan * 0.25) : minVal - rawSpan * 0.25)
      : 0;
    const spanY = Math.max(1e-6, maxVal - baseMin);

    const sceneWidth = 9.4;
    const sceneHeight = 4.2;
    const halfW = sceneWidth / 2;

    const toSceneY = (v) => Math.max(0.08, ((v - baseMin) / spanY) * sceneHeight);

    const pillarMeshes = [];
    const capNodes = [];
    const interactiveTargets = [];

    seriesList.forEach((s, sIdx) => {
      const pts = s.points || [];
      if (pts.length < 2) return;

      const xMin = xMode === 'datetime' ? pts[0].x : 0;
      const xMax = xMode === 'datetime' ? pts[pts.length - 1].x : yearsCount;
      const xSpan = Math.max(1e-6, xMax - xMin);

      // Downsample cleanly to <= 56 segments for smooth ExtrudeGeometry
      const maxPts = 56;
      const stride = Math.max(1, Math.floor(pts.length / maxPts));
      const sampled = [];
      for (let i = 0; i < pts.length; i += stride) sampled.push(pts[i]);
      if (sampled[sampled.length - 1] !== pts[pts.length - 1]) sampled.push(pts[pts.length - 1]);

      const shape = new THREE.Shape();
      shape.moveTo(-halfW, 0);
      sampled.forEach((p) => {
        const xv = xMode === 'datetime' ? p.x : p.xYear;
        const sx = -halfW + ((xv - xMin) / xSpan) * sceneWidth;
        const sy = toSceneY(p.value);
        shape.lineTo(sx, sy);
      });
      shape.lineTo(halfW, 0);
      shape.closePath();

      const extrudeGeo = new THREE.ExtrudeGeometry(shape, {
        depth: 0.42,
        bevelEnabled: true,
        bevelSegments: 2,
        steps: 1,
        bevelSize: 0.03,
        bevelThickness: 0.03
      });

      const zOffset = (seriesList.length - 1 - sIdx) * -0.78 + ((seriesList.length - 1) * 0.39);
      const colorHex = new THREE.Color(s.color || '#7CB8F7');
      const ribbonMat = new THREE.MeshStandardMaterial({
        color: colorHex,
        roughness: 0.32,
        metalness: 0.15,
        transparent: true,
        opacity: sIdx === 0 ? 0.78 : 0.86
      });

      const ribbonMesh = new THREE.Mesh(extrudeGeo, ribbonMat);
      ribbonMesh.position.z = zOffset - 0.21;
      scene.add(ribbonMesh);

      if (gsap) {
        gsap.from(ribbonMesh.scale, {
          y: 0.01,
          duration: 0.6,
          delay: sIdx * 0.1,
          ease: 'power2.out'
        });
      }

      // 3D Yearly Milestone Pillars on primary & secondary series (up to 12 evenly spaced milestones)
      if (sIdx <= 1) {
        const pillarPositions = [];
        if (xMode === 'years') {
          const stepYr = yearsCount > 12 ? Math.ceil(yearsCount / 10) : 1;
          for (let yr = stepYr; yr <= yearsCount; yr += stepYr) {
            let bestPt = pts[0];
            let bestDist = Infinity;
            for (const p of pts) {
              const d = Math.abs(p.xYear - yr);
              if (d < bestDist) { bestDist = d; bestPt = p; }
            }
            pillarPositions.push({ label: `Year ${yr}`, point: bestPt });
          }
        } else {
          const milestones = 6;
          for (let m = 1; m <= milestones; m += 1) {
            const idx = Math.min(pts.length - 1, Math.round(((pts.length - 1) * m) / milestones));
            const dt = new Date(pts[idx].x).toLocaleDateString([], { month: 'short', day: 'numeric', year: '2-digit' });
            pillarPositions.push({ label: dt, point: pts[idx] });
          }
        }

        pillarPositions.forEach((item) => {
          const xv = xMode === 'datetime' ? item.point.x : item.point.xYear;
          const sx = -halfW + ((xv - xMin) / xSpan) * sceneWidth;
          const sy = toSceneY(item.point.value);

          const colGeo = new THREE.CylinderGeometry(0.085, 0.105, sy, 14);
          colGeo.translate(0, sy / 2, 0);
          const colMat = new THREE.MeshStandardMaterial({
            color: colorHex,
            emissive: colorHex,
            emissiveIntensity: 0.35,
            roughness: 0.2,
            metalness: 0.25
          });

          const pillar = new THREE.Mesh(colGeo, colMat);
          pillar.position.set(sx, 0, zOffset + 0.3);
          pillar.userData = {
            seriesLabel: s.shortLabel || s.label,
            seriesColor: s.color,
            timeLabel: item.label,
            value: item.point.value
          };
          scene.add(pillar);
          pillarMeshes.push(pillar);
          interactiveTargets.push(pillar);

          // Glowing cap node on top of pillar
          const nodeGeo = new THREE.SphereGeometry(0.13, 14, 14);
          const nodeMat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            emissive: colorHex,
            emissiveIntensity: 0.75
          });
          const node = new THREE.Mesh(nodeGeo, nodeMat);
          node.position.set(sx, sy + 0.04, zOffset + 0.3);
          node.userData = pillar.userData;
          scene.add(node);
          capNodes.push(node);
          interactiveTargets.push(node);
        });
      }
    });

    if (gsap && pillarMeshes.length > 0) {
      gsap.from(pillarMeshes.map((p) => p.scale), {
        y: 0,
        duration: 0.5,
        stagger: 0.08,
        ease: 'back.out(1.4)'
      });
      gsap.from(capNodes.map((n) => n.position), {
        y: 0.04,
        duration: 0.5,
        stagger: 0.08,
        ease: 'back.out(1.4)'
      });
    }

    // Orbit dragging + Raycast hover tooltip
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let dragging = false;
    let lastX = 0;
    let lastY = 0;

    function onPointerDown(e) {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
    }

    function onPointerMove(e) {
      const rect = renderer.domElement.getBoundingClientRect();
      if (dragging) {
        const dx = e.clientX - lastX;
        const dy = e.clientY - lastY;
        lastX = e.clientX;
        lastY = e.clientY;
        orbit.theta -= dx * 0.008;
        orbit.phi = Math.max(0.14, Math.min(1.25, orbit.phi + dy * 0.006));
        syncCameraPos();
        if (tooltipEl) tooltipEl.classList.remove('visible');
        return;
      }

      if (!tooltipEl || !rect.width) return;
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(interactiveTargets, false);
      if (hits.length > 0) {
        const d = hits[0].object.userData;
        const formatted = config.currencyCode
          ? FinanceEngine.formatCurrency(d.value, config.currencyCode, { mode: 'exact', decimals: d.value < 200 ? 2 : 0 })
          : d.value.toLocaleString('en-US', { maximumFractionDigits: 2 });

        tooltipEl.innerHTML = `
          <div class="tt-head">${d.timeLabel}</div>
          <div class="tt-row">
            <span class="tt-label"><span class="tt-swatch" style="background:${d.seriesColor}"></span>${d.seriesLabel}</span>
            <span class="tt-val">${formatted}</span>
          </div>
        `;
        tooltipEl.classList.add('visible');
        const ttW = tooltipEl.offsetWidth || 210;
        const localX = e.clientX - rect.left;
        tooltipEl.style.left = `${localX + 14 + ttW > rect.width ? Math.max(8, localX - ttW - 14) : localX + 14}px`;
        tooltipEl.style.top = `${Math.max(10, e.clientY - rect.top - 36)}px`;
        renderer.domElement.style.cursor = 'pointer';
      } else {
        tooltipEl.classList.remove('visible');
        renderer.domElement.style.cursor = 'grab';
      }
    }

    function onPointerUp() {
      dragging = false;
    }

    function onPointerLeave() {
      dragging = false;
      if (tooltipEl) tooltipEl.classList.remove('visible');
    }

    const domEl = renderer.domElement;
    domEl.style.cursor = 'grab';
    domEl.addEventListener('pointerdown', onPointerDown);
    domEl.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    domEl.addEventListener('pointerleave', onPointerLeave);

    let rafId = 0;
    function animate() {
      rafId = requestAnimationFrame(animate);
      renderer.render(scene, camera);
    }
    animate();

    containerEl._threeCleanup = () => {
      cancelAnimationFrame(rafId);
      domEl.removeEventListener('pointerdown', onPointerDown);
      domEl.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      domEl.removeEventListener('pointerleave', onPointerLeave);
      renderer.dispose();
    };
  }

  return { render3DChart };
}));
