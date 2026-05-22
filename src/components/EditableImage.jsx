import { useEffect, useRef, useState, useCallback } from 'react';
import { announceEditorSelection, useEditorSelectionListener } from '../lib/editorSelection.js';

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
  // 🆕 (2026-04-28) 외부에서 추가로 적용할 CSS filter 문자열
  //   예: 'grayscale(100%) blur(3px)' — 이미지 element 에만 적용되고 툴바/핸들엔 영향 없음
  //   기존 색상 조정용 cssFilter 와 합쳐져 적용됨
  extraFilter = '',
}) {
  const wrapperRef = useRef(null);
  const frameRef = useRef(null);
  const imgRef = useRef(null);
  const hostStackRef = useRef(null);
  const hostPrevZRef = useRef('');
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
  // 🆕 (2026-04-28) extraFilter 가 있으면 색상 조정 필터와 합쳐서 적용
  //   순서: 색상 조정 → 추가 필터 (grayscale/blur 등이 가장 마지막에 와야 의도대로 작동)
  const combinedFilter = extraFilter ? `${cssFilter} ${extraFilter}` : cssFilter;
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
  // 🐛 (2026-04-28) FIX: getBoundingClientRect() 는 transform 적용 후의 크기를 반환하므로,
  //   부모가 `transform: scale(0.46)` 인 모바일 미리보기에서 박스가 절반으로 측정되어
  //   <img> width/height 가 작게 박혀서 컨테이너 안에서 작아 보이는 문제가 있었음.
  //   → offsetWidth/offsetHeight (transform 무시, 레이아웃 크기) 로 변경.
  useEffect(() => {
    if (!wrapperRef.current) return;
    const el = wrapperRef.current;
    const layoutW = el.offsetWidth || el.getBoundingClientRect().width;
    if (layoutW > 0 && naturalSize.w === 0) {
      let h = layoutW;
      try {
        const [aw, ah] = aspect.split('/').map((s) => parseFloat(s.trim()));
        if (aw && ah) h = (layoutW * ah) / aw;
      } catch {}
      setNaturalSize({ w: layoutW, h });
    }
  }, [aspect, naturalSize.w]);

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
    // 🆕 (2026-05-03) 리사이즈 시작 시점의 사진 절대 크기/오프셋 기억
    // → Shift 단방향 리사이즈 시 사진 위치/크기를 유지하기 위해 사용
    const startCover = coverSize(w, h, imgNatural.w, imgNatural.h);
    const startScale = crop?.scale ?? 1.0;
    const startOffsetXR = crop?.offsetXR ?? 0;
    const startOffsetYR = crop?.offsetYR ?? 0;
    setResizing({
      handle: handleId,
      startX: e.clientX,
      startY: e.clientY,
      startW: w,
      startH: h,
      startFx: fx,
      startFy: fy,
      aspectRatio: w / h,
      // 🆕 사진 절대 크기/위치 보존용
      startImgW: startCover.w * startScale,
      startImgH: startCover.h * startScale,
      startScale,
      startOffsetXR,
      startOffsetYR,
      startOffsetX: startOffsetXR * w,  // 절대 px 오프셋
      startOffsetY: startOffsetYR * h,
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

      // 🆕 (2026-05-03) Shift(자유 변형) 리사이즈 시 사진 절대 크기/위치 유지
      // → 박스만 줄이고 내부 사진은 그대로 둠 (초점/위치 보존)
      // ratioLock=true(기본 비율 유지)일 때는 cover가 박스에 맞춰 자연스럽게
      // 변하므로 보정 불필요 (기존 동작 유지)
      const update = {
        frame: { width: Math.round(w), height: Math.round(h), x: Math.round(fx), y: Math.round(fy) },
      };
      if (!ratioLock) {
        // 🆕 (2026-05-03) Shift 단방향 리사이즈 — 사진 절대 크기/위치 완전 고정
        // 이미지의 화면상 위치(left, top)와 크기(width, height)를 그대로 유지
        //
        // 사진 화면상 left = (boxW - imgW)/2 + offsetX
        // 사진 화면상 top  = (boxH - imgH)/2 + offsetY
        // 사진 width = cover.w * scale = startImgW (유지)
        // 사진 height= cover.h * scale = startImgH (유지)
        const newCover = coverSize(w, h, imgNatural.w, imgNatural.h);
        if (newCover.w > 0 && newCover.h > 0) {
          // cover는 종횡비(natW/natH)가 동일하므로 한 축 기준 scale이면 양 축 모두 비례 유지됨
          // → 가로 기준으로만 스케일 산출 (cover.w*scale == startImgW)
          const newScale = resizing.startImgW / newCover.w;
          // 새 사진 절대 크기 (이론상 startImgW/H와 동일하지만 부동소수점 오차 방지)
          const newImgW = newCover.w * newScale;
          const newImgH = newCover.h * newScale;
          // 기존 사진의 절대 left/top (박스 좌상단 기준 px)
          const oldImgLeft = (resizing.startW - resizing.startImgW) / 2 + resizing.startOffsetX;
          const oldImgTop  = (resizing.startH - resizing.startImgH) / 2 + resizing.startOffsetY;
          // 새 박스에서 사진 left/top을 그대로 유지하려면 offset을 다시 계산
          const newOffsetX = oldImgLeft - (w - newImgW) / 2;
          const newOffsetY = oldImgTop  - (h - newImgH) / 2;
          // 비율로 변환 (저장은 R 형식)
          const newOffsetXR = w > 0 ? newOffsetX / w : 0;
          const newOffsetYR = h > 0 ? newOffsetY / h : 0;
          update.crop = {
            scale: newScale,
            offsetXR: newOffsetXR,
            offsetYR: newOffsetYR,
          };
        }
      }
      onChange(update);
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
    // ⚠️ Fix #18: e.preventDefault() 제거 — dblclick 발화 보장
    //   mousedown에서 preventDefault()를 호출하면 브라우저가 dblclick 이벤트를
    //   발화하지 않아 크롭 모드 진입(handleDoubleClick → setMode('cropping'))이
    //   완전히 차단됨. FreeImage.jsx도 동일한 이유로 이미 제거되어 있음.
    //   드래그(setDraggingFrame)는 mousemove/mouseup으로 제어하므로 영향 없음.
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

  // 🆕 다른 요소가 활성화되면 자기 조정/교체 패널 + hover 상태 닫기
  // ⚠️ editMode=false(모바일 미리보기 인스턴스)는 리스너 등록 안 함
  //    — split 모드에서 같은 id로 두 인스턴스가 렌더링될 때
  //      모바일쪽이 PC쪽 announce를 받아 closeOnOtherSelect → setMode('idle') 로
  //      크롭/툴바가 꺼지는 버그 방지
  const closeOnOtherSelect = useCallback(() => {
    setShowAdjust(false);
    setShowSwapPanel(false);
    setHovering(false);
    setMode('idle');
  }, []);
  useEditorSelectionListener(editMode ? `edit-image:${id}` : null, closeOnOtherSelect);

  // 핸들/툴바/사이즈 표시 가시성 — isActive 명시 시 hovering 변동 무시(깜빡임 방지)
  // ⚠️ Hook 규칙을 위해 editMode 분기 전에 계산/등록한다.
  const showUI = mode === 'idle' && (
    isActive === true
      ? true
      : isActive === null
        ? (hovering || resizing || draggingFrame)
        : false
  );

  // 툴바/핸들 표시 중에는 wrapper 자체를 최상단으로 올려
  // 페이지 내부의 다른 셀/사진(popout 포함) 뒤로 툴바가 숨지 않게 한다.
  const overlayActive = editMode && (showUI || mode === 'cropping' || showSwapPanel || showAdjust || resizing || draggingFrame || draggingCrop);
  const wrapperZ = overlayActive ? 100500 : (customZ ?? 1);

  // 같은 grid/cell 스택 컨텍스트에 묶여 있으면 wrapper z-index만 올려도
  // 이웃 셀이 위에 그려질 수 있으므로, 활성 편집 중에는 호스트 셀도 함께 승격.
  // ⚠️ editMode 분기와 무관하게 항상 같은 순서로 Hook 호출.
  useEffect(() => {
    const host =
      wrapperRef.current?.closest('[data-edit-image-host="true"]') ||
      wrapperRef.current?.parentElement;

    if (!overlayActive || !host) {
      if (hostStackRef.current) {
        hostStackRef.current.style.zIndex = hostPrevZRef.current;
        hostStackRef.current = null;
        hostPrevZRef.current = '';
      }
      return undefined;
    }

    if (hostStackRef.current && hostStackRef.current !== host) {
      hostStackRef.current.style.zIndex = hostPrevZRef.current;
    }
    if (hostStackRef.current !== host) {
      hostStackRef.current = host;
      hostPrevZRef.current = host.style.zIndex || '';
    }
    host.style.zIndex = '100500';

    return () => {
      if (hostStackRef.current === host) {
        host.style.zIndex = hostPrevZRef.current;
        hostStackRef.current = null;
        hostPrevZRef.current = '';
      }
    };
  }, [overlayActive]);

  // ⌨️ 화살표 미세 이동 — 활성 이미지를 1px(Shift=10px) 단위로 이동
  useEffect(() => {
    if (!editMode) return undefined;
    if (isActive !== true) return undefined;

    const handleKeydown = (e) => {
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
      if (e.metaKey || e.ctrlKey) return;

      const activeEl = document.activeElement;
      const tag = (activeEl?.tagName || '').toLowerCase();
      const isTypingTarget =
        !!activeEl?.isContentEditable ||
        tag === 'input' ||
        tag === 'textarea' ||
        tag === 'select' ||
        tag === 'button';
      if (isTypingTarget) return;

      e.preventDefault();
      e.stopPropagation();

      const step = e.shiftKey ? 10 : 1;
      const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
      const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;

      const fallbackW = frameRef.current?.offsetWidth || naturalSize.w || 0;
      const fallbackH = frameRef.current?.offsetHeight || naturalSize.h || 0;
      if (!fallbackW || !fallbackH) return;

      const width = Math.round(frame?.width ?? fallbackW);
      const height = Math.round(frame?.height ?? fallbackH);
      const x = Math.round((frame?.x ?? 0) + dx);
      const y = Math.round((frame?.y ?? 0) + dy);

      onChange({ frame: { width, height, x, y } });
    };

    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [editMode, isActive, frame, naturalSize.w, naturalSize.h, onChange]);

  // ─── 편집모드 OFF: 단순 렌더 ──────────────────────
  if (!editMode) {
    const hasFrame = !!frame;
    return (
      <div
        ref={wrapperRef}
        style={{
          position: 'relative',
          width: '100%',
          aspectRatio: hasFrame ? undefined : aspect,
          minHeight: hasFrame ? frame.height + Math.max(0, frame.y) + 20 : undefined,
          zIndex: customZ ?? 1,
          pointerEvents: hasFrame ? 'none' : 'auto',
        }}
      >
        <div
          style={{
            position: hasFrame ? 'absolute' : 'relative',
            left: hasFrame ? frame.x : 0,
            top: hasFrame ? frame.y : 0,
            width: hasFrame ? frame.width : '100%',
            height: hasFrame ? frame.height : undefined,
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
              width: imgW > 0 ? imgW : '100%',
              height: imgH > 0 ? imgH : '100%',
              maxWidth: 'none',
              transform: `translate(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px))`,
              objectFit: 'cover',
              display: 'block',
              userSelect: 'none',
              filter: combinedFilter,
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

  return (
    <div
      ref={wrapperRef}
      style={{
        position: 'relative',
        width: '100%',
        aspectRatio: hasFrame ? undefined : aspect,
        minHeight: wrapperMinHeight,
        zIndex: wrapperZ,
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
          // ⚠️ 크롭 모드 중에는 frameRef.onMouseDown 전체를 건너뜀
          //   - 툴바/슬라이더 클릭이 frameRef까지 버블링되면
          //     onActivate() → activeLayerId 변경 → re-render → mode='idle' 체인 발동
          //   - data-toolbar closest 체크만으로는 <input type=range> 등
          //     shadow DOM 요소나 top:-50 hit-test 엣지 케이스를 완전히 막지 못함
          //   - 크롭 중 frameRef 자체 클릭(사진 드래그)은 img.onMouseDown이 처리하므로
          //     frameRef.onMouseDown은 크롭 중 불필요
          if (mode === 'cropping') return;
          if (e.target.closest('[data-toolbar]')) return;
          if (editMode && typeof onActivate === 'function') {
            const currentSrc = override?.src || src || null;
            onActivate(currentSrc);
          }
          if (editMode) announceEditorSelection(`edit-image:${id}`);
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
          // overflow:hidden 은 항상 유지 — borderRadius(원형 클립 등) 작동에 필수
          // 툴바는 wrapperRef 레벨에 absolute 배치되므로 frameRef overflow 영향 없음
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
            filter: combinedFilter,
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
            zIndex: 100001,
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
            zIndex: 100002,
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
          data-edit-ui="size-label"
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
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
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
            zIndex: 100001,
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
            onMouseDown={(e) => { e.stopPropagation(); e.nativeEvent?.stopImmediatePropagation?.(); }}
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
            zIndex: 100002,
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
