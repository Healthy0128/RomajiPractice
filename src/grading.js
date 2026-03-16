/**
 * grading.js - 隰暦ｽ｡霓､・ｹ郢ｧ・｢郢晢ｽｫ郢ｧ・ｴ郢晢ｽｪ郢ｧ・ｺ郢晢｣ｰ繝ｻ蛹ｻ繝ｯ郢ｧ・､郢晄じﾎ懃ｹ昴・繝ｩ隴・ｽｹ陟第得・ｼ繝ｻ * 隰・玄謔ｽ邵ｺ・ｯ fillText + 陞滂ｽｪ驍ｱ螟ｲ・ｼ繝ｻoneWidth繝ｻ蟲ｨ縲堤ｹ晄ｧｭ縺帷ｹｧ・ｯ騾墓ｻ薙・
 * 隴崢闖ｴ螳茨ｽｷ螟占◇郢ｧ・ｲ郢晢ｽｼ郢晏現繝ｻ郢ｧ・ｫ郢晁・ﾎ樒ｹ昴・縺夂ｹ晢ｽｻoutside雋ょｸｷ縺帷ｹｧ雋樊ｸ夊ｭ擾｣ｰ
 */

(function (global) {
  'use strict';

  // --- 隰暦ｽ｡霓､・ｹ郢昜ｻ｣ﾎ帷ｹ晢ｽ｡郢晢ｽｼ郢ｧ・ｿ繝ｻ繝ｻEADME邵ｺ・ｫ髫ｪ蛟ｩ・ｼ莨夲ｽｼ繝ｻ---
  const MIN_STROKE_LENGTH_RATIO = 0.25;  // 繝ｻ莠･・ｾ謐ｺ謫り屐・､繝ｻ蟲ｨ繝ｦ郢晢ｽｳ郢晏干ﾎ樣包ｽｱ隴夲ｽ･邵ｺ・ｮ驍ｱ螟占◇隰暦ｽｨ陞ｳ螢ｹ竊帝お繝ｻ竏ｩ陷ｷ蛹ｻ・冗ｸｺ蟶吮ｻ闖ｴ・ｿ騾包ｽｨ
  const COVERAGE_GRID_SIZE = 12;          // 郢ｧ・ｫ郢晁・ﾎ樒ｹ昴・縺夐包ｽｨ郢ｧ・ｰ郢晢ｽｪ郢昴・繝ｩ 12x12
  const COVERAGE_WEIGHT = 0.3;            // score = baseScore * (0.7 + 0.3*coverage)
  const OUTSIDE_PENALTY = 25;             // 雋ょｸｷ縺・= outsideRate * OUTSIDE_PENALTY
  const PENALTY = 2.0;                    // 郢ｧ・ｾ郢晢ｽｼ郢晢ｽｳ陞滓じ繝ｻ郢晉ｿｫﾎ晉ｹ昴・縺・・繝ｻnside驍・・・ｨ閧ｲ・ｮ遉ｼ逡代・繝ｻ  const W1 = 0.45;                        // scoreMask 邵ｺ・ｮ鬩･髦ｪ竏ｩ繝ｻ繝ｻ00邵ｺ讙趣ｽｰ・｡陷雁･竊楢怎・ｺ邵ｺ・ｪ邵ｺ繝ｻ・育ｸｺ繝ｻ・ｪ・ｿ隰ｨ・ｴ繝ｻ繝ｻ  const W2 = 0.35;                        // scoreShape 邵ｺ・ｮ鬩･髦ｪ竏ｩ
  const MIN_POINTS = 5;
  const EDGE_MARGIN = 8;
  const MAX_SAMPLE_POINTS = 300;
  // --- 2026-03 grading precision tweaks (small, compatible changes) ---
  const TINY_STROKE_RATIO = 0.015;          // ignore accidental taps / very short flicks in scoring
  const SOFT_ALIGN_CENTER_BLEND = 0.65;     // light center correction for all difficulties
  const SOFT_ALIGN_SCALE_MIN = 0.88;        // absorb small size differences
  const SOFT_ALIGN_SCALE_MAX = 1.15;
  const OCR_STRONG_GATE = 90;               // strong OCR cap only when confidence is very high
  const OCR_SOFT_GATE = 78;                 // low confidence OCR is treated as hint only
  const SHAPE_RESCUE_GATE = 78;             // handwriting-core style: keep shape and zone as the main signal
  const DIST_RESCUE_GATE = 70;


  // Fade / Blind 騾包ｽｨ邵ｺ・ｮ闖ｴ蜥ｲ・ｽ・ｮ郢ｧ・ｲ郢晢ｽｼ郢晏現繝ｻ雎・ｽ｣髫穂ｸ槫密郢昜ｻ｣ﾎ帷ｹ晢ｽ｡郢晢ｽｼ郢ｧ・ｿ
  const CENTER_GATE_X_RATIO = 0.35; // 邵ｺ阮呻ｽ瑚脂・･闕ｳ雍具ｽｸ・ｭ陟｢繝ｻ窶ｲ鬮ｮ・｢郢ｧ蠕娯ｻ邵ｺ繝ｻ・檎ｸｺ・ｰ闖ｴ蜥ｲ・ｽ・ｮ騾ｧ繝ｻ竊・NG
  const CENTER_GATE_Y_RATIO = 0.25;
  const CENTER_SOFT_X_RATIO = 0.12; // soft threshold before horizontal center penalty
  const CENTER_SOFT_Y_RATIO = 0.10; // soft threshold before vertical center penalty

  /** 陋ｻ・･邵ｺ・ｮ隴√・・ｭ蜉ｱ竊堤ｸｺ蜉ｱ窶ｻ髫ｱ・ｭ邵ｺ・ｾ郢ｧ蠕娯螺郢ｧ繝ｻ0霓､・ｹ郢ｧ螳夲ｽｶ繝ｻ竏ｴ郢ｧ蟲ｨ・檎ｸｺ・ｪ邵ｺ繝ｻ・ｼ螢ｽ・ｷ・ｷ陷ｷ蠕鯉ｼ郢ｧ繝ｻ笘・ｸｺ繝ｻ譫夊氛蜉ｱ繝ｻ陝・ｽｾ陟｢諛・ｽ｡・ｨ */
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

  /** 隰悶・・ｮ螢ｹ・邵ｺ繝ｻ隴√・・ｭ蜉ｱ繝ｻ郢晄ｧｭ縺帷ｹｧ・ｯ邵ｺ・ｫ陝・ｽｾ邵ｺ蜉ｱ窶ｻ邵ｲ竏墅倡ｹ晢ｽｼ郢ｧ・ｶ郢晢ｽｼ霓､・ｹ邵ｺ・ｮ邵ｺ繝ｻ笆 inside 邵ｺ・ｮ陋溷玄辟夂ｹｧ螳夲ｽｿ譁絶・ */
  function countInsideForLetter(points, templateInfo, letter, maskW, maskH) {
    const altInfo = Object.assign({}, templateInfo, { romaji: letter, letter: letter });
    const r = computeMaskScore(points, altInfo, maskW, maskH);
    return r.inside;
  }

  /**
   * 郢晢ｽ｡郢ｧ・､郢晢ｽｳ邵ｺ・ｮ隰暦ｽ｡霓､・ｹ鬮｢・｢隰ｨ・ｰ邵ｲ繝ｻ   * 陷雁・ｽｸﾂ隴√・・ｭ繝ｻ 陟墓瑳謫らｸｺ・ｩ邵ｺ鄙ｫ・・canvas 陷茨ｽｨ闖ｴ阮吶定ｬ暦ｽ｡霓､・ｹ
   * 髫阪・辟夊ｭ√・・ｭ繝ｻ templateInfo.boxes / templateInfo.letters 邵ｺ蠕娯旺郢ｧ蠕後・邵ｲ竏ｵ譽ｧ邵ｺ譁絶・邵ｺ・ｫ1隴√・・ｭ蜉ｱ笘・ｸｺ・､隰暦ｽ｡霓､・ｹ邵ｺ諤懶ｽｹ・ｳ陜ｮ繝ｻ縺帷ｹｧ・ｳ郢ｧ・｢郢ｧ螳夲ｽｿ譁絶・
   *
   * @param {Array} pointsOrStrokes - strokes[i].points 邵ｺ・ｪ邵ｺ・ｩ
   * @param {Object} templateInfo
   * @param {number} passLine
   * @param {string|{difficulty?: string}} [options] - 鬮ｮ・｣隴冗§・ｺ・ｦ繝ｻ繝ｻrace/ghost/fade/blind繝ｻ繝ｻ   */
  function grade(pointsOrStrokes, templateInfo, passLine, options) {
    // Multi-box template uses per-box grading path.
    if (templateInfo && Array.isArray(templateInfo.boxes) && templateInfo.boxes.length > 1) {
      return gradeMultiBoxes(pointsOrStrokes, templateInfo, passLine, options);
    }

    return gradeSingle(pointsOrStrokes, templateInfo, passLine, options);
  }
  /**
   * 陷雁・ｽｸﾂ隴ｫ・ｰ繝ｻ繝ｻ隴√・・ｭ證ｦ・ｼ閾･逡醍ｸｺ・ｮ陟墓瑳謫らｹ晢ｽｭ郢ｧ・ｸ郢昴・縺・   */
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
      debug: null,
      userMessage: '',
      developerMessage: '',
      reasonUserList: [],
      reasonDevList: []
    };

    const userReasons = [];
    const devReasons = [];
    function addUserReason(msg) {
      if (!msg) return;
      if (userReasons.indexOf(msg) < 0) userReasons.push(msg);
    }
    function addDevReason(msg) {
      if (!msg) return;
      if (devReasons.indexOf(msg) < 0) devReasons.push(msg);
    }

    if (!templateInfo || !templateInfo.romaji || templateInfo.romaji.length === 0) {
      result.message = '\u898b\u672c\u304c\u3042\u308a\u307e\u305b\u3093';
      addUserReason(result.message);
      finalizeReasonFields(result, userReasons, devReasons);
      return result;
    }

    const allStrokes = toStrokesArray(pointsOrStrokes);
    const maskW = Math.round(templateInfo.width || 400);
    const maskH = Math.round(templateInfo.height || 300);
    const canvasMinDim = Math.min(maskW, maskH);

    // 2026-03: ignore accidental micro-strokes so taps do not over-penalize
    const tinyStrokeLength = Math.max(2, canvasMinDim * TINY_STROKE_RATIO);
    const filtered = filterTinyStrokes(allStrokes, tinyStrokeLength);
    const scoringStrokes = filtered.strokes.length > 0 ? filtered.strokes : allStrokes;
    const points = flattenPoints(scoringStrokes);
    const rawStrokeLength = computeTotalStrokeLength(allStrokes);
    const totalStrokeLength = computeTotalStrokeLength(scoringStrokes);

    if (filtered.ignoredCount > 0) {
      addDevReason('Ignored tiny strokes: ' + filtered.ignoredCount);
    }

    const maskForLen = buildTemplateMask(templateInfo, maskW, maskH);
    let inkCount = 0;
    for (let i = 0; i < maskForLen.data.length; i += 4) {
      if (maskForLen.data[i] > 128) inkCount++;
    }
    const expectedLen = Math.sqrt(inkCount);
    const baseMin = canvasMinDim * 0.05;
    const baseMax = canvasMinDim * 0.30;
    let minStrokeLength = expectedLen * 0.35;
    minStrokeLength = Math.max(baseMin, Math.min(baseMax, minStrokeLength));
    const fallbackMin = canvasMinDim * MIN_STROKE_LENGTH_RATIO * 0.3;
    minStrokeLength = Math.max(minStrokeLength, fallbackMin);

    if (templateInfo.letter === 'i' || templateInfo.letter === 'j') {
      const h = canvasMinDim || 1;
      const softMin = h * 0.10;
      minStrokeLength = Math.max(softMin, minStrokeLength * 0.5);
    }

    if (totalStrokeLength < minStrokeLength) {
      result.verdict = 'red';
      result.message = '\u7dda\u304c\u77ed\u3059\u304e\u307e\u3059';
      result.score = 0;
      addUserReason(result.message || '\u63a1\u70b9\u7406\u7531\u3092\u78ba\u8a8d\u3057\u3066\u304f\u3060\u3055\u3044');
      addDevReason('length ' + totalStrokeLength.toFixed(1) + ' < gate ' + minStrokeLength.toFixed(1));
      finalizeReasonFields(result, userReasons, devReasons);
      return result;
    }

    const sampled = resamplePoints(points, 2, MAX_SAMPLE_POINTS);
    if (sampled.length < MIN_POINTS) {
      result.verdict = 'red';
      result.message = '\u70b9\u304c\u5c11\u306a\u3059\u304e\u307e\u3059';
      result.score = 0;
      addUserReason(result.message || '\u63a1\u70b9\u7406\u7531\u3092\u78ba\u8a8d\u3057\u3066\u304f\u3060\u3055\u3044');
      addDevReason('sampled points=' + sampled.length);
      finalizeReasonFields(result, userReasons, devReasons);
      return result;
    }

    const edgeCount = sampled.filter(function (p) {
      return p.x < EDGE_MARGIN || p.x > maskW - EDGE_MARGIN || p.y < EDGE_MARGIN || p.y > maskH - EDGE_MARGIN;
    }).length;
    if (edgeCount > sampled.length * 0.5) {
      result.verdict = 'red';
      result.message = '\u7aef\u306e\u8aa4\u30bf\u30c3\u30c1\u304c\u591a\u3044\u3067\u3059';
      result.score = 0;
      addUserReason(result.message || '\u63a1\u70b9\u7406\u7531\u3092\u78ba\u8a8d\u3057\u3066\u304f\u3060\u3055\u3044');
      addDevReason('edge points ratio=' + (edgeCount / sampled.length).toFixed(3));
      finalizeReasonFields(result, userReasons, devReasons);
      return result;
    }

    const maskDataForBBox = buildTemplateMask(templateInfo, maskW, maskH);
    const templateBBox = computeBBoxFromMask(maskDataForBBox, maskW, maskH);
    const userBBox = computeBBoxFromPoints(sampled);

    let evalPoints = sampled;
    let normalizedBBox = null;
    let alignInfo = null;

    if (userBBox && templateBBox) {
      const dxRatio = Math.abs(userBBox.cx - templateBBox.cx) / maskW;
      const dyRatio = Math.abs(userBBox.cy - templateBBox.cy) / maskH;

      if (normalizeShape && (dxRatio > CENTER_GATE_X_RATIO || dyRatio > CENTER_GATE_Y_RATIO)) {
        result.verdict = 'red';
        result.message = '\u4f4d\u7f6e\u304c\u5927\u304d\u304f\u305a\u308c\u3066\u3044\u307e\u3059';
        result.score = 0;
      addUserReason(result.message || '\u63a1\u70b9\u7406\u7531\u3092\u78ba\u8a8d\u3057\u3066\u304f\u3060\u3055\u3044');
        addDevReason('center gate fail dx=' + dxRatio.toFixed(3) + ', dy=' + dyRatio.toFixed(3));
        result.debug = { userBBox: userBBox, templateBBox: templateBBox, normalizedBBox: null };
        finalizeReasonFields(result, userReasons, devReasons);
        return result;
      }

      // 2026-03: light alignment even in non-fade modes to absorb small size/position differences
      const alignStrength = normalizeShape ? 0.9 : SOFT_ALIGN_CENTER_BLEND;
      const scaleMin = normalizeShape ? 0.8 : SOFT_ALIGN_SCALE_MIN;
      const scaleMax = normalizeShape ? 1.25 : SOFT_ALIGN_SCALE_MAX;
      const softAligned = softAlignPointsToTemplateBBox(sampled, userBBox, templateBBox, alignStrength, scaleMin, scaleMax);
      evalPoints = softAligned.points;
      alignInfo = softAligned.info;
      normalizedBBox = computeBBoxFromPoints(evalPoints);
      addDevReason('soft align center=' + alignStrength.toFixed(2) + ', scale=' + softAligned.info.scale.toFixed(3));
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
    const shapeScore = computeShapeScore(evalPoints, templateInfo);
    const distributionScore = computeDistributionScore(evalPoints, templateInfo);

    let baseScore = insideRate * 100;
    const coverageFactor = 0.86 + 0.14 * coverage;
    baseScore = baseScore * coverageFactor;
    // 2026-03: shape/distribution are weighted a bit more so small size differences do not sink fair attempts.
    baseScore = (baseScore * 0.62) + (shapeScore * 0.23) + (distributionScore * 0.15);

    let rescueBonus = 0;
    if (coverage < 0.55 && shapeScore >= 80 && insideRate >= 0.72) {
      rescueBonus = Math.min(8, (shapeScore - 80) * 0.3 + (insideRate - 0.72) * 20);
      baseScore += rescueBonus;
      addDevReason('low-coverage rescue +' + rescueBonus.toFixed(1));
    }
    if (shapeScore >= SHAPE_RESCUE_GATE && distributionScore >= DIST_RESCUE_GATE && insideRate >= 0.66) {
      const shapeRescue = Math.min(
        9,
        ((shapeScore - SHAPE_RESCUE_GATE) * 0.22) +
        ((distributionScore - DIST_RESCUE_GATE) * 0.14) +
        Math.max(0, (insideRate - 0.66) * 10)
      );
      baseScore += shapeRescue;
      rescueBonus += shapeRescue;
      addDevReason('shape rescue +' + shapeRescue.toFixed(1));
    }

    if (normalizeShape && userBBox && templateBBox) {
      const dxRatio = Math.abs(userBBox.cx - templateBBox.cx) / maskW;
      const dyRatio = Math.abs(userBBox.cy - templateBBox.cy) / maskH;
      const nx = Math.max(0, dxRatio - CENTER_SOFT_X_RATIO) / Math.max(1e-6, CENTER_GATE_X_RATIO - CENTER_SOFT_X_RATIO);
      const ny = Math.max(0, dyRatio - CENTER_SOFT_Y_RATIO) / Math.max(1e-6, CENTER_GATE_Y_RATIO - CENTER_SOFT_Y_RATIO);
      const centerPenalty = nx * 6 + ny * 12;
      baseScore = Math.max(0, baseScore - centerPenalty);
      addDevReason('center penalty=' + centerPenalty.toFixed(2));
    }

    const penalty = Math.min(10, Math.max(0, outsideRate * 16));
    let finalScore = Math.max(0, Math.min(100, baseScore - penalty));

    // 2026-03: OCR affects score strongly only with high confidence
    let ocrDecision = { mode: 'none', expected: '', detected: '', confidence: 0, cap: null };
    if (finalScore > 49 && options && (options.ocrLetter !== undefined || options.ocrText !== undefined)) {
      const expectedLetter = (templateInfo.letter || (templateInfo.romaji && templateInfo.romaji[0]) || '').toLowerCase();
      if (expectedLetter && /^[a-z]$/.test(expectedLetter)) {
        const parsed = parseOcrSingle(options);
        if (parsed.letter && parsed.letter !== expectedLetter) {
          if (parsed.alphaLength > 1) {
            addDevReason('OCR mismatch ignored (multi-alpha text) alphaLen=' + parsed.alphaLength);
          } else {
            ocrDecision = applyOcrPenalty(finalScore, parsed.letter, expectedLetter, parsed.confidence, {
              shapeScore: shapeScore,
              distributionScore: distributionScore,
              insideRate: insideRate
            });
            finalScore = ocrDecision.score;
            if (ocrDecision.mode === 'strong') {
              result.message = '\u5225\u306e\u6587\u5b57\u306b\u8aad\u307e\u308c\u307e\u3057\u305f';
      addUserReason(result.message || '\u63a1\u70b9\u7406\u7531\u3092\u78ba\u8a8d\u3057\u3066\u304f\u3060\u3055\u3044');
            } else if (ocrDecision.mode === 'soft') {
              addDevReason('OCR soft mismatch cap=' + ocrDecision.cap + ' conf=' + parsed.confidence.toFixed(1));
            } else {
              addDevReason('OCR mismatch ignored (low confidence) conf=' + parsed.confidence.toFixed(1));
            }
          }
        }
      }
    }

    result.score = Math.round(finalScore);

    if (options && typeof options === 'object') {
      if (options.ocrText !== undefined) result.ocrText = options.ocrText;
      if (options.ocrLetter !== undefined) result.ocrLetter = options.ocrLetter;
      if (options.ocrConfidence !== undefined) result.ocrConfidence = options.ocrConfidence;
      if (options.ocrAlphaLength !== undefined) result.ocrAlphaLength = options.ocrAlphaLength;
      if (options.ocrSource !== undefined) result.ocrSource = options.ocrSource;
    }

    result.outsideRate = outsideRate;
    result.coverage = coverage;
    result.baseScore = Math.round(baseScore);
    result.lengthTotal = totalStrokeLength;
    result.lengthRaw = rawStrokeLength;
    result.lengthGate = minStrokeLength;
    result.penalty = penalty;
    result.shapeScore = Math.round(shapeScore);
    result.distributionScore = Math.round(distributionScore);
    result.rescueBonus = Number(rescueBonus.toFixed(2));
    result.ignoredTinyStrokes = filtered.ignoredCount;
    result.ocrDecision = ocrDecision;

    const keptMessage = result.message === '\u5225\u306e\u6587\u5b57\u306b\u8aad\u307e\u308c\u307e\u3057\u305f';
    if (result.score >= passLine) {
      result.verdict = 'green';
      if (!keptMessage) result.message = '\u5408\u683c';
      addUserReason(result.message || '\u63a1\u70b9\u7406\u7531\u3092\u78ba\u8a8d\u3057\u3066\u304f\u3060\u3055\u3044');
    } else if (result.score >= passLine - 10) {
      result.verdict = 'yellow';
      if (!keptMessage) result.message = '\u304a\u3057\u3044';
      addUserReason(result.message || '\u63a1\u70b9\u7406\u7531\u3092\u78ba\u8a8d\u3057\u3066\u304f\u3060\u3055\u3044');
    } else {
      result.verdict = 'red';
      if (!keptMessage) {
        if (totalStrokeLength < minStrokeLength * 1.05) {
          result.message = '\u7dda\u304c\u77ed\u3059\u304e\u307e\u3059';
      addUserReason(result.message || '\u63a1\u70b9\u7406\u7531\u3092\u78ba\u8a8d\u3057\u3066\u304f\u3060\u3055\u3044');
        } else if (outsideRate > 0.35) {
          result.message = '\u7dda\u304c\u306f\u307f\u51fa\u3057\u3066\u3044\u307e\u3059';
      addUserReason(result.message || '\u63a1\u70b9\u7406\u7531\u3092\u78ba\u8a8d\u3057\u3066\u304f\u3060\u3055\u3044');
        } else if (coverage < 0.5) {
          result.message = '\u898b\u672c\u306e\u7dda\u3092\u3082\u3046\u5c11\u3057\u306a\u305e\u3063\u3066\u304f\u3060\u3055\u3044';
      addUserReason(result.message || '\u63a1\u70b9\u7406\u7531\u3092\u78ba\u8a8d\u3057\u3066\u304f\u3060\u3055\u3044');
        } else {
          result.message = '\u3082\u3046\u4e00\u56de';
      addUserReason(result.message || '\u63a1\u70b9\u7406\u7531\u3092\u78ba\u8a8d\u3057\u3066\u304f\u3060\u3055\u3044');
        }
      }
    }

    addDevReason('insideRate=' + insideRate.toFixed(3) + ', outsideRate=' + outsideRate.toFixed(3) + ', coverage=' + coverage.toFixed(3));
    addDevReason('shape=' + shapeScore.toFixed(1) + ', dist=' + distributionScore.toFixed(1) + ', penalty=' + penalty.toFixed(2));

    result.debug = {
      userBBox: userBBox,
      templateBBox: templateBBox,
      normalizedBBox: normalizedBBox,
      alignInfo: alignInfo,
      ocrDecision: ocrDecision,
      scoreBreakdown: {
        insideRate: insideRate,
        outsideRate: outsideRate,
        coverage: coverage,
        shapeScore: shapeScore,
        distributionScore: distributionScore,
        rescueBonus: rescueBonus,
        penalty: penalty,
        baseScore: baseScore,
        finalScore: finalScore
      }
    };

    finalizeReasonFields(result, userReasons, devReasons);
    return result;
  }

  function finalizeReasonFields(result, userReasons, devReasons) {
    const userList = Array.isArray(userReasons) ? userReasons.slice(0, 6) : [];
    const devList = Array.isArray(devReasons) ? devReasons.slice(0, 12) : [];
    result.reasonUserList = userList;
    result.reasonDevList = devList;
    result.userMessage = userList.length > 0 ? userList[0] : (result.message || '');
    result.developerMessage = devList.join(' | ');
  }

  function filterTinyStrokes(strokes, tinyLength) {
    const kept = [];
    let ignoredCount = 0;
    (strokes || []).forEach(function (stroke) {
      const pts = (stroke && stroke.points) ? stroke.points : [];
      if (!pts || pts.length <= 1) {
        ignoredCount++;
        return;
      }
      const len = computeTotalStrokeLength([{ points: pts }]);
      const isTiny = len < tinyLength && pts.length <= 4;
      if (isTiny) {
        ignoredCount++;
        return;
      }
      kept.push(stroke);
    });
    return { strokes: kept, ignoredCount: ignoredCount };
  }

  function softAlignPointsToTemplateBBox(points, userBBox, templateBBox, centerBlend, scaleMin, scaleMax) {
    if (!points || !userBBox || !templateBBox) {
      return { points: points || [], info: { scale: 1, shiftX: 0, shiftY: 0 } };
    }

    const areaU = Math.max(1, userBBox.width * userBBox.height);
    const areaT = Math.max(1, templateBBox.width * templateBBox.height);
    const rawScale = Math.sqrt(areaT / areaU);
    const scale = Math.max(scaleMin, Math.min(scaleMax, rawScale));
    const shiftX = (templateBBox.cx - userBBox.cx) * centerBlend;
    const shiftY = (templateBBox.cy - userBBox.cy) * centerBlend;

    const aligned = points.map(function (p) {
      return {
        x: (p.x - userBBox.cx) * scale + userBBox.cx + shiftX,
        y: (p.y - userBBox.cy) * scale + userBBox.cy + shiftY
      };
    });

    return {
      points: aligned,
      info: {
        scale: scale,
        rawScale: rawScale,
        shiftX: shiftX,
        shiftY: shiftY,
        centerBlend: centerBlend
      }
    };
  }

  function parseOcrSingle(options) {
    let letter = '';
    let confidence = 0;
    let alphaLength = 0;
    let source = 'none';
    if (options && options.ocrLetter) {
      const l = String(options.ocrLetter).toLowerCase();
      if (/^[a-z]$/.test(l)) {
        letter = l;
        source = options.ocrSource || 'letter';
        if (typeof options.ocrConfidence === 'number' && isFinite(options.ocrConfidence)) {
          confidence = options.ocrConfidence;
        }
      }
    }
    if (!letter && options && options.ocrText !== undefined) {
      const raw = String(options.ocrText || '').trim().toLowerCase();
      const lettersOnly = raw.replace(/[^a-z]/g, '');
      alphaLength = lettersOnly.length;
      if (lettersOnly.length === 1) letter = lettersOnly[0];
      if (letter) source = options.ocrSource || 'text';
    }
    if (options && typeof options.ocrAlphaLength === 'number' && isFinite(options.ocrAlphaLength)) {
      alphaLength = Math.max(alphaLength, options.ocrAlphaLength);
    }
    return { letter: letter, confidence: confidence, alphaLength: alphaLength, source: source };
  }

  function applyOcrPenalty(currentScore, detected, expected, confidence, context) {
    if (!detected || !expected || detected === expected) {
      return { mode: 'none', score: currentScore, expected: expected, detected: detected, confidence: confidence || 0, cap: null };
    }

    const conf = (typeof confidence === 'number' && isFinite(confidence)) ? confidence : 0;
    const confusables = getConfusableLetters(expected);
    const isConfusable = confusables.indexOf(detected) >= 0;
    const shapeScore = context && typeof context.shapeScore === 'number' ? context.shapeScore : 0;
    const distributionScore = context && typeof context.distributionScore === 'number' ? context.distributionScore : 0;
    const insideRate = context && typeof context.insideRate === 'number' ? context.insideRate : 0;
    const shapeLooksRight = shapeScore >= 84 && distributionScore >= 74 && insideRate >= 0.68;
    const shapeLooksMostlyRight = shapeScore >= 78 && distributionScore >= 68 && insideRate >= 0.62;

    // 2026-03: if the handwritten shape already matches well, OCR is treated as a hint, not a veto.
    if (shapeLooksRight && conf < 97) {
      return { mode: 'none', score: currentScore, expected: expected, detected: detected, confidence: conf, cap: null };
    }
    if (shapeLooksMostlyRight && isConfusable && conf < 93) {
      return { mode: 'none', score: currentScore, expected: expected, detected: detected, confidence: conf, cap: null };
    }

    const strongGate = shapeLooksMostlyRight ? OCR_STRONG_GATE + 4 : OCR_STRONG_GATE;
    const softGate = shapeLooksMostlyRight ? OCR_SOFT_GATE + 6 : OCR_SOFT_GATE;
    const strongCap = isConfusable ? 69 : 59;
    const softCap = isConfusable ? 84 : 74;
    if (conf >= strongGate) {
      return { mode: 'strong', score: Math.min(currentScore, strongCap), expected: expected, detected: detected, confidence: conf, cap: strongCap };
    }
    if (conf >= softGate) {
      return { mode: 'soft', score: Math.min(currentScore, softCap), expected: expected, detected: detected, confidence: conf, cap: softCap };
    }
    return { mode: 'none', score: currentScore, expected: expected, detected: detected, confidence: conf, cap: null };
  }

  function computeDistributionScore(userPoints, templateInfo) {
    const templatePoints = sampleTemplatePointsFromMask(templateInfo);
    if (!templatePoints || templatePoints.length < 8 || !userPoints || userPoints.length < 8) return 50;

    const userStat = computePointDistributionStats(userPoints);
    const templateStat = computePointDistributionStats(templatePoints);
    if (!userStat || !templateStat) return 50;

    const centerDist = Math.hypot(userStat.cx - templateStat.cx, userStat.cy - templateStat.cy);
    const spreadDist = Math.abs(userStat.sx - templateStat.sx) + Math.abs(userStat.sy - templateStat.sy);
    const aspectDiff = Math.abs(Math.log((userStat.aspect + 1e-6) / (templateStat.aspect + 1e-6)));

    const score = 100 - (centerDist * 160) - (spreadDist * 220) - (aspectDiff * 35);
    return Math.max(0, Math.min(100, score));
  }

  function computePointDistributionStats(points) {
    const bbox = computeBBoxFromPoints(points);
    if (!bbox) return null;

    const w = Math.max(1e-6, bbox.width);
    const h = Math.max(1e-6, bbox.height);
    let sx = 0;
    let sy = 0;
    let sxx = 0;
    let syy = 0;

    for (let i = 0; i < points.length; i++) {
      const nx = (points[i].x - bbox.minX) / w;
      const ny = (points[i].y - bbox.minY) / h;
      sx += nx;
      sy += ny;
      sxx += nx * nx;
      syy += ny * ny;
    }

    const n = Math.max(1, points.length);
    const cx = sx / n;
    const cy = sy / n;
    const vx = Math.max(0, sxx / n - cx * cx);
    const vy = Math.max(0, syy / n - cy * cy);

    return {
      cx: cx,
      cy: cy,
      sx: Math.sqrt(vx),
      sy: Math.sqrt(vy),
      aspect: bbox.width / Math.max(1e-6, bbox.height)
    };
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
      // 闕ｳ繝ｻ・ｸﾂ郢晄ｧｭ縺帷ｹｧ・ｯ邵ｺ讙趣ｽｩ・ｺ邵ｺ・ｪ郢ｧ蟲ｨ縺冗ｹ晢ｽ｣郢晢ｽｳ郢晁・縺幄叉・ｭ陞滂ｽｮ闔牙ｩ・ｿ莉｣・定脂・ｮ邵ｺ・ｮ隴ｫ・ｰ邵ｺ・ｨ邵ｺ蜷ｶ・・      const w = maskW * 0.4;
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
   * 隰・玄謔ｽ郢晄ｧｭ縺帷ｹｧ・ｯ郢ｧ蛛ｵ縺堤ｹ晢ｽｪ郢昴・繝ｩ陋ｻ繝ｻ迚｡邵ｺ蜉ｱﾂ竏ｵ辟碑ｭ幢ｽｬ邵ｺ謔滂ｽｭ莨懈Β邵ｺ蜷ｶ・狗ｹｧ・ｻ郢晢ｽｫ邵ｺ・ｮ邵ｺ繝ｻ笆郢晢ｽｦ郢晢ｽｼ郢ｧ・ｶ郢晢ｽｼ驍ｱ螢ｹ窶ｲ鬨ｾ螢ｹ笆ｲ邵ｺ貅倥◎郢晢ｽｫ陷托ｽｲ陷ｷ繝ｻ   */
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
        // Check nearby pixels within tolerance radius for inside hit.
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
   * 髫阪・辟夊ｭｫ・ｰ繝ｻ驛・ｽ､繝ｻ辟夊ｭ√・・ｭ證ｦ・ｼ閾･逡代・蝸ｾemplateInfo.boxes / templateInfo.letters 郢ｧ蜑・ｽｽ・ｿ邵ｺ・｣邵ｺ・ｦ邵ｲ繝ｻ   * 陷ｷ繝ｻ譽ｧ邵ｺ譁絶・邵ｺ・ｫ gradeSingle 郢ｧ雋樔ｻ也ｸｺ・ｳ陷・ｽｺ邵ｺ蜉ｱﾂ竏壺落邵ｺ・ｮ陝ｷ・ｳ陜ｮ繝ｻ縺帷ｹｧ・ｳ郢ｧ・｢郢ｧ螳夲ｽｿ譁絶・邵ｲ繝ｻ   *
   * - 陷ｷ繝ｻ譽ｧ邵ｺ・ｮ strokes 邵ｺ・ｯ stroke.boxIndex 邵ｺ・ｧ隰厄ｽｯ郢ｧ髮√・邵ｺ繝ｻ   * - 隰暦ｽ｡霓､・ｹ邵ｺ・ｯ隴ｫ・ｰ郢晢ｽｭ郢晢ｽｼ郢ｧ・ｫ郢晢ｽｫ陟趣ｽｧ隶灘衷・ｳ・ｻ繝ｻ繝ｻox.x, box.y 郢ｧ雋樊ｬ｡霓､・ｹ邵ｺ・ｫ陝ｷ・ｳ髯ｦ讙趣ｽｧ・ｻ陷榊桁・ｼ繝ｻ   * - outsidePixels / insidePixels 邵ｺ・ｯ陷髦ｪ繝ｻ郢ｧ・ｰ郢晢ｽｭ郢晢ｽｼ郢晁・ﾎ晁趣ｽｧ隶灘生竊楢ｬ鯉ｽｻ邵ｺ蜉ｱ窶ｻ陷ｷ蝓溘・
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
      perBox: [],
      userMessage: '',
      developerMessage: '',
      reasonUserList: [],
      reasonDevList: []
    };

    const userReasons = [];
    const devReasons = [];
    function addUserReason(msg) {
      if (!msg) return;
      if (userReasons.indexOf(msg) < 0) userReasons.push(msg);
    }
    function addDevReason(msg) {
      if (!msg) return;
      if (devReasons.indexOf(msg) < 0) devReasons.push(msg);
    }
    function isHardZeroBox(boxRes) {
      if (!boxRes || boxRes.score !== 0) return false;
      const totalPoints = (boxRes.inside || 0) + (boxRes.outside || 0);
      const lengthTotal = typeof boxRes.lengthTotal === 'number' ? boxRes.lengthTotal : 0;
      const lengthGate = typeof boxRes.lengthGate === 'number' ? boxRes.lengthGate : 0;
      const message = String(boxRes.message || '');
      if (totalPoints === 0) return true;
      if (lengthGate > 0 && lengthTotal < lengthGate * 0.45) return true;
      return (
        message === '線が短すぎます' ||
        message === '点が少なすぎます' ||
        message === '各枠に文字を書いてください'
      );
    }

    if (!templateInfo || !letters || letters.length === 0 || boxes.length === 0) {
      result.message = '\u898b\u672c\u304c\u3042\u308a\u307e\u305b\u3093';
      addUserReason(result.message);
      finalizeReasonFields(result, userReasons, devReasons);
      return result;
    }

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

      const boxStrokes = strokesArray
        .filter(function (s) { return (s.boxIndex != null ? s.boxIndex : 0) === i; })
        .map(function (s) {
          return {
            boxIndex: i,
            points: (s.points || []).map(function (p) {
              return {
                x: p.x - box.x,
                y: p.y - box.y,
                t: p.t,
                pressure: p.pressure,
                pointerType: p.pointerType
              };
            })
          };
        });

      let localMetrics = null;
      if (typeof Template !== 'undefined' && Template.getMetrics) {
        localMetrics = Template.getMetrics(box.w, box.h);
      }

      const localTemplate = {
        romaji: letter,
        letter: letter,
        width: box.w,
        height: box.h,
        zoneWidth: templateInfo.zoneWidth || 20,
        font: templateInfo.font,
        fontSize: templateInfo.fontSize,
        strokeWidth: templateInfo.strokeWidth || 0,
        metrics: localMetrics
      };

      const boxRes = gradeSingle(boxStrokes, localTemplate, passLine, { difficulty: difficulty });
      result.perBox.push(boxRes);

      totalScore += boxRes.score;
      validBoxCount++;
      sumInside += boxRes.inside || 0;
      sumOutside += boxRes.outside || 0;

      (boxRes.outsidePixels || []).forEach(function (p) {
        allOutsidePixels.push({ x: p.x + box.x, y: p.y + box.y });
      });
      (boxRes.insidePixels || []).forEach(function (p) {
        allInsidePixels.push({ x: p.x + box.x, y: p.y + box.y });
      });
    }

    if (validBoxCount === 0) {
      return gradeSingle(pointsOrStrokes, templateInfo, passLine, options);
    }

    const avgScore = totalScore / validBoxCount;
    result.score = Math.round(Math.max(0, Math.min(100, avgScore)));

    const hardZeroBoxes = result.perBox.filter(isHardZeroBox);
    const minBoxScore = result.perBox.reduce(function (min, br) {
      return Math.min(min, br && typeof br.score === 'number' ? br.score : 100);
    }, 100);
    const lowBoxCount = result.perBox.filter(function (br) {
      return br && typeof br.score === 'number' && br.score < passLine - 12;
    }).length;

    if (hardZeroBoxes.length > 0) {
      result.score = 0;
      result.verdict = 'red';
      result.message = '\u3069\u308c\u304b1\u67a0\u304c0\u70b9\u3067\u3059';
      addUserReason(result.message || '\u63a1\u70b9\u7406\u7531\u3092\u78ba\u8a8d\u3057\u3066\u304f\u3060\u3055\u3044');
      addDevReason('multi-box hard rule: empty/too-short box => total 0');
    } else {
      if (lowBoxCount <= 1 && result.score >= passLine - 15 && minBoxScore >= passLine - 25) {
        const rescue = Math.min(5, Math.max(0, (passLine - result.score) * 0.7));
        result.score = Math.round(Math.min(100, result.score + rescue));
        addDevReason('multi-box rescue +' + rescue.toFixed(1));
      }

      let ocrDecision = { mode: 'none', expected: '', detected: '', confidence: 0, cap: null };

      if (result.score > 49 && options && Array.isArray(options.ocrPerBox) && options.ocrPerBox.length > 0) {
        let mismatch = null;
        for (let i = 0; i < letters.length && i < options.ocrPerBox.length; i++) {
          const expected = (letters[i] || '').toLowerCase();
          if (!expected || !/^[a-z]$/.test(expected)) continue;
          const info = options.ocrPerBox[i];
          const ocrLetter = (info && info.letter) ? String(info.letter).toLowerCase() : '';
          if (!ocrLetter || !/^[a-z]$/.test(ocrLetter) || ocrLetter === expected) continue;
          const alphaLen = (info && typeof info.alphaLength === 'number' && isFinite(info.alphaLength)) ? info.alphaLength : 0;
          if (alphaLen > 1) {
            addDevReason('multi OCR mismatch ignored (multi-alpha text) box=' + i + ' alphaLen=' + alphaLen);
            continue;
          }
          const conf = (info && typeof info.confidence === 'number' && isFinite(info.confidence)) ? info.confidence : 0;
          if (!mismatch || conf > mismatch.confidence) {
            mismatch = { expected: expected, detected: ocrLetter, confidence: conf, index: i };
          }
        }

        if (mismatch) {
          const boxScore = result.perBox[mismatch.index] || null;
          ocrDecision = applyOcrPenalty(result.score, mismatch.detected, mismatch.expected, mismatch.confidence, {
            shapeScore: boxScore && typeof boxScore.shapeScore === 'number' ? boxScore.shapeScore : 0,
            distributionScore: boxScore && typeof boxScore.distributionScore === 'number' ? boxScore.distributionScore : 0,
            insideRate: boxScore && typeof boxScore.inside === 'number' && typeof boxScore.outside === 'number'
              ? (boxScore.inside / Math.max(1, boxScore.inside + boxScore.outside))
              : 0
          });
          result.score = Math.round(ocrDecision.score);
          if (ocrDecision.mode === 'strong') {
            result.message = '\u5225\u306e\u6587\u5b57\u306b\u8aad\u307e\u308c\u307e\u3057\u305f';
      addUserReason(result.message || '\u63a1\u70b9\u7406\u7531\u3092\u78ba\u8a8d\u3057\u3066\u304f\u3060\u3055\u3044');
          } else if (ocrDecision.mode === 'soft') {
            addDevReason('multi OCR soft mismatch box=' + mismatch.index + ' conf=' + mismatch.confidence.toFixed(1));
          } else {
            addDevReason('multi OCR mismatch ignored (low confidence) box=' + mismatch.index + ' conf=' + mismatch.confidence.toFixed(1));
          }
        }
      } else if (result.score > 49 && options && options.ocrText !== undefined) {
        const expectedRomaji = (templateInfo.romaji || letters.join('') || '').toLowerCase().replace(/[^a-z]/g, '');
        const ocrRaw = String(options.ocrText || '').trim().toLowerCase();
        const ocrNorm = ocrRaw.replace(/[^a-z]/g, '');
        if (expectedRomaji.length >= 2 && ocrNorm.length === expectedRomaji.length && ocrNorm !== expectedRomaji) {
          // no confidence here: keep as debug hint only
          addDevReason('multi OCR text mismatch kept as hint (no confidence): ' + ocrNorm + ' != ' + expectedRomaji);
        }
      }

      result.ocrDecision = ocrDecision;
    }

    const keptMessage = result.message === '\u5225\u306e\u6587\u5b57\u306b\u8aad\u307e\u308c\u307e\u3057\u305f';
    if (hardZeroBoxes.length === 0) {
      if (result.score >= passLine) {
        result.verdict = 'green';
        if (!keptMessage) result.message = '\u5408\u683c';
      addUserReason(result.message || '\u63a1\u70b9\u7406\u7531\u3092\u78ba\u8a8d\u3057\u3066\u304f\u3060\u3055\u3044');
      } else if (result.score >= passLine - 10) {
        result.verdict = 'yellow';
        if (!keptMessage) result.message = '\u304a\u3057\u3044';
      addUserReason(result.message || '\u63a1\u70b9\u7406\u7531\u3092\u78ba\u8a8d\u3057\u3066\u304f\u3060\u3055\u3044');
      } else {
        result.verdict = 'red';
        if (!keptMessage) result.message = '\u3082\u3046\u4e00\u56de';
      addUserReason(result.message || '\u63a1\u70b9\u7406\u7531\u3092\u78ba\u8a8d\u3057\u3066\u304f\u3060\u3055\u3044');
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

    if (options && typeof options === 'object') {
      if (options.ocrText !== undefined) result.ocrText = options.ocrText;
      if (Array.isArray(options.ocrPerBox) && options.ocrPerBox.length > 0) {
        result.ocrText = options.ocrPerBox.map(function (p) { return (p && p.letter) ? p.letter : '-'; }).join(', ');
        result.ocrPerBox = options.ocrPerBox.map(function (p) {
          return {
            letter: p && p.letter ? p.letter : '',
            confidence: p && typeof p.confidence === 'number' ? p.confidence : 0,
            alphaLength: p && typeof p.alphaLength === 'number' ? p.alphaLength : 0,
            source: p && p.source ? p.source : 'none'
          };
        });
      }
    }

    addDevReason('perBox=' + result.perBox.map(function (b) { return b.score; }).join(','));
    addDevReason('outsideRate=' + result.outsideRate.toFixed(3));

    result.debug = null;
    finalizeReasonFields(result, userReasons, devReasons);
    return result;
  }

  global.Grading = {
    grade
  };
})(typeof window !== 'undefined' ? window : this);
