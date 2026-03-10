/**
 * history.js - History 逕ｻ髱｢縺ｮ UI 蛻ｶ蠕｡
 * 荳隕ｧ繝ｻ繝輔ぅ繝ｫ繧ｿ繝ｻ隧ｳ邏ｰ繝ｻ繝ｪ繝励Ξ繧､繝ｻ蜑企勁
 */

(function (global) {
  'use strict';

  let historyRecords = [];
  let selectedHistoryId = null;
  let historyBound = false;

  function init() {
    loadHistory();
    bindHistory();
  }

  function loadHistory() {
    clearError('history-error');
    getAllRecords()
      .then(records => {
        historyRecords = records;
        renderHistoryList();
        fillFilterKana();
      })
      .catch(err => {
        showError('history-error', '\u5c65\u6b74\u306e\u8aad\u307f\u8fbc\u307f\u306b\u5931\u6557\u3057\u307e\u3057\u305f: ' + (err.message || err));
      });
  }

  function fillFilterKana() {
    const kanaSet = new Set(historyRecords.map(r => r.kana).filter(Boolean));
    const sel = document.getElementById('filter-kana');
    if (!sel) return;
    const current = sel.value;
    sel.innerHTML = '<option value="">\u3059\u3079\u3066</option>';
    [...kanaSet].sort().forEach(k => {
      const opt = document.createElement('option');
      opt.value = k;
      opt.textContent = k;
      sel.appendChild(opt);
    });
    sel.value = current || '';
  }

  function getFilteredHistory() {
    const kana = document.getElementById('filter-kana')?.value;
    const diff = document.getElementById('filter-difficulty')?.value;
    const verdict = document.getElementById('filter-verdict')?.value;
    return historyRecords.filter(r => {
      if (kana && r.kana !== kana) return false;
      if (diff && r.difficulty !== diff) return false;
      if (verdict && r.verdict !== verdict) return false;
      return true;
    });
  }

  function renderHistoryList() {
    const list = getFilteredHistory();
    const container = document.getElementById('history-list');
    if (!container) return;
    container.innerHTML = '';

    const summary = document.createElement('div');
    summary.className = 'history-summary-card';
    const best = list.reduce((m, r) => Math.max(m, r.score || 0), 0);
    summary.textContent = '\u4ef6\u6570: ' + list.length + ' / \u6700\u9ad8: ' + best + '\u70b9';
    container.appendChild(summary);

    list.forEach(r => {
      const div = document.createElement('div');
      div.className = 'history-item';
      div.dataset.id = r.id;
      const vLabel = { green: '\u5408\u683c', yellow: '\u304a\u3057\u3044', red: '\u3082\u3046\u4e00\u56de' }[r.verdict] || ''; 
      const score = Math.max(0, Math.min(100, Math.round(r.score || 0)));
      div.innerHTML =
        '<div class=\"history-item-header\">' +
          '<span class=\"history-item-kana\">' + escapeHtml(r.kana) + '</span>' +
          '<span class=\"history-item-verdict ' + (r.verdict || '') + '\">' + vLabel + '</span>' +
        '</div>' +
        '<div class=\"history-item-meta\">' +
          formatDate(r.timestamp) + ' | ' + escapeHtml(r.romaji) + ' | ' + r.difficulty + ' | ' + score + '\u70b9' +
        '</div>' +
        '<div class=\"history-score-track\"><span class=\"history-score-fill\" style=\"width:' + score + '%\"></span></div>';
      div.addEventListener('click', () => showHistoryDetail(r.id));
      container.appendChild(div);
    });
  }

  function showHistoryDetail(id) {
    selectedHistoryId = id;
    const r = historyRecords.find(rec => rec.id === id);
    if (!r) return;
    const detail = document.getElementById('history-detail');
    const infoEl = document.getElementById('detail-info');
    if (detail) detail.classList.remove('hidden');
    if (infoEl) {
      // Build detail with textContent to avoid HTML/script injection from stored values.
      infoEl.textContent = '';
      const verdictLabel = { green: '\u5408\u683c', yellow: '\u304a\u3057\u3044', red: '\u3082\u3046\u4e00\u56de' }[r.verdict] || ''; 
      const lines = [
        String(r.kana || '') + ' - ' + String(r.romaji || ''),
        '\u65e5\u6642: ' + formatDate(r.timestamp),
        '\u96e3\u6613\u5ea6: ' + String(r.difficulty || '-') + ' | \u30b9\u30b3\u30a2: ' + String(r.score ?? 0) + '\u70b9 | ' + verdictLabel,
        '\u8a2d\u5b9a: \u5e45 ' + String(r.settings?.zoneWidth ?? '-') + 'px | \u88dc\u6b63 ' + String(r.settings?.smoothing ?? '-') + ' | \u5408\u683c\u7dda ' + String(r.settings?.passLine ?? '-') + '%'
      ];
      lines.forEach(function (line) {
        const p = document.createElement('p');
        p.textContent = line;
        infoEl.appendChild(p);
      });
    }
  }

  function closeHistoryDetail() {
    const detail = document.getElementById('history-detail');
    if (detail) detail.classList.add('hidden');
    selectedHistoryId = null;
  }

  function playReplay() {
    if (!selectedHistoryId || typeof Draw === 'undefined') return;
    const r = historyRecords.find(rec => rec.id === selectedHistoryId);
    const strokesForReplay = (r && r.strokes && r.strokes.length > 0)
      ? r.strokes
      : (r && r.points && r.points.length >= 2 ? [{ points: r.points }] : null);
    if (!strokesForReplay || strokesForReplay.length === 0) return;

    const replayInfo = Draw.initReplayCanvas('replay-canvas');
    if (!replayInfo) return;
    const { ctx: rCtx, width: rW, height: rH } = replayInfo;

    const origW = r.canvasWidth || 400;
    const origH = r.canvasHeight || 300;
    const sx = rW / origW;
    const sy = rH / origH;
    const scaledStrokes = strokesForReplay.map(s => ({
      points: (s.points || s).map(p => ({ ...p, x: p.x * sx, y: p.y * sy }))
    }));

    const speed = parseFloat(document.getElementById('replay-speed')?.value || '1');
    const showTemplate = document.getElementById('replay-show-template')?.checked;
    let templateInfo = null;
    if (showTemplate && r.templateRomaji && r.templateLayout) {
      const L = r.templateLayout;
      templateInfo = {
        romaji: r.templateRomaji,
        font: L.font ? L.font.replace(/\d+px/, Math.round((L.fontSize || 48) * Math.min(sx, sy)) + 'px') : undefined,
        fontSize: Math.round((L.fontSize || 48) * Math.min(sx, sy)),
        textX: (L.textX != null ? L.textX * sx : 0),
        textY: (L.textY != null ? L.textY * sy : rH * 0.5)
      };
    }

    Draw.replayPoints(rCtx, rW, rH, scaledStrokes, speed, showTemplate, templateInfo, () => {});
  }

  function bindHistory() {
    if (historyBound) return;
    historyBound = true;

    const fKana = document.getElementById('filter-kana');
    const fDiff = document.getElementById('filter-difficulty');
    const fVerdict = document.getElementById('filter-verdict');
    if (fKana) fKana.addEventListener('change', renderHistoryList);
    if (fDiff) fDiff.addEventListener('change', renderHistoryList);
    if (fVerdict) fVerdict.addEventListener('change', renderHistoryList);

    const btnDelAll = document.getElementById('btn-delete-all');
    if (btnDelAll) {
      btnDelAll.addEventListener('click', () => {
        if (!confirm('\u5c65\u6b74\u3092\u3059\u3079\u3066\u524a\u9664\u3057\u307e\u3059\u3002\u3088\u308d\u3057\u3044\u3067\u3059\u304b\uff1f')) return;
        deleteAllRecords()
          .then(() => { loadHistory(); closeHistoryDetail(); })
          .catch(err => showError('history-error', '\u524a\u9664\u306b\u5931\u6557: ' + (err.message || err)));
      });
    }

    const btnPlay = document.getElementById('btn-replay-play');
    if (btnPlay) btnPlay.addEventListener('click', playReplay);
    const btnClose = document.getElementById('btn-replay-close');
    if (btnClose) btnClose.addEventListener('click', closeHistoryDetail);

    const btnDelOne = document.getElementById('btn-delete-one');
    if (btnDelOne) {
      btnDelOne.addEventListener('click', () => {
        if (!selectedHistoryId) return;
        if (!confirm('\u3053\u306e\u5c65\u6b74\u3092\u524a\u9664\u3057\u307e\u3059\u3002\u3088\u308d\u3057\u3044\u3067\u3059\u304b\uff1f')) return;
        deleteRecord(selectedHistoryId)
          .then(() => {
            historyRecords = historyRecords.filter(rec => rec.id !== selectedHistoryId);
            renderHistoryList();
            fillFilterKana();
            closeHistoryDetail();
          })
          .catch(err => showError('history-error', '\u524a\u9664\u306b\u5931\u6557: ' + (err.message || err)));
      });
    }
  }

  global.History = {
    init,
    loadHistory
  };
})(typeof window !== 'undefined' ? window : this);
