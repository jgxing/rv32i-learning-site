(function () {
  'use strict';
  var RV = (window.RV = window.RV || {});
  var D = RV.data;

  var ROUTES = {
    home: { view: 'home', title: '学习地图', group: '开始' },
    basics: { view: 'basics', title: 'ISA 基础', group: '开始' },
    dictionary: { view: 'dictionary', title: '指令字典', group: '指令' },
    encoder: { view: 'encoder_lab', title: '编码实验室', group: '指令' },
    simulator: { view: 'simulator', title: '汇编演练场', group: '实践' },
    hardware: { view: 'hardware', title: '硬件实现台', group: '实践' },
    quiz: { view: 'quiz', title: '章节自测', group: '检验' },
    tools: { view: 'tools', title: '速查与工具箱', group: '检验' }
  };
  var NAVGROUPS = ['开始', '指令', '实践', '检验'];
  var PKEY = 'rv32i.progress';
  // 作者信息单一来源：侧栏、全站页脚、首页署名都从这里取
  var AUTHOR = { name: '邢建国', email: 'jgxing@zjgsu.edu.cn', org: '浙江工商大学' };

  function h(s) {
    return String(s === undefined || s === null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function progress() {
    try {
      var p = JSON.parse(localStorage.getItem(PKEY) || '{}');
      if (!p.mastered) p.mastered = {};
      return p;
    } catch (e) { return { mastered: {} }; }
  }
  function saveProgress(p) { try { localStorage.setItem(PKEY, JSON.stringify(p)); } catch (e) { } }

  function parseHash() {
    var raw = (location.hash || '').replace(/^#\/?/, '');
    var parts = raw.split('?');
    var name = parts[0] || 'home';
    if (!ROUTES[name]) name = 'home';
    var params = {};
    (parts[1] || '').split('&').forEach(function (kv) {
      if (!kv) return;
      var i = kv.indexOf('=');
      var k = i < 0 ? kv : kv.slice(0, i);
      var v = i < 0 ? '' : decodeURIComponent(kv.slice(i + 1).replace(/\+/g, ' '));
      params[k] = v;
    });
    return { name: name, params: params, raw: raw };
  }

  function routeTitle(name) { return ROUTES[name] ? ROUTES[name].title : ''; }

  var app = {
    ui: null,
    go: function (route) {
      var target = '#/' + route;
      if (location.hash === target) { renderRoute(); return; }
      location.hash = target;
    },
    toast: function (msg) {
      var t = document.getElementById('toast');
      if (!t) return;
      t.textContent = msg;
      t.classList.add('show');
      clearTimeout(t._timer);
      t._timer = setTimeout(function () { t.classList.remove('show'); }, 2200);
    },
    progress: progress,
    master: function (id) {
      var p = progress();
      if (!p.mastered[id]) { p.mastered[id] = 1; saveProgress(p); updateTop(); }
    },
    routeTitle: routeTitle,
    author: AUTHOR
  };
  RV.app = app;
  RV.ui = { h: h };

  function navHtml(current) {
    return NAVGROUPS.map(function (g) {
      var items = Object.keys(ROUTES).filter(function (r) { return ROUTES[r].group === g; });
      return '<div class="nav-group"><div class="nav-label">' + g + '</div>' +
        items.map(function (r) {
          return '<a class="nav-item ' + (r === current ? 'active' : '') + '" href="#/' + r + '">' +
            '<span class="nav-dot"></span>' + ROUTES[r].title + '</a>';
        }).join('') + '</div>';
    }).join('');
  }

  function buildShell() {
    var root = document.getElementById('app');
    root.innerHTML = '<div class="shell">' +
      '<aside class="sidebar">' +
        '<div class="brand"><div class="brand-logo">RV</div><div><div class="brand-name">RV32I 交互式学习</div>' +
        '<div class="brand-sub">含义 · 编码 · 编程 · 硬件</div></div></div>' +
        '<div id="nav"></div>' +
        '<div class="side-foot">40 条基础指令 · 6 种格式<br>纯静态离线可跑 · 进度存本地' +
          '<div class="side-author"><span class="side-author-label">作者</span>' +
            '<b>' + h(AUTHOR.name) + '</b><br>' + h(AUTHOR.org) + '<br>' +
            '<a href="mailto:' + h(AUTHOR.email) + '">' + h(AUTHOR.email) + '</a></div>' +
        '</div>' +
      '</aside>' +
      '<div class="main">' +
        '<div class="topbar"><span class="crumb" id="crumb"></span>' +
          '<div class="top-right"><div class="progress-wrap"><span id="ptxt">指令掌握 0 / 40</span>' +
            '<div class="progress"><i id="pbar" style="width:0%"></i></div></div>' +
            '<button class="btn sm" id="cheatBtn">速查表</button></div></div>' +
        '<main class="view" id="view"></main>' +
        '<footer class="site-footer">' +
          '<span>RV32I 交互式学习站</span>' +
          '<span>作者 <b class="ft-name">' + h(AUTHOR.name) + '</b> · ' + h(AUTHOR.org) + '</span>' +
          '<span class="spacer"></span>' +
          '<span>联系：<a href="mailto:' + h(AUTHOR.email) + '">' + h(AUTHOR.email) + '</a></span>' +
        '</footer>' +
      '</div></div>';
  }

  function updateTop() {
    var p = progress();
    var n = Object.keys(p.mastered || {}).length;
    var t = document.getElementById('ptxt'), b = document.getElementById('pbar');
    if (t) t.textContent = '指令掌握 ' + n + ' / 40';
    if (b) b.style.width = Math.round(n / 40 * 100) + '%';
  }

  var currentView = null;

  function renderRoute() {
    var r = parseHash();
    var def = ROUTES[r.name];
    var view = RV.views[def.view];
    if (!view) return;

    if (currentView && typeof currentView.destroy === 'function') {
      try { currentView.destroy(); } catch (e) { }
    }
    currentView = view;

    // 用全新节点替换 #view，避免重复绑定事件监听器
    var old = document.getElementById('view');
    var fresh = document.createElement('main');
    fresh.id = 'view'; fresh.className = 'view';
    old.replaceWith(fresh);

    document.getElementById('nav').innerHTML = navHtml(r.name);
    document.getElementById('crumb').innerHTML = '<strong>' + def.group + '</strong> / ' + def.title;
    document.title = def.title + ' · RV32I 交互式学习站';
    updateTop();

    var p = progress();
    p.last = r.raw;
    saveProgress(p);
    closeSheet();

    try { view.render(fresh, r.params); }
    catch (err) {
      fresh.innerHTML = '<div class="card"><h2>页面渲染出错</h2><div class="err">' + h(err.message) + '</div>' +
        '<pre class="mono" style="font-size:11px;overflow:auto">' + h(err.stack || '') + '</pre></div>';
      console.error(err);
    }
    window.scrollTo(0, 0);
  }

  // ---------- 速查表面板 ----------
  function closeSheet() {
    var o = document.getElementById('overlay');
    if (o) { o.innerHTML = ''; o.className = ''; }
  }
  function openSheet() {
    var o = document.getElementById('overlay');
    o.className = 'overlay';
    o.innerHTML = '<div class="sheet" id="sheet"><div class="sheet-head"><h2>指令速查表</h2>' +
      '<button class="btn sm" id="sheetClose">关闭</button></div>' +
      '<input class="input" id="sheetQ" placeholder="搜索指令或含义…" style="margin-bottom:10px">' +
      '<div class="pill-tabs"><button class="btn sm active" data-stab="inst">基础指令 (40)</button>' +
      '<button class="btn sm" data-stab="pseudo">伪指令</button>' +
      '<button class="btn sm" data-stab="reg">寄存器 ABI</button></div>' +
      '<div id="sheetBody"></div></div>';
    o.onclick = function (ev) { if (ev.target === o) closeSheet(); };
    document.getElementById('sheetClose').onclick = closeSheet;
    var qi = document.getElementById('sheetQ');
    qi.oninput = function () { paintSheet('inst', qi.value); };
    o.querySelectorAll('[data-stab]').forEach(function (b) {
      b.onclick = function () {
        o.querySelectorAll('[data-stab]').forEach(function (x) { x.classList.remove('active'); });
        b.classList.add('active');
        paintSheet(b.dataset.stab, qi.value);
      };
    });
    paintSheet('inst', '');

    function paintSheet(tab, q) {
      q = (q || '').toLowerCase();
      var body = document.getElementById('sheetBody');
      if (!body) return;
      if (tab === 'reg') {
        body.innerHTML = '<table class="tbl"><thead><tr><th>编号</th><th>ABI</th><th>用途</th><th>约定</th></tr></thead><tbody>' +
          D.REGS.filter(function (r) { return (r[0] + ' ' + r[1] + ' ' + r[2]).toLowerCase().indexOf(q) >= 0; }).map(function (r) {
            return '<tr><td class="mono">' + r[0] + '</td><td class="mono"><b>' + r[1] + '</b></td><td>' + r[2] + '</td><td style="color:var(--muted)">' + r[3] + '</td></tr>';
          }).join('') + '</tbody></table>';
        return;
      }
      if (tab === 'pseudo') {
        body.innerHTML = '<table class="tbl"><thead><tr><th>伪指令</th><th>语法</th><th>含义</th></tr></thead><tbody>' +
          D.PSEUDO.filter(function (p) { return (p.name + ' ' + p.syntax + ' ' + p.desc).toLowerCase().indexOf(q) >= 0; }).map(function (p) {
            return '<tr><td class="mono"><b>' + p.name + '</b></td><td class="mono">' + h(p.syntax) + '</td><td>' + p.desc + '</td></tr>';
          }).join('') + '</tbody></table>';
        return;
      }
      body.innerHTML = '<table class="tbl"><thead><tr><th>指令</th><th>格式</th><th>语法</th><th>含义</th></tr></thead><tbody>' +
        D.INSTRUCTIONS.filter(function (i) { return (i.name + ' ' + i.desc + ' ' + i.syntax).toLowerCase().indexOf(q) >= 0; }).map(function (i) {
          return '<tr class="sheetrow" data-id="' + i.id + '" style="cursor:pointer"><td class="mono"><b>' + i.name + '</b></td>' +
            '<td><span class="tag blue">' + i.format + '</span></td><td class="mono">' + h(i.syntax) + '</td><td>' + i.desc + '</td></tr>';
        }).join('') + '</tbody></table>';
      body.querySelectorAll('.sheetrow').forEach(function (x) {
        x.onclick = function () { closeSheet(); app.go('dictionary?i=' + x.dataset.id); };
      });
    }
  }

  function init() {
    buildShell();
    document.getElementById('cheatBtn').onclick = openSheet;
    document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') closeSheet(); });
    window.addEventListener('hashchange', renderRoute);
    renderRoute();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
