(() => {
  const viewport = document.querySelector('.viewport');
  const track = document.querySelector('.track');
  const panels = Array.from(document.querySelectorAll('.panel'));
  const progressRail = document.querySelector('.progress-rail');
  const smokeLayers = Array.from(document.querySelectorAll('.smoke-layer'));
  const particleCanvas = document.querySelector('.particle-field');
  const particleContext = particleCanvas.getContext('2d', { alpha: true });
  const introPortrait = document.querySelector('.intro-portrait');
  const body = document.body;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let panelCount = panels.length;
  let vw = window.innerWidth;
  let maxScroll = vw * (panelCount - 1);

  let current = 0;   // animated position (px)
  let target = 0;    // desired position (px)
  let activeIndex = 0;
  let wheelVelocity = 0;
  let vh = window.innerHeight;
  let particleDpr = 1;
  let particles = [];
  let lastParticleCurrent = 0;
  let particleScrollKick = 0;
  let pointerX = -9999;
  let pointerY = -9999;
  let lastPointerX = -9999;
  let lastPointerY = -9999;
  let pointerVelocityX = 0;
  let pointerVelocityY = 0;
  let pointerActive = false;

  function seededRandom(seed) {
    let value = seed;
    return () => {
      value = (value * 1664525 + 1013904223) >>> 0;
      return value / 4294967296;
    };
  }

  function buildParticles() {
    const rand = seededRandom(20260625);
    particles = [];

    for (let i = 0; i < 200; i += 1) {
      const depth = Math.pow(rand(), 2.15);
      particles.push({
        x: rand(),
        y: rand(),
        depth,
        size: 0.45 + depth * 3.6 + rand() * 0.5,
        mass: 1 + depth * 3.5,
        orbit: 4 + depth * 28 + rand() * 10,
        speed: (0.15 + depth * 0.32) * (rand() > 0.5 ? 1 : -1),
        phase: rand() * Math.PI * 2,
        opacity: 0.14 + depth * 0.62,
        alpha: 1,
        flying: false,
        flyX: 0,
        flyY: 0,
        velocityX: 0,
        velocityY: 0,
        respawnX: 0,
        respawnY: 0
      });
    }
  }

  function respawnParticle(particle, x, y, width, height) {
    particle.x = Math.max(0, Math.min(1, x / width));
    particle.y = Math.max(0, Math.min(1, y / height));
    particle.phase = Math.random() * Math.PI * 2;
    particle.alpha = 1;
    particle.flying = false;
    particle.velocityX = 0;
    particle.velocityY = 0;
  }

  function resizeParticleCanvas() {
    particleDpr = Math.min(window.devicePixelRatio || 1, 1.5);
    vh = window.innerHeight;
    particleCanvas.width = Math.ceil(window.innerWidth * particleDpr);
    particleCanvas.height = Math.ceil(vh * particleDpr);
    particleCanvas.style.width = '100%';
    particleCanvas.style.height = '100%';
  }

  buildParticles();
  resizeParticleCanvas();

  function drawParticles(progress, color, time) {
    const width = particleCanvas.width;
    const height = particleCanvas.height;
    const scrollShift = (Math.sin(progress * Math.PI * 2) * 96 + current * 0.012) * particleDpr;
    const drift = Math.cos(progress * Math.PI * 2) * 52 * particleDpr;
    const t = reduceMotion ? 0 : time * 0.001;

    particleContext.clearRect(0, 0, width, height);

    const scrollDelta = current - lastParticleCurrent;
    lastParticleCurrent = current;
    particleScrollKick = particleScrollKick * 0.88 + scrollDelta * 0.035;
    const swirl = Math.sin(progress * Math.PI * 2) * 42 * particleDpr;

    particles.forEach((particle) => {
      if (particle.flying) {
        particle.flyX += particle.velocityX;
        particle.flyY += particle.velocityY;
        particle.velocityX *= 0.992;
        particle.velocityY *= 0.992;

        const margin = 80 * particleDpr;
        const offscreen = particle.flyX < -margin || particle.flyX > width + margin || particle.flyY < -margin || particle.flyY > height + margin;
        particle.alpha *= offscreen ? 0.88 : 0.992;

        if (particle.alpha < 0.025) {
          respawnParticle(particle, particle.respawnX, particle.respawnY, width, height);
          return;
        }

        const radius = particle.size * particleDpr;
        particleContext.globalAlpha = particle.opacity * particle.alpha;
        particleContext.fillStyle = color;
        particleContext.beginPath();
        particleContext.arc(particle.flyX, particle.flyY, radius, 0, Math.PI * 2);
        particleContext.fill();
        return;
      }

      const orbitAngle = particle.phase + t * particle.speed;
      const dramaticDepth = 0.25 + particle.depth * 2.65;
      const orbitX = Math.cos(orbitAngle + particleScrollKick * 0.018) * particle.orbit * particleDpr * (1 + particle.depth * 1.35);
      const orbitY = Math.sin(orbitAngle * 0.82 + particleScrollKick * 0.014) * particle.orbit * 0.75 * particleDpr * (1 + particle.depth);
      let x = particle.x * width - scrollShift * dramaticDepth + orbitX + Math.sin(particle.y * 8 + progress * Math.PI * 4) * swirl * particle.depth;
      let y = particle.y * height + drift * dramaticDepth + orbitY + particleScrollKick * (0.45 + particle.depth * 1.4);

      x = ((x % width) + width) % width;
      y = ((y % height) + height) % height;

      if (pointerActive && !reduceMotion) {
        const dx = x - pointerX;
        const dy = y - pointerY;
        const distance = Math.hypot(dx, dy);
        const influenceRadius = (46 + particle.depth * 72) * particleDpr;

        if (distance < influenceRadius && distance > 0.1) {
          const pointerSpeed = Math.min(90, Math.hypot(pointerVelocityX, pointerVelocityY));
          const proximity = 1 - distance / influenceRadius;
          const speedX = pointerSpeed > 0.5 ? pointerVelocityX / pointerSpeed : dx / distance;
          const speedY = pointerSpeed > 0.5 ? pointerVelocityY / pointerSpeed : dy / distance;
          const glance = Math.max(0.18, Math.pow(proximity, 1.65));
          const radialBoost = pointerSpeed > 0.5 ? 0.12 : 0.55;
          const launch = (1.8 + pointerSpeed * 0.18 + particle.depth * 3.4) * glance * particleDpr / particle.mass;

          particle.flying = true;
          particle.flyX = x;
          particle.flyY = y;
          particle.velocityX = speedX * launch + (dx / distance) * launch * radialBoost;
          particle.velocityY = speedY * launch + (dy / distance) * launch * radialBoost;
          particle.respawnX = pointerX;
          particle.respawnY = pointerY;
          particle.alpha = 1;
        }
      }

      const radius = particle.size * particleDpr;
      particleContext.globalAlpha = particle.opacity;
      particleContext.fillStyle = color;
      particleContext.beginPath();
      particleContext.arc(x, y, radius, 0, Math.PI * 2);
      particleContext.fill();
    });

    particleContext.globalAlpha = 1;
  }

  function goTo(i) {
    activeIndex = Math.max(0, Math.min(panelCount - 1, i));
    target = activeIndex * vw;
  }

  function isInteractiveTarget(targetNode) {
    return Boolean(targetNode.closest('a, button, input, textarea, select, iframe'));
  }

  // ---- input: wheel (desktop scroll-jack) ----
  viewport.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
    wheelVelocity += delta * 0.42;
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
    lastPointerX = pointerX;
    lastPointerY = pointerY;
    pointerX = e.clientX * particleDpr;
    pointerY = e.clientY * particleDpr;
    pointerVelocityX = lastPointerX < 0 ? 0 : pointerX - lastPointerX;
    pointerVelocityY = lastPointerY < 0 ? 0 : pointerY - lastPointerY;
    pointerActive = true;

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
    // momentum flick
    target = Math.max(0, Math.min(maxScroll, target + velocity * 120));
  }
  viewport.addEventListener('pointerup', endDrag);
  viewport.addEventListener('pointercancel', endDrag);
  viewport.addEventListener('pointerleave', () => {
    pointerActive = false;
    lastPointerX = -9999;
    lastPointerY = -9999;
    pointerVelocityX = 0;
    pointerVelocityY = 0;
    if (dragging) endDrag();
  });

  // ---- input: keyboard ----
  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'PageDown') { goTo(activeIndex + 1); e.preventDefault(); }
    if (e.key === 'ArrowLeft' || e.key === 'PageUp') { goTo(activeIndex - 1); e.preventDefault(); }
    if (e.key === 'Home') { goTo(0); e.preventDefault(); }
    if (e.key === 'End') { goTo(panelCount - 1); e.preventDefault(); }
  });

  // ---- resize ----
  window.addEventListener('resize', () => {
    const progress = maxScroll ? current / maxScroll : 0;
    vw = window.innerWidth;
    resizeParticleCanvas();
    maxScroll = vw * (panelCount - 1);
    current = progress * maxScroll;
    target = activeIndex * vw;
  });

  // ---- main animation loop ----
  function loop(time = 0) {
    const ease = reduceMotion ? 1 : 0.085;
    if (Math.abs(wheelVelocity) > 0.02) {
      target = Math.max(0, Math.min(maxScroll, target + wheelVelocity));
      wheelVelocity *= 0.82;
    } else {
      wheelVelocity = 0;
    }

    current += (target - current) * ease;
    if (Math.abs(target - current) < 0.4) current = target;

    track.style.transform = `translate3d(${-current}px,0,0)`;

    const progress = maxScroll ? current / maxScroll : 0; // 0..1

    // parallax smoke layers drift opposite/slower than the track
    smokeLayers.forEach((layer) => {
      const speed = parseFloat(layer.dataset.speed || '0.2');
      layer.style.transform = `translate3d(${-current * speed}px,0,0)`;
    });

    // progress rail
    progressRail.style.width = (progress * 100) + '%';

    // orbital transition portal from About through the Work sequence
    const aboutToGqRaw = (current - vw) / (vw * 3);
    const aboutToGq = Math.max(0, Math.min(1, aboutToGqRaw));
    const gqFade = Math.max(0, Math.min(1, (aboutToGq - 0.82) / 0.18));
    const portalAlpha = aboutToGqRaw >= 0 && aboutToGqRaw <= 1
      ? 1 - gqFade * gqFade * (3 - 2 * gqFade)
      : 0;
    body.style.setProperty('--portal-alpha', portalAlpha.toFixed(3));
    body.style.setProperty('--portal-scale', (0.72 + portalAlpha * 0.55).toFixed(3));
    body.style.setProperty('--portal-rotate', `${aboutToGq * 520}deg`);
    body.style.setProperty('--portal-x', `${54 + Math.sin(aboutToGq * Math.PI * 2) * 7}vw`);
    body.style.setProperty('--portal-y', `${50 + Math.cos(aboutToGq * Math.PI * 2) * 5}vh`);

    // UPDATED: Accelerated crossfade — reaches 100% opacity exactly at the 50% scroll midpoint
    const introToAboutProgress = Math.max(0, Math.min(1, current / vw));
    const linearHalfProgress = Math.min(1, introToAboutProgress * 2);
    const portraitFade = linearHalfProgress * linearHalfProgress * (3 - 2 * linearHalfProgress);
    introPortrait.style.setProperty('--portrait-fade', portraitFade.toFixed(3));

    // black -> white -> black tone blend across the whole journey
    const black = [7, 7, 7];
    const white = [243, 241, 234];
    const bgMix = 1 - Math.abs(progress * 2 - 1);
    const mix = black.map((c, i) => Math.round(c + (white[i] - c) * bgMix));
    const smokeMix = black.map((c, i) => Math.round(white[i] + (c - white[i]) * bgMix));
    body.style.backgroundColor = `rgb(${mix[0]},${mix[1]},${mix[2]})`;
    body.style.setProperty('--tone-bg-rgb', mix.join(','));
    body.style.setProperty('--smoke-rgb', smokeMix.join(','));
    body.style.setProperty('--particle-rgb', smokeMix.join(','));
    drawParticles(progress, `rgb(${smokeMix[0]},${smokeMix[1]},${smokeMix[2]})`, time);

    // active index + tone attribute
    const newIndex = Math.round(current / vw);
    if (newIndex !== activeIndex && Math.abs(target - current) < 1) activeIndex = newIndex;

    document.body.setAttribute('data-tone', bgMix > 0.55 ? 'light' : 'dark');

    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // disable native horizontal scrollbar drag-select artifacts
  viewport.addEventListener('dragstart', (e) => e.preventDefault());
})();
