(function () {
  'use strict';
  var RV = (window.RV = window.RV || {});

  // x0-x31 的 ABI 名称与调用约定
  var REGS = [
    ['x0', 'zero', '恒为 0', '只读常量，写入被丢弃'],
    ['x1', 'ra', '返回地址', '调用者保存'],
    ['x2', 'sp', '栈指针', '被调用者保存'],
    ['x3', 'gp', '全局指针', '—'],
    ['x4', 'tp', '线程指针', '—'],
    ['x5', 't0', '临时寄存器', '调用者保存'],
    ['x6', 't1', '临时寄存器', '调用者保存'],
    ['x7', 't2', '临时寄存器', '调用者保存'],
    ['x8', 's0 / fp', '保存寄存器 / 帧指针', '被调用者保存'],
    ['x9', 's1', '保存寄存器', '被调用者保存'],
    ['x10', 'a0', '参数 / 返回值 0', '调用者保存'],
    ['x11', 'a1', '参数 / 返回值 1', '调用者保存'],
    ['x12', 'a2', '参数 2', '调用者保存'],
    ['x13', 'a3', '参数 3', '调用者保存'],
    ['x14', 'a4', '参数 4', '调用者保存'],
    ['x15', 'a5', '参数 5', '调用者保存'],
    ['x16', 'a6', '参数 6', '调用者保存'],
    ['x17', 'a7', '参数 7', '调用者保存'],
    ['x18', 's2', '保存寄存器', '被调用者保存'],
    ['x19', 's3', '保存寄存器', '被调用者保存'],
    ['x20', 's4', '保存寄存器', '被调用者保存'],
    ['x21', 's5', '保存寄存器', '被调用者保存'],
    ['x22', 's6', '保存寄存器', '被调用者保存'],
    ['x23', 's7', '保存寄存器', '被调用者保存'],
    ['x24', 's8', '保存寄存器', '被调用者保存'],
    ['x25', 's9', '保存寄存器', '被调用者保存'],
    ['x26', 's10', '保存寄存器', '被调用者保存'],
    ['x27', 's11', '保存寄存器', '被调用者保存'],
    ['x28', 't3', '临时寄存器', '调用者保存'],
    ['x29', 't4', '临时寄存器', '调用者保存'],
    ['x30', 't5', '临时寄存器', '调用者保存'],
    ['x31', 't6', '临时寄存器', '调用者保存']
  ];

  // 寄存器名 -> 编号
  var REGNUM = {};
  REGS.forEach(function (r, i) {
    r[1].split(' / ').forEach(function (n) { REGNUM[n] = i; });
    REGNUM[r[0]] = i;
  });

  // 六种指令格式的字段划分（闭区间，含端点）
  var FORMATS = {
    R: { fields: [['funct7', 31, 25], ['rs2', 24, 20], ['rs1', 19, 15], ['funct3', 14, 12], ['rd', 11, 7], ['opcode', 6, 0]], desc: '寄存器 - 寄存器运算', example: 'add x5, x6, x7' },
    I: { fields: [['imm[11:0]', 31, 20], ['rs1', 19, 15], ['funct3', 14, 12], ['rd', 11, 7], ['opcode', 6, 0]], desc: '立即数运算 / 加载 / jalr', example: 'addi x5, x6, 7' },
    S: { fields: [['imm[11:5]', 31, 25], ['rs2', 24, 20], ['rs1', 19, 15], ['funct3', 14, 12], ['imm[4:0]', 11, 7], ['opcode', 6, 0]], desc: '存储（立即数被拆成两段）', example: 'sw x5, 8(x2)' },
    B: { fields: [['imm[12]', 31, 31], ['imm[10:5]', 30, 25], ['rs2', 24, 20], ['rs1', 19, 15], ['funct3', 14, 12], ['imm[4:1]', 11, 8], ['imm[11]', 7, 7], ['opcode', 6, 0]], desc: '条件分支（立即数位序打散）', example: 'beq x5, x6, -8' },
    U: { fields: [['imm[31:12]', 31, 12], ['rd', 11, 7], ['opcode', 6, 0]], desc: '高位立即数，低 12 位补 0', example: 'lui x5, 0x12345' },
    J: { fields: [['imm[20]', 31, 31], ['imm[10:1]', 30, 21], ['imm[11]', 20, 20], ['imm[19:12]', 19, 12], ['rd', 11, 7], ['opcode', 6, 0]], desc: '无条件跳转 jal', example: 'jal x1, -20' }
  };

  var CTRL0 = { RegWrite: 0, ALUSrc: '—', ALUOp: '—', MemRead: 0, MemWrite: 0, MemtoReg: '—', Branch: 0, Jump: 0, PCSrc: 'PC+4', ImmGen: '—', Link: 0 };

  function mk(o) {
    var base = {
      funct3: null, funct7: null, ops: [], note: '', pitfall: '', example: '',
      control: Object.assign({}, CTRL0)
    };
    var r = Object.assign(base, o);
    r.control = Object.assign({}, CTRL0, o.control || {});
    return r;
  }

  var RW = { RegWrite: 1, MemtoReg: 'ALU' };
  var ROP = { ALUSrc: 'rs2' };
  var IOP = { ALUSrc: 'imm', ImmGen: 'I' };

  var INSTRUCTIONS = [
    // ---- 算术 ----
    mk({ id: 'lui', name: 'lui', group: '算术', format: 'U', opcode: '0110111', ops: ['rd', 'imm20'],
      syntax: 'lui rd, imm', desc: '把 20 位立即数放到寄存器高 20 位，低 12 位清零',
      rtl: 'R[rd] = imm20 << 12', example: 'lui x5, 0x12345   # x5 = 0x12345000',
      note: '常与 addi 配合装载任意 32 位常数；addi 的立即数符号扩展可能使高 20 位需要 +1 修正。',
      pitfall: 'lui 的立即数是 20 位字段值，不是最终数值；最终值 = imm << 12。',
      control: { RegWrite: 1, ALUOp: 'PASS-IMM', MemtoReg: 'IMM', ImmGen: 'U' },
      run: function (c, o) { c.W(o.rd, (o.imm << 12) >>> 0); } }),
    mk({ id: 'auipc', name: 'auipc', group: '算术', format: 'U', opcode: '0010111', ops: ['rd', 'imm20'],
      syntax: 'auipc rd, imm', desc: '把 20 位立即数左移 12 位后加到当前 PC',
      rtl: 'R[rd] = PC + (imm20 << 12)', example: 'auipc x5, 1   # x5 = PC + 0x1000',
      note: '与 jalr / addi 组合可实现 PC 相对寻址，是 la、call 等伪指令的基础。',
      pitfall: '加的是当前指令自己的地址，不是 PC+4。',
      control: { RegWrite: 1, ALUOp: 'ADD-PC', MemtoReg: 'ALU', ImmGen: 'U' },
      run: function (c, o) { c.W(o.rd, (c.PC + ((o.imm << 12) | 0)) >>> 0); } }),
    mk({ id: 'add', name: 'add', group: '算术', format: 'R', opcode: '0110011', funct3: '000', funct7: '0000000', ops: ['rd', 'rs1', 'rs2'],
      syntax: 'add rd, rs1, rs2', desc: '寄存器加法（忽略溢出）',
      rtl: 'R[rd] = R[rs1] + R[rs2]', example: 'add x5, x6, x7',
      note: 'RISC-V 不检测算术溢出，结果按 32 位回绕。', pitfall: '与 addi 不同，第二操作数是寄存器；溢出不会触发异常。',
      control: Object.assign({}, RW, ROP, { ALUOp: 'ADD' }),
      run: function (c, o) { c.W(o.rd, (c.R(o.rs1) + c.R(o.rs2)) >>> 0); } }),
    mk({ id: 'sub', name: 'sub', group: '算术', format: 'R', opcode: '0110011', funct3: '000', funct7: '0100000', ops: ['rd', 'rs1', 'rs2'],
      syntax: 'sub rd, rs1, rs2', desc: '寄存器减法', rtl: 'R[rd] = R[rs1] - R[rs2]', example: 'sub x5, x6, x7',
      note: '与 add 共用 opcode 和 funct3，仅靠 funct7 的 bit30 区分。',
      pitfall: 'funct7 = 0100000，写错就变成 add。',
      control: Object.assign({}, RW, ROP, { ALUOp: 'SUB' }),
      run: function (c, o) { c.W(o.rd, (c.R(o.rs1) - c.R(o.rs2)) >>> 0); } }),
    mk({ id: 'addi', name: 'addi', group: '算术', format: 'I', opcode: '0010011', funct3: '000', ops: ['rd', 'rs1', 'imm'],
      syntax: 'addi rd, rs1, imm', desc: '立即数加法，12 位立即数符号扩展',
      rtl: 'R[rd] = R[rs1] + sign_extend(imm[11:0])', example: 'addi x5, x0, 7   # x5 = 7',
      note: 'imm = 0 且 rs1 = x0 时就是 li；rd = x0 时等价于 nop。',
      pitfall: '立即数只有 12 位有符号，范围 -2048 ~ 2047；更大的常数需 lui + addi。',
      control: Object.assign({}, RW, IOP, { ALUOp: 'ADD' }),
      run: function (c, o) { c.W(o.rd, (c.R(o.rs1) + (o.imm | 0)) >>> 0); } }),

    // ---- 逻辑 ----
    mk({ id: 'and', name: 'and', group: '逻辑', format: 'R', opcode: '0110011', funct3: '111', funct7: '0000000', ops: ['rd', 'rs1', 'rs2'],
      syntax: 'and rd, rs1, rs2', desc: '按位与', rtl: 'R[rd] = R[rs1] & R[rs2]', example: 'and x5, x6, x7',
      note: '常用于掩码提取。', pitfall: 'funct3 = 111，别与 or(110) 混淆。',
      control: Object.assign({}, RW, ROP, { ALUOp: 'AND' }),
      run: function (c, o) { c.W(o.rd, (c.R(o.rs1) & c.R(o.rs2)) >>> 0); } }),
    mk({ id: 'or', name: 'or', group: '逻辑', format: 'R', opcode: '0110011', funct3: '110', funct7: '0000000', ops: ['rd', 'rs1', 'rs2'],
      syntax: 'or rd, rs1, rs2', desc: '按位或', rtl: 'R[rd] = R[rs1] | R[rs2]', example: 'or x5, x6, x7',
      note: '常用于位拼接。', pitfall: '—',
      control: Object.assign({}, RW, ROP, { ALUOp: 'OR' }),
      run: function (c, o) { c.W(o.rd, (c.R(o.rs1) | c.R(o.rs2)) >>> 0); } }),
    mk({ id: 'xor', name: 'xor', group: '逻辑', format: 'R', opcode: '0110011', funct3: '100', funct7: '0000000', ops: ['rd', 'rs1', 'rs2'],
      syntax: 'xor rd, rs1, rs2', desc: '按位异或', rtl: 'R[rd] = R[rs1] ^ R[rs2]', example: 'xor x5, x6, x7',
      note: '与 all-ones 异或可实现按位取反。', pitfall: '—',
      control: Object.assign({}, RW, ROP, { ALUOp: 'XOR' }),
      run: function (c, o) { c.W(o.rd, (c.R(o.rs1) ^ c.R(o.rs2)) >>> 0); } }),
    mk({ id: 'andi', name: 'andi', group: '逻辑', format: 'I', opcode: '0010011', funct3: '111', ops: ['rd', 'rs1', 'imm'],
      syntax: 'andi rd, rs1, imm', desc: '立即数按位与', rtl: 'R[rd] = R[rs1] & sign_extend(imm)', example: 'andi x5, x6, 0xff',
      note: 'imm 会符号扩展，0xff 实际是 0x000000ff。', pitfall: '写 0xfff 会变成 0xffffffff，用掩码时注意符号扩展。',
      control: Object.assign({}, RW, IOP, { ALUOp: 'AND' }),
      run: function (c, o) { c.W(o.rd, (c.R(o.rs1) & (o.imm | 0)) >>> 0); } }),
    mk({ id: 'ori', name: 'ori', group: '逻辑', format: 'I', opcode: '0010011', funct3: '110', ops: ['rd', 'rs1', 'imm'],
      syntax: 'ori rd, rs1, imm', desc: '立即数按位或', rtl: 'R[rd] = R[rs1] | sign_extend(imm)', example: 'ori x5, x6, 3',
      note: '—', pitfall: '立即数符号扩展，负数会置位高位。',
      control: Object.assign({}, RW, IOP, { ALUOp: 'OR' }),
      run: function (c, o) { c.W(o.rd, (c.R(o.rs1) | (o.imm | 0)) >>> 0); } }),
    mk({ id: 'xori', name: 'xori', group: '逻辑', format: 'I', opcode: '0010011', funct3: '100', ops: ['rd', 'rs1', 'imm'],
      syntax: 'xori rd, rs1, imm', desc: '立即数按位异或', rtl: 'R[rd] = R[rs1] ^ sign_extend(imm)', example: 'xori x5, x6, -1   # 取反',
      note: 'not 伪指令展开为 xori rd, rs, -1。', pitfall: '—',
      control: Object.assign({}, RW, IOP, { ALUOp: 'XOR' }),
      run: function (c, o) { c.W(o.rd, (c.R(o.rs1) ^ (o.imm | 0)) >>> 0); } }),

    // ---- 移位 ----
    mk({ id: 'sll', name: 'sll', group: '移位', format: 'R', opcode: '0110011', funct3: '001', funct7: '0000000', ops: ['rd', 'rs1', 'rs2'],
      syntax: 'sll rd, rs1, rs2', desc: '逻辑左移，移位量取 rs2 低 5 位', rtl: 'R[rd] = R[rs1] << (R[rs2] & 31)', example: 'sll x5, x6, x7',
      note: '—', pitfall: '只使用 rs2 的低 5 位（0~31）。',
      control: Object.assign({}, RW, ROP, { ALUOp: 'SLL' }),
      run: function (c, o) { c.W(o.rd, (c.R(o.rs1) << (c.R(o.rs2) & 31)) >>> 0); } }),
    mk({ id: 'srl', name: 'srl', group: '移位', format: 'R', opcode: '0110011', funct3: '101', funct7: '0000000', ops: ['rd', 'rs1', 'rs2'],
      syntax: 'srl rd, rs1, rs2', desc: '逻辑右移（高位补 0）', rtl: 'R[rd] = R[rs1] >> (R[rs2] & 31) (unsigned)', example: 'srl x5, x6, x7',
      note: '—', pitfall: '与 sra 仅靠 funct7 区分。',
      control: Object.assign({}, RW, ROP, { ALUOp: 'SRL' }),
      run: function (c, o) { c.W(o.rd, c.R(o.rs1) >>> (c.R(o.rs2) & 31)); } }),
    mk({ id: 'sra', name: 'sra', group: '移位', format: 'R', opcode: '0110011', funct3: '101', funct7: '0100000', ops: ['rd', 'rs1', 'rs2'],
      syntax: 'sra rd, rs1, rs2', desc: '算术右移（高位补符号位）', rtl: 'R[rd] = (int32)R[rs1] >> (R[rs2] & 31)', example: 'sra x5, x6, 1',
      note: '用于有符号数除以 2 的幂。', pitfall: 'funct7 = 0100000。',
      control: Object.assign({}, RW, ROP, { ALUOp: 'SRA' }),
      run: function (c, o) { c.W(o.rd, (c.S(o.rs1) >> (c.R(o.rs2) & 31)) >>> 0); } }),
    mk({ id: 'slli', name: 'slli', group: '移位', format: 'I', opcode: '0010011', funct3: '001', funct7: '0000000', ops: ['rd', 'rs1', 'shamt'],
      syntax: 'slli rd, rs1, shamt', desc: '立即数逻辑左移', rtl: 'R[rd] = R[rs1] << shamt', example: 'slli x5, x6, 2',
      note: 'I 型立即数的低 5 位作为 shamt，高 7 位必须为 0。',
      pitfall: 'shamt 范围 0~31，写 32 以上属于非法编码。',
      control: Object.assign({}, RW, IOP, { ALUOp: 'SLL' }),
      run: function (c, o) { c.W(o.rd, (c.R(o.rs1) << (o.imm & 31)) >>> 0); } }),
    mk({ id: 'srli', name: 'srli', group: '移位', format: 'I', opcode: '0010011', funct3: '101', funct7: '0000000', ops: ['rd', 'rs1', 'shamt'],
      syntax: 'srli rd, rs1, shamt', desc: '立即数逻辑右移', rtl: 'R[rd] = R[rs1] >> shamt (unsigned)', example: 'srli x5, x6, 3',
      note: '—', pitfall: 'funct7 必须为 0000000。',
      control: Object.assign({}, RW, IOP, { ALUOp: 'SRL' }),
      run: function (c, o) { c.W(o.rd, c.R(o.rs1) >>> (o.imm & 31)); } }),
    mk({ id: 'srai', name: 'srai', group: '移位', format: 'I', opcode: '0010011', funct3: '101', funct7: '0100000', ops: ['rd', 'rs1', 'shamt'],
      syntax: 'srai rd, rs1, shamt', desc: '立即数算术右移', rtl: 'R[rd] = (int32)R[rs1] >> shamt', example: 'srai x5, x6, 3',
      note: '—', pitfall: '与 srli 的 funct3 相同，靠 funct7 = 0100000 区分。',
      control: Object.assign({}, RW, IOP, { ALUOp: 'SRA' }),
      run: function (c, o) { c.W(o.rd, (c.S(o.rs1) >> (o.imm & 31)) >>> 0); } }),

    // ---- 比较 ----
    mk({ id: 'slt', name: 'slt', group: '比较', format: 'R', opcode: '0110011', funct3: '010', funct7: '0000000', ops: ['rd', 'rs1', 'rs2'],
      syntax: 'slt rd, rs1, rs2', desc: '有符号小于则置 1', rtl: 'R[rd] = (int32)R[rs1] < (int32)R[rs2] ? 1 : 0', example: 'slt x5, x6, x7',
      note: '常与 bne 组合实现复杂条件。', pitfall: '有符号比较，无符号用 sltu。',
      control: Object.assign({}, RW, ROP, { ALUOp: 'SLT' }),
      run: function (c, o) { c.W(o.rd, c.S(o.rs1) < c.S(o.rs2) ? 1 : 0); } }),
    mk({ id: 'sltu', name: 'sltu', group: '比较', format: 'R', opcode: '0110011', funct3: '011', funct7: '0000000', ops: ['rd', 'rs1', 'rs2'],
      syntax: 'sltu rd, rs1, rs2', desc: '无符号小于则置 1', rtl: 'R[rd] = R[rs1] < R[rs2] ? 1 : 0 (unsigned)', example: 'sltu x5, x6, x7',
      note: 'sltu rd, x0, rs 等价于 snez。', pitfall: '—',
      control: Object.assign({}, RW, ROP, { ALUOp: 'SLTU' }),
      run: function (c, o) { c.W(o.rd, c.R(o.rs1) < c.R(o.rs2) ? 1 : 0); } }),
    mk({ id: 'slti', name: 'slti', group: '比较', format: 'I', opcode: '0010011', funct3: '010', ops: ['rd', 'rs1', 'imm'],
      syntax: 'slti rd, rs1, imm', desc: '有符号小于立即数则置 1', rtl: 'R[rd] = (int32)R[rs1] < sign_extend(imm) ? 1 : 0', example: 'slti x5, x6, 10',
      note: '—', pitfall: '立即数符号扩展。',
      control: Object.assign({}, RW, IOP, { ALUOp: 'SLT' }),
      run: function (c, o) { c.W(o.rd, c.S(o.rs1) < (o.imm | 0) ? 1 : 0); } }),
    mk({ id: 'sltiu', name: 'sltiu', group: '比较', format: 'I', opcode: '0010011', funct3: '011', ops: ['rd', 'rs1', 'imm'],
      syntax: 'sltiu rd, rs1, imm', desc: '无符号小于立即数则置 1', rtl: 'R[rd] = R[rs1] < (uint32)sign_extend(imm) ? 1 : 0', example: 'sltiu x5, x6, 1   # seqz',
      note: 'seqz 伪指令就是 sltiu rd, rs, 1。',
      pitfall: '立即数先符号扩展再当无符号比较，写 -1 会得到 0xffffffff。',
      control: Object.assign({}, RW, IOP, { ALUOp: 'SLTU' }),
      run: function (c, o) { c.W(o.rd, c.R(o.rs1) < ((o.imm | 0) >>> 0) ? 1 : 0); } }),

    // ---- 分支 ----
    mk({ id: 'beq', name: 'beq', group: '分支', format: 'B', opcode: '1100011', funct3: '000', ops: ['rs1', 'rs2', 'imm'],
      syntax: 'beq rs1, rs2, imm', desc: '相等则跳转', rtl: 'if (R[rs1] == R[rs2]) PC += imm', example: 'beq x5, x6, -8',
      note: '偏移以字节为单位，且必须为偶数。', pitfall: '没有延迟槽；写汇编时通常用 label，由汇编器算偏移。',
      control: { Branch: 1, ALUSrc: 'rs2', ALUOp: 'SUB', ImmGen: 'B', PCSrc: 'branch' },
      run: function (c, o) { if (c.R(o.rs1) === c.R(o.rs2)) c.J((c.PC + (o.imm | 0)) >>> 0); } }),
    mk({ id: 'bne', name: 'bne', group: '分支', format: 'B', opcode: '1100011', funct3: '001', ops: ['rs1', 'rs2', 'imm'],
      syntax: 'bne rs1, rs2, imm', desc: '不等则跳转', rtl: 'if (R[rs1] != R[rs2]) PC += imm', example: 'bne x5, x6, loop',
      note: '—', pitfall: '—',
      control: { Branch: 1, ALUSrc: 'rs2', ALUOp: 'SUB', ImmGen: 'B', PCSrc: 'branch' },
      run: function (c, o) { if (c.R(o.rs1) !== c.R(o.rs2)) c.J((c.PC + (o.imm | 0)) >>> 0); } }),
    mk({ id: 'blt', name: 'blt', group: '分支', format: 'B', opcode: '1100011', funct3: '100', ops: ['rs1', 'rs2', 'imm'],
      syntax: 'blt rs1, rs2, imm', desc: '有符号小于则跳转', rtl: 'if ((int32)R[rs1] < (int32)R[rs2]) PC += imm', example: 'blt x5, x6, loop',
      note: '—', pitfall: '有符号；无符号用 bltu。',
      control: { Branch: 1, ALUSrc: 'rs2', ALUOp: 'SLT', ImmGen: 'B', PCSrc: 'branch' },
      run: function (c, o) { if (c.S(o.rs1) < c.S(o.rs2)) c.J((c.PC + (o.imm | 0)) >>> 0); } }),
    mk({ id: 'bge', name: 'bge', group: '分支', format: 'B', opcode: '1100011', funct3: '101', ops: ['rs1', 'rs2', 'imm'],
      syntax: 'bge rs1, rs2, imm', desc: '有符号大于等于则跳转', rtl: 'if ((int32)R[rs1] >= (int32)R[rs2]) PC += imm', example: 'bge x5, x6, done',
      note: '—', pitfall: '—',
      control: { Branch: 1, ALUSrc: 'rs2', ALUOp: 'SLT', ImmGen: 'B', PCSrc: 'branch' },
      run: function (c, o) { if (c.S(o.rs1) >= c.S(o.rs2)) c.J((c.PC + (o.imm | 0)) >>> 0); } }),
    mk({ id: 'bltu', name: 'bltu', group: '分支', format: 'B', opcode: '1100011', funct3: '110', ops: ['rs1', 'rs2', 'imm'],
      syntax: 'bltu rs1, rs2, imm', desc: '无符号小于则跳转', rtl: 'if (R[rs1] < R[rs2]) PC += imm (unsigned)', example: 'bltu x5, x6, loop',
      note: '—', pitfall: '—',
      control: { Branch: 1, ALUSrc: 'rs2', ALUOp: 'SLTU', ImmGen: 'B', PCSrc: 'branch' },
      run: function (c, o) { if (c.R(o.rs1) < c.R(o.rs2)) c.J((c.PC + (o.imm | 0)) >>> 0); } }),
    mk({ id: 'bgeu', name: 'bgeu', group: '分支', format: 'B', opcode: '1100011', funct3: '111', ops: ['rs1', 'rs2', 'imm'],
      syntax: 'bgeu rs1, rs2, imm', desc: '无符号大于等于则跳转', rtl: 'if (R[rs1] >= R[rs2]) PC += imm (unsigned)', example: 'bgeu x5, x6, done',
      note: '—', pitfall: '—',
      control: { Branch: 1, ALUSrc: 'rs2', ALUOp: 'SLTU', ImmGen: 'B', PCSrc: 'branch' },
      run: function (c, o) { if (c.R(o.rs1) >= c.R(o.rs2)) c.J((c.PC + (o.imm | 0)) >>> 0); } }),

    // ---- 跳转 ----
    mk({ id: 'jal', name: 'jal', group: '跳转', format: 'J', opcode: '1101111', ops: ['rd', 'imm'],
      syntax: 'jal rd, imm', desc: '跳转并把 PC+4 写入 rd', rtl: 'R[rd] = PC + 4; PC += imm', example: 'jal x1, -20   # 函数调用',
      note: 'rd = x0 时为无条件跳转（伪指令 j）。J 型立即数范围 ±1 MiB。',
      pitfall: '偏移是相对当前指令的字节数，且必须为偶数。',
      control: { RegWrite: 1, Jump: 1, Link: 1, ImmGen: 'J', MemtoReg: 'PC4', PCSrc: 'jump' },
      run: function (c, o) { c.W(o.rd, (c.PC + 4) >>> 0); c.J((c.PC + (o.imm | 0)) >>> 0); } }),
    mk({ id: 'jalr', name: 'jalr', group: '跳转', format: 'I', opcode: '1100111', funct3: '000', ops: ['rd', 'rs1', 'imm'],
      syntax: 'jalr rd, rs1, imm', desc: '间接跳转：PC = (R[rs1] + imm) & ~1，并把 PC+4 写入 rd',
      rtl: 't = (R[rs1] + imm) & ~1; R[rd] = PC + 4; PC = t', example: 'jalr x0, x1, 0   # ret',
      note: 'ret 伪指令展开为 jalr x0, x1, 0；auipc + jalr 可实现 32 位远距离跳转。',
      pitfall: '目标地址最低位会被硬件清零；rd 与 rs1 相同时顺序有讲究。',
      control: { RegWrite: 1, Jump: 1, Link: 1, ImmGen: 'I', MemtoReg: 'PC4', ALUSrc: 'imm', ALUOp: 'ADD', PCSrc: 'jalr' },
      run: function (c, o) { var t = ((c.R(o.rs1) + (o.imm | 0)) >>> 0) & 0xfffffffe; c.W(o.rd, (c.PC + 4) >>> 0); c.J(t); } }),

    // ---- 访存 ----
    mk({ id: 'lb', name: 'lb', group: '访存', format: 'I', opcode: '0000011', funct3: '000', ops: ['rd', 'rs1', 'imm'],
      syntax: 'lb rd, imm(rs1)', desc: '读 1 字节并符号扩展到 32 位', rtl: 'R[rd] = sign_extend(Mem8[R[rs1] + imm])', example: 'lb x5, 0(x6)',
      note: '地址 = R[rs1] + 符号扩展立即数。', pitfall: '按字节寻址；符号扩展，0xff 会变成 0xffffffff。',
      control: { RegWrite: 1, ALUSrc: 'imm', ALUOp: 'ADD', ImmGen: 'I', MemRead: 1, MemtoReg: 'MEM', Width: 'byte' },
      run: function (c, o) { var a = (c.R(o.rs1) + (o.imm | 0)) >>> 0; c.W(o.rd, ((c.MEMB(a) << 24) >> 24) >>> 0); } }),
    mk({ id: 'lh', name: 'lh', group: '访存', format: 'I', opcode: '0000011', funct3: '001', ops: ['rd', 'rs1', 'imm'],
      syntax: 'lh rd, imm(rs1)', desc: '读 2 字节并符号扩展', rtl: 'R[rd] = sign_extend(Mem16[R[rs1] + imm])', example: 'lh x5, 0(x6)',
      note: '—', pitfall: '半字地址一般要求 2 字节对齐。',
      control: { RegWrite: 1, ALUSrc: 'imm', ALUOp: 'ADD', ImmGen: 'I', MemRead: 1, MemtoReg: 'MEM', Width: 'half' },
      run: function (c, o) { var a = (c.R(o.rs1) + (o.imm | 0)) >>> 0; c.W(o.rd, ((c.MEMH(a) << 16) >> 16) >>> 0); } }),
    mk({ id: 'lw', name: 'lw', group: '访存', format: 'I', opcode: '0000011', funct3: '010', ops: ['rd', 'rs1', 'imm'],
      syntax: 'lw rd, imm(rs1)', desc: '读 4 字节字', rtl: 'R[rd] = Mem32[R[rs1] + imm]', example: 'lw x5, 4(x6)',
      note: 'RV32I 最常用的加载指令。', pitfall: '偏移以字节为单位，数组下标要乘 4。',
      control: { RegWrite: 1, ALUSrc: 'imm', ALUOp: 'ADD', ImmGen: 'I', MemRead: 1, MemtoReg: 'MEM', Width: 'word' },
      run: function (c, o) { var a = (c.R(o.rs1) + (o.imm | 0)) >>> 0; c.W(o.rd, c.MEMW(a)); } }),
    mk({ id: 'lbu', name: 'lbu', group: '访存', format: 'I', opcode: '0000011', funct3: '100', ops: ['rd', 'rs1', 'imm'],
      syntax: 'lbu rd, imm(rs1)', desc: '读 1 字节并零扩展', rtl: 'R[rd] = zero_extend(Mem8[R[rs1] + imm])', example: 'lbu x5, 0(x6)',
      note: '处理无符号字节 / 字符时用。', pitfall: '与 lb 只差 funct3 的 bit2。',
      control: { RegWrite: 1, ALUSrc: 'imm', ALUOp: 'ADD', ImmGen: 'I', MemRead: 1, MemtoReg: 'MEM', Width: 'byteU' },
      run: function (c, o) { var a = (c.R(o.rs1) + (o.imm | 0)) >>> 0; c.W(o.rd, c.MEMB(a)); } }),
    mk({ id: 'lhu', name: 'lhu', group: '访存', format: 'I', opcode: '0000011', funct3: '101', ops: ['rd', 'rs1', 'imm'],
      syntax: 'lhu rd, imm(rs1)', desc: '读 2 字节并零扩展', rtl: 'R[rd] = zero_extend(Mem16[R[rs1] + imm])', example: 'lhu x5, 0(x6)',
      note: '—', pitfall: '—',
      control: { RegWrite: 1, ALUSrc: 'imm', ALUOp: 'ADD', ImmGen: 'I', MemRead: 1, MemtoReg: 'MEM', Width: 'halfU' },
      run: function (c, o) { var a = (c.R(o.rs1) + (o.imm | 0)) >>> 0; c.W(o.rd, c.MEMH(a)); } }),
    mk({ id: 'sb', name: 'sb', group: '访存', format: 'S', opcode: '0100011', funct3: '000', ops: ['rs2', 'rs1', 'imm'],
      syntax: 'sb rs2, imm(rs1)', desc: '写 1 字节', rtl: 'Mem8[R[rs1] + imm] = R[rs2][7:0]', example: 'sb x5, 0(x6)',
      note: 'S 型立即数被拆成 [11:5] 与 [4:0] 两段存放。', pitfall: '操作数顺序是「源寄存器, 偏移(基址)」，与加载相反。',
      control: { ALUSrc: 'imm', ALUOp: 'ADD', ImmGen: 'S', MemWrite: 1, Width: 'byte' },
      run: function (c, o) { var a = (c.R(o.rs1) + (o.imm | 0)) >>> 0; c.WB(a, c.R(o.rs2) & 0xff); } }),
    mk({ id: 'sh', name: 'sh', group: '访存', format: 'S', opcode: '0100011', funct3: '001', ops: ['rs2', 'rs1', 'imm'],
      syntax: 'sh rs2, imm(rs1)', desc: '写 2 字节', rtl: 'Mem16[R[rs1] + imm] = R[rs2][15:0]', example: 'sh x5, 0(x6)',
      note: '—', pitfall: '—',
      control: { ALUSrc: 'imm', ALUOp: 'ADD', ImmGen: 'S', MemWrite: 1, Width: 'half' },
      run: function (c, o) { var a = (c.R(o.rs1) + (o.imm | 0)) >>> 0; c.WH(a, c.R(o.rs2) & 0xffff); } }),
    mk({ id: 'sw', name: 'sw', group: '访存', format: 'S', opcode: '0100011', funct3: '010', ops: ['rs2', 'rs1', 'imm'],
      syntax: 'sw rs2, imm(rs1)', desc: '写 4 字节字', rtl: 'Mem32[R[rs1] + imm] = R[rs2]', example: 'sw x5, 4(x6)',
      note: '栈操作 addi sp, sp, -4 + sw 是典型组合。', pitfall: '无「立即数存储」指令，源数据必须先在寄存器里。',
      control: { ALUSrc: 'imm', ALUOp: 'ADD', ImmGen: 'S', MemWrite: 1, Width: 'word' },
      run: function (c, o) { var a = (c.R(o.rs1) + (o.imm | 0)) >>> 0; c.WW(a, c.R(o.rs2)); } }),

    // ---- 系统 ----
    mk({ id: 'fence', name: 'fence', group: '系统', format: 'I', opcode: '0001111', funct3: '000', ops: [],
      syntax: 'fence', desc: '内存访问顺序屏障', rtl: '按 predecessor / successor 域约束访存顺序', example: 'fence',
      note: '基础 RV32I 中常可视为 no-op（简单单核顺序实现）。', pitfall: '本模拟器按空操作处理。',
      control: { ImmGen: 'I' },
      run: function () { } }),
    mk({ id: 'ecall', name: 'ecall', group: '系统', format: 'I', opcode: '1110011', funct3: '000', ops: [],
      syntax: 'ecall', desc: '环境调用，向执行环境请求服务', rtl: '引发 environment-call 异常', example: 'ecall',
      note: '本模拟器约定：a0 = 1 时把 a1 作为整数输出；a0 = 10 或其它值则停机。',
      pitfall: '真实系统里由特权架构与 ABI 定义，不是 RV32I 本身的功能。',
      control: { },
      run: function (c) { if (c.R(10) === 1) { c.OUT(c.S(11)); } else { c.HALT(); } } }),
    mk({ id: 'ebreak', name: 'ebreak', group: '系统', format: 'I', opcode: '1110011', funct3: '000', ops: [],
      syntax: 'ebreak', desc: '调试断点', rtl: '引发 breakpoint 异常', example: 'ebreak',
      note: '本模拟器中作为停机指令。', pitfall: '与 ecall 的区分靠 imm 字段（0x000 / 0x001）。',
      control: { },
      run: function (c) { c.HALT(); } })
  ];

  // ecall / ebreak 用 imm 区分，加入额外匹配字段
  INSTRUCTIONS.forEach(function (i) {
    if (i.id === 'ecall') i.immFixed = 0x000;
    if (i.id === 'ebreak') i.immFixed = 0x001;
  });

  var BY_ID = {};
  INSTRUCTIONS.forEach(function (i) { BY_ID[i.id] = i; });

  var GROUPS = ['算术', '逻辑', '移位', '比较', '分支', '跳转', '访存', '系统'];

  // 伪指令：expand(operands) 返回若干条 [指令名, 操作数...]
  function splitHiLo(v) {
    var hi = (v + 0x800) >> 12;
    var lo = v - (hi << 12);
    return [hi, lo];
  }
  function toConst(v) {
    if (typeof v === 'number') return v;
    var s = String(v).trim();
    if (/^-?0x[0-9a-f]+$/i.test(s)) return parseInt(s, 16);
    if (/^-?0b[01]+$/i.test(s)) return parseInt(s.slice(2), 2) * (s[0] === '-' ? -1 : 1);
    if (/^-?\d+$/.test(s)) return parseInt(s, 10);
    return null;
  }

  var PSEUDO = [
    { name: 'nop', syntax: 'nop', desc: '空操作', base: 'addi', expand: function () { return [['addi', 'x0', 'x0', 0]]; } },
    { name: 'li', syntax: 'li rd, imm', desc: '装载任意 32 位常数', base: 'addi / lui', expand: function (o) {
        var v = toConst(o[1]);
        if (v !== null) {
          if (v >= -2048 && v <= 2047) return [['addi', o[0], 'x0', v]];
          var p = splitHiLo(v | 0);
          return [['lui', o[0], p[0]], ['addi', o[0], o[0], p[1]]];
        }
        return [['lui', o[0], '@hi(' + o[1] + ')'], ['addi', o[0], o[0], '@lo(' + o[1] + ')']];
      } },
    { name: 'la', syntax: 'la rd, label', desc: '取标签地址（本模拟器为平坦地址空间）', base: 'lui / addi', expand: function (o) {
        return [['lui', o[0], '@hi(' + o[1] + ')'], ['addi', o[0], o[0], '@lo(' + o[1] + ')']];
      } },
    { name: 'mv', syntax: 'mv rd, rs', desc: '寄存器搬运', base: 'addi', expand: function (o) { return [['addi', o[0], o[1], 0]]; } },
    { name: 'not', syntax: 'not rd, rs', desc: '按位取反', base: 'xori', expand: function (o) { return [['xori', o[0], o[1], -1]]; } },
    { name: 'neg', syntax: 'neg rd, rs', desc: '取负', base: 'sub', expand: function (o) { return [['sub', o[0], 'x0', o[1]]]; } },
    { name: 'seqz', syntax: 'seqz rd, rs', desc: '等于 0 则置 1', base: 'sltiu', expand: function (o) { return [['sltiu', o[0], o[1], 1]]; } },
    { name: 'snez', syntax: 'snez rd, rs', desc: '不等于 0 则置 1', base: 'sltu', expand: function (o) { return [['sltu', o[0], 'x0', o[1]]]; } },
    { name: 'sltz', syntax: 'sltz rd, rs', desc: '小于 0 则置 1', base: 'slt', expand: function (o) { return [['slt', o[0], o[1], 'x0']]; } },
    { name: 'sgtz', syntax: 'sgtz rd, rs', desc: '大于 0 则置 1', base: 'slt', expand: function (o) { return [['slt', o[0], 'x0', o[1]]]; } },
    { name: 'j', syntax: 'j label', desc: '无条件跳转', base: 'jal', expand: function (o) { return [['jal', 'x0', o[0]]]; } },
    { name: 'jal', syntax: 'jal label', desc: '调用（隐含 ra）', base: 'jal', expand: function (o) { return [['jal', 'x1', o[0]]]; } },
    { name: 'call', syntax: 'call label', desc: '调用函数', base: 'jal', expand: function (o) { return [['jal', 'x1', o[0]]]; } },
    { name: 'tail', syntax: 'tail label', desc: '尾调用', base: 'jal', expand: function (o) { return [['jal', 'x0', o[0]]]; } },
    { name: 'jr', syntax: 'jr rs', desc: '寄存器间接跳转', base: 'jalr', expand: function (o) { return [['jalr', 'x0', o[0], 0]]; } },
    { name: 'ret', syntax: 'ret', desc: '函数返回', base: 'jalr', expand: function () { return [['jalr', 'x0', 'x1', 0]]; } },
    { name: 'beqz', syntax: 'beqz rs, label', desc: '等于 0 跳转', base: 'beq', expand: function (o) { return [['beq', o[0], 'x0', o[1]]]; } },
    { name: 'bnez', syntax: 'bnez rs, label', desc: '不等于 0 跳转', base: 'bne', expand: function (o) { return [['bne', o[0], 'x0', o[1]]]; } },
    { name: 'bltz', syntax: 'bltz rs, label', desc: '小于 0 跳转', base: 'blt', expand: function (o) { return [['blt', o[0], 'x0', o[1]]]; } },
    { name: 'bgez', syntax: 'bgez rs, label', desc: '大于等于 0 跳转', base: 'bge', expand: function (o) { return [['bge', o[0], 'x0', o[1]]]; } },
    { name: 'blez', syntax: 'blez rs, label', desc: '小于等于 0 跳转', base: 'bge', expand: function (o) { return [['bge', 'x0', o[0], o[1]]]; } },
    { name: 'bgtz', syntax: 'bgtz rs, label', desc: '大于 0 跳转', base: 'blt', expand: function (o) { return [['blt', 'x0', o[0], o[1]]]; } },
    { name: 'bgt', syntax: 'bgt rs1, rs2, label', desc: '大于跳转', base: 'blt', expand: function (o) { return [['blt', o[1], o[0], o[2]]]; } },
    { name: 'ble', syntax: 'ble rs1, rs2, label', desc: '小于等于跳转', base: 'bge', expand: function (o) { return [['bge', o[1], o[0], o[2]]]; } },
    { name: 'bgtu', syntax: 'bgtu rs1, rs2, label', desc: '无符号大于跳转', base: 'bltu', expand: function (o) { return [['bltu', o[1], o[0], o[2]]]; } },
    { name: 'bleu', syntax: 'bleu rs1, rs2, label', desc: '无符号小于等于跳转', base: 'bgeu', expand: function (o) { return [['bgeu', o[1], o[0], o[2]]]; } }
  ];
  var PSEUDO_BY_NAME = {};
  PSEUDO.forEach(function (p) { PSEUDO_BY_NAME[p.name] = p; });

  RV.data = {
    REGS: REGS, REGNUM: REGNUM, FORMATS: FORMATS,
    INSTRUCTIONS: INSTRUCTIONS, BY_ID: BY_ID, GROUPS: GROUPS,
    PSEUDO: PSEUDO, PSEUDO_BY_NAME: PSEUDO_BY_NAME,
    splitHiLo: splitHiLo
  };
})();
