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
  freeImages = [],          // 자유 위치 사진 (slot=null) — 절대 좌표
  inlineImages = [],        // 인라인 사진 (slot != null) — 본문 흐름
  shapes = [],              // 도형 (rect/circle/line/arrow/highlight)
  freeTexts = [],           // 🆕 (2026-05-06) 자유 글박스 (FreeText)
  textOverrides = {},       // 🆕 (2026-05-06) 메인 글박스(EditableText) overrides — { 'P3.title': {hidden,...}, ... }
  onDeleteShape = () => {},
  imageOverrides = {},
  layerNames = {},
  onAddFreeImage = () => {},
  onUpdateFreeImage = () => {},
  onDeleteFreeImage = () => {},
  onChangeLayer = () => {},
  onChangeLayerKind = null,
  onReorderLayers = () => {},
  onToggleLayerVisibility = () => {},
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

  // 도형 타입별 라벨/이모지
  const SHAPE_LABEL = {
    rect:      '⬜ 사각형',
    circle:    '⭕ 원',
    line:      '➖ 선',
    arrow:     '➡️ 화살표',
    highlight: '🟨 하이라이트',
  };

  // 통합 레이어 목록 — z-index 내림차순
  const allLayers = [
    ...mainLayers.map((m) => ({
      kind: 'main',
      id: m.id,
      defaultName: m.defaultName,
      label: layerNames[m.id] || m.defaultName,
      src: imageOverrides[m.id]?.src || image,
      zIndex: imageOverrides[m.id]?.zIndex ?? m.defaultZ ?? 1,
      hidden: !!imageOverrides[m.id]?.hidden,
    })),
    ...(freeImages || []).map((it, i) => {
      const def = `📷 자유사진 ${i + 1}`;
      return {
        kind: 'free',
        id: it.id,
        defaultName: def,
        label: layerNames[it.id] || def,
        src: it.src,
        zIndex: it.zIndex ?? 1,
        hidden: !!it.hidden,
      };
    }),
    ...(inlineImages || []).map((it, i) => {
      const def = `🖼 끼워넣은 사진 ${i + 1}`;
      return {
        kind: 'inline',
        id: it.id,
        defaultName: def,
        label: layerNames[it.id] || def,
        src: it.src,
        // 인라인은 본문 흐름이라 zIndex 가 의미는 작지만 표기상 보여주기 위해 인덱스 사용
        zIndex: it.zIndex ?? (500 + i),
        slot: it.slot,
        hidden: !!it.hidden,
      };
    }),
    ...(shapes || []).map((s, i) => {
      const typeLabel = SHAPE_LABEL[s.type] || '🟦 도형';
      const def = `${typeLabel} ${i + 1}`;
      return {
        kind: 'shape',
        id: s.id,
        defaultName: def,
        label: layerNames[s.id] || def,
        src: null,
        shapeType: s.type,
        shapeColor: s.stroke && s.stroke !== 'none' ? s.stroke : (s.fill && s.fill !== 'none' ? s.fill : '#94a3b8'),
        zIndex: s.zIndex ?? 700,
        hidden: !!s.hidden,
      };
    }),
    // 🆕 (2026-05-06) 자유 글박스 레이어 (FreeText)
    ...(freeTexts || []).map((it, i) => {
      const def = `📝 자유 글박스 ${i + 1}`;
      return {
        kind: 'freetext',
        id: it.id,
        defaultName: def,
        label: layerNames[it.id] || def,
        textPreview: (it.text || it.html || '').replace(/<[^>]*>/g, '').slice(0, 24),
        zIndex: it.zIndex ?? 10000,
        hidden: !!it.hidden,
      };
    }),
    // 🆕 (2026-05-06) 메인 글박스 레이어 — overrides 에서 의미있는 항목만 추출
    ...Object.entries(textOverrides || {})
      .filter(([_id, ov]) => ov && (ov.frame || ov.zIndex !== undefined || ov.html !== undefined || ov.text !== undefined || ov.style || ov.offset || ov.hidden))
      .map(([id, ov]) => {
        const shortId = id.split('.').slice(1).join('.') || id;
        const def = `🅰 글박스: ${shortId}`;
        return {
          kind: 'text',
          id,
          defaultName: def,
          label: layerNames[id] || def,
          textPreview: (ov.text || '').slice(0, 24),
          zIndex: ov.zIndex ?? 10000,
          hidden: !!ov.hidden,
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
      // 🆕 (2026-05-03) 레이어 숨김(hidden=true) — visibility:hidden 으로 PNG 캡처에도 반영
      if (item.hidden) {
        return (
          <div
            key={item.id}
            data-free-image-hidden="true"
            style={{ visibility: 'hidden' }}
            aria-hidden="true"
          >
            <FreeImage
              item={{ ...item, galleryImages: validImages }}
              editMode={false}
              isActive={false}
              hasActiveOther={false}
              canvasWidth={780}
              onUpdate={() => {}}
              onDelete={() => {}}
              onChangeLayer={() => {}}
            />
          </div>
        );
      }
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
        {/* 사진 추가 버튼 — fixed 로 화면 우측에 고정 (top:168) */}
        <button
          onClick={() => { setShowPicker((s) => !s); setShowLayers(false); }}
          style={{
            position: 'fixed', right: 24, top: 168, zIndex: 100000,
            backgroundColor: '#3b82f6', color: '#fff', border: '2px solid #fff',
            padding: '10px 14px', borderRadius: 999, fontSize: 13, fontWeight: 800,
            cursor: 'pointer', boxShadow: '0 4px 14px rgba(59,130,246,0.45)',
            display: 'flex', alignItems: 'center', gap: 6,
          }}
          title="페이지에 사진을 자유롭게 추가합니다 (스크롤해도 따라다님)"
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

        {/* 레이어 패널 토글 — top:324 (도형 추가:220, 글박스 추가:272 다음) */}
        <button
          onClick={() => { setShowLayers((s) => !s); setShowPicker(false); }}
          style={{
            position: 'fixed', right: 24, top: 324,
            zIndex: 100000,
            backgroundColor: showLayers ? '#1e293b' : '#475569', color: '#fff',
            border: '2px solid #fff', padding: '8px 12px', borderRadius: 999,
            fontSize: 12, fontWeight: 800, cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            display: 'flex', alignItems: 'center', gap: 6,
          }}
          title="모든 레이어 목록 (스크롤해도 따라다님)"
        >
          📋 레이어 <span style={{
            backgroundColor: '#fbbf24', color: '#1e293b',
            borderRadius: 999, padding: '1px 6px', fontSize: 10, fontWeight: 900,
          }}>{allLayers.length}</span>
        </button>

        {/* 레이어 패널 — fixed 로 화면 우측에 고정 (버튼들과 겹치지 않게 왼쪽으로 펼침), 스크롤 시 따라옴 */}
        {showLayers && (
          <div
            style={{
              position: 'fixed', right: 180, top: 168,
              zIndex: 100001,
              width: 320, maxHeight: 'calc(100vh - 200px)', overflow: 'auto',
              backgroundColor: '#fff', border: '1px solid #e2ddd4',
              borderRadius: 12, boxShadow: '0 10px 30px rgba(0,0,0,0.22)', padding: 12,
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
                    opacity: dragIdx === idx ? 0.4 : (layer.hidden ? 0.55 : 1),
                    cursor: isEditingName ? 'text' : 'grab',
                    transition: 'border-color 0.1s, background-color 0.1s',
                  }}
                >
                  {/* 🆕 (2026-05-03) 가시성 토글 — 포토샵 방식 눈 아이콘 (PNG 캡처에도 반영) */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleLayerVisibility(layer.kind, layer.id);
                    }}
                    title={layer.hidden ? '레이어 보이기' : '레이어 숨기기 (PNG에도 반영됨)'}
                    style={{
                      width: 22, height: 22, flexShrink: 0,
                      border: '1px solid ' + (layer.hidden ? '#cbd5e1' : '#bae6fd'),
                      backgroundColor: layer.hidden ? '#f1f5f9' : '#eff6ff',
                      borderRadius: 4, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 12, lineHeight: 1, padding: 0,
                    }}
                  >
                    {layer.hidden ? '🚫' : '👁'}
                  </button>
                  <div style={{
                    fontSize: 14, color: '#94a3b8', cursor: 'grab',
                    userSelect: 'none', flexShrink: 0, paddingRight: 2,
                  }} title="드래그로 순서 변경">⠿</div>
                  {layer.kind === 'shape' ? (
                    <ShapeThumb type={layer.shapeType} color={layer.shapeColor} />
                  ) : layer.src ? (
                    <img src={layer.src} alt="" crossOrigin="anonymous"
                      style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} />
                  ) : (layer.kind === 'text' || layer.kind === 'freetext') ? (
                    <div style={{
                      width: 36, height: 36, borderRadius: 4, flexShrink: 0,
                      backgroundColor: layer.kind === 'freetext' ? '#fef3c7' : '#e0e7ff',
                      border: '1px solid ' + (layer.kind === 'freetext' ? '#fcd34d' : '#c7d2fe'),
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 16, fontWeight: 900,
                      color: layer.kind === 'freetext' ? '#b45309' : '#4338ca',
                    }}>
                      🅰
                    </div>
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
                    <div style={{ fontSize: 9, color: '#64748b' }}>
                      {layer.kind === 'inline' && (
                        <span style={{
                          backgroundColor: '#10b981', color: '#fff',
                          padding: '0 4px', borderRadius: 3, marginRight: 4,
                          fontSize: 8, fontWeight: 800,
                        }}>본문</span>
                      )}
                      {layer.kind === 'shape' && (
                        <span style={{
                          backgroundColor: '#a855f7', color: '#fff',
                          padding: '0 4px', borderRadius: 3, marginRight: 4,
                          fontSize: 8, fontWeight: 800,
                        }}>도형</span>
                      )}
                      {layer.kind === 'free' && (
                        <span style={{
                          backgroundColor: '#3b82f6', color: '#fff',
                          padding: '0 4px', borderRadius: 3, marginRight: 4,
                          fontSize: 8, fontWeight: 800,
                        }}>자유</span>
                      )}
                      z{layer.zIndex}{isItemActive ? ' · 활성' : ''}
                    </div>
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
                  {(layer.kind === 'free' || layer.kind === 'inline') && (
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
                  {layer.kind === 'shape' && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (window.confirm('이 도형을 삭제할까요?')) {
                          onDeleteShape(layer.id);
                          if (isItemActive) clearActiveLayer();
                        }
                      }}
                      style={{ ...layerBtn('#dc2626'), padding: '4px 6px' }}
                      title="도형 삭제"
                    >🗑</button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* 사진 추가 패널 — fixed (버튼들과 겹치지 않게 왼쪽으로 펼침) */}
        {showPicker && (
          <div
            style={{
              position: 'fixed', right: 180, top: 168, zIndex: 100001,
              width: 320, maxHeight: 'calc(100vh - 200px)', overflow: 'auto',
              backgroundColor: '#fff', border: '1px solid #e2ddd4',
              borderRadius: 12, boxShadow: '0 10px 30px rgba(0,0,0,0.22)', padding: 14,
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

// 도형 썸네일 — 36×36 SVG 미니 미리보기
function ShapeThumb({ type, color = '#94a3b8' }) {
  const box = {
    width: 36, height: 36, flexShrink: 0,
    backgroundColor: '#fff', border: '1px solid #e5e7eb',
    borderRadius: 4, padding: 2,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  };
  const sw = 3;
  switch (type) {
    case 'rect':
      return (
        <div style={box}>
          <svg width="28" height="28">
            <rect x={sw / 2} y={sw / 2} width={28 - sw} height={28 - sw}
              fill="none" stroke={color} strokeWidth={sw} rx={3} />
          </svg>
        </div>
      );
    case 'circle':
      return (
        <div style={box}>
          <svg width="28" height="28">
            <circle cx="14" cy="14" r={14 - sw / 2}
              fill="none" stroke={color} strokeWidth={sw} />
          </svg>
        </div>
      );
    case 'line':
      return (
        <div style={box}>
          <svg width="28" height="28">
            <line x1="2" y1="14" x2="26" y2="14"
              stroke={color} strokeWidth={sw} strokeLinecap="round" />
          </svg>
        </div>
      );
    case 'arrow':
      return (
        <div style={box}>
          <svg width="28" height="28">
            <line x1="2" y1="14" x2="20" y2="14"
              stroke={color} strokeWidth={sw} strokeLinecap="round" />
            <path d="M 18 8 L 26 14 L 18 20 Z" fill={color} />
          </svg>
        </div>
      );
    case 'highlight':
      return (
        <div style={box}>
          <div style={{ width: 26, height: 14, backgroundColor: color, opacity: 0.5, borderRadius: 2 }} />
        </div>
      );
    default:
      return <div style={box} />;
  }
}
