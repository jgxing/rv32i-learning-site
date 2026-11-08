(function () {
  'use strict';
  var RV = (window.RV = window.RV || {});
  RV.views = RV.views || {};
  var D = RV.data, E = RV.encoder;

  var PSAMPLE = {
    nop: [], li: ['x5', '0x12345fff'], la: ['x5', 'arr'], mv: ['x5', 'x6'], not: ['x5', 'x6'],
    neg: ['x5', 'x6'], seqz: ['x5', 'x6'], snez: ['x5', 'x6'], sltz: ['x5', 'x6'], sgtz: ['x5', 'x6'],
    j: ['loop'], jal: ['func'], call: ['func'], tail: ['func'], jr: ['x1'], ret: [],
    beqz: ['x5', 'loop'], bnez: ['x5', 'loop'], bltz: ['x5', 'loop'], bgez: ['x5', 'loop'],
    blez: ['x5', 'loop'], bgtz: ['x5', 'loop'], bgt: ['x5', 'x6', 'loop'], ble: ['x5', 'x6', 'loop'],
    bgtu: ['x5', 'x6', 'loop'], bleu: ['x5', 'x6', 'loop']
  };

  function sampleWord(inst) {
    var p = E.parseAsm(inst.example);
    if (!p || !p.inst) return null;
    var ops = {};
    ['rd', 'rs1', 'rs2'].forEach(function (k) { if (p.ops[k] !== undefined) ops[k] = E.regNum(p.ops[k]); });
    if (p.ops.imm !== undefined) {
      var n = E.num(p.ops.imm);
      ops.imm = n === null ? 0 : n;
    }
    try { return E.encode(inst.name, ops); } catch (e) { return null; }
  }

  function bandHtml(word, format) {
    var fs = E.fields(word, format);
    return '<div class="bitband">' + fs.map(function (f) {
      return '<div class="bitseg ' + f.color + '" style="flex:' + f.width + '" title="' + f.name + ' [' + f.hi + ':' + f.lo + ']">' +
        '<div class="bn">' + f.name + '</div><div class="bv">' + f.bits + '</div></div>';
    }).join('') + '</div><div class="bitscale">' + fs.map(function (f) {
      return '<span style="flex:' + f.width + '">' + f.hi + (f.hi === f.lo ? '' : '…' + f.lo) + '</span>';
    }).join('') + '</div>';
  }

  function instDetail(inst) {
    var w = sampleWord(inst);
    var dec = w === null ? null : E.decode(w);
    var ctrl = RV.datapath.controlRows(inst).map(function (r) {
      var strong = r.value !== '0' && r.value !== '—';
      return '<tr><td class="mono">' + r.key + '</td><td class="mono"><b style="color:' + (strong ? 'var(--accent)' : 'var(--muted)') + '">' + r.value + '</b></td><td style="color:var(--muted)">' + r.desc + '</td></tr>';
    }).join('');

    return '<div class="card">' +
      '<div class="card-title"><div class="row"><span class="mono" style="font-size:20px;font-weight:600">' + inst.name + '</span>' +
        '<span class="tag blue">' + inst.format + '-type</span><span class="tag">' + inst.group + '</span></div>' +
        '<span class="tag purple">opcode ' + inst.opcode + (inst.funct3 ? ' · f3 ' + inst.funct3 : '') + (inst.funct7 ? ' · f7 ' + inst.funct7 : '') + '</span></div>' +
      '<p style="font-size:13.5px">' + inst.desc + '</p>' +
      '<div class="grid g2" style="margin-bottom:14px">' +
        '<div><label class="fld">语法</label><div class="rtl-box">' + RV.ui.h(inst.syntax) + '</div></div>' +
        '<div><label class="fld">语义（RTL）</label><div class="rtl-box">' + RV.ui.h(inst.rtl) + '</div></div>' +
      '</div>' +
      '<div class="card soft" style="margin-bottom:14px"><div class="card-title"><h3 style="margin:0">编码示例</h3>' +
        '<code style="font-size:12px">' + (dec ? dec.asm : inst.example) + '</code></div>' +
        (w !== null ? bandHtml(w, inst.format) +
          '<div class="row" style="margin-top:10px"><span class="tag">机器码</span><code>' + E.hex(w) + '</code>' +
          '<span class="tag">二进制</span><code style="font-size:11px">' + E.binary(w) + '</code></div>' : '<p class="lead">该指令无固定样例</p>') +
      '</div>' +
      '<div class="grid g2" style="margin-bottom:14px">' +
        '<div><h3>要点</h3><p style="font-size:12.5px;color:var(--muted)">' + (inst.note || '—') + '</p>' +
          '<div class="note warn" style="margin-top:8px"><b>易错点</b>：' + (inst.pitfall === '—' ? '无特别注意事项' : inst.pitfall) + '</div>' +
          '<div class="note" style="margin-top:8px"><b>示例</b>：<code>' + RV.ui.h(inst.example) + '</code></div></div>' +
        '<div><h3>控制信号（单周期实现）</h3><div class="scroll" style="max-height:250px"><table class="tbl"><thead><tr><th>信号</th><th>取值</th><th>含义</th></tr></thead><tbody>' + ctrl + '</tbody></table></div></div>' +
      '</div>' +
      '<div class="row" style="border-top:1px solid var(--border);padding-top:14px">' +
        '<button class="btn primary" data-go="encoder?i=' + inst.id + '">在编码实验室拆开 →</button>' +
        '<button class="btn" data-go="hardware?i=' + inst.id + '">看它点亮哪些部件 →</button>' +
        '<button class="btn" data-go="simulator">去汇编演练场 →</button>' +
        '<button class="btn" data-go="quiz">做一道相关题 →</button>' +
      '</div></div>';
  }

  function pseudoDetail(p) {
    var ops = PSAMPLE[p.name] || [];
    var exp = [];
    try { exp = p.expand(ops); } catch (e) { exp = []; }
    var rows = exp.map(function (e) {
      var text = e[0] + (e.length > 1 ? ' ' + e.slice(1).join(', ') : '');
      return '<tr><td class="mono">' + RV.ui.h(text) + '</td><td>' + (D.BY_ID[e[0]] ? D.BY_ID[e[0]].desc : '—') + '</td></tr>';
    }).join('');
    return '<div class="card">' +
      '<div class="card-title"><div class="row"><span class="mono" style="font-size:20px;font-weight:600">' + p.name + '</span><span class="tag amber">伪指令</span></div>' +
        '<span class="tag purple">基于 ' + p.base + '</span></div>' +
      '<p style="font-size:13.5px">' + p.desc + '。伪指令不是真实的机器指令，汇编器会把它展开成一条或多条 RV32I 基础指令。</p>' +
      '<div class="grid g2" style="margin-bottom:14px"><div><label class="fld">语法</label><div class="rtl-box">' + RV.ui.h(p.syntax) + '</div></div>' +
      '<div><label class="fld">书写示例</label><div class="rtl-box">' + RV.ui.h(p.name + (ops.length ? ' ' + ops.join(', ') : '')) + '</div></div></div>' +
      '<h3>展开结果</h3><table class="tbl"><thead><tr><th>真实指令</th><th>含义</th></tr></thead><tbody>' + rows + '</tbody></table>' +
      '<div class="note info" style="margin-top:12px">labels、@hi() / @lo() 由本站汇编器在两遍扫描中解析；伪指令展开后与普通指令一样参与地址分配和编码。</div>' +
      '<div class="row" style="margin-top:14px;border-top:1px solid var(--border);padding-top:14px">' +
      '<button class="btn primary" data-go="simulator">在演练场看展开过程 →</button>' +
      '<button class="btn" data-go="tools">查看全部伪指令 →</button></div></div>';
  }

  RV.views.dictionary = {
    title: '指令字典',
    render: function (el, params) {
      var sel = params.i || 'addi';
      var group = params.g || '全部';
      var q = (params.q || '').toLowerCase();
      var showPseudo = params.p === '1';
      var list = showPseudo ? D.PSEUDO.map(function (p) { return { id: 'p:' + p.name, name: p.name, desc: p.desc, pseudo: true, group: '伪指令' }; })
        : D.INSTRUCTIONS.map(function (i) { return { id: i.id, name: i.name, desc: i.desc, pseudo: false, group: i.group }; });
      var filtered = list.filter(function (x) {
        if (!showPseudo && group !== '全部' && x.group !== group) return false;
        return !q || (x.name + ' ' + x.desc).toLowerCase().indexOf(q) >= 0;
      });
      if (!filtered.some(function (x) { return x.id === sel; }) && filtered.length) sel = filtered[0].id;

      var groups = ['全部'].concat(D.GROUPS);
      el.innerHTML = '<div class="view-head"><div class="eyebrow">模块 02</div><h1>指令字典</h1>' +
        '<p class="lead">RV32I 40 条基础指令 + 常用伪指令。每条都可以一键带到编码实验室、模拟器或硬件实现台。</p></div>' +
        '<div class="row" style="margin-bottom:12px">' +
          '<input class="input search" id="dsearch" placeholder="搜索指令名或含义…" value="' + RV.ui.h(q) + '">' +
          '<div class="pill-tabs" style="margin:0">' + groups.map(function (g) {
            return '<button class="btn sm ' + (!showPseudo && group === g ? 'active' : '') + '" data-g="' + g + '">' + g + '</button>';
          }).join('') + '</div>' +
          '<button class="btn sm ' + (showPseudo ? 'active' : '') + ' spacer" id="dpseudo">伪指令 (' + D.PSEUDO.length + ')</button>' +
        '</div>' +
        '<div class="grid" style="grid-template-columns:250px minmax(0,1fr)">' +
          '<div class="card tight"><div style="font-size:12px;color:var(--muted);margin-bottom:8px">共 ' + filtered.length + ' 条</div>' +
            '<div class="inst-list">' + filtered.map(function (x) {
              return '<div class="inst-item ' + (x.id === sel ? 'active' : '') + '" data-id="' + x.id + '">' +
                '<span class="nm">' + x.name + '</span><span class="ds">' + RV.ui.h(x.desc) + '</span></div>';
            }).join('') + '</div></div>' +
          '<div id="ddetail"></div></div>';

      var detail = el.querySelector('#ddetail');
      if (sel.indexOf('p:') === 0) detail.innerHTML = pseudoDetail(D.PSEUDO_BY_NAME[sel.slice(2)]);
      else {
        var inst = D.BY_ID[sel] || D.BY_ID.addi;
        detail.innerHTML = instDetail(inst);
        RV.app.master(inst.id);
      }
      detail.querySelectorAll('[data-go]').forEach(function (b) { b.onclick = function () { RV.app.go(b.dataset.go); }; });

      el.querySelectorAll('.inst-item').forEach(function (it) {
        it.onclick = function () { RV.app.go('dictionary?i=' + it.dataset.id + (showPseudo ? '&p=1' : '') + (group !== '全部' ? '&g=' + group : '')); };
      });
      el.querySelectorAll('[data-g]').forEach(function (b) {
        b.onclick = function () { RV.app.go('dictionary?g=' + b.dataset.g + (q ? '&q=' + encodeURIComponent(q) : '')); };
      });
      el.querySelector('#dpseudo').onclick = function () { RV.app.go('dictionary?p=' + (showPseudo ? '0' : '1')); };
      var si = el.querySelector('#dsearch');
      si.onkeydown = function (ev) {
        if (ev.key === 'Enter') RV.app.go('dictionary?q=' + encodeURIComponent(si.value));
      };
    }
  };
})();
