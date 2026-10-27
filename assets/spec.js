/* 프로젝트별 명세서 공용 스크립트: 목차·검색, 링크·코드 복사, 진행률, 인쇄.
   목차는 .spec-section의 h2와 .card[id]의 h3로 만들고, 섹션 색은 .tone-* 클래스에서 가져온다. */
(() => {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = window.matchMedia('(pointer: fine)');
  const scrollMode = () => (reduceMotion.matches ? 'auto' : 'smooth');

  const topbar = document.getElementById('topbar');
  const progressBar = document.getElementById('progressBar');
  const toTop = document.getElementById('toTop');
  const toast = document.getElementById('toast');
  const toc = document.getElementById('toc');
  const tocBtn = document.getElementById('tocBtn');
  const tocNav = document.getElementById('tocNav');
  const tocSearch = document.getElementById('tocSearch');
  const tocCount = document.getElementById('tocCount');
  const tocEmpty = document.getElementById('tocEmpty');
  const tabs = Array.from(document.querySelectorAll('.topbar-tabs .tab'));
  const sections = Array.from(document.querySelectorAll('.spec-section'));

  /* ── SVG 아이콘 (innerHTML 없이 생성) ── */
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const ICONS = {
    link: [
      ['path', { d: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71' }],
      ['path', { d: 'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71' }],
    ],
    copy: [
      ['rect', { x: 9, y: 9, width: 13, height: 13, rx: 2 }],
      ['path', { d: 'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1' }],
    ],
    check: [['polyline', { points: '20 6 9 17 4 12' }]],
  };
  function icon(name) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'ico');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    ICONS[name].forEach(([tag, attrs]) => {
      const el = document.createElementNS(SVG_NS, tag);
      Object.entries(attrs).forEach(([key, value]) => el.setAttribute(key, value));
      svg.appendChild(el);
    });
    return svg;
  }

  /* ── 토스트 ── */
  let toastTimer = 0;
  function showToast(message) {
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
  }

  /* ── 클립보드 복사 (file:// 등 비보안 환경 폴백 포함) ── */
  async function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (_) { /* 아래 폴백 사용 */ }
    }
    const previousFocus = document.activeElement;
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (_) { ok = false; }
    area.remove();
    if (previousFocus && previousFocus.focus) previousFocus.focus({ preventScroll: true });
    return ok;
  }

  /* ── 페이지 내 이동 ── */
  function flash(card) {
    card.classList.remove('is-target');
    void card.offsetWidth; // 애니메이션 재시작
    card.classList.add('is-target');
  }
  document.addEventListener('animationend', (e) => {
    if (e.animationName === 'targetFlash') e.target.classList.remove('is-target');
  });

  function focusTarget(target) {
    const el = target.matches('.card, .spec-section, .landing')
      ? target.querySelector('h1, h2, h3')
      : target;
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
    el.focus({ preventScroll: true });
  }

  function goTo(id) {
    const target = document.getElementById(id);
    if (!target) return;
    if (location.hash !== '#' + id) history.pushState(null, '', '#' + id);
    target.scrollIntoView({ behavior: scrollMode(), block: 'start' });
    focusTarget(target);
    if (target.classList.contains('card')) flash(target);
  }

  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const link = e.target.closest('a[href^="#"]');
    if (!link) return;
    const id = decodeURIComponent(link.getAttribute('href').slice(1));
    if (!id || !document.getElementById(id)) return;
    e.preventDefault();
    if (toc.open) toc.close();
    goTo(id);
  });

  /* ── 목차 생성 ── */
  const normalize = (s) => s.replace(/\s+/g, ' ').trim();
  // textContent는 인접 블록의 글자를 붙여 버리므로 텍스트 노드 사이에 공백을 넣어 합침
  const textOf = (el) => {
    const parts = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) parts.push(walker.currentNode.nodeValue);
    return normalize(parts.join(' '));
  };
  const toneOf = (el) => Array.from(el.classList).find((c) => c.startsWith('tone-')) || '';
  const tocItems = [];
  const tocGroups = [];

  sections.forEach((section) => {
    const group = document.createElement('div');
    group.className = ('toc-group ' + toneOf(section)).trim();

    const groupTitle = document.createElement('a');
    groupTitle.className = 'toc-group-title';
    groupTitle.href = '#' + section.id;
    groupTitle.textContent = section.querySelector('h2').textContent.trim();

    const list = document.createElement('ul');
    list.className = 'toc-list';
    const items = [];

    section.querySelectorAll('.card[id]').forEach((card) => {
      const title = normalize(card.querySelector(':scope > h3').textContent);
      const text = textOf(card);
      const li = document.createElement('li');
      const link = document.createElement('a');
      link.className = 'toc-link';
      link.href = '#' + card.id;
      const label = document.createElement('span');
      label.className = 'toc-label';
      label.textContent = title;
      const snippet = document.createElement('span');
      snippet.className = 'toc-snippet';
      snippet.hidden = true;
      link.append(label, snippet);
      li.appendChild(link);
      list.appendChild(li);
      const item = { card, li, link, label, snippet, title, text, lower: text.toLowerCase() };
      items.push(item);
      tocItems.push(item);
    });

    group.append(groupTitle, list);
    tocNav.appendChild(group);
    tocGroups.push({ el: group, items });
  });

  /* ── 검색 ── */
  function fillHighlighted(el, text, start, length) {
    el.textContent = '';
    if (start < 0) {
      el.textContent = text;
      return;
    }
    const mark = document.createElement('mark');
    mark.textContent = text.slice(start, start + length);
    el.append(text.slice(0, start), mark, text.slice(start + length));
  }

  function filterToc() {
    const raw = normalize(tocSearch.value);
    const query = raw.toLowerCase();
    let shown = 0;

    tocItems.forEach((item) => {
      const idx = query ? item.lower.indexOf(query) : -1;
      const match = !query || idx !== -1;
      item.li.hidden = !match;
      item.snippet.hidden = true;
      fillHighlighted(item.label, item.title, -1, 0);
      if (!match) return;
      shown++;
      if (idx === -1) return;

      if (idx < item.title.length) {
        fillHighlighted(item.label, item.title, idx, query.length);
      } else {
        const from = Math.max(item.title.length, idx - 18);
        const to = Math.min(item.text.length, idx + query.length + 32);
        let body = item.text.slice(from, to);
        const lead = body.length - body.trimStart().length;
        body = body.trimStart();
        const prefix = from > item.title.length + 1 ? '…' : '';
        const suffix = to < item.text.length ? '…' : '';
        fillHighlighted(item.snippet, prefix + body + suffix, prefix.length + idx - from - lead, query.length);
        item.snippet.hidden = false;
      }
    });

    tocGroups.forEach((g) => { g.el.hidden = !g.items.some((i) => !i.li.hidden); });
    tocEmpty.hidden = shown > 0;
    tocCount.textContent = query
      ? `‘${raw}’ 검색 결과 ${shown}개`
      : `전체 ${tocItems.length}개 항목`;
  }

  const visibleLinks = () =>
    Array.from(tocNav.querySelectorAll('a')).filter((a) => a.offsetParent !== null);

  tocSearch.addEventListener('input', filterToc);
  tocSearch.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const first = visibleLinks().find((a) => a.classList.contains('toc-link'));
      if (first) first.click();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const first = visibleLinks()[0];
      if (first) first.focus();
    } else if (e.key === 'Escape' && tocSearch.value) {
      // 첫 Esc는 검색어만 지우고, 다음 Esc에 닫기
      e.preventDefault();
      tocSearch.value = '';
      filterToc();
    }
  });

  tocNav.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const links = visibleLinks();
    const i = links.indexOf(document.activeElement);
    if (i === -1) return;
    e.preventDefault();
    if (e.key === 'ArrowUp' && i === 0) {
      tocSearch.focus();
      return;
    }
    const next = i + (e.key === 'ArrowDown' ? 1 : -1);
    links[Math.max(0, Math.min(links.length - 1, next))].focus();
  });

  /* ── 목차 열기/닫기 ── */
  function openToc(focusSearch) {
    if (!toc.open) {
      toc.showModal();
      const active = tocNav.querySelector('.toc-link.is-active');
      tocNav.scrollTop = active ? active.offsetTop - tocNav.clientHeight / 2 : 0;
    }
    if (focusSearch) {
      tocSearch.focus();
      tocSearch.select();
    }
  }

  tocBtn.addEventListener('click', () => openToc(finePointer.matches));
  document.getElementById('tocClose').addEventListener('click', () => toc.close());
  toc.addEventListener('click', (e) => {
    if (e.target === toc) toc.close(); // 배경 클릭 시 닫기
  });

  document.addEventListener('keydown', (e) => {
    const typing = e.target.closest && e.target.closest('input, textarea, select, [contenteditable]');
    const slash = e.key === '/' && !typing && !e.ctrlKey && !e.metaKey && !e.altKey;
    const cmdK = (e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k';
    if (slash || cmdK) {
      e.preventDefault();
      openToc(true);
    }
  });

  /* ── 카드 제목 옆 링크 복사 버튼 ── */
  tocItems.forEach(({ card, title }) => {
    const heading = card.querySelector(':scope > h3');
    const head = document.createElement('div');
    head.className = 'card-head';
    heading.before(head);
    head.appendChild(heading);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'anchor-btn';
    btn.title = '이 항목 링크 복사';
    btn.setAttribute('aria-label', `‘${title}’ 링크 복사`);
    btn.appendChild(icon('link'));
    btn.addEventListener('click', async () => {
      const url = location.href.split('#')[0] + '#' + card.id;
      const ok = await copyText(url);
      showToast(ok ? '링크를 복사했습니다' : '복사하지 못했습니다');
    });
    head.appendChild(btn);
  });

  /* ── 코드 블록 복사 버튼 ── */
  document.querySelectorAll('.spec-section pre').forEach((pre) => {
    const wrap = document.createElement('div');
    wrap.className = 'code-block';
    wrap.style.marginTop = getComputedStyle(pre).marginTop;
    pre.style.marginTop = '0';
    pre.before(wrap);
    wrap.appendChild(pre);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'copy-btn';
    btn.setAttribute('aria-label', '코드 복사');
    const label = document.createElement('span');
    label.textContent = '복사';
    btn.append(icon('copy'), label);

    let resetTimer = 0;
    btn.addEventListener('click', async () => {
      const ok = await copyText(pre.textContent);
      showToast(ok ? '코드를 복사했습니다' : '복사하지 못했습니다');
      if (!ok) return;
      btn.classList.add('done');
      btn.replaceChild(icon('check'), btn.firstChild);
      label.textContent = '복사됨';
      clearTimeout(resetTimer);
      resetTimer = setTimeout(() => {
        btn.classList.remove('done');
        btn.replaceChild(icon('copy'), btn.firstChild);
        label.textContent = '복사';
      }, 1600);
    });
    wrap.appendChild(btn);
  });

  /* ── 스크롤 연동: 진행률 · 현재 위치 표시 · 맨 위로 버튼 ── */
  let ticking = false;
  function update() {
    ticking = false;
    const scrollY = window.scrollY;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    progressBar.style.transform = `scaleX(${max > 0 ? Math.min(1, scrollY / max) : 0})`;
    toTop.classList.toggle('show', scrollY > 600);

    const barH = topbar.offsetHeight;
    const line = barH + Math.min(160, window.innerHeight * 0.25);

    // 기준선을 지난 마지막 줄의 카드(2단 그리드면 양쪽 모두)를 현재 위치로 표시
    const tops = tocItems.map((item) => item.card.getBoundingClientRect().top);
    let rowTop = -Infinity;
    tops.forEach((t) => { if (t <= line && t > rowTop) rowTop = t; });
    if (max > 0 && scrollY >= max - 2) rowTop = Math.max(...tops);
    tocItems.forEach((item, i) => {
      const on = rowTop !== -Infinity && Math.abs(tops[i] - rowTop) < 2;
      item.link.classList.toggle('is-active', on);
      if (on) item.link.setAttribute('aria-current', 'location');
      else item.link.removeAttribute('aria-current');
    });

    let current = '';
    sections.forEach((s) => {
      const r = s.getBoundingClientRect();
      if (r.top <= line && r.bottom > barH) current = s.id;
    });
    tabs.forEach((tab) => {
      const on = tab.dataset.section === current;
      tab.classList.toggle('is-active', on);
      if (on) tab.setAttribute('aria-current', 'location');
      else tab.removeAttribute('aria-current');
    });
  }
  const requestUpdate = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  };
  window.addEventListener('scroll', requestUpdate, { passive: true });
  window.addEventListener('resize', requestUpdate);

  toTop.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: scrollMode() });
    if (location.hash) history.pushState(null, '', location.pathname + location.search);
    focusTarget(document.getElementById('top'));
  });

  /* ── 인쇄 ── */
  document.getElementById('printBtn').addEventListener('click', () => window.print());
  window.addEventListener('beforeprint', () => { if (toc.open) toc.close(); });

  /* ── 초기화 ── */
  filterToc();
  update();
  if (location.hash) {
    let target = null;
    try { target = document.getElementById(decodeURIComponent(location.hash.slice(1))); } catch (_) { /* 잘못된 해시 무시 */ }
    if (target && target.classList.contains('card')) flash(target);
  }
})();
