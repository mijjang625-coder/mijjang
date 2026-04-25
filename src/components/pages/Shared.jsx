import { BRAND } from '../../lib/theme.js';

const fallbackImg =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><rect fill="%23e8e5e1" width="400" height="400"/><text x="50%25" y="50%25" font-size="18" text-anchor="middle" fill="%238a8680" font-family="sans-serif" dy=".3em">사진이 필요합니다</text></svg>';

export function PageFrame({ children, height = 1200, bg = BRAND.colors.white, onClearActive }) {
  // 빈 공간 클릭 → 활성 레이어 해제
  // 자식 요소(이미지/텍스트/툴바)는 자체 mousedown에서 stopPropagation 또는 onActivate를 호출하므로,
  // 여기까지 버블링된 mousedown은 "어떤 편집 가능 요소도 잡지 못한 빈 공간 클릭"으로 간주한다.
  // 단, data-editable / data-toolbar / data-handle / data-edit-image 영역은 제외.
  const handleMouseDown = (e) => {
    if (typeof onClearActive !== 'function') return;
    let n = e.target;
    while (n && n !== e.currentTarget) {
      if (
        n.dataset?.editable === 'true' ||
        n.dataset?.toolbar !== undefined ||
        n.dataset?.handle !== undefined ||
        n.dataset?.editImage !== undefined ||
        n.dataset?.freeImage !== undefined ||
        n.dataset?.layerPanel !== undefined
      ) return;
      n = n.parentElement;
    }
    onClearActive();
  };
  return (
    <div
      className="coupang-page"
      onMouseDown={handleMouseDown}
      style={{
        width: 780,
        minHeight: height,
        backgroundColor: bg,
        color: BRAND.colors.text,
        // CSS 변수로 폰트 적용 — 사용자가 폰트 카드 선택 시 즉시 반영
        fontFamily: 'var(--app-font, ' + BRAND.fontFamily + ')',
        position: 'relative',
      }}
    >
      {children}
    </div>
  );
}

export function Img({ src, alt = '', aspect = '1 / 1', radius = 0, style = {} }) {
  return (
    <div
      style={{
        width: '100%',
        aspectRatio: aspect,
        backgroundColor: BRAND.colors.sub,
        borderRadius: radius,
        overflow: 'hidden',
        ...style,
      }}
    >
      <img
        src={src || fallbackImg}
        alt={alt}
        crossOrigin="anonymous"
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
      />
    </div>
  );
}

// 여러 종류의 체크 아이콘 — variant에 따라 다른 모양이 나오도록
// variant 0~5 순환: 원형체크, 사각체크, 리본체크, 별체크, 하트체크, 다이아체크
export function CheckIcon({ size = 22, color = BRAND.colors.accent, variant = 0 }) {
  const v = Math.abs(variant) % 6;
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 48 48',
    fill: 'none',
    xmlns: 'http://www.w3.org/2000/svg',
  };
  switch (v) {
    case 1: // 사각형 모서리 둥근 체크
      return (
        <svg {...common}>
          <rect x="2" y="2" width="44" height="44" rx="10" fill={color} />
          <path d="M13 24.5 L20.5 32 L35 16.5" stroke="#fff" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      );
    case 2: // 리본/실드 (방패) 체크
      return (
        <svg {...common}>
          <path d="M24 2 L44 10 V26 C44 36 35 44 24 46 C13 44 4 36 4 26 V10 Z" fill={color} />
          <path d="M13 24 L20.5 31.5 L35 17" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      );
    case 3: // 별모양 내부 체크
      return (
        <svg {...common}>
          <path d="M24 3 L29.5 17 L44 18.5 L33 28 L37 43 L24 35 L11 43 L15 28 L4 18.5 L18.5 17 Z" fill={color} />
          <path d="M15 25 L21 31 L33 18" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      );
    case 4: // 육각형(헥사곤) 체크
      return (
        <svg {...common}>
          <path d="M24 3 L43 13 V35 L24 45 L5 35 V13 Z" fill={color} />
          <path d="M13 24.5 L20.5 32 L35 16.5" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      );
    case 5: // 다이아(마름모) 체크
      return (
        <svg {...common}>
          <path d="M24 2 L46 24 L24 46 L2 24 Z" fill={color} />
          <path d="M13 24.5 L20.5 32 L35 16.5" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      );
    default: // 0 — 기본 원형 체크
      return (
        <svg {...common}>
          <circle cx="24" cy="24" r="23" fill={color} />
          <path d="M13 24.5 L20.5 32 L35 16.5" stroke="#fff" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      );
  }
}

export function PillBadge({ children }) {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '8px 18px',
        borderRadius: 999,
        backgroundColor: BRAND.colors.main,
        color: '#fff',
        fontSize: 22,
        fontWeight: 800,
        letterSpacing: '-0.02em',
      }}
    >
      {children}
    </span>
  );
}

export function Divider({ color = BRAND.colors.main, dashed = false }) {
  return (
    <div
      style={{
        height: 0,
        borderTop: `2px ${dashed ? 'dashed' : 'solid'} ${color}`,
        opacity: dashed ? 0.5 : 0.6,
      }}
    />
  );
}

export function SectionTitle({ children, size = 42, align = 'center' }) {
  return (
    <h2
      style={{
        fontSize: size,
        fontWeight: 900,
        color: BRAND.colors.main,
        textAlign: align,
        lineHeight: 1.2,
        letterSpacing: '-0.035em',
        margin: 0,
        wordBreak: 'keep-all',
      }}
    >
      {children}
    </h2>
  );
}

export function SubTitle({ children, size = 30 }) {
  return (
    <h3
      style={{
        fontSize: size,
        fontWeight: 800,
        color: BRAND.colors.text,
        lineHeight: 1.3,
        letterSpacing: '-0.025em',
        margin: 0,
        wordBreak: 'keep-all',
      }}
    >
      {children}
    </h3>
  );
}

export function Body({ children, size = 20, color = BRAND.colors.text, align = 'left' }) {
  return (
    <p
      style={{
        fontSize: size,
        fontWeight: 500,
        color,
        lineHeight: 1.6,
        letterSpacing: '-0.015em',
        margin: 0,
        textAlign: align,
        wordBreak: 'keep-all',
      }}
    >
      {children}
    </p>
  );
}

export { fallbackImg };
