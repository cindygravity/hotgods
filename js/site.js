/* ============================================================
   CINDY GRAVITY :: band site logic
   - boot screen → staggered build-up of the page
   - wordmark: per-slice pixel resolve, letters glitch at
     independent speeds
   - minidisc player: tries real files in assets/tracks/,
     falls back to simulated playback (10x speed) if missing
   - oracle ant → hidden console layer (newsletter funnel)
   Tour data mocked — swap for Bandsintown fetch later.
   ============================================================ */

const rnd = (n) => Math.floor(Math.random() * n);
const pick = (arr) => arr[rnd(arr.length)];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* always start at the top on (re)load — don't restore the old scroll pos */
if ("scrollRestoration" in history) history.scrollRestoration = "manual";
window.scrollTo(0, 0);
window.addEventListener("load", () => window.scrollTo(0, 0));

/* ---------- theme toggle ---------- */
const body = document.body;
const toggle = document.getElementById("themeToggle");

function applyTheme(mode) {
  body.dataset.theme = mode;
  localStorage.setItem("orbital-theme", mode);
  toggle.querySelectorAll(".theme-toggle__opt").forEach((el) => {
    el.classList.toggle("is-on", el.dataset.mode === mode);
  });
}
const THEMES = ["nebula", "paper"];   // nebula = default (dark), paper = light
toggle.addEventListener("click", () => {
  applyTheme(THEMES[(THEMES.indexOf(body.dataset.theme) + 1) % THEMES.length]);
  renderWordmark();               // repaint in the new ink
  if (typeof drawBird === "function") drawBird();  // re-tint the rosé bird
});
const savedTheme = localStorage.getItem("orbital-theme");
applyTheme(THEMES.includes(savedTheme) ? savedTheme : "nebula");

/* ---------- moon phase countdown ---------- */
const SYNODIC = 29.530588853;                 // days between new moons
const REF_NEW = Date.UTC(2000, 0, 6, 18, 14) / 86400000; // known new moon (days)
function moonMsg() {
  const now = Date.now() / 86400000;
  const age = (((now - REF_NEW) % SYNODIC) + SYNODIC) % SYNODIC; // days since last new
  const toNew = SYNODIC - age;
  const toFull = age < SYNODIC / 2 ? SYNODIC / 2 - age : SYNODIC * 1.5 - age;
  const [d, what] = toFull <= toNew ? [toFull, "FULL MOON"] : [toNew, "NEW MOON"];
  const n = Math.round(d);
  if (n <= 0) return `${what} TONIGHT`;
  return `${n} DAY${n === 1 ? "" : "S"} TO ${what}`;
}

/* ---------- status bar: rotating band telemetry ---------- */
const MSGS = [
  () => `NEW SONG "One Time, Two Times, Three Times in a Row" OUT NOW`,
  "NEXT SHOW :: SEP 12 · BERLIN",
  moonMsg,                                     // live moon countdown
];
const telemetry = document.getElementById("telemetry");
let msgIndex = 0;
function tickTelemetry() {
  const m = MSGS[msgIndex % MSGS.length];
  telemetry.textContent = typeof m === "function" ? m() : m;
  msgIndex++;
}
tickTelemetry();
setInterval(tickTelemetry, 3200);

/* ---------- pixel creature generator (shared) ---------- */
function buildGlyph(el, cols = 9, rows = 8, density = 1) {
  el.innerHTML = "";
  el.style.gridTemplateColumns = `repeat(${cols}, var(--cell))`;
  const cells = new Array(cols * rows).fill(0);
  const walks = 2 + rnd(2);
  for (let w = 0; w < walks; w++) {
    let x = Math.floor(cols / 2) + rnd(3) - 1;
    let y = Math.floor(rows / 2) + rnd(3) - 1;
    const steps = Math.round((12 + rnd(12)) * density);
    for (let s = 0; s < steps; s++) {
      cells[y * cols + x] = Math.random() < 0.78 ? 1 : 2;
      const dir = rnd(4);
      if (dir === 0 && x > 0) x--;
      if (dir === 1 && x < cols - 1) x++;
      if (dir === 2 && y > 0) y--;
      if (dir === 3 && y < rows - 1) y++;
    }
  }
  const onCells = cells.map((v, i) => (v === 1 ? i : -1)).filter((i) => i >= 0);
  const hotIndex = onCells.length ? pick(onCells) : -1;
  cells.forEach((v, i) => {
    const cell = document.createElement("i");
    if (i === hotIndex) cell.className = "hot";
    else if (v === 1) cell.className = "on";
    else if (v === 2) cell.className = "box";
    el.appendChild(cell);
  });
}

document.querySelectorAll("[data-glyph]").forEach((el) => {
  buildGlyph(el, 9, 8);
  el.addEventListener("click", () => buildGlyph(el, 9, 8));
});

/* ============================================================
   WORDMARK — per-slice pixel resolve
   The canvas is split into vertical slices (≈ letters). Each
   slice resolves from blocks to crisp at its own speed, then
   glitches independently: brief drops back to low resolution
   with a small vertical jolt.
   ============================================================ */
const wm = document.getElementById("wordmark");
const wmCtx = wm.getContext("2d");
const wmImg = new Image();
wmImg.src = "assets/wordmark.svg";
const WM_W = 230, WM_H = 120;           // SVG intrinsic size
const WM_SLICES = 8;                    // ≈ one per letter-ish
const WM_STEPS = [0.03, 0.05, 0.08, 0.12, 0.2, 0.35, 0.6, 1];
const wmOff = document.createElement("canvas");
let wmSlices = [];
let wmStarted = false;
let wmTicker = null;

/* --- second render mode: "buckets" (C4D-style render regions).
   A grid lies over the wordmark; a few active buckets at a time
   refine their cell from heavy pixels to lightly pixelated, in
   scan order, framed in the accent color while rendering. --- */
const GRID_COLS = 6, GRID_ROWS = 3;
const GRID_BASE = 0.045;                     // unrendered: heavy pixels
const GRID_STEPS = [0.09, 0.16, 0.3, 0.55];  // final stays lightly pixelated
const GRID_CONCURRENT = 3;                   // buckets rendering at once
let gridCells = [];
let gridQueue = [];
const wmMode = "buckets";

function sizeWordmark() {
  const cssW = Math.min(wm.parentElement.clientWidth - 8, 320);
  const cssH = Math.round(cssW * (WM_H / WM_W));
  wm.style.width = cssW + "px";
  wm.style.height = cssH + "px";
  wm.width = cssW * 2;
  wm.height = cssH * 2;
}

function initSlices() {
  wmSlices = Array.from({ length: WM_SLICES }, () => ({
    step: 0,
    speed: 2 + rnd(5),   // ticks per resolve step → letters differ
    tick: rnd(4),
    glitch: 0,
    gRes: 0.06,
    jolt: 0,
  }));
}

