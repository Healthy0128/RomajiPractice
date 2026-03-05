/**
 * test.js - Test 画面の UI 制御
 * ランダム出題 / 選択出題、問題実行、結果表示、復習ジャンプ
 */

(function (global) {
  'use strict';

  let questionList = [];
  let currentIndex = 0;
  let testResults = [];
  let selectedKanaForSelect = [];
  let testConfigBound = false;

  /**
   * Tesseract.js の結果から「生テキスト」「1文字のアルファベット候補」「その信頼度」を取り出す
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

  function init() {
    clearError('test-error');
    document.getElementById('test-config')?.classList.remove('hidden');
    document.getElementById('test-run')?.classList.add('hidden');
    document.getElementById('test-result')?.classList.add('hidden');
    if (!testConfigBound) bindTestConfig();
    testConfigBound = true;
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
        showError('test-error', '出題する文字を1つ以上選んでください');
        return;
      }
      list = selectedKanaForSelect.map(k => getKanaData(k)).filter(Boolean);
      list = shuffle(list).slice(0, count);
    }

    if (list.length === 0) {
      showError('test-error', '出題できる文字がありません');
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
      // test-run セクションが表示されたあとにキャンバスを初期化する
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
    if (prog) prog.textContent = `問題 ${currentIndex + 1} / ${questionList.length}`;
  }

  /**
   * テスト画面用のキャンバスレイアウトデバッグ
   * canvas.getBoundingClientRect() / width / height と wrap の rect をコンソールに出力
   */
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
    testResults.push({ kana: q.kana, romaji: q.romaji, score: result.score, verdict: result.verdict });
    const vEl = document.getElementById('test-verdict');
    const ocrInfo = result.ocrText != null && result.ocrText !== ''
      ? ` / OCR: ${String(result.ocrText)}`
      : '';
    vEl.textContent = `${result.message}（${result.score}点）${ocrInfo}`;
    vEl.className = 'verdict-display ' + result.verdict;
    Draw.drawFeedback(result.outsidePixels);
    const debugToggle = document.getElementById('test-debug-bbox');
    if (debugToggle && debugToggle.checked && typeof Draw.drawDebugBoxes === 'function') {
      Draw.drawDebugBoxes(result.debug);
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
    addRecord(record).catch(function () {});
    document.getElementById('test-next-btn').classList.remove('hidden');
  }

  function doCheck() {
    const q = questionList[currentIndex];
    if (!q || typeof Draw === 'undefined' || typeof Grading === 'undefined') return;

    const strokesData = Draw.getStrokes();
    const templateInfo = Draw.getTemplateForGrading();
    const passLine = parseInt(document.getElementById('test-pass-line')?.value || '70', 10);
    const difficulty = document.getElementById('test-difficulty')?.value || 'trace';
    const vEl = document.getElementById('test-verdict');

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
          applyTestCheckResult(result, strokesData, templateInfo, q);
        })
        .catch(function () {
          const result = Grading.grade(strokesData, templateInfo, passLine, { difficulty: difficulty });
          applyTestCheckResult(result, strokesData, templateInfo, q);
        });
      return;
    }
    const result = Grading.grade(strokesData, templateInfo, passLine, { difficulty });
    applyTestCheckResult(result, strokesData, templateInfo, q);
  }

  function goNext() {
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
    if (summaryEl) summaryEl.textContent = `正答数: ${correctCount} / ${total}`;

    const avgEl = document.getElementById('test-result-average');
    if (avgEl) avgEl.textContent = `平均スコア: ${avg}点`;

    const wrongContainer = document.getElementById('test-wrong-list');
    if (wrongContainer) {
      wrongContainer.innerHTML = '';
      if (wrongList.length === 0) {
        wrongContainer.innerHTML = '<p class="muted">全問正解です！</p>';
      } else {
        wrongContainer.innerHTML = '<p>間違えた文字:</p>';
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
