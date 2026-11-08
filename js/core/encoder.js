(function () {
  'use strict';
  var RV = (window.RV = window.RV || {});
  var D = RV.data;

  function bits(w, hi, lo) {
    var n = hi - lo + 1;
    var mask = n >= 32 ? 0xffffffff : ((1 << n) - 1);
    return (w >>> lo) & mask;
  }
  function setBits(w, hi, lo, v) {
    var n = hi - lo + 1;
    var mask = n >= 32 ? 0xffffffff : ((1 << n) - 1);
    return ((w & ~(mask << lo)) | ((v & mask) << lo)) >>> 0;
  }
  function signExt(v, n) {
    var s = 1 << (n - 1);
    return (v ^ s) - s;
  }
  function bin7(w, hi, lo) { return bits(w, hi, lo).toString(2); }
  function pad(s, n) { while (s.length < n) s = '0' + s; return s; }
  function hex(w) { return '0x' + (w >>> 0).toString(16).padStart(8, '0'); }
  function hexShort(v) { return '0x' + ((v >>> 0) & 0xfffff).toString(16); }
  function binary(w) { return pad((w >>> 0).toString(2), 32); }
  function regNum(v) {
    if (typeof v === 'number') return v & 31;
    if (v == null) return 0;
    var s = String(v).trim().toLowerCase();
    if (s in D.REGNUM) return D.REGNUM[s];
    var m = /^x(\d+)$/.exec(s);
    if (m) return parseInt(m[1], 10) & 31;
    var n = Number(s);
    if (!isNaN(n) && n >= 0 && n <= 31) return n;
    return null;
  }
  function num(v) {
    if (typeof v === 'number') return v;
    if (v == null) return 0;
    var s = String(v).trim().toLowerCase();
    if (/^0x[0-9a-f]+$/.test(s)) return parseInt(s, 16);
    if (/^-?0x[0-9a-f]+$/.test(s)) return -parseInt(s.slice(3), 16);
    if (/^0b[01]+$/.test(s)) return parseInt(s.slice(2), 2);
    if (/^-?\d+$/.test(s)) return parseInt(s, 10);
    return null; // label 或特殊表达式，交给汇编器
  }
  function regName(i) { return 'x' + i; }

  // ---------- 编码 ----------
  function encode(name, ops) {
    var inst = D.BY_ID[String(name).toLowerCase()];
    if (!inst) throw new Error('未知指令: ' + name);
    ops = ops || {};
    var w = parseInt(inst.opcode, 2) >>> 0;
    if (inst.funct3 !== null) w = setBits(w, 14, 12, parseInt(inst.funct3, 2));
    if (inst.funct7 !== null) w = setBits(w, 31, 25, parseInt(inst.funct7, 2));

    var rd = regNum(ops.rd), rs1 = regNum(ops.rs1), rs2 = regNum(ops.rs2);
    var imm = ops.imm === undefined ? 0 : ops.imm;
    var n, hi, lo;

    switch (inst.format) {
      case 'R':
        w = setBits(w, 11, 7, rd === null ? 0 : rd);
        w = setBits(w, 19, 15, rs1 === null ? 0 : rs1);
        w = setBits(w, 24, 20, rs2 === null ? 0 : rs2);
        break;
      case 'I':
        w = setBits(w, 11, 7, rd === null ? 0 : rd);
        w = setBits(w, 19, 15, rs1 === null ? 0 : rs1);
        if (inst.funct7 !== null) {
          // 移位立即数：bit[24:20] = shamt，bit[31:25] 已由 funct7 写入
          w = setBits(w, 24, 20, (num(imm) || 0) & 31);
        } else if (inst.immFixed !== undefined) {
          w = setBits(w, 31, 20, inst.immFixed);
        } else {
          n = num(imm);
          w = setBits(w, 31, 20, (n === null ? 0 : n) & 0xfff);
        }
        break;
      case 'S':
        w = setBits(w, 19, 15, rs1 === null ? 0 : rs1);
        w = setBits(w, 24, 20, rs2 === null ? 0 : rs2);
        n = num(imm); n = n === null ? 0 : (n & 0xfff);
        w = setBits(w, 31, 25, (n >>> 5) & 0x7f);
        w = setBits(w, 11, 7, n & 0x1f);
        break;
      case 'B':
        w = setBits(w, 19, 15, rs1 === null ? 0 : rs1);
        w = setBits(w, 24, 20, rs2 === null ? 0 : rs2);
        n = num(imm); n = n === null ? 0 : n;
        var b = n >>> 0;
        w = setBits(w, 31, 31, (b >>> 12) & 1);
        w = setBits(w, 30, 25, (b >>> 5) & 0x3f);
        w = setBits(w, 11, 8, (b >>> 1) & 0xf);
        w = setBits(w, 7, 7, (b >>> 11) & 1);
        break;
      case 'U':
        w = setBits(w, 11, 7, rd === null ? 0 : rd);
        n = num(imm); n = n === null ? 0 : n;
        w = setBits(w, 31, 12, n & 0xfffff);
        break;
      case 'J':
        w = setBits(w, 11, 7, rd === null ? 0 : rd);
        n = num(imm); n = n === null ? 0 : n;
        var j = n >>> 0;
        w = setBits(w, 31, 31, (j >>> 20) & 1);
        w = setBits(w, 30, 21, (j >>> 1) & 0x3ff);
        w = setBits(w, 20, 20, (j >>> 11) & 1);
        w = setBits(w, 19, 12, (j >>> 12) & 0xff);
        break;
    }
    return w >>> 0;
  }

  // ---------- 译码 ----------
  function findInst(w) {
    var op = pad(bits(w, 6, 0).toString(2), 7);
    var f3 = pad(bits(w, 14, 12).toString(2), 3);
    var f7 = pad(bits(w, 31, 25).toString(2), 7);
    var imm12 = bits(w, 31, 20);
    var cands = D.INSTRUCTIONS.filter(function (i) {
      if (i.opcode !== op) return false;
      if (i.funct3 !== null && i.funct3 !== f3) return false;
      if (i.funct7 !== null && i.funct7 !== f7) return false;
      if (i.immFixed !== undefined && i.immFixed !== imm12) return false;
      return true;
    });
    return cands[0] || null;
  }

  function decode(w) {
    w = w >>> 0;
    var inst = findInst(w);
    if (!inst) return { valid: false, word: w, hex: hex(w), bin: binary(w), reason: '无法识别的 opcode / funct 组合' };
    var o = { rd: bits(w, 11, 7), rs1: bits(w, 19, 15), rs2: bits(w, 24, 20), imm: 0 };
    var t;
    switch (inst.format) {
      case 'R': o.imm = 0; break;
      case 'I':
        o.imm = inst.funct7 !== null ? bits(w, 24, 20) : signExt(bits(w, 31, 20), 12);
        break;
      case 'S':
        t = (bits(w, 31, 25) << 5) | bits(w, 11, 7);
        o.imm = signExt(t, 12);
        break;
      case 'B':
        t = (bits(w, 31, 31) << 12) | (bits(w, 7, 7) << 11) | (bits(w, 30, 25) << 5) | (bits(w, 11, 8) << 1);
        o.imm = signExt(t, 13);
        break;
      case 'U': o.imm = bits(w, 31, 12); break;
      case 'J':
        t = (bits(w, 31, 31) << 20) | (bits(w, 19, 12) << 12) | (bits(w, 20, 20) << 11) | (bits(w, 30, 21) << 1);
        o.imm = signExt(t, 21);
        break;
    }
    return {
      valid: true, word: w, hex: hex(w), bin: binary(w), inst: inst,
      name: inst.name, format: inst.format, ops: o, imm: o.imm,
      asm: formatAsm(inst, o), fields: fields(w, inst.format)
    };
  }

  function formatAsm(inst, o) {
    var n = inst.name;
    switch (inst.format) {
      case 'R': return n + ' ' + regName(o.rd) + ', ' + regName(o.rs1) + ', ' + regName(o.rs2);
      case 'I':
        if (inst.group === '访存') return n + ' ' + regName(o.rd) + ', ' + o.imm + '(' + regName(o.rs1) + ')';
        if (n === 'jalr') return n + ' ' + regName(o.rd) + ', ' + regName(o.rs1) + ', ' + o.imm;
        if (n === 'fence' || n === 'ecall' || n === 'ebreak') return n;
        return n + ' ' + regName(o.rd) + ', ' + regName(o.rs1) + ', ' + o.imm;
      case 'S': return n + ' ' + regName(o.rs2) + ', ' + o.imm + '(' + regName(o.rs1) + ')';
      case 'B': return n + ' ' + regName(o.rs1) + ', ' + regName(o.rs2) + ', ' + o.imm;
      case 'U': return n + ' ' + regName(o.rd) + ', ' + hexShort(o.imm);
      case 'J': return n + ' ' + regName(o.rd) + ', ' + o.imm;
    }
    return n;
  }

  var COLORS = {
    'funct7': 'f-purple', 'imm[11:0]': 'f-purple', 'imm[11:5]': 'f-purple', 'imm[4:0]': 'f-purple',
    'imm[12]': 'f-purple', 'imm[10:5]': 'f-purple', 'imm[4:1]': 'f-purple', 'imm[11]': 'f-purple',
    'imm[20]': 'f-purple', 'imm[10:1]': 'f-purple', 'imm[19:12]': 'f-purple', 'imm[31:12]': 'f-purple',
    'rs2': 'f-blue', 'rs1': 'f-blue', 'funct3': 'f-teal', 'rd': 'f-amber', 'opcode': 'f-red'
  };
  var FIELD_DESC = {
    'opcode': '7 位操作码，决定指令大类。所有格式中位置固定在 bit[6:0]，译码器最先读它。',
    'rd': '目标寄存器编号（5 位，0~31）。RegWrite=1 时结果写回这里；x0 的写入被丢弃。',
    'rs1': '第一源寄存器编号（5 位）。所有格式位置固定，便于寄存器堆提前读取。',
    'rs2': '第二源寄存器编号（5 位）。存储指令中它是要写出去的数据。',
    'funct3': '3 位功能码，与 opcode 一起确定具体操作（如 addi/slti/xori 的区别）。',
    'funct7': '7 位功能码，主要用于区分 add/sub、srl/sra、srli/srai；bit30 是关键。',
    'imm[11:0]': 'I 型 12 位立即数，符号扩展到 32 位后参与运算或作为地址偏移。',
    'imm[11:5]': 'S 型立即数高 7 位。S 型把 12 位立即数拆成两段，以让 rs1/rs2 位置保持一致。',
    'imm[4:0]': 'S 型立即数低 5 位，拼接后符号扩展成地址偏移。',
    'imm[12]': 'B 型立即数最高位（符号位），单独放在指令 bit[31]。',
    'imm[10:5]': 'B 型立即数中间 6 位。',
    'imm[4:1]': 'B 型立即数低 4 位；bit[0] 恒为 0（2 字节对齐），不编码。',
    'imm[11]': '立即数第 11 位：B 型中被挪到 bit[7]，J 型中放在 bit[20]。',
    'imm[31:12]': 'U 型 20 位高位立即数，实际数值 = 该字段 << 12。',
    'imm[20]': 'J 型立即数第 20 位（符号位），放在 bit[31]。',
    'imm[10:1]': 'J 型立即数 bit[10:1]，放在 bit[30:21]。',
    'imm[19:12]': 'J 型立即数 bit[19:12]，放在 bit[19:12]。'
  };

  function fields(w, format) {
    var def = D.FORMATS[format];
    if (!def) return [];
    return def.fields.map(function (f) {
      var v = bits(w, f[1], f[2]);
      return {
        name: f[0], hi: f[1], lo: f[2], width: f[1] - f[2] + 1,
        value: v, bits: pad(v.toString(2), f[1] - f[2] + 1),
        color: COLORS[f[0]] || 'f-gray', desc: FIELD_DESC[f[0]] || ''
      };
    });
  }

  // 立即数拼接映射，供编码实验室做位重排动画
  function immMap(w, format) {
    w = w >>> 0;
    var parts = [], value = 0, note = '';
    function take(hi, lo, dstHi, dstLo, label) {
      var v = bits(w, hi, lo);
      parts.push({ src: 'inst[' + hi + ':' + lo + ']', dst: 'imm[' + dstHi + ':' + dstLo + ']', value: pad(v.toString(2), hi - lo + 1), label: label || '' });
      value |= v << dstLo;
    }
    switch (format) {
      case 'I': take(31, 20, 11, 0, '12 位立即数'); value = signExt(value, 12); note = '符号扩展：把 imm[11] 复制到 bit[31:12]。'; break;
      case 'S': take(31, 25, 11, 5, '高 7 位'); take(11, 7, 4, 0, '低 5 位'); value = signExt(value, 12); note = '两段拼接后再符号扩展到 32 位。'; break;
      case 'B':
        take(31, 31, 12, 12, '符号位'); take(7, 7, 11, 11, '第 11 位被挪到 bit[7]');
        take(30, 25, 10, 5, '中间 6 位'); take(11, 8, 4, 1, '低 4 位');
        parts.push({ src: '常量 0', dst: 'imm[0]', value: '0', label: '2 字节对齐，最低位恒为 0' });
        value = signExt(value, 13); note = 'B 型立即数位序被打散，是为了让 rs1/rs2/funct3 保持与其它格式相同的位置。'; break;
      case 'U': take(31, 12, 31, 12, '高 20 位'); parts.push({ src: '常量 0', dst: 'imm[11:0]', value: '000000000000', label: '低 12 位补 0' }); note = 'U 型立即数是 20 位字段，真实数值 = 字段 << 12。'; break;
      case 'J':
        take(31, 31, 20, 20, '符号位'); take(19, 12, 19, 12, 'bit[19:12]'); take(20, 20, 11, 11, '第 11 位');
        take(30, 21, 10, 1, 'bit[10:1]'); parts.push({ src: '常量 0', dst: 'imm[0]', value: '0', label: '最低位恒为 0' });
        value = signExt(value, 21); note = 'J 型可跳转 ±1 MiB；21 位立即数符号扩展到 32 位。'; break;
      default: note = 'R 型指令没有立即数，两个操作数都来自寄存器堆。';
    }
    return { parts: parts, value: value, u32: value >>> 0, note: note };
  }

  // ---------- 单行汇编解析 ----------
  function splitOps(s) {
    return s.split(',').map(function (x) { return x.trim(); }).filter(function (x) { return x.length; });
  }
  function parseMem(s) {
    var m = /^([^(]+)\(([^)]+)\)$/.exec(s.trim());
    if (!m) return null;
    return { imm: m[1].trim(), rs1: m[2].trim() };
  }
  function parseAsm(line) {
    var text = String(line).replace(/#.*$/, '').replace(/\/\/.*$/, '').trim();
    if (!text) return null;
    var m = /^([a-zA-Z][\w.]*)\s*(.*)$/.exec(text);
    if (!m) return null;
    var name = m[1].toLowerCase();
    var rest = m[2].trim();
    var inst = D.BY_ID[name];
    var parts = rest ? splitOps(rest) : [];
    var ops = {};

    if (!inst) {
      // 伪指令或未知：原样返回，由汇编器展开
      return { name: name, parts: parts, pseudo: !!D.PSEUDO_BY_NAME[name], inst: null, raw: text };
    }
    switch (inst.format) {
      case 'R':
        ops.rd = parts[0]; ops.rs1 = parts[1]; ops.rs2 = parts[2]; break;
      case 'I':
        if (inst.group === '访存') {
          ops.rd = parts[0];
          var mm = parseMem(parts[1]);
          if (mm) { ops.imm = mm.imm; ops.rs1 = mm.rs1; }
          else { ops.imm = parts[1]; ops.rs1 = null; }
        } else if (name === 'jalr') {
          ops.rd = parts[0];
          if (parts.length >= 3) { ops.rs1 = parts[1]; ops.imm = parts[2]; }
          else {
            var jm = parseMem(parts[1]);
            if (jm) { ops.imm = jm.imm; ops.rs1 = jm.rs1; }
            else { ops.imm = 0; ops.rs1 = parts[1]; }
          }
        } else if (name === 'fence' || name === 'ecall' || name === 'ebreak') {
          // 无操作数
        } else {
          ops.rd = parts[0]; ops.rs1 = parts[1]; ops.imm = parts[2];
        }
        break;
      case 'S':
        ops.rs2 = parts[0];
        var sm = parseMem(parts[1]);
        if (sm) { ops.imm = sm.imm; ops.rs1 = sm.rs1; }
        else { ops.imm = parts[1]; ops.rs1 = null; }
        break;
      case 'B': ops.rs1 = parts[0]; ops.rs2 = parts[1]; ops.imm = parts[2]; break;
      case 'U': ops.rd = parts[0]; ops.imm = parts[1]; break;
      case 'J': ops.rd = parts[0]; ops.imm = parts[1]; break;
    }
    return { name: name, parts: parts, pseudo: false, inst: inst, ops: ops, raw: text };
  }

  // 指令格式 / opcode 汇总表
  function opcodeTable() {
    var map = {};
    D.INSTRUCTIONS.forEach(function (i) {
      if (!map[i.opcode]) map[i.opcode] = { opcode: i.opcode, hex: '0x' + parseInt(i.opcode, 2).toString(16).padStart(2, '0'), names: [], formats: {} };
      map[i.opcode].names.push(i.name);
      map[i.opcode].formats[i.format] = true;
    });
    return Object.keys(map).sort().map(function (k) {
      var v = map[k];
      v.formats = Object.keys(v.formats).join('/');
      return v;
    });
  }

  RV.encoder = {
    bits: bits, setBits: setBits, signExt: signExt, pad: pad,
    hex: hex, binary: binary, regNum: regNum, num: num, regName: regName,
    encode: encode, decode: decode, findInst: findInst, fields: fields,
    immMap: immMap, parseAsm: parseAsm, formatAsm: formatAsm,
    opcodeTable: opcodeTable, FIELD_DESC: FIELD_DESC, COLORS: COLORS
  };
})();
