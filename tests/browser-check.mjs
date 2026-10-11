/* اختبار متصفح دون مكتبات خارجية. يحتاج Chrome على منفذ CDP 9222 وخادم 8080. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = '/private/tmp/ppu-qa';
await mkdir(output, { recursive: true });
const readiness = await fetch('http://localhost:8080');
assert.equal(readiness.status, 200);
const target = await (await fetch('http://localhost:9222/json/new?about:blank', { method: 'PUT' })).json();
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
let nextId = 0;
const pending = new Map();
const errors = [];
socket.addEventListener('message', event => {
  const result = JSON.parse(event.data);
  if (result.id) {
    const promise = pending.get(result.id); pending.delete(result.id);
    if (result.error) promise.reject(new Error(JSON.stringify(result.error)));
    else promise.resolve(result.result);
  }
  if (result.method === 'Runtime.exceptionThrown') errors.push(result.params.exceptionDetails.text + ': ' + (result.params.exceptionDetails.exception?.description || ''));
  if (result.method === 'Log.entryAdded' && result.params.entry.level === 'error') errors.push(result.params.entry.text);
});
function cdp(method, params = {}) {
  const id = ++nextId;
  return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); });
}
async function evaluate(expression) {
  const response = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
  return response.result.value;
}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(expression, label = expression) {
  for (let attempts = 0; attempts < 100; attempts++) {
    if (await evaluate(expression)) return;
    await delay(50);
  }
  throw new Error('Timed out: ' + label);
}
const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
async function fill(selector, value) {
  await evaluate(`(() => { const field = document.querySelector(${JSON.stringify(selector)}); field.value = ${JSON.stringify(value)}; field.dispatchEvent(new Event('input', {bubbles:true})); field.dispatchEvent(new Event('change', {bubbles:true})); })()`);
}
async function navigate(hash) {
  await evaluate(`location.hash = ${JSON.stringify(hash)}`);
  await delay(100);
}
async function viewport(width, height = 900) {
  await cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 });
}
async function screenshot(name, full = false) {
  await evaluate('document.fonts.ready');
  if (full) {
    const height = await evaluate('document.documentElement.scrollHeight');
    for (let y = 0; y < height; y += 550) { await evaluate(`scrollTo(0, ${y})`); await delay(100); }
    await evaluate('scrollTo(0,0)');
  }
  await delay(500);
  const result = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: full, ...(full ? { clip: { x: 0, y: 0, width: await evaluate('innerWidth'), height: await evaluate('document.documentElement.scrollHeight'), scale: 1 } } : {}) });
  await writeFile(path.join(output, name + '.png'), Buffer.from(result.data, 'base64'));
}
async function upload(filename) {
  const { root: document } = await cdp('DOM.getDocument');
  const { nodeId } = await cdp('DOM.querySelector', { nodeId: document.nodeId, selector: '#attachment' });
  await cdp('DOM.setFileInputFiles', { nodeId, files: [filename] });
}
try {
  await cdp('Page.enable'); await cdp('Runtime.enable'); await cdp('Log.enable');
  await viewport(1440, 1000);
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
  await cdp('Page.navigate', { url: 'http://localhost:8080' });
  await waitFor('Boolean(window.PPURepository && document.querySelector(".service-card"))');
  await evaluate('localStorage.clear()');
  await cdp('Page.reload');
  await waitFor('Boolean(window.PPURepository && document.querySelector(".service-card"))');
  assert.equal(await evaluate('document.documentElement.dataset.theme'), 'light');
  assert.equal(await evaluate('document.querySelectorAll(".service-card").length'), 6);
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
  await screenshot('home-desktop', true);
  console.log('PASS: الصفحة الرئيسية والشعار والخط المحلي');

  await click('.service-card');
  await waitFor('!document.getElementById("page-submit").hidden');
  assert.equal(await evaluate('document.getElementById("service").value'), 'internet');
  await click('#student-step button[type=submit]');
  assert.ok((await evaluate('document.getElementById("full-name-error").textContent')).length);
  await fill('#full-name', 'طالب تجريبي'); await fill('#major', 'other');
  assert.equal(await evaluate('document.getElementById("other-major-field").hidden'), false);
  await fill('#other-major', 'تخصص تجريبي'); await fill('#email', 'invalid-email');
  await click('#student-step button[type=submit]');
  assert.equal(await evaluate('document.getElementById("details-step").hidden'), true);
  await fill('#email', 'demo@example.edu'); await click('#student-step button[type=submit]');
  assert.equal(await evaluate('document.getElementById("details-step").hidden'), false);
  await fill('#location', 'مبنى C'); await fill('#complaint-title', 'انقطاع الإنترنت');
  await fill('#description', 'وصف تجريبي <img src=x onerror="window.xss=true">');
  await click('#back-step');
  assert.equal(await evaluate('document.getElementById("email").value'), 'demo@example.edu');
  await click('#student-step button[type=submit]');
  assert.equal(await evaluate('document.getElementById("description").value.includes("<img")'), true);
  await upload(path.join(root, 'assets/images/ppu-logo.png'));
  await waitFor('!document.getElementById("image-preview").hidden');
  await click('#remove-image');
  assert.equal(await evaluate('document.getElementById("image-preview").hidden'), true);
  await writeFile(path.join(output, 'large.png'), Buffer.alloc(5 * 1024 * 1024 + 1));
  await upload(path.join(output, 'large.png'));
  assert.ok((await evaluate('document.getElementById("attachment-error").textContent')).includes('5MB'));
  await click('#discard-attachment');
  assert.equal(await evaluate('document.getElementById("attachment-error").textContent'), '');
  await upload(path.join(root, 'README.md'));
  assert.ok((await evaluate('document.getElementById("attachment-error").textContent')).includes('JPG'));
  await click('#discard-attachment');
  await upload(path.join(root, 'assets/images/ppu-logo.png'));
  await waitFor('!document.getElementById("image-preview").hidden');
  await screenshot('complaint-desktop', true);
  await click('#details-step button[type=submit]');
  await waitFor('document.getElementById("review-dialog").open');
  assert.equal(await evaluate('document.querySelector("#review-details img")'), null);
  await click('#edit-student'); await waitFor('!document.getElementById("review-dialog").open');
  assert.equal(await evaluate('document.getElementById("student-step").hidden'), false);
  await click('#student-step button[type=submit]'); await click('#details-step button[type=submit]');
  await waitFor('document.getElementById("review-dialog").open');
  await evaluate('document.getElementById("confirm-submit").click(); document.getElementById("confirm-submit").click();');
  await waitFor('!document.getElementById("submission-success").hidden');
  const complaintId = await evaluate('document.getElementById("success-number").textContent');
  assert.equal(await evaluate('PPURepository.getComplaints().length'), 1);
  assert.equal(await evaluate('localStorage.getItem(PPUConfig.storageKey).includes("base64")'), false);
  assert.equal(await evaluate('Boolean(window.xss)'), false);
  await click('#success-track'); await waitFor('!document.getElementById("tracking-result").hidden');
  assert.equal(await evaluate('document.getElementById("result-status").textContent'), 'تم الإرسال');
  assert.equal(await evaluate('document.getElementById("rating-section").hidden'), true);
  assert.equal(await evaluate('document.getElementById("result-demo").hidden'), true);
  assert.ok((await evaluate('document.getElementById("result-reply").textContent')).includes('لا يوجد رد'));
  assert.equal(await evaluate('document.querySelector("#result-description img")'), null);
  console.log('PASS: التحقق والرجوع والمراجعة والإرفاق والحفظ مرة واحدة والعرض الآمن');

  await fill('#tracking-number', 'DOES-NOT-EXIST'); await click('#tracking-form button');
  await waitFor('document.getElementById("tracking-result").hidden');
  assert.ok((await evaluate('document.getElementById("tracking-error").textContent')).includes('لم نجد'));
  for (const status of [0, 1, 2, 3]) {
    await click(`[data-example-id="DEMO-100${status + 1}"]`);
    await waitFor(`document.getElementById("result-number").textContent === "DEMO-100${status + 1}"`);
    assert.equal(await evaluate('document.getElementById("rating-section").hidden'), status !== 3);
    assert.equal(await evaluate('document.querySelectorAll("#status-timeline [aria-current=step]").length'), 1);
  }
  await click('#rating-form button[type=submit]');
  assert.ok((await evaluate('document.getElementById("stars-error").textContent')).length);
  await click('input[name=stars][value="4"]'); await click('input[name=resolution][value="partial"]');
  await fill('#rating-comment', 'تقييم تجريبي'); await click('#rating-form button[type=submit]');
  assert.equal(await evaluate('document.getElementById("rating-form").hidden'), true);
  assert.equal(await evaluate('PPURepository.findComplaint("DEMO-1004").status'), 3);
  await navigate('#track/DEMO-1003'); await navigate('#track/DEMO-1004');
  assert.equal(await evaluate('document.getElementById("rating-form").hidden'), true);
  await screenshot('tracking-desktop', true);
  console.log('PASS: البحث والحالات الأربعة والتقييم بعد الحل ومنع التكرار');

  await click('#assistant-launcher'); await waitFor('document.getElementById("assistant-panel").open');
  assert.equal(await evaluate('document.activeElement.id'), 'chat-input');
  await fill('#chat-input', 'الإنترنت في مبنى C سيئ وبفصل كثير'); await click('#chat-form button');
  await waitFor('Boolean(document.querySelector(".chat-draft"))');
  assert.equal(await evaluate('document.querySelector(".chat-draft input[id$=location]").value'), 'مبنى C');
  assert.equal(await evaluate('document.querySelector(".chat-draft input[id$=title]").value'), 'ضعف وانقطاع الإنترنت في مبنى C');
  await fill('.chat-draft input[id$=title]', 'عنوان المسودة بعد التعديل');
  await screenshot('assistant-desktop');
  await click('.chat-draft button[type=submit]');
  await waitFor('!document.getElementById("assistant-panel").open');
  await waitFor('!document.getElementById("page-submit").hidden');
  assert.equal(await evaluate('document.getElementById("complaint-title").value'), 'عنوان المسودة بعد التعديل');
  assert.equal(await evaluate('document.getElementById("full-name").value'), '');
  assert.equal(await evaluate('PPURepository.getComplaints().length'), 1);
  await click('#assistant-launcher');
  await fill('#chat-input', 'كيف أتابع شكوتي؟'); await click('#chat-form button');
  await fill('#chat-input', complaintId); await click('#chat-form button');
  assert.ok((await evaluate('document.getElementById("chat-messages").textContent')).includes(complaintId));
  await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await waitFor('!document.getElementById("assistant-panel").open');
  await waitFor('document.activeElement.id === "assistant-launcher"', 'استعادة التركيز بعد إغلاق المساعد');
  assert.equal(await evaluate('document.activeElement.id'), 'assistant-launcher');
  console.log('PASS: صياغة المساعد وتعديل المسودة واستخدامها والمتابعة وEscape والتركيز');

  await click('#theme-toggle');
  assert.equal(await evaluate('document.documentElement.dataset.theme'), 'dark');
  await cdp('Page.reload'); await waitFor('Boolean(window.PPURepository)');
  assert.equal(await evaluate('document.documentElement.dataset.theme'), 'dark');
  await navigate('#home'); await screenshot('home-dark', true);
  await navigate('#track/DEMO-1004');
  assert.equal(await evaluate('document.getElementById("rating-form").hidden'), true);
  await screenshot('tracking-dark', true);
  for (const width of [768, 390, 320]) {
    await viewport(width, 844);
    for (const page of ['home', 'submit', 'track/DEMO-1004', 'help']) {
      await navigate('#' + page);
      assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, `overflow at ${width} / ${page}`);
    }
    if (width === 390) {
      await click('#theme-toggle'); await navigate('#home'); await screenshot('home-mobile', true);
      await click('#menu-toggle');
      assert.equal(await evaluate('document.getElementById("menu-toggle").getAttribute("aria-expanded")'), 'true');
      await click('#nav-links a[href="#submit"]');
      await waitFor('!document.getElementById("page-submit").hidden');
      assert.equal(await evaluate('document.getElementById("menu-toggle").getAttribute("aria-expanded")'), 'false');
      await screenshot('complaint-mobile', true);
      assert.equal(await evaluate('(() => { const a = document.getElementById("assistant-launcher").getBoundingClientRect(); const b = document.querySelector("#student-step button[type=submit]").getBoundingClientRect(); return !(a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top); })()'), true, 'زر المساعد لا يحجب زر التالي');
      await navigate('#track/DEMO-1004'); await screenshot('tracking-mobile', true);
      await click('#assistant-launcher'); await screenshot('assistant-mobile');
      assert.equal(await evaluate('document.getElementById("assistant-panel").getBoundingClientRect().width <= innerWidth'), true);
      await click('#assistant-close'); await waitFor('!document.getElementById("assistant-panel").open');
    }
  }
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await navigate('#home');
  assert.equal(await evaluate('getComputedStyle(document.querySelector(".hero-art>img")).animationName'), 'none');
  await cdp('Page.navigate', { url: pathToFileURL(path.join(root, 'index.html')).href });
  await waitFor('Boolean(window.PPURepository && document.querySelector(".service-card"))');
  assert.equal(await evaluate('document.querySelectorAll(".service-card").length'), 6);
  assert.equal(await evaluate('document.querySelector(".university-logo").naturalWidth > 0'), true);
  assert.equal(errors.length, 0, JSON.stringify(errors));
  console.log('PASS: حفظ الوضع الليلي والاستجابة على 768/390/320 وتقليل الحركة وعدم وجود أخطاء console');
  console.log('Screenshots: ' + output);
} catch (error) {
  console.log('Browser errors:', errors);
  console.log('Active:', await evaluate('document.activeElement.id'));
  throw error;
} finally {
  socket.close();
  await fetch('http://localhost:9222/json/close/' + target.id);
}