function renderWordmark() {
  if (!wmStarted || !wmImg.complete || !wmImg.naturalWidth) return;
  if (wmMode === "buckets") { if (gridCells.length) renderWordmarkGrid(); }
  else if (wmSlices.length) renderWordmarkSlices();
}

function recolorToInk() {
  wmCtx.globalCompositeOperation = "source-in";
  // the wordmark wears the light-grey highlight (--wm), not the body ink
  const cs = getComputedStyle(body);
  wmCtx.fillStyle = (cs.getPropertyValue("--wm") || cs.getPropertyValue("--ink")).trim();
  wmCtx.fillRect(0, 0, wm.width, wm.height);
  wmCtx.globalCompositeOperation = "source-over";
}

function renderWordmarkSlices() {
  const octx = wmOff.getContext("2d");
  const srcSliceW = WM_W / WM_SLICES;
  const dstSliceW = wm.width / WM_SLICES;
  wmCtx.clearRect(0, 0, wm.width, wm.height);
  wmCtx.imageSmoothingEnabled = false;

  wmSlices.forEach((s, i) => {
    const res = s.glitch > 0 ? s.gRes : WM_STEPS[s.step];
    const w = Math.max(2, Math.round(srcSliceW * res));
    const h = Math.max(3, Math.round(WM_H * res));
    wmOff.width = w;
    wmOff.height = h;
    octx.drawImage(wmImg, i * srcSliceW, 0, srcSliceW, WM_H, 0, 0, w, h);
    const dy = s.glitch > 0 ? s.jolt : 0;
    wmCtx.drawImage(wmOff, 0, 0, w, h, i * dstSliceW, dy, dstSliceW, wm.height);
  });

  recolorToInk();
}

function renderWordmarkGrid() {
  const octx = wmOff.getContext("2d");
  const srcW = WM_W / GRID_COLS, srcH = WM_H / GRID_ROWS;
  const dstW = wm.width / GRID_COLS, dstH = wm.height / GRID_ROWS;
  wmCtx.clearRect(0, 0, wm.width, wm.height);
  wmCtx.imageSmoothingEnabled = false;

  gridCells.forEach((cell, i) => {
    const c = i % GRID_COLS, r = Math.floor(i / GRID_COLS);
    const res = cell.step < 0 ? GRID_BASE : GRID_STEPS[cell.step];
    const w = Math.max(2, Math.round(srcW * res));
    const h = Math.max(2, Math.round(srcH * res));
    wmOff.width = w;
    wmOff.height = h;
    octx.drawImage(wmImg, c * srcW, r * srcH, srcW, srcH, 0, 0, w, h);
    wmCtx.drawImage(wmOff, 0, 0, w, h, c * dstW, r * dstH, dstW, dstH);
  });

  recolorToInk();

  // frame the buckets that are currently rendering (like C4D render regions)
  const accent = getComputedStyle(body).getPropertyValue("--accent").trim();
  wmCtx.strokeStyle = accent;
  wmCtx.lineWidth = 2;
  gridCells.forEach((cell, i) => {
    if (!cell.active) return;
    const c = i % GRID_COLS, r = Math.floor(i / GRID_COLS);
    wmCtx.strokeRect(c * dstW + 1, r * dstH + 1, dstW - 2, dstH - 2);
  });
}

function initGrid() {
  gridCells = Array.from({ length: GRID_COLS * GRID_ROWS }, () => ({
    step: -1,          // -1 = untouched, still at base resolution
    active: false,
  }));
  gridQueue = gridCells.map((_, i) => i);   // scan order, like render buckets
  for (let k = 0; k < GRID_CONCURRENT; k++) activateNextBucket();
}

function activateNextBucket() {
  const i = gridQueue.shift();
  if (i === undefined) return;
  gridCells[i].active = true;
}

function gridTick() {
  let dirty = false;
  gridCells.forEach((cell) => {
    if (!cell.active) return;
    cell.step++;
    dirty = true;
    if (cell.step >= GRID_STEPS.length - 1) {
      cell.active = false;
      activateNextBucket();
    }
  });
  // fully rendered: occasionally a random bucket re-renders itself
  if (!gridQueue.length && !gridCells.some((c) => c.active) && Math.random() < 0.02) {
    const i = rnd(gridCells.length);
    gridCells[i] = { step: -1, active: true };
    dirty = true;
  }
  if (dirty) renderWordmark();
}

function slicesTick() {
  let dirty = false;
  wmSlices.forEach((s) => {
    if (s.glitch > 0) {
      s.glitch--;
      dirty = true;
    } else if (s.step < WM_STEPS.length - 1) {
      if (++s.tick >= s.speed) {
        s.tick = 0;
        s.step++;
      }
      dirty = true;
    } else if (Math.random() < 0.008) {
      // resolved letters occasionally glitch on their own clock
      s.glitch = 1 + rnd(3);
      s.gRes = pick([0.04, 0.08, 0.15]);
      s.jolt = (rnd(5) - 2) * 5;
      dirty = true;
    }
  });
  if (dirty) renderWordmark();
}

function wmTick() {
  if (wmMode === "buckets") gridTick();
  else slicesTick();
}

function startWordmark() {
  wmStarted = true;
  if (!wmImg.complete || !wmImg.naturalWidth) return; // onload will call back
  sizeWordmark();
  if (reducedMotion) {
    wmSlices = Array.from({ length: WM_SLICES }, () => ({
      step: WM_STEPS.length - 1, speed: 1, tick: 0, glitch: 0, gRes: 1, jolt: 0,
    }));
    gridCells = Array.from({ length: GRID_COLS * GRID_ROWS }, () => ({
      step: GRID_STEPS.length - 1, active: false,
    }));
    gridQueue = [];
    renderWordmark();
    return;
  }
  initSlices();
  initGrid();
  renderWordmark();
  if (!wmTicker) wmTicker = setInterval(wmTick, 130);
}

wmImg.onload = () => { if (wmStarted) startWordmark(); };

window.addEventListener("resize", () => {
  if (!wmStarted) return;
  sizeWordmark();
  renderWordmark();
});

wm.addEventListener("click", () => {
  if (!reducedMotion) (wmMode === "buckets" ? initGrid() : initSlices());
});

/* wordmark renders in BUCKETS mode (C4D render regions); the SLICES/BUCKETS
   toggle was removed from the UI — buckets is the keeper. */

/* ============================================================
   CD PLAYER — the disc is the centrepiece
   Plays the real single from assets/music/. The cover art is drawn
   PIXELATED onto the round disc (canvas: raster the cover small, upscale
   with imageSmoothingEnabled=false, colours kept). On play the disc
   spins UP with a ramp (rAF eases angular velocity) and coasts down on
   pause, so it reads like a real CD spinning up.
   ============================================================ */
