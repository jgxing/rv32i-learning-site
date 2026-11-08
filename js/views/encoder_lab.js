(function () {
  'use strict';
  var RV = (window.RV = window.RV || {});
  RV.views = RV.views || {};
  var D = RV.data, E = RV.encoder, A = RV.assembler;

  var SAMPLES = {
    R: 'add x5, x6, x7', I: 'addi x5, x0, 7', S: 'sw x7, 8(x6)',
    B: 'beq x5, x6, -8', U: 'lui x5, 0x12345', J: 'jal x1, -20'
  };

  function wordFromAsm(text) {
    var p = E.parseAsm(text);
    if (!p) return { error: '无法解析这一行，请检查语法' };
    if (p.pseudo || !p.inst) {
      var a = A.assemble(text);
      if (!a.ok) return { error: a.errors[0] ? ('第 ' + a.errors[0].line + ' 行：' + a.errors[0].msg) : '汇编失败' };
      if (!a.items.length) return { error: '没有生成任何指令' };
      return { word: a.items[0].word, expanded: a.items.map(function (i) { return i.asm; }) };
    }
    var ops = {};
    var bad = [];
    ['rd', 'rs1', 'rs2'].forEach(function (k) {
      if (p.ops[k] !== undefined) {
        var n = E.regNum(p.ops[k]);
        if (n === null) bad.push('未知寄存器 ' + p.ops[k]);
        ops[k] = n === null ? 0 : n;
      }
    });
    if (p.ops.imm !== undefined) {
      var v = E.num(p.ops.imm);
      if (v === null) bad.push('这里需要数字立即数（label 请在汇编演练场使用）：' + p.ops.imm);
      ops.imm = v === null ? 0 : v;
    }
    if (bad.length) return { error: bad.join('；') };
    try { return { word: E.encode(p.inst.name, ops) }; }
    catch (err) { return { error: err.message }; }
  }

  function parseMachine(s) {
    s = String(s).trim().toLowerCase().replace(/[\s_]/g, '');
    if (!s) return null;
    if (/^0x[0-9a-f]+$/.test(s)) return parseInt(s, 16) >>> 0;
    if (/^0b[01]+$/.test(s)) return parseInt(s.slice(2), 2) >>> 0;
    if (/^[01]{32}$/.test(s)) return parseInt(s, 2) >>> 0;
    if (/^\d+$/.test(s)) return Number(s) >>> 0;
    if (/^[0-9a-f]{8}$/.test(s)) return parseInt(s, 16) >>> 0;
    return null;
  }

  RV.views.encoder_lab = {
    title: '编码实验室',
    render: function (el, params) {
      var initial = params.i ? (D.BY_ID[params.i] ? D.BY_ID[params.i].example.replace(/\s+#.*$/, '') : SAMPLES.I) : SAMPLES.I;
      var r0 = wordFromAsm(initial);
      var state = { word: r0.word === undefined ? E.encode('addi', { rd: 5, rs1: 0, imm: 7 }) : r0.word, fmt: params.fmt || 'I', field: -1, msg: '', msgType: '' };

      var fmtTabs = Object.keys(D.FORMATS).map(function (f) {
        return '<button class="btn sm ' + (state.fmt === f ? 'active' : '') + '" data-fmt="' + f + '">' + f + ' 型</button>';
      }).join('');

      var opRows = E.opcodeTable().map(function (o) {
        return '<tr><td class="mono">' + o.opcode + '</td><td class="mono">' + o.hex + '</td><td class="mono">' + o.formats + '</td><td>' + o.names.join(' ') + '</td></tr>';
      }).join('');
      var fmtRows = Object.keys(D.FORMATS).map(function (f) {
        var x = D.FORMATS[f];
        return '<tr><td class="mono"><b>' + f + '</b></td><td>' + x.desc + '</td><td class="mono" style="font-size:11px">' + x.fields.map(function (y) { return y[0]; }).join(' | ') + '</td></tr>';
      }).join('');

      el.innerHTML = '<div class="view-head"><div class="eyebrow">模块 02 · 核心实验</div><h1>编码实验室</h1>' +
        '<p class="lead">把 32 位指令字拆开看。点任意字段、切换格式、汇编与机器码双向转换，立即数怎么被打散又拼回去，这里全都能看到。</p></div>' +
        '<div class="card tight" style="margin-bottom:14px"><div class="row"><span style="font-size:12px;color:var(--muted)">指令格式</span>' +
          '<div class="pill-tabs" style="margin:0" id="fmttabs">' + fmtTabs + '</div>' +
          '<span class="spacer"></span><select class="input" id="instSel" style="width:230px"></select>' +
          '<button class="btn" data-act="sample">载入示例</button><button class="btn" data-act="random">随机一条</button></div></div>' +
        '<div class="grid" style="grid-template-columns:minmax(0,1.4fr) minmax(0,1fr)">' +
          '<div>' +
            '<div class="card" style="margin-bottom:14px"><div class="card-title"><h2 style="margin:0">32 位指令字</h2><span class="tag" id="fmttag"></span></div>' +
              '<div id="band"></div><div id="wordinfo" style="margin-top:12px"></div>' +
              '<div id="fielddetail"></div></div>' +
            '<div class="card" style="margin-bottom:14px"><h2>汇编 ⇄ 机器码</h2>' +
              '<div class="row" style="margin-bottom:8px"><span style="font-size:12px;color:var(--muted);width:44px">汇编</span>' +
                '<input class="input mono" id="asmIn" style="flex:1;min-width:150px" value="' + RV.ui.h(initial) + '" placeholder="addi x5, x0, 7">' +
                '<button class="btn primary" data-act="compile">编译 →</button>' +
                '<code id="hexOut" style="min-width:100px"></code></div>' +
              '<div class="row"><span style="font-size:12px;color:var(--muted);width:44px">机器码</span>' +
                '<input class="input mono" id="machIn" style="flex:1;min-width:150px" placeholder="0x00700293 / 32 位二进制 / 十进制">' +
                '<button class="btn" data-act="decode">← 反汇编</button>' +
                '<code id="asmOut" style="min-width:100px"></code></div>' +
              '<div id="convmsg" style="margin-top:10px"></div>' +
              '<div class="note" style="margin-top:10px">支持真实指令与伪指令（伪指令会显示展开结果）；机器码可输入 <code>0x…</code>、8 位十六进制、32 位二进制或十进制。</div></div>' +
            '<div class="card"><div class="card-title"><h2 style="margin:0">立即数解剖</h2><span class="tag" id="immfmt"></span></div><div id="immbody"></div></div>' +
          '</div>' +
          '<div>' +
            '<div class="card" style="margin-bottom:14px"><h2>随堂练习</h2>' +
              '<div style="font-size:12.5px;margin-bottom:6px">1. <code>addi x6, x5, -1</code> 的 imm[11:0] 是？（填 12 位二进制）</div>' +
              '<div class="row"><input class="input mono" id="q1" style="flex:1" placeholder="000000000000"><button class="btn sm" data-act="q1">检查</button></div><div id="q1r"></div>' +
              '<div style="font-size:12.5px;margin:14px 0 6px">2. <code>0x00700293</code> 是哪条指令？</div>' +
              '<div id="q2"></div>' +
              '<div style="font-size:12.5px;margin:14px 0 6px">3. B 型立即数的符号位 imm[12] 放在指令字哪一位？</div>' +
              '<div id="q3"></div></div>' +
            '<div class="card" style="margin-bottom:14px"><h2>六种格式</h2><div class="scroll" style="max-height:230px"><table class="tbl"><thead><tr><th>格式</th><th>用途</th><th>字段</th></tr></thead><tbody>' + fmtRows + '</tbody></table></div></div>' +
            '<div class="card"><h2>opcode 速查</h2><div class="scroll" style="max-height:250px"><table class="tbl"><thead><tr><th>二进制</th><th>hex</th><th>格式</th><th>指令</th></tr></thead><tbody>' + opRows + '</tbody></table></div></div>' +
          '</div></div>';

      function fillSelect() {
        var sel = el.querySelector('#instSel');
        var list = D.INSTRUCTIONS.filter(function (i) { return i.format === state.fmt; });
        sel.innerHTML = list.map(function (i) { return '<option value="' + i.id + '">' + i.name + ' — ' + i.desc + '</option>'; }).join('');
        var cur = E.decode(state.word);
        if (cur.valid && cur.format === state.fmt && list.some(function (i) { return i.id === cur.name; })) sel.value = cur.name;
      }

      function paint() {
        var d = E.decode(state.word);
        var fmt = d.valid ? d.format : state.fmt;
        el.querySelector('#fmttag').textContent = fmt + '-type · ' + (D.FORMATS[fmt] ? D.FORMATS[fmt].desc : '');
        el.querySelector('#immfmt').textContent = fmt + '-type';
        el.querySelectorAll('#fmttabs button').forEach(function (b) { b.classList.toggle('active', b.dataset.fmt === fmt); });
        state.fmt = fmt;
        fillSelect();

        var fs = E.fields(state.word, fmt);
        el.querySelector('#band').innerHTML = '<div class="bitband">' + fs.map(function (f, i) {
          return '<div class="bitseg ' + f.color + (state.field === i ? ' sel' : '') + '" style="flex:' + f.width + '" data-act="field" data-i="' + i + '">' +
            '<div class="bn">' + f.name + '</div><div class="bv">' + f.bits + '</div></div>';
        }).join('') + '</div><div class="bitscale">' + fs.map(function (f) {
          return '<span style="flex:' + f.width + '">' + f.hi + (f.hi === f.lo ? '' : '…' + f.lo) + '</span>';
        }).join('') + '</div>';
        el.querySelector('#wordinfo').innerHTML = '<div class="row"><span class="tag blue">十六进制</span><code>' + E.hex(state.word) + '</code>' +
          '<span class="tag">二进制</span><code style="font-size:11.5px">' + E.binary(state.word) + '</code></div>' +
          '<div class="bit-word" style="margin-top:8px">' + (d.valid ? RV.ui.h(d.asm) : '未识别的指令字') + '</div>';

        var fi = state.field >= 0 && fs[state.field] ? fs[state.field] : null;
        el.querySelector('#fielddetail').innerHTML = '<div class="field-detail"><b>' + (fi ? fi.name + ' [' + fi.hi + ':' + fi.lo + ']' : '点击上方任一色块') + '</b>' +
          '<div style="color:var(--muted);margin-top:4px">' + (fi ? fi.desc + ' 当前值 = <code>' + fi.bits + '</code>（' + fi.value + '）' : '查看字段名称、位号、当前值与它在硬件里对应的信号。') + '</div></div>';

        var im = E.immMap(state.word, fmt);
        el.querySelector('#immbody').innerHTML = fmt === 'R' ? '<p class="lead">' + im.note + '</p>' :
          '<div class="immmap">' + im.parts.map(function (p) {
            return '<div class="immcell"><span style="color:var(--muted)">' + p.dst + '</span> ← <b>' + p.src + '</b> = <b>' + p.value + '</b>' +
              (p.label ? '<div style="color:var(--hint);font-family:var(--sans);font-size:10.5px">' + p.label + '</div>' : '') + '</div>';
          }).join('') + '</div>' +
          '<div class="note info" style="margin-top:10px">拼接结果 = <code>' + im.value + '</code>（32 位无符号 <code>' + E.hex(im.u32) + '</code>）</div>' +
          '<p style="font-size:12.5px;color:var(--muted);margin-top:8px">' + im.note + '</p>';

        el.querySelector('#hexOut').textContent = E.hex(state.word);
        el.querySelector('#asmOut').textContent = d.valid ? d.asm : '—';
        el.querySelector('#machIn').placeholder = E.hex(state.word);
        el.querySelector('#convmsg').innerHTML = state.msg ? '<div class="note ' + (state.msgType === 'ok' ? 'ok' : 'warn') + '">' + RV.ui.h(state.msg) + '</div>' : '';
      }

      function setWord(w, msg, type) {
        state.word = w >>> 0; state.field = -1; state.msg = msg || ''; state.msgType = type || '';
        paint();
      }

      // 练习题
      el.querySelector('#q2').innerHTML = ['addi x5, x0, 7', 'add x5, x0, x7', 'lw x5, 7(x0)', 'lui x5, 0x7'].map(function (o, i) {
        return '<button class="btn sm" style="display:block;width:100%;text-align:left;margin-bottom:4px" data-act="q2" data-v="' + i + '">' + o + '</button>';
      }).join('') + '<div id="q2r"></div>';
      el.querySelector('#q3').innerHTML = ['bit[31]', 'bit[7]', 'bit[30]', 'bit[11]'].map(function (o, i) {
        return '<button class="btn sm" style="margin:0 4px 4px 0" data-act="q3" data-v="' + i + '">' + o + '</button>';
      }).join('') + '<div id="q3r"></div>';

      el.addEventListener('click', function (ev) {
        var t = ev.target.closest('[data-act]');
        if (!t || !el.contains(t)) return;
        var act = t.dataset.act;
        if (act === 'field') { state.field = +t.dataset.i; state.msg = ''; paint(); }
        else if (act === 'sample') {
          var r = wordFromAsm(SAMPLES[state.fmt]);
          setWord(r.word === undefined ? state.word : r.word, '已载入 ' + state.fmt + ' 型示例：' + SAMPLES[state.fmt], 'ok');
          el.querySelector('#asmIn').value = SAMPLES[state.fmt];
        } else if (act === 'random') {
          var list = D.INSTRUCTIONS.filter(function (i) { return i.format === state.fmt; });
          var pick = list[Math.floor(Math.random() * list.length)];
          var ex = pick.example.replace(/\s+#.*$/, '');
          var rr = wordFromAsm(ex);
          setWord(rr.word === undefined ? state.word : rr.word, '随机：' + ex, 'ok');
          el.querySelector('#asmIn').value = ex;
        } else if (act === 'compile') {
          var res = wordFromAsm(el.querySelector('#asmIn').value);
          if (res.error) { state.msg = res.error; state.msgType = 'warn'; paint(); return; }
          var extra = res.expanded ? '（伪指令展开为：' + res.expanded.join('；') + '）' : '';
          setWord(res.word, '编译成功：' + E.hex(res.word) + ' ' + extra, 'ok');
        } else if (act === 'decode') {
          var w = parseMachine(el.querySelector('#machIn').value);
          if (w === null) { state.msg = '请输入合法的机器码：0x00700293、32 位二进制或十进制整数'; state.msgType = 'warn'; paint(); return; }
          var dd = E.decode(w);
          setWord(w, dd.valid ? ('反汇编：' + dd.asm + '（' + dd.format + '-type）') : ('无法识别：' + dd.reason), dd.valid ? 'ok' : 'warn');
        } else if (act === 'q1') {
          var v = el.querySelector('#q1').value.replace(/\s/g, '');
          var right = v === '111111111111';
          el.querySelector('#q1r').innerHTML = '<div class="note ' + (right ? 'ok' : 'warn') + '" style="margin-top:8px">' +
            (right ? '正确！' : '再想想：') + '-1 的 12 位补码是 <code>111111111111</code>，符号扩展后是 <code>0xffffffff</code>，与 R[x5] 相加即减 1。</div>';
        } else if (act === 'q2') {
          var right2 = t.dataset.v === '0';
          el.querySelector('#q2r').innerHTML = '<div class="note ' + (right2 ? 'ok' : 'warn') + '" style="margin-top:8px">' +
            (right2 ? '正确！' : '不对：') + 'opcode=0010011 是 I 型运算，funct3=000 是 addi，imm=7、rs1=x0、rd=x5。</div>';
        } else if (act === 'q3') {
          var right3 = t.dataset.v === '0';
          el.querySelector('#q3r').innerHTML = '<div class="note ' + (right3 ? 'ok' : 'warn') + '" style="margin-top:8px">' +
            (right3 ? '正确！' : '不对：') + 'B 型把符号位 imm[12] 放在指令字 bit[31]，imm[11] 反而放到 bit[7]。</div>';
        }
      });

      el.querySelectorAll('[data-fmt]').forEach(function (b) {
        b.onclick = function () {
          var r = wordFromAsm(SAMPLES[b.dataset.fmt]);
          state.fmt = b.dataset.fmt;
          setWord(r.word === undefined ? state.word : r.word, '已切换到 ' + b.dataset.fmt + ' 型：' + SAMPLES[b.dataset.fmt], 'ok');
          el.querySelector('#asmIn').value = SAMPLES[b.dataset.fmt];
        };
      });
      el.querySelector('#instSel').onchange = function () {
        var inst = D.BY_ID[this.value];
        if (!inst) return;
        var ex = inst.example.replace(/\s+#.*$/, '');
        var r = wordFromAsm(ex);
        setWord(r.word === undefined ? state.word : r.word, inst.name + '：' + inst.desc, 'ok');
        el.querySelector('#asmIn').value = ex;
      };
      el.querySelector('#asmIn').onkeydown = function (ev) {
        if (ev.key === 'Enter') { var r = wordFromAsm(this.value); if (r.word !== undefined) setWord(r.word, '编译成功：' + E.hex(r.word), 'ok'); else { state.msg = r.error; state.msgType = 'warn'; paint(); } }
      };
      el.querySelector('#machIn').onkeydown = function (ev) {
        if (ev.key === 'Enter') { var w = parseMachine(this.value); if (w !== null) setWord(w, '已载入机器码 ' + E.hex(w), 'ok'); }
      };

      paint();
    }
  };
})();
