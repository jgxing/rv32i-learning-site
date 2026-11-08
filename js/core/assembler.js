(function () {
  'use strict';
  var RV = (window.RV = window.RV || {});
  var D = RV.data, E = RV.encoder;
  var DATA_BASE = 0x1000;

  function clean(line) {
    return String(line).replace(/#.*$/, '').replace(/\/\/.*$/, '').trim();
  }
  function isDirective(s) { return /^\./.test(s); }
  function parseNumOrLabel(v) {
    var n = E.num(v);
    return n === null ? String(v).trim() : n;
  }

  function assemble(source) {
    var errors = [];
    var lines = String(source || '').split(/\r?\n/);
    var labels = {};
    var dataBytes = [];
    var flat = [];          // 展开后的真实指令：{text, line}
    var sourceLines = lines.map(function (l) { return clean(l); });
    var section = 'text';
    var codeAddr = 0, dataAddr = DATA_BASE;

    // ---- Pass 0: 去注释、处理 label / 段 / 伪指令展开，同时分配地址 ----
    lines.forEach(function (raw, idx) {
      var lineNo = idx + 1;
      var s = clean(raw);
      if (!s) return;

      // 标签（可能后接指令）
      var labelMatch;
      while ((labelMatch = /^([A-Za-z_][\w.]*):\s*(.*)$/.exec(s))) {
        var lname = labelMatch[1];
        if (labels[lname] !== undefined) errors.push({ line: lineNo, msg: '重复定义标签 ' + lname });
        labels[lname] = section === 'data' ? dataAddr : codeAddr;
        s = labelMatch[2].trim();
        if (!s) return;
      }

      if (isDirective(s)) {
        var dm = /^\.(\w+)\s*(.*)$/.exec(s);
        var dir = dm[1].toLowerCase(), arg = dm[2].trim();
        if (dir === 'text') { section = 'text'; return; }
        if (dir === 'data') { section = 'data'; return; }
        if (dir === 'word') {
          if (section !== 'data') { errors.push({ line: lineNo, msg: '.word 只能放在 .data 段' }); return; }
          var vals = arg.split(',').map(function (x) { return parseNumOrLabel(x); });
          vals.forEach(function (v) {
            if (typeof v !== 'number') { errors.push({ line: lineNo, msg: '.word 中出现未知符号 ' + v }); return; }
            var u = v >>> 0;
            dataBytes.push(u & 0xff, (u >>> 8) & 0xff, (u >>> 16) & 0xff, (u >>> 24) & 0xff);
            dataAddr += 4;
          });
          return;
        }
        if (dir === 'byte' || dir === 'half') {
          errors.push({ line: lineNo, msg: '暂不支持 .' + dir + '，请使用 .word' });
          return;
        }
        errors.push({ line: lineNo, msg: '未知汇编指示 ' + s });
        return;
      }

      if (section === 'data') {
        errors.push({ line: lineNo, msg: '数据段中不能写指令：' + s });
        return;
      }

      // 展开伪指令
      var parsed = E.parseAsm(s);
      if (!parsed) { errors.push({ line: lineNo, msg: '无法解析：' + s }); return; }
      var texts = [];
      if (parsed.pseudo) {
        var p = D.PSEUDO_BY_NAME[parsed.name];
        try {
          var exp = p.expand(parsed.parts);
          texts = exp.map(function (e) {
            return e[0] + (e.length > 1 ? ' ' + e.slice(1).join(', ') : '');
          });
        } catch (err) {
          errors.push({ line: lineNo, msg: '伪指令 ' + parsed.name + ' 展开失败：' + err.message });
          return;
        }
      } else if (!parsed.inst) {
        errors.push({ line: lineNo, msg: '未知指令：' + parsed.name });
        return;
      } else {
        texts = [s];
      }

      texts.forEach(function (t) {
        flat.push({ text: t, line: lineNo, addr: codeAddr, pseudo: parsed.pseudo });
        codeAddr += 4;
      });
    });

    // ---- Pass 1: 解析操作数并编码 ----
    var items = [];
    var codeBytes = new Uint8Array(flat.length * 4);
    var lineMap = {};
    flat.forEach(function (f, i) {
      var p = E.parseAsm(f.text);
      if (!p || !p.inst) {
        errors.push({ line: f.line, msg: '展开后无法识别：' + f.text });
        return;
      }
      var inst = p.inst;
      var ops = {};
      var bad = false;
      function resolveReg(v, key) {
        if (v === undefined || v === null || v === '') { errors.push({ line: f.line, msg: inst.name + ' 缺少操作数 ' + key }); bad = true; return 0; }
        var n = E.regNum(v);
        if (n === null) { errors.push({ line: f.line, msg: '未知寄存器：' + v }); bad = true; return 0; }
        return n;
      }
      function resolveImm(v, isTarget, isHiLo) {
        if (v === undefined || v === null || v === '') return 0;
        var raw = String(v).trim();
        var hm = /^@(hi|lo)\((.+)\)$/.exec(raw);
        if (hm) {
          var lb = hm[2];
          if (labels[lb] === undefined) { errors.push({ line: f.line, msg: '未定义标签：' + lb }); bad = true; return 0; }
          var la = labels[lb], parts = D.splitHiLo(la);
          return hm[1] === 'hi' ? parts[0] : parts[1];
        }
        var n = E.num(raw);
        if (n !== null) return n;
        if (labels[raw] !== undefined) {
          var target = labels[raw];
          return isTarget ? target - f.addr : target;
        }
        errors.push({ line: f.line, msg: '无法解析立即数 / 未定义标签：' + raw });
        bad = true;
        return 0;
      }

      ['rd', 'rs1', 'rs2'].forEach(function (k) {
        if (p.ops[k] !== undefined) ops[k] = resolveReg(p.ops[k], k);
      });
      var isTarget = inst.format === 'B' || inst.format === 'J';
      if (p.ops.imm !== undefined) ops.imm = resolveImm(p.ops.imm, isTarget, false);

      if (isTarget && typeof ops.imm === 'number' && ops.imm % 2 !== 0) {
        errors.push({ line: f.line, msg: '分支/跳转偏移必须为偶数，得到 ' + ops.imm });
        bad = true;
      }
      if (bad) return;

      var word;
      try { word = E.encode(inst.name, ops); }
      catch (err) { errors.push({ line: f.line, msg: err.message }); return; }

      codeBytes[i * 4] = word & 0xff;
      codeBytes[(i * 4) + 1] = (word >>> 8) & 0xff;
      codeBytes[(i * 4) + 2] = (word >>> 16) & 0xff;
      codeBytes[(i * 4) + 3] = (word >>> 24) & 0xff;

      lineMap[f.addr] = f.line;
      var dec = E.decode(word);
      items.push({
        addr: f.addr, line: f.line, text: f.text, name: inst.name,
        word: word, hex: E.hex(word), bin: E.binary(word),
        asm: dec.valid ? dec.asm : f.text, pseudo: f.pseudo
      });
    });

    return {
      ok: errors.length === 0, errors: errors, items: items,
      labels: labels, lineMap: lineMap, sourceLines: sourceLines,
      codeBytes: codeBytes, codeLength: flat.length * 4,
      dataBytes: new Uint8Array(dataBytes), dataBase: DATA_BASE,
      rawLines: lines
    };
  }

  RV.assembler = { assemble: assemble, DATA_BASE: DATA_BASE };
})();
