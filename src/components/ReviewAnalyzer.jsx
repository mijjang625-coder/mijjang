import { useEffect, useRef, useState } from 'react';
import { analyzeReviews } from '../lib/openai.js';

// 🚀 xlsx는 lazy load — 사용자가 엑셀 업로드할 때만 로드 (~250KB 절약)
let _XLSX = null;
const STORAGE_KEY = 'reviewAnalyzer.v2';
const noop = () => {};
async function getXLSX() {
  if (_XLSX) return _XLSX;
  _XLSX = await import('xlsx');
  return _XLSX;
}

/**
 * ReviewAnalyzer — 리뷰 분석 & 마케팅 문구 자동생성
 *
 * 입력 방식 (3가지 탭):
 *   1. 📊 엑셀/CSV 업로드 (.xlsx, .xls, .csv) — SheetJS로 파싱, 컬럼 자동 인식
 *   2. 📝 메모장 업로드 (.txt) — 한 줄 = 리뷰 1개
 *   3. ✍️ 직접 붙여넣기 — textarea
 *
 * AI 분석 결과:
 *   - 페인포인트 Top 3
 *   - 긍정포인트 Top 3
 *   - 타겟 고객 Top 3
 *   - 키워드 Top 20
 *   - 마케팅 헤드라인 6~9개 (각각 ✓채택 / ✕거절)
 */