const TRACKS = [
  { n: "01", title: "One Time, Two Times, Three Times in a Row",
    src: "assets/music/one-two-three.mp3", cover: "assets/cover/one-two-three.jpg" },
  { n: "02", title: "Hot Gods",
    src: "assets/music/hot-gods.mp3", cover: "assets/cover/hot-gods.jpg" },
  { n: "03", title: "I’m So Scared (Of Climate Change)",
    src: "assets/music/im-so-scared.mp3", cover: "assets/cover/im-so-scared.jpg" },
];

const audio = new Audio();
audio.preload = "metadata";
const plTitle = document.getElementById("plTitle");
const plTime = document.getElementById("plTime");
const plPlay = document.getElementById("plPlay");
const plPause = document.getElementById("plPause");
const cd = document.getElementById("cd");
const cdSpin = document.getElementById("cdSpin");
const cdArt = document.getElementById("cdArt");
const cdCtx = cdArt.getContext("2d");

let plCur = 0;
let plState = "stopped";       // "playing" | "paused" | "stopped"

const fmt = (s) =>
  isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}` : "0:00";

/* --- pixelated cover baked onto the disc (swapped per track) --- */
const CD_PX = 480;         // canvas backing size
const CD_LOWW = 150;       // raster the cover this small, then upscale = pixels (higher = finer)
const coverImg = new Image();
function drawCover() {
  cdArt.width = CD_PX; cdArt.height = CD_PX;
  if (!coverImg.complete || !coverImg.naturalWidth) return;
  const off = document.createElement("canvas");
  off.width = CD_LOWW; off.height = CD_LOWW;
  off.getContext("2d").drawImage(coverImg, 0, 0, CD_LOWW, CD_LOWW);
  cdCtx.imageSmoothingEnabled = false;
  cdCtx.clearRect(0, 0, CD_PX, CD_PX);
  cdCtx.drawImage(off, 0, 0, CD_LOWW, CD_LOWW, 0, 0, CD_PX, CD_PX);
}
coverImg.onload = drawCover;

/* --- disc spin with a realistic ramp (rAF eases angular velocity) --- */
let cdAngle = 0, cdVel = 0, cdTarget = 0, cdRAF = null, cdLast = 0;
const CD_MAX = 0.16;       // deg/ms at full speed (~one turn / 2.25s)
function cdTick(t) {
  const dt = cdLast ? t - cdLast : 16;
  cdLast = t;
  cdVel += (cdTarget - cdVel) * Math.min(1, dt / 380);   // ~0.4s ramp
  cdAngle = (cdAngle + cdVel * dt) % 360;
  cdSpin.style.transform = `rotate(${cdAngle}deg)`;
  if (cdVel > 0.002 || cdTarget > 0) cdRAF = requestAnimationFrame(cdTick);
  else { cdVel = 0; cdLast = 0; cdRAF = null; }
}
function cdSpinning(on) {
  if (reducedMotion) return;             // no spin under reduced-motion
  cdTarget = on ? CD_MAX : 0;
  cdLast = 0;
  if (!cdRAF) cdRAF = requestAnimationFrame(cdTick);
}

/* --- EQUALIZER (left half of the slot) — a REAL spectrum via Web Audio
   (AnalyserNode, smoothed so it isn't hectic). Works when the page is
   served over http (e.g. the phone server); on bare file:// the analyser
   can read all-zero, so it falls back to a calm fake spectrum. Bars settle
   low when not playing. --- */
const eq = document.getElementById("eq");
const eqCtx = eq.getContext("2d");
const EQ_N = 20;
const eqPhase = Array.from({ length: EQ_N }, () => Math.random() * Math.PI * 2);
const eqSpeed = Array.from({ length: EQ_N }, () => 0.003 + Math.random() * 0.005);
let eqRAF = null;

/* Web Audio graph — built lazily on first play (needs a user gesture) */
let actx = null, analyser = null, freqData = null, eqReal = false;
let analyserDead = false, playStart = 0;    // fake-EQ fallback timing
function ensureGraph() {
  if (actx) return;
  try {
    actx = new (window.AudioContext || window.webkitAudioContext)();
    const src = actx.createMediaElementSource(audio);
    analyser = actx.createAnalyser();
    analyser.fftSize = 128;                  // 64 frequency bins
    analyser.smoothingTimeConstant = 0.85;   // smooth → not hectic
    src.connect(analyser);
    analyser.connect(actx.destination);      // keep the sound audible
    freqData = new Uint8Array(analyser.frequencyBinCount);
  } catch (e) { analyser = null; }           // → fall back to the fake EQ
}

function sizeEq() {
  eq.width = Math.max(60, eq.clientWidth) * 2;
  eq.height = Math.max(24, eq.clientHeight) * 2;
}
function drawEq(t) {
  const W = eq.width, H = eq.height, live = plState === "playing";
  const cs = getComputedStyle(body);
  const cBar = cs.getPropertyValue("--accent-2").trim() || "#d98fb4";
  const cCap = cs.getPropertyValue("--accent").trim() || "#ffad33";
  const lvl = new Array(EQ_N).fill(0.05);    // resting bars
  const fake = () => {
    for (let i = 0; i < EQ_N; i++)
      lvl[i] = 0.1 + 0.9 * Math.abs(Math.sin(t * eqSpeed[i] + eqPhase[i])) *
               (0.6 + 0.4 * Math.sin(t * 0.0015 + i * 0.6));
  };
  if (live) {
    if (eqReal) {
      analyser.getByteFrequencyData(freqData);
      const usable = Math.floor(freqData.length * 0.7);   // drop empty highs
      for (let i = 0; i < EQ_N; i++) {
        const lo = Math.floor((i / EQ_N) * usable);
        const hi = Math.max(lo + 1, Math.floor(((i + 1) / EQ_N) * usable));
        let m = 0; for (let b = lo; b < hi; b++) m = Math.max(m, freqData[b]);
        lvl[i] = (m / 255) ** 1.35;
      }
    } else if (analyser && !analyserDead) {
      analyser.getByteFrequencyData(freqData);
      let sum = 0; for (const v of freqData) sum += v;
      if (sum > 0) { eqReal = true; return drawEq(t); }     // real signal arrived
      // no signal yet: keep bars low (don't fake-burst); after 1s give up
      if (performance.now() - playStart > 1000) { analyserDead = true; fake(); }
    } else {
      fake();                                                // file:// / no Web Audio
    }
  }
  eqCtx.clearRect(0, 0, W, H);
  const gap = 5, bw = (W - gap * (EQ_N + 1)) / EQ_N;
  for (let i = 0; i < EQ_N; i++) {
    const bh = Math.max(2, lvl[i] * H * 0.94);
    const x = gap + i * (bw + gap);
    eqCtx.fillStyle = cBar;
    eqCtx.fillRect(x, H - bh, bw, bh);
    eqCtx.fillStyle = cCap;                  // hot cap on the peak
    eqCtx.fillRect(x, H - bh, bw, Math.min(bh, H * 0.08));
  }
}
function eqTick(t) {
  drawEq(t);
  if (plState === "playing" && !reducedMotion) eqRAF = requestAnimationFrame(eqTick);
  else eqRAF = null;
}
function eqStart() { if (!eqRAF && !reducedMotion) eqRAF = requestAnimationFrame(eqTick); }

/* --- WAVEFORM (right half of the slot) — a SoundCloud-style bar waveform
   that SCROLLS right→left past a fixed centre playhead: the bar at "now"
   sits on the centre line, played bars (left of it) are accent, upcoming
   bars (right) are grey. Fake fixed shape (whole song = WAVE_N bars). --- */
const wave = document.getElementById("wave");
const waveCtx = wave.getContext("2d");
const WAVE_N = 1200;                         // high-res amplitude table (whole song)
// one distinct fake waveform per track, so they don't all look identical
function makeWaveTable(seed) {
  const a = 0.7 + seed * 0.31, b = 1.3 + seed * 0.7, c = 2 + seed * 1.1;
  return Array.from({ length: WAVE_N }, (_, i) => {
    const j = i + seed * 613;
    return 0.12 + 0.88 * Math.min(1, Math.abs(
      Math.sin(j * 0.11 * a) * 0.45 + Math.sin(j * 0.037 + b) * 0.3 +
      Math.sin(j * 0.29 + c) * 0.28 + Math.sin(j * 0.013 * a) * 0.22));
  });
}
const WAVE_TABLES = [0, 1, 2].map(makeWaveTable);
let waveRAF = null;
function sizeWave() {
  wave.width = Math.max(60, wave.clientWidth) * 2;
  wave.height = Math.max(20, wave.clientHeight) * 2;
}
function drawWave() {
  const W = wave.width, H = wave.height, cx = W / 2;
  const dur = audio.duration || 1, t = audio.currentTime;
  const pxps = W / 22;                       // ~22s window across the canvas
  const STEP = 4, BARW = 2;                   // fine strokes: ~2px apart, 1px wide (device px)
  const cs = getComputedStyle(body);
  const played = cs.getPropertyValue("--accent").trim() || "#ffad33";
  const rest = "#4d4d55";
  const bars = WAVE_TABLES[plCur] || WAVE_TABLES[0];
  waveCtx.clearRect(0, 0, W, H);
  for (let x = 0; x <= W; x += STEP) {
    const bt = t + (x - cx) / pxps;          // audio time at this x (now = centre)
    if (bt < 0 || bt > dur) continue;
    const idx = Math.min(WAVE_N - 1, Math.floor((bt / dur) * WAVE_N));
    const bh = Math.max(2, bars[idx] * H * 0.9);
    waveCtx.fillStyle = bt <= t ? played : rest;
    waveCtx.fillRect(x, (H - bh) / 2, BARW, bh);
  }
  waveCtx.fillStyle = (cs.getPropertyValue("--wm") || cs.getPropertyValue("--ink")).trim();
  waveCtx.fillRect(cx - 1, 0, 2, H);         // fixed centre playhead
}
function waveTick() {
  drawWave();
  waveRAF = plState === "playing" && !reducedMotion ? requestAnimationFrame(waveTick) : null;
}
function waveStart() { if (!waveRAF && !reducedMotion) waveRAF = requestAnimationFrame(waveTick); }

/* --- transport: PLAY & PAUSE are a radio pair (one stays held); STOP
   releases both and rewinds; PREV / NEXT skip through the tracks --- */
function renderPlayer() {
  plTitle.textContent = TRACKS[plCur].title;
  plTime.textContent = `${fmt(audio.currentTime)} / ${fmt(audio.duration)}`;
  drawWave();
}
function applyState() {
  const playing = plState === "playing";
  cd.classList.toggle("is-playing", playing);
  plPlay.classList.toggle("is-on", playing);
  plPause.classList.toggle("is-on", plState === "paused");
  cdSpinning(playing);
  if (playing) { eqStart(); waveStart(); }
  else { drawEq(performance.now()); drawWave(); }   // settle EQ, freeze wave
}
function play() {
  if (!audio.src) return;
  ensureGraph();
  if (actx && actx.state === "suspended") actx.resume();
  playStart = performance.now();     // for the EQ fake-fallback timeout
  plState = "playing";
  audio.play().catch(() => {});
  applyState();
  renderPlayer();
}
function pauseTrack() {
  if (plState !== "playing") return;
  plState = "paused";
  audio.pause();
  applyState();
  renderPlayer();
}
function stop() {
  plState = "stopped";
  audio.pause();
  audio.currentTime = 0;
  applyState();
  renderPlayer();
}
function loadTrack(i) {
  plCur = i;
  audio.src = encodeURI(TRACKS[i].src);
  coverImg.src = encodeURI(TRACKS[i].cover);       // swap the disc art
  renderPlayer();
}
function skip(dir) {
  const wasPlaying = plState === "playing";
  loadTrack((plCur + dir + TRACKS.length) % TRACKS.length);
  wasPlaying ? play() : stop();
}

audio.addEventListener("timeupdate", renderPlayer);
audio.addEventListener("loadedmetadata", renderPlayer);
audio.addEventListener("ended", () => skip(1));

plPlay.addEventListener("click", play);
plPause.addEventListener("click", pauseTrack);
document.getElementById("plStop").addEventListener("click", stop);
document.getElementById("plPrev").addEventListener("click", () => skip(-1));
document.getElementById("plNext").addEventListener("click", () => skip(1));
window.addEventListener("resize", () => {
  sizeEq(); sizeWave();
  drawEq(performance.now()); drawWave();
});

sizeEq();
sizeWave();
loadTrack(0);
stop();

/* ---------- 02 tour — real dates from the Bandsintown API ----------
   Falls back to sample dates if the fetch fails (offline / CORS / no shows).
   app_id is a public client identifier, safe to ship in the page. */
const BIT_ARTIST = "Cindy Gravity";
const BIT_APPID = "da85f5898eb69e00d7ca5b15d0bdc459";
const tourList = document.getElementById("tourList");
const tourFeed = document.getElementById("tourFeed");
const TOUR_MOCK = [
  { date: "SEP\n12", city: "BERLIN", venue: "SCHOKOLADEN", soldout: false },
  { date: "SEP\n14", city: "HAMBURG", venue: "MOLOTOW SKYBAR", soldout: false },
  { date: "SEP\n15", city: "COPENHAGEN", venue: "LOPPEN", soldout: true },
  { date: "SEP\n18", city: "AMSTERDAM", venue: "CINETOL", soldout: false },
  { date: "SEP\n20", city: "LONDON", venue: "THE WINDMILL", soldout: false },
];
const esc = (s) => String(s).replace(/[&<>"]/g,
  (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function renderTour(rows) {
  tourList.innerHTML = rows.map((t) => `
  <div class="tour__row">
    <span class="tour__date">${esc(t.date)}</span>
    <span class="tour__place">${esc(t.city)}<span class="tour__venue">${esc(t.venue)}</span></span>
    <a class="tour__tix${t.soldout ? " is-soldout" : ""}" href="${esc(t.url || "#")}"${t.url && t.url !== "#" ? ' target="_blank" rel="noopener"' : ""}>
      ${t.soldout ? "SOLD OUT" : t.free ? "FREE ▸" : "TIX ▸"}
    </a>
  </div>`).join("");
}

async function loadTour() {
  const url = `https://rest.bandsintown.com/artists/${encodeURIComponent(BIT_ARTIST)}/events?app_id=${BIT_APPID}&date=upcoming`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("status " + res.status);
    const data = await res.json();
    if (!Array.isArray(data) || !data.length) {
      renderTour([]);
      if (tourFeed) tourFeed.textContent = "FEED :: BANDSINTOWN · NO UPCOMING SHOWS";
      return;
    }
    const rows = data.map((ev) => {
      const d = new Date(ev.datetime);
      const mon = d.toLocaleString("en-US", { month: "short" }).toUpperCase();
      const offers = ev.offers || [];
      const off = offers.find((o) => o.type === "Tickets") || offers[0];
      const soldout = !!off && /sold\s*out/i.test(off.status || "");
      return {
        date: `${mon}\n${d.getDate()}`,
        city: ((ev.venue && ev.venue.city) || "TBA").toUpperCase(),
        venue: (ev.venue && ev.venue.name) || "",
        url: (off && off.url) || ev.url || "#",
        soldout,
        free: !!off && off.type === "Free",
      };
    });
    renderTour(rows);
    if (tourFeed) tourFeed.textContent = "FEED :: BANDSINTOWN · LIVE";
  } catch (e) {
    renderTour(TOUR_MOCK);
    if (tourFeed) tourFeed.textContent = "FEED :: BANDSINTOWN OFFLINE — SAMPLE DATES";
  }
}
renderTour(TOUR_MOCK);   // paint sample immediately, then live data replaces it
loadTour();

