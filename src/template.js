/**
 * template.js - 手本描画の集約
 * すべてのローマ字テンプレは Teachers フォントから生成し、
 * 表示・マスク・判定で同一の描画関数を共有する。
 */

(function (global) {
  'use strict';

  // Teachers を第一候補にした表示用フォント
  const FONT_FALLBACK = '"Andika", "TeachersWeb", system-ui, sans-serif';
  const FONT_LOAD_FAMILY = '"Andika"';

  let fontReady = false;
  let fontReadyPromise = null;
  if (typeof document !== 'undefined' && document.fonts && document.fonts.load) {
    fontReadyPromise = document.fonts.load(`16px ${FONT_LOAD_FAMILY}`).then(() => {
      fontReady = true;
    }).catch(() => {
      // フォントロードに失敗した場合も、以降の処理が進むように true にしておく
      fontReady = true;
    });
  } else {
    fontReady = true;
    fontReadyPromise = Promise.resolve();
  }

  function isFontReady() {
    return fontReady;
  }

  function whenFontReady() {
    return fontReady ? Promise.resolve() : (fontReadyPromise || Promise.resolve());
  }

  /** 4線の位置（キャンバス高さ h に対する比率） */
  // 文字サイズを2倍にしたので、上下の線を少し広げてバランスを取り直す
  // 2026-03: align four guides with the reference handwriting-core guide model.
  // 2026-03: pull the top guide further down so ascenders do not look overstretched.
  const TOP_LINE = 0.24;
  const MID_LINE = 0.42;   // x-height line
  const BASE_LINE = 0.68;
  const BOTTOM_LINE = 0.88;
  const FOUR_LINE_ALPHA = 0.18;

  // フォントサイズ計算用の論理的な書字エリア（従来の比率を維持して文字サイズを安定させる）
  const FONT_TOP_RATIO = 0.18;
  const FONT_BASE_RATIO = 0.76;
  const BASE_LINE_COLOR = 'rgba(244, 114, 114, 0.36)';
  const GUIDE_LINE_COLOR = `rgba(128,128,128,${FOUR_LINE_ALPHA})`;
  // 2026-03: align letter bands with handwriting-core letterCategories.js
  const XHEIGHT = 'acemnorsuvwxz';
  const ASCENDERS = 'bdhklt';
  const DESCENDERS = 'gpqy';
  const DOTS = 'ij';
  const SPECIAL = 'f';
  const UPPERCASE_RE = /^[A-Z]$/;
  const PROBE_FONT_SIZE = 100;

  /**
   * キャンバスサイズからメトリクスを計算
   * @param {number} width
   * @param {number} height
   * @returns {{ topLine, midLine, baseLine, bottomLine, centerX, height }}
   */
  function getMetrics(width, height) {
    return {
      topLine: height * TOP_LINE,
      midLine: height * MID_LINE,
      baseLine: height * BASE_LINE,
      bottomLine: height * BOTTOM_LINE,
      centerX: width / 2,
      width,
      height
    };
  }

  /**
   * 4線を半透明で描画（最背面）
   */
  function drawFourLines(ctx, width, height) {
    const m = getMetrics(width, height);
    ctx.save();
    ctx.lineWidth = 1;
    [m.topLine, m.midLine, m.baseLine, m.bottomLine].forEach(y => {
      ctx.strokeStyle = Math.abs(y - m.baseLine) < 0.001 ? BASE_LINE_COLOR : GUIDE_LINE_COLOR;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    });
    ctx.restore();
  }

  function bandFromZone(zone, metrics) {
    const lineHeight = metrics.bottomLine - metrics.topLine;
    const topKey = zone.topKey || 'mid';
    const bottomKey = zone.bottomKey || 'baseLine';
    const top = metrics[`${topKey}Line`] + ((zone.topOffset || 0) * lineHeight);
    const bottom = metrics[`${bottomKey}Line`] + ((zone.bottomOffset || 0) * lineHeight);
    return { top: top, bottom: bottom };
  }

  function getLetterBand(letter, metrics) {
    const ch = String(letter || '');
    const lower = ch.toLowerCase();
    if (UPPERCASE_RE.test(ch)) {
      return bandFromZone({ topKey: 'top', bottomKey: 'base' }, metrics);
    }
    if (DOTS.indexOf(lower) >= 0) {
      // i/j: dot letters, with j descending below baseline.
      if (lower === 'j') return bandFromZone({ topKey: 'mid', bottomKey: 'bottom', topOffset: -0.08 }, metrics);
      return bandFromZone({ topKey: 'mid', bottomKey: 'base', topOffset: -0.08 }, metrics);
    }
    if (SPECIAL.indexOf(lower) >= 0) {
      // f: shorter ascender, so keep the top between the top and middle guides.
      return bandFromZone({ topKey: 'top', bottomKey: 'base', topOffset: 0.06 }, metrics);
    }
    if (ASCENDERS.indexOf(lower) >= 0) {
      if (lower === 't') {
        // t also sits lower than full ascenders in Andika-style handwriting guides.
        return bandFromZone({ topKey: 'top', bottomKey: 'base', topOffset: 0.06 }, metrics);
      }
      return bandFromZone({ topKey: 'top', bottomKey: 'base' }, metrics);
    }
    if (DESCENDERS.indexOf(lower) >= 0) {
      return bandFromZone({ topKey: 'mid', bottomKey: 'bottom' }, metrics);
    }
    if (XHEIGHT.indexOf(lower) >= 0) {
      return bandFromZone({ topKey: 'mid', bottomKey: 'base' }, metrics);
    }
    return bandFromZone({ topKey: 'mid', bottomKey: 'base' }, metrics);
  }

  function getGlyphMetrics(ctx, letter) {
    const tm = ctx.measureText(letter);
    const ascent = tm.actualBoundingBoxAscent || 0;
    const descent = tm.actualBoundingBoxDescent || 0;
    return {
      width: tm.width || 0,
      ascent,
      descent,
      height: Math.max(1, ascent + descent)
    };
  }

  function getLetterTargetHeight(letter, metrics) {
    const band = getLetterBand(letter, metrics);
    return Math.max(1, band.bottom - band.top);
  }

  function getLetterProbeMetrics(ctx, letter) {
    ctx.font = `${PROBE_FONT_SIZE}px ${FONT_FALLBACK}`;
    return getGlyphMetrics(ctx, letter);
  }

  function buildLetterLayout(ctx, letter, metrics, scale) {
    const probe = getLetterProbeMetrics(ctx, letter);
    const targetHeight = getLetterTargetHeight(letter, metrics);
    const ratio = targetHeight / Math.max(1, probe.height);
    const fontSize = Math.max(10, PROBE_FONT_SIZE * ratio * (scale || 1));
    const font = `${fontSize}px ${FONT_FALLBACK}`;
    ctx.font = font;
    const glyph = getGlyphMetrics(ctx, letter);
    const band = getLetterBand(letter, metrics);
    // Match the glyph bottom to the target band so stems sit on the baseline instead of floating.
    const baseLine = band.bottom - glyph.descent;
    return {
      letter: letter,
      font: font,
      fontSize: fontSize,
      glyph: glyph,
      band: band,
      baseLine: baseLine,
      width: glyph.width
    };
  }

  function computeRomajiLayout(ctx, romaji, metrics, maxWidth) {
    const layouts = [];
    let totalWidth = 0;

    for (const letter of romaji) {
      const layout = buildLetterLayout(ctx, letter, metrics, 1);
      layouts.push(layout);
      totalWidth += layout.width;
    }

    if (maxWidth && totalWidth > maxWidth && totalWidth > 0) {
      const shrink = Math.max(0.82, maxWidth / totalWidth);
      totalWidth = 0;
      for (let i = 0; i < layouts.length; i++) {
        const layout = buildLetterLayout(ctx, layouts[i].letter, metrics, shrink);
        layouts[i] = layout;
        totalWidth += layout.width;
      }
    }

    return { layouts: layouts, totalWidth: totalWidth };
  }

  /**
   * 1文字を描画（Teachers フォントで統一）
   * @param {CanvasRenderingContext2D} ctx
   * @param {string} letter - 1文字
   * @param {Object} metrics - getMetrics の戻り値
   * @param {number} x - その文字の左端（ベースライン上の描画開始X）
   * @param {number} fontSize - フォント用サイズ
   * @param {string} font - フォント文字列（フォント描画時のみ）
   * @param {number} zoneWidth - マスク用太さ（isStroke true のとき）
   * @param {boolean} isStroke - true ならマスク用（白・太線）
   */
  function drawTemplateLetter(ctx, letter, metrics, x, fontSize, font, zoneWidth, isStroke, layout) {
    const letterLayout = layout || buildLetterLayout(ctx, letter, metrics, 1);
    ctx.font = letterLayout.font;
    const baseLine = letterLayout.baseLine;
    if (isStroke) {
      ctx.save();
      ctx.strokeStyle = 'white';
      ctx.fillStyle = 'white';
      ctx.textBaseline = 'alphabetic';
      ctx.lineWidth = zoneWidth || 20;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.strokeText(letter, x, baseLine);
      ctx.fillText(letter, x, baseLine);
      ctx.restore();
    } else {
      ctx.save();
      ctx.fillStyle = '#333';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(letter, x, baseLine);
      ctx.restore();
    }
  }

  /**
   * 複数文字（romaji 文字列）を描画。文字幅は measureText で測定し、
   * Teachers フォントで中央寄せして描画する。
   */
  function drawTemplateRomaji(ctx, romaji, metrics, options) {
    const { zoneWidth, isStroke, layout } = options || {};
    const layoutResult = layout || computeRomajiLayout(ctx, romaji, metrics, metrics.width * 0.9);
    let x = metrics.centerX - layoutResult.totalWidth / 2;

    layoutResult.layouts.forEach((item) => {
      drawTemplateLetter(ctx, item.letter, metrics, x, item.fontSize, item.font, zoneWidth, isStroke, item);
      x += item.width;
    });
  }

  /**
   * romaji が topLine〜bottomLine に収まる最大フォントサイズを算出し、メトリクスとフォント情報を返す
   */
  function measureRomaji(ctx, romaji, width, height) {
    const m = getMetrics(width, height);
    const hasWideLetter = /[mw]/i.test(romaji || '');
    const maxW = width * (hasWideLetter ? 0.84 : 0.88);
    const layout = computeRomajiLayout(ctx, romaji, m, maxW);
    const fontSize = layout.layouts.reduce(function (max, item) {
      return Math.max(max, item.fontSize);
    }, 10);

    return {
      metrics: m,
      font: `${fontSize}px ${FONT_FALLBACK}`,
      fontSize,
      layout: layout
    };
  }

  // Teachers フォントのストローク太さを概算する（letter + fontSize ごとにキャッシュ）
  const strokeWidthCache = {};

  function estimateFontStrokeWidth(letter, fontSize) {
    if (!letter || !fontSize || typeof document === 'undefined') return fontSize * 0.16;
    const key = `${letter}|${fontSize}`;
    if (strokeWidthCache[key]) return strokeWidthCache[key];

    const size = Math.max(32, Math.ceil(fontSize * 4));
    const off = document.createElement('canvas');
    off.width = size;
    off.height = size;
    const octx = off.getContext('2d');
    if (!octx) return fontSize * 0.16;

    octx.clearRect(0, 0, size, size);
    octx.fillStyle = '#000';
    octx.font = `${fontSize}px ${FONT_FALLBACK}`;
    octx.textBaseline = 'middle';
    octx.textAlign = 'center';
    octx.fillText(letter, size / 2, size / 2);

    const img = octx.getImageData(0, 0, size, size);
    const data = img.data;
    const widths = [];
    const yStart = Math.floor(size * 0.3);
    const yEnd = Math.floor(size * 0.7);

    for (let y = yStart; y <= yEnd; y++) {
      let run = 0;
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4 + 3; // alpha
        const a = data[idx];
        if (a > 32) {
          run++;
        } else if (run > 0) {
          widths.push(run);
          run = 0;
        }
      }
      if (run > 0) widths.push(run);
    }

    const filtered = widths.filter(w => w >= 2 && w <= fontSize * 1.5);
    const arr = filtered.length > 0 ? filtered : widths;
    if (arr.length === 0) return fontSize * 0.16;

    arr.sort((a, b) => a - b);
    const mid = Math.floor(arr.length / 2);
    const median = arr.length % 2 === 0 ? (arr[mid - 1] + arr[mid]) / 2 : arr[mid];
    const result = median || fontSize * 0.16;
    strokeWidthCache[key] = result;
    return result;
  }

  global.Template = {
    getMetrics,
    drawFourLines,
    drawTemplateRomaji,
    measureRomaji,
    FOUR_LINE: { TOP_LINE, MID_LINE, BASE_LINE, BOTTOM_LINE },
    FOUR_LINE_ALPHA,
    isFontReady,
    whenFontReady,
    estimateFontStrokeWidth
  };
})(typeof window !== 'undefined' ? window : this);
