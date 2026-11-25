/* Arcana Rift · 卡片组件：多层 3D + 分档光效（N 也有戏，越稀越炫） */
(function () {
  'use strict';

  var RARITY = {
    UR:  { holo: 'holo-max',    label: 'UR',  name: '神话', rate: '0.6%'  },
    SSR: { holo: 'holo-strong', label: 'SSR', name: '传说', rate: '5.4%'  },
    SR:  { holo: 'holo-on',     label: 'SR',  name: '史诗', rate: '14%'   },
    R:   { holo: '',            label: 'R',   name: '稀有', rate: '30%'   },
    N:   { holo: '',            label: 'N',   name: '普通', rate: '50%'   }
  };

  /* 分档光效强度：数字越大越炫 */
  var TIER = { N: 1, R: 2, SR: 3, SSR: 4, UR: 5 };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
    });
  }
  function rnd(seed) {           // 稳定的伪随机，同一个 id 每次渲染一致
    var x = 0;
    for (var i = 0; i < String(seed).length; i++) x = (x * 31 + String(seed).charCodeAt(i)) | 0;
    return function () { x = (x * 1103515245 + 12345) & 0x7fffffff; return x / 0x7fffffff; };
  }

  function sparks(seed, n) {
    var r = rnd(seed), out = '';
    for (var i = 0; i < n; i++) {
      var x = (r() * 92 + 4).toFixed(1), y = (r() * 92 + 4).toFixed(1);
      var s = (r() * 2.4 + 1.2).toFixed(1), d = (r() * 6).toFixed(1), dur = (r() * 4 + 4).toFixed(1);
      out += '<i style="left:' + x + '%;top:' + y + '%;width:' + s + 'px;height:' + s + 'px;' +
             'animation-delay:-' + d + 's;animation-duration:' + dur + 's"></i>';
    }
    return out;
  }

  function html(card, meta, opts) {
    opts = opts || {};
    var r = RARITY[card.rarity] || RARITY.N;
    var m = (meta && meta[card.id]) || {};
    var tier = TIER[card.rarity] || 1;
    var glow = m.elem || m.glow || '#b18cff';
    var pc = m.particle || '#ffffff';
    var cls = ['cv', 'r-' + card.rarity, 'tier-' + tier, r.holo].filter(Boolean).join(' ');
    var sparkN = [0, 5, 7, 10, 13, 16][tier];
    return '' +
      '<div class="' + cls + '" data-id="' + card.id + '" data-rarity="' + card.rarity +
        '" style="--glow:' + glow + ';--pc:' + pc + '">' +
        '<div class="layer bg" style="background-image:url(img/bg/' + card.id + '.webp)"></div>' +
        '<div class="layer aura"></div>' +
        '<div class="layer vig"></div>' +
        '<div class="layer glow"></div>' +
        '<img class="layer char" src="img/char/' + card.id + '.webp" alt="' + esc(card.name) + '"' +
             ' decoding="async" fetchpriority="high">' +
        '<div class="layer spark">' + (sparkN ? sparks(card.id, sparkN) : '') + '</div>' +
        '<div class="layer holo"></div>' +
        '<div class="layer rim"></div>' +
        '<div class="layer frame"><span class="sheen"></span>' +
          '<span class="corner c1"><i></i></span><span class="corner c2"><i></i></span>' +
          '<span class="corner c3"><i></i></span><span class="corner c4"><i></i></span>' +
        '</div>' +
        '<div class="layer shine"></div>' +
        '<span class="badge ' + card.rarity + '">' + r.label + '</span>' +
        (opts.plate === false ? '' :
          '<div class="plate"><span class="nm">' + esc(card.name) + '</span>' +
          '<span class="sub">' + esc(card.cls) + ' · ' + esc(card.element) + '</span></div>') +
      '</div>';
  }

  /* 等图片真正解码完成，避免「撕开却是空卡」 */
  function preload(el) {
    var img = el.querySelector('img.char');
    if (!img) return Promise.resolve();
    var done = function () { return Promise.resolve(); };
    return new Promise(function (res) {
      var finish = function () { img.classList.add('ready'); res(); };
      if (img.complete && img.naturalWidth) { finish(); return; }
      img.addEventListener('load', finish, { once: true });
      img.addEventListener('error', finish, { once: true });
      setTimeout(finish, 6000);   // 兜底，别卡死流程
    });
  }

  function bindTilt(el, opts) {
    opts = opts || {};
    var maxDeg = opts.max || 16;
    var raf = 0, tx = 0, ty = 0, mx = 50, my = 50;
    function apply() {
      raf = 0;
      el.style.setProperty('--rx', ty.toFixed(2) + 'deg');
      el.style.setProperty('--ry', tx.toFixed(2) + 'deg');
      el.style.setProperty('--mx', mx.toFixed(1) + '%');
      el.style.setProperty('--my', my.toFixed(1) + '%');
    }
    function move(e) {
      var r = el.getBoundingClientRect();
      var px = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      var py = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
      tx = (px - 0.5) * 2 * maxDeg;
      ty = -(py - 0.5) * 2 * maxDeg;
      mx = px * 100; my = py * 100;
      if (!raf) raf = requestAnimationFrame(apply);
    }
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerenter', function () { el.classList.add('tilting'); });
    el.addEventListener('pointerleave', function () {
      el.classList.remove('tilting');
      tx = 0; ty = 0; mx = 50; my = 50; apply();
    });
    return { reset: apply };
  }

  function shine(el) {
    el.classList.remove('shine-go');
    void el.offsetWidth;
    el.classList.add('shine-go');
  }

  window.CardKit = { RARITY: RARITY, TIER: TIER, html: html, bindTilt: bindTilt, shine: shine,
                     preload: preload, esc: esc, rnd: rnd };
})();
