import { useState } from 'react';
import { BRAND } from '../../lib/theme.js';
import { PageFrame, Img, CheckIcon } from './Shared.jsx';
import EditableText from '../EditableText.jsx';
import EditableImage from '../EditableImage.jsx';
import FreeImage from '../FreeImage.jsx';

// P1: 메인 히어로 + 강점 카드 3개
// editMode / overrides / onOverrideChange: 인라인 편집 지원
export default function P1Hero({
  copy = {},
  image,
  allImages = [],
  variant = 0,
  editMode = false,
  overrides = {},
  onOverrideChange = () => {},
  imageOverrides = {},
  onImageOverrideChange = () => {},
  freeImages = [],
  onAddFreeImage = () => {},
  onUpdateFreeImage = () => {},
  onDeleteFreeImage = () => {},
  onChangeLayer = () => {},
  onChangeLayerKind = null, // (kind, id, action, mainLayers) => void
  onReorderLayers = () => {},
  layerNames = {},
  onSetLayerName = () => {},
  activeLayerId = null,
  onSetActiveLayer = () => {},
}) {
  const {
    mainHeadline = '제품의 핵심을 한 줄로',
    subHeadline = '',
    strengthCards = [],
    trustLine = '',
  } = copy;

  // variant에 따라 체크 아이콘 모양 변경 (다시 생성할 때마다 다른 모양)
  const checkVariant = variant;

  // EditableText용 공통 props 헬퍼
  const editPropsFor = (id) => ({
    id,
    editMode,
    override: overrides[id] || {},
    onChange: (partial) => onOverrideChange(id, partial),
  });

  // 사진 추가 패널 (썸네일 그리드 + 파일 업로드)
  const [showPicker, setShowPicker] = useState(false);
  // 레이어 패널 표시
  const [showLayers, setShowLayers] = useState(false);
  // 드래그앤드롭 상태 (레이어 패널)
  const [dragIdx, setDragIdx] = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);
  // 이름 편집 중인 레이어 ID
  const [editingNameId, setEditingNameId] = useState(null);
  const [editingNameVal, setEditingNameVal] = useState('');
  const validImages = (allImages || []).filter(Boolean);

  // P1의 메인 레이어 정의 — 다른 페이지에서 재활용 시 변경 가능
  const MAIN_LAYERS = [{ id: 'P1.heroImage', defaultName: '🖼 메인 사진', defaultZ: 1 }];

  // 메인사진의 z-index (override가 없으면 기본 1)
  const mainZ = imageOverrides['P1.heroImage']?.zIndex ?? 1;

  // 모든 레이어 통합 목록 (z-index 내림차순 = 위에서 아래)
  // 1..N 정규화된 z-index 사용
  const allLayers = [
    ...MAIN_LAYERS.map((m) => ({
      kind: 'main',
      id: m.id,
      defaultName: m.defaultName,
      label: layerNames[m.id] || m.defaultName,
      src: imageOverrides[m.id]?.src || image,
      zIndex: imageOverrides[m.id]?.zIndex ?? m.defaultZ,
    })),
    ...(freeImages || []).map((it, i) => {
      const def = `📷 추가 사진 ${i + 1}`;
      return {
        kind: 'free',
        id: it.id,
        defaultName: def,
        label: layerNames[it.id] || def,
        src: it.src,
        zIndex: it.zIndex ?? 1,
      };
    }),
  ].sort((a, b) => b.zIndex - a.zIndex);

  const handleLayerAction = (layer, action) => {
    // 정규화된 액션 사용 (메인+자유이미지 모두 1..N으로 재할당)
    if (typeof onChangeLayerKind === 'function') {
      onChangeLayerKind(layer.kind, layer.id, action, MAIN_LAYERS);
    } else if (layer.kind === 'free') {
      onChangeLayer(layer.id, action);
    }
  };

  // 활성 레이어 여부 헬퍼 — 클릭 관통 제어용
  const isLayerActive = (kind, id) => activeLayerId === `${kind}:${id}`;
  const activateLayer = (kind, id) => onSetActiveLayer(`${kind}:${id}`);
  const clearActiveLayer = () => onSetActiveLayer(null);

  // 파일 업로드 → base64 DataURL → onAddFreeImage
  const handleFileUpload = (e) => {
    const files = Array.from(e.target.files || []);
    files.forEach((file) => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (ev.target?.result) onAddFreeImage(ev.target.result);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = ''; // 같은 파일 재선택 가능하게
    setShowPicker(false);
  };

  // 자유 이미지의 최하단 좌표 → 페이지 minHeight 자동 연장
  const baseHeight = 1200;
  const freeBottom = (freeImages || []).reduce(
    (max, it) => Math.max(max, (it.y || 0) + (it.h || 0)),
    0
  );
  const pageHeight = Math.max(baseHeight, freeBottom + 80); // 하단 80px 여유

  // 레이어 정책 (정규화):
  //   모든 레이어가 1..N 의 연속 정수 z-index 사용
  //   레이어 패널 맨 위 = 가장 큰 z, 맨 아래 = z=1
  //
  // 클릭 관통 정책:
  //   - editMode + activeLayerId가 메인이면 콘텐츠 wrapper 활성화
  //   - 그 외에는 콘텐츠 wrapper의 빈 공간은 통과 (pointer-events:none),
  //     실제 텍스트/이미지/카드만 화이트리스트로 활성화
  const mainActive = isLayerActive('main', 'P1.heroImage');
  return (
    <PageFrame height={pageHeight} bg={BRAND.colors.white}>
      {/* 상단 70% — 기존 콘텐츠 */}
      <div className={editMode ? 'p1-content-layer' : ''} style={{
        position: 'relative',
        padding: '60px 50px 30px', textAlign: 'center',
        pointerEvents: editMode ? 'none' : 'auto',
      }}>
        <EditableText
          {...editPropsFor('P1.mainHeadline')}
          as="h2"
          defaultStyle={{
            fontSize: 48,
            fontWeight: 900,
            color: BRAND.colors.text,
            textAlign: 'center',
            letterSpacing: '-0.04em',
            margin: 0,
            lineHeight: 1.25,
          }}
        >
          {mainHeadline}
        </EditableText>
        {(subHeadline || editMode) && (
          <div style={{ marginTop: 20 }}>
            <EditableText
              {...editPropsFor('P1.subHeadline')}
              as="p"
              defaultStyle={{
                fontSize: 24,
                fontWeight: 500,
                color: BRAND.colors.text,
                textAlign: 'center',
                margin: 0,
                lineHeight: 1.5,
              }}
              placeholder={editMode ? '(서브 헤드라인)' : ''}
            >
              {subHeadline}
            </EditableText>
          </div>
        )}
        <div
          data-edit-image
          onMouseDown={editMode ? () => activateLayer('main', 'P1.heroImage') : undefined}
          style={{
            marginTop: 36,
            pointerEvents: 'auto',
            position: 'relative',
            zIndex: mainZ,
            outline: editMode && mainActive ? '2px solid #f59e0b' : 'none',
            outlineOffset: 4,
            borderRadius: 22,
          }}
        >
          <EditableImage
            id="P1.heroImage"
            src={image}
            aspect="1 / 1"
            radius={20}
            editMode={editMode}
            override={imageOverrides['P1.heroImage'] || {}}
            onChange={(partial) => onImageOverrideChange('P1.heroImage', partial)}
            availableImages={allImages.filter(Boolean)}
            onLayerAction={(action) => handleLayerAction({ kind: 'main', id: 'P1.heroImage' }, action)}
          />
        </div>
      </div>

      {/* 하단 30% — 강점 카드 3개 (z-index 500 고정) */}
      <div className={editMode ? 'p1-content-layer' : ''} style={{
        position: 'relative',
        backgroundColor: BRAND.colors.sub, padding: '40px 30px 50px', marginTop: 20,
        pointerEvents: editMode ? 'none' : 'auto',
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 22 }}>
          {strengthCards.slice(0, 3).map((c, i) => (
            <div
              key={i}
              style={{
                backgroundColor: '#fff',
                borderRadius: 18,
                padding: '18px 10px 20px',
                // 카드 축소 — 기존 230 → 220 (체크+타이틀+서브3줄 여유 공간)
                minHeight: 220,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'flex-start',
                textAlign: 'center',
                gap: 8,
                boxShadow: '0 2px 6px rgba(47, 42, 38, 0.04)',
                overflow: 'hidden',
                boxSizing: 'border-box',
                minWidth: 0, // grid 자식 overflow 제어
              }}
            >
              {/* 체크 아이콘 — 다시 생성할 때마다 모양이 바뀜 (variant 기반) */}
              <CheckIcon size={28} variant={checkVariant + i} />

              {/* 타이틀 — 1줄 고정 */}
              <EditableText
                {...editPropsFor(`P1.strengthCards.${i}.title`)}
                as="div"
                defaultStyle={{
                  width: '100%',
                  fontSize: 20,
                  fontWeight: 900,
                  color: BRAND.colors.main,
                  lineHeight: 1.2,
                  letterSpacing: '-0.04em',
                  wordBreak: 'keep-all',
                  whiteSpace: editMode ? 'normal' : 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  minHeight: 26,
                  padding: '0 4px',
                  textAlign: 'center',
                }}
              >
                {c.title}
              </EditableText>

              {/* 설명 — 서브글씨 150% 확대 (15 → 22.5pt), 3줄까지 허용 */}
              <EditableText
                {...editPropsFor(`P1.strengthCards.${i}.desc`)}
                as="div"
                defaultStyle={{
                  width: '100%',
                  fontSize: 22,                 // 요청: 기존 15pt → 150% (≈22pt)
                  fontWeight: 500,
                  color: BRAND.colors.text,
                  lineHeight: 1.35,
                  letterSpacing: '-0.03em',
                  wordBreak: 'keep-all',
                  whiteSpace: 'pre-line',
                  display: editMode ? 'block' : '-webkit-box',
                  WebkitLineClamp: 3,           // 3줄 허용
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  // 22 × 1.35 × 3 ≈ 89px
                  minHeight: 90,
                  padding: '0 2px',
                  textAlign: 'center',
                }}
              >
                {c.desc}
              </EditableText>
            </div>
          ))}
        </div>
        {(trustLine || editMode) && (
          <div style={{ marginTop: 28, textAlign: 'center' }}>
            <EditableText
              {...editPropsFor('P1.trustLine')}
              as="span"
              defaultStyle={{
                display: 'inline-block',
                fontSize: 22,
                fontWeight: 700,
                color: BRAND.colors.text,
                letterSpacing: '-0.02em',
                textAlign: 'center',
              }}
              placeholder={editMode ? '(신뢰 한 줄)' : ''}
            >
              {trustLine}
            </EditableText>
          </div>
        )}
      </div>

      {/* ─── 자유 배치 이미지 캠버스 (절대 위치) ─── */}
      {(freeImages || []).map((item) => (
        <FreeImage
          key={item.id}
          item={{ ...item, galleryImages: validImages }}
          editMode={editMode}
          isActive={isLayerActive('free', item.id)}
          onActivate={() => activateLayer('free', item.id)}
          canvasWidth={780}
          onUpdate={(partial) => onUpdateFreeImage(item.id, partial)}
          onDelete={() => onDeleteFreeImage(item.id)}
          onChangeLayer={(action) => handleLayerAction({ kind: 'free', id: item.id }, action)}
        />
      ))}

      {/* ─── 플로팅 버튼 영역 (편집모드에서만) ─── */}
      {editMode && (
        <>
          {/* 사진 추가 버튼 */}
          <button
            onClick={() => { setShowPicker((s) => !s); setShowLayers(false); }}
            style={{
              position: 'absolute',
              right: 16,
              top: 16,
              zIndex: 9999,
              backgroundColor: '#3b82f6',
              color: '#fff',
              border: '2px solid #fff',
              padding: '10px 14px',
              borderRadius: 999,
              fontSize: 13,
              fontWeight: 800,
              cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(59,130,246,0.45)',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
            title="페이지에 사진을 자유롭게 추가합니다"
          >
            <span style={{ fontSize: 16, lineHeight: 1 }}>＋</span>
            <span>사진 추가</span>
            {(freeImages || []).length > 0 && (
              <span
                style={{
                  backgroundColor: '#fff',
                  color: '#3b82f6',
                  borderRadius: 999,
                  padding: '1px 7px',
                  fontSize: 10,
                  fontWeight: 900,
                  marginLeft: 4,
                }}
              >
                {freeImages.length}
              </span>
            )}
          </button>

          {/* 레이어 패널 토글 버튼 */}
          <button
            onClick={() => { setShowLayers((s) => !s); setShowPicker(false); }}
            style={{
              position: 'absolute',
              right: 16,
              top: 60,
              zIndex: 9999,
              backgroundColor: showLayers ? '#1e293b' : '#475569',
              color: '#fff',
              border: '2px solid #fff',
              padding: '8px 12px',
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 800,
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
            title="모든 레이어 목록 (겹쳐서 선택 안 되는 요소도 여기서 선택)"
          >
            📋 레이어 <span style={{
              backgroundColor: '#fbbf24', color: '#1e293b',
              borderRadius: 999, padding: '1px 6px',
              fontSize: 10, fontWeight: 900,
            }}>{allLayers.length}</span>
          </button>

          {/* 레이어 패널 */}
          {showLayers && (
            <div
              style={{
                position: 'absolute',
                right: 16,
                top: 100,
                zIndex: 9998,
                width: 280,
                maxHeight: 480,
                overflow: 'auto',
                backgroundColor: '#fff',
                border: '1px solid #e2ddd4',
                borderRadius: 12,
                boxShadow: '0 10px 30px rgba(0,0,0,0.18)',
                padding: 12,
              }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#2F2A26' }}>
                  📋 레이어 ({allLayers.length})
                </div>
                <button
                  onClick={() => setShowLayers(false)}
                  style={{ border: 'none', background: 'transparent', color: '#64748b', fontSize: 16, cursor: 'pointer' }}
                >✕</button>
              </div>
              <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 8, lineHeight: 1.5 }}>
                💡 위 = 앞쪽, 아래 = 뒤쪽. ⠿ 영역 드래그로 순서 변경, ▲▼ 버튼으로도 가능.
              </div>
              {allLayers.map((layer, idx) => {
                const isItemActive = isLayerActive(layer.kind, layer.id);
                const isEditingName = editingNameId === layer.id;
                const commitName = () => {
                  const v = (editingNameVal || '').trim();
                  // 빈 문자열은 기본 이름으로 되돌림 (삭제 효과)
                  onSetLayerName(layer.id, v || '');
                  setEditingNameId(null);
                };
                return (
                <div
                  key={layer.id}
                  draggable={!isEditingName}
                  onClick={() => activateLayer(layer.kind, layer.id)}
                  onDragStart={(e) => {
                    setDragIdx(idx);
                    e.dataTransfer.effectAllowed = 'move';
                    try { e.dataTransfer.setData('text/plain', layer.id); } catch (_) {}
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    if (dragOverIdx !== idx) setDragOverIdx(idx);
                  }}
                  onDragLeave={() => {
                    if (dragOverIdx === idx) setDragOverIdx(null);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const from = dragIdx;
                    const to = idx;
                    setDragIdx(null);
                    setDragOverIdx(null);
                    if (from === null || from === to) return;
                    const next = allLayers.slice();
                    const [moved] = next.splice(from, 1);
                    next.splice(to, 0, moved);
                    onReorderLayers(next.map((l) => ({ kind: l.kind, id: l.id })));
                  }}
                  onDragEnd={() => {
                    setDragIdx(null);
                    setDragOverIdx(null);
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: 6, marginBottom: 4,
                    border: dragOverIdx === idx ? '2px solid #2563eb'
                          : isItemActive ? '2px solid #f59e0b'
                          : '1px solid #e2ddd4',
                    borderRadius: 6,
                    backgroundColor: isItemActive ? '#fffbeb'
                          : layer.kind === 'main' ? '#eff6ff'
                          : '#fafaf9',
                    opacity: dragIdx === idx ? 0.4 : 1,
                    cursor: isEditingName ? 'text' : 'grab',
                    transition: 'border-color 0.1s, background-color 0.1s',
                  }}
                >
                  {/* 드래그 핸들 */}
                  <div style={{
                    fontSize: 14,
                    color: '#94a3b8',
                    cursor: 'grab',
                    userSelect: 'none',
                    flexShrink: 0,
                    paddingRight: 2,
                  }} title="드래그로 순서 변경">⠿</div>
                  <img src={layer.src} alt="" crossOrigin="anonymous"
                    style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {isEditingName ? (
                      <input
                        autoFocus
                        value={editingNameVal}
                        onChange={(e) => setEditingNameVal(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitName();
                          else if (e.key === 'Escape') setEditingNameId(null);
                        }}
                        onBlur={commitName}
                        placeholder={layer.defaultName}
                        style={{
                          width: '100%', fontSize: 11, fontWeight: 700,
                          padding: '2px 4px', border: '1px solid #2563eb',
                          borderRadius: 3, outline: 'none', color: '#2F2A26',
                        }}
                      />
                    ) : (
                      <div
                        title="더블클릭하여 이름 수정"
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          setEditingNameId(layer.id);
                          setEditingNameVal(layerNames[layer.id] || '');
                        }}
                        style={{
                          fontSize: 11, fontWeight: 800, color: '#2F2A26',
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          cursor: 'text',
                        }}
                      >
                        {layer.label}
                        <span style={{ marginLeft: 4, fontSize: 9, color: '#94a3b8' }}>✏️</span>
                      </div>
                    )}
                    <div style={{ fontSize: 9, color: '#64748b' }}>z{layer.zIndex}{isItemActive ? ' · 활성' : ''}</div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <button onClick={(e) => { e.stopPropagation(); handleLayerAction(layer, 'front'); }}
                      style={layerBtn('#475569')} title="맨 앞으로">▲▲</button>
                    <button onClick={(e) => { e.stopPropagation(); handleLayerAction(layer, 'back'); }}
                      style={layerBtn('#475569')} title="맨 뒤로">▼▼</button>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <button onClick={(e) => { e.stopPropagation(); handleLayerAction(layer, 'forward'); }}
                      style={layerBtn('#64748b')} title="한 단계 앞">▲</button>
                    <button onClick={(e) => { e.stopPropagation(); handleLayerAction(layer, 'backward'); }}
                      style={layerBtn('#64748b')} title="한 단계 뒤">▼</button>
                  </div>
                  {layer.kind === 'free' && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (window.confirm('이 사진을 삭제할까요?')) {
                          onDeleteFreeImage(layer.id);
                          if (isItemActive) clearActiveLayer();
                        }
                      }}
                      style={{ ...layerBtn('#dc2626'), padding: '4px 6px' }}
                      title="삭제"
                    >🗑</button>
                  )}
                </div>
                );
              })}
            </div>
          )}

          {showPicker && (
            <div
              style={{
                position: 'absolute',
                right: 16,
                top: 60,
                zIndex: 9998,
                width: 320,
                maxHeight: 480,
                overflow: 'auto',
                backgroundColor: '#fff',
                border: '1px solid #e2ddd4',
                borderRadius: 12,
                boxShadow: '0 10px 30px rgba(0,0,0,0.18)',
                padding: 14,
              }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              {/* 헤더 */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#2F2A26' }}>📸 사진 추가</div>
                <button
                  onClick={() => setShowPicker(false)}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: '#64748b',
                    fontSize: 16,
                    cursor: 'pointer',
                    padding: 2,
                  }}
                  title="닫기"
                >✕</button>
              </div>

              {/* 파일 업로드 */}
              <label
                style={{
                  display: 'block',
                  border: '2px dashed #93c5fd',
                  backgroundColor: '#eff6ff',
                  borderRadius: 8,
                  padding: '14px 12px',
                  textAlign: 'center',
                  fontSize: 12,
                  fontWeight: 700,
                  color: '#1d4ed8',
                  cursor: 'pointer',
                  marginBottom: 10,
                }}
              >
                ⬆️ 내 컴퓨터에서 업로드 (여러 장 가능)
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleFileUpload}
                  style={{ display: 'none' }}
                />
              </label>

              {/* AI 생성된 23장 갤러리 */}
              {validImages.length > 0 ? (
                <>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 6 }}>
                    또는 생성된 사진 {validImages.length}장에서 선택
                  </div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, 1fr)',
                      gap: 6,
                    }}
                  >
                    {validImages.map((src, idx) => (
                      <button
                        key={idx}
                        onClick={() => {
                          onAddFreeImage(src);
                          setShowPicker(false);
                        }}
                        style={{
                          border: '1px solid #e2ddd4',
                          borderRadius: 6,
                          padding: 0,
                          overflow: 'hidden',
                          cursor: 'pointer',
                          aspectRatio: '1 / 1',
                          backgroundColor: '#f3f4f6',
                        }}
                        title={`사진 ${idx + 1} 추가`}
                      >
                        <img
                          src={src}
                          alt=""
                          crossOrigin="anonymous"
                          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                        />
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center', padding: '8px 0' }}>
                  (생성된 사진이 없습니다 — 사진을 먼저 생성하면 여기 표시됩니다)
                </div>
              )}

              {/* 안내 */}
              <div style={{ marginTop: 10, fontSize: 10, color: '#94a3b8', lineHeight: 1.5 }}>
                💡 추가 후 페이지 위에서 자유롭게 드래그·리사이즈, 더블클릭=크롭, 툴바=레이어/삭제
              </div>
            </div>
          )}
        </>
      )}
    </PageFrame>
  );
}

// 레이어 패널 작은 버튼 스타일
function layerBtn(color) {
  return {
    backgroundColor: color,
    color: '#fff',
    border: 'none',
    padding: '2px 5px',
    borderRadius: 3,
    fontSize: 8,
    fontWeight: 800,
    cursor: 'pointer',
    minWidth: 22,
    lineHeight: 1.1,
  };
}