/* ---------- Kit (newsletter provider) ----------
   All three signup points (newsletter, tour radar, hidden console) POST to
   the same Kit form, so every subscriber + name + city lands in one place.
   We keep our own pixel-styled forms — we only talk to Kit's endpoint, we
   don't embed Kit's styled widget. Fields match the band's live Kit setup:
   email_address / fields[first_name] / fields[city]. */
const KIT_FORM = "9652794";
async function kitSubscribe({ email, name = "", city = "" }) {
  const body = new URLSearchParams();
  body.set("email_address", email);
  if (name) body.set("fields[first_name]", name);
  if (city) body.set("fields[city]", city);
  const res = await fetch(`https://app.kit.com/forms/${KIT_FORM}/subscriptions`, {
    method: "POST",
    headers: { Accept: "application/json" },
    body,
  });
  if (!res.ok) throw new Error("kit " + res.status);
  return res.json().catch(() => ({}));
}

/* ---------- tour proximity alert → Kit ---------- */
const notifyForm = document.getElementById("notifyForm");
const notifySubmit = document.getElementById("notifySubmit");
notifyForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const [cityI, emailI] = notifyForm.querySelectorAll("input"); // city, then email
  notifySubmit.disabled = true;
  notifySubmit.textContent = "SENDING…";
  try {
    await kitSubscribe({ email: emailI.value, city: cityI.value });
    notifySubmit.textContent = "ON THE RADAR ✓";
  } catch {
    notifySubmit.textContent = "ERROR — TRY AGAIN";
    notifySubmit.disabled = false;
  }
});

