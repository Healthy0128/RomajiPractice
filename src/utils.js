/**
 * utils.js - ユーティリティ関数
 */

/**
 * エラーメッセージを画面に表示する（コンソールだけにしない）
 * @param {string} elementId - 表示先要素のID
 * @param {string} message - 表示するメッセージ
 */
function showError(elementId, message) {
  const el = document.getElementById(elementId);
  if (el) {
    el.textContent = message;
    el.style.display = message ? 'block' : 'none';
  }
  if (message) {
    console.error(`[${elementId}]`, message);
  }
}

/**
 * クリアエラー表示
 */
function clearError(elementId) {
  showError(elementId, '');
}

/**
 * 点列を間引きして保存用に圧縮する
 * @param {Array<{x:number,y:number,t:number}>} points
 * @param {number} maxPoints - 最大点数（例: 300）
 * @param {number} minDist - 間引き時の最小距離
 * @returns {Array<{x:number,y:number,t:number}>}
 */
function compressPoints(points, maxPoints = 300, minDist = 2) {
  if (points.length <= maxPoints) return points;

  const result = [];
  const step = (points.length - 1) / (maxPoints - 1);
  for (let i = 0; i < maxPoints; i++) {
    const idx = Math.min(Math.floor(i * step), points.length - 1);
    result.push({ ...points[idx] });
  }
  return result;
}

/**
 * 点列を一定距離で間引き（形状チェック用）
 * @param {Array<{x:number,y:number}>} points
 * @param {number} minDist
 * @param {number} maxPoints
 */
function resamplePoints(points, minDist = 3, maxPoints = 300) {
  if (points.length <= 1) return points;
  const result = [points[0]];
  let last = points[0];
  for (let i = 1; i < points.length && result.length < maxPoints; i++) {
    const d = Math.hypot(points[i].x - last.x, points[i].y - last.y);
    if (d >= minDist) {
      result.push(points[i]);
      last = points[i];
    }
  }
  return result;
}

/**
 * 2点間の距離
 */
function dist(p1, p2) {
  return Math.hypot(p2.x - p1.x, p2.y - p1.y);
}

/**
 * 線形補間
 */
function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * HTMLエスケープ
 */
function escapeHtml(s) {
  if (s == null) return '';
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

/**
 * 日時フォーマット
 */
function formatDate(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleString('ja-JP');
}
