/**
 * history.js - History 画面の UI 制御
 * 一覧・フィルタ・詳細・リプレイ・削除
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
        showError('history-error', '履歴の読み込みに失敗しました: ' + (err.message || err));
      });
  }

  function fillFilterKana() {
    const kanaSet = new Set(historyRecords.map(r => r.kana).filter(Boolean));
    const sel = document.getElementById('filter-kana');
    if (!sel) return;
    const current = sel.value;
    sel.innerHTML = '<option value="">全てのかな</option>';
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
    list.forEach(r => {
      const div = document.createElement('div');
      div.className = 'history-item';
      div.dataset.id = r.id;
      const vLabel = { green: '合格', yellow: 'おしい', red: 'もう一回' }[r.verdict] || '';
      div.innerHTML = `
        <div class="history-item-header">
          <span class="history-item-kana">${escapeHtml(r.kana)}</span>
          <span class="history-item-verdict ${r.verdict || ''}">${vLabel}</span>
        </div>
        <div class="history-item-meta">
          ${formatDate(r.timestamp)} | ${escapeHtml(r.romaji)} | ${r.difficulty} | ${r.score}点
        </div>
      `;
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
      infoEl.innerHTML = `
        <p>${escapeHtml(r.kana)} → ${escapeHtml(r.romaji)}</p>
        <p>日時: ${formatDate(r.timestamp)}</p>
        <p>難易度: ${r.difficulty} | スコア: ${r.score} | ${{ green: '合格', yellow: 'おしい', red: 'もう一回' }[r.verdict]}</p>
        <p>許容ゾーン: ${r.settings?.zoneWidth ?? '—'}px | 補正: ${r.settings?.smoothing ?? '—'} | 合格ライン: ${r.settings?.passLine ?? '—'}%</p>
      `;
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
        if (!confirm('全ての履歴を削除しますか？')) return;
        deleteAllRecords()
          .then(() => { loadHistory(); closeHistoryDetail(); })
          .catch(err => showError('history-error', '削除に失敗: ' + (err.message || err)));
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
        if (!confirm('この1件を削除しますか？')) return;
        deleteRecord(selectedHistoryId)
          .then(() => {
            historyRecords = historyRecords.filter(rec => rec.id !== selectedHistoryId);
            renderHistoryList();
            fillFilterKana();
            closeHistoryDetail();
          })
          .catch(err => showError('history-error', '削除に失敗: ' + (err.message || err)));
      });
    }
  }

  global.History = {
    init,
    loadHistory
  };
})(typeof window !== 'undefined' ? window : this);
