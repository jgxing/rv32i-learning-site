(function () {
  'use strict';
  var RV = (window.RV = window.RV || {});
  RV.views = RV.views || {};
  var D = RV.data, E = RV.encoder, A = RV.assembler;
  var DRAFT_KEY = 'rv32i.draft';
  var simTimer = null;

  RV.views.simulator = {
    destroy: function () { if (simTimer) { clearInterval(simTimer); simTimer = null; } },
    title: '汇编演练场',
    render: function (el, params) {
      var pid = params.p || D.PROGRAMS[0].id;
      var prog = D.PROGRAMS.filter(function (p) { return p.id === pid; })[0] || D.PROGRAMS[0];
      var sim = null, asm = null, errors = [];
      var draft = null;
      try { draft = localStorage.getItem(DRAFT_KEY); } catch (e) { }
      var draftRestored = !params.p && !!draft && draft.trim().length > 0;

      el.innerHTML = '<div class="view-head"><div class="eyebrow">模块 03 · 核心实验</div><h1>汇编演练场</h1>' +
        '<p class="lead">内置两遍扫描汇编器 + RV32I 解释器。改代码 → 汇编 → 单步，寄存器、内存和 PC 每一步都实时更新。</p></div>' +
        '<div class="card tight" style="margin-bottom:14px"><div class="row">' +
          '<select class="input" id="progSel" style="width:230px">' + D.PROGRAMS.map(function (p) {
            return '<option value="' + p.id + '" ' + (p.id === prog.id ? 'selected' : '') + '>' + p.title + '</option>';
          }).join('') + '</select>' +
          '<button class="btn primary" data-act="assemble">汇编并载入</button>' +
          '<button class="btn" data-act="step">单步 ▸</button>' +
          '<button class="btn" data-act="play">自动播放</button>' +
          '<button class="btn" data-act="run">运行到底</button>' +
          '<button class="btn" data-act="back">↶ 回退</button>' +
          '<button class="btn" data-act="reset">重置</button>' +
          '<span class="spacer"></span><span class="tag blue" id="expect"></span></div></div>' +
        '<div class="grid" style="grid-template-columns:minmax(0,1.08fr) minmax(0,1fr)">' +
          '<div>' +
            '<div class="card" style="margin-bottom:14px"><div class="card-title"><h2 style="margin:0">汇编源码</h2>' +
              '<div class="row">' + (draftRestored ? '<span class="tag amber">已恢复本地草稿</span>' : '') +
              '<span class="tag">点执行跟踪的行号设断点</span></div></div>' +
              '<textarea class="input" id="code" rows="16" spellcheck="false"></textarea>' +
              '<div id="errors" style="margin-top:10px"></div>' +
              '<details style="margin-top:10px"><summary style="cursor:pointer;font-size:12.5px;color:var(--muted)">查看汇编结果（地址 / 机器码 / 反汇编）</summary><div id="listing" style="margin-top:10px"></div></details></div>' +
            '<div class="card"><div class="card-title"><h2 style="margin:0">执行跟踪</h2><span class="tag" id="pcbadge"></span></div>' +
              '<div class="editor" id="trace"></div>' +
              '<div class="note" style="margin-top:10px;display:flex;gap:10px;flex-wrap:wrap"><span>蓝色高亮 = 当前 PC</span><span style="color:var(--red)">红色行号 = 断点</span><span>点击任意行切换断点</span></div></div>' +
          '</div>' +
          '<div>' +
            '<div class="card" style="margin-bottom:14px"><div class="card-title"><h2 style="margin:0">运行状态</h2><span class="tag" id="haltbadge"></span></div>' +
              '<div class="grid g3" style="gap:8px"><div class="metric"><div class="lbl">PC</div><div class="val mono" style="font-size:15px" id="mPC">0x00000000</div></div>' +
                '<div class="metric"><div class="lbl">周期 / 指令数</div><div class="val mono" style="font-size:15px" id="mCycle">0</div></div>' +
                '<div class="metric"><div class="lbl">输出 (ecall)</div><div class="val mono" style="font-size:15px" id="mOut">—</div></div></div>' +
              '<div class="output" id="outbox" style="margin-top:10px"></div></div>' +
            '<div class="card" style="margin-bottom:14px"><div class="card-title"><h2 style="margin:0">寄存器堆</h2><span class="tag">变化值高亮 · 显示 ABI 名</span></div>' +
              '<div class="reggrid" id="regs"></div></div>' +
            '<div class="card" style="margin-bottom:14px"><div class="card-title"><h2 style="margin:0">数据内存</h2><span class="tag">小端 · 字视图</span></div>' +
              '<div class="mono" style="font-size:11px" id="mem"></div></div>' +
            '<div class="card"><div class="card-title"><h2 style="margin:0">执行日志</h2><button class="btn sm" data-act="clearlog">清空</button></div>' +
              '<div class="logbox" id="log"></div></div>' +
          '</div></div>' +
        '<div class="grid g2" style="margin-top:14px">' +
          '<div class="card"><h2>对应的 C 代码</h2><div class="rtl-box" style="white-space:pre-wrap">' + RV.ui.h(prog.c) + '</div>' +
            '<div class="note info" style="margin-top:10px">预期输出：<b>' + prog.expect + '</b>　·　' + prog.desc + '</div></div>' +
          '<div class="card"><h2>这段程序的要点</h2><ul class="tight" style="font-size:13px;color:var(--muted)">' +
            prog.hints.map(function (h) { return '<li>' + RV.ui.h(h) + '</li>'; }).join('') + '</ul>' +
            '<div class="note warn">约定：<code>a0 = 1</code> 时 <code>ecall</code> 输出 <code>a1</code>；<code>a0 = 10</code> 时停机。sp 初值 0xe000。</div></div></div>';

      var code = el.querySelector('#code');
      code.value = draftRestored ? draft : prog.code;

      function stopTimer() {
        if (simTimer) { clearInterval(simTimer); simTimer = null; }
        var b = el.querySelector('[data-act="play"]');
        if (b) b.textContent = '自动播放';
      }

      function paintErrors() {
        el.querySelector('#errors').innerHTML = errors.length ?
          '<div class="note warn"><b>汇编失败</b><div class="err">' + errors.map(function (e) { return RV.ui.h('第 ' + e.line + ' 行：' + e.msg); }).join('\n') + '</div></div>' : '';
      }

      function paintListing() {
        if (!asm) { el.querySelector('#listing').innerHTML = '<p class="lead">尚未汇编</p>'; return; }
        el.querySelector('#listing').innerHTML = '<div class="scroll" style="max-height:220px"><table class="tbl"><thead><tr><th>地址</th><th>机器码</th><th>指令</th><th>源行</th></tr></thead><tbody>' +
          asm.items.map(function (i) {
            return '<tr><td class="mono">' + E.hex(i.addr).slice(2) + '</td><td class="mono">' + i.hex + '</td><td class="mono">' + RV.ui.h(i.asm) + '</td><td>' + i.line + (i.pseudo ? ' <span class="tag amber">展开</span>' : '') + '</td></tr>';
          }).join('') + '</tbody></table></div>' +
          '<div class="note" style="margin-top:8px">共 ' + asm.items.length + ' 条指令（伪指令已展开），代码段 ' + asm.codeLength + ' 字节；标签：' +
          (Object.keys(asm.labels).length ? Object.keys(asm.labels).map(function (k) { return '<code>' + k + '=0x' + asm.labels[k].toString(16) + '</code>'; }).join(' ') : '无') + '</div>';
      }

      function paintTrace() {
        var lines = asm ? asm.rawLines : code.value.split(/\r?\n/);
        var curLine = sim ? sim.lineOf(sim.state.pc) : 0;
        var bps = sim ? sim.state.breakpoints : {};
        el.querySelector('#trace').innerHTML = lines.map(function (l, i) {
          var n = i + 1;
          return '<div class="ed-line ' + (n === curLine ? 'pc' : '') + ' ' + (bps[n] ? 'brk' : '') + '" data-act="brk" data-line="' + n + '">' +
            '<span class="ln">' + (bps[n] ? '●' : String(n).padStart(2, ' ')) + '</span><span class="src">' + RV.ui.h(l || ' ') + '</span></div>';
        }).join('');
        el.querySelector('#pcbadge').textContent = sim ? 'PC = ' + E.hex(sim.state.pc) : '未载入';
      }

      function paintState() {
        if (!sim) {
          el.querySelector('#mPC').textContent = '—'; el.querySelector('#mCycle').textContent = '—';
          el.querySelector('#mOut').textContent = '—'; el.querySelector('#outbox').textContent = '请先点「汇编并载入」';
          el.querySelector('#regs').innerHTML = '<span class="lead">尚未载入程序</span>';
          el.querySelector('#mem').innerHTML = '—'; el.querySelector('#log').textContent = '';
          el.querySelector('#haltbadge').textContent = '未载入';
          return;
        }
        var s = sim.state;
        el.querySelector('#mPC').textContent = E.hex(s.pc);
        el.querySelector('#mCycle').textContent = s.cycle;
        el.querySelector('#mOut').textContent = s.output.length ? s.output.join(', ') : '—';
        el.querySelector('#outbox').textContent = s.output.length ? '程序输出 → ' + s.output.join(', ') : '';
        el.querySelector('#haltbadge').textContent = s.halted ? '已停机' : '运行中';
        el.querySelector('#haltbadge').className = 'tag ' + (s.halted ? 'green' : 'blue');

        var changed = {};
        (s.lastChanged || []).forEach(function (c) { changed[c.reg] = true; });
        el.querySelector('#regs').innerHTML = sim.regDump().map(function (r) {
          return '<div class="reg ' + (changed[r.i] ? 'chg' : '') + '"><span>' + r.name + ' <span style="color:var(--hint)">' + r.abi + '</span></span>' +
            '<span>0x' + r.value.toString(16).padStart(8, '0') + '</span></div>';
        }).join('');

        var sp = s.regs[2];
        var dataRows = sim.dump(0x1000, 6).map(function (d) {
          return '<div style="display:flex;justify-content:space-between"><span style="color:var(--muted)">0x' + d.addr.toString(16).padStart(4, '0') + '</span>' +
            '<span>' + d.bytes.map(function (b) { return b.toString(16).padStart(2, '0'); }).join(' ') + '</span>' +
            '<span style="color:var(--accent)">' + (d.word | 0) + '</span></div>';
        }).join('');
        var stackRows = sim.dump((sp - 8) & 0xffff, 3).map(function (d) {
          return '<div style="display:flex;justify-content:space-between"><span style="color:var(--muted)">0x' + d.addr.toString(16).padStart(4, '0') + '</span>' +
            '<span>' + d.bytes.map(function (b) { return b.toString(16).padStart(2, '0'); }).join(' ') + '</span><span style="color:var(--accent)">' + (d.word | 0) + '</span></div>';
        }).join('');
        el.querySelector('#mem').innerHTML = '<div style="color:var(--muted);margin-bottom:4px">.data 段 (0x1000)</div>' + dataRows +
          '<div style="color:var(--muted);margin:8px 0 4px">栈附近 (sp = 0x' + sp.toString(16) + ')</div>' + stackRows;

        el.querySelector('#log').textContent = s.log.length ?
          s.log.slice(-14).map(function (l) { return '#' + l.cycle + '  ' + E.hex(l.pc).slice(2) + '  ' + l.asm + '\n      → ' + l.effect; }).join('\n') : '（还没有执行任何指令）';
        el.querySelector('#expect').textContent = s.output.length && s.output[s.output.length - 1] === prog.expect ?
          '结果正确 ✓ ' + prog.expect : '预期输出 ' + prog.expect;
      }

      function paintAll() { paintErrors(); paintListing(); paintTrace(); paintState(); }

      function assemble() {
        stopTimer();
        asm = A.assemble(code.value);
        errors = asm.errors;
        if (asm.ok) {
          sim = RV.simulator.create(asm);
          try { localStorage.setItem(DRAFT_KEY, code.value); } catch (e) { }
        } else { sim = null; }
        paintAll();
      }

      el.addEventListener('click', function (ev) {
        var t = ev.target.closest('[data-act]');
        if (!t || !el.contains(t)) return;
        var act = t.dataset.act;
        if (act === 'brk') {
          if (!sim) return;
          var n = +t.dataset.line;
          sim.state.breakpoints[n] = !sim.state.breakpoints[n];
          paintTrace();
          return;
        }
        if (act === 'assemble') { assemble(); return; }
        if (act === 'clearlog') { if (sim) { sim.state.log.length = 0; paintState(); } return; }
        if (act !== 'step' && act !== 'play' && act !== 'run' && act !== 'back' && act !== 'reset') return;
        if (!sim) assemble();
        if (!sim) return;
        if (act === 'step') { stopTimer(); sim.step(); }
        else if (act === 'back') { stopTimer(); sim.back(); }
        else if (act === 'reset') { stopTimer(); sim.reset(); }
        else if (act === 'run') { stopTimer(); sim.run(5000); }
        else if (act === 'play') {
          if (simTimer) { stopTimer(); return; }
          t.textContent = '暂停';
          simTimer = setInterval(function () {
            if (!sim || sim.state.halted) { stopTimer(); paintAll(); return; }
            var ln = sim.lineOf(sim.state.pc);
            if (sim.state.breakpoints[ln]) { stopTimer(); paintAll(); return; }
            sim.step(); paintAll();
            if (sim.state.halted) stopTimer();
          }, 260);
          return;
        }
        paintAll();
      });

      code.oninput = function () { try { localStorage.setItem(DRAFT_KEY, code.value); } catch (e) { } };
      el.querySelector('#progSel').onchange = function () {
        stopTimer();
        RV.app.go('simulator?p=' + this.value);
      };

      assemble();
    }
  };
})();
