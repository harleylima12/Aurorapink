/* Dra. Isadora — interações. Sem dependências.
   Regra de movimento: o hero anima uma vez no load; o resto responde ao usuário. */
(function () {
  'use strict';

  var doc = document;
  var root = doc.documentElement;
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- ano do rodapé ---------- */
  var yr = doc.getElementById('yr');
  if (yr) yr.textContent = new Date().getFullYear();

  /* ---------- slots de imagem ---------- */
  function markLoaded(img) {
    var slot = img.closest('.slot');
    if (slot) slot.classList.add('is-loaded');
  }
  Array.prototype.forEach.call(doc.querySelectorAll('.slot img'), function (img) {
    if (img.complete && img.naturalWidth > 0) markLoaded(img);
    else img.addEventListener('load', function () { markLoaded(img); }, { once: true });
  });

  /* ---------- header + barra móvel ---------- */
  var hd = doc.getElementById('hd');
  var mbar = doc.getElementById('mbar');
  var ticking = false;

  function onScroll() {
    var y = window.pageYOffset;
    if (hd) hd.classList.toggle('is-stuck', y > 80);
    if (mbar) {
      var max = doc.body.scrollHeight - window.innerHeight;
      var on = max > 0 && y / max > 0.4;
      if (on) mbar.hidden = false;
      mbar.classList.toggle('is-on', on);
    }
    ticking = false;
  }
  addEventListener('scroll', function () {
    if (!ticking) { ticking = true; requestAnimationFrame(onScroll); }
  }, { passive: true });
  onScroll();

  /* ---------- hero: sequência única no load ---------- */
  addEventListener('load', function () { root.classList.add('hero-in'); });
  if (doc.readyState === 'complete') root.classList.add('hero-in');

  /* ---------- contador ---------- */
  function count(el) {
    var target = parseFloat(el.dataset.count);
    if (!isFinite(target)) return;             /* sem dado real, não inventa */
    if (reduce) { el.textContent = String(target); return; }
    var t0 = 0, dur = 1000;
    function step(t) {
      if (!t0) t0 = t;
      var p = Math.min((t - t0) / dur, 1);
      el.textContent = String(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  /* ---------- reveal por scroll (3 seções, uma vez) ---------- */
  var targets = doc.querySelectorAll('[data-reveal]');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add('is-in');
        Array.prototype.forEach.call(e.target.querySelectorAll('.num'), count);
        io.unobserve(e.target);
      });
    }, { threshold: 0.2 });
    Array.prototype.forEach.call(targets, function (t) { io.observe(t); });
  } else {
    Array.prototype.forEach.call(targets, function (t) {
      t.classList.add('is-in');
      Array.prototype.forEach.call(t.querySelectorAll('.num'), count);
    });
  }

  /* ---------- antes / depois ---------- */
  var ba = doc.getElementById('ba');
  if (ba) {
    var frame = ba.querySelector('.ba__frame');
    var range = doc.getElementById('ba-range');
    var ant = doc.getElementById('ba-ant');
    var dep = doc.getElementById('ba-dep');

    var down = false;

    function paint(v) { frame.style.setProperty('--pos', v + '%'); }

    /* posição inicial alinhada à linha da página */
    function align() {
      if (innerWidth < 960) return;
      var cs = getComputedStyle(root);
      var g = parseFloat(cs.getPropertyValue('--gutter'));
      var m = parseFloat(cs.getPropertyValue('--margin-col'));
      var w = frame.getBoundingClientRect().width;
      if (!w || !isFinite(g) || !isFinite(m)) return;
      var pct = ((g + m) / w) * 100;
      if (pct > 8 && pct < 60 && range.dataset.touched !== '1') {
        range.value = String(pct);
        paint(pct);
      }
    }

    range.addEventListener('input', function () {
      range.dataset.touched = '1';
      if (down) return;          /* durante o arraste quem pinta é fromEvent, com valor fracionário */
      paint(range.value);
    });

    /* arraste seguindo o cursor em qualquer ponto do quadro */
    function fromEvent(e) {
      var r = frame.getBoundingClientRect();
      var pct = ((e.clientX - r.left) / r.width) * 100;
      pct = Math.max(0, Math.min(100, pct));
      range.value = String(pct);
      range.dataset.touched = '1';
      paint(pct);
    }
    frame.addEventListener('pointerdown', function (e) {
      down = true;
      frame.setPointerCapture(e.pointerId);
      fromEvent(e);
    });
    frame.addEventListener('pointermove', function (e) { if (down) fromEvent(e); });
    frame.addEventListener('pointerup', function () { down = false; });
    frame.addEventListener('pointercancel', function () { down = false; });

    /* troca de caso */
    Array.prototype.forEach.call(ba.querySelectorAll('.ba__case'), function (btn) {
      btn.addEventListener('click', function () {
        var n = btn.dataset.case;
        Array.prototype.forEach.call(ba.querySelectorAll('.ba__case'), function (b) {
          var on = b === btn;
          b.classList.toggle('is-on', on);
          b.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        [[ant, 'antes'], [dep, 'depois']].forEach(function (pair) {
          var img = pair[0], base = pair[1];
          var slot = img.closest('.slot');
          slot.classList.remove('is-loaded');
          slot.dataset.file = base + '-' + n + '.jpg';
          img.src = 'assets/img/' + base + '-' + n + '.jpg';
        });
      });
    });

    paint(range.value);
    align();
    addEventListener('resize', align, { passive: true });
  }

  /* ---------- "aberto agora" — só liga com horário real preenchido ---------- */
  var tbl = doc.getElementById('hor');
  var badge = doc.getElementById('hor-badge');
  if (tbl && badge) {
    var rows = tbl.querySelectorAll('tr[data-d]');
    var filled = 0;
    Array.prototype.forEach.call(rows, function (r) { if (r.dataset.h) filled++; });

    if (filled === rows.length) {
      var f = new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false
      }).formatToParts(new Date());
      var get = function (t) { var p = f.find(function (x) { return x.type === t; }); return p ? p.value : ''; };
      var map = { dom: 0, seg: 1, ter: 2, qua: 3, qui: 4, sex: 5, sáb: 6, sab: 6 };
      var dow = map[get('weekday').toLowerCase().replace('.', '').slice(0, 3)];
      var mins = parseInt(get('hour'), 10) * 60 + parseInt(get('minute'), 10);

      var open = false;
      Array.prototype.forEach.call(rows, function (r) {
        if (parseInt(r.dataset.d, 10) !== dow) return;
        r.dataset.h.split(',').forEach(function (span) {
          var m = span.trim().match(/^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/);
          if (!m) return;
          var a = +m[1] * 60 + +m[2], b = +m[3] * 60 + +m[4];
          if (mins >= a && mins < b) open = true;
        });
      });

      badge.className = 'hor-badge in-content';
      badge.textContent = open ? 'Aberto agora' : 'Fechado agora';
      badge.hidden = false;
    }
    /* Sem horário confiável, o selo permanece oculto — melhor omitir que errar. */
  }
})();
