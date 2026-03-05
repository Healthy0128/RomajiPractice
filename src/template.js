/**
 * template.js - 手本描画の集約
 * すべてのローマ字テンプレは Teachers フォントから生成し、
 * 表示・マスク・判定で同一の描画関数を共有する。
 */

(function (global) {
  'use strict';

  // Teachers を第一候補にした表示用フォント
  const FONT_FALLBACK = '"TeachersWeb", system-ui, sans-serif';

  let fontReady = false;
  let fontReadyPromise = null;
  if (typeof document !== 'undefined' && document.fonts && document.fonts.load) {
    fontReadyPromise = document.fonts.load('16px "TeachersWeb"').then(() => {
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

  /** 4線の位置（writing area 高さ h に対する比率） */
  const TOP_LINE = 0.25;
  const MID_LINE = 0.50;   // writing area のちょうど中央
  const BASE_LINE = 0.72;
  const BOTTOM_LINE = 0.88;
  const FOUR_LINE_ALPHA = 0.18;

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
    ctx.strokeStyle = `rgba(128,128,128,${FOUR_LINE_ALPHA})`;
    ctx.lineWidth = 1;
    [m.topLine, m.midLine, m.baseLine, m.bottomLine].forEach(y => {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    });
    ctx.restore();
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
  function drawTemplateLetter(ctx, letter, metrics, x, fontSize, font, zoneWidth, isStroke) {
    const baseLine = metrics.baseLine;
    if (isStroke) {
      ctx.save();
      ctx.strokeStyle = 'white';
      ctx.fillStyle = 'white';
      ctx.font = font;
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
      ctx.font = font;
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
    const { fontSize, font, zoneWidth, isStroke } = options || {};
    const baseLine = metrics.baseLine;
    const fontStr = font || `${fontSize || 48}px ${FONT_FALLBACK}`;
    ctx.font = fontStr;

    const charWidths = [];
    for (const letter of romaji) {
      const w = ctx.measureText(letter).width;
      charWidths.push({ letter, w });
    }
    const totalW = charWidths.reduce((s, c) => s + c.w, 0);
    let x = metrics.centerX - totalW / 2;

    charWidths.forEach(({ letter, w }) => {
      drawTemplateLetter(ctx, letter, metrics, x, fontSize, fontStr, zoneWidth, isStroke);
      x += w;
    });
  }

  /**
   * romaji が topLine〜bottomLine に収まる最大フォントサイズを算出し、メトリクスとフォント情報を返す
   */
  function measureRomaji(ctx, romaji, width, height) {
    const m = getMetrics(width, height);
    const writingHeight = m.baseLine - m.topLine;
    // 画面に対する文字サイズを約2倍に（writingArea に収まる範囲で）
    const sizeScale = 2;
    let fontSize = Math.max(10, Math.floor(writingHeight * 0.95 * sizeScale));

    const maxW = width * 0.9;
    // 横幅がはみ出す場合のみ縮小
    ctx.font = `${fontSize}px ${FONT_FALLBACK}`;
    let totalWidth = 0;
    for (const letter of romaji) {
      totalWidth += ctx.measureText(letter).width;
    }
    if (totalWidth > 0 && totalWidth > maxW) {
      const scale = maxW / totalWidth;
      fontSize = Math.max(10, Math.floor(fontSize * scale));
    }

    return {
      metrics: m,
      font: `${fontSize}px ${FONT_FALLBACK}`,
      fontSize
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
