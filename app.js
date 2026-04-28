(() => {
  'use strict';

  const $  = (q, el = document) => el.querySelector(q);
  const $$ = (q, el = document) => [...el.querySelectorAll(q)];

  const stage      = $('#stage');
  const photo      = $('.stage__photo');
  const photoGlow  = $('.stage__photo-glow');
  const rings      = $$('.ring');
  const panels     = $$('.panel');
  const progressBar  = $('#progressBar');
  const progressStep = $('#progressStep');
  const canvas     = $('#particles');
  const ctx        = canvas.getContext('2d');
  const accelHeading = $('.panel__h1--accel');
  const aiMega       = $('.ai-mega');

  // ── Resize the canvas to its display size with DPR awareness ──
  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  function resizeCanvas() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const { width, height } = canvas.getBoundingClientRect();
    canvas.width  = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // ── Particles emanating from the photo center ──────────────
  const PARTICLE_COUNT = 70;
  let particles = [];
  function buildParticles() {
    particles = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.6 + Math.random() * 1.4;
      const len   = 8 + Math.random() * 30;
      const seed  = Math.random();
      particles.push({ angle, speed, len, seed });
    }
  }

  // ── Stage progress: 0 → 1 across the pinned scroll length ──
  function getStageProgress() {
    const rect = stage.getBoundingClientRect();
    const total = stage.offsetHeight - window.innerHeight;
    if (total <= 0) return 0;
    const scrolled = Math.min(Math.max(-rect.top, 0), total);
    return scrolled / total;
  }

  // Quintic ease for the photo motion
  const easeOutQuint = t => 1 - Math.pow(1 - t, 5);

  // Smooth value tracking so the canvas doesn't lag the scroll
  let progress = 0;
  let progressTarget = 0;

  // Apply the panel-4 zoom + AI finale styles from a given progress value.
  // Pulled out of the rAF loop so the scroll handler can call it as a fallback.
  // Once the user crosses into the finale zone, fire the heading + AI as a
  // self-contained CSS timeline. Decoupling from scroll velocity stops the
  // jitter that came from scrubbing the animation by inches of scroll.
  const FINALE_ENTER = 0.80; // arm at this progress (well into panel 4)
  const FINALE_RESET = 0.66; // disarm if scrolled back below this
  function applyFinale(progress) {
    if (!accelHeading || !aiMega) return;
    if (progress >= FINALE_ENTER) {
      if (!accelHeading.classList.contains('is-playing')) {
        accelHeading.classList.add('is-playing');
        aiMega.classList.add('is-playing');
        document.body.classList.add('finale-active');
      }
    } else if (progress < FINALE_RESET) {
      // Reset so the timeline can replay if the user scrolls back up
      if (accelHeading.classList.contains('is-playing')) {
        accelHeading.classList.remove('is-playing');
        aiMega.classList.remove('is-playing');
        document.body.classList.remove('finale-active');
      }
    }
  }
  window.addEventListener('scroll', () => applyFinale(getStageProgress()), { passive: true });

  // Pause the hero rAF loop when the stage is fully out of viewport — saves
  // GPU when the user is reading the lower sections.
  let stageInView = true;
  const stageObserver = new IntersectionObserver(([entry]) => {
    stageInView = entry.isIntersecting;
    if (stageInView && rAFPaused) { rAFPaused = false; requestAnimationFrame(update); }
  }, { threshold: 0 });
  stageObserver.observe(stage);
  let rAFPaused = false;

  function update() {
    if (!stageInView) { rAFPaused = true; return; }
    progressTarget = getStageProgress();
    progress += (progressTarget - progress) * 0.18;

    // Photo zoom + lift (mimics the "step out" feeling in the reference video)
    if (photo) {
      const eased = easeOutQuint(progress);
      const scale = 1 + eased * 0.18;
      const lift  = -eased * 50;
      const rot   = -eased * 1.2;
      photo.style.transform = `translateY(${lift}px) scale(${scale}) rotate(${rot}deg)`;
      photo.style.opacity = String(1 - eased * 0.35);
    }
    if (photoGlow) {
      photoGlow.style.opacity = String(0.4 + progress * 0.8);
    }

    // Concentric rings explode outward with scroll
    rings.forEach((ring, i) => {
      const factor = 1 + progress * (3.5 + i * 1.4);
      const fade   = Math.max(0, 1 - progress * (0.8 + i * 0.15));
      ring.style.transform = `scale(${factor})`;
      ring.style.opacity = String(fade);
    });

    // Update active copy panel by progress segment
    const activeIdx = Math.min(panels.length - 1, Math.floor(progress * panels.length * 0.999));
    panels.forEach((p, i) => p.classList.toggle('is-active', i === activeIdx));
    if (progressBar)  progressBar.style.width = `${progress * 100}%`;
    if (progressStep) progressStep.textContent = `${String(activeIdx + 1).padStart(2, '0')} / ${String(panels.length).padStart(2, '0')}`;

    // Panel 4 finale — same logic also bound to scroll for resilience
    applyFinale(progress);

    // Particles: draw ember sparks shooting from the center, growing with progress.
    // Skip canvas drawing during the finale — the AI lock-up takes over visually
    // and we want all GPU budget freed for that.
    if (!document.body.classList.contains('finale-active')) {
      drawParticles(progress);
    } else {
      ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    }

    // Throttle the audio nudge — don't pile up audio-param events every frame.
    if ((update._tick = (update._tick || 0) + 1) % 18 === 0) audioScrollUpdate(progress);

    requestAnimationFrame(update);
  }

  function drawParticles(p) {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h / 2;
    const maxR = Math.hypot(w, h) * 0.65;

    // Soft radial vignette of warm light, intensifies with scroll
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR);
    grad.addColorStop(0,    `rgba(255, 138, 50, ${0.08 + p * 0.14})`);
    grad.addColorStop(0.45, `rgba(255, 122, 26, ${0.04 + p * 0.08})`);
    grad.addColorStop(1,    'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Sweep + pulse so particles still shimmer when stationary
    const t = performance.now() * 0.0008;

    ctx.lineCap = 'round';
    for (let i = 0; i < particles.length; i++) {
      const pt = particles[i];
      const wobble = Math.sin(t * pt.speed + pt.seed * 6.28) * 0.18;
      const angle = pt.angle + wobble;
      const baseR = 90 + pt.seed * 80;                       // start radius around the photo
      const reach = baseR + p * (maxR * (0.4 + pt.seed * 0.7));
      const head  = reach;
      const tail  = Math.max(baseR * 0.9, reach - pt.len - p * 80);

      const x1 = cx + Math.cos(angle) * tail;
      const y1 = cy + Math.sin(angle) * tail;
      const x2 = cx + Math.cos(angle) * head;
      const y2 = cy + Math.sin(angle) * head;

      const lineGrad = ctx.createLinearGradient(x1, y1, x2, y2);
      lineGrad.addColorStop(0, 'rgba(255, 122, 26, 0)');
      const peak = 0.35 + p * 0.55 + pt.seed * 0.2;
      lineGrad.addColorStop(0.7, `rgba(255, 180, 90, ${Math.min(1, peak)})`);
      lineGrad.addColorStop(1,   `rgba(255, 230, 180, ${Math.min(1, peak * 1.1)})`);

      ctx.strokeStyle = lineGrad;
      ctx.lineWidth = 0.6 + pt.seed * 1.3;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      // Bright tip
      if (p > 0.05) {
        ctx.fillStyle = `rgba(255, 220, 160, ${0.5 * (0.4 + p)})`;
        ctx.beginPath();
        ctx.arc(x2, y2, 0.8 + pt.seed * 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // ── F1-flavored procedural soundtrack (Web Audio) ──────────
  // Sub-bass drone + heart-rate kick + arpeggiating synth + occasional engine whoosh.
  const audioToggle = $('#audioToggle');
  const audioLabel  = $('.audio-toggle__label', audioToggle);
  let audioState = null;

  function buildAudio() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    const ctx = new Ctx();
    const master = ctx.createGain();
    master.gain.value = 0;
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.ratio.value = 4;
    master.connect(compressor).connect(ctx.destination);

    // Convolution reverb — synthesized impulse response that simulates a long
    // racetrack tunnel / stadium. The fly-by signal is sent through both a dry
    // path (direct) and this wet path (echo tail) so the engine sound bounces
    // around like a real F1 car ripping past walls.
    function makeReverbIR(seconds = 3, decay = 2.5) {
      const len = Math.floor(ctx.sampleRate * seconds);
      const ir = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const data = ir.getChannelData(ch);
        for (let i = 0; i < len; i++) {
          // Slight pre-delay before the noise tail makes the echo more readable
          const pre = i < ctx.sampleRate * 0.04 ? 0 : 1;
          data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay) * pre;
        }
      }
      return ir;
    }
    const reverb = ctx.createConvolver();
    reverb.buffer = makeReverbIR(3.2, 2.0);
    const wetGain = ctx.createGain();
    wetGain.gain.value = 0.55;
    reverb.connect(wetGain).connect(master);
    const dryGain = ctx.createGain();
    dryGain.gain.value = 0.85;
    dryGain.connect(master);

    // Sub bass drone (engine idle)
    const droneOsc = ctx.createOscillator();
    droneOsc.type = 'sawtooth';
    droneOsc.frequency.value = 55;
    const droneFilter = ctx.createBiquadFilter();
    droneFilter.type = 'lowpass';
    droneFilter.frequency.value = 220;
    droneFilter.Q.value = 8;
    const droneGain = ctx.createGain();
    droneGain.gain.value = 0.22;
    droneOsc.connect(droneFilter).connect(droneGain).connect(master);

    // Slow LFO on the filter cutoff to make the drone breathe like an engine
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.18;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 90;
    lfo.connect(lfoGain).connect(droneFilter.frequency);

    // Pad chord (Am: A2 C3 E3) with slight detune
    const padFreqs = [110, 130.81, 164.81];
    const padGain = ctx.createGain();
    padGain.gain.value = 0.07;
    padGain.connect(master);
    padFreqs.forEach((f) => {
      [0, 7, -5].forEach((cents) => {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f;
        o.detune.value = cents;
        const g = ctx.createGain();
        g.gain.value = 0.18;
        o.connect(g).connect(padGain);
        o.start();
      });
    });

    droneOsc.start();
    lfo.start();

    // Pulsing kick (heart-rate / pit-wall countdown vibe). 110bpm.
    function scheduleKick() {
      const interval = 60 / 110; // seconds per beat
      function fire() {
        const t = ctx.currentTime;
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.frequency.setValueAtTime(120, t);
        o.frequency.exponentialRampToValueAtTime(40, t + 0.18);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.6, t + 0.005);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
        o.connect(g).connect(master);
        o.start(t);
        o.stop(t + 0.25);
      }
      fire();
      audioState.kickTimer = setInterval(fire, interval * 1000);
    }

    // F1 fly-by: stereo Doppler pass — engine note drops in pitch + pans across,
    // layered with a band-passed noise rush. Optional callback so the visual
    // streak can be triggered in lockstep.
    const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const noiseData = noiseBuf.getChannelData(0);
    for (let i = 0; i < noiseData.length; i++) noiseData[i] = Math.random() * 2 - 1;

    // Real F1 sound effects, all from Wikimedia Commons (CC BY-SA 3.0):
    //   • McLaren-Mercedes MP4-23 (2008) — actual drive-by + burnout at Goodwood
    //   • F1 start at Goodwood House — multiple cars launching with natural echo
    //   • Red Bull-Cosworth STR1 (2006) — V10 era engine scream (static)
    //   • Williams-Cosworth FW32 (2010) — V8 era engine (static)
    // The first two are real moving recordings — when those play, the natural
    // Doppler is preserved and we only add a light pan + reverb. The static
    // ones get a steeper playbackRate ramp to fake the pass-by.
    const flySamples = [
      { url: 'assets/f1-mclaren.m4a',        moving: true,  weight: 4 },
      { url: 'assets/f1-start.m4a',          moving: true,  weight: 3 },
      { url: 'assets/f1-redbull-2006.m4a',   moving: false, weight: 2 },
      { url: 'assets/f1-williams-2010.m4a',  moving: false, weight: 1 }
    ];
    flySamples.forEach((s) => {
      fetch(s.url)
        .then(r => r.arrayBuffer())
        .then(buf => ctx.decodeAudioData(buf))
        .then(decoded => { s.buffer = decoded; })
        .catch(err => console.warn('F1 sample failed:', s.url, err));
    });

    function pickSample() {
      const ready = flySamples.filter(s => s.buffer);
      if (!ready.length) return null;
      const total = ready.reduce((a, s) => a + s.weight, 0);
      let r = Math.random() * total;
      for (const s of ready) { r -= s.weight; if (r <= 0) return s; }
      return ready[0];
    }

    function flyBy(direction) {
      const sample = pickSample();
      if (!sample) return;
      const buf = sample.buffer;

      const t = ctx.currentTime;
      const dir = direction === 'rtl' ? -1 : 1;

      const winLen = sample.moving ? Math.min(3.5, buf.duration - 0.2) : 2.6;
      const offset = Math.random() * Math.max(0.1, buf.duration - winLen - 0.1);

      const src = ctx.createBufferSource();
      src.buffer = buf;

      if (sample.moving) {
        // Real drive-by — keep natural Doppler, just nudge it slightly
        const rate = 0.95 + Math.random() * 0.15;
        src.playbackRate.value = rate;
      } else {
        // Static engine recording — fake the drive-by with a steep pitch ramp
        src.playbackRate.setValueAtTime(1.35, t);
        src.playbackRate.linearRampToValueAtTime(1.0, t + winLen * 0.45);
        src.playbackRate.linearRampToValueAtTime(0.6, t + winLen);
      }

      // Stereo panner — far side → opposite far side
      const panner = ctx.createStereoPanner();
      panner.pan.setValueAtTime(-0.98 * dir, t);
      panner.pan.linearRampToValueAtTime(0.98 * dir, t + winLen);

      // Brightness moves with the approach for a fuller passing illusion
      const tone = ctx.createBiquadFilter();
      tone.type = 'highshelf';
      tone.frequency.value = 2200;
      tone.gain.setValueAtTime(5, t);
      tone.gain.linearRampToValueAtTime(-6, t + winLen);

      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      if (sample.moving) {
        // Let the recording's natural envelope do most of the work
        g.gain.exponentialRampToValueAtTime(1.2, t + 0.15);
        g.gain.linearRampToValueAtTime(0.9, t + winLen * 0.85);
        g.gain.exponentialRampToValueAtTime(0.0001, t + winLen);
      } else {
        // Synthetic swell for the static samples
        g.gain.exponentialRampToValueAtTime(1.1, t + winLen * 0.45);
        g.gain.linearRampToValueAtTime(0.45, t + winLen * 0.85);
        g.gain.exponentialRampToValueAtTime(0.0001, t + winLen);
      }

      src.connect(tone).connect(panner).connect(g);
      g.connect(dryGain);
      g.connect(reverb);
      src.start(t, offset);
      src.stop(t + winLen + 0.05);
    }

    function scheduleFlyBys() {
      function fire() {
        const direction = Math.random() > 0.5 ? 'ltr' : 'rtl';
        const duration = 1.0 + Math.random() * 0.8;
        flyBy(direction, duration);
        if (typeof window.__spawnRaceStreak === 'function') {
          window.__spawnRaceStreak(direction, duration);
        }
        // 9 seconds between cars — rare enough to land like a real lap pass
        audioState.flyTimer = setTimeout(fire, 9000);
      }
      audioState.flyTimer = setTimeout(fire, 1000);
    }

    // Arpeggio over the chord — gives the cinematic urgency
    const arpNotes = [220, 261.63, 329.63, 392, 329.63, 261.63];
    function scheduleArp() {
      const stepMs = (60 / 110 / 2) * 1000; // 8th notes at 110bpm
      let i = 0;
      function tick() {
        const t = ctx.currentTime;
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = 1800;
        o.type = 'triangle';
        o.frequency.value = arpNotes[i % arpNotes.length];
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.06, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
        o.connect(f).connect(g).connect(master);
        o.start(t);
        o.stop(t + 0.32);
        i++;
      }
      audioState.arpTimer = setInterval(tick, stepMs);
    }

    return { ctx, master, scheduleKick, scheduleFlyBys, scheduleArp, flyBy };
  }

  function setAudioOn(on) {
    if (!audioState) {
      const built = buildAudio();
      if (!built) return;
      audioState = built;
      audioState.on = false;
      audioState.scheduleKick();
      audioState.scheduleFlyBys();
      audioState.scheduleArp();
    }
    if (audioState.ctx.state === 'suspended') audioState.ctx.resume();

    const target = on ? 0.45 : 0;
    const t = audioState.ctx.currentTime;
    audioState.master.gain.cancelScheduledValues(t);
    audioState.master.gain.setValueAtTime(audioState.master.gain.value, t);
    audioState.master.gain.linearRampToValueAtTime(target, t + 0.6);
    audioState.on = on;

    audioToggle.setAttribute('aria-pressed', String(on));
    if (audioLabel) audioLabel.textContent = on ? 'SOUND ON' : 'SOUND OFF';
  }

  if (audioToggle) {
    audioToggle.addEventListener('click', () => {
      const next = audioToggle.getAttribute('aria-pressed') !== 'true';
      setAudioOn(next);
    });
  }

  // First click anywhere on the page kicks the audio on automatically.
  // Browsers require a user gesture before AudioContext can play, so we use
  // the very first pointerdown as the unlock moment instead of forcing the
  // user to find the toggle.
  function autoEnableOnce(e) {
    // Don't double-trigger if they clicked the toggle directly.
    if (e.target.closest && e.target.closest('#audioToggle')) return;
    setAudioOn(true);
    window.removeEventListener('pointerdown', autoEnableOnce);
    window.removeEventListener('keydown', autoEnableOnce);
  }
  window.addEventListener('pointerdown', autoEnableOnce, { once: false });
  window.addEventListener('keydown', autoEnableOnce, { once: false });

  // Lift the drone volume slightly with scroll progress for extra intensity.
  function audioScrollUpdate(p) {
    if (!audioState || !audioState.on) return;
    const target = 0.35 + p * 0.25;
    const t = audioState.ctx.currentTime;
    audioState.master.gain.linearRampToValueAtTime(target, t + 0.4);
  }

  // ── Race streaks: light trails synced to the audio fly-by ─
  const raceTrack = $('#raceTrack');
  window.__spawnRaceStreak = function (direction = 'ltr', duration = 1.2) {
    if (!raceTrack) return;
    const el = document.createElement('div');
    el.className = 'race-streak' + (direction === 'rtl' ? ' race-streak--rev' : '');
    // Random vertical placement across the full hero so streaks really cross past
    const yPct = 6 + Math.random() * 86;
    el.style.top = yPct + '%';
    el.style.height = (3 + Math.random() * 3).toFixed(2) + 'px';
    raceTrack.appendChild(el);

    const vw = window.innerWidth;
    // Start fully off-screen on the entry side, end fully off-screen on the other.
    const fromX = direction === 'rtl' ? vw : -vw * 0.6;
    const toX   = direction === 'rtl' ? -vw * 0.6 : vw;

    el.animate(
      [
        { transform: `translateX(${fromX}px)`, opacity: 0 },
        { transform: `translateX(${fromX + (toX - fromX) * 0.35}px)`, opacity: 1, offset: 0.35 },
        { transform: `translateX(${fromX + (toX - fromX) * 0.65}px)`, opacity: 1, offset: 0.65 },
        { transform: `translateX(${toX}px)`, opacity: 0 }
      ],
      { duration: duration * 1000, easing: 'cubic-bezier(.18,.6,.36,1)' }
    ).addEventListener('finish', () => el.remove());
  };

  // ── Scroll-driven race streaks during the first hero panels ──
  // While the user is scrolling through panels 1–3 of the hero, every meaningful
  // scroll motion launches a light streak (and a Doppler fly-by if sound is on).
  // The faster they scroll, the faster and more frequent the cars race past.
  let lastScrollY = window.scrollY;
  let lastStreakAt = 0;
  window.addEventListener('scroll', () => {
    const now = performance.now();
    const dy = window.scrollY - lastScrollY;
    lastScrollY = window.scrollY;
    if (Math.abs(dy) < 6) return;

    const p = getStageProgress();
    // Active during panels 0..2 (first three of four). Past panel 3 the cars stop.
    if (p > 0.78) return;

    // Throttle: faster scroll lets streaks fire closer together (down to 80ms).
    const cooldown = Math.max(80, 220 - Math.abs(dy) * 4);
    if (now - lastStreakAt < cooldown) return;
    lastStreakAt = now;

    // Don't spawn streaks during the AI finale — keep GPU free for the lock-up.
    if (document.body.classList.contains('finale-active')) return;
    const direction = dy > 0 ? 'ltr' : 'rtl';
    const speed = Math.min(80, Math.abs(dy));
    const duration = 1.4 - (speed / 80) * 0.7; // 0.7s (fast) → 1.4s (slow)
    window.__spawnRaceStreak(direction, duration);
    // Audio is strictly on the 9s schedule — scroll only spawns silent visuals.
  }, { passive: true });

  // ── Reveal-on-scroll for sections ──────────────────────────
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) {
        e.target.classList.add('is-in');
        io.unobserve(e.target);
      }
    }
  }, { rootMargin: '0px 0px -10% 0px', threshold: 0.12 });
  $$('.reveal').forEach(el => io.observe(el));

  // ── Enrollment cards (click to expand, with internal forms) ──
  const VALID_CODES = { 'PENHU0': '✓ 已套用 — 0 成本入場', 'EARLY': '✓ 折抵 100 U' };

  // 1) Expand/collapse
  $$('[data-enroll]').forEach(card => {
    const head = card.querySelector('.enroll__head');
    if (!head) return;
    const open = (force) => {
      const next = typeof force === 'boolean' ? force : !card.classList.contains('is-open');
      card.classList.toggle('is-open', next);
      head.setAttribute('aria-expanded', String(next));
      if (next) {
        card.querySelector('input, button, [tabindex]:not([data-file-btn])')?.focus({ preventScroll: false });
      }
    };
    head.addEventListener('click', () => open());
    head.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
    });
    // Don't let clicks inside the form bubble up and accidentally close
    card.querySelector('.enroll__form')?.addEventListener('click', (e) => e.stopPropagation());
  });

  // 2) Custom file input — shows the chosen filename
  $$('[data-file-btn]').forEach(btn => {
    const inputId = btn.dataset.fileBtn;
    const input = document.getElementById(inputId);
    btn.addEventListener('click', (e) => { e.preventDefault(); input?.click(); });
    if (input) {
      input.addEventListener('change', () => {
        const nameEl = document.getElementById(inputId + 'Name');
        if (!nameEl) return;
        const f = input.files && input.files[0];
        if (f) {
          nameEl.textContent = f.name;
          nameEl.classList.add('is-set');
        } else {
          nameEl.textContent = '尚未選擇';
          nameEl.classList.remove('is-set');
        }
      });
    }
  });

  // 3) Discount inside the paid form
  const paidDiscountBtn = $('#paidDiscountBtn');
  const paidDiscountIn  = $('#paidDiscount');
  const paidDiscountMsg = $('#paidDiscountMsg');
  if (paidDiscountBtn) {
    paidDiscountBtn.addEventListener('click', () => {
      const code = (paidDiscountIn.value || '').trim().toUpperCase();
      if (!code) {
        paidDiscountMsg.textContent = '請先輸入折扣碼';
        paidDiscountMsg.className = 'ef-discount-msg is-err';
        return;
      }
      if (VALID_CODES[code]) {
        paidDiscountMsg.textContent = VALID_CODES[code];
        paidDiscountMsg.className = 'ef-discount-msg is-ok';
      } else {
        paidDiscountMsg.textContent = '此折扣碼無效，請聯繫小幫手';
        paidDiscountMsg.className = 'ef-discount-msg is-err';
      }
    });
  }

  // 3.5) PENHU referral UID copy buttons
  $$('[data-copy]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const text = btn.dataset.copy;
      const original = btn.textContent;
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(text);
        } else {
          // Fallback for older browsers
          const ta = document.createElement('textarea');
          ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
        }
        btn.textContent = '已複製';
        btn.classList.add('is-copied');
        setTimeout(() => {
          btn.textContent = original;
          btn.classList.remove('is-copied');
        }, 1600);
      } catch {
        btn.textContent = '請手動複製';
      }
    });
  });

  // 4) Form submit — front-end demo (replace with real endpoint when ready)
  $$('[data-enroll-form]').forEach(form => {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      // Native validity check first
      if (!form.reportValidity()) return;
      const success = form.querySelector('[data-success]');
      if (success) {
        const isPaid = form.dataset.enrollForm === 'paid';
        success.textContent = isPaid
          ? '✓ 報名已送出，小幫手會在 24 小時內聯繫你確認入金資訊。'
          : '✓ 申請已送出，小幫手會核對聯盟會員身分後通知你下一步。';
        success.classList.add('is-shown');
      }
    });
  });

  // ── Background video — fade in once the about cards enter view ──
  const aboutGrid = document.querySelector('.about__grid');
  if (aboutGrid) {
    const updateBgVideo = () => {
      const rect = aboutGrid.getBoundingClientRect();
      // Activate when the cards' top is within ~80% down the viewport;
      // deactivate when the user scrolls back above them.
      const trigger = window.innerHeight * 0.8;
      const on = rect.top < trigger;
      document.body.classList.toggle('bg-video-on', on);
    };
    window.addEventListener('scroll', updateBgVideo, { passive: true });
    window.addEventListener('resize', updateBgVideo, { passive: true });
    updateBgVideo();
  }

  // ── Unified scroll tick — runs every scroll-events through one rAF so we
  //    don't fire 4 separate handlers + 4 layout reads per scroll event.
  const scrollBar = $('#scrollProgress');
  let scrollScheduled = false;
  function onScrollTick() {
    scrollScheduled = false;
    if (scrollBar) {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const pct = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      scrollBar.style.transform = `scaleX(${pct})`;
    }
  }
  function scheduleScroll() {
    if (!scrollScheduled) {
      scrollScheduled = true;
      requestAnimationFrame(onScrollTick);
    }
  }
  window.addEventListener('scroll', scheduleScroll, { passive: true });
  window.addEventListener('resize', scheduleScroll, { passive: true });
  scheduleScroll();

  // ── Custom cursor follower (skipped on touch devices) ──────
  const cursorDot  = $('#cursorDot');
  const cursorRing = $('#cursorRing');
  const isFinePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (isFinePointer && cursorDot && cursorRing) {
    let dotX = -100, dotY = -100;
    let ringX = -100, ringY = -100;
    let targetX = -100, targetY = -100;
    let rafId = null;
    const HOVER_SEL = 'a, button, [role="button"], [data-copy], .enroll__head, label.ef-field';
    const onMove = (e) => {
      targetX = e.clientX; targetY = e.clientY;
      if (!document.body.classList.contains('has-cursor')) {
        document.body.classList.add('has-cursor');
      }
      if (rafId == null) rafId = requestAnimationFrame(tick);
    };
    const tick = () => {
      // Dot follows instantly, ring lags slightly for a softer feel
      dotX = targetX; dotY = targetY;
      ringX += (targetX - ringX) * 0.18;
      ringY += (targetY - ringY) * 0.18;
      cursorDot.style.transform = `translate(${dotX}px, ${dotY}px) translate(-50%, -50%)`;
      cursorRing.style.transform = `translate(${ringX}px, ${ringY}px) translate(-50%, -50%)`;
      const dist = Math.hypot(targetX - ringX, targetY - ringY);
      if (dist < 0.3) { rafId = null; return; }
      rafId = requestAnimationFrame(tick);
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    window.addEventListener('mouseleave', () => document.body.classList.remove('has-cursor'));
    window.addEventListener('mouseenter', () => document.body.classList.add('has-cursor'));
    document.addEventListener('mouseover', (e) => {
      if (e.target.closest && e.target.closest(HOVER_SEL)) {
        document.body.classList.add('cursor-hover');
      }
    });
    document.addEventListener('mouseout', (e) => {
      if (e.target.closest && e.target.closest(HOVER_SEL)) {
        document.body.classList.remove('cursor-hover');
      }
    });
    window.addEventListener('mousedown', () => document.body.classList.add('cursor-press'));
    window.addEventListener('mouseup',   () => document.body.classList.remove('cursor-press'));
  }

  // ── Number count-up on viewport entry ──────────────────────
  // Any element with data-countup="123" animates from 0 to that value.
  // Optional data-countup-pad="2" zero-pads the result (e.g., 04).
  const countTargets = $$('[data-countup]');
  if (countTargets.length) {
    // Slower easing — count "deliberately" rather than blast through.
    const easeOutQuint = t => 1 - Math.pow(1 - t, 5);
    const animateNum = (el) => {
      const target = parseFloat(el.dataset.countup);
      const pad = parseInt(el.dataset.countupPad || '0', 10);
      // Small numbers need a longer base duration so each integer step is readable.
      const base = target < 20 ? 2800 : 2200;
      const dur = base + Math.random() * 400;
      const start = performance.now();
      const tick = (now) => {
        const t = Math.min(1, (now - start) / dur);
        const v = Math.round(target * easeOutQuint(t));
        el.textContent = pad ? String(v).padStart(pad, '0') : String(v);
        if (t < 1) requestAnimationFrame(tick);
        else el.dataset.countupDone = '1';
      };
      requestAnimationFrame(tick);
    };
    const co = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting && !e.target.dataset.countupDone) {
          animateNum(e.target);
          co.unobserve(e.target);
        }
      });
    }, { threshold: 0.5 });
    countTargets.forEach(el => co.observe(el));
  }

  // ── Floating-label form: ensure every text input has a placeholder
  // so :placeholder-shown / :has() floating rule can trigger correctly.
  $$('.ef-field input').forEach(input => {
    if (input.type === 'file' || input.type === 'hidden') return;
    if (!input.hasAttribute('placeholder')) input.setAttribute('placeholder', ' ');
  });

  // ── Boot ───────────────────────────────────────────────────
  function init() {
    resizeCanvas();
    buildParticles();
    requestAnimationFrame(update);
    document.body.classList.add('is-loaded');
  }

  window.addEventListener('resize', resizeCanvas, { passive: true });
  if (document.readyState === 'complete' || document.readyState === 'interactive') init();
  else document.addEventListener('DOMContentLoaded', init);
})();
