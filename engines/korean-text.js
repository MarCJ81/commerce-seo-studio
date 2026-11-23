/* ============================================================
   korean-text.js · 한국어 어절·조사 정밀 분석 엔진  v1.0.0
   ------------------------------------------------------------
   의존성 없는 순수 JS(UMD). 브라우저에서는 window.KoreanText,
   node 에서는 require('./korean-text.js').

   왜 필요한가
   - 기존 앱은 키워드를 정규식 부분 일치로만 셌다. 그래서
     "가습기"가 "가습기살균제" 안에서도 1회로 잡히고,
     "무드등" 같은 다른 단어 안의 조각도 잡혔다.
   - 또 "가습기"와 "가습기가/가습기를/가습기에서"를 서로 다른
     말로 보거나, 반대로 조사가 붙은 것을 놓쳤다.

   이 엔진이 하는 일
   1) 어절 경계 판정 — 앞뒤 글자가 한글이면 '복합어 포함'으로 따로 센다.
   2) 조사 정규화 — 어절 끝의 조사(이/가/을/를/은/는/의/에/에서…)를
      떼어 낸 뒤 키워드와 같은지 본다. "가습기를" = "가습기" 1회.
   3) 띄어쓰기 변형 — "가 습기", "가습 기"처럼 벌어진 표기도 1회로 본다.
   4) 부정문 판정 — "치료 효과가 없습니다"처럼 부정 표현이 붙은
      구간을 표시해 위반 오탐을 줄인다.
   5) 초성 검색 — "ㄱㅅㄱ" → "가습기" (es-hangul 이 있으면 그걸 사용,
      없으면 내장 분해로 동작).

   라이선스: 이 파일은 자체 구현(MIT). es-hangul(MIT)은 선택 의존.
   ============================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(root);
  else root.KoreanText = factory(root);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var VERSION = '1.0.0';

  /* ── 한글 분해 ──────────────────────────────────────────── */
  var CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
  var JUNG = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ';
  var JONG = ['', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ', 'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
  var SBASE = 0xAC00, SLAST = 0xD7A3, SCOUNT = 11172;

  function isHangulSyllable(code) { return code >= SBASE && code <= SLAST; }
  function isHangulJamo(code) {
    return (code >= 0x3131 && code <= 0x318E) || (code >= 0x1100 && code <= 0x11FF);
  }
  function isHangulChar(ch) {
    if (!ch) return false;
    var c = ch.charCodeAt(0);
    return isHangulSyllable(c) || isHangulJamo(c);
  }
  function isWordChar(ch) {
    if (!ch) return false;
    if (isHangulChar(ch)) return true;
    return /[0-9A-Za-z]/.test(ch);
  }

  /** 한 글자를 초성/중성/종성으로 분해한다. 한글이 아니면 null. */
  function decompose(ch) {
    if (!ch) return null;
    var code = ch.charCodeAt(0);
    if (!isHangulSyllable(code)) return null;
    var idx = code - SBASE;
    return {
      cho: CHO.charAt(Math.floor(idx / 588)),
      jung: JUNG.charAt(Math.floor((idx % 588) / 28)),
      jong: JONG[idx % 28]
    };
  }

  /** 문자열의 초성만 ("가습기" → "ㄱㅅㄱ"). 한글 아닌 글자는 그대로 둔다. */
  function choseong(str) {
    var s = String(str || '');
    var out = '';
    for (var i = 0; i < s.length; i++) {
      var d = decompose(s.charAt(i));
      out += d ? d.cho : s.charAt(i);
    }
    return out;
  }

  /** es-hangul 이 있으면 그쪽 초성 추출을 쓴다(자모·겹받침 처리 차이 방지). */
  function choseongOf(str) {
    var E = root && root.EsHangul;
    if (E && typeof E.getChoseong === 'function') {
      try { return E.getChoseong(String(str || '')); } catch (e) { /* fallthrough */ }
    }
    return choseong(str);
  }

  /* ── 조사 사전 ─────────────────────────────────────────── */
  /* 긴 것부터 검사해야 "에서"가 "에"로 잘리지 않는다. */
  var JOSA = [
    '이었습니다', '였습니다', '이었어요', '였어요', '이었고', '였고',
    '에서는', '에게서', '으로서', '으로써', '이라고', '이라는', '이라도', '이라면', '이라서',
    '이지만', '이므로', '이랑은', '에서도', '에서만', '에게는', '에게도', '한테는',
    '입니다', '이에요', '이었다', '이었다면', '이란', '이며', '이고', '이다',
    '으로', '로서', '로써', '로는', '로도', '로만', '로부터', '로써는',
    '에서', '에게', '한테', '께서', '보다', '처럼', '같이', '부터', '까지', '밖에',
    '이나', '이라', '이든', '이면', '이야', '이요', '이랑', '이랑은',
    '에는', '에도', '에만', '에선', '에의',
    '은', '는', '이', '가', '을', '를', '의', '에', '와', '과', '도', '만', '랑', '야', '요',
    '들', '들이', '들을', '들은', '들의', '들에', '들로', '들만', '들도', '들에서',
    '라고', '라는', '라도', '라면', '라서', '란', '나', '며', '고', '면', '서'
  ].sort(function (a, b) { return b.length - a.length; });

  var JOSA_SET = {};
  JOSA.forEach(function (j) { JOSA_SET[j] = true; });

  /** 어절 끝의 조사를 떼어 낸다. 조사가 없으면 그대로. */
  function stripJosa(word) {
    var w = String(word || '');
    if (!w) return '';
    for (var i = 0; i < JOSA.length; i++) {
      var j = JOSA[i];
      if (w.length > j.length && w.slice(-j.length) === j) {
        var base = w.slice(0, -j.length);
        /* 조사를 떼고 남은 것이 한 글자 이상 한글로 끝나야 인정한다.
           ("아이"에서 "이"를 떼면 "아"가 되어 엉뚱한 판정이 되므로,
            남은 길이가 2 이상이거나 원래 단어가 조사보다 충분히 길 때만.) */
        if (base.length >= 2 || isHangulChar(base.slice(-1))) return base;
      }
    }
    return w;
  }

  /* ── 정규화 ────────────────────────────────────────────── */
  function normalize(text) {
    var s = String(text === null || text === undefined ? '' : text);
    if (s.normalize) { try { s = s.normalize('NFC'); } catch (e) { /* noop */ } }
    return s.replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/[ \t\u00A0]+/g, ' ');
  }

  function escapeReg(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  /** 키워드를 띄어쓰기 무관 정규식으로. "가 습기"도 "가습기"와 같게 본다. */
  function keywordRegex(keyword) {
    var kw = String(keyword || '').trim();
    if (!kw) return null;
    var parts = kw.split(/\s+/).filter(Boolean).map(escapeReg);
    if (!parts.length) return null;
    return new RegExp(parts.join('\\s*'), 'gi');
  }

  /**
   * 띄어쓰기 실수("가 습기")까지 같은 말로 보기 위해, 어절 사이 공백만 지운
   * 압축 문자열과 원문 위치 지도를 만든다. 문장부호·줄바꿈은 그대로 둔다.
   */
  function compact(s) {
    var text = '';
    var map = [];
    for (var i = 0; i < s.length; i++) {
      var ch = s.charAt(i);
      if (/\s/.test(ch)) {
        var p = i - 1;
        var n = i + 1;
        while (p >= 0 && /\s/.test(s.charAt(p))) p--;
        while (n < s.length && /\s/.test(s.charAt(n))) n++;
        if (p >= 0 && n < s.length && isWordChar(s.charAt(p)) && isWordChar(s.charAt(n))) continue;
      }
      text += ch;
      map.push(i);
    }
    return { text: text, map: map };
  }

  /* ── 어절 토큰 ─────────────────────────────────────────── */
  /** 공백·문장부호 기준 어절 목록. index 는 원문 위치. */
  function tokens(text) {
    var s = String(text || '');
    var out = [];
    var re = /[0-9A-Za-z\uAC00-\uD7A3\u3131-\u318E]+/g;
    var m;
    while ((m = re.exec(s)) !== null) {
      out.push({ text: m[0], index: m.index, end: m.index + m[0].length });
    }
    return out;
  }

  /** 어절 목록을 조사 제거한 기본형으로. */
  function stems(text) {
    return tokens(text).map(function (t) {
      return { text: t.text, stem: stripJosa(t.text), index: t.index, end: t.end };
    });
  }

  /* ── 부정문 판정 ───────────────────────────────────────── */
  var NEG_PATTERNS = [
    '없습니다', '없어요', '없다', '없음', '없이', '없는',
    '않습니다', '않아요', '않는다', '않음', '않고', '않는', '않은',
    '아닙니다', '아니에요', '아니라', '아니다', '아님', '아니',
    '불가능', '불필요', '불가', '무관', '무관함', '제외', '미해당',
    '금지', '지양', '피해야', '피하', '삼가', '자제'
  ];
  var NEG_JOIN = ['없', '않', '아니', '아님', '불', '무', '미', '비'];

  /* 절 경계: 문장부호와 쉼표·가운데점·콜론. "최고 품질, 부작용 없음"에서
     "없음"이 "최고"의 부정어로 잘못 잡히지 않게 한다. */
  var CLAUSE_BREAK = /[.!?\n,、·;:。]/;
  function clauseTail(str) {
    var m = String(str).match(/[^.!?\n,、·;:。]*$/);
    return m ? m[0] : '';
  }
  function clauseHead(str) {
    var m = String(str).match(/^[^.!?\n,、·;:。]*/);
    return m ? m[0] : '';
  }

  /**
   * index~index+len 구간이 부정문 안에 있는지 본다.
   * 앞 12자·뒤 12자 창에서, 같은 절 안의 부정 표현만 본다.
   */
  function isNegated(text, index, len) {
    var s = String(text || '');
    var from = Math.max(0, index - 12);
    var to = Math.min(s.length, index + len + 12);
    var before = clauseTail(s.slice(from, index));
    var after = clauseHead(s.slice(index + len, to));
    var scope = before + ' ' + after;
    for (var i = 0; i < NEG_PATTERNS.length; i++) {
      if (scope.indexOf(NEG_PATTERNS[i]) !== -1) return true;
    }
    return false;
  }

  /** 구간 앞에 붙은 부정 접두("무료"의 "무" 같은 오탐을 막기 위해 어절 단위로 본다). */
  function negationKind(text, index, len) {
    var s = String(text || '');
    var before = clauseTail(s.slice(Math.max(0, index - 14), index));
    var after = clauseHead(s.slice(index + len, Math.min(s.length, index + len + 14)));
    var afterWords = after.split(/[^0-9A-Za-z\uAC00-\uD7A3]+/).filter(Boolean);
    var beforeWords = before.split(/[^0-9A-Za-z\uAC00-\uD7A3]+/).filter(Boolean);
    var head = beforeWords.slice(-2).join(' ');
    for (var i = 0; i < NEG_JOIN.length; i++) {
      var j = NEG_JOIN[i];
      var reTail = new RegExp('^' + j);
      for (var w = 0; w < Math.min(afterWords.length, 2); w++) {
        if (reTail.test(afterWords[w])) return 'after:' + afterWords[w];
      }
      if (new RegExp(j + '$').test(head)) return 'before:' + head;
    }
    if (isNegated(s, index, len)) return 'window';
    return '';
  }

  /* ── 키워드 매칭 ───────────────────────────────────────── */
  /**
   * @returns {{
   *   count:number, exact:number, embedded:number, withJosa:number,
   *   spaces:number, positions:Array, negated:number, total:number
   * }}
   * exact   = 어절 경계가 맞는 등장(조사가 붙은 것 포함)
   * embedded= 더 긴 단어 안에 들어 있는 등장("가습기살균제"의 "가습기")
   */
  function match(text, keyword) {
    var s = normalize(text);
    var kwFlat = String(keyword || '').replace(/\s+/g, '').trim();
    var res = { count: 0, exact: 0, embedded: 0, withJosa: 0, spaces: 0, negated: 0, total: 0, positions: [], embeddedWords: [] };
    if (!kwFlat || !s) return res;

    var packed = compact(s);
    var re = /\s/.test(kwFlat)
      ? keywordRegex(keyword)
      : new RegExp(escapeReg(kwFlat), 'gi');
    var scanText = /\s/.test(kwFlat) ? s : packed.text;
    var m;
    while ((m = re.exec(scanText)) !== null) {
      if (m[0].length === 0) { re.lastIndex++; continue; }
      res.total++;
      var start, end;
      if (scanText === packed.text) {
        var ci = m.index;
        var ce = ci + m[0].length - 1;
        start = packed.map[ci];
        end = packed.map[ce] + 1;
      } else {
        start = m.index;
        end = start + m[0].length;
      }
      var prev = start > 0 ? s.charAt(start - 1) : '';
      var next = end < s.length ? s.charAt(end) : '';
      var prevWord = isWordChar(prev);
      var nextWord = isWordChar(next);
      var josaHit = false;
      if (nextWord) {
        /* 뒤쪽 어절을 잘라 조사를 떼고 남는지 본다. */
        var tail = s.slice(end, end + 6);
        var tailWord = (tail.match(/^[0-9A-Za-z\uAC00-\uD7A3]+/) || [''])[0];
        if (tailWord && JOSA_SET[tailWord]) josaHit = true;
        else {
          for (var i = 0; i < JOSA.length; i++) {
            if (tailWord.length > JOSA[i].length && tailWord.indexOf(JOSA[i]) === 0) { josaHit = true; break; }
          }
        }
      }
      /* 앞이 공백·문장부호·문단 시작이면 어절 시작, 뒤가 공백·끝이면 어절 끝. */
      var boundaryOk = !prevWord && (!nextWord || josaHit);
      res.positions.push({ index: start, length: end - start, exact: boundaryOk, josa: josaHit });
      if (boundaryOk) {
        res.exact++;
        if (josaHit) res.withJosa++;
        if (/\s/.test(s.slice(start, end))) res.spaces++;
        if (negationKind(s, start, end - start)) res.negated++;
      } else {
        res.embedded++;
        if (res.embeddedWords.length < 6) {
          var wStart = start;
          while (wStart > 0 && isWordChar(s.charAt(wStart - 1))) wStart--;
          var wEnd = end;
          while (wEnd < s.length && isWordChar(s.charAt(wEnd))) wEnd++;
          var word = s.slice(wStart, wEnd);
          if (res.embeddedWords.indexOf(word) === -1) res.embeddedWords.push(word);
        }
      }
    }
    res.count = res.exact;
    return res;
  }

  /** 기존 앱의 matcher.count(text) 자리에 그대로 꽂을 수 있는 형태. */
  function matcher(keyword) {
    return {
      keyword: String(keyword || ''),
      count: function (text) { return match(text, keyword).exact; },
      detail: function (text) { return match(text, keyword); }
    };
  }

  /* ── 문장·어절 분석(밀도용) ────────────────────────────── */
  /**
   * 글의 어절 수·조사 제거 어절 수·키워드 등장을 한 번에.
   * 밀도는 "글자 수"가 아니라 "어절 수" 기준으로 낸다(한국어에서 더 안정적).
   */
  function analyze(text, keyword) {
    var s = normalize(text);
    var words = tokens(s).map(function (t) { return t.text; });
    var punc = (s.match(/[.!?](\s|$)/g) || []).length;
    var hits = keyword ? match(s, keyword) : { exact: 0, embedded: 0, withJosa: 0, positions: [], embeddedWords: [] };
    var kwWords = String(keyword || '').trim().split(/\s+/).filter(Boolean).length || 0;
    var density = words.length ? Math.round((hits.exact * Math.max(1, kwWords) / words.length) * 1000) / 10 : 0;
    return {
      chars: Array.from ? Array.from(s).length : s.length,
      charsNoSpace: (s.replace(/\s+/g, '')).length,
      words: words.length,
      sentences: punc,
      exact: hits.exact,
      embedded: hits.embedded,
      withJosa: hits.withJosa,
      negated: hits.negated || 0,
      embeddedWords: hits.embeddedWords,
      densityByWord: density,
      positions: hits.positions
    };
  }

  /**
   * 어절 순서 매칭: "부작용 없음" 같은 두 어절 표현을
   * "부작용이 전혀 없습니다"(조사·사이말)에서도 찾는다.
   * gap 은 첫 어절과 마지막 어절 사이에 허용할 다른 어절 수.
   */
  /** "없음"과 "없습니다/없어요"를 같은 말로 본다(부정 어미 변형). */
  function sameStem(token, part) {
    if (token === part) return true;
    if (!token || !part) return false;
    if (/^[없않아]/.test(part) && token.charAt(0) === part.charAt(0)) return true;
    return false;
  }

  /* 어절 사이에 끼어도 같은 말로 보는 수식어(부정 강조·정도). */
  var FILLER = {};
  ['전혀', '절대', '결코', '거의', '별로', '하나도', '그다지', '딱히', '정말', '아주', '매우', '조금도', '전연', '미미하게'].forEach(function (w) { FILLER[w] = true; });

  function phraseMatch(text, phrase, opts) {
    var gap = (opts && opts.gap !== undefined) ? Number(opts.gap) : 1;
    var s = normalize(text);
    var toks = tokens(s);
    var parts = String(phrase || '').trim().split(/\s+/).filter(Boolean).map(stripJosa);
    var out = [];
    if (!parts.length || parts.length === 1) {
      return parts.length === 1 ? match(s, phrase).positions : out;
    }
    for (var i = 0; i < toks.length; i++) {
      var tokStem = stripJosa(toks[i].text);

      /* 한 어절로 붙여 쓴 형태: "부작용없음" */
      if (parts.length > 1 && tokStem.length > parts[0].length && tokStem.indexOf(parts[0]) === 0) {
        var rest = tokStem.slice(parts[0].length);
        var lastPart = parts[parts.length - 1];
        var restOk = /^[없않아]/.test(lastPart)
          ? rest.charAt(0) === lastPart.charAt(0)
          : rest === lastPart;
        if (restOk) {
          var stemLen = tokStem.length;
          var endAt = toks[i].end - (toks[i].text.length - stemLen);
          if (!out.some(function (o) { return toks[i].index < o.index + o.length && endAt > o.index; })) {
            out.push({ index: toks[i].index, length: endAt - toks[i].index, phrase: true });
          }
          continue;
        }
      }

      if (tokStem !== parts[0]) continue;
      var start = toks[i].index;
      var end = toks[i].end;
      var j = i + 1;
      var lastTok = toks[i];
      var k = 1;
      var budget = gap;
      var ok = true;
      while (k < parts.length) {
        if (j >= toks.length) { ok = false; break; }
        if (sameStem(stripJosa(toks[j].text), parts[k])) { lastTok = toks[j]; end = toks[j].end; k++; j++; continue; }
        if (budget > 0 && FILLER[toks[j].text]) { budget--; j++; continue; }
        ok = false; break;
      }
      if (!ok) continue;
      /* 끝에 붙은 조사는 구간에서 빼 준다. "체지방 감소에" -> "체지방 감소"
         (unlessAfter: '에 도움을 줄 수 있' 같은 규칙 판정이 맞도록) */
      var core = stripJosa(lastTok.text);
      end -= (lastTok.text.length - core.length);
      if (out.some(function (o) { return start < o.index + o.length && end > o.index; })) continue;
      out.push({ index: start, length: end - start, phrase: true });
    }
    return out;
  }

  /** 같은 어절(조사 제거 기준) 반복 상위 N개. */
  function repeats(text, limit) {
    var counts = {};
    var order = [];
    stems(text).forEach(function (t) {
      if (t.stem.length < 2) return;
      if (!counts[t.stem]) { counts[t.stem] = 0; order.push(t.stem); }
      counts[t.stem]++;
    });
    return order
      .map(function (w) { return { word: w, count: counts[w] }; })
      .filter(function (r) { return r.count >= 3; })
      .sort(function (a, b) { return b.count - a.count || (a.word < b.word ? -1 : 1); })
      .slice(0, limit || 8);
  }

  return {
    VERSION: VERSION,
    normalize: normalize,
    tokens: tokens,
    stems: stems,
    stripJosa: stripJosa,
    choseong: choseongOf,
    match: match,
    matcher: matcher,
    phraseMatch: phraseMatch,
    analyze: analyze,
    repeats: repeats,
    isNegated: isNegated,
    negationKind: negationKind,
    hasJosa: function (word) { return stripJosa(word) !== String(word || ''); },
    JOSA: JOSA.slice()
  };
});
