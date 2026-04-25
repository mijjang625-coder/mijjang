import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * EditableImage v3 — 박스/이미지 완전 분리
 *
 * A모드 (프레임 리사이즈): 8개 핸들로 박스 가로/세로/위치 조정
 *   - 기본: 가로세로 비율 잠금 ON (안전)
 *   - Shift 누른 채 드래그 → 자유 변형 (비율 잠금 해제)
 *   - 스냅: 부모 컨테이너 좌/우/중앙 가장자리 자동 정렬
 *
 * B모드 (크롭): 박스 크기 무관하게 내부 사진 자체를 변형
 *   - 사진 표시 크기를 절대 px로 저장 → 박스 크기 변경에 영향 안 받음
 *   - 슬라이더(50%~400%) 또는 Shift+휠로 확대/축소
 *   - 사진 드래그로 박스 안에서 이동
 *   - 더블클릭으로 즉시 진입
 *   - 🔄 사진 교체 버튼
 *
 * Override 데이터 구조:
 *   {
 *     frame: { width, height, x, y },          // A모드 (CSS px)
 *     crop:  { scale, offsetXR, offsetYR },    // B모드: cover 대비 배율 + 박스 크기 대비 오프셋 비율
 *     src:   string,                            // 사진 교체된 경우
 *     zIndex: number,
 *   }
 *
 *   - scale: cover 기준 배율 (1.0 = 박스 cover, 1.5 = 50% 더 확대)
 *   - offsetXR / offsetYR: 박스 크기 대비 비율 (-1.0 ~ 1.0). 박스가 변해도 자동 비례 보정됨.
 *   - 사진은 항상 (cover × scale) 크기로 그려짐 → 박스 변경 시 사진도 비례 축소/확대
 *   - scale은 항상 ≥ 1.0 보장 → 사진이 박스보다 작아지지 않음 (빈 공간 안 생김)
 */

const fallbackImg =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><rect fill="%23e8e5e1" width="400" height="400"/><text x="50%25" y="50%25" font-size="18" text-anchor="middle" fill="%238a8680" font-family="sans-serif" dy=".3em">사진이 필요합니다</text></svg>';

const HANDLES = [
  { id: 'nw', cursor: 'nwse-resize', top: -6, left: -6 },
  { id: 'n',  cursor: 'ns-resize',   top: -6, left: '50%' },
  { id: 'ne', cursor: 'nesw-resize', top: -6, right: -6 },
  { id: 'e',  cursor: 'ew-resize',   top: '50%', right: -6 },
  { id: 'se', cursor: 'nwse-resize', bottom: -6, right: -6 },
  { id: 's',  cursor: 'ns-resize',   bottom: -6, left: '50%' },
  { id: 'sw', cursor: 'nesw-resize', bottom: -6, left: -6 },
  { id: 'w',  cursor: 'ew-resize',   top: '50%', left: -6 },
];

const SNAP_THRESHOLD = 8;
const MIN_FRAME_SIZE = 40;
const MIN_IMG_SCALE = 1.0;   // 사진은 항상 박스를 cover (빈 공간 X)
const MAX_IMG_SCALE = 4.0;

/**
 * 박스 크기에 맞춰 cover하는 사진의 표시 크기 계산
 * (object-fit: cover 효과를 절대 px로 표현)
 *
 * @param {number} boxW - 박스 가로
 * @param {number} boxH - 박스 세로
 * @param {number} natW - 사진 원본 가로 비율값 (없으면 1)
 * @param {number} natH - 사진 원본 세로 비율값 (없으면 1)
 * @returns {{w, h}} 사진의 표시 크기
 */
function coverSize(boxW, boxH, natW = 1, natH = 1) {
  const boxRatio = boxW / boxH;
  const imgRatio = natW / natH;
  if (imgRatio > boxRatio) {
    // 사진이 더 가로로 넓음 → 높이 맞추고 가로 넘치게
    return { w: boxH * imgRatio, h: boxH };
  } else {
    // 사진이 더 세로로 김 → 가로 맞추고 세로 넘치게
    return { w: boxW, h: boxW / imgRatio };
  }
}

