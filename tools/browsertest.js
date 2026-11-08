// 浏览器交互测试：node tools/browsertest.js
// 启动无头 Chrome，通过 CDP 模拟点击并断言 DOM 结果。
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const { pathToFileURL } = require('url');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9333;
const url = pathToFileURL(path.resolve(__dirname, '..', 'index.html')).href;
const profile = path.join(os.tmpdir(), 'rv32i-cdp-' + Date.now());

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-extensions',
  '--remote-debugging-port=' + PORT, '--remote-allow-origins=*',
  '--user-data-dir=' + profile, '--no-first-run', '--no-default-browser-check', url
], { stdio: 'ignore' });

const wait = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? '  ' + extra : '')); }
}

async function targets() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch('http://127.0.0.1:' + PORT + '/json');
      const list = await r.json();
      const page = list.find(x => x.type === 'page' && x.url.indexOf('index.html') >= 0);
      if (page) return page;
    } catch (e) { }
    await wait(250);
  }
  throw new Error('Chrome 调试端口未就绪');
}

async function main() {
  const t = await targets();
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let seq = 0;
  const pending = new Map();
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  };
  function send(method, params) {
    return new Promise(res => { const id = ++seq; pending.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
  }
  async function js(expr) {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result && r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.text + ' ' + JSON.stringify(r.result.exceptionDetails.exception || {}));
    return r.result && r.result.result ? r.result.result.value : undefined;
  }
  async function route(hash) {
    await js('location.hash = ' + JSON.stringify('#/' + hash) + '; true');
    await wait(420);
  }
  async function click(sel) {
    return js('(function(){var e=document.querySelector(' + JSON.stringify(sel) + ');if(!e)return "missing";' +
      'e.dispatchEvent(new MouseEvent("click",{bubbles:true,cancelable:true,view:window}));return "clicked"})()');
  }

  console.log('浏览器交互测试');
  await wait(500);

  ok('首页 4 张模块卡', await js('document.querySelectorAll(".module-card").length') === 4);
  ok('顶部速查表按钮存在', await js('!!document.querySelector("#cheatBtn")'));

  // 速查表面板
  await click('#cheatBtn'); await wait(150);
  ok('速查表面板打开', await js('!!document.querySelector("#sheet")'));
  ok('速查表列出 40 条指令', await js('document.querySelectorAll(".sheetrow").length') === 40);
  await click('#sheetClose'); await wait(120);
  ok('速查表面板可关闭', await js('!document.querySelector("#sheet")'));

  // 编码实验室
  await route('encoder?i=addi');
  ok('编码页默认 addi 机器码', await js('document.querySelector("#hexOut").textContent') === '0x00700293',
    String(await js('document.querySelector("#hexOut").textContent')));
  await js('document.querySelector("#asmIn").value = "sub x5, x6, x7"; true');
  await click('[data-act="compile"]'); await wait(120);
  ok('编译 sub 得到 0x407302b3', await js('document.querySelector("#hexOut").textContent') === '0x407302b3',
    String(await js('document.querySelector("#hexOut").textContent')));
  ok('编译后字段色带更新', (await js('document.querySelector("#band").innerHTML')).indexOf('funct7') >= 0);
  await js('document.querySelector("#machIn").value = "0x00700293"; true');
  await click('[data-act="decode"]'); await wait(120);
  ok('反汇编 0x00700293 → addi', (await js('document.querySelector("#convmsg").textContent')).indexOf('addi') >= 0);
  await click('.bitseg'); await wait(120);
  ok('点击字段显示字段说明', (await js('document.querySelector("#fielddetail").textContent')).indexOf('imm[11:0]') >= 0);
  await click('[data-act="q1"]'); await wait(80);
  ok('练习题可判分', (await js('document.querySelector("#q1r").textContent')).length > 0);

  // 模拟器
  await route('simulator?p=sum');
  ok('示例程序已汇编', (await js('document.querySelector("#listing").textContent')).indexOf('机器码') >= 0);
  await click('[data-act="step"]'); await wait(120);
  ok('单步后 PC 前进', await js('document.querySelector("#mPC").textContent') === '0x00000004',
    String(await js('document.querySelector("#mPC").textContent')));
  await click('[data-act="run"]'); await wait(250);
  ok('运行到底输出 15', (await js('document.querySelector("#outbox").textContent')).indexOf('15') >= 0,
    String(await js('document.querySelector("#outbox").textContent')));
  ok('结果校验提示正确', (await js('document.querySelector("#expect").textContent')).indexOf('结果正确') >= 0);
  await click('[data-act="back"]'); await wait(120);
  ok('回退可恢复状态', (await js('document.querySelector("#haltbadge").textContent')) === '运行中');

  // 硬件台
  await route('hardware?i=lw');
  ok('数据通路 SVG 存在', await js('!!document.querySelector(".dp-svg")'));
  ok('lw 点亮数据存储器', (await js('document.querySelector(".dp-svg").innerHTML')).indexOf('#e6f1fb') >= 0);
  await click('g[data-node="alu"]'); await wait(150);
  ok('点击部件显示说明', (await js('document.body.textContent')).indexOf('算术逻辑单元') >= 0);
  await route('hardware?view=pipe');
  const txt1 = String(await js('document.querySelector("#view .card .lead") ? document.querySelector("#view .card .lead").textContent : ""'));
  await click('[data-act="fw0"]'); await wait(180);
  const txt2 = String(await js('document.querySelector("#view .card .lead") ? document.querySelector("#view .card .lead").textContent : ""'));
  const n1 = parseInt((txt1.match(/总周期\s*(\d+)/) || [])[1] || '0', 10);
  const n2 = parseInt((txt2.match(/总周期\s*(\d+)/) || [])[1] || '0', 10);
  ok('关闭转发后周期变长', n2 > n1, n1 + ' -> ' + n2);

  // 字典 / 测验 / 工具
  await route('dictionary?i=addi');
  ok('字典详情含 RTL', (await js('document.querySelector("#ddetail").textContent')).indexOf('sign_extend') >= 0);
  await route('quiz');
  await click('[data-opt="0"]'); await wait(200);
  ok('测验答题后显示解析', (await js('document.querySelector("#explain").textContent')).length > 0);
  await route('tools');
  ok('速查表 40 行', await js('document.querySelectorAll(".cheatrow").length') === 40);
  await route('basics?tab=memory');
  ok('内存页渲染', (await js('document.querySelector("#view").textContent')).indexOf('小端') >= 0);

  console.log('\n通过 ' + pass + ' 项，失败 ' + fail + ' 项');
  ws.close();
  chrome.kill();
  setTimeout(() => process.exit(fail ? 1 : 0), 200);
}

main().catch(e => { console.error('测试异常:', e.message); chrome.kill(); process.exit(1); });
