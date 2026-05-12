/**
 * 프로젝트 저장/복원 시스템
 *
 * 두 가지 저장소를 분리해서 사용:
 *  - localStorage: 작고 자주 쓰는 데이터 (브리프, 텍스트, 설정, 오버라이드)
 *  - IndexedDB:    이미지 base64 (대용량, 5MB+)
 *
 * 자동 저장: 1초 debounce
 * 수동 저장/복원: JSON 파일 export/import (이미지 base64 포함, 다른 PC 이동 가능)
 */

// ─── localStorage 키 ────────────────────────────────────
const LS_PROJECT_KEY = 'coupang_agent_project_v1';
const LS_LAST_SAVED_KEY = 'coupang_agent_last_saved_v1';

// ─── IndexedDB 설정 ────────────────────────────────────
const DB_NAME = 'coupang_agent_db';
const DB_VERSION = 1;
const STORE_IMAGES = 'images';

let _dbPromise = null;
function openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB 미지원 환경'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_IMAGES)) {
        db.createObjectStore(STORE_IMAGES, { keyPath: 'id' });
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
  return _dbPromise;
}

// 이미지 한 장 저장: { id, dataUrl }
async function idbPutImage(id, dataUrl) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_IMAGES, 'readwrite');
    const store = tx.objectStore(STORE_IMAGES);
    const req = store.put({ id, dataUrl, savedAt: Date.now() });
    req.onsuccess = () => resolve();
    req.onerror = (e) => reject(e.target.error);
  });
}

async function idbGetImage(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_IMAGES, 'readonly');
    const store = tx.objectStore(STORE_IMAGES);
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = (e) => reject(e.target.error);
  });
}

async function idbGetAllImages() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_IMAGES, 'readonly');
    const store = tx.objectStore(STORE_IMAGES);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = (e) => reject(e.target.error);
  });
}

async function idbClearImages() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_IMAGES, 'readwrite');
    const store = tx.objectStore(STORE_IMAGES);
    const req = store.clear();
    req.onsuccess = () => resolve();
    req.onerror = (e) => reject(e.target.error);
  });
}

async function idbDeleteImage(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_IMAGES, 'readwrite');
    const store = tx.objectStore(STORE_IMAGES);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = (e) => reject(e.target.error);
  });
}

// ─── 이미지 ID 처리 ────────────────────────────────────
// images 배열은 [base64, base64, ...] 또는 [{id, src}, ...] 형태일 수 있음.
// 저장 시: base64는 IndexedDB로, state엔 'idb:abc123' 같은 참조 ID만 저장.
// 복원 시: 'idb:xxx' 참조를 IndexedDB에서 base64로 다시 읽어옴.

