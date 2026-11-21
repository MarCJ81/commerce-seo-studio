/* ============================================================
   커머스 SEO 스튜디오 · core.js
   DOM 없는 순수 로직: 상품명 SEO 채점, 중복·금지어·특수문자 탐지,
   개선 상품명 제안, 상세페이지 7단 카피·FAQ 생성,
   셀러 마진·손익분기 ROAS 계산, 저장함 내보내기.
   브라우저(window.CommerceCore)와 node test.js가 함께 쓴다.
   ============================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CommerceCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const VERSION = '1.0.0';

  /* ── 플랫폼 규칙 ──────────────────────────────────────────
     근거: 네이버 쇼핑 상품검색 SEO 가이드(스마트스토어 상품명 100자 입력,
     50자 내외 권장, 단어 중복·혜택 문구·판매처명·장식 기호 지양),
     쿠팡 노출상품명 정책(100자 상한, 80자 이하 권장, 같은 단어 2회 초과 금지,
     금지 특수문자·금지 문구 5범주). 점수 자체는 이 앱의 참고 지표다. */
  const PLATFORMS = {
    smartstore: {
      id: 'smartstore',
      label: '스마트스토어',
      maxLength: 100,
      idealMin: 20,
      idealMax: 50,
      allowedRepeats: 1,
      frontChars: 20,
      summary: '100자까지 입력 · 50자 내외 권장',
      note: '같은 단어 반복, 배송·할인 문구, 판매처 이름은 감점 요인이에요.',
    },
    coupang: {
      id: 'coupang',
      label: '쿠팡',
      maxLength: 100,
      idealMin: 25,
      idealMax: 80,
      allowedRepeats: 2,
      frontChars: 20,
      summary: '노출상품명 100자 · 80자 이하 권장',
      note: '70자를 넘으면 모바일 목록에서 뒤가 잘려요.',
    },
  };

  const PLATFORM_RULES = {
    smartstore: [
      '상품명은 100자까지 입력되고, 50자 내외가 권장됩니다.',
      '한글로 쓰고, 영문은 브랜드·표준 단위에만 붙입니다.',
      '같은 단어를 반복하면 어뷰징으로 판정될 수 있어요. 동의어는 검색이 자동 처리합니다.',
      '배송·할인·이벤트 문구와 쇼핑몰 이름은 상품명이 아니라 각 설정 항목에 넣습니다.',
      '★ ♥ 같은 장식 기호와 이모지는 쓰지 않습니다.',
      '브랜드가 있으면 브랜드명을 맨 앞에 두고, 대표 옵션 1개를 상품명에 포함합니다.',
    ],
    coupang: [
      '노출상품명은 100자까지 등록되고, 80자 이하가 권장됩니다(70자부터 모바일에서 잘림).',
      '구조는 브랜드 + 모델명·시리즈 + 상품 유형 + 핵심 특징 순서입니다.',
      '같은 단어는 2회를 넘겨 반복할 수 없습니다.',
      '금지 특수문자: ! $ ? _ { } ^ ¬ ¦ % @ # ~ < > | = (2026년 9월 기준 [ ] * 는 허용)',
      '금지 문구 5범주: 프로모션·주관적 표현, 타 플랫폼명, 판매자 정보, 배송·기간 문구, 시스템 용어',
      '사이즈·색상·수량은 옵션으로 등록하고 상품명에 나열하지 않습니다.',
    ],
  };

  /* ── 금지·감점 표현 사전 ──────────────────────────────── */
  const CLAIM_GROUPS = [
    {
      id: 'hype', label: '과장·최상급', tone: 'danger', weight: 12,
      reason: '근거 없는 최상급은 표시광고법상 거짓·과장 광고가 될 수 있고, 두 플랫폼 모두 상품명 기재를 제한합니다.',
      fix: '사실로 바꾸기 — 수치, 소재, 구성처럼 확인되는 말로',
      words: ['최고', '최강', '최상급', '최상의', '완벽', '유일무이', '유일한', '넘버원', '1위',
        '세계 최초', '세계최초', '업계 최초', '업계최초', '압도적', '독보적', '비교불가',
        '대박', '역대급', '초특가', '파격', '최저가', '무조건'],
    },
    {
      id: 'medical', label: '의료·효능', tone: 'danger', weight: 12,
      reason: '질병의 치료·예방 효과를 표방하면 의료법·식품표시광고법 위반이 될 수 있습니다.',
      fix: '효능 주장을 빼고, 소재·사용감·관리 표현으로',
      words: ['치료', '예방', '완치', '만병통치', '특효', '항암', '면역력', '부작용 없음',
        '부작용 제로', '다이어트', '살 빠지는', '키 크는', '통증 완화', '아토피', '탈모 치료'],
    },
    {
      id: 'promo', label: '홍보·혜택 문구', tone: 'warn', weight: 6,
      reason: '배송·할인·이벤트 문구는 상품명이 아니라 구매 혜택 조건에서 설정해야 합니다. 쿠팡은 상품명 정책 위반 항목입니다.',
      fix: '상품명에서 빼고 혜택 조건·상세페이지로 옮기기',
      words: ['무료배송', '당일출고', '국내발송', '묶음배송', '할인', '세일', '특가', '한정수량',
        '한정판매', '1+1', '사은품', '증정', 'MD추천', '인기상품', '신상품', '신규', '최신',
        '고급', '고품질', '모음전', '본사정품', '지금 구매', '주문폭주', '마감임박', '선착순', '강력추천', '적극추천'],
    },
    {
      id: 'reserved', label: '플랫폼·판매처명', tone: 'warn', weight: 8,
      reason: '상품명에 플랫폼 이름이나 판매처 이름을 넣으면 쿠팡 상품명 정책 위반이고, 네이버도 판매처 정보를 넣지 않도록 안내합니다.',
      fix: '브랜드·제조사 이름만 남기기',
      words: ['쿠팡', '네이버쇼핑', '네이버', '스마트스토어', '11번가', '지마켓', 'G마켓', '옥션',
        '아마존', '알리익스프레스', '테무', '무신사'],
    },
  ];

  const CLAIM_WORDS = CLAIM_GROUPS.reduce(function (acc, g) {
    g.words.forEach(function (w) {
      acc.push({ word: w, group: g.id, label: g.label, tone: g.tone, weight: g.weight, reason: g.reason, fix: g.fix });
    });
    return acc;
  }, []).sort(function (a, b) { return b.word.length - a.word.length; });

  /* 안전한 대체어 — 개선안 생성에만 쓴다. 빈 문자열은 삭제. */
  const SAFE_SWAP = {
    '최고': '', '최강': '', '최상급': '', '최상의': '', '완벽': '', '유일무이': '', '유일한': '',
    '넘버원': '', '1위': '', '세계 최초': '', '세계최초': '', '업계 최초': '', '업계최초': '',
    '압도적': '', '독보적': '', '비교불가': '', '대박': '', '역대급': '', '초특가': '', '파격': '',
    '최저가': '', '무조건': '',
    '치료': '케어', '예방': '관리', '완치': '', '만병통치': '', '특효': '', '항암': '',
    '면역력': '', '부작용 없음': '', '부작용 제로': '', '다이어트': '', '살 빠지는': '',
    '키 크는': '', '통증 완화': '', '아토피': '', '탈모 치료': '탈모 케어',
    '무료배송': '', '당일출고': '', '국내발송': '', '묶음배송': '', '할인': '', '세일': '',
    '특가': '', '한정수량': '', '한정판매': '', '1+1': '', '사은품': '', '증정': '',
    'MD추천': '', '인기상품': '', '신상품': '', '신규': '', '최신': '', '고급': '', '고품질': '',
    '모음전': '', '본사정품': '', '지금 구매': '', '주문폭주': '', '마감임박': '', '선착순': '',
    '강력추천': '', '적극추천': '',
    '쿠팡': '', '네이버쇼핑': '', '네이버': '', '스마트스토어': '', '11번가': '', '지마켓': '',
    'G마켓': '', '옥션': '', '아마존': '', '알리익스프레스': '', '테무': '', '무신사': '',
  };

  const DECO_CHARS = '★☆♥♡◆◇■□▶◀▷◁●○◎※☞☜♣♠♤';
  const ALLOWED_PUNCT = '-/+()%.,&\'·:';

  /* ── 기본 유틸 ──────────────────────────────────────────── */
  function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)); }
  function codePoints(s) { return Array.from(String(s == null ? '' : s)).length; }

  /** 마지막 글자의 받침 여부. 한글·숫자만 정확히 보고, 그 외는 받침 없음으로 본다. */
  function hasBatchim(word) {
    const list = Array.from(String(word == null ? '' : word).trim());
    if (!list.length) return false;
    const ch = list[list.length - 1];
    const code = ch.charCodeAt(0);
    if (code >= 0xAC00 && code <= 0xD7A3) return ((code - 0xAC00) % 28) !== 0;
    if (/[0-9]/.test(ch)) return '013678'.indexOf(ch) >= 0;
    return false;
  }

  /** 조사 붙이기: josa('가구', '이라면/라면') → '가구라면' */
  function josa(word, pair) {
    const s = String(word == null ? '' : word).trim();
    const parts = String(pair || '은/는').split('/');
    const withBatchim = parts[0];
    const without = parts[1] == null ? parts[0] : parts[1];
    let suffix = hasBatchim(s) ? withBatchim : without;
    if (pair === '으로/로' && suffix === withBatchim) {
      const ch = Array.from(s).pop();
      const code = ch.charCodeAt(0);
      if (code >= 0xAC00 && code <= 0xD7A3 && ((code - 0xAC00) % 28) === 8) suffix = without;
    }
    return s + suffix;
  }
  function trimZero(s) { return String(s).replace(/\.0$/, ''); }
  function escapeReg(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function uid(prefix) {
    return (prefix || 'id') + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
  }
  function round1(n) { return Math.round(n * 10) / 10; }
  function toNumber(v) {
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    const s = String(v == null ? '' : v).replace(/,/g, '').replace(/\s/g, '').replace(/원|%|₩/g, '');
    if (!s) return 0;
    const n = Number(s.replace(/[^0-9.\-]/g, ''));
    return isFinite(n) ? n : 0;
  }
  function formatNumber(n) {
    const v = Number(n);
    if (!isFinite(v)) return '—';
    return v.toLocaleString('ko-KR');
  }
  function formatWon(n) {
    const v = Number(n);
    if (!isFinite(v)) return '—';
    return (v < 0 ? '-' : '') + Math.round(Math.abs(v)).toLocaleString('ko-KR') + '원';
  }
  function formatPct(n, digits) {
    const v = Number(n);
    if (!isFinite(v)) return '—';
    const d = digits == null ? 1 : digits;
    return (Math.round(v * Math.pow(10, d)) / Math.pow(10, d)).toFixed(d) + '%';
  }
  function todayISO(now) {
    const d = now ? new Date(now) : new Date();
    const p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  function formatDateKR(iso) {
    if (!iso) return '—';
    const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return String(iso).slice(0, 10);
    return m[1] + '.' + m[2] + '.' + m[3];
  }

  function getPlatform(id) { return PLATFORMS[id] || PLATFORMS.smartstore; }
  function platformRules(id) { return (PLATFORM_RULES[getPlatform(id).id] || []).slice(); }

  function splitKeywords(value) {
    return String(value == null ? '' : value)
      .split(/[,，|/\n]+/)
      .map(function (s) { return s.trim().replace(/\s+/g, ' '); })
      .filter(Boolean)
      .slice(0, 5);
  }

  /* ── 토큰·특수문자·금지어 탐지 ─────────────────────────── */
  const TOKEN_RE = /[\p{L}\p{N}]+(?:[.'’][\p{L}\p{N}]+)*/gu;

  function tokenize(text) {
    const normalized = String(text == null ? '' : text).replace(/(\d),(\d{3})(?!\d)/g, '$1$2');
    const out = [];
    TOKEN_RE.lastIndex = 0;
    let m;
    while ((m = TOKEN_RE.exec(normalized)) !== null) {
      const raw = m[0];
      if (codePoints(raw) < 2) continue;
      out.push({ text: raw.toLowerCase(), raw: raw, index: m.index, length: raw.length });
    }
    return out;
  }

  function scanSymbols(text) {
    const s = String(text == null ? '' : text);
    const items = [];
    let emoji = 0, deco = 0, other = 0;
    let index = 0;
    for (const ch of s) {
      const at = index;
      index += ch.length;
      /* 장식 기호를 먼저 본다. 엔진마다 ★·♥를 Extended_Pictographic으로
         분류하는 범위가 달라서, 순서를 고정해야 점수가 흔들리지 않는다. */
      if (DECO_CHARS.indexOf(ch) >= 0) {
        deco++; items.push({ type: 'deco', char: ch, index: at, length: 1 });
        continue;
      }
      if (/\p{Extended_Pictographic}/u.test(ch)) {
        emoji++; items.push({ type: 'emoji', char: ch, index: at, length: ch.length });
        continue;
      }
      const code = ch.charCodeAt(0);
      const isAsciiPunct = (code >= 33 && code <= 47) || (code >= 58 && code <= 64) || (code >= 91 && code <= 96) || (code >= 123 && code <= 126);
      const isCjkPunct = '【】「」『』〈〉《》〔〕'.indexOf(ch) >= 0;
      if ((isAsciiPunct || isCjkPunct) && ALLOWED_PUNCT.indexOf(ch) === -1) {
        other++; items.push({ type: 'other', char: ch, index: at, length: 1 });
      }
    }
    const runs = (s.match(/[!?~^]{2,}|\.{3,}/g) || []).length;
    const deduction = emoji * 7 + deco * 4 + other * 3 + runs * 3;
    return {
      emoji: emoji, deco: deco, other: other, runs: runs,
      total: emoji + deco + other + runs,
      deduction: deduction,
      items: items,
    };
  }

  function findAllSpans(text, word) {
    const out = [];
    const re = new RegExp(escapeReg(word), 'gi');
    let m;
    while ((m = re.exec(text)) !== null) {
      out.push({ index: m.index, length: m[0].length, text: m[0] });
      if (m.index === re.lastIndex) re.lastIndex++;
    }
    return out;
  }

  function findClaims(text) {
    const s = String(text == null ? '' : text);
    const spans = [];
    CLAIM_WORDS.forEach(function (c) {
      findAllSpans(s, c.word).forEach(function (m) {
        spans.push({
          type: 'claim', group: c.group, label: c.label, tone: c.tone, weight: c.weight,
          word: c.word, text: m.text, index: m.index, length: m.length,
          reason: c.reason, fix: c.fix,
        });
      });
    });
    spans.sort(function (a, b) { return a.index - b.index || b.length - a.length; });
    const out = [];
    let end = -1;
    spans.forEach(function (sp) {
      if (sp.index < end) return;
      out.push(sp);
      end = sp.index + sp.length;
    });
    return out;
  }

  function stripClaims(text) {
    let s = String(text == null ? '' : text);
    CLAIM_WORDS.forEach(function (c) {
      const to = SAFE_SWAP[c.word] == null ? '' : SAFE_SWAP[c.word];
      s = s.split(c.word).join(to);
    });
    return s.replace(/\s{2,}/g, ' ').trim();
  }

  function duplicateTokens(name, allowedRepeats) {
    const allowed = allowedRepeats == null ? 1 : allowedRepeats;
    const tokens = tokenize(name);
    const map = {};
    tokens.forEach(function (t) {
      if (!map[t.text]) map[t.text] = { token: t.raw, count: 0, indexes: [] };
      map[t.text].count++;
      map[t.text].indexes.push(t.index);
    });
    return Object.keys(map).map(function (k) { return map[k]; })
      .filter(function (d) { return d.count > allowed; })
      .map(function (d) { return { token: d.token, count: d.count, excess: d.count - allowed, indexes: d.indexes }; })
      .sort(function (a, b) { return b.excess - a.excess || a.indexes[0] - b.indexes[0]; });
  }

  const SPEC_RE = /^\d+(?:[.,]\d+)?(?:ml|l|g|kg|mg|cm|mm|m|w|v|mah|pa|rpm|개입|개|매|입|팩|장|병|정|캡슐|호|인치|세트|colors?|p|%|시간|분|초)$/i;
  function isSpecToken(t) { return SPEC_RE.test(String(t || '').replace(/\s+/g, '')); }

  function keywordInfo(name, keyword, platformId) {
    const kw = String(keyword || '').trim();
    const frontChars = getPlatform(platformId).frontChars;
    if (!kw) return { main: '', exact: false, index: -1, front: false, partial: 'none', found: 0, total: 0 };
    const parts = kw.split(/\s+/).map(escapeReg);
    const re = new RegExp(parts.join('\\s*'), 'i');
    const m = re.exec(name);
    const tokens = tokenize(name).map(function (t) { return t.text; });
    const kwTokens = tokenize(kw).map(function (t) { return t.text; });
    const found = kwTokens.filter(function (t) { return tokens.indexOf(t) >= 0; }).length;
    if (m) {
      const at = codePoints(name.slice(0, m.index));
      return { main: kw, exact: true, index: at, front: at <= frontChars, partial: 'exact', found: kwTokens.length, total: kwTokens.length };
    }
    return {
      main: kw, exact: false, index: -1, front: false,
      partial: kwTokens.length && found === kwTokens.length ? 'all' : found ? 'some' : 'none',
      found: found, total: kwTokens.length,
    };
  }

  /* ── 상품명 채점 ───────────────────────────────────────── */
  const GRADE_LABELS = {
    S: '그대로 등록해도 좋아요',
    A: '조금만 다듬으면 좋아요',
    B: '보완이 필요해요',
    C: '다시 쓰는 게 빨라요',
  };

  function gradeOf(total) {
    if (total >= 90) return 'S';
    if (total >= 75) return 'A';
    if (total >= 60) return 'B';
    return 'C';
  }

  function analyzeName(input) {
    const o = input || {};
    const platform = getPlatform(o.platform);
    const name = String(o.name == null ? '' : o.name).trim();
    const keywords = splitKeywords(o.keyword);
    const mainKeyword = keywords[0] || '';
    const length = codePoints(name);
    const claims = findClaims(name);
    const symbols = scanSymbols(name);
    const duplicates = duplicateTokens(name, platform.allowedRepeats);
    const kw = keywordInfo(name, mainKeyword, platform.id);
    const tokens = tokenize(name);
    const specTokens = Array.from(new Set(tokens.filter(function (t) { return isSpecToken(t.raw); }).map(function (t) { return t.raw; })));
    const issues = [];
    const parts = [];

    if (!length) {
      return {
        platform: platform.id, platformLabel: platform.label, name: name, length: 0,
        total: 0, grade: 'C', gradeLabel: GRADE_LABELS.C, gradeTone: 'c', provisional: !mainKeyword,
        parts: [
          { id: 'length', label: '길이', score: 0, max: 25, hint: '0자' },
          { id: 'keyword', label: '키워드', score: 0, max: 25, hint: '미입력' },
          { id: 'duplicate', label: '단어 중복', score: 0, max: 15, hint: '—' },
          { id: 'symbol', label: '특수문자', score: 0, max: 15, hint: '—' },
          { id: 'claim', label: '금지 표현', score: 0, max: 20, hint: '—' },
        ],
        issues: [{ level: 'danger', code: 'empty', title: '상품명이 비어 있어요', detail: '상품명을 입력하면 점수와 진단이 바로 나옵니다.', fix: '판매할 상품의 이름을 위 입력칸에 넣어 주세요.' }],
        metrics: { length: 0, tokens: 0, keywordIndex: -1, keywordFront: false, duplicateCount: 0, symbolCount: 0, claimCount: 0, specCount: 0 },
        keyword: { main: mainKeyword, exact: false, index: -1, front: false, partial: 'none', found: 0, total: 0 },
        keywords: keywords, extraKeywords: [],
        duplicates: [], symbols: symbols, claims: claims, specTokens: specTokens,
        area: { start: 0, end: 0 },
        highlights: [],
        suggestions: [],
      };
    }

    /* 1) 길이 25 */
    let lengthScore;
    if (length > platform.maxLength) {
      lengthScore = 0;
      issues.push({
        level: 'danger', code: 'length-over', title: platform.label + ' ' + platform.maxLength + '자를 넘었어요',
        detail: length + '자 — 등록 화면에서 잘리거나 반려될 수 있습니다.',
        fix: (length - platform.maxLength) + '자를 덜어내세요. 옵션·수량은 빼는 게 먼저입니다.',
      });
    } else if (length < platform.idealMin) {
      lengthScore = length >= 10 ? 18 : 8;
      issues.push({
        level: 'warn', code: 'length-short', title: '상품명이 짧아요',
        detail: length + '자 — 권장 ' + platform.idealMin + '~' + platform.idealMax + '자보다 짧아 검색에 걸릴 정보가 부족합니다.',
        fix: '상품 유형 + 핵심 특징 + 대표 옵션 1개를 붙여 ' + platform.idealMin + '자 이상으로.',
      });
    } else if (length > platform.idealMax) {
      lengthScore = 15;
      issues.push({
        level: 'warn', code: 'length-long', title: '권장 길이를 넘었어요',
        detail: length + '자 — ' + platform.label + ' 권장은 ' + platform.idealMax + '자 이하입니다.',
        fix: '반복 단어와 수식어를 덜어 ' + platform.idealMax + '자 이하로.',
      });
    } else {
      lengthScore = 25;
      issues.push({
        level: 'good', code: 'length-ok', title: '길이가 권장 범위예요',
        detail: length + '자 (권장 ' + platform.idealMin + '~' + platform.idealMax + '자).',
        fix: '이 길이를 유지하세요.',
      });
    }
    parts.push({ id: 'length', label: '길이', score: lengthScore, max: 25, hint: length + '/' + platform.maxLength + '자' });

    /* 2) 키워드 25 */
    let kwScore;
    if (!mainKeyword) {
      kwScore = 12;
      issues.push({
        level: 'warn', code: 'keyword-empty', title: '목표 키워드가 비어 있어요',
        detail: '키워드 칸을 채우면 앞배치·포함 여부까지 채점합니다. 지금 점수는 임시값이에요.',
        fix: '고객이 검색창에 칠 단어 1개를 먼저 정하세요.',
      });
    } else if (kw.exact && kw.index <= platform.frontChars) {
      kwScore = 25;
      issues.push({
        level: 'good', code: 'keyword-front', title: '핵심 키워드가 앞쪽에 있어요',
        detail: '"' + mainKeyword + '" 시작 위치 ' + (kw.index + 1) + '번째 글자 — 앞 ' + platform.frontChars + '자 안입니다.',
        fix: '앞부분은 그대로 두고 뒤쪽 정보만 다듬으세요.',
      });
    } else if (kw.exact) {
      kwScore = 14;
      issues.push({
        level: 'warn', code: 'keyword-back', title: '키워드가 뒤쪽에 있어요',
        detail: '"' + mainKeyword + '" 시작 위치 ' + (kw.index + 1) + '번째 글자 — 모바일 목록에서는 앞부분만 보입니다.',
        fix: '브랜드명 뒤, 열거보다 앞에 "' + mainKeyword + '"를 배치하세요.',
      });
    } else if (kw.partial === 'all') {
      kwScore = 10;
      issues.push({
        level: 'warn', code: 'keyword-split', title: '키워드가 붙어 있지 않아요',
        detail: '"' + mainKeyword + '"의 단어는 다 있지만 한 덩어리로는 없습니다.',
        fix: '띄어쓰기를 맞춰 "' + mainKeyword + '" 형태로 한 번 넣으세요.',
      });
    } else if (kw.partial === 'some') {
      kwScore = 5;
      issues.push({
        level: 'danger', code: 'keyword-partial', title: '키워드 일부만 들어 있어요',
        detail: '"' + mainKeyword + '" 단어 ' + kw.total + '개 중 ' + kw.found + '개만 있습니다.',
        fix: '키워드 전체를 상품명 앞쪽에 자연스럽게 넣으세요.',
      });
    } else {
      kwScore = 0;
      issues.push({
        level: 'danger', code: 'keyword-missing', title: '상품명에 목표 키워드가 없어요',
        detail: '"' + mainKeyword + '" — 검색어와 상품명이 연결되지 않습니다.',
        fix: '앞 ' + platform.frontChars + '자 안에 키워드를 넣으세요.',
      });
    }
    parts.push({ id: 'keyword', label: '키워드', score: kwScore, max: 25, hint: !mainKeyword ? '미입력' : kw.exact ? (kw.index + 1) + '번째 글자' : kw.partial === 'none' ? '없음' : '일부만' });

    /* 3) 단어 중복 15 */
    const excess = duplicates.reduce(function (a, d) { return a + d.excess; }, 0);
    const dupScore = clamp(15 - excess * 6, 0, 15);
    if (duplicates.length) {
      const sample = duplicates[0];
      issues.push({
        level: excess >= 2 ? 'danger' : 'warn', code: 'duplicate',
        title: '같은 단어가 반복돼요',
        detail: duplicates.map(function (d) { return '"' + d.token + '" ' + d.count + '회'; }).join(', ') +
          ' — ' + platform.label + '은(는) ' + (platform.allowedRepeats === 1 ? '같은 단어 반복을 어뷰징으로 봅니다' : '같은 단어를 ' + (platform.allowedRepeats + 1) + '회 넘게 쓰면 정책 위반입니다') + '.',
        fix: '"' + sample.token + '" 하나만 남기고 나머지는 성질·수량으로 바꾸세요.',
      });
    } else {
      issues.push({ level: 'good', code: 'duplicate-ok', title: '중복 단어가 없어요', detail: '같은 단어를 ' + (platform.allowedRepeats + 1) + '회 넘게 쓰지 않았습니다.', fix: '그대로 유지하세요.' });
    }
    parts.push({ id: 'duplicate', label: '단어 중복', score: dupScore, max: 15, hint: duplicates.length ? '중복 ' + duplicates.length + '종' : '없음' });

    /* 4) 특수문자·이모지 15 */
    const symScore = clamp(15 - symbols.deduction, 0, 15);
    if (symbols.total) {
      const bits = [];
      if (symbols.emoji) bits.push('이모지 ' + symbols.emoji + '개');
      if (symbols.deco) bits.push('장식 기호 ' + symbols.deco + '개');
      if (symbols.other) bits.push('기타 특수문자 ' + symbols.other + '개');
      if (symbols.runs) bits.push('반복 부호 ' + symbols.runs + '개');
      issues.push({
        level: symScore <= 5 ? 'danger' : 'warn', code: 'symbol',
        title: '장식 기호·특수문자가 있어요',
        detail: bits.join(', ') + ' — 두 플랫폼 모두 상품명 장식용 기호를 제한합니다.',
        fix: '기호를 빼고 단어 사이는 띄어쓰기로 구분하세요.',
      });
    } else {
      issues.push({ level: 'good', code: 'symbol-ok', title: '특수문자·이모지가 없어요', detail: '허용 범위(- + / ( ) %)만 쓰는 게 가장 안전합니다.', fix: '그대로 유지하세요.' });
    }
    parts.push({ id: 'symbol', label: '특수문자', score: symScore, max: 15, hint: symbols.total ? symbols.total + '개' : '없음' });

    /* 5) 금지·감점 표현 20 */
    let claimScore = 20;
    if (claims.length) {
      claimScore = clamp(20 - claims.reduce(function (a, c) { return a + c.weight; }, 0), 0, 20);
      const names = Array.from(new Set(claims.map(function (c) { return c.text; })));
      const groups = Array.from(new Set(claims.map(function (c) { return c.label; })));
      issues.push({
        level: 'danger', code: 'claim',
        title: '금지·감점 표현 ' + claims.length + '건',
        detail: names.slice(0, 5).join(', ') + (names.length > 5 ? ' 외' : '') + ' — ' + groups.join('·') + ' 유형입니다.',
        fix: claims[0].fix,
      });
    } else {
      issues.push({ level: 'good', code: 'claim-ok', title: '금지 표현이 없어요', detail: '과장·의료·홍보 문구가 상품명에 없습니다.', fix: '그대로 유지하세요.' });
    }
    parts.push({ id: 'claim', label: '금지 표현', score: claimScore, max: 20, hint: claims.length ? claims.length + '건' : '없음' });

    /* 정보 구성 — 점수에는 넣지 않고 조언만 */
    if (!specTokens.length) {
      issues.push({
        level: 'warn', code: 'spec-missing', title: '용량·수량·규격이 없어요',
        detail: '숫자로 된 대표 옵션(예: 500ml, 2개입, 15000Pa)이 없으면 구체적 검색에 걸리기 어렵습니다.',
        fix: '가장 많이 찾는 옵션 1개를 숫자와 단위로 넣으세요.',
      });
    } else {
      issues.push({ level: 'good', code: 'spec-ok', title: '규격·수량이 들어 있어요', detail: specTokens.slice(0, 3).join(', '), fix: '대표 옵션 1개만 유지하세요.' });
    }
    if (tokens.length >= 16) {
      issues.push({ level: 'warn', code: 'too-many-tokens', title: '단어가 너무 많아요', detail: tokens.length + '개 — 나열식 상품명은 읽히지 않습니다.', fix: '핵심 단어 8개 이하로 줄이세요.' });
    }

    /* 추가 키워드 현황 */
    const extraKeywords = keywords.slice(1).map(function (k) {
      const info = keywordInfo(name, k, platform.id);
      return { keyword: k, present: info.exact, partial: info.partial };
    });

    const total = clamp(parts.reduce(function (a, p) { return a + p.score; }, 0), 0, 100);
    const grade = gradeOf(total);

    issues.sort(function (a, b) {
      const rank = { danger: 0, warn: 1, good: 2 };
      return rank[a.level] - rank[b.level];
    });

    /* 하이라이트 구간: 금지 표현 + 기호 + 두 번째부터의 중복 단어 */
    const highlights = [];
    claims.forEach(function (c) { highlights.push({ start: c.index, end: c.index + c.length, type: c.group === 'medical' || c.group === 'hype' ? 'claim' : 'policy' }); });
    symbols.items.forEach(function (it) { highlights.push({ start: it.index, end: it.index + (it.length || 1), type: 'symbol' }); });
    duplicates.forEach(function (d) {
      d.indexes.slice(1).forEach(function (idx) {
        const t = tokens.find(function (tk) { return tk.index === idx; });
        if (t) highlights.push({ start: idx, end: idx + t.length, type: 'dup' });
      });
    });

    return {
      platform: platform.id, platformLabel: platform.label, name: name, length: length,
      total: total, grade: grade, gradeLabel: GRADE_LABELS[grade], gradeTone: grade.toLowerCase(),
      provisional: !mainKeyword,
      parts: parts,
      issues: issues,
      metrics: {
        length: length, tokens: tokens.length,
        keywordIndex: kw.index, keywordFront: kw.exact && kw.index <= platform.frontChars,
        duplicateCount: duplicates.length, symbolCount: symbols.total,
        claimCount: claims.length, specCount: specTokens.length,
      },
      keyword: kw, keywords: keywords, extraKeywords: extraKeywords,
      duplicates: duplicates, symbols: symbols, claims: claims, specTokens: specTokens,
      highlights: highlights,
    };
  }

  /* ── 개선 상품명 제안 ──────────────────────────────────── */
  function fitTokens(list, max) {
    const out = [];
    let len = 0;
    list.forEach(function (raw) {
      const t = String(raw || '').trim();
      if (!t) return;
      const key = t.toLowerCase();
      if (out.some(function (v) { return v.toLowerCase() === key; })) return;
      const add = (out.length ? 1 : 0) + codePoints(t);
      if (len + add > max) return;
      out.push(t);
      len += add;
    });
    if (!out.length) return String(list[0] || '').slice(0, max);
    return out.join(' ');
  }

  function suggestNames(input) {
    const o = input || {};
    const platform = getPlatform(o.platform);
    const name = String(o.name == null ? '' : o.name).trim();
    if (!name) return [];
    const keywords = splitKeywords(o.keyword);
    const main = keywords[0] || '';
    const cleaned = stripClaims(name).replace(/^\[[^\]]{1,20}\]\s*/, '').replace(/\s{2,}/g, ' ').trim();
    const tokens = tokenize(cleaned).map(function (t) { return t.raw; });
    const mainTokens = tokenize(main).map(function (t) { return t.text; });
    const mainGlued = mainTokens.join('');
    const rest = tokens.filter(function (t) {
      const k = String(t).toLowerCase();
      if (mainTokens.indexOf(k) >= 0) return false;
      if (mainGlued && k === mainGlued) return false;
      return true;
    });
    const specs = rest.filter(isSpecToken);
    const plain = rest.filter(function (t) { return !isSpecToken(t); });
    const first = main || tokens[0] || '';

    const raw = [
      { label: '키워드 먼저', reason: '검색어를 앞 20자 안으로 옮긴 버전', list: [first].concat(specs.slice(0, 1), plain) },
      { label: '핵심 특징 강조', reason: '키워드 + 대표 옵션 + 특징 순서', list: [first].concat(specs.slice(0, 2), plain.slice(0, 3)) },
      { label: '짧고 선명하게', reason: '가장 필요한 단어만 남긴 버전', list: [first].concat(plain.slice(0, 2)) },
    ];

    const seen = {};
    const out = [];
    raw.forEach(function (cand) {
      const max = cand.label === '짧고 선명하게' ? Math.min(platform.maxLength, 34) : platform.idealMax;
      const text = fitTokens(cand.list.filter(Boolean), max).trim();
      if (!text || seen[text]) return;
      seen[text] = true;
      const score = analyzeName({ platform: platform.id, name: text, keyword: o.keyword });
      out.push({ label: cand.label, reason: cand.reason, text: text, length: codePoints(text), score: score.total, grade: score.grade });
    });
    return out;
  }

  /* ── 상세페이지 7단 카피 · 헤드라인 · FAQ ───────────────── */
  const SECTION_META = [
    { id: 'empathy', title: '공감', goal: '고객이 지금 겪는 상황을 먼저 말한다' },
    { id: 'problem', title: '문제', goal: '안 고르면 생기는 손해를 구체적으로' },
    { id: 'solution', title: '해결', goal: '이 상품이 무엇을 바꾸는지 한 줄로' },
    { id: 'spec', title: '스펙', goal: '숫자와 구성으로 확인시킨다' },
    { id: 'compare', title: '비교', goal: '같은 값이면 무엇이 다른지' },
    { id: 'review', title: '리뷰 예상', goal: '고객이 남길 포인트와 답변 준비' },
    { id: 'cta', title: '구매 유도', goal: '망설이는 한 가지를 없애고 닫는다' },
  ];

  const WHY = [
    '매일 손이 가는 물건일수록 여기서 만족이 갈립니다',
    '광고 사진에서는 보이지 않는 부분입니다',
    '오래 쓸수록 차이가 커지는 지점입니다',
  ];

  function cleanText(v, fallback) {
    const s = String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
    return s || fallback || '';
  }

  function buildCopyKit(input) {
    const o = input || {};
    const name = cleanText(o.name, '이 상품');
    const target = cleanText(o.target, '이 상품을 찾는 분');
    const rawBenefits = Array.isArray(o.benefits) ? o.benefits : [];
    const b1 = cleanText(rawBenefits[0], '핵심 기능');
    const b2 = cleanText(rawBenefits[1], '');
    const b3 = cleanText(rawBenefits[2], '');
    const weakness = cleanText(o.weakness, '');
    const keyword = cleanText(o.keyword, '');
    const benefits = [b1, b2, b3].filter(Boolean);

    const headlines = [
      { type: '숫자형', text: josa(target, '이/가') + ' ' + josa(b1, '을/를') + ' 고르는 기준 3가지' },
      { type: '질문형', text: b1 + ', ' + target + '에게 정말 필요할까요?' },
      { type: '반전형', text: name + ' 한 번 쓰고 다시 안 돌아간 이유' },
      { type: '비교형', text: '같은 가격대, ' + josa(name, '이/가') + ' 다른 점 하나' },
      { type: '손실회피형', text: josa(target, '이/가') + ' ' + (weakness ? weakness + ' 때문에' : '싼 제품 골랐다가') + ' 돈 두 번 쓰는 이유' },
    ].map(function (h) { return { type: h.type, text: h.text, length: codePoints(h.text) }; });

    const sections = [];

    /* 1. 공감 */
    sections.push({
      id: 'empathy', no: 1, title: '공감',
      lead: josa(target, '이라면/라면') + ' ' + (weakness ? weakness + ' — 이 부분이 제일 걸리실 거예요.' : '고르다 지쳐서 대충 사게 되는 순간이 있어요.'),
      body: josa(name, '을/를') + ' 볼 때도 같습니다. 사진은 그럴듯한데 내 상황에 맞는지, 오래 쓸 수 있는지가 먼저 걸립니다. 그래서 이 페이지는 자랑부터 하지 않고 무엇이 달라지는지 순서로 적었습니다.',
      bullets: [
        target + ' 기준으로 실제로 쓰는 상황부터 짚었습니다',
        '스펙은 숫자로, 아쉬운 점은 그대로 적었습니다',
        '사기 전에 확인할 것과 산 뒤에 확인할 것을 나눠 두었습니다',
      ],
    });

    /* 2. 문제 */
    sections.push({
      id: 'problem', no: 2, title: '문제',
      lead: '시중 제품에서 자주 걸리는 건 이 세 가지입니다.',
      body: '가격만 보고 고르면 ' + josa(target, '이/가') + ' 원한 것과 다른 걸 받게 됩니다. 아래 세 가지는 ' + josa(name, '을/를') + ' 고를 때 꼭 확인하세요.',
      bullets: [
        b1 + '이 애매하면 결국 다시 삽니다',
        (b2 || '설명이 숫자로 안 나오면') + ' 써 보고 나서야 알게 됩니다',
        (weakness ? weakness + ' — 여기서 실망하는 분이 많습니다' : '무엇을 기준으로 골라야 할지 안내가 없습니다'),
      ],
    });

    /* 3. 해결 */
    sections.push({
      id: 'solution', no: 3, title: '해결',
      lead: josa(name, '은/는') + ' 이 세 가지를 한 번에 정리한 제품입니다.',
      body: benefits.map(function (b, i) {
        return b + ' — ' + WHY[i % WHY.length] + '.';
      }).join(' '),
      bullets: benefits.map(function (b) { return b; }),
    });

    /* 4. 스펙 */
    sections.push({
      id: 'spec', no: 4, title: '스펙',
      lead: '스펙은 표로 먼저 봅니다. 숫자가 없으면 비교가 안 됩니다.',
      body: '무게·크기·용량·소재·인증 중 확인되는 값을 채워 주세요. 빈칸이 하나라도 있으면 문의가 그만큼 늘어납니다.',
      bullets: [
        '구성: ' + name + ' 본품 + (구성품 기입)',
        benefits.length ? benefits.join(' / ') : '핵심 기능',
        '규격·용량: (상세 스펙표의 숫자로 기입)',
      ],
    });

    /* 5. 비교 */
    const compareTable = [
      ['가격', '', ''],
      [b1, '', ''],
      [b2 || '사용 편의', '', ''],
      [weakness || '아쉬운 점 보완', '', ''],
      ['구성·AS', '', ''],
    ];
    sections.push({
      id: 'compare', no: 5, title: '비교',
      lead: '같은 값이면 무엇이 다른지가 남습니다.',
      body: '아래 표는 ' + [b1, b2 || '사용 편의', weakness || '아쉬운 점'].join(', ') + ' 세 축으로 비교한 뼈대입니다. 왼쪽은 흔한 제품, 오른쪽은 ' + name + '입니다.',
      bullets: compareTable.map(function (row) { return row[0]; }),
      table: { columns: ['항목', '흔한 제품', name], rows: compareTable },
    });

    /* 6. 리뷰 예상 */
    sections.push({
      id: 'review', no: 6, title: '리뷰 예상',
      lead: '리뷰는 아직 없어도 괜찮습니다. 고객이 무엇을 남길지 미리 알면 답변이 빨라집니다.',
      body: '첫 리뷰 10개까지는 이 세 가지 답변을 준비해 두세요. 같은 문장을 복사해 붙이지 말고, 리뷰에 나온 단어를 그대로 받아 주면 신뢰가 붙습니다.',
      bullets: [
        b1 + '을 확인하고 "기대와 같았다"고 남기는 경우',
        (weakness ? josa(weakness, '이/가') + ' 생각보다 괜찮았다' : '포장·구성이 깔끔했다') + '고 남기는 경우',
        '배송·사용법 질문이 섞여 들어오는 경우',
      ],
      templates: [
        '남겨 주신 ' + b1 + ' 부분, 저희도 가장 신경 쓴 부분입니다. 사용 중 불편한 점은 문의 주시면 바로 확인하겠습니다.',
      ],
    });

    /* 7. 구매 유도 */
    sections.push({
      id: 'cta', no: 7, title: '구매 유도',
      lead: '여기까지 읽고도 망설여진다면, 딱 하나만 확인하세요.',
      body: (weakness ? '단점으로 꼽은 ' + weakness + ' — 이게 괜찮다면' : '옵션의 규격과 구성이 맞는다면') + ' ' + josa(name, '은/는') + ' 충분히 값어치가 있습니다. 반대로 ' + josa(b1, '이/가') + ' 필요 없는 분께는 권하지 않습니다.',
      bullets: [
        '주문 전: 옵션의 규격·구성·배송 안내 확인',
        '받은 뒤: 초기 불량은 수령 후 바로 문의',
        '문의: 상세페이지 하단 채널로 남겨 주시면 순서대로 답변',
      ],
      closing: name + ', 지금 필요한 것만 담았습니다.',
    });

    sections.forEach(function (s) {
      const meta = SECTION_META.find(function (m) { return m.id === s.id; });
      s.goal = meta ? meta.goal : '';
      const lines = [s.lead, s.body];
      if (s.table) {
        const head = '| ' + s.table.columns.join(' | ') + ' |';
        const sep = '| ' + s.table.columns.map(function () { return '---'; }).join(' | ') + ' |';
        lines.push(head, sep);
        s.table.rows.forEach(function (r) { lines.push('| ' + r.join(' | ') + ' |'); });
      }
      if (s.bullets && s.bullets.length) lines.push(s.bullets.map(function (b) { return '· ' + b; }).join('\n'));
      if (s.templates && s.templates.length) lines.push('답변 템플릿: "' + s.templates[0] + '"');
      if (s.closing) lines.push(s.closing);
      if (s.id === 'spec') lines.push('※ 괄호 안은 실제 값으로 바꿔 주세요.');
      if (s.id === 'compare') lines.push('※ 빈칸은 실제 값으로 채우세요. 불리한 항목도 숨기지 않는 편이 교환·반품을 줄입니다.');
      s.copy = lines.join('\n\n');
    });

    const faqs = [
      { q: '배송은 얼마나 걸리나요?', a: '출고는 결제 확인 후 순차적으로 진행됩니다. 정확한 도착일은 상품 옵션의 배송 안내와 택배사 조회로 확인하실 수 있어요. 주말·공휴일은 하루쯤 더 걸릴 수 있습니다.' },
      { q: '처음 쓰는데 어렵지 않나요?', a: b1 + ' — 이 부분을 중심으로 만들었고, 구성품과 사용 순서는 위 스펙 표에 정리했습니다. 받으신 뒤 설명서 순서대로 한 번만 해 보시면 됩니다.' },
      { q: '제가 쓰는 환경에도 맞을까요?', a: '옵션의 규격(크기·용량)과 ' + josa(b2 || '사용 조건', '을/를') + ' 먼저 확인해 주세요. 애매하면 문의에 사용 환경을 적어 주시면 맞는지 확인해 드립니다.' },
      { q: '불량이면 교환되나요?', a: '초기 불량은 수령 후 확인되는 대로 교환·AS로 처리합니다. 단순 변심은 수령 후 7일 이내 청약철회가 가능하고, 개봉·사용으로 상품 가치가 떨어진 경우에는 제한될 수 있어요.' },
      { q: josa(b1, '이/가') + ' 정말 다른가요?', a: '같은 기능이라도 ' + (b2 || '쓰는 방식') + '에서 차이가 납니다. 위 비교표에 항목별로 적어 두었으니 내 상황과 맞는지 먼저 봐 주세요.' },
    ].map(function (f, i) { return { no: i + 1, q: f.q, a: f.a }; });

    const fullText = buildKitText({ name: name, target: target, keyword: keyword, headlines: headlines, sections: sections, faqs: faqs });

    return {
      name: name, target: target, keyword: keyword,
      benefits: benefits, weakness: weakness,
      headlines: headlines, sections: sections, faqs: faqs,
      fullText: fullText,
    };
  }

  function buildKitText(kit) {
    const lines = [];
    lines.push('[상품] ' + kit.name);
    if (kit.target) lines.push('[타겟] ' + kit.target);
    if (kit.keyword) lines.push('[핵심 키워드] ' + kit.keyword);
    lines.push('');
    lines.push('■ 후킹 헤드라인 5종');
    kit.headlines.forEach(function (h, i) { lines.push((i + 1) + '. (' + h.type + ') ' + h.text); });
    lines.push('');
    lines.push('■ 상세페이지 7단 카피');
    kit.sections.forEach(function (s) {
      lines.push('');
      lines.push(s.no + '. ' + s.title + ' — ' + s.goal);
      lines.push(s.copy);
    });
    lines.push('');
    lines.push('■ 고객 예상 FAQ 5개');
    kit.faqs.forEach(function (f) { lines.push('Q' + f.no + '. ' + f.q); lines.push('A' + f.no + '. ' + f.a); });
    return lines.join('\n');
  }

  /* ── 마진 · 손익분기 ROAS ───────────────────────────────── */
  function calcMargin(input) {
    const o = input || {};
    const price = Math.max(0, Math.round(toNumber(o.price)));
    const cost = Math.max(0, Math.round(toNumber(o.cost)));
    const shipping = Math.max(0, Math.round(toNumber(o.shipping)));
    const feeRate = clamp(toNumber(o.feeRate), 0, 50);
    const adCost = Math.max(0, Math.round(toNumber(o.adCost)));

    if (price <= 0) {
      return {
        valid: false, price: price, cost: cost, shipping: shipping, feeRate: feeRate, adCost: adCost,
        fee: 0, totalCost: 0, netProfit: 0, marginRate: 0,
        contribution: 0, contributionRate: 0, bepRoas: null, currentRoas: null,
        adHeadroom: 0, breakEvenAdCost: 0, verdict: 'invalid', verdictLabel: '판매가를 입력하세요',
        warnings: ['판매가가 0원이면 마진을 계산할 수 없어요.'],
      };
    }

    const fee = Math.round(price * feeRate / 100);
    const totalCost = cost + shipping + fee + adCost;
    const netProfit = price - totalCost;
    const marginRate = round1(netProfit / price * 100);

    const contribution = price - cost - shipping - fee;
    const contributionRate = round1(contribution / price * 100);
    const bepRoas = contribution > 0 ? Math.round(price / contribution * 1000) / 10 : null;
    const currentRoas = adCost > 0 ? Math.round(price / adCost * 1000) / 10 : null;
    const adHeadroom = contribution - adCost;

    const warnings = [];
    if (contribution <= 0) warnings.push('광고비를 0원으로 둬도 남는 금액이 없어요. 원가·수수료·배송비를 먼저 줄여야 합니다.');
    if (netProfit < 0) warnings.push('지금 조건은 1건 팔 때마다 ' + formatWon(-netProfit) + ' 손해입니다.');
    if (currentRoas != null && bepRoas != null && currentRoas < bepRoas) {
      warnings.push('현재 ROAS ' + formatPct(currentRoas) + '가 손익분기 ' + formatPct(bepRoas) + '보다 낮습니다.');
    }

    let verdict = 'profit', verdictLabel = '흑자';
    if (netProfit === 0) { verdict = 'break'; verdictLabel = '손익분기'; }
    else if (netProfit < 0) { verdict = 'loss'; verdictLabel = '적자'; }

    return {
      valid: true, price: price, cost: cost, shipping: shipping, feeRate: round1(feeRate), adCost: adCost,
      fee: fee, totalCost: totalCost, netProfit: netProfit, marginRate: marginRate,
      contribution: contribution, contributionRate: contributionRate,
      bepRoas: bepRoas, currentRoas: currentRoas,
      adHeadroom: adHeadroom, breakEvenAdCost: Math.max(0, contribution),
      verdict: verdict, verdictLabel: verdictLabel, warnings: warnings,
    };
  }

  function priceSimulation(input, options) {
    const o = options || {};
    const base = calcMargin(input);
    if (!base.valid) return [];
    const steps = Math.max(3, Math.min(21, o.steps || 9));
    const span = o.span == null ? 0.2 : clamp(o.span, 0.05, 0.5);
    const rows = [];
    for (let i = 0; i < steps; i++) {
      const pct = -span + (2 * span) * (i / (steps - 1));
      const price = Math.max(0, Math.round(base.price * (1 + pct) / 10) * 10);
      if (rows.some(function (r) { return r.price === price; })) continue;
      const m = calcMargin({
        price: price, cost: base.cost, shipping: base.shipping,
        feeRate: base.feeRate, adCost: base.adCost,
      });
      rows.push({
        deltaPct: Math.round(pct * 1000) / 10,
        price: price,
        fee: m.fee,
        netProfit: m.netProfit,
        marginRate: m.marginRate,
        bepRoas: m.bepRoas,
        adHeadroom: m.adHeadroom,
        isBase: price === base.price,
      });
    }
    return rows;
  }

  function formatRoas(v) { return v == null ? '—' : formatPct(v); }

  /* ==========================================================
     5. 공용 엔진 연동
     ----------------------------------------------------------
     · 카피·마케팅 심리학 엔진 (engines/copy-psych-engine.js)
     · 핀터레스트 4축 디자인 엔진 (engines/design-ref-engine.js)
     엔진은 이 폴더(engines/)에 그대로 복사해 두어 이 앱만 떼어 배포해도
     동작한다. 브라우저에서는 <script>가 만든 window.* 를, node에서는
     require()를 쓴다.
     ========================================================== */
  const ENGINES = (function () {
    const out = { CopyPsych: null, DesignRef: null };
    const g = typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : {});
    if (typeof require === 'function') {
      try { out.CopyPsych = require('./engines/copy-psych-engine.js'); } catch (e) { /* 브라우저 */ }
      try { out.DesignRef = require('./engines/design-ref-engine.js'); } catch (e) { /* 브라우저 */ }
    }
    if (!out.CopyPsych && g.CopyPsych) out.CopyPsych = g.CopyPsych;
    if (!out.DesignRef && g.DesignRef) out.DesignRef = g.DesignRef;
    return out;
  })();

  function engineStatus() {
    const CP = ENGINES.CopyPsych;
    const DR = ENGINES.DesignRef;
    return {
      copy: !!(CP && typeof CP.diagnose === 'function' && typeof CP.generateAll === 'function'),
      design: !!(DR && typeof DR.recommendDesignRefs === 'function' && typeof DR.applyDesignRef === 'function'),
      copyVersion: CP ? CP.VERSION : null,
      designVersion: DR ? DR.VERSION : null,
      presets: DR ? DR.PRESETS.length : 0,
    };
  }

  /* ── 카피 심리학: 진단 · 감점 탐지 · 교정 ───────────────── */
  function diagnoseCopy(text) {
    const CP = ENGINES.CopyPsych;
    if (!CP) return null;
    const d = CP.diagnose(text);
    return {
      total: d.total,
      grade: d.grade,
      triggers: d.triggers.map(function (t) {
        return {
          id: t.id, name: t.name, en: t.en, weight: t.weight,
          score: t.score, level: t.level,
          hits: t.hits.map(function (h) { return h.phrase; }).filter(Boolean).slice(0, 3),
          fix: t.fix,
        };
      }),
      gaps: d.gaps,
      strengths: d.strengths,
      recommendations: d.recommendations,
      stats: d.stats,
      flags: d.flags,
    };
  }

  function detectCopy(text) {
    const CP = ENGINES.CopyPsych;
    if (!CP) return null;
    const d = CP.detect(text);
    return {
      friction: d.friction,
      grade: d.grade,
      count: d.count,
      groups: d.groups,
      issues: d.issues.map(function (it) {
        return {
          type: it.type, typeLabel: it.typeLabel, severity: it.severity, color: it.color,
          phrase: it.phrase, index: it.index, reason: it.reason,
          alternative: it.alternative, example: it.example, canAutoFix: it.canAutoFix,
        };
      }),
    };
  }

  function correctCopy(text) {
    const CP = ENGINES.CopyPsych;
    if (!CP) return null;
    const c = CP.correct(text);
    return {
      text: c.text,
      applied: c.applied,
      before: c.before,
      after: { friction: c.after.friction, count: c.after.count, grade: c.after.grade },
      improved: c.improved,
    };
  }

  /* ── 카피 심리학: 4대 프레임워크 ────────────────────────── */
  const FRAME_IDS = ['PAS', 'BAB', 'AIDA', '4U'];

  /** 이 앱의 상품 입력 → 엔진 입력. 비어 있으면 문장이 무너지지 않는 기본값을 만든다. */
  function frameworkInput(input) {
    const o = input || {};
    const f = o.frames || {};
    const name = cleanText(o.name, '이 상품');
    const target = cleanText(o.target, '이 상품을 찾는 분');
    const benefits = (o.benefits || []).map(function (b) { return cleanText(b, ''); }).filter(Boolean);
    const weakness = cleanText(o.weakness, '');
    const price = toNumber(o.price);
    const problem = cleanText(f.problem,
      weakness
        ? josa(weakness, '이/가') + ' 걸려서 결국 다시 삽니다'
        : josa(target, '이/가') + ' 고르다 지치는 순간');
    const solution = benefits.length
      ? benefits.slice(0, 2).join(', ')
      : cleanText(o.keyword, '고르는 기준을 한 번에 정리하는 것');
    return {
      product: name,
      target: target,
      problem: problem,
      solution: solution,
      proof: cleanText(f.proof, ''),
      cta: cleanText(f.cta, '3초 만에 확인하기'),
      urgency: cleanText(f.urgency, ''),
      priceBefore: '',
      priceAfter: price > 0 ? formatWon(price) : '',
      guarantee: '',
      brand: '',
      tone: 'casual',
    };
  }

  function generateFrameworks(input) {
    const CP = ENGINES.CopyPsych;
    if (!CP) return null;
    const I = frameworkInput(input);
    const all = CP.generateAll(I);
    const wanted = input && input.frames && FRAME_IDS.indexOf(input.frames.framework) >= 0
      ? input.frames.framework : 'PAS';
    return {
      input: I,
      items: all.items.map(function (it) {
        return {
          id: it.id, name: it.name, en: it.en, title: it.title,
          sections: it.sections.map(function (s) { return { key: s.key, label: s.label, text: s.text }; }),
          body: it.body, chars: it.chars, psych: it.psych,
        };
      }),
      comparison: all.comparison,
      bestId: all.best.id,
      chosen: wanted,
      recommendation: all.recommendation,
    };
  }

  /* ── 디자인 레퍼런스: 맥락 분석 → 3~4안 추천 → 적용 ──────── */
  function designSourceText(input) {
    const o = input || {};
    return [o.name, o.target, (o.benefits || []).join(' '), o.weakness, o.keyword]
      .map(function (v) { return cleanText(v, ''); })
      .filter(Boolean)
      .join(' ');
  }

  function paletteList(palette) {
    const p = palette || {};
    return ['bg', 'surface', 'ink', 'sub', 'line', 'accent', 'accentInk']
      .map(function (k) { return { key: k, value: p[k] || '' }; })
      .filter(function (c) { return c.value; });
  }

  function recommendDesigns(input) {
    const DR = ENGINES.DesignRef;
    if (!DR) return null;
    const o = input || {};
    const ctx = { text: designSourceText(o), purpose: '상세페이지' };
    const industry = o.industry ? (DR.normalizeIndustry(o.industry) || o.industry) : null;
    if (industry) ctx.industry = industry;
    const rec = DR.recommendDesignRefs(ctx);
    return {
      context: rec.context,
      note: rec.note,
      rejected: rec.rejected,
      defaultLookFlagged: rec.defaultLookFlagged,
      refs: rec.refs.map(function (r) {
        return {
          rank: r.rank, id: r.id, name: r.name, family: r.family, familyLabel: r.familyLabel,
          score: Math.round(r.score * 100),
          reasons: r.reasons.map(function (x) { return x.text; }),
          defaultRisk: r.defaultRisk,
          palette: r.dna.palette,
          paletteList: paletteList(r.dna.palette),
          structure: r.dna.layout.structure,
          imageRatio: r.dna.image.ratio,
          typePair: (r.dna.type && r.dna.type.family)
            ? r.dna.type.family.display + ' / ' + r.dna.type.family.body : '',
        };
      }),
    };
  }

  /** 상품명 → 미리보기 카드 제목. 금지어·장식·머리표기를 걷고 24자 안으로 줄인다. */
  function designTitleFromName(name) {
    const s = stripClaims(String(name == null ? '' : name))
      .replace(/^\[[^\]]{1,20}\]\s*/, '')
      .replace(/[★☆♥♡◆◇■□▶◀▷◁●○◎※☞☜♣♠♤]/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
    if (!s) return '상품명을 입력하세요';
    if (codePoints(s) <= 24) return s;
    const words = s.split(' ');
    let out = '';
    words.forEach(function (w) {
      const next = out ? out + ' ' + w : w;
      if (codePoints(next) <= 24) out = next;
    });
    return out || Array.from(s).slice(0, 24).join('');
  }

  /** 미리보기 문구 — 비어 있으면 상품명·장점에서 채운다. */
  function designContent(input) {
    const o = input || {};
    const d = o.design || {};
    const benefits = (o.benefits || []).map(function (b) { return cleanText(b, ''); }).filter(Boolean);
    const price = toNumber(o.price);
    return {
      kicker: cleanText(d.kicker, '상세페이지'),
      title: cleanText(d.title, designTitleFromName(o.name)),
      body: cleanText(d.body, benefits.slice(0, 2).join(' · ')),
      cta: cleanText(d.cta, '3초 만에 확인하기'),
      badge: cleanText(d.badge, price > 0 ? formatWon(price) : ''),
      brand: cleanText(d.brand, ''),
      image: d.image || '',
      imageAlt: cleanText(o.name, '상품 이미지'),
    };
  }

  /* 프리셋별로 480px 카드에 무리 없이 들어가는 제목 길이.
     실측(Chrome)으로 제목 영역과 버튼이 겹치지 않는 최대치를 잡았다.
     미니멀 럭셔리는 원래 4~6자 포스터용이라 별도 세로 배치를 쓴다. */
  const TITLE_CAP = {
    'swiss-magazine': 26,
    'bento-saas': 22,
    'cream-editorial': 18,
    'dark-neon': 16,
    'commerce-clean': 24,
    'neo-brutalism': 12,
    'minimal-luxury': 6,
    'vivid-pop': 16,
  };

  function designTitleCap(presetOrId) {
    const DR = ENGINES.DesignRef;
    const id = typeof presetOrId === 'string' ? presetOrId : (presetOrId && presetOrId.id);
    if (DR) {
      try {
        const dna = DR.dnaOf(presetOrId);
        if (dna && dna.layout && dna.layout.structure === 'minimal-poster') return 6;
      } catch (e) { /* 아래 표로 대체 */ }
    }
    return TITLE_CAP[id] == null ? 20 : TITLE_CAP[id];
  }

  /** 단어 경계에서 자른다. 말줄임표 없이 끝나야 디자인이 지저분해지지 않는다. */
  function fitText(text, max) {
    const s = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
    if (!max || codePoints(s) <= max) return s;
    const words = s.split(' ');
    let out = '';
    words.forEach(function (w) {
      const next = out ? out + ' ' + w : w;
      if (codePoints(next) <= max) out = next;
    });
    return out || Array.from(s).slice(0, max).join('');
  }

  /** 미니멀 포스터형: 제목이 긴 상품명이어도 겹치지 않게 세로로 다시 배치한다. */
  function posterCardHtml(preset, content, width) {
    const DR = ENGINES.DesignRef;
    const c = content || {};
    const t = DR.tokens(preset);
    const dna = DR.dnaOf(preset);
    const p = typeof preset === 'string' ? DR.get(preset) : preset;
    const w = width || 480;
    const h = Math.round(w * 1.25);
    const k = w / 480;
    const palette = t.color;
    const serif = t.type.familyStack[p.type.family.display] || t.type.familyStack.serif;
    const bodyFont = t.type.familyStack[p.type.family.body] || t.type.familyStack.sans;
    const pad = Math.round(34 * k);
    const esc = escapeHtml;
    const titleSize = Math.round(34 * k);
    const bodySize = Math.round(13 * k);
    const ctaSize = Math.round(12.5 * k);
    const imgBlock = Math.round(h * 0.48);
    const titleText = fitText(c.title || '제목을 입력하세요', 22);
    const img = c.image
      ? '<img src="' + esc(c.image) + '" alt="' + esc(c.imageAlt || '') + '" style="width:100%;height:100%;object-fit:cover;object-position:50% 50%;filter:' + (dna.image && dna.image.treatment ? dna.image.treatment : 'none') + ';">'
      : '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:' + palette.sub + ';font-size:' + Math.round(12 * k) + 'px;background:' + palette.accentSoft + ';">이미지 영역</div>';
    const badge = c.badge
      ? '<div style="position:absolute;right:' + Math.round(14 * k) + 'px;top:' + Math.round(14 * k) + 'px;' +
        'background:' + palette.accent + ';color:' + palette.accentInk + ';padding:' + Math.round(5 * k) + 'px ' + Math.round(10 * k) + 'px;' +
        'font:700 ' + Math.round(9.5 * k) + 'px/1.3 ' + bodyFont + ';letter-spacing:.04em;">' + esc(c.badge) + '</div>'
      : '';
    return [
      '<figure class="pm-card pm-has-image pm-poster" data-structure="minimal-poster" style="position:relative;margin:0;box-sizing:border-box;overflow:hidden;',
      'width:' + w + 'px;height:' + h + 'px;background:' + palette.bg + ';color:' + palette.ink + ';',
      'border:' + (p.layout.border ? p.layout.border + 'px solid ' + palette.line : 'none') + ';border-radius:' + dna.graphics.radius + 'px;',
      'display:flex;flex-direction:column;font-family:' + bodyFont + ';">',
      '<div style="position:relative;flex:0 0 ' + imgBlock + 'px;overflow:hidden;background:' + palette.accentSoft + ';">' + img + badge + '</div>',
      '<div style="flex:1;display:flex;flex-direction:column;padding:' + Math.round(pad * 0.7) + 'px ' + pad + 'px ' + Math.round(pad * 0.8) + 'px;text-align:center;">',
      c.kicker ? '<div style="font:600 ' + Math.round(9.5 * k) + 'px/1.4 ' + bodyFont + ';letter-spacing:.22em;color:' + palette.accent + ';text-transform:uppercase;">' + esc(c.kicker) + '</div>' : '',
      '<div class="pm-poster-title" style="margin-top:' + Math.round(10 * k) + 'px;font-family:' + serif + ';font-weight:' + (dna.type.displayWeight || 400) + ';font-size:' + titleSize + 'px;line-height:1.3;letter-spacing:-0.01em;' +
      '-webkit-line-clamp:2;-webkit-box-orient:vertical;display:-webkit-box;overflow:hidden;word-break:keep-all;">' + esc(titleText) + '</div>',
      c.body ? '<div style="margin-top:' + Math.round(8 * k) + 'px;font-size:' + bodySize + 'px;line-height:1.6;color:' + palette.sub + ';' +
        '-webkit-line-clamp:2;-webkit-box-orient:vertical;display:-webkit-box;overflow:hidden;word-break:keep-all;">' + esc(c.body) + '</div>' : '',
      '<div style="margin-top:auto;padding-top:' + Math.round(12 * k) + 'px;">',
      '<span style="display:inline-flex;align-items:center;justify-content:center;height:' + Math.round(t.cta.height * k) + 'px;padding:0 ' + Math.round(20 * k) + 'px;' +
      'background:' + palette.accent + ';color:' + palette.accentInk + ';border-radius:' + Math.round(t.cta.radius * k) + 'px;font-weight:700;font-size:' + ctaSize + 'px;">' + esc(c.cta || '자세히 보기') + '</span>',
      '</div></div></figure>',
    ].join('');
  }

  /**
   * 선택한 레퍼런스를 미리보기 카드에 적용한다.
   * @param {string|object} preset  프리셋 id 또는 buildCustomTheme 결과
   * @param {object} content        designContent() 결과
   * @param {object} [opts]         { width, contextText }
   */
  function applyDesign(preset, content, opts) {
    const DR = ENGINES.DesignRef;
    if (!DR) return null;
    const o = opts || {};
    const c = content || {};
    const width = o.width || 420;
    const applied = DR.applyDesignRef(preset, c, {
      context: { text: o.contextText || c.title || '' },
      html: { width: width },
      css: { selector: '.design-preview', prefix: 'ds' },
      canvas: { width: width * 2, height: Math.round(width * 2 * 1.35) },
    });
    const tk = DR.tokens(preset);
    const safety = DR.imageTextSafety(preset, { textColor: tk.color.ink, secondaryTextColor: tk.color.sub });
    const warns = applied.warnings.slice();
    if (safety && !safety.pass && warns.indexOf(safety.note) < 0) warns.push(safety.note);

    /* 카드에 들어가는 제목 길이 — 넘치면 줄이고, 포스터형은 세로 배치로 바꾼다. */
    const cap = designTitleCap(preset);
    let html = applied.html;
    const safeContent = Object.assign({}, c);
    const isPoster = cap < 8;
    if (isPoster) {
      html = posterCardHtml(preset, c, width);
      warns.push('이 레퍼런스는 원래 4~6자 포스터용이라, 긴 상품명이 겹치지 않도록 이미지·제목·버튼을 세로로 다시 배치했습니다.');
    } else {
      const fitted = fitText(c.title || '', cap);
      if (fitted !== String(c.title == null ? '' : c.title).trim()) {
        safeContent.title = fitted;
        html = DR.toHTML(preset, safeContent, { width: width });
        warns.push('이 구도는 제목 ' + cap + '자까지 들어갑니다. 미리보기 제목을 ' + cap + '자로 줄였습니다.');
      }
    }

    return {
      refId: applied.refId,
      name: applied.name,
      html: html,
      css: applied.css,
      poster: isPoster,
      checklist: applied.checklist,
      warnings: warns,
      imageRules: applied.imageRules,
      safety: safety,
      dna: {
        layout: applied.dna.layout,
        image: applied.dna.image,
        graphics: applied.dna.graphics,
        type: applied.dna.type,
        palette: applied.dna.palette,
        ratio: applied.dna.ratio,
      },
      tokens: {
        color: tk.color,
        type: { base: tk.type.base, ratio: tk.type.ratio, family: tk.type.family, roles: tk.type.roles },
        space: { unit: tk.space.unit, gutter: tk.space.gutter, margin: tk.space.margin },
        shape: tk.shape,
        a11y: tk.a11y,
      },
      meta: applied.meta,
    };
  }

  /** 브라우저 Canvas의 ImageData 픽셀(RGBA)에서 팔레트를 뽑는다. */
  function paletteFromPixels(pixels) {
    const DR = ENGINES.DesignRef;
    if (!DR || !pixels || typeof pixels.length !== 'number') return null;
    let ex;
    try { ex = DR.extractPaletteFromPixels(pixels); }
    catch (e) { return { ok: false, reason: e && e.message ? e.message : 'invalid-pixels', palette: null }; }
    if (!ex.ok) return { ok: false, reason: ex.reason || 'unknown', palette: null };
    return {
      ok: true,
      palette: ex.palette,
      paletteList: paletteList(ex.palette),
      raw: (ex.raw || []).slice(0, 6),
      contrast: ex.contrast,
      allPass: ex.allPass,
      confidence: ex.confidence,
      isDefaultLook: ex.isDefaultLook,
    };
  }

  /** 추출 팔레트 + 선택한 레퍼런스의 레이아웃·타이포를 유지한 커스텀 테마 */
  function themeFromPalette(palette, baseId, name) {
    const DR = ENGINES.DesignRef;
    if (!DR || !palette) return null;
    try {
      return DR.buildCustomTheme({ name: name || '내 레퍼런스', palette: palette, base: baseId || 'commerce-clean' });
    } catch (e) { return null; }
  }

  /* ══════════════════════════════════════════════════════════
     6. 디자인 엔진 v2
        · 핀터레스트·비핸스 1클릭 검색
        · 레퍼런스 사진 해부 프롬프트 → 블루프린트 JSON 복제 렌더
        · 폰트 믹스 6종 / 종이 질감 4종 / 글자 밀도 경고
        · 브랜드 키트 고정(색·폰트·질감·구도) — 저장은 앱(localStorage)이 맡는다
     ========================================================== */
  const DEFAULT_FONT_MIX = 'pretendard-only';
  const DEFAULT_GRAIN = 'none';

  function designV2Ready() {
    const DR = ENGINES.DesignRef;
    return !!(DR && DR.V2 && typeof DR.applyBlueprintJSON === 'function'
      && typeof DR.serializeBrandKit === 'function');
  }

  function designV2Info() {
    const DR = ENGINES.DesignRef;
    if (!designV2Ready()) {
      return { ok: false, version: DR ? DR.VERSION : null, schema: null, densityLimit: 25, mixes: [], grains: [] };
    }
    return {
      ok: true,
      version: DR.VERSION,
      schema: DR.V2.schema,
      densityLimit: DR.V2.densityLimit,
      mixes: DR.listFontMixes().map(function (m) {
        return { id: m.id, name: m.name, note: m.note };
      }),
      grains: DR.listGrains().map(function (g) {
        return { id: g.id, name: g.name, amount: g.amount, note: g.note };
      }),
    };
  }

  /** 업종·본문 맥락 → 핀터레스트·비핸스 검색 링크 */
  function referenceSearches(input) {
    const DR = ENGINES.DesignRef;
    if (!designV2Ready()) return { ok: false, reason: 'design-v2-missing', queries: [], links: [] };
    const o = input || {};
    const text = designSourceText(o) || designTitleFromName(o.name);
    const ctx = { text: text, purpose: '상세페이지' };
    const industry = o.industry ? (DR.normalizeIndustry(o.industry) || o.industry) : null;
    if (industry) ctx.industry = industry;
    const r = DR.buildReferenceSearchUrls(ctx);
    return {
      ok: true,
      context: r.context,
      queries: r.queries,
      links: r.links.map(function (l) {
        return { site: l.site, siteLabel: l.siteLabel, lang: l.lang, q: l.q, label: l.label, url: l.url };
      }),
      primary: r.primary,
      note: r.note,
    };
  }

  /** 레퍼런스 사진 1장과 함께 AI에 붙여넣을 해부 프롬프트 */
  function visionPrompt(input) {
    const DR = ENGINES.DesignRef;
    if (!designV2Ready()) return { ok: false, reason: 'design-v2-missing', prompt: '' };
    const o = input || {};
    const c = designContent(o);
    const opts = {
      title: c.title,
      body: c.body,
      text: designSourceText(o),
      purpose: '상세페이지',
      ratio: o.ratio || '4:5',
    };
    if (o.industry) opts.industry = DR.normalizeIndustry ? (DR.normalizeIndustry(o.industry) || o.industry) : o.industry;
    const vp = DR.buildVisionBlueprintPrompt(opts);
    return {
      ok: true,
      prompt: vp.prompt,
      schema: vp.schema,
      example: vp.example,
      jsonOnly: vp.jsonOnly,
      ratio: vp.ratio,
      chars: vp.chars,
      tips: vp.tips || [],
    };
  }

  /** AI가 준 문자열을 그대로 받아 블루프린트로 파싱·검증·렌더한다. */
  function applyBlueprint(aiText, input, opts) {
    const DR = ENGINES.DesignRef;
    if (!designV2Ready()) return { ok: false, error: '디자인 엔진 v2를 불러오지 못했어요.' };
    if (!String(aiText == null ? '' : aiText).trim()) {
      return { ok: false, error: 'AI가 준 JSON을 먼저 붙여넣어 주세요.' };
    }
    const o = opts || {};
    const c = designContent(input || {});
    let out;
    try {
      out = DR.applyBlueprintJSON(aiText, c, {
        width: o.width || 480,
        css: { selector: '.v2-scope', prefix: 'v2' },
      });
    } catch (e) {
      return { ok: false, error: (e && e.message) || 'JSON을 읽지 못했어요.' };
    }
    if (!out || !out.ok) {
      return { ok: false, error: (out && out.error) || 'JSON을 읽지 못했어요.', warnings: (out && out.warnings) || [] };
    }
    return {
      ok: true,
      blueprint: out.blueprint,
      html: out.html,
      css: out.css,
      canvas: out.canvas,
      density: out.density,
      warnings: (out.warnings || []).slice(),
      fixes: (out.fixes || []).slice(),
      meta: out.meta,
      name: (out.blueprint && out.blueprint.name) || 'AI 블루프린트',
      fingerprint: out.meta && out.meta.fingerprint,
    };
  }

  /** 폰트 믹스 id → 프리셋·블루프린트 키트의 타이포 값 */
  function applyFontMixToKit(kit, mixId) {
    const DR = ENGINES.DesignRef;
    if (!kit || !mixId || !DR) return kit;
    let m;
    try { m = DR.fontMix(mixId); } catch (e) { return kit; }
    if (!m) return kit;
    const styleOf = function (family) {
      if (family === 'serif-heading' || family === 'serif') return 'serif';
      if (family === 'rounded') return 'rounded';
      if (family === 'mono') return 'mono';
      return 'sans';
    };
    kit.type = Object.assign({}, kit.type, {
      titleFamily: m.title.family,
      bodyFamily: m.body.family,
      titleStyle: styleOf(m.title.family),
      bodyStyle: styleOf(m.body.family),
      titleWeight: m.title.weight,
      bodyWeight: m.body.weight,
      titleTracking: m.title.tracking,
      bodyTracking: m.body.tracking,
      titleLineHeight: m.title.lineHeight,
      bodyLineHeight: m.body.lineHeight,
      fontMix: m.id,
    });
    return kit;
  }

  /** 키트에 폰트 믹스·질감을 덮어쓰고 지문을 다시 계산한다(정상 상태 유지). */
  function tuneKit(kit, opts) {
    const DR = ENGINES.DesignRef;
    if (!kit) return null;
    const o = opts || {};
    const name = o.name || kit.name;
    let next = kit;
    if (o.fontMix) next = applyFontMixToKit(next, o.fontMix);
    if (o.grain) {
      try { next.grain = DR.normalizeGrain(o.grain); } catch (e) { /* 알 수 없는 질감은 그대로 */ }
    }
    try {
      return DR.serializeBrandKit(next, { name: name });
    } catch (e) {
      return next;
    }
  }

  /** 선택한 레퍼런스(프리셋) → 브랜드 키트 */
  function presetKit(presetId, opts) {
    const DR = ENGINES.DesignRef;
    if (!designV2Ready()) return null;
    const o = opts || {};
    let kit;
    try {
      kit = DR.serializeBrandKit(presetId || 'commerce-clean', {
        name: o.name || '내 브랜드',
        grain: o.grain || DEFAULT_GRAIN,
        fontMix: o.fontMix || DEFAULT_FONT_MIX,
        palette: o.palette || undefined,
      });
    } catch (e) { return null; }
    return tuneKit(kit, { fontMix: o.fontMix || DEFAULT_FONT_MIX, grain: o.grain || DEFAULT_GRAIN });
  }

  /** 사진에서 잰 블루프린트 → 브랜드 키트 */
  function blueprintKit(blueprint, opts) {
    const DR = ENGINES.DesignRef;
    if (!designV2Ready() || !blueprint) return null;
    const o = opts || {};
    let kit;
    try {
      kit = DR.serializeBrandKit({ blueprint: blueprint }, { name: o.name || 'AI 블루프린트' });
    } catch (e) { return null; }
    return tuneKit(kit, { name: o.name, fontMix: o.fontMix, grain: o.grain });
  }

  /** 브랜드 키트로 카드 렌더 */
  function renderKit(kit, input, opts) {
    const DR = ENGINES.DesignRef;
    if (!designV2Ready() || !kit) return { ok: false, error: '브랜드 키트가 없습니다.' };
    const o = opts || {};
    const c = designContent(input || {});
    let run;
    try {
      run = DR.applyBrandKit(kit, c, {
        width: o.width || 480,
        html: { width: o.width || 480 },
        css: { selector: '.v2-scope', prefix: 'v2' },
      });
    } catch (e) {
      return { ok: false, error: (e && e.message) || '브랜드 키트를 렌더하지 못했어요.' };
    }
    if (!run || !run.ok) {
      return { ok: false, error: ((run && run.errors) || ['브랜드 키트를 렌더하지 못했어요.']).join(' / ') };
    }
    return {
      ok: true,
      preset: run.preset || null,
      html: run.html,
      css: run.css,
      canvas: run.canvas,
      density: run.density,
      warnings: (run.warnings || []).slice(),
      meta: run.meta,
      kit: run.kit,
      kitId: run.kitId,
      drift: !!run.drift,
    };
  }

  /**
   * v2 카드 한 장 렌더 — 세 가지 출처를 같은 모양으로 돌려준다.
   * @param {object} source { kind:'preset', presetId } | { kind:'blueprint', blueprint } | { kind:'kit', kit }
   * @param {object} input  designInput()
   * @param {object} [opts] { width, fontMix, grain, name }
   */
  function v2Card(source, input, opts) {
    const o = opts || {};
    const width = o.width || 480;
    const src = source || { kind: 'preset', presetId: 'commerce-clean' };
    let kit = null;
    let name = '';
    let label = '';

    if (src.kind === 'blueprint') {
      kit = blueprintKit(src.blueprint, { name: src.name || o.name || 'AI 블루프린트', fontMix: o.fontMix, grain: o.grain });
      label = 'blueprint';
      name = kit ? kit.name : 'AI 블루프린트';
    } else if (src.kind === 'kit') {
      kit = tuneKit(DRClone(src.kit), { name: o.name, fontMix: o.fontMix, grain: o.grain });
      label = 'kit';
      name = kit ? kit.name : '브랜드 키트';
    } else {
      kit = presetKit(src.presetId || (input && input.design && input.design.refId), {
        name: o.name, fontMix: o.fontMix || DEFAULT_FONT_MIX, grain: o.grain || DEFAULT_GRAIN,
        palette: o.palette,
      });
      label = 'preset';
      name = kit ? kit.name : '프리셋';
    }
    if (!kit) return { ok: false, error: '카드를 만들지 못했어요.' };

    const run = renderKit(kit, input, { width: width });
    if (!run.ok) return run;
    const density = run.density || checkDensity(designContent(input || {}));

    /* 4~6자 포스터용 프리셋(minimal-luxury)은 긴 상품명이 겹친다.
       v1 미리보기와 같은 세로 재배치 카드로 바꾸고, 선택한 질감만 덧입힌다. */
    const posterId = (kit.base && kit.base.presetId) || src.presetId;
    let html = run.html;
    const warnings = (run.warnings || []).slice();
    if (label === 'preset' && posterId && designTitleCap(posterId) < 8 && run.preset) {
      html = posterCardHtml(run.preset, designContent(input || {}), width);
      const DR = ENGINES.DesignRef;
      const grainHtml = kit.grain && kit.grain.amount > 0 && DR.grainOverlayHTML
        ? DR.grainOverlayHTML({ grain: kit.grain })
        : '';
      if (grainHtml) html = html.replace(/<\/figure>\s*$/, grainHtml + '</figure>');
      warnings.push('이 레퍼런스는 원래 4~6자 포스터용이라, 긴 상품명이 겹치지 않도록 이미지·제목·버튼을 세로로 다시 배치했습니다.');
    }
    return Object.assign(run, {
      ok: true,
      kind: label,
      name: name,
      kit: kit,
      html: html,
      poster: html !== run.html,
      fontMix: kit.type.fontMix,
      grain: kit.grain ? kit.grain.id : 'none',
      density: density,
      warnings: warnings,
    });
  }

  function DRClone(v) {
    try { return JSON.parse(JSON.stringify(v)); } catch (e) { return v; }
  }

  /** 저장용 키트 문자열 / 불러오기 */
  function kitToJSON(kit) {
    const DR = ENGINES.DesignRef;
    if (!designV2Ready() || !kit) return '';
    try { return DR.brandKitJSON(kit); } catch (e) { return ''; }
  }

  function kitFromJSON(text) {
    const DR = ENGINES.DesignRef;
    if (!designV2Ready()) return { ok: false, errors: ['디자인 엔진 v2를 불러오지 못했어요.'] };
    const parsed = DR.parseBrandKit(String(text == null ? '' : text));
    if (!parsed.ok) return { ok: false, errors: parsed.errors || ['브랜드 키트 JSON을 읽지 못했어요.'] };
    return { ok: true, kit: parsed.kit, drift: !!parsed.drift, name: parsed.kit.name };
  }

  /** 제목·본문·CTA·배지·키커의 글자 수 밀도 경고(한 장 25자 기준) */
  function checkDensity(content) {
    const DR = ENGINES.DesignRef;
    if (!designV2Ready()) return null;
    const c = content || {};
    return DR.checkVisualDensity({
      kicker: c.kicker || '', title: c.title || '', body: c.body || '',
      cta: c.cta || '', badge: c.badge || '',
    });
  }

  /* ══════════════════════════════════════════════════════════
     7. 연관키워드 경쟁강도 1초 계산기
     ----------------------------------------------------------
     경쟁강도 = 네이버 쇼핑 등록 상품수 ÷ 월 검색량(PC+모바일).
     셀러 도구들이 쓰는 정의(상품수/총검색수)와 같다. 등급 경계와
     추천 점수는 이 앱의 참고 기준이며 공식 지표가 아니다.
     ========================================================== */
  const COMPETITION_GRADES = [
    { id: 'blue', label: '블루오션', tone: 'blue', max: 0.35, desc: '검색하는 사람이 상품보다 3배 이상 많습니다. 신규 진입 1순위.' },
    { id: 'honey', label: '꿀', tone: 'honey', max: 1, desc: '수요가 공급보다 많습니다. 상품명·첫 문장만 잡으면 노출됩니다.' },
    { id: 'normal', label: '보통', tone: 'normal', max: 3, desc: '공급이 조금 앞섭니다. 리뷰와 상세페이지로 승부해야 합니다.' },
    { id: 'red', label: '레드오션', tone: 'red', max: Infinity, desc: '공급 과잉입니다. 광고 없이는 상위 노출이 어렵습니다.' },
  ];

  const COMPETITION_SORTS = [
    { id: 'recommend', label: '추천순' },
    { id: 'index', label: '경쟁강도 낮은순' },
    { id: 'searches', label: '검색량 많은순' },
    { id: 'products', label: '상품수 적은순' },
    { id: 'keyword', label: '키워드 가나다' },
  ];

  /** '1,234' '1.2만' '3천' '12.5k' → 정수 */
  function parseCount(v) {
    const s = String(v == null ? '' : v).replace(/[,\s]/g, '').replace(/(회|건|개|원|명)$/g, '');
    if (!s) return 0;
    const m = s.match(/^(-?\d+(?:\.\d+)?)(만|천|k|K|m|M)?$/);
    if (!m) return 0;
    const n = parseFloat(m[1]);
    if (!isFinite(n)) return 0;
    const unit = m[2];
    if (unit === '만') return Math.round(n * 10000);
    if (unit === '천' || unit === 'k' || unit === 'K') return Math.round(n * 1000);
    if (unit === 'm' || unit === 'M') return Math.round(n * 1000000);
    return Math.round(n);
  }

  function formatIndex(v) {
    const n = Number(v);
    if (!isFinite(n) || n <= 0) return '0';
    if (n < 0.01) return n.toFixed(4);
    if (n < 1) return n.toFixed(3);
    if (n < 10) return n.toFixed(2);
    return n.toFixed(1);
  }

  function competitionGrade(index) {
    const n = Number(index);
    if (!isFinite(n) || n < 0) {
      return { id: 'unknown', label: '판정 불가', tone: 'unknown', max: null, desc: '검색량과 상품수를 모두 넣어야 계산됩니다.' };
    }
    for (let i = 0; i < COMPETITION_GRADES.length; i++) {
      const g = COMPETITION_GRADES[i];
      if (n <= g.max) return { id: g.id, label: g.label, tone: g.tone, max: g.max === Infinity ? null : g.max, desc: g.desc };
    }
    const last = COMPETITION_GRADES[COMPETITION_GRADES.length - 1];
    return { id: last.id, label: last.label, tone: last.tone, max: null, desc: last.desc };
  }

  /**
   * 추천 점수 0~100.
   *   수요 = log10(검색량+1) / log10(200,001)  (월 20만이면 만점)
   *   경쟁 여유 = 경쟁강도 구간별 감쇠 (0.2 이하 만점, 1에서 0.4, 3 이상 0.05)
   *   점수 = 100 × (수요×0.5 + 경쟁여유×0.5) × 구간 게이트
   *   구간 게이트: 경쟁강도 1 이하 1.0 · 3 이하 0.85 · 그 이상 0.55 (레드오션은 1순위가 되지 않는다)
   */
  function competitionScore(searches, products, index) {
    const s = Math.max(0, Number(searches) || 0);
    if (!s) return 0;
    const demand = clamp(Math.log10(1 + s) / Math.log10(200001), 0, 1);
    const idx = index === undefined ? (s > 0 ? (Number(products) || 0) / s : 0) : Number(index);
    let comp;
    if (idx <= 0.35) comp = 1 - idx * 0.6;
    else if (idx <= 1) comp = 0.79 - (idx - 0.35) * 0.6;
    else if (idx <= 3) comp = 0.4 - (idx - 1) * 0.175;
    else comp = 0.05;
    comp = clamp(comp, 0, 1);
    const gate = idx <= 1 ? 1 : (idx <= 3 ? 0.85 : 0.55);
    return Math.round((demand * 0.5 + comp * 0.5) * 100 * gate);
  }

  function competitionVerdict(score, searches, index) {
    const s = Number(score) || 0;
    if (!searches) return { label: '검색량 없음 — 제외', tone: 'red', short: '제외' };
    if (searches < 300) return { label: '검색량 부족 — 보조 키워드', tone: 'normal', short: '보조' };
    if (s >= 70) return { label: '지금 상품명에 넣으세요', tone: 'blue', short: '1순위' };
    if (s >= 50) return { label: '틈새로 노려볼 만함', tone: 'honey', short: '2순위' };
    if (s >= 30) return { label: '보조 키워드로만', tone: 'normal', short: '보조' };
    return { label: '비율이 나빠 피하세요', tone: 'red', short: '피함' };
  }

  /** 한 줄 입력 → 계산 결과 (1초 계산기의 핵심) */
  function competitionRow(input) {
    const o = input || {};
    const keyword = cleanText(o.keyword, '');
    const pc = Math.max(0, parseCount(o.pc));
    const mobile = Math.max(0, parseCount(o.mobile));
    const hasTotal = o.searches !== undefined && o.searches !== null && String(o.searches).trim() !== '';
    const searches = hasTotal ? Math.max(0, parseCount(o.searches)) : pc + mobile;
    const products = Math.max(0, parseCount(o.products));
    const valid = !!keyword && searches > 0 && products > 0;
    const index = searches > 0 ? products / searches : 0;
    const grade = competitionGrade(valid ? index : NaN);
    const score = valid ? competitionScore(searches, products, index) : 0;
    const verdict = competitionVerdict(score, searches, index);
    const mobileShare = searches > 0 ? mobile / searches : 0;
    const notes = [];

    if (!keyword) notes.push('키워드가 비어 있습니다.');
    if (!products) notes.push('등록 상품수를 넣어야 경쟁강도를 계산합니다.');
    if (!searches) notes.push('월 검색량(PC+모바일)이 0입니다.');
    if (valid) {
      if (index > 5) notes.push('상품수가 검색량의 5배가 넘습니다 — 공급 과잉 구간.');
      if (products >= 50000) notes.push('등록 상품 ' + formatNumber(products) + '개 — 비율이 낮아도 상위 노출 경쟁이 셉니다.');
      if (searches < 300) notes.push('월 검색 300회 미만 — 노출 기회 자체가 적습니다.');
      if (searches >= 5000 && searches <= 50000) notes.push('검색 5천~5만 구간 — 신규몰이 노려볼 만한 중형 키워드입니다.');
      if (mobile > 0 && mobileShare >= 0.8) notes.push('모바일 비중 ' + Math.round(mobileShare * 100) + '% — 모바일 썸네일·첫 문장이 중요합니다.');
      if (pc > 0 && pc / searches >= 0.6) notes.push('PC 비중이 높습니다 — 상세 스펙·비교표를 갖춘 상세페이지가 유리합니다.');
      if (index < 0.05 && products < 500) notes.push('수요 대비 상품이 거의 없습니다 — 신규·계절 키워드인지 확인하세요.');
    }

    return {
      keyword: keyword,
      pc: pc,
      mobile: mobile,
      searches: searches,
      products: products,
      index: index,
      indexLabel: formatIndex(index),
      perThousand: searches > 0 ? round1(products / searches * 1000) : 0,
      mobileShare: mobileShare,
      grade: grade,
      score: score,
      verdict: verdict,
      notes: notes,
      valid: valid,
    };
  }

  function competitionSort(rows, key) {
    const arr = (rows || []).slice();
    const by = {
      recommend: function (a, b) { return b.score - a.score || a.index - b.index || b.searches - a.searches; },
      index: function (a, b) { return a.index - b.index || b.score - a.score; },
      searches: function (a, b) { return b.searches - a.searches; },
      products: function (a, b) { return a.products - b.products; },
      keyword: function (a, b) { return String(a.keyword).localeCompare(String(b.keyword), 'ko'); },
    }[key] || null;
    return by ? arr.sort(by) : arr;
  }

  function competitionSummary(rows) {
    const items = (rows || []).filter(function (r) { return r && r.valid; });
    const byGrade = { blue: 0, honey: 0, normal: 0, red: 0 };
    items.forEach(function (r) { if (byGrade[r.grade.id] !== undefined) byGrade[r.grade.id] += 1; });
    const best = competitionSort(items, 'recommend')[0] || null;
    const totalSearches = items.reduce(function (n, r) { return n + r.searches; }, 0);
    return { count: (rows || []).length, valid: items.length, byGrade: byGrade, best: best, totalSearches: totalSearches };
  }

  function looksLikeHeader(cells) {
    const joined = cells.join(' ').toLowerCase();
    if (/키워드|keyword/.test(joined) && /검색|상품|search|product|pc|모바일|mobile/.test(joined)) return true;
    return false;
  }

  /**
   * CSV·엑셀 표 붙여넣기 → 행 배열.
   * 형식: 키워드,PC검색,모바일검색,상품수 (4열) 또는 키워드,총검색,상품수 (3열)
   * 탭·쉼표·세미콜론·공백 구분, 천 단위 쉼표·'만/천' 단위 허용.
   */
  function parseCompetitionText(text, opts) {
    const o = opts || {};
    const format = o.format === '4' || o.format === '3' ? o.format : 'auto';
    const rows = [];
    const skipped = [];
    const seen = {};
    let assumed3 = 0;
    const lines = String(text == null ? '' : text).split(/\r?\n/);

    lines.forEach(function (raw, i) {
      const line = raw.replace(/^\uFEFF/, '').trim();
      if (!line || line.charAt(0) === '#') return;
      const delim = line.indexOf('\t') >= 0 ? '\t'
        : (line.indexOf(';') >= 0 ? ';'
          : (line.indexOf(',') >= 0 ? ',' : null));

      let cells;
      let nums = [];
      if (delim) {
        cells = line.split(delim).map(function (s) { return s.trim().replace(/^"|"$/g, ''); });
        if (looksLikeHeader(cells)) return;
        nums = cells.slice(1).map(parseCount);
      } else {
        const tokens = line.split(/\s+/);
        while (tokens.length > 1 && nums.length < 4) {
          const t = tokens[tokens.length - 1];
          if (/^[\d.,]+(만|천|k|K|m|M)?$/.test(t)) { nums.unshift(parseCount(t)); tokens.pop(); }
          else break;
        }
        cells = [tokens.join(' ')];
        if (!nums.length) {
          if (looksLikeHeader(cells)) return; /* 머리글 */
          skipped.push({ line: i + 1, text: line, reason: '숫자가 없습니다.' });
          return;
        }
      }

      const keyword = cleanText(cells[0], '')
        .replace(/^\d+[.)]\s*/, '')
        .replace(/^["']|["']$/g, '')
        .trim();
      const lineNo = i + 1;
      const works = nums.filter(function (n) { return isFinite(n); });

      if (!keyword) { skipped.push({ line: lineNo, text: line, reason: '키워드가 없습니다.' }); return; }
      if (seen[keyword.toLowerCase()]) { skipped.push({ line: lineNo, text: line, reason: '같은 키워드가 이미 있습니다.' }); return; }

      let pc = 0; let mobile = 0; let searches = 0; let products = 0;
      if (format === '3') {
        if (works.length < 2) { skipped.push({ line: lineNo, text: line, reason: '3열(키워드·총검색·상품수) 형식이 아닙니다.' }); return; }
        searches = works[0]; products = works[1];
        assumed3 += 0;
      } else if (format === '4' || (works.length >= 3)) {
        if (works.length < 3) { skipped.push({ line: lineNo, text: line, reason: '4열(키워드·PC·모바일·상품수) 형식이 아닙니다.' }); return; }
        pc = works[0]; mobile = works[1]; products = works[2]; searches = pc + mobile;
      } else if (works.length === 2) {
        searches = works[0]; products = works[1];
        assumed3 += 1;
      } else {
        skipped.push({ line: lineNo, text: line, reason: '숫자 열이 모자랍니다 (키워드·PC·모바일·상품수).' });
        return;
      }
      if (!searches || !products) {
        skipped.push({ line: lineNo, text: line, reason: searches ? '상품수가 0입니다.' : '검색량이 0입니다.' });
        return;
      }
      seen[keyword.toLowerCase()] = 1;
      rows.push(competitionRow({ keyword: keyword, pc: pc, mobile: mobile, searches: searches, products: products }));
    });

    return {
      rows: rows,
      skipped: skipped,
      format: format,
      assumed3: assumed3,
      note: assumed3
        ? assumed3 + '줄은 숫자가 2개라 “총검색·상품수”(3열)로 읽었습니다. PC·모바일을 따로 넣었다면 형식을 4열로 바꾸세요.'
        : '',
    };
  }

  function competitionCSV(rows) {
    const head = ['키워드', 'PC검색', '모바일검색', '월검색합계', '상품수', '경쟁강도', '등급', '추천점수', '판정'];
    const esc = function (v) {
      const s = String(v == null ? '' : v);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const lines = [head.join(',')];
    (rows || []).forEach(function (r) {
      lines.push([
        r.keyword, r.pc, r.mobile, r.searches, r.products,
        r.indexLabel, r.grade.label, r.score, r.verdict.label,
      ].map(esc).join(','));
    });
    return lines.join('\n');
  }

  /* ── 내 구독 AI 원클릭 브리지 ───────────────────────────── */
  const BRIDGE_TARGETS = [
    { id: 'chatgpt', label: 'ChatGPT', host: 'chatgpt.com', url: 'https://chatgpt.com/?q=', home: 'https://chatgpt.com/' },
    { id: 'claude', label: 'Claude', host: 'claude.ai', url: 'https://claude.ai/new?q=', home: 'https://claude.ai/new' },
    { id: 'gemini', label: 'Gemini', host: 'gemini.google.com', url: 'https://gemini.google.com/app', home: 'https://gemini.google.com/app' },
  ];

  const BRIDGE_TASKS = [
    {
      id: 'copy', label: '상세페이지 카피 다듬기', apply: 'copy',
      title: '상세페이지 7단 카피 다시 쓰기',
      instruction:
        '위 상품의 상세페이지 카피를 다시 써 주세요. 공감 → 문제 → 해결 → 스펙 → 비교 → 리뷰 예상 → 구매 유도 7개 단락으로, ' +
        '각 단락은 2~4문장입니다. 첫 문장은 고객이 겪는 장면으로 시작하고, 마지막 단락은 망설이는 이유 하나를 없애며 끝내세요. ' +
        '진단에서 약하다고 나온 트리거 중 최소 2개를 실제 문장으로 보강하세요.',
      format: '출력은 “1. 공감”처럼 번호와 단락 이름을 붙인 일반 텍스트로, 단락 사이만 빈 줄로 띄우세요.',
      hint: '붙여넣으면 카피 탭의 “AI 다듬은 카피”에 들어가고 전체 복사·TXT에 함께 담깁니다.',
    },
    {
      id: 'faq', label: '고객 FAQ 5개', apply: 'faq',
      title: '고객이 물을 FAQ 5개',
      instruction:
        '고객이 실제로 물을 FAQ 5개를 만들어 주세요. 구매 전 확인(배송·규격·교환) 2개, 사용 중 우려 2개, 가격·구성 1개로 구성하세요. ' +
        '답변은 각 2~3문장이고, 단정할 수 없는 내용은 “판매자에게 확인”으로 안내하세요.',
      format: '출력은 아래 형식만 쓰세요.\nQ. 질문\nA. 답변\nQ. 질문\nA. 답변',
      hint: 'Q./A. 형식이면 그대로 읽어 FAQ 목록에 AI 표시로 추가합니다.',
    },
    {
      id: 'name', label: '상품명 대안 5개', apply: 'name',
      title: '플랫폼 규칙에 맞는 상품명 5개',
      instruction:
        '스마트스토어·쿠팡에 바로 넣을 수 있는 상품명 대안 5개를 만들어 주세요. 각 25~45자, “브랜드 + 상품 유형 + 대표 스펙” 순서입니다. ' +
        '같은 단어 반복, ★·이모지, 배송·할인 문구, 최상급 표현은 쓰지 마세요.',
      format: '출력은 한 줄에 상품명 하나씩, 번호·설명·따옴표 없이 5줄만 쓰세요.',
      hint: '붙여넣으면 이 앱의 채점기로 각 안을 다시 100점 채점해 보여줍니다.',
    },
    {
      id: 'design', label: '디자인 방향·팔레트', apply: 'design',
      title: '상세페이지 디자인 방향 3안',
      instruction:
        '이 상품 상세페이지의 디자인 방향 3안을 제안해 주세요. 각 안마다 (1) 한 줄 컨셉과 이 상품에 맞는 이유, (2) 팔레트 HEX 5개(배경·카드·본문·보조·포인트), ' +
        '(3) 제목/본문 폰트 조합과 굵기·자간, (4) 실사 이미지 비율·크롭·텍스트 배치 규칙, (5) 이 디자인에서 피해야 할 것 1개를 적으세요. ' +
        '흔한 AI 기본 디자인(보라·파랑 그라데이션, 둥근 카드 + 소프트 섀도)은 제안하지 마세요.',
      format: '출력은 “1안 · 컨셉명”부터 시작하는 일반 텍스트 3묶음으로 쓰세요.',
      hint: '붙여넣으면 디자인 탭의 AI 메모로 저장됩니다. 팔레트는 레퍼런스 이미지 추출로 바로 확인할 수 있습니다.',
    },
  ];

  function bridgeTask(id) {
    return BRIDGE_TASKS.find(function (t) { return t.id === id; }) || BRIDGE_TASKS[0];
  }

  function bridgeTarget(id) {
    return BRIDGE_TARGETS.find(function (t) { return t.id === id; }) || BRIDGE_TARGETS[0];
  }

  /** 프롬프트에 넣을 상품·진단 맥락 */
  function bridgeBrief(input) {
    const o = input || {};
    const lines = [];
    const benefits = (o.benefits || []).map(function (b) { return cleanText(b, ''); }).filter(Boolean);
    lines.push('[상품 정보]');
    lines.push('- 상품명: ' + cleanText(o.name, '(아직 없음)'));
    if (o.keyword) lines.push('- 목표 키워드: ' + cleanText(o.keyword, ''));
    if (o.target) lines.push('- 타겟 고객: ' + cleanText(o.target, ''));
    if (benefits.length) lines.push('- 핵심 장점: ' + benefits.join(' / '));
    if (o.weakness) lines.push('- 단점·보완점: ' + cleanText(o.weakness, ''));
    const price = toNumber(o.price);
    if (price > 0) lines.push('- 판매가: ' + formatWon(price));
    lines.push('- 판매 플랫폼: ' + (getPlatform(o.platform).label));

    if (o.psych && typeof o.psych.total === 'number') {
      lines.push('');
      lines.push('[지금 카피의 심리 진단]');
      lines.push('- 8트리거 총점: ' + o.psych.total + '/100 (' + (o.psych.grade ? o.psych.grade.id + ' ' + o.psych.grade.title : '—') + ')');
      const weak = (o.psych.triggers || []).filter(function (t) { return t.level === 'weak'; }).slice(0, 3);
      if (weak.length) lines.push('- 약한 트리거: ' + weak.map(function (t) { return t.name + '(' + t.score + ')'; }).join(', '));
      const gaps = (o.psych.recommendations || []).slice(0, 2);
      if (gaps.length) lines.push('- 보강 제안: ' + gaps.map(function (g) { return g.name + ' — ' + g.action; }).join(' / '));
    }
    if (o.friction && o.friction.count) {
      lines.push('- 감점 표현: ' + (o.friction.issues || []).slice(0, 5).map(function (it) {
        return '“' + it.phrase + '”(' + it.typeLabel + ') → ' + it.alternative;
      }).join(' / '));
    }
    if (o.designName) lines.push('- 선택한 디자인: ' + o.designName);
    if (o.kitText) {
      lines.push('');
      lines.push('[지금 만들어진 7단 카피]');
      lines.push(String(o.kitText).slice(0, 1600));
    }
    return lines.join('\n');
  }

  function bridgePrompt(task, input) {
    const t = bridgeTask(task);
    const lines = [];
    lines.push('아래는 스마트스토어·쿠팡 셀러의 상품 상세페이지 작업 자료입니다. 카피라이터 겸 이커머스 디자이너로서 도와주세요.');
    lines.push('');
    lines.push(bridgeBrief(input));
    lines.push('');
    lines.push('[요청]');
    lines.push(t.instruction);
    lines.push(t.format);
    lines.push('');
    lines.push('[출력 규칙]');
    lines.push('- 한국어로만, 인사말·설명·요약 없이 결과만 출력하세요.');
    lines.push('- 자료에 없는 수치·인증·후기를 만들지 마세요. 확인이 필요하면 [확인 필요]라고 적으세요.');
    lines.push('- 최상급(최고·1위·완벽)·효능·보장 표현은 쓰지 마세요.');
    lines.push('- 마크다운 표·코드블록은 쓰지 마세요.');
    return { task: t.id, title: t.title, prompt: lines.join('\n'), hint: t.hint, chars: lines.join('\n').length };
  }

  /** '{prompt}' → 각 AI 사이트 URL. 프롬프트를 미리 채우는 곳은 쿼리로 넘긴다. */
  function bridgeUrl(targetId, prompt) {
    const t = bridgeTarget(targetId);
    const text = String(prompt == null ? '' : prompt);
    if (t.id === 'gemini') return t.home;
    return t.url + encodeURIComponent(text);
  }

  function geminiEndpoint(model) {
    const m = String(model || 'gemini-2.5-flash').replace(/[^a-zA-Z0-9.\-]/g, '') || 'gemini-2.5-flash';
    return 'https://generativelanguage.googleapis.com/v1beta/models/' + m + ':generateContent';
  }

  function stripFences(text) {
    return String(text == null ? '' : text)
      .replace(/```[a-zA-Z]*\n?/g, '')
      .replace(/```/g, '')
      .replace(/\r\n/g, '\n')
      .trim();
  }

  function parseFAQResult(text) {
    const src = stripFences(text);
    const pairs = [];
    let cur = null;
    src.split('\n').forEach(function (line) {
      const raw = line.trim();
      const q = raw.match(/^(?:Q|질문)\s*\d*\s*[.)\]:：\-]\s*(.+)$/i);
      const a = raw.match(/^(?:A|답변)\s*\d*\s*[.)\]:：\-]\s*(.*)$/i);
      if (q) {
        if (cur && cur.q && cur.a) pairs.push(cur);
        cur = { q: q[1].replace(/\*\*/g, '').trim(), a: '' };
        return;
      }
      if (a && cur) {
        cur.a = a[1].replace(/\*\*/g, '').trim();
        return;
      }
      if (cur && cur.a && raw) cur.a += ' ' + raw.replace(/\*\*/g, '').trim();
    });
    if (cur && cur.q && cur.a) pairs.push(cur);
    return pairs
      .filter(function (p) { return p.q && p.a; })
      .slice(0, 5)
      .map(function (p, i) { return { no: i + 1, q: p.q.slice(0, 160), a: p.a.slice(0, 700) }; });
  }

  function parseNameResult(text) {
    const src = stripFences(text);
    const out = [];
    src.split('\n').forEach(function (line) {
      let s = line.trim();
      if (!s) return;
      s = s.replace(/^[-*•·>]\s*/, '')
        .replace(/^\d+\s*[.)]\s*/, '')
        .replace(/\*\*/g, '')
        .replace(/^["'“”‘’]/, '')
        .replace(/["'“”‘’]$/, '')
        .trim();
      if (/^(상품명|대안|이유|설명|주의|출력)/.test(s)) return;
      if (codePoints(s) < 8 || codePoints(s) > 100) return;
      if (out.indexOf(s) >= 0) return;
      out.push(s);
    });
    return out.slice(0, 5);
  }

  /** 붙여넣은 결과를 작업 종류에 맞게 해석한다. */
  function parseBridgeResult(task, text) {
    const t = bridgeTask(task);
    const src = stripFences(text);
    if (t.apply === 'faq') {
      const faqs = parseFAQResult(src);
      return { type: 'faq', ok: faqs.length > 0, count: faqs.length, faqs: faqs, text: src };
    }
    if (t.apply === 'name') {
      const names = parseNameResult(src);
      return { type: 'name', ok: names.length > 0, count: names.length, names: names, text: src };
    }
    return { type: 'text', ok: src.length > 0, count: 0, text: src };
  }

  /* ── 저장함 · 내보내기 ─────────────────────────────────── */
  const STATUSES = [
    { id: 'plan', label: '기획', tone: 'neutral' },
    { id: 'ready', label: '등록 대기', tone: 'info' },
    { id: 'done', label: '등록 완료', tone: 'ok' },
  ];

  function statusMeta(id) { return STATUSES.find(function (s) { return s.id === id; }) || STATUSES[0]; }

  function toCSV(headers, rows) {
    const esc = function (v) {
      const s = String(v == null ? '' : v);
      return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const lines = [headers.map(esc).join(',')];
    rows.forEach(function (r) { lines.push(r.map(esc).join(',')); });
    return lines.join('\r\n');
  }

  function productsToCSV(items) {
    const headers = ['상품명', '플랫폼', '목표 키워드', '점수', '등급', '판매가', '순이익', '마진율(%)', '손익분기 ROAS(%)', '상태', '메모', '저장일'];
    const rows = (items || []).map(function (p) {
      return [
        p.name || '', getPlatform(p.platform).label, p.keyword || '',
        p.score == null ? '' : p.score, p.grade || '',
        p.price == null ? '' : p.price,
        p.netProfit == null ? '' : p.netProfit,
        p.marginRate == null ? '' : p.marginRate,
        p.bepRoas == null ? '' : p.bepRoas,
        statusMeta(p.status).label, p.memo || '', formatDateKR(p.savedAt),
      ];
    });
    return toCSV(headers, rows);
  }

  function productsToJSON(items) {
    return JSON.stringify({
      app: 'commerce-seo-studio', version: VERSION,
      exportedAt: new Date().toISOString(),
      items: (items || []).map(function (p) { return Object.assign({}, p); }),
    }, null, 2);
  }

  function parseProductsJSON(text) {
    let data;
    try { data = JSON.parse(String(text == null ? '' : text)); } catch (e) { return { items: [], error: 'JSON 형식이 아니에요.' }; }
    const items = Array.isArray(data) ? data : (data && Array.isArray(data.items) ? data.items : null);
    if (!items) return { items: [], error: 'items 배열을 찾지 못했어요.' };
    const clean = [];
    items.forEach(function (p) {
      if (!p || !p.name) return;
      const platform = PLATFORMS[p.platform] ? p.platform : 'smartstore';
      const margin = p.margin && typeof p.margin === 'object' ? p.margin : null;
      clean.push({
        id: uid('item'),
        name: String(p.name).slice(0, 200),
        platform: platform,
        keyword: String(p.keyword || '').slice(0, 120),
        score: p.score == null || p.score === '' ? null : clamp(Math.round(Number(p.score) || 0), 0, 100),
        grade: p.grade && 'SABC'.indexOf(String(p.grade)[0]) >= 0 ? String(p.grade)[0] : null,
        price: margin ? Math.max(0, Math.round(Number(margin.price) || 0)) : (p.price == null ? null : Math.max(0, Math.round(Number(p.price) || 0))),
        netProfit: margin ? Math.round(Number(margin.netProfit) || 0) : (p.netProfit == null ? null : Math.round(Number(p.netProfit) || 0)),
        marginRate: margin ? round1(Number(margin.marginRate) || 0) : (p.marginRate == null ? null : round1(Number(p.marginRate) || 0)),
        bepRoas: margin ? (margin.bepRoas == null ? null : round1(Number(margin.bepRoas))) : (p.bepRoas == null ? null : round1(Number(p.bepRoas))),
        job: p.job && typeof p.job === 'object' ? {
          target: String(p.job.target || '').slice(0, 200),
          benefits: (Array.isArray(p.job.benefits) ? p.job.benefits : []).slice(0, 3).map(function (b) { return String(b || '').slice(0, 200); }),
          weakness: String(p.job.weakness || '').slice(0, 200),
        } : null,
        margin: margin ? {
          price: Math.max(0, Math.round(Number(margin.price) || 0)),
          cost: Math.max(0, Math.round(Number(margin.cost) || 0)),
          shipping: Math.max(0, Math.round(Number(margin.shipping) || 0)),
          feeRate: clamp(Number(margin.feeRate) || 0, 0, 50),
          adCost: Math.max(0, Math.round(Number(margin.adCost) || 0)),
        } : null,
        design: p.design && typeof p.design === 'object' && p.design.refId ? {
          refId: String(p.design.refId).slice(0, 60),
          name: String(p.design.name || '').slice(0, 60),
        } : null,
        status: STATUSES.some(function (s) { return s.id === p.status; }) ? p.status : 'plan',
        memo: String(p.memo || '').slice(0, 500),
        savedAt: typeof p.savedAt === 'string' && p.savedAt ? p.savedAt : new Date().toISOString(),
      });
    });
    return { items: clean, error: clean.length ? null : '가져올 항목이 없어요.' };
  }

  /* ── 내보내기 ─────────────────────────────────────────── */
  return {
    VERSION: VERSION,
    PLATFORMS: PLATFORMS,
    PLATFORM_RULES: PLATFORM_RULES,
    CLAIM_GROUPS: CLAIM_GROUPS,
    CLAIM_WORDS: CLAIM_WORDS,
    SAFE_SWAP: SAFE_SWAP,
    SECTION_META: SECTION_META,
    STATUSES: STATUSES,
    GRADE_LABELS: GRADE_LABELS,
    clamp: clamp,
    codePoints: codePoints,
    hasBatchim: hasBatchim,
    josa: josa,
    escapeReg: escapeReg,
    escapeHtml: escapeHtml,
    uid: uid,
    round1: round1,
    toNumber: toNumber,
    formatNumber: formatNumber,
    formatWon: formatWon,
    formatPct: formatPct,
    formatRoas: formatRoas,
    trimZero: trimZero,
    todayISO: todayISO,
    formatDateKR: formatDateKR,
    getPlatform: getPlatform,
    platformRules: platformRules,
    splitKeywords: splitKeywords,
    tokenize: tokenize,
    scanSymbols: scanSymbols,
    findClaims: findClaims,
    stripClaims: stripClaims,
    duplicateTokens: duplicateTokens,
    isSpecToken: isSpecToken,
    keywordInfo: keywordInfo,
    gradeOf: gradeOf,
    analyzeName: analyzeName,
    suggestNames: suggestNames,
    buildCopyKit: buildCopyKit,
    buildKitText: buildKitText,
    calcMargin: calcMargin,
    ENGINES: ENGINES,
    engineStatus: engineStatus,
    diagnoseCopy: diagnoseCopy,
    detectCopy: detectCopy,
    correctCopy: correctCopy,
    FRAME_IDS: FRAME_IDS,
    frameworkInput: frameworkInput,
    generateFrameworks: generateFrameworks,
    designSourceText: designSourceText,
    paletteList: paletteList,
    recommendDesigns: recommendDesigns,
    designContent: designContent,
    designTitleFromName: designTitleFromName,
    applyDesign: applyDesign,
    designTitleCap: designTitleCap,
    fitText: fitText,
    paletteFromPixels: paletteFromPixels,
    themeFromPalette: themeFromPalette,
    designV2Ready: designV2Ready,
    designV2Info: designV2Info,
    referenceSearches: referenceSearches,
    visionPrompt: visionPrompt,
    applyBlueprint: applyBlueprint,
    applyFontMixToKit: applyFontMixToKit,
    tuneKit: tuneKit,
    presetKit: presetKit,
    blueprintKit: blueprintKit,
    renderKit: renderKit,
    v2Card: v2Card,
    kitToJSON: kitToJSON,
    kitFromJSON: kitFromJSON,
    checkDensity: checkDensity,
    DEFAULT_FONT_MIX: DEFAULT_FONT_MIX,
    DEFAULT_GRAIN: DEFAULT_GRAIN,
    COMPETITION_GRADES: COMPETITION_GRADES,
    COMPETITION_SORTS: COMPETITION_SORTS,
    parseCount: parseCount,
    formatIndex: formatIndex,
    competitionGrade: competitionGrade,
    competitionScore: competitionScore,
    competitionVerdict: competitionVerdict,
    competitionRow: competitionRow,
    competitionSort: competitionSort,
    competitionSummary: competitionSummary,
    parseCompetitionText: parseCompetitionText,
    competitionCSV: competitionCSV,
    BRIDGE_TARGETS: BRIDGE_TARGETS,
    BRIDGE_TASKS: BRIDGE_TASKS,
    bridgeTask: bridgeTask,
    bridgeTarget: bridgeTarget,
    bridgeBrief: bridgeBrief,
    bridgePrompt: bridgePrompt,
    bridgeUrl: bridgeUrl,
    geminiEndpoint: geminiEndpoint,
    stripFences: stripFences,
    parseFAQResult: parseFAQResult,
    parseNameResult: parseNameResult,
    parseBridgeResult: parseBridgeResult,
    priceSimulation: priceSimulation,
    statusMeta: statusMeta,
    toCSV: toCSV,
    productsToCSV: productsToCSV,
    productsToJSON: productsToJSON,
    parseProductsJSON: parseProductsJSON,
  };
});
