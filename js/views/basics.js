(function () {
  'use strict';
  var RV = (window.RV = window.RV || {});
  RV.views = RV.views || {};
  var D = RV.data;

  var EXT = [
    ['I', '基础整数指令集', 'RV32I 的 40 条指令，所有实现都必须有'],
    ['M', '整数乘除法', 'mul / div / rem 等，本站不实现'],
    ['A', '原子操作', 'lr.w / sc.w、AMO，用于多核同步'],
    ['F / D', '单 / 双精度浮点', '独立浮点寄存器堆 f0–f31'],
    ['C', '压缩指令', '把常用指令编成 16 位，代码体积约减 25%'],
    ['G', '通用组合', 'G = I + M + A + F + D 的简称'],
    ['Zicsr', 'CSR 访问', 'csrrw / csrrs 等，属特权架构配套'],
    ['Zifencei', '指令流同步', 'fence.i']
  ];

  var FORMAT_ROWS = Object.keys(D.FORMATS).map(function (k) {
    var f = D.FORMATS[k];
    return '<tr><td class="mono"><b>' + k + '</b></td><td>' + f.desc + '</td><td class="mono">' + f.example + '</td><td class="mono">' +
      f.fields.map(function (x) { return x[0]; }).join(' | ') + '</td></tr>';
  }).join('');

  var MEMCELLS = [
    { a: '0x1000', v: '03' }, { a: '0x1001', v: '00' }, { a: '0x1002', v: '00' }, { a: '0x1003', v: '00' },
    { a: '0x1004', v: '09' }, { a: '0x1005', v: '00' }, { a: '0x1006', v: '00' }, { a: '0x1007', v: '00' }
  ];

  function tabOverview() {
    return '<div class="grid g2">' +
      '<div class="card"><h2>什么是 RV32I</h2>' +
        '<p style="font-size:13px">RISC-V 是一套<strong>开放、免费、模块化</strong>的指令集标准，不是某家公司的芯片。名字可以拆开读：<code>RV</code> = RISC-V，<code>32</code> = 通用寄存器与地址宽度为 32 位，<code>I</code> = Integer 基础整数指令集。</p>' +
        '<p style="font-size:13px">RV32I 只有 <strong>40 条</strong>指令，却足以跑完整的 C 程序（乘法可用加法循环或 M 扩展）。它是整个体系的地基，其它扩展都叠加在它上面。</p>' +
        '<div class="note info">本站一期只实现 RV32I 与常用伪指令；M / A / C / Zicsr 只作介绍，不参与编码与模拟。</div>' +
        '<h3 style="margin-top:16px">五个关键设计</h3>' +
        '<ul class="tight" style="font-size:13px;color:var(--muted)">' +
          '<li><b>Load-Store 架构</b>：只有 lb/lh/lw/sb/sh/sw 能访问内存，运算只作用于寄存器</li>' +
          '<li><b>固定 4 字节指令</b>：取指简单，PC 每次 +4（C 扩展才有 2 字节指令）</li>' +
          '<li><b>x0 恒为 0</b>：省掉大量专用指令，nop / mv / li 都靠它实现</li>' +
          '<li><b>字段位置固定</b>：rs1/rs2/rd 在各格式中位号一致，译码器可以提前读寄存器堆</li>' +
          '<li><b>无延迟槽、无条件执行</b>：分支后没有需要填充的指令</li>' +
        '</ul></div>' +
      '<div class="card"><h2>扩展字母表</h2>' +
        '<table class="tbl"><thead><tr><th>字母</th><th>含义</th><th>说明</th></tr></thead><tbody>' +
        EXT.map(function (e) { return '<tr><td class="mono"><b>' + e[0] + '</b></td><td>' + e[1] + '</td><td style="color:var(--muted)">' + e[2] + '</td></tr>'; }).join('') +
        '</tbody></table>' +
        '<div class="note" style="margin-top:12px">例如 <code>RV32IMAC</code> 表示 32 位 + 基础整数 + 乘除 + 原子 + 压缩指令。</div></div>' +
      '</div>' +
      '<div class="card" style="margin-top:14px"><h2>六种指令格式</h2>' +
        '<p class="lead" style="margin-bottom:12px">所有格式里 opcode 都在 bit[6:0]，rd/rs1/rs2/funct3 的位置保持一致；代价是 S/B/J 型的立即数位序被打散。</p>' +
        '<div class="scroll"><table class="tbl"><thead><tr><th>格式</th><th>用途</th><th>示例</th><th>字段（高位 → 低位）</th></tr></thead><tbody>' + FORMAT_ROWS + '</tbody></table></div>' +
        '<div class="row" style="margin-top:12px"><button class="btn primary" data-go="encoder">去编码实验室拆一条指令 →</button></div></div>';
  }

  function tabRegs() {
    var rows = D.REGS.map(function (r, i) {
      var save = r[3] === '调用者保存' ? 'red' : r[3] === '被调用者保存' ? 'green' : '';
      return '<tr class="regrow" data-i="' + i + '" style="cursor:pointer"><td class="mono">x' + i + '</td><td class="mono"><b>' + r[1] + '</b></td><td>' + r[2] + '</td>' +
        '<td>' + (save ? '<span class="tag ' + save + '">' + r[3] + '</span>' : '<span class="tag">' + r[3] + '</span>') + '</td></tr>';
    }).join('');
    return '<div class="grid" style="grid-template-columns:minmax(0,1.35fr) minmax(0,1fr)">' +
      '<div class="card"><div class="card-title"><h2 style="margin:0">32 个通用寄存器</h2><span class="tag">点击任意行看说明</span></div>' +
        '<div class="scroll" style="max-height:520px"><table class="tbl"><thead><tr><th>编号</th><th>ABI 名</th><th>用途</th><th>调用约定</th></tr></thead><tbody>' + rows + '</tbody></table></div></div>' +
      '<div><div class="card" id="reg-detail"><h2>寄存器说明</h2><p class="lead">选择左侧任意寄存器。ABI 名只是软件约定，硬件只认 x0–x31 这 5 位编号。</p>' +
        '<div class="note info">写汇编时两种名字都能用：<code>addi sp, sp, -8</code> 与 <code>addi x2, x2, -8</code> 完全等价。</div></div>' +
        '<div class="card" style="margin-top:14px"><h2>调用约定速记</h2>' +
          '<ul class="tight" style="font-size:13px;color:var(--muted)">' +
            '<li><b>调用者保存</b>：t0–t6、a0–a7、ra。调用方若还要用，得自己先压栈</li>' +
            '<li><b>被调用者保存</b>：s0–s11、sp。被调用函数若要用，必须先保存再恢复</li>' +
            '<li><b>a0 / a1</b>：前两个参数与返回值；<b>ra</b>：jal 写入的返回地址</li>' +
            '<li><b>sp</b>：栈指针，向低地址增长，本模拟器初值 0xe000</li>' +
          '</ul>' +
          '<div class="note warn">x0 不是普通寄存器：读出恒为 0，写入被硬件直接丢弃。</div></div></div></div>';
  }

  function tabMemory() {
    var cells = MEMCELLS.map(function (c, i) {
      return '<div style="flex:1;min-width:64px;border:1px solid ' + (i < 4 ? '#85b7eb' : '#9fe1cb') + ';background:' + (i < 4 ? 'var(--accent-soft)' : 'var(--green-soft)') + ';border-radius:7px;padding:8px 4px;text-align:center">' +
        '<div class="mono" style="font-size:11px;color:var(--muted)">' + c.a + '</div><div class="mono" style="font-size:15px;font-weight:600">' + c.v + '</div></div>';
    }).join('');
    return '<div class="grid g2">' +
      '<div class="card"><h2>字节寻址与小端序</h2>' +
        '<p style="font-size:13px">RV32I 内存<strong>按字节编址</strong>，一个 32 位字占 4 个连续地址。小端序下，字 <code>0x00000003</code> 在内存中是 <code>03 00 00 00</code>。</p>' +
        '<div class="row" style="gap:5px;margin:14px 0">' + cells + '</div>' +
        '<div class="note">上面 8 个字节对应示例程序里 <code>.word 3, 9</code> 从 0x1000 开始的数据。访问第 i 个 int 时字节偏移是 <code>4*i</code>。</div>' +
        '<h3 style="margin-top:16px">对齐</h3>' +
        '<p style="font-size:13px;color:var(--muted)">lw / sw 要求 4 字节对齐，lh / sh 要求 2 字节对齐。RISC-V 基础规范不保证非对齐访问一定能用，写程序时让编译器或自己保证。</p>' +
        '<div class="divider"></div>' +
        '<h2>本模拟器的内存布局</h2>' +
        '<table class="tbl"><tbody>' +
          '<tr><td class="mono">0x0000 起</td><td>代码段，每条指令 4 字节</td></tr>' +
          '<tr><td class="mono">0x1000 起</td><td>.data 段，由 .word 填充</td></tr>' +
          '<tr><td class="mono">0xe000</td><td>sp 初值，栈向低地址增长</td></tr>' +
          '<tr><td class="mono">0x10000</td><td>内存总大小 64 KiB</td></tr>' +
        '</tbody></table></div>' +
      '<div class="card"><h2>PC、特权级与系统调用</h2>' +
        '<p style="font-size:13px"><b>PC</b> 不是 x0–x31 中的寄存器，而是独立的 32 位程序计数器，保存当前指令地址。顺序执行时 PC += 4；分支与跳转由 PC 来源选择 MUX 改写。</p>' +
        '<h3 style="margin-top:16px">三种特权级</h3>' +
        '<table class="tbl"><thead><tr><th>级别</th><th>典型运行者</th><th>说明</th></tr></thead><tbody>' +
          '<tr><td class="mono">M</td><td>固件 / OpenSBI</td><td>机器模式，权限最高，必须实现</td></tr>' +
          '<tr><td class="mono">S</td><td>操作系统内核</td><td>监管者模式，支持虚拟内存</td></tr>' +
          '<tr><td class="mono">U</td><td>应用程序</td><td>用户模式，权限最低</td></tr>' +
        '</tbody></table>' +
        '<p style="font-size:13px;margin-top:12px"><b>CSR</b>（控制与状态寄存器）属于 Zicsr / 特权架构，用来保存 mstatus、mtvec、mepc 等；<code>ecall</code> 会从低特权级陷入高特权级处理。</p>' +
        '<div class="note warn" style="margin-top:12px">本站是纯 RV32I 用户态模拟器，不实现 CSR 与异常处理。<code>ecall</code> 被简化为：a0 = 1 时把 a1 当整数输出；a0 = 10 或其它值则停机。<code>ebreak</code> 直接停机。</div>' +
        '<div class="row" style="margin-top:14px"><button class="btn" data-go="simulator">去汇编演练场试试 →</button></div></div></div>';
  }

  RV.views.basics = {
    title: 'ISA 基础',
    render: function (el, params) {
      var tab = params.tab || 'overview';
      var tabs = [['overview', 'ISA 概览'], ['regs', '寄存器与 ABI'], ['memory', '内存与运行']];
      el.innerHTML = '<div class="view-head"><div class="eyebrow">模块 01</div><h1>ISA 基础</h1>' +
        '<p class="lead">先把寄存器、地址空间和调用约定理清，后面读编码和数据通路才不会卡住。</p></div>' +
        '<div class="pill-tabs" id="btabs">' + tabs.map(function (t) {
          return '<button class="btn ' + (tab === t[0] ? 'active' : '') + '" data-tab="' + t[0] + '">' + t[1] + '</button>';
        }).join('') + '</div><div id="bcontent"></div>';

      var content = el.querySelector('#bcontent');
      function paint() {
        content.innerHTML = tab === 'regs' ? tabRegs() : tab === 'memory' ? tabMemory() : tabOverview();
        content.querySelectorAll('[data-go]').forEach(function (b) {
          b.onclick = function () { RV.app.go(b.dataset.go); };
        });
        content.querySelectorAll('.regrow').forEach(function (r) {
          r.onclick = function () {
            var i = +r.dataset.i, x = D.REGS[i];
            content.querySelectorAll('.regrow').forEach(function (o) { o.style.background = ''; });
            r.style.background = 'var(--accent-soft)';
            el.querySelector('#reg-detail').innerHTML = '<h2>x' + i + ' · ' + RV.ui.h(x[1]) + '</h2>' +
              '<div class="metric" style="margin-bottom:12px"><div class="lbl">5 位寄存器编号</div><div class="val mono">' + RV.encoder.pad(i.toString(2), 5) + '</div></div>' +
              '<div class="kv"><span>ABI 名称</span><b class="mono">' + RV.ui.h(x[1]) + '</b></div>' +
              '<div class="kv"><span>典型用途</span><b>' + RV.ui.h(x[2]) + '</b></div>' +
              '<div class="kv"><span>调用约定</span><b>' + RV.ui.h(x[3]) + '</b></div>' +
              '<p style="font-size:13px;margin-top:12px">' + (i === 0 ? '硬连线到常量 0。它是很多伪指令的关键：<code>addi x0, x0, 0</code> = nop，<code>mv rd, rs</code> = addi rd, rs, 0，<code>li rd, 5</code> = addi rd, x0, 5。' :
                i === 1 ? 'jal 会把 PC+4 写进 ra。非叶子函数必须在开头把 ra 压栈，否则递归/嵌套调用后无法返回。' :
                i === 2 ? '栈向低地址增长：<code>addi sp, sp, -8</code> 分配 8 字节，<code>sw ra, 4(sp)</code> 保存返回地址，返回前 <code>addi sp, sp, 8</code> 释放。' :
                '该寄存器在编码中就是 5 位二进制 ' + RV.encoder.pad(i.toString(2), 5) + '，填入指令字的 rs1 / rs2 / rd 字段。') + '</p>' +
              '<button class="btn" data-go="dictionary?i=addi">在字典里看 addi →</button>';
            el.querySelector('#reg-detail').querySelector('[data-go]').onclick = function () { RV.app.go('dictionary?i=addi'); };
          };
        });
      }
      paint();
      el.querySelectorAll('#btabs button').forEach(function (b) {
        b.onclick = function () { RV.app.go('basics?tab=' + b.dataset.tab); };
      });
    }
  };
})();
