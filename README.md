# 쿠팡 상세페이지 제작 에이전트 v3.2

쿠팡 생활용품/인테리어용품 전용 상세페이지 기획 + 이미지 제작 웹앱입니다.
통합 시스템 프롬프트 v3.2를 기본 로직(System Instruction)으로 사용하여
P1부터 P10까지 순서대로 상세페이지를 제작합니다.

## 🎯 핵심 규칙

- **브랜드 컬러 3가지 고정**
  - 메인: `#C8B6A6` (웜 베이지)
  - 서브: `#F7F3EE` (소프트 아이보리)
  - 텍스트: `#2F2A26` (딥 브라운 차콜)
- **폰트: 나눔스퀘어 계열만 사용** (최소 22pt)
- **순차 제작**: P1 → P2 → ... → P10 (한 번에 한 페이지)
- **원본 이미지 보호**: 색상·비율·형태 변경 금지, 필터 금지
- **카피 안전 규칙**: 과장 표현, 경쟁사 브랜드명, 외부 URL 금지

## 📄 페이지 구성

| 페이지 | 내용 | 크기 |
|---|---|---|
| P1 | 메인 히어로 + 강점 카드 3개 | 780×1100~1150 |
| P2 | 베네핏 심화 설명 (세로 3섹션) | 780×1500~1800 |
| P3 | 이런 분들께 추천드려요 (체크리스트형) | 780×1200~1500 |
| P4 | 리뷰 4개 (왼쪽 텍스트 / 오른쪽 사진) | 780×1600 |
| P5 | 2지선다 비교표 (글/사진 2버전) | 780×800~1000 |
| P6 | 소재 & 사이즈 실증 | 780×1000~1200 |
| P7 | 감성 라이프스타일 (세로 3모듈) | 780×1800~2000 |
| P8 | 다양한 활용법 4개 | 780×1000~1200 |
| P9 | 사용법 STEP 1~3 + 활용 TIP | 780×1700~1900 |
| P10 | 구성품 안내 + FAQ 5개 | 780×1400~1500 |

## 🛠 기술 스택

- React 19 + Vite 8
- Tailwind CSS 3 + NanumSquare
- OpenAI API (Chat Completions, JSON mode)
- html2canvas (PNG 내보내기)

## 📦 로컬 실행

```bash
npm install
npm run dev
```

`http://localhost:3000`

## 🏗 빌드 / 배포

```bash
npm run build
```

Cloudflare Pages:
- Build command: `npm run build`
- Output directory: `dist`

## 📁 구조

```
src/
├── App.jsx                          # P1~P10 순차 제작 UI
├── lib/
│   ├── systemPrompt.js              # 통합 시스템 프롬프트 v3.2
│   ├── openai.js                    # 페이지별 JSON 생성 + 검증
│   ├── theme.js                     # 브랜드 고정 컬러
│   └── exporters.js                 # PNG/HTML 내보내기
└── components/
    ├── PageRenderer.jsx             # 페이지 번호별 렌더러 디스패처
    └── pages/
        ├── Shared.jsx               # 공통 컴포넌트 (프레임, 체크, 배지 등)
        ├── P1Hero.jsx ~ P10Faq.jsx  # 각 페이지 렌더러
```

## 🔑 OpenAI API 키

좌측 사이드바 상단에 입력. `localStorage`에만 저장되며 외부 전송 없음.