/* ---------- 03 scan portrait (dithered band photos, cycling) ----------
   All photos in assets/bandfotos/ are pre-dithered into
   assets/portraits/pN-{theme}-d{1,2,3}.png (tools/dither.py).
   The portrait is a 4x5 grid of render buckets, like the wordmark:
   the first scan renders bucket by bucket, and every photo change
   sweeps through the buckets individually, slightly staggered. */
const SCAN_PHOTOS = 6;
const SCAN_COLS = 4, SCAN_ROWS = 5;
const SCAN_STAGGER = 70;    // ms offset from one bucket to the next
const SCAN_REFINE = 170;    // ms per resolution step inside a bucket
const SCAN_CYCLE = 8000;    // ms between automatic photo changes

const scanImg = document.getElementById("scanImg");
const scanStatus = document.getElementById("scanStatus");
let scanPhoto = 1;
let scanBusy = false;
let scanSeen = false;

function scanPrewarm(theme) {
  for (let p = 1; p <= SCAN_PHOTOS; p++)
    ["d1", "d2", "d3"].forEach((d) => {
      new Image().src = `assets/portraits/p${p}-${theme}-${d}.png`;
    });
}
scanPrewarm(body.dataset.theme);

const scanCells = [];
for (let r = 0; r < SCAN_ROWS; r++) {
  for (let c = 0; c < SCAN_COLS; c++) {
    const el = document.createElement("div");
    el.className = "scan__cell";
    el.style.backgroundPosition =
      `${(c / (SCAN_COLS - 1)) * 100}% ${(r / (SCAN_ROWS - 1)) * 100}%`;
    scanImg.appendChild(el);
    scanCells.push({ el, photo: 1, res: 1 });
  }
}

function scanSetCell(cell, photo, res) {
  cell.photo = photo;
  cell.res = res;
  cell.el.style.backgroundImage =
    `url("assets/portraits/p${photo}-${body.dataset.theme}-d${res}.png")`;
}
scanCells.forEach((cell) => scanSetCell(cell, 1, 1)); // coarse until revealed

/* repaint every bucket in its current state (used on theme switch) */
function scanRefresh() {
  scanCells.forEach((cell) => scanSetCell(cell, cell.photo, cell.res));
}

function scanDone(photo) {
  scanBusy = false;
  scanPhoto = photo;
  scanStatus.textContent = `SCAN COMPLETE · FRAME ${photo}/${SCAN_PHOTOS}`;
}

function scanShowInstant(photo) {
  scanCells.forEach((cell) => scanSetCell(cell, photo, 3));
  scanDone(photo);
}

/* bucket sweep to a photo: each bucket flips to the new photo coarse,
   refines d1 -> d2 -> d3 with an accent frame, offset bucket by bucket */
function scanSweep(photo) {
  scanBusy = true;
  scanStatus.textContent = "RENDERING…";
  const last = scanCells.length - 1;
  scanCells.forEach((cell, i) => {
    const t0 = i * SCAN_STAGGER;
    setTimeout(() => {
      cell.el.classList.add("is-rendering");
      scanSetCell(cell, photo, 1);
    }, t0);
    setTimeout(() => scanSetCell(cell, photo, 2), t0 + SCAN_REFINE);
    setTimeout(() => {
      scanSetCell(cell, photo, 3);
      cell.el.classList.remove("is-rendering");
      if (i === last) scanDone(photo);
    }, t0 + 2 * SCAN_REFINE);
  });
}

