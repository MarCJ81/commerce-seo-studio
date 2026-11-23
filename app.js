/* ============================================================
   커머스 SEO 스튜디오 · app.js
   화면 렌더링, 입력 동기화, localStorage 저장함, 복사·내보내기.
   ============================================================ */
(function () {
  'use strict';

  const C = window.CommerceCore;
  const D = window.CommerceData;
  const P = window.ProConnector || null; // engines/pro-api-connector.js
  const PS = window.ProStudio ? window.ProStudio.create(P) : null; // engines/pro-studio.js
  const FA = window.FreeAI || null;      // engines/free-ai-client.js (무료 AI 맛보기)
  if (FA) FA.configure({ endpoint: 'https://free-ai-taste.goodday810202.workers.dev', app: 'commerce-seo-studio' });
  const $ = function (sel) { return document.querySelector(sel); };
  const $$ = function (sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); };

  const LS = {
    draft: 'commerce-seo-studio:v1:draft',
    items: 'commerce-seo-studio:v1:items',
    theme: 'commerce-seo-studio:v1:theme',
    gemini: 'commerce-seo-studio:v1:gemini',
    kits: 'commerce-seo-studio:v1:brandkits',
    compet: 'commerce-seo-studio:v1:compet',
  };

  const state = {
    platform: 'smartstore',
    name: '',
    keyword: '',
    target: '',
    benefits: ['', '', ''],
    weakness: '',
    margin: { price: 0, cost: 0, shipping: 0, feeRate: 0, adCost: 0 },
    /* 카피 심리학: 직접 진단할 텍스트(비어 있으면 생성 카피 진단) */
    diagnosisText: '',
    /* 4대 프레임워크 입력 */
    frames: { framework: 'PAS', problem: '', proof: '', urgency: '', cta: '' },
    /* 디자인 레퍼런스 */
    design: {
      refId: 'commerce-clean', industry: '',
      title: '', body: '', cta: '', badge: '',
      image: '', imageName: '',
      extracted: null, theme: null,
    },
    /* 디자인 엔진 v2: 폰트 믹스 · 질감 · 카드 출처 */
    v2: { fontMix: 'pretendard-only', grain: 'none', source: { kind: 'preset' }, blueprint: null },
    /* 연관키워드 경쟁강도 */
    compet: { rows: [], sort: 'recommend' },
    /* AI 브리지 */
    bridge: { task: 'copy', result: '', copy: '', designNote: '', faqs: [], names: [] },
    /* Pro AI 완성 카피 (연결했을 때만 채워진다) */
    pro: { kit: null, meta: '', busy: false, at: '' },
    /* 무료 AI 맛보기 */
    free: { busy: false },
    /* 상품명 목록 일괄 채점 */
    bulk: [],
    items: [],
    filter: 'all',
    sort: 'recent',
  };

  let lastAnalysis = null;
  let lastSuggestions = [];
  let lastKit = null;
  let lastFaqList = [];
  let lastPsych = null;
  let lastFriction = null;
  let lastFrame = null;
  let lastDesign = null;
  let lastDesignRec = null;
  let lastV2 = null;
  let lastBlueprint = null;
  let lastPrompt = null;
  const openSections = new Set(['empathy']);
  let draftTimer = null;

  /* ── 저장 ─────────────────────────────────────────── */
  function readJSON(key, fallback) {
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (e) { return fallback; }
  }
  function writeJSON(key, value) {
    try { window.localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* 사파리 사생활 모드 등 */ }
  }
  function saveDraft() {
    writeJSON(LS.draft, {
      platform: state.platform, name: state.name, keyword: state.keyword,
      target: state.target, benefits: state.benefits, weakness: state.weakness,
      margin: state.margin, frames: state.frames,
      design: { refId: state.design.refId, industry: state.design.industry },
      v2: { fontMix: state.v2.fontMix, grain: state.v2.grain },
      bridgeTask: state.bridge.task,
    });
  }
  function saveDraftSoon() {
    if (draftTimer) window.clearTimeout(draftTimer);
    draftTimer = window.setTimeout(saveDraft, 220);
  }
  function saveItems() { writeJSON(LS.items, state.items); }

  function normalizeDraft(d) {
    const src = d && typeof d === 'object' ? d : {};
    const m = src.margin && typeof src.margin === 'object' ? src.margin : {};
    const benefits = Array.isArray(src.benefits) ? src.benefits : [];
    const fr = src.frames && typeof src.frames === 'object' ? src.frames : {};
    const ds = src.design && typeof src.design === 'object' ? src.design : {};
    const frame = C.FRAME_IDS.indexOf(fr.framework) >= 0 ? fr.framework : 'PAS';
    const taskId = C.BRIDGE_TASKS.some(function (t) { return t.id === src.bridgeTask; }) ? src.bridgeTask : 'copy';
    return {
      platform: C.PLATFORMS[src.platform] ? src.platform : 'smartstore',
      name: String(src.name == null ? '' : src.name),
      keyword: String(src.keyword == null ? '' : src.keyword),
      target: String(src.target == null ? '' : src.target),
      benefits: [0, 1, 2].map(function (i) { return String(benefits[i] == null ? '' : benefits[i]); }),
      weakness: String(src.weakness == null ? '' : src.weakness),
      margin: {
        price: Math.max(0, C.toNumber(m.price)),
        cost: Math.max(0, C.toNumber(m.cost)),
        shipping: Math.max(0, C.toNumber(m.shipping)),
        feeRate: C.clamp(C.toNumber(m.feeRate), 0, 50),
        adCost: Math.max(0, C.toNumber(m.adCost)),
      },
      frames: {
        framework: frame,
        problem: String(fr.problem == null ? '' : fr.problem),
        proof: String(fr.proof == null ? '' : fr.proof),
        urgency: String(fr.urgency == null ? '' : fr.urgency),
        cta: String(fr.cta == null ? '' : fr.cta),
      },
      design: Object.assign({}, state.design, {
        refId: String(ds.refId || state.design.refId || 'commerce-clean'),
        industry: String(ds.industry || ''),
        title: '', body: '', cta: '', badge: '',
        image: '', imageName: '', extracted: null, theme: null,
      }),
      v2: Object.assign({}, state.v2, {
        fontMix: String((src.v2 && src.v2.fontMix) || state.v2.fontMix || 'pretendard-only'),
        grain: String((src.v2 && src.v2.grain) || state.v2.grain || 'none'),
        source: { kind: 'preset' },
        blueprint: null,
      }),
      bridge: Object.assign({}, state.bridge, { task: taskId }),
    };
  }

  /* ── 토스트 ───────────────────────────────────────── */
  function toast(message, kind) {
    const root = $('#toastRoot');
    const el = document.createElement('div');
    el.className = 'toast' + (kind ? ' ' + kind : '');
    el.textContent = message;
    root.appendChild(el);
    window.setTimeout(function () {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 2200);
  }

  /* ── 복사 ─────────────────────────────────────────── */
  function legacyCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', 'readonly');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    ta.style.top = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }
  function copyText(text, label) {
    const value = String(text == null ? '' : text);
    if (!value.trim()) { toast('복사할 내용이 없어요', 'warn'); return; }
    const done = function () { toast(C.josa(label || '내용', '을/를') + ' 복사했어요'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(value).then(done, function () {
        if (legacyCopy(value)) done(); else toast('복사가 막혔어요. 직접 선택해 주세요.', 'warn');
      });
    } else if (legacyCopy(value)) { done(); } else { toast('복사가 막혔어요. 직접 선택해 주세요.', 'warn'); }
  }

  function download(filename, text, mime) {
    const blob = new Blob([text], { type: (mime || 'text/plain') + ';charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  /* ── 탭 ───────────────────────────────────────────── */
  function setTab(tab) {
    const valid = ['score', 'copy', 'design', 'compet', 'bridge', 'margin', 'saved'];
    const next = valid.indexOf(tab) >= 0 ? tab : 'score';
    document.body.setAttribute('data-tab', next);
    $$('.tab').forEach(function (b) {
      const on = b.getAttribute('data-tab') === next;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    valid.forEach(function (id) {
      const view = document.getElementById('view-' + id);
      if (view) view.hidden = id !== next;
    });
    if (next === 'copy') { renderKit(); renderPsych(); renderFrames(); }
    if (next === 'design') renderDesign();
    if (next === 'compet') renderCompet();
    if (next === 'bridge') renderBridge();
    if (next === 'margin') renderMargin();
    if (next === 'saved') renderSaved();
  }

  /* ── 입력 동기화 ──────────────────────────────────── */
  function syncForm() {
    $$('#platformSeg button').forEach(function (b) {
      const on = b.getAttribute('data-platform') === state.platform;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    $('#productName').value = state.name;
    $('#productKeyword').value = state.keyword;
    $('#copyTarget').value = state.target;
    $('#benefit1').value = state.benefits[0];
    $('#benefit2').value = state.benefits[1];
    $('#benefit3').value = state.benefits[2];
    $('#copyWeakness').value = state.weakness;
    $('#mPrice').value = state.margin.price ? state.margin.price : '';
    $('#mCost').value = state.margin.cost ? state.margin.cost : '';
    $('#mShipping').value = state.margin.shipping ? state.margin.shipping : '';
    $('#mFee').value = state.margin.feeRate ? state.margin.feeRate : '';
    $('#mAd').value = state.margin.adCost ? state.margin.adCost : '';
    $('#frameProblem').value = state.frames.problem;
    $('#frameProof').value = state.frames.proof;
    $('#frameUrgency').value = state.frames.urgency;
    $('#frameCta').value = state.frames.cta;
    $('#designIndustry').value = state.design.industry;
    $('#designTitle').value = state.design.title;
    $('#designBody').value = state.design.body;
    $('#designCta').value = state.design.cta;
    $('#designBadge').value = state.design.badge;
  }

  function onChange() {
    saveDraftSoon();
    renderScore();
    const tab = document.body.getAttribute('data-tab');
    if (tab === 'copy') { renderKit(); renderPsych(); renderFrames(); }
    if (tab === 'margin') renderMargin();
    if (tab === 'bridge') renderBridge();
  }

  /* ── 상품명 채점 ──────────────────────────────────── */
  function markName(name, highlights) {
    if (!name) return '<span class="muted">상품명을 입력하면 문제 구간을 표시합니다.</span>';
    const spans = (highlights || []).slice().sort(function (a, b) { return a.start - b.start || b.end - a.end; });
    let out = '';
    let at = 0;
    spans.forEach(function (sp) {
      if (sp.start < at || sp.start >= name.length) return;
      const end = Math.min(name.length, Math.max(sp.start + 1, sp.end));
      out += C.escapeHtml(name.slice(at, sp.start));
      out += '<mark class="' + C.escapeHtml(sp.type) + '">' + C.escapeHtml(name.slice(sp.start, end)) + '</mark>';
      at = end;
    });
    out += C.escapeHtml(name.slice(at));
    return out;
  }

  function gradeRingColor(grade) {
    if (grade === 'S') return '#0b7a55';
    if (grade === 'A') return '#2f5bff';
    if (grade === 'B') return '#b45309';
    return '#b42318';
  }

  function renderScore() {
    const platform = C.getPlatform(state.platform);
    const a = C.analyzeName({ platform: state.platform, name: state.name, keyword: state.keyword });
    lastAnalysis = a;

    const ring = $('#scoreRing');
    ring.style.setProperty('--p', a.total);
    ring.style.setProperty('--ring', gradeRingColor(a.grade));
    $('#scoreTotal').textContent = a.total;

    const badge = $('#scoreGrade');
    badge.className = 'badge grade ' + a.gradeTone;
    badge.textContent = a.grade;
    $('#scoreLabel').textContent = state.name ? a.gradeLabel : '상품명을 입력하세요';
    $('#scoreSub').textContent = state.name
      ? a.length + '자 / ' + platform.maxLength + '자 · ' + (a.provisional ? '키워드 미입력(임시 점수)' : '키워드 ' + (a.keyword.exact ? (a.keyword.index + 1) + '번째 글자' : '없음'))
      : '상품명과 목표 키워드를 넣으면 바로 채점합니다';

    const chip = $('#scoreChip');
    chip.className = 'score-chip g-' + a.gradeTone;
    $('#chipScore').textContent = a.total;
    $('#chipGrade').textContent = state.name ? a.grade : '대기';

    const chips = [];
    chips.push('<span class="' + (a.metrics.length > platform.maxLength ? 'bad' : a.metrics.length >= platform.idealMin && a.metrics.length <= platform.idealMax ? 'ok' : 'warn') + '">길이 <b>' + a.metrics.length + '</b>자</span>');
    chips.push('<span>단어 <b>' + a.metrics.tokens + '</b>개</span>');
    chips.push('<span class="' + (a.metrics.duplicateCount ? 'warn' : 'ok') + '">중복 <b>' + a.metrics.duplicateCount + '</b>종</span>');
    chips.push('<span class="' + (a.metrics.symbolCount ? 'warn' : 'ok') + '">기호 <b>' + a.metrics.symbolCount + '</b>개</span>');
    chips.push('<span class="' + (a.metrics.claimCount ? 'bad' : 'ok') + '">금지어 <b>' + a.metrics.claimCount + '</b>건</span>');
    chips.push('<span class="' + (a.metrics.specCount ? 'ok' : 'warn') + '">규격 <b>' + a.metrics.specCount + '</b>개</span>');
    $('#metricChips').innerHTML = chips.join('');

    // 히어로 벤토 스트립(라이브 지표)
    const statScore = $('#statScore');
    if (statScore) statScore.textContent = a.total;
    const statGrade = $('#statGrade');
    if (statGrade) statGrade.textContent = state.name ? a.grade + '등급' : '대기';
    const statLength = $('#statLength');
    if (statLength) statLength.textContent = a.metrics.length;
    const statIssues = $('#statIssues');
    if (statIssues) statIssues.textContent = a.issues.length;
    const statNote = $('#statNote');
    if (statNote) {
      statNote.textContent = !state.name ? '상품명을 넣으면 즉시 갱신'
        : a.issues.length === 0 ? '진단 항목 모두 통과' : '아래 진단 항목부터 고치세요';
    }

    $('#scoreParts').innerHTML = a.parts.map(function (p) {
      const ratio = p.max ? p.score / p.max : 0;
      const cls = ratio >= 0.8 ? '' : ratio >= 0.45 ? 'low' : 'bad';
      return '<div class="part">' +
        '<span class="p-label">' + C.escapeHtml(p.label) + '</span>' +
        '<span class="p-track"><i class="' + cls + '" style="width:' + Math.round(ratio * 100) + '%"></i></span>' +
        '<span class="p-val">' + p.score + '<span>/' + p.max + '</span></span>' +
        '</div>';
    }).join('');

    $('#issueCount').textContent = a.issues.length + '개';
    $('#issueList').innerHTML = a.issues.map(function (it) {
      return '<div class="issue ' + it.level + '">' +
        '<strong>' + C.escapeHtml(it.title) + '</strong>' +
        '<div class="i-detail">' + C.escapeHtml(it.detail) + '</div>' +
        '<div class="i-fix">' + C.escapeHtml(it.fix) + '</div>' +
        '</div>';
    }).join('');

    $('#namePreview').innerHTML = markName(a.name, a.highlights);

    const pills = [];
    if (!a.keywords.length) {
      pills.push('<span class="kw-pill off">목표 키워드 미입력</span>');
    } else {
      a.keywords.forEach(function (k, i) {
        const info = C.keywordInfo(a.name, k, a.platform);
        const on = info.exact && info.index <= platform.frontChars;
        const part = !info.exact && info.partial !== 'none';
        pills.push('<span class="kw-pill ' + (on ? 'on' : part ? '' : 'off') + '">' +
          (i === 0 ? '<b>대표</b> ' : '') + C.escapeHtml(k) + ' · ' +
          (info.exact ? (info.index + 1) + '번째' : part ? '단어만 포함' : '없음') + '</span>');
      });
    }
    pills.push('<span class="kw-pill">앞 ' + platform.frontChars + '자 안이 유리</span>');
    $('#keywordCheck').innerHTML = pills.join('');

    lastSuggestions = C.suggestNames({ platform: state.platform, name: state.name, keyword: state.keyword });
    $('#suggestHint').textContent = lastSuggestions.length ? '지금 ' + a.total + '점 → 최고 ' + Math.max.apply(null, lastSuggestions.map(function (s) { return s.score; })) + '점' : '상품명을 입력하면 3개를 만들어요';
    $('#suggestList').innerHTML = lastSuggestions.length ? lastSuggestions.map(function (s, i) {
      return '<div class="suggest">' +
        '<div class="suggest-top"><span class="s-label">' + C.escapeHtml(s.label) + '</span>' +
        '<span class="s-score">' + s.score + '점 <i>/ ' + s.length + '자</i></span></div>' +
        '<div class="suggest-text">' + C.escapeHtml(s.text) + '</div>' +
        '<div class="suggest-actions">' +
        '<button class="btn btn-ghost" data-action="apply-suggestion" data-index="' + i + '">적용</button>' +
        '<button class="btn btn-ghost" data-action="copy-suggestion" data-index="' + i + '">복사</button>' +
        '<span class="suggest-reason">' + C.escapeHtml(s.reason) + '</span>' +
        '</div></div>';
    }).join('') : '<p class="muted" style="font-size:12px">상품명을 입력하면 개선안을 만들어 드려요.</p>';

    $('#ruleTitle').textContent = platform.label + ' 규칙';
    $('#ruleSummary').textContent = platform.summary;
    $('#ruleList').innerHTML = C.platformRules(platform.id).map(function (r) {
      return '<li>' + C.escapeHtml(r) + '</li>';
    }).join('');
    $('#ruleNote').textContent = D.NOTES.score;
  }

  /* ── 상세 카피 ────────────────────────────────────── */
  function renderKit() {
    const current = $('#copyCurrent');
    current.textContent = state.name ? '현재 상품: ' + state.name : '상품명을 먼저 입력하세요 (위 입력칸)';

    lastKit = C.buildCopyKit({
      name: state.name, target: state.target, benefits: state.benefits,
      weakness: state.weakness, keyword: state.keyword,
    });

    const pro = state.pro.kit;
    const proHead = pro && pro.headline ? '<div class="headline is-pro">' +
      '<span class="h-no">P</span>' +
      '<span class="h-main"><span class="h-type">Pro 헤드라인 · ' + C.codePoints(pro.headline) + '자</span>' +
      '<span class="h-text">' + C.escapeHtml(pro.headline) + '</span>' +
      (pro.subheadline ? '<span class="h-sub">' + C.escapeHtml(pro.subheadline) + '</span>' : '') + '</span>' +
      '<button class="btn btn-ghost h-copy" data-action="copy-pro-copy">복사</button>' +
      '</div>' : '';

    $('#headlineList').innerHTML = proHead + lastKit.headlines.map(function (h, i) {
      return '<div class="headline">' +
        '<span class="h-no">' + (i + 1) + '</span>' +
        '<span class="h-main"><span class="h-type">' + C.escapeHtml(h.type) + ' · ' + h.length + '자</span>' +
        '<span class="h-text">' + C.escapeHtml(h.text) + '</span></span>' +
        '<button class="btn btn-ghost h-copy" data-action="copy-headline" data-index="' + i + '">복사</button>' +
        '</div>';
    }).join('');

    if (pro && pro.blocks.length) {
      $('#sectionList').innerHTML = pro.blocks.map(function (b, i) {
        return '<div class="section is-open is-pro" data-section="pro-' + i + '">' +
          '<div class="section-head">' +
          '<span class="sc-no">' + (i + 1) + '</span>' +
          '<span class="sc-title">' + C.escapeHtml(b.heading || b.stepLabel || b.step || '') + '</span>' +
          '<span class="sc-goal">Pro 단계</span></div>' +
          '<div class="section-body">' +
          '<pre class="section-copy">' + C.escapeHtml(proBlockText(b)) + '</pre>' +
          '<div class="section-actions">' +
          '<button class="btn btn-ghost" data-action="copy-pro-block" data-index="' + i + '">이 단락 복사</button>' +
          '</div></div></div>';
      }).join('');
    } else {
      $('#sectionList').innerHTML = lastKit.sections.map(function (s, i) {
        const open = openSections.has(s.id);
        return '<div class="section' + (open ? ' is-open' : '') + '" data-section="' + s.id + '">' +
          '<button class="section-head" type="button" data-action="toggle-section" data-index="' + i + '" aria-expanded="' + (open ? 'true' : 'false') + '">' +
          '<span class="sc-no">' + s.no + '</span>' +
          '<span class="sc-title">' + C.escapeHtml(s.title) + '</span>' +
          '<span class="sc-goal">' + C.escapeHtml(s.goal) + '</span>' +
          '<span class="sc-chev" aria-hidden="true">▾</span>' +
          '</button>' +
          '<div class="section-body"' + (open ? '' : ' hidden') + '>' +
          '<pre class="section-copy">' + C.escapeHtml(s.copy) + '</pre>' +
          '<div class="section-actions">' +
          '<button class="btn btn-ghost" data-action="copy-section" data-index="' + i + '">이 단락 복사</button>' +
          '</div></div></div>';
      }).join('');
    }

    const proFaqs = pro && Array.isArray(pro.faqs) ? pro.faqs : [];
    lastFaqList = proFaqs.map(function (f, i) {
      return { no: i + 1, q: f.q, a: f.a, pro: true };
    }).concat(lastKit.faqs.map(function (f) {
      return { no: proFaqs.length + f.no, q: f.q, a: f.a };
    })).concat((state.bridge.faqs || []).map(function (f, i) {
      return { no: proFaqs.length + lastKit.faqs.length + i + 1, q: f.q, a: f.a, ai: true };
    }));
    $('#faqList').innerHTML = lastFaqList.map(function (f, i) {
      return '<div class="faq' + (f.ai ? ' is-ai' : '') + (f.pro ? ' is-pro' : '') + '">' +
        '<div class="faq-q"><b>Q' + f.no + '</b>' +
        (f.pro ? '<span class="engine-tag">Pro</span>' : '') +
        (f.ai ? '<span class="engine-tag">AI 추가</span>' : '') +
        '<span>' + C.escapeHtml(f.q) + '</span></div>' +
        '<div class="faq-a">' + C.escapeHtml(f.a) + '</div>' +
        '<div class="faq-copy"><button class="btn btn-ghost" data-action="copy-faq" data-index="' + i + '">문답 복사</button></div>' +
        '</div>';
    }).join('');

    renderProPanel();

    const bridgePanel = $('#bridgeCopyPanel');
    if (bridgePanel) {
      bridgePanel.hidden = !state.bridge.copy;
      if (state.bridge.copy) $('#bridgeCopyText').textContent = state.bridge.copy;
    }
  }

  /* ── Pro AI 완성 카피 ──────────────────────────────────
     무료 모드에서는 버튼이 연결 안내만 열고, 아무 요청도 보내지 않는다.
     연결 뒤에는 buildProPrompt('commerce') → generate → JSON → 7단·FAQ 삽입. */

  const PRO_STEPS = {
    hook: '① 훅', problem: '② 문제 공감', cause: '③ 원인', solution: '④ 해결(상품)',
    proof: '⑤ 근거', reversal: '⑥ 망설임 제거', cta: '⑦ 행동',
  };

  function proBlockText(b) {
    const lines = [];
    if (b.body) lines.push(String(b.body).trim());
    (Array.isArray(b.bullet) ? b.bullet : []).forEach(function (x) {
      if (String(x || '').trim()) lines.push('· ' + String(x).trim());
    });
    return lines.join('\n').trim();
  }

  function proCopyText(kit) {
    if (!kit) return '';
    const out = [];
    if (kit.headline) out.push(kit.headline);
    if (kit.subheadline) out.push(kit.subheadline);
    (kit.blocks || []).forEach(function (b, i) {
      const label = PRO_STEPS[b.step] || (b.stepLabel || ('단계 ' + (i + 1)));
      out.push('\n[' + label + '] ' + (b.heading || ''));
      const body = proBlockText(b);
      if (body) out.push(body);
    });
    if (Array.isArray(kit.specTable) && kit.specTable.length) {
      out.push('\n[상품 스펙]');
      kit.specTable.forEach(function (r) { out.push((r.label || '') + ': ' + (r.value || '')); });
    }
    if (kit.riskReversal) out.push('\n[교환·환불 안내] ' + kit.riskReversal);
    if (Array.isArray(kit.faqs) && kit.faqs.length) {
      out.push('\n[FAQ]');
      kit.faqs.forEach(function (f) { out.push('Q. ' + f.q + '\nA. ' + f.a); });
    }
    return out.join('\n').trim();
  }

  function renderProPanel() {
    const panel = $('#proResult');
    if (!panel) return;
    const kit = state.pro.kit;
    panel.hidden = !kit;
    if (!kit) return;
    $('#proTitle').textContent = kit.headline || '';
    const sub = [];
    if (kit.subheadline) sub.push(kit.subheadline);
    if (state.pro.meta) sub.push(state.pro.meta);
    sub.push('7단 카피 · FAQ ' + ((kit.faqs || []).length) + '개');
    $('#proSub').textContent = sub.join(' · ');
    $('#proMeta').textContent = state.pro.meta || '';
  }

  function proInput() {
    const benefits = state.benefits.map(function (b) { return String(b || '').trim(); }).filter(Boolean);
    return {
      product: String(state.name || '').trim(),
      target: String(state.target || '').trim(),
      problem: String(state.frames.problem || state.weakness || '').trim(),
      benefit: benefits.join(' / '),
      proof: String(state.frames.proof || '').trim(),
      price: state.margin.price ? Number(state.margin.price).toLocaleString('ko-KR') + '원' : '',
      objection: String(state.weakness || '').trim(),
    };
  }

  function setProBusy(on) {
    state.pro.busy = !!on;
    const btn = $('[data-action="pro-generate"]');
    if (!btn) return;
    btn.setAttribute('aria-busy', on ? 'true' : 'false');
    const label = btn.querySelector('.pro-label');
    if (label) label.textContent = on ? 'Pro AI가 쓰는 중…' : 'Pro AI로 고전환 상세 카피 생성';
  }

  function updateProUi() {
    if (!PS) return;
    const s = PS.sync($('#proBox') || document);
    const el = $('#proState');
    if (!el || state.pro.busy) return;
    el.textContent = s.connected
      ? s.providerName + ' 연결됨 · 상품 스펙·타겟으로 7단 고전환 카피를 쓰고 7단 표·FAQ에 바로 넣습니다.'
      : '무료 모드 · 지금 만든 7단 카피와 FAQ를 그대로 씁니다. Pro를 연결하면 상품 스펙 기반 완성 카피가 들어옵니다.';
  }

  function runPro() {
    if (!PS || !P) { toast('Pro 연결 엔진을 불러오지 못했어요. 새로고침해 주세요.', 'warn'); return; }
    if (state.pro.busy) return;
    const input = proInput();
    if (!input.product) {
      toast('상품명을 먼저 입력하세요.', 'warn');
      $('#productName').focus();
      return;
    }
    if (!PS.connected()) {
      updateProUi();
      toast('무료 모드예요. Pro API를 연결하면 완성 카피가 바로 들어옵니다.');
      PS.openConnect();
      return;
    }

    setProBusy(true);
    const stateEl = $('#proState');
    if (stateEl) stateEl.textContent = 'Pro AI가 카피를 쓰는 중… (보통 10~40초) 창을 닫지 마세요.';

    PS.run('commerce', input).then(function (res) {
      setProBusy(false);
      if (!res.ok) {
        updateProUi();
        if (stateEl) stateEl.textContent = res.message;
        toast(res.message, 'warn');
        return;
      }
      const data = res.data || {};
      const blocks = (Array.isArray(data.blocks) ? data.blocks : []).map(function (b) {
        const step = String(b.step || '').trim();
        return {
          step: step,
          stepLabel: PRO_STEPS[step] || step,
          heading: String(b.heading || '').trim(),
          body: String(b.body || '').trim(),
          bullet: (Array.isArray(b.bullet) ? b.bullet : []).map(function (x) { return String(x || '').trim(); }).filter(Boolean),
        };
      }).filter(function (b) { return b.heading || b.body || b.bullet.length; });
      if (!blocks.length) {
        toast('응답에 7단 카피가 비어 있어요. 다시 시도해 주세요.', 'warn');
        return;
      }
      state.pro.kit = {
        headline: String(data.headline || '').trim(),
        subheadline: String(data.subheadline || '').trim(),
        blocks: blocks,
        specTable: (Array.isArray(data.specTable) ? data.specTable : []).map(function (r) {
          return { label: String(r.label || '').trim(), value: String(r.value || '').trim() };
        }).filter(function (r) { return r.label || r.value; }),
        riskReversal: String(data.riskReversal || '').trim(),
        faqs: (Array.isArray(data.faq) ? data.faq : []).map(function (f) {
          return { q: String(f.q || '').trim(), a: String(f.a || '').trim() };
        }).filter(function (f) { return f.q && f.a; }),
      };
      state.pro.meta = PS.describe(res);
      state.pro.at = new Date().toISOString();
      openSections.clear();
      renderKit();
      updateProUi();
      if (stateEl) stateEl.textContent = (res.meta && res.meta.provider ? res.meta.provider + ' ' : '') + '완성 카피를 7단·FAQ에 넣었습니다. 전체 복사에도 함께 담깁니다.';
      toast('Pro 완성 카피 ' + blocks.length + '단을 넣었어요.', 'ok');
    });
  }

  function clearProKit() {
    if (!state.pro.kit) return;
    state.pro.kit = null;
    state.pro.meta = '';
    renderKit();
    toast('무료 엔진 결과로 되돌렸어요.');
  }

  /* 연결 버튼·모달은 처음 눌렀을 때 만든다.
     시작하자마자 만들면 쓰지 않는 화면(제공자 키 안내 링크)이 DOM에 남는다. */
  function hookProConnect() {
    const btn = $('#proConnect');
    if (!btn || btn.getAttribute('data-pro-hooked') === '1') return;
    btn.setAttribute('data-pro-hooked', '1');
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      if (P && typeof P.mountModal === 'function') P.mountModal(btn);
      PS.openConnect();
    });
  }

  function initPro() {
    if (!PS) return;
    PS.badge('#proBadge');
    hookProConnect();
    PS.onConnectChange(function () { updateProUi(); });
    updateProUi();
  }

  function composeFullText() {
    if (!lastKit) return '';
    const parts = [state.pro.kit ? proCopyText(state.pro.kit) : lastKit.fullText];
    if (state.bridge.copy) parts.push('\n\n■ AI 다듬은 카피\n' + state.bridge.copy);
    if (state.bridge.faqs.length) {
      parts.push('\n\n■ AI 추가 FAQ\n' + state.bridge.faqs.map(function (f) {
        return 'Q. ' + f.q + '\nA. ' + f.a;
      }).join('\n\n'));
    }
    return parts.join('');
  }

  /* ── 카피 심리학 진단 ──────────────────────────────── */
  function psychSourceText() {
    const typed = String(state.diagnosisText || '').trim();
    if (typed) return typed;
    return lastKit ? lastKit.fullText : '';
  }

  function renderPsych() {
    const text = psychSourceText();
    const d = C.diagnoseCopy(text);
    const f = C.detectCopy(text);
    lastPsych = d;
    lastFriction = f;
    const src = $('#psychSource');
    if (src) {
      src.textContent = (String(state.diagnosisText || '').trim() ? '직접 붙여넣은 카피' : '지금 만든 카피') +
        ' · ' + C.codePoints(text) + '자';
    }
    if (!d) {
      $('#psychTitle').textContent = '카피 엔진을 불러오지 못했어요';
      $('#psychDesc').textContent = 'engines/copy-psych-engine.js 파일이 이 폴더에 있는지 확인하세요.';
      return;
    }
    $('#psychTotal').textContent = d.total;
    const g = $('#psychGrade');
    g.className = 'badge grade ' + String(d.grade.id).toLowerCase();
    g.textContent = d.grade.id;
    $('#psychTitle').textContent = d.grade.title + ' · ' + d.grade.desc;
    $('#psychDesc').textContent = '8개 트리거 중 ' + d.strengths.length + '개가 강함 · 문장 ' + d.stats.sentences +
      '개 · 문장당 평균 ' + d.stats.avgSentenceLength + '자';

    $('#triggerGrid').innerHTML = d.triggers.map(function (t) {
      const hits = t.hits.length ? t.hits.join(', ') : '신호 없음';
      return '<div class="trigger ' + t.level + '" title="' + C.escapeHtml(t.fix) + '">' +
        '<div class="trigger-top"><span class="t-name">' + C.escapeHtml(t.name) + '</span>' +
        '<span class="t-score">' + t.score + '</span></div>' +
        '<div class="t-track"><i style="width:' + t.score + '%"></i></div>' +
        '<span class="t-hit">' + C.escapeHtml(hits) + '</span></div>';
    }).join('');

    $('#psychRecs').innerHTML = d.recommendations.length ? d.recommendations.map(function (r) {
      return '<div class="rec"><strong>' + r.rank + '. ' + C.escapeHtml(r.name) + '</strong>' +
        '<div class="rec-meta">' + r.current + '점 → 목표 ' + r.target + '점 · 영향 ' + r.impact + '</div>' +
        '<p>' + C.escapeHtml(r.action) + '</p></div>';
    }).join('') : '<p class="muted" style="font-size:11px">모든 트리거가 70점 이상입니다. 그대로 테스트하세요.</p>';

    const badge = $('#frictionBadge');
    if (badge && f) {
      badge.textContent = f.count;
      badge.title = f.grade.label + ' — ' + f.grade.desc;
    }
    if (f) {
      $('#frictionList').innerHTML = f.issues.slice(0, 6).map(function (it) {
        return '<div class="friction' + (it.canAutoFix ? ' fixable' : '') + '" title="' + C.escapeHtml(it.reason) + '">' +
          '<div><span class="f-phrase">“' + C.escapeHtml(it.phrase) + '”</span>' +
          '<span class="f-type">' + C.escapeHtml(it.typeLabel) + '</span></div>' +
          '<div class="f-alt">' + C.escapeHtml(it.alternative) + '</div></div>';
      }).join('') || '<p class="muted" style="font-size:11px">전환을 막는 표현이 없습니다.</p>';
    }
  }

  /* ── 4대 프레임워크 ───────────────────────────────── */
  function frameInput() {
    return {
      name: state.name, target: state.target, benefits: state.benefits,
      weakness: state.weakness, keyword: state.keyword,
      price: state.margin.price, frames: state.frames,
    };
  }

  function renderFrames() {
    const fw = C.generateFrameworks(frameInput());
    lastFrame = fw;
    if (!fw) return;
    $('#frameTabs').innerHTML = fw.items.map(function (it) {
      const on = it.id === fw.chosen;
      return '<button type="button" class="frame-tab' + (on ? ' is-on' : '') + '" data-action="pick-frame" data-frame="' + it.id + '" aria-pressed="' + (on ? 'true' : 'false') + '">' +
        '<b>' + it.id + '</b><span>' + C.escapeHtml(it.name) + '</span>' +
        '<small>' + it.psych.total + '점</small>' +
        (fw.bestId === it.id ? '<span class="best">추천</span>' : '') + '</button>';
    }).join('');
    $('#frameHint').textContent = fw.recommendation.reasons[0] || '';
    $('#frameCompare').textContent = '같은 입력으로 4종 생성 — ' +
      fw.comparison.map(function (c) { return c.id + ' ' + c.psychScore + '점'; }).join(' · ') +
      ' / 엔진 추천 ' + fw.recommendation.id + '(' + fw.recommendation.name + ')';
    const it = fw.items.find(function (x) { return x.id === fw.chosen; }) || fw.items[0];
    $('#frameOut').innerHTML =
      '<div class="fo-head"><div class="fo-title">' + C.escapeHtml(it.title) + '</div>' +
      '<div class="fo-psych">' + it.psych.grade.id + ' · ' + it.psych.total + '점 · ' + it.chars + '자</div></div>' +
      '<div class="fo-sections">' + it.sections.map(function (s) {
        return '<div class="frame-sec"><b>' + C.escapeHtml(s.label) + '</b><p>' + C.escapeHtml(s.text) + '</p></div>';
      }).join('') + '</div>' +
      '<div class="fo-actions">' +
      '<button class="btn btn-ghost" data-action="copy-frame">이 카피 복사</button>' +
      '<button class="btn btn-ghost" data-action="frame-to-psych">이 카피로 다시 진단</button>' +
      '<span class="foot-note" style="margin:0">' + C.escapeHtml(it.en) + '</span>' +
      '</div>';
  }

  /* ── 디자인 레퍼런스 ───────────────────────────────── */
  function designInput() {
    return {
      name: state.name, target: state.target, benefits: state.benefits,
      weakness: state.weakness, keyword: state.keyword,
      price: state.margin.price, industry: state.design.industry, design: state.design,
    };
  }

  function renderDesignContext() {
    const ctx = $('#designContext');
    if (!ctx) return;
    ctx.textContent = state.name
      ? state.name + (state.target ? ' · ' + state.target : '') + (state.margin.price ? ' · ' + C.formatWon(state.margin.price) : '')
      : '상품명을 먼저 입력하세요 (위 입력칸)';
    const ti = $('#designTitle');
    if (ti && !state.design.title) ti.placeholder = C.designTitleFromName(state.name);
    const bd = $('#designBody');
    if (bd && !state.design.body) {
      bd.placeholder = (state.benefits || []).filter(Boolean).slice(0, 2).join(' · ') || '장점 1~2개';
    }
    const bg = $('#designBadge');
    if (bg && !state.design.badge) bg.placeholder = state.margin.price ? C.formatWon(state.margin.price) : '59,000원';
  }

  function renderDesign() {
    renderDesignContext();
    const rec = C.recommendDesigns(designInput());
    lastDesignRec = rec;
    if (!rec) {
      $('#refGrid').innerHTML = '<p class="muted" style="font-size:11.5px">디자인 엔진을 불러오지 못했어요. engines/design-ref-engine.js 파일을 확인하세요.</p>';
      return;
    }
    if (!rec.refs.some(function (r) { return r.id === state.design.refId; })) {
      state.design.refId = rec.refs[0].id;
    }
    const c = rec.context;
    $('#designContextTag').textContent = state.design.industry ? '업종 지정' : '자동 분석';
    $('#designContextLine').textContent = c.industry + ' · ' + c.purposeLabel + ' · 밀도 ' + c.density.level +
      ' · 구매신호 ' + Math.round(c.signals.commerceIntent * 100) + '%';
    $('#refGrid').innerHTML = rec.refs.map(function (r) {
      const on = r.id === state.design.refId;
      return '<div class="ref' + (on ? ' is-on' : '') + '">' +
        '<div class="ref-top"><span class="ref-rank">0' + r.rank + '</span>' +
        '<span class="ref-name">' + C.escapeHtml(r.name) + '</span>' +
        '<span class="ref-score">' + r.score + '%</span></div>' +
        '<div class="ref-family">' + C.escapeHtml(r.familyLabel) + ' · ' + C.escapeHtml(r.structure) + '</div>' +
        '<div class="ref-swatches">' + r.paletteList.map(function (p) {
          return '<i style="background:' + C.escapeHtml(p.value) + '" title="' + p.key + ' ' + p.value + '"></i>';
        }).join('') + '</div>' +
        '<ul class="ref-why">' + r.reasons.slice(0, 2).map(function (x) {
          return '<li>' + C.escapeHtml(x) + '</li>';
        }).join('') + '</ul>' +
        '<div class="ref-spec">' + C.escapeHtml(r.imageRatio) + ' · ' + C.escapeHtml(r.typePair) + '</div>' +
        '<div class="ref-foot"><button class="btn btn-ghost" data-action="apply-design-ref" data-id="' + C.escapeHtml(r.id) + '">' +
        (on ? '적용됨' : '이 디자인 적용') + '</button>' +
        (r.defaultRisk && r.defaultRisk.risk >= 0.6 ? '<span class="risk">AI 기본값 주의</span>' : '') +
        '</div></div>';
    }).join('');
    $('#designNote').textContent = rec.note;
    renderV2();
    renderDesignPreview();
    renderPalette();
  }

  function fitDesignStage() {
    const stage = $('#designStage');
    if (!stage) return;
    const fit = stage.querySelector('.stage-fit');
    if (!fit) return;
    const card = fit.firstElementChild;
    if (!card) return;
    const avail = Math.max(120, stage.clientWidth - 24);
    const cw = card.offsetWidth || 400;
    const ch = card.offsetHeight || 520;
    const s = Math.min(1, avail / cw);
    fit.style.width = Math.round(cw * s) + 'px';
    fit.style.height = Math.round(ch * s) + 'px';
    card.style.transformOrigin = 'top left';
    card.style.transform = 'scale(' + s + ')';
  }

  function renderDesignPreview() {
    const preset = state.design.theme || state.design.refId;
    const applied = C.applyDesign(preset, C.designContent(designInput()), {
      width: 480,
      contextText: C.designSourceText(designInput()),
    });
    if (!applied) return;
    lastDesign = applied;
    const stage = $('#designStage');
    stage.innerHTML = '<div class="stage-fit">' + applied.html + '</div>';
    $('#designAppliedName').textContent = applied.name + (state.design.theme ? ' · 추출 팔레트 적용' : '');
    fitDesignStage();

    const d = applied.dna;
    const tk = applied.tokens;
    const img = applied.imageRules;
    const swatches = function (palette) {
      return '<div class="axis-swatches">' + C.paletteList(palette).map(function (p) {
        return '<i style="background:' + C.escapeHtml(p.value) + '"></i>';
      }).join('') + '</div>';
    };
    const typeFamily = (d.type && d.type.family) ? d.type.family.display + ' + ' + d.type.family.body : '';
    const roleSummary = applied.poster
      ? '포스터형 제목 34px / 본문 ' + tk.type.roles.body.size + 'px · 원래 ' + tk.type.roles.display.size + 'px 구도를 2줄에 맞춰 축소'
      : tk.type.roles.display.size + 'px / ' + tk.type.roles.display.weight +
        ' · 본문 ' + tk.type.roles.body.size + 'px / ' + tk.type.roles.body.lineHeight + 'px · 자간 ' + tk.type.roles.display.tracking;
    const imgLine = (img.ratio || '—') + ' · ' + (img.fill ? '꽉 채움' : '비율 유지') +
      ' · 크롭 ' + (img.crop || '—') + ' · 포커스 ' + (img.focal || '—') +
      (img.overlay && img.overlay.type !== 'none'
        ? ' · ' + img.overlay.type + ' ' + Math.round((img.overlay.opacity || 0) * 100) + '%'
        : ' · 오버레이 없음');

    $('#designDna').innerHTML =
      '<div class="dna"><b>팔레트 60 · 30 · 10</b>' + swatches(d.palette) +
      '<span>' + C.escapeHtml(d.palette.bg) + ' / ' + C.escapeHtml(d.palette.accent) + '</span></div>' +
      '<div class="dna"><b>타이포</b><span>' + C.escapeHtml(typeFamily) + '</span>' +
      '<span>' + C.escapeHtml(roleSummary) + '</span></div>' +
      '<div class="dna"><b>레이아웃</b><span>' + C.escapeHtml(d.layout.structure) + ' · ' +
      (d.layout.columns || 0) + '열 · 라운딩 ' + (d.graphics.radius || 0) + 'px</span>' +
      '<span>' + C.escapeHtml(d.layout.note || '') + '</span></div>' +
      '<div class="dna"><b>실사이미지</b><span>' + C.escapeHtml(imgLine) + '</span>' +
      '<span>' + C.escapeHtml(applied.safety ? applied.safety.note : '') + '</span></div>';

    $('#designChecklist').innerHTML = applied.checklist.map(function (x) {
      return '<li>' + C.escapeHtml(x) + '</li>';
    }).join('');

    const warns = applied.warnings.slice();
    if (state.design.extracted && state.design.extracted.isDefaultLook && state.design.extracted.isDefaultLook.risk >= 0.6) {
      warns.push('추출한 색이 AI 기본값 구간입니다 — ' + (state.design.extracted.isDefaultLook.label || '액센트를 1개만 바꾸세요'));
    }
    $('#designWarnings').innerHTML = warns.map(function (w) {
      return '<p>' + C.escapeHtml(w) + '</p>';
    }).join('');
  }

  function renderPalette() {
    const out = $('#paletteOut');
    if (!out) return;
    const d = state.design;
    if (!d.extracted) {
      out.innerHTML = '<p class="po-none">이미지를 올리면 배경·포인트 색을 뽑아 지금 고른 구도에 입힙니다. 레이아웃·폰트는 위에서 고른 레퍼런스를 그대로 따릅니다.</p>';
      return;
    }
    const ex = d.extracted;
    const chips = [];
    chips.push('<span class="' + (ex.allPass ? 'ok' : 'bad') + '">대비 ' + (ex.allPass ? 'AA 통과' : 'AA 미달') + '</span>');
    chips.push('<span>신뢰도 ' + Math.round((ex.confidence || 0) * 100) + '%</span>');
    if (ex.isDefaultLook && ex.isDefaultLook.risk >= 0.6) chips.push('<span class="warn">AI 기본값 주의</span>');
    if (d.theme) chips.push('<span class="ok">팔레트 적용됨</span>');
    out.innerHTML =
      (d.image ? '<img class="palette-thumb" src="' + C.escapeHtml(d.image) + '" alt="레퍼런스 이미지" />' : '') +
      '<div class="palette-swatches">' + (ex.paletteList || []).map(function (p) {
        return '<i style="background:' + C.escapeHtml(p.value) + '" title="' + p.key + ' ' + p.value + '"></i>';
      }).join('') + '</div>' +
      '<div class="palette-meta">' + chips.join('') + '</div>' +
      '<div class="palette-actions">' +
      '<button class="btn btn-ghost" data-action="apply-palette">팔레트 적용</button>' +
      '<button class="btn btn-ghost" data-action="reset-palette">원래 색</button>' +
      '<button class="btn btn-ghost danger" data-action="clear-image">이미지 빼기</button>' +
      '</div>' +
      '<p class="foot-note" style="margin:0">추출 ' + C.escapeHtml(ex.palette.bg) + ' 배경 · ' +
      C.escapeHtml(ex.palette.accent) + ' 포인트 · ' + (ex.raw ? ex.raw.length : 0) + '색 분석</p>';
  }

  function handleDesignImage(file) {
    if (!file) return;
    if (!/^image\//.test(file.type)) {
      toast('이미지 파일만 올릴 수 있어요', 'warn');
      return;
    }
    const reader = new FileReader();
    reader.onload = function () {
      const img = new Image();
      img.onload = function () {
        const max = 480;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const cv = document.createElement('canvas');
        cv.width = w;
        cv.height = h;
        const g = cv.getContext('2d');
        g.drawImage(img, 0, 0, w, h);
        let data = null;
        try { data = g.getImageData(0, 0, w, h); } catch (e) { data = null; }
        if (!data) { toast('이미지를 읽지 못했어요', 'warn'); return; }
        const ex = C.paletteFromPixels(data.data);
        if (!ex || !ex.ok) {
          toast('색을 뽑지 못했어요. 다른 이미지로 해보세요', 'warn');
          return;
        }
        const dataUrl = String(reader.result);
        state.design.extracted = {
          palette: ex.palette,
          paletteList: ex.paletteList,
          raw: ex.raw,
          allPass: ex.allPass,
          confidence: ex.confidence,
          isDefaultLook: ex.isDefaultLook,
        };
        state.design.image = dataUrl;
        state.design.imageName = file.name || 'reference';
        state.design.theme = null;
        renderDesignPreview();
        renderPalette();
        toast('팔레트를 뽑았어요. [팔레트 적용]을 누르면 이 구도에 색을 입힙니다');
      };
      img.onerror = function () { toast('이미지를 열지 못했어요', 'warn'); };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  }

  function applyExtractedPalette() {
    const ex = state.design.extracted;
    if (!ex) { toast('먼저 레퍼런스 이미지를 올려 주세요', 'warn'); return; }
    const theme = C.themeFromPalette(ex.palette, state.design.refId, '내 레퍼런스');
    if (!theme) { toast('팔레트를 적용하지 못했어요', 'warn'); return; }
    state.design.theme = theme;
    renderDesignPreview();
    renderPalette();
    toast('추출 팔레트를 ' + (lastDesign ? lastDesign.name : '선택한') + ' 구도에 입혔어요');
  }

  /* ── 내 구독 AI 브리지 ─────────────────────────────── */
  function bridgeInputData() {
    const kit = C.buildCopyKit({
      name: state.name, target: state.target, benefits: state.benefits,
      weakness: state.weakness, keyword: state.keyword,
    });
    const kitText = kit.fullText;
    return {
      name: state.name, keyword: state.keyword, target: state.target,
      benefits: state.benefits, weakness: state.weakness,
      platform: state.platform, price: state.margin.price,
      kitText: kitText,
      psych: C.diagnoseCopy(kitText),
      friction: C.detectCopy(kitText),
      designName: lastDesign ? lastDesign.name : '',
    };
  }

  function currentPrompt() {
    const p = C.bridgePrompt(state.bridge.task, bridgeInputData());
    lastPrompt = p;
    return p;
  }

  function renderBridge() {
    const tasks = $('#bridgeTasks');
    if (!tasks) return;
    tasks.innerHTML = C.BRIDGE_TASKS.map(function (t) {
      return '<button type="button" class="chip' + (state.bridge.task === t.id ? ' is-on' : '') + '" data-action="bridge-task" data-task="' + t.id + '">' +
        C.escapeHtml(t.label) + '</button>';
    }).join('');
    const p = currentPrompt();
    $('#promptTitle').textContent = p.title;
    $('#promptChars').textContent = p.chars.toLocaleString('ko-KR') + '자';
    $('#promptText').textContent = p.prompt;
    $('#bridgeActions').innerHTML = C.BRIDGE_TARGETS.map(function (t) {
      return '<button type="button" class="btn btn-ai ' + t.id + '" data-action="open-ai" data-ai="' + t.id + '">' +
        C.escapeHtml(t.label) + ' 열기</button>';
    }).join('');
    $('#bridgeApplyHint').textContent = C.bridgeTask(state.bridge.task).hint;
    renderBridgeApplied();
  }

  function renderBridgeApplied() {
    const box = $('#bridgeApplied');
    if (!box) return;
    const task = state.bridge.task;
    const parts = [];
    if (task === 'copy' && state.bridge.copy) {
      parts.push('<div class="ba-card"><div class="ba-head"><span class="ok">적용됨</span> · AI 다듬은 카피 · ' +
        C.codePoints(state.bridge.copy) + '자</div><pre>' + C.escapeHtml(state.bridge.copy) + '</pre>' +
        '<div class="ba-actions"><button class="btn btn-ghost" data-action="copy-bridge-copy">복사</button>' +
        '<button class="btn btn-ghost" data-action="go-copy">카피 탭에서 보기</button></div></div>');
    }
    if (task === 'design' && state.bridge.designNote) {
      parts.push('<div class="ba-card"><div class="ba-head"><span class="ok">적용됨</span> · 디자인 AI 메모</div>' +
        '<pre>' + C.escapeHtml(state.bridge.designNote) + '</pre>' +
        '<div class="ba-actions"><button class="btn btn-ghost" data-action="copy-design-note">복사</button></div></div>');
    }
    if (task === 'faq' && state.bridge.faqs.length) {
      parts.push('<div class="ba-card"><div class="ba-head"><span class="ok">적용됨</span> · FAQ ' +
        state.bridge.faqs.length + '개 (카피 탭 목록에 추가)</div>' +
        state.bridge.faqs.map(function (f) {
          return '<pre>Q. ' + C.escapeHtml(f.q) + '\nA. ' + C.escapeHtml(f.a) + '</pre>';
        }).join('') +
        '<div class="ba-actions"><button class="btn btn-ghost" data-action="go-copy">카피 탭에서 보기</button>' +
        '<button class="btn btn-ghost danger" data-action="clear-ai-faq">추가한 FAQ 빼기</button></div></div>');
    }
    if (task === 'name' && state.bridge.names.length) {
      parts.push('<div class="ba-card"><div class="ba-head"><span class="ok">채점 완료</span> · 상품명 ' +
        state.bridge.names.length + '안</div>' +
        state.bridge.names.map(function (n, i) {
          const cls = n.total >= 90 ? 'good' : (n.total < 60 ? 'bad' : '');
          return '<div class="ai-name"><span class="an-text">' + C.escapeHtml(n.text) + '</span>' +
            '<span class="an-score ' + cls + '">' + n.total + '점 ' + n.grade + '</span>' +
            '<button class="btn btn-ghost" data-action="apply-ai-name" data-index="' + i + '">적용</button></div>';
        }).join('') + '</div>');
    }
    if (!parts.length) {
      const hints = {
        copy: '카피 결과를 붙여넣고 [결과 적용]을 누르면 카피 탭의 “AI 다듬은 카피”로 들어갑니다.',
        faq: 'Q./A. 문답을 붙여넣으면 카피 탭 FAQ 목록에 AI 표시로 추가됩니다.',
        name: '상품명 5줄을 붙여넣으면 이 앱 채점기로 다시 점수를 냅니다.',
        design: '디자인 방향·팔레트를 붙여넣으면 이 탭에 AI 메모로 저장됩니다.',
      };
      parts.push('<p class="muted" style="font-size:11px">' + hints[task] + '</p>');
    }
    box.innerHTML = parts.join('');
  }

  function openBridgeAI(id) {
    const p = lastPrompt || currentPrompt();
    const target = C.bridgeTarget(id);
    let win = null;
    try { win = window.open(C.bridgeUrl(id, p.prompt), '_blank'); } catch (e) { win = null; }
    if (win) { try { win.opener = null; } catch (e) { /* cross-origin */ } }
    copyText(p.prompt, '프롬프트');
    if (!win) toast('새 창이 차단됐어요. 프롬프트는 복사해 두었으니 ' + target.label + '에 붙여넣으세요.', 'warn');
    else toast(target.label + '을 열었어요 · 프롬프트가 복사되어 있습니다');
  }

  function applyBridge() {
    const ta = $('#bridgeResult');
    const text = ta ? ta.value : '';
    if (!String(text).trim()) { toast('붙여넣은 결과가 없어요', 'warn'); return; }
    state.bridge.result = text;
    const task = state.bridge.task;
    const parsed = C.parseBridgeResult(task, text);
    if (task === 'copy') {
      state.bridge.copy = parsed.text;
      renderKit();
      renderPsych();
      toast('AI 다듬은 카피 ' + C.codePoints(parsed.text) + '자를 카피 탭에 넣었어요');
    } else if (task === 'design') {
      state.bridge.designNote = parsed.text;
      toast('디자인 AI 메모로 저장했어요');
    } else if (task === 'faq') {
      if (!parsed.ok) { toast('Q./A. 형식을 찾지 못했어요. 문답을 그대로 붙여넣어 주세요', 'warn'); return; }
      state.bridge.faqs = parsed.faqs.map(function (f) { return { q: f.q, a: f.a }; });
      renderKit();
      toast('FAQ ' + parsed.count + '개를 카피 탭에 추가했어요');
    } else if (task === 'name') {
      if (!parsed.ok) { toast('상품명 줄을 찾지 못했어요. 한 줄에 하나씩 붙여넣어 주세요', 'warn'); return; }
      state.bridge.names = parsed.names.map(function (name) {
        const a = C.analyzeName({ platform: state.platform, name: name, keyword: state.keyword });
        return { text: name, total: a.total, grade: a.grade };
      });
      toast(parsed.names.length + '개 상품명을 채점했어요');
    }
    renderBridgeApplied();
  }

  function readGeminiKey() {
    try { return window.localStorage.getItem(LS.gemini) || ''; } catch (e) { return ''; }
  }

  function updateGeminiNote() {
    const el = $('#geminiNote');
    if (!el) return;
    const key = readGeminiKey();
    el.textContent = key
      ? '키가 이 브라우저에 저장되어 있습니다 (끝 4자 ' + key.slice(-4) + '). 아래 버튼으로 새 창 없이 실행합니다.'
      : '키를 저장하지 않았습니다. 키 없이도 위의 [열기] 버튼으로 구독 중인 앱을 쓰면 됩니다.';
  }

  function runGemini() {
    const key = readGeminiKey() || String(($('#geminiKey') || {}).value || '').trim();
    if (!key) {
      toast('Gemini API 키를 먼저 입력하고 저장하세요', 'warn');
      if ($('#geminiKey')) $('#geminiKey').focus();
      return;
    }
    const model = $('#geminiModel').value;
    const p = lastPrompt || currentPrompt();
    const btn = $('[data-action="run-gemini"]');
    if (btn) { btn.disabled = true; btn.textContent = '실행 중…'; }
    const restore = function () { if (btn) { btn.disabled = false; btn.textContent = 'Gemini API로 실행'; } };
    fetch(C.geminiEndpoint(model), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: p.prompt }] }],
        generationConfig: { temperature: 0.6, maxOutputTokens: 2048 },
      }),
    }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    }).then(function (data) {
      const cand = data && data.candidates && data.candidates[0];
      const parts = (cand && cand.content && cand.content.parts) || [];
      const text = parts.map(function (x) { return x.text || ''; }).join('\n').trim();
      if (!text) throw new Error('빈 응답');
      $('#bridgeResult').value = text;
      state.bridge.result = text;
      renderBridgeApplied();
      toast('Gemini 결과를 받았어요 · [결과 적용]을 누르세요');
    }).catch(function (err) {
      toast('Gemini 호출 실패: ' + (err && err.message ? err.message : '알 수 없는 오류'), 'warn');
    }).then(restore, restore);
  }

  /* ── 무료 AI 맛보기 (Cloudflare Worker) ─────────────────
     503(제공자 혼잡)은 클라이언트가 1회 자동 재시도, 429(한도)는 전환 카드. */

  function renderFreeLimit(res) {
    const card = $('#freeLimitCard');
    const st = $('#freeStatus');
    if (st) st.textContent = '오늘 무료 횟수를 다 썼어요';
    if (!card) return;
    const cta = (res && res.cta) || {};
    const href = cta.keyUrl || 'https://aistudio.google.com/apikey';
    card.hidden = false;
    card.innerHTML =
      '<b>무료 체험을 다 쓰셨서요</b>' +
      '<div>' + String((res && res.message) || '오늘 무료 횟수를 모두 썼어요. 내 키나 구독 AI로 이어서 살 수 있어요.').replace(/</g, '&lt;') + '</div>' +
      '<div class="free-limit-actions">' +
        '<a class="btn btn-primary btn-sm" href="' + href + '" target="_blank" rel="noopener noreferrer">내 무료 Gemini 키 연결</a>' +
        '<button type="button" class="btn btn-ghost btn-sm" onclick="document.getElementById(\'geminiKey\')&&document.getElementById(\'geminiKey\').focus()">키 입력칸으로</button>' +
      '</div>';
  }

  /* 무료 체험은 짧은 결과만 받는다(Worker 12초 제한 실측). Pro/브리지는 그대로 전체 카피. */
  function freePrompt() {
    const name = String(state.name || '').trim();
    const kw = String(state.keyword || '').trim();
    const target = String(state.target || '').trim();
    if (!name && !kw) return '';
    return '너는 스마트스토어 상품명·상세 카피 작가다. ' +
      (name ? '상품명: ' + name + '. ' : '') +
      (kw ? '목표 키워드: ' + kw + '. ' : '') +
      (target ? '고객: ' + target + '. ' : '') +
      '상품명 후보 5개(각 30자 이내)와 상세 첫 문단 3줄을 써라. 과장·최상급·보장 표현 금지. 600자 이내.';
  }

  function runFree() {
    if (!FA) { toast('무료 체험 엔진을 불러오지 못했어요', 'warn'); return; }
    if (state.free.busy) return;
    const p = { prompt: freePrompt() };
    if (!p.prompt) { toast('상품명이나 키워드를 먼저 입력해 주세요', 'warn'); return; }
    state.free.busy = true;
    const btn = $('[data-action="free-run"]');
    if (btn) { btn.disabled = true; btn.textContent = '무료 AI가 쓰는 중…'; }
    const st = $('#freeStatus');
    if (st) st.textContent = '무료로 생성 중… (5~20초)';
    const card = $('#freeLimitCard');
    if (card) card.hidden = true;
    const restore = function () {
      state.free.busy = false;
      if (btn) { btn.disabled = false; btn.textContent = '무료 AI로 실행'; }
    };
    FA.routeWith(P, { task: 'text', prompt: p.prompt, options: { temperature: 0.6, maxTokens: 600 } }, { timeoutMs: 45000 })
      .then(function (res) {
        restore();
        if (res && res.ok) {
          $('#bridgeResult').value = res.text;
          state.bridge.result = res.text;
          renderBridgeApplied();
          if (st) st.textContent = '무료로 받았어요' + (res.provider ? ' · ' + res.provider : '');
          const rem = $('#freeRemain');
          if (rem && res.remaining !== undefined && res.remaining !== null) rem.textContent = '남은 무료 ' + res.remaining + '/' + (res.limit || 5) + '회';
          toast('결과를 받았어요 · [결과 적용]을 누르세요');
          return;
        }
        if (FA.isQuota(res)) { renderFreeLimit(res); return; }
        if (st) st.textContent = (res && res.message) || '무료 체험 중 문제가 생겼어요.';
        toast((res && res.message) || '무료 체험에 실패했어요', 'warn');
      }, function () {
        restore();
        toast('무료 체험에 연결하지 못했어요', 'warn');
      });
  }

  /* ── 상품명 목록 일괄 채점 (SheetJS 지연 로딩) ─────────────── */

  let xlsxLoading = null;
  function loadXLSX() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (xlsxLoading) return xlsxLoading;
    xlsxLoading = new Promise(function (resolve, reject) {
      const s = document.createElement('script');
      s.src = 'assets/vendor/xlsx.full.min.js';
      s.async = true;
      s.onload = function () { resolve(window.XLSX); };
      s.onerror = function () { xlsxLoading = null; reject(new Error('엑셀 엔진을 불러오지 못했어요')); };
      document.head.appendChild(s);
    });
    return xlsxLoading;
  }

  function bulkRowsFromMatrix(matrix) {
    const rows = [];
    (matrix || []).forEach(function (row) {
      if (!row) return;
      const cells = row.map(function (c) { return String(c == null ? '' : c).trim(); });
      const name = cells[0] || '';
      if (!name) return;
      if (/상품명|제품명|product/i.test(name) && rows.length === 0) return;  /* 머리글 */
      rows.push({ name: name, keyword: cells[1] || '' });
    });
    return rows.slice(0, 500);
  }

  function renderBulk() {
    const wrap = $('#bulkTableWrap');
    const body = $('#bulkRows');
    const exp = $('#bulkExport');
    const clr = $('#bulkClear');
    const st = $('#bulkStatus');
    if (!body) return;
    if (exp) exp.disabled = !state.bulk.length;
    if (clr) clr.disabled = !state.bulk.length;
    if (wrap) wrap.hidden = !state.bulk.length;
    if (st) {
      st.textContent = state.bulk.length
        ? state.bulk.length + '건 · 평균 ' + Math.round(state.bulk.reduce(function (s, r) { return s + r.total; }, 0) / state.bulk.length) + '점'
        : '1열 상품명 · 2열 키워드(선택)';
    }
    body.innerHTML = state.bulk.map(function (r, i) {
      const issue = r.topIssue ? '<span class="bulk-issue">' + String(r.topIssue).replace(/</g, '&lt;') + '</span>' : '<span class="muted">—</span>';
      return '<tr><td>' + (i + 1) + '</td><td class="bulk-name">' + String(r.name).replace(/</g, '&lt;') + '</td>' +
        '<td>' + String(r.keyword || '—').replace(/</g, '&lt;') + '</td>' +
        '<td><b>' + r.total + '</b></td>' +
        '<td><span class="badge grade ' + r.grade.toLowerCase() + '">' + r.grade + '</span></td>' +
        '<td>' + issue + '</td></tr>';
    }).join('');
  }

  function scoreBulk(list) {
    const kw = state.keyword;
    state.bulk = list.map(function (row) {
      const a = C.analyzeName({ platform: state.platform, name: row.name, keyword: row.keyword || kw });
      const top = (a.issues || []).filter(function (i) { return i.level !== 'good'; })[0];
      return {
        name: row.name, keyword: row.keyword || kw,
        total: a.total, grade: a.grade,
        topIssue: top ? top.title : '',
        suggestion: (a.suggestions && a.suggestions[0] && a.suggestions[0].text) || '',
      };
    });
    renderBulk();
  }

  function importBulkFile(file) {
    if (!file) return;
    const st = $('#bulkStatus');
    if (st) st.textContent = file.name + ' 읽는 중…';
    loadXLSX().then(function (XLSX) {
      return file.arrayBuffer().then(function (buf) {
        const wb = XLSX.read(buf, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
        const list = bulkRowsFromMatrix(matrix);
        if (!list.length) { toast('읽을 상품명이 없어요. 1열에 상품명을 넣어 주세요', 'warn'); if (st) st.textContent = '읽을 행이 없어요'; return; }
        scoreBulk(list);
        toast(list.length + '건을 채점했어요');
      });
    }).catch(function (err) {
      toast((err && err.message) || '파일을 읽지 못했어요', 'warn');
      if (st) st.textContent = '파일을 읽지 못했어요';
    });
  }

  function exportBulk() {
    if (!state.bulk.length) return;
    loadXLSX().then(function (XLSX) {
      const aoa = [['상품명', '키워드', '점수', '등급', '고칠 곳', '추천 상품명']];
      state.bulk.forEach(function (r) { aoa.push([r.name, r.keyword, r.total, r.grade, r.topIssue, r.suggestion]); });
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws['!cols'] = [{ wch: 44 }, { wch: 18 }, { wch: 6 }, { wch: 6 }, { wch: 34 }, { wch: 44 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '상품명 채점');
      XLSX.writeFile(wb, '상품명-일괄채점-' + C.todayISO() + '.xlsx');
      toast('엑셀로 저장했어요');
    }).catch(function (err) {
      toast((err && err.message) || '엑셀을 만들지 못했어요', 'warn');
    });
  }

  function bulkSample() {
    scoreBulk([
      { name: '무선 핸디 청소기 가정용 미니 진공 청소기', keyword: '무선 청소기' },
      { name: '고양이 모래 먼지 없는 벤토나이트 10L', keyword: '고양이 모래' },
      { name: '원룸 미니 가습기 무드등 겸용 USB', keyword: '미니 가습기' },
      { name: '★최고급★ 캠핑 의자 접이식 초경량 1개', keyword: '캠핑 의자' },
      { name: '아기 물티슈 캡형 100매 10팩', keyword: '아기 물티슈' },
    ]);
    toast('예시 5건을 채점했어요');
  }

  /* ── 마진 ─────────────────────────────────────────── */
  function renderMargin() {
    const m = C.calcMargin(state.margin);
    const verdict = $('#verdict');
    verdict.className = 'verdict ' + (m.valid ? m.verdict : '');

    if (!m.valid) {
      $('#verdictTitle').textContent = '값을 입력하세요';
      $('#verdictSub').textContent = '판매가와 원가를 넣으면 순이익이 계산됩니다.';
      $('#verdictNet').textContent = '—';
    } else {
      $('#verdictTitle').textContent = m.verdictLabel;
      $('#verdictSub').textContent = '수수료 ' + C.formatWon(m.fee) + ' · 원가 ' + C.formatWon(m.cost) +
        ' · 배송 ' + C.formatWon(m.shipping) + ' · 광고 ' + C.formatWon(m.adCost);
      $('#verdictNet').textContent = C.formatWon(m.netProfit);
    }

    const cards = [
      { label: '순이익', value: m.valid ? C.formatWon(m.netProfit) : '—', sub: '판매 1건 · 광고비 포함', hot: true },
      { label: '마진율', value: m.valid ? C.formatPct(m.marginRate) : '—', sub: '판매가 대비' },
      { label: '손익분기 ROAS', value: C.formatRoas(m.bepRoas), sub: m.valid && m.bepRoas != null ? '광고비 ' + C.formatWon(m.breakEvenAdCost) + '까지' : '광고비 회수 불가' },
      { label: '현재 ROAS', value: C.formatRoas(m.currentRoas), sub: m.valid ? '광고비 ' + C.formatWon(m.adCost) + ' 기준' : '광고비 미입력' },
    ];
    $('#marginMetrics').innerHTML = cards.map(function (c) {
      return '<div class="metric' + (c.hot ? ' hot' : '') + '"><span>' + c.label + '</span><b>' + c.value + '</b><em>' + c.sub + '</em></div>';
    }).join('');

    const cur = m.currentRoas;
    const bep = m.bepRoas;
    $('#curRoas').textContent = C.formatRoas(cur);
    $('#bepRoas').textContent = C.formatRoas(bep);
    const bar = $('#roasBar');
    const mark = $('#roasMark');
    if (cur == null || bep == null) {
      bar.style.width = '0%';
      bar.className = '';
      mark.hidden = true;
      $('#roasHint').textContent = '광고비를 넣으면 비교합니다';
    } else {
      const max = Math.max(cur, bep) * 1.15;
      bar.style.width = C.clamp(cur / max * 100, 0, 100) + '%';
      bar.className = cur < bep ? 'bad' : '';
      mark.hidden = false;
      mark.style.left = C.clamp(bep / max * 100, 0, 100) + '%';
      $('#roasHint').textContent = cur >= bep ? '광고비 회수 가능' : '광고비가 분기점보다 높아요';
    }
    $('#roasNote').innerHTML = m.warnings && m.warnings.length
      ? m.warnings.map(function (w) { return C.escapeHtml(w); }).join('<br>')
      : '손익분기 ROAS = 판매가 ÷ (판매가 − 원가 − 배송비 − 수수료) × 100. 이 값보다 ROAS가 높아야 광고비를 뺀 뒤에도 남습니다.';

    const rows = C.priceSimulation(state.margin, { steps: 9, span: 0.2 });
    $('#simBody').innerHTML = rows.length ? rows.map(function (r) {
      const delta = r.isBase ? '기준' : (r.deltaPct > 0 ? '+' : '') + r.deltaPct + '%';
      const cls = r.netProfit < 0 ? 'neg' : r.netProfit > 0 ? 'pos' : '';
      return '<tr class="' + (r.isBase ? 'is-base' : '') + '" data-action="apply-price" data-price="' + r.price + '" title="이 가격을 적용">' +
        '<td>' + C.formatNumber(r.price) + '원<span class="sim-delta">' + delta + '</span></td>' +
        '<td>' + C.formatNumber(r.fee) + '</td>' +
        '<td class="' + cls + '">' + C.formatNumber(r.netProfit) + '</td>' +
        '<td class="' + cls + '">' + C.formatPct(r.marginRate) + '</td>' +
        '<td>' + C.formatRoas(r.bepRoas) + '</td>' +
        '</tr>';
    }).join('') : '<tr><td colspan="5" class="muted" style="text-align:center;padding:16px">판매가를 입력하면 가격별 표가 나옵니다.</td></tr>';
  }

  /* ── 저장함 ───────────────────────────────────────── */
  function filteredItems() {
    const list = state.items.slice();
    const filtered = state.filter === 'all' ? list : list.filter(function (p) { return p.status === state.filter; });
    filtered.sort(function (a, b) {
      if (state.sort === 'score') return (b.score == null ? -1 : b.score) - (a.score == null ? -1 : a.score);
      if (state.sort === 'profit') return (b.netProfit == null ? -Infinity : b.netProfit) - (a.netProfit == null ? -Infinity : a.netProfit);
      if (state.sort === 'name') return String(a.name).localeCompare(String(b.name), 'ko');
      return String(b.savedAt).localeCompare(String(a.savedAt));
    });
    return filtered;
  }

  function renderSaved() {
    const counts = { all: state.items.length };
    C.STATUSES.forEach(function (s) { counts[s.id] = 0; });
    state.items.forEach(function (p) { counts[p.status] = (counts[p.status] || 0) + 1; });

    const chips = [{ id: 'all', label: '전체' }].concat(C.STATUSES.map(function (s) { return { id: s.id, label: s.label }; }));
    $('#savedChips').innerHTML = chips.map(function (c) {
      return '<button class="chip' + (state.filter === c.id ? ' is-on' : '') + '" data-action="filter-saved" data-filter="' + c.id + '">' +
        C.escapeHtml(c.label) + ' <span class="chip-n">' + (counts[c.id] || 0) + '</span></button>';
    }).join('');

    const list = filteredItems();
    $('#savedRows').innerHTML = list.map(function (p) {
      const st = C.statusMeta(p.status);
      const badge = p.grade ? '<span class="badge grade ' + String(p.grade).toLowerCase() + '">' + p.grade + '</span>' : '';
      return '<div class="saved-row" data-id="' + C.escapeHtml(p.id) + '">' +
        '<span class="s-main" data-label="상품"><span class="s-name">' + C.escapeHtml(p.name) + '</span>' +
        '<span class="s-sub">' + C.escapeHtml(p.keyword || '키워드 없음') + '</span></span>' +
        '<span data-label="플랫폼">' + C.escapeHtml(C.getPlatform(p.platform).label) + '</span>' +
        '<span class="num s-score" data-label="점수">' + badge + (p.score == null ? '—' : p.score) + '</span>' +
        '<span class="num' + (p.netProfit < 0 ? ' s-neg' : '') + '" data-label="순이익">' + (p.netProfit == null ? '—' : C.formatWon(p.netProfit)) + '</span>' +
        '<span class="num" data-label="마진율">' + (p.marginRate == null ? '—' : C.formatPct(p.marginRate)) + '</span>' +
        '<span data-label="상태"><span class="badge status ' + st.id + '">' + st.label + '</span></span>' +
        '<span class="num" data-label="저장일">' + C.formatDateKR(p.savedAt) + '</span>' +
        '<span class="s-actions">' +
        '<button class="btn btn-ghost" data-action="open-saved" data-id="' + C.escapeHtml(p.id) + '">열기</button>' +
        '<button class="btn btn-ghost danger" data-action="delete-saved" data-id="' + C.escapeHtml(p.id) + '">삭제</button>' +
        '</span></div>';
    }).join('');

    $('#savedEmpty').hidden = state.items.length > 0;
    $('#savedTable').hidden = state.items.length === 0;
    $('#savedFoot').textContent = state.items.length + '개 저장 · 표시 ' + list.length + '개';
    const tabCount = $('#savedCount');
    tabCount.hidden = state.items.length === 0;
    tabCount.textContent = state.items.length;
  }

  /* ── 모달 ─────────────────────────────────────────── */
  function closeModal() {
    const root = $('#modalRoot');
    root.hidden = true;
    root.innerHTML = '';
  }

  function openModal(html) {
    const root = $('#modalRoot');
    root.innerHTML = '<div class="modal-backdrop" data-action="close-modal"></div>' + html;
    root.hidden = false;
    const focusable = root.querySelector('input, select, textarea, button');
    if (focusable) focusable.focus();
  }

  function openSaveModal() {
    if (!state.name.trim()) {
      toast('상품명을 먼저 입력하세요', 'warn');
      $('#productName').focus();
      return;
    }
    const existing = state.items.find(function (p) { return p.name === state.name.trim() && p.platform === state.platform; });
    const a = C.analyzeName({ platform: state.platform, name: state.name, keyword: state.keyword });
    const m = C.calcMargin(state.margin);
    const status = existing ? existing.status : 'plan';
    const memo = existing ? existing.memo || '' : '';

    openModal(
      '<div class="modal" role="dialog" aria-modal="true" aria-label="작업 저장">' +
      '<div class="modal-head"><h2>작업 저장</h2><button class="modal-close" data-action="close-modal" aria-label="닫기">✕</button></div>' +
      '<div class="modal-body">' +
      '<div class="save-preview">' + C.escapeHtml(state.name) + '</div>' +
      '<div class="save-meta"><span>' + C.escapeHtml(C.getPlatform(state.platform).label) + '</span>' +
      '<span>점수 <b>' + a.total + '</b></span>' +
      '<span>순이익 <b>' + (m.valid ? C.formatWon(m.netProfit) : '—') + '</b></span>' +
      (existing ? '<span>같은 상품이 있어 <b>업데이트</b>됩니다</span>' : '') + '</div>' +
      '<div class="field"><label for="saveStatus">상태</label><select id="saveStatus">' +
      C.STATUSES.map(function (s) { return '<option value="' + s.id + '"' + (s.id === status ? ' selected' : '') + '>' + s.label + '</option>'; }).join('') +
      '</select></div>' +
      '<div class="field"><label for="saveMemo">메모</label><textarea id="saveMemo" placeholder="예: 11/22 등록 예정, 썸네일 교체 후">' + C.escapeHtml(memo) + '</textarea></div>' +
      '<div class="modal-actions">' +
      '<button class="btn btn-ghost" data-action="close-modal">취소</button>' +
      '<button class="btn btn-primary" data-action="confirm-save">저장</button>' +
      '</div></div></div>'
    );
  }

  function confirmSave() {
    const statusEl = $('#saveStatus');
    const memoEl = $('#saveMemo');
    const status = statusEl ? statusEl.value : 'plan';
    const memo = memoEl ? memoEl.value.trim().slice(0, 500) : '';
    const a = C.analyzeName({ platform: state.platform, name: state.name, keyword: state.keyword });
    const m = C.calcMargin(state.margin);
    const name = state.name.trim();
    const existing = state.items.find(function (p) { return p.name === name && p.platform === state.platform; });
    const item = {
      id: existing ? existing.id : C.uid('product'),
      name: name,
      platform: state.platform,
      keyword: state.keyword.trim(),
      score: a.total,
      grade: a.grade,
      price: m.valid ? m.price : null,
      netProfit: m.valid ? m.netProfit : null,
      marginRate: m.valid ? m.marginRate : null,
      bepRoas: m.valid ? m.bepRoas : null,
      margin: m.valid ? Object.assign({}, state.margin) : null,
      design: lastDesign ? { refId: state.design.refId, name: lastDesign.name } : null,
      job: {
        target: state.target,
        benefits: state.benefits.slice(0, 3),
        weakness: state.weakness,
      },
      status: status,
      memo: memo,
      savedAt: new Date().toISOString(),
    };
    if (existing) {
      state.items = state.items.map(function (p) { return p.id === existing.id ? item : p; });
    } else {
      state.items = [item].concat(state.items);
    }
    saveItems();
    renderSaved();
    closeModal();
    toast(existing ? '작업을 업데이트했어요' : '저장함에 담았어요');
  }

  function openDeleteModal(id) {
    const item = state.items.find(function (p) { return p.id === id; });
    if (!item) return;
    openModal(
      '<div class="modal" role="dialog" aria-modal="true" aria-label="삭제 확인">' +
      '<div class="modal-head"><h2>삭제할까요?</h2><button class="modal-close" data-action="close-modal" aria-label="닫기">✕</button></div>' +
      '<div class="modal-body">' +
      '<div class="save-preview">' + C.escapeHtml(item.name) + '</div>' +
      '<p class="muted" style="font-size:11.5px">이 브라우저의 저장함에서만 지워집니다.</p>' +
      '<div class="modal-actions">' +
      '<button class="btn btn-ghost" data-action="close-modal">취소</button>' +
      '<button class="btn btn-primary" data-action="confirm-delete" data-id="' + C.escapeHtml(id) + '">삭제</button>' +
      '</div></div></div>'
    );
  }

  /* ── 샘플·불러오기 ────────────────────────────────── */
  function applySample(sampleId) {
    const s = D.SAMPLES.find(function (x) { return x.id === sampleId; }) || D.SAMPLES[0];
    Object.assign(state, normalizeDraft({
      platform: s.platform, name: s.name, keyword: s.keyword, target: s.target,
      benefits: s.benefits, weakness: s.weakness, margin: s.margin,
    }));
    syncForm();
    saveDraft();
    renderScore();
    renderKit();
    renderMargin();
    setTab('score');
    toast(C.josa(s.label, '을/를') + ' 불러왔어요');
  }

  function clearProduct() {
    state.name = '';
    state.keyword = '';
    state.target = '';
    state.benefits = ['', '', ''];
    state.weakness = '';
    syncForm();
    saveDraft();
    renderScore();
    renderKit();
    toast('입력을 비웠어요');
    $('#productName').focus();
  }

  function clearMargin() {
    state.margin = { price: 0, cost: 0, shipping: 0, feeRate: 0, adCost: 0 };
    syncForm();
    saveDraft();
    renderMargin();
    toast('마진 입력을 비웠어요');
  }

  function openSavedItem(id) {
    const item = state.items.find(function (p) { return p.id === id; });
    if (!item) return;
    state.platform = item.platform;
    state.name = item.name;
    state.keyword = item.keyword || '';
    if (item.job && typeof item.job === 'object') {
      state.target = String(item.job.target || '');
      const benefits = Array.isArray(item.job.benefits) ? item.job.benefits : [];
      state.benefits = [0, 1, 2].map(function (i) { return String(benefits[i] == null ? '' : benefits[i]); });
      state.weakness = String(item.job.weakness || '');
    }
    if (item.margin && typeof item.margin === 'object') {
      state.margin = {
        price: Math.max(0, C.toNumber(item.margin.price)),
        cost: Math.max(0, C.toNumber(item.margin.cost)),
        shipping: Math.max(0, C.toNumber(item.margin.shipping)),
        feeRate: C.clamp(C.toNumber(item.margin.feeRate), 0, 50),
        adCost: Math.max(0, C.toNumber(item.margin.adCost)),
      };
    } else if (item.price != null) {
      state.margin.price = item.price;
    }
    if (item.design && item.design.refId) {
      state.design.refId = item.design.refId;
      state.design.theme = null;
    }
    state.diagnosisText = '';
    syncForm();
    saveDraft();
    renderScore();
    renderKit();
    renderMargin();
    setTab('score');
    toast('저장한 상품을 열었어요');
  }

  function importJSON(text) {
    const parsed = C.parseProductsJSON(text);
    if (parsed.error) { toast(parsed.error, 'warn'); return; }
    const merged = state.items.slice();
    let added = 0;
    parsed.items.forEach(function (item) {
      const dup = merged.find(function (p) { return p.name === item.name && p.platform === item.platform; });
      if (dup) {
        merged[merged.indexOf(dup)] = Object.assign({}, item, { id: dup.id });
      } else {
        merged.push(item);
        added++;
      }
    });
    state.items = merged;
    saveItems();
    renderSaved();
    toast(added + '개를 가져왔어요' + (parsed.items.length - added > 0 ? ' (중복 ' + (parsed.items.length - added) + '개 갱신)' : ''));
  }

  /* ══════════════════════════════════════════════════════════
     v2 — 레퍼런스 검색 · 사진 해부 · 폰트 믹스 · 질감 · 브랜드 키트
     ══════════════════════════════════════════════════════════ */
  function v2StageFit() {
    const stage = $('#v2Stage');
    if (!stage) return;
    const fit = stage.querySelector('.stage-fit');
    if (!fit) return;
    const card = fit.firstElementChild;
    if (!card) return;
    const avail = Math.max(120, stage.clientWidth - 24);
    const cw = card.offsetWidth || 440;
    const ch = card.offsetHeight || 550;
    const s = Math.min(1, avail / cw);
    fit.style.width = Math.round(cw * s) + 'px';
    fit.style.height = Math.round(ch * s) + 'px';
    card.style.transformOrigin = 'top left';
    card.style.transform = 'scale(' + s + ')';
  }

  function mixName(id) {
    const m = C.designV2Info().mixes.filter(function (x) { return x.id === id; })[0];
    return m ? m.name : id;
  }

  function grainName(id) {
    const g = C.designV2Info().grains.filter(function (x) { return x.id === id; })[0];
    return g ? g.name : id;
  }

  function ensureV2Controls() {
    const info = C.designV2Info();
    const ver = $('#v2Version');
    if (ver) ver.textContent = info.ok ? '엔진 ' + info.version : '엔진 없음';
    const fm = $('#v2FontMix');
    if (fm && info.mixes.length && fm.options.length !== info.mixes.length) {
      fm.innerHTML = info.mixes.map(function (m) {
        return '<option value="' + C.escapeHtml(m.id) + '">' + C.escapeHtml(m.name) + '</option>';
      }).join('');
    }
    const gr = $('#v2Grain');
    if (gr && info.grains.length && gr.options.length !== info.grains.length) {
      gr.innerHTML = info.grains.map(function (g) {
        return '<option value="' + C.escapeHtml(g.id) + '">' + C.escapeHtml(g.name) + '</option>';
      }).join('');
    }
    if (fm) fm.value = state.v2.fontMix;
    if (gr) gr.value = state.v2.grain;
    const note = $('#v2MixNote');
    if (note) {
      const m = info.mixes.filter(function (x) { return x.id === state.v2.fontMix; })[0];
      const g = info.grains.filter(function (x) { return x.id === state.v2.grain; })[0];
      note.textContent = (m ? m.note : '') + (g && g.amount > 0 ? ' · ' + g.name + '는 인쇄 질감입니다.' : '');
    }
  }

  function renderV2Density() {
    const box = $('#v2Density');
    if (!box) return;
    const d = C.checkDensity(C.designContent(designInput()));
    if (!d) { box.hidden = true; return; }
    box.hidden = false;
    box.className = 'density-line ' + (d.over ? 'over' : 'ok');
    box.innerHTML = '<b>' + d.counts.title + '+' + d.counts.body + '+' + d.counts.cta + '자</b> · ' +
      C.escapeHtml(d.message);
  }

  function renderV2RefLinks() {
    const box = $('#v2RefLinks');
    if (!box) return;
    const r = C.referenceSearches(designInput());
    if (!r.ok) {
      box.innerHTML = '<p class="po-none">디자인 엔진 v2를 불러오지 못했어요.</p>';
      return;
    }
    box.innerHTML = r.links.slice(0, 6).map(function (l) {
      return '<button type="button" class="ref-link" data-action="v2-open-search" data-url="' +
        C.escapeHtml(l.url) + '" data-label="' + C.escapeHtml(l.label) + '" title="' +
        C.escapeHtml(l.label) + '">' +
        '<span class="rl-site">' + C.escapeHtml(l.siteLabel) + '</span>' +
        '<span class="rl-q">' + C.escapeHtml(l.q) + '</span>' +
        '<span class="rl-go" aria-hidden="true">↗</span></button>';
    }).join('');
    $('#v2RefNote').textContent = r.context.industry + ' · ' + r.context.purposeLabel + ' · ' + r.context.mood +
      ' · 밀도 ' + r.context.density.level + ' — 누르면 새 창에서 검색합니다.';
  }

  function renderV2Card() {
    const stage = $('#v2Stage');
    if (!stage) return;
    const src = state.v2.source || { kind: 'preset', presetId: state.design.refId };
    const res = C.v2Card(src, designInput(), {
      width: 440,
      fontMix: state.v2.fontMix,
      grain: state.v2.grain,
      palette: state.design.theme && state.design.theme.palette ? state.design.theme.palette : undefined,
    });
    if (!res || !res.ok) {
      stage.innerHTML = '<p class="v2-empty">' + C.escapeHtml((res && res.error) || '카드를 만들지 못했어요.') + '</p>';
      lastV2 = null;
      return;
    }
    lastV2 = res;
    stage.innerHTML = '<div class="stage-fit">' + res.html + '</div>';
    window.requestAnimationFrame(v2StageFit);
    const name = $('#v2CardName');
    if (name) {
      const kindLabel = res.kind === 'blueprint' ? '사진 복제' : (res.kind === 'kit' ? '브랜드 고정' : '프리셋 + 믹스');
      name.textContent = res.name + ' · ' + kindLabel;
    }
    v2StageFit();

    const meta = $('#v2Meta');
    if (meta) {
      const m = res.meta || {};
      const chips = [];
      chips.push('<span>' + C.escapeHtml(mixName(res.fontMix)) + '</span>');
      chips.push('<span>' + C.escapeHtml(grainName(res.grain)) + '</span>');
      if (m.titleSize) chips.push('<span>제목 ' + m.titleSize + 'px · ' + (m.titleLines || 1) + '줄</span>');
      if (m.contrast) {
        chips.push('<span class="' + (m.contrast.title >= 4.5 ? 'ok' : 'warn') + '">제목 대비 ' +
          m.contrast.title + ':1</span>');
      }
      if (m.structure) chips.push('<span>' + C.escapeHtml(m.structure) + '</span>');
      if (m.density) chips.push('<span>' + m.density.total + '자</span>');
      meta.innerHTML = chips.join('');
    }

    const warns = $('#v2Warnings');
    if (warns) {
      const list = (res.warnings || []).slice();
      if (res.drift) list.unshift('브랜드 키트와 다른 폰트·질감으로 미리보기 중입니다.');
      warns.innerHTML = list.map(function (w) { return '<p>' + C.escapeHtml(w) + '</p>'; }).join('');
    }
    renderV2Density();
  }

  function renderV2() {
    if (!C.designV2Ready()) return;
    ensureV2Controls();
    renderV2RefLinks();
    renderV2Card();
    renderKitList();
  }

  function brandKits() {
    const raw = readJSON(LS.kits, []);
    if (!Array.isArray(raw)) return [];
    return raw.filter(function (k) {
      return k && k.schema === 'designref.brandkit/2' && k.type && k.palette;
    }).slice(0, 12);
  }

  function saveBrandKits(list) {
    writeJSON(LS.kits, list.slice(0, 12));
  }

  function renderKitList() {
    const box = $('#v2KitList');
    if (!box) return;
    const kits = brandKits();
    if (!kits.length) {
      box.innerHTML = '<p class="po-none">아직 고정한 브랜드가 없습니다. 마음에 드는 카드에서 이름을 넣고 <b>현재 카드 고정</b>을 누르세요.</p>';
      return;
    }
    const onId = state.v2.source && state.v2.source.kind === 'kit' && state.v2.source.kit
      ? state.v2.source.kit.id : '';
    box.innerHTML = kits.map(function (k) {
      return '<div class="kit-item' + (k.id === onId ? ' is-on' : '') + '">' +
        '<span class="ki-main"><b>' + C.escapeHtml(k.name) + '</b><em>' +
        C.escapeHtml((k.base && k.base.kind === 'blueprint' ? '사진 복제' : (k.base && k.base.presetId) || '프리셋') +
          ' · ' + mixName(k.type && k.type.fontMix) + ' · ' + grainName(k.grain && k.grain.id)) + '</em></span>' +
        '<button type="button" data-action="v2-apply-kit" data-id="' + C.escapeHtml(k.id) + '">적용</button>' +
        '<button type="button" class="danger" data-action="v2-delete-kit" data-id="' + C.escapeHtml(k.id) + '" aria-label="' +
        C.escapeHtml(k.name) + ' 삭제">✕</button></div>';
    }).join('');
  }

  function currentV2Kit() {
    const src = state.v2.source || { kind: 'preset' };
    if (lastV2 && lastV2.kit) return lastV2.kit;
    if (src.kind === 'kit' && src.kit) return src.kit;
    return null;
  }

  function saveCurrentKit() {
    const kit = currentV2Kit();
    if (!kit) { toast('먼저 카드를 렌더해 주세요', 'warn'); return; }
    const nameInput = $('#v2KitName');
    const name = String((nameInput && nameInput.value) || '').trim() || (state.name ? C.designTitleFromName(state.name) + ' 브랜드' : '내 브랜드');
    let named;
    try {
      named = C.ENGINES.DesignRef.serializeBrandKit(kit, { name: name });
    } catch (e) { named = kit; named.name = name; }
    const list = brandKits().filter(function (k) { return k.id !== named.id && k.name !== named.name; });
    list.unshift(named);
    saveBrandKits(list);
    renderKitList();
    toast('브랜드 키트 “' + name + '”를 고정했어요');
  }

  function applyKitById(id) {
    const kit = brandKits().filter(function (k) { return k.id === id; })[0];
    if (!kit) return;
    state.v2.source = { kind: 'kit', kit: kit };
    state.v2.fontMix = (kit.type && kit.type.fontMix) || state.v2.fontMix;
    state.v2.grain = (kit.grain && kit.grain.id) || 'none';
    ensureV2Controls();
    renderV2Card();
    renderKitList();
    toast('“' + kit.name + '” 키트를 적용했어요 · 폰트·질감·구도 고정');
  }

  function copyVisionPrompt() {
    const vp = C.visionPrompt(designInput());
    if (!vp.ok) { toast('디자인 엔진 v2를 불러오지 못했어요', 'warn'); return null; }
    copyText(vp.prompt, '레퍼런스 해부 프롬프트');
    const st = $('#v2BpState');
    if (st) st.textContent = vp.chars.toLocaleString('ko-KR') + '자 · 사진과 함께 붙여넣기';
    return vp;
  }

  function openVisionAI(targetId) {
    const vp = copyVisionPrompt();
    const t = C.bridgeTarget(targetId);
    const url = vp && t.id !== 'gemini' ? C.bridgeUrl(t.id, vp.prompt) : t.home;
    window.open(url, '_blank', 'noopener');
  }

  function blueprintMeta(res) {
    const meta = $('#v2BpMeta');
    if (!meta) return;
    const m = res.meta || {};
    const chips = [];
    if (m.blueprintId) chips.push('<span>' + C.escapeHtml(m.blueprintId) + '</span>');
    if (m.zones) chips.push('<span>존 5개 · 블루프린트</span>');
    if (m.titleSize) chips.push('<span>제목 ' + m.titleSize + 'px · ' + (m.titleLines || 1) + '줄</span>');
    if (m.overflow) chips.push('<span class="warn">카드 밖으로 나가는 요소 있음</span>');
    if (m.contrast && m.contrast.title) {
      chips.push('<span class="' + (m.contrast.title >= 4.5 ? 'ok' : 'warn') + '">제목 대비 ' + m.contrast.title + ':1</span>');
    }
    if (res.density) chips.push('<span>' + res.density.counts.total + '자 · ' + res.density.label + '</span>');
    meta.innerHTML = chips.join('');
  }

  function renderBlueprint(silent) {
    const ta = $('#v2BlueprintText');
    if (!ta) return;
    const res = C.applyBlueprint(ta.value, designInput(), { width: 440 });
    const warns = $('#v2BpWarnings');
    if (!res.ok) {
      if (warns) warns.innerHTML = '<p>' + C.escapeHtml(res.error) + '</p>';
      if (!silent) toast(res.error, 'warn');
      const st = $('#v2BpState');
      if (st) st.textContent = '읽지 못함';
      return;
    }
    lastBlueprint = res;
    state.v2.source = { kind: 'blueprint', blueprint: res.blueprint, name: res.name };
    blueprintMeta(res);
    if (warns) {
      const list = (res.fixes || []).slice(0, 4).map(function (f) {
        return '보정: ' + (typeof f === 'string' ? f : (f.note || f.field || JSON.stringify(f)));
      }).concat(res.warnings || []);
      warns.innerHTML = list.map(function (w) { return '<p>' + C.escapeHtml(String(w).slice(0, 180)) + '</p>'; }).join('');
    }
    const st = $('#v2BpState');
    if (st) st.textContent = '설계도 적용 · ' + res.name;
    renderV2Card();
    if (!silent) toast('사진에서 잰 구도로 카드를 다시 그렸어요');
  }

  /* ══════════════════════════════════════════════════════════
     경쟁강도 — 1초 계산기 · 표 일괄 · 추천 정렬
     ══════════════════════════════════════════════════════════ */
  function competCurrent() {
    return C.competitionRow({
      keyword: $('#compKeyword') ? $('#compKeyword').value : '',
      pc: $('#compPc') ? $('#compPc').value : '',
      mobile: $('#compMobile') ? $('#compMobile').value : '',
      products: $('#compProducts') ? $('#compProducts').value : '',
    });
  }

  function gradeChip(grade) {
    return '<span class="c-grade grade-' + C.escapeHtml(grade.tone || grade.id) + '">' + C.escapeHtml(grade.label) + '</span>';
  }

  function renderCompetResult() {
    const box = $('#competResult');
    if (!box) return;
    const r = competCurrent();
    if (!r.keyword || !r.searches || !r.products) {
      box.innerHTML = '<p class="cr-hint">키워드·PC·모바일 검색수·상품수를 넣으면 <b>경쟁강도 = 상품수 ÷ 월검색</b>이 바로 계산됩니다. 숫자는 ‘1.2만’처럼 써도 됩니다.</p>';
      return;
    }
    const tone = r.grade.tone || 'unknown';
    const meter = '<div class="cr-meter" aria-hidden="true">' +
      '<i class="grade-' + tone + '" style="width:' + Math.min(100, Math.round(r.score)) + '%"></i></div>' +
      '<div class="cr-scale"><span>블루오션 0.35</span><span>꿀 1.0</span><span>보통 3.0</span></div>';
    box.innerHTML =
      '<div class="cr-top"><span class="cr-index">' + C.escapeHtml(r.indexLabel) + '<small>상품/검색</small></span>' +
      '<span class="cr-grade grade-' + tone + '">' + C.escapeHtml(r.grade.label) + '</span></div>' +
      '<p class="cr-line">월 검색 <b>' + C.formatNumber(r.searches) + '</b>회 · 상품 <b>' + C.formatNumber(r.products) +
      '</b>개 → 검색 1,000회당 상품 <b>' + C.formatNumber(r.perThousand) + '</b>개</p>' +
      '<p class="cr-line">추천 점수 <b>' + r.score + '</b>/100 · ' + C.escapeHtml(r.verdict.label) + '</p>' +
      meter +
      '<div class="cr-notes">' + r.notes.slice(0, 3).map(function (n) { return '<span>' + C.escapeHtml(n) + '</span>'; }).join('') + '</div>';
  }

  function renderCompetTable() {
    const body = $('#competRows');
    if (!body) return;
    const rows = C.competitionSort(state.compet.rows, state.compet.sort);
    const empty = $('#competEmpty');
    if (empty) empty.hidden = rows.length > 0;
    const summary = C.competitionSummary(state.compet.rows);
    if (body) {
      body.innerHTML = rows.map(function (r, i) {
        return '<tr' + (i === 0 && r.score >= 50 ? ' class="is-best"' : '') + '>' +
          '<td class="c-rank">' + (i + 1) + '</td>' +
          '<td>' + C.escapeHtml(r.keyword) + '</td>' +
          '<td>' + C.formatNumber(r.searches) + '</td>' +
          '<td>' + C.formatNumber(r.products) + '</td>' +
          '<td class="c-idx">' + C.escapeHtml(r.indexLabel) + '</td>' +
          '<td>' + gradeChip(r.grade) + '</td>' +
          '<td class="c-score">' + r.score + '</td>' +
          '<td class="c-verdict">' + C.escapeHtml(r.verdict.label) + '</td>' +
          '<td class="c-act"><button type="button" data-action="compet-use-row" data-kw="' +
          C.escapeHtml(r.keyword) + '">키워드로</button> ' +
          '<button type="button" class="danger" data-action="compet-remove-row" data-kw="' +
          C.escapeHtml(r.keyword) + '" aria-label="' + C.escapeHtml(r.keyword) + ' 빼기">✕</button></td></tr>';
      }).join('');
    }
    const sum = $('#competSummary');
    if (sum) {
      sum.textContent = summary.valid ? summary.valid + '개 계산 · 상품 ' +
        C.formatNumber(state.compet.rows.reduce(function (n, r) { return n + r.products; }, 0)) + '개' : '';
    }
    const best = $('#competBest');
    if (best) {
      const b = summary.best;
      best.className = 'compet-best' + (b ? ' is-on' : '');
      best.innerHTML = b
        ? '<span class="cb-tag">먼저 노릴 키워드</span><b>' + C.escapeHtml(b.keyword) + '</b>' +
          '<span>경쟁강도 ' + C.escapeHtml(b.indexLabel) + ' · ' + C.escapeHtml(b.grade.label) + ' · 월 검색 ' +
          C.formatNumber(b.searches) + '회 · 추천 ' + b.score + '점 — ' + C.escapeHtml(b.verdict.label) + '</span>'
        : '';
    }
    const foot = $('#competFoot');
    if (foot) foot.textContent = summary.valid
      ? '표의 추천 점수는 월 검색량(로그)과 경쟁 여유를 반씩 반영하고, 레드오션은 1순위가 되지 않도록 감점합니다. 비율이 낮아도 등록 상품이 수만 개면 노출 경쟁은 셉니다.'
      : '';
  }

  function renderCompetSort() {
    const box = $('#competSort');
    if (!box) return;
    box.innerHTML = C.COMPETITION_SORTS.map(function (s) {
      return '<button type="button" class="chip' + (s.id === state.compet.sort ? ' is-on' : '') +
        '" data-action="compet-sort" data-sort="' + s.id + '">' + C.escapeHtml(s.label) + '</button>';
    }).join('');
  }

  function renderCompet() {
    renderCompetResult();
    renderCompetSort();
    renderCompetTable();
    const note = $('#competNote');
    if (note) note.textContent = D.NOTES.compet;
  }

  function persistCompet() {
    writeJSON(LS.compet, state.compet.rows.map(function (r) {
      return { keyword: r.keyword, pc: r.pc, mobile: r.mobile, searches: r.searches, products: r.products };
    }));
  }

  function addCompetRow() {
    const r = competCurrent();
    if (!r.valid) {
      toast('키워드·검색량·상품수를 모두 넣어 주세요', 'warn');
      return;
    }
    state.compet.rows = state.compet.rows.filter(function (x) {
      return x.keyword.toLowerCase() !== r.keyword.toLowerCase();
    });
    state.compet.rows.push(r);
    persistCompet();
    renderCompetTable();
    toast('“' + r.keyword + '” ' + r.grade.label + ' · ' + r.indexLabel + '로 추가했어요');
  }

  function calcCompetBulk() {
    const ta = $('#compBulk');
    const format = $('#compFormat') ? $('#compFormat').value : 'auto';
    const parsed = C.parseCompetitionText(ta ? ta.value : '', { format: format });
    const status = $('#compParseStatus');
    if (!parsed.rows.length) {
      if (status) status.innerHTML = '<span class="bad">읽은 줄이 없습니다. “키워드,PC,모바일,상품수” 순서인지 확인하세요.</span>' +
        (parsed.skipped.length ? '<span class="muted"> · ' + parsed.skipped.length + '줄 건너뜀: ' +
          C.escapeHtml(parsed.skipped[0].reason) + '</span>' : '');
      toast('계산할 줄이 없어요', 'warn');
      return;
    }
    const map = {};
    state.compet.rows.forEach(function (r) { map[r.keyword.toLowerCase()] = r; });
    parsed.rows.forEach(function (r) { map[r.keyword.toLowerCase()] = r; });
    state.compet.rows = Object.keys(map).map(function (k) { return map[k]; });
    persistCompet();
    renderCompetTable();
    if (status) {
      status.innerHTML = '<span class="ok">' + parsed.rows.length + '개 계산</span>' +
        (parsed.skipped.length ? '<span class="muted"> · ' + parsed.skipped.length + '줄 건너뜀 (' +
          C.escapeHtml(parsed.skipped.slice(0, 2).map(function (s) { return s.line + '행 ' + s.reason; }).join(', ')) + ')</span>' : '') +
        (parsed.note ? '<span class="muted"> · ' + C.escapeHtml(parsed.note) + '</span>' : '');
    }
    toast(parsed.rows.length + '개 키워드를 계산했어요');
  }

  function loadCompetSamples() {
    state.compet.rows = D.COMPETITION_SAMPLES.map(function (s) { return C.competitionRow(s); });
    const ta = $('#compBulk');
    if (ta) {
      ta.value = ['키워드,PC검색,모바일검색,상품수'].concat(D.COMPETITION_SAMPLES.map(function (s) {
        return [s.keyword, s.pc, s.mobile, s.products].join(',');
      })).join('\n');
    }
    const first = D.COMPETITION_SAMPLES[4] || D.COMPETITION_SAMPLES[0];
    if ($('#compKeyword')) $('#compKeyword').value = first.keyword;
    if ($('#compPc')) $('#compPc').value = String(first.pc);
    if ($('#compMobile')) $('#compMobile').value = String(first.mobile);
    if ($('#compProducts')) $('#compProducts').value = String(first.products);
    persistCompet();
    renderCompet();
    toast('예시 6개로 계산했어요');
  }

  function competCSVText() {
    return C.competitionCSV(C.competitionSort(state.compet.rows, state.compet.sort));
  }

  /* ── 이벤트 ───────────────────────────────────────── */
  function bindInput(selector, apply) {
    const el = $(selector);
    if (!el) return;
    el.addEventListener('input', function () {
      apply(el.value);
      onChange();
      if (document.body.getAttribute('data-tab') === 'design') {
        renderDesignContext();
        renderDesignPreview();
        renderV2Card();
      }
    });
  }

  function bindEvents() {
    bindInput('#productName', function (v) { state.name = v; });
    bindInput('#productKeyword', function (v) { state.keyword = v; });
    bindInput('#copyTarget', function (v) { state.target = v; });
    bindInput('#benefit1', function (v) { state.benefits[0] = v; });
    bindInput('#benefit2', function (v) { state.benefits[1] = v; });
    bindInput('#benefit3', function (v) { state.benefits[2] = v; });
    bindInput('#copyWeakness', function (v) { state.weakness = v; });
    bindInput('#frameProblem', function (v) { state.frames.problem = v; });
    bindInput('#frameProof', function (v) { state.frames.proof = v; });
    bindInput('#frameUrgency', function (v) { state.frames.urgency = v; });
    bindInput('#frameCta', function (v) { state.frames.cta = v; });
    bindInput('#designTitle', function (v) { state.design.title = v; });
    bindInput('#designBody', function (v) { state.design.body = v; });
    bindInput('#designCta', function (v) { state.design.cta = v; });
    bindInput('#designBadge', function (v) { state.design.badge = v; });

    $('#designIndustry').addEventListener('change', function () {
      state.design.industry = this.value;
      saveDraft();
      state.design.theme = null;
      renderDesign();
    });

    $('#designImage').addEventListener('change', function () {
      const file = this.files && this.files[0];
      if (file) handleDesignImage(file);
      this.value = '';
    });

    $('#psychText').addEventListener('input', function () {
      state.diagnosisText = this.value;
      renderPsych();
    });

    $('#bridgeResult').addEventListener('input', function () {
      state.bridge.result = this.value;
    });

    const fmSel = $('#v2FontMix');
    if (fmSel) fmSel.addEventListener('change', function () {
      state.v2.fontMix = this.value;
      saveDraft();
      renderV2();
    });
    const grSel = $('#v2Grain');
    if (grSel) grSel.addEventListener('change', function () {
      state.v2.grain = this.value;
      saveDraft();
      renderV2();
    });
    const kitInput = $('#v2KitName');
    if (kitInput) kitInput.addEventListener('input', function () { writeJSON(LS.kits + ':name', this.value); });

    ['#compKeyword', '#compPc', '#compMobile', '#compProducts'].forEach(function (sel) {
      const el = $(sel);
      if (el) el.addEventListener('input', renderCompetResult);
    });
    const compFormat = $('#compFormat');
    if (compFormat) compFormat.addEventListener('change', function () {
      if ($('#compBulk') && $('#compBulk').value.trim()) calcCompetBulk();
    });
    const compFile = $('#compFile');
    if (compFile) compFile.addEventListener('change', function () {
      const file = this.files && this.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function () {
        const ta = $('#compBulk');
        if (ta) ta.value = String(reader.result || '').replace(/^\uFEFF/, '');
        calcCompetBulk();
      };
      reader.readAsText(file, 'utf-8');
      this.value = '';
    });

    window.addEventListener('resize', function () {
      if (document.body.getAttribute('data-tab') === 'design') { fitDesignStage(); v2StageFit(); }
    });
    ['price', 'cost', 'shipping', 'feeRate', 'adCost'].forEach(function (key) {
      const map = { price: '#mPrice', cost: '#mCost', shipping: '#mShipping', feeRate: '#mFee', adCost: '#mAd' };
      bindInput(map[key], function (v) {
        const n = v === '' ? 0 : C.toNumber(v);
        state.margin[key] = key === 'feeRate' ? C.clamp(n, 0, 50) : Math.max(0, n);
      });
    });

    $('#savedSort').addEventListener('change', function () {
      state.sort = $('#savedSort').value;
      renderSaved();
    });

    $('#importFile').addEventListener('change', function () {
      const file = this.files && this.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function () { importJSON(String(reader.result || '')); };
      reader.readAsText(file, 'utf-8');
      this.value = '';
    });

    $('#feePresets').innerHTML = D.FEE_PRESETS.map(function (r) {
      return '<button type="button" class="chip" data-action="set-fee" data-fee="' + r + '">' + r + '%</button>';
    }).join('');

    document.addEventListener('click', function (ev) {
      const tabBtn = ev.target.closest('.tab');
      if (tabBtn) { setTab(tabBtn.getAttribute('data-tab')); return; }

      const platformBtn = ev.target.closest('#platformSeg button[data-platform]');
      if (platformBtn) {
        state.platform = platformBtn.getAttribute('data-platform');
        syncForm();
        onChange();
        return;
      }

      const target = ev.target.closest('[data-action]');
      if (!target) return;
      const action = target.getAttribute('data-action');

      switch (action) {
        case 'go-score': ev.preventDefault(); setTab('score'); break;
        case 'go-margin': setTab('margin'); break;
        case 'toggle-theme': toggleTheme(); break;
        case 'load-sample': applySample(target.getAttribute('data-sample')); break;
        case 'clear-product': clearProduct(); break;
        case 'copy-suggestion': {
          const s = lastSuggestions[Number(target.getAttribute('data-index'))];
          if (s) copyText(s.text, '개선 상품명');
          break;
        }
        case 'apply-suggestion': {
          const s = lastSuggestions[Number(target.getAttribute('data-index'))];
          if (s) {
            state.name = s.text;
            syncForm();
            onChange();
            toast('상품명에 적용했어요');
          }
          break;
        }
        case 'copy-headline': {
          const h = lastKit && lastKit.headlines[Number(target.getAttribute('data-index'))];
          if (h) copyText(h.text, '헤드라인');
          break;
        }
        case 'copy-section': {
          const s = lastKit && lastKit.sections[Number(target.getAttribute('data-index'))];
          if (s) copyText(s.copy, s.title + ' 카피');
          break;
        }
        case 'copy-faq': {
          const f = lastFaqList[Number(target.getAttribute('data-index'))];
          if (f) copyText('Q. ' + f.q + '\nA. ' + f.a, 'FAQ');
          break;
        }
        case 'toggle-section': {
          const card = target.closest('.section');
          const body = card && card.querySelector('.section-body');
          if (!card || !body) break;
          const open = card.classList.toggle('is-open');
          body.hidden = !open;
          target.setAttribute('aria-expanded', open ? 'true' : 'false');
          const section = lastKit && lastKit.sections[Number(target.getAttribute('data-index'))];
          if (section) {
            if (open) openSections.add(section.id); else openSections.delete(section.id);
          }
          break;
        }
        case 'copy-kit':
          if (lastKit) copyText(composeFullText(), '상세 카피 전체');
          break;
        case 'download-kit':
          if (lastKit) {
            download('상세카피_' + (state.name.trim().slice(0, 20) || '상품') + '.txt', composeFullText());
            toast('TXT 파일로 저장했어요');
          }
          break;
        case 'set-fee':
          state.margin.feeRate = Number(target.getAttribute('data-fee')) || 0;
          syncForm();
          saveDraft();
          renderMargin();
          break;
        case 'apply-price': {
          const price = Number(target.getAttribute('data-price')) || 0;
          state.margin.price = price;
          syncForm();
          saveDraft();
          renderMargin();
          toast(C.formatWon(price) + ' 기준으로 다시 계산했어요');
          break;
        }
        case 'load-margin-sample':
          state.margin = Object.assign({}, D.SAMPLES[0].margin);
          syncForm();
          saveDraft();
          renderMargin();
          break;
        case 'clear-margin': clearMargin(); break;
        /* ── 카피 심리학 ── */
        case 'go-copy': setTab('copy'); break;
        case 'psych-from-kit':
          state.diagnosisText = '';
          $('#psychText').value = '';
          renderPsych();
          toast('지금 만든 카피를 다시 진단했어요');
          break;
        case 'psych-correct': {
          const text = psychSourceText();
          if (!text.trim()) { toast('진단할 카피가 없어요', 'warn'); break; }
          const c = C.correctCopy(text);
          if (!c) break;
          if (!c.applied.length) {
            toast('자동으로 바꿀 수 있는 표현이 없어요. 오른쪽 대안을 직접 반영해 보세요', 'warn');
            break;
          }
          state.diagnosisText = c.text;
          $('#psychText').value = c.text;
          renderPsych();
          toast('자동 교정 ' + c.applied.length + '곳 · 감점 ' + c.before + ' → ' + c.after.friction);
          break;
        }
        case 'psych-copy': copyText(psychSourceText(), '진단 텍스트'); break;
        case 'pick-frame':
          state.frames.framework = target.getAttribute('data-frame');
          saveDraft();
          renderFrames();
          break;
        case 'copy-frame': {
          if (!lastFrame) break;
          const it = lastFrame.items.find(function (x) { return x.id === lastFrame.chosen; }) || lastFrame.items[0];
          copyText(it.title + '\n\n' + it.body, '프레임 카피');
          break;
        }
        case 'frame-to-psych': {
          if (!lastFrame) break;
          const it = lastFrame.items.find(function (x) { return x.id === lastFrame.chosen; }) || lastFrame.items[0];
          state.diagnosisText = it.title + '\n\n' + it.body;
          $('#psychText').value = state.diagnosisText;
          renderPsych();
          toast('프레임 카피를 진단 텍스트로 가져왔어요');
          break;
        }
        /* ── 디자인 ── */
        case 'apply-design-ref': {
          const id = target.getAttribute('data-id');
          if (!id) break;
          state.design.refId = id;
          state.design.theme = null;
          saveDraft();
          renderDesign();
          toast('디자인을 적용했어요 · 카드가 바로 바뀝니다');
          break;
        }
        case 'design-refresh':
          renderDesign();
          toast('맥락을 다시 분석해 추천을 갱신했어요');
          break;
        case 'copy-design-css':
          if (lastDesign) copyText(lastDesign.css, '디자인 CSS');
          else toast('먼저 디자인을 골라 주세요', 'warn');
          break;
        case 'copy-design-html':
          if (lastDesign) copyText(lastDesign.html, '카드 HTML');
          else toast('먼저 디자인을 골라 주세요', 'warn');
          break;
        /* ── v2 정밀 도구 ── */
        case 'v2-open-search': {
          const url = target.getAttribute('data-url') || '';
          if (/^https:\/\/(www\.)?(pinterest\.com|behance\.net)\//.test(url)) {
            window.open(url, '_blank', 'noopener');
            toast('레퍼런스 검색을 새 창에서 열었어요');
          } else {
            toast('검색 주소를 확인하지 못했어요', 'warn');
          }
          break;
        }
        case 'v2-save-kit': saveCurrentKit(); break;
        case 'v2-copy-kit': {
          const kit = currentV2Kit();
          const json = kit ? C.kitToJSON(kit) : '';
          if (json) copyText(json, '브랜드 키트 JSON');
          else toast('먼저 카드를 렌더해 주세요', 'warn');
          break;
        }
        case 'v2-import-kit': {
          const ta = $('#v2KitJson');
          const parsed = C.kitFromJSON(ta ? ta.value : '');
          if (!parsed.ok) {
            toast((parsed.errors && parsed.errors[0]) || '키트 JSON을 읽지 못했어요', 'warn');
            break;
          }
          const list = brandKits().filter(function (k) { return k.id !== parsed.kit.id; });
          list.unshift(parsed.kit);
          saveBrandKits(list);
          state.v2.source = { kind: 'kit', kit: parsed.kit };
          state.v2.fontMix = (parsed.kit.type && parsed.kit.type.fontMix) || state.v2.fontMix;
          state.v2.grain = (parsed.kit.grain && parsed.kit.grain.id) || 'none';
          ensureV2Controls();
          renderV2Card();
          renderKitList();
          toast('브랜드 키트 “' + parsed.kit.name + '”를 불러왔어요');
          break;
        }
        case 'v2-apply-kit': applyKitById(target.getAttribute('data-id')); break;
        case 'v2-delete-kit': {
          const id = target.getAttribute('data-id');
          saveBrandKits(brandKits().filter(function (k) { return k.id !== id; }));
          if (state.v2.source && state.v2.source.kind === 'kit' && state.v2.source.kit && state.v2.source.kit.id === id) {
            state.v2.source = { kind: 'preset' };
            renderV2Card();
          }
          renderKitList();
          toast('키트를 지웠어요');
          break;
        }
        case 'v2-copy-html':
          if (lastV2) copyText(lastV2.html, 'v2 카드 HTML');
          else toast('먼저 카드를 렌더해 주세요', 'warn');
          break;
        case 'v2-copy-css':
          if (lastV2) copyText(lastV2.css, 'v2 카드 CSS');
          else toast('먼저 카드를 렌더해 주세요', 'warn');
          break;
        case 'v2-reset':
          state.v2.source = { kind: 'preset' };
          state.v2.blueprint = null;
          renderV2Card();
          toast('선택한 레퍼런스 카드로 돌아왔어요');
          break;
        case 'v2-copy-vision': copyVisionPrompt(); break;
        case 'v2-open-vision': openVisionAI(target.getAttribute('data-target')); break;
        case 'v2-render-blueprint': renderBlueprint(false); break;
        case 'v2-sample-blueprint': {
          const DR = C.ENGINES.DesignRef;
          const ta = $('#v2BlueprintText');
          if (DR && DR.BLUEPRINT_EXAMPLE && ta) {
            ta.value = JSON.stringify(DR.BLUEPRINT_EXAMPLE, null, 2);
            renderBlueprint(true);
            toast('예시 설계도를 채우고 상품 문구로 다시 그렸어요');
          }
          break;
        }
        case 'v2-save-blueprint-kit': {
          const kit = currentV2Kit();
          if (!kit) { toast('먼저 설계도를 렌더해 주세요', 'warn'); break; }
          saveCurrentKit();
          break;
        }
        /* ── 경쟁강도 ── */
        case 'load-compet-sample': loadCompetSamples(); break;
        case 'compet-add': addCompetRow(); break;
        case 'compet-calc': calcCompetBulk(); break;
        case 'compet-clear': {
          const ta = $('#compBulk');
          if (ta) ta.value = '';
          const st = $('#compParseStatus');
          if (st) st.innerHTML = '';
          break;
        }
        case 'compet-sort':
          state.compet.sort = target.getAttribute('data-sort') || 'recommend';
          renderCompetSort();
          renderCompetTable();
          break;
        case 'compet-use':
        case 'compet-use-row': {
          const kw = action === 'compet-use' ? (competCurrent().keyword || ($('#compKeyword') ? $('#compKeyword').value : '')) : target.getAttribute('data-kw');
          if (!kw) { toast('키워드를 먼저 넣어 주세요', 'warn'); break; }
          state.keyword = kw;
          syncForm();
          onChange();
          setTab('score');
          toast('목표 키워드를 “' + kw + '”로 바꿨어요');
          break;
        }
        case 'compet-remove-row': {
          const kw = target.getAttribute('data-kw');
          state.compet.rows = state.compet.rows.filter(function (r) { return r.keyword !== kw; });
          persistCompet();
          renderCompetTable();
          break;
        }
        case 'copy-compet-csv':
          if (state.compet.rows.length) copyText(competCSVText(), '경쟁강도 표');
          else toast('계산한 키워드가 없어요', 'warn');
          break;
        case 'download-compet-csv':
          if (state.compet.rows.length) download('경쟁강도-' + C.todayISO() + '.csv', competCSVText(), 'text/csv');
          else toast('계산한 키워드가 없어요', 'warn');
          break;
        case 'apply-palette': applyExtractedPalette(); break;
        case 'reset-palette':
          state.design.theme = null;
          renderDesignPreview();
          renderPalette();
          toast('원래 팔레트로 돌아왔어요');
          break;
        case 'clear-image':
          state.design.image = '';
          state.design.imageName = '';
          state.design.extracted = null;
          state.design.theme = null;
          renderDesignPreview();
          renderPalette();
          toast('레퍼런스 이미지를 뺐어요');
          break;
        /* ── AI 브리지 ── */
        case 'bridge-task':
          state.bridge.task = target.getAttribute('data-task');
          state.bridge.result = '';
          $('#bridgeResult').value = '';
          saveDraft();
          renderBridge();
          break;
        case 'copy-prompt': {
          const p = currentPrompt();
          copyText(p.prompt, '프롬프트');
          break;
        }
        case 'open-ai': openBridgeAI(target.getAttribute('data-ai')); break;
        case 'apply-bridge': applyBridge(); break;
        case 'clear-bridge':
          state.bridge.result = '';
          $('#bridgeResult').value = '';
          renderBridgeApplied();
          if ($('#freeLimitCard')) $('#freeLimitCard').hidden = true;
          break;
        case 'save-gemini-key': {
          const v = String(($('#geminiKey') || {}).value || '').trim();
          if (!v) { toast('키가 비어 있어요', 'warn'); break; }
          try { window.localStorage.setItem(LS.gemini, v); } catch (e) { /* 저장 불가 */ }
          $('#geminiKey').value = '';
          updateGeminiNote();
          toast('키를 이 브라우저에만 저장했어요');
          break;
        }
        case 'clear-gemini-key':
          try { window.localStorage.removeItem(LS.gemini); } catch (e) { /* 무시 */ }
          $('#geminiKey').value = '';
          updateGeminiNote();
          toast('저장한 키를 지웠어요');
          break;
        case 'run-gemini': runGemini(); break;
        case 'free-run': runFree(); break;
        case 'bulk-sample': bulkSample(); break;
        case 'bulk-export': exportBulk(); break;
        case 'bulk-clear': state.bulk = []; renderBulk(); toast('일괄 목록을 비웠어요'); break;
        case 'apply-ai-name': {
          const n = state.bridge.names[Number(target.getAttribute('data-index'))];
          if (!n) break;
          state.name = n.text;
          syncForm();
          saveDraft();
          renderScore();
          renderKit();
          renderPsych();
          setTab('score');
          toast('AI 상품명을 적용했어요 (' + n.total + '점)');
          break;
        }
        case 'pro-generate': runPro(); break;
        case 'pro-copy': copyText(proCopyText(state.pro.kit), 'Pro 완성 카피'); break;
        case 'copy-pro-copy': copyText(state.pro.kit ? proCopyText(state.pro.kit) : '', 'Pro 카피'); break;
        case 'copy-pro-block': {
          const pb = state.pro.kit && state.pro.kit.blocks[Number(target.getAttribute('data-index'))];
          if (pb) copyText(proBlockText(pb), (pb.heading || '단락') + ' 카피');
          break;
        }
        case 'clear-pro-kit': clearProKit(); break;
        case 'copy-bridge-copy': copyText(state.bridge.copy, 'AI 다듬은 카피'); break;
        case 'clear-bridge-copy':
          state.bridge.copy = '';
          renderKit();
          renderBridgeApplied();
          toast('AI 카피를 뺐어요');
          break;
        case 'clear-ai-faq':
          state.bridge.faqs = [];
          renderKit();
          renderBridgeApplied();
          toast('AI로 추가한 FAQ를 뺐어요');
          break;
        case 'copy-design-note': copyText(state.bridge.designNote, '디자인 메모'); break;
        case 'open-save': openSaveModal(); break;
        case 'close-modal': closeModal(); break;
        case 'confirm-save': confirmSave(); break;
        case 'delete-saved': openDeleteModal(target.getAttribute('data-id')); break;
        case 'confirm-delete': {
          const id = target.getAttribute('data-id');
          state.items = state.items.filter(function (p) { return p.id !== id; });
          saveItems();
          renderSaved();
          closeModal();
          toast('삭제했어요');
          break;
        }
        case 'open-saved': openSavedItem(target.getAttribute('data-id')); break;
        case 'filter-saved':
          state.filter = target.getAttribute('data-filter');
          renderSaved();
          break;
        case 'export-csv':
          if (!state.items.length) { toast('내보낼 작업이 없어요', 'warn'); break; }
          download('커머스SEO_저장함_' + C.todayISO().replace(/-/g, '') + '.csv',
            '\uFEFF' + C.productsToCSV(state.items), 'text/csv');
          toast('CSV로 내보냈어요');
          break;
        case 'export-json':
          if (!state.items.length) { toast('내보낼 작업이 없어요', 'warn'); break; }
          download('커머스SEO_저장함_' + C.todayISO().replace(/-/g, '') + '.json',
            C.productsToJSON(state.items), 'application/json');
          toast('JSON으로 내보냈어요');
          break;
        case 'import-json':
          $('#importFile').click();
          break;
        default:
          break;
      }
    });

    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && !$('#modalRoot').hidden) closeModal();
    });
  }

  function toggleTheme() {
    const now = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', now);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', now === 'dark' ? '#0a0b0d' : '#ffffff');
    writeJSON(LS.theme, now);
  }

  /* ── 시작 ─────────────────────────────────────────── */
  function init() {
    const theme = readJSON(LS.theme, 'light');
    document.documentElement.setAttribute('data-theme', theme === 'dark' ? 'dark' : 'light');

    const stored = readJSON(LS.items, []);
    state.items = Array.isArray(stored) ? stored.filter(function (p) { return p && p.name; }).map(function (p) {
      return Object.assign({}, p, {
        platform: C.PLATFORMS[p.platform] ? p.platform : 'smartstore',
        status: C.STATUSES.some(function (s) { return s.id === p.status; }) ? p.status : 'plan',
        grade: typeof p.grade === 'string' && 'SABC'.indexOf(p.grade[0]) >= 0 ? p.grade[0] : null,
      });
    }) : [];

    const draft = readJSON(LS.draft, null);
    if (draft) {
      Object.assign(state, normalizeDraft(draft));
    } else {
      Object.assign(state, normalizeDraft({
        platform: D.SAMPLES[0].platform, name: D.SAMPLES[0].name, keyword: D.SAMPLES[0].keyword,
        target: D.SAMPLES[0].target, benefits: D.SAMPLES[0].benefits,
        weakness: D.SAMPLES[0].weakness, margin: D.SAMPLES[0].margin,
      }));
    }

    const DR = C.ENGINES.DesignRef;
    const industrySel = $('#designIndustry');
    if (industrySel && DR && DR.INDUSTRIES) {
      industrySel.innerHTML = '<option value="">자동 분석</option>' + DR.INDUSTRIES.map(function (x) {
        return '<option value="' + C.escapeHtml(x) + '">' + C.escapeHtml(x) + '</option>';
      }).join('');
    }
    updateGeminiNote();

    const bulkFile = $('#bulkFile');
    if (bulkFile) {
      bulkFile.addEventListener('change', function (e) {
        const f = e.target.files && e.target.files[0];
        if (f) importBulkFile(f);
        e.target.value = '';
      });
    }
    renderBulk();

    const storedCompet = readJSON(LS.compet, []);
    state.compet.rows = Array.isArray(storedCompet)
      ? storedCompet.filter(function (r) { return r && r.keyword; }).map(function (r) {
        return C.competitionRow({ keyword: r.keyword, pc: r.pc, mobile: r.mobile, searches: r.searches, products: r.products });
      }).filter(function (r) { return r.valid; })
      : [];
    const kitName = readJSON(LS.kits + ':name', '');
    if (kitName && $('#v2KitName')) $('#v2KitName').value = String(kitName);

    syncForm();
    bindEvents();
    initPro();
    renderScore();
    renderMargin();
    renderSaved();
    renderKit();
    setTab('score');
    document.documentElement.setAttribute('data-app-ready', '1');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
