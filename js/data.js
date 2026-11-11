// بيانات القرية: الأسماء، البضائع، الوظائف. ما فيها أي منطق رسم.
(function (root) {
  const VQ = (root.VQ = root.VQ || {});

  VQ.CONFIG = {
    MINUTES_PER_DAY: 1440,
    DAYS_PER_YEAR: 4, // السنة أربعة أيام لعب، عشان تبين الأجيال بسرعة
    GAME_MINUTES_PER_SECOND: 6, // اليوم الواحد = ٤ دقايق حقيقية على السرعة ×١
    ADULT_AGE: 18,
    RETIRE_AGE: 65,
    SCHOOL_MIN: 6,
    SCHOOL_MAX: 17,
    MIN_MARRIAGE_AGE: 18,
    MAX_FERTILE_AGE: 45,
    MAX_AGE_GAP: 15,
    PREGNANCY_DAYS: 3,
    STARTING_TREASURY: 40000,
    STARTING_MONEY: 150,
    STARTING_TAX: 0.1,
    GOODS_COST: 0.35, // نصيب الجملة من كل بيعة، يرجع لخزينة الدولة
    CARAVAN: 62, // دخل المحل اليومي من القوافل، هذا اللي يدخل فلوس من برا البلدة
    PALACE_COST: 5200,
    PALACE_WORK: 6500,
    LABOR_RATE: 0.1, // أجر دقيقة البناء
    CUSTOMS: 0.3, // جمارك الدولة على القوافل
    ZAKAT: 0.04, // زكاة سنوية على الثروة فوق حد معين
    ZAKAT_MIN: 2000,
    MIN_TAX: 0.08,
    MAX_SHOPS: 3, // أقصى عدد محلات للشخص
    SHOP_PRICE: 3500,
    UPGRADE_PRICE: 1500,
    LOAN_RATE: 0.012, // فايدة القرض في اليوم
    DEPOSIT_RATE: 0.0025, // فايدة الوديعة في اليوم
    MAX_POPULATION: 60,
    CONCEIVE_CHANCE: 0.3, // احتمال الحمل في اليوم للزوجة اللي تبغي عيال
    MARRIAGE_BOND: 60, // المعرفة اللازمة قبل الزواج
    MARRIAGE_CHANCE: 0.2, // احتمال الزواج في كل جلسة بعد ما يتقاربون
    RATION_PER_PERSON: 2, // أقل مخزون ماي وأكل لكل فرد كل صباح
    NEW_ILLNESS_CHANCE: 0.45, // احتمال يمرض أحد من نفسه في اليوم
    // السوق: المخزون يحدد السعر. المزرعة والآبار تنتج، والقوافل تستورد بسعر أغلى
    FARM_YIELD: 9, // أكل ينتجه المزارع الواحد في اليوم
    LAND_YIELD: 12, // أكل من النخل والأرض حتى بدون مزارعين
    WELL_WATER: 70, // ماي الآبار في اليوم، يزيد مع الأشغال
    MARKET_DAYS: 3, // المخزون الطبيعي = استهلاك كم يوم
    IMPORT_MARKUP: 1.5, // المستورد أغلى من المحلي
    IMPORT_CAP: 0.3, // أقصى استيراد في اليوم كنسبة من المخزون الطبيعي
    SPOIL: 0.06, // الأكل اللي يخرب كل يوم
    PRICE_MIN: 0.6,
    PRICE_MAX: 3,
    DOWN_PAYMENT: 0.25, // عربون مشروع الدولة، والباقي مع الشغل
    BUILD_RESERVE: 2500, // احتياطي الرواتب اللي ما يمسه البناء
    MIGRATE_OUT: 0.3,
    // التقاعد: اشتراك من الموظف ومن صاحب العمل، والمعاش حسب سنين الخدمة
    PENSION_EMPLOYEE: 0.05,
    PENSION_EMPLOYER: 0.1,
    PENSION_PER_YEAR: 0.025, // كل سنة خدمة تعطي ٢.٥٪ من متوسط الراتب
    PENSION_MAX: 0.8,
    PENSION_MIN: 15,
    PENSION_RETURN: 0.003, // عائد استثمار الصندوق في اليوم
    SOCIAL_AID: 15, // ضمان اجتماعي للكبير اللي ما له معاش
    MAX_FIRMS: 2, // أقصى عدد سجلات تجارية للشخص
    DISPUTE_CHANCE: 0.35, // احتمال تصير مشكلة بين اثنين في اليوم
    ATTEND_NEEDED: 0.4, // نسبة الحضور اللي تعطي الشهادة
    TOURIST_SPEND: [40, 110], // كم يصرف السايح في البلد
    TOURIST_FEE: 12, // رسوم المغادرة للدولة
    TRIP_COST: [200, 600], // كلفة سفرة للخارج
    OIL_YEAR: [15, 30], // النفط ينكشف بين هالسنين
    OIL_BARRELS: 140, // إنتاج اليوم لكل مستوى إذا الطاقم كامل
    OIL_PRICE: 9, // سعر البرميل العادي بالدرهم
    FUND_SAVE: 0.5, // نسبة الفايض اللي تروح للصندوق السيادي
    FUND_RETURN: 0.006, // عايد الصندوق في اليوم (حوالي ٢.٥٪ بالسنة)
    INFLATION_TARGET: 0.02, // هدف المصرف المركزي للتضخم في السنة
    NEUTRAL_RATE: 0.04, // سعر الفايدة المحايد
    PEG: 3.67, // درهم لكل دولار، ربط ثابت
    GOLD_PRICE: 400, // دولار للأونصة في البداية
    SHARES: 1000, // عدد أسهم كل شركة
    IPO_FLOAT: 0.4, // نسبة الأسهم المطروحة للعامة
    PAYOUT: 0.5, // نسبة الأرباح الموزعة على المساهمين
    VAT: 0.05, // ضريبة القيمة المضافة لما تنطرح
    FUND_GRANT: 0.02, // مكرمة سنوية للمواطنين من الصندوق إذا كبر واجد
  };

  // السنة أربعة أيام، كل يوم موسم. farm للمحصول، well للماي، thirst للعطش
  VQ.SEASONS = [
    { name: 'الربيع', farm: 1.1, well: 1.0, thirst: 1.0 },
    { name: 'القيظ', farm: 0.6, well: 0.7, thirst: 1.45 },
    { name: 'الخريف', farm: 1.0, well: 0.9, thirst: 1.1 },
    { name: 'الشتا', farm: 1.3, well: 1.3, thirst: 0.85 },
  ];

  // الأمراض. care: none يكمل حياته، rest يرتاح في البيت، hospital لازم المستشفى
  // spread احتمال العدوى في كل نص ساعة مع كل شخص قريب، drain نزول الصحة في الدقيقة بدون علاج
  VQ.DISEASES = {
    cold: { name: 'الزكام', days: [1, 2], spread: 0.004, drain: 0.003, care: 'none', immuneDays: 3 },
    flu: { name: 'الإنفلونزا', days: [2, 3], spread: 0.006, drain: 0.018, care: 'rest', immuneDays: 8 },
    pox: { name: 'جدري الماء', days: [2, 3], spread: 0.012, drain: 0.006, care: 'rest', immuneDays: 1000000 },
    pneumonia: { name: 'التهاب رئوي', days: [3, 4], spread: 0, drain: 0.05, care: 'hospital', immuneDays: 4 },
  };

  VQ.MALE_NAMES = ['سالم', 'راشد', 'حمد', 'خالد', 'ناصر', 'عبدالله', 'يوسف', 'جاسم', 'علي', 'محمد', 'أحمد', 'سعيد', 'فهد', 'عيسى', 'إبراهيم', 'حسن', 'مبارك', 'سلطان', 'عمر', 'طارق', 'بدر', 'زايد', 'ماجد', 'هزاع', 'ياسر', 'نواف', 'غانم', 'صقر'];
  VQ.FEMALE_NAMES = ['مريم', 'فاطمة', 'عائشة', 'نورة', 'سارة', 'شيخة', 'موزة', 'حصة', 'لطيفة', 'هند', 'ريم', 'أمل', 'خولة', 'زينب', 'سلمى', 'دانة', 'منى', 'ليلى', 'شما', 'مها', 'أسماء', 'رقية', 'بدرية', 'وضحى', 'جواهر', 'غالية', 'نوف', 'لولوة'];
  VQ.FAMILY_NAMES = ['آل راشد', 'آل سالم', 'الحداد', 'البحار', 'النجار', 'الصياد', 'الخياط', 'الجابر', 'المنصور', 'السعدي'];

  // مظهر الشخصيات
  VQ.SKINS = ['#f2c8a0', '#e0ad82', '#c98f63', '#a9744c', '#86583a'];
  VQ.ROBES_F = [['#7a2e6b', '#54204b'], ['#2b6d8f', '#1d4d67'], ['#a8393f', '#7a282d'], ['#3c7f55', '#2a5a3c'], ['#c6803a', '#955e28'], ['#2b2b3f', '#1b1b2b']];
  VQ.SCARVES = ['#e8dfc9', '#d86f8a', '#3d3d55', '#58b5a6', '#e0b64f', '#8a6fc4'];
  VQ.SHIRTS = ['#d64b4b', '#3f86d1', '#46a86a', '#e0a53c', '#8e62c9', '#e07a3c'];

  // البضائع. pantry: تنحفظ في مخزن البيت. eat: تنستهلك في المكان. keep: تبقى عند الشخص.
  VQ.ITEMS = {
    water: { name: 'ماي', unit: 'قارورة', price: 2, use: 'pantry', slot: 'water', value: 50 },
    dates: { name: 'تمر', unit: 'علبة', price: 3, use: 'pantry', slot: 'food', value: 25 },
    rice: { name: 'عيش', unit: 'كيس', price: 6, use: 'pantry', slot: 'food', value: 55 },
    milk: { name: 'حليب', unit: 'علبة', price: 3, use: 'pantry', slot: 'food', value: 25 },
    bread: { name: 'خبز', unit: 'ربطة', price: 2, use: 'pantry', slot: 'food', value: 30 },
    samoon: { name: 'صمون', unit: 'كيس', price: 3, use: 'pantry', slot: 'food', value: 35 },
    cake: { name: 'كيك', unit: 'قطعة', price: 4, use: 'eat', food: 20, fun: 10 },
    fatayer: { name: 'فطاير', unit: 'صحن', price: 5, use: 'eat', food: 40 },
    machboos: { name: 'مجبوس', unit: 'صحن', price: 12, use: 'eat', food: 90, fun: 12, social: 8 },
    harees: { name: 'هريس', unit: 'صحن', price: 8, use: 'eat', food: 70, social: 5 },
    juice: { name: 'عصير', unit: 'كاس', price: 3, use: 'eat', water: 40, fun: 4 },
    coffee: { name: 'قهوة عربية', unit: 'فنجان', price: 3, use: 'eat', water: 10, energy: 15, social: 18 },
    karak: { name: 'شاي كرك', unit: 'كوب', price: 2, use: 'eat', water: 20, social: 14, fun: 6 },
    luqaimat: { name: 'لقيمات', unit: 'صحن', price: 4, use: 'eat', food: 20, fun: 8 },
    football: { name: 'كورة قدم', unit: 'حبة', price: 25, use: 'keep', fun: 30 },
    domino: { name: 'دومينو', unit: 'علبة', price: 15, use: 'keep', fun: 25 },
    carrom: { name: 'كيرم', unit: 'لوح', price: 60, use: 'keep', fun: 35 },
    console: { name: 'جهاز ألعاب', unit: 'جهاز', price: 180, use: 'keep', fun: 50 },
    bicycle: { name: 'سيكل', unit: 'سيكل', price: 120, use: 'keep', fun: 40 },
    arcadeRound: { name: 'جولة لعب', unit: 'جولة', price: 5, use: 'eat', fun: 45, social: 6 },
    thobe: { name: 'ثوب', unit: 'قطعة', price: 40, use: 'keep', fun: 12 },
    abaya: { name: 'عباية', unit: 'قطعة', price: 50, use: 'keep', fun: 12 },
    sandals: { name: 'نعال', unit: 'زوج', price: 10, use: 'keep', fun: 4 },
    novel: { name: 'رواية', unit: 'كتاب', price: 12, use: 'keep', fun: 22 },
    stories: { name: 'قصص أطفال', unit: 'كتاب', price: 8, use: 'keep', fun: 20 },
    checkup: { name: 'كشف طبي', unit: 'زيارة', price: 15, use: 'eat', health: 40 },
    medicine: { name: 'دوا', unit: 'علبة', price: 8, use: 'eat', health: 20 },
    treatment: { name: 'علاج وتنويم', unit: 'حالة', price: 20, use: 'eat', health: 20 },
  };

  VQ.SHOPS = {
    grocery: ['water', 'rice', 'dates', 'milk'],
    bakery: ['bread', 'samoon', 'fatayer', 'cake'],
    restaurant: ['machboos', 'harees', 'juice'],
    cafe: ['coffee', 'karak', 'luqaimat'],
    toys: ['football', 'domino', 'carrom', 'bicycle', 'console'],
    arcade: ['arcadeRound'],
    clothes: ['thobe', 'abaya', 'sandals'],
    books: ['novel', 'stories'],
    clinic: ['checkup', 'medicine', 'treatment'],
  };

  // فروع الدولة. level 0 يعني لسه ما انبنى. كل فرع يتطور لين المستوى ٣.
  // needs: فرع لازم يكون موجود قبله. cost لكل مستوى، work دقايق بناء لكل مستوى.
  VQ.BRANCHES = {
    hall: { name: 'الديوان', place: 'hall', start: 1, cost: 4000, work: 5000, desc: 'مقر الحاكم وإدارة الدولة' },
    health: { name: 'الصحة', place: 'clinic', start: 1, cost: 3500, work: 4500, desc: 'علاج أسرع ووفيات أقل' },
    education: { name: 'التعليم', place: 'school', start: 1, cost: 3000, work: 4500, desc: 'مهارة أعلى للعيال والكبار' },
    finance: { name: 'المالية', place: 'finance', start: 0, cost: 2600, work: 4000, desc: 'تحصيل ضرايب أحسن' },
    works: { name: 'الأشغال', place: 'works', start: 0, cost: 2800, work: 4000, desc: 'البناء يخلص أسرع' },
    supply: { name: 'التموين', place: 'supply', start: 0, cost: 2600, work: 4000, desc: 'مؤونة أرخص للبيوت' },
    security: { name: 'الأمن', place: 'security', start: 1, cost: 3000, work: 4500, desc: 'يقبض على السراق' },
    court: { name: 'القضاء', place: 'court', start: 1, needs: 'security', cost: 3200, work: 4500, desc: 'أحكام وغرامات تردع الجريمة' },
    bank: { name: 'المصرف', place: 'bank', start: 0, needs: 'finance', cost: 4200, work: 5000, desc: 'ودايع بفايدة وقروض للتجارة' },
    university: { name: 'الجامعة', place: 'university', start: 0, needs: 'education', needsLevel: 3, cost: 4500, work: 6000, desc: 'شهادات جامعية للوظايف العالية' },
    exchange: { name: 'البورصة', place: 'exchange', start: 0, needs: 'central', cost: 5000, work: 5500, desc: 'سوق الأسهم: الشركات تجمع رأس مال والناس تستثمر' },
    central: { name: 'المصرف المركزي', place: 'central', start: 0, needs: 'bank', cost: 4800, work: 5500, desc: 'استقرار الأسعار والفايدة والعملة والرقابة على المصرف' },
    oil: { name: 'شركة النفط', place: 'oil', start: 0, needs: 'works', cost: 6000, work: 6500, desc: 'تصدير النفط، أكبر دخل للدولة لما تشتغل' },
    airport: { name: 'المطار', place: 'airport', start: 0, needs: 'works', cost: 5000, work: 7000, desc: 'سياح يصرفون في البلد، وسفر للناس' },
  };
  // مراحل التعليم: الابتدائي من ٦، الإعدادي من ١٢، الثانوي من ١٥، الجامعة من ١٨
  // need: الفرع ومستواه اللي يفتح المرحلة
  VQ.STAGES = [
    null,
    { name: 'الابتدائية', place: 'school', from: 6, to: 11, need: ['education', 1] },
    { name: 'الإعدادية', place: 'school2', from: 12, to: 14, need: ['education', 2] },
    { name: 'الثانوية', place: 'school3', from: 15, to: 17, need: ['education', 3] },
    { name: 'الجامعة', place: 'university', from: 18, to: 21, need: ['university', 1] },
  ];
  VQ.EDU_NAMES = ['بدون شهادة', 'ابتدائي', 'إعدادي', 'ثانوي', 'جامعي'];
  VQ.BRANCH_IDS = Object.keys(VQ.BRANCHES);

  // السجل التجاري: الفقير يبدأ ببسطة، والمتوسط بشغل من البيت، والغني يفتح محل
  // capital رأس المال، fee رسوم السجل، price سعر البيعة، demand احتمال يشتري الواحد في اليوم
  // need وش تعطي الزبون، cogs كلفة البضاعة من البيعة، cap أقصى زباين في اليوم، trade دخل من برا البلد
  VQ.FIRM_TIERS = {
    // staff: كم موظف، wage: الراتب، وشروط التوظيف: العمر والمهارة والشهادة
    stall: { name: 'بسطة', where: 'الساحة', rent: 2, staff: 1, title: 'بائع', wage: 30, minAge: 18, maxAge: 60, minSkill: 0, edu: 0 },
    home: { name: 'مشروع منزلي', where: 'البيت', rent: 0, staff: 1, title: 'مساعد', wage: 32, minAge: 18, maxAge: 60, minSkill: 10, edu: 1 },
    shop: { name: 'محل', where: 'السوق', rent: 0.006, staff: 2, title: 'موظف مبيعات', wage: 48, minAge: 20, maxAge: 55, minSkill: 25, edu: 2 },
  };
  VQ.FIRMS = {
    veg: { name: 'بسطة خضار وفواكه', tier: 'stall', capital: 90, fee: 15, price: 3, demand: 0.35, need: { food: 15 }, cogs: 0.55, cap: 14 },
    karakStall: { name: 'بسطة كرك', tier: 'stall', capital: 60, fee: 15, price: 2, demand: 0.45, need: { social: 10, water: 10 }, cogs: 0.4, cap: 16 },
    usedClothes: { name: 'بسطة ملابس مستعملة', tier: 'stall', capital: 80, fee: 15, price: 5, demand: 0.12, need: { fun: 6 }, cogs: 0.5, cap: 8 },
    toyStall: { name: 'بسطة ألعاب', tier: 'stall', capital: 70, fee: 15, price: 3, demand: 0.2, need: { fun: 10 }, cogs: 0.5, cap: 10, kids: true },
    sweets: { name: 'حلويات من البيت', tier: 'home', capital: 350, fee: 50, price: 5, demand: 0.25, need: { food: 10, fun: 8 }, cogs: 0.4, cap: 14 },
    tailor: { name: 'خياطة من البيت', tier: 'home', capital: 450, fee: 50, price: 14, demand: 0.07, need: { fun: 12 }, cogs: 0.35, cap: 6 },
    barber: { name: 'صالون حلاقة', tier: 'home', capital: 600, fee: 60, price: 6, demand: 0.15, need: { social: 8, fun: 6 }, cogs: 0.15, cap: 12 },
    perfume: { name: 'محل عطور وبخور', tier: 'shop', capital: 2600, fee: 250, price: 28, demand: 0.05, need: { fun: 18, social: 6 }, cogs: 0.55, cap: 12, trade: 35 },
    pharmacy: { name: 'صيدلية', tier: 'shop', capital: 3200, fee: 300, price: 9, demand: 0.12, need: { health: 10 }, cogs: 0.5, cap: 16, trade: 15 },
    electronics: { name: 'محل إلكترونيات', tier: 'shop', capital: 4500, fee: 350, price: 55, demand: 0.03, need: { fun: 30 }, cogs: 0.6, cap: 8, trade: 45 },
    furniture: { name: 'معرض أثاث', tier: 'shop', capital: 5500, fee: 400, price: 75, demand: 0.02, need: { fun: 25 }, cogs: 0.55, cap: 6, trade: 50 },
    gold: { name: 'محل ذهب ومجوهرات', tier: 'shop', capital: 9000, fee: 600, price: 140, demand: 0.012, need: { fun: 35, social: 10 }, cogs: 0.65, cap: 5, trade: 110, rich: true },
  };
  VQ.FIRM_IDS = Object.keys(VQ.FIRMS);
  // الدستور والقوانين. start: يصدر مع تأسيس الدولة، needs: [فرع، مستوى] لازم قبل ما ينطرح
  VQ.LAW_GROUPS = ['دستورية وسيادية', 'النظام العام والأمن', 'اقتصادية ومالية', 'اجتماعية وعمل', 'خدمات وتنمية'];
  VQ.LAWS = [
    { id: 'constitution', group: 0, name: 'الدستور', desc: 'نظام الحكم والفصل بين السلطات الثلاث. يصدر مع أول مجلس شورى', shura: true },
    { id: 'nationality', group: 0, name: 'قانون الجنسية والإقامة', desc: 'الجنسية بالدم، والتجنيس بالزواج أو الإقامة', start: true },
    { id: 'elections', group: 0, name: 'قانون الانتخاب', desc: 'انتخاب مجلس الشورى كل ٤ سنين', shura: true },
    { id: 'penal', group: 1, name: 'قانون العقوبات', desc: 'السجن والغرامة على السرقة', start: true },
    { id: 'procedure', group: 1, name: 'قانون الإجراءات الجزائية', desc: 'توقيف محدود ومحاكمة عادلة: دقة الأحكام أعلى', needs: ['court', 2] },
    { id: 'defense', group: 1, name: 'قانون الدفاع والأمن القومي', desc: 'حرس حدود يوقف التهريب اللي ياكل من الجمارك', needs: ['security', 3] },
    { id: 'tax', group: 2, name: 'قانون الضرايب والجمارك', desc: 'ضريبة الدخل والأرباح والجمارك على القوافل', start: true },
    { id: 'property', group: 2, name: 'قانون حماية الملكية', desc: 'الناس يستثمرون أكثر والمحلات تبيع أكثر', needs: ['court', 1] },
    { id: 'commerce', group: 2, name: 'قانون التجارة والشركات ومنع الاحتكار', desc: 'محل واحد لكل تاجر، والمفلس يحتفظ بجزء من عدته', needs: ['finance', 1] },
    { id: 'consumer', group: 2, name: 'قانون حماية المستهلك', desc: 'سقف للغلا وتفتيش يكشف الغش التجاري', needs: ['supply', 1] },
    { id: 'markets', group: 2, name: 'قانون سوق المال', desc: 'يسمح بتأسيس البورصة وطرح الأسهم', needs: ['central', 1] },
    { id: 'labor', group: 3, name: 'قانون العمل', desc: 'حد أدنى للأجور، وتعويض نهاية خدمة لما ينفصل العامل', needs: ['hall', 2] },
    { id: 'personal', group: 3, name: 'قانون الأحوال الشخصية', desc: 'الزواج والميراث ورعاية الأيتام', start: true },
    { id: 'social', group: 3, name: 'قانون الضمان الاجتماعي', desc: 'التقاعد والضمان للكبار والعاطلين', start: true },
    { id: 'compedu', group: 4, name: 'قانون التعليم الإلزامي', desc: 'ما يقدر أحد يطلّع ولده من المدرسة يشتغل', needs: ['education', 2] },
    { id: 'health', group: 4, name: 'قانون الصحة العامة', desc: 'حجر صحي وتطعيم: العدوى أقل', needs: ['health', 2] },
    { id: 'environment', group: 4, name: 'قانون حماية البيئة', desc: 'تلوث النفط ينزل للثلث، والإنتاج ينقص شوي', oil: true },
  ];

  VQ.ERAS = [{ min: 0, name: 'قرية' }, { min: 7, name: 'بلدة' }, { min: 13, name: 'مدينة' }, { min: 20, name: 'دولة مزدهرة' }];

  // الطبقات حسب الثروة (الفلوس والمحلات والقصر)
  VQ.CLASSES = [
    { id: 'poor', name: 'فقير', min: -Infinity, pct: 0 },
    { id: 'low', name: 'محدود الدخل', min: 250, pct: 0.2 },
    { id: 'middle', name: 'متوسط', min: 900, pct: 0.42 },
    { id: 'wealthy', name: 'ميسور', min: 3000, pct: 0.75 },
    { id: 'rich', name: 'غني', min: 8000, pct: 0.9 },
  ];

  // وش تقدر الخلايا العصبية تختار في الوقت الفاضي
  VQ.ACTIONS = ['overtime', 'labor', 'study', 'social', 'fun', 'shop', 'rest', 'invest', 'steal'];
  VQ.ACTION_NAMES = { overtime: 'شغل زيادة', labor: 'بناء', study: 'دراسة', social: 'ناس', fun: 'ترفيه', shop: 'تسوق', rest: 'راحة', invest: 'استثمار', steal: 'سرقة' };

  // الوظايف في كل مكان. minSkill أقل مهارة، lvl مستوى الفرع اللي تفتح عنده
  VQ.JOBS = {
    hall: [{ title: 'الحاكم', wage: 130, appoint: true }, { title: 'وزير الديوان', wage: 80, minSkill: 45, edu: 4, minAge: 30 }, { title: 'كاتب الديوان', wage: 45, minSkill: 15, edu: 2 }, { title: 'مستشار', wage: 95, minSkill: 55, lvl: 2, edu: 4, minAge: 35 }, { title: 'موظف الديوان', wage: 45, lvl: 3, edu: 3 }],
    site: [{ title: 'بنّاء', wage: 40 }, { title: 'بنّاء', wage: 40 }, { title: 'بنّاء', wage: 40 }, { title: 'بنّاء', wage: 40 }],
    finance: [{ title: 'وزير المالية', wage: 85, minSkill: 50, edu: 4, minAge: 30 }, { title: 'محاسب', wage: 55, minSkill: 30, edu: 3 }, { title: 'محاسب', wage: 55, minSkill: 30, lvl: 2, edu: 3 }],
    works: [{ title: 'مهندس', wage: 75, minSkill: 45, edu: 4 }, { title: 'بنّاء', wage: 42 }, { title: 'بنّاء', wage: 42 }, { title: 'مهندس', wage: 75, minSkill: 45, lvl: 2, edu: 4 }, { title: 'بنّاء', wage: 42, lvl: 3 }],
    supply: [{ title: 'مدير التموين', wage: 60, minSkill: 35, edu: 3 }, { title: 'موظف التموين', wage: 38 }],
    security: [{ title: 'ضابط', wage: 65, minSkill: 30, edu: 3, minAge: 21 }, { title: 'شرطي', wage: 42, edu: 2 }, { title: 'شرطي', wage: 42, lvl: 2, edu: 2 }, { title: 'شرطي', wage: 42, lvl: 3, edu: 2 }],
    court: [{ title: 'قاضي', wage: 90, minSkill: 40, edu: 4, minAge: 30 }, { title: 'كاتب المحكمة', wage: 45, minSkill: 20, edu: 3 }],
    bank: [{ title: 'مدير المصرف', wage: 95, minSkill: 55, edu: 4, minAge: 30 }, { title: 'صرّاف', wage: 55, minSkill: 30, edu: 3 }, { title: 'صرّاف', wage: 55, minSkill: 30, lvl: 2, edu: 3 }],
    grocery: [{ title: 'بقّال', wage: 40 }, { title: 'مساعد بقّال', wage: 35 }],
    bakery: [{ title: 'خبّاز', wage: 40 }, { title: 'مساعد خبّاز', wage: 35 }],
    restaurant: [{ title: 'طبّاخ', wage: 45 }, { title: 'طبّاخ', wage: 45 }, { title: 'نادل', wage: 35 }],
    cafe: [{ title: 'قهوجي', wage: 38 }, { title: 'قهوجي', wage: 38 }],
    toys: [{ title: 'بائع ألعاب', wage: 40 }],
    arcade: [{ title: 'مشغّل الصالة', wage: 38 }],
    clothes: [{ title: 'خيّاط', wage: 42 }],
    books: [{ title: 'أمين المكتبة', wage: 40 }],
    school: [{ title: 'معلّم', wage: 55, minSkill: 25, edu: 3 }, { title: 'معلّم', wage: 55, minSkill: 25, edu: 3 }, { title: 'مدير المدرسة', wage: 70, minSkill: 40, edu: 4, minAge: 30 }, { title: 'معلّم', wage: 55, minSkill: 25, lvl: 2, edu: 3 }],
    school2: [{ title: 'معلّم', wage: 58, minSkill: 30, edu: 4 }, { title: 'معلّم', wage: 58, minSkill: 30, edu: 4 }, { title: 'مدير المدرسة', wage: 72, minSkill: 42, edu: 4, minAge: 30 }],
    school3: [{ title: 'معلّم', wage: 62, minSkill: 35, edu: 4 }, { title: 'معلّم', wage: 62, minSkill: 35, edu: 4 }, { title: 'مدير المدرسة', wage: 75, minSkill: 45, edu: 4, minAge: 30 }],
    university: [{ title: 'أستاذ جامعي', wage: 95, minSkill: 50, edu: 4, minAge: 28 }, { title: 'أستاذ جامعي', wage: 95, minSkill: 50, edu: 4, minAge: 28 }, { title: 'عميد الجامعة', wage: 115, minSkill: 60, edu: 4, minAge: 40 }, { title: 'أستاذ جامعي', wage: 95, minSkill: 50, edu: 4, minAge: 28 }],
    exchange: [{ title: 'رئيس هيئة السوق', wage: 110, minSkill: 50, edu: 4, minAge: 35 }, { title: 'مراقب السوق', wage: 80, minSkill: 40, edu: 4 }, { title: 'وسيط مالي', wage: 70, minSkill: 35, edu: 3 }, { title: 'وسيط مالي', wage: 70, minSkill: 35, edu: 3, lvl: 2 }, { title: 'مراقب السوق', wage: 80, minSkill: 40, edu: 4, lvl: 3 }],
    central: [{ title: 'محافظ المصرف المركزي', wage: 120, minSkill: 55, edu: 4, minAge: 35 }, { title: 'اقتصادي', wage: 90, minSkill: 45, edu: 4 }, { title: 'مفتش بنوك', wage: 70, minSkill: 35, edu: 3 }, { title: 'اقتصادي', wage: 90, minSkill: 45, edu: 4, lvl: 2 }, { title: 'مفتش بنوك', wage: 70, minSkill: 35, edu: 3, lvl: 3 }],
    oil: [{ title: 'مهندس بترول', wage: 110, minSkill: 50, edu: 4, minAge: 25 }, { title: 'فني حفر', wage: 70, minSkill: 30, edu: 3 }, { title: 'عامل حقل', wage: 55, edu: 2 }, { title: 'عامل حقل', wage: 55, edu: 2 }, { title: 'مهندس بترول', wage: 110, minSkill: 50, edu: 4, minAge: 25, lvl: 2 }, { title: 'عامل حقل', wage: 55, edu: 2, lvl: 2 }, { title: 'فني حفر', wage: 70, minSkill: 30, edu: 3, lvl: 3 }, { title: 'عامل حقل', wage: 55, edu: 2, lvl: 3 }],
    airport: [{ title: 'مدير المطار', wage: 100, minSkill: 50, edu: 4, minAge: 30 }, { title: 'مراقب جوي', wage: 85, minSkill: 45, edu: 4 }, { title: 'موظف جوازات', wage: 50, edu: 3 }, { title: 'موظف جوازات', wage: 50, edu: 3 }, { title: 'عامل أرضي', wage: 40 }, { title: 'عامل أرضي', wage: 40 }, { title: 'مضيف طيران', wage: 60, edu: 3, minAge: 20, lvl: 2 }, { title: 'مضيف طيران', wage: 60, edu: 3, minAge: 20, lvl: 2 }],
    clinic: [{ title: 'طبيب', wage: 90, minSkill: 40, edu: 4, minAge: 25 }, { title: 'ممرّض', wage: 50, edu: 3 }, { title: 'ممرّض', wage: 50, edu: 3 }, { title: 'طبيب', wage: 90, minSkill: 50, lvl: 2, edu: 4, minAge: 25 }, { title: 'ممرّض', wage: 50, lvl: 3, edu: 3 }],
    farm: [{ title: 'مزارع', wage: 42 }, { title: 'مزارع', wage: 42 }, { title: 'مزارع', wage: 42 }, { title: 'مزارع', wage: 42 }],
  };

  // ٠١٢٣ بدل 0123
  VQ.ar = function (n) {
    return String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
