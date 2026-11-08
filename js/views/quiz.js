(function () {
  'use strict';
  var RV = (window.RV = window.RV || {});
  RV.views = RV.views || {};
  var D = RV.data;
  var KEY = 'rv32i.quiz';

  function saved() {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; }
  }
  function save(o) { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) { } }

  RV.views.quiz = {
    title: '章节自测',
    render: function (el, params) {
      var all = D.QUIZ;
      var sections = ['全部'].concat(all.map(function (q) { return q.section; }).filter(function (s, i, a) { return a.indexOf(s) === i; }));
      var sec = params.s || '全部';
      var list = all.map(function (q, i) { return Object.assign({ idx: i }, q); }).filter(function (q) { return sec === '全部' || q.section === sec; });
      var n = Math.min(Math.max(parseInt(params.n || '0', 10) || 0, 0), Math.max(0, list.length - 1));
      if (params.reset === '1') { save({}); RV.app.toast('成绩已清空'); }
      var score = saved();
      var q = list[n];
      if (!q) {
        el.innerHTML = '<div class="view-head"><h1>章节自测</h1></div><div class="card"><p class="lead">这个章节暂时没有题目。</p>' +
          '<button class="btn" data-act="all">查看全部题目</button></div>';
        el.querySelector('[data-act="all"]').onclick = function () { RV.app.go('quiz'); };
        return;
      }
      var answered = score[q.idx] !== undefined;

      function stat() {
        var done = Object.keys(score).length;
        var right = Object.keys(score).filter(function (k) { return score[k]; }).length;
        return { done: done, right: right, total: all.length };
      }
      var s = stat();

      el.innerHTML = '<div class="view-head"><div class="eyebrow">模块 06</div><h1>章节自测</h1>' +
        '<p class="lead">覆盖 ISA 基础、指令含义、编码、编程与硬件。每题即时判分并给出原因，成绩保存在本地。</p></div>' +
        '<div class="grid g3" style="margin-bottom:14px">' +
          '<div class="metric"><div class="lbl">已作答</div><div class="val">' + s.done + ' / ' + s.total + '</div></div>' +
          '<div class="metric"><div class="lbl">答对</div><div class="val">' + s.right + '</div></div>' +
          '<div class="metric"><div class="lbl">正确率</div><div class="val">' + (s.done ? Math.round(s.right / s.done * 100) : 0) + '%</div></div>' +
        '</div>' +
        '<div class="pill-tabs" id="sectabs">' + sections.map(function (x) {
          return '<button class="btn sm ' + (sec === x ? 'active' : '') + '" data-sec="' + x + '">' + x + '</button>';
        }).join('') + '<span class="spacer"></span><button class="btn sm" data-act="reset">清空成绩</button></div>' +
        '<div class="grid" style="grid-template-columns:minmax(0,1.5fr) minmax(0,1fr)">' +
          '<div class="card"><div class="card-title"><span class="tag blue">' + q.section + '</span>' +
            '<span style="font-size:12px;color:var(--muted)">第 ' + (n + 1) + ' / ' + list.length + ' 题</span></div>' +
            '<h2 style="font-size:16px;margin-bottom:14px">' + RV.ui.h(q.q) + '</h2>' +
            '<div id="opts">' + q.opts.map(function (o, i) {
              var cls = '';
              if (answered) {
                if (i === q.a) cls = 'correct';
                else if (i === score[q.idx]) cls = 'wrong';
              }
              return '<button class="quiz-opt ' + cls + '" data-opt="' + i + '" ' + (answered ? 'disabled' : '') + '>' +
                String.fromCharCode(65 + i) + '. ' + RV.ui.h(o) + '</button>';
            }).join('') + '</div>' +
            '<div id="explain">' + (answered ? '<div class="note ' + (score[q.idx] === q.a ? 'ok' : 'warn') + '"><b>' +
              (score[q.idx] === q.a ? '回答正确' : '回答错误') + '</b>　' + RV.ui.h(q.why) + '</div>' : '') + '</div>' +
            '<div class="row" style="margin-top:14px;border-top:1px solid var(--border);padding-top:14px">' +
              '<button class="btn" data-act="prev"' + (n === 0 ? ' disabled' : '') + '>← 上一题</button>' +
              '<button class="btn primary" data-act="next"' + (n >= list.length - 1 ? ' disabled' : '') + '>下一题 →</button>' +
              '<span class="spacer"></span><span style="font-size:12px;color:var(--muted)">' +
              (answered ? (score[q.idx] === q.a ? '✓ 已答对' : '✗ 答错，可清空成绩重做') : '选择一个答案') + '</span></div></div>' +
          '<div><div class="card" style="margin-bottom:14px"><h2>题目导航</h2><div class="row tight" id="navgrid">' +
            list.map(function (x, i) {
              var done = score[x.idx] !== undefined;
              return '<button class="btn sm ' + (i === n ? 'active' : done ? (score[x.idx] ? '' : '') : '') + '" data-nav="' + i + '" ' +
                'style="min-width:34px;' + (done ? 'border-color:' + (score[x.idx] ? '#9fe1cb;background:var(--green-soft);color:var(--green)' : '#f7c1c1;background:var(--red-soft);color:var(--red)') : '') + '">' + (i + 1) + '</button>';
            }).join('') + '</div>' +
            '<div class="note" style="margin-top:10px;font-size:12px">绿色 = 答对，红色 = 答错；点击题号直接跳转。</div></div>' +
            '<div class="card"><h2>推荐复习路径</h2><ul class="tight" style="font-size:13px;color:var(--muted)">' +
              '<li>编码题做错 → <a href="#/encoder">编码实验室</a> 拆一次指令字</li>' +
              '<li>语义题做错 → <a href="#/dictionary">指令字典</a> 看 RTL 与易错点</li>' +
              '<li>硬件题做错 → <a href="#/hardware">硬件实现台</a> 看信号真值</li>' +
              '<li>编程题做错 → <a href="#/simulator">汇编演练场</a> 单步跑一遍</li>' +
            '</ul></div></div></div>';

      el.querySelectorAll('#opts [data-opt]').forEach(function (b) {
        b.onclick = function () {
          if (score[q.idx] !== undefined) return;
          var pick = +b.dataset.opt;
          score[q.idx] = pick;
          save(score);
          RV.app.go('quiz?s=' + encodeURIComponent(sec) + '&n=' + n);
        };
      });
      el.querySelectorAll('[data-sec]').forEach(function (b) {
        b.onclick = function () { RV.app.go('quiz?s=' + encodeURIComponent(b.dataset.sec)); };
      });
      el.querySelectorAll('[data-nav]').forEach(function (b) {
        b.onclick = function () { RV.app.go('quiz?s=' + encodeURIComponent(sec) + '&n=' + b.dataset.nav); };
      });
      el.addEventListener('click', function (ev) {
        var t = ev.target.closest('[data-act]');
        if (!t) return;
        if (t.dataset.act === 'next') RV.app.go('quiz?s=' + encodeURIComponent(sec) + '&n=' + (n + 1));
        else if (t.dataset.act === 'prev') RV.app.go('quiz?s=' + encodeURIComponent(sec) + '&n=' + (n - 1));
        else if (t.dataset.act === 'reset') RV.app.go('quiz?s=' + encodeURIComponent(sec) + '&reset=1');
      });
    }
  };
})();
