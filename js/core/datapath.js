(function () {
  'use strict';
  var RV = (window.RV = window.RV || {});
  var D = RV.data;

  // 单周期数据通路的部件坐标（svg viewBox 0 0 780 330）
  var NODES = [
    { id: 'pc', label: 'PC', sub: '程序计数器', stage: 'IF', x: 30, y: 36, w: 80, h: 40 },
    { id: 'imem', label: '指令存储器', sub: 'IMEM · 取指', stage: 'IF', x: 140, y: 36, w: 120, h: 40 },
    { id: 'decode', label: '译码 / 控制器', sub: 'opcode → 信号', stage: 'ID', x: 290, y: 36, w: 140, h: 40 },
    { id: 'ctrl', label: '控制信号', sub: 'RegWrite / ALUOp …', stage: 'ID', x: 460, y: 36, w: 140, h: 40 },
    { id: 'regfile', label: '寄存器堆', sub: '2 读 1 写 · x0 恒 0', stage: 'ID', x: 30, y: 126, w: 120, h: 50 },
    { id: 'immgen', label: '立即数生成器', sub: 'ImmGen · 位重排', stage: 'ID', x: 180, y: 126, w: 110, h: 40 },
    { id: 'muxa', label: 'MUX A', sub: 'ALUSrc', stage: 'EX', x: 320, y: 126, w: 70, h: 40 },
    { id: 'alu', label: 'ALU', sub: '运算 / 地址', stage: 'EX', x: 420, y: 126, w: 70, h: 40 },
    { id: 'muxb', label: 'MUX B', sub: 'MemtoReg', stage: 'WB', x: 520, y: 126, w: 70, h: 40 },
    { id: 'dmem', label: '数据存储器', sub: 'DMEM · lb/lw/sb/sw', stage: 'MEM', x: 620, y: 126, w: 130, h: 50 },
    { id: 'add4', label: 'PC + 4', sub: '顺序下一条', stage: 'IF', x: 30, y: 236, w: 100, h: 36 },
    { id: 'cmp', label: '分支比较器', sub: 'beq / blt …', stage: 'EX', x: 170, y: 236, w: 100, h: 36 },
    { id: 'wb', label: '写回数据', sub: 'rd ← 结果', stage: 'WB', x: 400, y: 236, w: 110, h: 36 },
    { id: 'pcmux', label: 'PC 来源选择', sub: 'PCSrc', stage: 'IF', x: 600, y: 236, w: 150, h: 36 }
  ];

  var EDGES = [
    { id: 'e1', from: 'pc', to: 'imem', d: 'M110 56 L140 56', label: '地址' },
    { id: 'e2', from: 'imem', to: 'decode', d: 'M260 56 L290 56', label: '32 位指令字' },
    { id: 'e3', from: 'decode', to: 'ctrl', d: 'M430 56 L460 56', label: '译码' },
    { id: 'e4', from: 'decode', to: 'regfile', d: 'M330 76 L330 100 L90 100 L90 126', label: 'rs1 / rs2' },
    { id: 'e5', from: 'decode', to: 'immgen', d: 'M380 76 L380 105 L235 105 L235 126', label: '立即数字段' },
    { id: 'e6', from: 'regfile', to: 'muxa', d: 'M150 140 L320 140', label: 'R[rs1]' },
    { id: 'e7', from: 'immgen', to: 'muxa', d: 'M290 158 L320 158', label: 'imm' },
    { id: 'e8', from: 'regfile', to: 'alu', d: 'M150 170 L150 195 L405 195 L405 158 L420 158', label: 'R[rs2]' },
    { id: 'e9', from: 'muxa', to: 'alu', d: 'M390 146 L420 146', label: '操作数 B' },
    { id: 'e10', from: 'alu', to: 'muxb', d: 'M490 146 L520 146', label: '结果' },
    { id: 'e11', from: 'alu', to: 'dmem', d: 'M490 160 L600 160 L600 150 L620 150', label: '地址 / 数据' },
    { id: 'e12', from: 'dmem', to: 'muxb', d: 'M620 170 L555 170 L555 166', label: '读出数据' },
    { id: 'e13', from: 'muxb', to: 'wb', d: 'M555 166 L555 246 L510 246', label: 'MemtoReg' },
    { id: 'e14', from: 'wb', to: 'regfile', d: 'M400 254 L20 254 L20 176 L30 176', label: '写回 rd' },
    { id: 'e15', from: 'pc', to: 'add4', d: 'M30 56 L15 56 L15 254 L30 254', label: '' },
    { id: 'e16', from: 'add4', to: 'pcmux', d: 'M130 254 L130 305 L675 305 L675 272', label: 'PC+4' },
    { id: 'e17', from: 'immgen', to: 'pcmux', d: 'M235 166 L235 212 L690 212 L690 236', label: '分支 / 跳转目标' },
    { id: 'e18', from: 'pcmux', to: 'pc', d: 'M675 236 L675 18 L70 18 L70 36', label: '下一条 PC' },
    { id: 'e19', from: 'decode', to: 'cmp', d: 'M430 76 L430 96 L305 96 L305 222 L220 222 L220 236', label: 'Branch' }
  ];

  var NODE_DESC = {
    pc: '32 位程序计数器，保存当前取指地址。每个时钟由 PC 来源选择 MUX 更新为 PC+4、分支目标或跳转目标。',
    imem: '按字节寻址的指令存储器，取出 4 字节指令字。RV32I 指令固定 4 字节长度（C 扩展才有 2 字节压缩指令）。',
    decode: '把 32 位指令字按格式拆成 opcode / funct3 / funct7 / rs1 / rs2 / rd / imm，并驱动控制器产生全部控制信号。',
    ctrl: '组合逻辑译码：由 opcode + funct3 + funct7 得到 RegWrite、ALUSrc、ALUOp、MemRead、MemWrite、MemtoReg、Branch、PCSrc 等。',
    regfile: '32 × 32 位寄存器堆，支持同时读两个源寄存器、写一个目标寄存器；x0 硬连线为 0，写入被丢弃。',
    immgen: '立即数生成器：按 I/S/B/U/J 格式把散落在指令字里的位重排并符号扩展成 32 位立即数。B/J 型的位序最不规则。',
    muxa: 'ALU 第二输入选择器，由 ALUSrc 控制：选 rs2 寄存器值，或选立即数生成器输出。',
    alu: '算术逻辑单元，执行 ADD/SUB/AND/OR/XOR/SLL/SRL/SRA/SLT 等；也用于计算访存地址和分支目标。',
    muxb: '写回数据源选择器，由 MemtoReg 控制：选 ALU 结果、存储器读出数据，或 PC+4（链接）。',
    dmem: '数据存储器，支持字节 / 半字 / 字的读写，由 MemRead / MemWrite 与宽度信号控制；加载时做符号或零扩展。',
    add4: '顺序执行时的下一地址：PC + 4，因为 RV32I 指令固定 4 字节。',
    cmp: '分支判定：根据 funct3 比较两操作数（相等 / 不等 / 有符号大小 / 无符号大小），结果决定 PCSrc。',
    wb: '写回级：把 MUX B 选出的结果在时钟沿写入 rd；RegWrite=0 时不写。',
    pcmux: '下一条指令地址选择：PC+4、分支目标（Branch 且条件成立）或 jalr 的间接跳转目标。'
  };

  // 依据指令元数据算出活跃部件与连线
  function active(inst) {
    if (!inst) return { nodes: [], edges: [] };
    var c = inst.control || {};
    var n = ['pc', 'imem', 'decode', 'ctrl', 'regfile', 'add4', 'pcmux'];
    var e = ['e1', 'e2', 'e3', 'e4', 'e15', 'e16', 'e18'];

    if (c.ImmGen && c.ImmGen !== '—') {
      n.push('immgen', 'muxa'); e.push('e5', 'e7');
    }
    if (c.ALUSrc === 'rs2') e.push('e8');
    if (c.ALUOp && c.ALUOp !== '—') { n.push('alu'); e.push('e9', 'e10'); }
    if (c.MemWrite || c.MemRead) { n.push('dmem'); e.push('e11'); }
    if (c.MemRead) e.push('e12');
    if (c.Branch) { n.push('cmp'); e.push('e19', 'e17'); }
    if (c.Jump) e.push('e17');
    if (c.RegWrite) { n.push('muxb', 'wb'); e.push('e13', 'e14'); }
    if (c.MemtoReg === 'MEM') e.push('e12');
    return { nodes: n, edges: e, control: c };
  }

  function controlRows(inst) {
    if (!inst) return [];
    var c = inst.control || {};
    var order = [
      ['RegWrite', '是否写回寄存器堆'], ['ALUSrc', 'ALU 第二输入：rs2 / imm'],
      ['ALUOp', 'ALU 运算类型'], ['MemRead', '读数据存储器'], ['MemWrite', '写数据存储器'],
      ['MemtoReg', '写回数据来源'], ['Branch', '是否为条件分支'], ['Jump', '是否为跳转'],
      ['PCSrc', '下一条 PC 来源'], ['ImmGen', '立即数格式'], ['Link', '是否写链接地址 PC+4']
    ];
    return order.map(function (o) {
      var v = c[o[0]];
      if (v === undefined) v = o[0] === 'RegWrite' || o[0] === 'Branch' || o[0] === 'Jump' || o[0] === 'Link' ? 0 : '—';
      return { key: o[0], value: String(v), desc: o[1] };
    });
  }

  // ---- 五级流水线时空图 ----
  var DEMO = [
    { text: 'add x5, x6, x7', rd: 5, rs1: 6, rs2: 7 },
    { text: 'sub x8, x5, x9', rd: 8, rs1: 5, rs2: 9 },
    { text: 'lw x10, 0(x5)', rd: 10, rs1: 5, rs2: null, load: true },
    { text: 'and x11, x10, x12', rd: 11, rs1: 10, rs2: 12 },
    { text: 'or x13, x11, x14', rd: 13, rs1: 11, rs2: 14 }
  ];

  function pipeline(seq, opts) {
    seq = seq || DEMO;
    opts = opts || {};
    var forwarding = opts.forwarding !== false;
    var start = [], stalls = [], reasons = [];
    start[0] = 1; stalls[0] = 0; reasons[0] = '';
    for (var i = 1; i < seq.length; i++) {
      var need = 0, why = '';
      var prev = seq[i - 1], prev2 = seq[i - 2];
      function uses(o, r) { return o && r != null && (o.rs1 === r || o.rs2 === r); }
      if (prev.load && uses(seq[i], prev.rd)) {
        need = 1; why = 'load-use：load 的数据要到 MEM 末才可用，即使有转发也必须停顿 1 拍';
      } else if (!forwarding && uses(seq[i], prev.rd)) {
        need = 2; why = '相邻 RAW：无转发时须等前一条写回（WB）后才能读，插入 2 个气泡';
      } else if (!forwarding && prev2 && uses(seq[i], prev2.rd)) {
        need = 1; why = '隔一条的 RAW：无转发时仍需停顿 1 拍';
      } else if (forwarding && uses(seq[i], prev.rd)) {
        why = '相邻 RAW：由 EX/MEM → EX 转发解决，无需停顿';
      }
      if (prev.branch) { need = Math.max(need, 1); why = (why ? why + '；' : '') + '控制冒险：分支结果确定前插入 1 拍'; }
      stalls[i] = need; reasons[i] = why;
      start[i] = start[i - 1] + 1 + need;
    }
    var maxCycle = start[seq.length - 1] + 5;
    var stages = ['IF', 'ID', 'EX', 'MEM', 'WB'];
    var rows = seq.map(function (s, i) {
      var cells = [];
      for (var c = 1; c <= maxCycle; c++) {
        var cell = { cls: '', text: '' };
        if (c >= start[i] && c < start[i] + 5) {
          var k = c - start[i];
          cell.cls = stages[k].toLowerCase();
          cell.text = stages[k];
        } else if (c >= start[i] - stalls[i] && c < start[i] && stalls[i] > 0) {
          cell.cls = 'stall'; cell.text = '气泡';
        }
        cells.push(cell);
      }
      return { label: s.text, cells: cells, stall: stalls[i], reason: reasons[i], start: start[i] };
    });
    return { rows: rows, cycles: maxCycle, forwarding: forwarding, totalCycles: maxCycle };
  }

  RV.datapath = {
    NODES: NODES, EDGES: EDGES, NODE_DESC: NODE_DESC,
    active: active, controlRows: controlRows,
    pipeline: pipeline, DEMO: DEMO
  };
})();
