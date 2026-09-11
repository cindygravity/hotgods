// Cindy Gravity — /live/ page. Shared by both layout variants.

// ---- video facade: YouTube loads ONLY after a click (no third-party
// requests or cookies just for opening the page — fits the cookieless line)
(function () {
  var f = document.getElementById('video');
  if (!f) return;
  function load() {
    var i = document.createElement('iframe');
    i.src = 'https://www.youtube-nocookie.com/embed/' + f.dataset.yt + '?autoplay=1&rel=0';
    i.title = f.getAttribute('aria-label');
    i.allow = 'accelerometer; autoplay; encrypted-media; picture-in-picture';
    i.allowFullscreen = true;
    // YouTube refuses embeds that arrive without a referrer (Error 153).
    // Also why it fails when the page is opened as file:// — use the local server.
    i.referrerPolicy = 'strict-origin-when-cross-origin';
    f.innerHTML = '';
    f.appendChild(i);
    f.style.cursor = 'default';
    f.removeAttribute('role');
    f.removeAttribute('tabindex');
  }
  f.addEventListener('click', load, { once: true });
  f.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); load(); }
  });
})();

// ---- carousel: swipe/scroll natively, buttons jump one photo,
// slow auto-advance that stops for good once the visitor touches it
(function () {
  var track = document.getElementById('track');
  if (!track) return;
  var slides = Array.prototype.slice.call(track.children);
  var count = document.getElementById('count');
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };

  function current() {
    var mid = track.scrollLeft + track.clientWidth / 2, best = 0, dist = Infinity;
    slides.forEach(function (s, i) {
      var d = Math.abs(s.offsetLeft + s.offsetWidth / 2 - mid);
      if (d < dist) { dist = d; best = i; }
    });
    return best;
  }
  function go(i) {
    i = (i + slides.length) % slides.length;
    var s = slides[i];
    track.scrollTo({ left: s.offsetLeft + s.offsetWidth / 2 - track.clientWidth / 2 });
  }
  function update() { count.textContent = pad(current() + 1) + ' / ' + pad(slides.length); }

  var t;
  track.addEventListener('scroll', function () { clearTimeout(t); t = setTimeout(update, 60); });
  update();

  var auto = null;
  function stop() { clearInterval(auto); auto = null; }
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    auto = setInterval(function () { go(current() + 1); }, 5000);
  }
  ['pointerdown', 'wheel', 'touchstart', 'keydown'].forEach(function (ev) {
    track.addEventListener(ev, stop, { passive: true });
  });

  document.getElementById('prev').addEventListener('click', function () { stop(); go(current() - 1); });
  document.getElementById('next').addEventListener('click', function () { stop(); go(current() + 1); });
})();

// ---- music player: one audio element, tracklist drives it.
// Nothing is fetched until the first press of play (preload none).
(function () {
  var player = document.getElementById('player');
  if (!player) return;
  var tracks = Array.prototype.slice.call(document.querySelectorAll('#tracks button'));
  var btn = document.getElementById('plBtn'), bar = document.getElementById('plBar');
  var fill = document.getElementById('plFill'), time = document.getElementById('plTime');
  var cover = document.getElementById('plCover'), title = document.getElementById('plTitle');
  var meta = document.getElementById('plMeta');
  var audio = new Audio();
  audio.preload = 'none';
  var cur = 0, loaded = -1;

  function fmt(s) {
    if (!isFinite(s)) return '0:00';
    return Math.floor(s / 60) + ':' + ('0' + Math.floor(s % 60)).slice(-2);
  }
  function select(i) {
    cur = (i + tracks.length) % tracks.length;
    var t = tracks[cur];
    tracks.forEach(function (b, j) { b.classList.toggle('is-current', j === cur); });
    cover.src = t.dataset.cover;
    title.textContent = t.querySelector('.tt').textContent;
    meta.textContent = t.dataset.meta;
  }
  function play(i) {
    if (i !== undefined) select(i);
    if (loaded !== cur) { audio.src = tracks[cur].dataset.src; loaded = cur; fill.style.width = '0'; }
    audio.play();
  }
  function paint() {
    fill.style.width = audio.duration ? (audio.currentTime / audio.duration * 100) + '%' : '0';
    time.textContent = fmt(audio.currentTime) + ' / ' + fmt(audio.duration);
  }

  btn.addEventListener('click', function () { audio.paused ? play() : audio.pause(); });
  tracks.forEach(function (b, i) {
    b.addEventListener('click', function () { (i === cur && !audio.paused) ? audio.pause() : play(i); });
  });
  audio.addEventListener('play', function () { player.classList.add('is-playing'); btn.setAttribute('aria-label', 'Pause'); });
  audio.addEventListener('pause', function () { player.classList.remove('is-playing'); btn.setAttribute('aria-label', 'Play'); });
  audio.addEventListener('timeupdate', paint);
  audio.addEventListener('loadedmetadata', paint);
  audio.addEventListener('ended', function () { play(cur + 1); });

  function seek(x) {
    var r = bar.getBoundingClientRect();
    if (loaded !== cur || !audio.duration) return;
    audio.currentTime = Math.max(0, Math.min(1, (x - r.left) / r.width)) * audio.duration;
  }
  bar.addEventListener('click', function (e) { seek(e.clientX); });
  bar.addEventListener('keydown', function (e) {
    if (!audio.duration) return;
    if (e.key === 'ArrowRight') audio.currentTime = Math.min(audio.duration, audio.currentTime + 5);
    if (e.key === 'ArrowLeft') audio.currentTime = Math.max(0, audio.currentTime - 5);
  });

  select(0);
})();
