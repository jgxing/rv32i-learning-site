(function () {
  'use strict';
  var RV = (window.RV = window.RV || {});
  RV.views = RV.views || {};
  var D = RV.data, E = RV.encoder;

  var TERMS = [
    ['ISA', '指令集架构，软件与硬件之间的契约'],
    ['opcode', '操作码，指令字最低 7 位，决定指令大类'],
    ['funct3 / funct7', '功能码，与 opcode 共同确定具体操作'],
    ['rd / rs1 / rs2', '目标寄存器 / 第一、第二源寄存器，各占 5 位'],
    ['立即数', '直接编码在指令字里的常数，需符号扩展'],
    ['符号扩展', '把较短的有符号数的符号位复制到高位，保持数值不变'],
    ['伪指令', '汇编器提供的人性化写法，展开为一条或多条真实指令'],
    ['PC 相对寻址', '分支/跳转以「当前 PC + 字节偏移」为目标'],
    ['Load-Store 架构', '只有专门的加载/存储指令能访问内存'],
    ['调用约定', 'ABI 对寄存器用途、参数传递、保存责任的约定'],
    ['栈帧', '函数在自己的栈空间里保存 ra、局部变量与寄存器的区域'],
    ['控制信号', '由指令译码产生的、用来驱动 MUX 与寄存器堆写使能的信号'],
    ['数据通路', 'CPU 中数据流动与变换的硬件路径'],
    ['单周期 CPU', '一条指令在一个时钟周期内走完全部阶段'],
    ['流水线', '把执行分成 IF/ID/EX/MEM/WB 五级并重叠执行'],
    ['数据冒险', '后续指令依赖前面指令尚未产生的结果'],
    ['转发 / 旁路', '把中间结果直接送给需要的阶段，避免等待写回'],
    ['气泡 / stall', '为消除冒险而在流水线中插入的空转周期'],
    ['CSR', '控制与状态寄存器，属特权架构（本站不实现）']
  ];

  var IMMRANGE = [
    ['I', '12 位有符号', '-2048 ~ 2047', 'addi / lw / jalr 的偏移'],
    ['S', '12 位有符号（拆两段）', '-2048 ~ 2047', 'sb / sh / sw 的偏移'],
    ['B', '13 位有符号（最低位 0）', '-4096 ~ 4094（偶数）', '分支 PC 相对偏移，单位字节'],
    ['U', '20 位字段 << 12', '0 ~ 0xfffff000（步进 4096）', 'lui / auipc'],
    ['J', '21 位有符号（最低位 0）', '-1048576 ~ 1048574（偶数）', 'jal 的 PC 相对偏移，±1 MiB']
  ];

  function cheatRows(q, fmt) {
    var list = D.INSTRUCTIONS.filter(function (i) {
      return (!q || (i.name + ' ' + i.desc + ' ' + i.syntax).toLowerCase().indexOf(q) >= 0) && (!fmt || i.format === fmt);
    });
    return list.map(function (i) {
      return '<tr class="cheatrow" data-id="' + i.id + '" style="cursor:pointer"><td class="mono"><b>' + i.name + '</b></td>' +
        '<td><span class="tag blue">' + i.format + '</span></td><td class="mono">' + i.opcode + '</td>' +
        '<td class="mono">' + (i.funct3 || '—') + '</td><td class="mono">' + RV.ui.h(i.syntax) + '</td><td>' + i.desc + '</td></tr>';
    }).join('');
  }

  function convert(v) {
    var n = E.num(String(v).trim());
    if (n === null) return null;
    var u = n >>> 0;
    var b = E.binary(u);
    return {
      input: String(v).trim(), unsigned: u, signed: u | 0,
      hex: E.hex(u), bin: b,
      bytes: [b.slice(0, 8), b.slice(8, 16), b.slice(16, 24), b.slice(24, 32)],
      imm12: E.signExt(u & 0xfff, 12),
      hexByte: [(u >>> 24) & 0xff, (u >>> 16) & 0xff, (u >>> 8) & 0xff, u & 0xff].map(function (x) { return x.toString(16).padStart(2, '0'); }).join(' ')
    };
  }

  RV.views.tools = {
    title: '速查与工具箱',
    render: function (el, params) {
      var q = (params.q || '').toLowerCase(), fmt = params.fmt || '';
      var c = convert(params.v || '0x12345678');
      var p = RV.app.progress();
      var mastered = Object.keys(p.mastered || {}).length;

      el.innerHTML = '<div class="view-head"><div class="eyebrow">贯穿全站</div><h1>速查与工具箱</h1>' +
        '<p class="lead">指令速查、进制与立即数换算、术语表与学习进度，都放在这一页。</p></div>' +
        '<div class="card" style="margin-bottom:14px"><div class="card-title"><h2 style="margin:0">指令速查表</h2>' +
          '<div class="row"><input class="input search" id="cq" placeholder="搜索指令 / 语法 / 含义" value="' + RV.ui.h(q) + '">' +
          '<div class="pill-tabs" style="margin:0">' + ['', 'R', 'I', 'S', 'B', 'U', 'J'].map(function (f) {
            return '<button class="btn sm ' + (fmt === f ? 'active' : '') + '" data-fmt="' + f + '">' + (f || '全部') + '</button>';
          }).join('') + '</div></div></div>' +
          '<div class="scroll"><table class="tbl"><thead><tr><th>指令</th><th>格式</th><th>opcode</th><th>funct3</th><th>语法</th><th>含义</th></tr></thead><tbody>' +
          cheatRows(q, fmt) + '</tbody></table></div>' +
          '<div class="note" style="margin-top:10px">点击任意行打开指令字典。伪指令共 ' + D.PSEUDO.length + ' 条，可在字典页切换查看。</div></div>' +
        '<div class="grid g2" style="margin-bottom:14px">' +
          '<div class="card"><h2>进制 / 立即数换算</h2>' +
            '<div class="row"><input class="input mono" id="cv" style="flex:1" value="' + RV.ui.h(params.v || '0x12345678') + '" placeholder="0x… / 十进制 / -1">' +
              '<button class="btn primary" data-act="conv">换算</button></div>' +
            '<div id="cvout" style="margin-top:12px"></div></div>' +
          '<div class="card"><h2>立即数范围速查</h2>' +
            '<table class="tbl"><thead><tr><th>格式</th><th>编码</th><th>范围</th><th>用途</th></tr></thead><tbody>' +
            IMMRANGE.map(function (r) { return '<tr><td class="mono"><b>' + r[0] + '</b></td><td>' + r[1] + '</td><td class="mono">' + r[2] + '</td><td style="color:var(--muted)">' + r[3] + '</td></tr>'; }).join('') +
            '</tbody></table>' +
            '<div class="note warn" style="margin-top:10px">超出 12 位的常数要用 <code>lui + addi</code>（即伪指令 <code>li</code>）；低 12 位 ≥ 0x800 时高位需 +1 修正。</div></div></div>' +
        '<div class="grid g2">' +
          '<div class="card"><h2>术语表</h2><div class="scroll" style="max-height:330px"><table class="tbl"><thead><tr><th>术语</th><th>解释</th></tr></thead><tbody>' +
            TERMS.map(function (t) { return '<tr><td class="mono"><b>' + t[0] + '</b></td><td style="color:var(--muted)">' + t[1] + '</td></tr>'; }).join('') +
            '</tbody></table></div></div>' +
          '<div><div class="card" style="margin-bottom:14px"><h2>学习进度</h2>' +
            '<div class="metric"><div class="lbl">在字典里查看过的指令</div><div class="val">' + mastered + ' / 40</div>' +
              '<div class="bar g"><i style="width:' + Math.round(mastered / 40 * 100) + '%"></i></div></div>' +
            '<p style="font-size:12.5px;color:var(--muted);margin-top:12px">进度、汇编草稿与测验成绩都保存在浏览器 localStorage，换页面不会丢失，清除浏览器数据才会重置。</p>' +
            '<div class="row" style="margin-top:12px"><button class="btn" data-act="preset">重置学习进度</button>' +
              '<button class="btn" data-go="quiz">去做测验 →</button></div></div>' +
          '<div class="card"><h2>关于本站</h2>' +
            '<ul class="tight" style="font-size:13px;color:var(--muted)">' +
              '<li>纯静态前端，无框架、无构建、无 CDN 依赖，可直接双击 index.html 离线运行</li>' +
              '<li>40 条 RV32I 指令元数据集中在 <code>js/data/instructions.js</code>，所有视图共享</li>' +
              '<li>汇编器、解释器、编码器均为本站实现，教学用途，未实现 CSR / 特权 / 异常处理</li>' +
              '<li>可用 <code>node tools/selftest.js</code> 运行核心引擎自检</li>' +
            '</ul></div></div></div>';

      function paintConv() {
        el.querySelector('#cvout').innerHTML = !c ? '<div class="note warn">无法解析这个数，请输入 0x…、十进制或负数</div>' :
          '<div class="kv"><span>32 位无符号</span><b class="mono">' + c.unsigned + '</b></div>' +
          '<div class="kv"><span>32 位有符号</span><b class="mono">' + c.signed + '</b></div>' +
          '<div class="kv"><span>十六进制</span><b class="mono">' + c.hex + '</b></div>' +
          '<div class="kv"><span>二进制</span><b class="mono" style="font-size:11px">' + c.bin + '</b></div>' +
          '<div class="kv"><span>按字节分组</span><b class="mono" style="font-size:11px">' + c.bytes.join(' ') + '</b></div>' +
          '<div class="kv"><span>大端字节序</span><b class="mono">' + c.hexByte + '</b></div>' +
          '<div class="kv"><span>低 12 位符号扩展</span><b class="mono">' + c.imm12 + '</b></div>' +
          '<div class="note info" style="margin-top:10px">低 12 位 = <code>' + E.pad((c.unsigned & 0xfff).toString(2), 12) + '</code>，符号扩展后为 ' + c.imm12 + '。这正是 <code>addi</code> 立即数的处理方式。</div>';
      }
      paintConv();

      el.querySelectorAll('.cheatrow').forEach(function (r) {
        r.onclick = function () { RV.app.go('dictionary?i=' + r.dataset.id); };
      });
      el.querySelectorAll('[data-fmt]').forEach(function (b) {
        b.onclick = function () { RV.app.go('tools?fmt=' + b.dataset.fmt + (q ? '&q=' + encodeURIComponent(q) : '')); };
      });
      var qi = el.querySelector('#cq');
      qi.onkeydown = function (ev) { if (ev.key === 'Enter') RV.app.go('tools?q=' + encodeURIComponent(qi.value) + (fmt ? '&fmt=' + fmt : '')); };
      var vi = el.querySelector('#cv');
      vi.onkeydown = function (ev) { if (ev.key === 'Enter') RV.app.go('tools?v=' + encodeURIComponent(vi.value)); };

      el.addEventListener('click', function (ev) {
        var t = ev.target.closest('[data-act]');
        if (!t) return;
        if (t.dataset.act === 'conv') RV.app.go('tools?v=' + encodeURIComponent(vi.value));
        else if (t.dataset.act === 'preset') {
          try { localStorage.removeItem('rv32i.progress'); } catch (e) { }
          RV.app.toast('学习进度已重置');
          RV.app.go('tools');
        }
      });
      el.querySelectorAll('[data-go]').forEach(function (b) { b.onclick = function () { RV.app.go(b.dataset.go); }; });
    }
  };
})();