function scanNext() {
  if (scanBusy || !scanSeen) return;
  const next = (scanPhoto % SCAN_PHOTOS) + 1;
  if (reducedMotion) scanShowInstant(next);
  else scanSweep(next);
}

const scanObserver = new IntersectionObserver(
  (entries) => {
    if (entries.some((e) => e.isIntersecting)) {
      scanSeen = true;
      if (reducedMotion) scanShowInstant(1);
      else scanSweep(1);
      scanObserver.disconnect(); // first scan runs once, on reveal
    }
  },
  { threshold: 0.35 }
);
scanObserver.observe(scanImg);

setInterval(scanNext, SCAN_CYCLE);
document.getElementById("scanModule").addEventListener("click", scanNext);

/* theme switch repaints the buckets in the other theme's PNGs
   (runs after applyTheme — listeners fire in registration order) */
toggle.addEventListener("click", () => {
  scanRefresh();
  scanPrewarm(body.dataset.theme);
});

/* ---------- 04 newsletter form → Kit ---------- */
const signalForm = document.getElementById("signalForm");
const signalBtn = document.getElementById("signalBtn");
signalForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const emailI = signalForm.querySelector('input[type="email"]');
  const texts = signalForm.querySelectorAll('input[type="text"]'); // name, city
  signalBtn.disabled = true;
  signalBtn.textContent = "TRANSMITTING…";
  try {
    await kitSubscribe({
      email: emailI.value,
      name: texts[0] ? texts[0].value : "",
      city: texts[1] ? texts[1].value : "",
    });
    signalBtn.textContent = "TRANSMITTED ✓ CHECK YOUR INBOX";
  } catch {
    signalBtn.textContent = "ERROR — TRY AGAIN";
    signalBtn.disabled = false;
  }
});

/* ---------- 05 contact :: pixel social logos ----------
   Hand-drawn sprites like the ant: '#' = ink, '@' = accent, '.' = empty.
   Rendered as pixel grids so the logos live inside the design system. */
const SOCIAL_ICONS = {
  instagram: [
    ".#########.",
    ".#.......#.",
    ".#.....@.#.",
    ".#..###..#.",
    ".#.#...#.#.",
    ".#.#...#.#.",
    ".#..###..#.",
    ".#.......#.",
    ".#########.",
  ],
  facebook: [
    "......###..",
    ".....#.....",
    ".....#.....",
    "...#####...",
    ".....#.....",
    ".....#.....",
    ".....#.....",
    ".....#.....",
    ".....##....",
  ],
  tiktok: [
    "......####.",
    "......#..#.",
    "......#.##.",
    "......#....",
    "......#....",
    "......#....",
    "..#####....",
    ".######....",
    "..####.....",
  ],
  bandcamp: [
    "...........",
    "....#######",
    "...#######.",
    "..#######..",
    ".#######...",
    "#######....",
    "...........",
    "...........",
    "...........",
  ],
  spotify: [
    "...#####...",
    ".##.....##.",
    "#..#####..#",
    "#.#.....#.#",
    "#..#####..#",
    "#.#.....#.#",
    "#..#####..#",
    ".##.....##.",
    "...#####...",
  ],
  tidal: [
    "...........",
    "...#...#...",
    "..###.###..",
    ".##.###.##.",
    "..###.###..",
    "...#...#...",
    "...........",
    "...........",
    "...........",
  ],
  applemusic: [
    ".....###...",
    "....##.#...",
    "...##..#...",
    "...#...#...",
    "...#...#...",
    ".###..###..",
    "#####.####.",
    ".###...###.",
    "..#.....#..",
  ],
  youtube: [
    "...........",
    ".#########.",
    ".###...###.",
    ".###.#.###.",
    ".###.##.##.",
    ".###.#.###.",
    ".###...###.",
    ".#########.",
    "...........",
  ],
};

function drawSprite(el, rows) {
  el.innerHTML = "";
  el.style.gridTemplateColumns = `repeat(${rows[0].length}, var(--px))`;
  rows.forEach((row) => {
    [...row].forEach((ch) => {
      const cell = document.createElement("i");
      if (ch === "#") cell.className = "on";
      else if (ch === "@") cell.className = "hot";
      el.appendChild(cell);
    });
  });
}

document.querySelectorAll("[data-icon]").forEach((el) =>
  drawSprite(el, SOCIAL_ICONS[el.dataset.icon])
);

/* ============================================================
   ORACLE ANT "ZIP" — canvas sprite, gateway to the hidden console
   Rebuilt Jul 9 to match the old cindygravity.com ant: the actual v2
   vector ant (assets/ant/ant{1,2}.svg — a side-view ant facing right)
   rasterised small and scaled up with imageSmoothingEnabled = false —
   same shape, LIGHTLY PIXELATED — then tinted rosé (--accent-2) via
   source-in compositing (works on file://; no pixel readback). Two
   frames = walking legs. Choreography: after boot Zip runs in from the
   left → the bubble blobs up → on ✕ the bubble pops and Zip strides off
   to the right and out of frame.
   ============================================================ */
const antImgs = [new Image(), new Image()];
antImgs[0].src = "assets/ant/ant1.svg";
antImgs[1].src = "assets/ant/ant2.svg";
const ANT_AR = 33 / 41;                 // svg intrinsic height / width
const ANT_DW = 48;                      // css display width
const ANT_DH = Math.round(ANT_DW * ANT_AR);
const ANT_LOWW = 16;                    // rasterise this wide → upscale = pixels (lower = chunkier)
const antOff = document.createElement("canvas");

const oracle = document.getElementById("oracle");
const oracleText = document.getElementById("oracleText");
const oraclePet = document.getElementById("oraclePet");   // now a <canvas>
const antCtx = oraclePet.getContext("2d");
const ORACLE_LINE = "psst. wanna hear an unreleased song?";

function sizeAnt() {
  oraclePet.style.width = ANT_DW + "px";
  oraclePet.style.height = ANT_DH + "px";
  oraclePet.width = ANT_DW * 2;
  oraclePet.height = ANT_DH * 2;
}
function drawAnt(frame) {
  const img = antImgs[frame];
  if (!img.complete || !img.naturalWidth) return;
  const lw = ANT_LOWW, lh = Math.round(lw * ANT_AR);
  antOff.width = lw; antOff.height = lh;
  const octx = antOff.getContext("2d");
  octx.clearRect(0, 0, lw, lh);
  octx.drawImage(img, 0, 0, lw, lh);          // rasterise the vector small
  antCtx.clearRect(0, 0, oraclePet.width, oraclePet.height);
  antCtx.imageSmoothingEnabled = false;
  antCtx.drawImage(antOff, 0, 0, lw, lh, 0, 0, oraclePet.width, oraclePet.height);
  antCtx.globalCompositeOperation = "source-in";   // tint to rosé, keep alpha
  antCtx.fillStyle = getComputedStyle(body).getPropertyValue("--accent-2").trim() || "#d98fb4";
  antCtx.fillRect(0, 0, oraclePet.width, oraclePet.height);
  antCtx.globalCompositeOperation = "source-over";
}
sizeAnt();
let antFrame = 0, antWalking = false, antTyper = null;
antImgs.forEach((img) => (img.onload = () => drawAnt(antFrame)));
// legs shuffle only while Zip is walking
setInterval(() => { if (!oracle.hidden && antWalking) drawAnt((antFrame = 1 - antFrame)); }, 190);