export default function EditableImage({
  id,
  src,
  aspect = '1 / 1',
  radius = 0,
  editMode = false,
  override = {},
  onChange = () => {},
  availableImages = [],
  alt = '',
  onLayerAction = null, // (action) => void; 지정 시 정규화 레이어 시스템에 위임
  // 활성 레이어 제어 — null이면 기존 hover 기반 동작, 명시되면 활성일 때만 툴바/외곽선 표시
  isActive = null,
  onActivate = null,
  // 다른 레이어가 활성화되어 있으면 이 레이어는 클릭 통과 (피그마 방식)
  hasActiveOther = false,
}) {
  const wrapperRef = useRef(null);
  const frameRef = useRef(null);
  const imgRef = useRef(null);
  const [hovering, setHovering] = useState(false);
  const [mode, setMode] = useState('idle'); // 'idle' | 'cropping'
  const [resizing, setResizing] = useState(null);
  const [draggingFrame, setDraggingFrame] = useState(null);
  const [draggingCrop, setDraggingCrop] = useState(null);
  const [showSwapPanel, setShowSwapPanel] = useState(false);
  // 🎨 색상 조정 패널 (idle 모드에서)
  const [showAdjust, setShowAdjust] = useState(false);
  const [snapLines, setSnapLines] = useState({ v: null, h: null });
  const [naturalSize, setNaturalSize] = useState({ w: 0, h: 0 });    // wrapper 측정값
  const [imgNatural, setImgNatural] = useState({ w: 1, h: 1 });      // 이미지 원본 비율
  // 🆕 부모 컨테이너 실측 너비 — frame이 부모보다 클 때 자동 축소용 (모바일 미리보기)
  const [parentWidth, setParentWidth] = useState(0);

  const frame = override?.frame || null;
  const crop = override?.crop || null; // null이면 cover 효과
  const currentSrc = override?.src || src;
  // 레이어 z-index (P1 정책: 콘텐츠=500, 1~499=뒤, 501~999=앞)
  const customZ = override?.zIndex;
  const CONTENT_Z = 500;

  // 🎨 색상 조정 (FreeImage / InlineFreeImage 와 동일 시스템)
  const adjust = override?.adjust || null;
  const adj = {
    brightness: adjust?.brightness ?? 100,
    contrast:   adjust?.contrast   ?? 100,
    saturate:   adjust?.saturate   ?? 100,
    hue:        adjust?.hue        ?? 0,
  };
  const cssFilter = `brightness(${adj.brightness}%) contrast(${adj.contrast}%) saturate(${adj.saturate}%) hue-rotate(${adj.hue}deg)`;
  const isAdjusted = adj.brightness !== 100 || adj.contrast !== 100 || adj.saturate !== 100 || adj.hue !== 0;

  // 메인사진 레이어 변경
  // onLayerAction이 지정되어 있으면 부모(P1Hero)의 정규화 시스템에 위임,
  // 아니면 단순 ±1 fallback (구버전 호환)
  const changeMainLayer = (action) => {
    if (typeof onLayerAction === 'function') {
      onLayerAction(action);
      return;
    }
    const cur = customZ ?? 1;
    let newZ = cur;
    if (action === 'forward') newZ = cur + 1;
    else if (action === 'backward') newZ = Math.max(1, cur - 1);
    else if (action === 'front') newZ = cur + 10;
    else if (action === 'back') newZ = 1;
    onChange({ zIndex: newZ });
  };

  // wrapper 초기 크기 측정
  useEffect(() => {
    if (!wrapperRef.current) return;
    const rect = wrapperRef.current.getBoundingClientRect();
    if (rect.width > 0 && naturalSize.w === 0) {
      let h = rect.width;
      try {
        const [aw, ah] = aspect.split('/').map((s) => parseFloat(s.trim()));
        if (aw && ah) h = (rect.width * ah) / aw;
      } catch {}
      setNaturalSize({ w: rect.width, h });
    }
  }, [aspect, naturalSize.w]);

  // 🆕 부모 컨테이너 실측 너비 추적 (ResizeObserver)
  // 모바일 미리보기처럼 부모 너비가 frame.width 보다 작을 때 비율대로 자동 축소하기 위함.
  useEffect(() => {
    const parent = wrapperRef.current?.parentElement;
    if (!parent) return;
    const update = () => {
      const w = parent.getBoundingClientRect().width || 0;
      setParentWidth((prev) => (Math.abs(prev - w) > 0.5 ? w : prev));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(parent);
    return () => ro.disconnect();
  }, []);

  // 이미지 원본 비율 측정
  const handleImgLoad = (e) => {
    const w = e.target.naturalWidth || 1;
    const h = e.target.naturalHeight || 1;
    setImgNatural({ w, h });
  };

  const getParentRect = () => wrapperRef.current?.parentElement?.getBoundingClientRect() || null;

  // 현재 박스 크기 (frame 우선, 없으면 wrapper)
  const boxW = frame ? frame.width : naturalSize.w;
  const boxH = frame ? frame.height : naturalSize.h;

  // 박스에 꽉 차는 cover 사이즈 (사진 원본 비율 유지)
  const cover = boxW > 0 && boxH > 0 ? coverSize(boxW, boxH, imgNatural.w, imgNatural.h) : { w: 0, h: 0 };

  // 현재 사진 표시 크기 = cover × scale (박스 변하면 같이 변함)
  const currentScale = Math.max(MIN_IMG_SCALE, crop?.scale ?? 1.0);
  const imgW = cover.w * currentScale;
  const imgH = cover.h * currentScale;

  // 오프셋: 박스 크기 대비 비율로 저장 → 박스 변경 시 자동 비례
  const offsetXR = crop?.offsetXR ?? 0;
  const offsetYR = crop?.offsetYR ?? 0;
  const offsetX = offsetXR * boxW;
  const offsetY = offsetYR * boxH;

  // ─── A모드: 프레임 리사이즈 ──────────────────────
  const handleResizeStart = (e, handleId) => {
    e.preventDefault();
    e.stopPropagation();
    if (!frameRef.current) return;
    const rect = frameRef.current.getBoundingClientRect();
    const w = frame?.width ?? rect.width;
    const h = frame?.height ?? rect.height;
    const fx = frame?.x ?? 0;
    const fy = frame?.y ?? 0;
    setResizing({
      handle: handleId,
      startX: e.clientX,
      startY: e.clientY,
      startW: w,
      startH: h,
      startFx: fx,
      startFy: fy,
      aspectRatio: w / h,
    });
  };

  useEffect(() => {
    if (!resizing) return;
    const onMove = (e) => {
      const dx = e.clientX - resizing.startX;
      const dy = e.clientY - resizing.startY;
      // 기본: 비율 잠금 ON / Shift: 자유 변형
      const ratioLock = !e.shiftKey;
      let { startW, startH, startFx, startFy } = resizing;
      let w = startW, h = startH, fx = startFx, fy = startFy;
      const ar = resizing.aspectRatio;
      const handle = resizing.handle;

      if (handle.includes('e')) w = startW + dx;
      if (handle.includes('w')) { w = startW - dx; fx = startFx + dx; }
      if (handle.includes('s')) h = startH + dy;
      if (handle.includes('n')) { h = startH - dy; fy = startFy + dy; }

      if (ratioLock) {
        if (handle === 'n' || handle === 's') w = h * ar;
        else if (handle === 'e' || handle === 'w') h = w / ar;
        else {
          // 코너 — 큰 변화량 우선
          if (Math.abs(dx) > Math.abs(dy)) h = w / ar;
          else w = h * ar;
        }
        // 비율 잠금 시 위/왼쪽 핸들이면 fx/fy 보정
        if (handle.includes('w') && (handle === 'nw' || handle === 'sw')) {
          fx = startFx + (startW - w);
        }
        if (handle.includes('n') && (handle === 'nw' || handle === 'ne')) {
          fy = startFy + (startH - h);
        }
        if (handle === 'n') fy = startFy + (startH - h);
        if (handle === 'w') fx = startFx + (startW - w);
      }

      w = Math.max(MIN_FRAME_SIZE, w);
      h = Math.max(MIN_FRAME_SIZE, h);

      // 스냅
      const parent = getParentRect();
      let snapV = null;
      if (parent && wrapperRef.current) {
        const wrapperRect = wrapperRef.current.getBoundingClientRect();
        const availRight = parent.right - wrapperRect.left;
        const wrapperCenter = parent.width / 2 - (wrapperRect.left - parent.left);
        if (Math.abs(fx - 0) < SNAP_THRESHOLD) { fx = 0; snapV = 'left'; }
        if (Math.abs(fx + w - availRight) < SNAP_THRESHOLD) {
          if (handle.includes('w')) fx = availRight - w;
          else w = availRight - fx;
          snapV = 'right';
        }
        if (Math.abs(fx + w / 2 - wrapperCenter) < SNAP_THRESHOLD) {
          fx = wrapperCenter - w / 2;
          snapV = 'center';
        }
      }
      setSnapLines({ v: snapV, h: null });

      onChange({
        frame: { width: Math.round(w), height: Math.round(h), x: Math.round(fx), y: Math.round(fy) },
      });
    };
    const onUp = () => { setResizing(null); setSnapLines({ v: null, h: null }); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [resizing, onChange]);

  // ─── A모드: 프레임 위치 이동 ──────────────────────
  const handleFrameDragStart = (e) => {
    if (mode === 'cropping') return;
    if (e.target.closest('[data-handle]')) return;
    if (e.target.closest('[data-toolbar]')) return;
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    setDraggingFrame({
      startX: e.clientX,
      startY: e.clientY,
      startFx: frame?.x ?? 0,
      startFy: frame?.y ?? 0,
    });
  };

  useEffect(() => {
    if (!draggingFrame) return;
    const onMove = (e) => {
      const dx = e.clientX - draggingFrame.startX;
      const dy = e.clientY - draggingFrame.startY;
      let nx = draggingFrame.startFx + dx;
      let ny = draggingFrame.startFy + dy;

      const parent = getParentRect();
      let snapV = null;
      if (parent && wrapperRef.current) {
        const wrapperRect = wrapperRef.current.getBoundingClientRect();
        const fw = frame?.width ?? naturalSize.w;
        const availRight = parent.right - wrapperRect.left;
        const wrapperCenter = parent.width / 2 - (wrapperRect.left - parent.left);
        if (Math.abs(nx) < SNAP_THRESHOLD) { nx = 0; snapV = 'left'; }
        if (Math.abs(nx + fw - availRight) < SNAP_THRESHOLD) { nx = availRight - fw; snapV = 'right'; }
        if (Math.abs(nx + fw / 2 - wrapperCenter) < SNAP_THRESHOLD) { nx = wrapperCenter - fw / 2; snapV = 'center'; }
      }
      setSnapLines({ v: snapV, h: null });

      onChange({
        frame: {
          width: frame?.width ?? naturalSize.w,
          height: frame?.height ?? naturalSize.h,
          x: Math.round(nx),
          y: Math.round(ny),
        },
      });
    };
    const onUp = () => { setDraggingFrame(null); setSnapLines({ v: null, h: null }); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [draggingFrame, frame, naturalSize, onChange]);

  // 오프셋 클램핑: 사진이 박스 밖으로 너무 나가서 빈 공간 생기지 않도록 제한
  // 사진 표시 크기(imgW/H)와 박스 크기(boxW/H) 차이의 절반까지만 이동 가능
  const clampOffset = (ox, oy, _imgW = imgW, _imgH = imgH, _boxW = boxW, _boxH = boxH) => {
    const maxOx = Math.max(0, (_imgW - _boxW) / 2);
    const maxOy = Math.max(0, (_imgH - _boxH) / 2);
    return {
      x: Math.max(-maxOx, Math.min(maxOx, ox)),
      y: Math.max(-maxOy, Math.min(maxOy, oy)),
    };
  };

  // ─── B모드: 크롭 (사진 이동) ──────────────────────
  const handleCropDragStart = (e) => {
    if (mode !== 'cropping') return;
    if (e.target.closest('[data-toolbar]')) return;
    e.preventDefault();
    e.stopPropagation();
    setDraggingCrop({
      startX: e.clientX,
      startY: e.clientY,
      startOx: offsetX,
      startOy: offsetY,
    });
  };

  useEffect(() => {
    if (!draggingCrop) return;
    const onMove = (e) => {
      const dx = e.clientX - draggingCrop.startX;
      const dy = e.clientY - draggingCrop.startY;
      const clamped = clampOffset(draggingCrop.startOx + dx, draggingCrop.startOy + dy);
      // px → 비율로 변환해서 저장
      const newXR = boxW > 0 ? clamped.x / boxW : 0;
      const newYR = boxH > 0 ? clamped.y / boxH : 0;
      onChange({
        crop: {
          scale: currentScale,
          offsetXR: newXR,
          offsetYR: newYR,
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
  }, [draggingCrop, boxW, boxH, currentScale, imgW, imgH, onChange]);

  // 휠 확대/축소 (Shift 키 필요 — 페이지 스크롤과 충돌 방지)
  const handleWheel = useCallback((e) => {
    if (mode !== 'cropping') return;
    if (!e.shiftKey) return;
    e.preventDefault();
    e.stopPropagation();
    const delta = e.deltaY > 0 ? -0.05 : 0.05;
    const newScale = Math.max(MIN_IMG_SCALE, Math.min(MAX_IMG_SCALE, currentScale + delta));
    // 새 스케일 기준으로 오프셋 재클램프
    const newImgW = cover.w * newScale;
    const newImgH = cover.h * newScale;
    const clamped = clampOffset(offsetX, offsetY, newImgW, newImgH, boxW, boxH);
    onChange({
      crop: {
        scale: newScale,
        offsetXR: boxW > 0 ? clamped.x / boxW : 0,
        offsetYR: boxH > 0 ? clamped.y / boxH : 0,
      },
    });
  }, [mode, currentScale, cover.w, cover.h, offsetX, offsetY, boxW, boxH, onChange]);

  // 슬라이더 onChange
  const handleScaleChange = (newScale) => {
    const newImgW = cover.w * newScale;
    const newImgH = cover.h * newScale;
    const clamped = clampOffset(offsetX, offsetY, newImgW, newImgH, boxW, boxH);
    onChange({
      crop: {
        scale: newScale,
        offsetXR: boxW > 0 ? clamped.x / boxW : 0,
        offsetYR: boxH > 0 ? clamped.y / boxH : 0,
      },
    });
  };

  // 더블클릭 → B모드 진입
  const handleDoubleClick = (e) => {
    if (!editMode) return;
    e.preventDefault();
    e.stopPropagation();
    setMode('cropping');
  };

  // ESC로 크롭 모드 탈출
  useEffect(() => {
    if (mode !== 'cropping') return;
    const onKey = (e) => {
      if (e.key === 'Escape') setMode('idle');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode]);

  // 비활성화될 때 색상/교체 패널 자동 닫기
  useEffect(() => {
    if (isActive === false) {
      setShowAdjust(false);
      setShowSwapPanel(false);
    }
  }, [isActive]);

  // ─── 편집모드 OFF: 단순 렌더 ──────────────────────
  if (!editMode) {
    const hasFrame = !!frame;
    // 🆕 모바일/미리보기 자동 적응:
    //  - frame.width 가 부모 너비보다 크면 → 비율 유지하며 축소 (모바일에서 잘림 방지)
    //  - frame.width 가 부모 너비보다 작으면 → 비율 유지하며 확장 (사진이 카드 가득 차도록)
    //  → 결과: 편집 OFF (미리보기/모바일/내보내기) 에서는 항상 부모 너비를 가득 채움
    //  사용자가 PC 편집모드에서 frame 으로 의도적으로 작게 만들었더라도, 미리보기에서는
    //  카드를 가득 채우는 게 시각적으로 더 자연스럽다.
    let scaleRatio = 1;
    if (hasFrame && parentWidth > 0 && frame.width > 0) {
      scaleRatio = parentWidth / frame.width;
    }
    const renderedW = hasFrame ? frame.width * scaleRatio : null;
    const renderedH = hasFrame ? frame.height * scaleRatio : null;
    const renderedX = hasFrame ? frame.x * scaleRatio : 0;
    const renderedY = hasFrame ? frame.y * scaleRatio : 0;
    const shrinkRatio = scaleRatio; // 아래 img 스타일에서 사용
    return (
      <div
        ref={wrapperRef}
        style={{
          position: 'relative',
          width: '100%',
          aspectRatio: hasFrame ? undefined : aspect,
          minHeight: hasFrame
            ? renderedH + Math.max(0, renderedY) + 20 * shrinkRatio
            : undefined,
          zIndex: customZ ?? 1,
          pointerEvents: hasFrame ? 'none' : 'auto',
        }}
      >
        <div
          style={{
            position: hasFrame ? 'absolute' : 'relative',
            left: hasFrame ? renderedX : 0,
            top: hasFrame ? renderedY : 0,
            width: hasFrame ? renderedW : '100%',
            height: hasFrame ? renderedH : undefined,
            aspectRatio: hasFrame ? undefined : aspect,
            backgroundColor: '#e8e5e1',
            borderRadius: radius,
            overflow: 'hidden',
            zIndex: override?.zIndex || 'auto',
            pointerEvents: 'auto',
          }}
        >
          <img
            ref={imgRef}
            src={currentSrc || fallbackImg}
            alt={alt}
            crossOrigin="anonymous"
            draggable={false}
            onLoad={handleImgLoad}
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              width: imgW > 0 ? imgW * shrinkRatio : '100%',
              height: imgH > 0 ? imgH * shrinkRatio : '100%',
              maxWidth: 'none',
              transform: `translate(calc(-50% + ${offsetX * shrinkRatio}px), calc(-50% + ${offsetY * shrinkRatio}px))`,
              objectFit: 'cover',
              display: 'block',
              userSelect: 'none',
              filter: cssFilter,
            }}
          />
        </div>
      </div>
    );
  }

  // ─── 편집모드 ON ──────────────────────────────────────────
  const hasFrame = !!frame;
  const fw = hasFrame ? frame.width : naturalSize.w || 0;
  const fh = hasFrame ? frame.height : naturalSize.h || 0;
  const fx = hasFrame ? frame.x : 0;
  const fy = hasFrame ? frame.y : 0;
  const wrapperMinHeight = hasFrame ? frame.height + Math.max(0, frame.y) + 20 : (naturalSize.h || undefined);

  // 핸들/툴바/사이즈 표시 가시성 — isActive 명시 시 hovering 변동 무시(깜빡임 방지)
  const showUI = mode === 'idle' && (
    isActive === true
      ? true
      : isActive === null
        ? (hovering || resizing || draggingFrame)
        : false
  );

  return (
    <div
      ref={wrapperRef}
      style={{
        position: 'relative',
        width: '100%',
        aspectRatio: hasFrame ? undefined : aspect,
        minHeight: wrapperMinHeight,
        zIndex: customZ ?? 1,
        // wrapper는 frame 바깥(빈 여백)에서 클릭을 통과시켜
        // 뒤에 깔린 자유이미지가 선택될 수 있게 한다.
        pointerEvents: hasFrame ? 'none' : 'auto',
      }}
    >
      {/* 프레임 박스 */}
      <div
        ref={frameRef}
        data-edit-image="true"
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        onMouseDown={(e) => {
          if (editMode && typeof onActivate === 'function') {
            // 현재 표시 중인 실제 이미지 src 를 콜백에 전달 (AI 합성 등에서 활용)
            const currentSrc = override?.src || src || null;
            onActivate(currentSrc);
          }
          handleFrameDragStart(e);
        }}
        onDoubleClick={handleDoubleClick}
        onWheel={handleWheel}
        style={{
          position: hasFrame ? 'absolute' : 'relative',
          left: fx,
          top: fy,
          width: hasFrame ? fw : '100%',
          height: hasFrame ? fh : undefined,
          aspectRatio: hasFrame ? undefined : aspect,
          backgroundColor: '#e8e5e1',
          borderRadius: radius,
          overflow: 'hidden',
          outline:
            mode === 'cropping'
              ? '2px solid #f97316'
              : (isActive === true
                  ? '2px solid #3b82f6'
                  : isActive === false
                    ? 'none'
                    : (hovering || resizing || draggingFrame
                        ? '2px dashed #3b82f6'
                        : '1px dashed rgba(96,165,250,0.45)')),
          outlineOffset: 2,
          cursor:
            mode === 'cropping'
              ? draggingCrop ? 'grabbing' : 'grab'
              : draggingFrame ? 'grabbing' : 'move',
          userSelect: 'none',
          zIndex: override?.zIndex || 'auto',
          transition: 'none',
          // 항상 클릭 가능 — 레이어 순서(z-index)에 따라 위에 있는 이미지가 잡힌다.
          // (정렬 버튼 ▲▼으로 원하는 이미지를 위로 올려서 선택)
          pointerEvents: 'auto',
        }}
      >
        <img
          ref={imgRef}
          src={currentSrc || fallbackImg}
          alt={alt}
          crossOrigin="anonymous"
          draggable={false}
          onLoad={handleImgLoad}
          onMouseDown={mode === 'cropping' ? handleCropDragStart : undefined}
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: imgW > 0 ? imgW : '100%',
            height: imgH > 0 ? imgH : '100%',
            maxWidth: 'none',
            transform: `translate(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px))`,
            objectFit: 'cover',
            display: 'block',
            userSelect: 'none',
            pointerEvents: mode === 'cropping' ? 'auto' : 'none',
            filter: cssFilter,
          }}
        />

        {mode === 'cropping' && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              border: '2px dashed rgba(255,255,255,0.6)',
              pointerEvents: 'none',
            }}
          />
        )}
      </div>

      {/* A모드 핸들 — isActive 명시되면 활성일 때만 표시 */}
      {showUI &&
        HANDLES.map((h) => {
          const style = {
            position: 'absolute',
            width: 12,
            height: 12,
            backgroundColor: '#3b82f6',
            border: '2px solid #fff',
            borderRadius: 3,
            boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
            cursor: h.cursor,
            zIndex: 20,
            pointerEvents: 'auto',
          };
          // 좌표 계산
          if (typeof h.left === 'number') style.left = fx + h.left;
          else if (h.left === '50%') style.left = fx + (fw / 2) - 6;
          if (h.right !== undefined) style.left = fx + fw + h.right - 6;
          if (typeof h.top === 'number') style.top = fy + h.top;
          else if (h.top === '50%') style.top = fy + (fh / 2) - 6;
          if (h.bottom !== undefined) style.top = fy + fh + h.bottom - 6;

          return (
            <div
              key={h.id}
              data-handle
              onMouseDown={(e) => handleResizeStart(e, h.id)}
              title={`드래그=비율유지 / Shift+드래그=자유변형 (${h.id})`}
              style={style}
            />
          );
        })}

      {/* 좌상단 툴바 (idle) — InlineFreeImage 와 동일한 압축 디자인 (아이콘 위주) */}
      {showUI && (
        <div
          data-toolbar
          style={{
            position: 'absolute',
            left: fx,
            top: fy - 42,
            display: 'flex',
            gap: 6,
            alignItems: 'center',
            backgroundColor: '#1e293b',
            padding: '6px 10px',
            borderRadius: 8,
            boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
            zIndex: 30,
            whiteSpace: 'nowrap',
            pointerEvents: 'auto',
          }}
        >
          {/* 🔍 크롭 */}
          <button
            onClick={(e) => { e.stopPropagation(); setMode('cropping'); }}
            onMouseDown={(e) => e.stopPropagation()}
            title="크롭 모드 (사진 안쪽만 조정) — 더블클릭으로도 진입"
            style={toolbarBtnStyle('#3b82f6')}
          >🔍 크롭</button>
          <span style={{ width: 1, height: 18, backgroundColor: '#475569' }} />

          {/* 레이어 순서 — 압축형 아이콘 */}
          <button
            onClick={(e) => { e.stopPropagation(); changeMainLayer('front'); }}
            onMouseDown={(e) => e.stopPropagation()}
            style={toolbarIconStyle('#475569')} title="맨 앞으로"
          >▲▲</button>
          <button
            onClick={(e) => { e.stopPropagation(); changeMainLayer('forward'); }}
            onMouseDown={(e) => e.stopPropagation()}
            style={toolbarIconStyle('#64748b')} title="한 단계 앞으로"
          >▲</button>
          <button
            onClick={(e) => { e.stopPropagation(); changeMainLayer('backward'); }}
            onMouseDown={(e) => e.stopPropagation()}
            style={toolbarIconStyle('#64748b')} title="한 단계 뒤로"
          >▼</button>
          <button
            onClick={(e) => { e.stopPropagation(); changeMainLayer('back'); }}
            onMouseDown={(e) => e.stopPropagation()}
            style={toolbarIconStyle('#475569')} title="맨 뒤로"
          >▼▼</button>
          <span style={{
            backgroundColor: '#fbbf24', color: '#1e293b',
            padding: '2px 5px', borderRadius: 4,
            fontSize: 9, fontWeight: 900,
          }}>z{customZ ?? 1}</span>
          <span style={{ width: 1, height: 18, backgroundColor: '#475569' }} />

          {/* 🎨 색상 — InlineFreeImage 와 동일 */}
          <button
            onClick={(e) => { e.stopPropagation(); setShowAdjust((s) => !s); setShowSwapPanel(false); }}
            onMouseDown={(e) => e.stopPropagation()}
            style={toolbarBtnStyle(showAdjust ? '#7c3aed' : (isAdjusted ? '#a855f7' : '#475569'))}
            title="색상·밝기·채도 조정"
          >🎨 색상{isAdjusted ? ' •' : ''}</button>
          <span style={{ width: 1, height: 18, backgroundColor: '#475569' }} />

          {/* ↺ 리셋 — 프레임/크롭/사진 모두 한번에 */}
          {(hasFrame || crop || override?.src) && (
            <>
              {hasFrame && (
                <button
                  onClick={(e) => { e.stopPropagation(); onChange({ frame: null }); }}
                  onMouseDown={(e) => e.stopPropagation()}
                  title="프레임 크기/위치 초기화"
                  style={toolbarIconStyle('#7c2d12')}
                >↺📐</button>
              )}
              {crop && (
                <button
                  onClick={(e) => { e.stopPropagation(); onChange({ crop: null }); }}
                  onMouseDown={(e) => e.stopPropagation()}
                  title="크롭 초기화"
                  style={toolbarIconStyle('#7c2d12')}
                >↺🔍</button>
              )}
              {override?.src && (
                <button
                  onClick={(e) => { e.stopPropagation(); onChange({ src: null, crop: null }); }}
                  onMouseDown={(e) => e.stopPropagation()}
                  title="원본 사진으로 복원"
                  style={toolbarIconStyle('#7c2d12')}
                >↺🖼</button>
              )}
            </>
          )}
        </div>
      )}

      {/* 🎨 색상 조정 패널 — idle + showAdjust ON */}
      {showUI && showAdjust && (
        <div
          data-toolbar
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            left: fx,
            top: fy + 8,
            width: 280,
            backgroundColor: '#fff',
            border: '1px solid #e2ddd4',
            borderRadius: 10,
            boxShadow: '0 12px 30px rgba(0,0,0,0.22)',
            padding: 12,
            zIndex: 50,
            pointerEvents: 'auto',
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
          <AdjustSlider label="🌞 밝기" unit="%" min={0} max={200} step={1}
            value={adj.brightness} defaultValue={100} color="#f59e0b"
            onChange={(v) => onChange({ adjust: { ...adj, brightness: v } })} />
          <AdjustSlider label="◐ 대비" unit="%" min={0} max={200} step={1}
            value={adj.contrast} defaultValue={100} color="#475569"
            onChange={(v) => onChange({ adjust: { ...adj, contrast: v } })} />
          <AdjustSlider label="🎨 채도" unit="%" min={0} max={200} step={1}
            value={adj.saturate} defaultValue={100} color="#ec4899"
            onChange={(v) => onChange({ adjust: { ...adj, saturate: v } })} />
          <AdjustSlider label="🌈 색조" unit="°" min={-180} max={180} step={1}
            value={adj.hue} defaultValue={0} color="#8b5cf6"
            onChange={(v) => onChange({ adjust: { ...adj, hue: v } })} />

          <div style={{ marginTop: 6, fontSize: 10, fontWeight: 700, color: '#64748b' }}>✨ 프리셋</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4, marginTop: 4 }}>
            <PresetBtn label="원본" onClick={() => onChange({ adjust: null })} />
            <PresetBtn label="선명" onClick={() => onChange({ adjust: { brightness: 105, contrast: 115, saturate: 120, hue: 0 } })} />
            <PresetBtn label="밝게" onClick={() => onChange({ adjust: { brightness: 120, contrast: 100, saturate: 105, hue: 0 } })} />
            <PresetBtn label="어둡게" onClick={() => onChange({ adjust: { brightness: 85, contrast: 110, saturate: 100, hue: 0 } })} />
            <PresetBtn label="흑백" onClick={() => onChange({ adjust: { brightness: 100, contrast: 110, saturate: 0, hue: 0 } })} />
            <PresetBtn label="따뜻" onClick={() => onChange({ adjust: { brightness: 105, contrast: 100, saturate: 115, hue: -10 } })} />
            <PresetBtn label="차갑" onClick={() => onChange({ adjust: { brightness: 100, contrast: 100, saturate: 110, hue: 15 } })} />
            <PresetBtn label="빈티지" onClick={() => onChange({ adjust: { brightness: 95, contrast: 90, saturate: 80, hue: 10 } })} />
            <PresetBtn label="비비드" onClick={() => onChange({ adjust: { brightness: 100, contrast: 120, saturate: 145, hue: 0 } })} />
          </div>
        </div>
      )}

      {/* 크기 표시 */}
      {showUI && hasFrame && (
        <div
          style={{
            position: 'absolute',
            left: fx + fw - 90,
            top: fy + 6,
            backgroundColor: 'rgba(30, 41, 59, 0.85)',
            color: '#fff',
            padding: '3px 6px',
            borderRadius: 4,
            fontSize: 10,
            fontWeight: 800,
            zIndex: 30,
            pointerEvents: 'none',
          }}
        >
          {Math.round(fw)} × {Math.round(fh)}
        </div>
      )}

      {/* B모드 툴바 */}
      {mode === 'cropping' && (
        <div
          data-toolbar
          style={{
            position: 'absolute',
            left: fx,
            top: fy - 50,
            display: 'flex',
            gap: 6,
            alignItems: 'center',
            backgroundColor: '#1e293b',
            padding: '8px 12px',
            borderRadius: 8,
            boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
            zIndex: 40,
            pointerEvents: 'auto',
          }}
        >
          <span style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>확대:</span>
          <input
            type="range"
            min={MIN_IMG_SCALE}
            max={MAX_IMG_SCALE}
            step="0.05"
            value={currentScale}
            onChange={(e) => handleScaleChange(parseFloat(e.target.value))}
            style={{ width: 130, accentColor: '#f97316' }}
            onMouseDown={(e) => e.stopPropagation()}
          />
          <span style={{ color: '#fff', fontSize: 11, fontWeight: 700, minWidth: 40 }}>
            {Math.round(currentScale * 100)}%
          </span>
          <div style={{ width: 1, height: 18, backgroundColor: '#475569' }} />
          {availableImages.length > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); setShowSwapPanel((v) => !v); }}
              title="다른 사진으로 교체"
              style={toolbarBtnStyle('#0ea5e9')}
            >
              🔄 사진 교체
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onChange({ crop: null }); }}
            title="크롭 초기화 (사진 위치/확대만 리셋, 교체된 사진은 유지)"
            style={toolbarBtnStyle('#7c2d12')}
          >
            ↺ 크롭만
          </button>
          {override?.src && (
            <button
              onClick={(e) => { e.stopPropagation(); onChange({ src: null, crop: null }); }}
              title="원본 사진으로 복원 (사진 교체 + 크롭 모두 리셋)"
              style={toolbarBtnStyle('#dc2626')}
            >
              ↺ 사진 원본
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); setMode('idle'); setShowSwapPanel(false); }}
            title="크롭 모드 종료 (ESC)"
            style={toolbarBtnStyle('#16a34a')}
          >
            ✓ 완료
          </button>
        </div>
      )}

      {/* 사진 교체 패널 — 자유사진과 통일된 흰 배경 카드 스타일 */}
      {mode === 'cropping' && showSwapPanel && (
        <div
          data-toolbar
          style={{
            position: 'absolute',
            left: fx,
            top: fy - 8,                   // 툴바 바로 아래
            width: 280,
            maxHeight: 360,
            overflowY: 'auto',
            backgroundColor: '#fff',
            border: '1px solid #e2ddd4',
            borderRadius: 10,
            boxShadow: '0 12px 30px rgba(0,0,0,0.22)',
            padding: 12,
            zIndex: 50,
            pointerEvents: 'auto',
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {/* 헤더 */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#2F2A26' }}>🔄 사진 교체</div>
            <button
              onClick={(e) => { e.stopPropagation(); setShowSwapPanel(false); }}
              style={{ border: 'none', background: 'transparent', color: '#64748b', fontSize: 14, cursor: 'pointer' }}
            >✕</button>
          </div>

          {/* 파일 업로드 */}
          <label
            style={{
              display: 'block', border: '2px dashed #93c5fd', backgroundColor: '#eff6ff',
              borderRadius: 8, padding: '10px 8px', textAlign: 'center', fontSize: 11,
              fontWeight: 700, color: '#1d4ed8', cursor: 'pointer', marginBottom: 8,
            }}
          >
            ⬆️ 내 컴퓨터에서 업로드
            <input
              type="file" accept="image/*" style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (ev) => {
                  if (ev.target?.result) {
                    onChange({ src: ev.target.result, crop: null });
                    setShowSwapPanel(false);
                  }
                };
                reader.readAsDataURL(file);
                e.target.value = '';
              }}
            />
          </label>

          <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', marginBottom: 4 }}>
            또는 갤러리에서 선택 ({availableImages.length}장)
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 5 }}>
            {availableImages.map((imgUrl, i) => (
              <button
                key={i}
                onClick={(e) => {
                  e.stopPropagation();
                  onChange({ src: imgUrl, crop: null });
                  setShowSwapPanel(false);
                }}
                style={{
                  border: imgUrl === currentSrc ? '2px solid #3b82f6' : '1px solid #e2ddd4',
                  borderRadius: 6, padding: 0, overflow: 'hidden', cursor: 'pointer',
                  aspectRatio: '1 / 1', backgroundColor: '#f3f4f6',
                }}
                title={`사진 ${i + 1}로 교체`}
              >
                <img
                  src={imgUrl}
                  alt=""
                  crossOrigin="anonymous"
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 스냅 가이드라인 */}
      {snapLines.v && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left:
              snapLines.v === 'left' ? fx :
              snapLines.v === 'right' ? fx + fw :
              fx + fw / 2,
            width: 1,
            backgroundColor: '#ec4899',
            pointerEvents: 'none',
            zIndex: 50,
          }}
        />
      )}
    </div>
  );
}

