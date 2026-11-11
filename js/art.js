// كل الرسم مرسوم بالكود بأسلوب ١٦-بت: أرض، مبانٍ، أثاث، وشخصيات. ما في صور خارجية.
(function (root) {
  const VQ = (root.VQ = root.VQ || {});
  const T = VQ.T;
  const OUT = '#3a2a22';

  function mk(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    return { c, g };
  }
  const R = (g, x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
  const hash = (x, y) => {
    let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  function specks(g, x, y, w, h, cols, n, seed) {
    for (let i = 0; i < n; i++) {
      const px = x + Math.floor(hash(seed + i, 3) * w);
      const py = y + Math.floor(hash(seed, i + 7) * h);
      R(g, px, py, 1, 1, cols[i % cols.length]);
    }
  }
  // صندوق بنظرة ٣/٤: وجه علوي ووجه أمامي وحد غامق
  function box(g, x, y, w, h, top, front, fh) {
    R(g, x, y, w, h, OUT);
    R(g, x + 1, y + 1, w - 2, h - 2 - fh, top);
    R(g, x + 1, y + h - 1 - fh, w - 2, fh, front);
    R(g, x + 1, y + h - 2 - fh, w - 2, 1, 'rgba(255,255,255,.28)');
  }
  function arch(g, x, y, w, h, col) {
    const r = w / 2;
    for (let i = 0; i < h; i++) {
      let inset = 0;
      if (i < r) inset = Math.round(r - Math.sqrt(Math.max(0, r * r - (r - i - 0.5) * (r - i - 0.5))));
      R(g, x + inset, y + i, w - inset * 2, 1, col);
    }
  }
  function disc(g, cx, cy, rx, ry, col) {
    for (let y = -ry; y <= ry; y++) {
      const span = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry))));
      R(g, cx - span, cy + y, span * 2 + 1, 1, col);
    }
  }

  // ---------- الأرض ----------
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const hex = (s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
  const P = {
    grass: ['#4f8f42', '#5c9e4a', '#6bad53'].map(hex),
    path: ['#c9a468', '#d6b478', '#e0c28c'].map(hex),
    pathEdge: hex('#a98650'),
    sand: ['#dcc38c', '#e6d09c', '#efdcb0'].map(hex),
    water: ['#2d7fb4', '#3a93c6', '#4ba7d6'].map(hex),
    waterEdge: hex('#215f8c'),
    farm: ['#7a5533', '#8a6240'].map(hex),
    dirt: ['#a58a62', '#b39a72'].map(hex),
    mortar: hex('#94805f'),
    stone: ['#c8b18c', '#d4bf9c', '#bea680', '#dccab0'].map(hex),
  };
  function smooth(x, y, scale, seed) {
    const fx = x / scale;
    const fy = y / scale;
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    const tx = fx - ix;
    const ty = fy - iy;
    const a = hash(ix + seed, iy);
    const b = hash(ix + 1 + seed, iy);
    const c = hash(ix + seed, iy + 1);
    const d = hash(ix + 1 + seed, iy + 1);
    return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
  }

  function buildGround(world) {
    const TS = VQ.TILE;
    const { W, H } = world;
    const pw = W * TS;
    const ph = H * TS;
    const { c, g } = mk(pw, ph);
    const img = g.createImageData(pw, ph);
    const d = img.data;
    const kindAt = (px, py) => {
      const tx = px >> 4;
      const ty = py >> 4;
      if (tx < 0 || ty < 0 || tx >= W || ty >= H) return T.GRASS;
      return world.ground[ty * W + tx];
    };
    for (let y = 0; y < ph; y++) {
      for (let x = 0; x < pw; x++) {
        const raw = kindAt(x, y);
        let kind = raw;
        // حدود غير منتظمة، ما عدا الساحة المرصوفة
        if (raw !== T.PLAZA && raw !== T.ASPHALT) {
          const jx = Math.floor(hash(x >> 1, (y >> 1) + 11) * 5) - 2;
          const jy = Math.floor(hash((x >> 1) + 5, y >> 1) * 5) - 2;
          const k2 = kindAt(x + jx, y + jy);
          if (k2 !== T.PLAZA && k2 !== T.ASPHALT) kind = k2;
        }
        const dither = BAYER[(y & 3) * 4 + (x & 3)] / 16;
        let col;
        if (kind === T.GRASS) {
          const n = smooth(x, y, 26, 3) * 0.7 + smooth(x, y, 9, 9) * 0.3 + (dither - 0.5) * 0.14;
          col = P.grass[n < 0.42 ? 0 : n < 0.58 ? 1 : 2];
        } else if (kind === T.PATH) {
          const near = kindAt(x + 3, y) === T.GRASS || kindAt(x - 3, y) === T.GRASS || kindAt(x, y + 3) === T.GRASS || kindAt(x, y - 3) === T.GRASS;
          const n = smooth(x, y, 12, 5) + (dither - 0.5) * 0.18;
          col = near && hash(x, y) < 0.5 ? P.pathEdge : P.path[n < 0.42 ? 0 : n < 0.62 ? 1 : 2];
          if (hash(x, y + 91) > 0.985) col = P.pathEdge;
        } else if (kind === T.SAND) {
          const n = smooth(x, y, 10, 15) + (dither - 0.5) * 0.2;
          col = P.sand[n < 0.42 ? 0 : n < 0.62 ? 1 : 2];
        } else if (kind === T.WATER) {
          const near = kindAt(x + 2, y) !== T.WATER || kindAt(x - 2, y) !== T.WATER || kindAt(x, y + 2) !== T.WATER || kindAt(x, y - 2) !== T.WATER;
          const n = smooth(x, y, 18, 21) + (dither - 0.5) * 0.2;
          col = near ? P.waterEdge : P.water[n < 0.45 ? 0 : n < 0.62 ? 1 : 2];
        } else if (kind === T.FARM) {
          col = P.farm[(y >> 2) & 1];
          if (hash(x, y) > 0.92) col = P.farm[1 - ((y >> 2) & 1)];
        } else if (kind === T.ASPHALT) {
          const n = smooth(x, y, 6, 31) + (dither - 0.5) * 0.25;
          col = n < 0.45 ? [74, 76, 86] : n < 0.6 ? [82, 84, 94] : [90, 92, 102];
        } else if (kind === T.DIRT) {
          const n = smooth(x, y, 8, 25) + (dither - 0.5) * 0.2;
          col = P.dirt[n < 0.5 ? 0 : 1];
        } else {
          // بلاط الساحة
          const row = y >> 3;
          const off = row & 1 ? 8 : 0;
          const bx = (x + off) & 15;
          const by = y & 7;
          if (bx === 0 || by === 0) col = P.mortar;
          else {
            const id = hash((x + off) >> 4, row);
            col = P.stone[Math.floor(id * 4)];
            if (by === 1 || bx === 1) col = [col[0] + 12, col[1] + 12, col[2] + 10];
            if (hash(x, y + 3) > 0.96) col = [col[0] - 18, col[1] - 18, col[2] - 18];
          }
        }
        const i = (y * pw + x) * 4;
        d[i] = col[0];
        d[i + 1] = col[1];
        d[i + 2] = col[2];
        d[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);

    // عشب صغير وزهور مبعثرة
    for (let ty = 0; ty < H; ty++) {
      for (let tx = 0; tx < W; tx++) {
        if (world.ground[ty * W + tx] !== T.GRASS) continue;
        const px = tx * TS;
        const py = ty * TS;
        const n = 1 + Math.floor(hash(tx, ty) * 3);
        for (let i = 0; i < n; i++) {
          const bx = px + Math.floor(hash(tx + i, ty + 40) * 14);
          const by = py + Math.floor(hash(tx + 40, ty + i) * 14);
          R(g, bx, by, 1, 2, '#3f7a38');
          R(g, bx + 1, by + 1, 1, 1, '#3f7a38');
          R(g, bx - 1, by + 1, 1, 1, '#7dbd60');
        }
      }
    }
    // علامات المدرج: خط وسطي متقطع وخطوط عند الطرفين
    if (world.runway) {
      const rw = world.runway;
      const mid = Math.round(((rw.y0 + rw.y1 + 1) / 2) * TS) - 1;
      for (let x = rw.x0 * TS + 48; x < (rw.x1 + 1) * TS - 48; x += 28) R(g, x, mid, 14, 2, '#f4f2ea');
      for (const ex of [rw.x0 * TS + 8, (rw.x1 + 1) * TS - 30]) {
        for (let y = rw.y0 * TS + 8; y < (rw.y1 + 1) * TS - 8; y += 8) R(g, ex, y, 22, 4, '#f4f2ea');
      }
      R(g, rw.x0 * TS, rw.y0 * TS, (rw.x1 - rw.x0 + 1) * TS, 2, '#f0cc50');
      R(g, rw.x0 * TS, (rw.y1 + 1) * TS - 2, (rw.x1 - rw.x0 + 1) * TS, 2, '#f0cc50');
    }
    // درج دار البلدية
    for (let i = 0; i < 2; i++) {
      R(g, 50 * TS + 8, 26 * TS + i * 8, 9 * TS - 16 + 8, 7, i ? '#cdb994' : '#e0cfae');
      R(g, 50 * TS + 8, 26 * TS + i * 8 + 7, 9 * TS - 16 + 8, 1, '#8f7a5b');
    }

    // أسوار الأحواش والأسيجة
    for (let ty = 0; ty < H; ty++) {
      for (let tx = 0; tx < W; tx++) {
        const v = world.lotWall[ty * W + tx];
        if (!v) continue;
        const px = tx * TS;
        const py = ty * TS;
        const below = ty + 1 < H && world.lotWall[(ty + 1) * W + tx];
        if (v === 1) {
          R(g, px, py, 16, below ? 16 : 11, '#d8bb8c');
          R(g, px, py, 16, 1, '#ecd8b0');
          specks(g, px, py, 16, 11, ['#c6a877', '#e6d0a4'], 8, tx * 31 + ty);
          if (!below) {
            R(g, px, py + 11, 16, 5, '#a9875a');
            R(g, px, py + 15, 16, 1, OUT);
          }
          R(g, px, py, 1, 16, 'rgba(90,60,30,.25)');
          R(g, px + 15, py, 1, 16, 'rgba(90,60,30,.25)');
        } else {
          // سياج خشب
          R(g, px, py + 5, 16, 2, '#7a5533');
          R(g, px, py + 10, 16, 2, '#6b4a2b');
          R(g, px + 2, py + 2, 3, 13, '#8e6540');
          R(g, px + 2, py + 2, 3, 1, '#b08858');
          R(g, px + 10, py + 2, 3, 13, '#8e6540');
          R(g, px + 10, py + 2, 3, 1, '#b08858');
        }
      }
    }
    // ظلال الأشجار تحتها
    for (const p of world.props) {
      if (p.s === 'palm' || p.s === 'sidr') {
        disc(g, p.x * TS + 8, p.y * TS + 14, p.s === 'palm' ? 9 : 13, 4, 'rgba(25,50,30,.28)');
      }
    }
    return c;
  }

  // ---------- الأشجار والعناصر الخارجية ----------
  function drawPalm(variant) {
    const { c, g } = mk(48, 56);
    const lean = variant % 3 - 1;
    // الجذع
    for (let i = 0; i < 26; i++) {
      const y = 52 - i;
      const x = 22 + Math.round(lean * (i / 26) * 3);
      const col = i % 4 === 0 ? '#6a4a2c' : i % 4 === 1 ? '#a37a4c' : '#8b6640';
      R(g, x, y, 5, 1, OUT);
      R(g, x + 1, y, 3, 1, col);
      R(g, x + 3, y, 1, 1, '#5e4227');
    }
    const cx = 24 + lean * 3;
    const cy = 25;
    // السعف
    const fronds = [[-1, -0.25], [-0.75, -0.7], [-0.25, -1], [0.3, -1], [0.8, -0.65], [1, -0.2], [-0.85, 0.25], [0.85, 0.25]];
    fronds.forEach((f, i) => {
      const len = 19 + ((i + variant) % 3) * 2;
      for (let t = 0; t <= len; t++) {
        const u = t / len;
        const x = Math.round(cx + f[0] * t);
        const y = Math.round(cy + f[1] * t + u * u * 12);
        const thick = t < len * 0.7 ? 2 : 1;
        R(g, x - 1, y + 1, thick + 1, thick, '#22572f');
        if (t % 2 === 0 && t > 2) {
          R(g, x + (f[0] < 0 ? -2 : 1), y + 2, 2, 2, '#2c6b38');
          R(g, x, y + 3, 1, 2, '#2c6b38');
        }
      }
    });
    fronds.forEach((f, i) => {
      const len = 19 + ((i + variant) % 3) * 2;
      for (let t = 0; t <= len; t++) {
        const u = t / len;
        const x = Math.round(cx + f[0] * t);
        const y = Math.round(cy + f[1] * t + u * u * 12);
        R(g, x, y, 1, 1, u < 0.6 ? '#5fae48' : '#4b973f');
        if (t % 3 === 0) R(g, x, y + 1, 1, 1, '#8fce5e');
      }
    });
    // بلح
    R(g, cx - 4, cy + 2, 3, 4, '#c8702a');
    R(g, cx + 2, cy + 2, 3, 4, '#d88a36');
    R(g, cx - 3, cy + 2, 1, 1, '#f0b860');
    R(g, cx + 3, cy + 2, 1, 1, '#f0b860');
    return { c, ax: 24, ay: 54 };
  }
  function drawSidr(variant) {
    const { c, g } = mk(40, 48);
    R(g, 16, 30, 8, 16, OUT);
    R(g, 17, 30, 6, 16, '#7a5533');
    R(g, 21, 30, 2, 16, '#5e4227');
    R(g, 18, 34, 1, 5, '#99704a');
    const blobs = [[20, 14, 15, 12], [10, 20, 9, 8], [30, 20, 9, 8], [20, 24, 13, 8], [13, 10, 8, 7], [27, 10, 8, 7]];
    for (const [x, y, rx, ry] of blobs) disc(g, x, y, rx + 1, ry + 1, '#1f4d2a');
    for (const [x, y, rx, ry] of blobs) disc(g, x, y, rx, ry, '#2f6e38');
    for (const [x, y, rx, ry] of blobs) disc(g, x - 1, y - 2, rx - 2, ry - 2, '#458f45');
    for (const [x, y, rx, ry] of blobs) disc(g, x - 3, y - 4, Math.max(1, rx - 6), Math.max(1, ry - 5), '#6bb352');
    for (let i = 0; i < 44; i++) {
      const px = 6 + Math.floor(hash(i + variant, 1) * 28);
      const py = 4 + Math.floor(hash(i, 2 + variant) * 26);
      if (g.getImageData(px, py, 1, 1).data[3] > 0) R(g, px, py, 1, 1, i % 2 ? '#8cc962' : '#2a6333');
    }
    return { c, ax: 20, ay: 46 };
  }
  function simple(w, h, ax, ay, fn) {
    const { c, g } = mk(w, h);
    fn(g);
    return { c, ax, ay };
  }
  const OUTDOOR = {};
  function buildOutdoor() {
    OUTDOOR.palm = [drawPalm(0), drawPalm(1), drawPalm(2), drawPalm(4)];
    OUTDOOR.sidr = [drawSidr(0), drawSidr(3)];
    OUTDOOR.bush = [simple(18, 14, 9, 13, (g) => {
      disc(g, 9, 7, 8, 6, '#1f4d2a'); disc(g, 9, 6, 7, 5, '#3a7f3e'); disc(g, 7, 4, 4, 2, '#67ad50');
      R(g, 5, 8, 1, 1, '#d84a5a'); R(g, 12, 6, 1, 1, '#d84a5a'); R(g, 9, 3, 1, 1, '#f0d060');
    })];
    OUTDOOR.rock = [simple(16, 12, 8, 11, (g) => {
      disc(g, 8, 7, 7, 4, OUT); disc(g, 8, 6, 6, 4, '#9c9384'); disc(g, 6, 5, 3, 2, '#c4bcab'); R(g, 10, 8, 3, 1, '#6e665a');
    })];
    OUTDOOR.flowers = [0, 1, 2].map((v) => simple(16, 14, 8, 13, (g) => {
      const cols = [['#e8506a', '#f6e27a'], ['#f6f0e0', '#f0c040'], ['#b66ed6', '#f6e27a']][v];
      for (const [x, y] of [[3, 5], [9, 3], [12, 8], [6, 9]]) {
        R(g, x, y + 2, 1, 3, '#3f7a38');
        R(g, x - 1, y, 3, 3, cols[0]);
        R(g, x, y + 1, 1, 1, cols[1]);
      }
    }));
    OUTDOOR.crop = [0, 1].map((v) => simple(16, 18, 8, 16, (g) => {
      for (const x of [3, 8, 13]) {
        R(g, x, 6 + v, 1, 10 - v, '#3d7f3a');
        R(g, x - 2, 8 + v, 2, 1, '#5fae48');
        R(g, x + 1, 6 + v, 2, 1, '#5fae48');
        R(g, x - 1, 3 + v, 3, 4, v ? '#e0c04a' : '#6ec050');
        R(g, x, 3 + v, 1, 1, v ? '#f4e080' : '#9ade68');
      }
    }));
    OUTDOOR.jar = [simple(12, 16, 6, 15, (g) => {
      disc(g, 6, 9, 5, 6, OUT); disc(g, 6, 9, 4, 5, '#b86a3a'); disc(g, 5, 8, 2, 3, '#d88a54');
      R(g, 3, 1, 6, 3, OUT); R(g, 4, 2, 4, 1, '#d88a54');
    })];
    OUTDOOR.pot_big = [simple(14, 20, 7, 19, (g) => {
      disc(g, 7, 14, 6, 5, OUT); disc(g, 7, 14, 5, 4, '#c0683a'); disc(g, 5, 13, 2, 2, '#e08c58');
      disc(g, 7, 7, 6, 6, '#1f4d2a'); disc(g, 7, 6, 5, 5, '#3f8c42'); disc(g, 5, 4, 2, 2, '#7cc25a');
    })];
    OUTDOOR.planter = [simple(24, 36, 12, 35, (g) => {
      R(g, 3, 25, 18, 10, OUT); R(g, 4, 26, 16, 4, '#dcc8a4'); R(g, 4, 30, 16, 4, '#b39a75');
      R(g, 10, 14, 4, 13, '#7a5533');
      disc(g, 12, 10, 10, 9, '#1f4d2a'); disc(g, 12, 9, 9, 8, '#3a7f3e'); disc(g, 10, 6, 5, 4, '#6bb352');
    })];
    OUTDOOR.lamp = [simple(12, 34, 6, 33, (g) => {
      R(g, 4, 28, 4, 5, OUT); R(g, 5, 28, 2, 4, '#5a4a3a');
      R(g, 5, 9, 2, 20, '#3a3a44'); R(g, 5, 9, 1, 20, '#5e5e6c');
      R(g, 2, 2, 8, 9, OUT); R(g, 3, 3, 6, 7, '#f3d27a'); R(g, 4, 4, 2, 4, '#fff2c0');
      R(g, 1, 1, 10, 2, '#3a3a44'); R(g, 4, 0, 4, 1, '#3a3a44');
    })];
    OUTDOOR.signpost = [simple(22, 26, 11, 25, (g) => {
      R(g, 9, 10, 4, 15, OUT); R(g, 10, 10, 2, 15, '#7a5533');
      R(g, 1, 2, 20, 11, OUT); R(g, 2, 3, 18, 9, '#b08858'); R(g, 2, 3, 18, 1, '#d0a878');
      R(g, 5, 6, 12, 1, '#5e4227'); R(g, 7, 9, 8, 1, '#5e4227');
    })];
    OUTDOOR.bench_out = [simple(32, 16, 0, 15, (g) => {
      R(g, 2, 3, 28, 12, OUT); R(g, 3, 4, 26, 3, '#a87c4e'); R(g, 3, 8, 26, 3, '#b98c5a'); R(g, 3, 11, 3, 3, '#5e4227'); R(g, 26, 11, 3, 3, '#5e4227');
      R(g, 3, 4, 26, 1, '#cca670');
    })];
    const stall = (a, b, goods) => simple(48, 44, 0, 43, (g) => {
      R(g, 3, 14, 3, 28, OUT); R(g, 42, 14, 3, 28, OUT);
      box(g, 2, 26, 44, 17, '#a87c4e', '#7a5533', 8);
      for (let i = 0; i < 6; i++) {
        const col = goods[i % goods.length];
        disc(g, 8 + i * 6, 31, 2, 2, col);
        R(g, 7 + i * 6, 30, 1, 1, '#fff6d0');
      }
      R(g, 0, 3, 48, 15, OUT);
      for (let i = 0; i < 8; i++) {
        R(g, 1 + i * 6 - (i ? 0 : 0), 4, 6, 12, i % 2 ? b : a);
        R(g, 1 + i * 6, 4, 6, 2, 'rgba(255,255,255,.3)');
        R(g, 1 + i * 6, 16, 6, 3, i % 2 ? b : a);
        R(g, 2 + i * 6, 19, 4, 1, i % 2 ? b : a);
      }
      R(g, 0, 17, 48, 1, 'rgba(0,0,0,.2)');
    });
    OUTDOOR.stall_a = [stall('#d9483f', '#f6ead0', ['#e0553f', '#e8a93a', '#7aba4a'])];
    OUTDOOR.stall_b = [stall('#2f8f9a', '#f6ead0', ['#8a4aa8', '#e8c14a', '#d84a5a'])];
    OUTDOOR.stall_c = [stall('#d99a2f', '#fbf1d6', ['#9e6a3a', '#7a4a2a', '#c88a4a'])];
    // بسطات السجل التجاري
    OUTDOOR.firm_veg = [stall('#3f8f5a', '#f6f0da', ['#e0553f', '#7aba4a', '#e8a93a', '#f0d040'])];
    OUTDOOR.firm_karakStall = [stall('#7a4a2a', '#ecd8b0', ['#c9962e', '#f4efe0', '#d88a36'])];
    OUTDOOR.firm_usedClothes = [stall('#8a4aa8', '#f4e8f8', ['#2f8f9a', '#d8608a', '#e8c14a', '#f4efe0'])];
    OUTDOOR.firm_toyStall = [stall('#2b6fc8', '#f8e27a', ['#d9483f', '#46a86a', '#e8c14a', '#8e62c9'])];
    // لوحة المشروع المنزلي جنب باب البيت
    const sign = (col) => simple(16, 22, 8, 21, (g) => {
      R(g, 7, 10, 2, 12, '#6b4426');
      R(g, 0, 0, 16, 12, OUT);
      R(g, 1, 1, 14, 10, col);
      R(g, 3, 3, 10, 2, '#fff6d0');
      R(g, 3, 7, 7, 1, '#fff6d0');
    });
    OUTDOOR.sign_sweets = [sign('#d86f8a')];
    OUTDOOR.sign_tailor = [sign('#2f8f9a')];
    OUTDOOR.sign_barber = [sign('#2b4f8a')];
    OUTDOOR.gate = [simple(80, 64, 0, 63, (g) => {
      for (const x of [0, 64]) {
        R(g, x, 12, 16, 52, OUT); R(g, x + 1, 13, 14, 50, '#dcc49a'); R(g, x + 1, 13, 14, 3, '#f0dfba');
        R(g, x + 12, 16, 3, 47, '#b89a6e');
        for (let i = 0; i < 3; i++) R(g, x + 2 + i * 5, 6, 3, 7, '#dcc49a');
      }
      R(g, 0, 8, 80, 18, OUT); R(g, 1, 9, 78, 16, '#dcc49a'); R(g, 1, 9, 78, 2, '#f0dfba');
      for (let i = 0; i < 13; i++) { R(g, 2 + i * 6, 3, 4, 6, OUT); R(g, 3 + i * 6, 4, 2, 5, '#f0dfba'); }
      R(g, 16, 25, 48, 3, '#8a6c44');
      R(g, 28, 12, 24, 10, '#2f7f78'); R(g, 28, 12, 24, 1, '#58b5a6');
      R(g, 31, 15, 18, 1, '#f3d27a'); R(g, 34, 18, 12, 1, '#f3d27a');
    })];
    OUTDOOR.fountain = { base: null };
    const { c, g } = mk(80, 88);
    const cx = 40;
    const cy = 50;
    disc(g, cx, cy + 2, 38, 34, OUT);
    disc(g, cx, cy + 1, 37, 33, '#a8926c');
    disc(g, cx, cy - 1, 37, 32, '#e6d6b4');
    disc(g, cx, cy - 1, 32, 27, OUT);
    disc(g, cx, cy, 31, 26, '#2d7fb4');
    disc(g, cx - 2, cy - 2, 24, 20, '#3a93c6');
    disc(g, cx, cy + 8, 11, 7, OUT);
    disc(g, cx, cy + 7, 10, 6, '#e6d6b4');
    R(g, cx - 3, cy - 18, 6, 26, OUT);
    R(g, cx - 2, cy - 18, 4, 26, '#e6d6b4');
    R(g, cx + 1, cy - 18, 1, 26, '#b8a27c');
    disc(g, cx, cy - 20, 9, 5, OUT);
    disc(g, cx, cy - 21, 8, 4, '#e6d6b4');
    disc(g, cx, cy - 21, 5, 2, '#58b5e0');
    OUTDOOR.fountain = { c, ax: 0, ay: 87, cx, topY: cy - 21, cy };
  }

  // ---------- أيقونات اللوحات ----------
  const ICONS = {
    bakery(g, x, y) { disc(g, x + 6, y + 6, 6, 4, '#8a5a2a'); disc(g, x + 6, y + 5, 5, 3, '#d9a050'); R(g, x + 3, y + 4, 1, 3, '#8a5a2a'); R(g, x + 6, y + 4, 1, 3, '#8a5a2a'); R(g, x + 9, y + 4, 1, 3, '#8a5a2a'); },
    grocery(g, x, y) { R(g, x + 5, y, 3, 1, '#215f8c'); R(g, x + 4, y + 1, 5, 1, '#3a93c6'); R(g, x + 3, y + 2, 7, 9, '#215f8c'); R(g, x + 4, y + 3, 5, 7, '#58b5e0'); R(g, x + 5, y + 4, 1, 4, '#d8f0fa'); },
    restaurant(g, x, y) { disc(g, x + 6, y + 8, 6, 3, '#f4efe0'); R(g, x, y + 7, 13, 1, '#b8b2a0'); disc(g, x + 6, y + 6, 4, 2, '#d88a36'); R(g, x + 3, y + 1, 1, 3, '#e8e8e8'); R(g, x + 6, y, 1, 3, '#e8e8e8'); R(g, x + 9, y + 1, 1, 3, '#e8e8e8'); },
    cafe(g, x, y) { R(g, x + 5, y, 3, 2, '#c9962e'); R(g, x + 3, y + 2, 7, 1, '#e0b64f'); R(g, x + 2, y + 3, 9, 8, '#c9962e'); R(g, x + 3, y + 4, 3, 6, '#f0d27a'); R(g, x + 11, y + 4, 2, 1, '#c9962e'); R(g, x, y + 2, 2, 2, '#c9962e'); },
    toys(g, x, y) { R(g, x + 1, y + 1, 11, 11, OUT); R(g, x + 2, y + 2, 9, 9, '#f4f0e4'); for (const [a, b] of [[3, 3], [8, 3], [5, 6], [3, 9], [8, 9]]) R(g, x + a, y + b, 2, 1, '#d9483f'); },
    arcade(g, x, y) { R(g, x + 1, y + 7, 11, 5, OUT); R(g, x + 2, y + 8, 9, 3, '#5a4aa8'); R(g, x + 6, y + 2, 2, 6, '#2b2b3f'); disc(g, x + 6, y + 2, 2, 2, '#e8483f'); },
    clothes(g, x, y) { R(g, x + 1, y + 2, 11, 3, '#2f8f9a'); R(g, x + 4, y + 2, 5, 10, '#2f8f9a'); R(g, x + 5, y + 2, 3, 1, '#f4efe0'); R(g, x + 6, y + 4, 1, 7, '#58b5a6'); },
    books(g, x, y) { R(g, x + 1, y + 2, 11, 9, OUT); R(g, x + 2, y + 3, 4, 7, '#f4efe0'); R(g, x + 7, y + 3, 4, 7, '#f4efe0'); R(g, x + 3, y + 5, 2, 1, '#8a8478'); R(g, x + 8, y + 5, 2, 1, '#8a8478'); },
    school(g, x, y) { R(g, x + 1, y + 1, 11, 11, OUT); R(g, x + 2, y + 2, 9, 9, '#2f6e4f'); R(g, x + 3, y + 4, 6, 1, '#f4f0e4'); R(g, x + 3, y + 7, 4, 1, '#f4f0e4'); },
    finance(g, x, y) { disc(g, x + 6, y + 6, 6, 6, '#a87c1e'); disc(g, x + 6, y + 6, 5, 5, '#f0cc50'); R(g, x + 5, y + 3, 3, 7, '#a87c1e'); },
    security(g, x, y) { R(g, x + 2, y + 1, 9, 7, '#2b4f8a'); R(g, x + 3, y + 8, 7, 2, '#2b4f8a'); R(g, x + 5, y + 10, 3, 2, '#2b4f8a'); R(g, x + 5, y + 3, 3, 4, '#f0cc50'); },
    court(g, x, y) { R(g, x + 6, y, 1, 11, '#6b4426'); R(g, x + 1, y + 2, 11, 1, '#6b4426'); R(g, x, y + 5, 4, 2, '#a87c1e'); R(g, x + 9, y + 5, 4, 2, '#a87c1e'); R(g, x + 3, y + 11, 7, 1, '#6b4426'); },
    bank(g, x, y) { R(g, x + 1, y + 3, 11, 2, '#6b6b7c'); for (const dx of [2, 5, 8, 10]) R(g, x + dx, y + 5, 1, 5, '#6b6b7c'); R(g, x + 1, y + 10, 11, 2, '#6b6b7c'); R(g, x + 5, y, 3, 3, '#6b6b7c'); },
    works(g, x, y) { R(g, x + 1, y + 2, 7, 3, '#8a5a34'); R(g, x + 4, y + 5, 2, 7, '#6b4426'); R(g, x + 8, y + 3, 4, 1, '#6b4426'); },
    supply(g, x, y) { R(g, x + 3, y + 1, 7, 11, '#c9a068'); R(g, x + 4, y, 5, 1, '#8a6a3a'); R(g, x + 5, y + 4, 3, 4, '#3f7a48'); },
    exchange(g, x, y) { R(g, x, y + 11, 13, 1, '#2b2b3f'); R(g, x + 1, y + 8, 2, 3, '#2f9a5a'); R(g, x + 4, y + 5, 2, 6, '#2f9a5a'); R(g, x + 7, y + 7, 2, 4, '#d03a3a'); R(g, x + 10, y + 2, 2, 9, '#2f9a5a'); for (let i = 0; i < 4; i++) R(g, x + 1 + i * 3, y + 7 - i * 2, 3, 1, '#a87c1e'); },
    central(g, x, y) { R(g, x + 1, y + 4, 11, 1, '#a87c1e'); R(g, x + 3, y + 1, 7, 3, '#a87c1e'); for (const dx of [2, 5, 8, 10]) R(g, x + dx, y + 5, 1, 5, '#a87c1e'); R(g, x + 1, y + 10, 11, 2, '#a87c1e'); disc(g, x + 6, y + 2, 1, 1, '#f0cc50'); },
    oil(g, x, y) { disc(g, x + 6, y + 8, 5, 5, '#1b1b2b'); R(g, x + 5, y + 1, 3, 4, '#1b1b2b'); R(g, x + 6, y + 2, 1, 2, '#1b1b2b'); R(g, x + 4, y + 6, 2, 2, '#6b6b7c'); },
    airport(g, x, y) { R(g, x + 5, y, 3, 13, '#2b4f8a'); R(g, x, y + 5, 13, 3, '#2b4f8a'); R(g, x + 3, y + 10, 7, 2, '#2b4f8a'); R(g, x + 6, y + 1, 1, 10, '#6cc4e4'); },
    // محلات السجل التجاري
    perfume(g, x, y) { R(g, x + 5, y, 3, 3, '#a87c1e'); R(g, x + 4, y + 3, 5, 1, OUT); R(g, x + 2, y + 4, 9, 8, '#7a3a6b'); R(g, x + 3, y + 5, 7, 6, '#c86aa8'); R(g, x + 4, y + 6, 2, 3, '#f4d8ea'); },
    pharmacy(g, x, y) { R(g, x, y, 13, 13, '#f8f8f4'); R(g, x + 5, y + 2, 3, 9, '#2f9a5a'); R(g, x + 2, y + 5, 9, 3, '#2f9a5a'); },
    electronics(g, x, y) { R(g, x + 1, y + 1, 11, 8, OUT); R(g, x + 2, y + 2, 9, 6, '#3a93c6'); R(g, x + 3, y + 3, 3, 2, '#d8f0fa'); R(g, x + 5, y + 9, 3, 2, OUT); R(g, x + 3, y + 11, 7, 1, OUT); },
    furniture(g, x, y) { R(g, x + 1, y + 4, 11, 5, '#8a5a34'); R(g, x + 1, y + 2, 3, 3, '#a86e40'); R(g, x + 9, y + 2, 3, 3, '#a86e40'); R(g, x + 2, y + 5, 9, 2, '#d8a070'); R(g, x + 2, y + 9, 1, 3, OUT); R(g, x + 10, y + 9, 1, 3, OUT); },
    gold(g, x, y) { disc(g, x + 6, y + 7, 5, 5, '#a87c1e'); disc(g, x + 6, y + 7, 3, 3, '#121533'); R(g, x + 4, y, 5, 3, '#f0cc50'); R(g, x + 5, y + 1, 3, 1, '#fff4c0'); R(g, x + 3, y + 3, 2, 1, '#f0cc50'); R(g, x + 8, y + 3, 2, 1, '#f0cc50'); },
    clinic(g, x, y) { R(g, x, y, 13, 13, '#f8f8f4'); for (let i = 0; i < 9; i++) { const a = Math.PI * 0.35 + (i / 8) * Math.PI * 1.3; R(g, x + 6 + Math.round(Math.cos(a) * 4), y + 6 + Math.round(Math.sin(a) * 4), 2, 2, '#d03a3a'); } },
  };

  // ---------- المباني ----------
  const WALLS = [
    { wall: '#e3c89a', dark: '#c4a472', light: '#f2dfb8', roof: '#d7bd92', roof2: '#c6aa7e' },
    { wall: '#ecdcc0', dark: '#cdb793', light: '#faf0da', roof: '#e0cfb2', roof2: '#cdb997' },
    { wall: '#d9a884', dark: '#b6835f', light: '#ecc4a4', roof: '#cf9f7c', roof2: '#b98a66' },
    { wall: '#e6c07c', dark: '#c49c58', light: '#f4d89c', roof: '#dcb878', roof2: '#c6a160' },
    { wall: '#f2ece0', dark: '#d2c8b4', light: '#ffffff', roof: '#e8e0d0', roof2: '#d4cab6' },
  ];
  const DOORS = ['#2f7f78', '#2b5f9a', '#8a3f2e', '#3f7a48', '#6a4a8a'];

  function plaster(g, x, y, w, h, t, seed) {
    R(g, x, y, w, h, t.wall);
    for (let i = 0; i < (w * h) / 26; i++) {
      const px = x + Math.floor(hash(seed + i, 1) * w);
      const py = y + Math.floor(hash(seed, i + 2) * h);
      const len = 1 + Math.floor(hash(i, seed) * 4);
      R(g, px, py, Math.min(len, x + w - px), 1, i % 3 === 0 ? t.light : t.dark);
    }
  }
  function roofTop(g, x, y, w, h, t, seed) {
    R(g, x, y, w, h, OUT);
    R(g, x + 1, y + 1, w - 2, h - 2, t.light);
    R(g, x + 4, y + 4, w - 8, h - 8, t.roof);
    R(g, x + 4, y + 4, w - 8, 2, t.roof2);
    R(g, x + 4, y + 4, 2, h - 8, t.roof2);
    specks(g, x + 6, y + 6, w - 12, h - 12, [t.roof2, t.light], Math.floor((w * h) / 26), seed);
    // شرفات المقدمة
    for (let px = x + 1; px < x + w - 2; px += 6) {
      R(g, px, y + h - 6, 4, 5, t.light);
      R(g, px + 3, y + h - 6, 1, 5, t.dark);
      R(g, px + 1, y + h - 7, 2, 1, t.light);
    }
  }
  function windowAt(g, x, y, w, h, shutter, list) {
    arch(g, x - 1, y - 1, w + 2, h + 2, OUT);
    arch(g, x, y, w, h, '#2a3350');
    for (let i = 2; i < h; i += 3) R(g, x + 1, y + i, w - 2, 1, '#51607f');
    R(g, x + Math.floor(w / 2), y + 1, 1, h - 1, '#51607f');
    R(g, x - 3, y + 3, 2, h - 3, shutter);
    R(g, x + w + 1, y + 3, 2, h - 3, shutter);
    R(g, x - 2, y + h + 1, w + 4, 1, '#f6ead0');
    if (list) list.push({ x, y: y + 3, w, h: h - 3 });
  }
  function doorAt(g, x, y, w, h, col) {
    arch(g, x - 2, y - 2, w + 4, h + 2, OUT);
    arch(g, x - 1, y - 1, w + 2, h + 1, '#f6ead0');
    arch(g, x, y, w, h, col);
    for (let i = 3; i < w; i += 4) R(g, x + i, y + 3, 1, h - 3, 'rgba(0,0,0,.28)');
    for (let py = y + 6; py < y + h; py += 6) for (let px = x + 2; px < x + w - 1; px += 4) R(g, px, py, 1, 1, '#f0cc70');
    R(g, x + w - 3, y + Math.floor(h / 2) + 2, 2, 2, '#f0cc70');
  }
  function windTower(g, x, y, t) {
    // برجيل على السطح
    R(g, x, y, 16, 26, OUT);
    R(g, x + 1, y + 1, 14, 24, t.wall);
    R(g, x + 1, y + 1, 14, 2, t.light);
    R(g, x + 12, y + 3, 3, 22, t.dark);
    for (const px of [3, 7, 11]) { R(g, x + px - 1, y + 5, 2, 12, '#3a2a22'); }
    R(g, x + 1, y + 19, 14, 1, t.dark);
    for (let i = 0; i < 4; i++) R(g, x + 1 + i * 4, y - 3, 2, 3, t.light);
  }

  function roofDeco(g, x, y, w, h, seed, t) {
    const v = Math.floor(hash(seed, 9) * 4);
    if (v === 0) {
      // زولية منشورة
      R(g, x, y, 22, 14, OUT); R(g, x + 1, y + 1, 20, 12, '#a8393f'); R(g, x + 3, y + 3, 16, 8, '#e0b64f'); R(g, x + 5, y + 5, 12, 4, '#2b5f9a');
    } else if (v === 1) {
      // خزان ماي
      disc(g, x + 10, y + 8, 9, 7, OUT); disc(g, x + 10, y + 7, 8, 6, '#9fb4c0'); disc(g, x + 8, y + 5, 4, 2, '#d4e0e6');
    } else if (v === 2) {
      // حبل غسيل
      R(g, x, y + 2, 28, 1, '#6b4a2b');
      R(g, x + 3, y + 3, 6, 8, '#d9483f'); R(g, x + 11, y + 3, 5, 7, '#f6f0e0'); R(g, x + 18, y + 3, 7, 9, '#3f86d1');
    } else {
      // تمر ينشف
      R(g, x, y, 24, 12, OUT); R(g, x + 1, y + 1, 22, 10, '#c8a468');
      for (let i = 0; i < 24; i++) R(g, x + 2 + Math.floor(hash(i, seed) * 20), y + 2 + Math.floor(hash(seed, i) * 8), 2, 1, '#7a3f22');
    }
  }

  function buildBuilding(b) {
    const TS = VQ.TILE;
    const pw = b.w * TS;
    const fh = b.h * TS;
    const extra = 26;
    const { c, g } = mk(pw, fh + extra);
    const top = extra;
    const wallH = b.wallRows * TS;
    const wallY = top + fh - wallH;
    const windows = [];
    const seed = b.seed;
    const themeIdx = b.kind === 'clinic' || b.kind === 'branch' ? 4 : b.kind === 'hall' ? 1 : b.seed % WALLS.length;
    const t = b.kind === 'palace' ? { wall: '#f4e2a8', dark: '#cfae62', light: '#fff4cc', roof: '#ead59a', roof2: '#d6bb78' } : WALLS[themeIdx];
    const doorCol = b.kind === 'clinic' ? '#2f7f78' : DOORS[seed % DOORS.length];
    const shutter = DOORS[(seed + 2) % DOORS.length];

    roofTop(g, 0, top, pw, fh - wallH + 5, t, seed);
    plaster(g, 1, wallY, pw - 2, wallH - 1, t, seed);
    R(g, 0, wallY, 1, wallH, OUT);
    R(g, pw - 1, wallY, 1, wallH, OUT);
    R(g, 1, wallY, pw - 2, 2, 'rgba(60,40,20,.35)');
    R(g, pw - 4, wallY, 3, wallH - 1, t.dark);
    R(g, 1, wallY + wallH - 5, pw - 2, 4, t.dark);
    R(g, 0, wallY + wallH - 1, pw, 1, OUT);
    // شريط الجبس
    for (let px = 2; px < pw - 3; px += 4) {
      R(g, px, wallY + 3, 2, 1, t.light);
      R(g, px + 1, wallY + 4, 1, 1, t.light);
    }

    const doorPx = (b.doorX - b.x) * TS;
    if (b.kind === 'house') {
      doorAt(g, doorPx + 2, wallY + 10, 12, 21, doorCol);
      windowAt(g, 14, wallY + 9, 10, 13, shutter, windows);
      windowAt(g, pw - 24, wallY + 9, 10, 13, shutter, windows);
      R(g, doorPx + 2, wallY + wallH - 1, 12, 1, '#c9b48a');
      if (seed % 3 !== 0) windTower(g, seed % 2 ? 10 : pw - 30, top + 6 - 16, t);
      roofDeco(g, seed % 2 ? pw - 40 : 34, top + 16, 28, 14, seed, t);
    } else if (b.kind === 'hall' || b.kind === 'palace') {
      drawHallFront(g, b, t, wallY, wallH, top, pw, windows);
    } else if (b.kind === 'branch') {
      doorAt(g, doorPx + 1, wallY + 20, 14, 27, '#2b5f9a');
      for (const wx of [14, 42, pw - 56, pw - 28]) windowAt(g, wx, wallY + 14, 12, 17, '#2b5f9a', windows);
      R(g, doorPx - 7, wallY + 3, 30, 15, OUT);
      R(g, doorPx - 6, wallY + 4, 28, 13, '#f6ead0');
      ICONS[b.icon](g, doorPx + 2, wallY + 4);
      // علم الدولة على السطح
      R(g, 20, top - 6, 2, 30, '#5e5e6c');
      R(g, 22, top - 6, 14, 9, '#3f7a48');
      R(g, 22, top - 3, 14, 3, '#f6f0e0');
    } else if (b.kind === 'school' || b.kind === 'clinic') {
      doorAt(g, doorPx + 1, wallY + 22, 14, 25, doorCol);
      const n = 5;
      for (let i = 0; i < n; i++) {
        if (i === Math.floor(n / 2)) continue;
        const wx = 10 + i * ((pw - 30) / (n - 1));
        windowAt(g, Math.round(wx), wallY + 14, 12, 17, b.kind === 'clinic' ? '#2f7f78' : '#b8503a', windows);
      }
      // لوحة فوق الباب
      R(g, doorPx - 7, wallY + 5, 30, 15, OUT);
      R(g, doorPx - 6, wallY + 6, 28, 13, '#f6ead0');
      ICONS[b.kind](g, doorPx + 2, wallY + 7 - 1);
      if (b.kind === 'school') {
        // سارية علم وساحة صغيرة على السطح
        R(g, 22, top - 6, 2, 30, '#5e5e6c');
        R(g, 24, top - 6, 14, 9, '#3f7a48');
        R(g, 24, top - 3, 14, 3, '#f6f0e0');
        roofDeco(g, pw - 50, top + 26, 28, 14, 3, t);
      } else {
        for (let i = 0; i < 3; i++) R(g, pw / 2 - 16 + i, top + 28 - 0, 34 - i * 2, 0, t.light);
        R(g, pw / 2 - 22, top + 22, 44, 44, '#e0d6c0');
        R(g, pw / 2 - 18, top + 26, 36, 36, '#f4efe0');
        R(g, pw / 2 - 4, top + 30, 8, 28, '#d03a3a');
        R(g, pw / 2 - 14, top + 40, 28, 8, '#d03a3a');
      }
    } else {
      // محل: مظلة، واجهة زجاج، ولوحة
      const colors = { grocery: ['#3f8f5a', '#f6f0da'], bakery: ['#d99a2f', '#fbf1d6'], restaurant: ['#c8423a', '#f6ead0'], cafe: ['#7a4a2a', '#ecd8b0'], toys: ['#7a58c8', '#f8e27a'], arcade: ['#2b2b5f', '#e8483f'], clothes: ['#d8608a', '#fbe8ee'], books: ['#2f6f8f', '#ecdcc0'], perfume: ['#7a3a6b', '#f4d8ea'], pharmacy: ['#2f9a5a', '#f4f8f0'], electronics: ['#2b4f8a', '#d8f0fa'], furniture: ['#8a5a34', '#f2dfb8'], gold: ['#a87c1e', '#fff4c0'] }[b.kind] || ['#6b6b7c', '#f4efe0'];
      R(g, doorPx + 1, wallY + 8, 14, 23, OUT);
      doorAt(g, doorPx + 2, wallY + 11, 12, 20, doorCol);
      for (const wx of [6, pw - 34]) {
        R(g, wx - 1, wallY + 10, 30, 17, OUT);
        R(g, wx, wallY + 11, 28, 15, '#34425e');
        R(g, wx, wallY + 11, 28, 2, '#6e84a4');
        // بضاعة في الواجهة
        for (let i = 0; i < 4; i++) {
          const col = [colors[0], '#e8a93a', '#f4efe0', colors[1]][i];
          R(g, wx + 3 + i * 6, wallY + 19, 4, 6, col);
          R(g, wx + 3 + i * 6, wallY + 19, 4, 1, 'rgba(255,255,255,.5)');
        }
        R(g, wx + 13, wallY + 11, 1, 15, '#6e84a4');
        windows.push({ x: wx, y: wallY + 11, w: 28, h: 15 });
      }
      // المظلة
      for (let i = 0; i * 8 < pw; i++) {
        const col = colors[i % 2];
        R(g, i * 8, wallY + 2, 8, 8, col);
        R(g, i * 8 + 1, wallY + 10, 6, 2, col);
        R(g, i * 8 + 2, wallY + 12, 4, 1, col);
        R(g, i * 8, wallY + 2, 8, 1, 'rgba(255,255,255,.35)');
      }
      R(g, 0, wallY + 1, pw, 1, OUT);
      // لوحة على السطح
      R(g, pw / 2 - 18, wallY - 22, 36, 22, OUT);
      R(g, pw / 2 - 17, wallY - 21, 34, 20, colors[0]);
      R(g, pw / 2 - 10, wallY - 19, 20, 16, '#f6ead0');
      if (ICONS[b.kind]) ICONS[b.kind](g, pw / 2 - 7, wallY - 17);
      if (seed % 2) windTower(g, 8, top + 2 - 12, t);
    }
    return { c, windows, extra };
  }

  function drawHallFront(g, b, t, wallY, wallH, top, pw) {
    const cx = pw / 2;
    // أبراج الزوايا
    for (const x of [0, pw - 26]) {
      R(g, x, top + 4, 26, wallY - top + wallH - 5, OUT);
      R(g, x + 1, top + 5, 24, 26, t.light);
      R(g, x + 4, top + 8, 18, 20, t.roof);
      disc(g, x + 13, top + 16, 8, 8, OUT);
      disc(g, x + 13, top + 15, 7, 7, '#2f8f8a');
      disc(g, x + 11, top + 13, 3, 3, '#6ed0c0');
      plaster(g, x + 1, top + 31, 24, wallY - top + wallH - 33, t, 5 + x);
      R(g, x + 21, top + 31, 4, wallY - top + wallH - 33, t.dark);
      for (const yy of [wallY - 44, wallY - 12, wallY + 20]) {
        if (yy > top + 34) windowAt(g, x + 8, yy, 10, 15, '#2f7f78');
      }
    }
    // القبة
    disc(g, cx, top + 44, 39, 36, OUT);
    disc(g, cx, top + 42, 38, 35, '#2a7f7c');
    disc(g, cx - 4, top + 37, 30, 27, '#35a09a');
    disc(g, cx - 10, top + 30, 15, 13, '#62c8bc');
    disc(g, cx - 14, top + 26, 5, 4, '#b8ece0');
    for (let i = 1; i < 6; i++) {
      for (let a = 0; a < 40; a++) {
        const ang = (a / 40) * Math.PI * 2;
        if (a % 2) R(g, Math.round(cx + Math.cos(ang) * i * 6.2), Math.round(top + 42 + Math.sin(ang) * i * 5.7), 1, 1, 'rgba(10,50,50,.3)');
      }
    }
    R(g, cx - 1, top + 0, 2, 9, '#d9a93a');
    disc(g, cx, top + 2, 3, 3, '#f0cc70');
    // السطح الأمامي: شرفة بعقود
    const arches = 5;
    const span = (pw - 60) / arches;
    for (let i = 0; i < arches; i++) {
      const ax = 30 + i * span;
      if (i === 2) continue;
      arch(g, ax + 3, wallY + 17, span - 6, 46, OUT);
      arch(g, ax + 4, wallY + 18, span - 8, 45, '#5a4632');
      windowAt(g, Math.round(ax + span / 2 - 6), wallY + 26, 12, 20, '#2f7f78');
    }
    for (let i = 0; i <= arches; i++) {
      const ax = 30 + i * span;
      R(g, ax - 2, wallY + 12, 5, 51, OUT);
      R(g, ax - 1, wallY + 12, 3, 51, t.light);
    }
    // البوابة الكبيرة
    arch(g, cx - 25, wallY + 16, 50, 47, OUT);
    arch(g, cx - 23, wallY + 18, 46, 45, '#f6ead0');
    arch(g, cx - 21, wallY + 21, 42, 42, '#2f7f78');
    R(g, cx - 1, wallY + 24, 2, 39, OUT);
    for (let py = wallY + 28; py < wallY + 60; py += 6) {
      for (let px = cx - 18; px < cx + 18; px += 5) if (Math.abs(px - cx) > 2) R(g, px, py, 1, 1, '#f0cc70');
    }
    // ساعة ولوحة
    R(g, cx - 26, wallY - 14, 52, 25, OUT);
    R(g, cx - 25, wallY - 13, 50, 23, t.light);
    disc(g, cx, wallY - 2, 10, 10, OUT);
    disc(g, cx, wallY - 2, 9, 9, '#fbf6e6');
    R(g, cx, wallY - 9, 1, 8, OUT);
    R(g, cx, wallY - 2, 6, 1, OUT);
    for (let a = 0; a < 12; a++) R(g, Math.round(cx + Math.cos((a * Math.PI) / 6) * 7), Math.round(wallY - 2 + Math.sin((a * Math.PI) / 6) * 7), 1, 1, '#8a6c44');
    // أعلام
    for (const x of [cx - 52, cx + 48]) {
      R(g, x, wallY - 40, 2, 44, '#5e5e6c');
      R(g, x + 2, wallY - 40, 16, 11, '#3f7a48');
      R(g, x + 2, wallY - 36, 16, 3, '#f6f0e0');
    }
  }

  // ---------- الأثاث ----------
  const wood = '#a87c4e';
  const woodD = '#7a5533';
  const F = {
    bed(g) { box(g, 1, 8, 30, 40, '#f4f0e4', '#7a5533', 5); R(g, 2, 2, 28, 10, OUT); R(g, 3, 3, 26, 8, wood); R(g, 3, 3, 26, 2, '#cca670'); R(g, 4, 13, 11, 8, '#ffffff'); R(g, 17, 13, 11, 8, '#ffffff'); R(g, 4, 20, 11, 1, '#c8c2b0'); R(g, 17, 20, 11, 1, '#c8c2b0'); R(g, 2, 23, 28, 20, '#3f86a8'); R(g, 2, 23, 28, 2, '#6ab0cc'); for (let i = 0; i < 4; i++) R(g, 5 + i * 6, 29, 3, 3, '#e0b64f'); },
    kbed(g) { box(g, 1, 6, 14, 26, '#f4f0e4', '#7a5533', 4); R(g, 2, 0, 12, 8, OUT); R(g, 3, 1, 10, 6, wood); R(g, 3, 9, 10, 5, '#ffffff'); R(g, 2, 15, 12, 12, '#d86f8a'); R(g, 2, 15, 12, 2, '#f09ab0'); },
    wardrobe(g) { box(g, 1, -6, 30, 22, '#8a6240', '#a87c4e', 16); R(g, 15, 1, 1, 14, OUT); R(g, 12, 7, 2, 2, '#f0cc70'); R(g, 18, 7, 2, 2, '#f0cc70'); R(g, 3, 2, 10, 11, '#946c44'); R(g, 18, 2, 11, 11, '#946c44'); },
    fridge(g) { box(g, 1, -8, 14, 24, '#e8ecef', '#cfd6dc', 18); R(g, 2, 4, 12, 1, '#8a949c'); R(g, 11, -1, 1, 3, '#6a747c'); R(g, 11, 6, 1, 5, '#6a747c'); },
    stove(g) { box(g, 1, 0, 14, 16, '#4a4a55', '#d8dade', 8); disc(g, 5, 4, 2, 2, '#22222a'); disc(g, 11, 4, 2, 2, '#22222a'); R(g, 3, 9, 10, 5, '#3a3a44'); R(g, 4, 10, 8, 1, '#f08a3c'); },
    sink(g) { box(g, 1, 0, 14, 16, '#c8d4d8', '#a87c4e', 8); R(g, 3, 2, 10, 5, '#7f949c'); R(g, 7, 0, 2, 3, '#e8ecef'); R(g, 3, 9, 4, 5, '#946c44'); R(g, 9, 9, 4, 5, '#946c44'); },
    jug(g) { disc(g, 8, 10, 5, 5, OUT); disc(g, 8, 10, 4, 4, '#3a93c6'); disc(g, 7, 9, 2, 2, '#a6e0ef'); R(g, 6, 2, 4, 4, OUT); R(g, 7, 3, 2, 3, '#a6e0ef'); },
    dallah(g) { R(g, 2, 10, 12, 5, OUT); R(g, 3, 11, 10, 3, woodD); disc(g, 8, 6, 3, 4, OUT); disc(g, 8, 6, 2, 3, '#e0b64f'); R(g, 7, 0, 2, 3, '#e0b64f'); R(g, 11, 4, 2, 1, '#e0b64f'); R(g, 3, 6, 2, 1, '#e0b64f'); },
    table(g) { box(g, 1, 4, 30, 26, '#b98c5a', woodD, 5); R(g, 2, 5, 28, 2, '#d0a878'); disc(g, 10, 12, 3, 2, '#f4efe0'); disc(g, 21, 16, 3, 2, '#f4efe0'); R(g, 15, 10, 2, 4, '#3a93c6'); R(g, 3, 29, 3, 3, OUT); R(g, 26, 29, 3, 3, OUT); },
    lowtable(g) { box(g, 1, 4, 30, 11, '#a87c4e', woodD, 3); R(g, 7, 6, 4, 3, '#f4efe0'); R(g, 20, 5, 4, 4, '#e0b64f'); },
    tv(g) { box(g, 1, 6, 30, 10, wood, woodD, 5); R(g, 4, -6, 24, 15, OUT); R(g, 5, -5, 22, 12, '#2a3350'); R(g, 6, -4, 8, 1, '#51607f'); R(g, 6, -2, 4, 1, '#51607f'); },
    bookshelf(g) { box(g, 1, -6, 30, 22, '#7a5533', '#5e4227', 18); for (const y of [-2, 7]) { R(g, 3, y, 26, 7, '#3e2c1c'); for (let i = 0; i < 9; i++) { const col = ['#c8423a', '#3f86d1', '#e0b64f', '#46a86a', '#8e62c9'][(i * 3 + y + 9) % 5]; R(g, 4 + i * 3, y + 1, 2, 6, col); } } },
    plant(g) { R(g, 4, 10, 8, 5, OUT); R(g, 5, 11, 6, 3, '#c0683a'); disc(g, 8, 6, 6, 6, '#1f4d2a'); disc(g, 8, 5, 5, 5, '#3f8c42'); disc(g, 6, 3, 2, 2, '#7cc25a'); },
    pwall(g) { R(g, 0, -8, 16, 24, OUT); R(g, 1, -7, 14, 8, '#c8b48e'); R(g, 1, 1, 14, 15, '#e0ceaa'); R(g, 1, 1, 14, 1, '#f4e8cc'); },
    counter(g) { box(g, 0, 2, 48, 14, '#c49a64', woodD, 8); R(g, 1, 3, 46, 1, '#e0bc84'); R(g, 3, -3, 10, 7, OUT); R(g, 4, -2, 8, 5, '#58585f'); R(g, 5, -1, 6, 1, '#7cd67c'); for (let i = 1; i < 6; i++) R(g, i * 8, 9, 1, 6, OUT); },
    oven(g) { box(g, 1, -8, 30, 24, '#b8704a', '#a65f3c', 18); arch(g, 8, 0, 16, 14, OUT); arch(g, 9, 1, 14, 13, '#3a1c10'); R(g, 11, 9, 10, 3, '#f08a3c'); R(g, 13, 7, 6, 2, '#f8c060'); },
    s_bottles(g) { F._shelf(g, (x, y, i) => { R(g, x, y + 1, 3, 6, '#58b5e0'); R(g, x + 1, y, 1, 1, '#e8f4fa'); R(g, x, y + 3, 3, 1, i % 2 ? '#e8f4fa' : '#2d7fb4'); }); },
    s_cans(g) { F._shelf(g, (x, y, i) => { R(g, x, y + 2, 3, 5, ['#c8423a', '#e0b64f', '#46a86a', '#d88a36'][i % 4]); R(g, x, y + 2, 3, 1, '#e8e8e8'); }); },
    s_bread(g) { F._shelf(g, (x, y, i) => { disc(g, x + 1, y + 5, 1, 2, i % 2 ? '#d9a050' : '#c08838'); R(g, x + 1, y + 4, 1, 1, '#f0c880'); }); },
    s_toys(g) { F._shelf(g, (x, y, i) => { const c = ['#d9483f', '#3f86d1', '#e0b64f', '#46a86a', '#8e62c9'][i % 5]; if (i % 3 === 0) disc(g, x + 1, y + 5, 1, 2, c); else R(g, x, y + 3, 3, 4, c); R(g, x, y + 3, 1, 1, '#ffffff'); }); },
    s_books(g) { F._shelf(g, (x, y, i) => { R(g, x, y + 1, 2, 6, ['#c8423a', '#3f86d1', '#e0b64f', '#46a86a', '#8e62c9', '#d86f8a'][i % 6]); R(g, x + 2, y + 2, 1, 5, '#6a4a2a'); }); },
    _shelf(g, fn) { box(g, 1, -6, 30, 22, '#8a6240', '#6b4a2b', 18); let i = 0; for (const y of [-2, 7]) { R(g, 3, y, 26, 7, '#3e2c1c'); for (let x = 4; x < 27; x += 4) fn(x, y, i++ * 7 + y + 20); } },
    rack(g) { R(g, 2, 14, 28, 2, OUT); R(g, 3, -4, 2, 18, '#5e5e6c'); R(g, 27, -4, 2, 18, '#5e5e6c'); R(g, 3, -4, 26, 2, '#8a8a98'); for (let i = 0; i < 5; i++) { const c = ['#f4f0e4', '#2b2b3f', '#d86f8a', '#2f8f9a', '#e0b64f'][i]; R(g, 6 + i * 4, -2, 4, 15, OUT); R(g, 6 + i * 4, -2, 3, 14, c); } },
    mannequin(g) { R(g, 6, 13, 4, 2, OUT); R(g, 7, 9, 2, 5, '#5e5e6c'); R(g, 3, -1, 10, 11, OUT); R(g, 4, 0, 8, 9, '#f4f0e4'); disc(g, 8, -4, 3, 3, OUT); disc(g, 8, -4, 2, 2, '#c8b48e'); },
    arcade(g) { box(g, 1, -10, 14, 26, '#3a2a7a', '#5a4aa8', 19); R(g, 3, -5, 10, 7, '#121830'); R(g, 4, -4, 4, 1, '#7cd67c'); R(g, 8, -2, 3, 1, '#e8483f'); R(g, 5, -1, 2, 1, '#f0cc70'); R(g, 3, 5, 10, 3, '#22222a'); R(g, 5, 3, 1, 3, '#e8e8e8'); R(g, 9, 5, 2, 1, '#e8483f'); R(g, 3, -10, 10, 3, '#e8483f'); },
    carrom(g) { R(g, 2, 2, 28, 28, OUT); R(g, 3, 3, 26, 26, '#7a5533'); R(g, 6, 6, 20, 20, '#e6cfa0'); R(g, 15, 15, 2, 2, '#c8423a'); for (const [a, b] of [[7, 7], [24, 7], [7, 24], [24, 24]]) R(g, a, b, 2, 2, OUT); for (const [a, b] of [[12, 12], [19, 14], [14, 19], [18, 19]]) { R(g, a, b, 2, 2, b % 2 ? '#f4efe0' : '#2b2b3f'); } },
    cafetable(g) { disc(g, 8, 7, 6, 4, OUT); disc(g, 8, 6, 5, 3, '#b98c5a'); R(g, 7, 10, 2, 5, OUT); R(g, 6, 4, 3, 2, '#f4efe0'); },
    desk(g) { box(g, 2, 2, 12, 13, '#c49a64', woodD, 5); R(g, 5, 4, 6, 3, '#f4f0e4'); },
    teacher(g) { box(g, 1, 2, 30, 14, '#a87c4e', woodD, 7); R(g, 8, 3, 7, 4, '#f4f0e4'); R(g, 20, 2, 3, 4, '#d9483f'); },
    clinicbed(g) { box(g, 1, 2, 14, 30, '#ffffff', '#8a949c', 4); R(g, 3, 4, 10, 6, '#dcf0ee'); R(g, 2, 13, 12, 14, '#7cc8c0'); },
    medcab(g) { box(g, 1, -6, 30, 22, '#f4f4f0', '#dcdcd8', 18); for (const y of [-2, 7]) { R(g, 3, y, 26, 7, '#b4d8d8'); for (let i = 0; i < 6; i++) R(g, 5 + i * 4, y + 2, 3, 5, i % 2 ? '#f4f0e4' : '#d9483f'); } },
    mayordesk(g) { box(g, 0, 0, 48, 16, '#8a5a34', '#6b4426', 8); R(g, 1, 1, 46, 1, '#b8845a'); R(g, 8, 2, 12, 5, '#f4f0e4'); R(g, 33, 1, 3, 5, '#e0b64f'); R(g, 38, 2, 6, 4, '#3f7a48'); for (const x of [6, 22, 38]) R(g, x, 10, 5, 4, '#7a4e2c'); },
    flag(g) { R(g, 7, 12, 4, 3, OUT); R(g, 8, -14, 2, 27, '#d9a93a'); R(g, 10, -14, 10, 7, '#3f7a48'); R(g, 10, -11, 10, 2, '#f6f0e0'); },
    longtable(g) { box(g, 0, 3, 64, 29, '#946c44', '#6b4a2b', 5); R(g, 2, 5, 60, 2, '#b8905e'); for (let i = 0; i < 4; i++) { R(g, 6 + i * 14, 12, 8, 5, '#f4f0e4'); R(g, 8 + i * 14, 20, 3, 4, '#3a93c6'); } },
    bench(g) { box(g, 1, 4, 30, 11, '#b98c5a', woodD, 3); R(g, 2, 5, 28, 1, '#d0a878'); },
    crate(g) { box(g, 1, 1, 14, 14, '#c49a64', '#a87c4e', 6); R(g, 3, 3, 3, 3, '#e8483f'); R(g, 8, 3, 3, 3, '#e8a93a'); R(g, 5, 5, 3, 2, '#7ac050'); },
  };

  const CARPETS = [['#a8393f', '#e0b64f', '#2b4f7f'], ['#2b5f7a', '#e8d4a0', '#a8393f'], ['#6a3f7a', '#e0b64f', '#2f7f78'], ['#3f6a48', '#e8d4a0', '#a8533a']];
  function drawFlat(g, f) {
    const px = f.x * 16;
    const py = f.y * 16;
    if (f.s === 'cushion') {
      R(g, px + 1, py + 2, 14, 12, OUT);
      R(g, px + 2, py + 3, 12, 10, '#c8423a');
      R(g, px + 3, py + 4, 10, 2, '#e0705a');
      R(g, px + 7, py + 7, 2, 2, '#e0b64f');
      return;
    }
    const w = f.w * 16;
    const h = f.h * 16;
    const col = CARPETS[(f.hue || 0) % CARPETS.length];
    R(g, px, py, w, h, OUT);
    R(g, px + 1, py + 1, w - 2, h - 2, col[0]);
    R(g, px + 3, py + 3, w - 6, h - 6, col[1]);
    R(g, px + 4, py + 4, w - 8, h - 8, col[2]);
    R(g, px + 7, py + 7, w - 14, h - 14, col[0]);
    for (let x = px + 9; x < px + w - 10; x += 8) {
      for (let y = py + 9; y < py + h - 10; y += 8) {
        R(g, x + 2, y, 2, 6, col[1]);
        R(g, x, y + 2, 6, 2, col[1]);
        R(g, x + 2, y + 2, 2, 2, col[2]);
      }
    }
    for (let x = px; x < px + w; x += 3) { R(g, x, py - 1, 1, 1, col[1]); R(g, x, py + h, 1, 1, col[1]); }
  }
  function drawWallDeco(g, d, wallBase) {
    const px = d.x * 16;
    if (d.s === 'window') {
      const w = (d.w || 2) * 16 - 4;
      R(g, px + 1, 6, w + 2, 18, OUT);
      arch(g, px + 2, 6, w, 17, '#fbf6e6');
      arch(g, px + 4, 8, w - 4, 15, '#8fd0ea');
      R(g, px + 2 + w / 2 - 1, 9, 2, 14, '#fbf6e6');
      R(g, px + 5, 16, w - 6, 1, '#fbf6e6');
      R(g, px + 5, 10, 3, 3, '#cdeefa');
    } else if (d.s === 'frame') {
      R(g, px + 4, 6, 24, 16, OUT); R(g, px + 5, 7, 22, 14, '#c49a64'); R(g, px + 7, 9, 18, 10, '#7cc0d0'); disc(g, px + 16, 18, 6, 2, '#d9b878');
      R(g, px + 11, 12, 1, 6, '#7a5533'); R(g, px + 9, 11, 5, 2, '#3f8c42');
    } else if (d.s === 'calligraphy') {
      const w = (d.w || 2) * 16 - 6;
      R(g, px + 3, 5, w, 18, OUT); R(g, px + 4, 6, w - 2, 16, '#1f5a50'); R(g, px + 5, 7, w - 4, 14, '#267066');
      for (let i = 0; i < w - 12; i += 2) { const a = Math.sin(i * 0.7) * 3; R(g, px + 7 + i, 13 + Math.round(a), 2, 1, '#f0cc70'); if (i % 6 === 0) R(g, px + 7 + i, 9, 1, 7, '#f0cc70'); }
    } else if (d.s === 'clock') {
      disc(g, px + 8, 13, 7, 7, OUT); disc(g, px + 8, 13, 6, 6, '#fbf6e6'); R(g, px + 8, 9, 1, 4, OUT); R(g, px + 8, 13, 3, 1, OUT);
    } else if (d.s === 'menu') {
      R(g, px + 1, 4, 30, 19, OUT); R(g, px + 2, 5, 28, 17, '#2f4f4a'); for (let y = 8; y < 20; y += 3) R(g, px + 5, y, 22, 1, y % 2 ? '#f4efe0' : '#c8d8c8');
    } else if (d.s === 'board') {
      const w = (d.w || 3) * 16;
      R(g, px, 3, w, 22, '#7a5533'); R(g, px + 2, 5, w - 4, 18, '#2f5f48');
      R(g, px + 6, 9, w - 20, 1, '#e8e8dc'); R(g, px + 6, 13, w - 30, 1, '#e8e8dc'); R(g, px + 6, 17, w - 24, 1, '#e8e8dc');
    }
  }

  // ---------- الدواخل ----------
  function floorPixel(style, x, y) {
    const h = hash(x, y);
    if (style === 'wood') {
      const row = y >> 3;
      const off = (row * 21) % 32;
      const seam = ((x + off) & 31) === 0 || (y & 7) === 0;
      if (seam) return '#6b4a2b';
      const tone = hash((x + off) >> 5, row);
      return tone < 0.33 ? '#a87c4e' : tone < 0.66 ? '#b58a58' : '#9c7246';
    }
    if (style === 'tile') {
      const c = ((x >> 4) + (y >> 4)) & 1;
      if ((x & 15) === 0 || (y & 15) === 0) return '#a9b4b4';
      return c ? '#e8ecdc' : '#c8d8d0';
    }
    if (style === 'clay') {
      if ((x & 15) === 0 || (y & 15) === 0) return '#8a5a3a';
      const t = hash(x >> 4, y >> 4);
      return t < 0.5 ? '#c88a5e' : '#d29a6c';
    }
    if (style === 'marble') {
      if ((x & 31) === 0 || (y & 31) === 0) return '#b8ae9a';
      const c = ((x >> 5) + (y >> 5)) & 1;
      if (h > 0.97) return '#c8bea8';
      return c ? '#efe6d2' : '#e0d6be';
    }
    // terrazzo
    if (h > 0.985) return '#a89f8f';
    if (h < 0.02) return '#ece4d4';
    if (h > 0.97) return '#c49a78';
    if ((x & 31) === 0 || (y & 31) === 0) return '#bdb29c';
    return '#d8cdb8';
  }
  const interiorCache = new Map();
  function interiorFloor(inr) {
    if (interiorCache.has(inr.id)) return interiorCache.get(inr.id);
    const pw = inr.w * 16;
    const ph = inr.h * 16;
    const { c, g } = mk(pw, ph);
    for (let y = 32; y < ph; y++) for (let x = 0; x < pw; x++) R(g, x, y, 1, 1, floorPixel(inr.floor, x, y));
    // الجدار الخلفي
    R(g, 0, 0, pw, 32, inr.wall);
    for (let i = 0; i < pw; i++) {
      if (hash(i, 77) > 0.8) R(g, i, 2 + Math.floor(hash(i, 3) * 22), 2, 1, 'rgba(90,60,30,.12)');
    }
    R(g, 0, 0, pw, 4, 'rgba(50,30,20,.35)');
    R(g, 0, 26, pw, 5, '#8a6240');
    R(g, 0, 26, pw, 1, '#b08858');
    R(g, 0, 31, pw, 1, OUT);
    R(g, 0, 32, pw, 3, 'rgba(30,20,15,.28)');
    // ظل وحدود
    R(g, 0, 0, 16, ph, '#2a2030');
    R(g, pw - 16, 0, 16, ph, '#2a2030');
    R(g, 14, 0, 2, ph, OUT);
    R(g, pw - 16, 0, 2, ph, OUT);
    R(g, 16, 32, 3, ph - 48, 'rgba(30,20,15,.22)');
    R(g, pw - 19, 32, 3, ph - 48, 'rgba(30,20,15,.22)');
    R(g, 0, ph - 16, pw, 16, '#2a2030');
    R(g, 14, ph - 16, pw - 28, 2, OUT);
    // الباب
    const dx = inr.door.x * 16;
    R(g, dx, ph - 16, 16, 16, floorPixel(inr.floor, dx, ph - 20));
    R(g, dx + 1, ph - 15, 14, 14, '#a8393f');
    R(g, dx + 3, ph - 13, 10, 10, '#e0b64f');
    R(g, dx + 5, ph - 11, 6, 6, '#a8393f');
    R(g, dx - 2, ph - 16, 2, 16, '#6b4a2b');
    R(g, dx + 16, ph - 16, 2, 16, '#6b4a2b');
    for (const f of inr.flat) drawFlat(g, f);
    for (const d of inr.walls) drawWallDeco(g, d, inr.wall);
    interiorCache.set(inr.id, c);
    return c;
  }

  const furnCache = {};
  function furniture(name) {
    if (furnCache[name]) return furnCache[name];
    const fp = VQ.FURN[name] || [1, 1];
    const lift = 16;
    const { c, g } = mk(fp[0] * 16 + 8, fp[1] * 16 + lift);
    g.translate(0, lift);
    if (F[name]) F[name](g);
    furnCache[name] = { c, lift };
    return furnCache[name];
  }

  // ---------- الشخصيات ----------
  function drawCharacter(g, ox, oy, look, stage, gender, dir, step) {
    // dir: 0 تحت، 1 فوق، 2 يسار (اليمين بالعكس)
    const P2 = (x, y, w, h, c) => R(g, ox + x, oy + y, w, h, c);
    if (stage === 'baby') {
      P2(4, 16, 8, 7, OUT);
      P2(5, 17, 6, 5, gender === 'f' ? '#f7c4d4' : '#c4e0f7');
      P2(4, 10, 8, 7, OUT);
      P2(5, 11, 6, 5, look.skin);
      if (dir !== 1) { P2(6, 13, 1, 1, OUT); P2(9, 13, 1, 1, OUT); }
      P2(7 + (step === 1 ? 3 : -2), 22, 2, 1, look.skin);
      return;
    }
    const child = stage === 'child';
    const elder = stage === 'elder';
    const top = child ? 7 : 2;
    const headH = child ? 6 : 7;
    const bodyTop = top + headH;
    const bottom = 22;
    const robe = child && gender === 'm' ? look.shirt : look.robe;
    const robe2 = child && gender === 'm' ? '#00000044' : look.robe2;
    const skin = look.skin;
    // أرجل
    const lf = step === 1 ? -1 : 0;
    const rf = step === 2 ? -1 : 0;
    P2(4, bottom + lf, 3, 2, OUT);
    P2(9, bottom + rf, 3, 2, OUT);
    P2(5, bottom + lf, 2, 1, gender === 'f' ? '#6a3f3a' : '#8a6240');
    P2(9, bottom + rf, 2, 1, gender === 'f' ? '#6a3f3a' : '#8a6240');
    // جسم
    P2(3, bodyTop, 10, bottom - bodyTop, OUT);
    P2(4, bodyTop, 8, bottom - bodyTop - 1, robe);
    P2(10, bodyTop + 1, 2, bottom - bodyTop - 2, robe2);
    P2(4, bottom - 2, 8, 1, robe2);
    if (dir === 0 && gender === 'm' && !child) { P2(7, bodyTop + 1, 2, 3, robe2); }
    // ذراعين
    const swing = step === 1 ? 1 : step === 2 ? -1 : 0;
    if (dir !== 2) {
      P2(2, bodyTop + 1 + swing, 2, 6, OUT);
      P2(12, bodyTop + 1 - swing, 2, 6, OUT);
      P2(2, bodyTop + 6 + swing, 2, 1, skin);
      P2(12, bodyTop + 6 - swing, 2, 1, skin);
    } else {
      P2(7, bodyTop + 2 + swing, 3, 6, OUT);
      P2(8, bodyTop + 2 + swing, 2, 5, robe);
      P2(8, bodyTop + 7 + swing, 2, 1, skin);
    }
    // رأس
    P2(3, top - 1, 10, headH + 1, OUT);
    P2(4, top, 8, headH, skin);
    if (gender === 'm' && !child) {
      // غترة وعقال
      const sc = look.scarf;
      P2(3, top - 1, 10, 3, OUT);
      P2(4, top - 1, 8, 2, sc);
      P2(3, top, 2, headH + 2, sc);
      P2(11, top, 2, headH + 2, sc);
      P2(4, top, 8, 1, '#22222a');
      if (sc !== '#f4f2ea') for (let i = 4; i < 12; i += 2) P2(i, top - 1, 1, 1, '#f4f2ea');
      if (dir === 1) { P2(3, top, 10, headH + 3, sc); P2(4, top + 1, 8, 1, '#22222a'); P2(4, top - 1, 8, 1, sc); }
      if (dir === 0) {
        P2(5, top + 3, 1, 1, OUT); P2(10, top + 3, 1, 1, OUT);
        P2(5, top + 5, 6, 1, elder ? '#d8d8d8' : '#3a2a22');
        P2(6, top + 6, 4, 1, elder ? '#e8e8e8' : '#3a2a22');
      } else if (dir === 2) {
        P2(4, top + 3, 1, 1, OUT);
        P2(4, top + 5, 3, 2, elder ? '#d8d8d8' : '#3a2a22');
        P2(8, top, 5, headH + 2, sc);
      }
    } else if (gender === 'f' && !child) {
      // شيلة
      const sc = look.scarf;
      P2(3, top - 1, 10, 3, sc);
      P2(3, top, 2, headH + 3, sc);
      P2(11, top, 2, headH + 3, sc);
      P2(3, bodyTop, 10, 2, sc);
      P2(3, top - 2, 10, 1, OUT);
      if (elder) P2(3, top - 1, 10, 1, '#d8d8d8');
      if (dir === 1) P2(3, top - 1, 10, headH + 3, sc);
      else if (dir === 0) { P2(5, top + 3, 1, 1, OUT); P2(10, top + 3, 1, 1, OUT); P2(7, top + 5, 2, 1, '#a8533a'); }
      else { P2(4, top + 3, 1, 1, OUT); P2(7, top, 6, headH + 3, sc); }
    } else {
      // طفل: شعر
      const hair = '#2a1c14';
      P2(4, top - 1, 8, 2, hair);
      if (gender === 'f') { P2(3, top, 2, headH, hair); P2(11, top, 2, headH, hair); P2(11, top - 1, 2, 2, '#e8506a'); }
      if (dir === 1) P2(4, top - 1, 8, headH, hair);
      else if (dir === 0) { P2(5, top + 2, 1, 1, OUT); P2(10, top + 2, 1, 1, OUT); }
      else { P2(4, top + 2, 1, 1, OUT); P2(9, top, 3, headH - 1, hair); }
    }
    if (elder && gender === 'm') { P2(14, bodyTop + 2, 1, bottom - bodyTop, '#6b4a2b'); }
  }

  const charCache = new Map();
  function charSprite(look, stage, gender, dir, step) {
    const flip = dir === 3;
    const key = [look.skin, look.robe, look.scarf, look.shirt, stage, gender, flip ? 2 : dir, step, flip].join();
    let c = charCache.get(key);
    if (c) return c;
    const m = mk(16, 25);
    if (flip) { m.g.translate(16, 0); m.g.scale(-1, 1); }
    drawCharacter(m.g, 0, 0, look, stage, gender, flip ? 2 : dir, step);
    c = m.c;
    charCache.set(key, c);
    return c;
  }

  const EMOTES = {
    heart(g) { for (const [x, y, w] of [[1, 1, 2], [5, 1, 2], [0, 2, 8], [0, 3, 8], [1, 4, 6], [2, 5, 4], [3, 6, 2]]) R(g, x, y, w, 1, '#e8506a'); R(g, 1, 2, 1, 1, '#ffc0d0'); },
    drop(g) { for (const [x, y, w] of [[3, 0, 2], [3, 1, 2], [2, 2, 4], [1, 3, 6], [1, 4, 6], [1, 5, 6], [2, 6, 4]]) R(g, x, y, w, 1, '#58b5e0'); R(g, 2, 4, 1, 1, '#d8f0fa'); },
    food(g) { R(g, 1, 3, 6, 4, '#d9a050'); R(g, 2, 2, 4, 1, '#f0c880'); R(g, 3, 4, 1, 1, '#8a5a2a'); R(g, 5, 4, 1, 1, '#8a5a2a'); },
    coin(g) { disc(g, 4, 4, 3, 3, '#a87c1e'); disc(g, 4, 4, 2, 2, '#f0cc50'); R(g, 4, 3, 1, 3, '#a87c1e'); },
    game(g) { R(g, 0, 3, 8, 4, '#5a4aa8'); R(g, 1, 4, 3, 1, '#ffffff'); R(g, 2, 3, 1, 3, '#ffffff'); R(g, 6, 4, 1, 1, '#e8483f'); },
    sick(g) { R(g, 3, 0, 2, 8, '#d9483f'); R(g, 0, 3, 8, 2, '#d9483f'); },
    crown(g) { R(g, 0, 6, 8, 2, '#c9962e'); R(g, 0, 2, 2, 4, '#f0cc50'); R(g, 3, 1, 2, 5, '#f0cc50'); R(g, 6, 2, 2, 4, '#f0cc50'); R(g, 3, 6, 2, 1, '#d9483f'); },
    bag(g) { R(g, 2, 3, 4, 5, '#8a5a34'); R(g, 3, 1, 2, 2, '#6b4426'); R(g, 3, 4, 2, 2, '#f0cc50'); },
    hammer(g) { R(g, 1, 1, 6, 3, '#6b6b7c'); R(g, 3, 4, 2, 4, '#8a5a34'); },
    zzz(g) { R(g, 0, 1, 4, 1, '#ffffff'); R(g, 2, 2, 1, 1, '#ffffff'); R(g, 1, 3, 1, 1, '#ffffff'); R(g, 0, 4, 4, 1, '#ffffff'); R(g, 5, 0, 3, 1, '#ffffff'); R(g, 6, 1, 1, 1, '#ffffff'); R(g, 5, 2, 3, 1, '#ffffff'); },
  };
  const emoteCache = {};
  function emoteSprite(name) {
    if (emoteCache[name]) return emoteCache[name];
    const { c, g } = mk(14, 15);
    R(g, 0, 0, 14, 12, OUT);
    R(g, 1, 1, 12, 10, '#fbf6e6');
    R(g, 5, 12, 4, 1, OUT);
    R(g, 6, 13, 2, 1, OUT);
    R(g, 6, 11, 2, 1, '#fbf6e6');
    if (name === 'zzz') R(g, 1, 1, 12, 10, '#3a4a8a');
    g.translate(3, 2);
    if (EMOTES[name]) EMOTES[name](g);
    emoteCache[name] = c;
    return c;
  }

  function graveSprite() {
    return simple(16, 18, 8, 17, (g) => {
      arch(g, 3, 2, 10, 14, OUT);
      arch(g, 4, 3, 8, 12, '#c8c0b0');
      R(g, 6, 7, 4, 1, '#7a7468');
      R(g, 6, 10, 4, 1, '#7a7468');
      R(g, 2, 15, 12, 2, '#7a6a4a');
    });
  }

  // طيارة من فوق: جسم أبيض بخط أزرق وأجنحة
  function planeSprite() {
    const { c, g } = mk(96, 64);
    const body = '#f4f2ea';
    const shade = '#c8c4b8';
    R(g, 40, 2, 14, 60, OUT); R(g, 41, 3, 12, 58, shade); R(g, 42, 3, 10, 58, body); // الجناح
    R(g, 8, 24, 10, 16, OUT); R(g, 9, 25, 8, 14, body); // الذيل
    R(g, 4, 27, 84, 10, OUT);
    R(g, 5, 28, 82, 8, body);
    R(g, 5, 33, 82, 2, '#2b6fc8');
    disc(g, 87, 32, 5, 4, OUT); disc(g, 87, 32, 4, 3, body);
    R(g, 84, 29, 4, 2, '#34425e');
    for (let i = 0; i < 9; i++) R(g, 24 + i * 6, 30, 2, 2, '#34425e');
    R(g, 44, 12, 6, 6, '#8a8478'); R(g, 44, 46, 6, 6, '#8a8478'); // المحركات
    return { c };
  }
  // مضخة نفط: قاعدة وعمود وذراع يتحرك، frame يحدد ميلان الذراع
  function pumpSprite(frame) {
    const { c, g } = mk(40, 36);
    R(g, 2, 32, 36, 4, '#6b6b7c');
    R(g, 18, 12, 4, 20, OUT); R(g, 19, 13, 2, 19, '#c9962e');
    R(g, 12, 30, 16, 2, OUT);
    const tilt = [-3, 0, 3][frame];
    for (let i = 0; i < 34; i++) R(g, 3 + i, 10 + Math.round((i - 17) / 17 * tilt), 1, 4, i < 2 ? OUT : '#2b2b3f');
    R(g, 1, 8 - tilt, 5, 8, '#d9483f'); // الراس
    R(g, 3, 14 - tilt, 1, 18 + tilt, '#1b1b2b'); // الحبل للبير
    R(g, 32, 14 + tilt, 6, 6, '#6b6b7c'); // الثقل
    return { c, ax: 20, ay: 35 };
  }
  VQ.Art = { pumpSprite, planeSprite, mk, R, hash, disc, buildGround, buildOutdoor, OUTDOOR, buildBuilding, interiorFloor, furniture, charSprite, emoteSprite, graveSprite, ICONS };
})(typeof globalThis !== 'undefined' ? globalThis : this);
