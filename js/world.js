// خريطة القرية: الأرض، المباني، الدواخل، والأشجار. بدون رسم، عشان تشتغل في الاختبار بعد.
(function (root) {
  const VQ = (root.VQ = root.VQ || {});

  const W = 109;
  const H = 130; // الحي الجنوبي: التعليم والمطار ورا البوابة
  const T = { GRASS: 0, PATH: 1, PLAZA: 2, WATER: 3, SAND: 4, FARM: 5, DIRT: 6, ASPHALT: 7 };
  VQ.T = T;
  VQ.TILE = 16;

  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  VQ.rng = rng;

  // أقصر طريق على شبكة. يرجع قائمة [x, y, x, y, ...] من بعد نقطة البداية، أو null.
  const bfsPrev = new Map();
  VQ.findPath = function (grid, w, h, sx, sy, tx, ty) {
    if (sx === tx && sy === ty) return [];
    const size = w * h;
    let prev = bfsPrev.get(size);
    if (!prev) bfsPrev.set(size, (prev = new Int32Array(size)));
    prev.fill(-1);
    const start = sy * w + sx;
    const goal = ty * w + tx;
    if (start < 0 || start >= size || goal < 0 || goal >= size) return null;
    const queue = [start];
    prev[start] = start;
    for (let q = 0; q < queue.length; q++) {
      const cur = queue[q];
      if (cur === goal) break;
      const cx = cur % w;
      const cy = (cur - cx) / w;
      for (let d = 0; d < 4; d++) {
        const nx = cx + (d === 0 ? 1 : d === 1 ? -1 : 0);
        const ny = cy + (d === 2 ? 1 : d === 3 ? -1 : 0);
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const n = ny * w + nx;
        if (prev[n] !== -1) continue;
        if (grid[n] && n !== goal) continue;
        prev[n] = cur;
        queue.push(n);
      }
    }
    if (prev[goal] === -1) return null;
    const out = [];
    for (let c = goal; c !== start; c = prev[c]) out.push(c);
    out.reverse();
    const flat = [];
    for (const c of out) flat.push(c % w, Math.floor(c / w));
    return flat;
  };

  // مقاس قطع الأثاث بالمربعات [عرض، طول]
  const FURN = {
    bed: [2, 3], kbed: [1, 2], wardrobe: [2, 1], fridge: [1, 1], stove: [1, 1], sink: [1, 1], jug: [1, 1],
    table: [2, 2], lowtable: [2, 1], tv: [2, 1], bookshelf: [2, 1], plant: [1, 1], pwall: [1, 1],
    counter: [3, 1], oven: [2, 1], s_bottles: [2, 1], s_cans: [2, 1], s_bread: [2, 1], s_toys: [2, 1],
    s_books: [2, 1], rack: [2, 1], mannequin: [1, 1], arcade: [1, 1], carrom: [2, 2], cafetable: [1, 1],
    desk: [1, 1], teacher: [2, 1], clinicbed: [1, 2], medcab: [2, 1], mayordesk: [3, 1], flag: [1, 1],
    longtable: [4, 2], bench: [2, 1], crate: [1, 1], dallah: [1, 1], pot: [1, 1],
  };
  VQ.FURN = FURN;

  function makeInterior(id, w, h, opts) {
    const grid = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (y < 2 || x === 0 || x === w - 1 || y === h - 1) grid[y * w + x] = 1;
      }
    }
    const door = { x: Math.floor(w / 2), y: h - 1 };
    grid[door.y * w + door.x] = 0;
    const flat = opts.flat || [];
    const items = [];
    const walls = opts.walls || [];
    for (const it of opts.items || []) {
      const fp = FURN[it.s] || [1, 1];
      items.push({ s: it.s, x: it.x, y: it.y, tw: fp[0], th: fp[1] });
      if (it.soft) continue;
      for (let yy = 0; yy < fp[1]; yy++) {
        for (let xx = 0; xx < fp[0]; xx++) grid[(it.y + yy) * w + it.x + xx] = 1;
      }
    }
    const spots = [];
    for (let y = 2; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        if (!grid[y * w + x]) spots.push([x, y]);
      }
    }
    return { id, w, h, grid, door, items, flat, walls, spots, floor: opts.floor, wall: opts.wall, anchors: opts.anchors || {} };
  }

  function mirror(w, layout) {
    const flip = (o, tw) => Object.assign({}, o, { x: w - tw - o.x });
    return {
      items: layout.items.map((i) => flip(i, (FURN[i.s] || [1])[0])),
      flat: layout.flat.map((f) => flip(f, f.w)),
      walls: layout.walls.map((f) => flip(f, f.w || 1)),
      beds: layout.beds.map((b) => [w - 1 - b[0], b[1]]),
    };
  }

  function houseInterior(id, index) {
    const r = rng(9000 + index * 37);
    const w = 15;
    const h = 11;
    const A = {
      items: [
        { s: 'pwall', x: 5, y: 2 }, { s: 'pwall', x: 5, y: 3 }, { s: 'pwall', x: 5, y: 4 }, { s: 'pwall', x: 5, y: 5 },
        { s: 'bed', x: 1, y: 2 }, { s: 'wardrobe', x: 3, y: 2 }, { s: 'kbed', x: 1, y: 7 }, { s: 'plant', x: 1, y: 9 },
        { s: 'pwall', x: 10, y: 2 }, { s: 'pwall', x: 10, y: 3 }, { s: 'pwall', x: 10, y: 4 },
        { s: 'fridge', x: 11, y: 2 }, { s: 'stove', x: 12, y: 2 }, { s: 'sink', x: 13, y: 2 }, { s: 'jug', x: 13, y: 3 },
        { s: 'table', x: 11, y: 7 }, { s: 'tv', x: 7, y: 2 }, { s: 'plant', x: 6, y: 2 },
        { s: 'lowtable', x: 7, y: 6 }, { s: 'dallah', x: 13, y: 9 },
      ],
      flat: [{ s: 'carpet', x: 6, y: 4, w: 4, h: 4 }, { s: 'cushion', x: 6, y: 5, w: 1, h: 1 }, { s: 'cushion', x: 9, y: 5, w: 1, h: 1 }, { s: 'cushion', x: 6, y: 7, w: 1, h: 1 }, { s: 'cushion', x: 9, y: 7, w: 1, h: 1 }],
      walls: [{ s: 'window', x: 2, w: 2 }, { s: 'frame', x: 7, w: 2 }, { s: 'window', x: 11, w: 2 }],
      beds: [[3, 5], [2, 8]],
    };
    const B = {
      items: [
        { s: 'pwall', x: 9, y: 2 }, { s: 'pwall', x: 9, y: 3 }, { s: 'pwall', x: 9, y: 4 },
        { s: 'bed', x: 12, y: 2 }, { s: 'wardrobe', x: 10, y: 2 }, { s: 'kbed', x: 13, y: 7 }, { s: 'kbed', x: 12, y: 7 },
        { s: 'fridge', x: 1, y: 2 }, { s: 'stove', x: 2, y: 2 }, { s: 'sink', x: 3, y: 2 }, { s: 'jug', x: 4, y: 2 },
        { s: 'table', x: 2, y: 5 }, { s: 'bookshelf', x: 6, y: 2 }, { s: 'plant', x: 8, y: 2 }, { s: 'plant', x: 1, y: 9 },
        { s: 'tv', x: 2, y: 8 }, { s: 'dallah', x: 9, y: 9 },
      ],
      flat: [{ s: 'carpet', x: 5, y: 4, w: 5, h: 3 }, { s: 'cushion', x: 5, y: 4, w: 1, h: 1 }, { s: 'cushion', x: 9, y: 4, w: 1, h: 1 }, { s: 'cushion', x: 7, y: 6, w: 1, h: 1 }],
      walls: [{ s: 'calligraphy', x: 6, w: 2 }, { s: 'window', x: 2, w: 2 }, { s: 'window', x: 11, w: 2 }, { s: 'clock', x: 9, w: 1 }],
      beds: [[11, 5], [11, 8]],
    };
    let layout = index % 2 ? B : A;
    if (r() < 0.5) layout = mirror(w, layout);
    const floors = ['wood', 'tile', 'clay', 'terrazzo'];
    const walls = ['#e8d3a8', '#cfe0d0', '#e8c8b4', '#d5d9e8', '#f0e4c8'];
    const carpets = [0, 1, 2, 3];
    const carpet = carpets[Math.floor(r() * carpets.length)];
    return makeInterior(id, w, h, {
      items: layout.items,
      flat: layout.flat.map((f) => Object.assign({ hue: carpet }, f)),
      walls: layout.walls,
      floor: floors[Math.floor(r() * floors.length)],
      wall: walls[Math.floor(r() * walls.length)],
      anchors: { beds: layout.beds },
    });
  }

  const SHOP_LAYOUTS = {
    grocery: { floor: 'tile', wall: '#d9e8d8', items: [['counter', 2, 3], ['s_bottles', 8, 2], ['s_bottles', 10, 2], ['s_cans', 8, 5], ['s_cans', 10, 5], ['crate', 2, 6], ['crate', 3, 6], ['crate', 2, 7], ['jug', 1, 7]], walls: [['menu', 3], ['window', 8]] },
    bakery: { floor: 'clay', wall: '#efd9b0', items: [['counter', 2, 3], ['oven', 8, 2], ['oven', 10, 2], ['s_bread', 8, 5], ['s_bread', 10, 5], ['s_bread', 1, 6], ['crate', 1, 7]], walls: [['menu', 3], ['window', 5]] },
    restaurant: { floor: 'terrazzo', wall: '#efcdb6', items: [['counter', 2, 3], ['stove', 1, 2], ['oven', 8, 2], ['table', 2, 6], ['table', 9, 5], ['table', 9, 7], ['plant', 11, 2], ['plant', 1, 7]], walls: [['menu', 3], ['calligraphy', 5], ['window', 10]] },
    cafe: { floor: 'wood', wall: '#d8c4a4', items: [['counter', 2, 3], ['dallah', 2, 2], ['dallah', 3, 2], ['cafetable', 8, 3], ['cafetable', 10, 3], ['cafetable', 8, 6], ['cafetable', 10, 6], ['cafetable', 2, 6], ['plant', 11, 2]], flat: [{ s: 'carpet', x: 1, y: 5, w: 4, h: 3, hue: 2 }], walls: [['menu', 3], ['window', 7], ['window', 10]] },
    toys: { floor: 'tile', wall: '#d7d8f0', items: [['counter', 2, 3], ['s_toys', 8, 2], ['s_toys', 10, 2], ['s_toys', 8, 5], ['s_toys', 10, 5], ['carrom', 2, 6], ['crate', 1, 7]], walls: [['menu', 3], ['window', 5], ['frame', 9]] },
    arcade: { floor: 'terrazzo', wall: '#3a3a6a', items: [['counter', 2, 3], ['arcade', 7, 2], ['arcade', 8, 2], ['arcade', 9, 2], ['arcade', 10, 2], ['arcade', 11, 2], ['carrom', 8, 5], ['carrom', 2, 6], ['bench', 10, 7]], walls: [['menu', 3]] },
    clothes: { floor: 'wood', wall: '#ecd3da', items: [['counter', 2, 3], ['rack', 8, 2], ['rack', 10, 2], ['rack', 8, 5], ['rack', 10, 5], ['mannequin', 1, 6], ['mannequin', 3, 6], ['plant', 1, 7]], walls: [['menu', 3], ['window', 6]] },
    books: { floor: 'wood', wall: '#d9cdb4', items: [['counter', 2, 3], ['s_books', 6, 2], ['s_books', 8, 2], ['s_books', 10, 2], ['s_books', 8, 5], ['s_books', 10, 5], ['bench', 2, 6], ['plant', 1, 7]], walls: [['menu', 3], ['calligraphy', 5]] },
  };

  function shopInterior(id, kind) {
    const L = SHOP_LAYOUTS[kind];
    return makeInterior(id, 13, 9, {
      floor: L.floor,
      wall: L.wall,
      items: L.items.map((i) => ({ s: i[0], x: i[1], y: i[2] })),
      flat: L.flat || [],
      walls: (L.walls || []).map((i) => ({ s: i[0], x: i[1], w: i[0] === 'window' || i[0] === 'frame' || i[0] === 'calligraphy' ? 2 : i[0] === 'menu' ? 2 : 1 })),
      anchors: { work: [3, 2], counter: { x: 2, y: 3, w: 3 } },
    });
  }

  function hallInterior(id) {
    return makeInterior(id, 19, 13, {
      floor: 'marble',
      wall: '#e7dcc0',
      items: [
        { s: 'mayordesk', x: 8, y: 3 }, { s: 'flag', x: 6, y: 2 }, { s: 'flag', x: 12, y: 2 },
        { s: 'bookshelf', x: 1, y: 2 }, { s: 'bookshelf', x: 3, y: 2 }, { s: 'bookshelf', x: 14, y: 2 }, { s: 'bookshelf', x: 16, y: 2 },
        { s: 'longtable', x: 2, y: 6 }, { s: 'longtable', x: 13, y: 6 },
        { s: 'bench', x: 2, y: 9 }, { s: 'bench', x: 4, y: 9 }, { s: 'bench', x: 13, y: 9 }, { s: 'bench', x: 15, y: 9 },
        { s: 'plant', x: 1, y: 11 }, { s: 'plant', x: 17, y: 11 }, { s: 'dallah', x: 7, y: 11 }, { s: 'dallah', x: 11, y: 11 },
      ],
      flat: [{ s: 'carpet', x: 8, y: 5, w: 3, h: 8, hue: 0 }],
      walls: [{ s: 'calligraphy', x: 8, w: 3 }, { s: 'window', x: 2, w: 2 }, { s: 'window', x: 15, w: 2 }, { s: 'frame', x: 5, w: 2 }, { s: 'frame', x: 12, w: 2 }],
      anchors: { work: [9, 2], counter: { x: 8, y: 3, w: 3 } },
    });
  }

  function schoolInterior(id) {
    const items = [{ s: 'teacher', x: 7, y: 3 }, { s: 'bookshelf', x: 1, y: 2 }, { s: 'bookshelf', x: 13, y: 2 }, { s: 'plant', x: 1, y: 9 }];
    for (const y of [5, 7, 9]) for (const x of [3, 5, 9, 11]) items.push({ s: 'desk', x, y });
    return makeInterior(id, 15, 11, {
      floor: 'wood',
      wall: '#dfe6c8',
      items,
      walls: [{ s: 'board', x: 5, w: 5 }, { s: 'window', x: 1, w: 2 }, { s: 'window', x: 12, w: 2 }],
      anchors: { work: [8, 2] },
    });
  }

  function clinicInterior(id) {
    return makeInterior(id, 13, 9, {
      floor: 'tile',
      wall: '#dcf0ee',
      items: [
        { s: 'counter', x: 2, y: 3 }, { s: 'clinicbed', x: 6, y: 2 }, { s: 'clinicbed', x: 8, y: 2 }, { s: 'clinicbed', x: 10, y: 2 }, { s: 'medcab', x: 2, y: 6 },
        { s: 'bench', x: 8, y: 6 }, { s: 'plant', x: 11, y: 7 }, { s: 'medcab', x: 1, y: 2 },
      ],
      walls: [{ s: 'menu', x: 3, w: 2 }, { s: 'window', x: 8, w: 2 }],
      anchors: { work: [3, 2], counter: { x: 2, y: 3, w: 3 }, beds: [[6, 3], [8, 3], [10, 3]] },
    });
  }

  function officeInterior(id, wall) {
    return makeInterior(id, 13, 9, {
      floor: 'marble',
      wall,
      items: [
        { s: 'mayordesk', x: 5, y: 3 }, { s: 'flag', x: 4, y: 2 }, { s: 'flag', x: 8, y: 2 },
        { s: 'bookshelf', x: 1, y: 2 }, { s: 'bookshelf', x: 10, y: 2 },
        { s: 'bench', x: 1, y: 6 }, { s: 'bench', x: 10, y: 6 }, { s: 'plant', x: 1, y: 7 }, { s: 'plant', x: 11, y: 7 },
      ],
      flat: [{ s: 'carpet', x: 5, y: 5, w: 3, h: 3, hue: 1 }],
      walls: [{ s: 'calligraphy', x: 5, w: 3 }, { s: 'window', x: 2, w: 2 }, { s: 'window', x: 9, w: 2 }],
      anchors: { work: [6, 2], counter: { x: 5, y: 3, w: 3 } },
    });
  }

  function palaceInterior(id) {
    return makeInterior(id, 19, 13, {
      floor: 'marble',
      wall: '#f0e2b8',
      items: [
        { s: 'bed', x: 1, y: 2 }, { s: 'bed', x: 16, y: 2 }, { s: 'wardrobe', x: 3, y: 2 }, { s: 'wardrobe', x: 14, y: 2 },
        { s: 'kbed', x: 1, y: 8 }, { s: 'kbed', x: 17, y: 8 }, { s: 'tv', x: 8, y: 2 }, { s: 'flag', x: 7, y: 2 }, { s: 'flag', x: 10, y: 2 },
        { s: 'longtable', x: 2, y: 6 }, { s: 'longtable', x: 13, y: 6 },
        { s: 'fridge', x: 5, y: 2 }, { s: 'stove', x: 6, y: 2 }, { s: 'carrom', x: 12, y: 2 },
        { s: 'plant', x: 1, y: 11 }, { s: 'plant', x: 17, y: 11 }, { s: 'dallah', x: 7, y: 11 }, { s: 'dallah', x: 11, y: 11 },
      ],
      flat: [{ s: 'carpet', x: 7, y: 5, w: 5, h: 7, hue: 0 }],
      walls: [{ s: 'calligraphy', x: 8, w: 3 }, { s: 'window', x: 3, w: 2 }, { s: 'window', x: 14, w: 2 }, { s: 'frame', x: 6, w: 1 }, { s: 'frame', x: 12, w: 1 }],
      anchors: { beds: [[3, 4], [16, 4]] },
    });
  }

  VQ.buildWorld = function () {
    const ground = new Uint8Array(W * H);
    const solid = new Uint8Array(W * H);
    const idx = (x, y) => y * W + x;
    const inside = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
    const fill = (x0, y0, x1, y1, k) => {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (inside(x, y)) ground[idx(x, y)] = k;
    };
    const R = rng(20261103);

    // الطرق
    fill(0, 42, 108, 43, T.PATH); // الشارع الرئيسي
    fill(12, 12, 96, 13, T.PATH);
    fill(12, 26, 35, 27, T.PATH);
    fill(73, 26, 98, 27, T.PATH);
    fill(12, 58, 96, 59, T.PATH);
    fill(12, 72, 96, 73, T.PATH);
    for (const x of [12, 34, 73, 95]) fill(x, 12, x + 1, 73, T.PATH);
    fill(53, 48, 55, 100, T.PATH); // طريق البوابة الجنوبية، يكمل لحي التعليم
    // الحي الجنوبي
    fill(12, 86, 96, 87, T.PATH);
    for (const x of [12, 95]) fill(x, 83, x + 1, 99, T.PATH);
    fill(12, 98, 96, 99, T.PATH);
    fill(40, 99, 41, 112, T.PATH);
    fill(67, 99, 68, 112, T.PATH);
    fill(30, 111, 78, 114, T.PLAZA); // ساحة الطيارات قدام المطار
    fill(50, 115, 58, 116, T.ASPHALT); // ممر للمدرج
    fill(8, 117, 100, 121, T.ASPHALT); // المدرج
    // حي الدولة في الجنوب، وحي القصور على شاطئ البحيرة
    fill(12, 82, 96, 83, T.PATH);
    for (const x of [12, 95]) fill(x, 73, x + 1, 83, T.PATH);
    fill(2, 12, 11, 13, T.PATH);
    fill(97, 12, 106, 13, T.PATH);
    fill(53, 10, 55, 11, T.PATH); // طريق البحيرة

    // الساحة
    fill(36, 28, 72, 30, T.PLAZA);
    fill(44, 28, 64, 47, T.PLAZA);
    fill(50, 26, 58, 27, T.PLAZA);

    // البحيرة والرمل حولها
    for (let y = 0; y < 11; y++) {
      for (let x = 36; x < 73; x++) {
        const dx = (x - 54) / 16;
        const dy = (y - 3.5) / 6;
        const n = Math.sin(x * 0.7) * 0.06 + Math.cos(x * 0.31 + y) * 0.06;
        const d = dx * dx + dy * dy + n;
        if (d < 0.72) ground[idx(x, y)] = T.WATER;
        else if (d < 1.05) ground[idx(x, y)] = T.SAND;
      }
    }

    const buildings = [];
    const addB = (b) => {
      b.doorX = b.x + Math.floor(b.w / 2);
      b.doorY = b.y + b.h - 1;
      b.doors = b.doors || [b.doorX];
      b.front = { x: b.doorX, y: b.y + b.h };
      for (let y = b.y; y < b.y + b.h; y++) {
        for (let x = b.x; x < b.x + b.w; x++) solid[idx(x, y)] = 1;
      }
      for (const dx of b.doors) solid[idx(dx, b.doorY)] = 0;
      buildings.push(b);
      return b;
    };

    // البيوت: ١٦ بيت موزعة على الغرب والشرق
    const houseRows = [20, 36, 52, 66];
    const houseCols = [16, 25, 77, 86];
    let houseNo = 0;
    for (const hy of houseRows) {
      for (const hx of houseCols) {
        houseNo++;
        const b = addB({
          id: 'house' + houseNo, kind: 'house', no: houseNo, name: 'بيت ' + VQ.ar(houseNo),
          x: hx, y: hy, w: 7, h: 5, wallRows: 2, seed: houseNo * 13 + 5,
        });
        b.interior = houseInterior(b.id, houseNo);
        fill(b.doorX, b.y + b.h, b.doorX, b.y + b.h, T.PATH);
      }
    }

    const shop = (id, kind, name, x, y, w, h, extra) => {
      const b = addB(Object.assign({ id, kind, name, x, y, w, h, wallRows: 2, seed: x * 3 + y }, extra || {}));
      b.interior = shopInterior(id, kind);
      return b;
    };

    // المحلات حول الساحة
    shop('bakery', 'bakery', 'المخبز', 37, 23, 7, 5);
    shop('grocery', 'grocery', 'البقالة', 65, 23, 7, 5);
    shop('cafe', 'cafe', 'المقهى', 36, 31, 7, 5);
    fill(39, 36, 43, 36, T.PLAZA);
    shop('arcade', 'arcade', 'صالة الألعاب', 66, 31, 7, 5);
    fill(65, 36, 69, 36, T.PLAZA);

    // شارع السوق
    shop('restaurant', 'restaurant', 'المطعم', 37, 53, 7, 5);
    shop('toys', 'toys', 'محل الألعاب', 45, 53, 7, 5);
    shop('clothes', 'clothes', 'محل الملابس', 57, 53, 7, 5);
    shop('books', 'books', 'المكتبة', 65, 53, 7, 5);

    // دار البلدية
    const hall = addB({ id: 'hall', kind: 'hall', name: 'دار الحكم', x: 47, y: 15, w: 15, h: 11, wallRows: 4, seed: 77, doors: [53, 54, 55] });
    hall.interior = hallInterior('hall');
    hall.front = { x: 54, y: 26 };

    const school = addB({ id: 'school', kind: 'school', name: 'المدرسة الابتدائية', x: 38, y: 62, w: 13, h: 9, wallRows: 3, seed: 41 });
    school.interior = schoolInterior('school');
    fill(school.doorX, 71, school.doorX, 71, T.PATH);

    const clinic = addB({ id: 'clinic', kind: 'clinic', name: 'المستشفى', x: 58, y: 62, w: 13, h: 9, wallRows: 3, seed: 43 });
    clinic.interior = clinicInterior('clinic');
    fill(clinic.doorX, 71, clinic.doorX, 71, T.PATH);

    // أراضي الدولة: محوطة وفاضية لين يأمر الحاكم ببنائها
    const plotFence = (b) => {
      b.plot = true;
      fill(b.x, b.y, b.x + b.w - 1, b.y + b.h - 1, T.DIRT);
      for (let x = b.x; x < b.x + b.w; x++) { lotWallPending.push([x, b.y]); if (!b.doors.includes(x)) lotWallPending.push([x, b.y + b.h - 1]); }
      for (let y = b.y; y < b.y + b.h; y++) { lotWallPending.push([b.x, y]); lotWallPending.push([b.x + b.w - 1, y]); }
    };
    const lotWallPending = [];
    const branchPlots = [
      ['finance', 'وزارة المالية', 15, '#e6d8a8'], ['security', 'مركز الأمن', 27, '#cfd8e8'], ['court', 'المحكمة', 39, '#e4d8c8'],
      ['bank', 'المصرف', 58, '#e8e0b8'], ['works', 'وزارة الأشغال', 70, '#e0cdb0'], ['supply', 'وزارة التموين', 82, '#d4e4c8'],
    ];
    for (const [id, name, x, wall] of branchPlots) {
      const b = addB({ id, kind: 'branch', icon: id, name, x, y: 74, w: 11, h: 8, wallRows: 3, seed: x * 5 + 3 });
      b.interior = officeInterior(id, wall);
      plotFence(b);
    }
    const palacePlots = [
      ['palace_royal', 'القصر الملكي', 97, 2, true], ['palace1', 'قصر الغربي', 2, 2], ['palace2', 'قصر الشمال', 14, 2],
      ['palace3', 'قصر البحيرة', 25, 2], ['palace4', 'قصر الواحة', 74, 2], ['palace5', 'قصر النخيل', 85, 2],
    ];
    for (const [id, name, x, y, royal] of palacePlots) {
      const dx = x + 5;
      const b = addB({ id, kind: 'palace', royal: !!royal, name, x, y, w: 10, h: 10, wallRows: 4, seed: x + 91, doors: [dx - 1, dx] });
      b.interior = palaceInterior(id);
      plotFence(b);
    }

    // أراضي تجارية في الغرب والشرق: تبقى فاضية لين يفتح فيها أحد محل بسجل تجاري
    const lotSpots = [[4, 46], [4, 53], [4, 60], [4, 67], [98, 46], [98, 53], [98, 60], [98, 67]];
    lotSpots.forEach(([x, y], i) => {
      const b = addB({ id: 'lot' + (i + 1), kind: 'firmshop', name: 'أرض تجارية ' + VQ.ar(i + 1), x, y, w: 7, h: 5, wallRows: 2, seed: x * 7 + y });
      b.interior = shopInterior(b.id, 'clothes');
      plotFence(b);
      const fy = y + 5;
      if (x < 50) fill(b.doorX, fy, 13, fy, T.PATH);
      else fill(95, fy, b.doorX, fy, T.PATH);
    });

    // المدارس الإعدادية والثانوية والجامعة والمطار: أراضي تنبني لما تتطور الدولة
    const school2 = addB({ id: 'school2', kind: 'school', name: 'المدرسة الإعدادية', x: 16, y: 88, w: 13, h: 9, wallRows: 3, seed: 45 });
    school2.interior = schoolInterior('school2');
    plotFence(school2);
    const school3 = addB({ id: 'school3', kind: 'school', name: 'المدرسة الثانوية', x: 31, y: 88, w: 13, h: 9, wallRows: 3, seed: 47 });
    school3.interior = schoolInterior('school3');
    plotFence(school3);
    const uni = addB({ id: 'university', kind: 'school', name: 'الجامعة', x: 62, y: 87, w: 19, h: 10, wallRows: 4, seed: 49 });
    uni.interior = schoolInterior('university');
    plotFence(uni);
    const airport = addB({ id: 'airport', kind: 'branch', icon: 'airport', name: 'المطار', x: 44, y: 101, w: 21, h: 10, wallRows: 4, seed: 51, doors: [53, 54, 55] });
    airport.interior = officeInterior('airport', '#dde8f2');
    airport.front = { x: 54, y: 111 };
    plotFence(airport);
    // المصرف المركزي في الجنوب الغربي
    fill(12, 99, 13, 110, T.PATH);
    fill(12, 109, 22, 110, T.PATH);
    const central = addB({ id: 'central', kind: 'branch', icon: 'central', name: 'المصرف المركزي', x: 16, y: 101, w: 11, h: 8, wallRows: 3, seed: 57 });
    central.interior = officeInterior('central', '#e8e0b8');
    plotFence(central);
    // البورصة جنب المصرف المركزي
    fill(22, 109, 41, 110, T.PATH);
    const bourse = addB({ id: 'exchange', kind: 'branch', icon: 'exchange', name: 'البورصة', x: 29, y: 101, w: 11, h: 8, wallRows: 3, seed: 59 });
    bourse.interior = officeInterior('exchange', '#dfe6f0');
    plotFence(bourse);
    // حقل النفط في الجنوب الشرقي: الشركة وحولها مضخات تشتغل بعد ما تنبني
    fill(95, 100, 96, 111, T.PATH);
    fill(82, 111, 96, 111, T.PATH);
    const oil = addB({ id: 'oil', kind: 'branch', icon: 'oil', name: 'شركة النفط', x: 83, y: 102, w: 11, h: 8, wallRows: 3, seed: 53 });
    oil.interior = officeInterior('oil', '#e8e0d0');
    plotFence(oil);
    fill(98, 101, 105, 113, T.DIRT);

    // ربط أبواب المحلات بالطريق
    for (const b of buildings) {
      if (b.kind === 'house') continue;
      if (ground[idx(b.front.x, b.front.y)] === T.GRASS) ground[idx(b.front.x, b.front.y)] = T.PATH;
    }

    const props = [];
    const flatProps = [];
    const reserved = new Uint8Array(W * H);
    const put = (s, x, y, isSolid) => {
      if (!inside(x, y)) return;
      props.push({ s, x, y });
      reserved[idx(x, y)] = 1;
      if (isSolid !== false) solid[idx(x, y)] = 1;
    };
    const free = (x, y) => inside(x, y) && !solid[idx(x, y)] && !reserved[idx(x, y)] && ground[idx(x, y)] === T.GRASS;
    const putBlock = (s, x, y, w, h) => {
      props.push({ s, x, y: y + h - 1, bx: x, tw: w, th: h });
      for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) { solid[idx(xx, yy)] = 1; reserved[idx(xx, yy)] = 1; }
    };

    // النافورة في وسط الساحة
    putBlock('fountain', 52, 35, 5, 5);

    // بسطات السوق والكراسي
    putBlock('stall_a', 46, 32, 3, 2);
    putBlock('stall_b', 60, 32, 3, 2);
    putBlock('stall_c', 46, 45, 3, 2);
    putBlock('stall_a', 60, 45, 3, 2);
    for (const [x, y] of [[49, 37], [58, 37], [51, 41], [56, 41]]) putBlock('bench_out', x, y, 2, 1);
    for (const [x, y] of [[44, 28], [64, 28], [44, 47], [64, 47], [50, 26], [58, 26]]) put('lamp', x, y);
    for (const [x, y] of [[45, 39], [63, 39], [51, 31], [57, 31]]) put('planter', x, y);
    for (const [x, y] of [[36, 28], [72, 30], [44, 41], [64, 44], [52, 48], [56, 48]]) if (!solid[idx(x, y)]) put('pot_big', x, y);

    // أماكن البسطات في الساحة: ٣×٢، ما تسد الأبواب ولا الطريق الوسطي
    const stallSlots = [];
    const doorFronts = new Set(buildings.map((b) => b.front.x + ',' + b.front.y));
    const slotOk = (x, y) => {
      if (x + 2 >= 52 && x <= 56) return false;
      for (let yy = y - 1; yy <= y + 2; yy++) for (let xx = x - 1; xx <= x + 3; xx++) if (doorFronts.has(xx + ',' + yy)) return false;
      for (let yy = y; yy < y + 2; yy++) for (let xx = x; xx < x + 3; xx++) {
        if (!inside(xx, yy) || solid[idx(xx, yy)] || reserved[idx(xx, yy)] || ground[idx(xx, yy)] !== T.PLAZA) return false;
      }
      // الصف اللي تحتها لازم يكون فاضي عشان ما تختفي ورا شجرة أو كرسي
      for (let xx = x - 1; xx <= x + 3; xx++) if (inside(xx, y + 2) && (solid[idx(xx, y + 2)] || reserved[idx(xx, y + 2)])) return false;
      return true;
    };
    for (let y = 28; y <= 45 && stallSlots.length < 12; y += 1) {
      for (let x = 36; x <= 70 && stallSlots.length < 12; x += 1) {
        if (!slotOk(x, y)) continue;
        stallSlots.push({ x, y });
        // تحجز البسطة ومسافة حولها عشان ما تلتصق بغيرها
        for (let yy = y - 1; yy < y + 3; yy++) for (let xx = x - 1; xx < x + 4; xx++) if (inside(xx, yy) && ground[idx(xx, yy)] === T.PLAZA) reserved[idx(xx, yy)] = 1;
      }
    }

    // أعمدة إنارة على الطرق
    for (let x = 16; x < 96; x += 11) {
      if (x > 44 && x < 64) continue;
      if (free(x, 41)) put('lamp', x, 41);
      if (free(x + 5, 44)) put('lamp', x + 5, 44);
      if (free(x, 14)) put('lamp', x, 14);
      if (free(x, 60)) put('lamp', x, 60);
      if (free(x, 74)) put('lamp', x, 74);
    }
    for (let y = 18; y < 72; y += 12) {
      for (const x of [33, 36, 72, 75]) if (free(x, y)) put('lamp', x, y);
    }
    for (const b of buildings) {
      if (b.kind === 'house' || b.kind === 'hall' || b.plot) continue;
      const lx = b.doorX - 2;
      const ly = b.y + b.h;
      if (inside(lx, ly) && !solid[idx(lx, ly)] && !reserved[idx(lx, ly)] && ground[idx(lx, ly)] !== T.PATH) put('lamp', lx, ly);
    }

    // أحواش البيوت: سور، نخل، وزرع
    const lotWall = new Uint8Array(W * H);
    for (const [x, y] of lotWallPending) lotWall[idx(x, y)] = 2;
    for (const b of buildings) {
      if (b.kind !== 'house') continue;
      const r = rng(b.seed * 97);
      const x0 = b.x - 1;
      const x1 = b.x + b.w;
      const y0 = b.y - 5;
      const y1 = b.y + b.h - 1;
      for (let y = y0; y <= y1; y++) { lotWall[idx(x0, y)] = 1; lotWall[idx(x1, y)] = 1; }
      for (let x = x0; x <= x1; x++) lotWall[idx(x, y0)] = 1;
      for (let y = y0 + 1; y < b.y; y++) for (let x = b.x; x < b.x + b.w; x++) ground[idx(x, y)] = r() < 0.3 ? T.SAND : T.GRASS;
      const patch = b.x + (r() < 0.5 ? 0 : 4);
      fill(patch, y0 + 1, patch + 2, y0 + 2, T.FARM);
      for (let x = patch; x <= patch + 2; x++) { props.push({ s: 'crop', x, y: y0 + 1 }); reserved[idx(x, y0 + 1)] = 1; }
      put('palm', b.x + (patch === b.x ? 5 : 1), b.y - 2);
      if (r() < 0.6) put('sidr', b.x + 3, b.y - 2);
      if (r() < 0.7) put('jar', b.x + (patch === b.x ? 3 : 0), b.y - 1);
      for (let x = b.x; x < b.x + b.w; x++) for (let y = y0 + 1; y < b.y; y++) { solid[idx(x, y)] = 1; reserved[idx(x, y)] = 1; }
      // نبتة عند الباب
      if (free(b.doorX - 1, b.y + b.h)) put('flowers', b.doorX - 1, b.y + b.h, false);
      if (free(b.doorX + 1, b.y + b.h)) put('flowers', b.doorX + 1, b.y + b.h, false);
      for (let y = y0; y <= y1; y++) { solid[idx(x0, y)] = 1; solid[idx(x1, y)] = 1; reserved[idx(x0, y)] = 1; reserved[idx(x1, y)] = 1; }
      for (let x = x0; x <= x1; x++) { solid[idx(x, y0)] = 1; reserved[idx(x, y0)] = 1; }
    }

    // المزرعة
    fill(2, 30, 10, 40, T.FARM);
    const farmTiles = [];
    for (let y = 31; y <= 39; y++) {
      for (let x = 3; x <= 9; x++) {
        if (y % 2 === 1) { props.push({ s: 'crop', x, y }); reserved[idx(x, y)] = 1; }
        else farmTiles.push([x, y]);
      }
    }
    const fence = [];
    for (let x = 1; x <= 11; x++) { fence.push([x, 29]); if (x !== 6) fence.push([x, 41]); }
    for (let y = 30; y <= 40; y++) { fence.push([1, y]); fence.push([11, y]); }
    fill(6, 41, 6, 41, T.PATH);
    for (const [x, y] of fence) { lotWall[idx(x, y)] = 2; solid[idx(x, y)] = 1; reserved[idx(x, y)] = 1; }
    for (const [x, y] of [[3, 25], [6, 24], [9, 26], [4, 21], [8, 20]]) if (free(x, y)) put('palm', x, y);

    // المقبرة
    fill(100, 19, 106, 34, T.DIRT);
    for (let x = 99; x <= 107; x++) { lotWall[idx(x, 18)] = 2; lotWall[idx(x, 35)] = 2; solid[idx(x, 18)] = 1; solid[idx(x, 35)] = 1; }
    for (let y = 18; y <= 35; y++) {
      lotWall[idx(107, y)] = 2; solid[idx(107, y)] = 1;
      if (y !== 26 && y !== 27) { lotWall[idx(99, y)] = 2; solid[idx(99, y)] = 1; }
    }
    fill(99, 26, 100, 27, T.PATH);
    const graveSlots = [];
    for (let y = 20; y <= 32; y += 2) {
      if (y === 26) continue;
      for (let x = 101; x <= 106; x++) graveSlots.push([x, y]);
    }
    for (let y = 19; y <= 34; y++) reserved[idx(100, y)] = 1;
    for (const [x, y] of graveSlots) reserved[idx(x, y)] = 1;

    // البوابة الجنوبية
    putBlock('gate', 52, 80, 5, 2);
    solid[idx(53, 81)] = 0; solid[idx(54, 81)] = 0; solid[idx(55, 81)] = 0;
    solid[idx(53, 80)] = 0; solid[idx(54, 80)] = 0; solid[idx(55, 80)] = 0;

    // لوحات إرشاد عند التقاطعات
    for (const [x, y] of [[33, 41], [75, 44], [52, 60], [56, 74], [14, 44], [94, 41]]) if (free(x, y)) put('signpost', x, y);

    // إطار الخريطة: نخل وأشجار كثيفة
    const edgeTree = (x, y) => {
      if (!inside(x, y) || !free(x, y)) return;
      put(R() < 0.55 ? 'palm' : 'sidr', x, y);
    };
    for (let x = 0; x < W; x += 2) {
      edgeTree(x, H - 1 - (x % 4 === 0 ? 0 : 1));
      edgeTree(x + (x % 4 === 0 ? 1 : 0), H - 3 - (x % 6 === 0 ? 0 : 1));
      if (x < 36 || x > 72) edgeTree(x, 1 + (x % 4 === 0 ? 0 : 1));
    }
    for (let y = 0; y < H; y += 2) {
      edgeTree(0, y);
      edgeTree(W - 1, y);
      edgeTree(2 + (y % 4 === 0 ? 1 : 0), y);
      edgeTree(W - 3 - (y % 4 === 0 ? 1 : 0), y);
    }

    // أشجار ونباتات في الفراغات
    for (let i = 0; i < Math.round(2400 * H / 86); i++) {
      const x = Math.floor(R() * W);
      const y = Math.floor(R() * H);
      if (!free(x, y)) continue;
      // خلها بعيدة عن حواف الطرق شوي
      let near = false;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (inside(x + dx, y + dy) && ground[idx(x + dx, y + dy)] !== T.GRASS) near = true;
      }
      const roll = R();
      if (near) {
        if (roll < 0.05) put('flowers', x, y, false);
        continue;
      }
      if (roll < 0.1) put('palm', x, y);
      else if (roll < 0.17) put('sidr', x, y);
      else if (roll < 0.25) put('bush', x, y);
      else if (roll < 0.28) put('rock', x, y);
      else if (roll < 0.4) put('flowers', x, y, false);
    }
    // نخل حول البحيرة
    for (let x = 34; x < 75; x += 3) {
      for (const y of [5, 9, 10]) {
        if (free(x, y)) { put('palm', x, y); break; }
      }
    }

    // الأماكن اللي يروحها السكان
    const places = {};
    for (const b of buildings) places[b.id] = { id: b.id, name: b.name, kind: b.kind, front: b.front, indoor: true, b };
    const plazaTiles = [];
    for (let y = 30; y <= 46; y++) {
      for (let x = 45; x <= 63; x++) if (!solid[idx(x, y)]) plazaTiles.push([x, y]);
    }
    places.plaza = { id: 'plaza', name: 'الساحة', kind: 'plaza', front: { x: 54, y: 41 }, indoor: false, tiles: plazaTiles };
    places.site = { id: 'site', name: 'مواقع البناء', kind: 'site', front: { x: 54, y: 41 }, indoor: false, tiles: plazaTiles };
    places.farm = { id: 'farm', name: 'المزرعة', kind: 'farm', front: { x: 6, y: 40 }, indoor: false, tiles: farmTiles };
    const lakeTiles = [];
    for (let y = 8; y <= 11; y++) for (let x = 44; x <= 64; x++) if (!solid[idx(x, y)] && ground[idx(x, y)] !== T.WATER) lakeTiles.push([x, y]);
    places.lake = { id: 'lake', name: 'البحيرة', kind: 'lake', front: { x: 54, y: 10 }, indoor: false, tiles: lakeTiles };
    places.cemetery = { id: 'cemetery', name: 'المقبرة', kind: 'cemetery', front: { x: 100, y: 27 }, indoor: false, tiles: [[100, 25], [100, 28]] };

    // الماي ما ينمشي فيه
    for (let i = 0; i < W * H; i++) if (ground[i] === T.WATER) solid[i] = 1;

    return {
      W, H, ground, solid, buildings, props, flatProps, lotWall, places, graveSlots, stallSlots,
      runway: { x0: 8, x1: 100, y0: 117, y1: 121 },
      apron: { x: 70, y: 113 },
      pumps: [[99, 103], [103, 103], [99, 108], [103, 108], [101, 112]],
      lots: buildings.filter((b) => b.kind === 'firmshop'),
      houses: buildings.filter((b) => b.kind === 'house'),
      palaces: buildings.filter((b) => b.kind === 'palace'),
    };
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
