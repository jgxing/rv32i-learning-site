(function () {
  'use strict';
  var RV = (window.RV = window.RV || {});
  RV.views = RV.views || {};

  var MODULES = [
    { no: '01', title: 'ISA 基础', desc: 'RV32I 定位、扩展体系、x0–x31 与 ABI、内存模型', route: 'basics', tag: '基础', color: 'blue' },
    { no: '02', title: '指令与编码', desc: '40 条基础指令字典 + 六种格式的位级解剖', route: 'dictionary', tag: '核心', color: 'blue' },
    { no: '03', title: '汇编编程', desc: '伪指令、栈帧与调用约定、可单步的 RV32I 模拟器', route: 'simulator', tag: '实践', color: 'green' },
    { no: '04', title: '硬件实现', desc: '单周期数据通路、控制信号、五级流水线与冒险', route: 'hardware', tag: '进阶', color: 'green' }
  ];

  RV.views.home = {
    title: '学习地图',
    render: function (el) {
      var p = RV.app.progress();
      var mastered = Object.keys(p.mastered || {}).length;
      var last = p.last || null;
      var lastLabel = last ? (RV.app.routeTitle(last.split('?')[0]) || '上次位置') : '从这里开始';
      var A = (RV.app && RV.app.author) || {};

      el.innerHTML =
        '<div class="view-head"><div class="eyebrow">RV32I · 交互式学习站</div>' +
        '<h1>从一条 ADD 指令，走到一颗能跑它的 CPU</h1>' +
        '<p class="lead">含义 → 编码 → 编程 → 硬件，四个视角看同一条指令。所有实验都在浏览器里真实运行，无需安装任何工具链。</p>' +
        '<div class="byline">作者：<b>' + RV.ui.h(A.name) + '</b> · ' + RV.ui.h(A.org) +
          ' · <a href="mailto:' + RV.ui.h(A.email) + '">' + RV.ui.h(A.email) + '</a></div></div>' +
        '<div class="grid g4" style="margin-bottom:18px">' +
          '<div class="metric"><div class="lbl">基础指令</div><div class="val">40</div></div>' +
          '<div class="metric"><div class="lbl">指令格式</div><div class="val">6</div></div>' +
          '<div class="metric"><div class="lbl">示例程序</div><div class="val">' + RV.data.PROGRAMS.length + '</div></div>' +
          '<div class="metric"><div class="lbl">已查看指令</div><div class="val">' + mastered + ' <span style="font-size:12px;color:var(--muted)">/ 40</span></div></div>' +
        '</div>' +
        '<div class="card" style="margin-bottom:16px"><div class="card-title"><h2 style="margin:0">学习路径</h2>' +
          '<span class="tag">建议按顺序，也可直接跳到任意实验</span></div>' +
          '<div class="grid g4" id="mods">' +
          MODULES.map(function (m) {
            return '<div class="module-card" data-route="' + m.route + '">' +
              '<div class="row"><span class="module-no">' + m.no + '</span><span class="tag ' + m.color + ' spacer">' + m.tag + '</span></div>' +
              '<h3>' + m.title + '</h3><p>' + m.desc + '</p>' +
              '<div class="bar"><i style="width:' + Math.round((m.no === '01' ? 100 : m.no === '02' ? Math.min(100, mastered * 2.5) : 0)) + '%"></i></div>' +
              '</div>';
          }).join('') +
          '</div></div>' +
        '<div class="continue" style="margin-bottom:16px">' +
          '<span class="tag blue">继续上次</span><code>' + (last ? RV.ui.h(lastLabel) : 'addi x5, x0, 7') + '</code>' +
          '<span class="spacer"></span>' +
          '<button class="btn primary" id="btn-continue">去 ' + RV.ui.h(last ? '上次页面' : '编码实验室') + ' →</button>' +
        '</div>' +
        '<div class="grid g2">' +
          '<div class="card"><h2>一条指令，四个视角</h2>' +
            '<p style="font-size:13px;color:var(--muted)">在指令字典里选中任意一条指令，可以带着它跳到编码实验室看 32 位布局、到硬件台看它在数据通路上点亮哪些部件——四个模块共享同一份指令数据，不会前后矛盾。</p>' +
            '<div class="note info">试试这条：<code>addi x5, x0, 7</code> → 机器码 <code>0x00700293</code>，控制信号 RegWrite=1、ALUSrc=imm。</div>' +
            '<div class="row" style="margin-top:12px"><button class="btn" data-go="dictionary?i=addi">打开指令字典</button>' +
            '<button class="btn" data-go="encoder?i=addi">打开编码实验室</button>' +
            '<button class="btn" data-go="hardware?i=addi">打开硬件实现台</button></div></div>' +
          '<div class="card"><h2>这个站点能做什么</h2>' +
            '<ul class="tight" style="font-size:13px;color:var(--muted)">' +
              '<li>汇编 ⇄ 机器码双向转换，点开 32 位字段看每一位来源</li>' +
              '<li>B / J 型立即数散位重排与符号扩展的可视化</li>' +
              '<li>内置汇编器：label、伪指令展开、.data 段、带行号报错</li>' +
              '<li>单步执行：寄存器、内存、PC 热更新，支持断点和回退</li>' +
              '<li>按指令高亮单周期数据通路，同步显示控制信号真值</li>' +
              '<li>五级流水线时空图：切换转发开关观察冒险与气泡</li>' +
            '</ul>' +
            '<div class="note">全部逻辑由 <code>js/data/instructions.js</code> 的 40 条指令元数据驱动，纯静态、离线可跑。</div></div>' +
        '</div>';

      el.querySelectorAll('#mods .module-card').forEach(function (c) {
        c.onclick = function () { RV.app.go(c.dataset.route); };
      });
      el.querySelectorAll('[data-go]').forEach(function (b) {
        b.onclick = function () { RV.app.go(b.dataset.go); };
      });
      el.querySelector('#btn-continue').onclick = function () {
        RV.app.go(last || 'encoder?i=addi');
      };
    }
  };
})();
