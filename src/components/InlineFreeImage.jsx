import { useEffect, useRef, useState } from 'react';

/**
 * InlineFreeImage — 본문 흐름 안에서 자리를 차지하는 자유사진
 *
 * 핵심 차이 (FreeImage vs InlineFreeImage):
 *   - FreeImage: 절대 좌표(left/top) 로 페이지 위에 떠 있는 사진
 *   - InlineFreeImage: block 흐름으로 렌더 → 본문 텍스트/메인사진을 자동으로 밀어냄
 *
 * UI 통일 (FreeImage 와 동일한 인터랙션):
 *   - 호버/클릭 시 8개 핸들(코너 4 + 모서리 4)로 자유 리사이즈 (가로/세로 모두)
 *   - idle 툴바: 🔍 크롭 / ▲▲ 맨앞 / ▲ 앞 / ▼ 뒤 / ▼▼ 맨뒤 / z표시 / 🎨 색상 / 🗑 삭제
 *   - 더블클릭 → cropping 모드 (확대 슬라이더 / 사진 교체 / 크롭 리셋 / ✓ 완료)
 *   - 색상 조정 패널: 밝기/대비/채도/색조 + 9 프리셋
 *
 * Props:
 *   item: { id, src, w, h, adjust, align, slot, crop }
 *   editMode, isActive, onActivate
 *   onUpdate(partial) / onDelete() / onMoveUp() / onMoveDown()
 *   onChangeLayer(action: 'front'|'back'|'forward'|'backward')  — 레이어 순서 변경
 *   zIndexLabel — 레이어 z-index 표시용 (예: 5)
 *   canMoveUp, canMoveDown — 끝점일 때 비활성
 *   replaceImages: string[] — 교체 가능한 사진 후보
 */
const MIN_SCALE = 0.5;
const MAX_SCALE = 4.0;
const MIN_W = 200;
const MAX_W = 740;
const MIN_H = 120;
const MAX_H = 1200;

function coverSize(boxW, boxH, natW = 1, natH = 1) {
  const boxRatio = boxW / boxH;
  const imgRatio = natW / natH;
  if (imgRatio > boxRatio) return { w: boxH * imgRatio, h: boxH };
  return { w: boxW, h: boxW / imgRatio };
}

