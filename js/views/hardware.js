(function () {
  'use strict';
  var RV = (window.RV = window.RV || {});
  RV.views = RV.views || {};
  var D = RV.data, E = RV.encoder, DP = RV.datapath;
  var hwTimer = null;

  var STAGE_DESC = {
    IF: '取指：用 PC 从指令存储器读出 32 位指令字，同时计算 PC+4。',
    ID: '译码：拆分字段、读寄存器堆、立即数生成器按格式重排并符号扩展，控制器产生全部控制信号。',
    EX: '执行：ALU 做运算或算地址；分支指令在此比较并决定是否改写 PC。',
    MEM: '访存：只有 load/store 会真正读写数据存储器，其它指令旁路经过。',
    WB: '写回：RegWrite=1 时把 ALU 结果、存储器数据或 PC+4 写进 rd。'
  };

  function svgHtml(activeSet, selected) {
    var an = {}, ae = {};
    activeSet.nodes.forEach(function (n) { an[n] = true; });
    activeSet.edges.forEach(function (e) { ae[e] = true; });
    var edges = DP.EDGES.map(function (e) {
      var on = !!ae[e.id];
      return '<path d="' + e.d + '" fill="none" stroke="' + (on ? '#185fa5' : '#dbe1e9') + '" stroke-width="' + (on ? 1.8 : 1) + '" ' +
        'stroke-linejoin="round" marker-end="url(#dp-arrow' + (on ? '-on' : '') + ')"/>';
    }).join('');
    var nodes = DP.NODES.map(function (n) {
      var on = !!an[n.id];
      var sel = selected === n.id;
      return '<g data-node="' + n.id + '" style="cursor:pointer">' +
        '<rect x="' + n.x + '" y="' + n.y + '" width="' + n.w + '" height="' + n.h + '" rx="7" ' +
        'fill="' + (on ? '#e6f1fb' : '#f4f6f9') + '" stroke="' + (sel ? '#a32d2d' : on ? '#85b7eb' : '#dfe4ea') + '" stroke-width="' + (sel ? 2 : 1) + '"/>' +
        '<text x="' + (n.x + n.w / 2) + '" y="' + (n.y + n.h / 2 - 5) + '" text-anchor="middle" font-size="11.5" font-weight="600" fill="' + (on ? '#0c447c' : '#7c8796') + '">' + n.label + '</text>' +
        '<text x="' + (n.x + n.w / 2) + '" y="' + (n.y + n.h / 2 + 10) + '" text-anchor="middle" font-size="9.5" fill="' + (on ? '#378add' : '#a4adba') + '">' + n.sub + '</text>' +
        '</g>';
    }).join('');
    return '<svg class="dp-svg" viewBox="0 0 780 330" role="img" aria-label="RV32I 单周期数据通路">' +
      '<defs>' +
      '<marker id="dp-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M2 1L8 5L2 9" fill="none" stroke="#cbd3de" stroke-width="1.5"/></marker>' +
      '<marker id="dp-arrow-on" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M2 1L8 5L2 9" fill="none" stroke="#185fa5" stroke-width="1.5"/></marker>' +
      '</defs>' + edges + nodes + '</svg>';
  }

  function bandHtml(inst) {
    var p = E.parseAsm(inst.example);
    var ops = {};
    if (p && p.inst) {
      ['rd', 'rs1', 'rs2'].forEach(function (k) { if (p.ops[k] !== undefined) ops[k] = E.regNum(p.ops[k]); });
      if (p.ops.imm !== undefined) { var v = E.num(p.ops.imm); ops.imm = v === null ? 0 : v; }
    }
    var w;
    try { w = E.encode(inst.name, ops); } catch (e) { w = 0; }
    var fs = E.fields(w, inst.format);
    return { html: '<div class="bitband">' + fs.map(function (f) {
      return '<div class="bitseg ' + f.color + '" style="flex:' + f.width + '"><div class="bn">' + f.name + '</div><div class="bv">' + f.bits + '</div></div>';
    }).join('') + '</div>', word: w };
  }

  function singleView(inst, selected, stage) {
    var a = DP.active(inst);
    var b = bandHtml(inst);
    var rows = DP.controlRows(inst).map(function (r) {
      var strong = r.value !== '0' && r.value !== '—';
      return '<div class="kv"><span>' + r.key + '</span><b class="mono" style="color:' + (strong ? 'var(--accent)' : 'var(--muted)') + '">' + r.value + '</b></div>';
    }).join('');
    var stages = ['IF', 'ID', 'EX', 'MEM', 'WB'].map(function (s, i) {
      var used = s === 'MEM' ? !!(inst.control.MemRead || inst.control.MemWrite) : true;
      return '<span class="stage ' + (stage === i ? 'on' : s === 'WB' ? 'wb' : '') + '" style="' + (used ? '' : 'opacity:.45') + '">' + s + ' ' + ({ IF: '取指', ID: '译码', EX: '执行', MEM: '访存', WB: '写回' })[s] + '</span>';
    }).join('<span style="color:var(--hint)">→</span>');

    return '<div class="grid" style="grid-template-columns:minmax(0,1.6fr) minmax(0,1fr)">' +
      '<div><div class="card" style="margin-bottom:14px"><div class="card-title"><h2 style="margin:0">单周期数据通路</h2>' +
        '<span class="tag blue">蓝色 = ' + inst.name + ' 经过的部件</span></div>' +
        '<div class="dp-wrap">' + svgHtml(a, selected) + '</div>' +
        '<div class="note" style="margin-top:10px">点击任意部件查看它的作用；蓝色连线是这条指令真正流动的数据路径。</div></div>' +
        '<div class="card"><h2>编码 → 控制信号</h2><div class="card-title" style="margin-bottom:8px"><code>' + RV.ui.h(inst.example) + '</code>' +
          '<span class="tag">' + E.hex(b.word) + '</span></div>' + b.html +
        '<div class="rtl-box" style="margin-top:12px">' + RV.ui.h(inst.rtl) + '</div></div></div>' +
      '<div><div class="card" style="margin-bottom:14px"><div class="card-title"><h2 style="margin:0">控制信号真值</h2><span class="tag">' + inst.format + '-type</span></div>' +
        rows + '<div class="note info" style="margin-top:10px;font-size:12px">这些信号全部由 opcode + funct3 + funct7 组合逻辑译出，可在指令字典里查看每条指令的取值。</div></div>' +
        '<div class="card" style="margin-bottom:14px"><h2>' + (selected ? DP.NODES.filter(function (n) { return n.id === selected; })[0].label : '部件说明') + '</h2>' +
        '<p style="font-size:13px;color:var(--muted)">' + (selected ? DP.NODE_DESC[selected] : '在左侧通路图上点一个部件，这里会显示它的输入、输出与在流水线中的位置。') + '</p></div>' +
        '<div class="card"><h2>五个执行阶段</h2><div class="stage-bar">' + stages + '</div>' +
        '<div class="note" style="margin-top:10px">' + (stage >= 0 ? STAGE_DESC[['IF', 'ID', 'EX', 'MEM', 'WB'][stage]] : '点「播放信号流」可以逐阶段查看这条指令走过的过程。') + '</div>' +
        '<div class="row" style="margin-top:10px"><button class="btn primary" data-act="play">▶ 播放信号流</button>' +
        '<button class="btn" data-go="dictionary?i=' + inst.id + '">看指令字典 →</button></div></div></div></div>';
  }

  function pipeView(forwarding) {
    var r = DP.pipeline(DP.DEMO, { forwarding: forwarding });
    var head = '<tr><th class="lbl">指令 / 周期</th>' + Array.from({ length: r.cycles }, function (_, i) { return '<th>' + (i + 1) + '</th>'; }).join('') + '</tr>';
    var body = r.rows.map(function (row) {
      return '<tr><td class="lbl">' + RV.ui.h(row.label) + '</td>' + row.cells.map(function (c) {
        return '<td class="' + c.cls + '">' + c.text + '</td>';
      }).join('') + '</tr>';
    }).join('');
    var reasons = r.rows.filter(function (x) { return x.reason; }).map(function (x) {
      return '<div class="kv"><span class="mono">' + RV.ui.h(x.label) + '</span><b style="font-weight:400;text-align:right;max-width:62%;color:var(--muted)">' + RV.ui.h(x.reason) + '</b></div>';
    }).join('');

    return '<div class="card" style="margin-bottom:14px"><div class="card-title"><h2 style="margin:0">五级流水线时空图</h2>' +
      '<div class="row"><span style="font-size:12px;color:var(--muted)">转发 (forwarding)</span>' +
      '<button class="btn sm ' + (forwarding ? 'active' : '') + '" data-act="fw1">开</button>' +
      '<button class="btn sm ' + (!forwarding ? 'active' : '') + '" data-act="fw0">关</button></div></div>' +
      '<p class="lead" style="margin-bottom:12px">同一段程序在两种配置下的执行过程。红色「气泡」是停顿；总周期 <b>' + r.totalCycles + '</b>。</p>' +
      '<div class="pipe"><table>' + head + body + '</table></div>' +
      '<div class="row" style="margin-top:12px;font-size:11.5px;color:var(--muted)">' +
        '<span class="tag blue">IF</span><span class="tag purple">ID</span><span class="tag green">EX</span>' +
        '<span class="tag amber">MEM</span><span class="tag" style="background:#fbeaf0;color:#993556">WB</span><span class="tag red">气泡 / stall</span></div></div>' +
      '<div class="grid g2"><div class="card"><h2>逐条冒险分析</h2>' +
        '<div style="font-size:12.5px">' + reasons + '</div>' +
        '<div class="note warn" style="margin-top:12px">load-use 是转发也救不了的例外：lw 的数据要到 MEM 阶段结束才可用，紧邻的下一条指令 EX 就要用，必须停 1 拍。</div></div>' +
      '<div class="card"><h2>三类冒险</h2>' +
        '<table class="tbl"><thead><tr><th>类型</th><th>成因</th><th>常见对策</th></tr></thead><tbody>' +
        '<tr><td><b>结构冒险</b></td><td>多条指令同时抢同一硬件资源</td><td>指令/数据存储器分离、增加端口</td></tr>' +
        '<tr><td><b>数据冒险</b></td><td>后续指令依赖前面尚未写回的结果</td><td>转发、停顿、编译器调度</td></tr>' +
        '<tr><td><b>控制冒险</b></td><td>分支结果未定就开始取后续指令</td><td>分支预测、延迟决定、清空流水线</td></tr>' +
        '</tbody></table>' +
        '<div class="note info" style="margin-top:12px">理想情况下五级流水线 CPI 接近 1；冒险插入的气泡会把 CPI 拉高。上图把转发开关关掉，就能直观看到气泡变多。</div></div></div>';
  }

  RV.views.hardware = {
    title: '硬件实现台',
    destroy: function () { if (hwTimer) { clearInterval(hwTimer); hwTimer = null; } },
    render: function (el, params) {
      var id = params.i || 'addi';
      var inst = D.BY_ID[id] || D.BY_ID.addi;
      var view = params.view === 'pipe' ? 'pipe' : 'single';
      var forwarding = params.fw !== '0';
      var selected = params.n || '';
      var stage = -1;

      function render() {
        el.innerHTML = '<div class="view-head"><div class="eyebrow">模块 04 · 进阶</div><h1>硬件实现台</h1>' +
          '<p class="lead">选一条指令，看它在单周期数据通路上点亮哪些部件、产生哪些控制信号；再切到五级流水线观察冒险与转发。</p></div>' +
          '<div class="card tight" style="margin-bottom:14px"><div class="row">' +
            '<span style="font-size:12px;color:var(--muted)">当前指令</span>' +
            '<select class="input" id="hwSel" style="width:250px">' + D.INSTRUCTIONS.map(function (i) {
              return '<option value="' + i.id + '" ' + (i.id === inst.id ? 'selected' : '') + '>' + i.name + ' — ' + i.desc + '</option>';
            }).join('') + '</select>' +
            '<div class="pill-tabs" style="margin:0">' +
              '<button class="btn sm ' + (view === 'single' ? 'active' : '') + '" data-act="vsingle">单周期数据通路</button>' +
              '<button class="btn sm ' + (view === 'pipe' ? 'active' : '') + '" data-act="vpipe">五级流水线</button></div>' +
            '<span class="spacer"></span><span class="tag purple">' + inst.format + '-type · ' + inst.group + '</span></div></div>' +
          (view === 'single' ? singleView(inst, selected, stage) : pipeView(forwarding));

        el.querySelector('#hwSel').onchange = function () {
          stopTimer(); RV.app.go('hardware?i=' + this.value + (view === 'pipe' ? '&view=pipe' : ''));
        };
        el.querySelectorAll('[data-go]').forEach(function (b) { b.onclick = function () { RV.app.go(b.dataset.go); }; });
      }

      function stopTimer() { if (hwTimer) { clearInterval(hwTimer); hwTimer = null; } }

      el.addEventListener('click', function (ev) {
        var t = ev.target.closest('[data-act]');
        if (!t || !el.contains(t)) return;
        var act = t.dataset.act;
        if (act === 'vsingle') { stopTimer(); view = 'single'; stage = -1; render(); }
        else if (act === 'vpipe') { stopTimer(); view = 'pipe'; render(); }
        else if (act === 'fw1' || act === 'fw0') { forwarding = act === 'fw1'; render(); }
        else if (act === 'play') {
          if (hwTimer) { stopTimer(); stage = -1; render(); return; }
          stage = 0; render();
          hwTimer = setInterval(function () {
            stage++;
            if (stage > 4) { stopTimer(); stage = -1; render(); RV.app.toast('信号流播放完成'); return; }
            render();
          }, 900);
        }
      });

      // 点击 SVG 部件（事件委托，SVG g 上的 data-node）
      el.addEventListener('click', function (ev) {
        var g = ev.target.closest('g[data-node]');
        if (!g || !el.contains(g)) return;
        selected = g.dataset.node;
        render();
      });

      render();
    }
  };
})();
