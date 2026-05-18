import { useState, useEffect, useRef } from 'react';

/**
 * Section — 사이드바 접이식 섹션 카드
 * @param {string} title 섹션 제목
 * @param {string} emoji 좌측 이모지
 * @param {ReactNode} children 본문
 * @param {boolean} collapsible 접기 가능 여부
 * @param {boolean} defaultCollapsed 초기 접힘 상태
 * @param {boolean|undefined} forceCollapsed 외부에서 일괄 접기/펼치기 신호 (전체 버튼용)
 *   - undefined: 무시 (내부 state 독립 동작)
 *   - true/false: 해당 값으로 강제 동기화 (단, 이후 개별 클릭은 내부 state로 독립)
 * @param {string|null} badge 우측 상단 작은 뱃지 (예: '5장')
 * @param {boolean} flat 그룹 내부에서 사용 시 개별 테두리/배경 제거
 */
export default function Section({
  title,
  emoji,
  children,
  collapsible = false,
  defaultCollapsed = false,
  forceCollapsed = undefined,  // 전체 접기/펼치기 전용 — 개별 화살표와 독립
  badge = null,
  flat = false,
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  // forceCollapsed 가 바뀔 때만 내부 state 를 동기화
  const prevForce = useRef(forceCollapsed);
  useEffect(() => {
    if (forceCollapsed === undefined) return;
    if (forceCollapsed !== prevForce.current) {
      prevForce.current = forceCollapsed;
      setCollapsed(forceCollapsed);
    }
  }, [forceCollapsed]);

  const isCollapsible = collapsible;
  return (
    <div
      className={flat ? '' : 'bg-white rounded-lg border'}
      style={{ borderColor: '#e2ddd4', padding: '12px 10px' }}
    >
      <div
        className={`flex items-center gap-1.5 ${collapsed ? '' : 'pb-1.5 mb-2 border-b'}`}
        style={{ borderColor: '#f0ebe4', cursor: isCollapsible ? 'pointer' : 'default' }}
        onClick={isCollapsible ? () => setCollapsed((v) => !v) : undefined}
        data-section-header
        data-collapsed={collapsed ? 'true' : 'false'}
      >
        <span style={{ fontSize: '15px', lineHeight: 1 }}>{emoji}</span>
        <h3
          className="font-bold flex-1"
          style={{ color: '#2F2A26', fontSize: '15px', lineHeight: 1.25, margin: 0 }}
        >
          {title}
        </h3>
        {badge && (
          <span
            className="rounded font-bold"
            style={{
              backgroundColor: '#fef3c7',
              color: '#92400e',
              fontSize: '11px',
              lineHeight: 1,
              padding: '2px 5px',
            }}
          >
            {badge}
          </span>
        )}
        {isCollapsible && (
          <span
            className="rounded transition-transform"
            style={{
              backgroundColor: '#F7F3EE',
              color: '#6b635c',
              fontSize: '11px',
              lineHeight: 1,
              padding: '2px 5px',
              transform: collapsed ? 'rotate(0deg)' : 'rotate(180deg)',
            }}
          >
            ▼
          </span>
        )}
      </div>
      {!collapsed && <div className="space-y-2.5">{children}</div>}
    </div>
  );
}
