// اللعبة: الكاميرا، المشي، دخول البيوت، الرسم، والواجهة العربية.
(function () {
  const VQ = window.VQ;
  const Art = VQ.Art;
  const TS = VQ.TILE;
  const C = VQ.CONFIG;
  const SAVE_KEY = 'qaryat-alajyal-v3';
  const reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  const world = VQ.buildWorld();
  const village = VQ.createVillage(world);
  window.Village = village;

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const $ = (id) => document.getElementById(id);
  const ar = VQ.ar;

  Art.buildOutdoor();
  const groundCanvas = Art.buildGround(world);
  const bSprites = {};
  for (const b of world.buildings) bSprites[b.id] = Art.buildBuilding(b);
  const graveImg = Art.graveSprite();

  // العناصر الثابتة في الخريطة مرتبة حسب الموقع
  const statics = [];
  for (const p of world.props) {
    const list = Art.OUTDOOR[p.s];
    if (!list) continue;
    if (p.s === 'fountain') {
      statics.push({ kind: 'fountain', foot: (p.y + 1) * TS, x: p.bx * TS });
      continue;
    }
    const sp = Array.isArray(list) ? list[Math.floor(Art.hash(p.x, p.y) * list.length)] : list;
    const px = p.bx != null ? p.bx * TS : p.x * TS + 8 - sp.ax;
    const foot = (p.y + 1) * TS - (p.bx != null ? 0 : 1);
    statics.push({ img: sp.c, px, py: foot - sp.c.height + (p.bx != null ? 0 : 1), foot, w: sp.c.width });
  }
  for (const b of world.buildings) {
    const sp = bSprites[b.id];
    statics.push({ b, img: sp.c, px: b.x * TS, py: (b.y + b.h) * TS - sp.c.height, foot: (b.y + b.h) * TS, w: sp.c.width });
  }
  const lamps = world.props.filter((p) => p.s === 'lamp').map((p) => ({ x: p.x * TS + 8, y: p.y * TS - 16 }));
  const waterTiles = [];
  for (let y = 0; y < world.H; y++) {
    for (let x = 0; x < world.W; x++) if (world.ground[y * world.W + x] === VQ.T.WATER) waterTiles.push([x, y]);
  }

  const player = { x: 54 * TS + 8, y: 29 * TS + 8, dir: 0, moving: false, anim: 0, path: [], scene: 'out', look: { skin: '#e0ad82', robe: '#8a5a34', robe2: '#6b4426', scarf: '#f4f2ea', shirt: '#3f86d1' } };
  const cam = { x: 0, y: 0 };
  const keys = {};
  let scale = 3;
  let viewW = 400;
  let viewH = 260;
  let speed = 1;
  let fade = 0;
  let fadeTarget = null;
  let frame = 0;
  let accumMinutes = 0;
  let lastT = performance.now();
  let bannerTimer = 0;
  let saveTimer = 0;
  let activeTab = 'places';
  let openPerson = null;
  let panelDirty = true;
  let logFilter = 'main';
  const LOG_GROUPS = {
    gov: ['state', 'annals', 'town', 'arrive', 'migrate', 'pension'],
    econ: ['biz', 'wealth', 'class', 'job', 'shop', 'market', 'firm', 'travel'],
    family: ['marriage', 'birth', 'death', 'family', 'grow', 'meet', 'edu'],
    health: ['sick', 'outbreak', 'minor'],
    crime: ['crime', 'court'],
  };
  const LOG_FILTERS = [
    { id: 'main', name: 'المهم', match: (t) => !VQ.MINOR_LOG.includes(t) },
    { id: 'all', name: 'الكل', match: () => true },
    { id: 'gov', name: 'الدولة', match: (t) => LOG_GROUPS.gov.includes(t) },
    { id: 'econ', name: 'الاقتصاد', match: (t) => LOG_GROUPS.econ.includes(t) },
    { id: 'family', name: 'العوايل', match: (t) => LOG_GROUPS.family.includes(t) },
    { id: 'health', name: 'الصحة', match: (t) => LOG_GROUPS.health.includes(t) },
    { id: 'crime', name: 'الأمن والقضاء', match: (t) => LOG_GROUPS.crime.includes(t) },
  ];

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    scale = Math.max(2, Math.floor(Math.min(w / 300, h / 210)));
    viewW = Math.ceil(w / scale);
    viewH = Math.ceil(h / scale);
    canvas.width = viewW;
    canvas.height = viewH;
    canvas.style.width = viewW * scale + 'px';
    canvas.style.height = viewH * scale + 'px';
    ctx.imageSmoothingEnabled = false;
  }
  window.addEventListener('resize', resize);
  resize();

  // ---------- المشهد ----------
  const currentInterior = () => (player.scene === 'out' ? null : world.places[player.scene].b.interior);
  function solidAt(px, py) {
    const inr = currentInterior();
    const tx = Math.floor(px / TS);
    const ty = Math.floor(py / TS);
    if (inr) {
      if (tx < 0 || ty < 0 || tx >= inr.w || ty >= inr.h) return true;
      return !!inr.grid[ty * inr.w + tx];
    }
    if (tx < 0 || ty < 0 || tx >= world.W || ty >= world.H) return true;
    return !!world.solid[ty * world.W + tx];
  }
  const boxFree = (x, y) => !solidAt(x - 5, y - 3) && !solidAt(x + 5, y - 3) && !solidAt(x - 5, y + 3) && !solidAt(x + 5, y + 3);

  function portalBuildingAt(px, py) {
    const tx = Math.floor(px / TS);
    const ty = Math.floor(py / TS);
    for (const b of world.buildings) {
      // الأرض اللي لسه ما انبنت ما ينداخل فيها
      if (ty === b.doorY && b.doors.includes(tx) && village.buildProgress(b.id) >= 1) return b;
    }
    return null;
  }

  function changeScene(fn) {
    if (fadeTarget) return;
    fadeTarget = fn;
    player.path = [];
  }
  function enterBuilding(b) {
    changeScene(() => {
      player.scene = b.id;
      const inr = b.interior;
      player.x = inr.door.x * TS + 8;
      player.y = (inr.door.y - 1) * TS + 8;
      player.dir = 1;
      showBanner(b);
      refreshHint();
    });
  }
  function leaveBuilding() {
    const b = world.places[player.scene].b;
    if (b.id === 'airport') pax.length = 0;
    changeScene(() => {
      player.scene = 'out';
      player.x = b.front.x * TS + 8;
      player.y = b.front.y * TS + 8;
      player.dir = 0;
      showBanner(null, 'القرية');
      refreshHint();
    });
  }

  function statusLine(b) {
    if (b.kind === 'house' || b.kind === 'palace') {
      const list = village.residents(b.id);
      if (!list.length) return 'فاضي، بانتظار ساكنه';
      return 'يسكنه: ' + list.map((p) => p.name).join('، ');
    }
    if (b.kind === 'branch') return 'مستوى ' + ar(village.branchLevel(b.id)) + ' · داخله ' + ar(village.people.filter((p) => p.loc === b.id).length);
    const inside = village.people.filter((p) => p.loc === b.id).length;
    if (b.kind === 'clinic') {
      const patients = village.people.filter((p) => p.loc === b.id && p.task && p.task.kind === 'hospital').length;
      return patients ? 'فيه ' + ar(patients) + ' منوّمين' : 'علاج وتنويم';
    }
    if (inside) return 'داخله الحين ' + ar(inside);
    return b.kind === 'hall' ? 'مقر الحاكم' : b.kind === 'school' ? 'تعليم العيال' : 'مفتوح';
  }
  function showBanner(b, text) {
    const el = $('banner');
    if (b) {
      el.querySelector('b').textContent = b.name;
      el.querySelector('span').textContent = statusLine(b);
    } else {
      el.querySelector('b').textContent = text;
      el.querySelector('span').textContent = '';
    }
    el.hidden = false;
    bannerTimer = 3.2;
  }

  // ---------- الحركة ----------
  function updatePlayer(dt) {
    let dx = 0;
    let dy = 0;
    if (keys.ArrowLeft || keys.KeyA) dx -= 1;
    if (keys.ArrowRight || keys.KeyD) dx += 1;
    if (keys.ArrowUp || keys.KeyW) dy -= 1;
    if (keys.ArrowDown || keys.KeyS) dy += 1;
    const run = keys.ShiftLeft || keys.ShiftRight;
    const manual = dx || dy;
    if (manual) player.path = [];

    if (player.path.length && !manual) {
      const tx = player.path[0] * TS + 8;
      const ty = player.path[1] * TS + 8;
      const ddx = tx - player.x;
      const ddy = ty - player.y;
      if (Math.abs(ddx) < 2 && Math.abs(ddy) < 2) {
        player.x = tx;
        player.y = ty;
        player.path.splice(0, 2);
      } else {
        dx = Math.abs(ddx) >= 2 ? Math.sign(ddx) : 0;
        dy = Math.abs(ddy) >= 2 ? Math.sign(ddy) : 0;
      }
    }

    const pxPerSec = player.path.length ? 110 : run ? 130 : 80;
    player.moving = !!(dx || dy);
    if (player.moving) {
      const len = Math.hypot(dx, dy);
      const stepX = (dx / len) * pxPerSec * dt;
      const stepY = (dy / len) * pxPerSec * dt;
      if (dy > 0) player.dir = 0;
      else if (dy < 0) player.dir = 1;
      if (dx !== 0 && Math.abs(dx) >= Math.abs(dy)) player.dir = dx < 0 ? 2 : 3;
      if (boxFree(player.x + stepX, player.y) || player.path.length) player.x += stepX;
      if (boxFree(player.x, player.y + stepY) || player.path.length) player.y += stepY;
      player.anim += dt * (run ? 12 : 8);
    } else {
      player.anim = 0;
    }

    if (player.scene === 'out') {
      const b = portalBuildingAt(player.x, player.y);
      if (b) enterBuilding(b);
    } else {
      const inr = currentInterior();
      if (Math.floor(player.y / TS) >= inr.door.y && Math.floor(player.x / TS) === inr.door.x) leaveBuilding();
    }
  }

  function updateCamera() {
    const inr = currentInterior();
    const mapW = inr ? inr.w * TS : world.W * TS;
    const mapH = inr ? inr.h * TS : world.H * TS;
    let cx = Math.round(player.x - viewW / 2);
    let cy = Math.round(player.y - 8 - viewH / 2);
    if (mapW <= viewW) cx = Math.round((mapW - viewW) / 2);
    else cx = Math.max(0, Math.min(mapW - viewW, cx));
    if (mapH <= viewH) cy = Math.round((mapH - viewH) / 2);
    else cy = Math.max(0, Math.min(mapH - viewH, cy));
    cam.x = cx;
    cam.y = cy;
  }

  function walkTo(tileX, tileY) {
    const inr = currentInterior();
    const grid = inr ? inr.grid : world.solid;
    const w = inr ? inr.w : world.W;
    const h = inr ? inr.h : world.H;
    const sx = Math.floor(player.x / TS);
    const sy = Math.floor(player.y / TS);
    // إذا ضغط على مبنى، يمشي لبابه
    if (!inr) {
      const hit = world.buildings.find((b) => tileX >= b.x && tileX < b.x + b.w && tileY >= b.y - 1 && tileY < b.y + b.h);
      if (hit) { tileX = hit.doorX; tileY = hit.doorY; }
    }
    if (tileX < 0 || tileY < 0 || tileX >= w || tileY >= h) return;
    let path = VQ.findPath(grid, w, h, sx, sy, tileX, tileY);
    if (grid[tileY * w + tileX]) {
      // مكان مقفل: أقرب مربع مفتوح
      path = null;
      for (let r = 1; r < 5 && !path; r++) {
        for (const [dx, dy] of [[0, r], [0, -r], [r, 0], [-r, 0]]) {
          const nx = tileX + dx;
          const ny = tileY + dy;
          if (nx >= 0 && ny >= 0 && nx < w && ny < h && !grid[ny * w + nx]) {
            path = VQ.findPath(grid, w, h, sx, sy, nx, ny);
            if (path) break;
          }
        }
      }
    }
    if (path) player.path = path;
  }

  canvas.addEventListener('pointerdown', (e) => {
    const px = e.clientX / scale + cam.x;
    const py = e.clientY / scale + cam.y;
    walkTo(Math.floor(px / TS), Math.floor(py / TS));
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  });

  window.addEventListener('keydown', (e) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    keys[e.code] = true;
    if (e.repeat) return;
    if (e.code === 'KeyE' || e.code === 'Space') interact();
    if (e.code === 'Escape') { $('modal').hidden = true; $('panel').hidden = true; panelBtnSync(); }
    if (e.code === 'KeyM' || e.code === 'Tab') { e.preventDefault(); togglePanel(); }
  });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });
  window.addEventListener('blur', () => { for (const k of Object.keys(keys)) keys[k] = false; });

  // ---------- التفاعل ----------
  function nearInteract() {
    const tx = Math.floor(player.x / TS);
    const ty = Math.floor(player.y / TS);
    if (player.scene !== 'out') {
      const b = world.places[player.scene].b;
      if (VQ.SHOPS[b.kind]) {
        const c = b.interior.anchors.counter;
        if (c && tx >= c.x - 1 && tx <= c.x + c.w && Math.abs(ty - c.y) <= 2) return { type: 'shop', b };
      }
      if (b.kind === 'firmshop') { const f = village.firmAt('lot', b.id); if (f) return { type: 'firm', f }; }
      if (b.kind === 'house' || b.kind === 'palace') return { type: 'house', b };
      if (b.kind === 'branch' || b.kind === 'hall') return { type: 'branch', b };
      return null;
    }
    for (const f of Object.values(village.state.firms || {})) {
      const sl = f.slot != null && world.stallSlots[f.slot];
      if (sl && tx >= sl.x - 1 && tx <= sl.x + 3 && ty >= sl.y && ty <= sl.y + 2) return { type: 'firm', f };
    }
    const graves = village.state.graves;
    const start = Math.max(0, graves.length - world.graveSlots.length);
    for (let i = start; i < graves.length; i++) {
      const [gx, gy] = world.graveSlots[i - start];
      if (Math.abs(gx - tx) <= 1 && Math.abs(gy - ty) <= 1) return { type: 'grave', grave: graves[i] };
    }
    return null;
  }
  function refreshHint() {
    const it = nearInteract();
    const el = $('hint');
    if (!it) { el.hidden = true; return; }
    el.hidden = false;
    el.textContent = it.type === 'firm' ? VQ.FIRMS[it.f.type].name + ' (E)' : it.type === 'shop' ? 'شوف البضاعة (E)' : it.type === 'house' ? 'مخزن البيت (E)' : it.type === 'branch' ? 'شوف الفرع (E)' : 'اقرأ الشاهد (E)';
  }
  function interact() {
    const it = nearInteract();
    if (!it) return;
    if (it.type === 'firm') openFirmCard(it.f);
    else if (it.type === 'shop') openShop(it.b);
    else if (it.type === 'house') openHouse(it.b);
    else if (it.type === 'branch') openBranch(it.b);
    else openModal('شاهد قبر', '<p class="big">' + esc(it.grave.name) + '</p><p>' + (it.grave.gender === 'f' ? 'عاشت ' : 'عاش ') + ar(it.grave.age) + ' سنة، من الجيل ' + ar(it.grave.gen) + '.</p><p>' + (it.grave.gender === 'f' ? 'الله يرحمها.' : 'الله يرحمه.') + '</p>');
  }
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function openModal(title, html) {
    $('modalTitle').textContent = title;
    $('modalBody').innerHTML = html;
    $('modal').hidden = false;
  }
  function itemEffect(item) {
    const parts = [];
    if (item.slot === 'water' || item.water) parts.push('يروي العطش');
    if (item.slot === 'food' || item.food) parts.push('يشبّع');
    if (item.fun) parts.push('ترفيه');
    if (item.social) parts.push('جلسة ناس');
    if (item.health) parts.push('صحة');
    if (item.use === 'keep') parts.push('يبقى عند صاحبه');
    return parts.join(' · ');
  }
  function openFirmCard(f) {
    const def = VQ.FIRMS[f.type];
    const o = village.person(f.owner);
    const tier = VQ.FIRM_TIERS[def.tier];
    const price = def.need.food ? village.priceOf('fatayer') / VQ.ITEMS.fatayer.price * def.price : def.price;
    openModal(def.name, '<p class="meta">' + esc(tier.name) + ' · سجل تجاري رقم ' + ar(f.cr) + ' · المستوى ' + ar(f.level) + '</p>' +
      '<div class="row"><span>المالك</span><b>' + (o ? esc(village.fullName(o)) : '—') + '</b></div>' +
      '<div class="row"><span>سعر البيعة</span><b>' + ar(Math.round(price)) + ' درهم</b></div>' +
      '<div class="row"><span>' + (f.lastProfit >= 0 ? 'ربح أمس' : 'خسارة أمس') + '</span><b>' + ar(Math.round(Math.abs(f.lastProfit))) + ' درهم</b></div>' +
      '<div class="row"><span>باع من يوم فتح</span><b>' + ar(f.sold) + '</b></div>' +
      '<div class="row"><span>فتح</span><b>سنة ' + ar(Math.floor((f.opened - 1) / C.DAYS_PER_YEAR) + 1) + '</b></div>');
  }
  function openShop(b) {
    const rows = VQ.SHOPS[b.kind].map((id) => {
      const it = VQ.ITEMS[id];
      return '<tr><td><b>' + esc(it.name) + '</b><small>' + esc(itemEffect(it)) + '</small></td><td class="price">' + ar(village.priceOf(id)) + ' درهم' + (village.priceOf(id) > it.price ? ' <small>غالي</small>' : village.priceOf(id) < it.price ? ' <small>رخيص</small>' : '') + '</td></tr>';
    }).join('');
    const biz = village.state.biz[b.kind];
    const owner = biz && biz.owner && village.person(biz.owner);
    const ownerLine = biz ? '<p class="meta">' + (owner ? 'المالك: ' + esc(owner.name) : 'ملك الدولة، ومعروض للبيع بـ' + ar(Math.round(biz.price)) + ' درهم') + ' · المستوى ' + ar(biz.level) + '</p>' : '';
    openModal(b.name, ownerLine + '<table class="goods">' + rows + '</table><p class="note">الساكن يشتري بفلوسه من راتبه. أنت هني زائر، فالبضاعة للفرجة.</p>');
  }
  function openBranch(b) {
    const id = VQ.BRANCH_IDS.find((k) => VQ.BRANCHES[k].place === b.id);
    const br = VQ.BRANCHES[id];
    const staff = village.people.filter((p) => p.job && p.job.place === b.id);
    const rows = staff.map((p) => '<tr><td><b>' + esc(p.name) + '</b><small>' + esc(village.jobTitle(p)) + '</small></td><td class="price">' + ar(Math.round(p.job.wage)) + ' درهم</td></tr>').join('');
    openModal(b.name, '<p>فرع ' + esc(br.name) + ' · المستوى ' + ar(village.branchLevel(id)) + ' من ٣</p><p class="meta">' + esc(br.desc) + '</p>' + (rows ? '<table class="goods">' + rows + '</table>' : '<p class="note">ما فيه موظفين للحين.</p>'));
  }
  function openHouse(b) {
    const list = village.residents(b.id);
    const pantry = village.state.houses[b.id].pantry;
    const who = list.length ? list.map((p) => esc(p.name)).join('، ') : 'ما أحد ساكن هني للحين.';
    openModal(b.name, '<p>' + who + '</p><table class="goods"><tr><td><b>ماي</b></td><td class="price">' + ar(pantry.water) + '</td></tr><tr><td><b>أكل</b></td><td class="price">' + ar(pantry.food) + '</td></tr></table>');
  }
  $('modalClose').addEventListener('click', () => { $('modal').hidden = true; });
  $('hint').addEventListener('click', interact);

  // ---------- الرسم ----------
  const stageOf = (age) => (age < 3 ? 'baby' : age < 14 ? 'child' : age >= 60 ? 'elder' : 'adult');

  function drawPlayer(list) {
    const step = player.moving ? [1, 0, 2, 0][Math.floor(player.anim) % 4] : 0;
    const img = Art.charSprite(player.look, 'adult', 'm', player.dir, step);
    list.push({ foot: player.y + 4, draw: () => ctx.drawImage(img, Math.round(player.x - 8 - cam.x), Math.round(player.y + 4 - 24 - cam.y)) });
  }

  function drawPeople(list, sceneId, tileScale) {
    for (const p of village.people) {
      if (p.loc !== sceneId) continue;
      // حركة ناعمة بين المربعات
      if (p.rx == null || p.rScene !== p.loc) { p.rx = p.x; p.ry = p.y; p.rScene = p.loc; }
      const k = Math.min(1, 0.22 * Math.max(1, speed));
      const wasMoving = Math.abs(p.rx - p.x) + Math.abs(p.ry - p.y) > 0.05;
      p.rx += (p.x - p.rx) * k;
      p.ry += (p.y - p.ry) * k;
      const stage = stageOf(village.ageOf(p));
      const step = wasMoving ? [1, 0, 2, 0][Math.floor(frame / 8) % 4] : 0;
      const img = Art.charSprite(p.look, stage, p.gender, p.dir, step);
      const sx = Math.round(p.rx * TS - cam.x);
      const sy = Math.round(p.ry * TS + 16 - 24 - cam.y);
      list.push({
        foot: (p.ry + 1) * TS,
        draw: () => {
          if (p.sleeping && sceneId !== 'out') {
            ctx.drawImage(img, 0, 0, 16, 11, sx, sy + 2, 16, 11);
            ctx.drawImage(Art.emoteSprite(p.illness ? 'sick' : 'zzz'), sx + 1, sy - 14);
            return;
          }
          ctx.drawImage(img, sx, sy);
          const icon = p.illness ? 'sick' : p.emote || (p.id === village.state.gov.ruler ? 'crown' : null);
          if (icon) ctx.drawImage(Art.emoteSprite(icon), sx + 1, sy - 14);
        },
      });
    }
  }

  function drawOutdoors() {
    ctx.drawImage(groundCanvas, cam.x, cam.y, viewW, viewH, 0, 0, viewW, viewH);
    if (!reduceMotion) {
      const t = Math.floor(frame / 24);
      for (const [x, y] of waterTiles) {
        const px = x * TS - cam.x;
        const py = y * TS - cam.y;
        if (px < -16 || py < -16 || px > viewW || py > viewH) continue;
        const phase = (Art.hash(x, y) * 8 + t) % 8;
        if (phase < 2) {
          ctx.fillStyle = '#a6e0ef';
          ctx.fillRect(px + 3 + (x % 7), py + 4 + (y % 7), 5, 1);
        } else if (phase < 3) {
          ctx.fillStyle = '#6cc4e4';
          ctx.fillRect(px + 8 - (x % 5), py + 10 - (y % 5), 3, 1);
        }
      }
    }
    const list = [];
    for (const s of statics) {
      if (s.kind === 'fountain') {
        const fx = s.x - cam.x;
        const fy = s.foot - 88 - cam.y;
        if (fx + 80 < 0 || fx > viewW || fy > viewH || fy + 88 < 0) continue;
        list.push({ foot: s.foot, draw: () => drawFountain(fx, fy) });
        continue;
      }
      const sx = s.px - cam.x;
      const sy = s.py - cam.y;
      if (sx + s.w < 0 || sx > viewW || sy > viewH || sy + s.img.height < 0) continue;
      if (s.b && s.b.kind === 'firmshop') {
        // شكل المحل حسب نشاط السجل التجاري
        const f = village.firmAt('lot', s.b.id);
        if (f && s.type !== f.type) { const sp = Art.buildBuilding(Object.assign({}, s.b, { kind: f.type })); bSprites[s.b.id] = sp; s.img = sp.c; s.type = f.type; }
      }
      const progress = s.b ? village.buildProgress(s.b.id) : 1;
      if (progress <= 0) continue; // أرض فاضية، سورها مرسوم في الأرضية
      list.push({ foot: s.foot, draw: () => {
        if (progress < 1) {
          drawConstruction(s, sx, sy, progress);
          return;
        }
        ctx.drawImage(s.img, sx, sy);
        if (s.b) {
          drawWindowLights(s, sx, sy);
          if (village.isUpgrading(s.b.id)) drawScaffold(sx, sy + s.img.height * 0.35, s.w, s.img.height * 0.65);
        }
      } });
    }
    // البسطات في الساحة ولوحات المشاريع المنزلية
    const signsAt = {};
    for (const f of Object.values(village.state.firms || {})) {
      const def = VQ.FIRMS[f.type];
      let sp;
      let px;
      let foot;
      if (f.slot != null && world.stallSlots[f.slot]) {
        const sl = world.stallSlots[f.slot];
        sp = Art.OUTDOOR['firm_' + f.type][0];
        px = sl.x * TS;
        foot = (sl.y + 2) * TS;
      } else if (def.tier === 'home') {
        const owner = village.person(f.owner);
        const hb = owner && world.places[owner.home] && world.places[owner.home].b;
        if (!hb || hb.kind !== 'house') continue;
        const n = signsAt[hb.id] = (signsAt[hb.id] || 0) + 1;
        sp = Art.OUTDOOR['sign_' + f.type][0];
        px = (hb.doorX + (n === 1 ? 2 : -2)) * TS + 8 - sp.ax;
        foot = (hb.y + hb.h + 1) * TS - 3;
      } else continue;
      const sx = px - cam.x;
      const sy = foot - sp.c.height - cam.y;
      if (sx + sp.c.width < 0 || sx > viewW || sy > viewH || sy + sp.c.height < 0) continue;
      list.push({ foot, draw: () => ctx.drawImage(sp.c, sx, sy) });
    }
    const graves = village.state.graves;
    const start = Math.max(0, graves.length - world.graveSlots.length);
    for (let i = start; i < graves.length; i++) {
      const [gx, gy] = world.graveSlots[i - start];
      const sx = gx * TS - cam.x;
      const sy = (gy + 1) * TS - 18 - cam.y;
      if (sx < -16 || sx > viewW || sy > viewH || sy < -18) continue;
      list.push({ foot: (gy + 1) * TS, draw: () => ctx.drawImage(graveImg.c, sx, sy) });
    }
    const flying = planes(list);
    drawMines(list);
    drawPeople(list, 'out');
    drawPlayer(list);
    list.sort((a, b) => a.foot - b.foot);
    for (const e of list) e.draw();
    drawFog();
    if (flying) flying();
    drawNight();
  }

  // ---- الإقليم الشرقي: ضباب على اللي ما انكشف، ومداخل المناجم ----
  const E = world.east;
  const mineCache = {};
  function mineImg(mineral, stage, fr) {
    const k = mineral + stage + fr;
    return mineCache[k] || (mineCache[k] = Art.mineSprite(mineral, stage, fr));
  }
  function drawMines(list) {
    if (!world.mineSites) return;
    const fr = Math.floor(frame / 20) % 4;
    for (const m of world.mineSites) {
      const site = village.mineSite(m.id);
      if (!site || !site.found) continue;
      const sp = mineImg(m.mineral, site.open ? 2 : site.building ? 1 : 0, site.open && !reduceMotion ? fr : 0);
      const px = m.ex * TS + 8 - sp.ax - cam.x;
      const foot = (m.ey + 1) * TS + 2;
      const py = foot - sp.ay - cam.y;
      if (px + 64 < 0 || px > viewW || py > viewH || py + 48 < 0) continue;
      list.push({ foot, draw: () => ctx.drawImage(sp.c, px, py) });
    }
  }
  function chunkOpen(cx, cy) {
    if (cx < 0 || cy < 0 || cx >= E.cols || cy >= E.rows) return true;
    const st = village.state.mines;
    return !st || !!st.explored[cy * E.cols + cx];
  }
  function drawFog() {
    if (!E || !village.state.mines) return;
    const size = E.chunk * TS;
    const c0 = Math.max(0, Math.floor((cam.x - E.x0 * TS) / size));
    const c1 = Math.min(E.cols - 1, Math.floor((cam.x + viewW - E.x0 * TS) / size));
    const r0 = Math.max(0, Math.floor(cam.y / size));
    const r1 = Math.min(E.rows - 1, Math.floor((cam.y + viewH) / size));
    const drift = reduceMotion ? 0 : Math.floor(frame / 30);
    for (let cy = r0; cy <= r1; cy++) {
      for (let cx = c0; cx <= c1; cx++) {
        if (chunkOpen(cx, cy)) continue;
        const x = E.x0 * TS + cx * size - cam.x;
        const y = cy * size - cam.y;
        ctx.fillStyle = '#2a2232';
        ctx.fillRect(x, y, size, size);
        // غبار يتحرك فوق الضباب
        ctx.fillStyle = 'rgba(120,100,120,.18)';
        for (let i = 0; i < 10; i++) {
          const hx = Art.hash(cx * 13 + i, cy * 7);
          const hy = Art.hash(cy * 11 + i, cx * 5);
          ctx.fillRect(x + ((hx * size + drift * (1 + i % 3)) % size), y + hy * size, 10 + (i % 4) * 4, 1);
        }
        // حافة متدرجة جنب الأرض المكشوفة
        ctx.fillStyle = 'rgba(42,34,50,.55)';
        const band = 10;
        if (chunkOpen(cx - 1, cy)) for (let i = 0; i < size; i += 4) ctx.fillRect(x - band + ((i >> 2) & 1) * 4, y + i, band - ((i >> 2) & 1) * 4, 4);
        if (chunkOpen(cx + 1, cy)) for (let i = 0; i < size; i += 4) ctx.fillRect(x + size, y + i, band - ((i >> 2) & 1) * 4, 4);
        if (chunkOpen(cx, cy - 1)) for (let i = 0; i < size; i += 4) ctx.fillRect(x + i, y - band + ((i >> 2) & 1) * 4, 4, band - ((i >> 2) & 1) * 4);
        if (chunkOpen(cx, cy + 1)) for (let i = 0; i < size; i += 4) ctx.fillRect(x + i, y + size, 4, band - ((i >> 2) & 1) * 4);
      }
    }
  }

  // الطيارات: وحدة واقفة قدام المطار، ووحدة تقلع وتنزل على المدرج
  const plane = Art.planeSprite();
  const pumpFrames = [0, 1, 2].map((f) => Art.pumpSprite(f));
  function planes(list) {
    // مضخات النفط تشتغل بعد ما ينبني الحقل
    if (world.pumps && village.buildProgress('oil') >= 1) {
      const fr = pumpFrames[[0, 1, 2, 1][Math.floor(frame / 12) % 4]];
      for (const [x, y] of world.pumps) {
        const px = x * TS + 8 - fr.ax - cam.x;
        const foot = (y + 1) * TS;
        const py = foot - fr.c.height - cam.y;
        if (px + 40 < 0 || px > viewW || py > viewH || py + 36 < 0) continue;
        list.push({ foot, draw: () => ctx.drawImage(fr.c, px, py) });
      }
    }
    if (!world.runway || village.buildProgress('airport') < 1) return null;
    const ap = world.apron;
    const px = ap.x * TS - 48 - cam.x;
    const foot = (ap.y + 1) * TS;
    const py = foot - 64 - cam.y;
    if (px + 96 > 0 && px < viewW && py < viewH && py + 64 > 0) list.push({ foot, draw: () => ctx.drawImage(plane.c, px, py) });
    const st = village.state;
    const cycle = ((st.day * 1440 + st.minute) % 240) / 240;
    const rw = world.runway;
    const x0 = rw.x0 * TS;
    const x1 = (rw.x1 + 1) * TS;
    const ground = ((rw.y0 + rw.y1 + 1) / 2) * TS - 32;
    let k;
    let dir;
    if (cycle < 0.3) { k = cycle / 0.3; dir = 1; } // إقلاع
    else if (cycle >= 0.55 && cycle < 0.85) { k = 1 - (cycle - 0.55) / 0.3; dir = -1; } // هبوط من الجهة الثانية
    else return null;
    const x = dir > 0 ? x0 + (x1 - x0) * k * k : x1 - (x1 - x0) * k * k;
    const lift = Math.max(0, k - 0.55) * 260; // يرتفع بعد نص المدرج
    return () => {
      const sx = x - 48 - cam.x;
      const sy = ground - lift - cam.y;
      if (sx + 96 < 0 || sx > viewW) return;
      ctx.fillStyle = 'rgba(0,0,0,.18)';
      ctx.fillRect(sx + 10 + lift * 0.3, ground + 30 - cam.y, 76, 6);
      ctx.save();
      if (dir < 0) { ctx.translate(sx + 96, sy); ctx.scale(-1, 1); ctx.drawImage(plane.c, 0, 0); }
      else ctx.drawImage(plane.c, sx, sy);
      ctx.restore();
    };
  }

  // المبنى يطلع من تحت لفوق مع تقدم البناء
  function drawConstruction(s, sx, sy, progress) {
    const h = Math.max(4, Math.round(s.img.height * progress));
    const y = s.img.height - h;
    ctx.drawImage(s.img, 0, y, s.w, h, sx, sy + y, s.w, h);
    drawScaffold(sx, sy + Math.max(0, y - 12), s.w, h + Math.min(12, y));
  }
  function drawScaffold(x, y, w, h) {
    ctx.fillStyle = '#8a5a34';
    for (let px = 2; px < w - 1; px += 26) ctx.fillRect(Math.round(x + px), Math.round(y), 2, Math.round(h));
    ctx.fillRect(Math.round(x + w - 3), Math.round(y), 2, Math.round(h));
    ctx.fillStyle = '#c49a64';
    for (let py = 0; py < h - 2; py += 18) ctx.fillRect(Math.round(x), Math.round(y + py), Math.round(w), 2);
  }

  function drawFountain(fx, fy) {
    const sp = Art.OUTDOOR.fountain;
    ctx.drawImage(sp.c, fx, fy);
    if (reduceMotion) return;
    // قطرات الماي
    const t = frame / 3;
    ctx.fillStyle = '#d8f0fa';
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const life = (t + i * 5) % 26;
      const u = life / 26;
      const x = sp.cx + Math.cos(a) * (6 + u * 16);
      const y = sp.topY - 8 * Math.sin(u * Math.PI) + u * 24;
      ctx.fillRect(Math.round(fx + x), Math.round(fy + y), 1, 2);
    }
    const ring = Math.floor(frame / 12) % 3;
    ctx.fillStyle = '#a6e0ef';
    for (let a = 0; a < 16; a += 2) {
      const ang = (a / 16) * Math.PI * 2;
      ctx.fillRect(Math.round(fx + sp.cx + Math.cos(ang) * (16 + ring * 4)), Math.round(fy + sp.cy + Math.sin(ang) * (13 + ring * 3)), 2, 1);
    }
  }

  function darkness() {
    const h = village.hour;
    if (h >= 7 && h < 18) return 0;
    if (h >= 18 && h < 20.5) return ((h - 18) / 2.5) * 0.62;
    if (h >= 5 && h < 7) return ((7 - h) / 2) * 0.62;
    return 0.62;
  }

  function drawWindowLights(s, sx, sy) {
    const d = darkness();
    if (d < 0.15) return;
    const b = s.b;
    const lit = b.kind === 'house' ? village.people.some((p) => p.loc === b.id && !p.sleeping) : village.people.some((p) => p.loc === b.id);
    s.lit = lit;
  }

  const glow = (() => {
    const { c, g } = Art.mk(64, 64);
    for (const [r, col] of [[30, 'rgba(255,190,90,.10)'], [22, 'rgba(255,200,110,.14)'], [14, 'rgba(255,215,140,.2)'], [7, 'rgba(255,235,180,.35)']]) {
      Art.disc(g, 32, 32, r, r, col);
    }
    return c;
  })();

  function drawNight() {
    const d = darkness();
    if (d <= 0) return;
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = 'rgb(' + Math.round(255 - 215 * d / 0.62 * 0.8) + ',' + Math.round(255 - 190 * d / 0.62 * 0.8) + ',' + Math.round(255 - 95 * d / 0.62 * 0.8) + ')';
    ctx.fillRect(0, 0, viewW, viewH);
    ctx.restore();
    if (d < 0.15) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = Math.min(1, d * 1.6);
    for (const l of lamps) {
      const x = l.x - cam.x;
      const y = l.y - cam.y;
      if (x < -32 || y < -32 || x > viewW + 32 || y > viewH + 32) continue;
      ctx.drawImage(glow, x - 32, y - 32);
    }
    ctx.restore();
    // نوافذ البيوت المسكونة فقط؛ القرية الفاضية بيوتها معتمة
    ctx.fillStyle = '#ffd98a';
    for (const s of statics) {
      if (!s.b || !s.lit) continue;
      const sx = s.px - cam.x;
      const sy = s.py - cam.y;
      if (sx + s.w < 0 || sx > viewW || sy > viewH || sy + s.img.height < 0) continue;
      for (const w of bSprites[s.b.id].windows) ctx.fillRect(sx + w.x, sy + w.y, w.w, w.h);
    }
  }

  function drawInterior() {
    const inr = currentInterior();
    ctx.fillStyle = '#17121c';
    ctx.fillRect(0, 0, viewW, viewH);
    const fl = Art.interiorFloor(inr);
    ctx.drawImage(fl, -cam.x, -cam.y);
    const list = [];
    for (const it of inr.items) {
      const sp = Art.furniture(it.s);
      const sx = it.x * TS - cam.x;
      const sy = it.y * TS - sp.lift - cam.y;
      list.push({ foot: (it.y + it.th) * TS, draw: () => ctx.drawImage(sp.c, sx, sy) });
    }
    drawPeople(list, player.scene);
    if (player.scene === 'airport') drawPassengers(list, inr);
    drawPlayer(list);
    list.sort((a, b) => a.foot - b.foot);
    for (const e of list) e.draw();
    const d = darkness();
    if (d > 0) {
      ctx.fillStyle = 'rgba(30,25,70,' + (d * 0.35).toFixed(3) + ')';
      ctx.fillRect(0, 0, viewW, viewH);
    }
  }

  // ---- المسافرين في صالة المطار: زحمة للعرض بس، ما يدخلون المحاكاة ----
  const pax = [];
  const PAX_COLORS = ['#d9483f', '#2b6fc8', '#3f7a48', '#e0b64f', '#8e62c9', '#5e5e6c', '#d88a36'];
  function paxLook() {
    const src = village.people.length ? village.people[Math.floor(Math.random() * village.people.length)] : null;
    return src ? { look: src.look, gender: src.gender } : { look: player.look, gender: 'm' };
  }
  function spawnPassenger(inr) {
    const R = inr.anchors.route;
    const pick = (l) => l[Math.floor(Math.random() * l.length)];
    const departing = Math.random() < 0.6;
    const door = [inr.door.x, inr.door.y - 1];
    const legs = departing
      ? [pick(R.checkin), pick(R.security), pick(R.passport), pick(R.gates), 'board']
      : [pick(R.passport), pick(R.carousel), door, 'exit'];
    const start = departing ? door : pick(R.gates);
    const who = paxLook();
    pax.push({ x: start[0], y: start[1], tx: start[0], ty: start[1], path: [], legs, wait: 0, dir: 1, look: who.look, gender: who.gender, bag: PAX_COLORS[Math.floor(Math.random() * PAX_COLORS.length)], step: 0 });
  }
  function updatePassengers(inr, dt) {
    const ap = village.state.airport;
    if (village.buildProgress('airport') < 1) { pax.length = 0; return; }
    const want = Math.min(18, 5 + Math.round((ap && ap.tourists) || 0) + village.people.filter((p) => p.loc === 'airport').length);
    if (pax.length < want && Math.random() < dt * 1.2) spawnPassenger(inr);
    for (let i = pax.length - 1; i >= 0; i--) {
      const q = pax[i];
      if (q.wait > 0) { q.wait -= dt; continue; }
      if (!q.path.length) {
        const next = q.legs[0];
        if (next === 'board' || next === 'exit') { pax.splice(i, 1); continue; }
        if (Math.abs(q.x - q.tx) < 0.01 && Math.abs(q.y - q.ty) < 0.01) {
          // وصل للمحطة: يوقف شوي (الكاونتر، التفتيش، الجوازات، البوابة)
          if (q.started) { q.legs.shift(); q.wait = q.legs[0] === 'board' ? 4 + Math.random() * 6 : 0.6 + Math.random() * 1.6; q.started = false; continue; }
          const path = VQ.findPath(inr.grid, inr.w, inr.h, Math.round(q.x), Math.round(q.y), next[0], next[1]);
          if (!path) { pax.splice(i, 1); continue; }
          q.path = path;
          q.started = true;
          if (!path.length) continue;
        }
        if (!q.path.length) continue;
        q.tx = q.path.shift();
        q.ty = q.path.shift();
      }
      const sp = dt * 3.2;
      const dx = q.tx - q.x;
      const dy = q.ty - q.y;
      if (Math.abs(dx) > 0.001) q.dir = dx > 0 ? 3 : 2;
      else if (Math.abs(dy) > 0.001) q.dir = dy > 0 ? 0 : 1;
      q.x += Math.max(-sp, Math.min(sp, dx));
      q.y += Math.max(-sp, Math.min(sp, dy));
      q.step += dt * 8;
      if (Math.abs(q.tx - q.x) < 0.01 && Math.abs(q.ty - q.y) < 0.01 && q.path.length) { q.tx = q.path.shift(); q.ty = q.path.shift(); }
    }
  }
  let paxLast = performance.now();
  function drawPassengers(list, inr) {
    const now = performance.now();
    updatePassengers(inr, Math.min(0.05, (now - paxLast) / 1000));
    paxLast = now;
    for (const q of pax) {
      const moving = Math.abs(q.tx - q.x) + Math.abs(q.ty - q.y) > 0.01;
      const img = Art.charSprite(q.look, 'adult', q.gender, q.dir, moving ? [1, 0, 2, 0][Math.floor(q.step) % 4] : 0);
      const sx = Math.round(q.x * TS - cam.x);
      const sy = Math.round(q.y * TS + 16 - 24 - cam.y);
      list.push({ foot: (q.y + 1) * TS - 1, draw: () => {
        // شنطة بعجلات جنبه
        const bx = q.dir === 2 ? sx + 13 : sx - 3;
        ctx.fillStyle = '#3a2a22'; ctx.fillRect(bx, sy + 13, 7, 10);
        ctx.fillStyle = q.bag; ctx.fillRect(bx + 1, sy + 14, 5, 8);
        ctx.fillStyle = '#3a2a22'; ctx.fillRect(bx + 3, sy + 10, 1, 4);
        ctx.drawImage(img, sx, sy);
      } });
    }
  }

  // ---------- الواجهة ----------
  const SPEEDS = { 1: $('speed1'), 10: $('speed10'), 60: $('speed60') };
  function setSpeed(v) {
    speed = v;
    for (const k of Object.keys(SPEEDS)) SPEEDS[k].setAttribute('aria-pressed', String(Number(k) === v));
  }
  for (const k of Object.keys(SPEEDS)) SPEEDS[k].addEventListener('click', () => setSpeed(Number(k)));
  setSpeed(1);

  function panelBtnSync() {
    $('panelBtn').setAttribute('aria-expanded', String(!$('panel').hidden));
  }
  function togglePanel() {
    $('panel').hidden = !$('panel').hidden;
    $('intro').hidden = true;
    panelBtnSync();
    panelDirty = true;
  }
  $('panelBtn').addEventListener('click', togglePanel);
  $('panelClose').addEventListener('click', togglePanel);
  for (const btn of document.querySelectorAll('[data-tab]')) {
    btn.addEventListener('click', () => {
      activeTab = btn.dataset.tab;
      openPerson = null;
      panelDirty = true;
      renderPanel();
    });
  }

  const PLACE_GROUPS = [
    { title: 'وسط القرية', ids: ['hall', 'plaza'] },
    { title: 'الأكل والماي', ids: ['grocery', 'bakery', 'restaurant', 'cafe'] },
    { title: 'الترفيه والتسوق', ids: ['toys', 'arcade', 'books', 'clothes'] },
    { title: 'الخدمات', ids: ['school', 'clinic', 'farm', 'lake', 'cemetery'] },
    { title: 'فروع الدولة', ids: ['finance', 'works', 'supply', 'security', 'court', 'bank'] },
    { title: 'الجنوب', ids: ['airport', 'oil', 'central', 'exchange', 'university'] },
    { title: 'القصور', ids: world.palaces.map((b) => b.id) },
  ];

  function goToPlace(id) {
    const pl = world.places[id];
    if (player.scene !== 'out') { leaveBuilding(); pendingWalk = id; return; }
    walkPlayerTo(pl);
  }
  let pendingWalk = null;
  function walkPlayerTo(pl) {
    if (pl.indoor) walkTo(pl.b.doorX, pl.b.doorY);
    else walkTo(pl.front.x, pl.front.y);
    if (window.innerWidth < 720) { $('panel').hidden = true; panelBtnSync(); }
  }

  let restartArmed = false;
  let restartTimer = 0;
  const resetBtn = $('resetBtn');
  function setRestartArmed(on) {
    restartArmed = on;
    clearTimeout(restartTimer);
    resetBtn.classList.toggle('armed', on);
    resetBtn.textContent = on ? 'متأكد؟ اضغط مرة ثانية' : 'ريست';
    if (on) restartTimer = setTimeout(() => setRestartArmed(false), 4000);
  }
  function startNewTown() {
    setRestartArmed(false);
    village.reset();
    village.populateStart();
    setSpeed(1);
    save();
    $('toasts').textContent = '';
    showToast('town', 'بدأت قرية جديدة بسكان جدد.');
    renderPanel();
  }
  resetBtn.addEventListener('click', () => {
    if (restartArmed) startNewTown();
    else setRestartArmed(true);
  });

  // الأحداث الكبيرة تطلع على الشاشة، على السرعات العالية نكتفي بآخر ٣
  function showToast(type, text) {
    const box = $('toasts');
    $('intro').hidden = true;
    const el = document.createElement('div');
    el.className = 'toast win t-' + type;
    el.textContent = text;
    box.appendChild(el);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => el.remove(), 6000);
  }

  function bar(label, v, cls) {
    return '<div class="need"><span>' + label + '</span><i><em class="' + (v < 25 ? 'low' : cls || '') + '" style="width:' + Math.round(v) + '%"></em></i></div>';
  }

  function renderMinimap() {
    const m = $('minimap');
    if (!m) return;
    const g = m.getContext('2d');
    g.imageSmoothingEnabled = true;
    g.drawImage(groundCanvas, 0, 0, m.width, m.height);
    const sx = m.width / (world.W * TS);
    const sy = m.height / (world.H * TS);
    for (const b of world.buildings) {
      if (b.plot && village.buildProgress(b.id) <= 0) continue;
      g.fillStyle = b.kind === 'palace' ? '#ffd24a' : b.kind === 'house' ?(village.residents(b.id).length ? '#f0cc70' : '#e8dcc0') : b.kind === 'hall' ? '#46c2b0' : '#e0705a';
      g.fillRect(b.x * TS * sx, b.y * TS * sy, b.w * TS * sx, b.h * TS * sy);
    }
    const ms = village.state.mines;
    if (E && ms) {
      g.fillStyle = '#2a2232';
      for (let cy = 0; cy < E.rows; cy++) for (let cx = 0; cx < E.cols; cx++) {
        if (ms.explored[cy * E.cols + cx]) continue;
        g.fillRect((E.x0 + cx * E.chunk) * TS * sx, cy * E.chunk * TS * sy, E.chunk * TS * sx + 1, E.chunk * TS * sy + 1);
      }
      for (const m of world.mineSites) {
        const site = village.mineSite(m.id);
        if (!site || !site.found) continue;
        g.fillStyle = site.open ? VQ.MINERALS[m.mineral].color : '#d9483f';
        g.fillRect(m.ex * TS * sx - 2, m.ey * TS * sy - 2, 5, 5);
      }
    }
    let px = player.x;
    let py = player.y;
    if (player.scene !== 'out') { const f = world.places[player.scene].front; px = f.x * TS; py = f.y * TS; }
    g.fillStyle = '#ffffff';
    g.fillRect(px * sx - 2, py * sy - 2, 4, 4);
    g.fillStyle = '#d9483f';
    g.fillRect(px * sx - 1, py * sy - 1, 2, 2);
  }

  function renderPanel() {
    panelDirty = false;
    if ($('panel').hidden) return;
    for (const btn of document.querySelectorAll('[data-tab]')) btn.setAttribute('aria-selected', String(btn.dataset.tab === activeTab));
    const body = $('panelBody');
    const st = village.state;

    if (activeTab === 'places') {
      const siteMark = (id) => {
        const pr = village.buildProgress(id);
        return pr >= 1 ? '' : '<small>' + (pr > 0 ? ar(Math.floor(pr * 100)) + '٪' : 'أرض') + '</small>';
      };
      const found = world.mineSites.filter((m) => { const x = village.mineSite(m.id); return x && x.found; }).map((m) => m.id);
      const groups = PLACE_GROUPS.concat([{ title: 'الإقليم الشرقي', ids: ['mining'].concat(found) }]).map((gr) => '<h3>' + gr.title + '</h3><div class="placegrid">' + gr.ids.map((id) => '<button data-go="' + id + '">' + esc(world.places[id].name) + siteMark(id) + '</button>').join('') + '</div>').join('');
      const houses = world.houses.map((h) => {
        const n = village.residents(h.id).length;
        return '<button data-go="' + h.id + '" class="' + (n ? 'lived' : '') + '">' + esc(h.name) + (n ? '<small>' + ar(n) + '</small>' : '') + '</button>';
      }).join('');
      body.innerHTML = '<canvas id="minimap" width="350" height="260" aria-label="خريطة القرية والإقليم الشرقي"></canvas>' + groups + '<h3>البيوت</h3><div class="placegrid houses">' + houses + '</div><p class="note">اضغط على أي مكان وتمشي له.</p>';
      for (const btn of body.querySelectorAll('[data-go]')) btn.addEventListener('click', () => goToPlace(btn.dataset.go));
      renderMinimap();
      return;
    }

    if (activeTab === 'people') {
      const people = village.people;
      if (openPerson && village.person(openPerson)) {
        const p = village.person(openPerson);
        const n = p.needs;
        const sp = p.spouse && village.person(p.spouse);
        const kids = p.children.map((id) => village.person(id)).filter(Boolean).map((k) => k.name);
        const place = p.loc === 'out' ? 'في الطريق' : world.places[p.loc].name;
        const shops = Object.keys(st.biz).filter((id) => st.biz[id].owner === p.id).map((id) => world.places[id].name);
        const palace = world.palaces.find((b) => st.palaces[b.id].owner === p.id);
        const firms = Object.values(st.firms || {}).filter((f) => f.owner === p.id);
        const firmLine = firms.map((f) => VQ.FIRMS[f.type].name + ' (سجل ' + ar(f.cr) + (f.level > 1 ? '، مستوى ' + ar(f.level) : '') + ')').join('، ');
        const years = Math.floor((p.service || 0) / C.DAYS_PER_YEAR);
        const penLine = p.pension ? 'معاش تقاعدي ' + ar(Math.round(p.pension)) + ' درهم باليوم' : p.survivor ? 'معاش ورثة ' + ar(Math.round(p.survivor)) + ' درهم باليوم' : years ? 'خدمة محسوبة للتقاعد: ' + ar(years) + ' سنة' : '';
        const eduLine = (p.expat ? 'وافد · ' : 'مواطن · ') + VQ.EDU_NAMES[p.edu || 0] + (p.student ? ' · طالب' + (p.gender === 'f' ? 'ة' : '') + ' في الجامعة' : '') + (p.expat ? ' · خبير مستقدم' : '');
        const nv = village.netView(p.id);
        const desires = VQ.ACTIONS.map((a, i) => [VQ.ACTION_NAMES[a], nv.probs[i]]).sort((a, b) => b[1] - a[1]).slice(0, 4);
        const friends = Object.entries(p.known).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([id]) => village.person(id)).filter(Boolean).map((f) => f.name);
        body.innerHTML = '<button class="back" id="backPeople">رجوع للسكان</button><h3>' + esc(village.fullName(p)) + '</h3>' +
          '<p class="meta">' + (p.gender === 'm' ? 'ذكر' : 'أنثى') + '، ' + ar(Math.floor(village.ageOf(p))) + ' سنة، الجيل ' + ar(p.gen) + ' · ' + esc(village.classOf(p).name) + '<br>' + esc(p.job ? village.jobTitle(p) : 'بدون شغل') + ' · ' + ar(Math.floor(p.money)) + ' درهم · مهارة ' + ar(Math.floor(p.skill)) + (p.loan ? '<br>عليه قرض ' + ar(Math.round(p.loan)) + ' درهم' : '') + (shops.length ? '<br>يملك: ' + esc(shops.join('، ')) : '') + (palace ? '<br>صاحب ' + esc(palace.name) : '') + (firmLine ? '<br>سجل تجاري: ' + esc(firmLine) : '') + (penLine ? '<br>' + penLine : '') + '<br>الشهادة: ' + esc(eduLine) + (p.task && p.task.kind === 'travel' && p.task.paid ? '<br>مسافر' + (p.gender === 'f' ? 'ة ' : ' ') + esc(p.task.dest || '') : '') + (p.jailUntil ? '<br><span class="illness">في السجن</span>' : '') + '<br>الحين: ' + esc(place) + ' · ساكن في ' + esc(world.places[p.home] ? world.places[p.home].name : 'بلا بيت') + '</p>' +
          bar('ماي', n.water, 'w') + bar('أكل', n.food, 'f') + bar('طاقة', n.energy) + bar('ترفيه', n.fun, 'u') + bar('ناس', n.social, 'u') + bar('صحة', p.health, 'h') +
          (p.illness ? '<p class="illness">' + (p.gender === 'f' ? 'مريضة بـ' : 'مريض بـ') + esc(VQ.DISEASES[p.illness.id].name) + (p.illness.treated ? '، منوّم' + (p.gender === 'f' ? 'ة' : '') + ' في المستشفى' : '') + '</p>' : '') +
          (p.pregnantUntil ? '<p class="meta">حامل، الولادة بعد ' + ar(Math.max(1, p.pregnantUntil - st.day)) + ' يوم</p>' : '') +
          '<p class="meta">' + (sp ? (p.gender === 'm' ? 'زوجته: ' : 'زوجها: ') + esc(sp.name) : p.gender === 'f' ? 'عزباء' : 'أعزب') + (kids.length ? '<br>العيال: ' + esc(kids.join('، ')) : '') + (friends.length ? '<br>يعرف: ' + esc(friends.join('، ')) : '') + (p.owned.length ? '<br>عنده: ' + esc(p.owned.map((i) => VQ.ITEMS[i].name).join('، ')) : '') + '</p>' +
          '<h3>خلاياه العصبية</h3><canvas id="netCanvas" width="320" height="110" aria-label="نشاط الشبكة العصبية"></canvas>' +
          desires.map(([name, v]) => '<div class="row"><span>' + esc(name) + '</span><b>' + ar(Math.round(v * 100)) + '٪</b></div>').join('') +
          '<p class="note">هذي ميوله الحين. اتخذ ' + ar(nv.decisions) + ' قرار، ويتعلم من نتايجها، وورث شبكته من أهله.</p>' +
          '<button id="followBtn" class="wide">روح عنده</button>';
        drawNetwork($('netCanvas'), nv);
        $('backPeople').addEventListener('click', () => { openPerson = null; renderPanel(); });
        $('followBtn').addEventListener('click', () => {
          const target = p.loc === 'out' ? null : p.loc;
          if (target) goToPlace(target);
          else if (player.scene === 'out') walkTo(Math.round(p.x), Math.round(p.y));
        });
        return;
      }
      if (!people.length) {
        body.innerHTML = '<div class="empty"><p class="big">ما بقى أحد</p><p>مات كل سكان القرية. تقدر تبدأ قرية جديدة بعوايل جديدة.</p><button id="newTownBtn" class="wide">ابدأ قرية جديدة</button></div>';
        $('newTownBtn').addEventListener('click', startNewTown);
        return;
      }
      people.sort((a, b) => a.gen - b.gen || village.ageOf(b) - village.ageOf(a));
      const rows = people.map((p) => '<button class="person" data-p="' + p.id + '"><b>' + esc(p.name) + (p.family ? ' <small>' + esc(p.family) + '</small>' : '') + '</b><span>' + (p.gender === 'm' ? 'ذكر' : 'أنثى') + ' · ' + ar(Math.floor(village.ageOf(p))) + ' سنة · ' + esc(village.classOf(p).name) + ' · جيل ' + ar(p.gen) + (p.spouse ? ' · متزوج' + (p.gender === 'f' ? 'ة' : '') : '') + (p.pregnantUntil ? ' · حامل' : '') + (p.illness ? ' · مريض' + (p.gender === 'f' ? 'ة' : '') : '') + '</span></button>').join('');
      body.innerHTML = '<div class="plist">' + rows + '</div>';
      for (const btn of body.querySelectorAll('[data-p]')) btn.addEventListener('click', () => { openPerson = btn.dataset.p; renderPanel(); });
      return;
    }

    if (activeTab === 'families') {
      const rows = world.houses.concat(world.palaces).map((h) => {
        const list = village.residents(h.id);
        if (!list.length) return '';
        const pantry = st.houses[h.id].pantry;
        const sick = list.filter((p) => p.illness).length;
        const family = (list.find((p) => p.family) || {}).family || '';
        const stock = (label, v) => '<i' + (v < list.length ? ' class="low"' : '') + ' style="font-style:normal">' + label + ' ' + ar(v) + '</i>';
        return '<button class="family" data-go="' + h.id + '"><b>' + esc(family || h.name) + ' <small>' + esc(h.name) + '</small></b><span>' + (list.length === 1 ? 'فرد واحد' : list.length === 2 ? 'فردين' : ar(list.length) + ' أفراد') + (sick ? ' · <em class="illness" style="font-style:normal">' + (sick === 1 ? 'مريض واحد' : ar(sick) + ' مرضى') + '</em>' : '') + '</span><span class="stock">' + stock('ماي', pantry.water) + stock('أكل', pantry.food) + '</span></button>';
      }).join('');
      const empty = village.vacantHouses().length;
      const homesKeep = body.scrollTop;
      body.innerHTML = '<div class="plist">' + rows + '</div><p class="note">كل صباح تتأكد البلدية إن كل بيت عنده ماي وأكل يكفي أهله. العيلة تدفع إذا تقدر، وإلا تتكفل البلدية.' + (empty ? ' وفيه ' + ar(empty) + ' بيوت فاضية.' : '') + '</p>';
      body.scrollTop = homesKeep;
      for (const btn of body.querySelectorAll('[data-go]')) btn.addEventListener('click', () => goToPlace(btn.dataset.go));
      return;
    }

    if (activeTab === 'gov') {
      renderGov(body, st);
      return;
    }
    if (activeTab === 'treasury') {
      renderTreasury(body, st);
      return;
    }

    // الأحداث
    const filter = LOG_FILTERS.find((f) => f.id === logFilter) || LOG_FILTERS[0];
    const entries = st.log.filter((e) => filter.match(e.type)).slice(-120).reverse();
    const stats = '<div class="stats"><div><b>' + ar(st.stats.births) + '</b>ولادة</div><div><b>' + ar(st.stats.marriages) + '</b>زواج</div><div><b>' + ar(st.stats.deaths) + '</b>وفاة</div><div><b>' + ar(st.stats.topGen) + '</b>جيل</div></div><p class="meta">خزينة الدولة: ' + ar(Math.floor(st.treasury)) + ' درهم · حالات مرض: ' + ar(st.stats.cases) + ' · عدوى: ' + ar(st.stats.spread) + ' · تنويم: ' + ar(st.stats.treated) + ' · سرقات: ' + ar(st.stats.thefts) + '<br>كل الأحداث من بداية البلدة: ' + ar(st.log.length) + '</p><div class="chips">' + LOG_FILTERS.map((f) => '<button data-log="' + f.id + '" aria-pressed="' + (f.id === logFilter) + '">' + f.name + '</button>').join('') + '</div>';
    const keepScroll = body.scrollTop;
    body.innerHTML = stats + (entries.length ? '<ul class="log">' + entries.map((e) => '<li class="t-' + e.type + '"><small>سنة ' + ar(Math.floor((e.day - 1) / C.DAYS_PER_YEAR) + 1) + '</small>' + esc(e.text) + '</li>').join('') + '</ul>' : '<div class="empty"><p>ما صار شي من هالنوع للحين.</p></div>');
    body.scrollTop = keepScroll;
    for (const btn of body.querySelectorAll('[data-log]')) btn.addEventListener('click', () => { logFilter = btn.dataset.log; renderPanel(); });
  }

  // شكل الشبكة: الحواس، الخلايا المخفية، والقرارات. الأصفر نشاط موجب والأزرق سالب.
  function drawNetwork(cv, nv) {
    const g = cv.getContext('2d');
    g.clearRect(0, 0, cv.width, cv.height);
    const cols = [[nv.input, 26], [nv.hidden, 160], [nv.probs, 294]];
    const yOf = (i, n) => 6 + (i + 0.5) * ((cv.height - 12) / n);
    g.fillStyle = 'rgba(185,192,232,.13)';
    for (let c = 0; c < 2; c++) {
      const [a, ax] = cols[c];
      const [b, bx] = cols[c + 1];
      a.forEach((_, i) => b.forEach((__, j) => {
        g.beginPath();
        g.strokeStyle = 'rgba(185,192,232,.16)';
        g.moveTo(ax, yOf(i, a.length));
        g.lineTo(bx, yOf(j, b.length));
        g.stroke();
      }));
    }
    const top = Math.max(...nv.probs);
    cols.forEach(([list, x], c) => list.forEach((v, i) => {
      const y = yOf(i, list.length);
      const power = c === 2 ? v / (top || 1) : Math.abs(v);
      g.fillStyle = v >= 0 ? 'rgba(244,201,93,' + (0.2 + 0.8 * power).toFixed(2) + ')' : 'rgba(108,196,228,' + (0.2 + 0.8 * power).toFixed(2) + ')';
      g.fillRect(x - 3, y - 2, 6, 4);
    }));
  }

  const CLASS_COLORS = { poor: '#ef7c6c', low: '#e0a53c', middle: '#6cc4e4', wealthy: '#58d0bc', rich: '#f4c95d', ruling: '#c58be8' };
  function marketHtml(st) {
    const m = st.market;
    if (!m) return '';
    const norm = village.normalStock();
    const line = (label, slot) => {
      const x = village.priceMult(slot);
      const tag = x >= 1.7 ? 'غالي' : x <= 0.75 ? 'رخيص' : 'طبيعي';
      const imp = (m.imported && m.imported[slot]) || 0;
      return '<div class="row"><span>' + label + ' <small>' + tag + '</small></span><b>×' + ar(x.toFixed(2)) + '</b></div>' +
        '<div class="progress"><i style="width:' + Math.min(100, Math.round((m[slot] / (norm * 2)) * 100)) + '%;' + (x >= 1.7 ? 'background:var(--red)' : '') + '"></i></div>' +
        '<p class="meta">المخزون ' + ar(Math.round(m[slot])) + ' · إنتاج اليوم ' + ar(Math.round(m.made[slot])) + (imp >= 1 ? ' · مستورد ' + ar(Math.round(imp)) : '') + '</p>';
    };
    const farmers = village.people.filter((p) => p.job && p.job.place === 'farm').length;
    return '<h3>السوق · ' + esc(village.season.name) + '</h3>' + line('الأكل', 'food') + line('الماي', 'water') +
      '<p class="note">المزارعين ' + ar(farmers) + '. السعر يطلع لما يقل المخزون وينزل لما يكثر. القيظ يقل فيه المحصول والماي ويزيد العطش.' +
      ' وصلوا من برا ' + ar(st.stats.arrived || 0) + ' وهاجروا ' + ar(st.stats.left || 0) + '.</p>';
  }
  function firmsHtml(st) {
    const list = Object.values(st.firms || {});
    const money = (v) => ar(Math.round(v)) + ' درهم';
    const count = {};
    for (const f of list) { const t = VQ.FIRMS[f.type].tier; count[t] = (count[t] || 0) + 1; }
    const tiers = Object.keys(VQ.FIRM_TIERS).map((t) => VQ.FIRM_TIERS[t].name + ' ' + ar(count[t] || 0)).join(' · ');
    const rows = list.slice().sort((a, b) => VQ.FIRMS[b.type].capital * b.level - VQ.FIRMS[a.type].capital * a.level).slice(0, 12).map((f) => {
      const o = village.person(f.owner);
      return '<div class="row"><span>' + esc(VQ.FIRMS[f.type].name) + ' <small>' + esc(o ? o.name : '') + (f.level > 1 ? ' · مستوى ' + ar(f.level) : '') + '</small></span><small>' + (f.lastProfit >= 0 ? 'ربح ' : 'خسارة ') + money(Math.abs(f.lastProfit)) + '</small></div>';
    }).join('');
    return '<h3>السجل التجاري</h3><p class="meta">' + ar(list.length) + ' سجل: ' + tiers + '</p>' + (rows || '<p class="meta">ما أحد فتح شي للحين.</p>') +
      '<p class="note">الفقير يبدأ ببسطة في الساحة، والمتوسط بمشروع من البيت، والغني يفتح محل. كل سجل له رسوم وتجديد سنوي، والربح عليه ضريبة.</p>';
  }
  // أركان الدولة: الشعب، الإقليم، السلطة، السيادة
  function pillarsHtml(st) {
    const people = village.people;
    const citizens = people.filter((p) => !p.expat).length;
    const expats = people.length - citizens;
    const sh = st.shura || { members: [] };
    const members = sh.members.map((id) => village.person(id)).filter(Boolean);
    const j = village.judge();
    const ruler = st.gov.ruler && village.person(st.gov.ruler);
    const debt = village.debtTotal();
    const ext = (st.debt ? st.debt.items : []).reduce((a, d) => a + d.external, 0);
    const oil = st.oil;
    const sovereignty = oil && oil.found ? (oil.nationalized ? 'الموارد بيد الدولة بعد تأميم النفط' : 'النفط بامتياز لشركة أجنبية') : 'ما في موارد طبيعية مكتشفة';
    return '<h3>أركان الدولة</h3>' +
      '<div class="row"><span>الشعب</span><b>' + ar(citizens) + ' مواطن · ' + ar(expats) + ' وافد</b></div>' +
      '<div class="row"><span>الإقليم</span><small>برّي ' + ar(world.W * world.H) + ' مربع · مائي: البحيرة' + (st.gov.branches.airport && st.gov.branches.airport.level ? ' · جوي: المطار' : '') + '</small></div>' +
      '<div class="row"><span>السلطة التنفيذية</span><b>' + (ruler ? esc(ruler.name) : 'شاغرة') + '</b></div>' +
      '<div class="row"><span>السلطة التشريعية</span><small>' + (members.length ? 'مجلس الشورى: ' + esc(members.map((m) => m.name).join('، ')) : 'المجلس ما تشكل للحين') + '</small></div>' +
      '<div class="row"><span>السلطة القضائية</span><b>' + (j ? esc(j.name) : 'بدون قاضي') + '</b></div>' +
      '<div class="row"><span>السيادة</span><small>' + sovereignty + (ext > 1 ? ' · دين خارجي ' + ar(Math.round(ext)) : '') + '</small></div>' +
      (sh.votes ? '<p class="note">المجلس صوّت ' + ar(sh.votes) + ' مرة ورفض ' + ar(sh.rejected) + '. يوافق على الموازنة ورفع الضرايب والتجنيس.</p>' : '');
  }
  function cbHtml(st) {
    const cb = st.cb;
    if (!cb) return '';
    const pct = (v) => ar((v * 100).toFixed(1)) + '٪';
    const open = st.gov.branches.central && st.gov.branches.central.level;
    const gov = village.governor();
    const monthly = Math.max(1, (cb.lastOut || 1) / 12 / cb.fx);
    const hist = (cb.history || []).slice(-12);
    const max = Math.max(0.05, ...hist.map((h) => Math.abs(h.infl)));
    const bars = hist.length ? '<div style="display:flex;gap:3px;align-items:flex-end;height:44px;border-bottom:2px solid var(--muted);margin:4px 0 2px" aria-label="التضخم آخر السنين">' + hist.map((h) => '<i title="سنة ' + ar(h.year) + ': ' + pct(h.infl) + '" style="flex:1;height:' + Math.max(2, Math.round((Math.abs(h.infl) / max) * 40)) + 'px;background:' + (h.infl > 0.05 ? 'var(--red)' : h.infl < 0 ? 'var(--blue)' : 'var(--gold)') + '"></i>').join('') + '</div><p class="note" style="margin-top:0">التضخم آخر ' + ar(hist.length) + ' سنة</p>' : '';
    return '<h3>المصرف المركزي</h3>' +
      (open ? '<p class="meta">المحافظ: ' + (gov ? esc(gov.name) : 'ما في محافظ، السياسة النقدية واقفة') + '</p>' : '<p class="meta">ما انبنى للحين. الفايدة ثابتة ٥٪، والحاكم يقدر يطبع فلوس بدون رقابة.</p>') +
      '<div class="row"><span>مؤشر الأسعار</span><b>' + ar(cb.cpi.toFixed(2)) + '</b></div>' +
      '<div class="row"><span>التضخم السنة الماضية</span><b>' + pct(cb.inflation) + ' <small>الهدف ٢٪</small></b></div>' + bars +
      '<div class="row"><span>سعر الفايدة</span><b>' + pct(cb.rate) + '</b></div>' +
      '<div class="row"><span>فايدة القروض · الودايع</span><small>' + pct(cb.rate + 0.03) + ' · ' + pct(Math.max(0, cb.rate - 0.01)) + '</small></div>' +
      '<div class="row"><span>نمو كمية الفلوس</span><b>' + pct(cb.moneyGrowth || 0) + '</b></div>' +
      '<div class="row"><span>سعر الصرف</span><b>' + ar(cb.fx.toFixed(2)) + ' درهم للدولار</b></div>' +
      '<div class="row"><span>الاحتياطي الأجنبي</span><b>' + ar(Math.round(cb.reserves)) + ' دولار <small>' + ar(Math.round(cb.reserves / monthly)) + ' شهر استيراد</small></b></div>' +
      '<div class="row"><span>الذهب</span><b>' + ar(Math.round(cb.gold)) + ' أونصة</b></div>' +
      (open ? '<div class="row"><span>الاحتياطي الإلزامي · سقف القروض</span><small>' + pct(cb.reserveRatio) + ' · ' + ar(Math.round(village.totalLoans())) + ' من ' + ar(Math.round(village.creditCeiling())) + '</small></div>' : '') +
      '<div class="row"><span>القروض المتعثرة</span><b>' + pct(cb.npl || 0) + '</b></div>' +
      (cb.printed ? '<div class="row"><span>فلوس انطبعت للحكومة</span><b>' + ar(Math.round(cb.printed)) + ' درهم</b></div>' : '') +
      (cb.lolr ? '<div class="row"><span>إنقاذ المصرف (ملجأ أخير)</span><b>' + ar(Math.round(cb.lolr)) + ' درهم</b></div>' : '') +
      '<p class="note">يرفع الفايدة لما يزيد التضخم ويخفضها لما ينزل. الدرهم مربوط بالدولار، وإذا خلص الاحتياطي ينخفض. ما يطبع للحكومة إلا مضطر، وينقذ المصرف إذا كثرت الديون المعدومة.</p>';
  }
  function bourseHtml(st) {
    const b = st.bourse;
    if (!b || !st.gov.branches.exchange || !st.gov.branches.exchange.level) return '<h3>البورصة</h3><p class="meta">' + (village.law('markets') ? 'قانون سوق المال صدر، والبورصة تنتظر الحاكم يبنيها.' : 'تحتاج قانون سوق المال ومصرف مركزي قبل.') + '</p>';
    const pct = (a, c) => (c ? ((a / c - 1) * 100).toFixed(1) : '0');
    const rows = b.companies.map((c) => {
      const ch = pct(c.price, c.prev);
      const pub = Object.entries(c.holders).filter(([id]) => id !== 'state').length;
      return '<div class="row"><span>' + esc(c.name) + ' <small>' + ar(pub) + ' مساهم' + (c.dividends ? ' · وزّع ' + ar(Math.round(c.dividends)) : '') + '</small></span><b>' + ar(c.price.toFixed(1)) + ' <small style="color:' + (ch >= 0 ? 'var(--teal)' : 'var(--red)') + '">' + (ch >= 0 ? '▲' : '▼') + ar(Math.abs(ch)) + '٪</small></b></div>';
    }).join('');
    return '<h3>البورصة</h3>' +
      '<div class="row"><span>المؤشر العام</span><b>' + ar(Math.round(b.index)) + '</b></div>' +
      '<div class="row"><span>الوسطاء · المراقبين</span><b>' + ar(village.brokers()) + ' · ' + ar(village.regulators()) + '</b></div>' +
      '<div class="row"><span>اكتتابات · جمعت</span><b>' + ar(b.ipos) + ' · ' + ar(Math.round(b.raised)) + ' درهم</b></div>' +
      '<div class="row"><span>تداول السنة الماضية</span><b>' + ar(Math.round(b.lastVolume || 0)) + ' درهم</b></div>' +
      '<div class="row"><span>جرايم السوق · انكشفت</span><b>' + ar(b.crimes) + ' · ' + ar(b.caught) + '</b></div>' +
      (rows || '<p class="meta">ما في شركة مدرجة للحين.</p>') +
      '<p class="note">الإدراج للمحل اللي ربح آخر سنتين ورأس ماله فوق الحد، بنشرة إصدار، و٤٠٪ للاكتتاب والأولوية للمستثمر الصغير. الأرباح تتوزع كل سنة. بدون وسيط ما في تداول، وهيئة السوق تكشف التداول بمعلومات داخلية والصفقات الوهمية.</p>';
  }
  function lawsHtml(st) {
    const laws = st.laws || {};
    return '<h3>الدستور والقوانين</h3>' + VQ.LAW_GROUPS.map((g, gi) => {
      const items = VQ.LAWS.filter((l) => l.group === gi).map((l) => {
        const y = laws[l.id];
        return '<div class="row"><span>' + (y ? '✓ ' : '○ ') + esc(l.name) + '<br><small>' + esc(l.desc) + '</small></span><small>' + (y ? 'سنة ' + ar(y) : 'ما صدر') + '</small></div>';
      }).join('');
      return '<p class="meta" style="margin-top:10px;color:var(--gold)">' + esc(g) + '</p>' + items;
    }).join('');
  }
  function renderTreasury(body, st) {
    const money = (v) => ar(Math.round(v)) + ' درهم';
    const f = st.gov.lastFin || st.gov.fin;
    const row = (l, v) => '<div class="row"><span>' + l + '</span><b>' + money(v) + '</b></div>';
    const b = st.budget;
    const lines = village.budgetLines;
    let budget = '<h3>الموازنة العامة</h3>';
    if (!b) budget += '<p class="meta">أول موازنة تنعمل بداية السنة الجاية.</p>';
    else {
      budget += '<p class="meta">موازنة السنة ' + ar(b.year) + (b.vote ? ' · المجلس ' + (b.vote.pass ? 'وافق' : 'رفض وقلّص المشاريع') + ' (' + ar(b.vote.yes) + '–' + ar(b.vote.no) + ')' : '') + '</p>' +
        row('الإيرادات المتوقعة', b.forecast) + (b.reserve > 1 ? row('من رصيد الخزينة', b.reserve) : '') +
        Object.keys(lines).map((k) => {
          const cap = b.lines[k] || 0;
          const spent = (b.spent && b.spent[k]) || 0;
          if (!cap && !spent) return '';
          const pct = cap ? Math.min(100, Math.round((spent / cap) * 100)) : 0;
          return '<div class="row"><span>' + esc(lines[k]) + '</span><small>' + ar(Math.round(spent)) + ' من ' + ar(Math.round(cap)) + '</small></div><div class="progress"><i style="width:' + pct + '%;' + (pct >= 100 ? 'background:var(--red)' : '') + '"></i></div>';
        }).join('') +
        (b.supplements ? row('ملاحق الموازنة', b.supplements) : '') +
        '<div class="row"><span>' + (b.deficit > 1 ? 'العجز المتوقع' : 'الموازنة') + '</span><b>' + (b.deficit > 1 ? money(b.deficit) : 'متوازنة') + '</b></div>' +
        '<p class="note">ما ينصرف شي فوق اعتماده. المشاريع توقف لما يخلص اعتمادها، والرواتب والدعم يزيدون بملحق موازنة.</p>';
    }
    const taxRev = (f.tax || 0) + (f.vat || 0) + (f.fees || 0) + (f.caravans || 0);
    const nonTax = (f.oil || 0) + (f.mining || 0) + (f.sales || 0) + (f.airport || 0) + (f.other || 0);
    const rev = '<h3>الإيرادات (السنة الماضية)</h3>' +
      '<p class="meta">ضريبية ' + money(taxRev) + ' · غير ضريبية ' + money(nonTax) + '</p>' +
      row('ضريبة الدخل والأرباح (' + ar(Math.round(st.gov.tax * 100)) + '٪)', f.tax || 0) +
      row('ضريبة القيمة المضافة' + (st.gov.vat ? ' (' + ar(Math.round(st.gov.vat * 100)) + '٪)' : ' (ما في)'), f.vat || 0) +
      row('الرسوم والغرامات', f.fees || 0) + row('الجمارك والقوافل', f.caravans || 0) +
      row('أرباح النفط', f.oil || 0) + row('المناجم', f.mining || 0) + row('أرباح محلات الدولة', f.sales || 0) + row('المطار', f.airport || 0) + row('بيع أملاك وإيرادات ثانية', f.other || 0);
    const d = st.debt || { items: [] };
    const debt = '<h3>الدين العام</h3>' +
      '<p class="big">' + money(village.debtTotal()) + '</p>' +
      '<p class="meta">سقف الدين سنة ونص من الإيرادات: ' + money(village.lastIncome() * 1.5) + '</p>' +
      (d.items.length ? d.items.map((x) => '<div class="row"><span>' + esc(x.kind) + ' ' + ar(x.id) + ' <small>' + ar((x.rate * 100).toFixed(1)) + '٪ · تستحق سنة ' + ar(Math.floor((x.due - 1) / C.DAYS_PER_YEAR) + 1) + '</small></span><small>' + money(x.owed) + (x.external > 1 ? ' · خارجي' : '') + '</small></div>').join('') : '<p class="meta">ما على الدولة دين.</p>') +
      (d.issued ? '<p class="note">أصدرت ' + money(d.issued) + ' وسددت ' + money(d.repaid) + '، والفوايد ' + money(d.interest) + '. المواطنين يشترون الأذونات والسندات، والباقي قرض خارجي بفايدة أعلى.</p>' : '');
    const fund = st.fund || { balance: 0 };
    const liq = '<h3>السيولة</h3>' + row('رصيد الخزينة', st.treasury) + row('الاحتياطي اللي ما ينمس', C.BUILD_RESERVE) + row('الصندوق السيادي', fund.balance) + row('اقتراض السنة الماضية', f.borrow || 0) + row('خدمة الدين السنة الماضية', f.debt || 0);
    const keep = body.scrollTop;
    body.innerHTML = cbHtml(st) + budget + rev + debt + liq + bourseHtml(st);
    body.scrollTop = keep;
  }
  function oilHtml(st) {
    const money = (v) => ar(Math.round(v)) + ' درهم';
    const oil = st.oil;
    const fund = st.fund;
    let html = '<h3>النفط</h3>';
    if (!oil || !oil.found) html += '<p class="meta">ما انكشف النفط للحين. البلد عايشة على الضرايب والقوافل.</p>';
    else {
      const lvl = st.gov.branches.oil ? st.gov.branches.oil.level : 0;
      const crew = village.people.filter((p) => p.job && p.job.place === 'oil').length;
      html += '<div class="row"><span>انكشف</span><b>سنة ' + ar(oil.foundYear) + '</b></div>' +
        '<div class="row"><span>سعر البرميل</span><b>' + ar(oil.price.toFixed(1)) + ' درهم</b></div>' +
        '<div class="row"><span>إنتاج اليوم</span><b>' + ar(Math.round(oil.barrels)) + ' برميل</b></div>' +
        '<div class="row"><span>دخل الدولة السنة الماضية</span><b>' + money(oil.lastRevenue) + '</b></div>' +
        '<div class="row"><span>طاقم الحقل</span><b>' + ar(crew) + '</b></div>' +
        '<p class="note">' + (lvl >= 2 ? 'الشركة مؤممة والدولة تاخذ ٨٠٪.' : 'امتياز لشركة أجنبية والدولة تاخذ ٥٠٪، لين تطوّر الدولة الشركة وتأممها.') + ' السعر يطلع وينزل، ومرات تصير طفرة أو أزمة.</p>';
    }
    if (fund) html += '<h3>الصندوق السيادي</h3><p class="big">' + money(fund.balance) + '</p>' +
      '<div class="row"><span>دخله السنة الماضية</span><b>' + money(fund.lastIn) + '</b></div>' +
      '<div class="row"><span>سحب منه</span><b>' + money(fund.lastOut) + '</b></div>' +
      '<p class="note">نص فايض الخزينة يروح للصندوق ويستثمر، والدولة تسحب منه وقت العجز. إذا كبر واجد يتوزع منه مكرمة على المواطنين.</p>';
    return html;
  }
  function minesHtml(st) {
    const money = (v) => ar(Math.round(v)) + ' درهم';
    const ms = st.mines;
    const lvl = st.gov.branches.mining ? st.gov.branches.mining.level : 0;
    let html = '<h3>المناجم والإقليم الشرقي</h3>';
    if (!ms || !lvl) return html + '<p class="meta">الجبال الشرقية مغطاة بالضباب. تنكشف لما تنبني هيئة التعدين ويطلع المستكشفين.</p>';
    const pct = Math.round((ms.revealed / ms.explored.length) * 100);
    const staff = village.people.filter((p) => p.job && p.job.place === 'mining');
    const students = village.people.filter((p) => p.major === 'geology' && p.student).length;
    html += '<div class="row"><span>المكتشف من الجبال</span><b>' + ar(pct) + '٪</b></div><div class="progress"><i style="width:' + pct + '%"></i></div>' +
      '<div class="row"><span>المستكشفين والجيولوجيين</span><b>' + ar(staff.length) + '</b></div>' +
      '<div class="row"><span>طلبة الجيولوجيا</span><b>' + ar(students) + '</b></div>' +
      '<div class="row"><span>دخل المناجم السنة الماضية</span><b>' + money(ms.lastRevenue) + '</b></div>';
    for (const m of world.mineSites) {
      const site = ms.sites.find((x) => x.id === m.id);
      if (!site || !site.found) continue;
      const crew = village.people.filter((p) => p.job && p.job.place === m.id).length;
      const state = site.open ? 'شغال · ' + ar(crew) + ' عمال · ' + money(site.output) + ' باليوم' : site.building ? 'يتجهز' : 'مكتشف، ينتظر تمويل';
      html += '<div class="row"><span>' + esc(m.place) + ' <small>سنة ' + ar(site.foundYear) + (site.finder ? ' · لقاه ' + esc(site.finder) : '') + '</small></span><small>' + state + '</small></div>';
    }
    const hidden = ms.sites.filter((x) => !x.found).length;
    if (hidden) html += '<p class="note">باقي ' + ar(hidden) + ' مناجم مدفونة في الجبال. الطرق الترابية تسهّل الوصول، فالمستكشفين يمشون معها أول.</p>';
    return html;
  }
  function eduHtml(st) {
    const adults = village.people.filter((p) => village.ageOf(p) >= C.ADULT_AGE);
    const counts = [0, 0, 0, 0, 0];
    for (const p of adults) counts[p.edu || 0]++;
    const stages = VQ.STAGES.slice(1).map((sg, i) => {
      const n = i + 1;
      const open = village.stageOpen(n);
      const kids = n === 4 ? village.people.filter((p) => p.student).length : village.people.filter((p) => { const a = village.ageOf(p); return a >= sg.from && a < sg.to + 1; }).length;
      return '<div class="row"><span>' + esc(sg.name) + (open ? '' : ' <small>ما انبنت</small>') + '</span><b>' + ar(kids) + (n === 4 ? ' طالب' : ' بعمرها') + '</b></div>';
    }).join('');
    const expats = village.people.filter((p) => p.expat).length;
    return '<h3>التعليم</h3>' + stages +
      '<p class="meta">شهادات الكبار: ' + VQ.EDU_NAMES.map((nm, i) => esc(nm) + ' ' + ar(counts[i])).join(' · ') + '</p>' +
      '<p class="note">الوظايف العالية تطلب شهادة وعمر: القاضي والطبيب والأستاذ والمهندس يبون جامعي. إذا ما في مواطن مؤهل، الدولة تستقدم خبير من برا' + (expats ? ' (عندنا ' + ar(expats) + ' للحين)' : '') + '.</p>';
  }
  function airportHtml(st) {
    const ap = st.airport;
    if (!ap || !st.gov.branches.airport || !st.gov.branches.airport.level) return '<h3>المطار</h3><p class="meta">ما انبنى للحين. الحاكم يبنيه بعد ما تتطور البلد.</p>';
    const money = (v) => ar(Math.round(v)) + ' درهم';
    const staff = village.people.filter((p) => p.job && p.job.place === 'airport').length;
    return '<h3>المطار</h3>' +
      '<div class="row"><span>سياح اليوم</span><b>' + ar(ap.tourists) + '</b></div>' +
      '<div class="row"><span>سياح السنة الماضية</span><b>' + ar(ap.lastTourists) + '</b></div>' +
      '<div class="row"><span>صرفوا في البلد</span><b>' + money(ap.lastSpent) + '</b></div>' +
      '<div class="row"><span>سفرات الأهالي السنة الماضية</span><b>' + ar(ap.lastTrips) + '</b></div>' +
      '<div class="row"><span>موظفين المطار</span><b>' + ar(staff) + '</b></div>' +
      '<p class="note">السياح يجون أكثر لما يكون فيه محلات وقصور وأسعار معقولة، ويصرفون في المطاعم والمحلات والبسطات. بدون مراقب جوي ما في رحلات.</p>';
  }
  function courtHtml(st) {
    const c = st.court;
    if (!c) return '';
    const j = village.judge();
    const waiting = c.cases.filter((x) => x.kind !== 'unsolved').length;
    const open = c.cases.filter((x) => x.kind === 'unsolved').length;
    const acc = c.closed ? Math.round((1 - c.wrong / c.closed) * 100) : 100;
    const police = village.people.filter((p) => p.job && p.job.place === 'security').length;
    return '<h3>الأمن والقضاء</h3>' +
      '<div class="row"><span>' + (j && j.gender === 'f' ? 'القاضية' : 'القاضي') + '</span><b>' + (j ? esc(j.name) : 'ما في') + '</b></div>' +
      '<div class="row"><span>رجال الأمن</span><b>' + ar(police) + '</b></div>' +
      '<div class="row"><span>قضايا تنتظر</span><b>' + ar(waiting) + '</b></div>' +
      '<div class="row"><span>بلاغات سرقة تحت التحقيق</span><b>' + ar(open) + '</b></div>' +
      '<div class="row"><span>قضايا انحكمت</span><b>' + ar(c.closed) + '</b></div>' +
      '<div class="row"><span>دقة الأحكام</span><b>' + ar(acc) + '٪</b></div>' +
      '<p class="note">القاضي ممكن يغلط. الدقة تزيد مع مهارته ومستوى المحكمة.</p>';
  }
  function pensionHtml(st) {
    const pen = st.pension;
    if (!pen) return '';
    const money = (v) => ar(Math.round(v)) + ' درهم';
    const retirees = village.people.filter((p) => p.pension || p.survivor).length;
    const members = village.people.filter((p) => p.job && village.ageOf(p) < C.RETIRE_AGE).length;
    const emp = C.PENSION_EMPLOYEE + (pen.bump || 0) * 0.5;
    const boss = C.PENSION_EMPLOYER + (pen.bump || 0);
    return '<h3>صندوق التقاعد</h3><p class="big">' + money(pen.fund) + '</p>' +
      '<div class="row"><span>المشتركين</span><b>' + ar(members) + '</b></div>' +
      '<div class="row"><span>المتقاعدين والورثة</span><b>' + ar(retirees) + '</b></div>' +
      '<div class="row"><span>الاشتراك</span><b>الموظف ' + ar(Math.round(emp * 100)) + '٪ · صاحب العمل ' + ar(Math.round(boss * 100)) + '٪</b></div>' +
      '<div class="row"><span>دخل السنة الماضية</span><b>' + money(pen.lastIn) + '</b></div>' +
      '<div class="row"><span>معاشات السنة الماضية</span><b>' + money(pen.lastOut) + '</b></div>' +
      '<p class="note">الصندوق منفصل عن خزينة الدولة. المعاش ٢.٥٪ من متوسط الراتب عن كل سنة خدمة، لين ٨٠٪. الأرملة تاخذ نص معاش زوجها، واللي ما له معاش ياخذ ضمان اجتماعي.</p>';
  }
  function renderGov(body, st) {
    const gov = st.gov;
    const ruler = gov.ruler && village.person(gov.ruler);
    const money = (v) => ar(Math.round(v)) + ' درهم';
    const era = VQ.ERAS[gov.era].name;
    const f = gov.lastFin || gov.fin;
    const finRow = (label, v) => '<div class="row"><span>' + label + '</span><b>' + money(v) + '</b></div>';
    const pr = gov.project;
    const projectName = pr && world.places[VQ.BRANCHES[pr.branch].place].name;
    const sites = village.activeSites().length;
    const adults = village.people.filter((p) => village.ageOf(p) >= C.ADULT_AGE);
    const counts = {};
    for (const p of adults) { const c = village.classOf(p); counts[c.id] = counts[c.id] || { name: c.name, n: 0 }; counts[c.id].n++; }
    const order = ['ruling', 'rich', 'wealthy', 'middle', 'low', 'poor'].filter((id) => counts[id]);
    const branchRows = VQ.BRANCH_IDS.map((id) => {
      const br = VQ.BRANCHES[id];
      const level = gov.branches[id].level;
      const building = pr && pr.branch === id;
      return '<div class="row"><span>' + esc(br.name) + (building ? ' <small>يبنون فيه</small>' : level ? '' : ' <small>لسه ما انبنى</small>') + '</span><span class="pips" aria-label="المستوى ' + ar(level) + '">' + '■'.repeat(level) + '□'.repeat(3 - level) + '</span></div>';
    }).join('');
    const bizRows = Object.keys(st.biz).map((id) => {
      const o = st.biz[id].owner && village.person(st.biz[id].owner);
      return '<div class="row"><span>' + esc(world.places[id].name) + '</span><small>' + (o ? esc(o.name) : 'ملك الدولة') + '</small></div>';
    }).join('');
    const palaceRows = world.palaces.map((b) => {
      const pal = st.palaces[b.id];
      const o = pal.owner && village.person(pal.owner);
      const state = pal.built ? (o ? esc(o.name) : b.royal ? 'للحاكم' : 'معروض للبيع') : pal.started ? 'تحت البناء ' + ar(Math.floor((pal.done / pal.work) * 100)) + '٪' : 'أرض فاضية';
      return '<div class="row"><span>' + esc(b.name) + '</span><small>' + state + '</small></div>';
    }).join('');
    const keep = body.scrollTop;
    body.innerHTML = '<div class="ruler">' + (ruler ? '<b>' + esc(village.jobTitle(ruler)) + ' ' + esc(ruler.name) + ' ' + esc(ruler.family) + '</b>' + ar(Math.floor(village.ageOf(ruler))) + ' سنة · الحاكم رقم ' + ar(gov.reigns) : '<b>الحكم شاغر</b>') + '<br>البلد الحين: ' + era + ' · مستوى التطور ' + ar(village.totalLevels()) + ' من ' + ar(VQ.BRANCH_IDS.length * 3) + '</div>' +
      '<h3>خزينة الدولة</h3><p class="big">' + money(st.treasury) + '</p>' +
      '<div class="row"><span>الضريبة</span><b>' + ar(Math.round(gov.tax * 100)) + '٪</b></div>' +
      '<p class="note">' + (gov.lastFin ? 'حساب السنة الماضية' : 'حساب السنة الحالية للحين') + '</p>' +
      finRow('ضرايب وزكاة', f.tax) + finRow('مبيعات وأرباح الدولة', f.sales) + finRow('القوافل والجمارك', f.caravans) + finRow('دخل ثاني', f.other) + finRow('الرواتب', f.salaries) + finRow('مشاريع البناء', f.projects) + finRow('الدعم والعلاج', f.welfare) + finRow('استيراد أكل وماي', f.imports || 0) + finRow('رسوم وغرامات', f.fees || 0) + finRow('حصة الدولة في التقاعد', f.pension || 0) + finRow('قروض المصرف', f.loans || 0) +
      (gov.freeze ? '<p class="note">التوظيف الإداري مجمّد لين ترتاح الخزينة.</p>' : '') +
      finRow('المطار والسياحة', f.airport || 0) + finRow('النفط', f.oil || 0) + finRow('المناجم', f.mining || 0) +
      pillarsHtml(st) + lawsHtml(st) + oilHtml(st) + minesHtml(st) + marketHtml(st) + firmsHtml(st) + eduHtml(st) + airportHtml(st) + courtHtml(st) + pensionHtml(st) +
      '<h3>البناء الحين</h3>' + (pr ? '<p class="meta">' + esc(projectName) + (pr.level > 1 ? ' للمستوى ' + ar(pr.level) : '') + ' · ' + ar(Math.floor((pr.done / pr.work) * 100)) + '٪</p><div class="progress"><i style="width:' + Math.floor((pr.done / pr.work) * 100) + '%"></i></div>' : '<p class="meta">ما فيه مشروع دولة الحين. الحاكم يقرر لما تكفي الخزينة.</p>') + (sites ? '<p class="meta">مواقع البناء المفتوحة: ' + ar(sites) + '</p>' : '') +
      '<h3>فروع الدولة</h3>' + branchRows +
      '<h3>الطبقات</h3><div class="classbar">' + order.map((id) => '<i style="flex:' + counts[id].n + ';background:' + CLASS_COLORS[id] + '"></i>').join('') + '</div><div class="legend">' + order.map((id) => '<span style="--c:' + CLASS_COLORS[id] + '">' + esc(counts[id].name) + ' ' + ar(counts[id].n) + '</span>').join('') + '</div>' +
      '<h3>المحلات</h3>' + bizRows + '<h3>القصور</h3>' + palaceRows;
    body.scrollTop = keep;
  }

  function updateHud() {
    const st = village.state;
    const mins = st.minute;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    const period = h < 12 ? 'ص' : 'م';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    $('clock').textContent = ar(h12) + ':' + ar(String(m).padStart(2, '0')) + ' ' + period;
    const dayOfYear = ((st.day - 1) % C.DAYS_PER_YEAR) + 1;
    $('date').textContent = village.season.name + ' · سنة ' + ar(village.year);
    const n = village.people.length;
    $('pop').textContent = n ? ar(n) + ' ساكن' : 'بدون سكان';
    $('gen').textContent = st.stats.topGen ? 'الجيل ' + ar(st.stats.topGen) : '';
    const sick = village.people.filter((p) => p.illness).length;
    $('life').innerHTML = VQ.ERAS[st.gov.era].name + ' · الخزينة <b>' + ar(Math.round(st.treasury)) + '</b> · زواج <b>' + ar(st.stats.marriages) + '</b> · ولادة <b>' + ar(st.stats.births) + '</b>' +(sick ? ' · <span class="sick">مرضى ' + ar(sick) + '</span>' : '');
    $('where').textContent = player.scene === 'out' ? 'القرية' : world.places[player.scene].name;
  }

  // ---------- الحفظ ----------
  function save() {
    const st = village.state;
    try {
      if (!village.people.length && !st.graves.length) localStorage.removeItem(SAVE_KEY);
      else localStorage.setItem(SAVE_KEY, village.serialize());
    } catch (e) { /* التخزين مقفول، نكمل بدونه */ }
  }
  try {
    const saved = localStorage.getItem(SAVE_KEY);
    if (saved) village.restore(saved);
  } catch (e) { /* نبدأ من جديد */ }
  // أول فتحة: القرية تبدأ بسكانها، مو فاضية
  if (!village.people.length && !village.state.graves.length) village.populateStart();
  window.addEventListener('pagehide', save);

  village.on((type, data) => {
    if (type === 'log' || type === 'reset') panelDirty = true;
    if (type === 'reset') openPerson = null;
    if (type === 'log' && ['marriage', 'birth', 'death', 'outbreak', 'state', 'wealth'].includes(data.type)) showToast(data.type, data.text);
  });

  // ---------- الحلقة ----------
  let hudTimer = 0;
  let panelTimer = 0;
  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    frame++;

    if (fadeTarget) {
      fade += dt * 5;
      if (fade >= 1) {
        fade = 1;
        fadeTarget();
        fadeTarget = null;
        if (pendingWalk && player.scene === 'out') {
          walkPlayerTo(world.places[pendingWalk]);
          pendingWalk = null;
        }
      }
    } else if (fade > 0) {
      fade = Math.max(0, fade - dt * 5);
    }

    if (!fadeTarget && $('modal').hidden) updatePlayer(dt);

    accumMinutes += dt * C.GAME_MINUTES_PER_SECOND * speed;
    const whole = Math.min(800, Math.floor(accumMinutes));
    if (whole > 0) {
      accumMinutes -= whole;
      village.advance(whole);
    }

    updateCamera();
    if (player.scene === 'out') drawOutdoors();
    else drawInterior();

    if (fade > 0) {
      ctx.fillStyle = 'rgba(10,8,20,' + fade.toFixed(3) + ')';
      ctx.fillRect(0, 0, viewW, viewH);
    }

    bannerTimer -= dt;
    if (bannerTimer <= 0) $('banner').hidden = true;

    hudTimer -= dt;
    if (hudTimer <= 0) {
      hudTimer = 0.25;
      updateHud();
      refreshHint();
      if (!$('panel').hidden && activeTab === 'places') renderMinimap();
    }
    panelTimer -= dt;
    if (panelTimer <= 0 && !$('panel').hidden && activeTab !== 'places') {
      panelTimer = 1;
      renderPanel();
    } else if (panelDirty && !$('panel').hidden && activeTab === 'places') {
      renderPanel();
    }
    saveTimer -= dt;
    if (saveTimer <= 0) { saveTimer = 20; save(); }
  }

  updateHud();
  $('intro').addEventListener('click', () => { $('intro').hidden = true; });
  setTimeout(() => { $('intro').hidden = true; }, 12000);
  requestAnimationFrame(loop);

  // للاختبار والربط
  window.VillageGame = { player, world, enterBuilding, leaveBuilding, setSpeed, togglePanel, walkTo };
})();