export default function InlineFreeImage({
  item,
  editMode = false,
  isActive = false,
  onActivate = () => {},
  onUpdate = () => {},
  onDelete = () => {},
  onMoveUp = () => {},
  onMoveDown = () => {},
  onChangeLayer = () => {},
  zIndexLabel = null,
  canMoveUp = true,
  canMoveDown = true,
  replaceImages = [],
}) {
  const wrapRef = useRef(null);
  const [resizing, setResizing] = useState(null);
  const [showAdjust, setShowAdjust] = useState(false);
  const [showReplace, setShowReplace] = useState(false);
  // 🔍 크롭 모드 (더블클릭 진입)
  const [mode, setMode] = useState('idle'); // 'idle' | 'cropping'
  const [draggingCrop, setDraggingCrop] = useState(null);
  const [imgNatural, setImgNatural] = useState({ w: 1, h: 1 });

  const { id, src, w = 700, h = 460, adjust, align = 'center', crop } = item;

  // 크롭 계산 (FreeImage와 동일한 패턴)
  const cover = coverSize(w, h, imgNatural.w, imgNatural.h);
  const rawScale = crop?.scale ?? 1.0;
  const currentScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, rawScale));
  const imgInnerW = cover.w * currentScale;
  const imgInnerH = cover.h * currentScale;
  const offsetX = (crop?.offsetXR ?? 0) * w;
  const offsetY = (crop?.offsetYR ?? 0) * h;

  const handleImgLoad = (e) => {
    setImgNatural({ w: e.target.naturalWidth || 1, h: e.target.naturalHeight || 1 });
  };

  const clampOffset = (ox, oy, _imgW = imgInnerW, _imgH = imgInnerH) => {
    const maxOx = Math.max(0, (_imgW - w) / 2);
    const maxOy = Math.max(0, (_imgH - h) / 2);
    return {
      x: Math.max(-maxOx, Math.min(maxOx, ox)),
      y: Math.max(-maxOy, Math.min(maxOy, oy)),
    };
  };

  const handleCropDragStart = (e) => {
    if (mode !== 'cropping') return;
    e.preventDefault();
    e.stopPropagation();
    setDraggingCrop({
      startX: e.clientX,
      startY: e.clientY,
      sox: offsetX,
      soy: offsetY,
    });
  };

  useEffect(() => {
    if (!draggingCrop) return;
    const onMove = (e) => {
      const dx = e.clientX - draggingCrop.startX;
      const dy = e.clientY - draggingCrop.startY;
      const c = clampOffset(draggingCrop.sox + dx, draggingCrop.soy + dy);
      onUpdate({
        crop: {
          scale: currentScale,
          offsetXR: w > 0 ? c.x / w : 0,
          offsetYR: h > 0 ? c.y / h : 0,
        },
      });
    };
    const onUp = () => setDraggingCrop(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draggingCrop, w, h, currentScale, imgInnerW, imgInnerH]);

  const handleScaleChange = (newScale) => {
    const newImgW = cover.w * newScale;
    const newImgH = cover.h * newScale;
    const c = clampOffset(offsetX, offsetY, newImgW, newImgH);
    onUpdate({
      crop: {
        scale: newScale,
        offsetXR: w > 0 ? c.x / w : 0,
        offsetYR: h > 0 ? c.y / h : 0,
      },
    });
  };

  // ESC: 크롭 모드 종료
  useEffect(() => {
    if (mode !== 'cropping') return;
    const onKey = (e) => { if (e.key === 'Escape') setMode('idle'); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode]);

  const adj = {
    brightness: adjust?.brightness ?? 100,
    contrast:   adjust?.contrast   ?? 100,
    saturate:   adjust?.saturate   ?? 100,
    hue:        adjust?.hue        ?? 0,
  };
  const cssFilter = `brightness(${adj.brightness}%) contrast(${adj.contrast}%) saturate(${adj.saturate}%) hue-rotate(${adj.hue}deg)`;
  const isAdjusted = adj.brightness !== 100 || adj.contrast !== 100 || adj.saturate !== 100 || adj.hue !== 0;

  // 외부 클릭 시 패널/크롭 닫기
  useEffect(() => {
    if (!showAdjust && !showReplace && mode !== 'cropping') return;
    const onDoc = (e) => {
      if (wrapRef.current?.contains(e.target)) return;
      setShowAdjust(false);
      setShowReplace(false);
      setMode('idle');
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [showAdjust, showReplace, mode]);

  // 8개 핸들 리사이즈 (FreeImage 와 동일)
  // n / s: 높이만 / e / w: 너비만 / nw, ne, sw, se: 비율 유지(Shift=자유)
  // 🆕 2026-04-29: Shift+드래그로 가로/세로만 줄일 때 안의 사진이 움직이는 문제 수정.
  //    원리 — 시작 시점의 이미지 픽셀 크기·offset 픽셀값을 캡처해두고,
  //          리사이즈 중에는 새 컨테이너 w/h 기준으로 scale·offsetXR/YR 을 역산
  //          → 컨테이너 크기가 바뀌어도 사진은 같은 픽셀 위치·픽셀 크기로 유지됨.
  const handleResizeStart = (e, edge) => {
    e.preventDefault();
    e.stopPropagation();
    setResizing({
      edge,
      startX: e.clientX, startY: e.clientY,
      sw: w, sh: h,
      ratio: w / Math.max(1, h),
      shiftKey: e.shiftKey,
      // 시작 시점 이미지 메트릭 스냅샷 (사진 위치 유지를 위해)
      sImgInnerW: imgInnerW,
      sImgInnerH: imgInnerH,
      sOffsetX:   offsetX,
      sOffsetY:   offsetY,
      sNatW:      imgNatural.w,
      sNatH:      imgNatural.h,
      sScale:     currentScale,
    });
  };

  useEffect(() => {
    if (!resizing) return;
    const onMove = (e) => {
      const dx = e.clientX - resizing.startX;
      const dy = e.clientY - resizing.startY;
      let nw = resizing.sw;
      let nh = resizing.sh;
      const edge = resizing.edge;
      const lockRatio = !e.shiftKey && (
        edge === 'nw' || edge === 'ne' || edge === 'sw' || edge === 'se'
      );

      if (edge.includes('e')) nw = resizing.sw + dx;
      if (edge.includes('w')) nw = resizing.sw - dx;
      if (edge.includes('s')) nh = resizing.sh + dy;
      if (edge.includes('n')) nh = resizing.sh - dy;

      // 가운데 모서리 (n/s/e/w 단독) 인 경우 다른 축은 그대로
      if (edge === 'n' || edge === 's') nw = resizing.sw;
      if (edge === 'e' || edge === 'w') nh = resizing.sh;

      // 비율 유지 (코너만)
      if (lockRatio) {
        // dx 와 dy 중 더 큰 변화량 기준으로 비율 결정
        if (Math.abs(dx) > Math.abs(dy)) {
          nh = nw / resizing.ratio;
        } else {
          nw = nh * resizing.ratio;
        }
      }

      nw = Math.max(MIN_W, Math.min(MAX_W, nw));
      nh = Math.max(MIN_H, Math.min(MAX_H, nh));

      // 🆕 자유 리사이즈(코너+Shift, 또는 단변 핸들 n/s/e/w) 시
      //    이미지 내부 픽셀 크기/위치를 보존하기 위해 scale·offsetXR/YR 을 역산.
      //    비율 유지 코너 드래그(lockRatio=true) 시에는 cover 가 동일 비율로 변하므로
      //    기존 동작 그대로 두어도 사진이 안 움직임 → crop 객체 갱신 불필요.
      const isFreeResize = !lockRatio && (
        edge === 'n' || edge === 's' || edge === 'e' || edge === 'w' ||
        edge === 'nw' || edge === 'ne' || edge === 'sw' || edge === 'se'
      );

      const update = { w: Math.round(nw), h: Math.round(nh) };

      if (isFreeResize && resizing.sNatW > 0 && resizing.sNatH > 0) {
        // 🆕 v2 (2026-04-29): 이미지 픽셀 크기를 박스 변경에 무관하게 보존하는
        //   정확한 로직.
        //
        // 원리:
        //   imgInnerW = cover.w * scale
        //   imgInnerH = cover.h * scale
        //   여기서 cover 는 박스 비율에 따라 가로/세로 중 한 축만 박스에 맞고
        //   다른 축은 자연 비율을 따라가도록 계산됨.
        //   → 이미지 자연 비율 imgRatio 는 변하지 않으므로
        //     이미지 픽셀 크기 자체를 보존하는 것이 가장 안전함.
        //
        // 방법:
        //   ① 시작 시점의 이미지 픽셀 크기(sImgInnerW, sImgInnerH) 그대로 유지.
        //   ② imgRatio = sNatW / sNatH 는 고정.
        //   ③ 새 박스(nw, nh)에서 cover 함수가 어느 축을 박스에 맞추는지 판별.
        //   ④ 그 축 기준으로 scale 을 역산:
        //      - 만약 cover 가 박스의 H 에 맞춘다면 → cover.h = nh
        //        → scale = sImgInnerH / nh
        //      - 만약 cover 가 박스의 W 에 맞춘다면 → cover.w = nw
        //        → scale = sImgInnerW / nw
        //   결과적으로 박스가 어떻게 변해도 imgInnerW/H 는 시작 시점과 동일.
        const imgRatio = resizing.sNatW / resizing.sNatH;
        const boxRatio = nw / Math.max(1, nh);
        // coverSize 의 분기와 동일한 조건
        const coverFitsHeight = imgRatio > boxRatio;

        let newScale;
        if (coverFitsHeight) {
          // cover.h = nh, cover.w = nh * imgRatio
          // → newImgInnerH = nh * scale = sImgInnerH 가 되도록
          newScale = resizing.sImgInnerH / Math.max(1, nh);
        } else {
          // cover.w = nw, cover.h = nw / imgRatio
          // → newImgInnerW = nw * scale = sImgInnerW 가 되도록
          newScale = resizing.sImgInnerW / Math.max(1, nw);
        }
        // scale 한도 안으로 클램프
        newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScale));

        // 절대 offset 픽셀값을 유지하면서 새 박스 기준 비율로 변환
        // (새 박스 안에서 클램프하여 사진이 가장자리 빈 공간을 만들지 않게)
        const newCoverW = coverFitsHeight ? nh * imgRatio : nw;
        const newCoverH = coverFitsHeight ? nh : nw / imgRatio;
        const newImgInnerW = newCoverW * newScale;
        const newImgInnerH = newCoverH * newScale;
        const maxOx = Math.max(0, (newImgInnerW - nw) / 2);
        const maxOy = Math.max(0, (newImgInnerH - nh) / 2);
        const clampedOx = Math.max(-maxOx, Math.min(maxOx, resizing.sOffsetX));
        const clampedOy = Math.max(-maxOy, Math.min(maxOy, resizing.sOffsetY));
        const newOffsetXR = nw > 0 ? clampedOx / nw : 0;
        const newOffsetYR = nh > 0 ? clampedOy / nh : 0;

        update.crop = {
          scale: newScale,
          offsetXR: newOffsetXR,
          offsetYR: newOffsetYR,
        };
      }

      onUpdate(update);
    };
    const onUp = () => setResizing(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [resizing, onUpdate]);

  // 좌우 정렬 → marginLeft/marginRight 자동 결정 (col flex 컨테이너)
  const containerStyle = {
    position: 'relative',
    width: '100%',
    margin: '20px 0',
    display: 'flex',
    justifyContent: align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center',
    pointerEvents: editMode ? 'auto' : 'none',
  };

  // 8개 핸들 정의 — FreeImage 와 동일
  const HANDLES = [
    { id: 'nw', cursor: 'nwse-resize' },
    { id: 'n',  cursor: 'ns-resize'  },
    { id: 'ne', cursor: 'nesw-resize' },
    { id: 'w',  cursor: 'ew-resize'  },
    { id: 'e',  cursor: 'ew-resize'  },
    { id: 'sw', cursor: 'nesw-resize' },
    { id: 's',  cursor: 'ns-resize'  },
    { id: 'se', cursor: 'nwse-resize' },
  ];

  return (
    <div ref={wrapRef} style={containerStyle} data-inline-free="true">
      <div
        onClick={(e) => {
          e.stopPropagation();
          if (editMode) onActivate();
        }}
        onDoubleClick={(e) => {
          // 🔍 더블클릭 → 크롭 모드 진입
          if (!editMode) return;
          e.stopPropagation();
          e.preventDefault();
          onActivate();
          setMode('cropping');
        }}
        style={{
          position: 'relative',
          width: w,
          maxWidth: '100%',
          height: h,
          borderRadius: 16,
          overflow: 'hidden',
          backgroundColor: '#e8e5e1',
          outline:
            mode === 'cropping' ? '2px solid #f97316'
            : editMode && isActive ? '2px solid #3b82f6'
            : 'none',
          outlineOffset: 2,
          boxShadow: editMode && isActive ? '0 4px 14px rgba(59,130,246,0.25)' : 'none',
          cursor: editMode
            ? (mode === 'cropping' ? (draggingCrop ? 'grabbing' : 'grab') : 'pointer')
            : 'default',
        }}
      >
        <img
          src={src}
          alt=""
          crossOrigin="anonymous"
          draggable={false}
          onLoad={handleImgLoad}
          onMouseDown={mode === 'cropping' ? handleCropDragStart : undefined}
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            // 크롭 데이터가 있으면 cover.w*scale 크기로, 없으면 컨테이너 가득
            width: imgInnerW > 0 ? imgInnerW : '100%',
            height: imgInnerH > 0 ? imgInnerH : '100%',
            maxWidth: 'none',
            transform: `translate(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px))`,
            objectFit: 'cover',
            display: 'block',
            userSelect: 'none',
            pointerEvents: mode === 'cropping' ? 'auto' : 'none',
            filter: cssFilter,
          }}
        />

        {/* 크기 표시 (활성 + 편집모드) */}
        {editMode && isActive && (
          <div
            data-edit-ui="size-label"
            style={{
              position: 'absolute', right: 6, top: 6,
              backgroundColor: 'rgba(30,41,59,0.85)', color: '#fff',
              padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 800,
              zIndex: 10, pointerEvents: 'none',
            }}
          >
            {Math.round(w)}×{Math.round(h)}
          </div>
        )}

        {/* 8개 리사이즈 핸들 — 활성 + idle 모드 일 때만 */}
        {editMode && isActive && mode === 'idle' && HANDLES.map((hd) => {
          const s = {
            position: 'absolute', width: 12, height: 12,
            backgroundColor: '#3b82f6', border: '2px solid #fff',
            borderRadius: 3, boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
            cursor: hd.cursor, zIndex: 20,
          };
          if (hd.id.includes('w')) s.left = -6;
          else if (hd.id.includes('e')) s.right = -6;
          else { s.left = '50%'; s.marginLeft = -6; }
          if (hd.id.includes('n')) s.top = -6;
          else if (hd.id.includes('s')) s.bottom = -6;
          else { s.top = '50%'; s.marginTop = -6; }
          return (
            <div key={hd.id} data-handle
              onMouseDown={(e) => handleResizeStart(e, hd.id)}
              style={s}
              title="드래그=비율유지(코너) / Shift=자유변형"
            />
          );
        })}
      </div>

      {/* idle 툴바 — 활성 + 편집모드 + 크롭모드 아닐 때 (FreeImage 와 동일한 디자인) */}
      {editMode && isActive && mode === 'idle' && (
        <div
          data-inline-toolbar
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            left: '50%',
            top: -42,
            transform: 'translateX(-50%)',
            display: 'flex', gap: 6, alignItems: 'center',
            backgroundColor: '#1e293b', padding: '6px 10px',
            borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
            zIndex: 100001, whiteSpace: 'nowrap',
          }}
        >
          {/* 🔍 크롭 모드 진입 */}
          <button onClick={() => setMode('cropping')}
            style={btnLabel('#3b82f6')} title="크롭 모드 (더블클릭으로도 진입)">🔍 크롭</button>
          <span style={sep} />

          {/* 레이어 순서 (압축: 아이콘만) */}
          <button onClick={() => onChangeLayer('front')}
            style={btnIcon('#475569')} title="맨 앞으로">▲▲</button>
          <button onClick={() => onChangeLayer('forward')}
            style={btnIcon('#64748b')} title="한 단계 앞으로">▲</button>
          <button onClick={() => onChangeLayer('backward')}
            style={btnIcon('#64748b')} title="한 단계 뒤로">▼</button>
          <button onClick={() => onChangeLayer('back')}
            style={btnIcon('#475569')} title="맨 뒤로">▼▼</button>
          {zIndexLabel != null && (
            <span style={{
              backgroundColor: '#fbbf24', color: '#1e293b',
              padding: '2px 5px', borderRadius: 4,
              fontSize: 9, fontWeight: 900,
            }}>z{zIndexLabel}</span>
          )}
          <span style={sep} />

          {/* 인라인 슬롯 위/아래 이동 */}
          <button onClick={onMoveUp} disabled={!canMoveUp}
            style={btnIcon(canMoveUp ? '#0ea5e9' : '#334155')} title="본문 위로 이동">⇧</button>
          <button onClick={onMoveDown} disabled={!canMoveDown}
            style={btnIcon(canMoveDown ? '#0ea5e9' : '#334155')} title="본문 아래로 이동">⇩</button>
          <span style={sep} />

          {/* 좌우 정렬 (빠른 접근) — 2026-04-28 추가 */}
          <button onClick={() => onUpdate({ align: 'left' })}
            style={btnIcon(align === 'left' ? '#10b981' : '#475569')} title="왼쪽 정렬">⬅</button>
          <button onClick={() => onUpdate({ align: 'center' })}
            style={btnIcon(align === 'center' ? '#10b981' : '#475569')} title="가운데 정렬">⬌</button>
          <button onClick={() => onUpdate({ align: 'right' })}
            style={btnIcon(align === 'right' ? '#10b981' : '#475569')} title="오른쪽 정렬">➡</button>
          <span style={sep} />

          {/* 🎨 색상 */}
          <button
            onClick={() => { setShowAdjust((s) => !s); setShowReplace(false); }}
            style={btnLabel(showAdjust ? '#7c3aed' : (isAdjusted ? '#a855f7' : '#475569'))}
            title="색상·밝기·채도 조정"
          >🎨 색상{isAdjusted ? ' •' : ''}</button>
          <span style={sep} />

          {/* 🗑 삭제 */}
          <button
            onClick={() => { if (window.confirm('이 사진을 삭제할까요?')) onDelete(); }}
            style={btnIcon('#dc2626')}
            title="삭제"
          >🗑</button>
        </div>
      )}

      {/* 🔍 크롭 모드 툴바 (FreeImage 와 동일) */}
      {editMode && isActive && mode === 'cropping' && (
        <div
          data-inline-toolbar
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            left: '50%',
            top: -50,
            transform: 'translateX(-50%)',
            display: 'flex', gap: 8, alignItems: 'center',
            backgroundColor: '#1e293b', padding: '8px 12px',
            borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
            zIndex: 100001, whiteSpace: 'nowrap',
          }}
        >
          <span style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>확대:</span>
          <input
            type="range" min={MIN_SCALE} max={MAX_SCALE} step="0.05"
            value={currentScale}
            onChange={(e) => handleScaleChange(parseFloat(e.target.value))}
            style={{ width: 130, accentColor: '#f97316' }}
            onMouseDown={(e) => e.stopPropagation()}
            title="50% ~ 400%"
          />
          <span style={{ color: '#fff', fontSize: 11, fontWeight: 700, minWidth: 40 }}>
            {Math.round(currentScale * 100)}%
          </span>
          <span style={sep} />
          {replaceImages.length > 0 && (
            <button onClick={() => { setShowReplace((s) => !s); }}
              style={btnLabel('#0ea5e9')} title="다른 사진으로 교체">🔄 사진 교체</button>
          )}
          <button onClick={() => onUpdate({ crop: null })}
            style={btnLabel('#7c2d12')} title="크롭 초기화 (확대/위치 리셋)">↺ 크롭만</button>
          <button onClick={() => { setMode('idle'); setShowReplace(false); }}
            style={btnLabel('#16a34a')} title="크롭 모드 종료 (ESC)">✓ 완료</button>
        </div>
      )}

      {/* 색상 조정 패널 */}
      {editMode && isActive && showAdjust && mode === 'idle' && (
        <div
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            left: '50%', top: 8,
            transform: 'translateX(-50%)',
            width: 280,
            backgroundColor: '#fff',
            border: '1px solid #e2ddd4',
            borderRadius: 10,
            boxShadow: '0 12px 30px rgba(0,0,0,0.22)',
            padding: 12, zIndex: 100002,
          }}
        >
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            alignItems: 'center', marginBottom: 10,
          }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#2F2A26' }}>🎨 색상 조정</div>
            <button onClick={() => setShowAdjust(false)}
              style={{ border: 'none', background: 'transparent', color: '#64748b', fontSize: 14, cursor: 'pointer' }}>✕</button>
          </div>
          <Slider label="🌞 밝기" unit="%" min={0} max={200} step={1}
            value={adj.brightness} defaultValue={100} color="#f59e0b"
            onChange={(v) => onUpdate({ adjust: { ...adj, brightness: v } })} />
          <Slider label="◐ 대비" unit="%" min={0} max={200} step={1}
            value={adj.contrast} defaultValue={100} color="#475569"
            onChange={(v) => onUpdate({ adjust: { ...adj, contrast: v } })} />
          <Slider label="🎨 채도" unit="%" min={0} max={200} step={1}
            value={adj.saturate} defaultValue={100} color="#ec4899"
            onChange={(v) => onUpdate({ adjust: { ...adj, saturate: v } })} />
          <Slider label="🌈 색조" unit="°" min={-180} max={180} step={1}
            value={adj.hue} defaultValue={0} color="#8b5cf6"
            onChange={(v) => onUpdate({ adjust: { ...adj, hue: v } })} />

          {/* 정렬 */}
          <div style={{ marginTop: 8, marginBottom: 4, fontSize: 10, fontWeight: 700, color: '#64748b' }}>📐 정렬</div>
          <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
            <button onClick={() => onUpdate({ align: 'left' })}
              style={alignBtn(align === 'left')} title="왼쪽">⬅ 왼쪽</button>
            <button onClick={() => onUpdate({ align: 'center' })}
              style={alignBtn(align === 'center')} title="가운데">⬌ 가운데</button>
            <button onClick={() => onUpdate({ align: 'right' })}
              style={alignBtn(align === 'right')} title="오른쪽">➡ 오른쪽</button>
          </div>

          <div style={{ marginTop: 6, fontSize: 10, fontWeight: 700, color: '#64748b' }}>✨ 프리셋</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4, marginTop: 4 }}>
            <Pre label="원본" onClick={() => onUpdate({ adjust: null })} />
            <Pre label="선명" onClick={() => onUpdate({ adjust: { brightness: 105, contrast: 115, saturate: 120, hue: 0 } })} />
            <Pre label="밝게" onClick={() => onUpdate({ adjust: { brightness: 120, contrast: 100, saturate: 105, hue: 0 } })} />
            <Pre label="어둡게" onClick={() => onUpdate({ adjust: { brightness: 85, contrast: 110, saturate: 100, hue: 0 } })} />
            <Pre label="흑백" onClick={() => onUpdate({ adjust: { brightness: 100, contrast: 110, saturate: 0, hue: 0 } })} />
            <Pre label="따뜻" onClick={() => onUpdate({ adjust: { brightness: 105, contrast: 100, saturate: 115, hue: -10 } })} />
            <Pre label="차갑" onClick={() => onUpdate({ adjust: { brightness: 100, contrast: 100, saturate: 110, hue: 15 } })} />
            <Pre label="빈티지" onClick={() => onUpdate({ adjust: { brightness: 95, contrast: 90, saturate: 80, hue: 10 } })} />
            <Pre label="비비드" onClick={() => onUpdate({ adjust: { brightness: 100, contrast: 120, saturate: 145, hue: 0 } })} />
          </div>
        </div>
      )}

      {/* 사진 교체 패널 (cropping 모드) */}
      {editMode && isActive && mode === 'cropping' && showReplace && (
        <div
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            left: '50%', top: 8,
            transform: 'translateX(-50%)',
            width: 320, maxHeight: 380, overflow: 'auto',
            backgroundColor: '#fff', border: '1px solid #e2ddd4',
            borderRadius: 10, boxShadow: '0 12px 30px rgba(0,0,0,0.22)',
            padding: 12, zIndex: 100002,
          }}
        >
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            alignItems: 'center', marginBottom: 8,
          }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#2F2A26' }}>🔄 사진 교체</div>
            <button onClick={() => setShowReplace(false)}
              style={{ border: 'none', background: 'transparent', color: '#64748b', fontSize: 14, cursor: 'pointer' }}>✕</button>
          </div>
          <label style={{
            display: 'block', border: '2px dashed #93c5fd', backgroundColor: '#eff6ff',
            borderRadius: 8, padding: '10px', textAlign: 'center',
            fontSize: 11, fontWeight: 700, color: '#1d4ed8', cursor: 'pointer',
            marginBottom: 8,
          }}>
            ⬆️ 컴퓨터에서 새 사진 업로드
            <input type="file" accept="image/*" style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const r = new FileReader();
                r.onload = (ev) => {
                  if (ev.target?.result) {
                    onUpdate({ src: ev.target.result, crop: null });
                    setShowReplace(false);
                  }
                };
                r.readAsDataURL(f);
              }} />
          </label>
          {replaceImages.length > 0 && (
            <>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', marginBottom: 4 }}>
                또는 생성된 사진 {replaceImages.length}장에서 선택
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                {replaceImages.map((src, idx) => (
                  <button key={idx}
                    onClick={() => { onUpdate({ src, crop: null }); setShowReplace(false); }}
                    style={{
                      border: '1px solid #e2ddd4', borderRadius: 6, padding: 0,
                      overflow: 'hidden', cursor: 'pointer', aspectRatio: '1 / 1',
                      backgroundColor: '#f3f4f6',
                    }}
                  >
                    <img src={src} alt="" crossOrigin="anonymous"
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── 공통 버튼 스타일 (FreeImage 의 btnLabel 과 통일) ──
function btnLabel(color) {
  return {
    backgroundColor: color, color: '#fff', border: 'none',
    padding: '6px 10px', borderRadius: 5,
    fontSize: 11, fontWeight: 800, cursor: 'pointer',
    boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
    minWidth: 28, lineHeight: 1.2, whiteSpace: 'nowrap',
  };
}
// 아이콘 전용 (압축형) — 텍스트 라벨 없는 버튼
function btnIcon(color) {
  return {
    backgroundColor: color, color: '#fff', border: 'none',
    padding: '5px 7px', borderRadius: 4,
    fontSize: 11, fontWeight: 800, cursor: 'pointer',
    boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
    minWidth: 24, lineHeight: 1.1, whiteSpace: 'nowrap',
  };
}
const sep = { width: 1, height: 18, backgroundColor: '#475569' };

function alignBtn(active) {
  return {
    flex: 1,
    backgroundColor: active ? '#3b82f6' : '#f3f4f6',
    color: active ? '#fff' : '#374151',
    border: '1px solid #e5e7eb',
    padding: '5px 6px', borderRadius: 4,
    fontSize: 10, fontWeight: 700, cursor: 'pointer',
  };
}

function Slider({ label, unit, min, max, step, value, defaultValue, onChange, color }) {
  const isMod = value !== defaultValue;
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#374151' }}>{label}</span>
        <button onClick={() => onChange(defaultValue)}
          style={{ border: 'none', background: 'transparent', color: isMod ? color : '#9ca3af',
                   fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>
          {value}{unit}{isMod ? ' ↺' : ''}
        </button>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        onDoubleClick={() => onChange(defaultValue)}
        style={{ width: '100%', accentColor: color }}
      />
    </div>
  );
}

function Pre({ label, onClick }) {
  return (
    <button onClick={onClick}
      style={{
        backgroundColor: '#f3f4f6', color: '#374151',
        border: '1px solid #e5e7eb',
        padding: '5px 4px', borderRadius: 4,
        fontSize: 10, fontWeight: 700, cursor: 'pointer',
      }}>{label}</button>
  );
}