function isDataUrl(v) {
  return typeof v === 'string' && v.startsWith('data:');
}
function isIdbRef(v) {
  return typeof v === 'string' && v.startsWith('idb:');
}
function newImageId() {
  return 'img_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

/**
 * images 배열에서 base64 데이터를 IndexedDB로 옮기고,
 * state에는 참조 ID 'idb:xxx'만 남긴 배열을 반환.
 *
 * @param {Array<string|null|undefined>} images
 * @returns {Promise<Array<string|null>>}  변환된 배열
 */
export async function persistImagesToIDB(images) {
  if (!Array.isArray(images)) return [];
  const result = [];
  for (const img of images) {
    if (!img) {
      result.push(img);
      continue;
    }
    if (isIdbRef(img)) {
      // 이미 ID 형태 → 그대로
      result.push(img);
    } else if (isDataUrl(img)) {
      // base64 → IDB에 저장 후 ID 반환
      const id = newImageId();
      try {
        await idbPutImage(id, img);
        result.push('idb:' + id);
      } catch (e) {
        console.warn('IDB 이미지 저장 실패, 원본 유지:', e);
        result.push(img); // 실패 시 원본 유지
      }
    } else {
      // 그 외 (URL 등) → 그대로
      result.push(img);
    }
  }
  return result;
}

/**
 * state로 들어온 'idb:xxx' 참조들을 실제 base64 dataUrl로 복원.
 *
 * @param {Array<string|null>} images
 * @returns {Promise<Array<string|null>>}
 */
export async function hydrateImagesFromIDB(images) {
  if (!Array.isArray(images)) return [];
  const result = [];
  for (const img of images) {
    if (!img) { result.push(img); continue; }
    if (isIdbRef(img)) {
      const id = img.slice(4);
      try {
        const rec = await idbGetImage(id);
        result.push(rec?.dataUrl || null);
      } catch {
        result.push(null);
      }
    } else {
      result.push(img);
    }
  }
  return result;
}

// 사용되지 않는 IDB 이미지 청소 (현재 images 배열에서 참조되지 않는 것 삭제)
export async function cleanupOrphanImages(currentImages) {
  if (!Array.isArray(currentImages)) return;
  const usedIds = new Set(
    currentImages.filter(isIdbRef).map((s) => s.slice(4))
  );
  try {
    const all = await idbGetAllImages();
    for (const rec of all) {
      if (!usedIds.has(rec.id)) {
        await idbDeleteImage(rec.id);
      }
    }
  } catch (e) {
    console.warn('orphan 청소 실패:', e);
  }
}

// ─── 메인 저장/복원 API ────────────────────────────────────

/**
 * 프로젝트 전체 상태를 localStorage + IndexedDB에 저장
 *
 * @param {Object} state - { brief, images, pages, currentPage, pageVariants,
 *                           textOverrides, imageOverrides, p5Version,
 *                           revisionHistory }
 */
export async function saveProject(state) {
  // 1. 이미지: base64 → IDB로 옮기고 ID만 보관
  const imagesAsRefs = await persistImagesToIDB(state.images || []);

  // 2. 나머지 데이터는 localStorage (JSON)
  const lsPayload = {
    version: 1,
    brief: state.brief || null,
    images: imagesAsRefs,
    pages: state.pages || {},
    currentPage: state.currentPage || 'P1',
    pageVariants: state.pageVariants || {},
    textOverrides: state.textOverrides || {},
    imageOverrides: state.imageOverrides || {},
    freeImages: state.freeImages || {},
    layerNames: state.layerNames || {},
    p5Version: state.p5Version || 'text',
    revisionHistory: state.revisionHistory || {},
    reviewInsights: state.reviewInsights || null,
    reviewAnalyzerSnapshot: state.reviewAnalyzerSnapshot || null,
    savedAt: Date.now(),
  };
  try {
    localStorage.setItem(LS_PROJECT_KEY, JSON.stringify(lsPayload));
    localStorage.setItem(LS_LAST_SAVED_KEY, String(lsPayload.savedAt));
  } catch (e) {
    console.error('localStorage 저장 실패:', e);
    throw new Error('자동 저장 실패: localStorage 용량 초과 가능성');
  }

  return { savedAt: lsPayload.savedAt, imagesAsRefs };
}

/**
 * 저장된 프로젝트를 복원 — 이미지 base64까지 hydration
 *
 * @returns {Promise<Object|null>}
 */
export async function loadProject() {
  let raw = null;
  try {
    raw = localStorage.getItem(LS_PROJECT_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  // 이미지 ID 배열을 다시 base64로 hydrate
  const hydratedImages = await hydrateImagesFromIDB(parsed.images || []);
  return {
    ...parsed,
    images: hydratedImages,
  };
}

export function getLastSaved() {
  try {
    const ts = localStorage.getItem(LS_LAST_SAVED_KEY);
    return ts ? parseInt(ts, 10) : null;
  } catch {
    return null;
  }
}

/**
 * 프로젝트 전체 초기화 (localStorage + IndexedDB)
 */
export async function clearProject() {
  try {
    localStorage.removeItem(LS_PROJECT_KEY);
    localStorage.removeItem(LS_LAST_SAVED_KEY);
  } catch {}
  try {
    await idbClearImages();
  } catch (e) {
    console.warn('IDB 초기화 실패:', e);
  }
}

// ─── JSON Export / Import (다른 PC 이동용) ────────────────────────────────────

/**
 * 현재 상태를 JSON 객체로 직렬화 — 이미지 base64 그대로 포함 (다른 PC에서도 사용 가능)
 *
 * @param {Object} state
 * @returns {Object} JSON-serializable 객체
 */
export function exportProjectToJSON(state) {
  // images는 base64 그대로 포함 (외부에서 IDB 없이도 복원 가능하게)
  return {
    formatVersion: 1,
    appName: 'coupang-detail-agent',
    exportedAt: new Date().toISOString(),
    brief: state.brief || null,
    images: state.images || [],   // 모두 base64 또는 URL (idb:xxx 형태 X)
    pages: state.pages || {},
    currentPage: state.currentPage || 'P1',
    pageVariants: state.pageVariants || {},
    textOverrides: state.textOverrides || {},
    imageOverrides: state.imageOverrides || {},
    freeImages: state.freeImages || {},
    layerNames: state.layerNames || {},
    p5Version: state.p5Version || 'text',
    revisionHistory: state.revisionHistory || {},
    reviewInsights: state.reviewInsights || null,
    reviewAnalyzerSnapshot: state.reviewAnalyzerSnapshot || null,
  };
}

/**
 * JSON 파일을 다운로드 트리거
 */
export function downloadProjectJSON(state, filename) {
  const data = exportProjectToJSON(state);
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || `coupang-project-${new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-')}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * 파일 입력 → JSON 파싱 → state 객체 반환
 *
 * @param {File} file
 * @returns {Promise<Object>}
 */
export function readProjectJSONFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (data.appName !== 'coupang-detail-agent') {
          // 호환성을 위해 경고만 하고 진행
          console.warn('이 파일이 우리 앱에서 만든 것이 아닐 수 있습니다.');
        }
        resolve(data);
      } catch (err) {
        reject(new Error('파일을 읽을 수 없습니다. 손상되었거나 JSON 형식이 아닙니다.'));
      }
    };
    reader.onerror = () => reject(new Error('파일 읽기 실패'));
    reader.readAsText(file);
  });
}

// ─── Debounce 유틸 ────────────────────────────────────
export function debounce(fn, wait = 1000) {
  let t = null;
  const debounced = (...args) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => {
      t = null;
      fn(...args);
    }, wait);
  };
  debounced.flush = () => {
    if (t) {
      clearTimeout(t);
      t = null;
      fn();
    }
  };
  debounced.cancel = () => {
    if (t) {
      clearTimeout(t);
      t = null;
    }
  };
  return debounced;
}
