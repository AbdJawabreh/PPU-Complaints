/* مستودع البيانات: لا يعتمد على عناصر الصفحة، ويمكن استبداله بطلبات HTTP لاحقًا. */
(function () {
  const config = window.PPUConfig;
  const examples = [
    { id: 'DEMO-1001', title: 'ملاحظة حول مقاعد إحدى القاعات', service: 'classrooms', location: 'قاعة تجريبية — مبنى A', description: 'يوجد مقعد يحتاج إلى صيانة في هذه القاعة التجريبية.', status: 0, createdAt: '2026-10-08T08:00:00Z', reply: '', isDemo: true },
    { id: 'DEMO-1002', title: 'تحسين نظافة الساحة', service: 'cleanliness', location: 'الساحة الجامعية — موقع تجريبي', description: 'ملاحظة تجريبية حول الحاجة إلى تحسين نظافة الساحة.', status: 1, createdAt: '2026-10-07T09:30:00Z', reply: 'رد تجريبي: أُحيلت الملاحظة إلى الجهة المختصة للمراجعة.', isDemo: true },
    { id: 'DEMO-1003', title: 'ضعف الإنترنت في القاعة', service: 'internet', location: 'مبنى C — قاعة تجريبية', description: 'مثال تجريبي على انقطاع شبكة الإنترنت داخل القاعة.', status: 2, createdAt: '2026-10-06T10:00:00Z', reply: 'رد تجريبي: يجري فحص الشبكة في الموقع المذكور.', isDemo: true },
    { id: 'DEMO-1004', title: 'صيانة إضاءة المكتبة', service: 'facilities', location: 'المكتبة — منطقة تجريبية', description: 'مثال تجريبي على عطل في إضاءة إحدى مناطق المكتبة.', status: 3, createdAt: '2026-10-05T07:45:00Z', reply: 'رد تجريبي: اكتملت صيانة الإضاءة. يمكنك الآن تجربة تقييم المعالجة.', isDemo: true }
  ];
  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) { return fallback; }
  }
  function write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); }
    catch (error) { throw new Error('تعذّر الحفظ في المتصفح. تحقّق من السماح بتخزين بيانات الموقع ووجود مساحة كافية، ثم حاول مجددًا.'); }
  }
  function normalizeId(value) {
    return String(value || '').trim().replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit))).toUpperCase();
  }
  function getComplaints() {
    const records = read(config.storageKey, []);
    if (!Array.isArray(records)) return [];
    return records.filter(item => item && typeof item.id === 'string' && typeof item.title === 'string' && typeof item.description === 'string' && typeof item.location === 'string' && config.services.some(service => service.id === item.service) && Number.isInteger(item.status) && item.status >= 0 && item.status < 4 && Number.isFinite(Date.parse(item.createdAt)))
      .map(item => ({ ...item, isDemo: false }));
  }
  function findComplaint(id) {
    const normalized = normalizeId(id);
    const record = getComplaints().find(item => item.id === normalized) || examples.find(item => item.id === normalized);
    return record ? { ...record } : null;
  }
  function createComplaint(data) {
    if (!data.fullName || !data.major || !data.email || !data.location || !data.title || !data.description || !config.services.some(service => service.id === data.service)) throw new Error('تأكّد من تعبئة جميع الحقول المطلوبة.');
    const records = getComplaints();
    let id;
    do {
      const random = new Uint32Array(2);
      if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(random);
      else { random[0] = Math.floor(Math.random() * 4294967296); random[1] = Math.floor(Math.random() * 4294967296); }
      id = 'PPU-' + new Date().getFullYear() + '-' + Array.from(random, number => number.toString(36).slice(-4).padStart(4, '0')).join('').toUpperCase();
    } while (records.some(item => item.id === id));
    // اختيار الحقول صراحة يمنع حفظ الصور أو أي بيانات واجهة إضافية بالخطأ.
    const complaint = { id, fullName: data.fullName, major: data.major, email: data.email, service: data.service, location: data.location, title: data.title, description: data.description, status: 0, reply: '', createdAt: new Date().toISOString(), isDemo: false };
    write(config.storageKey, [...records, complaint]);
    return { ...complaint };
  }
  function getRating(id) {
    const ratings = read(config.ratingKey, {});
    if (!ratings || typeof ratings !== 'object' || Array.isArray(ratings)) return null;
    const rating = Object.hasOwn(ratings, normalizeId(id)) ? ratings[normalizeId(id)] : null;
    return rating && Number.isInteger(rating.stars) && rating.stars >= 1 && rating.stars <= 5 && ['yes', 'partial', 'no'].includes(rating.resolution) ? rating : null;
  }
  function saveRating(id, rating) {
    const record = findComplaint(id);
    if (!record || record.status !== 3) throw new Error('يمكن تقييم الشكوى بعد حلّها فقط.');
    if (getRating(id)) throw new Error('سبق حفظ تقييم لهذه الشكوى في هذا المتصفح.');
    if (!Number.isInteger(rating.stars) || rating.stars < 1 || rating.stars > 5 || !['yes', 'partial', 'no'].includes(rating.resolution)) throw new Error('اختر عدد النجوم وأجب عن سؤال حل المشكلة.');
    const stored = read(config.ratingKey, {});
    const ratings = stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
    const value = { stars: rating.stars, resolution: rating.resolution, comment: String(rating.comment || '').slice(0, 1000), createdAt: new Date().toISOString() };
    write(config.ratingKey, { ...ratings, [record.id]: value });
    return value;
  }
  window.PPURepository = Object.freeze({ getComplaints, findComplaint, createComplaint, getRating, saveRating, normalizeId, getExamples: () => examples.map(item => ({ ...item })) });
})();
