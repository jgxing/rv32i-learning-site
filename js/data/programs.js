(function () {
  'use strict';
  var RV = (window.RV = window.RV || {});

  var OUT = '    mv   a1, %s\n    li   a0, 1\n    ecall\n    li   a0, 10\n    ecall\n';
  function withOut(body, reg) { return body + OUT.replace('%s', reg); }

  var PROGRAMS = [
    {
      id: 'sum', title: '1 + 2 + … + 5', desc: '循环、比较与分支的最小完整程序，预期输出 15',
      c: 'int sum = 0;\nfor (int i = 1; i < 6; i++) sum += i;\nprintf("%d", sum);',
      hints: ['li 是伪指令：小常数展开为 addi，大常数展开为 lui + addi', 'blt 的偏移量由汇编器根据 label 自动计算，单位是字节'],
      expect: 15,
      code: withOut(
        '    li   x5, 0        # sum = 0\n' +
        '    li   x6, 1        # i = 1\n' +
        '    li   x7, 6        # 上界\n' +
        'loop:\n' +
        '    add  x5, x5, x6   # sum += i\n' +
        '    addi x6, x6, 1\n' +
        '    blt  x6, x7, loop\n', 'x5')
    },
    {
      id: 'fib', title: '斐波那契前 10 项之和', desc: '多寄存器轮换 + bnez 伪指令，预期输出 143',
      c: 'int a=0, b=1, s=0;\nfor (int i=0; i<10; i++) { s+=b; int t=a+b; a=b; b=t; }\nprintf("%d", s);',
      hints: ['bnez rs, label 展开为 bne rs, x0, label', 'mv rd, rs 展开为 addi rd, rs, 0'],
      expect: 143,
      code: withOut(
        '    li   x5, 0        # a\n' +
        '    li   x6, 1        # b\n' +
        '    li   x7, 0        # sum\n' +
        '    li   x8, 10       # n\n' +
        'loop:\n' +
        '    add  x7, x7, x6\n' +
        '    add  x9, x5, x6\n' +
        '    mv   x5, x6\n' +
        '    mv   x6, x9\n' +
        '    addi x8, x8, -1\n' +
        '    bnez x8, loop\n', 'x7')
    },
    {
      id: 'max', title: '数组最大值', desc: '使用 .data / .word、lw 与 la 伪指令，预期输出 9',
      c: 'int a[] = {3,9,2,7,5}, max = 0;\nfor (int i=0; i<5; i++) if (a[i] > max) max = a[i];\nprintf("%d", max);',
      hints: ['la 在本模拟器的平坦地址空间中展开为 lui + addi，把标签地址装进寄存器', '数组下标 i 对应的字节偏移是 4*i，所以每次 addi 基址 +4'],
      expect: 9,
      code: '.data\narr:  .word 3, 9, 2, 7, 5\n.text\n' + withOut(
        '    la   x5, arr      # 基址\n' +
        '    li   x6, 5        # 长度\n' +
        '    li   x7, 0        # max\n' +
        '    li   x8, 0        # i\n' +
        'loop:\n' +
        '    lw   x9, 0(x5)\n' +
        '    bge  x7, x9, skip\n' +
        '    mv   x7, x9\n' +
        'skip:\n' +
        '    addi x5, x5, 4\n' +
        '    addi x8, x8, 1\n' +
        '    blt  x8, x6, loop\n', 'x7')
    },
    {
      id: 'bits', title: '位运算与移位', desc: '演示 slli / ori / andi / srli，预期输出 42',
      c: 'int x = 0x2a;\nx = (x << 4) | 0xf;\nx = x & ~0x3;\nx = x >> 4;\nprintf("%d", x);',
      hints: ['I 型移位指令的立即数字段其实只有低 5 位有效（shamt）', 'andi 的 12 位立即数会符号扩展，负数掩码会置位高位'],
      expect: 42,
      code: withOut(
        '    li   x5, 0x2a     # 42\n' +
        '    slli x6, x5, 4\n' +
        '    ori  x6, x6, 0xf\n' +
        '    andi x6, x6, -4   # 清最低两位\n' +
        '    srli x7, x6, 4\n', 'x7')
    },
    {
      id: 'recurse', title: '递归与栈帧', desc: '函数 sumrec(n) = 1 + 2 + … + n，演示 ra 保存与栈帧，预期输出 15',
      c: 'int sumrec(int n) { return n < 2 ? 1 : n + sumrec(n-1); }\nprintf("%d", sumrec(5));',
      hints: ['jal ra, label 会把返回地址 PC+4 写进 ra(x1)', '递归调用前必须把 ra 和参数压栈，返回时恢复；ret 展开为 jalr x0, x1, 0', '本例 sp 初始为 0xe000，向低地址增长'],
      expect: 15,
      code: withOut(
        '    li   a0, 5\n' +
        '    jal  ra, sumrec\n' +
        '    j    finish\n' +
        'sumrec:\n' +
        '    addi sp, sp, -8\n' +
        '    sw   ra, 4(sp)\n' +
        '    sw   a0, 0(sp)\n' +
        '    slti t0, a0, 2\n' +
        '    beqz t0, rec\n' +
        '    li   a0, 1\n' +
        '    j    done\n' +
        'rec:\n' +
        '    addi a0, a0, -1\n' +
        '    jal  ra, sumrec\n' +
        '    lw   t1, 0(sp)\n' +
        '    add  a0, a0, t1\n' +
        'done:\n' +
        '    lw   ra, 4(sp)\n' +
        '    addi sp, sp, 8\n' +
        '    ret\n' +
        'finish:\n', 'a0')
    }
  ];

  RV.data = RV.data || {};
  RV.data.PROGRAMS = PROGRAMS;
})();
