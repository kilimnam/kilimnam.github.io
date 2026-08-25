/* ============================================================
   공통 스크립트 — 테마 전환, 목록 렌더링과 검색·필터
   논문(J) · 저역서(B) · 학술발표(C) · 연구사업(P) 네 목록을 다룹니다.
   ============================================================ */
(function () {
  'use strict';

  // 저자 목록에서 강조할 이름. 원본 이력서에 표기가 제각각이라 변형을 모두 적어 둔다.
  var ME = ['남길임', 'Kilim Nam', 'N. Kilim', 'Nam K.', 'Nam', 'Kilim'];

  /* ---------- 유틸 ---------- */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  // 검색어를 <mark>로 감싼다. 입력은 이미 이스케이프된 HTML.
  function hit(html, q) {
    if (!q) return html;
    return html.replace(new RegExp(escRe(q), 'gi'), function (m) {
      return '<mark class="hit">' + m + '</mark>';
    });
  }

  // 저자 목록을 쉼표로 나눠, 토큰 하나가 통째로 본인 이름일 때만 강조한다.
  // (부분 일치로 'Namgung'의 'Nam'까지 잡히는 일을 막는다)
  function norm(t) { return t.replace(/[.\s]/g, '').toLowerCase(); }
  var ME_SET = {};
  ME.forEach(function (m) { ME_SET[norm(m)] = true; });

  function authors(str, q) {
    var wasMe = false;
    return String(str || '').split(/\s*,\s*/).map(function (tok) {
      var n = norm(tok);
      // 앞 토큰이 본인이면 뒤따르는 이니셜("Kilim, N.")도 같은 사람으로 본다
      var isMe = ME_SET[n] === true || (wasMe && /^[a-z]$/.test(n));
      wasMe = isMe;
      var html = esc(tok);
      return isMe ? '<mark class="me">' + html + '</mark>' : hit(html, q);
    }).join(', ');
  }

  function debounce(fn, ms) {
    var t;
    return function () {
      var a = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, a); }, ms);
    };
  }

  // "공동(교신)" → "교신저자" 처럼 읽기 좋게.
  // 저역서에서는 '책임'이 대표저자를 뜻하므로 kind로 구분한다.
  function roleLabel(r, kind) {
    if (!r) return '';
    if (r === '단독') return '단독저자';
    if (r === '책임') return kind === 'book' ? '대표저자' : '연구책임자';
    if (r === '연구책임자') return '연구책임자';
    var m = /^공동\(([^)]*)\)$/.exec(r);
    if (m) {
      if (m[1] === '교신') return '교신저자';
      if (m[1] === '제1') return '제1저자';
      return '공동연구원';
    }
    if (r === '공동') return '공동저자';
    return r;
  }

  /* ---------- 한국어 / English 전환 ----------
     소개 페이지에만 버튼이 있다. 기본은 영어이고, 고른 언어는 브라우저에 기억된다. */
  function initLang() {
    var btn = document.querySelector('.lang-btn');
    if (!btn) return;

    function paint(lang) {
      var root = document.documentElement;
      root.setAttribute('data-lang', lang);
      root.lang = lang;
      btn.textContent = lang === 'en' ? '한국어' : 'English';
      btn.setAttribute('aria-label', lang === 'en' ? '한국어로 보기' : 'View in English');
    }

    var cur = 'en';
    try { cur = localStorage.getItem('lang') || 'en'; } catch (e) {}
    paint(cur);

    btn.addEventListener('click', function () {
      cur = (document.documentElement.getAttribute('data-lang') === 'en') ? 'ko' : 'en';
      paint(cur);
      try { localStorage.setItem('lang', cur); } catch (e) {}
    });
  }

  // 괄호 앞뒤를 띄운다. "Linguistics(3rd edition)" → "Linguistics (3rd edition)"
  // 맨 앞이 "(재)", "(주)"처럼 괄호로 시작하는 경우는 앞쪽에 붙일 글자가 없어 그대로다.
  function sp(s) {
    return String(s == null ? '' : s)
      .replace(/(\S)\(/g, '$1 (')
      .replace(/\)(\S)/g, ') $1')
      .replace(/[ ]{2,}/g, ' ')
      .trim();
  }

  /* ---------- 테마 전환 ---------- */
  function initTheme() {
    var btn = document.querySelector('.theme-btn');
    if (!btn) return;
    btn.addEventListener('click', function () {
      // 기본은 흰 바탕이므로, 지정된 값이 없으면 light으로 본다
      var cur = document.documentElement.getAttribute('data-theme') || 'light';
      var next = cur === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem('theme', next); } catch (e) {}
    });
  }

  /* ---------- 항목 렌더링 ---------- */

  // 권(호), 쪽수처럼 있을 때만 붙는 조각들을 이어 붙인다
  function join(parts, sep) {
    return parts.filter(function (p) { return p; }).join(sep || ' · ');
  }

  // 목록 항목 오른쪽에 붙는 꼬리표: 갈래(J/C)와 국내·국외
  function tags(it) {
    var t = '';
    if (it._t === 'J') t += '<span class="tag tag--j" title="학술지 논문">J</span>';
    if (it._t === 'C') t += '<span class="tag tag--c" title="학술대회 발표">C</span>';
    if (it._t === 'B') t += '<span class="tag tag--b" title="저역서">B</span>';
    t += it.intl ? '<span class="tag tag--intl">국외</span>'
                 : '<span class="tag tag--dom">국내</span>';
    return t;
  }

  function pubItem(p, q) {
    var volno = '';
    if (p.vol && p.no) volno = p.vol + ' (' + p.no + ')';
    else volno = p.vol || p.no || '';
    var meta = join([
      '<span class="pub__authors">' + authors(p.authors, q) + '</span>',
      p.venue ? '<span class="venue">' + hit(esc(sp(p.venue)), q) + '</span>' +
                (volno ? ' ' + esc(volno) : '') + (p.pages ? ', ' + esc(p.pages) : '') : '',
      esc(p.ym || p.year || '')
    ]);
    return '<li class="pub">' +
      '<div class="pub__title">' + hit(esc(sp(p.title)), q) +
        tags(p) +
      '</div>' +
      '<div class="pub__meta">' + meta + '</div>' +
      (p.titleAlt ? '<div class="pub__alt">' + hit(esc(sp(p.titleAlt)), q) + '</div>' : '') +
      '</li>';
  }

  function bookItem(b, q) {
    var meta = join([
      // 저자가 적힌 항목만 저자를 보여 준다
      b.authors ? '<span class="pub__authors">' + authors(b.authors, q) + '</span>' : '',
      // 단행본 속 한 장(章)이면 실린 책 이름을 밝힌다
      b.container ? 'In <span class="venue">' + hit(esc(sp(b.container)), q) + '</span>' : '',
      b.publisher ? hit(esc(sp(b.publisher)), q) : '',
      // '저서'는 거의 모든 항목에 붙어 있어 굳이 보이지 않는다
      b.kind && b.kind !== '저서' ? esc(b.kind) : '',
      esc(b.ym || ''),
      roleLabel(b.role, 'book')
    ]);
    return '<li class="pub">' +
      '<div class="pub__title">' + hit(esc(sp(b.title)), q) +
        tags(b) +
      '</div>' +
      '<div class="pub__meta">' + meta + '</div>' +
      (b.titleAlt ? '<div class="pub__alt">' + hit(esc(sp(b.titleAlt)), q) + '</div>' : '') +
      '</li>';
  }

  function confItem(c, q) {
    var meta = join([
      c.conference ? '<span class="venue">' + hit(esc(sp(c.conference)), q) + '</span>' : '',
      c.org ? hit(esc(sp(c.org)), q) : '',
      esc(c.country || ''),
      esc(c.dates && c.dates !== '-' ? c.dates : (c.year || ''))
    ]);
    return '<li class="pub">' +
      '<div class="pub__title">' + hit(esc(sp(c.title || c.conference)), q) +
        tags(c) +
      '</div>' +
      '<div class="pub__meta">' + meta + '</div>' +
      (c.authors ? '<div class="pub__alt">' + authors(c.authors, q) + '</div>' : '') +
      '</li>';
  }

  function projItem(p, q) {
    return '<li class="proj">' +
      '<div class="proj__period">' + esc(p.period) + '</div>' +
      '<div>' +
        '<div class="proj__name">' + hit(esc(sp(p.name)), q) +
          (isOngoing(p) ? '<span class="badge-now">진행 중</span>' : '') +
        '</div>' +
        '<div class="proj__funder">' + hit(esc(p.funder), q) + '</div>' +
      '</div>' +
      '</li>';
  }

  function isOngoing(p) {
    var m = /–\s*(\d{4})\.(\d{2})/.exec(p.period || '');
    if (!m) return false;
    var now = new Date();
    var end = +m[1] * 12 + +m[2];
    return end >= now.getFullYear() * 12 + (now.getMonth() + 1);
  }

  // 연도별로 묶어 렌더링
  function renderByYear(list, q, render, unit) {
    if (!list.length) return '<p class="empty">검색 결과가 없습니다.</p>';
    var html = '', cur = null, buf = [];
    function flush() {
      if (cur === null) return;
      html += '<h3 class="pub-year">' + (cur || '연도 미상') +
              '<span class="n">' + buf.length + unit + '</span></h3>' +
              '<ul class="pub-list">' + buf.join('') + '</ul>';
      buf = [];
    }
    list.forEach(function (it) {
      if (it.year !== cur) { flush(); cur = it.year; }
      buf.push(render(it, q));
    });
    flush();
    return html;
  }

  function renderProjects(list, q) {
    if (!list.length) return '<p class="empty">검색 결과가 없습니다.</p>';
    return '<ul class="proj-list">' +
      list.map(function (p) { return projItem(p, q); }).join('') + '</ul>';
  }

  /* ---------- 목록 페이지 공통 ----------
     설정 하나로 논문·저역서·학술발표 페이지를 모두 처리합니다. */
  function initListPage(cfg) {
    var listBox = document.getElementById(cfg.listId);
    if (!listBox) return;

    var data = (cfg.data() || []).slice().sort(function (a, b) {
      return (b.year || 0) - (a.year || 0);
    });
    var input = document.getElementById('q');
    var yearSel = document.getElementById('year');
    var kindSel = document.getElementById('kind');
    var typeSel = document.getElementById('type');
    var cnt = document.getElementById('count');
    var reset = document.getElementById('reset');

    // 연도가 없는 항목(원본에 개최일자가 비어 있는 경우)은 집계에서 뺀다
    var byYear = {};
    data.forEach(function (p) {
      if (p.year) byYear[p.year] = (byYear[p.year] || 0) + 1;
    });
    var years = Object.keys(byYear).map(Number).sort(function (a, b) { return a - b; });
    var counts = years.map(function (y) { return byYear[y]; });
    var undated = data.filter(function (p) { return !p.year; }).length;

    if (yearSel) {
      yearSel.innerHTML = '<option value="">전체 연도</option>' +
        years.slice().reverse().map(function (y) {
          return '<option value="' + y + '">' + y + ' (' + byYear[y] + ')</option>';
        }).join('') +
        (undated ? '<option value="none">연도 미상 (' + undated + ')</option>' : '');
    }

    var state = { q: '', year: '', kind: '', type: '' };

    function apply() {
      var q = state.q.trim();
      var out = data.filter(function (p) {
        if (state.year === 'none') { if (p.year) return false; }
        else if (state.year && String(p.year) !== state.year) return false;
        if (state.kind === 'intl' && !p.intl) return false;
        if (state.kind === 'dom' && p.intl) return false;
        if (state.type && p._t !== state.type) return false;
        if (!q) return true;
        return cfg.haystack(p).toLowerCase().indexOf(q.toLowerCase()) !== -1;
      });
      listBox.innerHTML = renderByYear(out, q, cfg.render, cfg.unit);
      cnt.innerHTML = '<b>' + out.length + '</b>' + cfg.unit +
        (out.length !== data.length ? ' <span style="opacity:.6">/ 전체 ' + data.length + '</span>' : '');
      reset.hidden = !(state.q || state.year || state.kind || state.type);
    }

    function pickYear(y) {
      state.year = (state.year === String(y)) ? '' : String(y);
      if (yearSel) yearSel.value = state.year;
      apply();
    }

    input.addEventListener('input', debounce(function () { state.q = input.value; apply(); }, 120));
    if (yearSel) yearSel.addEventListener('change', function () { state.year = yearSel.value; apply(); });
    if (kindSel) kindSel.addEventListener('change', function () { state.kind = kindSel.value; apply(); });
    if (typeSel) typeSel.addEventListener('change', function () { state.type = typeSel.value; apply(); });
    reset.addEventListener('click', function () {
      state = { q: '', year: '', kind: '', type: '' };
      input.value = '';
      if (yearSel) yearSel.value = '';
      if (kindSel) kindSel.value = '';
      if (typeSel) typeSel.value = '';
      apply(); input.focus();
    });

    apply();
  }

  /* ---------- 연구사업 페이지 ---------- */
  function funderList(p) {
    return String(p.funder || '').split(/\s*,\s*/).filter(Boolean);
  }

  function initProjects() {
    var listBox = document.getElementById('proj-list');
    if (!listBox) return;
    var data = (window.PROJECTS || []).slice();
    var input = document.getElementById('q');
    var sel = document.getElementById('funder');
    var cnt = document.getElementById('count');
    var reset = document.getElementById('reset');

    var byYear = {};
    data.forEach(function (p) { byYear[p.startYear] = (byYear[p.startYear] || 0) + 1; });
    var years = Object.keys(byYear).map(Number).sort(function (a, b) { return a - b; });
    var counts = years.map(function (y) { return byYear[y]; });

    // "문화체육관광부, 국립국어원"처럼 공동 발주는 기관별로 나눠 센다
    var byFunder = {};
    data.forEach(function (p) {
      funderList(p).forEach(function (f) { byFunder[f] = (byFunder[f] || 0) + 1; });
    });
    var funders = Object.keys(byFunder).sort(function (a, b) {
      return byFunder[b] - byFunder[a] || a.localeCompare(b, 'ko');
    });
    sel.innerHTML = '<option value="">전체 지원기관</option>' +
      funders.map(function (f) {
        return '<option value="' + esc(f) + '">' + esc(f) + ' (' + byFunder[f] + ')</option>';
      }).join('');

    var state = { q: '', funder: '', year: '' };

    function apply() {
      var q = state.q.trim();
      var out = data.filter(function (p) {
        if (state.funder && funderList(p).indexOf(state.funder) === -1) return false;
        if (state.year && String(p.startYear) !== state.year) return false;
        if (!q) return true;
        return (p.name + ' ' + p.funder + ' ' + p.period)
          .toLowerCase().indexOf(q.toLowerCase()) !== -1;
      });
      listBox.innerHTML = renderProjects(out, q);
      cnt.innerHTML = '<b>' + out.length + '</b>건' +
        (out.length !== data.length ? ' <span style="opacity:.6">/ 전체 ' + data.length + '</span>' : '');
      reset.hidden = !(state.q || state.funder || state.year);
    }

    function pickYear(y) {
      state.year = (state.year === String(y)) ? '' : String(y);
      apply();
    }

    input.addEventListener('input', debounce(function () { state.q = input.value; apply(); }, 120));
    sel.addEventListener('change', function () { state.funder = sel.value; apply(); });
    reset.addEventListener('click', function () {
      state = { q: '', funder: '', year: '' };
      input.value = ''; sel.value = '';
      apply(); input.focus();
    });

    apply();
  }

  /* ---------- 시작 ---------- */
  document.addEventListener('DOMContentLoaded', function () {
    initTheme();
    initLang();

    // 논문(J)과 학술발표(C)를 한 목록으로 합쳐 보여 준다
    initListPage({
      listId: 'pub-list', unit: '건',
      data: function () {
        function tag(list, t) {
          return (list || []).map(function (o) {
            var c = {}; for (var k in o) c[k] = o[k];
            c._t = t; return c;
          });
        }
        return tag(window.PUBLICATIONS, 'J')
          .concat(tag(window.CONFERENCES, 'C'))
          .concat(tag(window.BOOKS, 'B'));
      },
      render: function (it, q) {
        if (it._t === 'C') return confItem(it, q);
        if (it._t === 'B') return bookItem(it, q);
        return pubItem(it, q);
      },
      haystack: function (p) {
        // 갈래마다 채워지는 항목이 달라, 빈 값은 걸러 내고 이어 붙인다
        return [p.title, p.titleAlt, p.authors, p.venue, p.publisher, p.ym,
                p.conference, p.org, p.country, p.dates]
          .filter(Boolean).join(' ');
      }
    });

    initProjects();
  });
})();
