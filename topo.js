/* Half Dome topography — marching-squares contours over a synthesized
   heightfield, drawn as stipple. The camera pans from the Merced canyon up
   to the summit as the page scrolls. */
(function () {
  var ACCENT = '#2f4a34';
  var GROUND = '#d8d2c2';
  var BASE_ELEV = 4000;
  var SUMMIT_ELEV = 8842;

  var canvas = document.getElementById('topo');
  var ctx = canvas.getContext('2d');
  var railFill = document.querySelector('.rail-fill');
  var navFill = document.querySelector('.nav-progress i');
  var elevOut = document.getElementById('elev');
  var cache = null;
  var ticking = false;

  // Landmarks in their real relative positions: the dome with its sheer
  // northwest face, Sub Dome, Liberty Cap, Mount Broderick, Little Yosemite
  // Valley, Clouds Rest, and the Merced canyon cutting up from the lower left.
  function field(x, y) {
    var g = function (cx, cy, sx, sy, k) {
      return Math.exp(-(Math.pow((x - cx) * sx, 2) + Math.pow((y - cy) * sy, 2)) * k);
    };
    var h = 0.12;
    h += 0.52 * g(0.88, 0.12, 1.1, 0.9, 10);
    h += 0.30 * g(0.94, 0.40, 1.3, 1.1, 14);
    h += 0.40 * g(0.68, 0.52, 1.0, 1.35, 9);
    h += 0.44 * g(0.40, 0.45, 2.6, 2.6, 26);
    h += 0.37 * g(0.30, 0.48, 2.9, 2.9, 30);
    h += 0.56 * g(0.56, 0.29, 2.3, 2.3, 24);
    h += 0.34 * g(0.55, 0.92, 1.2, 1.6, 8);
    h += 0.26 * g(0.10, 0.30, 1.4, 1.5, 12);

    var hd = 1.05 * g(0.53, 0.17, 1.9, 2.2, 20);
    var nw = (0.53 - x) * 0.78 + (0.17 - y) * 0.62;
    hd *= 1 / (1 + Math.exp(nw * 52));
    h += hd;

    h -= 0.20 * g(0.32, 0.05, 1.4, 1.9, 9);
    var cy = 0.95 - 0.80 * x;
    if (x < 0.56) h -= 0.17 * Math.exp(-Math.pow((y - cy) * 5.0, 2) * 4);

    h += 0.030 * Math.sin(x * 17.3 + y * 13.1) * Math.cos(y * 11.7 - x * 7.3);
    h += 0.018 * Math.sin(x * 37.1 - y * 29.4);
    h += 0.010 * Math.cos(x * 63.7 + y * 51.2);
    return h;
  }

  function contours() {
    if (cache) return cache;
    var NX = 340, NY = 230, L = 38;
    var grid = new Float32Array(NX * NY);
    var min = Infinity, max = -Infinity;
    for (var j = 0; j < NY; j++) {
      for (var i = 0; i < NX; i++) {
        var v = field(i / (NX - 1), j / (NY - 1));
        grid[j * NX + i] = v;
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
    var T = { 1: 'lb', 2: 'br', 3: 'lr', 4: 'tr', 5: 'lt', 6: 'tb', 7: 'lt', 8: 'tl', 9: 'tb', 10: 'tr', 11: 'tr', 12: 'lr', 13: 'br', 14: 'lb' };
    var levels = [];
    for (var l = 0; l < L; l++) {
      var t = min + (max - min) * (l + 0.6) / (L + 0.6);
      var segs = [];
      for (var jj = 0; jj < NY - 1; jj++) {
        for (var ii = 0; ii < NX - 1; ii++) {
          var a = grid[jj * NX + ii], b = grid[jj * NX + ii + 1];
          var c = grid[(jj + 1) * NX + ii + 1], d = grid[(jj + 1) * NX + ii];
          var idx = 0;
          if (a > t) idx |= 8;
          if (b > t) idx |= 4;
          if (c > t) idx |= 2;
          if (d > t) idx |= 1;
          if (idx === 0 || idx === 15) continue;
          var x0 = ii / (NX - 1), x1 = (ii + 1) / (NX - 1);
          var y0 = jj / (NY - 1), y1 = (jj + 1) / (NY - 1);
          var ip = function (p, q, va, vb) { return p + (q - p) * ((t - va) / ((vb - va) || 1e-6)); };
          var pt = {
            t: [ip(x0, x1, a, b), y0],
            r: [x1, ip(y0, y1, b, c)],
            b: [ip(x0, x1, d, c), y1],
            l: [x0, ip(y0, y1, a, d)]
          };
          var e = T[idx];
          if (!e) continue;
          var p0 = pt[e[0]], p1 = pt[e[1]];
          segs.push(p0[0], p0[1], p1[0], p1[1]);
        }
      }
      levels.push(new Float32Array(segs));
    }
    cache = { levels: levels, L: L };
    return cache;
  }

  // The Mist Trail: Happy Isles, Vernal Fall footbridge, top of Vernal,
  // top of Nevada, Little Yosemite Valley, the junction, Sub Dome, the cables.
  var TRAIL = [
    [0.06, 0.93], [0.13, 0.87], [0.20, 0.80], [0.26, 0.75], [0.33, 0.66],
    [0.40, 0.61], [0.51, 0.55], [0.62, 0.51], [0.66, 0.43], [0.62, 0.35],
    [0.57, 0.30], [0.54, 0.24], [0.53, 0.19]
  ];

  function draw(p) {
    var w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width !== Math.round(w * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = GROUND;
    ctx.fillRect(0, 0, w, h);

    var data = contours();
    var zoom = 1 + p * 0.32;
    var fx = 0.32 + p * 0.21, fy = 0.80 - p * 0.62;
    var mw = Math.max(w, h * 1.5) * 1.15 * zoom;
    var mh = mw * 0.72;
    var ox = w * 0.5 - fx * mw;
    var oy = h * 0.5 - fy * mh;
    var reveal = 0.80 + p * 0.35;

    for (var l = 0; l < data.L; l++) {
      var lv = l / (data.L - 1);
      if (lv > reveal) break;
      var edge = Math.min(1, (reveal - lv) * 7);
      var index = (l % 6 === 0);
      var s = data.levels[l];
      ctx.fillStyle = 'rgba(255,255,255,' + (index ? edge : 0.82 * edge).toFixed(3) + ')';
      var size = (index ? 1.7 : 1.25) * zoom;
      var stride = 4;
      for (var k = 0; k < s.length; k += stride) {
        var x = ox + ((s[k] + s[k + 2]) * 0.5) * mw;
        if (x < -4 || x > w + 4) continue;
        var y = oy + ((s[k + 1] + s[k + 3]) * 0.5) * mh;
        if (y < -4 || y > h + 4) continue;
        ctx.fillRect(x, y, size, size);
      }
    }

    var pts = TRAIL.map(function (q) { return [ox + q[0] * mw, oy + q[1] * mh]; });
    var seg = [], total = 0;
    for (var i = 1; i < pts.length; i++) {
      var dd = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      seg.push(dd);
      total += dd;
    }

    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(32,30,29,0.45)';
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (var m = 1; m < pts.length; m++) ctx.lineTo(pts[m][0], pts[m][1]);
    ctx.stroke();

    var want = total * p, acc = 0;
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = ACCENT;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (var n = 1; n < pts.length && acc < want; n++) {
      var d2 = seg[n - 1];
      if (acc + d2 <= want) {
        ctx.lineTo(pts[n][0], pts[n][1]);
      } else {
        var f = (want - acc) / d2;
        ctx.lineTo(pts[n - 1][0] + (pts[n][0] - pts[n - 1][0]) * f, pts[n - 1][1] + (pts[n][1] - pts[n - 1][1]) * f);
      }
      acc += d2;
    }
    ctx.stroke();

    ctx.lineWidth = 2.2;
    for (var q2 = 1; q2 < pts.length - 1; q2 += 2) {
      var cx = pts[q2][0], cyy = pts[q2][1], r = 5;
      ctx.beginPath();
      ctx.moveTo(cx - r, cyy - r); ctx.lineTo(cx + r, cyy + r);
      ctx.moveTo(cx + r, cyy - r); ctx.lineTo(cx - r, cyy + r);
      ctx.stroke();
    }

    var peak = pts[pts.length - 1];
    ctx.fillStyle = p > 0.9 ? ACCENT : 'rgba(32,30,29,0.5)';
    ctx.fillRect(peak[0] - 6, peak[1] - 6, 12, 12);
    ctx.clearRect(peak[0] - 3, peak[1] - 3, 6, 6);
  }

  function progress() {
    var max = document.documentElement.scrollHeight - window.innerHeight;
    return max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
  }

  function update() {
    var p = progress();
    draw(p);
    if (railFill) railFill.style.height = (p * 100).toFixed(1) + '%';
    if (navFill) navFill.style.width = (p * 100).toFixed(1) + '%';
    if (elevOut) elevOut.textContent = Math.round(BASE_ELEV + p * (SUMMIT_ELEV - BASE_ELEV)).toLocaleString();
  }

  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () { ticking = false; update(); });
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(update);
  update();
})();
