const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const path = require('node:path');

function setup() {
  const data = new Map();
  const context = vm.createContext({ console, crypto: webcrypto, localStorage: { getItem: key => data.get(key) || null, setItem: (key, value) => data.set(key, value) } });
  context.window = context;
  for (const file of ['config.js', 'storage.js', 'assistant.js']) vm.runInContext(readFileSync(path.join(__dirname, '../js', file), 'utf8'), context);
  return context;
}
const complaint = { fullName: 'طالب تجريبي', major: 'علم الحاسوب', email: 'demo@example.edu', service: 'internet', location: 'مبنى C', title: 'انقطاع الإنترنت', description: 'ملاحظة تجريبية حول انقطاع الاتصال.' };

test('شكاوى المستخدم لها أرقام فريدة، وتبدأ بإرسال دون رد، ولا تُحفظ الصور', () => {
  const { PPURepository: repo, localStorage, PPUConfig: config } = setup();
  const first = repo.createComplaint({ ...complaint, image: 'data:image/png;base64,private-image' });
  const second = repo.createComplaint(complaint);
  assert.notEqual(first.id, second.id);
  assert.equal(first.status, 0);
  assert.equal(first.reply, '');
  assert.equal(repo.findComplaint(first.id).isDemo, false);
  assert.equal(localStorage.getItem(config.storageKey).includes('base64'), false);
  assert.equal(repo.getComplaints().length, 2);
});
test('الأمثلة منفصلة عن بيانات المستخدم والبحث لا يخترع نتيجة', () => {
  const { PPURepository: repo } = setup();
  assert.equal(repo.getComplaints().length, 0);
  assert.equal(repo.findComplaint(' demo-١٠٠٤ ').status, 3);
  assert.equal(repo.findComplaint('DEMO-1004').isDemo, true);
  assert.equal(repo.findComplaint('PPU-UNKNOWN'), null);
});
test('التقييم بعد الحل فقط، مرة واحدة، دون تغيير الحالة', () => {
  const { PPURepository: repo } = setup();
  assert.throws(() => repo.saveRating('DEMO-1003', { stars: 5, resolution: 'yes' }));
  assert.throws(() => repo.saveRating('DEMO-1004', { stars: 0, resolution: 'yes' }));
  repo.saveRating('DEMO-1004', { stars: 4, resolution: 'partial', comment: 'تقييم تجريبي' });
  assert.equal(repo.getRating('DEMO-1004').stars, 4);
  assert.throws(() => repo.saveRating('DEMO-1004', { stars: 1, resolution: 'no' }));
  assert.equal(repo.findComplaint('DEMO-1004').status, 3);
});
test('تعذّر التخزين يظهر كخطأ دون الادعاء بحفظ الشكوى', () => {
  const context = setup();
  context.localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
  assert.throws(() => context.PPURepository.createComplaint(complaint), /تعذّر الحفظ/);
  assert.equal(context.PPURepository.getComplaints().length, 0);
});
test('المساعد يستخرج الخدمة والموقع ويحافظ على كلام الطالب', () => {
  const { PPUAssistant: assistant } = setup();
  const text = 'الإنترنت في مبنى C سيئ وبفصل كثير';
  const response = assistant.createSession().respond(text);
  assert.equal(response.draft.service, 'internet');
  assert.equal(response.draft.location, 'مبنى C');
  assert.equal(response.draft.title, 'ضعف وانقطاع الإنترنت في مبنى C');
  assert.ok(response.draft.description.includes(text));
});
test('المساعد يسأل عن الخدمة والموقع ويتذكر الملاحظة الأصلية', () => {
  const session = setup().PPUAssistant.createSession();
  session.respond('ساعدني أقدّم شكوى');
  const clarification = session.respond('أحتاج تحسين هذه الخدمة');
  assert.ok(clarification.choices);
  assert.ok(session.respond('الإنترنت').text.includes('أين'));
  const response = session.respond('مبنى C');
  assert.equal(response.draft.service, 'internet');
  assert.equal(response.draft.location, 'مبنى C');
  assert.ok(response.draft.description.includes('أحتاج تحسين هذه الخدمة'));
});
test('المساعد يبحث محليًا ويعرض الخيارات عند عدم فهم الرسالة', () => {
  const session = setup().PPUAssistant.createSession();
  assert.ok(session.respond('مرحبًا').choices);
  session.respond('كيف أتابع شكوتي؟');
  assert.ok(session.respond('DEMO-1004').text.includes('تم الحل'));
  assert.ok(session.respond('DEMO-9999').text.includes('لم أجد'));
});
test('كل الخدمات الأساسية لها كلمات مفتاحية مفهومة', () => {
  const assistant = setup().PPUAssistant;
  for (const [word, category] of [['واي فاي', 'internet'], ['كراسي', 'classrooms'], ['نظافة', 'cleanliness'], ['مرافق', 'facilities'], ['المكتبة', 'library'], ['خدمات أخرى', 'other']]) assert.equal(assistant.detectService(word), category);
});
test('عنوان المساعد لا يضيف ضعف الشبكة عند ذكر الانقطاع فقط', () => {
  const draft = setup().PPUAssistant.createSession().respond('الإنترنت في مبنى C بفصل').draft;
  assert.equal(draft.title, 'انقطاع الإنترنت في مبنى C');
});
