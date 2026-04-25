/**
 * freeImageLayer.jsx
 *
 * P1~P10 공통 — 자유 배치 이미지(FreeImage) + 레이어 패널 + 사진 추가 패널.
 * 페이지마다 동일한 UX를 제공하기 위해 hook + 오버레이 컴포넌트로 추출.
 *
 * 사용 예 (페이지 컴포넌트 안):
 *
 *   const layer = useFreeImageLayer({
 *     pageKey: 'P3',
 *     mainLayers: [],          // 메인이미지가 있는 페이지면 [{ id, defaultName, defaultZ }]
 *     image,                   // 메인이미지 src (없으면 undefined)
 *     allImages, freeImages, imageOverrides, layerNames,
 *     onAddFreeImage, onUpdateFreeImage, onDeleteFreeImage,
 *     onChangeLayer, onChangeLayerKind, onReorderLayers, onSetLayerName,
 *     activeLayerId, onSetActiveLayer, editMode,
 *   });
 *
 *   return (
 *     <PageFrame height={layer.pageHeight}>
 *       ...본문...
 *       {layer.renderFreeImages()}
 *       {layer.renderOverlay()}
 *     </PageFrame>
 *   );
 */
import { useEffect, useState } from 'react';
import FreeImage from '../FreeImage.jsx';

