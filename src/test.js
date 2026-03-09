/**
 * test.js - Test 逕ｻ髱｢縺ｮ UI 蛻ｶ蠕｡
 * 繝ｩ繝ｳ繝繝蜃ｺ鬘・/ 驕ｸ謚槫・鬘後∝撫鬘悟ｮ溯｡後∫ｵ先棡陦ｨ遉ｺ縲∝ｾｩ鄙偵ず繝｣繝ｳ繝・ */

(function (global) {
  'use strict';

  let questionList = [];
  let currentIndex = 0;
  let testResults = [];
  let selectedKanaForSelect = [];
  let testConfigBound = false;
  // Prevent duplicate grading/saving caused by rapid re-clicks during OCR.
  let testCheckInFlight = false;
  // Prevent accidental double-submit when the same input is checked repeatedly in a short interval.
  let lastTestCheckSig = '';
  let lastTestCheckAt = 0;
  let lastTestSaveSig = '';
  let lastTestSaveAt = 0;

  /**
   * Tesseract.js 縺ｮ邨先棡縺九ｉ縲檎函繝・く繧ｹ繝医阪・譁・ｭ励・繧｢繝ｫ繝輔ぃ繝吶ャ繝亥呵｣懊阪後◎縺ｮ菫｡鬆ｼ蠎ｦ縲阪ｒ蜿悶ｊ蜃ｺ縺・   */
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
    console.log('[OCR][Test]', stage, payload || {});
  }

  function buildStrokeCheckSignature(strokesData) {
    return (strokesData || []).map(function (s) {
      const pts = (s && s.points) ? s.points : [];
      const first = pts[0] || { x: 0, y: 0 };
      const last = pts[pts.length - 1] || first;
      return [
        pts.length,
        Math.round(first.x), Math.round(first.y),
        Math.round(last.x), Math.round(last.y)
      ].join(':');
    }).join('|');
  }

  function init() {
    clearError('test-error');
    document.getElementById('test-config')?.classList.remove('hidden');
    document.getElementById('test-run')?.classList.add('hidden');
    document.getElementById('test-result')?.classList.add('hidden');
    if (!testConfigBound) bindTestConfig();
    testConfigBound = true;
    ensureTestUxChrome();
    updateModeVisibility();
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function updateModeVisibility() {
    const mode = document.getElementById('test-mode')?.value;
    const randomBlock = document.getElementById('test-random-category');
    const selectBlock = document.getElementById('test-select-chars');
    if (randomBlock) randomBlock.classList.toggle('hidden', mode !== 'random');
    if (selectBlock) selectBlock.classList.toggle('hidden', mode !== 'select');
    if (mode === 'select') buildSelectCharSet();
  }

  function buildSelectCharSet() {
    const cat = document.getElementById('test-select-category')?.value || 'basic';
    const list = getKanaByCategory(cat).filter(d => d.romaji && !/^\(/.test(d.romaji));
    const container = document.getElementById('test-char-set');
    if (!container) return;
    container.innerHTML = '';
    container.dataset.category = cat;
    list.forEach(d => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'char-btn test-char-select' + (selectedKanaForSelect.includes(d.kana) ? ' selected' : '');
      btn.textContent = d.kana;
      btn.dataset.kana = d.kana;
      btn.addEventListener('click', () => {
        const idx = selectedKanaForSelect.indexOf(d.kana);
        if (idx >= 0) selectedKanaForSelect.splice(idx, 1);
        else selectedKanaForSelect.push(d.kana);
        btn.classList.toggle('selected', selectedKanaForSelect.includes(d.kana));
      });
      container.appendChild(btn);
    });
  }

  function ensureTestUxChrome() {
    const testConfig = document.getElementById('test-config');
    if (testConfig && !document.getElementById('test-advanced-settings')) {
      const advanced = document.createElement('details');
      advanced.id = 'test-advanced-settings';
      advanced.className = 'settings-details';
      const summary = document.createElement('summary');
      summary.textContent = 'Advanced settings';
      advanced.appendChild(summary);

      const rows = Array.from(testConfig.querySelectorAll('.test-config-row'));
      rows.forEach(function (row) {
        const id = row.querySelector('select, input') ? row.querySelector('select, input').id : '';
        const keepSimple = id === 'test-mode' || id === 'test-count' || id === 'test-category' || id === 'test-select-category';
        if (!keepSimple) advanced.appendChild(row);
      });
      testConfig.insertBefore(advanced, document.getElementById('test-start-btn'));
    }

    const debugToggle = document.querySelector('#test-run .debug-toggle');
    if (debugToggle && !debugToggle.closest('details')) {
      const d = document.createElement('details');
      d.className = 'debug-details';
      const sum = document.createElement('summary');
      sum.textContent = 'Debug';
      d.appendChild(sum);
      debugToggle.parentNode.insertBefore(d, debugToggle);
      d.appendChild(debugToggle);
    }

    if (!document.getElementById('test-quick-hint')) {
      const run = document.getElementById('test-run');
      if (run) {
        const hint = document.createElement('div');
        hint.id = 'test-quick-hint';
        hint.className = 'practice-feedback-hints';
        const verdict = document.getElementById('test-verdict');
        if (verdict) verdict.insertAdjacentElement('afterend', hint);
      }
    }
  }

  function renderTestHint(result) {
    const hint = document.getElementById('test-quick-hint');
    if (!hint || !result) return;
    const improve = (result.reasonUserList && result.reasonUserList.length)
      ? result.reasonUserList[result.reasonUserList.length - 1]
      : 'Try a slight position adjustment on the next character.';
    hint.textContent = 'Tip: ' + improve;
  }

  function bindTestConfig() {
    const modeEl = document.getElementById('test-mode');
    if (modeEl) modeEl.addEventListener('change', updateModeVisibility);

    const catEl = document.getElementById('test-select-category');
    if (catEl) catEl.addEventListener('change', () => { selectedKanaForSelect = []; buildSelectCharSet(); });

    const passEl = document.getElementById('test-pass-line');
    if (passEl) passEl.addEventListener('input', e => {
      const val = document.getElementById('test-pass-line-val');
      if (val) val.textContent = e.target.value;
    });

    const startBtn = document.getElementById('test-start-btn');
    if (startBtn) startBtn.addEventListener('click', startTest);

    const nextBtn = document.getElementById('test-next-btn');
    if (nextBtn) nextBtn.addEventListener('click', goNext);

    const backBtn = document.getElementById('test-result-back');
    if (backBtn) backBtn.addEventListener('click', () => typeof App !== 'undefined' && App.showView('home'));
  }

  function startTest() {
    clearError('test-error');
    const mode = document.getElementById('test-mode')?.value || 'random';
    const count = parseInt(document.getElementById('test-count')?.value || '10', 10);
    let list = [];

    if (mode === 'random') {
      const cat = document.getElementById('test-category')?.value || 'basic';
      list = getKanaByCategory(cat).filter(d => d.romaji && !/^\(/.test(d.romaji));
      list = shuffle(list).slice(0, count);
    } else {
      if (selectedKanaForSelect.length === 0) {
        showError('test-error', '蜃ｺ鬘後☆繧区枚蟄励ｒ1縺､莉･荳企∈繧薙〒縺上□縺輔＞');
        return;
      }
      list = selectedKanaForSelect.map(k => getKanaData(k)).filter(Boolean);
      list = shuffle(list).slice(0, count);
    }

    if (list.length === 0) {
      showError('test-error', '蜃ｺ鬘後〒縺阪ｋ譁・ｭ励′縺ゅｊ縺ｾ縺帙ｓ');
      return;
    }

    questionList = list;
    currentIndex = 0;
    testResults = [];

    const configEl = document.getElementById('test-config');
    const runEl = document.getElementById('test-run');
    const resultEl = document.getElementById('test-result');
    if (configEl) configEl.classList.add('hidden');
    if (runEl) runEl.classList.remove('hidden');
    if (resultEl) resultEl.classList.add('hidden');

    if (typeof Draw !== 'undefined') {
      // test-run 繧ｻ繧ｯ繧ｷ繝ｧ繝ｳ縺瑚｡ｨ遉ｺ縺輔ｌ縺溘≠縺ｨ縺ｫ繧ｭ繝｣繝ｳ繝舌せ繧貞・譛溷喧縺吶ｋ
      if (typeof requestAnimationFrame !== 'undefined') {
        requestAnimationFrame(() => {
          Draw.initCanvas('test-draw-canvas', 'test-feedback-canvas', 'test-template-canvas');
          Draw.setDifficultyGetter(() => document.getElementById('test-difficulty')?.value || 'trace');
          const zoneWidth = 20;
          const smoothing = 0.5;
          Draw.setSettings({ zoneWidth, smoothing });
          if (typeof Draw.syncCanvasToWrap === 'function') {
            Draw.syncCanvasToWrap();
          }
          debugTestCanvasLayout('after initCanvas');
          showCurrentQuestion();
          bindCheckButton();
        });
        return;
      } else {
        Draw.initCanvas('test-draw-canvas', 'test-feedback-canvas', 'test-template-canvas');
        Draw.setDifficultyGetter(() => document.getElementById('test-difficulty')?.value || 'trace');
        const zoneWidth = 20;
        const smoothing = 0.5;
        Draw.setSettings({ zoneWidth, smoothing });
        if (typeof Draw.syncCanvasToWrap === 'function') {
          Draw.syncCanvasToWrap();
        }
        debugTestCanvasLayout('after initCanvas (no rAF)');
      }
    }

    showCurrentQuestion();
    bindCheckButton();
  }

  function showCurrentQuestion() {
    const q = questionList[currentIndex];
    if (!q) return;

    const kanaEl = document.getElementById('test-current-kana');
    const romajiEl = document.getElementById('test-current-romaji');
    const diff = document.getElementById('test-difficulty')?.value || 'trace';
    if (kanaEl) kanaEl.textContent = q.kana;
    if (romajiEl) {
      romajiEl.textContent = q.romaji;
      romajiEl.classList.toggle('hidden', diff === 'blind');
    }

    const romajiForDraw = q.romaji && !/^\(/.test(q.romaji) ? q.romaji : '';
    if (typeof Draw !== 'undefined') {
      Draw.setTemplate(romajiForDraw);
      Draw.clear();
      Draw.clearFeedback();
      if (diff === 'fade') Draw.setFadeStart();
      Draw.redrawAll();
      debugTestCanvasLayout('showCurrentQuestion');
    }

    document.getElementById('test-verdict').textContent = '';
    document.getElementById('test-verdict').className = 'verdict-display';
    const prog = document.getElementById('test-progress');
    if (prog) prog.textContent = `蝠城｡・${currentIndex + 1} / ${questionList.length}`;
  }

  /**
   * 繝・せ繝育判髱｢逕ｨ縺ｮ繧ｭ繝｣繝ｳ繝舌せ繝ｬ繧､繧｢繧ｦ繝医ョ繝舌ャ繧ｰ
   * canvas.getBoundingClientRect() / width / height 縺ｨ wrap 縺ｮ rect 繧偵さ繝ｳ繧ｽ繝ｼ繝ｫ縺ｫ蜃ｺ蜉・   */
  function debugTestCanvasLayout(label) {
    if (typeof document === 'undefined' || typeof console === 'undefined') return;
    const canvas = document.getElementById('test-draw-canvas');
    const wrap = canvas ? canvas.parentElement : null;
    if (!canvas || !wrap || !canvas.getBoundingClientRect) return;
    const cRect = canvas.getBoundingClientRect();
    const wRect = wrap.getBoundingClientRect();
    console.log('[TestCanvas]', label, {
      canvasClient: { width: cRect.width, height: cRect.height },
      canvasIntrinsic: { width: canvas.width, height: canvas.height },
      wrapClient: { width: wRect.width, height: wRect.height }
    });
  }

  function bindCheckButton() {
    const btn = document.getElementById('test-check-btn');
    if (!btn) return;
    btn.replaceWith(btn.cloneNode(true));
    document.getElementById('test-check-btn').addEventListener('click', doCheck);
  }

  function applyTestCheckResult(result, strokesData, templateInfo, q) {
    testCheckInFlight = false;
    const checkBtn = document.getElementById('test-check-btn');
    if (checkBtn) checkBtn.disabled = false;
    const gateNextBtn = document.getElementById('test-next-btn');
    if (gateNextBtn) gateNextBtn.disabled = false;

    testResults.push({ kana: q.kana, romaji: q.romaji, score: result.score, verdict: result.verdict });
    const vEl = document.getElementById('test-verdict');
    const ocrInfo = result.ocrText != null && result.ocrText !== ''
      ? ` / OCR: ${String(result.ocrText)}`
      : '';
    const userMsg = result.userMessage || result.message || '';
    vEl.textContent = userMsg + ' (' + result.score + ' ' + '\u70b9)' + ocrInfo;
    vEl.className = 'verdict-display ' + result.verdict;
    renderTestHint(result);
    Draw.drawFeedback(result.outsidePixels);
    const debugToggle = document.getElementById('test-debug-bbox');
    if (debugToggle && debugToggle.checked && typeof Draw.drawDebugBoxes === 'function') {
      Draw.drawDebugBoxes(result.debug);
      if (typeof console !== 'undefined' && result.reasonDevList && result.reasonDevList.length) {
        console.log('[Grading][Dev]', result.reasonDevList.join(' | '));
      }
    }
    const saveSig = String(q.kana || '') + '|' + String(currentIndex) + '|' + String(document.getElementById('test-difficulty')?.value || 'trace') + '|' + buildStrokeCheckSignature(strokesData);
    const saveNow = Date.now();
    if (saveSig !== lastTestSaveSig || (saveNow - lastTestSaveAt) >= 15000) {
      lastTestSaveSig = saveSig;
      lastTestSaveAt = saveNow;
    } else {
      const nextBtn = document.getElementById('test-next-btn');
      if (nextBtn) {
        nextBtn.classList.remove('hidden');
        nextBtn.classList.toggle('next-suggest', result.score >= parseInt(document.getElementById('test-pass-line')?.value || '70', 10));
        nextBtn.textContent = result.score >= parseInt(document.getElementById('test-pass-line')?.value || '70', 10) ? 'Next >' : 'Next';
      }
      return;
    }

    const record = {
      timestamp: Date.now(),
      kana: q.kana,
      romaji: q.romaji,
      difficulty: document.getElementById('test-difficulty')?.value || 'trace',
      settings: {
        zoneWidth: 20,
        smoothing: 0.5,
        passLine: parseInt(document.getElementById('test-pass-line')?.value || '70', 10)
      },
      score: result.score,
      verdict: result.verdict,
      strokes: strokesData.map(s => ({ points: compressPoints(s.points, 300) })),
      canvasWidth: templateInfo.width,
      canvasHeight: templateInfo.height,
      templateRomaji: templateInfo.romaji,
      templateLayout: { font: templateInfo.font, fontSize: templateInfo.fontSize, textX: templateInfo.textX, textY: templateInfo.textY }
    };
    addRecord(record).catch(function () { lastTestSaveSig = ''; lastTestSaveAt = 0; });
    const nextBtn = document.getElementById('test-next-btn');
    if (nextBtn) {
      nextBtn.classList.remove('hidden');
      nextBtn.classList.toggle('next-suggest', result.score >= parseInt(document.getElementById('test-pass-line')?.value || '70', 10));
      nextBtn.textContent = result.score >= parseInt(document.getElementById('test-pass-line')?.value || '70', 10) ? 'Next >' : 'Next';
    }
  }

  function doCheck() {
    if (testCheckInFlight) return;
    testCheckInFlight = true;
    const checkBtn = document.getElementById('test-check-btn');
    if (checkBtn) checkBtn.disabled = true;
    const nextBtn = document.getElementById('test-next-btn');
    if (nextBtn) nextBtn.disabled = true;

    const q = questionList[currentIndex];
    if (!q || typeof Draw === 'undefined' || typeof Grading === 'undefined') {
      testCheckInFlight = false;
      if (checkBtn) checkBtn.disabled = false;
      if (nextBtn) nextBtn.disabled = false;
      return;
    }

    const strokesData = Draw.getStrokes();
    const templateInfo = Draw.getTemplateForGrading();
    const passLine = parseInt(document.getElementById('test-pass-line')?.value || '70', 10);
    const difficulty = document.getElementById('test-difficulty')?.value || 'trace';
    const vEl = document.getElementById('test-verdict');
    const checkSig = String(q.kana || '') + '|' + String(currentIndex) + '|' + difficulty + '|' + buildStrokeCheckSignature(strokesData);
    const now = Date.now();
    if (checkSig === lastTestCheckSig && (now - lastTestCheckAt) < 1200) {
      testCheckInFlight = false;
      if (checkBtn) checkBtn.disabled = false;
      if (nextBtn) nextBtn.disabled = false;
      return;
    }
    lastTestCheckSig = checkSig;
    lastTestCheckAt = now;

    const boxes = templateInfo.boxes || [];
    const multiBox = boxes.length > 1 && typeof Draw.getImageForOCRBox === 'function';
    const hasTesseract = typeof Tesseract !== 'undefined' && Tesseract.recognize;

    if (multiBox && hasTesseract) {
      vEl.textContent = 'Recognizing...';
      vEl.className = 'verdict-display';
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
          applyTestCheckResult(result, strokesData, templateInfo, q);
        })
        .catch(function () {
          const result = Grading.grade(strokesData, templateInfo, passLine, { difficulty: difficulty });
          applyTestCheckResult(result, strokesData, templateInfo, q);
        });
      return;
    }

    const ocrCanvas = typeof Draw.getImageForOCR === 'function' ? Draw.getImageForOCR() : null;
    if (ocrCanvas && hasTesseract) {
      vEl.textContent = 'Recognizing...';
      vEl.className = 'verdict-display';
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
          applyTestCheckResult(result, strokesData, templateInfo, q);
        })
        .catch(function (err) {
          logOcrTrace('error', { kind: 'single', message: String(err && err.message || err || 'ocr-failed') });
          const result = Grading.grade(strokesData, templateInfo, passLine, { difficulty: difficulty });
          applyTestCheckResult(result, strokesData, templateInfo, q);
        });
      return;
    }
    const result = Grading.grade(strokesData, templateInfo, passLine, { difficulty });
    applyTestCheckResult(result, strokesData, templateInfo, q);
  }

  function goNext() {
    if (testCheckInFlight) return;
    currentIndex++;
    if (currentIndex >= questionList.length) {
      showResult();
      return;
    }
    showCurrentQuestion();
    document.getElementById('test-next-btn').classList.add('hidden');
  }

  function showResult() {
    document.getElementById('test-run')?.classList.add('hidden');
    document.getElementById('test-result')?.classList.remove('hidden');

    const correctCount = testResults.filter(r => r.verdict === 'green').length;
    const total = testResults.length;
    const avg = total > 0
      ? Math.round(testResults.reduce((a, r) => a + r.score, 0) / total)
      : 0;
    const wrongList = testResults.filter(r => r.verdict !== 'green');

    const summaryEl = document.getElementById('test-result-summary');
    if (summaryEl) summaryEl.textContent = `豁｣遲疲焚: ${correctCount} / ${total}`;

    const avgEl = document.getElementById('test-result-average');
    if (avgEl) avgEl.textContent = `蟷ｳ蝮・せ繧ｳ繧｢: ${avg}轤ｹ`;

    const wrongContainer = document.getElementById('test-wrong-list');
    if (wrongContainer) {
      wrongContainer.innerHTML = '';
      if (wrongList.length === 0) {
        wrongContainer.innerHTML = '<p class="muted">蜈ｨ蝠乗ｭ｣隗｣縺ｧ縺呻ｼ・/p>';
      } else {
        wrongContainer.innerHTML = '<p>髢馴＆縺医◆譁・ｭ・</p>';
        wrongList.forEach(r => {
          const btn = document.createElement('button');
          btn.className = 'action-btn char-btn';
          btn.textContent = r.kana;
          btn.addEventListener('click', () => {
            if (typeof App !== 'undefined') App.showView('practice', { kana: r.kana });
          });
          wrongContainer.appendChild(btn);
        });
      }
    }
  }

  global.Test = { init };
})(typeof window !== 'undefined' ? window : this);
