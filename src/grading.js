/**
 * grading.js - 採点アルゴリズム（ハイブリッド方式）
 * 手本は fillText + 太線（zoneWidth）でマスク生成
 * 最低線長ゲート・カバレッジ・outside減点を反映
 */

(function (global) {
  'use strict';

  // --- 採点パラメータ（READMEに記載） ---
  const MIN_STROKE_LENGTH_RATIO = 0.25;  // （従来値）テンプレ由来の線長推定と組み合わせて使用
  const COVERAGE_GRID_SIZE = 12;          // カバレッジ用グリッド 12x12
  const COVERAGE_WEIGHT = 0.3;            // score = baseScore * (0.7 + 0.3*coverage)
  const OUTSIDE_PENALTY = 25;             // 減点 = outsideRate * OUTSIDE_PENALTY
  const PENALTY = 2.0;                    // ゾーン外ペナルティ（inside率計算用）
  const W1 = 0.45;                        // scoreMask の重み（100が簡単に出ないよう調整）
  const W2 = 0.35;                        // scoreShape の重み
  const MIN_POINTS = 5;
  const EDGE_MARGIN = 8;
  const MAX_SAMPLE_POINTS = 300;

  // Fade / Blind 用の位置ゲート・正規化パラメータ
  const CENTER_GATE_X_RATIO = 0.35; // これ以上中心が離れていれば位置的に NG
  const CENTER_GATE_Y_RATIO = 0.25;
  const CENTER_SOFT_X_RATIO = 0.12; // この範囲を超えた分だけ減点
  const CENTER_SOFT_Y_RATIO = 0.10;

  /** 別の文字として読まれたら50点を超えられない：混同しやすい文字の対応表 */
  const CONFUSABLES = {
    a: ['o', 'e', 'd', 'q', 'c'], b: ['h', 'd', 'p', 'r'], c: ['o', 'e', 'a', 'q'],
    d: ['b', 'a', 'q', 'p'], e: ['a', 'c', 'o'], f: ['t', 'l'], g: ['q', 'y', 'j'],
    h: ['b', 'n', 'k'], i: ['l', 'j', 't'], j: ['i', 'g', 'y'], k: ['h', 'r'],
    l: ['i', 't', 'h'], m: ['n', 'w'], n: ['m', 'h', 'u', 'r'], o: ['a', 'c', 'e', 'q', 'd'],
    p: ['b', 'd', 'r'], q: ['d', 'g', 'a', 'o'], r: ['n', 'k', 'p'], s: ['z', 'c'],
    t: ['f', 'l', 'i'], u: ['n', 'v', 'w'], v: ['u', 'w'], w: ['m', 'v', 'u'],
    x: ['k', 'y'], y: ['g', 'v', 'j'], z: ['s', 'r']
  };
  const DEFAULT_ALTERNATIVES = 'a,c,e,i,o,u,n,m,h,r'.split(',');

  function getConfusableLetters(correctLetter) {
    const c = (correctLetter || '').toLowerCase();
    if (CONFUSABLES[c]) return CONFUSABLES[c];
    return DEFAULT_ALTERNATIVES.filter(function (ch) { return ch !== c; });
  }

  /** 指定した1文字のマスクに対して、ユーザー点のうち inside の個数を返す */
  function countInsideForLetter(points, templateInfo, letter, maskW, maskH) {
    const altInfo = Object.assign({}, templateInfo, { romaji: letter, letter: letter });
    const r = computeMaskScore(points, altInfo, maskW, maskH);
    return r.inside;
  }

  /**
   * メインの採点関数。
   * 単一文字: 従来どおり canvas 全体で採点
   * 複数文字: templateInfo.boxes / templateInfo.letters があれば、枠ごとに1文字ずつ採点し平均スコアを返す
   *
   * @param {Array} pointsOrStrokes - strokes[i].points など
   * @param {Object} templateInfo
   * @param {number} passLine
   * @param {string|{difficulty?: string}} [options] - 難易度（trace/ghost/fade/blind）
   */
  function grade(pointsOrStrokes, templateInfo, passLine, options) {
    // 複数枠（複数文字）モードかどうかを判定
    if (templateInfo && Array.isArray(templateInfo.boxes) && templateInfo.boxes.length > 1) {
      return gradeMultiBoxes(pointsOrStrokes, templateInfo, passLine, options);
    }

    return gradeSingle(pointsOrStrokes, templateInfo, passLine, options);
  }

  /**
   * 単一枠（1文字）用の従来ロジック
   */
  function gradeSingle(pointsOrStrokes, templateInfo, passLine, options) {
    const difficulty = typeof options === 'string'
      ? options
      : (options && options.difficulty) || 'trace';
    const normalizeShape = difficulty === 'fade' || difficulty === 'blind';

    const result = {
      score: 0,
      verdict: 'red',
      inside: 0,
      outside: 0,
      outsidePixels: [],
      message: '',
      debug: null
    };

    if (!templateInfo || !templateInfo.romaji || templateInfo.romaji.length === 0) {
      result.message = 'あてはまる手本がありません';
      return result;
    }

    const points = flattenPoints(pointsOrStrokes);
    const strokes = toStrokesArray(pointsOrStrokes);

    const maskW = Math.round(templateInfo.width || 400);
    const maskH = Math.round(templateInfo.height || 300);
    const canvasMinDim = Math.min(maskW, maskH);

    // テンプレマスクから「インク量」を推定し、期待線長を近似
    const maskForLen = buildTemplateMask(templateInfo, maskW, maskH);
    let inkCount = 0;
    for (let i = 0; i < maskForLen.data.length; i += 4) {
      if (maskForLen.data[i] > 128) inkCount++;
    }
    const expectedLen = Math.sqrt(inkCount); // おおよその長さスケール
    const baseMin = canvasMinDim * 0.05;
    const baseMax = canvasMinDim * 0.30;
    let minStrokeLength = expectedLen * 0.35;
    // 文字が小さすぎる / 大きすぎる場合の下限・上限クランプ
    minStrokeLength = Math.max(baseMin, Math.min(baseMax, minStrokeLength));
    // テンプレが極端に小さい場合の保険として旧比率も少し混ぜる
    const fallbackMin = canvasMinDim * MIN_STROKE_LENGTH_RATIO * 0.3;
    minStrokeLength = Math.max(minStrokeLength, fallbackMin);

    // i / j などの細い文字は最低線長を少し緩める（枠方式でも短ストロークを許容）
    if (templateInfo.letter === 'i' || templateInfo.letter === 'j') {
      const h = canvasMinDim || 1;
      const softMin = h * 0.10; // 非常に短い縦線でも通るように
      minStrokeLength = Math.max(softMin, minStrokeLength * 0.5);
    }

    const totalStrokeLength = computeTotalStrokeLength(strokes);
    if (totalStrokeLength < minStrokeLength) {
      result.verdict = 'red';
      result.message = '線が短すぎます';
      result.score = 0;
      return result;
    }

    const sampled = resamplePoints(points, 2, MAX_SAMPLE_POINTS);
    if (sampled.length < MIN_POINTS) {
      result.verdict = 'red';
      result.message = '点が少なすぎます';
      result.score = 0;
      return result;
    }

    const edgeCount = sampled.filter(p =>
      p.x < EDGE_MARGIN || p.x > maskW - EDGE_MARGIN ||
      p.y < EDGE_MARGIN || p.y > maskH - EDGE_MARGIN
    ).length;
    if (edgeCount > sampled.length * 0.5) {
      result.verdict = 'red';
      result.message = '端の誤タッチが多そうです';
      result.score = 0;
      return result;
    }

    let evalPoints = sampled;
    let userBBox = null;
    let templateBBox = null;
    let normalizedBBox = null;

    if (normalizeShape) {
      const maskDataForBBox = buildTemplateMask(templateInfo, maskW, maskH);
      templateBBox = computeBBoxFromMask(maskDataForBBox, maskW, maskH);
      userBBox = computeBBoxFromPoints(sampled);

      if (userBBox && templateBBox) {
        const dxRatio = Math.abs(userBBox.cx - templateBBox.cx) / maskW;
        const dyRatio = Math.abs(userBBox.cy - templateBBox.cy) / maskH;

        // 極端に違う位置は正規化前に弾く（例: 全く別の場所に書いた）
        if (dxRatio > CENTER_GATE_X_RATIO || dyRatio > CENTER_GATE_Y_RATIO) {
          result.verdict = 'red';
          result.message = '位置が大きくずれています';
          result.score = 0;
          result.debug = { userBBox, templateBBox, normalizedBBox: null };
          return result;
        }

        evalPoints = normalizePointsToTemplateBBox(sampled, userBBox, templateBBox);
        normalizedBBox = computeBBoxFromPoints(evalPoints);
      }
    }

    const maskResult = computeMaskScore(evalPoints, templateInfo, maskW, maskH);
    result.inside = maskResult.inside;
    result.outside = maskResult.outside;
    result.outsidePixels = maskResult.outsidePixels;
    result.insidePixels = maskResult.insidePixels;

    const total = maskResult.inside + maskResult.outside;
    const outsideRate = total > 0 ? maskResult.outside / total : 0;
    const insideRate = total > 0 ? maskResult.inside / total : 0;

    const coverage = computeCoverage(evalPoints, templateInfo, maskW, maskH);

    // base: insideRate のみで 0〜100 にスケーリング
    let baseScore = insideRate * 100;
    // coverage は 0.85〜1.0 の補助係数（優しめ）
    const coverageFactor = 0.85 + 0.15 * coverage;
    baseScore = baseScore * coverageFactor;

    // Fade / Blind 時のみ、中心位置のずれに応じて追加減点（縦方向をやや厳しめ）
    if (normalizeShape && userBBox && templateBBox) {
      const dxRatio = Math.abs(userBBox.cx - templateBBox.cx) / maskW;
      const dyRatio = Math.abs(userBBox.cy - templateBBox.cy) / maskH;
      const nx = Math.max(0, dxRatio - CENTER_SOFT_X_RATIO) / Math.max(1e-6, CENTER_GATE_X_RATIO - CENTER_SOFT_X_RATIO);
      const ny = Math.max(0, dyRatio - CENTER_SOFT_Y_RATIO) / Math.max(1e-6, CENTER_GATE_Y_RATIO - CENTER_SOFT_Y_RATIO);
      const centerPenalty = nx * 10 + ny * 20; // 縦方向の方が減点が大きい
      baseScore = Math.max(0, baseScore - centerPenalty);
    }

    const penalty = Math.min(12, Math.max(0, outsideRate * 20));
    const finalScore = Math.max(0, Math.min(100, baseScore - penalty));
    result.score = Math.round(finalScore);

    // 別の文字として読まれたら50点を超えられない（判定は OCR のみを使用）
    // - OCR 結果から抽出したアルファベット1文字（ocrLetter）があり
    // - その信頼度（ocrConfidence）が十分高い場合だけ、
    //   正解の1文字と違えば「別の文字」とみなして 49 点にキャップする
    if (result.score > 49 && options && (options.ocrLetter !== undefined || options.ocrText !== undefined)) {
      const expectedLetter = (templateInfo.letter || (templateInfo.romaji && templateInfo.romaji[0]) || '').toLowerCase();
      if (expectedLetter && /^[a-z]$/.test(expectedLetter)) {
        let ocrLetter = '';
        let conf = 0;
        if (options.ocrLetter) {
          const l = String(options.ocrLetter).toLowerCase();
          if (/^[a-z]$/.test(l)) {
            ocrLetter = l;
            if (typeof options.ocrConfidence === 'number' && isFinite(options.ocrConfidence)) {
              conf = options.ocrConfidence;
            }
          }
        }
        // 互換性のため、ocrLetter が無い場合は生テキストから1文字だけ推定
        if (!ocrLetter && options.ocrText !== undefined) {
          const raw = (options.ocrText || '').trim().toLowerCase();
          const lettersOnly = raw.replace(/[^a-z]/g, '');
          if (lettersOnly.length === 1) {
            ocrLetter = lettersOnly[0];
          }
        }
        const CONF_GATE = 75;
        if (ocrLetter && (conf === 0 || conf >= CONF_GATE)) {
          if (ocrLetter !== expectedLetter) {
            result.score = Math.min(result.score, 49);
            result.message = '別の文字に読まれました';
          }
        }
      }
    }

    // デバッグ用に内訳を保持
    if (options && typeof options === 'object') {
      if (options.ocrText !== undefined) result.ocrText = options.ocrText;
      if (options.ocrLetter !== undefined) result.ocrLetter = options.ocrLetter;
      if (options.ocrConfidence !== undefined) result.ocrConfidence = options.ocrConfidence;
    }
    result.outsideRate = outsideRate;
    result.coverage = coverage;
    result.baseScore = Math.round(baseScore);
    result.lengthTotal = totalStrokeLength;
    result.lengthGate = minStrokeLength;
    result.penalty = penalty;

    // 判定と簡易理由（別文字キャップ時はメッセージを上書きしない）
    const keptMessage = result.message === '別の文字に読まれました';
    if (result.score >= passLine) {
      result.verdict = 'green';
      if (!keptMessage) result.message = '合格';
    } else if (result.score >= passLine - 10) {
      result.verdict = 'yellow';
      if (!keptMessage) result.message = 'おしい';
    } else {
      result.verdict = 'red';
      if (!keptMessage) {
        if (totalStrokeLength < minStrokeLength * 1.05) {
          result.message = '線が短すぎます';
        } else if (outsideRate > 0.35) {
          result.message = '線が枠からはみ出しています';
        } else if (coverage < 0.5) {
          result.message = '手本の線をもう少しなぞってみよう';
        } else {
          result.message = 'もう一回';
        }
      }
    }

    result.debug = { userBBox, templateBBox, normalizedBBox };
    return result;
  }

  function flattenPoints(pointsOrStrokes) {
    if (!pointsOrStrokes || pointsOrStrokes.length === 0) return [];
    const first = pointsOrStrokes[0];
    if (typeof first === 'object' && first && Array.isArray(first.points)) {
      return pointsOrStrokes.reduce((acc, stroke) => acc.concat(stroke.points || []), []);
    }
    if (Array.isArray(first) && first.length > 0 && typeof first[0] === 'object' && first[0].x != null) {
      return pointsOrStrokes.reduce((acc, stroke) => acc.concat(stroke), []);
    }
    if (typeof first === 'object' && first && 'x' in first) {
      return pointsOrStrokes;
    }
    return [];
  }

  function toStrokesArray(pointsOrStrokes) {
    if (!pointsOrStrokes || pointsOrStrokes.length === 0) return [];
    const first = pointsOrStrokes[0];
    if (typeof first === 'object' && first && Array.isArray(first.points)) {
      return pointsOrStrokes;
    }
    if (Array.isArray(first) && first.length > 0 && typeof first[0] === 'object') {
      return pointsOrStrokes.map(pts => ({ points: pts }));
    }
    return [{ points: pointsOrStrokes }];
  }

  function computeTotalStrokeLength(strokes) {
    let len = 0;
    strokes.forEach(s => {
      const pts = s.points || s;
      for (let i = 1; i < pts.length; i++) {
        len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      }
    });
    return len;
  }

  function computeBBoxFromPoints(points) {
    if (!points || points.length === 0) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    points.forEach(p => {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    });
    if (!isFinite(minX) || !isFinite(maxX) || !isFinite(minY) || !isFinite(maxY)) return null;
    const width = Math.max(1, maxX - minX);
    const height = Math.max(1, maxY - minY);
    return {
      minX,
      minY,
      maxX,
      maxY,
      width,
      height,
      cx: minX + width / 2,
      cy: minY + height / 2
    };
  }

  function computeBBoxFromMask(maskImageData, maskW, maskH) {
    const data = maskImageData.data;
    let minX = maskW, minY = maskH, maxX = -1, maxY = -1;
    for (let y = 0; y < maskH; y++) {
      for (let x = 0; x < maskW; x++) {
        const idx = (y * maskW + x) * 4;
        if (data[idx] > 128) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < minX || maxY < minY) {
      // 万一マスクが空ならキャンバス中央付近を仮の枠とする
      const w = maskW * 0.4;
      const h = maskH * 0.4;
      const minXFallback = (maskW - w) / 2;
      const minYFallback = (maskH - h) / 2;
      return {
        minX: minXFallback,
        minY: minYFallback,
        maxX: minXFallback + w,
        maxY: minYFallback + h,
        width: w,
        height: h,
        cx: maskW / 2,
        cy: maskH / 2
      };
    }
    const width = Math.max(1, maxX - minX);
    const height = Math.max(1, maxY - minY);
    return {
      minX,
      minY,
      maxX,
      maxY,
      width,
      height,
      cx: minX + width / 2,
      cy: minY + height / 2
    };
  }

  function normalizePointsToTemplateBBox(points, userBBox, templateBBox) {
    if (!points || !userBBox || !templateBBox) return points;
    const scaleX = templateBBox.width / userBBox.width;
    const scaleY = templateBBox.height / userBBox.height;
    const s = Math.max(0.1, Math.min(5, Math.min(scaleX, scaleY) || 1));
    return points.map(p => ({
      x: (p.x - userBBox.cx) * s + templateBBox.cx,
      y: (p.y - userBBox.cy) * s + templateBBox.cy
    }));
  }

  /**
   * 手本マスクをグリッド分割し、手本が存在するセルのうちユーザー線が通ったセル割合
   */
  function computeCoverage(userPoints, templateInfo, maskW, maskH) {
    const templateMask = buildTemplateMask(templateInfo, maskW, maskH);
    const cellW = maskW / COVERAGE_GRID_SIZE;
    const cellH = maskH / COVERAGE_GRID_SIZE;
    const templateCells = new Set();
    const userCells = new Set();
    const data = templateMask.data;

    for (let gy = 0; gy < COVERAGE_GRID_SIZE; gy++) {
      for (let gx = 0; gx < COVERAGE_GRID_SIZE; gx++) {
        const cx = Math.floor(gx * cellW);
        const cy = Math.floor(gy * cellH);
        const idx = (cy * maskW + cx) * 4;
        if (data[idx] > 128) templateCells.add(gy * COVERAGE_GRID_SIZE + gx);
      }
    }

    userPoints.forEach(p => {
      const gx = Math.min(COVERAGE_GRID_SIZE - 1, Math.floor(p.x / cellW));
      const gy = Math.min(COVERAGE_GRID_SIZE - 1, Math.floor(p.y / cellH));
      userCells.add(gy * COVERAGE_GRID_SIZE + gx);
    });

    let covered = 0;
    templateCells.forEach(cellId => {
      if (userCells.has(cellId)) covered++;
    });
    const totalTemplate = templateCells.size;
    return totalTemplate > 0 ? covered / totalTemplate : 0;
  }

  function drawMaskTemplate(mCtx, templateInfo, maskW, maskH) {
    const zoneWidth = templateInfo.zoneWidth || 20;
    const romaji = templateInfo.romaji || '';
    if (!romaji) return;
    mCtx.fillStyle = 'black';
    mCtx.fillRect(0, 0, maskW, maskH);
    mCtx.fillStyle = 'white';
    mCtx.strokeStyle = 'white';
    if (typeof Template !== 'undefined' && templateInfo.metrics && Template.drawTemplateRomaji) {
      Template.drawTemplateRomaji(mCtx, romaji, templateInfo.metrics, {
        fontSize: templateInfo.fontSize,
        font: templateInfo.font,
        zoneWidth,
        isStroke: true
      });
    } else {
      const font = templateInfo.font || '48px sans-serif';
      const textX = templateInfo.textX != null ? templateInfo.textX : (maskW / 2 - 20);
      const textY = templateInfo.textY != null ? templateInfo.textY : (maskH / 2 + 10);
      mCtx.font = font;
      mCtx.textBaseline = 'alphabetic';
      mCtx.lineWidth = zoneWidth;
      mCtx.lineJoin = 'round';
      mCtx.lineCap = 'round';
      mCtx.strokeText(romaji, textX, textY);
      mCtx.fillText(romaji, textX, textY);
    }
  }

  function buildTemplateMask(templateInfo, maskW, maskH) {
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = maskW;
    maskCanvas.height = maskH;
    const mCtx = maskCanvas.getContext('2d');
    drawMaskTemplate(mCtx, templateInfo, maskW, maskH);
    return mCtx.getImageData(0, 0, maskW, maskH);
  }

  function computeMaskScore(points, templateInfo, maskW, maskH) {
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = maskW;
    maskCanvas.height = maskH;
    const mCtx = maskCanvas.getContext('2d');
    drawMaskTemplate(mCtx, templateInfo, maskW, maskH);

    const maskData = mCtx.getImageData(0, 0, maskW, maskH);
    const maskBuf = maskData.data;

    let inside = 0;
    let outside = 0;
    const outsidePixels = [];
    const insidePixels = [];

    const strokeWidth = templateInfo.strokeWidth || 0;
    const toleranceRadius = strokeWidth > 0 ? Math.max(1, Math.round(strokeWidth * 0.6)) : 0;
    const tol2 = toleranceRadius * toleranceRadius;

    for (let i = 0; i < points.length; i++) {
      const x = Math.round(points[i].x);
      const y = Math.round(points[i].y);
      if (x < 0 || x >= maskW || y < 0 || y >= maskH) {
        outside++;
        outsidePixels.push({ x, y });
        continue;
      }
      let isInside = false;
      if (toleranceRadius <= 1) {
        const idx = (y * maskW + x) * 4;
        if (maskBuf[idx] > 128) isInside = true;
      } else {
        // 半径 toleranceRadius 以内に手本マスクがあれば inside とみなす
        for (let dy = -toleranceRadius; dy <= toleranceRadius && !isInside; dy++) {
          const ny = y + dy;
          if (ny < 0 || ny >= maskH) continue;
          for (let dx = -toleranceRadius; dx <= toleranceRadius; dx++) {
            const nx = x + dx;
            if (nx < 0 || nx >= maskW) continue;
            if (dx * dx + dy * dy > tol2) continue;
            const idx = (ny * maskW + nx) * 4;
            if (maskBuf[idx] > 128) {
              isInside = true;
              break;
            }
          }
        }
      }

      if (isInside) {
        inside++;
        insidePixels.push({ x, y });
      } else {
        outside++;
        outsidePixels.push({ x, y });
      }
    }
    return { inside, outside, outsidePixels, insidePixels };
  }

  function computeShapeScore(userPoints, templateInfo) {
    const templatePoints = sampleTemplatePointsFromMask(templateInfo);
    if (templatePoints.length === 0) return 50;

    const sampled = resamplePoints(userPoints, 3, MAX_SAMPLE_POINTS);
    let sumDist = 0;
    let count = 0;
    for (let i = 0; i < sampled.length; i++) {
      let minD = Infinity;
      for (let j = 0; j < templatePoints.length; j++) {
        const d = Math.hypot(sampled[i].x - templatePoints[j].x, sampled[i].y - templatePoints[j].y);
        minD = Math.min(minD, d);
      }
      sumDist += minD;
      count++;
    }
    const avgDist = count > 0 ? sumDist / count : 100;
    const zoneW = templateInfo.zoneWidth || 20;
    const score = Math.max(0, 100 - (avgDist / (zoneW * 2)) * 50);
    return Math.min(100, score);
  }

  function sampleTemplatePointsFromMask(templateInfo) {
    const maskW = Math.round(templateInfo.width || 400);
    const maskH = Math.round(templateInfo.height || 300);
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = maskW;
    maskCanvas.height = maskH;
    const mCtx = maskCanvas.getContext('2d');
    drawMaskTemplate(mCtx, templateInfo, maskW, maskH);

    const maskData = mCtx.getImageData(0, 0, maskW, maskH);
    const data = maskData.data;
    const pts = [];
    for (let y = 0; y < maskH; y++) {
      for (let x = 0; x < maskW; x++) {
        const idx = (y * maskW + x) * 4;
        if (data[idx] > 128) pts.push({ x, y });
      }
    }
    return resamplePoints(pts, 5, MAX_SAMPLE_POINTS);
  }

  function resamplePoints(points, minDist, maxPoints) {
    if (!points || points.length <= 1) return points || [];
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
   * 複数枠（複数文字）用：templateInfo.boxes / templateInfo.letters を使って、
   * 各枠ごとに gradeSingle を呼び出し、その平均スコアを返す。
   *
   * - 各枠の strokes は stroke.boxIndex で振り分け
   * - 採点は枠ローカル座標系（box.x, box.y を原点に平行移動）
   * - outsidePixels / insidePixels は再びグローバル座標に戻して合成
   */
  function gradeMultiBoxes(pointsOrStrokes, templateInfo, passLine, options) {
    const difficulty = typeof options === 'string'
      ? options
      : (options && options.difficulty) || 'trace';

    const boxes = templateInfo.boxes || [];
    const letters = templateInfo.letters && templateInfo.letters.length
      ? templateInfo.letters
      : (templateInfo.romaji || '').split('');

    const result = {
      score: 0,
      verdict: 'red',
      inside: 0,
      outside: 0,
      outsidePixels: [],
      insidePixels: [],
      message: '',
      debug: null,
      perBox: []
    };

    if (!templateInfo || !letters || letters.length === 0 || boxes.length === 0) {
      result.message = 'あてはまる手本がありません';
      return result;
    }

    // strokes 配列から boxIndex ごとに振り分け
    const strokesArray = toStrokesArray(pointsOrStrokes);
    const boxCount = Math.min(boxes.length, letters.length);

    let totalScore = 0;
    let validBoxCount = 0;
    let sumInside = 0;
    let sumOutside = 0;
    const allOutsidePixels = [];
    const allInsidePixels = [];

    for (let i = 0; i < boxCount; i++) {
      const box = boxes[i];
      if (!box) continue;
      const letter = letters[i] || '';

      // この枠に属するストロークだけを抽出（boxIndex が一致するもの）
      const boxStrokes = strokesArray
        .filter(s => (s.boxIndex != null ? s.boxIndex : 0) === i)
        .map(s => ({
          boxIndex: i,
          points: (s.points || []).map(p => ({
            x: p.x - box.x,
            y: p.y - box.y,
            t: p.t,
            pressure: p.pressure,
            pointerType: p.pointerType
          }))
        }));

      // マスク生成も枠ローカル座標系 0..box.w, 0..box.h で行う
      let localMetrics = null;
      if (typeof Template !== 'undefined' && Template.getMetrics) {
        localMetrics = Template.getMetrics(box.w, box.h);
      }

      // 何も書かれていない枠も採点関数に渡す（length gate で 0 点）
      const localTemplate = {
        romaji: letter,
        letter,
        width: box.w,
        height: box.h,
        zoneWidth: templateInfo.zoneWidth || 20,
        font: templateInfo.font,
        fontSize: templateInfo.fontSize,
        strokeWidth: templateInfo.strokeWidth || 0,
        metrics: localMetrics
      };

      const boxRes = gradeSingle(boxStrokes, localTemplate, passLine, { difficulty });
      result.perBox.push(boxRes);

      totalScore += boxRes.score;
      validBoxCount++;

      sumInside += boxRes.inside || 0;
      sumOutside += boxRes.outside || 0;

      // 枠ローカル → グローバル座標に戻して収集
      (boxRes.outsidePixels || []).forEach(p => {
        allOutsidePixels.push({ x: p.x + box.x, y: p.y + box.y });
      });
      (boxRes.insidePixels || []).forEach(p => {
        allInsidePixels.push({ x: p.x + box.x, y: p.y + box.y });
      });
    }

    if (validBoxCount === 0) {
      // 何も書かれていない場合は単一枠ロジックに任せる
      return gradeSingle(pointsOrStrokes, templateInfo, passLine, options);
    }

    const avgScore = totalScore / validBoxCount;
    result.score = Math.round(Math.max(0, Math.min(100, avgScore)));

    // 複数枠の抽象ルール1: いずれかの枠が0点（空枠・線が短い）なら全体不合格
    const anyBoxZero = result.perBox.some(function (br) { return br.score === 0; });
    if (anyBoxZero) {
      result.score = 0;
      result.verdict = 'red';
      result.message = '各枠に文字を書いてください';
    } else {
      // 複数枠の抽象ルール2: 2文字以上は OCR 必須。未実行・空・または期待文字列と不一致なら50点未満に
      const expectedRomaji = (templateInfo.romaji || letters.join('') || '').toLowerCase().replace(/[^a-z]/g, '');
      if (result.score > 49 && expectedRomaji.length >= 2) {
        const ocrRaw = (options && options.ocrText !== undefined) ? (options.ocrText || '').trim().toLowerCase() : '';
        const ocrNorm = ocrRaw.replace(/[^a-z]/g, '');
        if (ocrNorm.length === 0) {
          result.score = Math.min(result.score, 49);
          result.message = 'OCRで読み取れませんでした';
        } else if (ocrNorm !== expectedRomaji) {
          result.score = Math.min(result.score, 49);
          result.message = '別の文字に読まれました';
        }
      }
    }

    // 合否判定（総合のみ）
    const keptMessage = result.message === '別の文字に読まれました' || result.message === 'OCRで読み取れませんでした';
    if (!anyBoxZero) {
      if (result.score >= passLine) {
        result.verdict = 'green';
        if (!keptMessage) result.message = '合格';
      } else if (result.score >= passLine - 10) {
        result.verdict = 'yellow';
        if (!keptMessage) result.message = 'おしい';
      } else {
        result.verdict = 'red';
        if (!keptMessage) result.message = 'もう一回';
      }
    }

    result.inside = sumInside;
    result.outside = sumOutside;
    result.outsidePixels = allOutsidePixels;
    result.insidePixels = allInsidePixels;

    const totalPoints = sumInside + sumOutside || 1;
    result.outsideRate = sumOutside / totalPoints;
    result.coverage = undefined;
    result.baseScore = undefined;
    result.lengthTotal = undefined;
    result.lengthGate = undefined;
    result.penalty = undefined;

    if (options && typeof options === 'object' && options.ocrText !== undefined) {
      result.ocrText = options.ocrText;
    }
    result.debug = null;
    return result;
  }

  global.Grading = {
    grade
  };
})(typeof window !== 'undefined' ? window : this);
