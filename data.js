/* ============================================================
   커머스 SEO 스튜디오 · data.js
   예시 상품, 수수료 빠른 선택, 안내 문구. (점수 규칙은 core.js)
   ============================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CommerceData = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SAMPLES = [
    {
      id: 'sample-before',
      label: '개선 전 예시',
      hint: '기호·반복·금지 표현이 섞인 상품명',
      platform: 'smartstore',
      name: '[우리마켓] ★최고★ 무선 청소기 무선청소기 가성비 무료배송 1위 청소기 무조건 최저가 강력추천 인기상품',
      keyword: '무선 청소기',
      target: '원룸에 사는 1~2인 가구',
      benefits: ['가벼운 무게로 한 손 청소', '헤파필터로 미세먼지 걸러냄', '충전 후 40분 사용'],
      weakness: '소음이 조금 큰 편',
      margin: { price: 59000, cost: 24000, shipping: 3000, feeRate: 10, adCost: 9000 },
    },
    {
      id: 'sample-after',
      label: '개선 후 예시',
      hint: '브랜드 + 유형 + 스펙 순서로 정리한 상품명',
      platform: 'coupang',
      name: '모아 무선 핸디 청소기 M2 15000Pa 헤파필터 40분 사용',
      keyword: '무선 핸디 청소기',
      target: '원룸에 사는 1~2인 가구',
      benefits: ['가벼운 무게로 한 손 청소', '헤파필터로 미세먼지 걸러냄', '충전 후 40분 사용'],
      weakness: '소음이 조금 큰 편',
      margin: { price: 59000, cost: 24000, shipping: 3000, feeRate: 10, adCost: 9000 },
    },
    {
      id: 'sample-sealer',
      label: '실링기 예시',
      hint: '다른 카테고리로 화면을 확인할 때',
      platform: 'smartstore',
      name: '한결 진공 실링기 H200 2개입 식품 포장',
      keyword: '진공 실링기',
      target: '반찬을 소분해 두는 자취생',
      benefits: ['누르는 방식이라 설명서 없이 사용', '밀봉 폭 30cm로 큰 지퍼백도 가능', '분리 세척되는 물받이'],
      weakness: '1회 충전으로 20회 정도',
      margin: { price: 32900, cost: 12800, shipping: 2500, feeRate: 5, adCost: 6000 },
    },
  ];

  const FEE_PRESETS = [3, 5, 10, 12];

  /* 경쟁강도 계산기 예시 — 무선 청소기 인접 키워드.
     PC·모바일 검색수와 네이버 쇼핑 등록 상품수 자리. 실제 수치는 직접 조회해 넣는다. */
  const COMPETITION_SAMPLES = [
    { keyword: '무선 청소기', pc: 24000, mobile: 71000, products: 412000 },
    { keyword: '차량용 청소기', pc: 5400, mobile: 16800, products: 52000 },
    { keyword: '핸디 청소기', pc: 8200, mobile: 24500, products: 68000 },
    { keyword: '침구 청소기', pc: 4200, mobile: 15800, products: 31000 },
    { keyword: '원룸 청소기', pc: 3100, mobile: 12400, products: 9800 },
    { keyword: '캠핑 청소기', pc: 1800, mobile: 6200, products: 540 },
  ];

  const NOTES = {
    score:
      '네이버·쿠팡이 공개한 채점표는 없습니다. 이 점수는 등록 규칙(길이·중복·특수문자·금지 표현)과 검색 노출 관행을 기준으로 만든 참고 지표예요. 최종 판단은 판매자센터의 상품명 품질 체크에서 한 번 더 하세요.',
    copy:
      '카피는 입력한 내용을 조합해 만듭니다. 괄호 안 안내는 실제 값으로 바꿔 주세요. 효능·최상급 표현은 넣지 않았습니다.',
    margin:
      '수수료율은 판매자센터에 표시된 내 카테고리 실제 요율을 넣으세요. 손익분기 ROAS는 광고비를 빼고 남는 금액(공헌이익) 기준입니다.',
    saved:
      '저장한 작업은 이 브라우저(localStorage)에만 남습니다. 서버로 보내지 않습니다.',
    compet:
      '경쟁강도 = 네이버 쇼핑 등록 상품수 ÷ 월 검색량(PC+모바일). 셀러 분석 도구들이 쓰는 정의와 같습니다. 등급(블루오션·꿀·보통·레드오션) 경계와 추천 점수는 이 앱의 참고 기준이며, 상품수·검색수는 조회한 시점의 값이라 매일 달라집니다. 비율이 낮아도 등록 상품이 수만 개면 상위 노출은 어렵습니다.',
    designV2:
      '레퍼런스 검색 링크는 누를 때만 핀터레스트·비핸스를 새 창으로 엽니다. 블루프린트 JSON은 내가 붙여넣은 내용만 브라우저에서 해석하며, 브랜드 키트는 이 브라우저(localStorage)에만 저장됩니다.',
  };

  return { SAMPLES: SAMPLES, FEE_PRESETS: FEE_PRESETS, COMPETITION_SAMPLES: COMPETITION_SAMPLES, NOTES: NOTES };
});