/* ---------- newsletter bird (perched on the Softness Report form) ----------
   Same source-in tint trick as Zip the ant (works on file://), tinted to the
   wordmark's light-grey --wm so it matches the logo (and stays visible on the
   Paper theme). Drawn CRISP — the crane's thin legs would disintegrate if
   pixelated. Re-tints on theme switch. */
const birdImg = new Image();
birdImg.src = "assets/bird.svg";
const BIRD_DW = 70;                        // css display size (square 66 viewBox)
const birdPet = document.getElementById("birdPet");
const birdCtx = birdPet ? birdPet.getContext("2d") : null;
function sizeBird() {
  if (!birdPet) return;
  birdPet.style.width = BIRD_DW + "px";
  birdPet.style.height = BIRD_DW + "px";
  birdPet.width = BIRD_DW * 2;             // retina
  birdPet.height = BIRD_DW * 2;
}
function drawBird() {
  if (!birdCtx || !birdImg.complete || !birdImg.naturalWidth) return;
  birdCtx.clearRect(0, 0, birdPet.width, birdPet.height);
  birdCtx.imageSmoothingEnabled = true;
  birdCtx.drawImage(birdImg, 0, 0, birdPet.width, birdPet.height);
  birdCtx.globalCompositeOperation = "source-in";   // tint to light grey (matches wordmark), keep alpha
  birdCtx.fillStyle = getComputedStyle(body).getPropertyValue("--wm").trim() || "#dcdcdc";
  birdCtx.fillRect(0, 0, birdPet.width, birdPet.height);
  birdCtx.globalCompositeOperation = "source-over";
}
sizeBird();
birdImg.onload = drawBird;

/* --- walk choreography ---------------------------------------- */
const OR_OFFLEFT = "translateX(-160px)";
const OR_REST = "translateX(0)";
const OR_OFFRIGHT = "translateX(115vw)";
const WALK_SPEED = 0.11;                 // px per ms — Zip's natural pace

function antWalkTo(target, dur, done) {
  antWalking = true;
  // stepped transform = pixel-walk, on-brand with the rest of the motion
  oracle.style.transition = `transform ${dur}ms steps(${Math.max(8, Math.round(dur / 95))})`;
  requestAnimationFrame(() => (oracle.style.transform = target));
  const end = (e) => {
    // ignore transitionend bubbling up from the bubble/tail children
    if (e.target !== oracle || e.propertyName !== "transform") return;
    oracle.removeEventListener("transitionend", end);
    antWalking = false;
    drawAnt((antFrame = 0));
    if (done) done();
  };
  oracle.addEventListener("transitionend", end);
}

function revealBubble() {
  oracle.classList.add("is-talking");
  oracleText.textContent = "";
  let i = 0;
  clearInterval(antTyper);
  antTyper = setInterval(() => {
    oracleText.textContent = ORACLE_LINE.slice(0, ++i);
    if (i >= ORACLE_LINE.length) clearInterval(antTyper);
  }, 34);
}

function summonOracle() {
  if (reducedMotion) {                  // no walk-in; appear at rest
    oracle.style.transform = OR_REST;
    oracle.hidden = false;
    drawAnt(0);
    revealBubble();
    return;
  }
  oracle.style.transition = "none";
  oracle.style.transform = OR_OFFLEFT;
  oracle.classList.remove("is-talking");
  oracle.hidden = false;
  drawAnt(0);
  void oracle.offsetWidth;              // commit the off-screen start
  antWalkTo(OR_REST, 160 / WALK_SPEED, revealBubble);  // run in from the left
}

function dismissOracle() {
  clearInterval(antTyper);
  oracle.classList.remove("is-talking");       // bubble pops away FIRST
  if (reducedMotion) { oracle.hidden = true; return; }
  // once the bubble is gone, Zip strides off to the right at normal pace
  setTimeout(() => {
    const dist = window.innerWidth * 1.15 + 60;   // rest → fully off-right
    antWalkTo(OR_OFFRIGHT, dist / WALK_SPEED, () => {
      oracle.hidden = true;
      oracle.style.transition = "none";
      oracle.style.transform = OR_OFFLEFT;        // reset for next summon
    });
  }, 340);
}

document.getElementById("oracleBubble").addEventListener("click", (e) => {
  if (e.target.id === "oracleClose") return;
  openConsole();
});
oraclePet.addEventListener("click", openConsole);
document.getElementById("oracleClose").addEventListener("click", (e) => {
  e.stopPropagation();
  dismissOracle();
});

/* ============================================================
   HIDDEN CONSOLE LAYER
   A secret terminal behind the ant: it talks, you answer,
   it takes your email. Independent of the visible theme —
   this layer is always deep carbon.
   ============================================================ */
const consoleEl = document.getElementById("console");
const consoleLog = document.getElementById("consoleLog");
const consoleActions = document.getElementById("consoleActions");
let consoleBuf = "";
let consoleToken = 0;

function consoleRender(cursor = true) {
  consoleLog.textContent = consoleBuf + (cursor ? "▮" : "");
  consoleEl.scrollTop = consoleEl.scrollHeight;
}

async function typeLine(text, cps = 20) {
  const tok = consoleToken;
  for (const ch of text) {
    if (tok !== consoleToken) throw new Error("console closed");
    consoleBuf += ch;
    consoleRender();
    await sleep(reducedMotion ? 0 : cps);
  }
  consoleBuf += "\n";
  consoleRender();
  await sleep(reducedMotion ? 60 : 320);
}

function consoleChoice(options) {
  return new Promise((resolve) => {
    consoleActions.innerHTML = "";
    options.forEach((opt) => {
      const b = document.createElement("button");
      b.className = "cbtn";
      b.textContent = opt.label;
      b.addEventListener("click", () => {
        consoleActions.innerHTML = "";
        resolve(opt.value);
      });
      consoleActions.appendChild(b);
    });
  });
}

