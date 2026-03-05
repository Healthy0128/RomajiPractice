/**
 * draw.js - 入力・ストローク管理・再描画
 * 手本は template.js の drawTemplateRomaji に集約（Teachers フォント）
 * ResizeObserver でキャンバス再計算、4線は Template の仕様に合わせる
 */

(function (global) {
  'use strict';

  let canvasEl = null;
  let templateEl = null;
  let feedbackEl = null;
  let ctx = null;
  let templateCtx = null;
  let feedbackCtx = null;
  let dpr = 1;
  let width = 400;
  let height = 300;
  let strokes = [];
  let currentStroke = null;
  let penActive = false;
  let templateRomaji = '';
  let textLayout = null;
  let zoneWidth = 20;
  let smoothing = 0.5;
  let resizeObserver = null;
  let overlayStrokes = null;
  let userStrokeWidth = 8;
  let userStrokeWidthManual = false; // スライダーで指定中は true

  let onPointsChange = null;

  // 複数文字用：枠レイアウトとアクティブ枠
  let letters = [];            // テンプレ用の1文字ずつの配列（例: "chi" -> ["c","h","i"]）
  let boxRects = [];           // 各枠の位置・サイズ { x, y, w, h }（CSS座標）
  let activeBoxIndex = 0;      // 現在入力中の枠
  let autoAdvanceBox = true;   // pointerup 後に次の枠へ自動移動（将来的にUIトグル可能）

  function initCanvas(drawCanvasId, feedbackCanvasId, templateCanvasId) {
    canvasEl = document.getElementById(drawCanvasId);
    feedbackEl = document.getElementById(feedbackCanvasId);
    templateEl = document.getElementById(templateCanvasId || 'template-canvas');
    if (!canvasEl || !feedbackEl) return;

    canvasEl.style.touchAction = 'none';
    if (templateEl) templateEl.style.touchAction = 'none';
    feedbackEl.style.touchAction = 'none';

    ctx = canvasEl.getContext('2d');
    feedbackCtx = feedbackEl.getContext('2d');
    templateCtx = templateEl ? templateEl.getContext('2d') : null;

    resizeCanvas();
    bindPointerEvents();

    const container = canvasEl.parentElement;
    if (typeof ResizeObserver !== 'undefined' && container) {
      resizeObserver = new ResizeObserver(() => resizeCanvas());
      resizeObserver.observe(container);
    } else if (typeof window !== 'undefined') {
      window.addEventListener('resize', resizeCanvas);
    }
  }

  function resizeCanvas() {
    if (!canvasEl || !feedbackCtx || !ctx) return;
    dpr = window.devicePixelRatio || 1;
    const wrap = canvasEl.parentElement || canvasEl;
    const rect = wrap.getBoundingClientRect();
    width = Math.max(1, Math.floor(rect.width));
    height = Math.max(1, Math.floor(rect.height));

    [canvasEl, feedbackEl].forEach(el => {
      if (!el) return;
      el.width = width * dpr;
      el.height = height * dpr;
      el.style.width = width + 'px';
      el.style.height = height + 'px';
    });
    if (templateEl) {
      templateEl.width = width * dpr;
      templateEl.height = height * dpr;
      templateEl.style.width = width + 'px';
      templateEl.style.height = height + 'px';
    }
    // CSSピクセル座標系に統一（以後の描画は x,y をそのまま使う）
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    feedbackCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (templateCtx) {
      templateCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    // リサイズ中に描画していたストロークは安全のためキャンセル扱い
    if (currentStroke && strokes.length > 0 && strokes[strokes.length - 1].points === currentStroke) {
      strokes.pop();
      currentStroke = null;
      if (onPointsChange) onPointsChange(strokes);
    }

    // テンプレのメトリクスと枠レイアウトを再計算
    if (templateRomaji && typeof Template !== 'undefined' && templateCtx) {
      if (Template.isFontReady && Template.isFontReady()) {
        textLayout = Template.measureRomaji(templateCtx, templateRomaji, width, height);
        recalcStrokeWidth();
      } else if (Template.whenFontReady) {
        textLayout = null;
        Template.whenFontReady().then(() => {
          if (!templateCtx || templateRomaji === '') return;
          textLayout = Template.measureRomaji(templateCtx, templateRomaji, width, height);
          recalcStrokeWidth();
          recomputeLetterLayout();
          return;
        });
      }
    }
    recomputeLetterLayout();
  }

  /**
   * テンプレ文字列から letters / boxRects を再計算し、4線＋お手本＋ユーザー描画を再描画する。
   * リサイズ・テンプレ変更・履歴オーバーレイON/OFF後など、描画レイアウトの再構成はここを入口にする。
   */
  function recomputeLetterLayout() {
    // letters を決定（ヘボン式ローマ字は英字だけを対象にする）
    if (templateRomaji && templateRomaji.length > 0) {
      const plain = String(templateRomaji);
      const chars = plain.split('');
      letters = chars;
    } else {
      letters = [];
    }

    recomputeBoxRects();
    rebuildAllGuideMasks();
    redrawAll(getCurrentDifficulty(), getFadeElapsed());
  }

  /**
   * 現在のキャンバス幅・高さと letters に基づいて、各枠の矩形を再計算する。
   * 単一文字のときはキャンバス全体を1枠として扱う。
   */
  function recomputeBoxRects() {
    const count = letters && letters.length ? letters.length : 0;
    if (!count || count <= 1) {
      boxRects = [{ x: 0, y: 0, w: width, h: height }];
      if (!letters || letters.length === 0) {
        if (templateRomaji && templateRomaji.length > 0) {
          letters = [templateRomaji];
        } else {
          letters = [];
          boxRects = [];
        }
      }
      activeBoxIndex = 0;
      return;
    }

    const canvasW = width;
    const canvasH = height;
    if (canvasW <= 0 || canvasH <= 0) {
      boxRects = [];
      return;
    }

    // モバイル（縦長）かどうかで目標幅を変える
    const isPortrait = typeof document !== 'undefined'
      && document.documentElement
      && document.documentElement.getAttribute('data-orientation') === 'portrait';

    const gap = 24; // 枠間の固定ギャップ
    const usableW = canvasW * 0.96; // 両端に少し余白を残す

    const baseRatio = isPortrait ? 0.75 : 0.22;
    const minBox = 220;
    const maxBox = isPortrait ? 420 : 340;

    let desiredBoxW = canvasW * baseRatio;
    let boxW = Math.max(minBox, Math.min(maxBox, desiredBoxW));

    let total = count * boxW + (count - 1) * gap;
    if (total > usableW) {
      boxW = (usableW - (count - 1) * gap) / count;
      if (!isFinite(boxW) || boxW < 24) {
        boxW = Math.max(24, usableW / count - gap);
      }
      total = count * boxW + (count - 1) * gap;
    }

    const startX = (canvasW - total) / 2;
    const boxH = canvasH; // 4線はキャンバス共通のため高さはキャンバスに合わせる
    const boxTop = 0;

    const rects = [];
    for (let i = 0; i < count; i++) {
      const x = startX + i * (boxW + gap);
      rects.push({ x, y: boxTop, w: boxW, h: boxH });
    }
    boxRects = rects;

    if (!Number.isFinite(activeBoxIndex) || activeBoxIndex < 0) activeBoxIndex = 0;
    if (activeBoxIndex >= boxRects.length) activeBoxIndex = boxRects.length - 1;
  }

  /**
   * お手本マスクや採点用の補助データを再構成するためのフック。
   * 現在の実装では grading.js 側で都度マスクを生成しているため、
   * ここでは将来拡張用のプレースホルダとして何もしない。
   */
  function rebuildAllGuideMasks() {
    // no-op（grading.js 側で毎回 buildTemplateMask しているため）
  }

  function setTemplate(romaji) {
    const r = (romaji && typeof romaji === 'string' && !/^\(/.test(romaji)) ? romaji : '';
    templateRomaji = r;
    activeBoxIndex = 0;
    if (r && typeof Template !== 'undefined' && templateCtx) {
      if (Template.isFontReady && Template.isFontReady()) {
        textLayout = Template.measureRomaji(templateCtx, r, width, height);
        recalcStrokeWidth();
      } else if (Template.whenFontReady) {
        textLayout = null;
        Template.whenFontReady().then(() => {
          if (!templateCtx || templateRomaji !== r) return;
          textLayout = Template.measureRomaji(templateCtx, r, width, height);
          recalcStrokeWidth();
          recomputeLetterLayout();
          return;
        });
      }
    } else {
      textLayout = null;
      letters = [];
      boxRects = [];
    }
    recomputeLetterLayout();
  }

  function drawTemplate(difficulty, fadeElapsed) {
    if (!templateCtx) return;

    templateCtx.clearRect(0, 0, width, height);

    if (typeof Template !== 'undefined') {
      Template.drawFourLines(templateCtx, width, height);
    }

    if (!templateRomaji) return;

    // フォント未ロード時はテンプレを描かず、簡単なプレースホルダのみ表示
    if (typeof Template !== 'undefined' && Template.isFontReady && !Template.isFontReady()) {
      templateCtx.save();
      templateCtx.fillStyle = '#94a3b8';
      templateCtx.font = '14px system-ui, sans-serif';
      templateCtx.textAlign = 'center';
      templateCtx.textBaseline = 'middle';
      templateCtx.fillText('フォント読込中…', width / 2, height / 2);
      templateCtx.restore();
      return;
    }

    if (!textLayout && typeof Template !== 'undefined' && templateCtx) {
      textLayout = Template.measureRomaji(templateCtx, templateRomaji, width, height);
      recalcStrokeWidth();
      recomputeLetterLayout();
    }
    if (!textLayout) return;

    let alpha = 1;
    if (difficulty === 'ghost') {
      alpha = 0.15;
    } else if (difficulty === 'fade' && fadeElapsed != null && fadeElapsed >= 0) {
      alpha = Math.max(0, 1 - Math.min(1, fadeElapsed)); // 1秒かけて徐々に0へ
    } else if (difficulty === 'blind') {
      alpha = 0;
    }

    if (alpha <= 0) return;

    templateCtx.save();
    templateCtx.globalAlpha = alpha;

    const hasMultiBoxes = letters && letters.length > 1 && boxRects && boxRects.length === letters.length;

    if (!hasMultiBoxes) {
      // 1文字または従来どおりの単一領域
      if (typeof Template !== 'undefined' && Template.drawTemplateRomaji) {
        Template.drawTemplateRomaji(templateCtx, templateRomaji, textLayout.metrics, {
          fontSize: textLayout.fontSize,
          font: textLayout.font,
          zoneWidth: null,
          isStroke: false
        });
      } else {
        templateCtx.font = textLayout.font || '48px sans-serif';
        templateCtx.fillStyle = '#333';
        templateCtx.textBaseline = 'alphabetic';
        templateCtx.fillText(templateRomaji, (width - templateCtx.measureText(templateRomaji).width) / 2, textLayout.metrics.baseLine);
      }
    } else {
      // 複数枠：各枠ごとに1文字ずつ描画
      for (let i = 0; i < letters.length; i++) {
        const box = boxRects[i];
        if (!box) continue;
        const letter = letters[i] || '';
        if (!letter) continue;

        templateCtx.save();
        templateCtx.beginPath();
        templateCtx.rect(box.x, box.y, box.w, box.h);
        templateCtx.clip();

        if (typeof Template !== 'undefined' && Template.drawTemplateRomaji) {
          // 枠専用メトリクス：縦位置はキャンバス共通4線に揃えつつ、centerX だけ枠中心に
          const m = Template.getMetrics(width, height);
          const metricsForBox = {
            topLine: m.topLine,
            midLine: m.midLine,
            baseLine: m.baseLine,
            bottomLine: m.bottomLine,
            centerX: box.x + box.w / 2,
            width,
            height
          };
          Template.drawTemplateRomaji(templateCtx, letter, metricsForBox, {
            fontSize: textLayout.fontSize,
            font: textLayout.font,
            zoneWidth: null,
            isStroke: false
          });
        } else {
          templateCtx.font = textLayout.font || '48px sans-serif';
          templateCtx.fillStyle = '#333';
          templateCtx.textBaseline = 'alphabetic';
          const text = letter;
          const tw = templateCtx.measureText(text).width;
          const m = Template.getMetrics(width, height);
          const x = box.x + (box.w - tw) / 2;
          templateCtx.fillText(text, x, m.baseLine);
        }
        templateCtx.restore();

        // 枠線（アクティブ枠を少し強調）
        templateCtx.save();
        const isActive = i === activeBoxIndex;
        templateCtx.strokeStyle = isActive ? 'rgba(37,99,235,0.9)' : 'rgba(148,163,184,0.9)';
        templateCtx.lineWidth = isActive ? 2 : 1;
        templateCtx.strokeRect(
          box.x + 0.5,
          box.y + 0.5,
          box.w - 1,
          box.h - 1
        );
        templateCtx.restore();
      }
    }

    templateCtx.restore();
  }

  function redrawAll(difficulty, fadeElapsed) {
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    drawTemplate(difficulty || 'trace', fadeElapsed);
    drawUserStrokes();
    if (overlayStrokes && overlayStrokes.length > 0) drawStrokesOverlay(overlayStrokes, 0.35);
  }

  function setOverlayStrokes(strokesData) {
    overlayStrokes = strokesData;
  }

  function clearOverlay() {
    overlayStrokes = null;
  }

  function drawUserStrokes() {
    if (!ctx) return;
    ctx.save();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = userStrokeWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // 枠ごとにクリップして描画
    strokes.forEach(stroke => {
      const pts = stroke.points || stroke;
      if (!pts || pts.length < 2) return;
      const bIndex = stroke.boxIndex != null ? stroke.boxIndex : 0;
      const box = boxRects[bIndex] || { x: 0, y: 0, w: width, h: height };
      ctx.save();
      ctx.beginPath();
      ctx.rect(box.x, box.y, box.w, box.h);
      ctx.clip();
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
      ctx.restore();
    });
    if (currentStroke && currentStroke.points && currentStroke.points.length >= 2) {
      const pts = currentStroke.points;
      const bIndex = currentStroke.boxIndex != null ? currentStroke.boxIndex : 0;
      const box = boxRects[bIndex] || { x: 0, y: 0, w: width, h: height };
      ctx.save();
      ctx.beginPath();
      ctx.rect(box.x, box.y, box.w, box.h);
      ctx.clip();
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  function recalcStrokeWidth() {
    if (userStrokeWidthManual) return; // スライダーで指定中はテンプレ基準で上書きしない
    if (!templateRomaji || !textLayout || !templateCtx || typeof Template === 'undefined' || !Template.estimateFontStrokeWidth) {
      return;
    }
    const letters = templateRomaji.replace(/[^a-z]/gi, '');
    const target = letters.charAt(0) || 'o';
    const fontSize = textLayout.fontSize || 48;
    const fontStroke = Template.estimateFontStrokeWidth(target, fontSize);
    let userWidth = fontStroke ? fontStroke * 0.95 : fontSize * 0.16;
    if (!isFinite(userWidth) || userWidth <= 0) {
      userWidth = fontSize * 0.16;
    }
    userStrokeWidth = Math.max(6, Math.min(48, userWidth));
  }

  function drawFeedback(outsidePixels) {
    if (!feedbackCtx) return;
    feedbackCtx.clearRect(0, 0, width, height);
    if (!outsidePixels || outsidePixels.length === 0) return;
    feedbackCtx.fillStyle = 'rgba(220,38,38,0.6)';
    outsidePixels.forEach(p => {
      feedbackCtx.fillRect(Math.floor(p.x), Math.floor(p.y), 2, 2);
    });
  }

  // inside/outside の分類を重ねて表示（デバッグ用）
  function drawClassificationOverlay(insidePixels, outsidePixels) {
    if (!feedbackCtx) return;
    // outside は既に drawFeedback で描画済みと想定し、inside のみ緑で重ねる
    if (insidePixels && insidePixels.length > 0) {
      feedbackCtx.save();
      feedbackCtx.fillStyle = 'rgba(34,197,94,0.6)'; // 緑
      insidePixels.forEach(p => {
        feedbackCtx.fillRect(Math.floor(p.x), Math.floor(p.y), 2, 2);
      });
      feedbackCtx.restore();
    }
  }

  function clearFeedback() {
    if (feedbackCtx) feedbackCtx.clearRect(0, 0, width, height);
  }

  function bindPointerEvents() {
    if (!canvasEl) return;
    canvasEl.addEventListener('pointerdown', onPointerDown);
    canvasEl.addEventListener('pointermove', onPointerMove);
    canvasEl.addEventListener('pointerup', onPointerUp);
    canvasEl.addEventListener('pointercancel', onPointerCancel);
  }

  function onPointerDown(e) {
    e.preventDefault();
    if (e.pointerType === 'pen') penActive = true;
    if (e.pointerType === 'touch' && penActive) return;
    canvasEl.setPointerCapture(e.pointerId);
    const pt = getCanvasPoint(e);
    if (!pt) return;

    // どの枠かを判定
    const boxIndex = findBoxIndexForPoint(pt.x, pt.y);
    if (boxIndex < 0) return;
    activeBoxIndex = boxIndex;

    const point = { x: pt.x, y: pt.y, t: Date.now(), pressure: e.pressure, pointerType: e.pointerType };
    currentStroke = { boxIndex, points: [point] };
    strokes.push(currentStroke);
    // Fade モードは最初のストローク開始時にフェードタイマーをスタート
    if (getCurrentDifficulty() === 'fade' && !fadeStartTime) {
      setFadeStart();
    }
    if (onPointsChange) onPointsChange(strokes);
    redrawAll(getCurrentDifficulty(), getFadeElapsed());
  }

  function onPointerMove(e) {
    if (e.pointerType === 'touch' && penActive) return;
    if (!currentStroke || !currentStroke.points || currentStroke.points.length === 0) return;
    const pt = getCanvasPoint(e);
    if (!pt) return;
    currentStroke.points.push({ x: pt.x, y: pt.y, t: Date.now(), pressure: e.pressure, pointerType: e.pointerType });
    applySmoothingToCurrentStroke();
    if (onPointsChange) onPointsChange(strokes);
    redrawAll(getCurrentDifficulty(), getFadeElapsed());
  }

  function onPointerUp(e) {
    if (e.pointerType === 'pen') penActive = false;
    if (e.pointerType === 'touch' && penActive) return;
    canvasEl.releasePointerCapture(e.pointerId);
    const finishedBox = currentStroke ? currentStroke.boxIndex : null;
    currentStroke = null;

    // 自動進行が有効なら、最後に書いた枠の次へ
    if (autoAdvanceBox && finishedBox != null && letters && letters.length > 1) {
      const next = Math.min(letters.length - 1, finishedBox + 1);
      if (next !== activeBoxIndex) {
        activeBoxIndex = next;
        redrawAll(getCurrentDifficulty(), getFadeElapsed());
      }
    }
  }

  function onPointerCancel(e) {
    if (currentStroke && strokes.length > 0 && strokes[strokes.length - 1] === currentStroke) {
      strokes.pop();
      currentStroke = null;
      if (onPointsChange) onPointsChange(strokes);
      redrawAll(getCurrentDifficulty(), getFadeElapsed());
    }
  }

  function getCanvasPoint(e) {
    const rect = canvasEl.getBoundingClientRect();
    // CSS ピクセルでそのまま取得（setTransform で dpr を吸収済み）
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const M = width * 0.08;
    if (x < -M || x > width + M || y < -M || y > height + M) return null;
    return { x, y };
  }

  /**
   * 座標 (x,y) が属する枠の index を返す。どの枠にも入っていなければ -1。
   */
  function findBoxIndexForPoint(x, y) {
    if (!boxRects || boxRects.length === 0) {
      // 枠情報がまだなければキャンバス全体を1枠として扱う
      if (x >= 0 && x <= width && y >= 0 && y <= height) return 0;
      return -1;
    }
    for (let i = 0; i < boxRects.length; i++) {
      const b = boxRects[i];
      if (!b) continue;
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
        return i;
      }
    }
    return -1;
  }

  let currentDifficultyFn = () => 'trace';
  let fadeStartTime = null;
  let fadeRafId = null;

  function setDifficultyGetter(fn) {
    currentDifficultyFn = fn;
  }

  function setFadeStart() {
    fadeStartTime = performance.now();
    if (fadeRafId != null && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(fadeRafId);
    }
    if (typeof requestAnimationFrame !== 'undefined') {
      const loop = () => {
        const elapsed = getFadeElapsed();
        redrawAll(getCurrentDifficulty(), elapsed);
        if (elapsed < 1) {
          fadeRafId = requestAnimationFrame(loop);
        } else {
          fadeRafId = null;
        }
      };
      fadeRafId = requestAnimationFrame(loop);
    }
  }

  function getCurrentDifficulty() {
    return typeof currentDifficultyFn === 'function' ? currentDifficultyFn() : 'trace';
  }

  function getFadeElapsed() {
    if (!fadeStartTime) return -1;
    return (performance.now() - fadeStartTime) / 1000;
  }

  function resetFade() {
    if (fadeRafId != null && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(fadeRafId);
    }
    fadeRafId = null;
    fadeStartTime = null;
  }

  function applySmoothingToCurrentStroke() {
    if (!currentStroke || !currentStroke.points || currentStroke.points.length < 3 || smoothing <= 0) return;
    const s = Math.min(0.9, smoothing);
    const pts = currentStroke.points;
    for (let i = 1; i < pts.length - 1; i++) {
      const prev = pts[i - 1];
      const next = pts[i + 1];
      pts[i].x = pts[i].x + (prev.x + next.x - 2 * pts[i].x) * s * 0.25;
      pts[i].y = pts[i].y + (prev.y + next.y - 2 * pts[i].y) * s * 0.25;
    }
  }

  function clear() {
    strokes = [];
    currentStroke = null;
    activeBoxIndex = 0;
    if (onPointsChange) onPointsChange(strokes);
    clearFeedback();
    redrawAll(getCurrentDifficulty(), getFadeElapsed());
  }

  function setSettings(opts) {
    if (opts.zoneWidth != null) zoneWidth = opts.zoneWidth;
    if (opts.smoothing != null) smoothing = opts.smoothing;
    if (opts.userStrokeWidth != null) {
      const v = Math.max(2, Math.min(48, Number(opts.userStrokeWidth)));
      userStrokeWidth = v;
      userStrokeWidthManual = true;
    }
  }

  function getStrokes() {
    return strokes.map(s => ({
      boxIndex: s.boxIndex != null ? s.boxIndex : 0,
      points: (s.points || []).slice()
    }));
  }

  function getPoints() {
    return strokes.reduce((acc, s) => acc.concat(s.points), []);
  }

  /**
   * OCR用：白背景＋黒ストロークのみのキャンバスを返す。
   * 枠内のみが必要な場合は call 側で crop する想定。ここでは全体を返す。
   */
  function getImageForOCR() {
    const w = width;
    const h = height;
    const scale = 2;
    const ocrCanvas = document.createElement('canvas');
    ocrCanvas.width = w * scale;
    ocrCanvas.height = h * scale;
    const ocrCtx = ocrCanvas.getContext('2d');
    if (!ocrCtx) return null;
    ocrCtx.scale(scale, scale);
    ocrCtx.fillStyle = '#fff';
    ocrCtx.fillRect(0, 0, w, h);
    ocrCtx.strokeStyle = '#000';
    ocrCtx.lineWidth = userStrokeWidth;
    ocrCtx.lineCap = 'round';
    ocrCtx.lineJoin = 'round';
    strokes.forEach(stroke => {
      const pts = stroke.points || stroke;
      if (!pts || pts.length < 2) return;
      ocrCtx.beginPath();
      ocrCtx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ocrCtx.lineTo(pts[i].x, pts[i].y);
      ocrCtx.stroke();
    });
    return ocrCanvas;
  }

  /**
   * 指定した枠だけを切り出した OCR 用キャンバス（白背景＋その枠のストロークのみ、枠ローカル座標）。
   * 複数枠で「枠ごとに1文字ずつ判定」するときに使う。
   */
  function getImageForOCRBox(boxIndex) {
    const box = (boxRects && boxRects[boxIndex]) ? boxRects[boxIndex] : null;
    if (!box || !box.w || !box.h) return null;
    const scale = 2;
    const ocrCanvas = document.createElement('canvas');
    ocrCanvas.width = box.w * scale;
    ocrCanvas.height = box.h * scale;
    const ocrCtx = ocrCanvas.getContext('2d');
    if (!ocrCtx) return null;
    ocrCtx.scale(scale, scale);
    ocrCtx.fillStyle = '#fff';
    ocrCtx.fillRect(0, 0, box.w, box.h);
    ocrCtx.strokeStyle = '#000';
    ocrCtx.lineWidth = userStrokeWidth;
    ocrCtx.lineCap = 'round';
    ocrCtx.lineJoin = 'round';
    strokes.forEach(stroke => {
      const bIndex = stroke.boxIndex != null ? stroke.boxIndex : 0;
      if (bIndex !== boxIndex) return;
      const pts = stroke.points || stroke;
      if (!pts || pts.length < 2) return;
      ocrCtx.beginPath();
      ocrCtx.moveTo(pts[0].x - box.x, pts[0].y - box.y);
      for (let i = 1; i < pts.length; i++) {
        ocrCtx.lineTo(pts[i].x - box.x, pts[i].y - box.y);
      }
      ocrCtx.stroke();
    });
    return ocrCanvas;
  }

  /** 採点用：Template と同一の metrics を渡し、grading で drawTemplateRomaji を呼べるようにする */
  function getTemplateForGrading() {
    if (!templateRomaji || !textLayout) {
      return { romaji: '', width, height, zoneWidth };
    }
    const metrics = (typeof Template !== 'undefined' && Template.getMetrics)
      ? Template.getMetrics(width, height)
      : { topLine: height * 0.25, midLine: height * 0.4, baseLine: height * 0.62, bottomLine: height * 0.78, centerX: width / 2, width, height };
    return {
      romaji: templateRomaji,
      metrics,
      font: textLayout.font,
      fontSize: textLayout.fontSize,
      width,
      height,
      zoneWidth,
      strokeWidth: userStrokeWidth,
      // 複数文字用：枠レイアウトと1文字配列を渡す
      boxes: boxRects.slice(),
      letters: letters.slice()
    };
  }

  /** 指定ストロークを薄くオーバーレイ描画（履歴プレビュー用） */
  function drawStrokesOverlay(strokesData, alpha) {
    if (!ctx) return;
    ctx.save();
    ctx.globalAlpha = alpha != null ? alpha : 0.35;
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    (strokesData || []).forEach(stroke => {
      const pts = stroke.points || stroke;
      if (pts.length < 2) return;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
    });
    ctx.restore();
  }

  /** デバッグ用：手本・ユーザー・正規化後のバウンディングボックスを薄線で表示 */
  function drawDebugBoxes(debugInfo) {
    if (!feedbackCtx || !debugInfo) return;
    const { templateBBox, userBBox, normalizedBBox } = debugInfo;
    feedbackCtx.save();
    feedbackCtx.lineWidth = 1.5;
    if (templateBBox) {
      feedbackCtx.strokeStyle = 'rgba(59,130,246,0.8)'; // 青: 手本
      feedbackCtx.strokeRect(
        templateBBox.minX,
        templateBBox.minY,
        templateBBox.width,
        templateBBox.height
      );
    }
    if (userBBox) {
      feedbackCtx.strokeStyle = 'rgba(16,185,129,0.8)'; // 緑: ユーザー
      feedbackCtx.strokeRect(
        userBBox.minX,
        userBBox.minY,
        userBBox.width,
        userBBox.height
      );
    }
    if (normalizedBBox) {
      feedbackCtx.setLineDash([4, 3]);
      feedbackCtx.strokeStyle = 'rgba(147,51,234,0.8)'; // 紫: 正規化後
      feedbackCtx.strokeRect(
        normalizedBBox.minX,
        normalizedBBox.minY,
        normalizedBBox.width,
        normalizedBBox.height
      );
      feedbackCtx.setLineDash([]);
    }
    feedbackCtx.restore();
  }

  function initReplayCanvas(canvasId) {
    const el = document.getElementById(canvasId);
    if (!el) return;
    el.style.touchAction = 'none';
    const rect = el.getBoundingClientRect();
    const w = Math.floor(rect.width);
    const h = Math.floor(rect.height);
    const d = window.devicePixelRatio || 1;
    el.width = w * d;
    el.height = h * d;
    el.style.width = w + 'px';
    el.style.height = h + 'px';
    const c = el.getContext('2d');
    c.scale(d, d);
    return { el, ctx: c, width: w, height: h };
  }

  function replayPoints(replayCanvasCtx, replayWidth, replayHeight, pointsOrStrokesToReplay, speed, showTemplate, templateInfo, onFinish) {
    const strokesToReplay = Array.isArray(pointsOrStrokesToReplay) && pointsOrStrokesToReplay.length > 0
      ? (pointsOrStrokesToReplay[0].points ? pointsOrStrokesToReplay : [{ points: pointsOrStrokesToReplay }])
      : [];
    const allPoints = strokesToReplay.reduce((a, s) => a.concat(s.points || s), []);
    if (allPoints.length < 2) {
      if (onFinish) onFinish();
      return;
    }
    const startT = Math.min(...allPoints.map(p => p.t));
    const endT = Math.max(...allPoints.map(p => p.t));
    const realStart = performance.now();
    let rafId = null;

    function draw(timestamp) {
      const realElapsed = (timestamp || performance.now()) - realStart;
      const targetT = startT + realElapsed * speed;

      replayCanvasCtx.clearRect(0, 0, replayWidth, replayHeight);
      if (showTemplate && templateInfo && templateInfo.romaji && typeof Template !== 'undefined') {
        replayCanvasCtx.save();
        replayCanvasCtx.globalAlpha = 0.3;
        const m = Template.getMetrics(replayWidth, replayHeight);
        Template.drawTemplateRomaji(replayCanvasCtx, templateInfo.romaji, m, {
          fontSize: templateInfo.fontSize,
          font: templateInfo.font,
          isStroke: false
        });
        replayCanvasCtx.restore();
      }
      strokesToReplay.forEach(stroke => {
        const pts = stroke.points || stroke;
        let i = 0;
        while (i < pts.length && pts[i].t <= targetT) i++;
        const visible = pts.slice(0, Math.max(1, i));
        if (visible.length >= 2) {
          replayCanvasCtx.strokeStyle = '#000';
          replayCanvasCtx.lineWidth = 4;
          replayCanvasCtx.lineCap = 'round';
          replayCanvasCtx.lineJoin = 'round';
          replayCanvasCtx.beginPath();
          replayCanvasCtx.moveTo(visible[0].x, visible[0].y);
          for (let j = 1; j < visible.length; j++) replayCanvasCtx.lineTo(visible[j].x, visible[j].y);
          replayCanvasCtx.stroke();
        }
      });
      if (targetT >= endT) {
        cancelAnimationFrame(rafId);
        if (onFinish) onFinish();
        return;
      }
      rafId = requestAnimationFrame(draw);
    }
    rafId = requestAnimationFrame(draw);
  }

  global.Draw = {
    initCanvas,
    setTemplate,
    setDifficultyGetter,
    setFadeStart,
    resetFade,
    setSettings,
    setOnPointsChange: (fn) => { onPointsChange = fn; },
    getPoints,
    getStrokes,
    clear,
    redrawAll,
    drawFeedback,
    drawClassificationOverlay,
    clearFeedback,
    drawStrokesOverlay,
    setOverlayStrokes,
    clearOverlay,
    getTemplateForGrading,
    getImageForOCR,
    getImageForOCRBox,
    getCanvasSize: () => ({ width, height }),
    getUserStrokeWidth: () => userStrokeWidth,
    syncCanvasToWrap: resizeCanvas,
    drawDebugBoxes,
    initReplayCanvas,
    replayPoints
  };
})(typeof window !== 'undefined' ? window : this);
