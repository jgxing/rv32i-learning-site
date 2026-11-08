(function () {
  'use strict';
  var RV = (window.RV = window.RV || {});
  var E = RV.encoder;
  var MEMSIZE = 0x10000;
  var SP_INIT = 0xe000;
  var MAX_STEPS = 20000;

  function create(program) {
    var st = {
      regs: new Uint32Array(32),
      mem: new Uint8Array(MEMSIZE),
      pc: 0, cycle: 0, halted: false,
      output: [], log: [], history: [],
      breakpoints: {}, program: program,
      lastChanged: [], lastPc: 0
    };

    function load() {
      st.regs.fill(0);
      st.mem.fill(0);
      st.regs[2] = SP_INIT;
      if (program && program.codeBytes) {
        for (var i = 0; i < program.codeBytes.length && i < MEMSIZE; i++) st.mem[i] = program.codeBytes[i];
      }
      if (program && program.dataBytes) {
        var base = program.dataBase || 0x1000;
        for (var j = 0; j < program.dataBytes.length && base + j < MEMSIZE; j++) st.mem[base + j] = program.dataBytes[j];
      }
      st.pc = 0; st.cycle = 0; st.halted = false;
      st.output = []; st.log = []; st.history = [];
      st.lastChanged = []; st.lastPc = 0;
    }

    function mb(a) { return st.mem[a & 0xffff]; }
    function mh(a) { a = a & 0xffff; return (st.mem[a] | (st.mem[(a + 1) & 0xffff] << 8)) >>> 0; }
    function mw(a) {
      a = a & 0xffff;
      return (st.mem[a] | (st.mem[(a + 1) & 0xffff] << 8) | (st.mem[(a + 2) & 0xffff] << 16) | (st.mem[(a + 3) & 0xffff] << 24)) >>> 0;
    }
    function wb(a, v) { st.mem[a & 0xffff] = v & 0xff; }
    function wh(a, v) { a = a & 0xffff; wb(a, v); wb(a + 1, v >>> 8); }
    function ww(a, v) { a = a & 0xffff; wb(a, v); wb(a + 1, v >>> 8); wb(a + 2, v >>> 16); wb(a + 3, v >>> 24); }

    function lineOf(pc) {
      return program && program.lineMap ? (program.lineMap[pc] || 0) : 0;
    }

    function step() {
      if (st.halted) return false;
      var before = Array.from(st.regs);
      var beforePc = st.pc;
      var beforeOutLen = st.output.length;
      st.history.push({ regs: before, pc: beforePc, cycle: st.cycle, mem: st.mem.slice(), output: st.output.slice(), logLen: st.log.length });
      if (st.history.length > 300) st.history.shift();

      var w = mw(st.pc);
      var d = E.decode(w);
      if (!d.valid) {
        st.halted = true;
        st.log.push({ cycle: st.cycle, pc: beforePc, asm: d.hex, effect: '无法译码，模拟器停机', line: lineOf(beforePc), error: true });
        return false;
      }
      var next = (st.pc + 4) >>> 0;
      var ctx = {
        PC: beforePc,
        R: function (i) { return i === 0 ? 0 : (st.regs[i] >>> 0); },
        S: function (i) { return i === 0 ? 0 : (st.regs[i] | 0); },
        W: function (i, v) { if (i !== 0) st.regs[i] = v >>> 0; },
        J: function (a) { next = a >>> 0; },
        MEMB: mb, MEMH: mh, MEMW: mw, WB: wb, WH: wh, WW: ww,
        OUT: function (v) { st.output.push(v); },
        HALT: function () { st.halted = true; }
      };
      try { d.inst.run(ctx, d.ops); }
      catch (err) {
        st.halted = true;
        st.log.push({ cycle: st.cycle, pc: beforePc, asm: d.asm, effect: '执行异常：' + err.message, line: lineOf(beforePc), error: true });
        return false;
      }

      var changed = [];
      for (var i = 1; i < 32; i++) {
        if (st.regs[i] !== before[i]) changed.push({ reg: i, from: before[i], to: st.regs[i] });
      }
      st.lastChanged = changed;
      st.lastPc = beforePc;

      var parts = [];
      changed.forEach(function (c) {
        parts.push('x' + c.reg + ' = 0x' + c.to.toString(16).padStart(8, '0') + ' (' + (c.to | 0) + ')');
      });
      if (st.output.length > beforeOutLen) {
        parts.push('输出 ' + st.output.slice(beforeOutLen).join(', '));
      }
      if (next !== ((beforePc + 4) >>> 0)) parts.push('PC ← 0x' + next.toString(16).padStart(8, '0') + '（跳转）');
      if (st.halted && d.name !== 'ecall') parts.push('停机');

      st.log.push({
        cycle: st.cycle, pc: beforePc, asm: d.asm, word: d.hex,
        effect: parts.length ? parts.join('；') : '无寄存器变化',
        line: lineOf(beforePc), changed: changed
      });
      st.pc = next;
      st.cycle++;
      return true;
    }

    function run(maxSteps) {
      var limit = maxSteps || MAX_STEPS;
      var n = 0;
      var startLine = lineOf(st.pc);
      while (!st.halted && n < limit) {
        var ln = lineOf(st.pc);
        if (st.breakpoints[ln] && !(n === 0 && ln === startLine)) break;
        if (!step()) break;
        n++;
      }
      return n;
    }

    function back() {
      var h = st.history.pop();
      if (!h) return false;
      st.regs = Uint32Array.from(h.regs);
      st.mem = h.mem.slice();
      st.pc = h.pc; st.cycle = h.cycle; st.halted = false;
      st.output = h.output.slice();
      st.log.length = h.logLen;
      st.lastChanged = [];
      return true;
    }

    function dump(base, words) {
      var out = [];
      for (var i = 0; i < words; i++) {
        var a = (base + i * 4) & 0xffff;
        out.push({ addr: a, word: mw(a), bytes: [mb(a), mb(a + 1), mb(a + 2), mb(a + 3)] });
      }
      return out;
    }

    function regDump() {
      return Array.from(st.regs).map(function (v, i) {
        return { i: i, name: 'x' + i, abi: RV.data.REGS[i][1], value: v >>> 0 };
      });
    }

    load();
    return {
      state: st, reset: load, step: step, run: run, back: back,
      dump: dump, regDump: regDump, lineOf: lineOf,
      mb: mb, mh: mh, mw: mw, wb: wb, wh: wh, ww: ww,
      memDump: dump
    };
  }

  RV.simulator = { create: create, MEMSIZE: MEMSIZE, SP_INIT: SP_INIT };
})();