function consoleSignup() {
  return new Promise((resolve) => {
    consoleActions.innerHTML = "";
    const form = document.createElement("form");
    const mk = (type, ph, req) => {
      const i = document.createElement("input");
      i.type = type; i.placeholder = ph; i.required = req;
      return i;
    };
    const email = mk("email", "YOU@EARTH.NET", true);
    const name = mk("text", "YOUR NAME", true);
    const city = mk("text", "YOUR CITY", false);
    const btn = document.createElement("button");
    btn.className = "cbtn";
    btn.type = "submit";
    btn.textContent = "TRANSMIT ▸";
    form.append(email, name, city, btn);
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      consoleActions.innerHTML = "";
      resolve({ email: email.value, name: name.value, city: city.value });
    });
    consoleActions.appendChild(form);
    email.focus();
  });
}

function closeConsole() {
  consoleToken++;
  consoleEl.hidden = true;
}

function openConsole() {
  consoleToken++;
  consoleBuf = "";
  consoleActions.innerHTML = "";
  consoleEl.removeEventListener("click", closeConsole); // clear stale tap-to-return
  consoleEl.hidden = false;
  consoleRender();
  runConsoleScript().catch(() => {}); // aborts silently when closed
}

async function runConsoleScript() {
  const tok = consoleToken;
  await sleep(400);
  await typeLine("> ........................", 28);
  await typeLine("> you followed the ant.");
  await typeLine("> beautiful night, isn't it?");
  await typeLine("> sign up to the softness report ... cindy's mailing list.");
  await typeLine("> be the first to get any of our new releases,");
  await typeLine("> first dibs on merch and tickets.");
  await typeLine("> also: we send you an unreleased song.");
  await typeLine("> see you on the other side →");

  const yes = await consoleChoice([
    { label: "Y — LET'S GO", value: true },
    { label: "N — I FORGOT SOMETHING AT HOME", value: false },
  ]);
  if (tok !== consoleToken) return;

  if (yes) {
    await typeLine("> the wind and the stars and the moons are aligned.");
    const sub = await consoleSignup();
    if (tok !== consoleToken) return;
    await typeLine(`> ${sub.email.toUpperCase()}`, 6);
    kitSubscribe(sub).catch(() => {}); // send to Kit; the intimate flow doesn't surface errors
    await typeLine("> verifying ..........", 40);
    await typeLine("> YOU'RE ON THE LIST ✓");
    await typeLine(`> welcome to the softness report${sub.name ? ", " + sub.name.toUpperCase() : ""}.`);
    await typeLine("> no noise. just softness. promise.");
  } else {
    await typeLine("> ...");
    await typeLine("> no worries. see you soon <3");
  }

  await typeLine("> [ TAP ANYWHERE TO RETURN ]");
  consoleEl.addEventListener("click", closeConsole, { once: true });
}

document.getElementById("consoleClose").addEventListener("click", (e) => {
  e.stopPropagation();
  closeConsole();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !consoleEl.hidden) closeConsole();
});

/* ---------- footer ticker ---------- */
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const group = (n) => Array.from({ length: n }, () => LETTERS[rnd(26)]).join("");
const codeLine = () =>
  `${group(4)}.${group(3)}.${String(rnd(1000)).padStart(3, "0")}.${group(3)}.${group(3)}`;
const ticker = document.getElementById("ticker");
const tickerText = Array.from({ length: 10 }, codeLine).join("  ·  ") + "  ·  ";
ticker.textContent = tickerText + tickerText;

/* ---------- dock: pixel icons + scroll spy ---------- */
document.querySelectorAll(".dock__pix").forEach((pix) => {
  for (let i = 0; i < 9; i++) {
    const c = document.createElement("i");
    if (Math.random() < 0.55) c.className = "on";
    pix.appendChild(c);
  }
});

const dockItems = [...document.querySelectorAll(".dock__item")];
const sections = dockItems.map((a) => document.querySelector(a.getAttribute("href")));

/* exactly ONE nav item is ever lit: the hovered one if any, otherwise the
   section currently in view (scroll-spy). Single source, no double highlight. */
let spyIdx = Math.max(0, dockItems.findIndex((a) => a.classList.contains("is-active")));
let hoverIdx = -1;
function renderNav() {
  const lit = hoverIdx >= 0 ? hoverIdx : spyIdx;
  dockItems.forEach((a, i) => a.classList.toggle("is-active", i === lit));
}

const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const idx = sections.indexOf(entry.target);
      if (idx >= 0) { spyIdx = idx; renderNav(); }
    });
  },
  { rootMargin: "-40% 0px -50% 0px" }
);
sections.forEach((s) => s && observer.observe(s));

/* desktop left rail ↔ container cross-highlighting (CSS shows it ≥980px):
   - hover a NAV ITEM  → light that item + outline its container (.is-navhover)
   - hover a CONTAINER → light that item only (no container outline)
   Clicking a nav item just scrolls (native anchor + scroll-margin). */
dockItems.forEach((a, i) => {
  const target = sections[i];
  if (!target) return;
  a.addEventListener("mouseenter", () => { hoverIdx = i; target.classList.add("is-navhover"); renderNav(); });
  a.addEventListener("mouseleave", () => { hoverIdx = -1; target.classList.remove("is-navhover"); renderNav(); });
  target.addEventListener("mouseenter", () => { hoverIdx = i; renderNav(); });
  target.addEventListener("mouseleave", () => { hoverIdx = -1; renderNav(); });
});

/* ============================================================
   BOOT SEQUENCE — runs last so everything above is ready.
   Tap to skip. Reduced motion skips automatically.
   ============================================================ */
const bootEl = document.getElementById("boot");
const bootLog = document.getElementById("bootLog");
let bootSkip = false;
bootEl.addEventListener("click", () => (bootSkip = true));

const BOOT_LINES = [
  "CINDY_GRAVITY OS 15.84",
  "(C) 2026 · MAY CINDY BE WITH YOU",
  "",
  "TUNING OSCILLATORS ......... OK",
  "CALIBRATING GRAVITY ........ OK",
  "LOADING PATCHES ............ OK",
  "SWITCHING BANK ............. OK",
  "",
];

function finishBoot(instant) {
  body.classList.remove("is-booting");
  body.classList.add("is-booted");
  if (instant) bootEl.hidden = true;
  else {
    bootEl.classList.add("is-done");
    setTimeout(() => (bootEl.hidden = true), 450);
  }
  startWordmark();
  setTimeout(summonOracle, 2600);
}

async function runBoot() {
  if (reducedMotion) { finishBoot(true); return; }
  for (const line of BOOT_LINES) {
    if (bootSkip) break;
    bootLog.textContent += line + "\n";
    await sleep(120 + rnd(90));
  }
  if (!bootSkip) {
    bootLog.textContent += "LOADING [";
    for (let i = 0; i < 14; i++) {
      if (bootSkip) break;
      bootLog.textContent += "▮";
      await sleep(50 + rnd(50));
    }
    bootLog.textContent += "] OK";
    await sleep(350);
  }
  finishBoot(false);
}

runBoot();
