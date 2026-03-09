/**
 * practice.js - Practice 画面の UI 制御
 * 文字選択・難易度・スライダー・判定・文字別履歴プレビュー（最新10件）・オーバーレイ
 */

(function (global) {
  'use strict';

  let currentKana = 'あ';
  let practiceBound = false;
  // Prevent duplicate grading/saving caused by rapid re-clicks during OCR.
  let practiceCheckInFlight = false;
  // Prevent accidental double-submit when the same input is checked repeatedly in a short interval.
  let lastPracticeCheckSig = '';
  let lastPracticeCheckAt = 0;
  let lastPracticeSaveSig = '';
  let lastPracticeSaveAt = 0;
  // Incremented per check/navigation to ignore stale async OCR results safely.
  let practiceCheckSeq = 0;

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
    btn.classList.remove('achieved70', 'achieved80');
    const rec = progressMap[kana];
    if (!rec || typeof rec.bestScore !== 'number') return;
    if (rec.bestScore >= 70) btn.classList.add('achieved70');
    if (rec.bestScore >= 80) btn.classList.add('achieved80');
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
    const info = { text: '', letter: '', confidence: 0, alphaLength: 0, source: 'none' };
    if (!ocrResult || !ocrResult.data) return info;
    const data = ocrResult.data;
    info.text = (data.text || '').trim();
    const alphaText = info.text.toLowerCase().replace(/[^a-z]/g, '');
    info.alphaLength = alphaText.length;

    function pushLetter(ch, conf) {
      if (!ch) return;
      const l = String(ch).toLowerCase();
      if (!/^[a-z]$/.test(l)) return;
      const c = (typeof conf === 'number' && isFinite(conf))
        ? Math.max(0, Math.min(100, conf))
        : 0;
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
      if (info.letter) info.source = 'symbols';
    } else if (Array.isArray(data.words) && data.words.length > 0) {
      data.words.forEach(word => {
        const text = word.text || '';
        const conf = word.confidence;
        for (let i = 0; i < text.length; i++) {
          pushLetter(text[i], conf);
        }
      });
      if (info.letter) info.source = 'words';
    }

    if (!info.letter && info.text) {
      if (alphaText.length === 1) {
        info.letter = alphaText[0];
        const avgConf = (typeof data.confidence === 'number' && isFinite(data.confidence)) ? data.confidence : 0;
        info.confidence = Math.max(0, Math.min(100, avgConf));
        info.source = 'text';
      }
    }

    return info;
  }

  function getOcrCanvasStats(canvas) {
    if (!canvas) return { ok: false };
    const w = canvas.width || 0;
    const h = canvas.height || 0;
    if (!w || !h) return { ok: false, width: w, height: h };
    const ctx = canvas.getContext('2d');
    if (!ctx || !ctx.getImageData) return { ok: true, width: w, height: h, inkRatio: null };
    try {
      const data = ctx.getImageData(0, 0, w, h).data;
      let ink = 0;
      const total = w * h;
      for (let i = 0; i < data.length; i += 4) {
        const luminance = (data[i] + data[i + 1] + data[i + 2]) / 3;
        if (luminance < 245) ink++;
      }
      return { ok: true, width: w, height: h, inkRatio: total > 0 ? ink / total : 0 };
    } catch (_) {
      return { ok: true, width: w, height: h, inkRatio: null };
    }
  }

  function logOcrTrace(stage, payload) {
    if (typeof console === 'undefined' || !console.log) return;
    console.log('[OCR][Practice]', stage, payload || {});
  }

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

  

  function getBestScoreMapForExport() {
    ensureProgressLoaded();
    const map = {};
    Object.keys(progressMap || {}).forEach(function (kana) {
      const rec = progressMap[kana];
      if (rec && typeof rec.bestScore === 'number' && isFinite(rec.bestScore)) map[kana] = rec.bestScore;
    });
    return map;
  }

  function exportCharacterGradesJson() {
    const bestMap = getBestScoreMapForExport();
    const records = (KANA_DATA || []).filter(function (d) { return d && d.romaji && !/^\(/.test(String(d.romaji)); }).map(function (d) {
      const best = Math.max(0, Math.round(bestMap[d.kana] || 0));
      return {
        character: d.romaji,
        category: d.category || 'other',
        bestScore: best,
        clear70: best >= 70,
        clear80: best >= 80,
        lastUpdated: new Date().toISOString()
      };
    });
    const payload = { timestamp: new Date().toISOString(), records: records };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'character_grades_' + Date.now() + '.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportStudXpJson() {
    const bestMap = getBestScoreMapForExport();
    const kanaList = (KANA_DATA || []).filter(function (d) { return d && d.romaji && !/^\(/.test(String(d.romaji)); });
    let count70 = 0;
    let count80 = 0;
    kanaList.forEach(function (d) {
      const best = Math.max(0, Math.round(bestMap[d.kana] || 0));
      if (best >= 70) count70++;
      if (best >= 80) count80++;
    });
    const raw = (count70 + count80) / 4;
      // ?????1?????????
    const StudXP = Math.round(raw * 10) / 10;
    const payload = {
      timestamp: new Date().toISOString(),
      totalKana: kanaList.length,
      count70: count70,
      count80: count80,
      StudXP: StudXP
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'studxp_' + Date.now() + '.json';
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
    if (exportJsonBtn) exportJsonBtn.addEventListener('click', exportCharacterGradesJson);
    const exportStudXpBtn = document.getElementById('btn-export-studxp-json');
    if (exportStudXpBtn) exportStudXpBtn.addEventListener('click', exportStudXpJson);

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
    if (checkBtn) {
      checkBtn.replaceWith(checkBtn.cloneNode(true));
      document.getElementById('btn-check').addEventListener('click', doCheck);
    }
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
        historyToggle.textContent = show ? '?????' : '?????';
        if (!show) refreshHistoryPreview();
        if (typeof Draw.syncCanvasToWrap === 'function') Draw.syncCanvasToWrap();
        Draw.redrawAll();
      });
    }
  }

  // OCR/??????????????????
  function buildStrokeCheckSignature(strokesData) {
    return (strokesData || []).map(function (stroke) {
      const pts = (stroke && stroke.points) ? stroke.points : [];
      const first = pts[0] || { x: 0, y: 0 };
      const last = pts[pts.length - 1] || first;
      return [pts.length, Math.round(first.x), Math.round(first.y), Math.round(last.x), Math.round(last.y)].join(':');
    }).join('|');
  }

  function doCheck() {
    if (practiceCheckInFlight) return;
    practiceCheckInFlight = true;
    const checkSeq = ++practiceCheckSeq;
    const checkKana = currentKana;
    const checkBtn = document.getElementById('btn-check');
    const nextBtn = document.getElementById('btn-next');
    if (checkBtn) checkBtn.disabled = true;
    if (nextBtn) nextBtn.disabled = true;

    function finishCheck() {
      practiceCheckInFlight = false;
      if (checkBtn) checkBtn.disabled = false;
      if (nextBtn) nextBtn.disabled = false;
    }

    updateSettings();
    const strokesData = Draw.getStrokes();
    const data = getKanaData(currentKana);
    const templateInfo = Draw.getTemplateForGrading();
    if (!templateInfo.romaji || templateInfo.romaji.length === 0) {
      showError('practice-error', '????????????????');
      finishCheck();
      return;
    }

    const passLine = parseInt(document.getElementById('pass-line')?.value || '70', 10);
    const difficulty = document.getElementById('difficulty')?.value || 'trace';
    const vEl = document.getElementById('verdict-display');
    const checkSig = currentKana + '|' + difficulty + '|' + buildStrokeCheckSignature(strokesData);
    const now = Date.now();
    if (checkSig === lastPracticeCheckSig && (now - lastPracticeCheckAt) < 1200) {
      finishCheck();
      return;
    }
    lastPracticeCheckSig = checkSig;
    lastPracticeCheckAt = now;

    function applyResult(result) {
      finishCheck();
      if (checkSeq !== practiceCheckSeq || checkKana !== currentKana) return;

      const userMsg = result.userMessage || result.message || '';
      if (vEl) {
        vEl.textContent = userMsg + ' (' + result.score + '?)';
        vEl.className = 'verdict-display ' + result.verdict;
      }
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
          const penalty = result.penalty ?? 0;
          const ocrInfo = (result.ocrText != null && result.ocrText !== '') ? String(result.ocrText) : 'OCR??';
          const perBoxLine = (result.perBox && result.perBox.length > 0)
            ? 'perBox: ' + result.perBox.map(function (b) { return b.score; }).join(', ') + '\n'
            : '';
          const perBoxOcrLine = (result.ocrPerBox && result.ocrPerBox.length > 0)
            ? 'perBoxOCR: ' + result.ocrPerBox.map(function (b, i) {
              const l = b && b.letter ? b.letter : '-';
              const c = b && typeof b.confidence === 'number' ? b.confidence.toFixed(1) : '0.0';
              const a = b && typeof b.alphaLength === 'number' ? b.alphaLength : 0;
              return '#' + i + ':' + l + '(c=' + c + ',a=' + a + ')';
            }).join(' ') + '\n'
            : '';
          const userReason = (result.reasonUserList && result.reasonUserList.length > 0)
            ? result.reasonUserList.join(' / ')
            : (result.userMessage || result.message || '(none)');
          const devReason = (result.reasonDevList && result.reasonDevList.length > 0)
            ? result.reasonDevList.join(' | ')
            : (result.developerMessage || '(none)');
          const ocrDecision = result.ocrDecision && result.ocrDecision.decision
            ? result.ocrDecision.decision
            : 'none';
          const ocrCap = result.ocrDecision && result.ocrDecision.cap != null
            ? result.ocrDecision.cap
            : '-';
          panel.textContent =
            '[????????] ' + userReason + '\n' +
            '[???????] ' + devReason + '\n' +
            '?????: ' + (result.message || '-') + '\n' +
            'OCR??: ' + ocrDecision + ' / OCR??: ' + ocrCap + '\n' +
            perBoxLine +
            perBoxOcrLine +
            'inside: ' + inside + ' / outside: ' + outside + ' (rate: ' + (outsideRate * 100).toFixed(1) + '%)\n' +
            'coverage: ' + (coverage * 100).toFixed(1) + '%\n' +
            'length: total ' + lengthTotal.toFixed(1) + ' / gate ' + lengthGate.toFixed(1) + '\n' +
            'baseScore: ' + baseScore + ' / penalty: ' + penalty + ' / finalScore: ' + finalScore + '\n' +
            'OCR: ' + ocrInfo;
          if (typeof Draw.drawClassificationOverlay === 'function') {
            Draw.drawClassificationOverlay(result.insidePixels, result.outsidePixels);
          }
        } else {
          panel.textContent = '';
        }
      }

      updateProgressOnCheck(currentKana, result.score);
      const saveSig = currentKana + '|' + difficulty + '|' + buildStrokeCheckSignature(strokesData);
      const saveNow = Date.now();
      if (saveSig === lastPracticeSaveSig && (saveNow - lastPracticeSaveAt) < 15000) {
        return;
      }
      lastPracticeSaveSig = saveSig;
      lastPracticeSaveAt = saveNow;

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
        strokes: strokesData.map(function (s) { return { points: compressPoints(s.points, 300) }; }),
        canvasWidth: templateInfo.width,
        canvasHeight: templateInfo.height,
        templateRomaji: templateInfo.romaji
      };
      addRecord(record).then(function () {
        refreshHistoryPreviewIfVisible();
      }).catch(function (err) {
        lastPracticeSaveSig = '';
        lastPracticeSaveAt = 0;
        showError('practice-error', '????????????: ' + (err && err.message ? err.message : err));
      });
    }

    const boxes = templateInfo.boxes || [];
    const multiBox = boxes.length > 1 && typeof Draw.getImageForOCRBox === 'function';
    const hasTesseract = typeof Tesseract !== 'undefined' && Tesseract.recognize;

    if (vEl) {
      vEl.textContent = '?????...';
      vEl.className = 'verdict-display';
    }

    if (multiBox && hasTesseract) {
      const promises = boxes.map(function (_, i) {
        const canvas = Draw.getImageForOCRBox(i);
        const stats = getOcrCanvasStats(canvas);
        logOcrTrace('start', { kind: 'multi', boxIndex: i, canvas: stats });
        if (!canvas) {
          logOcrTrace('skip', { kind: 'multi', boxIndex: i, reason: 'no-canvas' });
          return Promise.resolve({ text: '', letter: '', confidence: 0, alphaLength: 0, source: 'none' });
        }
        return Tesseract.recognize(canvas, 'eng', { logger: function () {} })
          .then(function (r) {
            const info = extractOcrInfo(r);
            logOcrTrace('done', {
              kind: 'multi',
              boxIndex: i,
              letter: info.letter,
              confidence: info.confidence,
              alphaLength: info.alphaLength,
              source: info.source
            });
            return info;
          })
          .catch(function (err) {
            logOcrTrace('error', { kind: 'multi', boxIndex: i, message: String(err && err.message || err || 'ocr-failed') });
            return { text: '', letter: '', confidence: 0, alphaLength: 0, source: 'none' };
          });
      });
      Promise.all(promises)
        .then(function (ocrPerBox) {
          logOcrTrace('grading-input', {
            kind: 'multi',
            ocrPerBox: ocrPerBox.map(function (o) {
              return { letter: o.letter, confidence: o.confidence, alphaLength: o.alphaLength, source: o.source };
            })
          });
          const result = Grading.grade(strokesData, templateInfo, passLine, {
            difficulty: difficulty,
            ocrPerBox: ocrPerBox
          });
          applyResult(result);
        })
        .catch(function () {
          const result = Grading.grade(strokesData, templateInfo, passLine, { difficulty: difficulty });
          applyResult(result);
        });
      return;
    }

    const ocrCanvas = (typeof Draw.getImageForOCR === 'function') ? Draw.getImageForOCR() : null;
    if (ocrCanvas && hasTesseract) {
      logOcrTrace('start', { kind: 'single', canvas: getOcrCanvasStats(ocrCanvas) });
      Tesseract.recognize(ocrCanvas, 'eng', { logger: function () {} })
        .then(function (ocrResult) {
          const ocrInfo = extractOcrInfo(ocrResult);
          logOcrTrace('done', {
            kind: 'single',
            letter: ocrInfo.letter,
            confidence: ocrInfo.confidence,
            alphaLength: ocrInfo.alphaLength,
            source: ocrInfo.source
          });
          logOcrTrace('grading-input', {
            kind: 'single',
            letter: ocrInfo.letter,
            confidence: ocrInfo.confidence,
            alphaLength: ocrInfo.alphaLength,
            source: ocrInfo.source
          });
          const result = Grading.grade(strokesData, templateInfo, passLine, {
            difficulty: difficulty,
            ocrText: ocrInfo.text,
            ocrLetter: ocrInfo.letter,
            ocrConfidence: ocrInfo.confidence,
            ocrAlphaLength: ocrInfo.alphaLength,
            ocrSource: ocrInfo.source
          });
          applyResult(result);
        })
        .catch(function (err) {
          logOcrTrace('error', { kind: 'single', message: String(err && err.message || err || 'ocr-failed') });
          const result = Grading.grade(strokesData, templateInfo, passLine, { difficulty: difficulty });
          applyResult(result);
        });
      return;
    }

    const result = Grading.grade(strokesData, templateInfo, passLine, { difficulty: difficulty });
    applyResult(result);
  }

  function doNext() {
    if (practiceCheckInFlight) return;
    practiceCheckSeq++;
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