function toolbarBtnStyle(color) {
  return {
    backgroundColor: color,
    color: '#fff',
    border: 'none',
    padding: '5px 10px',
    borderRadius: 5,
    fontSize: 11,
    fontWeight: 800,
    cursor: 'pointer',
    boxShadow: '0 2px 4px rgba(0,0,0,0.15)',
    whiteSpace: 'nowrap',
  };
}

// 아이콘 전용 (압축형) — InlineFreeImage 와 동일
function toolbarIconStyle(color) {
  return {
    backgroundColor: color,
    color: '#fff',
    border: 'none',
    padding: '5px 7px',
    borderRadius: 4,
    fontSize: 11,
    fontWeight: 800,
    cursor: 'pointer',
    boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
    minWidth: 24,
    lineHeight: 1.1,
    whiteSpace: 'nowrap',
  };
}

// 색상 조정용 슬라이더
function AdjustSlider({ label, unit, min, max, step, value, defaultValue, onChange, color }) {
  const isMod = value !== defaultValue;
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#374151' }}>{label}</span>
        <button onClick={() => onChange(defaultValue)}
          style={{ border: 'none', background: 'transparent', color: isMod ? color : '#9ca3af',
                   fontSize: 10, fontWeight: 700, cursor: 'pointer' }}
          title="더블클릭으로 리셋">
          {value}{unit}{isMod ? ' ↺' : ''}
        </button>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        onDoubleClick={() => onChange(defaultValue)}
        style={{ width: '100%', accentColor: color }} />
    </div>
  );
}

// 색상 프리셋 버튼
function PresetBtn({ label, onClick }) {
  return (
    <button onClick={onClick}
      style={{
        padding: '5px 4px', backgroundColor: '#f3f4f6',
        color: '#374151', border: '1px solid #e5e7eb',
        borderRadius: 4, fontSize: 10, fontWeight: 700,
        cursor: 'pointer',
      }}>
      {label}
    </button>
  );
}
