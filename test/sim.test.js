// اختبار سريع: يشغّل المحاكاة ٩٠ سنة بدون متصفح ويتأكد إن القرية ما انقرضت
const assert = require('assert');
['data', 'world', 'brain', 'sim'].forEach((f) => require('../js/' + f + '.js'));
const VQ = globalThis.VQ;
for (const seed of [1, 7]) {
  const v = VQ.createVillage(VQ.buildWorld(), seed);
  v.populateStart();
  const C = VQ.CONFIG;
  v.advance(90 * C.DAYS_PER_YEAR * C.MINUTES_PER_DAY);
  const pop = v.people.length;
  assert(pop > 0, 'القرية انقرضت');
  assert(Number.isFinite(v.state.treasury), 'الخزينة مو رقم');
  const m = v.state.market;
  assert(m.food >= 0 && m.water >= 0, 'مخزون السوق سالب');
  assert(Number.isFinite(v.state.pension.fund) && v.state.pension.fund >= 0, 'صندوق التقاعد غلط');
  assert(v.state.court.closed > 0, 'المحكمة ما حكمت ولا قضية');
  assert(v.state.stats.built > 0, 'الدولة ما بنت شي');
  for (const p of v.people) assert(Number.isFinite(p.money), 'فلوس مو رقم: ' + p.name);
  for (const p of v.people) if (p.job && p.job.place === 'firm') assert(v.state.firms[p.job.firm], 'موظف في سجل مسكّر: ' + p.name);
  assert(v.people.some((p) => (p.edu || 0) >= 2), 'ما أحد خلّص الإعدادي');
  assert(v.state.budget && Number.isFinite(v.state.budget.forecast), 'ما في موازنة');
  assert(Number.isFinite(v.debtTotal()) && v.debtTotal() <= v.lastIncome() * 1.6 + 5000, 'الدين فوق السقف');
  assert(v.state.shura && v.state.shura.votes > 0, 'مجلس الشورى ما صوت');
  assert(Number.isFinite(v.state.cb.cpi) && v.state.cb.cpi > 0.3 && v.state.cb.cpi < 50, 'مؤشر الأسعار خرب');
  assert(Object.keys(v.state.laws).length >= 8, 'قوانين قليلة');
  for (const co of v.state.bourse.companies) assert(Number.isFinite(co.price) && co.price > 0, 'سعر سهم غلط');
  for (const id of Object.keys(VQ.ITEMS)) assert(Number.isFinite(v.priceOf(id)) && v.priceOf(id) > 0, 'سعر غلط: ' + id);
  console.log(`seed ${seed}: سنة ${v.year}، السكان ${pop}، أعلى جيل ${v.state.stats.topGen}، وصلوا ${v.state.stats.arrived || 0} وهاجروا ${v.state.stats.left || 0}، سجلات ${Object.keys(v.state.firms).length}، قضايا ${v.state.court.closed}، تقاعد ${Math.round(v.state.pension.fund)}، تطور ${v.totalLevels()}/${VQ.BRANCH_IDS.length * 3}، سياح ${v.state.airport.lastTourists}، نفط ${Math.round(v.state.oil.lastRevenue)}، صندوق ${Math.round(v.state.fund.balance)}، ضريبة ${Math.round(v.state.gov.tax * 100)}٪، دين ${Math.round(v.debtTotal())}، أسعار ×${v.state.cb.cpi.toFixed(2)}، فايدة ${(v.state.cb.rate * 100).toFixed(1)}٪، قوانين ${Object.keys(v.state.laws).length}، أسهم ${v.state.bourse.companies.length}، مؤشر ${Math.round(v.state.bourse.index)}، أصدرت ${Math.round(v.state.debt.issued)}، تصويتات ${v.state.shura.votes}، جامعيين ${v.people.filter((p) => p.edu === 4).length}، أكل ×${v.priceMult('food').toFixed(2)} ماي ×${v.priceMult('water').toFixed(2)}`);
}
console.log('نجح ✓');