export default function ReviewAnalyzer({
  apiKey,
  provider = 'openai',
  model = 'gpt-4o-mini',
  productName = '',
  productType = '',
  // 부모(App)에서 전체 초기화 시 전달되는 리셋 신호값
  resetSignal = 0,
  // 외부에 채택된 문구 알림 (선택)
  onAdoptedHeadlinesChange = () => {},
  // 키워드를 사이드바 검색량 키워드 영역에 추가할 때 사용 (선택)
  onAddKeywordsToSearch = () => {},
  // 🆕 분석 결과 전체를 부모에 전달 (CompetitorAnalyzer 갭 매칭 등에 활용)
  onAnalyzed = () => {},
  // 🆕 (2026-04-28) 채택된 문구를 "내 메모"에 자동 적용 (선택)
  onApplyAdoptedToNotes = null,
  // 프로젝트 저장/불러오기와 연동되는 외부 스냅샷 (선택)
  initialSnapshot = null,
  onStateSnapshotChange = noop,
}) {
  // 입력 모드: 'excel' | 'txt' | 'paste'
  const [inputMode, setInputMode] = useState('excel');

  // 엑셀/CSV 파싱 결과
  const [excelRows, setExcelRows] = useState([]);    // [{col1: ..., col2: ...}]
  const [excelColumns, setExcelColumns] = useState([]); // ['col1', 'col2', ...]
  const [reviewColumn, setReviewColumn] = useState(''); // 사용자가 선택한 리뷰 컬럼명
  const [excelFileName, setExcelFileName] = useState('');

  // 메모장(.txt) 또는 직접 붙여넣기
  const [pastedText, setPastedText] = useState('');
  const [txtFileName, setTxtFileName] = useState('');

  // 분석 진행 상태
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState('');

  // 분석 결과
  const [result, setResult] = useState(null);
  const [adopted, setAdopted] = useState({}); // { h1: true, h2: false, ... }
  const lastOutboundSnapshotRef = useRef('');
  const lastInboundSnapshotRef = useRef('');

  const applySnapshot = (saved) => {
    if (!saved || typeof saved !== 'object') return;
    if (saved.result) setResult(saved.result);
    if (saved.adopted) setAdopted(saved.adopted);
    if (typeof saved.pastedText === 'string') setPastedText(saved.pastedText);
    if (saved.inputMode) setInputMode(saved.inputMode);
    if (Array.isArray(saved.excelRows)) setExcelRows(saved.excelRows);
    if (Array.isArray(saved.excelColumns)) setExcelColumns(saved.excelColumns);
    if (typeof saved.reviewColumn === 'string') setReviewColumn(saved.reviewColumn);
    if (typeof saved.excelFileName === 'string') setExcelFileName(saved.excelFileName);
    if (typeof saved.txtFileName === 'string') setTxtFileName(saved.txtFileName);
  };

  // 1) 첫 마운트 시 localStorage 복원 (기본값)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem('reviewAnalyzer.v1');
      if (!raw) return;
      const saved = JSON.parse(raw);
      applySnapshot(saved);
      lastOutboundSnapshotRef.current = raw;
      lastInboundSnapshotRef.current = raw;
    } catch (_) {}
  }, []);

  // 2) 부모(App)에서 프로젝트 불러오기/복원으로 들어온 스냅샷 적용
  useEffect(() => {
    try {
      if (!initialSnapshot || typeof initialSnapshot !== 'object') return;
      const inbound = JSON.stringify(initialSnapshot);
      // 내가 방금 부모로 보낸 동일 스냅샷은 다시 주입하지 않음 (루프/떨림 방지)
      if (!inbound || inbound === lastOutboundSnapshotRef.current || inbound === lastInboundSnapshotRef.current) return;
      applySnapshot(initialSnapshot);
      lastInboundSnapshotRef.current = inbound;
    } catch (_) {}
  }, [initialSnapshot]);

  // 3) 내부 상태 변경 시 localStorage + 부모 스냅샷 동기화
  useEffect(() => {
    try {
      const snapshot = {
        result,
        adopted,
        pastedText,
        inputMode,
        excelRows,
        excelColumns,
        reviewColumn,
        excelFileName,
        txtFileName,
      };
      const data = JSON.stringify(snapshot);
      if (data === lastOutboundSnapshotRef.current) return;
      localStorage.setItem(STORAGE_KEY, data);
      // 하위호환: 기존 키도 함께 갱신 (구버전에서 최신 상태 읽기 가능)
      localStorage.setItem('reviewAnalyzer.v1', data);
      onStateSnapshotChange(snapshot);
      lastOutboundSnapshotRef.current = data;
    } catch (_) {}
  }, [result, adopted, pastedText, inputMode, excelRows, excelColumns, reviewColumn, excelFileName, txtFileName, onStateSnapshotChange]);

  // 채택된 문구가 바뀔 때 외부 알림 + 🆕 "내 메모"에 자동 동기화
  useEffect(() => {
    if (!result?.headlines) return;
    const list = result.headlines.filter((h) => adopted[h.id]);
    onAdoptedHeadlinesChange(list);

    // 🆕 (2026-05-08) 채택 상태가 바뀌는 즉시 "내 메모"에 자동 반영
    //   - 이전: "✅ 채택된 문구 적용" 버튼을 직접 눌러야만 메모에 들어감 → 잊어버리기 쉬움
    //   - 이제: 채택 토글하면 즉시 메모 섹션이 갱신됨 (체크 해제하면 그 항목이 빠짐)
    if (typeof onApplyAdoptedToNotes === 'function') {
      const text = list.map((h, i) => `${i + 1}. ${h.headline}\n   → ${h.body}`).join('\n\n');
      // 빈 문자열도 그대로 전달 → 부모 쪽에서 섹션 비움/제거 처리
      onApplyAdoptedToNotes(text, list);
    }
  }, [adopted, result]);

  // 🆕 분석 결과 전체를 부모에 전달 (경쟁사 분석기 등에서 활용)
  useEffect(() => {
    onAnalyzed(result);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  // ── 엑셀/CSV 업로드 처리 ──
  const handleExcelUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setExcelFileName(file.name);
    setError('');

    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const data = new Uint8Array(ev.target.result);
        const XLSX = await getXLSX();
        const wb = XLSX.read(data, { type: 'array' });
        const sheetName = wb.SheetNames[0];
        const sheet = wb.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(sheet, { defval: '' });
        if (!json.length) {
          setError('엑셀 파일에 데이터가 없습니다.');
          return;
        }
        const cols = Object.keys(json[0]);
        setExcelRows(json);
        setExcelColumns(cols);

        // 리뷰 컬럼 자동 인식
        const candidates = ['리뷰', '리뷰내용', '리뷰 내용', '내용', '본문', '후기', '평가', 'review', 'comment', 'content', 'body', 'text'];
        const matched = cols.find((c) => {
          const lc = String(c).toLowerCase().trim();
          return candidates.some((k) => lc.includes(k.toLowerCase()));
        });
        // 못 찾으면 가장 긴 텍스트가 들어있는 컬럼 추정
        let auto = matched;
        if (!auto) {
          let bestCol = cols[0];
          let bestAvgLen = 0;
          cols.forEach((c) => {
            const lens = json.slice(0, 20).map((r) => String(r[c] || '').length);
            const avg = lens.reduce((a, b) => a + b, 0) / Math.max(1, lens.length);
            if (avg > bestAvgLen) { bestAvgLen = avg; bestCol = c; }
          });
          auto = bestCol;
        }
        setReviewColumn(auto || cols[0]);
      } catch (err) {
        setError('엑셀 파싱 오류: ' + (err?.message || err));
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  // ── 메모장(.txt) 업로드 처리 ──
  const handleTxtUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setTxtFileName(file.name);
    setError('');
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = String(ev.target?.result || '');
      setPastedText(text);
    };
    reader.readAsText(file, 'UTF-8');
    e.target.value = '';
  };

  // 현재 모드에 따른 리뷰 텍스트 배열 추출
  const getReviewTexts = () => {
    if (inputMode === 'excel') {
      if (!reviewColumn || !excelRows.length) return [];
      return excelRows.map((row) => String(row[reviewColumn] || '').trim()).filter(Boolean);
    }
    // txt or paste — 줄 단위 분리
    return (pastedText || '')
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  };

  const reviewCount = getReviewTexts().length;

  // ── AI 분석 실행 ──
  const runAnalysis = async () => {
    setError('');
    if (!apiKey) {
      setError('먼저 사이드바 "AI 모델 설정"에서 API 키를 입력해주세요.');
      return;
    }
    const texts = getReviewTexts();
    if (texts.length < 3) {
      setError(`리뷰가 너무 적습니다. 최소 3개 이상 필요합니다 (현재 ${texts.length}개).`);
      return;
    }

    setAnalyzing(true);
    try {
      const res = await analyzeReviews({
        provider, apiKey, model,
        reviews: texts,
        productName,
        productType,
      });
      setResult(res);
      setAdopted({});
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setAnalyzing(false);
    }
  };

  const clearAnalyzerState = () => {
    setResult(null);
    setAdopted({});
    setExcelRows([]);
    setExcelColumns([]);
    setReviewColumn('');
    setExcelFileName('');
    setPastedText('');
    setTxtFileName('');
    setError('');
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem('reviewAnalyzer.v1');
    } catch (_) {}
  };

  // 분석 초기화 (수동 버튼)
  const resetAll = () => {
    if (!window.confirm('분석 결과와 입력을 모두 초기화할까요?')) return;
    clearAnalyzerState();
  };

  // 부모에서 전체 초기화가 실행되면 리뷰 분석기도 확인창 없이 즉시 초기화
  useEffect(() => {
    if (!resetSignal) return;
    clearAnalyzerState();
  }, [resetSignal]);

  // 헤드라인 채택 토글
  const toggleAdopt = (id) => {
    setAdopted((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // 🆕 (2026-04-28) 채택된 문구를 "내 메모"에 자동 적용
  // - 부모(Sidebar→App)가 onApplyAdoptedToNotes를 제공하면 그걸로 적용
  // - 없으면 fallback으로 클립보드 복사 (구버전 호환)
  const applyAdopted = () => {
    if (!result?.headlines) return;
    const list = result.headlines.filter((h) => adopted[h.id]);
    if (!list.length) {
      alert('채택된 문구가 없습니다.');
      return;
    }
    const text = list.map((h, i) => `${i + 1}. ${h.headline}\n   → ${h.body}`).join('\n\n');
    if (typeof onApplyAdoptedToNotes === 'function') {
      onApplyAdoptedToNotes(text, list);
      alert(`✅ 채택된 문구 ${list.length}개를 "내 메모"에 추가했습니다.\n\n다음 페이지 생성 시 AI가 이 문구를 참고합니다.`);
    } else {
      navigator.clipboard.writeText(text);
      alert(`✅ 채택된 문구 ${list.length}개를 클립보드에 복사했습니다.`);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* 안내 */}
      <div style={{
        backgroundColor: '#fef3c7', border: '1px solid #fde68a',
        padding: '8px 10px', borderRadius: 6, fontSize: 11, color: '#92400e', lineHeight: 1.5,
      }}>
        💡 쿠팡/네이버 리뷰를 <b>엑셀로 다운로드</b>하거나 <b>메모장에 줄 단위로 정리</b>해서 업로드하면, AI가 페인/긍정 포인트·타겟 고객·키워드·강조 문구를 자동 분석합니다.
      </div>

      {/* 입력 모드 탭 */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid #e2ddd4' }}>
        {[
          { id: 'excel', label: '📊 엑셀/CSV' },
          { id: 'txt',   label: '📝 메모장(.txt)' },
          { id: 'paste', label: '✍️ 직접 붙여넣기' },
        ].map((t) => (
          <button key={t.id}
            onClick={() => setInputMode(t.id)}
            style={{
              padding: '6px 10px',
              border: 'none',
              borderBottom: inputMode === t.id ? '3px solid #3b82f6' : '3px solid transparent',
              backgroundColor: 'transparent',
              color: inputMode === t.id ? '#1e293b' : '#94a3b8',
              fontSize: 11,
              fontWeight: inputMode === t.id ? 800 : 600,
              cursor: 'pointer',
              marginBottom: -1,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 엑셀/CSV 모드 */}
      {inputMode === 'excel' && (
        <div>
          <label style={{
            display: 'block', border: '2px dashed #93c5fd', backgroundColor: '#eff6ff',
            borderRadius: 8, padding: 14, textAlign: 'center', cursor: 'pointer',
            fontSize: 12, fontWeight: 700, color: '#1d4ed8',
          }}>
            📊 엑셀(.xlsx, .xls) 또는 CSV 파일 업로드
            <input type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }}
              onChange={handleExcelUpload} />
          </label>
          {excelFileName && (
            <div style={{ marginTop: 6, fontSize: 11, color: '#475569' }}>
              📁 <b>{excelFileName}</b> · {excelRows.length}개 행 · 컬럼 {excelColumns.length}개
            </div>
          )}
          {excelColumns.length > 0 && (
            <div style={{ marginTop: 8, padding: 8, backgroundColor: '#f8fafc', borderRadius: 6 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                리뷰 본문이 들어있는 컬럼을 선택하세요:
              </div>
              <select value={reviewColumn}
                onChange={(e) => setReviewColumn(e.target.value)}
                style={{
                  width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1',
                  borderRadius: 4, fontSize: 12, fontWeight: 600,
                }}
              >
                {excelColumns.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              {reviewColumn && excelRows[0] && (
                <div style={{
                  marginTop: 6, fontSize: 10, color: '#64748b',
                  backgroundColor: '#fff', padding: 6, borderRadius: 4,
                  border: '1px solid #e2e8f0',
                  maxHeight: 80, overflow: 'auto',
                }}>
                  <b>미리보기:</b> {String(excelRows[0][reviewColumn] || '').slice(0, 200)}
                  {String(excelRows[0][reviewColumn] || '').length > 200 ? '...' : ''}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 메모장 .txt 모드 */}
      {inputMode === 'txt' && (
        <div>
          <label style={{
            display: 'block', border: '2px dashed #c4b5fd', backgroundColor: '#f5f3ff',
            borderRadius: 8, padding: 14, textAlign: 'center', cursor: 'pointer',
            fontSize: 12, fontWeight: 700, color: '#5b21b6',
          }}>
            📝 메모장(.txt) 파일 업로드
            <input type="file" accept=".txt,text/plain" style={{ display: 'none' }}
              onChange={handleTxtUpload} />
          </label>
          {txtFileName && (
            <div style={{ marginTop: 6, fontSize: 11, color: '#475569' }}>
              📁 <b>{txtFileName}</b> · {pastedText.split(/\r?\n/).filter(Boolean).length}줄
            </div>
          )}
          {pastedText && (
            <textarea
              value={pastedText}
              onChange={(e) => setPastedText(e.target.value)}
              placeholder="한 줄 = 리뷰 1개"
              style={{
                width: '100%', minHeight: 120, marginTop: 6,
                fontSize: 11, fontFamily: 'monospace',
                padding: 6, border: '1px solid #cbd5e1', borderRadius: 4,
                resize: 'vertical',
              }}
            />
          )}
          <div style={{ fontSize: 10, color: '#64748b', marginTop: 4 }}>
            💡 한 줄 = 리뷰 1개로 인식합니다.
          </div>
        </div>
      )}

      {/* 직접 붙여넣기 모드 */}
      {inputMode === 'paste' && (
        <div>
          <textarea
            value={pastedText}
            onChange={(e) => setPastedText(e.target.value)}
            placeholder={"리뷰들을 한 줄에 1개씩 붙여넣으세요.\n\n예시:\n포장이 정말 꼼꼼해서 좋았어요. 깨지지 않고 잘 도착했습니다.\n색감이 사진보다 더 예뻐요. 거실에 두니 분위기가 살아나네요.\n사이즈가 생각보다 작아요. 다시 큰 걸로 살까 고민중..."}
            style={{
              width: '100%', minHeight: 160,
              fontSize: 11, fontFamily: 'monospace',
              padding: 8, border: '1px solid #cbd5e1', borderRadius: 6,
              resize: 'vertical',
            }}
          />
          <div style={{ fontSize: 10, color: '#64748b', marginTop: 4 }}>
            💡 한 줄 = 리뷰 1개로 인식합니다. (현재 {pastedText.split(/\r?\n/).filter(Boolean).length}줄)
          </div>
        </div>
      )}

      {/* 분석 실행 버튼 */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <div style={{ fontSize: 11, color: '#475569', flex: 1 }}>
          분석 대상: <b style={{ color: reviewCount >= 3 ? '#16a34a' : '#dc2626' }}>{reviewCount}개</b> 리뷰
          {reviewCount > 200 && (
            <span style={{ marginLeft: 6, color: '#f59e0b' }}>(앞 200개만 분석)</span>
          )}
        </div>
        <button onClick={runAnalysis}
          disabled={analyzing || reviewCount < 3 || !apiKey}
          style={{
            padding: '8px 14px',
            backgroundColor: analyzing ? '#94a3b8' : (reviewCount < 3 || !apiKey ? '#cbd5e1' : '#3b82f6'),
            color: '#fff', border: 'none', borderRadius: 6,
            fontSize: 12, fontWeight: 800,
            cursor: analyzing || reviewCount < 3 || !apiKey ? 'not-allowed' : 'pointer',
          }}
        >
          {analyzing ? '🔍 분석 중...' : '🔍 AI 분석 시작'}
        </button>
        {result && (
          <button onClick={resetAll}
            style={{
              padding: '8px 10px', backgroundColor: '#f3f4f6',
              color: '#475569', border: '1px solid #e2e8f0', borderRadius: 6,
              fontSize: 11, fontWeight: 700, cursor: 'pointer',
            }}
          >
            🗑 초기화
          </button>
        )}
      </div>

      {error && (
        <div style={{
          backgroundColor: '#fee2e2', border: '1px solid #fecaca',
          padding: '6px 10px', borderRadius: 6, fontSize: 11, color: '#991b1b',
        }}>
          ⚠️ {error}
        </div>
      )}

      {/* 분석 결과 */}
      {result && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 4 }}>
          {/* 요약 */}
          {result.summary && (
            <div style={{
              backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0',
              padding: 10, borderRadius: 8,
            }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#166534', marginBottom: 4 }}>
                📋 전체 요약 {result.meta?.totalCount && `(리뷰 ${result.meta.totalCount}개 분석)`}
              </div>
              <div style={{ fontSize: 12, color: '#1e293b', lineHeight: 1.5 }}>
                {result.summary}
              </div>
            </div>
          )}

          {/* 페인포인트 */}
          {result.painPoints?.length > 0 && (
            <ResultBox title="😰 페인포인트 Top 3 (불만 사항)" color="#dc2626" bg="#fef2f2" border="#fecaca">
              {result.painPoints.map((p, i) => (
                <PointItem key={i} rank={p.rank || i + 1} title={p.title} desc={p.desc} freq={p.freq} color="#dc2626" />
              ))}
            </ResultBox>
          )}

          {/* 긍정포인트 */}
          {result.positivePoints?.length > 0 && (
            <ResultBox title="😍 긍정포인트 Top 3 (구매 결정 이유)" color="#16a34a" bg="#f0fdf4" border="#bbf7d0">
              {result.positivePoints.map((p, i) => (
                <PointItem key={i} rank={p.rank || i + 1} title={p.title} desc={p.desc} freq={p.freq} color="#16a34a" />
              ))}
            </ResultBox>
          )}

          {/* 타겟 고객 */}
          {result.targetCustomers?.length > 0 && (
            <ResultBox title="🎯 타겟 고객 Top 3" color="#2563eb" bg="#eff6ff" border="#bfdbfe">
              {result.targetCustomers.map((t, i) => (
                <div key={i} style={{ marginBottom: i === result.targetCustomers.length - 1 ? 0 : 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: '#1e3a8a', marginBottom: 2 }}>
                    {i + 1}. {t.who}
                  </div>
                  <div style={{ fontSize: 11, color: '#475569', lineHeight: 1.5 }}>
                    🕒 <b>{t.when}</b> · 🎯 <b>{t.purpose}</b>
                  </div>
                </div>
              ))}
            </ResultBox>
          )}

          {/* 마케팅 헤드라인 채택 UI */}
          {result.headlines?.length > 0 && (
            <ResultBox
              title={`✨ 마케팅 강조 문구 ${result.headlines.length}개 (채택 / 거절)`}
              color="#7c3aed" bg="#faf5ff" border="#e9d5ff"
              right={
                <button onClick={applyAdopted}
                  title="채택된 문구를 좌측 '내 메모'에 자동 추가합니다. 다음 페이지 생성 시 AI가 이 문구를 참고합니다."
                  style={{
                    padding: '4px 8px', backgroundColor: '#7c3aed', color: '#fff',
                    border: 'none', borderRadius: 4, fontSize: 10, fontWeight: 800, cursor: 'pointer',
                  }}
                >✅ 채택된 문구 적용</button>
              }
            >
              <div style={{ fontSize: 10, color: '#64748b', marginBottom: 6 }}>
                💡 페인포인트를 해결한다는 메시지로 작성된 문구입니다. <b>✓ 채택</b> 후 상세페이지(P1 헤드라인·P2 강점카드)에 붙여넣으세요.
              </div>
              {result.headlines.map((h) => (
                <HeadlineItem key={h.id} h={h}
                  adopted={!!adopted[h.id]}
                  onToggle={() => toggleAdopt(h.id)}
                />
              ))}
            </ResultBox>
          )}

          {/* 키워드 Top 20 */}
          {result.keywords?.length > 0 && (
            <ResultBox
              title={`🏷 자주 등장하는 키워드 Top ${result.keywords.length}`}
              color="#ea580c" bg="#fff7ed" border="#fed7aa"
              right={
                <button onClick={() => onAddKeywordsToSearch(result.keywords)}
                  style={{
                    padding: '4px 8px', backgroundColor: '#ea580c', color: '#fff',
                    border: 'none', borderRadius: 4, fontSize: 10, fontWeight: 800, cursor: 'pointer',
                  }}
                  title="검색량 추천 키워드에 추가"
                >➕ 검색 키워드에 추가</button>
              }
            >
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {result.keywords.map((k, i) => {
                  const cBg = {
                    '장점': '#dcfce7', '단점': '#fee2e2', '용도': '#dbeafe',
                    '감성': '#fce7f3', '기타': '#f3f4f6',
                  }[k.category] || '#f3f4f6';
                  const cFg = {
                    '장점': '#166534', '단점': '#991b1b', '용도': '#1e3a8a',
                    '감성': '#9d174d', '기타': '#475569',
                  }[k.category] || '#475569';
                  return (
                    <span key={i}
                      onClick={() => navigator.clipboard.writeText(k.keyword)}
                      title={`${k.category} · ${k.count || '?'}회 등장 · 클릭하여 복사`}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        padding: '3px 7px', backgroundColor: cBg, color: cFg,
                        borderRadius: 12, fontSize: 11, fontWeight: 700,
                        border: '1px solid rgba(0,0,0,0.05)', cursor: 'pointer',
                      }}
                    >
                      {k.keyword}
                      {k.count && <span style={{ fontSize: 9, opacity: 0.7 }}>×{k.count}</span>}
                    </span>
                  );
                })}
              </div>
            </ResultBox>
          )}
        </div>
      )}
    </div>
  );
}

// ── 결과 박스 공통 ──
function ResultBox({ title, color, bg, border, right, children }) {
  return (
    <div style={{
      backgroundColor: bg, border: `1px solid ${border}`,
      padding: 10, borderRadius: 8,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color }}>{title}</div>
        {right}
      </div>
      {children}
    </div>
  );
}

function PointItem({ rank, title, desc, freq, color }) {
  return (
    <div style={{ marginBottom: 6, paddingBottom: 6, borderBottom: '1px dashed rgba(0,0,0,0.08)' }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: '#1e293b' }}>
        <span style={{
          display: 'inline-block', minWidth: 18, textAlign: 'center',
          backgroundColor: color, color: '#fff', borderRadius: 4,
          padding: '0 4px', marginRight: 5, fontSize: 10,
        }}>{rank}</span>
        {title}
        {freq && (
          <span style={{
            marginLeft: 6, fontSize: 9, padding: '1px 5px',
            backgroundColor: '#fff', color, borderRadius: 8,
            border: `1px solid ${color}33`, fontWeight: 700,
          }}>{freq}</span>
        )}
      </div>
      <div style={{ fontSize: 11, color: '#475569', lineHeight: 1.5, marginTop: 2 }}>
        {desc}
      </div>
    </div>
  );
}

function HeadlineItem({ h, adopted, onToggle }) {
  return (
    <div style={{
      display: 'flex', gap: 8, alignItems: 'flex-start',
      padding: 8, marginBottom: 4,
      backgroundColor: adopted ? '#f0fdf4' : '#fff',
      border: adopted ? '2px solid #16a34a' : '1px solid #e2ddd4',
      borderRadius: 6,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 9, color: '#94a3b8', marginBottom: 2 }}>
          🩹 해결: {h.painPointTitle}
        </div>
        <div style={{ fontSize: 13, fontWeight: 800, color: '#1e293b', lineHeight: 1.3 }}>
          "{h.headline}"
        </div>
        <div style={{ fontSize: 11, color: '#475569', lineHeight: 1.5, marginTop: 2 }}>
          {h.body}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
        <button onClick={onToggle}
          style={{
            padding: '4px 8px',
            backgroundColor: adopted ? '#16a34a' : '#f3f4f6',
            color: adopted ? '#fff' : '#475569',
            border: '1px solid ' + (adopted ? '#15803d' : '#cbd5e1'),
            borderRadius: 4, fontSize: 10, fontWeight: 800, cursor: 'pointer',
            minWidth: 60,
          }}
        >
          {adopted ? '✓ 채택됨' : '✓ 채택'}
        </button>
        <button onClick={() => navigator.clipboard.writeText(`${h.headline}\n${h.body}`)}
          style={{
            padding: '4px 8px',
            backgroundColor: '#fff', color: '#475569',
            border: '1px solid #cbd5e1', borderRadius: 4,
            fontSize: 10, fontWeight: 700, cursor: 'pointer',
          }}
          title="클립보드에 복사"
        >📋 복사</button>
      </div>
    </div>
  );
}