export function useFreeImageLayer({
  pageKey,
  mainLayers = [],          // [{ id, defaultName, defaultZ }]
  image,                    // 메인이미지 기본 src (있을 때만)
  allImages = [],
  baseHeight = 1200,
  editMode = false,
  freeImages = [],
  imageOverrides = {},
  layerNames = {},
  onAddFreeImage = () => {},
  onUpdateFreeImage = () => {},
  onDeleteFreeImage = () => {},
  onChangeLayer = () => {},
  onChangeLayerKind = null,
  onReorderLayers = () => {},
  onSetLayerName = () => {},
  activeLayerId = null,
  onSetActiveLayer = () => {},
}) {
  const [showPicker, setShowPicker] = useState(false);
  const [showLayers, setShowLayers] = useState(false);
  const [dragIdx, setDragIdx] = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);
  const [editingNameId, setEditingNameId] = useState(null);
  const [editingNameVal, setEditingNameVal] = useState('');

  const validImages = (allImages || []).filter(Boolean);

  const isLayerActive = (kind, id) => activeLayerId === `${kind}:${id}`;
  const activateLayer = (kind, id) => onSetActiveLayer(`${kind}:${id}`);
  const clearActiveLayer = () => onSetActiveLayer(null);
  const hasActiveLayer = !!activeLayerId;

  // 통합 레이어 목록 — z-index 내림차순
  const allLayers = [
    ...mainLayers.map((m) => ({
      kind: 'main',
      id: m.id,
      defaultName: m.defaultName,
      label: layerNames[m.id] || m.defaultName,
      src: imageOverrides[m.id]?.src || image,
      zIndex: imageOverrides[m.id]?.zIndex ?? m.defaultZ ?? 1,
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
    if (typeof onChangeLayerKind === 'function') {
      onChangeLayerKind(layer.kind, layer.id, action, mainLayers);
    } else if (layer.kind === 'free') {
      onChangeLayer(layer.id, action);
    }
  };

  // ESC로 활성 레이어 해제
  useEffect(() => {
    if (!editMode || !activeLayerId) return;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        const tag = (document.activeElement?.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'textarea' || document.activeElement?.isContentEditable) return;
        clearActiveLayer();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editMode, activeLayerId]);

  // 파일 업로드
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
    e.target.value = '';
    setShowPicker(false);
  };

  // 자유이미지 하단 좌표 → 페이지 minHeight 자동 연장
  const freeBottom = (freeImages || []).reduce(
    (max, it) => Math.max(max, (it.y || 0) + (it.h || 0)),
    0
  );
  const pageHeight = Math.max(baseHeight, freeBottom + 80);

  /** 자유 이미지 절대 배치 렌더 */
  const renderFreeImages = () =>
    (freeImages || []).map((item) => {
      const itemActive = isLayerActive('free', item.id);
      return (
        <FreeImage
          key={item.id}
          item={{ ...item, galleryImages: validImages }}
          editMode={editMode}
          isActive={itemActive}
          onActivate={() => activateLayer('free', item.id)}
          hasActiveOther={editMode && hasActiveLayer && !itemActive}
          canvasWidth={780}
          onUpdate={(partial) => onUpdateFreeImage(item.id, partial)}
          onDelete={() => onDeleteFreeImage(item.id)}
          onChangeLayer={(action) => handleLayerAction({ kind: 'free', id: item.id }, action)}
        />
      );
    });

  /** 플로팅 + 사진 추가 / 레이어 패널 */
  const renderOverlay = () => {
    if (!editMode) return null;
    return (
      <>
        {/* 사진 추가 버튼 */}
        <button
          onClick={() => { setShowPicker((s) => !s); setShowLayers(false); }}
          style={{
            position: 'absolute', right: 16, top: 16, zIndex: 9999,
            backgroundColor: '#3b82f6', color: '#fff', border: '2px solid #fff',
            padding: '10px 14px', borderRadius: 999, fontSize: 13, fontWeight: 800,
            cursor: 'pointer', boxShadow: '0 4px 14px rgba(59,130,246,0.45)',
            display: 'flex', alignItems: 'center', gap: 6,
          }}
          title="페이지에 사진을 자유롭게 추가합니다"
        >
          <span style={{ fontSize: 16, lineHeight: 1 }}>＋</span>
          <span>사진 추가</span>
          {(freeImages || []).length > 0 && (
            <span style={{
              backgroundColor: '#fff', color: '#3b82f6', borderRadius: 999,
              padding: '1px 7px', fontSize: 10, fontWeight: 900, marginLeft: 4,
            }}>{freeImages.length}</span>
          )}
        </button>

        {/* 레이어 패널 토글 */}
        <button
          onClick={() => { setShowLayers((s) => !s); setShowPicker(false); }}
          style={{
            position: 'absolute', right: 16, top: 60, zIndex: 9999,
            backgroundColor: showLayers ? '#1e293b' : '#475569', color: '#fff',
            border: '2px solid #fff', padding: '8px 12px', borderRadius: 999,
            fontSize: 12, fontWeight: 800, cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            display: 'flex', alignItems: 'center', gap: 6,
          }}
          title="모든 레이어 목록"
        >
          📋 레이어 <span style={{
            backgroundColor: '#fbbf24', color: '#1e293b',
            borderRadius: 999, padding: '1px 6px', fontSize: 10, fontWeight: 900,
          }}>{allLayers.length}</span>
        </button>

        {/* 레이어 패널 */}
        {showLayers && (
          <div
            style={{
              position: 'absolute', right: 16, top: 100, zIndex: 9998,
              width: 280, maxHeight: 480, overflow: 'auto',
              backgroundColor: '#fff', border: '1px solid #e2ddd4',
              borderRadius: 12, boxShadow: '0 10px 30px rgba(0,0,0,0.18)', padding: 12,
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
            {allLayers.length === 0 && (
              <div style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center', padding: '12px 0' }}>
                레이어가 없습니다. 위 ＋ 사진 추가 버튼을 눌러보세요.
              </div>
            )}
            {allLayers.map((layer, idx) => {
              const isItemActive = isLayerActive(layer.kind, layer.id);
              const isEditingName = editingNameId === layer.id;
              const commitName = () => {
                const v = (editingNameVal || '').trim();
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
                  onDragLeave={() => { if (dragOverIdx === idx) setDragOverIdx(null); }}
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
                  onDragEnd={() => { setDragIdx(null); setDragOverIdx(null); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: 6, marginBottom: 4,
                    border: dragOverIdx === idx ? '2px solid #2563eb'
                          : isItemActive ? '2px solid #f59e0b'
                          : '1px solid #e2ddd4',
                    borderRadius: 6,
                    backgroundColor: isItemActive ? '#fffbeb'
                          : layer.kind === 'main' ? '#eff6ff' : '#fafaf9',
                    opacity: dragIdx === idx ? 0.4 : 1,
                    cursor: isEditingName ? 'text' : 'grab',
                    transition: 'border-color 0.1s, background-color 0.1s',
                  }}
                >
                  <div style={{
                    fontSize: 14, color: '#94a3b8', cursor: 'grab',
                    userSelect: 'none', flexShrink: 0, paddingRight: 2,
                  }} title="드래그로 순서 변경">⠿</div>
                  {layer.src ? (
                    <img src={layer.src} alt="" crossOrigin="anonymous"
                      style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} />
                  ) : (
                    <div style={{ width: 36, height: 36, borderRadius: 4, flexShrink: 0, backgroundColor: '#e2e8f0' }} />
                  )}
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

        {/* 사진 추가 패널 */}
        {showPicker && (
          <div
            style={{
              position: 'absolute', right: 16, top: 60, zIndex: 9998,
              width: 320, maxHeight: 480, overflow: 'auto',
              backgroundColor: '#fff', border: '1px solid #e2ddd4',
              borderRadius: 12, boxShadow: '0 10px 30px rgba(0,0,0,0.18)', padding: 14,
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#2F2A26' }}>📸 사진 추가</div>
              <button
                onClick={() => setShowPicker(false)}
                style={{ border: 'none', background: 'transparent', color: '#64748b', fontSize: 16, cursor: 'pointer', padding: 2 }}
                title="닫기"
              >✕</button>
            </div>
            <label
              style={{
                display: 'block', border: '2px dashed #93c5fd', backgroundColor: '#eff6ff',
                borderRadius: 8, padding: '14px 12px', textAlign: 'center',
                fontSize: 12, fontWeight: 700, color: '#1d4ed8', cursor: 'pointer', marginBottom: 10,
              }}
            >
              ⬆️ 내 컴퓨터에서 업로드 (여러 장 가능)
              <input type="file" accept="image/*" multiple onChange={handleFileUpload} style={{ display: 'none' }} />
            </label>
            {validImages.length > 0 ? (
              <>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 6 }}>
                  또는 생성된 사진 {validImages.length}장에서 선택
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                  {validImages.map((src, idx) => (
                    <button
                      key={idx}
                      onClick={() => { onAddFreeImage(src); setShowPicker(false); }}
                      style={{
                        border: '1px solid #e2ddd4', borderRadius: 6, padding: 0, overflow: 'hidden',
                        cursor: 'pointer', aspectRatio: '1 / 1', backgroundColor: '#f3f4f6',
                      }}
                      title={`사진 ${idx + 1} 추가`}
                    >
                      <img src={src} alt="" crossOrigin="anonymous"
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center', padding: '8px 0' }}>
                (생성된 사진이 없습니다)
              </div>
            )}
            <div style={{ marginTop: 10, fontSize: 10, color: '#94a3b8', lineHeight: 1.5 }}>
              💡 추가 후 페이지 위에서 자유롭게 드래그·리사이즈, 더블클릭=크롭, 툴바=레이어/삭제
            </div>
          </div>
        )}
      </>
    );
  };

  return {
    pageHeight,
    isLayerActive,
    activateLayer,
    clearActiveLayer,
    hasActiveLayer,
    handleLayerAction,
    renderFreeImages,
    renderOverlay,
    validImages,
  };
}

function layerBtn(color) {
  return {
    backgroundColor: color, color: '#fff', border: 'none',
    padding: '2px 5px', borderRadius: 3, fontSize: 8, fontWeight: 800,
    cursor: 'pointer', minWidth: 22, lineHeight: 1.1,
  };
}
