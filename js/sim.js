// محرك الحياة: حاجات، فلوس، شغل، تعارف، زواج، ولادة، وموت.
// ما يرسم شي. كل إنسان عنده "عقل" يقرر أفعاله؛ الوكلاء يقدرون يحطون عقلهم بدل العقل الافتراضي.
(function (root) {
  const VQ = (root.VQ = root.VQ || {});
  const C = VQ.CONFIG;
  const WALK_PER_MIN = 0.6;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const pick = (r, list) => list[Math.floor(r() * list.length)];

  // أحداث يومية تنخفي في الدفتر إلا إذا طلب يشوف الكل
  VQ.MINOR_LOG = ['meet', 'shop', 'job', 'grow', 'minor'];

  // الحواس اللي تدخل الشبكة العصبية، بنفس الترتيب
  VQ.SENSES = ['ماي', 'أكل', 'طاقة', 'ترفيه', 'ناس', 'صحة', 'فلوس', 'عمر', 'وقت', 'مهارة', 'شغل', 'زواج', 'عيال', 'مرض', 'مخزن', 'بناء'];
  const HIDDEN = 10;
  const A = {};
  VQ.ACTIONS.forEach((name, i) => { A[name] = i; });
  // الغرايز اللي يولد فيها، والتعلم يعدل عليها
  const PRIOR = [
    [3, A.fun, -3], [4, A.social, -3], [2, A.rest, -3], [6, A.invest, 3.5], [6, A.steal, -7], [6, A.overtime, -1.5],
    [9, A.study, -1], [15, A.labor, 1.5], [6, A.shop, 1.5], [7, A.study, -1.5], [14, A.steal, -1],
  ];
  const PRIOR_BIAS = [0.3, -0.6, 0, 0.8, 0.8, -0.5, 0.6, -1, -0.5];

  // شبكة الحاكم: حالة الدولة تدخل، والفرع اللي يبنيه وقرار الضريبة يطلعون
  const GOV_SENSES = 8;
  const TAX_OUTS = 3; // رفع، تثبيت، خفض
  const GOV_PRIOR = (() => {
    const out = (id) => VQ.BRANCH_IDS.indexOf(id);
    const tax = VQ.BRANCH_IDS.length;
    return [
      [1, out('health'), 4], [2, out('supply'), 3], [3, out('security'), 4], [3, out('court'), 2], [4, out('education'), 3],
      [5, out('works'), 2], [0, out('finance'), 1.5], [0, out('bank'), 1.5], [6, out('hall'), 1],
      [4, out('university'), 2], [0, out('airport'), 1.5], [0, out('central'), 1], [0, out('mining'), 1.5],
      [0, tax, -3], [0, tax + 2, 3], [2, tax + 2, 2],
    ];
  })();

  function createVillage(world, seed) {
    let r = VQ.rng(seed || Date.now());
    const listeners = [];
    const brains = {};
    let s;

    function fresh() {
      const houses = {};
      for (const h of world.houses.concat(world.palaces)) houses[h.id] = { pantry: { water: 0, food: 0 } };
      const biz = {};
      for (const id of Object.keys(VQ.SHOPS)) if (id !== 'clinic') biz[id] = { owner: null, till: 0, level: 1, price: C.SHOP_PRICE };
      const palaces = {};
      for (const b of world.palaces) palaces[b.id] = { owner: null, done: 0, work: C.PALACE_WORK, started: false, built: false };
      const branches = {};
      for (const id of VQ.BRANCH_IDS) branches[id] = { level: VQ.BRANCHES[id].start };
      return {
        biz,
        palaces,
        gov: {
          ruler: null,
          dynasty: '',
          reigns: 0,
          tax: C.STARTING_TAX,
          branches,
          project: null,
          era: 0,
          net: null,
          score: 0,
          thefts: 0,
          fin: newLedger(),
          lastFin: null,
        },
        minute: 7 * 60 + 30,
        day: 1,
        treasury: C.STARTING_TREASURY,
        nextId: 1,
        people: {},
        graves: [],
        log: [],
        houses,
        market: newMarket(),
        firms: {},
        nextFirm: 1,
        court: newCourt(),
        pension: newPension(),
        airport: newAirport(),
        outbreak: false,
        stats: { births: 0, deaths: 0, marriages: 0, topGen: 0, cases: 0, spread: 0, treated: 0, thefts: 0, caught: 0, decisions: 0, palaces: 0, built: 0 },
      };
    }
    function newLedger() {
      return { dividends: 0, tax: 0, vat: 0, sales: 0, caravans: 0, other: 0, fees: 0, airport: 0, oil: 0, mining: 0, borrow: 0, debt: 0, salaries: 0, projects: 0, welfare: 0, imports: 0, pension: 0, loans: 0, interest: 0 };
    }
    function newCourt() {
      return { cases: [], next: 1, closed: 0, wrong: 0, warned: false };
    }
    function newAirport() {
      return { tourists: 0, yearTourists: 0, lastTourists: 0, trips: 0, yearTrips: 0, lastTrips: 0, spent: 0, lastSpent: 0 };
    }
    function newPension() {
      return { fund: 0, inYear: 0, outYear: 0, lastIn: 0, lastOut: 0, deficit: false };
    }
    // الحفظ القديم ما فيه الأنظمة الجديدة
    function ensureState() {
      if (!s.market) s.market = newMarket();
      if (!s.firms) { s.firms = {}; s.nextFirm = 1; }
      if (!s.court) s.court = newCourt();
      if (!s.pension) s.pension = newPension();
      if (!s.airport) s.airport = newAirport();
      oilState();
      minesState();
      fundState();
      debtState();
      shuraState();
      cbState();
      lawsState();
      bourseState();
      for (const id of VQ.BRANCH_IDS) if (!s.gov.branches[id]) s.gov.branches[id] = { level: VQ.BRANCHES[id].start };
      // شبكة الحاكم لازم يكون عدد قراراتها نفس عدد الفروع الجديدة
      if (s.gov.net && s.gov.net.o !== VQ.BRANCH_IDS.length + TAX_OUTS) s.gov.net = VQ.Net.create(r, GOV_SENSES, 6, VQ.BRANCH_IDS.length + TAX_OUTS, GOV_PRIOR);
      for (const p of Object.values(s.people)) if (p.edu == null) p.edu = startEdu(p);
    }
    // شهادة تقريبية للي جاي بدون سجل تعليم: المؤسسين والوافدين والحفظ القديم
    function startEdu(p) {
      const age = ageOf(p);
      if (age < 12) return 0;
      if (age < C.ADULT_AGE) return age >= 15 ? 2 : 1;
      return p.skill >= 45 ? 4 : p.skill >= 30 ? 3 : p.skill >= 15 ? 2 : 1;
    }
    function newMarket() {
      return { food: 90, water: 90, made: { food: 0, water: 0 }, bought: { food: 0, water: 0 }, short: 0, mood: { food: 'ok', water: 'ok' }, yearIndex: [] };
    }
    s = fresh();
    let traces = {}; // قرارات اليوم لكل شخص عشان يتعلم منها، ما تنحفظ
    let govTraces = [];

    const emit = (type, data) => {
      for (const fn of listeners) {
        try { fn(type, data); } catch (e) { console.error(e); }
      }
    };

    function log(type, text, ids) {
      const entry = { day: s.day, minute: s.minute, type, text, ids: ids || [] };
      s.log.push(entry);
      // نمسح الأحداث الصغيرة أول، عشان ما تضيع الأعراس والولادات
      if (s.log.length > 3000) {
        const i = s.log.findIndex((e) => VQ.MINOR_LOG.includes(e.type));
        s.log.splice(i < 0 ? 0 : i, 1);
      }
      emit('log', entry);
    }

    const alive = () => Object.values(s.people);
    const person = (id) => s.people[id];
    const ageOf = (p) => (s.day - p.bornDay) / C.DAYS_PER_YEAR;
    const yearOf = () => Math.floor((s.day - 1) / C.DAYS_PER_YEAR) + 1;
    const hour = () => s.minute / 60;
    const absMinute = () => s.day * C.MINUTES_PER_DAY + s.minute;
    const fullName = (p) => {
      const father = p.fatherName;
      const link = father ? (p.gender === 'm' ? ' بن ' : ' بنت ') + father : '';
      return p.name + link + (p.family ? ' ' + p.family : '');
    };
    const jobTitle = (p) => {
      const t = p.job.title;
      if (p.gender !== 'f') return t;
      const parts = t.split(' ');
      parts[0] += 'ة';
      return parts.join(' ');
    };
    const residents = (houseId) => alive().filter((p) => p.home === houseId);
    const vacantHouses = () => world.houses.filter((h) => !alive().some((p) => p.home === h.id));

    function randomLook(gender) {
      const look = { skin: pick(r, VQ.SKINS), shirt: pick(r, VQ.SHIRTS) };
      if (gender === 'f') {
        const robe = pick(r, VQ.ROBES_F);
        look.robe = robe[0];
        look.robe2 = robe[1];
        look.scarf = pick(r, VQ.SCARVES);
      } else {
        look.robe = r() < 0.75 ? '#f2f0e6' : '#d8d2bc';
        look.robe2 = '#bdb8a6';
        look.scarf = r() < 0.5 ? '#f4f2ea' : '#c94b4b';
      }
      return look;
    }

    function newPerson(o) {
      const id = 'p' + s.nextId++;
      const gender = o.gender === 'f' ? 'f' : 'm';
      const age = o.age == null ? 22 : o.age;
      const home = o.home || null;
      const p = {
        id,
        name: o.name || pick(r, gender === 'f' ? VQ.FEMALE_NAMES : VQ.MALE_NAMES),
        family: o.family || '',
        fatherName: o.fatherName || '',
        gender,
        bornDay: s.day - Math.round(age * C.DAYS_PER_YEAR),
        gen: o.gen || 1,
        father: o.father || null,
        mother: o.mother || null,
        spouse: null,
        pregnantUntil: 0,
        wantKids: 2 + Math.floor(r() * 4),
        children: [],
        home,
        job: null,
        money: o.money == null ? 0 : o.money,
        needs: { water: 80, food: 80, energy: 90, fun: 70, social: 60 },
        health: 100,
        illness: null,
        immune: {},
        skill: o.skill == null ? Math.min(55, age * 1.2 + r() * 15) : o.skill,
        net: o.net || VQ.Net.create(r, VQ.SENSES.length, HIDDEN, VQ.ACTIONS.length, PRIOR, PRIOR_BIAS),
        lastWealth: 0,
        lastSkill: 0,
        penalty: 0,
        jailUntil: 0,
        loan: 0,
        service: 0, // أيام الخدمة المحسوبة للتقاعد
        wageSum: 0,
        pension: 0,
        klass: '',
        owned: [],
        known: {},
        loc: 'out',
        x: 0,
        y: 0,
        path: [],
        moveAcc: 0,
        task: null,
        leaving: false,
        dir: 0,
        look: randomLook(gender),
        temper: r(),
        emote: null,
        emoteUntil: 0,
        sleeping: false,
        external: !!o.external,
      };
      s.people[id] = p;
      return p;
    }

    function enterBuilding(p, id) {
      const interior = world.places[id].b.interior;
      p.loc = id;
      p.x = interior.door.x;
      p.y = interior.door.y - 1;
      p.path = [];
      // في الصالات الكبيرة كل موظف له مكانه، والمسافر يقعد عند البوابة
      const a = interior.anchors || {};
      let spot = null;
      if (p.task && p.task.kind === 'work' && p.job && a.jobs && a.jobs[p.job.title]) { const l = a.jobs[p.job.title]; spot = l[(p.job.slot || 0) % l.length]; }
      else if (p.task && p.task.kind === 'travel' && a.travel) spot = pick(r, a.travel);
      spot = spot || pick(r, interior.spots);
      walkInterior(p, spot[0], spot[1]);
      emit('moved', { id: p.id });
    }

    function placeAtHome(p) {
      if (!p.home) return;
      const interior = world.places[p.home].b.interior;
      p.loc = p.home;
      const spot = pick(r, interior.spots);
      p.x = spot[0];
      p.y = spot[1];
      p.path = [];
    }

    function walkInterior(p, tx, ty) {
      const interior = world.places[p.loc].b.interior;
      const path = VQ.findPath(interior.grid, interior.w, interior.h, Math.round(p.x), Math.round(p.y), tx, ty);
      if (path) p.path = path;
      else { p.x = tx; p.y = ty; p.path = []; }
    }

    function goOutdoors(p) {
      const front = world.places[p.loc].front;
      p.loc = 'out';
      p.x = front.x;
      p.y = front.y;
      p.path = [];
      p.leaving = false;
    }

    // يودي الشخص لمكان. يرجع true إذا وصل.
    function travel(p, placeId) {
      const place = world.places[placeId];
      if (!place) return true;
      if (place.indoor && p.loc === placeId) return true;
      if (p.loc !== 'out') {
        // لازم يطلع من الباب أول
        const interior = world.places[p.loc].b.interior;
        if (!p.leaving) {
          p.leaving = true;
          walkInterior(p, interior.door.x, interior.door.y);
        }
        if (p.path.length === 0) goOutdoors(p);
        return false;
      }
      const tile = p.task && p.task.tile && !place.indoor ? p.task.tile : place.front;
      const atX = Math.round(p.x);
      const atY = Math.round(p.y);
      if (atX === tile.x && atY === tile.y && p.path.length === 0) {
        if (place.indoor) enterBuilding(p, placeId);
        return true;
      }
      if (p.path.length === 0) {
        const path = VQ.findPath(world.solid, world.W, world.H, atX, atY, tile.x, tile.y);
        if (!path) {
          // إذا انحصر في مكان، ينتقل مباشرة بدل ما يعلق
          p.x = tile.x;
          p.y = tile.y;
          return false;
        }
        p.path = path;
      }
      return false;
    }

    function stepMovement(p) {
      if (!p.path.length) return;
      p.moveAcc += WALK_PER_MIN;
      while (p.moveAcc >= 1 && p.path.length) {
        p.moveAcc -= 1;
        const nx = p.path.shift();
        const ny = p.path.shift();
        if (nx > p.x) p.dir = 3;
        else if (nx < p.x) p.dir = 2;
        else if (ny > p.y) p.dir = 0;
        else if (ny < p.y) p.dir = 1;
        p.x = nx;
        p.y = ny;
      }
    }

    const emote = (p, icon, mins) => { p.emote = icon; p.emoteUntil = s.day * 1440 + s.minute + (mins || 60); };

    function applyItem(p, item) {
      const n = p.needs;
      if (item.water) n.water = clamp(n.water + item.water, 0, 100);
      if (item.food) n.food = clamp(n.food + item.food, 0, 100);
      if (item.fun) n.fun = clamp(n.fun + item.fun, 0, 100);
      if (item.social) n.social = clamp(n.social + item.social, 0, 100);
      if (item.energy) n.energy = clamp(n.energy + item.energy, 0, 100);
      if (item.health) p.health = clamp(p.health + item.health, 0, 100);
    }

    // ---- الدستور والقوانين ----
    function lawsState() {
      if (!s.laws) { s.laws = {}; for (const l of VQ.LAWS) if (l.start) s.laws[l.id] = 1; }
      return s.laws;
    }
    const law = (id) => !!lawsState()[id];
    function lawReady(l) {
      if (law(l.id) || l.start || l.shura) return false;
      if (l.needs && branchLevel(l.needs[0]) < l.needs[1]) return false;
      if (l.oil && !(s.oil && s.oil.found && branchLevel('oil'))) return false;
      return true;
    }
    function enact(l, how) {
      lawsState()[l.id] = yearOf();
      log('state', 'صدر ' + l.name + (how ? ' ' + how : '') + ': ' + l.desc + '.', []);
    }
    // الحاكم يقترح قانون في السنة، والمجلس يصوت
    function lawsYear(ruler) {
      const ready = VQ.LAWS.filter(lawReady);
      if (!ready.length || r() > 0.6) return;
      const l = pick(r, ready);
      const base = l.id === 'labor' || l.id === 'consumer' ? 0.7 : l.id === 'environment' ? 0.5 : 0.65;
      const v = shuraVote('law', base);
      if (!v) { enact(l, 'بمرسوم من ' + ruler.name); return; }
      if (v.pass) enact(l, 'بعد موافقة مجلس الشورى (' + VQ.ar(v.yes) + '–' + VQ.ar(v.no) + ')');
      else log('state', 'مجلس الشورى رفض مشروع ' + l.name + ' (' + VQ.ar(v.no) + ' ضد).', []);
    }

    // ---- مؤشر الأسعار والعملة ----
    function cbState() {
      if (!s.cb) s.cb = { cpi: 1, wage: 1, rate: 0.05, fx: C.PEG, reserves: 8000, gold: 0, goldPrice: C.GOLD_PRICE, reserveRatio: 0.1, printed: 0, printedYear: 0, lolr: 0, inflation: 0, history: [], lastM: 0, lastO: 0, shock: 0, flowIn: 0, flowOut: 0, lastIn: 0, lastOut: 0, defend: 0 };
      return s.cb;
    }
    const P = () => cbState().cpi; // مستوى الأسعار
    const Wx = () => cbState().wage; // مستوى الرواتب، يلحق الأسعار بتأخير
    const fxFactor = () => cbState().fx / C.PEG; // تخفيض العملة يغلي المستورد
    const loanRate = () => (cbState().rate + 0.03) / C.DAYS_PER_YEAR;
    const depositRate = () => Math.max(0, cbState().rate - 0.01) / C.DAYS_PER_YEAR;
    const palaceCost = () => C.PALACE_COST * P();

    // ---- السوق: المخزون يحدد السعر ----
    const season = () => VQ.SEASONS[(s.day - 1) % C.DAYS_PER_YEAR % VQ.SEASONS.length];
    function market() {
      if (!s.market) s.market = newMarket();
      return s.market;
    }
    // المخزون الطبيعي اللي يخلي السعر عادي
    const normalStock = () => Math.max(24, alive().length * C.RATION_PER_PERSON * C.MARKET_DAYS);
    function priceMult(slot) {
      return clamp(Math.sqrt(normalStock() / Math.max(1, market()[slot])), C.PRICE_MIN, law('consumer') ? 2.2 : C.PRICE_MAX);
    }
    const half = (v) => Math.max(0.5, Math.round(v * 2) / 2);
    // وش ياكل من مخزون السوق: بضاعة المخزن أو الأكل الجاهز
    const stockSlot = (item) => (item.use === 'pantry' ? item.slot : item.food ? 'food' : null);
    function priceOf(itemId) {
      const item = VQ.ITEMS[itemId];
      if (!item) return Infinity;
      const vat = (1 + (s.gov.vat || 0)) * P();
      if (item.use === 'pantry') return half(item.price * priceMult(item.slot) * vat);
      // الأكل الجاهز نصه مواد ونصه شغل، فيتأثر بنص الغلا
      if (item.food) return half(item.price * (0.5 + 0.5 * priceMult('food')) * vat);
      return half(item.price * vat);
    }

    // الشراء: الفلوس ترجع لخزينة البلدية، والبلدية تدفع الرواتب، فالفلوس تدور في القرية.
    function buy(p, itemId, qty) {
      const item = VQ.ITEMS[itemId];
      if (!item) return { ok: false, why: 'ما في هالبضاعة' };
      const shopKind = Object.keys(VQ.SHOPS).find((k) => VQ.SHOPS[k].includes(itemId));
      if (p.loc !== shopKind) return { ok: false, why: 'لازم تكون داخل ' + world.places[shopKind].name };
      const price = priceOf(itemId);
      const slot = stockSlot(item);
      const m = market();
      let count = Math.max(1, qty || 1);
      if (slot && m[slot] < 1) { m.short++; return { ok: false, why: slot === 'water' ? 'خلص الماي من السوق' : 'خلص الأكل من السوق' }; }
      if (slot) count = Math.min(count, Math.floor(m[slot]));
      count = Math.min(count, Math.floor(p.money / price));
      if (count < 1) return { ok: false, why: 'الفلوس ما تكفي' };
      const gross = count * price;
      p.money -= gross;
      // ضريبة القيمة المضافة تروح للخزينة، والباقي للمحل
      const vatPart = gross - gross / (1 + (s.gov.vat || 0));
      if (vatPart > 0) addTreasury(vatPart, 'vat');
      const cost = gross - vatPart;
      if (slot) { m[slot] -= count; m.bought[slot] += count; }
      // جزء للجملة يرجع للدولة، والباقي لصندوق المحل
      const goods = cost * C.GOODS_COST;
      const shop = s.biz[shopKind];
      addTreasury(shop ? goods : cost, 'sales');
      if (shop) shop.till += cost - goods;
      if (item.use === 'pantry' && p.home) s.houses[p.home].pantry[item.slot] += count;
      else if (item.use === 'pantry') { const add = {}; add[item.slot] = item.value * count; applyItem(p, add); }
      else if (item.use === 'keep') {
        if (!p.owned.includes(itemId)) p.owned.push(itemId);
        applyItem(p, { fun: item.fun });
        log('shop', p.name + (p.gender === 'f' ? ' اشترت ' : ' اشترى ') + item.name + ' من ' + world.places[shopKind].name, [p.id]);
      } else {
        for (let i = 0; i < count; i++) applyItem(p, item);
      }
      emote(p, 'coin', 40);
      emit('bought', { id: p.id, item: itemId, qty: count });
      return { ok: true, qty: count, cost };
    }

    function consume(p, slot) {
      if (!p.home || p.loc !== p.home) return false;
      const pantry = s.houses[p.home].pantry;
      if (pantry[slot] <= 0) return false;
      pantry[slot] -= 1;
      if (slot === 'water') { p.needs.water = clamp(p.needs.water + 50, 0, 100); emote(p, 'drop', 30); }
      else { p.needs.food = clamp(p.needs.food + 45, 0, 100); emote(p, 'food', 30); }
      return true;
    }

    // ---- الأفعال. الوكيل يقدر يطلبها مباشرة عن طريق act() ----
    function taskFromAction(p, a) {
      switch (a.type) {
        case 'goto': return { kind: 'visit', place: a.place, dur: a.minutes || 60 };
        case 'buy': {
          const shopKind = Object.keys(VQ.SHOPS).find((k) => VQ.SHOPS[k].includes(a.item));
          return shopKind ? { kind: 'buy', place: shopKind, dur: 15, item: a.item, qty: a.qty || 1 } : null;
        }
        case 'drink': return { kind: 'drink', place: p.home, dur: 10 };
        case 'eat': return { kind: 'eat', place: p.home, dur: 20 };
        case 'sleep': return { kind: 'sleep', place: p.home, dur: a.minutes || 480 };
        case 'work': return p.job ? { kind: 'work', place: p.job.place, dur: a.minutes || 240 } : null;
        case 'play': return { kind: 'play', place: p.home, dur: 60 };
        case 'hospital': return p.illness ? { kind: 'hospital', place: 'clinic', dur: 1000000 } : null;
        case 'study': return { kind: 'study', place: 'books', dur: a.minutes || 90 };
        case 'labor': return buildTask(p, a.minutes || 120, true);
        case 'invest': return { kind: 'invest', place: 'hall', dur: 20 };
        case 'propose': propose(p, a.to); return null;
        case 'say': log('say', p.name + ': ' + a.text, [p.id]); return null;
        default: return null;
      }
    }

    function publicSpot(place) {
      const pl = world.places[place];
      if (pl.tiles && pl.tiles.length) {
        const t = pick(r, pl.tiles);
        return { x: t[0], y: t[1] };
      }
      return pl.front;
    }

    // ---- العقل الافتراضي ----
    function defaultBrain(p) {
      const age = ageOf(p);
      const n = p.needs;
      const h = hour();
      const home = p.home;
      const pantry = home ? s.houses[home].pantry : { water: 0, food: 0 };
      const ill = p.illness && !p.illness.treated ? VQ.DISEASES[p.illness.id] : null;

      if (p.jailUntil > absMinute()) return { kind: 'jail', place: 'security', dur: p.jailUntil - absMinute() };

      // المريض بحالة خطيرة يروح المستشفى قبل أي شي، حتى لو كان صغير
      if (ill && (ill.care === 'hospital' || p.health < 55)) return { kind: 'hospital', place: 'clinic', dur: 1000000 };

      if (age < C.SCHOOL_MIN) {
        if (home) {
          if (n.water < 50 && pantry.water > 0) return { kind: 'drink', place: home, dur: 10 };
          if (n.food < 50 && pantry.food > 0) return { kind: 'eat', place: home, dur: 15 };
          if (h >= 20 || h < 7) return { kind: 'sleep', place: home, dur: 120 };
          return { kind: 'stay', place: home, dur: 60 };
        }
        return { kind: 'stay', place: 'plaza', dur: 60 };
      }

      if (p.health < 45 && p.money >= priceOf('checkup')) return { kind: 'buy', place: 'clinic', dur: 40, item: 'checkup', qty: 1 };

      if (n.water < 35) {
        if (pantry.water > 0) return { kind: 'drink', place: home, dur: 10 };
        if (p.money >= priceOf('water') && age >= 10) {
          const qty = Math.min(6, Math.floor(p.money / priceOf('water')));
          return { kind: 'buy', place: 'grocery', dur: 15, item: 'water', qty, thenDrink: true };
        }
        return { kind: 'fountain', place: 'plaza', dur: 15, tile: { x: 54, y: 41 } };
      }
      if (n.food < 35) {
        if (pantry.food > 0) return { kind: 'eat', place: home, dur: 20 };
        if (age >= 10 && p.money >= priceOf('machboos') * 3 && r() < 0.35) return { kind: 'buy', place: 'restaurant', dur: 45, item: r() < 0.6 ? 'machboos' : 'harees', qty: 1 };
        if (age >= 10 && p.money >= priceOf('bread')) {
          const useBakery = r() < 0.5;
          const item = useBakery ? 'bread' : 'rice';
          const qty = Math.min(5, Math.floor(p.money / priceOf(item)));
          if (qty > 0) return { kind: 'buy', place: useBakery ? 'bakery' : 'grocery', dur: 15, item, qty, thenEat: true };
        }
        // ما عنده أكل ولا فلوس: وجبة مجانية من البلدية
        return { kind: 'aid', place: 'hall', dur: 20 };
      }

      if (n.energy < 12 || h >= 22 || h < 6) {
        if (home) return { kind: 'sleep', place: home, dur: Math.max(60, ((30 - h) % 24) * 60) };
      }

      // المريض يرتاح في البيت بدل المدرسة والدوام
      if (ill && ill.care === 'rest' && home) return { kind: 'rest', place: home, dur: 120 };

      // المدرسة
      if (p.tripPlanned && age >= C.ADULT_AGE && h >= 8 && h < 14 && branchLevel('airport')) return { kind: 'travel', place: 'airport', dur: C.MINUTES_PER_DAY };
      if (age < C.SCHOOL_MAX + 1 && h >= 7.5 && h < 13) {
        // كل عمر يروح مدرسته، وإذا مدرسته ما انبنت يقعد بدون دراسة
        const stage = stageFor(age);
        // بدون تعليم إلزامي، عيال البيوت الفقيرة من ١٢ سنة يطلعون من المدرسة يشتغلون أيام
        const poorHome = p.home && residents(p.home).reduce((a, o) => a + Math.max(0, o.money), 0) < 300 * P();
        const skip = !law('compedu') && stage >= 2 && poorHome && r() < 0.35;
        if (!skip && stage > 0 && stageOpen(stage) && (p.edu == null || p.edu === stage - 1)) return { kind: 'school', place: VQ.STAGES[stage].place, dur: (13 - h) * 60 };
      }
      if (p.student && h >= 8 && h < 14) {
        // طلبة الجيولوجيا يطلعون رحلة ميدانية للجبال يوم من كل ثلاث
        if (p.major === 'geology' && branchLevel('mining') && world.places.frontier.tiles.length && (s.day + Number(String(p.id).slice(1))) % 3 === 0) {
          return { kind: 'school', place: 'frontier', tile: publicSpot('frontier'), field: true, dur: (14 - h) * 60 };
        }
        return { kind: 'school', place: 'university', dur: (14 - h) * 60 };
      }

      // الدوام
      if (p.job && h >= 7.5 && h < 16) return workTask(p, (16 - h) * 60);

      // صاحب البسطة أو المحل يوقف فيه: طول اليوم إذا ما عنده وظيفة، وبعد الدوام إذا عنده
      const tend = tendTask(p, h, age);
      if (tend) return tend;

      // مؤونة البيت
      if (age >= C.ADULT_AGE && home && h >= 6 && h < 21) {
        const members = residents(home).length;
        if (pantry.water < members * 2 && p.money >= priceOf('water') * 2) {
          return { kind: 'buy', place: 'grocery', dur: 15, item: 'water', qty: Math.min(members * 4, Math.floor((p.money * 0.5) / priceOf('water'))) };
        }
        if (pantry.food < members * 2 && p.money >= priceOf('rice')) {
          const bakery = r() < 0.5;
          const item = bakery ? 'samoon' : 'rice';
          return { kind: 'buy', place: bakery ? 'bakery' : 'grocery', dur: 15, item, qty: Math.max(1, Math.min(members * 3, Math.floor((p.money * 0.5) / priceOf(item)))) };
        }
      }

      // العزاب يطلعون بعد الدوام، وهالجلسات هي اللي يتعارفون فيها ويتزوجون
      if (h >= 16 && h < 21.5 && hasMatch(p)) {
        return { kind: 'visit', place: 'cafe', dur: 90 };
      }

      // باقي الوقت تقرره الخلايا العصبية
      return neuralChoice(p, age);
    }

    function neuralChoice(p, age) {
      const h = hour();
      const adult = age >= C.ADULT_AGE;
      const allowed = {
        overtime: adult && !!p.job && h < 20,
        labor: adult && activeSites().length > 0 && h < 20,
        study: age >= C.SCHOOL_MIN && h < 21 && p.skill < 100,
        social: true,
        fun: true,
        shop: age >= 14 && p.money >= 30,
        rest: !!p.home,
        invest: adult && !!investOption(p),
        steal: adult && p.money < 60 && h < 21 && alive().length > 3,
      };
      const mask = VQ.ACTIONS.map((a) => allowed[a]);
      const trace = VQ.Net.decide(r, p.net, sensesOf(p, age), mask);
      s.stats.decisions++;
      const list = traces[p.id] = traces[p.id] || [];
      if (list.length < 14) list.push(trace);
      return taskForChoice(p, VQ.ACTIONS[trace.action], age);
    }

    function sensesOf(p, age) {
      const n = p.needs;
      const home = p.home && s.houses[p.home];
      const members = p.home ? residents(p.home).length : 1;
      return [
        n.water / 100, n.food / 100, n.energy / 100, n.fun / 100, n.social / 100, p.health / 100,
        Math.min(1, Math.log10(1 + Math.max(0, worthOf(p))) / 4), age / 80, hour() / 24, p.skill / 100,
        p.job ? 1 : 0, p.spouse ? 1 : 0, Math.min(1, p.children.length / 5), p.illness ? 1 : 0,
        home ? Math.min(1, (home.pantry.water + home.pantry.food) / (members * 8)) : 0,
        activeSites().length ? 1 : 0,
      ];
    }

    function taskForChoice(p, action, age) {
      const home = p.home;
      switch (action) {
        case 'overtime': {
          const task = workTask(p, 120);
          task.overtime = true;
          return task;
        }
        case 'labor': return buildTask(p, 120, true);
        case 'study': return { kind: 'study', place: r() < 0.6 ? 'books' : 'school', dur: 90 };
        case 'social': {
          const spot = r() < 0.55 ? 'plaza' : r() < 0.6 ? 'cafe' : r() < 0.5 ? 'lake' : 'hall';
          return { kind: 'visit', place: spot, dur: 50 + r() * 60 };
        }
        case 'fun': {
          const wanted = VQ.SHOPS.toys.filter((i) => !p.owned.includes(i) && priceOf(i) * 1.8 <= p.money);
          if (wanted.length && age >= 8 && r() < 0.45) return { kind: 'buy', place: 'toys', dur: 25, item: pick(r, wanted), qty: 1 };
          if (p.owned.length && home && r() < 0.5) return { kind: 'play', place: home, dur: 60 };
          if (p.money >= priceOf('arcadeRound') * 2 && age >= 7 && r() < 0.5) return { kind: 'buy', place: 'arcade', dur: 60, item: 'arcadeRound', qty: 1 };
          if (p.money >= priceOf('karak') * 2 && age >= 14 && r() < 0.6) return { kind: 'buy', place: 'cafe', dur: 60, item: 'karak', qty: 1 };
          return { kind: 'visit', place: r() < 0.6 ? 'plaza' : 'lake', dur: 60 };
        }
        case 'shop': {
          // الغني يشتري غالي، والباقي يتفرج
          const goods = VQ.SHOPS.clothes.concat(VQ.SHOPS.books, VQ.SHOPS.toys).filter((i) => !p.owned.includes(i) && priceOf(i) * 3 <= p.money);
          if (goods.length) {
            const item = pick(r, goods);
            const place = Object.keys(VQ.SHOPS).find((k) => VQ.SHOPS[k].includes(item));
            return { kind: 'buy', place, dur: 25, item, qty: 1 };
          }
          if (p.money >= priceOf('machboos') * 4) return { kind: 'buy', place: 'restaurant', dur: 45, item: 'machboos', qty: 1 };
          return { kind: 'visit', place: 'clothes', dur: 25 };
        }
        case 'invest': return { kind: 'invest', place: branchLevel('bank') ? 'bank' : 'hall', dur: 25 };
        case 'steal': return { kind: 'steal', place: 'plaza', tile: publicSpot('plaza'), dur: 20 };
        default:
          if (home) return { kind: 'stay', place: home, dur: 40 + r() * 60 };
          return { kind: 'visit', place: 'plaza', dur: 60 };
      }
    }

    function tendTask(p, h, age) {
      if (age < C.ADULT_AGE || p.jailUntil) return null;
      const start = p.job ? 16 : 8;
      if (h < start || h >= 20) return null;
      const mine = Object.values(s.firms).filter((f) => f.owner === p.id);
      const f = mine.find((x) => x.lot && api.buildProgress(x.lot) >= 1) || mine.find((x) => x.slot != null) || (!p.job && mine.find((x) => VQ.FIRMS[x.type].tier === 'home'));
      if (!f) return null;
      const dur = Math.max(20, Math.min(120, (20 - h) * 60));
      if (f.lot) return { kind: 'tend', firm: f.id, place: f.lot, dur };
      if (f.slot != null) {
        const sl = world.stallSlots[f.slot];
        return { kind: 'tend', firm: f.id, place: 'plaza', tile: { x: sl.x + 1, y: sl.y + 2 }, dur };
      }
      return p.home ? { kind: 'tend', firm: f.id, place: p.home, dur } : null;
    }

    function workTask(p, minutes) {
      if (p.job.place === 'firm') {
        const f = s.firms[p.job.firm];
        if (!f) return { kind: 'visit', place: 'plaza', dur: 30 };
        if (f.lot && api.buildProgress(f.lot) >= 1) return { kind: 'work', firm: f.id, place: f.lot, dur: minutes };
        if (f.slot != null && world.stallSlots[f.slot]) {
          const sl = world.stallSlots[f.slot];
          return { kind: 'work', firm: f.id, place: 'plaza', tile: { x: sl.x + 2, y: sl.y + 2 }, dur: minutes };
        }
        const owner = s.people[f.owner];
        return { kind: 'work', firm: f.id, place: (owner && owner.home) || 'plaza', dur: minutes };
      }
      if (p.job.title === 'بنّاء') {
        const task = buildTask(p, minutes, false);
        if (task) return task;
        return { kind: 'work', place: 'plaza', tile: publicSpot('plaza'), dur: minutes };
      }
      // المستكشفين والجيولوجيين يطلعون للجبال أغلب الأيام، والرئيس يبقى في المكتب
      if (p.job.place === 'mining' && p.job.title !== 'رئيس هيئة التعدين' && world.places.frontier.tiles.length && r() < 0.7) {
        return { kind: 'work', place: 'frontier', tile: publicSpot('frontier'), dur: minutes };
      }
      const task = { kind: 'work', place: p.job.place, dur: minutes };
      if (p.job.place === 'farm' || VQ.MINE_IDS.includes(p.job.place)) task.tile = publicSpot(p.job.place);
      return task;
    }

    function buildTask(p, minutes, casual) {
      const sites = activeSites();
      if (!sites.length) return casual ? { kind: 'visit', place: 'plaza', dur: 40 } : null;
      const site = pick(r, sites);
      const front = world.places[site.place].front;
      const offset = Math.floor(r() * 7) - 3;
      const free = !world.solid[front.y * world.W + front.x + offset];
      return { kind: casual ? 'labor' : 'work', build: site.id, place: 'plaza', tile: { x: front.x + (free ? offset : 0), y: front.y }, dur: minutes };
    }

    function finishTask(p) {
      const t = p.task;
      p.task = null;
      p.sleeping = false;
      if (!t) return;
      if (t.kind === 'travel' && t.arrived && t.paid) {
        p.needs.fun = clamp(p.needs.fun + 60, 0, 100);
        p.needs.social = clamp(p.needs.social + 30, 0, 100);
        log('travel', p.name + (p.gender === 'f' ? ' رجعت' : ' رجع') + ' من السفر ' + t.dest + '.', [p.id]);
      }
      if (t.kind === 'work' && t.arrived && p.job) {
        if (t.overtime) payWage(p, 0.4); // الشغل الزيادة بنص أجر تقريباً
        // راتب واحد في اليوم، حتى لو طلع من الدوام يشرب ورجع
        else if (p.paidDay !== s.day && payWage(p, 1)) p.paidDay = s.day;
      }
    }

    // ---- الفلوس ----
    const BUDGET_LINES = { salaries: 'الرواتب والأجور', welfare: 'الدعم والضمان الاجتماعي', pension: 'حصة الدولة في التقاعد', projects: 'المشاريع والبنية التحتية', imports: 'استيراد المؤونة', interest: 'فوايد الودايع', loans: 'قروض المصرف', debt: 'خدمة الدين العام' };
    // الموازنة العامة: تنعمل كل بداية سنة من أرقام السنة اللي فاتت، والمجلس يصوت عليها
    function makeBudget() {
      const f = s.gov.lastFin;
      if (!f) return;
      const forecast = ['tax', 'vat', 'sales', 'caravans', 'other', 'fees', 'airport', 'oil', 'mining'].reduce((a, k) => a + (f[k] || 0), 0);
      const dueItems = debtState().items.filter((d) => d.due <= s.day + C.DAYS_PER_YEAR);
      const due = dueItems.reduce((a, d) => a + d.owed, 0);
      const duePrincipal = dueItems.reduce((a, d) => a + d.principal, 0); // سداد الأصل تمويل، مو مصروف
      const lines = {
        salaries: f.salaries * 1.08 + 300,
        welfare: (f.welfare || 0) * 1.2 + 200,
        pension: (f.pension || 0) * 1.1 + 150,
        imports: (f.imports || 0) * 1.3 + 300,
        interest: (f.interest || 0) * 1.1 + 100,
        loans: (f.loans || 0) + 1500,
        debt: due,
      };
      const recurring = Object.values(lines).reduce((a, b) => a + b, 0);
      const b0 = {};
      const reserve = Math.max(0, s.treasury - C.BUILD_RESERVE * 2) * 0.5; // جزء من رصيد الخزينة يتمول منه
      // المشروع الاستراتيجي ينحط له اعتماد حتى لو صار عجز، ويتمول بسندات تنمية
      const next = nextBranches();
      const urgent = urgentBranch(next.map((n) => Object.assign({}, n, { ok: n.level <= 3 && (n.id !== 'oil' || oilState().found) && (n.id !== 'exchange' || law('markets')) && (!VQ.BRANCHES[n.id].needs || s.gov.branches[VQ.BRANCHES[n.id].needs].level >= (VQ.BRANCHES[n.id].needsLevel || 1)) })));
      const strategic = urgent ? next.find((n) => n.id === urgent).cost * 0.5 : 0;
      lines.projects = Math.max(1500 * P(), forecast + reserve - recurring, strategic);
      b0.strategic = urgent;
      const total = recurring + lines.projects;
      const deficit = total - duePrincipal - forecast - reserve;
      const b = Object.assign(b0, { year: yearOf(), forecast, reserve, lines, spent: {}, noted: {}, supplements: 0, deficit, vote: null });
      // الشورى: إذا العجز كبير يطلب تقليص المشاريع
      const v = shuraVote('budget', deficit > forecast * 0.25 ? 0.35 : 0.85);
      b.vote = v;
      if (v && !v.pass) {
        lines.projects = Math.max(1000, lines.projects - deficit * 0.6);
        b.deficit = recurring + lines.projects - duePrincipal - forecast - reserve;
        log('state', 'مجلس الشورى رفض مشروع الموازنة (' + VQ.ar(v.yes) + ' مع و' + VQ.ar(v.no) + ' ضد)، وتقلصت المشاريع إلى ' + VQ.ar(Math.round(lines.projects)) + ' درهم.', []);
      } else {
        log('state', 'موازنة السنة ' + VQ.ar(yearOf()) + ': إيرادات متوقعة ' + VQ.ar(Math.round(forecast)) + ' ومصروفات ' + VQ.ar(Math.round(total)) + (reserve > 1 ? ' منها ' + VQ.ar(Math.round(reserve)) + ' من رصيد الخزينة' : '') + (b.deficit > 1 ? '، بعجز ' + VQ.ar(Math.round(b.deficit)) : '، متوازنة') + '.' + (v ? ' وافق عليها مجلس الشورى.' : ''), []);
      }
      s.budget = b;
    }
    const budgetLeft = (k) => (s.budget && s.budget.lines[k] != null ? s.budget.lines[k] - (s.budget.spent[k] || 0) : Infinity);

    // ---- الدين العام: أذونات وسندات يشتريها المواطنين، والباقي من جهات أجنبية ----
    function debtState() {
      if (!s.debt) s.debt = { items: [], next: 1, issued: 0, repaid: 0, interest: 0 };
      return s.debt;
    }
    const debtTotal = () => debtState().items.reduce((a, d) => a + d.owed, 0);
    const lastIncome = () => { const f = s.gov.lastFin; return f ? ['tax', 'vat', 'sales', 'caravans', 'other', 'fees', 'airport', 'oil', 'mining'].reduce((a, k) => a + (f[k] || 0), 0) : 5000; };
    function issueDebt(amount, years, why, backed) {
      const d = debtState();
      // سقف الدين: سنة ونص من الإيرادات، والقرض المضمون بالنفط يوصل لين مرتين ونص
      if (debtTotal() + amount > lastIncome() * (backed ? 2.5 : 1.5)) return 0;
      // كل ما زاد الدين زادت الفايدة اللي يطلبها المقرضين
      const rate = cbState().rate + (years > 1 ? 0.015 : 0) + 0.04 * (debtTotal() / Math.max(1, lastIncome()));
      const holders = [];
      let raised = 0;
      const buyers = alive().filter((p) => !p.expat && ageOf(p) >= C.ADULT_AGE && p.money > 1500).sort((a, b) => b.money - a.money);
      for (const p of buyers) {
        if (raised >= amount) break;
        const take = Math.min(amount - raised, (p.money - 1000) * 0.3);
        if (take < 50) continue;
        p.money -= take;
        holders.push({ id: p.id, amount: take });
        raised += take;
      }
      const external = amount - raised;
      const owedLocal = raised * (1 + rate * years);
      const owedExt = external * (1 + (rate + 0.03) * years);
      const item = { id: d.next++, kind: years > 1 ? 'سندات تنمية' : 'أذونات خزينة', principal: amount, local: raised, external, rate, years, issued: s.day, due: s.day + years * C.DAYS_PER_YEAR, owed: owedLocal + owedExt, owedLocal, holders, why };
      d.items.push(item);
      d.issued += amount;
      s.treasury += amount;
      s.gov.fin.borrow = (s.gov.fin.borrow || 0) + amount;
      log('state', 'الخزينة أصدرت ' + item.kind + ' بـ' + VQ.ar(Math.round(amount)) + ' درهم لمدة ' + VQ.ar(years) + (years > 1 ? ' سنين' : ' سنة') + ' بفايدة ' + VQ.ar((rate * 100).toFixed(1)) + '٪ ' + why + '. ' + (raised ? 'المواطنين اشتروا ' + VQ.ar(Math.round(raised)) : '') + (external > 1 ? (raised ? ' والباقي ' : '') + 'قرض خارجي ' + VQ.ar(Math.round(external)) : '') + '.', []);
      return amount;
    }
    function debtDay() {
      const d = debtState();
      for (const item of d.items.slice()) {
        if (item.due > s.day) continue;
        // لو الخزينة ما تكفي، تجدد الدين بإصدار جديد
        if (s.treasury < item.owed + C.BUILD_RESERVE * 0.5) {
          const fund = fundState();
          const need = item.owed + C.BUILD_RESERVE * 0.5 - s.treasury;
          const take = Math.min(fund.balance, need);
          fund.balance -= take; fund.outYear += take; s.treasury += take;
          if (s.treasury < item.owed) issueDebt(item.owed - s.treasury + 500, 1, 'لتجديد دين مستحق');
        }
        const paid = spendTreasury(item.owed, 'debt');
        const ratio = paid / item.owed;
        // حملة السندات يستلمون فلوسهم بفايدتها، والميت يروح نصيبه لورثته
        for (const h of item.holders) {
          let p = s.people[h.id];
          const share = (h.amount / Math.max(1, item.local)) * item.owedLocal * ratio;
          if (!p) p = alive().find((x) => x.father === h.id || x.mother === h.id);
          if (p) p.money += share;
        }
        d.repaid += item.principal;
        cbState().flowOut += item.external * (1 + (item.rate + 0.03) * item.years) * ratio;
        d.interest += item.owed - item.principal;
        d.items.splice(d.items.indexOf(item), 1);
        log('state', 'الخزينة سددت ' + item.kind + ' رقم ' + VQ.ar(item.id) + ': ' + VQ.ar(Math.round(paid)) + ' درهم مع الفوايد.', []);
      }
      // أزمة سيولة: الخزينة شبه فاضية والصندوق خلص
      if (s.treasury < C.BUILD_RESERVE * 0.4 && fundState().balance < 100) {
        const got = issueDebt(C.BUILD_RESERVE * 1.5, 1, 'لسد عجز السيولة');
        if (!got && s.treasury < C.BUILD_RESERVE * 0.25) printMoney(C.BUILD_RESERVE * P());
      }
    }

    // ---- مجلس الشورى: السلطة التشريعية ----
    function shuraState() {
      if (!s.shura) s.shura = { members: [], elected: 0, votes: 0, rejected: 0 };
      return s.shura;
    }
    function shuraElection() {
      const sh = shuraState();
      const pool = alive().filter((p) => !p.expat && ageOf(p) >= 30 && p.id !== s.gov.ruler && !p.jailUntil);
      if (pool.length < 5) { sh.members = []; return; }
      const score = (p) => p.skill / 100 + Math.log10(1 + Math.max(0, worthOf(p))) / 4 + Object.keys(p.known).length / 20 - p.penalty * 0.2 + r() * 0.6;
      sh.members = pool.map((p) => [score(p), p]).sort((a, b) => b[0] - a[0]).slice(0, 5).map((x) => x[1].id);
      sh.elected = yearOf();
      for (const id of ['constitution', 'elections']) if (!law(id)) enact(VQ.LAWS.find((l) => l.id === id), 'مع تشكيل أول مجلس شورى');
      log('state', 'انتخابات مجلس الشورى: فازوا ' + sh.members.map((id) => s.people[id].name).join('، ') + '.', sh.members);
    }
    // كل عضو يصوت حسب طبقته وحال البلد
    function shuraVote(topic, base) {
      const sh = shuraState();
      const members = sh.members.map((id) => s.people[id]).filter(Boolean);
      if (members.length < 3) return null;
      let yes = 0;
      for (const m of members) {
        const k = classOf(m).id;
        let p = base;
        if (topic === 'tax' || topic === 'vat') p += k === 'rich' || k === 'wealthy' ? -0.15 : k === 'poor' || k === 'low' ? -0.1 : 0;
        if (r() < p) yes++;
      }
      sh.votes++;
      const pass = yes > members.length / 2;
      if (!pass) sh.rejected++;
      return { yes, no: members.length - yes, pass };
    }

    function addTreasury(amount, source) {
      s.treasury += amount;
      s.gov.fin[source] = (s.gov.fin[source] || 0) + amount;
    }
    function spendTreasury(amount, purpose) {
      // الرقابة المسبقة: ما ينصرف شي فوق اعتماد بنده في الموازنة
      const b = s.budget;
      if (b && b.lines[purpose] != null && amount > 0) {
        const left = b.lines[purpose] - (b.spent[purpose] || 0);
        if (amount > left) {
          if (purpose === 'projects') amount = Math.max(0, left);
          else {
            // البنود الإلزامية ما توقف: ملحق موازنة يعتمده المجلس
            const extra = amount - left + b.lines[purpose] * 0.15;
            b.lines[purpose] += extra;
            b.supplements += extra;
            if (!b.noted[purpose]) { b.noted[purpose] = true; log('state', 'ملحق موازنة: اعتماد ' + BUDGET_LINES[purpose] + ' زاد ' + VQ.ar(Math.round(extra)) + ' درهم لأنه ما كفى.', []); }
          }
        }
      }
      const paid = Math.min(amount, Math.max(0, s.treasury));
      if (b && b.lines[purpose] != null) b.spent[purpose] = (b.spent[purpose] || 0) + paid;
      s.treasury -= paid;
      s.gov.fin[purpose] = (s.gov.fin[purpose] || 0) + paid;
      return paid;
    }

    // الموظف يقبض من صندوق المحل إذا له مالك، وإلا من خزينة الدولة. والضريبة تنخصم من المصدر.
    function payWage(p, share) {
      const gross = p.job.wage * (1 + p.skill / 200) * share * Wx();
      const shop = s.biz[p.job.place];
      const firm = p.job.place === 'firm' ? s.firms[p.job.firm] : null;
      const boss = firm && s.people[firm.owner];
      let paid;
      if (p.job.place === 'firm') {
        // صاحب البسطة أو المحل يدفع من جيبه
        if (!boss) return false;
        paid = Math.min(gross, Math.max(0, boss.money));
        boss.money -= paid;
        if (paid < gross * 0.5) {
          log('firm', p.name + (p.gender === 'f' ? ' تركت' : ' ترك') + ' الشغل عند ' + boss.name + ' لأنه ما دفع الراتب.', [p.id, boss.id]);
          p.job = null;
          return paid > 0;
        }
      } else if (shop && shop.owner) {
        shop.till -= gross;
        paid = gross;
      } else {
        paid = spendTreasury(gross, 'salaries');
        if (paid < gross && !s.gov.arrears) {
          s.gov.arrears = true;
          log('state', 'الخزينة ما تكفي الرواتب. موظفون ما قبضوا كامل أجرهم.', []);
        }
      }
      if (paid <= 0) return false;
      const tax = gross > 30 * Wx() ? paid * taxRate() : 0;
      // اشتراك التقاعد: نصيب الموظف ينخصم من راتبه، ونصيب صاحب العمل عليه
      const rates = pensionRates();
      const mine = paid * rates.employee;
      let bossShare = paid * rates.employer;
      if (firm && boss) boss.money -= bossShare;
      else if (shop && shop.owner) shop.till -= bossShare;
      else bossShare = spendTreasury(bossShare, 'pension');
      s.pension.fund += mine + bossShare;
      s.pension.inYear += mine + bossShare;
      if (share >= 1) { p.service += 1; p.wageSum += gross; }
      p.money += paid - tax - mine;
      addTreasury(tax, 'tax');
      return true;
    }
    const branchLevel = (id) => s.gov.branches[id].level;
    const taxRate = () => s.gov.tax * (0.8 + 0.1 * branchLevel('finance'));

    function worthOf(p) {
      let worth = p.money - (p.loan || 0);
      for (const b of Object.values(s.biz)) if (b.owner === p.id) worth += b.price;
      for (const pal of Object.values(s.palaces)) if (pal.owner === p.id) worth += palaceCost() * 0.7;
      for (const f of Object.values(s.firms)) if (f.owner === p.id) worth += f.capital * f.level * 0.8;
      for (const co of bourseState().companies) if (co.holders[p.id] && !(co.firm && s.firms[co.firm] && s.firms[co.firm].owner === p.id)) worth += co.holders[p.id] * co.price;
      return worth;
    }
    function classOf(p) {
      const gov = s.gov;
      if (gov.ruler && (p.id === gov.ruler || p.spouse === gov.ruler || p.father === gov.ruler || p.mother === gov.ruler)) return { id: 'ruling', name: 'الأسرة الحاكمة' };
      let worth = worthOf(p);
      for (const id of [p.spouse, ageOf(p) < C.ADULT_AGE ? p.father : null, ageOf(p) < C.ADULT_AGE ? p.mother : null]) {
        const o = id && s.people[id];
        if (o) worth = Math.max(worth, worthOf(o));
      }
      const lines = s.gov.classLines || [];
      let found = VQ.CLASSES[0];
      VQ.CLASSES.forEach((c, i) => { if (worth >= Math.max(c.min, lines[i] || -Infinity)) found = c; });
      return found;
    }
    // حدود الطبقات تمشي مع ثروة البلد، عشان يبقى فيها فقير وغني مهما كبر الاقتصاد
    function updateClassLines() {
      const worths = alive().filter((p) => ageOf(p) >= C.ADULT_AGE).map(worthOf).sort((a, b) => a - b);
      s.gov.classLines = VQ.CLASSES.map((c) => (worths.length ? worths[Math.min(worths.length - 1, Math.floor(c.pct * worths.length))] : -Infinity));
    }

    // ---- مواقع البناء ----
    function activeSites() {
      const list = [];
      const pr = s.gov.project;
      if (pr) list.push({ id: 'project', place: VQ.BRANCHES[pr.branch].place });
      for (const b of world.palaces) {
        const pal = s.palaces[b.id];
        if (pal.started && !pal.built) list.push({ id: b.id, place: b.id });
      }
      return list;
    }
    function addWork(id, minutes) {
      const speed = 1 + 0.25 * branchLevel('works');
      if (id === 'project') {
        const pr = s.gov.project;
        if (!pr) return false;
        // كل دقيقة شغل لها كلفتها. إذا الخزينة تحت الاحتياطي يوقف البناء لين يجي تمويل
        const step = minutes * speed;
        const owe = (pr.cost * (1 - C.DOWN_PAYMENT) * step) / pr.work;
        if (pr.paid !== undefined) {
          const overBudget = budgetLeft('projects') < owe;
          if (s.treasury - owe < C.BUILD_RESERVE * 0.5 || overBudget) {
            if (!pr.paused) {
              pr.paused = true;
              log('state', 'توقف البناء في ' + world.places[VQ.BRANCHES[pr.branch].place].name + (overBudget ? ' لأن اعتماد المشاريع في الموازنة خلص.' : ' لين يجي تمويل.'), []);
            }
            return false;
          }
          if (pr.paused) {
            pr.paused = false;
            log('state', 'رجع البناء في ' + world.places[VQ.BRANCHES[pr.branch].place].name + ' بعد ما توفر التمويل.', []);
          }
          pr.paid += spendTreasury(owe, 'projects');
        }
        pr.done += step;
        if (pr.done >= pr.work) finishProject();
        return true;
      }
      const pal = s.palaces[id];
      if (!pal || pal.built) return false;
      pal.done += minutes * speed;
      if (pal.done >= pal.work) finishPalace(id);
      return true;
    }
    function finishProject() {
      const gov = s.gov;
      const pr = gov.project;
      gov.project = null;
      const br = VQ.BRANCHES[pr.branch];
      gov.branches[pr.branch].level = pr.level;
      s.stats.built++;
      const placeName = world.places[br.place].name;
      log('state', pr.level === 1 ? 'اكتمل بناء ' + placeName + ' وفتح فرع ' + br.name + ' أبوابه.' : 'تطور فرع ' + br.name + ' إلى المستوى ' + VQ.ar(pr.level) + '.', []);
      emit('built', { branch: pr.branch, level: pr.level });
      updateEra();
    }
    function totalLevels() {
      return VQ.BRANCH_IDS.reduce((sum, id) => sum + branchLevel(id), 0);
    }
    function updateEra() {
      let era = 0;
      VQ.ERAS.forEach((e, i) => { if (totalLevels() >= e.min) era = i; });
      if (era > s.gov.era) {
        s.gov.era = era;
        log('state', 'صارت بلدتنا ' + VQ.ERAS[era].name + '! عصر جديد في تاريخها.', []);
      }
    }
    function moveFamily(p, home) {
      const old = p.home;
      const family = [p];
      const sp = p.spouse && s.people[p.spouse];
      if (sp) family.push(sp);
      for (const id of p.children) {
        const k = s.people[id];
        if (k && ageOf(k) < C.ADULT_AGE) family.push(k);
      }
      for (const m of family) m.home = home;
      if (old && old !== home && !residents(old).length) {
        s.houses[home].pantry.water += s.houses[old].pantry.water;
        s.houses[home].pantry.food += s.houses[old].pantry.food;
        s.houses[old].pantry = { water: 0, food: 0 };
      }
    }
    function finishPalace(id) {
      const pal = s.palaces[id];
      pal.built = true;
      s.stats.palaces++;
      const owner = s.people[pal.owner];
      const name = world.places[id].name;
      if (owner) {
        moveFamily(owner, id);
        log('wealth', 'اكتمل بناء ' + name + '، و' + owner.name + (owner.gender === 'f' ? ' انتقلت له مع أهلها.' : ' انتقل له مع أهله.'), [owner.id]);
      } else {
        log('wealth', 'اكتمل بناء ' + name + '.', []);
      }
      emit('built', { palace: id });
    }

    // ---- الاستثمار: شراء محل، توسعته، قصر، أو قرض ----
    function freePalace() {
      return world.palaces.find((b) => !b.royal && !s.palaces[b.id].owner);
    }
    function investOption(p) {
      const big = bigInvest(p);
      if (big && big.type === 'palace') return big;
      const firm = firmOption(p);
      if (big && firm) return r() < 0.5 ? big : firm;
      return big || firm;
    }
    function firmOption(p) {
      const age = ageOf(p);
      if (age < C.ADULT_AGE || age >= 70 || p.jailUntil) return null;
      const mine = Object.values(s.firms).filter((f) => f.owner === p.id);
      if (mine.length >= C.MAX_FIRMS || (mine.length && p.money < 3000)) return null; // الثاني بس للميسور
      const pop = alive().length;
      const options = VQ.FIRM_IDS.filter((id) => {
        const f = VQ.FIRMS[id];
        if (!freeSpot(f.tier)) return false; // ما في مكان فاضي
        if (p.money < (f.capital + f.fee) * (law('property') ? 1.7 : 2) * P() + 60) return false; // يخلي له مصروف بعد ما يفتح
        // منع الاحتكار: محل واحد بس لكل تاجر
        if (law('commerce') && f.tier === 'shop' && mine.some((m) => VQ.FIRMS[m.type].tier === 'shop')) return false;
        if (mine.some((m) => m.type === id)) return false;
        // السوق ما يتحمل إلا عدد معين من كل نشاط حسب عدد السكان
        const room = Math.max(1, Math.round(pop / ({ stall: 15, home: 25, shop: 40 }[f.tier])));
        if (Object.values(s.firms).filter((x) => x.type === id).length >= room) return false;
        if (f.tier === 'stall' && p.money > 3000) return false; // الغني ما يفتح بسطة
        return true;
      });
      if (!options.length) return null;
      // ياخذ أكبر شي يقدر عليه، ويتجنب النشاط المزحوم
      const scored = options.map((id) => {
        const rivals = Object.values(s.firms).filter((x) => x.type === id).length;
        return [VQ.FIRMS[id].capital * (0.5 + r()) / (1 + rivals * 1.5), id];
      }).sort((a, b) => b[0] - a[0]);
      return { type: 'firm', id: scored[0][1] };
    }
    function bigInvest(p) {
      const owned = world.palaces.some((b) => s.palaces[b.id].owner === p.id);
      const plot = freePalace();
      if (!owned && plot && p.money >= palaceCost() * 1.15 && ageOf(p) >= 25) return { type: 'palace', id: plot.id };
      const shops = Object.keys(s.biz);
      const mine = shops.find((id) => s.biz[id].owner === p.id && s.biz[id].level < 3 && p.money >= C.UPGRADE_PRICE * s.biz[id].level * 1.2);
      if (mine) return { type: 'upgrade', id: mine };
      const forSale = shops.filter((id) => !s.biz[id].owner);
      if (forSale.length && shops.filter((id) => s.biz[id].owner === p.id).length < C.MAX_SHOPS) {
        const shop = pick(r, forSale);
        if (p.money >= s.biz[shop].price * 1.15) return { type: 'buy', id: shop };
        // القرض من المصرف للي عنده مهارة ودفعة أولى
        const down = s.biz[shop].price * 0.3;
        if (branchLevel('bank') && !p.loan && !p.defaulted && p.skill >= 35 && p.money >= down && s.treasury > s.biz[shop].price + C.BUILD_RESERVE * 2 && totalLoans() + s.biz[shop].price <= creditCeiling()) return { type: 'loan', id: shop };
      }
      return null;
    }
    function doInvest(p) {
      const opt = investOption(p);
      if (!opt) return;
      if (opt.type === 'firm') { openFirm(p, opt.id); return; }
      if (opt.type === 'palace') {
        const pal = s.palaces[opt.id];
        const name = world.places[opt.id].name;
        // القصر الجاهز أرخص من بناء قصر جديد
        const price = pal.built ? palaceCost() * 0.6 : palaceCost();
        p.money -= price;
        addTreasury(price * 0.25, 'other');
        pal.owner = p.id;
        if (pal.built) {
          moveFamily(p, opt.id);
          log('wealth', p.name + (p.gender === 'f' ? ' اشترت ' : ' اشترى ') + name + ' وسكنه.', [p.id]);
        } else {
          pal.started = true;
          log('wealth', p.name + (p.gender === 'f' ? ' بدأت' : ' بدأ') + ' يبني ' + name + ' بـ' + VQ.ar(Math.round(price)) + ' درهم.', [p.id]);
        }
        return;
      }
      const shop = s.biz[opt.id];
      const shopName = world.places[opt.id].name;
      if (opt.type === 'upgrade') {
        const price = C.UPGRADE_PRICE * shop.level;
        p.money -= price;
        addTreasury(price * 0.3, 'other');
        shop.level++;
        shop.price += price * 0.7;
        log('biz', p.name + (p.gender === 'f' ? ' وسّعت ' : ' وسّع ') + shopName + ' وصار مستواه ' + VQ.ar(shop.level) + '.', [p.id]);
        return;
      }
      if (opt.type === 'loan') {
        const need = shop.price - p.money;
        const given = spendTreasury(need, 'loans');
        if (given < need) return;
        p.money += given;
        p.loan = given;
        log('biz', 'المصرف أعطى ' + p.name + ' قرض ' + VQ.ar(Math.round(given)) + ' درهم.', [p.id]);
      }
      p.money -= shop.price;
      addTreasury(shop.price, 'other');
      shop.owner = p.id;
      shop.till = 0;
      log('biz', p.name + (p.gender === 'f' ? ' اشترت ' : ' اشترى ') + shopName + ' من الدولة بـ' + VQ.ar(Math.round(shop.price)) + ' درهم.', [p.id]);
    }

    // ---- التعليم ----
    function stageOpen(n) {
      const st = VQ.STAGES[n];
      return !!st && branchLevel(st.need[0]) >= st.need[1];
    }
    const stageFor = (age) => VQ.STAGES.findIndex((st) => st && age >= st.from && age < st.to + 1);
    // أعلى شهادة ممكن تنطلب: ما نطلب جامعي إذا البلد ما فيها جامعة
    function eduCap() {
      let cap = 0;
      for (let n = 1; n <= 4 && stageOpen(n); n++) cap = n;
      return Math.max(1, cap);
    }
    const needEdu = (want) => Math.min(want || 0, eduCap());
    function educationDay(p, age) {
      if (p.edu == null) p.edu = startEdu(p);
      p.eligible = p.eligible || {};
      p.studied = p.studied || {};
      const stage = stageFor(age);
      if (stage > 0 && stage < 4 && stageOpen(stage) && p.edu === stage - 1) p.eligible[stage] = (p.eligible[stage] || 0) + 1;
      if (stage === 4 && p.student) p.eligible[4] = (p.eligible[4] || 0) + 1;
      // التخرج من المرحلة لما يعدي عمرها
      for (let n = 1; n <= 4; n++) {
        const st = VQ.STAGES[n];
        if (age < st.to + 1 || p.edu !== n - 1 || !p.eligible[n]) continue;
        const rate = (p.studied[n] || 0) / p.eligible[n];
        p.eligible[n] = 0;
        if (n === 4) p.student = false;
        if (rate < C.ATTEND_NEEDED) {
          if (n >= 3) log('edu', p.name + (p.gender === 'f' ? ' ما نجحت' : ' ما نجح') + ' في ' + st.name + ' لأن حضوره كان قليل.', [p.id]);
          continue;
        }
        p.edu = n;
        if (n === 4) p.skill = Math.min(100, p.skill + 10);
        const word = n === 4 ? (p.gender === 'f' ? ' تخرجت من الجامعة' : ' تخرج من الجامعة') : (p.gender === 'f' ? ' خلّصت ' : ' خلّص ') + st.name;
        log(n >= 3 ? 'edu' : 'minor', p.name + word + '.', [p.id]);
      }
      // القبول في الجامعة بعد الثانوي
      if (!p.student && p.edu === 3 && age >= C.ADULT_AGE && age < 20 && !p.job && stageOpen(4) && !p.uniTried) {
        p.uniTried = true;
        if (p.skill >= 25 && r() < 0.7) {
          p.student = true;
          p.eligible[4] = 0;
          p.studied[4] = 0;
          // بعد ما تنبني هيئة التعدين، بعض الطلبة يتخصصون جيولوجيا وتعدين
          p.major = branchLevel('mining') && r() < 0.4 ? 'geology' : null;
          log('edu', p.name + (p.gender === 'f' ? ' انقبلت' : ' انقبل') + ' في الجامعة' + (p.major === 'geology' ? ' تخصص جيولوجيا وتعدين.' : '.'), [p.id]);
        }
      }
    }

    // ---- السجل التجاري ----
    // وين ينحط النشاط: البسطة في الساحة، والمحل على أرض تجارية، والمنزلي في البيت
    function firmAt(kind, key) {
      return Object.values(s.firms).find((f) => f[kind] === key) || null;
    }
    function freeSpot(tier) {
      if (tier === 'stall') {
        const i = world.stallSlots.findIndex((_, n) => !firmAt('slot', n));
        return i < 0 ? null : { slot: i };
      }
      if (tier === 'shop') {
        const lot = world.lots.find((b) => !firmAt('lot', b.id));
        return lot ? { lot: lot.id } : null;
      }
      return {};
    }
    const firmName = (f) => VQ.FIRMS[f.type].name + ' ' + (s.people[f.owner] ? s.people[f.owner].name : '');
    function openFirm(p, type) {
      const def = VQ.FIRMS[type];
      const capital = def.capital * P();
      const fee = def.fee * P();
      const cost = capital + fee;
      const spot = freeSpot(def.tier);
      if (p.money < cost || !spot) return;
      p.money -= cost;
      addTreasury(fee, 'fees');
      addTreasury(capital * 0.6, 'sales'); // البضاعة والعدة من تجار الجملة، والباقي من برا
      cbState().flowOut += capital * 0.2;
      const id = s.nextFirm++;
      s.firms[id] = Object.assign({ id, type, owner: p.id, cr: 1000 + id, opened: s.day, openedAt: absMinute(), capital, level: 1, losses: 0, lastProfit: 0, yearProfit: 0, sold: 0 }, spot);
      if (spot.lot) emit('built', { lot: spot.lot });
      log('firm', p.name + (p.gender === 'f' ? ' طلّعت' : ' طلّع') + ' سجل تجاري رقم ' + VQ.ar(1000 + id) + (p.gender === 'f' ? ' وفتحت ' : ' وفتح ') + def.name + ' برأس مال ' + VQ.ar(Math.round(capital)) + ' درهم' + (spot.lot ? ' في ' + world.places[spot.lot].name : spot.slot != null ? ' في الساحة' : ' من ' + (world.places[p.home] ? world.places[p.home].name : 'البيت')) + '.', [p.id]);
    }
    function fireStaff(f, why) {
      for (const p of alive()) {
        if (!p.job || p.job.place !== 'firm' || p.job.firm !== f.id) continue;
        p.job = null;
        log('firm', p.name + (p.gender === 'f' ? ' انفصلت' : ' انفصل') + ' من شغله في ' + VQ.FIRMS[f.type].name + ' ' + why + '.', [p.id]);
      }
    }
    function closeFirm(f, why) {
      const co = bourseState().companies.find((c) => c.firm === f.id);
      if (co) delist(co, 'تسكّرت الشركة، والمساهمين خسروا أسهمهم');
      fireStaff(f, 'لأنه تسكّر');
      const owner = s.people[f.owner];
      const def = VQ.FIRMS[f.type];
      delete s.firms[f.id];
      if (owner && why !== 'bankrupt') owner.money += f.capital * f.level * 0.3; // يبيع العدة
      else if (owner && law('commerce')) owner.money += f.capital * f.level * 0.15; // قانون الإفلاس يحمي جزء
      const text = { bankrupt: ' أفلس وتسكّر', loss: ' تسكّر بعد خساير متواصلة', renewal: ' تسكّر لأن صاحبه ما جدد السجل', heir: ' تسكّر لأن صاحبه توفى بدون وريث' }[why] || ' تسكّر';
      log('firm', def.name + (owner ? ' حق ' + owner.name : '') + text + '.', owner ? [owner.id] : []);
    }
    function firmsDay(newYear) {
      const people = alive();
      const era = s.gov.era;
      for (const f of Object.values(s.firms)) {
        const def = VQ.FIRMS[f.type];
        const owner = s.people[f.owner];
        if (!owner) { closeFirm(f, 'heir'); continue; }
        if (f.slot == null && f.lot == null && def.tier !== 'home') Object.assign(f, freeSpot(def.tier) || {}); // حفظ قديم
        if (newYear) {
          const renew = def.fee * 0.3 * P();
          if (owner.money < renew) { closeFirm(f, 'renewal'); continue; }
          owner.money -= renew;
          addTreasury(renew, 'fees');
          f.profitHist = (f.profitHist || []).concat([f.yearProfit]).slice(-4);
          f.lastYearProfit = f.yearProfit;
          f.yearProfit = 0;
        }
        const rivals = Object.values(s.firms).filter((x) => x.type === f.type).length;
        // البسطة اللي ما وقف فيها صاحبها أمس تبيع أقل بواجد
        const tended = def.tier === 'home' ? !owner.jailUntil : f.tended >= s.day - 1;
        const appeal = (1 + owner.skill / 150) * (1 + 0.3 * (f.level - 1)) / Math.sqrt(rivals) * (tended ? 1 : 0.4) * (law('property') ? 1.1 : 1);
        const price = half((def.need.food ? def.price * (0.5 + 0.5 * priceMult('food')) : def.price) * P());
        const pool = people.filter((c) => c.id !== owner.id && !c.jailUntil && c.money > price * (def.rich ? 12 : 3) && ageOf(c) >= (def.kids ? 6 : 12))
          .map((c) => [r(), c]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
        let sold = 0;
        let revenue = f.tourist || 0; // اللي صرفوه السياح أمس
        f.tourist = 0;
        for (const c of pool) {
          if (sold >= def.cap * f.level) break;
          if (r() >= def.demand * appeal) continue;
          const vatPart = price * (s.gov.vat || 0);
          c.money -= price + vatPart;
          if (vatPart) addTreasury(vatPart, 'vat');
          revenue += price;
          sold++;
          for (const k of Object.keys(def.need)) {
            if (k === 'health') c.health = clamp(c.health + def.need[k], 0, 100);
            else c.needs[k] = clamp(c.needs[k] + def.need[k], 0, 100);
          }
        }
        // الغش التجاري: بدون قانون يمر، ومع القانون التفتيش يكشفه
        if (sold && r() < 0.03) {
          if (law('consumer')) {
            const fine = f.capital * 0.1;
            owner.money -= fine;
            addTreasury(fine, 'fees');
            log('firm', 'تفتيش حماية المستهلك غرّم ' + def.name + ' حق ' + owner.name + ' ' + VQ.ar(Math.round(fine)) + ' درهم على غش في البضاعة.', [owner.id]);
          } else {
            revenue *= 1.2;
            for (const c of pool.slice(0, sold)) c.health = Math.max(0, c.health - 3);
          }
        }
        // المحلات الكبيرة تبيع للقوافل والزوار، وعليها جمارك
        const trade = def.trade ? def.trade * f.level * (1 + 0.15 * era) * (0.6 + 0.8 * r()) : 0;
        const duty = trade * C.CUSTOMS;
        const cogs = revenue * def.cogs + trade * 0.4;
        cbState().flowOut += cogs * 0.2; // جزء من البضاعة مستورد
        cbState().flowIn += trade - duty;
        const tier = VQ.FIRM_TIERS[def.tier];
        const rent = tier.rent < 1 ? f.capital * f.level * tier.rent : tier.rent * P();
        addTreasury(cogs * 0.6, 'sales');
        addTreasury(duty, 'caravans');
        addTreasury(rent, 'fees');
        let net = revenue + trade - cogs - duty - rent;
        if (net > 0) {
          const tax = net * taxRate();
          addTreasury(tax, 'tax');
          net -= tax;
          // صاحب العمل الحر يشترك في التقاعد من ربحه، وتنحسب له خدمة إذا ما عنده وظيفة
          const share = net * pensionRates().self;
          net -= share;
          s.pension.fund += share;
          s.pension.inYear += share;
          if (!owner.job && owner.paidDay !== s.day) { owner.service += 1; owner.wageSum += Math.min(120, net + share); owner.paidDay = s.day; }
        }
        owner.money += net;
        f.lastProfit = net;
        f.yearProfit += net;
        f.sold += sold;
        f.losses = net < 0 ? f.losses + 1 : Math.max(0, f.losses - 1);
        // إذا الخساير تتكرر، يستغني عن موظف
        if (f.losses >= 3) {
          const worker = alive().find((w) => w.job && w.job.place === 'firm' && w.job.firm === f.id);
          if (worker && law('labor')) { const pay = Math.min(Math.max(0, owner.money), worker.job.wage * 5 * Wx()); owner.money -= pay; worker.money += pay; }
          if (worker) { worker.job = null; log('firm', owner.name + (owner.gender === 'f' ? ' استغنت عن ' : ' استغنى عن ') + worker.name + ' في ' + def.name + ' بسبب الخساير.', [owner.id, worker.id]); }
        }
        if (owner.money < 0) { owner.money = 0; closeFirm(f, 'bankrupt'); }
        else if (f.losses >= 6) closeFirm(f, 'loss');
        else if (f.level < 3 && f.yearProfit > f.capital * 0.6 && owner.money > f.capital * f.level * 1.6) {
          const cost = f.capital * f.level;
          owner.money -= cost;
          addTreasury(cost * 0.6, 'sales');
          f.level++;
          f.yearProfit = 0;
          log('firm', owner.name + (owner.gender === 'f' ? ' وسّعت ' : ' وسّع ') + def.name + ' وصار مستواه ' + VQ.ar(f.level) + '.', [owner.id]);
        }
      }
    }

    // ---- المحكمة ----
    function judge() {
      return alive().find((p) => p.job && p.job.place === 'court' && p.job.title === 'قاضي' && !p.illness);
    }
    function fileCase(c) {
      c.id = s.court.next++;
      c.day = s.day;
      s.court.cases.push(c);
      return c;
    }
    // مشاكل بين الناس: ديون، جيرة، خلاف تجاري
    function disputesDay() {
      if (r() > C.DISPUTE_CHANCE) return;
      const adults = alive().filter((p) => ageOf(p) >= C.ADULT_AGE && !p.jailUntil);
      if (adults.length < 4) return;
      const a = pick(r, adults);
      const others = adults.filter((o) => o !== a && o.home !== a.home);
      if (!others.length) return;
      const b = pick(r, others);
      const kinds = [
        { what: 'دين ما انرد', amount: 20 + Math.floor(r() * 120) },
        { what: 'خلاف جيرة', amount: 10 + Math.floor(r() * 40) },
      ];
      const myFirm = Object.values(s.firms).find((f) => f.owner === a.id);
      if (myFirm) kinds.push({ what: 'خلاف تجاري على ' + VQ.FIRMS[myFirm.type].name, amount: 40 + Math.floor(r() * 160) });
      const k = pick(r, kinds);
      a.known[b.id] = (a.known[b.id] || 0) - 20;
      b.known[a.id] = (b.known[a.id] || 0) - 20;
      // الحقيقة ما يعرفها إلا الطرفين. القاضي يحاول يوصل لها
      fileCase({ kind: 'dispute', plaintiff: a.id, defendant: b.id, what: k.what, amount: k.amount, truth: r() < 0.6 });
      log('court', a.name + (a.gender === 'f' ? ' رفعت' : ' رفع') + ' قضية على ' + b.name + ': ' + k.what + ' بـ' + VQ.ar(k.amount) + ' درهم.', [a.id, b.id]);
    }
    function courtDay() {
      const court = s.court;
      // الشرطة تحقق في السرقات اللي ما انعرف سارقها
      for (const c of court.cases) {
        if (c.kind === 'unsolved' && r() < 0.12 * branchLevel('security')) {
          c.kind = 'theft';
          const thief = s.people[c.defendant];
          if (thief && !thief.jailUntil) thief.jailUntil = absMinute() + 24 * 60;
          log('crime', 'الشرطة توصلت لسارق ' + (s.people[c.plaintiff] ? s.people[c.plaintiff].name : '') + ' وحولته للمحكمة.', [c.defendant]);
        }
      }
      // القضايا القديمة اللي طرفها مات أو هاجر تنشطب
      court.cases = court.cases.filter((c) => s.people[c.defendant] && (c.kind === 'theft' || s.people[c.plaintiff]) && s.day - c.day < 12);
      const j = judge();
      const ready = court.cases.filter((c) => c.kind !== 'unsolved');
      if (!j || !branchLevel('court')) {
        if (ready.length >= 5 && !court.warned) {
          court.warned = true;
          log('state', 'القضايا متكدسة في المحكمة: ' + VQ.ar(ready.length) + ' قضية بدون قاضي.', []);
        }
        return;
      }
      court.warned = false;
      const clerk = alive().some((p) => p.job && p.job.place === 'court' && p.job.title !== 'قاضي');
      let capacity = 1 + branchLevel('court') + (clerk ? 1 : 0);
      for (const c of ready.slice()) {
        if (capacity-- <= 0) break;
        court.cases.splice(court.cases.indexOf(c), 1);
        court.closed++;
        const accused = s.people[c.defendant];
        const victim = s.people[c.plaintiff];
        // دقة الحكم من مهارة القاضي ومستوى المحكمة، وقضايا السرقة فيها دليل
        const accuracy = Math.min(0.97, 0.6 + j.skill / 250 + 0.05 * branchLevel('court') + (c.kind === 'theft' ? 0.2 : 0) + (law('procedure') ? 0.08 : 0));
        const correct = r() < accuracy;
        const guilty = correct ? c.truth : !c.truth;
        if (!correct) court.wrong++;
        if (c.kind === 'theft') {
          if (guilty) {
            const back = Math.min(accused.money, c.amount);
            accused.money -= back;
            if (victim) victim.money += back;
            const fine = Math.min(accused.money, c.amount * (1 + branchLevel('court')));
            accused.money -= fine;
            addTreasury(fine, 'fees');
            accused.penalty += 1.2;
            accused.jailUntil = absMinute() + 480 + branchLevel('court') * 240;
            const judgeWord = j.gender === 'f' ? 'القاضية ' + j.name + ' حكمت' : 'القاضي ' + j.name + ' حكم';
            const parts = [];
            if (fine >= 1) parts.push('غرامة ' + VQ.ar(Math.round(fine)) + ' درهم');
            if (back >= 1) parts.push('رجّع ' + VQ.ar(Math.round(back)) + ' درهم ' + (victim ? 'لـ' + victim.name : 'للمسروق'));
            log('court', judgeWord + ' على ' + accused.name + ' بالسجن في سرقة' + (parts.length ? '، مع ' + parts.join(' و') : '، وما عنده فلوس يرجّعها') + '.', [accused.id, j.id]);
          } else {
            accused.jailUntil = 0;
            log('court', (j.gender === 'f' ? 'القاضية ' + j.name + ' برّأت ' : 'القاضي ' + j.name + ' برّأ ') + accused.name + ' من تهمة السرقة لعدم كفاية الأدلة.', [accused.id, j.id]);
          }
          continue;
        }
        const winner = guilty ? victim : accused;
        const loser = guilty ? accused : victim;
        const pay = guilty ? Math.min(accused.money, c.amount) : 0;
        accused.money -= pay;
        victim.money += pay;
        const fee = Math.min(loser.money, 10);
        loser.money -= fee;
        addTreasury(fee, 'fees');
        log('court', 'المحكمة حكمت لـ' + winner.name + ' في قضية ' + c.what + (pay ? '، و' + accused.name + (accused.gender === 'f' ? ' تدفع ' : ' يدفع ') + VQ.ar(Math.round(pay)) + ' درهم.' : guilty ? '، بس ما عنده فلوس يدفعها.' : '، ورُفضت الدعوى.'), [c.plaintiff, c.defendant]);
      }
    }

    // ---- المطار ----
    const DESTS = ['لدبي', 'للقاهرة', 'لإسطنبول', 'للندن', 'لبانكوك', 'لمسقط', 'لجدة', 'لكوالالمبور'];
    function startTrip(p, t) {
      p.tripPlanned = false;
      const cost = (C.TRIP_COST[0] + r() * (C.TRIP_COST[1] - C.TRIP_COST[0])) * fxFactor() * Math.max(1, P() * 0.5);
      if (p.money < cost) { t.dur = 0; return; }
      p.money -= cost;
      addTreasury(cost * 0.15, 'airport'); // رسوم وتذاكر الطيران الوطني، والباقي يطلع برا
      cbState().flowOut += cost * 0.85;
      t.paid = true;
      t.dest = pick(r, DESTS);
      s.airport.trips++;
      s.airport.yearTrips++;
      log('travel', p.name + (p.gender === 'f' ? ' سافرت ' : ' سافر ') + t.dest + ' من المطار.', [p.id]);
    }
    function airportDay(newYear) {
      const ap = s.airport;
      if (newYear) { ap.lastTourists = ap.yearTourists; ap.lastTrips = ap.yearTrips; ap.lastSpent = ap.spent; ap.yearTourists = 0; ap.yearTrips = 0; ap.spent = 0; }
      const lvl = branchLevel('airport');
      if (!lvl) return;
      // بدون مراقب جوي ما في رحلات
      const tower = alive().some((p) => p.job && p.job.place === 'airport' && (p.job.title === 'مراقب جوي' || p.job.title === 'مدير المطار'));
      if (!tower) return;
      const firms = Object.values(s.firms).filter((f) => VQ.FIRMS[f.type].tier !== 'home');
      const shops = firms.filter((f) => VQ.FIRMS[f.type].tier === 'shop').length;
      const builtPalaces = Object.values(s.palaces).filter((x) => x.built).length;
      const attract = (1 + 0.06 * shops + 0.02 * (firms.length - shops) + 0.04 * builtPalaces) / Math.max(0.8, (priceMult('food') + priceMult('water')) / 2);
      const n = Math.round(lvl * (1.5 + 0.8 * s.gov.era) * (0.5 + r()) * attract);
      const eat = ['restaurant', 'cafe', 'arcade'].filter((id) => s.biz[id]);
      let spent = 0;
      for (let i = 0; i < n; i++) {
        const cash = (C.TOURIST_SPEND[0] + r() * (C.TOURIST_SPEND[1] - C.TOURIST_SPEND[0])) * fxFactor();
        addTreasury(C.TOURIST_FEE, 'airport');
        // أكل وقهوة، تسوق من المحلات والبسطات، ومواصلات
        if (eat.length) s.biz[pick(r, eat)].till += cash * 0.35;
        // محلات المطار والسوق الحرة تاخذ نصيبها قبل ما يطلع السايح للبلد
        addTreasury(cash * C.AIRPORT_SHOPS, 'airport');
        const out = 0.5 - C.AIRPORT_SHOPS;
        if (firms.length) { const f = pick(r, firms); f.tourist = (f.tourist || 0) + cash * out; } else addTreasury(cash * out, 'sales');
        addTreasury(cash * 0.15, 'sales');
        spent += cash;
      }
      market().food = Math.max(0, market().food - n); // السياح ياكلون من السوق
      ap.tourists = n;
      ap.yearTourists += n;
      ap.spent += spent;
      cbState().flowIn += spent;
      if (n && !ap.first) { ap.first = true; log('state', 'وصلت أول رحلة سياح للبلد: ' + VQ.ar(n) + ' سايح.', []); }
    }

    // ---- التقاعد ----
    function grantPension(p) {
      const years = p.service / C.DAYS_PER_YEAR;
      if (years < 2) return;
      const avg = p.wageSum / Math.max(1, p.service);
      p.pension = Math.max(C.PENSION_MIN, avg * Math.min(C.PENSION_MAX, years * C.PENSION_PER_YEAR));
      log('pension', p.name + (p.gender === 'f' ? ' تقاعدت' : ' تقاعد') + ' بعد ' + VQ.ar(Math.round(years)) + ' سنة خدمة' + (p.gender === 'f' ? '، ومعاشها ' : '، ومعاشه ') + VQ.ar(Math.round(p.pension)) + ' درهم باليوم.', [p.id]);
    }
    function payPension(p, amount) {
      const pen = s.pension;
      const fromFund = Math.min(amount, Math.max(0, pen.fund));
      pen.fund -= fromFund;
      pen.outYear += fromFund;
      let paid = fromFund;
      if (fromFund < amount) {
        paid += spendTreasury(amount - fromFund, 'pension');
        if (!pen.deficit) { pen.deficit = true; log('state', 'صندوق التقاعد ما يكفي، والدولة تسد العجز من الخزينة.', []); }
      }
      p.money += paid;
    }
    // النسب تزيد إذا الصندوق صرف أكثر من اللي دخله، وتنزل إذا مرتاح
    function pensionRates() {
      const bump = s.pension.bump || 0;
      return { employee: C.PENSION_EMPLOYEE + bump * 0.5, employer: C.PENSION_EMPLOYER + bump, self: C.PENSION_EMPLOYEE * 2 + bump };
    }
    function pensionDay(newYear) {
      const pen = s.pension;
      pen.fund *= 1 + C.PENSION_RETURN;
      if (newYear) {
        const before = pen.bump || 0;
        if (pen.outYear > pen.inYear && pen.fund < pen.outYear * 5) pen.bump = Math.min(0.08, before + 0.01);
        else if (pen.fund > pen.outYear * 15 && before > 0) pen.bump = Math.max(0, before - 0.01);
        if ((pen.bump || 0) !== before) {
          const r2 = pensionRates();
          log('pension', 'صندوق التقاعد ' + (pen.bump > before ? 'رفع' : 'نزّل') + ' الاشتراك: الموظف ' + VQ.ar(Math.round(r2.employee * 100)) + '٪ وصاحب العمل ' + VQ.ar(Math.round(r2.employer * 100)) + '٪.', []);
        }
        pen.lastIn = pen.inYear;
        pen.lastOut = pen.outYear;
        pen.inYear = 0;
        pen.outYear = 0;
        if (pen.fund > 0) pen.deficit = false;
      }
    }

    // ---- الجريمة ----
    function doSteal(p) {
      const family = (o) => o.home === p.home;
      const targets = alive().filter((o) => o !== p && !family(o) && o.money > 80 && ageOf(o) >= C.ADULT_AGE);
      if (!targets.length) return;
      targets.sort((a, b) => b.money - a.money);
      const victim = targets[Math.floor(r() * r() * targets.length)];
      const amount = Math.round(Math.min(70, victim.money * 0.12));
      const security = branchLevel('security');
      const court = branchLevel('court');
      s.stats.thefts++;
      s.gov.thefts++;
      if (r() < 0.12 + 0.22 * security + 0.08 * court) {
        s.stats.caught++;
        if (security && court) {
          // الشرطة توقفه لين المحاكمة
          p.jailUntil = absMinute() + 24 * 60;
          fileCase({ kind: 'theft', plaintiff: victim.id, defendant: p.id, amount, truth: true });
          log('crime', 'الشرطة قبضت على ' + p.name + (p.gender === 'f' ? ' وهي تحاول تسرق ' : ' وهو يحاول يسرق ') + victim.name + ' وحولته للمحكمة.', [p.id, victim.id]);
        } else if (security) {
          p.penalty += 1.2;
          const fine = Math.min(p.money, amount);
          p.money -= fine;
          addTreasury(fine, 'fees');
          p.jailUntil = absMinute() + 480;
          log('crime', 'الشرطة قبضت على ' + p.name + (p.gender === 'f' ? ' وهي تحاول تسرق ' : ' وهو يحاول يسرق ') + victim.name + '.', [p.id, victim.id]);
        } else {
          p.penalty += 1.2;
          log('crime', 'الناس مسكوا ' + p.name + ' في محاولة سرقة ' + victim.name + ' ورجعوا الفلوس.', [p.id, victim.id]);
        }
      } else {
        victim.money -= amount;
        p.money += amount;
        if (security) fileCase({ kind: 'unsolved', plaintiff: victim.id, defendant: p.id, amount, truth: true });
        log('crime', 'سرقة في السوق: انسرق من ' + victim.name + ' ' + VQ.ar(amount) + ' درهم، والسارق ما انعرف.' + (security ? ' ' + (victim.gender === 'f' ? 'بلّغت' : 'بلّغ') + ' الشرطة.' : ''), [victim.id]);
      }
    }

    // ---- الحاكم والدولة ----
    function appointRuler(p, how) {
      const gov = s.gov;
      gov.ruler = p.id;
      gov.reigns++;
      p.job = { place: 'hall', slot: 0, title: 'الحاكم', wage: VQ.JOBS.hall[0].wage };
      const changed = gov.dynasty && gov.dynasty !== p.family;
      gov.dynasty = p.family;
      gov.net = gov.net ? VQ.Net.child(r, gov.net, gov.net) : VQ.Net.create(r, GOV_SENSES, 6, VQ.BRANCH_IDS.length + TAX_OUTS, GOV_PRIOR);
      const title = jobTitle(p);
      log('state', how === 'start' ? p.name + ' ' + p.family + ' ' + title + ' البلدة، وبدأ حكمه بخزينة فيها ' + VQ.ar(Math.round(s.treasury)) + ' درهم.'
        : (changed ? 'انتقل الحكم إلى ' + p.family + '. ' : '') + 'تولّى ' + p.name + ' الحكم وصار ' + title + ' رقم ' + VQ.ar(gov.reigns) + '.', [p.id]);
      if (s.palaces.palace_royal.built) moveFamily(p, 'palace_royal');
      emit('ruler', { id: p.id });
    }
    function succession(dead) {
      const adults = alive().filter((o) => ageOf(o) >= C.ADULT_AGE);
      if (!adults.length) { s.gov.ruler = null; return; }
      const kids = dead ? dead.children.map((id) => s.people[id]).filter((k) => k && ageOf(k) >= C.ADULT_AGE) : [];
      kids.sort((a, b) => ageOf(b) - ageOf(a));
      let heir = kids[0];
      if (!heir && dead && dead.spouse && s.people[dead.spouse] && ageOf(s.people[dead.spouse]) >= C.ADULT_AGE) heir = s.people[dead.spouse];
      if (!heir) heir = adults.slice().sort((a, b) => (b.skill + Math.log10(1 + Math.max(0, worthOf(b))) * 10) - (a.skill + Math.log10(1 + Math.max(0, worthOf(a))) * 10))[0];
      appointRuler(heir, 'succession');
    }
    function govSenses() {
      const people = alive();
      const adults = people.filter((p) => ageOf(p) >= C.ADULT_AGE);
      const n = Math.max(1, people.length);
      const poor = adults.filter((p) => worthOf(p) < VQ.CLASSES[1].min).length / Math.max(1, adults.length);
      return [
        Math.min(1, Math.log10(1 + Math.max(0, s.treasury)) / 5),
        people.filter((p) => p.illness).length / n,
        poor,
        Math.min(1, s.gov.thefts / 10),
        people.filter((p) => ageOf(p) < C.ADULT_AGE).length / n,
        adults.filter((p) => !p.job && ageOf(p) < C.RETIRE_AGE).length / Math.max(1, adults.length),
        people.length / C.MAX_POPULATION,
        totalLevels() / (VQ.BRANCH_IDS.length * 3),
      ];
    }
    function urgentBranch(next) {
      const ok = (id) => next.some((n) => n.id === id && n.ok);
      const people = alive();
      const ages = (a, b) => people.filter((p) => ageOf(p) >= a && ageOf(p) < b).length;
      const edu = branchLevel('education');
      if (ok('education') && ((edu < 2 && ages(12, 15) >= 3) || (edu < 3 && ages(15, 18) >= 3))) return 'education';
      if (ok('university') && people.filter((p) => p.edu >= 3 && ageOf(p) < 22).length >= 3) return 'university';
      if (ok('health') && people.filter((p) => p.illness).length / Math.max(1, people.length) > 0.15) return 'health';
      if (ok('oil')) return 'oil';
      if (ok('exchange') && s.gov.era >= 2) return 'exchange';
      if (ok('central') && (cbState().inflation > 0.06 || cbState().reserves < 0 || s.gov.era >= 2)) return 'central';
      if (ok('airport') && s.gov.era >= 2) return 'airport';
      if (ok('mining') && s.gov.era >= 1) return 'mining';
      return null;
    }
    function nextBranches() {
      const gov = s.gov;
      return VQ.BRANCH_IDS.map((id) => {
        const br = VQ.BRANCHES[id];
        const level = gov.branches[id].level + 1;
        // يبدأ بعربون، والباقي ينصرف مع تقدم الشغل، بشرط يبقى احتياطي للرواتب
        const ok = level <= 3 && (id !== 'exchange' || law('markets')) && budgetLeft('projects') >= br.cost * level * P() * C.DOWN_PAYMENT && (id !== 'oil' || oilState().found) && (!br.needs || gov.branches[br.needs].level >= (br.needsLevel || 1)) && s.treasury >= br.cost * level * P() * C.DOWN_PAYMENT + C.BUILD_RESERVE;
        return { id, level, cost: br.cost * level * P(), work: br.work * level, ok };
      });
    }
    function rulerDay(newYear) {
      const gov = s.gov;
      if (!gov.ruler || !s.people[gov.ruler]) succession(null);
      const ruler = s.people[gov.ruler];
      if (!ruler) return;
      gov.arrears = false;
      const outs = VQ.BRANCH_IDS.length + TAX_OUTS;
      if (!gov.project) {
        let next = nextBranches();
        // سندات تنمية: إذا ما في فلوس لمشروع ضروري والدين قليل
        if (!next.some((n) => n.ok) && r() < 0.15) {
          const strategic = s.budget && s.budget.strategic && next.find((n) => n.id === s.budget.strategic);
          const want = strategic || next.filter((n) => n.level <= 3 && (n.id !== 'oil' || oilState().found) && (!VQ.BRANCHES[n.id].needs || gov.branches[VQ.BRANCHES[n.id].needs].level >= (VQ.BRANCHES[n.id].needsLevel || 1))).sort((a, b) => a.cost - b.cost)[0];
          const backed = want && want.id === 'oil';
          if (want && debtTotal() < lastIncome() * (backed ? 2.3 : 1.4)) {
            const got = issueDebt(want.cost * 0.6, 5, (backed ? 'بضمان إيرادات النفط ' : '') + 'لتمويل ' + world.places[VQ.BRANCHES[want.id].place].name, backed);
            if (got && s.budget) s.budget.lines.projects += got;
            next = nextBranches();
          }
        }
        if (next.some((n) => n.ok)) {
          const mask = new Array(outs).fill(false);
          next.forEach((n, i) => { mask[i] = n.ok; });
          const trace = VQ.Net.decide(r, gov.net, govSenses(), mask);
          govTraces.push(trace);
          let pick2 = next[trace.action];
          // المستشارين: إذا فيه حاجة واضحة، الحاكم ياخذ برايهم نص المرات
          const urgent = urgentBranch(next);
          if (urgent && urgent !== pick2.id && r() < 0.5) pick2 = next.find((n) => n.id === urgent);
          const down = spendTreasury(pick2.cost * C.DOWN_PAYMENT, 'projects');
          gov.project = { branch: pick2.id, level: pick2.level, cost: pick2.cost, work: pick2.work, done: 0, paid: down };
          const br = VQ.BRANCHES[pick2.id];
          const placeName = world.places[br.place].name;
          log('state', ruler.name + (ruler.gender === 'f' ? ' أمرت ' : ' أمر ') + (pick2.level === 1 ? 'ببناء ' + placeName : 'بتطوير ' + placeName + ' للمستوى ' + VQ.ar(pick2.level)) + ' بميزانية ' + VQ.ar(pick2.cost) + ' درهم.', [ruler.id]);
          if (pick2.level === 1) emit('project', { branch: pick2.id });
        }
      }
      // القصر الملكي بعد ما يتأسس الديوان وتكون الخزينة مرتاحة
      const royal = s.palaces.palace_royal;
      if (!royal.started && s.treasury > palaceCost() * 3 && totalLevels() >= 6) {
        spendTreasury(palaceCost(), 'projects');
        royal.started = true;
        royal.owner = 'crown';
        log('state', ruler.name + (ruler.gender === 'f' ? ' أمرت' : ' أمر') + ' ببناء القصر الملكي.', [ruler.id]);
      }
      if (royal.built && ruler.home !== 'palace_royal') moveFamily(ruler, 'palace_royal');

      if (newYear) yearlyReview(ruler, outs);
    }
    function yearlyReview(ruler, outs) {
      const gov = s.gov;
      const adults = alive().filter((p) => ageOf(p) >= C.ADULT_AGE);
      const senses = govSenses();
      const score = (1 - senses[1]) + (1 - senses[2]) + (1 - senses[3]) + senses[7] * 2 + senses[0];
      if (govTraces.length) VQ.Net.learn(gov.net, govTraces, (score - gov.score) * 2, 0.05);
      govTraces = [];
      gov.score = score;

      const mask = new Array(outs).fill(false);
      for (let i = 0; i < TAX_OUTS; i++) mask[VQ.BRANCH_IDS.length + i] = true;
      // الزكاة السنوية على الثروات الكبيرة
      let zakat = 0;
      for (const p of alive()) {
        if (p.money <= C.ZAKAT_MIN) continue;
        const due = (p.money - C.ZAKAT_MIN) * C.ZAKAT;
        p.money -= due;
        zakat += due;
      }
      addTreasury(zakat, 'tax');
      const f0 = gov.fin;
      const deficit = f0.salaries + f0.projects + f0.welfare + (f0.imports || 0) + (f0.pension || 0) + (f0.loans || 0) + (f0.interest || 0) + (f0.debt || 0) > f0.tax + (f0.vat || 0) + f0.sales + f0.caravans + f0.other + (f0.fees || 0) + (f0.airport || 0) + (f0.oil || 0) + (f0.mining || 0);
      // الخفض ممنوع مع العجز، وإذا الخزينة قريبة تخلص ما في خيار إلا الرفع
      // قاعدة مالية: ما في خفض إذا الخزينة أقل من رواتب سنة، وإذا قربت تخلص لازم رفع
      const yearPay = (f0.salaries || 0) + (gov.lastFin ? gov.lastFin.salaries : 0) * 0.5;
      if ((deficit && s.treasury < 15000) || s.treasury < yearPay) mask[VQ.BRANCH_IDS.length + 2] = false;
      const freeze = deficit && s.treasury < yearPay * 0.5;
      const thaw = s.treasury > yearPay;
      if (freeze && !gov.freeze) { gov.freeze = true; log('state', ruler.name + (ruler.gender === 'f' ? ' جمّدت' : ' جمّد') + ' التوظيف في الوظايف الإدارية لين ترتاح الخزينة. الصحة والتعليم والأمن والقضاء والمزرعة مستثناة.', [ruler.id]); }
      else if (thaw && gov.freeze) { gov.freeze = false; log('state', 'رجع التوظيف الحكومي بعد ما ارتاحت الخزينة.', []); }
      if (s.treasury < 4000 && gov.tax < 0.3) { mask[VQ.BRANCH_IDS.length + 1] = false; mask[VQ.BRANCH_IDS.length + 2] = false; }
      const trace = VQ.Net.decide(r, gov.net, senses, mask);
      const choice = trace.action - VQ.BRANCH_IDS.length;
      const before = gov.tax;
      if (choice === 0) {
        // رفع الضريبة لازم يمر على مجلس الشورى
        const v = shuraVote('tax', deficit ? 0.6 : 0.3);
        if (!v || v.pass) gov.tax = Math.min(0.35, gov.tax + 0.02);
        else log('state', 'مجلس الشورى رفض رفع الضريبة (' + VQ.ar(v.yes) + ' مع و' + VQ.ar(v.no) + ' ضد).', []);
      } else if (choice === 2) gov.tax = Math.max(C.MIN_TAX, gov.tax - 0.02);
      // ضريبة القيمة المضافة: تنطرح إذا العجز مستمر والضريبة المباشرة عالية
      gov.deficits = deficit ? (gov.deficits || 0) + 1 : 0;
      if (!gov.vat && gov.deficits >= 3 && gov.tax >= 0.3) {
        const v = shuraVote('vat', 0.55);
        if (!v || v.pass) { gov.vat = C.VAT; log('state', 'بدأت ضريبة القيمة المضافة ' + VQ.ar(Math.round(C.VAT * 100)) + '٪ على المشتريات' + (v ? ' بعد موافقة مجلس الشورى (' + VQ.ar(v.yes) + ' مع).' : '.'), [ruler.id]); }
        else log('state', 'مجلس الشورى رفض ضريبة القيمة المضافة (' + VQ.ar(v.no) + ' ضد).', []);
      } else if (gov.vat && fundState().balance > lastIncome() * 3) {
        gov.vat = 0;
        log('state', 'الدولة ألغت ضريبة القيمة المضافة بعد ما ارتاحت الخزينة.', [ruler.id]);
      }
      if (gov.tax !== before) {
        log('state', ruler.name + (ruler.gender === 'f' ? ' قررت ' : ' قرر ') + (gov.tax > before ? 'رفع' : 'خفض') + ' الضريبة إلى ' + VQ.ar(Math.round(gov.tax * 100)) + '٪.', [ruler.id]);
      }

      // حولية السنة تنكتب في السجل
      const f = gov.fin;
      const income = f.tax + (f.vat || 0) + f.sales + f.caravans + f.other + (f.fees || 0) + (f.airport || 0) + (f.oil || 0) + (f.mining || 0);
      const spend = f.salaries + f.projects + f.welfare + (f.imports || 0) + (f.pension || 0) + (f.loans || 0) + (f.interest || 0) + (f.debt || 0) + (f.dividends || 0);
      const count = {};
      for (const p of adults) { const c = classOf(p).name; count[c] = (count[c] || 0) + 1; }
      const classes = Object.entries(count).map(([k, v]) => k + ' ' + VQ.ar(v)).join('، ');
      log('annals', 'حولية السنة ' + VQ.ar(yearOf() - 1) + ': دخل الدولة ' + VQ.ar(Math.round(income)) + ' ومصروفها ' + VQ.ar(Math.round(spend)) + ' درهم. الخزينة ' + VQ.ar(Math.round(s.treasury)) + '. الطبقات: ' + classes + '. مستوى الأسعار ×' + VQ.ar(priceLevel().toFixed(2)) + '.', []);
      gov.lastFin = f;
      if ((yearOf() - (shuraState().elected || 0)) >= 4 || !shuraState().members.length) shuraElection();
      makeBudget();
      lawsYear(ruler);
      gov.fin = newLedger();
      gov.thefts = 0;
    }

    function settleBusinesses() {
      const era = s.gov.era;
      for (const id of Object.keys(s.biz)) {
        const shop = s.biz[id];
        // بدون حرس حدود، التهريب ياكل جزء من تجارة القوافل
        const trade = C.CARAVAN * (1 + 0.5 * (shop.level - 1)) * (1 + 0.15 * era) * (0.7 + 0.6 * r()) * P() * (law('defense') ? 1 : 0.88);
        cbState().flowIn += trade; // تجارة القوافل تجيب عملة من برا
        if (!shop.owner) {
          addTreasury(trade, 'caravans');
          addTreasury(shop.till, 'sales');
          shop.till = 0;
          continue;
        }
        const owner = s.people[shop.owner];
        if (!owner) { shop.owner = null; addTreasury(trade, 'caravans'); continue; }
        // الجمارك على القوافل تروح للدولة حتى لو المحل خاص
        const duty = trade * C.CUSTOMS;
        addTreasury(duty, 'caravans');
        const profit = shop.till + trade - duty;
        shop.till = 0;
        if (profit > 0) {
          const tax = profit * taxRate() * 1.5;
          addTreasury(tax, 'tax');
          owner.money += profit - tax;
        } else {
          owner.money += profit;
          if (owner.money < 0) {
            owner.money = 0;
            shop.owner = null;
            if (owner.loan > 0) owner.defaulted = true; // ما يقدر ياخذ قرض ثاني
            log('biz', 'أفلس ' + owner.name + ' ورجع ' + world.places[id].name + ' للدولة.', [owner.id]);
          }
        }
      }
    }

    // ---- البورصة ----
    function bourseState() {
      if (!s.bourse) s.bourse = { companies: [], next: 1, index: 1000, base: 0, volume: 0, yearVolume: 0, ipos: 0, caught: 0, crimes: 0, raised: 0 };
      return s.bourse;
    }
    const staffAt = (place, title) => alive().filter((p) => p.job && p.job.place === place && (!title || p.job.title === title));
    const brokers = () => staffAt('exchange', 'وسيط مالي').length;
    const regulators = () => staffAt('exchange', 'مراقب السوق').length + staffAt('exchange', 'رئيس هيئة السوق').length;
    function delist(co, why) {
      const b = bourseState();
      b.companies.splice(b.companies.indexOf(co), 1);
      log('market', 'انشطب سهم ' + co.name + ' من البورصة: ' + why + '.', []);
    }
    // القيمة العادلة: الأرباح مضروبة في مكرر يعتمد على الفايدة، ولا تنزل تحت القيمة الدفترية بواجد
    function fairValue(co) {
      const pe = 1 / Math.max(0.05, cbState().rate + 0.06);
      let earnings;
      let book;
      if (co.kind === 'oil') { earnings = (s.oil.lastRevenue || 0) * 0.25; book = earnings * 4; }
      else {
        const f = s.firms[co.firm];
        if (!f) return co.price;
        const hist = f.profitHist || [];
        earnings = hist.length ? hist.reduce((a, x) => a + x, 0) / hist.length : 0;
        book = f.capital * f.level;
      }
      return Math.max(book * 0.4, earnings * pe) / co.shares;
    }
    // الاكتتاب العام: المكتتبين مواطنين، والأفضلية للصغار (حماية الأقلية)
    function subscribe(co, want, seller) {
      let sold = 0;
      let cash = 0;
      const buyers = alive().filter((p) => !p.expat && ageOf(p) >= C.ADULT_AGE && p.money > 300 * P() && p !== seller).sort((a, b) => a.money - b.money);
      for (const p of buyers) {
        if (sold >= want) break;
        const n = Math.min(want - sold, Math.floor((p.money * 0.15) / co.price), Math.ceil(want / 6));
        if (n < 1) continue;
        p.money -= n * co.price;
        co.holders[p.id] = (co.holders[p.id] || 0) + n;
        sold += n;
        cash += n * co.price;
      }
      return { sold, cash };
    }
    function tryIPO() {
      const b = bourseState();
      if (!regulators() || !brokers()) return;
      // شروط الإدراج: محل مستواه ٢ أو أكثر، ربحان آخر سنتين، ورأس ماله فوق الحد الأدنى
      const cand = Object.values(s.firms).find((f) => {
        if (VQ.FIRMS[f.type].tier !== 'shop' || b.companies.some((c) => c.firm === f.id)) return false;
        const h = f.profitHist || [];
        return h.length >= 2 && h[h.length - 1] > 0 && h[h.length - 2] > 0 && f.capital * f.level >= 2500 * P();
      });
      if (cand && r() < 0.5) {
        const owner = s.people[cand.owner];
        const co = { id: b.next++, kind: 'firm', firm: cand.id, name: VQ.FIRMS[cand.type].name + ' ' + owner.family, shares: C.SHARES, holders: {}, price: 0, prev: 0, listed: yearOf(), dividends: 0 };
        co.price = fairValue(co);
        co.holders[owner.id] = C.SHARES;
        const want = Math.round(C.SHARES * C.IPO_FLOAT);
        const res = subscribe(co, want, owner);
        co.holders[owner.id] -= res.sold;
        owner.money += res.cash * 0.97;
        addTreasury(res.cash * 0.03, 'fees'); // رسوم الإدراج
        co.prev = co.price;
        b.companies.push(co);
        b.ipos++;
        b.raised += res.cash;
        log('market', 'اكتتاب عام: ' + owner.name + ' حوّل ' + VQ.FIRMS[cand.type].name + ' لشركة مساهمة ونشر نشرة الإصدار (أرباح آخر سنتين ' + VQ.ar(Math.round(cand.profitHist.slice(-2).reduce((a, x) => a + x, 0))) + ' درهم). انباع ' + VQ.ar(res.sold) + ' سهم بسعر ' + VQ.ar(co.price.toFixed(1)) + ' وجمع ' + VQ.ar(Math.round(res.cash)) + ' درهم.', [owner.id]);
      }
      // خصخصة جزئية لشركة النفط بعد التأميم
      if (s.oil && s.oil.nationalized && !b.companies.some((c) => c.kind === 'oil') && r() < 0.5) {
        const v = shuraVote('law', 0.6);
        if (v && !v.pass) return;
        const co = { id: b.next++, kind: 'oil', name: 'شركة النفط الوطنية', shares: C.SHARES, holders: { state: C.SHARES }, price: 0, prev: 0, listed: yearOf(), dividends: 0 };
        co.price = fairValue(co);
        const want = Math.round(C.SHARES * 0.2);
        const res = subscribe(co, want, null);
        co.holders.state -= res.sold;
        addTreasury(res.cash, 'other');
        co.prev = co.price;
        b.companies.push(co);
        b.ipos++;
        b.raised += res.cash;
        log('state', 'خصخصة: الدولة طرحت ' + VQ.ar(res.sold) + ' سهم من شركة النفط الوطنية للمواطنين وجمعت ' + VQ.ar(Math.round(res.cash)) + ' درهم للخزينة.', []);
      }
    }
    function bourseDay(newYear) {
      const b = bourseState();
      if (!branchLevel('exchange')) return;
      if (newYear) { b.lastVolume = b.yearVolume; b.yearVolume = 0; tryIPO(); }
      const trading = brokers() > 0;
      const watch = Math.min(0.85, 0.35 * regulators());
      for (const co of b.companies.slice()) {
        if (co.kind === 'firm' && !s.firms[co.firm]) { delist(co, 'الشركة ما عادت موجودة'); continue; }
        co.prev = co.price;
        // الإفصاح الربعي: كل موسم تنعلن النتايج والسعر يتحرك ناحية القيمة العادلة
        const fair = fairValue(co);
        co.fair = fair;
        if (trading) co.price = Math.max(0.1, co.price + (fair - co.price) * 0.25 + co.price * 0.04 * (r() + r() - 1) + (co.pump || 0));
        co.pump = 0;
        // تداول: محتاج يبيع، وميسور يشتري
        if (trading) {
          const holders = Object.keys(co.holders).filter((id) => id !== 'state' && s.people[id] && co.holders[id] > 0);
          const seller = holders.map((id) => s.people[id]).find((p) => p.money < 60 * P() && !(co.firm && s.firms[co.firm] && s.firms[co.firm].owner === p.id));
          const buyer = alive().filter((p) => !p.expat && p.money > 1500 * P()).sort(() => r() - 0.5)[0];
          if (seller && buyer) {
            const n = Math.min(co.holders[seller.id], Math.max(1, Math.floor((buyer.money * 0.05) / co.price)));
            co.holders[seller.id] -= n;
            co.holders[buyer.id] = (co.holders[buyer.id] || 0) + n;
            seller.money += n * co.price * 0.99;
            buyer.money -= n * co.price;
            addTreasury(n * co.price * 0.01, 'fees'); // عمولة الوساطة
            b.yearVolume += n * co.price;
          }
        }
        // التداول بمعلومات داخلية: صاحب الشركة يعرف إنها خسرانة قبل الإعلان ويبيع
        const f = co.firm && s.firms[co.firm];
        if (f && f.losses >= 2 && trading && r() < 0.2) {
          const insider = s.people[f.owner];
          const buyer = alive().filter((p) => !p.expat && p.money > 1500 * P() && p !== insider)[0];
          const n = Math.floor((co.holders[insider.id] || 0) * 0.3);
          if (insider && buyer && n > 0) {
            const gain = n * (co.price - fair);
            co.holders[insider.id] -= n;
            co.holders[buyer.id] = (co.holders[buyer.id] || 0) + n;
            insider.money += n * co.price;
            buyer.money -= n * co.price;
            b.crimes++;
            if (r() < watch) {
              const fine = Math.min(Math.max(0, insider.money), Math.max(gain, 0) * 2 + 200 * P());
              insider.money -= fine;
              addTreasury(fine, 'fees');
              insider.penalty += 1;
              insider.jailUntil = absMinute() + 720;
              b.caught++;
              log('court', 'هيئة السوق كشفت ' + insider.name + (insider.gender === 'f' ? ' باعت' : ' باع') + ' أسهم ' + co.name + ' بمعلومات داخلية قبل إعلان الخساير. غرامة ' + VQ.ar(Math.round(fine)) + ' درهم وسجن.', [insider.id]);
            }
          }
        }
      }
      // التلاعب بالسوق: ثري يسوي صفقات وهمية يرفع السهم ويبيع
      if (trading && b.companies.length && r() < 0.01) {
        const crook = alive().filter((p) => !p.expat && p.money > 4000 * P() && p.penalty < 2).sort(() => r() - 0.5)[0];
        const co = pick(r, b.companies.filter((c) => c.kind === 'firm').length ? b.companies.filter((c) => c.kind === 'firm') : b.companies);
        if (crook && co) {
          b.crimes++;
          const gain = co.price * 0.3 * 100;
          if (r() < watch) {
            const fine = Math.min(crook.money, gain * 3);
            crook.money -= fine;
            addTreasury(fine, 'fees');
            crook.penalty += 1.5;
            crook.jailUntil = absMinute() + 960;
            b.caught++;
            log('court', 'هيئة السوق كشفت تلاعب ' + crook.name + ' بسهم ' + co.name + ' بصفقات وهمية. غرامة ' + VQ.ar(Math.round(fine)) + ' درهم وسجن.', [crook.id]);
          } else {
            co.pump = co.price * 0.3;
            crook.money += gain * 0.5;
            log('market', 'سهم ' + co.name + ' طار فجأة ٣٠٪ بدون سبب واضح.', []);
          }
        }
      }
      // توزيع الأرباح السنوية على المساهمين
      if (newYear) {
        for (const co of b.companies) {
          let pool;
          if (co.kind === 'oil') pool = spendTreasury((s.oil.lastRevenue || 0) * 0.25 * C.PAYOUT * (1 - (co.holders.state || 0) / co.shares), 'dividends');
          else {
            const f = s.firms[co.firm];
            const owner = f && s.people[f.owner];
            const profit = Math.max(0, (f && f.lastYearProfit) || 0) * C.PAYOUT;
            const pub = 1 - ((owner && co.holders[owner.id]) || 0) / co.shares;
            pool = owner ? Math.min(Math.max(0, owner.money), profit * pub) : 0;
            if (owner) owner.money -= pool;
          }
          const pub = Object.keys(co.holders).filter((id) => id !== 'state' && s.people[id] && !(co.firm && s.firms[co.firm] && s.firms[co.firm].owner === Number(id)));
          const total = pub.reduce((a, id) => a + co.holders[id], 0);
          for (const id of pub) s.people[id].money += pool * co.holders[id] / Math.max(1, total);
          co.dividends = pool;
        }
      }
      // المؤشر: متوسط تغير الأسعار موزون بالقيمة، عشان إدراج شركة جديدة ما يرفعه
      const cap = b.companies.reduce((a, c) => a + c.prev * c.shares, 0);
      if (cap > 0) b.index *= b.companies.reduce((a, c) => a + c.price * c.shares, 0) / cap;
    }

    // ---- المصرف المركزي ----
    const cbOpen = () => branchLevel('central') > 0;
    const governor = () => alive().find((p) => p.job && p.job.place === 'central' && p.job.slot === 0);
    const totalLoans = () => alive().reduce((a, p) => a + (p.loan || 0), 0);
    const deposits = () => alive().reduce((a, p) => a + (p.money > 300 ? p.money : 0), 0);
    // سقف الائتمان: المصرف ما يقرض أكثر من ودايعه بعد الاحتياطي الإلزامي، وقبل المركزي ما في سقف
    const creditCeiling = () => (cbOpen() ? deposits() * (1 - cbState().reserveRatio) * 0.3 : Infinity);
    // طباعة الفلوس لتمويل الحكومة: المصرف المركزي المستقل يرفض إلا في الضرورة
    function printMoney(amount) {
      const cb = cbState();
      if (cbOpen() && governor()) {
        if (s.treasury > 100 || cb.refusedYear === yearOf()) {
          if (cb.refusedYear !== yearOf()) { cb.refusedYear = yearOf(); log('state', 'المصرف المركزي رفض يطبع فلوس للحكومة عشان ما يرتفع التضخم.', []); }
          return 0;
        }
        amount *= 0.5;
        log('state', 'المصرف المركزي وافق مضطر يموّل الخزينة بـ' + VQ.ar(Math.round(amount)) + ' درهم عشان الرواتب.', []);
      } else {
        log('state', 'الحاكم أمر بطباعة ' + VQ.ar(Math.round(amount)) + ' درهم جديدة عشان يدفع الرواتب. هذا بيرفع الأسعار.', []);
      }
      s.treasury += amount;
      s.gov.fin.borrow = (s.gov.fin.borrow || 0) + amount;
      cb.printed += amount;
      cb.printedYear += amount;
      return amount;
    }
    // كل سنة: التضخم، سعر الفايدة، الاحتياطي والذهب وسعر الصرف، والرقابة على المصرف
    function cbYear() {
      const cb = cbState();
      const people = alive();
      const M = Math.max(1, people.reduce((a, p) => a + Math.max(0, p.money), 0));
      const employed = people.filter((p) => p.job).length;
      const O = Math.max(1, employed + Object.keys(s.firms).length * 0.5 + (s.oil ? s.oil.barrels / 40 : 0));
      if (!cb.lastM) { cb.lastM = M; cb.lastO = O; }
      const g = clamp(M / cb.lastM - 1, -0.5, 1);
      const gy = clamp(O / cb.lastO - 1, -0.5, 1);
      const printedShare = cb.printedYear / Math.max(1, cb.lastM);
      const gov = governor();
      const active = cbOpen() && !!gov;
      // التضخم: فلوس أكثر من الإنتاج، والطباعة، وغلا الأكل، وناقص أثر الفايدة
      let infl = 0.25 * (g - gy) + 1.2 * printedShare + 0.1 * (priceMult('food') - 1) + cb.shock + (r() - 0.5) * 0.01;
      if (active) infl -= 0.6 * (cb.rate - C.NEUTRAL_RATE);
      infl = clamp(infl, -0.06, 0.35);
      cb.shock = 0;
      cb.inflation = infl;
      cb.cpi *= 1 + infl;
      cb.wage += (cb.cpi - cb.wage) * 0.5;
      cb.moneyGrowth = g;
      cb.lastM = M;
      cb.lastO = O;
      cb.printedYear = 0;
      cb.history.push({ year: yearOf(), infl, rate: cb.rate, cpi: cb.cpi });
      if (cb.history.length > 30) cb.history.shift();
      if (infl > 0.08) log('state', 'التضخم السنة اللي فاتت ' + VQ.ar((infl * 100).toFixed(1)) + '٪. الأسعار ترتفع على الناس.', []);
      if (infl < -0.02) log('state', 'انكماش: الأسعار نزلت ' + VQ.ar((-infl * 100).toFixed(1)) + '٪ والتجارة ضعيفة.', []);
      // سعر الفايدة: قاعدة تايلور، يرفع لما يزيد التضخم عن الهدف ويخفض لما ينزل
      if (active) {
        const before = cb.rate;
        cb.rate = clamp(C.NEUTRAL_RATE + 1.5 * (infl - C.INFLATION_TARGET) - 0.5 * Math.min(0, gy) + cb.defend, 0.005, 0.2);
        cb.reserveRatio = infl > 0.05 ? 0.15 : infl < 0 ? 0.08 : 0.1;
        if (Math.abs(cb.rate - before) >= 0.005) log('state', gov.name + ' محافظ المصرف المركزي ' + (cb.rate > before ? 'رفع' : 'خفض') + ' سعر الفايدة إلى ' + VQ.ar((cb.rate * 100).toFixed(1)) + '٪.', [gov.id]);
      } else cb.rate = 0.05;
      cb.defend = Math.max(0, cb.defend - 0.01);
      // الاحتياطي الأجنبي: صادرات وسياحة تدخل دولار، واستيراد وسفر ودين خارجي يطلع
      cb.lastIn = cb.flowIn;
      cb.lastOut = cb.flowOut;
      cb.reserves += (cb.flowIn - cb.flowOut) / cb.fx;
      cb.flowIn = 0;
      cb.flowOut = 0;
      cb.goldPrice *= 1.02 + (r() - 0.5) * 0.06;
      // الذهب: إذا الاحتياطي كبير، المركزي يحط جزء منه ذهب
      const monthly = Math.max(1, cb.lastOut / 12 / cb.fx);
      if (active && cb.reserves > monthly * 18) {
        const buy = cb.reserves * 0.1;
        cb.reserves -= buy;
        cb.gold += buy / cb.goldPrice;
        if (buy / cb.goldPrice >= 5) log('state', 'المصرف المركزي اشترى ' + VQ.ar(Math.round(buy / cb.goldPrice)) + ' أونصة ذهب للاحتياطي.', []);
      }
      // ربط العملة: إذا خلص الاحتياطي، المركزي يدافع برفع الفايدة، وإذا ما نفع يخفض الدرهم
      if (cb.reserves < 0 && yearOf() - (cb.lastDeval || -99) >= 10) {
        if (active && !cb.defended) {
          cb.defended = true;
          cb.defend = 0.03;
          if (cb.gold > 0) { cb.reserves += cb.gold * cb.goldPrice * 0.5; cb.gold *= 0.5; }
          log('state', 'الاحتياطي الأجنبي خلص تقريباً. المصرف المركزي رفع الفايدة وباع ذهب يدافع عن الدرهم.', []);
        } else {
          cb.fx *= 1.15;
          cb.lastDeval = yearOf();
          cb.reserves = monthly * 3;
          cb.shock = 0.06;
          cb.defended = false;
          log('state', 'تخفيض الدرهم: الدولار صار بـ' + VQ.ar(cb.fx.toFixed(2)) + ' درهم. المستورد والسفر بيغلون.', []);
        }
      } else if (cb.reserves > monthly * 6) cb.defended = false;
      // الرقابة على المصرف: القروض المتعثرة
      const loans = totalLoans();
      const bad = people.filter((p) => p.defaulted && p.loan > 0).reduce((a, p) => a + p.loan, 0);
      cb.npl = loans ? bad / loans : 0;
      if (loans > 2000 && cb.npl > (active ? 0.35 : 0.25)) {
        if (active) {
          // الملجأ الأخير: المركزي يشطب الديون المعدومة ويضخ سيولة للمصرف
          for (const p of people) if (p.defaulted && p.loan > 0) p.loan = 0;
          cb.lolr += bad;
          cb.printedYear += bad * 0.5;
          log('state', 'أزمة في المصرف: المصرف المركزي ضخ ' + VQ.ar(Math.round(bad)) + ' درهم سيولة وشطب الديون المعدومة، والمودعين ما خسروا شي.', []);
        } else {
          let lost = 0;
          for (const p of people) if (p.money > 300) { const l = Math.min(300 * P(), p.money * 0.1); p.money -= l; lost += l; }
          for (const p of people) if (p.defaulted && p.loan > 0) p.loan = 0;
          log('state', 'ذعر في المصرف! الناس سحبوا فلوسهم والمصرف عجز، والمودعين خسروا ' + VQ.ar(Math.round(lost)) + ' درهم. ما في مصرف مركزي ينقذه.', []);
        }
      }
    }

    // المصرف: فوايد القروض تدخل صندوق المصرف، ومنه بس تنصرف فوايد الودايع. ما يصرف من الخزينة شي ما كسبه
    function bankDay() {
      const open = branchLevel('bank');
      s.bankPool = s.bankPool || 0;
      const savers = [];
      for (const p of alive()) {
        if (p.loan > 0) {
          const interest = p.loan * loanRate();
          p.loan += interest;
          const pay = Math.min(p.loan, Math.max(0, p.money) * 0.2);
          p.money -= pay;
          p.loan -= pay;
          addTreasury(pay, 'other');
          s.bankPool += Math.min(pay, interest) * 0.7; // ٣٠٪ ربح المصرف للدولة
          if (p.loan < 1) { p.loan = 0; log('biz', p.name + (p.gender === 'f' ? ' سددت' : ' سدد') + ' قرض المصرف كامل.', [p.id]); }
        } else if (open && p.money > 300) savers.push(p);
      }
      const want = savers.reduce((a, p) => a + p.money * depositRate() * (0.75 + 0.25 * open), 0);
      if (!want || s.bankPool <= 0) return;
      const scale = Math.min(1, s.bankPool / want);
      for (const p of savers) {
        const gain = spendTreasury(p.money * depositRate() * (0.75 + 0.25 * open) * scale, 'interest');
        s.bankPool -= gain;
        p.money += gain;
      }
    }

    // ---- النفط والصندوق السيادي ----
    function oilState() {
      if (!s.oil) s.oil = { found: false, discoverAt: C.OIL_YEAR[0] + Math.floor(r() * (C.OIL_YEAR[1] - C.OIL_YEAR[0])), price: C.OIL_PRICE, barrels: 0, revenue: 0, yearRevenue: 0, lastRevenue: 0 };
      return s.oil;
    }
    function oilDay(newYear) {
      const oil = oilState();
      if (newYear) { oil.lastRevenue = oil.yearRevenue; oil.yearRevenue = 0; }
      if (!oil.found) {
        if (yearOf() >= oil.discoverAt) {
          oil.found = true;
          oil.foundYear = yearOf();
          log('state', 'اكتشفوا النفط في الجنوب! شركة أجنبية بتبني الحقل بامتياز، والدولة تاخذ نص الأرباح.', []);
        }
        return;
      }
      // الامتياز: الشركة الأجنبية تبني الحقل على حسابها بعد سنة
      if (!branchLevel('oil') && yearOf() >= oil.foundYear + 1 && !(s.gov.project && s.gov.project.branch === 'oil')) {
        s.gov.branches.oil.level = 1;
        log('state', 'خلصت الشركة الأجنبية بناء حقل النفط وبدأ التصدير.', []);
        emit('built', { branch: 'oil', level: 1 });
      }
      // السعر يتحرك كل يوم، ويرجع للمعدل، ومرات تصير طفرة أو أزمة
      const base = C.OIL_PRICE * (1 + 0.1 * s.gov.era) * fxFactor(); // النفط بالدولار، يتحول للدرهم
      oil.price += (base - oil.price) * 0.08 + oil.price * 0.06 * (r() + r() + r() - 1.5);
      const shock = r();
      if (shock < 0.012) { oil.price *= 1.6; log('state', 'طفرة في أسعار النفط! البرميل صار بـ' + VQ.ar(oil.price.toFixed(1)) + ' درهم.', []); }
      else if (shock < 0.024) { oil.price *= 0.5; log('state', 'أزمة: أسعار النفط طاحت للنص. البرميل بـ' + VQ.ar(oil.price.toFixed(1)) + ' درهم.', []); }
      oil.price = clamp(oil.price, base * 0.3, base * 3);
      const lvl = branchLevel('oil');
      if (!lvl) { oil.barrels = 0; oil.revenue = 0; return; }
      // الإنتاج حسب الطاقم: بدون مهندس الحقل يشتغل بربع طاقته
      const slots = VQ.JOBS.oil.filter((j) => (j.lvl || 1) <= lvl).length;
      const crew = alive().filter((p) => p.job && p.job.place === 'oil');
      const engineer = crew.some((p) => p.job.title === 'مهندس بترول');
      const staffed = crew.length / Math.max(1, slots);
      oil.barrels = C.OIL_BARRELS * lvl * (engineer ? 0.3 + 0.7 * staffed : 0.25) * (law('environment') ? 0.9 : 1);
      s.pollution = (s.pollution || 0) * 0.9 + (oil.barrels / 800) * (law('environment') ? 0.3 : 1);
      const gross = oil.barrels * oil.price;
      // قبل التأميم الدولة تاخذ النص، وبعد ما تطوّر الشركة بنفسها تاخذ ٨٠٪
      const share = lvl >= 2 ? 0.8 : 0.5;
      if (lvl >= 2 && !oil.nationalized) { oil.nationalized = true; log('state', 'الدولة أمّمت شركة النفط وصارت تاخذ ٨٠٪ من الأرباح.', []); }
      const net = gross * share;
      addTreasury(net, 'oil');
      cbState().flowIn += gross;
      cbState().flowOut += gross - net; // نصيب الشركة الأجنبية والتشغيل
      oil.revenue = net;
      oil.yearRevenue += net;
    }
    // ---- المناجم والاستكشاف ----
    // الجبال الشرقية مقسومة قطع ٨×٨. كل قطعة تنكشف بنقاط استكشاف، ولما تنكشف قطعة فيها منجم ينلقى
    const E = world.east;
    const chunkIndex = (x, y) => (x < E.x0 ? -1 : Math.floor(y / E.chunk) * E.cols + Math.floor((x - E.x0) / E.chunk));
    function minesState() {
      if (!s.mines) {
        const explored = new Array(E.cols * E.rows).fill(0);
        // حول هيئة التعدين مكشوف من البداية
        const hq = world.places.mining.front;
        for (let cy = 0; cy < E.rows; cy++) for (let cx = 0; cx < E.cols; cx++) {
          const mx = E.x0 + cx * E.chunk + E.chunk / 2;
          const my = cy * E.chunk + E.chunk / 2;
          if (Math.abs(mx - hq.x) <= 8 && Math.abs(my - hq.y) <= 8) explored[cy * E.cols + cx] = 1;
        }
        s.mines = {
          explored,
          points: 0,
          field: 0,
          revealed: explored.reduce((a, b) => a + b, 0),
          sites: world.mineSites.map((m) => ({ id: m.id, mineral: m.mineral, found: false, open: false, building: 0, foundYear: 0, finder: '', output: 0, yearOutput: 0, lastOutput: 0, price: 1 })),
          revenue: 0, yearRevenue: 0, lastRevenue: 0,
        };
      }
      if (!world.places.frontier.tiles.length) refreshFrontier();
      return s.mines;
    }
    const mineSite = (id) => minesState().sites.find((m) => m.id === id);
    const isExplored = (x, y) => { const i = chunkIndex(x, y); return i < 0 || !!(s.mines && s.mines.explored[i]); };
    // القطع اللي ممكن تنكشف الحين: مجاورة لقطعة مكشوفة
    function frontierChunks() {
      const ex = s.mines.explored;
      const out = [];
      for (let cy = 0; cy < E.rows; cy++) for (let cx = 0; cx < E.cols; cx++) {
        if (ex[cy * E.cols + cx]) continue;
        const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const nx = cx + dx; const ny = cy + dy; return nx >= 0 && ny >= 0 && nx < E.cols && ny < E.rows && ex[ny * E.cols + nx]; });
        if (near) out.push([cx, cy]);
      }
      return out;
    }
    // المستكشفين يوقفون على حافة المكشوف ويطالعون اللي وراه
    function refreshFrontier() {
      const tiles = [];
      const ex = s.mines ? s.mines.explored : null;
      if (!ex) return;
      for (const [cx, cy] of frontierChunks()) {
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= E.cols || ny >= E.rows || !ex[ny * E.cols + nx]) continue;
          // أقرب مربع يمشى فيه داخل القطعة المكشوفة، على الحد
          const x0 = E.x0 + nx * E.chunk;
          const y0 = ny * E.chunk;
          for (let k = 0; k < 12; k++) {
            const x = x0 + Math.floor(r() * E.chunk);
            const y = y0 + Math.floor(r() * E.chunk);
            if (x < world.W && y < world.H && !world.solid[y * world.W + x]) { tiles.push([x, y]); break; }
          }
        }
      }
      world.places.frontier.tiles = tiles;
    }
    function revealChunk(cx, cy) {
      const st = s.mines;
      st.explored[cy * E.cols + cx] = 1;
      st.revealed++;
      for (const m of world.mineSites) {
        const site = st.sites.find((x) => x.id === m.id);
        if (site.found || chunkIndex(m.ex, m.ey) !== cy * E.cols + cx) continue;
        site.found = true;
        site.foundYear = yearOf();
        const crew = alive().filter((p) => (p.job && p.job.place === 'mining') || p.fieldDay === s.day);
        const finder = crew.length ? pick(r, crew) : null;
        site.finder = finder ? finder.name : '';
        const min = VQ.MINERALS[m.mineral];
        log('state', (finder ? finder.name + (finder.gender === 'f' ? ' لقت ' : ' لقى ') : 'المستكشفين لقوا ') + 'عروق ' + min.name + ' في الجبال الشرقية! صار اسمه «' + m.place + '».', finder ? [finder.id] : []);
        emit('mine', { id: m.id, mineral: m.mineral });
      }
    }
    function minesDay(newYear) {
      const st = minesState();
      if (newYear) {
        st.lastRevenue = st.yearRevenue; st.yearRevenue = 0;
        for (const m of st.sites) { m.lastOutput = m.yearOutput; m.yearOutput = 0; }
      }
      const lvl = branchLevel('mining');
      if (!lvl) { st.field = 0; return; }
      // نقاط الاستكشاف: الجيولوجي أكثر من المستكشف، وطلبة الجيولوجيا يساعدون في رحلاتهم الميدانية
      const staff = alive().filter((p) => p.job && p.job.place === 'mining');
      let pts = st.field * 1.5;
      for (const p of staff) pts += p.job.title === 'جيولوجي' ? 3 : p.job.title === 'مستكشف' ? 2 : 1;
      st.points += pts * (0.7 + 0.3 * lvl);
      st.field = 0;
      let changed = false;
      while (st.points >= C.EXPLORE_COST) {
        const options = frontierChunks();
        if (!options.length) { st.points = 0; break; }
        // الطرق الترابية تسهّل الوصول، فالقطع اللي فيها طريق تنكشف أول
        const weight = ([cx, cy]) => {
          let w = 1;
          for (let y = cy * E.chunk; y < Math.min(world.H, (cy + 1) * E.chunk); y += 2) for (let x = E.x0 + cx * E.chunk; x < Math.min(world.W, E.x0 + (cx + 1) * E.chunk); x += 2) if (world.ground[y * world.W + x] === VQ.T.DIRT) { w = 4; break; }
          return w;
        };
        const ws = options.map(weight);
        let roll = r() * ws.reduce((a, b) => a + b, 0);
        let k = 0;
        while (roll > ws[k] && k < ws.length - 1) { roll -= ws[k]; k++; }
        revealChunk(options[k][0], options[k][1]);
        st.points -= C.EXPLORE_COST;
        changed = true;
      }
      if (changed) refreshFrontier();
      if (changed && st.revealed === E.cols * E.rows) log('state', 'خلص استكشاف الجبال الشرقية كلها.', []);
      // بعد ما ينكشف كل شي، المستكشفين ما لهم شغل: ينهى عقدهم ويدورون شغل ثاني
      if (st.revealed === E.cols * E.rows) {
        for (const p of staff) if (p.job.title === 'مستكشف') { log('job', p.name + (p.gender === 'f' ? ' خلّصت' : ' خلّص') + ' شغله مستكشف بعد ما انكشفت الجبال كلها.', [p.id]); p.job = null; }
      }
      // تجهيز المنجم المكتشف: الدولة تدفع، وبعد كم يوم يبدأ الإنتاج
      for (const m of st.sites) {
        if (!m.found || m.open) continue;
        const def = world.mineSites.find((x) => x.id === m.id);
        if (!m.building) {
          const cost = C.MINE_OPEN_COST * P();
          if (s.treasury < cost + C.BUILD_RESERVE) continue;
          spendTreasury(cost, 'projects');
          m.building = s.day;
          log('state', 'الدولة بدأت تجهّز ' + def.place + ': طريق وسكة وعربات.', []);
        } else if (s.day - m.building >= C.MINE_BUILD_DAYS) {
          m.open = true;
          log('state', 'انفتح ' + def.place + ' وبدأ الإنتاج. يبغون مهندس تعدين وعمال.', []);
          emit('built', { branch: 'mining', mine: m.id });
        }
      }
      // الإنتاج: كل منجم حسب طاقمه، والسعر يتحرك شوي كل يوم
      let total = 0;
      for (const m of st.sites) {
        if (!m.open) { m.output = 0; continue; }
        m.price = clamp(m.price + (1 - m.price) * 0.1 + 0.08 * (r() + r() - 1), 0.5, 1.8);
        const crew = alive().filter((p) => p.job && p.job.place === m.id);
        const engineer = crew.some((p) => p.job.title === 'مهندس تعدين');
        const staffed = crew.length / VQ.MINE_JOBS.length;
        const work = crew.length ? (engineer ? 0.35 + 0.65 * staffed : 0.3 * staffed) : 0;
        const gross = VQ.MINERALS[m.mineral].value * work * m.price * (1 + 0.25 * (lvl - 1)) * P();
        m.output = gross;
        m.yearOutput += gross;
        total += gross;
      }
      if (total > 0) {
        const net = total * C.MINE_SHARE;
        addTreasury(net, 'mining');
        cbState().flowIn += total;
        cbState().flowOut += total - net; // تشغيل ونقل وتصدير
        st.revenue = net;
        st.yearRevenue += net;
        s.pollution = (s.pollution || 0) * (branchLevel('oil') ? 1 : 0.9) + total / 9000;
      } else st.revenue = 0;
    }
    function fundState() {
      if (!s.fund) s.fund = { balance: 0, inYear: 0, outYear: 0, lastIn: 0, lastOut: 0 };
      return s.fund;
    }
    // الصندوق السيادي: يحفظ الفايض ويستثمره، ويسد الخزينة لما تنزل تحت الاحتياطي
    function fundDay(newYear) {
      const fund = fundState();
      fund.balance *= 1 + C.FUND_RETURN;
      if (s.treasury < C.BUILD_RESERVE && fund.balance > 1) {
        const take = Math.min(fund.balance, C.BUILD_RESERVE * 1.5 - s.treasury);
        fund.balance -= take;
        s.treasury += take;
        fund.outYear += take;
        if (!fund.warned) { fund.warned = true; log('state', 'الخزينة نزلت، والدولة سحبت ' + VQ.ar(Math.round(take)) + ' درهم من الصندوق السيادي.', []); }
      }
      if (!newYear) return;
      fund.lastIn = fund.inYear;
      fund.lastOut = fund.outYear;
      fund.inYear = 0;
      fund.outYear = 0;
      fund.warned = false;
      const f = s.gov.lastFin;
      if (!f) return;
      // المكرمة: إذا الصندوق صار أكبر من رواتب ٢٠ سنة، يتوزع جزء منه على المواطنين
      const yearly = f.salaries + f.projects + f.welfare;
      if (fund.balance > yearly * 20) {
        const citizens = alive().filter((p) => ageOf(p) >= C.ADULT_AGE && !p.expat);
        const grant = fund.balance * C.FUND_GRANT;
        if (citizens.length) {
          fund.balance -= grant;
          fund.outYear += grant;
          for (const p of citizens) p.money += grant / citizens.length;
          log('state', 'مكرمة من الصندوق السيادي: كل مواطن كبير استلم ' + VQ.ar(Math.round(grant / citizens.length)) + ' درهم.', []);
        }
      }
      const keep = yearly * 1.2 + C.BUILD_RESERVE;
      if (s.treasury > keep) {
        const save = (s.treasury - keep) * C.FUND_SAVE;
        s.treasury -= save;
        fund.balance += save;
        fund.inYear += save;
        log('state', 'الدولة حطت ' + VQ.ar(Math.round(save)) + ' درهم من فايض السنة في الصندوق السيادي. رصيده ' + VQ.ar(Math.round(fund.balance)) + '.', []);
      }
    }

    // المكافأة: حالك اليوم، وكم زادت ثروتك ومهارتك. الشبكة تقوي القرارات اللي جابت نتيجة حلوة.
    function learnDay() {
      updateClassLines();
      for (const p of alive()) {
        const n = p.needs;
        const wealth = Math.log10(1 + Math.max(0, worthOf(p)));
        const comfort = (n.water + n.food + n.fun + n.social + p.health) / 500;
        const reward = comfort - 0.6 + (wealth - p.lastWealth) * 5 + (p.skill - p.lastSkill) * 0.03 - p.penalty;
        const list = traces[p.id];
        if (list && list.length && p.lastWealth) VQ.Net.learn(p.net, list, reward);
        traces[p.id] = [];
        p.lastWealth = wealth;
        p.lastSkill = p.skill;
        p.penalty = 0;
        const klass = classOf(p);
        if (p.klass && klass.id !== p.klass && ageOf(p) >= C.ADULT_AGE) {
          const rank = (id) => VQ.CLASSES.findIndex((c) => c.id === id);
          if (rank(klass.id) >= 0 && rank(p.klass) >= 0) {
            const up = rank(klass.id) > rank(p.klass);
            const big = klass.id === 'rich' || klass.id === 'poor';
            log(big ? 'class' : 'minor', p.name + (up ? (p.gender === 'f' ? ' صعدت' : ' صعد') : (p.gender === 'f' ? ' نزلت' : ' نزل')) + ' إلى طبقة ' + klass.name + '.', [p.id]);
          }
        }
        p.klass = klass.id;
      }
    }

    function onArrive(p, t) {
      t.arrived = true;
      if (t.field && p.fieldDay !== s.day) {
        // الرحلة الميدانية تنحسب حضور جامعة، وتساعد في الاستكشاف
        p.fieldDay = s.day;
        p.schoolDay = s.day;
        p.studied = p.studied || {};
        p.studied[4] = (p.studied[4] || 0) + 1;
        minesState().field++;
        emote(p, 'pick', 120);
      }
      if (t.kind === 'school' && p.schoolDay !== s.day) {
        p.schoolDay = s.day;
        const stage = VQ.STAGES.findIndex((st) => st && st.place === t.place);
        if (stage > 0) { p.studied = p.studied || {}; p.studied[stage] = (p.studied[stage] || 0) + 1; }
      }
      if (t.kind === 'work' && t.firm && s.firms[t.firm]) s.firms[t.firm].tended = s.day;
      if (t.kind === 'travel') startTrip(p, t);
      switch (t.kind) {
        case 'tend': {
          const f = s.firms[t.firm];
          if (f) f.tended = s.day;
          const interior = p.loc !== 'out' && world.places[p.loc].b.interior;
          if (interior && interior.anchors.work) walkInterior(p, interior.anchors.work[0], interior.anchors.work[1]);
          emote(p, 'bag', 40);
          break;
        }
        case 'buy': {
          buy(p, t.item, t.qty);
          if (t.thenDrink) t.followup = 'drink';
          if (t.thenEat) t.followup = 'eat';
          break;
        }
        case 'drink':
          if (!consume(p, 'water')) t.dur = 0;
          break;
        case 'eat':
          if (!consume(p, 'food')) t.dur = 0;
          break;
        case 'aid':
          p.needs.food = clamp(p.needs.food + 60, 0, 100);
          spendTreasury(5, 'welfare');
          emote(p, 'food', 30);
          break;
        case 'fountain':
          p.needs.water = clamp(p.needs.water + 35, 0, 100);
          emote(p, 'drop', 30);
          break;
        case 'play': {
          const toy = pick(r, p.owned.length ? p.owned : ['domino']);
          const def = VQ.ITEMS[toy];
          if (p.owned.length) { p.needs.fun = clamp(p.needs.fun + def.fun, 0, 100); emote(p, 'game', 60); }
          break;
        }
        case 'invest':
          doInvest(p);
          emote(p, 'bag', 30);
          break;
        case 'steal':
          doSteal(p);
          break;
        case 'labor':
          emote(p, 'hammer', 60);
          break;
        case 'sleep':
        case 'rest': {
          p.sleeping = true;
          const beds = p.loc !== 'out' && world.places[p.loc].b.interior.anchors.beds;
          if (beds && beds.length) walkInterior(p, beds[0][0], beds[0][1]);
          break;
        }
        case 'hospital': {
          const ill = p.illness;
          if (!ill) { t.dur = 0; break; }
          // العلاج بفلوس المريض، واللي ما عنده تدفع عنه البلدية
          const price = priceOf('treatment');
          const level = branchLevel('health');
          if (p.money >= price && level < 3) { p.money -= price; addTreasury(price, 'sales'); }
          else spendTreasury(price, 'welfare');
          ill.treated = true;
          s.stats.treated++;
          // العلاج يقصّر المرض، بس الكبار والصغار ممكن ما يستجيبون. والمستشفى الأكبر ينقذ أكثر.
          ill.resist = VQ.DISEASES[ill.id].care === 'hospital' && isFrail(p) && r() < 0.36 - 0.12 * level;
          ill.until = absMinute() + (ill.until - absMinute()) / (1 + level);
          p.sleeping = true;
          const beds = world.places.clinic.b.interior.anchors.beds;
          const bed = pick(r, beds);
          walkInterior(p, bed[0], bed[1]);
          log('sick', p.name + (p.gender === 'f' ? ' تنوّمت' : ' تنوّم') + ' في المستشفى بسبب ' + VQ.DISEASES[ill.id].name, [p.id]);
          break;
        }
        case 'work': {
          const interior = p.loc !== 'out' && world.places[p.loc].b.interior;
          if (interior && interior.anchors.work) walkInterior(p, interior.anchors.work[0], interior.anchors.work[1]);
          break;
        }
        default:
          break;
      }
    }

    function runTask(p) {
      const t = p.task;
      if (!t) return;
      if (!t.arrived) {
        if (!t.place) { finishTask(p); return; }
        if (travel(p, t.place)) onArrive(p, t);
        return;
      }
      if (t.kind === 'travel') {
        // المسافر برا البلد، احتياجاته متغطية
        p.needs.water = Math.max(p.needs.water, 60);
        p.needs.food = Math.max(p.needs.food, 60);
        p.needs.energy = Math.max(p.needs.energy, 50);
      }
      if (t.kind === 'hospital') {
        if (!p.illness) t.dur = 0;
        // المستشفى يوكل ويسقي مرضاه
        p.needs.water = Math.max(p.needs.water, 70);
        p.needs.food = Math.max(p.needs.food, 70);
      }
      // المهارة تزيد بالدراسة والشغل، والتعليم الأقوى يزودها أسرع
      const teach = 1 + 0.5 * (branchLevel('education') - 1);
      if (t.kind === 'school') p.skill = Math.min(100, p.skill + 0.0042 * teach);
      else if (t.kind === 'study') p.skill = Math.min(100, p.skill + 0.012 * teach);
      else if (t.kind === 'work' || t.kind === 'tend') p.skill = Math.min(100, p.skill + 0.0006);
      if (t.build) {
        const worked = addWork(t.build, 1);
        if (t.kind === 'labor') {
          const pay = spendTreasury(C.LABOR_RATE, 'salaries');
          p.money += pay;
        }
        if (!worked || !activeSites().some((site) => site.id === t.build)) t.dur = 0;
      }
      if (t.kind === 'jail') { p.needs.water = Math.max(p.needs.water, 40); p.needs.food = Math.max(p.needs.food, 40); }
      t.dur -= 1;
      if (t.dur <= 0) {
        const follow = t.followup;
        finishTask(p);
        if (follow && p.home) p.task = { kind: follow, place: p.home, dur: 10 };
        return;
      }
      // يتحرك داخل المكان بين فترة وفترة
      if (!p.sleeping && t.kind !== 'work' && p.loc !== 'out' && p.path.length === 0 && r() < 0.015) {
        const spot = pick(r, world.places[p.loc].b.interior.spots);
        walkInterior(p, spot[0], spot[1]);
      } else if (p.loc === 'out' && t.kind === 'visit' && p.path.length === 0 && r() < 0.02) {
        const spot = publicSpot(t.place);
        const path = VQ.findPath(world.solid, world.W, world.H, Math.round(p.x), Math.round(p.y), spot.x, spot.y);
        if (path && path.length < 40) p.path = path;
      }
    }

    function decayNeeds(p, age) {
      const n = p.needs;
      const rate = p.sleeping ? 0.45 : 1;
      n.water = clamp(n.water - 0.06 * rate * season().thirst, 0, 100);
      n.food = clamp(n.food - 0.04 * rate, 0, 100);
      n.fun = clamp(n.fun - 0.03 * rate, 0, 100);
      n.social = clamp(n.social - 0.025 * rate, 0, 100);
      n.energy = clamp(n.energy + (p.sleeping ? 0.22 : -0.06), 0, 100);

      if (n.water <= 0) p.health -= 0.05;
      if (n.food <= 0) p.health -= 0.025;
      const ill = p.illness;
      if (ill) {
        const d = VQ.DISEASES[ill.id];
        if (ill.treated && !ill.resist) p.health = Math.min(100, p.health + 0.05);
        else p.health -= d.drain * (isFrail(p) ? 1.6 : 1);
        if (p.health > 0 && absMinute() >= ill.until) recover(p);
      } else if (n.water > 25 && n.food > 25 && p.health < 100) {
        p.health = Math.min(100, p.health + 0.008);
      }
      if (p.health <= 0) {
        die(p, n.water <= 0 ? 'العطش' : n.food <= 0 ? 'الجوع' : ill ? VQ.DISEASES[ill.id].name : 'الكبر');
      }
    }

    // ---- الأمراض والعدوى ----
    function isFrail(p) {
      const age = ageOf(p);
      return age < 5 || age >= 60;
    }

    function catchIllness(p, id, from) {
      if (p.illness || (p.immune[id] || 0) > s.day) return false;
      const d = VQ.DISEASES[id];
      const days = d.days[0] + r() * (d.days[1] - d.days[0]);
      p.illness = { id, until: absMinute() + days * C.MINUTES_PER_DAY, treated: false, resist: false };
      s.stats.cases++;
      if (from) s.stats.spread++;
      const type = d.care === 'none' ? 'minor' : 'sick';
      if (from) log(type, 'انتقلت عدوى ' + d.name + ' من ' + from.name + ' إلى ' + p.name, [p.id, from.id]);
      else log(type, p.name + (p.gender === 'f' ? ' مرضت بـ' : ' مرض بـ') + d.name, [p.id]);
      emit('sick', { id: p.id, disease: id, from: from ? from.id : null });
      // اللي يحتاج راحة يقطع شغله ويرجع
      if (d.care !== 'none' && p.task && !['drink', 'eat', 'hospital'].includes(p.task.kind)) finishTask(p);
      return true;
    }

    function recover(p) {
      const id = p.illness.id;
      const d = VQ.DISEASES[id];
      p.immune[id] = s.day + d.immuneDays;
      p.illness = null;
      log(d.care === 'none' ? 'minor' : 'sick', p.name + (p.gender === 'f' ? ' تعافت من ' : ' تعافى من ') + d.name, [p.id]);
      emit('recovered', { id: p.id, disease: id });
    }

    // العدوى تنتقل بين اللي في نفس المكان، والمنوّم في المستشفى معزول ما ينقل لأحد
    function spreadIllness() {
      const groups = {};
      for (const p of alive()) {
        const key = p.loc !== 'out' ? p.loc : 'c' + Math.floor(p.x / 5) + '_' + Math.floor(p.y / 5);
        (groups[key] = groups[key] || []).push(p);
      }
      for (const list of Object.values(groups)) {
        const carriers = list.filter((p) => p.illness && !p.illness.treated && VQ.DISEASES[p.illness.id].spread > 0);
        for (const c of carriers) {
          const d = VQ.DISEASES[c.illness.id];
          for (const o of list) {
            if (o === c || o.illness) continue;
            if (c.illness.id === 'pox' && ageOf(o) >= 18) continue; // جدري الماء أغلبه في العيال
            if (r() < d.spread * (law('health') ? 0.6 : 1)) catchIllness(o, c.illness.id, c);
          }
        }
      }
    }

    function dailyIllness() {
      const people = alive();
      // ممكن الإنفلونزا تتطور، والكبار معرضين للالتهاب الرئوي
      for (const p of people) {
        if (p.illness && p.illness.id === 'flu' && !p.illness.treated && r() < (isFrail(p) ? 0.25 : 0.05)) {
          const d = VQ.DISEASES.pneumonia;
          p.illness = { id: 'pneumonia', until: absMinute() + d.days[0] * C.MINUTES_PER_DAY, treated: false, resist: false };
          s.stats.cases++;
          log('sick', 'تطورت حالة ' + p.name + ' إلى ' + d.name, [p.id]);
          if (p.task && p.task.kind !== 'hospital') finishTask(p);
        } else if (!p.illness && ageOf(p) >= 60 && r() < 0.01) {
          catchIllness(p, 'pneumonia');
        }
      }
      // التلوث يزيد الأمراض
      if (people.length && r() < Math.min(0.3, (s.pollution || 0) * 0.04)) catchIllness(pick(r, people), r() < 0.5 ? 'flu' : 'cold');
      if (people.length && r() < C.NEW_ILLNESS_CHANCE) {
        const p = pick(r, people);
        const kid = ageOf(p) < 12;
        const roll = r();
        catchIllness(p, kid && roll < 0.3 ? 'pox' : roll < 0.7 ? 'cold' : 'flu');
      }
      const sick = alive().filter((p) => p.illness).length;
      if (!s.outbreak && sick >= 6) {
        s.outbreak = true;
        log('outbreak', 'انتشر المرض في القرية! ' + VQ.ar(sick) + ' مرضى الحين.', []);
      } else if (s.outbreak && sick <= 1) {
        s.outbreak = false;
        log('outbreak', 'انحسر المرض وتحسنت القرية.', []);
      }
    }

    const isUrgent = (p) => p.needs.water < 15 || p.needs.food < 12;

    function tickPerson(p) {
      const age = ageOf(p);
      decayNeeds(p, age);
      if (!s.people[p.id]) return;
      stepMovement(p);

      // العطش والجوع يقطعون أي شي ثاني
      if (p.task && isUrgent(p) && age >= C.SCHOOL_MIN && !['drink', 'eat', 'buy', 'fountain', 'aid', 'hospital'].includes(p.task.kind)) {
        finishTask(p);
      }
      if (!p.task) {
        let action = null;
        const brain = brains[p.id];
        if (brain) {
          try {
            action = brain(viewFor(p));
          } catch (e) {
            console.error('خطأ في عقل ' + p.name, e);
          }
        }
        p.task = action ? taskFromAction(p, action) || defaultBrain(p) : defaultBrain(p);
        if (p.task && !p.task.place) p.task.place = 'plaza';
        if (p.task && p.task.kind === 'visit' && !world.places[p.task.place].indoor) p.task.tile = publicSpot(p.task.place);
        p.leaving = false;
      }
      runTask(p);
      if (p.emote && s.day * 1440 + s.minute > p.emoteUntil) p.emote = null;
    }

    // ---- العلاقات ----
    function relatives(a, b) {
      if (a.id === b.id) return true;
      if (a.father === b.id || a.mother === b.id || b.father === a.id || b.mother === a.id) return true;
      const pa = [a.father, a.mother].filter(Boolean);
      const pb = [b.father, b.mother].filter(Boolean);
      if (pa.some((x) => pb.includes(x))) return true; // إخوان
      if (a.grandparents && a.grandparents.includes(b.id)) return true;
      if (b.grandparents && b.grandparents.includes(a.id)) return true;
      if (pb.some((x) => a.siblings && a.siblings.includes(x))) return true; // خال أو عم
      if (pa.some((x) => b.siblings && b.siblings.includes(x))) return true;
      return false;
    }

    function canMarry(a, b) {
      if (a.gender === b.gender) return false;
      if (a.spouse || b.spouse) return false;
      if (ageOf(a) < C.MIN_MARRIAGE_AGE || ageOf(b) < C.MIN_MARRIAGE_AGE) return false;
      if (Math.abs(ageOf(a) - ageOf(b)) > C.MAX_AGE_GAP) return false;
      return !relatives(a, b);
    }

    // فيه أحد يقدر يتزوجه؟ الوكيل يقرر بنفسه، فما يطلع تلقائي
    const hasMatch = (p) => !brains[p.id] && !p.spouse && ageOf(p) >= C.MIN_MARRIAGE_AGE && alive().some((o) => !brains[o.id] && canMarry(p, o));

    function marry(a, b) {
      a.spouse = b.id;
      b.spouse = a.id;
      s.stats.marriages++;
      const husband = a.gender === 'm' ? a : b;
      const wife = a.gender === 'm' ? b : a;
      emote(a, 'heart', 240);
      emote(b, 'heart', 240);
      const gift = spendTreasury(100, 'welfare');
      husband.money += gift;

      // بيت الزوجية: القصر إذا عند أحدهم قصر، وإلا بيت فاضي، وإلا عند أهل الزوج
      const parentsHome = (p) => residents(p.home).some((o) => o.id === p.father || o.id === p.mother);
      const inPalace = [husband, wife].find((p) => s.palaces[p.home] && s.palaces[p.home].owner === p.id);
      let home = husband.home;
      if (inPalace) {
        home = inPalace.home;
      } else if (parentsHome(husband)) {
        const vacant = vacantHouses();
        if (vacant.length) home = vacant[0].id;
        else if (!parentsHome(wife)) home = wife.home;
      }
      const oldWifeHome = wife.home;
      husband.home = home;
      wife.home = home;
      if (oldWifeHome && oldWifeHome !== home && residents(oldWifeHome).length === 0) {
        const left = s.houses[oldWifeHome].pantry;
        s.houses[home].pantry.water += left.water;
        s.houses[home].pantry.food += left.food;
        s.houses[oldWifeHome].pantry = { water: 0, food: 0 };
      }
      // عيالها الصغار من زواج سابق يروحون معها
      for (const kidId of wife.children) {
        const kid = s.people[kidId];
        if (kid && ageOf(kid) < C.ADULT_AGE) kid.home = home;
      }
      for (const kidId of husband.children) {
        const kid = s.people[kidId];
        if (kid && ageOf(kid) < C.ADULT_AGE) kid.home = home;
      }
      log('marriage', 'عرس في القرية! تزوّج ' + husband.name + ' و' + wife.name + ' وسكنوا ' + world.places[home].name, [a.id, b.id]);
      emit('marriage', { a: a.id, b: b.id, home });
    }

    function propose(a, toId) {
      const b = s.people[toId];
      if (!b || !canMarry(a, b)) return false;
      if ((a.known[b.id] || 0) < 20) return false;
      marry(a, b);
      return true;
    }

    function meetings() {
      const groups = {};
      for (const p of alive()) {
        if (p.sleeping || ageOf(p) < 3) continue;
        const key = p.loc !== 'out' ? p.loc : 'c' + Math.floor(p.x / 5) + '_' + Math.floor(p.y / 5);
        (groups[key] = groups[key] || []).push(p);
      }
      for (const list of Object.values(groups)) {
        if (list.length < 2) continue;
        for (let i = 0; i < list.length; i++) {
          const a = list[i];
          a.needs.social = clamp(a.needs.social + 5, 0, 100);
          for (let j = i + 1; j < list.length; j++) {
            const b = list[j];
            const first = a.known[b.id] == null;
            const fit = 1.5 - Math.abs(a.temper - b.temper);
            let gain = (2 + r() * 3) * fit;
            const romantic = canMarry(a, b);
            if (romantic) gain += 6;
            a.known[b.id] = clamp((a.known[b.id] || 0) + gain, 0, 100);
            b.known[a.id] = a.known[b.id];
            if (first && ageOf(a) >= 16 && ageOf(b) >= 16) {
              log('meet', (a.gender === 'f' ? 'تعرّفت ' : 'تعرّف ') + a.name + ' على ' + b.name + (a.loc !== 'out' ? ' في ' + world.places[a.loc].name : ''), [a.id, b.id]);
            }
            if (romantic && a.known[b.id] >= C.MARRIAGE_BOND && r() < C.MARRIAGE_CHANCE && !brains[a.id] && !brains[b.id]) marry(a, b);
          }
        }
      }
    }

    // ---- الولادة والموت ----
    function siblingsOf(p) {
      return alive().filter((o) => o.id !== p.id && ((p.father && o.father === p.father) || (p.mother && o.mother === p.mother))).map((o) => o.id);
    }

    function birth(mother) {
      const father = mother.pregnantBy || null; // الأب ممكن يكون توفى أثناء الحمل
      const gender = r() < 0.5 ? 'm' : 'f';
      const namesTaken = new Set();
      for (const id of mother.children) {
        const k = s.people[id];
        if (k) namesTaken.add(k.name);
      }
      if (father) namesTaken.add(father.name);
      const livingFather = father && s.people[father.id];
      namesTaken.add(mother.name);
      const pool = (gender === 'm' ? VQ.MALE_NAMES : VQ.FEMALE_NAMES).filter((n) => !namesTaken.has(n));
      const dad = livingFather || mother;
      const kid = newPerson({
        gender,
        age: 0,
        skill: 0,
        net: VQ.Net.child(r, mother.net, dad.net),
        name: pick(r, pool),
        family: father ? father.family : mother.family,
        fatherName: father ? father.name : '',
        gen: Math.max(mother.gen, livingFather ? livingFather.gen : mother.gen) + 1,
        father: father ? father.id : null,
        mother: mother.id,
        home: mother.home,
      });
      // الجنسية بالدم: الولد مواطن إذا أبوه أو أمه مواطن
      kid.expat = !!(mother.expat && (!dad || dad.expat));
      kid.grandparents = [mother.father, mother.mother, livingFather && livingFather.father, livingFather && livingFather.mother].filter(Boolean);
      kid.siblings = siblingsOf(kid);
      // نسجل الإخوة في الاتجاهين، عشان ما يتزوج أحد خاله أو عمته
      for (const id of kid.siblings) { const sib = s.people[id]; sib.siblings = (sib.siblings || []).concat(kid.id); }
      kid.look.skin = pick(r, [mother.look.skin, livingFather ? livingFather.look.skin : mother.look.skin]);
      mother.children.push(kid.id);
      if (livingFather) livingFather.children.push(kid.id);
      s.stats.births++;
      s.stats.topGen = Math.max(s.stats.topGen, kid.gen);
      placeAtHome(kid);
      emote(mother, 'heart', 120);
      log('birth', 'مولود جديد! ' + (gender === 'm' ? 'ولد اسمه ' : 'بنت اسمها ') + kid.name + ' لـ' + mother.name + (father ? ' و' + father.name : '') + '، من الجيل ' + VQ.ar(kid.gen), [kid.id, mother.id]);
      emit('birth', { id: kid.id });
    }

    function die(p, cause) {
      const age = Math.floor(ageOf(p));
      delete s.people[p.id];
      delete brains[p.id];
      s.stats.deaths++;
      s.graves.push({ name: fullName(p), gender: p.gender, age, gen: p.gen, day: s.day, cause: cause || 'الكبر' });

      // الورث: للزوج أو الزوجة، وإلا للعيال
      const spouse = p.spouse && s.people[p.spouse];
      const kids = p.children.map((id) => s.people[id]).filter(Boolean);
      const heir = spouse || kids.slice().sort((a, b) => ageOf(b) - ageOf(a))[0] || null;
      if (spouse) {
        spouse.spouse = null;
        spouse.money += p.money;
      } else if (kids.length) {
        const share = Math.floor(p.money / kids.length);
        for (const k of kids) k.money += share;
      } else {
        addTreasury(Math.max(0, p.money), 'other');
      }
      // الأملاك تروح للوريث، واللي ما له وريث ترجع للدولة
      for (const id of Object.keys(s.biz)) {
        if (s.biz[id].owner !== p.id) continue;
        s.biz[id].owner = heir ? heir.id : null;
        log('biz', world.places[id].name + (heir ? ' انتقل بالورث إلى ' + heir.name : ' رجع للدولة بعد وفاة صاحبه') + '.', heir ? [heir.id] : []);
      }
      // السجل التجاري ينتقل للوريث الكبير، وإلا يتسكر
      // تنقسم على الورثة الكبار، كل واحد لين حده، والزايد ينباع وفلوسه للورثة
      const firmHeirs = [spouse].concat(kids).filter((h) => h && ageOf(h) >= C.ADULT_AGE);
      const countOf = (h) => Object.values(s.firms).filter((f) => f.owner === h.id).length;
      for (const f of Object.values(s.firms)) {
        if (f.owner !== p.id) continue;
        const to = firmHeirs.filter((h) => countOf(h) < C.MAX_FIRMS).sort((a, b) => countOf(a) - countOf(b))[0];
        if (to) { f.owner = to.id; log('firm', VQ.FIRMS[f.type].name + ' انتقل بالورث إلى ' + to.name + '.', [to.id]); continue; }
        const value = f.capital * f.level * 0.5;
        if (firmHeirs.length) for (const h of firmHeirs) h.money += value / firmHeirs.length;
        fireStaff(f, 'لأنه انباع بعد وفاة صاحبه');
        const co = bourseState().companies.find((c) => c.firm === f.id);
        if (co) delist(co, 'انباعت الشركة بعد وفاة صاحبها');
        delete s.firms[f.id];
        log('firm', VQ.FIRMS[f.type].name + ' حق ' + p.name + (firmHeirs.length ? ' انباع وتقسمت فلوسه على الورثة.' : ' تسكّر لأن ما له وريث.'), []);
      }
      // معاش الأرملة أو الأرمل: نص معاش المتوفى
      if (spouse && p.pension) spouse.survivor = Math.max(spouse.survivor || 0, p.pension * 0.5);
      for (const id of Object.keys(s.palaces)) {
        if (s.palaces[id].owner !== p.id) continue;
        s.palaces[id].owner = heir ? heir.id : null;
        log('wealth', world.places[id].name + (heir ? ' صار ملك ' + heir.name + ' بالورث' : ' صار بدون مالك ومعروض للبيع') + '.', heir ? [heir.id] : []);
      }
      delete traces[p.id];

      for (const other of alive()) delete other.known[p.id];

      // العيال الصغار اللي انيتموا يروحون لأقرب كبير
      const adultAtHome = residents(p.home).some((o) => ageOf(o) >= C.ADULT_AGE);
      if (!adultAtHome) {
        const orphans = residents(p.home);
        const adults = alive().filter((o) => ageOf(o) >= C.ADULT_AGE && o.home);
        const kin = adults.find((o) => orphans.some((c) => relatives(o, c))) || adults[0];
        if (kin) for (const c of orphans) c.home = kin.home;
      }
      if (p.home && residents(p.home).length === 0) s.houses[p.home].pantry = { water: 0, food: 0 };

      log('death', (p.gender === 'f' ? 'توفّيت ' : 'توفّي ') + p.name + ' عن عمر ' + VQ.ar(age) + ' سنة بسبب ' + (cause || 'الكبر') + (p.gender === 'f' ? '. الله يرحمها.' : '. الله يرحمه.'), [p.id]);
      emit('death', { id: p.id, name: p.name });
      if (s.gov.ruler === p.id) succession(p);
      if (alive().length === 0) log('town', 'صارت القرية فاضية من جديد.', []);
    }

    // ---- بداية اليوم ----
    function placeLevel(place) {
      if (VQ.MINE_IDS.includes(place)) { const m = mineSite(place); return m && m.open ? 1 : 0; }
      const stage = VQ.STAGES.find((st) => st && st.place === place && st.place !== 'university');
      if (stage && place !== 'school') return stageOpen(VQ.STAGES.indexOf(stage)) ? 1 : 0;
      const id = VQ.BRANCH_IDS.find((b) => VQ.BRANCHES[b].place === place);
      return id ? branchLevel(id) : 1;
    }
    const ESSENTIAL = ['mining'].concat(VQ.MINE_IDS, ['exchange', 'central', 'oil', 'clinic', 'school', 'school2', 'school3', 'university', 'airport', 'security', 'court', 'farm']);
    function assignJobs() {
      const taken = {};
      for (const p of alive()) if (p.job) taken[p.job.place + ':' + p.job.slot] = true;
      const openJobs = (p) => {
        const skill = p.skill;
        const age = ageOf(p);
        const edu = p.edu || 0;
        const open = firmJobs(p);
        for (const place of Object.keys(VQ.JOBS)) {
          const level = placeLevel(place);
          // تجميد التوظيف: الدولة توقف الوظايف الإدارية لما تكون في عجز، والخدمات الأساسية تبقى
          const frozen = s.gov.freeze && !ESSENTIAL.includes(place) && !(s.biz[place] && s.biz[place].owner);
          VQ.JOBS[place].forEach((job, slot) => {
            if (place === 'mining' && job.title === 'مستكشف' && s.mines && s.mines.revealed >= s.mines.explored.length) return;
            if (frozen || job.appoint || taken[place + ':' + slot] || (job.lvl || 1) > level || (job.minSkill || 0) > skill) return;
            // شروط التوظيف: العمر والشهادة
            if (age < (job.minAge || C.ADULT_AGE) || edu < needEdu(job.edu)) return;
            open.push({ place, slot, title: job.title, wage: job.wage });
          });
        }
        return open;
      };
      // وظايف السجلات التجارية: البسطة تبغي بائع إذا صاحبها عنده شغل ثاني، والمحل دايماً يبغي موظفين
      function firmJobs(p) {
        const list = [];
        const age = ageOf(p);
        for (const f of Object.values(s.firms)) {
          const def = VQ.FIRMS[f.type];
          const tier = VQ.FIRM_TIERS[def.tier];
          const owner = s.people[f.owner];
          if (!owner || owner === p) continue;
          if (!(def.tier === 'shop' || owner.job || ageOf(owner) >= 60)) continue;
          if (f.lastProfit < tier.wage * 0.6) continue; // ما يقدر على راتب
          if (age < tier.minAge || age > tier.maxAge || p.skill < tier.minSkill || (p.edu || 0) < needEdu(tier.edu)) continue;
          const max = def.tier === 'shop' ? tier.staff + f.level - 1 : tier.staff;
          for (let n = 0; n < max; n++) {
            const slot = 1000 + f.id * 10 + n;
            if (taken['firm:' + slot]) continue;
            list.push({ place: 'firm', firm: f.id, slot, title: tier.title + ' في ' + def.name, wage: law('labor') ? Math.max(tier.wage, 40) : tier.wage });
            break;
          }
        }
        return list;
      }
      // صاحب أعلى مهارة يختار أول، والأجر الأعلى يجذب أكثر، مع شوية حظ
      const best = (list) => list.map((j) => [j.wage * (0.6 + 0.8 * r()), j]).sort((a, b) => b[0] - a[0])[0][1];
      const hireable = alive().filter((p) => !p.job && !p.jailUntil && !p.student && ageOf(p) >= C.ADULT_AGE && ageOf(p) < C.RETIRE_AGE).sort((a, b) => b.skill - a.skill);
      for (const p of hireable) {
        // اللي عنده محلات أو ثروة كبيرة مو لازم يدور شغل، بس الأغلب يشتغل
        const open = openJobs(p);
        if (!open.length) continue;
        const job = best(open);
        p.job = job;
        taken[job.place + ':' + job.slot] = true;
        log('job', p.name + (p.gender === 'f' ? ' اشتغلت ' : ' اشتغل ') + jobTitle(p) + (job.place === 'firm' ? ' عند ' + (s.firms[job.firm] && s.people[s.firms[job.firm].owner] ? s.people[s.firms[job.firm].owner].name : '') : ' في ' + world.places[job.place].name), [p.id]);
      }
      // الترقية: المهارة تفتح وظايف أحسن
      for (const p of alive()) {
        if (!p.job || p.id === s.gov.ruler || r() > 0.12 || ageOf(p) >= C.RETIRE_AGE) continue;
        const better = openJobs(p).filter((j) => j.wage > p.job.wage * 1.2);
        if (!better.length) continue;
        const job = best(better);
        delete taken[p.job.place + ':' + p.job.slot];
        p.job = job;
        taken[job.place + ':' + job.slot] = true;
        log('job', p.name + (p.gender === 'f' ? ' ترقّت وصارت ' : ' ترقّى وصار ') + jobTitle(p) + '.', [p.id]);
      }
    }

    // كل صباح تتأكد البلدية إن كل عيلة عندها ماي وأكل يكفيها. العيلة تدفع إذا تقدر، وإلا على البلدية.
    function stockHouses() {
      const discount = 1 - 0.15 * branchLevel('supply');
      const hungry = [];
      for (const h of world.houses.concat(world.palaces)) {
        const list = residents(h.id);
        if (!list.length) continue;
        const pantry = s.houses[h.id].pantry;
        const target = list.length * C.RATION_PER_PERSON;
        const m = market();
        const wantW = Math.max(0, target - pantry.water);
        const wantF = Math.max(0, target - pantry.food);
        if (!wantW && !wantF) continue;
        // المؤونة تنصرف من السوق. إذا السوق فاضي، البيت يبات ناقص
        const water = Math.min(wantW, Math.floor(m.water));
        const food = Math.min(wantF, Math.floor(m.food));
        if (water < wantW || food < wantF) hungry.push(h.id);
        let cost = (water * priceOf('water') + food * priceOf('bread')) * discount;
        m.water -= water;
        m.food -= food;
        pantry.water += water;
        pantry.food += food;
        for (const p of list.slice().sort((a, b) => b.money - a.money)) {
          if (ageOf(p) < C.ADULT_AGE) continue;
          const part = Math.min(cost, Math.max(0, p.money));
          p.money -= part;
          addTreasury(part, 'sales');
          cost -= part;
        }
        spendTreasury(cost, 'welfare'); // المؤونة توصل حتى لو الخزينة فاضية
      }
      const m = market();
      if (hungry.length && !m.famine) {
        m.famine = true;
        log('state', 'شح في السوق: ' + VQ.ar(hungry.length) + ' بيوت ما وصلتها المؤونة كاملة. الناس جوعانة.', []);
      } else if (!hungry.length && m.famine) {
        m.famine = false;
        log('market', 'رجعت المؤونة توصل كل البيوت.', []);
      }
    }

    // كل صباح: المزرعة والآبار تنتج، الأكل يخرب شوي، والقوافل تسد النقص أو تشتري الفايض
    function marketDay() {
      const m = market();
      const se = season();
      const norm = normalStock();
      if ((s.day - 1) % C.DAYS_PER_YEAR === 0) m.yearIndex = [];
      m.food *= 1 - C.SPOIL;
      // اللي اشتغل في المزرعة أمس هو اللي ينتج
      const farmers = alive().filter((p) => p.job && p.job.place === 'farm' && p.paidDay === s.day - 1);
      const food = (C.LAND_YIELD + farmers.reduce((a, p) => a + C.FARM_YIELD * (1 + p.skill / 200), 0)) * se.farm;
      const water = C.WELL_WATER * se.well * (1 + 0.25 * branchLevel('works'));
      m.food += food;
      m.water = Math.min(norm * 2.5, m.water + water); // الخزانات لها حد
      m.made = { food, water };
      m.bought = { food: 0, water: 0 };

      // الاستيراد: التاجر يشتري من برا بسعر أغلى، والفلوس تطلع من البلد
      const grocer = s.biz.grocery && s.biz.grocery.owner && s.people[s.biz.grocery.owner];
      m.imported = { food: 0, water: 0 };
      for (const slot of ['food', 'water']) {
        const gap = norm - m[slot];
        if (gap <= 0) continue;
        const unit = (slot === 'water' ? VQ.ITEMS.water.price : VQ.ITEMS.bread.price) * C.GOODS_COST * C.IMPORT_MARKUP * (1 + 0.1 * s.gov.era) * fxFactor() * Math.max(1, P() * 0.6);
        let qty = Math.min(gap * 0.5, norm * C.IMPORT_CAP); // القوافل تسد نص النقص بس، فيبين الغلا
        // التاجر يستورد على حسابه، واللي ما يقدر عليه تسده الدولة
        let paid = 0;
        if (grocer) {
          const own = Math.min(qty * unit, Math.max(0, grocer.money * 0.5 + s.biz.grocery.till));
          s.biz.grocery.till -= own;
          paid = own;
        }
        paid += spendTreasury(qty * unit - paid, 'imports');
        qty = paid / unit;
        m[slot] += qty;
        m.imported[slot] = qty;
        cbState().flowOut += qty * unit;
      }
      // الفايض من الأكل ينباع للقوافل، دخل من برا
      const surplus = m.food - norm * 2;
      m.exported = 0;
      if (surplus > 0) {
        m.food -= surplus;
        m.exported = surplus;
        addTreasury(surplus * VQ.ITEMS.bread.price * C.GOODS_COST * P(), 'caravans');
        cbState().flowIn += surplus * VQ.ITEMS.bread.price * C.GOODS_COST * P();
      }

      // تنبيه لما يتغير حال السوق
      for (const slot of ['food', 'water']) {
        const mult = priceMult(slot);
        const mood = mult >= 1.7 ? 'high' : mult <= 0.75 ? 'low' : 'ok';
        if (mood !== m.mood[slot]) {
          const what = slot === 'water' ? 'الماي' : 'الأكل';
          if (mood === 'high') log('market', 'غلا ' + what + ' في السوق: السعر صار ×' + VQ.ar(mult.toFixed(1)) + '.', []);
          else if (mood === 'low') log('market', 'رخص ' + what + ': السوق مليان.', []);
          else log('market', 'سعر ' + what + ' رجع طبيعي.', []);
          m.mood[slot] = mood;
        }
      }
      m.yearIndex.push((priceMult('food') + priceMult('water')) / 2);
    }

    // الهجرة: العاطل الفقير يطلع يدور رزقه، والبلد اللي فيها شغل ورخا تجذب ناس من برا
    function priceLevel() {
      const list = market().yearIndex;
      return list.length ? list.reduce((a, b) => a + b, 0) / list.length : 1;
    }
    // اللي يطلع من البلد: يبيع محلاته وقصره للدولة، ويسكّر سجلاته
    function releaseAssets(p) {
      for (const id of Object.keys(s.biz)) if (s.biz[id].owner === p.id) { s.biz[id].owner = null; s.biz[id].till = 0; }
      for (const id of Object.keys(s.palaces)) if (s.palaces[id].owner === p.id) s.palaces[id].owner = null;
      for (const f of Object.values(s.firms)) if (f.owner === p.id) closeFirm(f, 'left');
      p.money = 0;
    }
    function emigrate(p) {
      releaseAssets(p);
      delete s.people[p.id];
      delete brains[p.id];
      delete traces[p.id];
      for (const o of alive()) delete o.known[p.id];
      s.stats.left = (s.stats.left || 0) + 1;
      if (p.home && residents(p.home).length === 0) s.houses[p.home].pantry = { water: 0, food: 0 };
      log('migrate', p.name + ' ' + p.family + (p.gender === 'f' ? ' هاجرت' : ' هاجر') + ' من البلد يدور رزق برا. ما لقى شغل.', []);
      emit('left', { id: p.id, name: p.name });
    }
    function migrationYear() {
      const owns = (p) => Object.values(s.biz).some((b) => b.owner === p.id) || Object.values(s.palaces).some((b) => b.owner === p.id) || Object.values(s.firms).some((f) => f.owner === p.id);
      for (const p of alive()) {
        const age = ageOf(p);
        if (age < C.ADULT_AGE || age > 40 || p.spouse || p.job || p.money >= 60 || owns(p) || p.id === s.gov.ruler) continue;
        const push = C.MIGRATE_OUT * (priceMult('food') > 1.5 ? 1.6 : 1);
        if (r() < push) emigrate(p);
      }
      // التجنيس: الوافد المتزوج من مواطن بعد ٣ سنين، أو المقيم ١٠ سنين بسجل نظيف وبموافقة المجلس
      for (const p of alive()) {
        if (!p.expat) continue;
        p.years = (p.years || 0) + 1;
        const sp = p.spouse && s.people[p.spouse];
        if (sp && !sp.expat && p.years >= 3) { p.expat = false; log('migrate', p.name + (p.gender === 'f' ? ' تجنّست' : ' تجنّس') + ' بالزواج من مواطن' + (sp.gender === 'f' ? 'ة' : '') + '.', [p.id]); continue; }
        if (p.years >= 10 && p.penalty < 1 && r() < 0.3) {
          const v = shuraVote('citizenship', 0.6);
          if (!v || v.pass) { p.expat = false; log('migrate', p.name + ' ' + p.family + (p.gender === 'f' ? ' نالت' : ' نال') + ' الجنسية بعد ' + VQ.ar(p.years) + ' سنين إقامة.', [p.id]); }
        }
      }
      // الخبير يرجع لبلده لما يخلص عقده، إذا صار فيه مواطن يقدر ياخذ مكانه
      for (const p of alive()) {
        if (!p.expat || p.resident || p.spouse || p.id === s.gov.ruler) continue;
        p.contract = (p.contract || 0) + 1;
        if ((p.contract >= 12 || ageOf(p) >= 58) && r() < 0.35) {
          p.job = null;
          releaseAssets(p);
          delete s.people[p.id];
          delete brains[p.id];
          delete traces[p.id];
          for (const o of alive()) delete o.known[p.id];
          log('migrate', p.name + ' ' + p.family + (p.gender === 'f' ? ' خلّصت عقدها ورجعت' : ' خلّص عقده ورجع') + ' لبلده.', []);
          emit('left', { id: p.id, name: p.name });
        }
      }
      // الاستقدام: الوظيفة المهمة اللي ما لقت مواطن مؤهل، الدولة تجيب لها خبير من برا
      const KEY = [['exchange', 2], ['exchange', 1], ['central', 0], ['oil', 0], ['court', 0], ['clinic', 0], ['school', 0], ['school2', 0], ['school3', 0], ['university', 0], ['airport', 1], ['airport', 0], ['mining', 1]];
      for (const [place, slot] of KEY) {
        const job = VQ.JOBS[place][slot];
        if (!job || placeLevel(place) < (job.lvl || 1)) continue;
        if (alive().some((p) => p.job && p.job.place === place && p.job.slot === slot)) continue;
        const local = alive().some((p) => !p.job && !p.student && ageOf(p) >= (job.minAge || C.ADULT_AGE) && ageOf(p) < C.RETIRE_AGE && p.skill >= (job.minSkill || 0) && (p.edu || 0) >= needEdu(job.edu));
        const expats = alive().filter((x) => x.expat && !x.resident).length;
        if (local || alive().length >= C.MAX_POPULATION + 8 || s.treasury < 1500 || expats >= alive().length * 0.3) continue;
        // إذا ما في بيت فاضي، يسكن سكن مشترك في أقل بيت فيه ناس
        const home = vacantHouses().length ? null : world.houses.slice().sort((a, b) => residents(a.id).length - residents(b.id).length)[0].id;
        const gender = r() < 0.6 ? 'm' : 'f';
        const names = gender === 'f' ? VQ.FEMALE_NAMES : VQ.MALE_NAMES;
        const before = s.treasury;
        const age = Math.max(job.minAge || 25, 28) + Math.floor(r() * 12);
        const p = api.addAgent(Object.assign({ quiet: true, gender, age, name: names[Math.floor(r() * names.length)], family: VQ.FAMILY_NAMES[Math.floor(r() * VQ.FAMILY_NAMES.length)], money: 200, skill: Math.max(job.minSkill || 30, 45) + Math.floor(r() * 15) }, home ? { home } : {}));
        s.treasury = before; // الخبير جاي بفلوسه
        spendTreasury(600, 'salaries'); // تذاكر وسكن الاستقدام
        if (!p) continue;
        p.edu = 4;
        p.expat = true;
        p.job = { place, slot, title: job.title, wage: job.wage };
        log('migrate', 'الدولة استقدمت ' + p.name + ' ' + p.family + ' من برا ' + (gender === 'f' ? 'وصارت ' : 'وصار ') + jobTitle(p) + ' في ' + world.places[place].name + '، لأن ما في مواطن مؤهل للحين.', [p.id]);
      }

      // الجذب: شغل فاضي، بيت فاضي، وأسعار معقولة
      const taken = {};
      for (const p of alive()) if (p.job) taken[p.job.place + ':' + p.job.slot] = true;
      let open = 0;
      for (const place of Object.keys(VQ.JOBS)) VQ.JOBS[place].forEach((job, slot) => {
        if (!job.appoint && !job.minSkill && !taken[place + ':' + slot] && (job.lvl || 1) <= placeLevel(place)) open++;
      });
      const cheap = (priceMult('food') + priceMult('water')) / 2 < 1.4;
      let arrivals = open >= 3 && r() < 0.6 ? 1 + (open >= 6 ? 1 : 0) : 0;
      while (arrivals-- > 0 && cheap && vacantHouses().length && alive().length < C.MAX_POPULATION) {
        const gender = r() < 0.55 ? 'm' : 'f';
        const names = gender === 'f' ? VQ.FEMALE_NAMES : VQ.MALE_NAMES;
        const before = s.treasury;
        const p = api.addAgent({ quiet: true, gender, age: 19 + Math.floor(r() * 14), name: names[Math.floor(r() * names.length)], family: VQ.FAMILY_NAMES[Math.floor(r() * VQ.FAMILY_NAMES.length)], money: 60 + Math.floor(r() * 240) });
        s.treasury = before; // الوافد جاي بفلوسه
        if (p) { p.edu = [1, 2, 3, 3, 4, 4][Math.floor(r() * 6)]; p.expat = true; p.resident = true; } // الوافدين جايين بشهاداتهم
        s.stats.arrived = (s.stats.arrived || 0) + 1;
        if (p) log('migrate', p.name + ' ' + p.family + (gender === 'f' ? ' وصلت' : ' وصل') + (branchLevel('airport') ? ' بالطيارة' : '') + ' من برا يدور شغل، و' + (gender === 'f' ? 'سكنت' : 'سكن') + ' في ' + world.places[p.home].name + '.', [p.id]);
      }
    }

    function newDay() {
      s.day++;
      const newYear = (s.day - 1) % C.DAYS_PER_YEAR === 0;
      for (const p of alive()) {
        const age = ageOf(p);

        educationDay(p, age);
        // السفر: الميسور يسافر إذا فيه مطار وتعب من الروتين
        if (!p.tripPlanned && age >= C.ADULT_AGE && !p.student && p.money > 1500 && branchLevel('airport') && r() < 0.03 * branchLevel('airport')) p.tripPlanned = true;
        // التقاعد
        if (p.jailUntil && p.jailUntil <= absMinute()) {
          p.jailUntil = 0;
          log('crime', p.name + (p.gender === 'f' ? ' طلعت' : ' طلع') + ' من السجن.', [p.id]);
        }
        if (p.job && age >= C.RETIRE_AGE && p.id !== s.gov.ruler) {
          log('job', p.name + (p.gender === 'f' ? ' تقاعدت من شغلها كـ' : ' تقاعد من شغله كـ') + jobTitle(p), [p.id]);
          p.job = null;
        }
        if (age >= C.RETIRE_AGE && !p.retired && p.id !== s.gov.ruler) { p.retired = true; grantPension(p); }
        // المعاش من صندوق التقاعد، والضمان الاجتماعي للي ما له معاش
        if (p.survivor) payPension(p, p.survivor);
        if (age >= C.RETIRE_AGE && p.pension) payPension(p, p.pension);
        else if (age >= C.RETIRE_AGE && !p.survivor && !p.expat) p.money += spendTreasury(C.SOCIAL_AID * P(), 'welfare');
        else if (age >= C.ADULT_AGE && !p.job && p.money < 30 * P()) p.money += spendTreasury(15 * P(), 'welfare');

        // مصروف العيال من الأهل
        if (age >= C.SCHOOL_MIN && age < C.ADULT_AGE) {
          const parent = s.people[p.father] || s.people[p.mother];
          if (parent && parent.money > 25) { parent.money -= 2; p.money += 2; }
        }

        // كبر الولد وطلع من بيت أهله؟ يبقى لين يتزوج
        if (Math.floor(age) === C.ADULT_AGE && Math.floor(age - 1 / C.DAYS_PER_YEAR) < C.ADULT_AGE) {
          log('grow', p.name + (p.gender === 'f' ? ' كبرت وصار عمرها ' : ' كبر وصار عمره ') + VQ.ar(C.ADULT_AGE) + ' سنة', [p.id]);
        }

        // الحمل
        if (p.gender === 'f' && p.pregnantUntil && s.day >= p.pregnantUntil) {
          p.pregnantUntil = 0;
          birth(p);
        } else if (
          p.gender === 'f' && p.spouse && s.people[p.spouse] && !p.pregnantUntil && age >= C.MIN_MARRIAGE_AGE && age <= C.MAX_FERTILE_AGE &&
          p.children.length < p.wantKids && alive().length < C.MAX_POPULATION && r() < C.CONCEIVE_CHANCE
        ) {
          p.pregnantUntil = s.day + C.PREGNANCY_DAYS;
          p.pregnantBy = { id: p.spouse, name: s.people[p.spouse].name, family: s.people[p.spouse].family };
          log('family', p.name + ' حامل. مبروك لها ولزوجها!', [p.id]);
        }

        // الموت من الكبر
        if (newYear && age >= 55) {
          const chance = Math.pow((age - 55) / 40, 3);
          if (r() < chance || age >= 98) die(p, 'الكبر');
        }
      }

      marketDay();
      stockHouses();
      airportDay(newYear);
      firmsDay(newYear);
      bourseDay(newYear);
      disputesDay();
      courtDay();
      pensionDay(newYear);
      if (newYear) migrationYear();
      dailyIllness();
      settleBusinesses();
      bankDay();
      oilDay(newYear);
      minesDay(newYear);
      debtDay();
      if (newYear) cbYear();
      if (alive().length) fundDay(newYear);
      if (alive().length) rulerDay(newYear);
      assignJobs();
      learnDay();
      emit('day', { day: s.day });
      if (newYear) emit('year', { year: yearOf() });
    }

    function tick() {
      s.minute++;
      if (s.minute >= C.MINUTES_PER_DAY) {
        s.minute = 0;
        newDay();
      }
      for (const p of alive()) tickPerson(p);
      if (s.minute % 30 === 0) {
        meetings();
        spreadIllness();
      }
    }

    function viewFor(p) {
      return {
        me: {
          id: p.id, name: p.name, fullName: fullName(p), gender: p.gender, age: Math.floor(ageOf(p)), gen: p.gen,
          needs: Object.assign({}, p.needs), health: p.health, illness: p.illness ? p.illness.id : null, money: p.money,
          skill: p.skill, class: classOf(p).id, job: p.job, home: p.home, loc: p.loc,
          spouse: p.spouse, children: p.children.slice(), owned: p.owned.slice(),
          pantry: p.home ? Object.assign({}, s.houses[p.home].pantry) : null,
        },
        time: { minute: s.minute, day: s.day, year: yearOf(), hour: hour() },
        nearby: alive().filter((o) => o.id !== p.id && o.loc === p.loc && (p.loc !== 'out' || Math.hypot(o.x - p.x, o.y - p.y) < 8))
          .map((o) => ({ id: o.id, name: o.name, gender: o.gender, age: Math.floor(ageOf(o)), friendship: p.known[o.id] || 0, canMarry: canMarry(p, o) })),
        places: Object.values(world.places).map((pl) => ({ id: pl.id, name: pl.name, kind: pl.kind })),
        shops: VQ.SHOPS,
        items: VQ.ITEMS,
      };
    }

    // ---- الواجهة اللي يستخدمها الوكلاء واللعبة ----
    const api = {
      world,
      on(fn) { listeners.push(fn); return () => listeners.splice(listeners.indexOf(fn), 1); },
      advance(minutes) { for (let i = 0; i < minutes; i++) tick(); },
      get state() { return s; },
      get people() { return alive(); },
      get year() { return yearOf(); },
      get hour() { return hour(); },
      ageOf,
      fullName,
      jobTitle,
      person,
      residents,
      vacantHouses,
      classOf,
      worthOf,
      activeSites,
      branchLevel,
      isExplored: (x, y) => isExplored(x, y),
      mineSite: (id) => mineSite(id),
      taxRate,
      totalLevels,
      priceOf,
      priceMult,
      judge,
      eduCap,
      debtTotal: () => debtTotal(),
      law: (id) => law(id),
      brokers: () => brokers(),
      regulators: () => regulators(),
      totalLoans: () => totalLoans(),
      creditCeiling: () => creditCeiling(),
      governor: () => governor(),
      lastIncome: () => lastIncome(),
      budgetLines: BUDGET_LINES,
      stageOpen,
      firmAt: (kind, key) => firmAt(kind, key),
      normalStock,
      get season() { return season(); },
      // هل المبنى قايم؟ الأراضي تبقى فاضية لين ينبنى
      buildProgress(id) {
        const b = world.places[id] && world.places[id].b;
        if (!b || !b.plot) return 1;
        if (s.palaces[id]) {
          const pal = s.palaces[id];
          return pal.built ? 1 : pal.started ? pal.done / pal.work : 0;
        }
        if (id === 'school2' || id === 'school3') {
          const want = id === 'school2' ? 2 : 3;
          if (branchLevel('education') >= want) return 1;
          const pr = s.gov.project;
          return pr && pr.branch === 'education' && pr.level === want ? pr.done / pr.work : 0;
        }
        if (b.kind === 'firmshop') {
          // المحل ينبني في نص يوم بعد ما يطلع السجل
          const f = firmAt('lot', id);
          return f ? clamp((absMinute() - (f.openedAt || 0)) / (C.MINUTES_PER_DAY * 0.5), 0.02, 1) : 0;
        }
        const br = s.gov.branches[id];
        const pr = s.gov.project;
        if (br.level > 0) return 1;
        return pr && pr.branch === id ? pr.done / pr.work : 0;
      },
      isUpgrading(placeId) {
        const pr = s.gov.project;
        return !!(pr && pr.level > 1 && VQ.BRANCHES[pr.branch].place === placeId);
      },
      // نشاط الخلايا لهالشخص الحين، للعرض في الدفتر
      netView(id) {
        const p = person(id);
        if (!p) return null;
        const input = sensesOf(p, ageOf(p));
        const { hidden, logits } = VQ.Net.forward(p.net, input);
        return { input, hidden, probs: VQ.Net.softmax(logits), decisions: p.net.decisions };
      },
      buy(id, item, qty) { const p = person(id); return p ? buy(p, item, qty) : { ok: false }; },

      // يضيف ساكن جديد. { name, gender: 'm'|'f', age, family, money, brain }
      addAgent(o) {
        o = o || {};
        const vacant = vacantHouses();
        const home = o.home || (vacant.length ? vacant[0].id : world.houses[Math.floor(r() * world.houses.length)].id);
        const p = newPerson(Object.assign({ money: C.STARTING_MONEY }, o, { home, external: !!o.brain }));
        p.lastSkill = p.skill;
        const starter = Math.min(p.money, s.treasury);
        s.treasury -= starter;
        p.money = starter;
        s.houses[home].pantry.water += 4;
        s.houses[home].pantry.food += 4;
        placeAtHome(p);
        if (o.brain) brains[p.id] = o.brain;
        s.stats.topGen = Math.max(s.stats.topGen, p.gen);
        assignJobs();
        if (!o.quiet) log('arrive', p.name + (p.gender === 'f' ? ' سكنت في ' : ' سكن في ') + world.places[home].name, [p.id]);
        emit('moved', { id: p.id });
        return p;
      },
      removeAgent(id) { delete s.people[id]; delete brains[id]; },
      setBrain(id, fn) { if (fn) brains[id] = fn; else delete brains[id]; },
      act(id, action) {
        const p = person(id);
        if (!p) return false;
        const task = taskFromAction(p, action);
        if (!task) return false;
        finishTask(p);
        p.task = task;
        p.leaving = false;
        return true;
      },
      view(id) { const p = person(id); return p ? viewFor(p) : null; },
      canMarry(a, b) { return canMarry(person(a), person(b)); },
      reset() { s = fresh(); traces = {}; govTraces = []; for (const k of Object.keys(brains)) delete brains[k]; emit('reset', {}); },
      // نقرّب الكسور عشان حجم الحفظ يبقى معقول رغم أوزان الشبكات
      serialize() { return JSON.stringify(s, (k, v) => (typeof v === 'number' && !Number.isInteger(v) ? Math.round(v * 1000) / 1000 : v)); },
      restore(json) {
        const data = JSON.parse(json);
        if (data && data.people) { s = data; ensureState(); emit('reset', {}); return true; }
        return false;
      },
      // سكان البداية: ٤ عوايل و٨ شباب عزاب، ويبقى ٤ بيوت فاضية للي يتزوجون أو للوكلاء
      populateStart() {
        const shuffled = (list) => list.map((v) => [r(), v]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
        const homes = shuffled(world.houses.map((h) => h.id));
        const males = shuffled(VQ.MALE_NAMES);
        const females = shuffled(VQ.FEMALE_NAMES);
        const fams = shuffled(VQ.FAMILY_NAMES);
        const nameFor = (gender) => (gender === 'f' ? females : males).pop();
        const add = (o) => {
          const p = api.addAgent(Object.assign({ quiet: true, name: nameFor(o.gender) }, o));
          // الكبار المؤسسين لهم سنين خدمة قبل
          const a = ageOf(p);
          if (a > 22) { p.service = Math.floor((Math.min(a, C.RETIRE_AGE) - 22) * C.DAYS_PER_YEAR * 0.7); p.wageSum = p.service * 50; }
          p.edu = startEdu(p);
          return p;
        };
        const befriend = (a, b, score) => { a.known[b.id] = score; b.known[a.id] = score; };
        // العوايل تبدأ من طبقات مختلفة: الحاكم، تاجر غني، عيلة متوسطة، وعيلة فقيرة
        const startClass = [
          { money: 1500, mum: 600, skill: 65 },
          { money: 6500, mum: 1200, skill: 60 },
          { money: 700, mum: 300, skill: 40 },
          { money: 40, mum: 15, skill: 12 },
        ];
        let rulerPerson = null;

        for (let i = 0; i < 4; i++) {
          const home = homes.pop();
          const family = fams.pop();
          const cls = startClass[i];
          const father = add({ gender: 'm', age: 32 + Math.floor(r() * 10), family, home, money: cls.money, skill: cls.skill });
          const mother = add({ gender: 'f', age: 28 + Math.floor(r() * 9), family, home, money: cls.mum, skill: cls.skill * 0.8 });
          if (i === 0) rulerPerson = father;
          if (i === 1) { s.biz.bakery.owner = father.id; s.biz.restaurant.owner = father.id; }
          father.spouse = mother.id;
          mother.spouse = father.id;
          befriend(father, mother, 80);
          const kidCount = 2 + Math.floor(r() * 2);
          const kids = [];
          for (let k = 0; k < kidCount; k++) {
            const gender = r() < 0.5 ? 'm' : 'f';
            const kid = add({
              gender, age: 3 + Math.floor(r() * 12), family, home, money: 10, gen: 2,
              father: father.id, mother: mother.id, fatherName: father.name,
            });
            befriend(kid, father, 70);
            befriend(kid, mother, 70);
            kid.siblings = kids.map((x) => x.id);
            for (const sib of kids) { sib.siblings.push(kid.id); befriend(kid, sib, 60); }
            kid.look.skin = r() < 0.5 ? father.look.skin : mother.look.skin;
            father.children.push(kid.id);
            mother.children.push(kid.id);
            kids.push(kid);
          }
          // كل عيلة تبغي عيال بعد
          mother.wantKids = kidCount + 1 + Math.floor(r() * 3);
        }
        const singleMoney = [20, 900, 60, 350, 120, 1600, 40, 220];
        for (let i = 0; i < 8; i++) {
          add({ gender: i % 2 ? 'f' : 'm', age: 19 + Math.floor(r() * 9), family: fams[i % fams.length] || VQ.FAMILY_NAMES[i], home: homes.pop(), money: singleMoney[i], skill: 10 + r() * 45 });
        }
        appointRuler(rulerPerson, 'start');
        updateClassLines();
        s.stats.topGen = Math.max(s.stats.topGen, 2);
        log('town', 'بدأت الحياة في القرية مع ' + VQ.ar(alive().length) + ' ساكن.', []);
      },
    };
    return api;
  }

  VQ.createVillage = createVillage;
})(typeof globalThis !== 'undefined' ? globalThis : this);
