// 核心引擎自检：node tools/selftest.js
// 用 vm 把浏览器端的非模块脚本载入同一个上下文，验证编解码、汇编与模拟。
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const root = path.resolve(__dirname, '..');
const files = [
  'js/data/instructions.js', 'js/data/programs.js', 'js/data/quiz.js',
  'js/core/encoder.js', 'js/core/assembler.js', 'js/core/simulator.js', 'js/core/datapath.js'
];
const ctx = { window: {}, console: console };
vm.createContext(ctx);
files.forEach(f => vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f }));
const RV = ctx.window.RV;
const E = RV.encoder;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '  ' + extra : '')); }
}

console.log('RV32I 指令条数:', RV.data.INSTRUCTIONS.length);
ok('指令数为 40', RV.data.INSTRUCTIONS.length === 40, String(RV.data.INSTRUCTIONS.length));

// 1. 每条指令：解析样例 -> 编码 -> 译码 -> 再编码，机器码应一致
console.log('\n[1] 40 条指令 汇编 -> 机器码 -> 反汇编 往返');
RV.data.INSTRUCTIONS.forEach(inst => {
  const p = E.parseAsm(inst.example);
  if (!p || !p.inst) { ok(inst.name + ' 样例可解析', false, inst.example); return; }
  const ops = {};
  ['rd', 'rs1', 'rs2'].forEach(k => { if (p.ops[k] !== undefined) ops[k] = E.regNum(p.ops[k]); });
  if (p.ops.imm !== undefined) ops.imm = E.num(p.ops.imm);
  let w;
  try { w = E.encode(inst.name, ops); } catch (e) { ok(inst.name + ' 可编码', false, e.message); return; }
  const d = E.decode(w);
  ok(inst.name + ' 可译码', d.valid && d.name === inst.name, d.hex + ' -> ' + (d.valid ? d.name : d.reason));
  const w2 = E.encode(d.name, d.ops);
  ok(inst.name + ' 往返一致', w2 === w, E.hex(w) + ' vs ' + E.hex(w2));
});

// 2. 已知机器码
console.log('\n[2] 标准机器码校验');
ok('addi x5, x0, 7 = 0x00700293', E.encode('addi', { rd: 5, rs1: 0, imm: 7 }) === 0x00700293,
  E.hex(E.encode('addi', { rd: 5, rs1: 0, imm: 7 })));
ok('add x5, x6, x7 funct7=0000000', E.encode('add', { rd: 5, rs1: 6, rs2: 7 }) === 0x007302b3);
ok('sub 与 add 仅 funct7 不同', (E.encode('sub', { rd: 5, rs1: 6, rs2: 7 }) ^ E.encode('add', { rd: 5, rs1: 6, rs2: 7 })) === 0x40000000);
ok('lui x5, 0x12345 = 0x123452b7', E.encode('lui', { rd: 5, imm: 0x12345 }) === 0x123452b7,
  E.hex(E.encode('lui', { rd: 5, imm: 0x12345 })));

// 3. 立即数重排往返
console.log('\n[3] I / S / B / U / J 立即数重排');
[['addi', { rd: 5, rs1: 6, imm: -1 }], ['addi', { rd: 5, rs1: 6, imm: -2048 }],
 ['sw', { rs2: 7, rs1: 6, imm: -4 }], ['sw', { rs2: 7, rs1: 6, imm: 2047 }],
 ['beq', { rs1: 5, rs2: 6, imm: -8 }], ['beq', { rs1: 5, rs2: 6, imm: 4094 }],
 ['jal', { rd: 1, imm: -20 }], ['jal', { rd: 1, imm: 1048574 }]
].forEach(t => {
  const w = E.encode(t[0], t[1]);
  const d = E.decode(w);
  ok(t[0] + ' imm=' + t[1].imm + ' 往返', d.valid && d.imm === t[1].imm, d.valid ? String(d.imm) : d.reason);
});

// 4. li 的 %hi/%lo 修正
console.log('\n[4] 伪指令 li 的 %hi/%lo 修正');
{
  const a = RV.assembler.assemble('li x5, 0x12345fff\necall\n');
  ok('li 汇编通过', a.ok, JSON.stringify(a.errors));
  const sim = RV.simulator.create(a);
  sim.step(); sim.step();
  ok('li x5, 0x12345fff 得到正确常数', sim.state.regs[5] === 0x12345fff, E.hex(sim.state.regs[5]));
}

// 5. 全部示例程序执行
console.log('\n[5] 示例程序端到端执行');
RV.data.PROGRAMS.forEach(p => {
  const a = RV.assembler.assemble(p.code);
  ok(p.title + ' 汇编通过', a.ok, JSON.stringify(a.errors));
  if (!a.ok) return;
  const sim = RV.simulator.create(a);
  sim.run(5000);
  const out = sim.state.output;
  ok(p.title + ' 输出 = ' + p.expect, out.length > 0 && out[out.length - 1] === p.expect,
    'out=' + JSON.stringify(out) + ' halted=' + sim.state.halted + ' cycles=' + sim.state.cycle + ' pc=' + E.hex(sim.state.pc));
  ok(p.title + ' 正常停机', sim.state.halted, 'cycles=' + sim.state.cycle);
});

// 6. 回退
console.log('\n[6] 单步与回退');
{
  const a = RV.assembler.assemble('addi x5, x0, 7\naddi x5, x5, 1\necall\n');
  const sim = RV.simulator.create(a);
  sim.step();
  const v1 = sim.state.regs[5];
  sim.step();
  const v2 = sim.state.regs[5];
  sim.back();
  ok('回退恢复寄存器', sim.state.regs[5] === v1 && v2 === v1 + 1, v1 + ' / ' + v2 + ' / ' + sim.state.regs[5]);
  ok('回退恢复 PC', sim.state.pc === 4, String(sim.state.pc));
}

// 7. 流水线
console.log('\n[7] 流水线时空图');
{
  const a = RV.datapath.pipeline(RV.datapath.DEMO, { forwarding: true });
  const b = RV.datapath.pipeline(RV.datapath.DEMO, { forwarding: false });
  ok('有转发时总周期更短', a.totalCycles < b.totalCycles, a.totalCycles + ' vs ' + b.totalCycles);
  ok('load-use 至少 1 个气泡', a.rows[3].stall >= 1, String(a.rows[3].stall));
}

console.log('\n通过 ' + pass + ' 项，失败 ' + fail + ' 项');
process.exit(fail ? 1 : 0);
