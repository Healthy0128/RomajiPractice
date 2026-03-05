/**
 * practice.js - Practice 画面の UI 制御
 * 文字選択・難易度・スライダー・判定・文字別履歴プレビュー（最新10件）・オーバーレイ
 */

(function (global) {
  'use strict';

  let currentKana = 'あ';
  let practiceBound = false;

  // 文字ごとの達成状況（localStorage 保存用）
  // progressMap: { [kana: string]: { bestScore: number, lastScore: number, updatedAt: number } }
  const PROGRESS_KEY = 'progress_v1';
  let progressMap = null;

  function ensureProgressLoaded() {
    if (progressMap != null) return;
    try {
      const raw = (typeof localStorage !== 'undefined') ? localStorage.getItem(PROGRESS_KEY) : null;
      progressMap = raw ? JSON.parse(raw) || {} : {};
    } catch (e) {
      progressMap = {};
    }
  }

  function saveProgress() {
    if (typeof localStorage === 'undefined' || !progressMap) return;
    try {
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(progressMap));
    } catch (e) {
      // ignore
    }
  }

  function applyProgressStyles(btn, kana) {
    if (!btn || !kana) return;
    ensureProgressLoaded();
    btn.classList.remove('achieved80', 'achieved90');
    const rec = progressMap[kana];
    if (!rec || typeof rec.bestScore !== 'number') return;
    if (rec.bestScore >= 80) btn.classList.add('achieved80');
    if (rec.bestScore >= 90) btn.classList.add('achieved90');
  }

  function refreshAllProgressStyles() {
    const grid = document.getElementById('char-grid');
    if (!grid) return;
    ensureProgressLoaded();
    grid.querySelectorAll('.char-btn').forEach(btn => {
      const kana = btn.dataset.kana;
      if (!kana) return;
      applyProgressStyles(btn, kana);
    });
  }

  function updateProgressOnCheck(kana, score) {
    if (!kana || typeof score !== 'number' || isNaN(score)) return;
    ensureProgressLoaded();
    const now = Date.now();
    const prev = progressMap[kana] || { bestScore: 0, lastScore: 0, updatedAt: 0 };
    const bestScore = Math.max(prev.bestScore || 0, score);
    progressMap[kana] = {
      bestScore,
      lastScore: score,
      updatedAt: now
    };
    saveProgress();
    refreshAllProgressStyles();
  }

  function init(initialKana) {
    if (typeof Draw === 'undefined') return;
    if (initialKana) {
      currentKana = initialKana;
      const cat = typeof getCategoryForKana === 'function' ? getCategoryForKana(initialKana) : 'basic';
      const catEl = document.getElementById('char-category');
      if (catEl && catEl.value !== cat) catEl.value = cat;
    }

    Draw.initCanvas('draw-canvas', 'feedback-canvas', 'template-canvas');
    Draw.setDifficultyGetter(() => document.getElementById('difficulty')?.value || 'trace');
    updateSettings();
    syncTemplate();
    Draw.clear();
    const diff = document.getElementById('difficulty')?.value;
    if (diff === 'fade') Draw.setFadeStart();

    document.getElementById('verdict-display').textContent = '';
    document.getElementById('verdict-display').className = 'verdict-display';
    Draw.clearFeedback();
    Draw.clearOverlay();
    clearError('practice-error');

    ensureProgressLoaded();
    buildCharGrid(document.getElementById('char-category')?.value || 'basic');
    bindPractice();
    refreshHistoryPreviewIfVisible();
    // 線の太さスライダーを現在値に合わせる
    const strokeInput = document.getElementById('stroke-width');
    const strokeValEl = document.getElementById('stroke-width-val');
    if (strokeInput && strokeValEl && typeof Draw.getUserStrokeWidth === 'function') {
      const w = Draw.getUserStrokeWidth();
      strokeInput.value = w;
      strokeValEl.textContent = w;
    }
  }

  function updateSettings() {
    const zoneWidth = parseInt(document.getElementById('zone-width')?.value || '20', 10);
    const smoothing = parseFloat(document.getElementById('smoothing')?.value || '0.5');
    Draw.setSettings({ zoneWidth, smoothing });
    const strokeW = document.getElementById('stroke-width');
    if (strokeW && strokeW.value !== '') {
      Draw.setSettings({ userStrokeWidth: parseInt(strokeW.value, 10) });
    }
  }

  /**
   * Tesseract.js の結果から「生テキスト」「1文字のアルファベット候補」「その信頼度」を取り出す
   * - 記号や数字は無視
   * - symbols があればそこから、なければ words / text から推定
   */
  function extractOcrInfo(ocrResult) {
    const info = { text: '', letter: '', confidence: 0 };
    if (!ocrResult || !ocrResult.data) return info;
    const data = ocrResult.data;
    info.text = (data.text || '').trim();

    function pushLetter(ch, conf) {
      if (!ch) return;
      const l = String(ch).toLowerCase();
      if (!/^[a-z]$/.test(l)) return;
      const c = (typeof conf === 'number' && isFinite(conf)) ? conf : 0;
      if (!info.letter || c > info.confidence) {
        info.letter = l;
        info.confidence = c;
      }
    }

    if (Array.isArray(data.symbols) && data.symbols.length > 0) {
      data.symbols.forEach(sym => {
        const ch = sym.text || sym.symbol || '';
        pushLetter(ch, sym.confidence);
      });
    } else if (Array.isArray(data.words) && data.words.length > 0) {
      data.words.forEach(word => {
        const text = word.text || '';
        const conf = word.confidence;
        for (let i = 0; i < text.length; i++) {
          pushLetter(text[i], conf);
        }
      });
    }

    if (!info.letter && info.text) {
      const lettersOnly = info.text.toLowerCase().replace(/[^a-z]/g, '');
      if (lettersOnly.length === 1) {
        info.letter = lettersOnly[0];
        const avgConf = (typeof data.confidence === 'number' && isFinite(data.confidence)) ? data.confidence : 0;
        info.confidence = avgConf;
      }
    }

    return info;
  }

  /**
   * 現在のストロークをポイントJSONとしてダウンロード
   */
  function exportPointsJson() {
    if (typeof Draw === 'undefined' || !Draw.getStrokes || !Draw.getCanvasSize) return;
    const strokes = Draw.getStrokes();
    const size = Draw.getCanvasSize();
    const data = getKanaData(currentKana);
    const obj = {
      kana: currentKana,
      romaji: data ? data.romaji : '',
      timestamp: Date.now(),
      canvasWidth: size ? size.width : 0,
      canvasHeight: size ? size.height : 0,
      strokes
    };
    const json = JSON.stringify(obj, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'strokes_' + (currentKana || '') + '_' + Date.now() + '.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  function syncTemplate() {
    const data = getKanaData(currentKana);
    const romajiForDraw = (data && data.romaji && !/^\(/.test(data.romaji)) ? data.romaji : '';
    const kanaEl = document.getElementById('current-kana');
    if (kanaEl) kanaEl.textContent = currentKana;
    Draw.setTemplate(romajiForDraw);
  }

  function buildCharGrid(category) {
    const list = getKanaByCategory(category);
    const grid = document.getElementById('char-grid');
    if (!grid) return;
    grid.innerHTML = '';

    // 清音は行構造（ア行〜ワ行＋ン）で並べる
    if (category === 'basic') {
      const rows = [
        ['あ', 'い', 'う', 'え', 'お'],
        ['か', 'き', 'く', 'け', 'こ'],
        ['さ', 'し', 'す', 'せ', 'そ'],
        ['た', 'ち', 'つ', 'て', 'と'],
        ['な', 'に', 'ぬ', 'ね', 'の'],
        ['は', 'ひ', 'ふ', 'へ', 'ほ'],
        ['ま', 'み', 'む', 'め', 'も'],
        ['や', '', 'ゆ', '', 'よ'],
        ['ら', 'り', 'る', 'れ', 'ろ'],
        ['わ', '', '', '', 'を'],
        ['ん', '', '', '', '']
      ];
      rows.forEach(row => {
        row.forEach(k => {
          if (!k) {
            const empty = document.createElement('div');
            empty.className = 'char-cell-empty';
            grid.appendChild(empty);
            return;
          }
          const btn = document.createElement('button');
          btn.className = 'char-btn' + (k === currentKana ? ' active' : '');
          btn.textContent = k;
          btn.dataset.kana = k;
          btn.addEventListener('click', () => handleKanaClick(k, grid));
          applyProgressStyles(btn, k);
          grid.appendChild(btn);
        });
      });
      return;
    }

    // それ以外のカテゴリは単純にカテゴリ順で並べる
    list.forEach(d => {
      const btn = document.createElement('button');
      btn.className = 'char-btn' + (d.kana === currentKana ? ' active' : '');
      btn.textContent = d.kana;
      btn.dataset.kana = d.kana;
      btn.addEventListener('click', () => handleKanaClick(d.kana, grid));
      applyProgressStyles(btn, d.kana);
      grid.appendChild(btn);
    });
  }

  function handleKanaClick(kana, grid) {
    currentKana = kana;
    if (grid) {
      grid.querySelectorAll('.char-btn').forEach(b => b.classList.remove('active'));
      const target = Array.prototype.find.call(grid.querySelectorAll('.char-btn'), b => b.dataset.kana === kana);
      if (target) target.classList.add('active');
    }
    syncTemplate();
    Draw.clear();
    Draw.clearOverlay();
    const verdictEl = document.getElementById('verdict-display');
    if (verdictEl) {
      verdictEl.textContent = '';
      verdictEl.className = 'verdict-display';
    }
    Draw.clearFeedback();
    if (document.getElementById('difficulty')?.value === 'fade') Draw.setFadeStart();
    Draw.redrawAll();
    refreshHistoryPreviewIfVisible();
  }

  function bindPractice() {
    if (practiceBound) return;
    practiceBound = true;

    const catEl = document.getElementById('char-category');
    if (catEl) catEl.addEventListener('change', e => { buildCharGrid(e.target.value); });

    const zoneEl = document.getElementById('zone-width');
    if (zoneEl) {
      zoneEl.addEventListener('input', e => {
        document.getElementById('zone-width-val').textContent = e.target.value;
        updateSettings();
        syncTemplate();
        Draw.redrawAll();
      });
    }
    const smoothEl = document.getElementById('smoothing');
    if (smoothEl) {
      smoothEl.addEventListener('input', e => {
        document.getElementById('smoothing-val').textContent = e.target.value;
        updateSettings();
      });
    }
    const passEl = document.getElementById('pass-line');
    if (passEl) passEl.addEventListener('input', e => { document.getElementById('pass-line-val').textContent = e.target.value; });

    const strokeWidthEl = document.getElementById('stroke-width');
    if (strokeWidthEl) {
      strokeWidthEl.addEventListener('input', e => {
        const val = e.target.value;
        const valEl = document.getElementById('stroke-width-val');
        if (valEl) valEl.textContent = val;
        Draw.setSettings({ userStrokeWidth: parseInt(val, 10) });
        Draw.redrawAll();
      });
    }

    const exportJsonBtn = document.getElementById('btn-export-json');
    if (exportJsonBtn) exportJsonBtn.addEventListener('click', exportPointsJson);

    const diffEl = document.getElementById('difficulty');
    if (diffEl) {
      diffEl.addEventListener('change', () => {
        Draw.resetFade();
        syncTemplate();
        Draw.clearFeedback();
        Draw.redrawAll();
      });
    }

    const checkBtn = document.getElementById('btn-check');
    if (checkBtn) checkBtn.addEventListener('click', doCheck);
    const clearBtn = document.getElementById('btn-clear');
    if (clearBtn) clearBtn.addEventListener('click', () => {
      Draw.resetFade();
      Draw.clear();
      Draw.clearOverlay();
      Draw.clearFeedback();
      hideOverlayButton();
      const v = document.getElementById('verdict-display');
      if (v) {
        v.textContent = '';
        v.className = 'verdict-display';
      }
      const panel = document.getElementById('grading-debug-panel');
      if (panel) panel.textContent = '';
    });
    const nextBtn = document.getElementById('btn-next');
    if (nextBtn) nextBtn.addEventListener('click', doNext);

    const historyToggle = document.getElementById('practice-history-toggle');
    if (historyToggle) {
      historyToggle.addEventListener('click', () => {
        const block = document.getElementById('practice-history-preview');
        if (!block) return;
        const show = block.classList.toggle('hidden');
        historyToggle.textContent = show ? '履歴を表示' : '履歴を隠す';
        if (!show) refreshHistoryPreview();
        // レイアウト変更後もテンプレ・4線と入力位置が一致するよう安全に同期＋再描画
        if (typeof Draw.syncCanvasToWrap === 'function') Draw.syncCanvasToWrap();
        Draw.redrawAll();
      });
    }
  }

  function doCheck() {
    updateSettings();
    const strokesData = Draw.getStrokes();
    const data = getKanaData(currentKana);
    const templateInfo = Draw.getTemplateForGrading();
    if (!templateInfo.romaji || templateInfo.romaji.length === 0) {
      showError('practice-error', 'この文字は手本がありません');
      return;
    }
    const passLine = parseInt(document.getElementById('pass-line')?.value || '70', 10);
    const difficulty = document.getElementById('difficulty')?.value || 'trace';
    const vEl = document.getElementById('verdict-display');

    function applyResult(result) {
      vEl.textContent = `${result.message}（${result.score}点）`;
      vEl.className = 'verdict-display ' + result.verdict;
      Draw.drawFeedback(result.outsidePixels);
      const debugToggle = document.getElementById('debug-bbox-toggle');
      if (debugToggle && debugToggle.checked && typeof Draw.drawDebugBoxes === 'function') {
        Draw.drawDebugBoxes(result.debug);
      }
      const gradingDebugToggle = document.getElementById('grading-debug-toggle');
      const panel = document.getElementById('grading-debug-panel');
      if (panel) {
        if (gradingDebugToggle && gradingDebugToggle.checked) {
          const inside = result.inside ?? 0;
          const outside = result.outside ?? 0;
          const total = inside + outside || 1;
          const outsideRate = result.outsideRate ?? (outside / total);
          const coverage = result.coverage ?? 0;
          const lengthGate = result.lengthGate ?? 0;
          const lengthTotal = result.lengthTotal ?? 0;
          const baseScore = result.baseScore ?? 0;
          const finalScore = result.score ?? 0;
          const ocrInfo = result.ocrText != null && result.ocrText !== ''
            ? String(result.ocrText)
            : '(未実行または結果なし)';
          panel.textContent =
            `inside: ${inside} / outside: ${outside} (rate: ${(outsideRate * 100).toFixed(1)}%)\n` +
            `coverage: ${(coverage * 100).toFixed(1)}%\n` +
            `length: 実測 ${lengthTotal.toFixed(1)} / 閾値 ${lengthGate.toFixed(1)}\n` +
            `baseScore: ${baseScore} / finalScore: ${finalScore}\n` +
            `OCR: ${ocrInfo}`;
          if (typeof Draw.drawClassificationOverlay === 'function') {
            Draw.drawClassificationOverlay(result.insidePixels, result.outsidePixels);
          }
        } else {
          panel.textContent = '';
        }
      }
      updateProgressOnCheck(currentKana, result.score);
      const record = {
        timestamp: Date.now(),
        kana: currentKana,
        romaji: data ? data.romaji : templateInfo.romaji,
        difficulty: document.getElementById('difficulty')?.value || 'trace',
        settings: {
          zoneWidth: parseInt(document.getElementById('zone-width')?.value || '20', 10),
          smoothing: parseFloat(document.getElementById('smoothing')?.value || '0.5'),
          passLine: parseInt(document.getElementById('pass-line')?.value || '70', 10)
        },
        score: result.score,
        verdict: result.verdict,
        strokes: strokesData.map(s => ({ points: compressPoints(s.points, 300) })),
        canvasWidth: templateInfo.width,
        canvasHeight: templateInfo.height,
        templateRomaji: templateInfo.romaji,
        templateLayout: { font: templateInfo.font, fontSize: templateInfo.fontSize, textX: templateInfo.textX, textY: templateInfo.textY }
      };
      addRecord(record).then(() => {
        refreshHistoryPreviewIfVisible();
      }).catch(err => {
        showError('practice-error', '履歴の保存に失敗しました: ' + (err.message || err));
      });
    }

    const ocrCanvas = typeof Draw.getImageForOCR === 'function' ? Draw.getImageForOCR() : null;
    if (ocrCanvas && typeof Tesseract !== 'undefined' && Tesseract.recognize) {
      vEl.textContent = '認識中...';
      vEl.className = 'verdict-display';
      Tesseract.recognize(ocrCanvas, 'eng', { logger: function () {} })
        .then(function (ocrResult) {
          const ocrInfo = extractOcrInfo(ocrResult);
          const result = Grading.grade(strokesData, templateInfo, passLine, {
            difficulty: difficulty,
            ocrText: ocrInfo.text,
            ocrLetter: ocrInfo.letter,
            ocrConfidence: ocrInfo.confidence
          });
          applyResult(result);
        })
        .catch(function () {
          const result = Grading.grade(strokesData, templateInfo, passLine, { difficulty: difficulty });
          applyResult(result);
        });
      return;
    }
    const result = Grading.grade(strokesData, templateInfo, passLine, { difficulty });
    applyResult(result);
  }

  function doNext() {
    const list = getKanaByCategory(document.getElementById('char-category')?.value || 'basic');
    const idx = list.findIndex(d => d.kana === currentKana);
    const next = list[(idx + 1) % list.length];
    if (next) {
      currentKana = next.kana;
      document.querySelectorAll('#char-grid .char-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.kana === currentKana);
      });
      syncTemplate();
      Draw.clear();
      Draw.clearOverlay();
      document.getElementById('verdict-display').textContent = '';
      document.getElementById('verdict-display').className = 'verdict-display';
      Draw.clearFeedback();
      hideOverlayButton();
      refreshHistoryPreviewIfVisible();
    }
  }

  function refreshHistoryPreviewIfVisible() {
    const block = document.getElementById('practice-history-preview');
    if (block && !block.classList.contains('hidden')) refreshHistoryPreview();
  }

  function refreshHistoryPreview() {
    const container = document.getElementById('practice-history-list');
    if (!container) return;
    container.innerHTML = '<p class="loading">読み込み中…</p>';
    getLatestByKana(currentKana, 10).then(records => {
      container.innerHTML = '';
      if (records.length === 0) {
        container.innerHTML = '<p class="muted">この文字の履歴はまだありません</p>';
        return;
      }
      const size = { w: 56, h: 42 };
      records.forEach(r => {
        const div = document.createElement('div');
        div.className = 'practice-history-item';
        const canvas = document.createElement('canvas');
        canvas.width = size.w;
        canvas.height = size.h;
        canvas.className = 'practice-history-thumb';
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(0, 0, size.w, size.h);
        const rw = r.canvasWidth || 400;
        const rh = r.canvasHeight || 300;
        const sx = size.w / rw;
        const sy = size.h / rh;
        const strokes = r.strokes || (r.points ? [{ points: r.points }] : []);
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        strokes.forEach(s => {
          const pts = s.points || s;
          if (pts.length < 2) return;
          ctx.beginPath();
          ctx.moveTo(pts[0].x * sx, pts[0].y * sy);
          for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x * sx, pts[i].y * sy);
          ctx.stroke();
        });
        const label = document.createElement('div');
        label.className = 'practice-history-label';
        const vLabel = { green: '合格', yellow: 'おしい', red: '×' }[r.verdict] || '';
        label.textContent = `${formatDateShort(r.timestamp)} ${r.score}点 ${vLabel}`;
        div.appendChild(canvas);
        div.appendChild(label);
        div.addEventListener('click', () => showOverlay(r));
        container.appendChild(div);
      });
    }).catch(() => {
      container.innerHTML = '<p class="muted">読み込みに失敗しました</p>';
    });
  }

  function formatDateShort(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' }) + ' ' + d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
  }

  function showOverlay(record) {
    const rw = record.canvasWidth || 400;
    const rh = record.canvasHeight || 300;
    const size = Draw.getCanvasSize();
    if (!size) return;
    const sx = size.width / rw;
    const sy = size.height / rh;
    const strokes = record.strokes || (record.points ? [{ points: record.points }] : []);
    const scaled = strokes.map(s => ({
      points: (s.points || s).map(p => ({ ...p, x: p.x * sx, y: p.y * sy }))
    }));
    Draw.setOverlayStrokes(scaled);
    Draw.redrawAll();
    showOverlayButton();
  }

  function showOverlayButton() {
    let btn = document.getElementById('practice-overlay-clear');
    if (!btn) {
      btn = document.createElement('button');
      btn.id = 'practice-overlay-clear';
      btn.className = 'action-btn';
      btn.textContent = 'オーバーレイを消す';
      btn.addEventListener('click', () => {
        Draw.clearOverlay();
        Draw.redrawAll();
        hideOverlayButton();
      });
      const controls = document.querySelector('.practice-controls') || document.querySelector('.practice-right');
      if (controls) controls.insertBefore(btn, document.getElementById('verdict-display'));
    }
    btn.style.visibility = 'visible';
  }

  function hideOverlayButton() {
    const btn = document.getElementById('practice-overlay-clear');
    if (btn) btn.style.visibility = 'hidden';
  }

  function redraw() {
    Draw.redrawAll();
  }

  function getCurrentKana() {
    return currentKana;
  }

  global.Practice = {
    init,
    getCurrentKana
  };
})(typeof window !== 'undefined' ? window : this);
