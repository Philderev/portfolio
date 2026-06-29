(() => {
  const mobileQuery = window.matchMedia('(max-width: 1024px)');
  const isMobile = mobileQuery.matches;
  const isMobileGestureMode = () => mobileQuery.matches;

  const smokeBg = document.querySelector('.smoke-bg');
  let mobileSmokeBound = false;

  function pauseSmokeOnMobile() {
    if (mobileSmokeBound) return;
    mobileSmokeBound = true;

    const scroller = document.querySelector('.viewport') || window;
    let smokeRaf = null;
    let lastMobileSmokeTime = -1;

    smokeBg.removeAttribute('autoplay');
    smokeBg.preload = 'auto';
    smokeBg.pause();

    const syncSmokeToScroll = () => {
      smokeRaf = null;
      if (!smokeBg.duration) return;

      const scrollTop = scroller === window ? window.scrollY : scroller.scrollTop;
      const scrollMax = scroller === window
        ? Math.max(1, document.documentElement.scrollHeight - window.innerHeight)
        : Math.max(1, scroller.scrollHeight - scroller.clientHeight);
      const progress = Math.max(0, Math.min(1, scrollTop / scrollMax));
      const newTime = progress * smokeBg.duration;

      if (Math.abs(newTime - lastMobileSmokeTime) > 0.016) {
        try { smokeBg.currentTime = newTime; } catch {}
        lastMobileSmokeTime = newTime;
      }
      smokeBg.pause();
    };

    const requestSmokeSync = () => {
      if (!smokeRaf) smokeRaf = requestAnimationFrame(syncSmokeToScroll);
    };

    if (smokeBg.readyState >= 1) requestSmokeSync();
    else {
      smokeBg.addEventListener('loadedmetadata', requestSmokeSync, { once: true });
      smokeBg.load();
    }

    scroller.addEventListener('scroll', requestSmokeSync, { passive: true });
  }

  // ---- project preview screenshots (runs on all viewports) ----
  document.querySelectorAll('.shot').forEach((shot) => {
    const url = shot.dataset.shot;
    if (!url) return;
    const preview = shot.closest('.preview');
    const reveal = () => {
      shot.style.setProperty('--preview-src', `url('${url}')`);
      shot.classList.add('loaded');
      if (preview) preview.classList.add('loaded');
    };
    const img = new Image();
    img.onload = reveal;
    img.onerror = reveal;
    img.src = url;
  });

  // ---- intro name: scramble / decode animation (letters cycle through symbols) ----
  const nameEl = document.querySelector('.name');
  if (nameEl && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const target = nameEl.textContent;
    const glyphs = '!<>-_\\/[]{}=+*^?#%&@0123456789';
    nameEl.setAttribute('aria-label', target); // keep real name for screen readers
    let raf = null;

    function scramble(duration) {
      const start = performance.now();
      // each character locks in at a staggered point (left-to-right-ish, jittered)
      const lockAt = target.split('').map((ch, i) =>
        ch === ' ' ? 0 : 0.15 + (i / target.length) * 0.5 + Math.random() * 0.25
      );
      cancelAnimationFrame(raf);
      (function frame(now) {
        const p = Math.min(1, (now - start) / duration);
        let out = '';
        for (let i = 0; i < target.length; i++) {
          if (target[i] === ' ') out += ' ';
          else if (p >= lockAt[i]) out += target[i];
          else out += glyphs[Math.floor(Math.random() * glyphs.length)];
        }
        nameEl.textContent = out;
        if (p < 1) raf = requestAnimationFrame(frame);
        else nameEl.textContent = target;
      })(start);
    }

    scramble(1600); // decode on load
    (function ambient() {
      setTimeout(() => { scramble(1100); ambient(); }, 4000 + Math.random() * 4000);
    })();
  }

  // On mobile: native scrolling, static smoke frame
  if (isMobile) {
    pauseSmokeOnMobile();
    return;
  }

  const viewport = document.querySelector('.viewport');
  const track = document.querySelector('.track');
  const panels = Array.from(document.querySelectorAll('.panel'));
  const progressRail = document.querySelector('.progress-rail');
  const introPortraitImg = document.getElementById('intro-portrait-img');
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

  // work panel: vertical scroll-through before advancing horizontally
  const workIndex = panels.findIndex(p => p.classList.contains('work'));
  const workScrollEl = workIndex >= 0 ? panels[workIndex].querySelector('.work-scroll') : null;
  const workContentEl = workIndex >= 0 ? panels[workIndex].querySelector('.panel-content') : null;
  let workMax = 0;
  let workCurrent = 0;
  let workTarget = 0;
  let workVelocity = 0;

  function computeOffsets() {
    panelOffsets = panels.map(p => p.offsetLeft);
    panelWidths = panels.map(p => p.offsetWidth);
    maxScroll = Math.max(0, panelOffsets[panelCount - 1] + panelWidths[panelCount - 1] - vw);
    if (workScrollEl && workContentEl) {
      workMax = Math.max(0, workScrollEl.offsetHeight - workContentEl.clientHeight);
      workTarget = Math.max(0, Math.min(workMax, workTarget));
      workCurrent = Math.max(0, Math.min(workMax, workCurrent));
    }
  }
  computeOffsets();

  let current = 0;
  let target = 0;
  let activeIndex = 0;
  let wheelVelocity = 0;
  let bypassWorkClamp = false; // true during keyboard/nav jumps so they aren't held at work
  let mobileResetDone = false;


  function goTo(i) {
    activeIndex = Math.max(0, Math.min(panelCount - 1, i));
    target = Math.max(0, Math.min(maxScroll, panelOffsets[activeIndex]));
    if (activeIndex === workIndex) workTarget = 0;
    bypassWorkClamp = true;
    setActiveNav(activeIndex);
  }

  function isInteractiveTarget(targetNode) {
    return Boolean(targetNode.closest('a, button, input, textarea, select, iframe'));
  }

  function resetDesktopScrollForMobile() {
    if (mobileResetDone) return;
    dragging = false;
    wheelVelocity = 0;
    workVelocity = 0;
    viewport.classList.remove('dragging');
    track.style.transform = '';
    if (workScrollEl) workScrollEl.style.transform = '';
    introPortraitEl.style.transform = '';
    panelContentsEl.forEach((el) => {
      if (!el) return;
      el.style.transform = '';
      el.style.opacity = '';
    });
    progressRail.style.width = '';
    pauseSmokeOnMobile();
    mobileResetDone = true;
  }

  // ---- section navigation ----
  const sectionNav = document.createElement('nav');
  sectionNav.className = 'section-nav';
  sectionNav.setAttribute('aria-label', 'Section navigation');
  const navButtons = panels.map((panel, i) => {
    const label = panel.dataset.label || `Section ${i + 1}`;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('aria-label', `Go to ${label}`);
    btn.innerHTML =
      `<span class="nav-num">${String(i + 1).padStart(2, '0')}</span>` +
      `<span class="nav-label">${label}</span>` +
      `<span class="nav-dot" aria-hidden="true"></span>`;
    btn.addEventListener('click', () => goTo(i));
    sectionNav.appendChild(btn);
    return btn;
  });
  document.body.appendChild(sectionNav);

  function setActiveNav(i) {
    navButtons.forEach((btn, idx) => btn.classList.toggle('active', idx === i));
  }
  setActiveNav(0);

  // ---- input: wheel ----
  viewport.addEventListener('wheel', (e) => {
    if (isMobileGestureMode()) return;
    e.preventDefault();
    const delta = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;

    // When the work panel is centered and still has vertical travel left,
    // route the wheel into its internal vertical scroll instead of advancing.
    if (workMax > 0 && Math.abs(current - panelOffsets[workIndex]) < 6) {
      const goingDown = delta > 0;
      if ((goingDown && workTarget < workMax - 0.5) || (!goingDown && workTarget > 0.5)) {
        workVelocity += delta * 0.28;
        return;
      }
    }

    wheelVelocity += delta * 0.28;
  }, { passive: false });

  // ---- input: touch / pointer drag ----
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let startTarget = 0;
  let startWorkTarget = 0;
  let lastX = 0;
  let lastY = 0;
  let lastT = 0;
  let velocity = 0;
  let verticalVelocity = 0;
  let dragAxis = null;
  let dragStartedOnWork = false;

  viewport.addEventListener('pointerdown', (e) => {
    if (isMobileGestureMode()) return;
    if (isInteractiveTarget(e.target)) return;
    dragging = true;
    viewport.classList.add('dragging');
    startX = e.clientX;
    startY = e.clientY;
    lastX = e.clientX;
    lastY = e.clientY;
    lastT = performance.now();
    startTarget = target;
    startWorkTarget = workTarget;
    dragStartedOnWork = workMax > 0 && Math.abs(current - panelOffsets[workIndex]) < vw * 0.5;
    dragAxis = null;
    velocity = 0;
    verticalVelocity = 0;
    wheelVelocity = 0;
    workVelocity = 0;
    viewport.setPointerCapture && viewport.setPointerCapture(e.pointerId);
  });

  viewport.addEventListener('pointermove', (e) => {
    if (isMobileGestureMode()) return;
    if (!dragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const now = performance.now();
    const dt = now - lastT || 16;

    if (!dragAxis && Math.max(Math.abs(dx), Math.abs(dy)) > 8) {
      dragAxis = dragStartedOnWork && Math.abs(dy) >= Math.abs(dx) * 0.75
        ? 'vertical'
        : (Math.abs(dy) > Math.abs(dx) ? 'vertical' : 'horizontal');
    }

    if (dragAxis === 'vertical') {
      const workPos = panelOffsets[workIndex];
      if (dragStartedOnWork) {
        target = workPos;
        workTarget = Math.max(0, Math.min(workMax, startWorkTarget - dy));
        verticalVelocity = (lastY - e.clientY) / dt;
      }
    } else if (dragAxis === 'horizontal') {
      target = Math.max(0, Math.min(maxScroll, startTarget - dx));
      velocity = (lastX - e.clientX) / dt;
    }

    lastX = e.clientX;
    lastY = e.clientY;
    lastT = now;
  });

  function endDrag() {
    if (isMobileGestureMode()) {
      dragging = false;
      viewport.classList.remove('dragging');
      return;
    }
    if (!dragging) return;
    dragging = false;
    viewport.classList.remove('dragging');
    if (dragAxis === 'vertical') {
      if (dragStartedOnWork) target = panelOffsets[workIndex];
      workTarget = Math.max(0, Math.min(workMax, workTarget + verticalVelocity * 120));
    } else if (dragAxis === 'horizontal') {
      target = Math.max(0, Math.min(maxScroll, target + velocity * 120));
    }
  }
  viewport.addEventListener('pointerup', endDrag);
  viewport.addEventListener('pointercancel', endDrag);
  viewport.addEventListener('pointerleave', () => { if (dragging) endDrag(); });

  // ---- input: keyboard ----
  window.addEventListener('keydown', (e) => {
    if (isMobileGestureMode()) return;
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
    if (isMobileGestureMode()) {
      resetDesktopScrollForMobile();
      requestAnimationFrame(loop);
      return;
    }
    mobileResetDone = false;

    if (Math.abs(wheelVelocity) > 0.02) {
      target = Math.max(0, Math.min(maxScroll, target + wheelVelocity));
      wheelVelocity *= 0.90;
    } else {
      wheelVelocity = 0;
    }

    // Hold the horizontal position at the work panel until its vertical scroll
    // is finished — a natural stop, not a magnetic pull. Skipped for nav jumps.
    if (workMax > 0 && !bypassWorkClamp && !dragging) {
      const workPos = panelOffsets[workIndex];
      if (current <= workPos + 1 && target > workPos && workTarget < workMax - 0.5) {
        target = workPos;
      } else if (current >= workPos - 1 && target < workPos && workTarget > 0.5) {
        target = workPos;
      }
    }

    if (reduceMotion) {
      current = target;
    } else {
      current += (target - current) * 0.065;
      if (Math.abs(target - current) < 0.3) current = target;
    }
    if (Math.abs(target - current) < 1) bypassWorkClamp = false;

    track.style.transform = `translate3d(${-current}px,0,0)`;

    // work panel: internal vertical scroll
    if (workScrollEl) {
      if (Math.abs(workVelocity) > 0.02) {
        workTarget = Math.max(0, Math.min(workMax, workTarget + workVelocity));
        workVelocity *= 0.90;
      } else {
        workVelocity = 0;
      }
      if (reduceMotion) {
        workCurrent = workTarget;
      } else {
        workCurrent += (workTarget - workCurrent) * 0.12;
        if (Math.abs(workTarget - workCurrent) < 0.3) workCurrent = workTarget;
      }
      workScrollEl.style.transform = `translateY(${-Math.round(workCurrent)}px)`;
    }

    // overall progress includes the work panel's internal vertical scroll,
    // so the smoke + rail keep advancing while scrolling through projects
    const totalScroll = maxScroll + workMax;
    const progress = totalScroll ? (current + workCurrent) / totalScroll : 0;

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
    if (newIndex !== activeIndex) {
      activeIndex = newIndex;
      setActiveNav(activeIndex);
    }

    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  viewport.addEventListener('dragstart', (e) => {
    if (!isMobileGestureMode()) e.preventDefault();
  });
})();
