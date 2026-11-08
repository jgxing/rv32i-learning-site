// 视图渲染冒烟测试：node tools/viewtest.js
// 用最小 DOM 桩载入全部脚本，逐个渲染视图，捕获首次渲染期的运行时错误。
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const root = path.resolve(__dirname, '..');

function makeEl() {
  const e = {
    innerHTML: '', textContent: '', className: '', id: '', value: '', title: '',
    style: {}, dataset: {}, checked: false, disabled: false,
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    querySelector() { return makeEl(); },
    querySelectorAll() { return []; },
    addEventListener() {}, removeEventListener() {},
    replaceWith() {}, appendChild() {}, removeChild() {},
    closest() { return null; }, contains() { return true; },
    focus() {}, scrollIntoView() {}, click() {}
  };
  return e;
}

const store = {};
const documentStub = {
  readyState: 'complete',
  title: '',
  getElementById() { return makeEl(); },
  createElement() { return makeEl(); },
  addEventListener() {},
  querySelector() { return makeEl(); },
  querySelectorAll() { return []; }
};
const windowStub = {
  scrollTo() {}, addEventListener() {},
  location: { hash: '' }
};
const ctx = {
  window: windowStub,
  document: documentStub,
  location: windowStub.location,
  localStorage: {
    getItem(k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem(k, v) { store[k] = String(v); },
    removeItem(k) { delete store[k]; }
  },
  console, setTimeout, clearTimeout, setInterval, clearInterval,
  Math, Date, JSON, URLSearchParams
};
windowStub.window = windowStub;
vm.createContext(ctx);

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
scripts.forEach(f => vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f }));

const RV = windowStub.RV;
let pass = 0, fail = 0;
function check(name, params, viewName) {
  const v = RV.views[viewName || name];
  const el = makeEl();
  try {
    v.render(el, params || {});
    if (!el.innerHTML || el.innerHTML.indexOf('页面渲染出错') >= 0) throw new Error('未产出内容');
    pass++;
    console.log('  ok   ' + name + ' ' + JSON.stringify(params || {}));
  } catch (e) {
    fail++;
    console.log('  FAIL ' + name + ' ' + JSON.stringify(params || {}) + '  ' + e.message);
    console.log('       ' + (e.stack || '').split('\n')[1]);
  }
}

console.log('视图渲染冒烟测试（' + scripts.length + ' 个脚本）');
check('home');
check('basics', { tab: 'overview' });
check('basics', { tab: 'regs' });
check('basics', { tab: 'memory' });
check('dictionary', { i: 'addi' });
check('dictionary', { i: 'lw' });
check('dictionary', { p: '1', i: 'p:li' });
check('dictionary', { g: '访存' });
RV.data.INSTRUCTIONS.forEach(i => check('dictionary', { i: i.id }));
check('encoder_lab', { i: 'addi' });
check('encoder_lab', { fmt: 'B' });
check('encoder_lab', { i: 'jal' });
check('simulator', { p: 'sum' });
check('simulator', { p: 'max' });
check('hardware', { i: 'addi' });
check('hardware', { i: 'lw', view: 'single' });
check('hardware', { view: 'pipe' });
check('hardware', { view: 'pipe', fw: '0' });
check('quiz', {});
check('quiz', { s: '编码', n: '2' });
check('tools', {});
check('tools', { v: '-1', fmt: 'B' });

console.log('\n通过 ' + pass + ' 项，失败 ' + fail + ' 项');
process.exit(fail ? 1 : 0);
