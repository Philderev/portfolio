(() => {
  const viewport = document.querySelector('.viewport');
  const track = document.querySelector('.track');
  const panels = Array.from(document.querySelectorAll('.panel'));
  const progressRail = document.querySelector('.progress-rail');
  const introPortraitImg = document.getElementById('intro-portrait-img');
  const smokeBg = document.querySelector('.smoke-bg');
  let lastVideoTime = -1;
  smokeBg.addEventListener('canplay', () => smokeBg.pause(), { once: true });
  const introPortraitEl = document.querySelector('.intro-portrait');
  const panelContentsEl = panels.map(p => p.querySelector('.panel-content'));

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let panelCount = panels.length;
  let vw = window.innerWidth;
  let panelOffsets = [];
  let panelWidths = [];
  let maxScroll = 0;

  function computeOffsets() {
    panelOffsets = panels.map(p => p.offsetLeft);
    panelWidths = panels.map(p => p.offsetWidth);
    maxScroll = Math.max(0, panelOffsets[panelCount - 1] + panelWidths[panelCount - 1] - vw);
  }
  computeOffsets();

  let current = 0;
  let target = 0;
  let activeIndex = 0;
  let wheelVelocity = 0;


  function goTo(i) {
    activeIndex = Math.max(0, Math.min(panelCount - 1, i));
    target = Math.max(0, Math.min(maxScroll, panelOffsets[activeIndex]));
  }

  function isInteractiveTarget(targetNode) {
    return Boolean(targetNode.closest('a, button, input, textarea, select, iframe'));
  }

  // ---- input: wheel ----
  viewport.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
    wheelVelocity += delta * 0.28;
  }, { passive: false });

  // ---- input: touch / pointer drag ----
  let dragging = false;
  let startX = 0;
  let startTarget = 0;
  let lastX = 0;
  let lastT = 0;
  let velocity = 0;

  viewport.addEventListener('pointerdown', (e) => {
    if (isInteractiveTarget(e.target)) return;
    dragging = true;
    startX = e.clientX;
    lastX = e.clientX;
    lastT = performance.now();
    startTarget = target;
    velocity = 0;
    viewport.setPointerCapture && viewport.setPointerCapture(e.pointerId);
  });

  viewport.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    target = Math.max(0, Math.min(maxScroll, startTarget - dx));
    const now = performance.now();
    const dt = now - lastT || 16;
    velocity = (lastX - e.clientX) / dt;
    lastX = e.clientX;
    lastT = now;
  });

  function endDrag() {
    if (!dragging) return;
    dragging = false;
    target = Math.max(0, Math.min(maxScroll, target + velocity * 120));
  }
  viewport.addEventListener('pointerup', endDrag);
  viewport.addEventListener('pointercancel', endDrag);
  viewport.addEventListener('pointerleave', () => { if (dragging) endDrag(); });

  // ---- input: keyboard ----
  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'PageDown') { goTo(activeIndex + 1); e.preventDefault(); }
    if (e.key === 'ArrowLeft'  || e.key === 'PageUp')   { goTo(activeIndex - 1); e.preventDefault(); }
    if (e.key === 'Home') { goTo(0); e.preventDefault(); }
    if (e.key === 'End')  { goTo(panelCount - 1); e.preventDefault(); }
  });

  // ---- resize ----
  window.addEventListener('resize', () => {
    const progress = maxScroll ? current / maxScroll : 0;
    vw = window.innerWidth;
    computeOffsets();
    current = progress * maxScroll;
    target = Math.max(0, Math.min(maxScroll, panelOffsets[activeIndex]));
  });

  // ---- main animation loop ----
  function loop() {
    if (Math.abs(wheelVelocity) > 0.02) {
      target = Math.max(0, Math.min(maxScroll, target + wheelVelocity));
      wheelVelocity *= 0.90;
    } else {
      wheelVelocity = 0;
    }

    if (reduceMotion) {
      current = target;
    } else {
      current += (target - current) * 0.065;
      if (Math.abs(target - current) < 0.3) current = target;
    }

    track.style.transform = `translate3d(${-current}px,0,0)`;

    const progress = maxScroll ? current / maxScroll : 0;

    progressRail.style.width = (progress * 100) + '%';

    // smoke: seek to scroll position (forward + rewind)
    if (smokeBg.readyState >= 2 && smokeBg.duration) {
      const newTime = Math.max(0, Math.min(smokeBg.duration, progress * smokeBg.duration));
      if (Math.abs(newTime - lastVideoTime) > 0.016) {
        smokeBg.currentTime = newTime;
        lastVideoTime = newTime;
      }
    }


    // 5-frame portrait cycling (intro panel width = panelWidths[0])
    const introW = panelWidths[0] || vw;
    const introToAboutProgress = Math.max(0, Math.min(0.9999, current / introW));
    const portraitFrame = Math.floor(introToAboutProgress * 5) + 1;
    const portraitSrc = portraitFrame + '.png';
    if (!introPortraitImg.src.endsWith('/' + portraitSrc) && !introPortraitImg.src.endsWith(portraitSrc)) {
      introPortraitImg.src = portraitSrc;
    }

    // parallax — direct style, GPU-composited
    if (!reduceMotion) {
      const introOff = Math.max(-1, Math.min(1, current / introW));
      introPortraitEl.style.transform = `translateX(${Math.round(introOff * -60)}px)`;

      panelContentsEl.forEach((el, i) => {
        if (!el) return;
        const pw = panelWidths[i] || vw;
        const centerScroll = panelOffsets[i] + (pw - vw) / 2;
        const off = (current - centerScroll) / vw;
        const clamped = Math.max(-1, Math.min(1, off));
        const ty = Math.round(clamped * -22);
        const op = Math.round(Math.max(0, 1 - Math.abs(clamped) * 0.65) * 100) / 100;
        el.style.transform = `translateY(${ty}px)`;
        el.style.opacity = op;
      });
    }

    // active panel = last panel whose left edge has passed the viewport center
    const viewportCenter = current + vw / 2;
    let newIndex = 0;
    for (let i = panelCount - 1; i >= 0; i--) {
      if (viewportCenter >= panelOffsets[i]) { newIndex = i; break; }
    }
    if (newIndex !== activeIndex && Math.abs(target - current) < 1) activeIndex = newIndex;

    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  viewport.addEventListener('dragstart', (e) => e.preventDefault());
})();
