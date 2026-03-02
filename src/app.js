/**
 * app.js - 画面制御・ルーティング
 * Practice / Test / History は各モジュールの init() に委譲
 */

(function (global) {
  'use strict';

  function showView(viewId, options) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const el = document.getElementById(viewId + '-view');
    if (el) el.classList.add('active');

    if (viewId === 'practice') {
      if (typeof Practice !== 'undefined') Practice.init(options?.kana);
    } else if (viewId === 'history') {
      if (typeof History !== 'undefined') History.init();
    } else if (viewId === 'test') {
      if (typeof Test !== 'undefined') Test.init();
    }
  }

  function updateViewportHeightVar() {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    const root = document.documentElement;
    if (!root) return;
    const vh = window.innerHeight * 0.01;
    root.style.setProperty('--vh', vh + 'px');
  }

  function updateOrientation() {
    if (typeof window === 'undefined') return;
    const root = document.documentElement;
    if (!root) return;
    const w = window.innerWidth || root.clientWidth || 1;
    const h = window.innerHeight || root.clientHeight || 1;
    const orientation = w >= h ? 'landscape' : 'portrait';
    root.setAttribute('data-orientation', orientation);

    // ビューポート高さ変数を更新（iOS Safari のアドレスバー伸縮対策）
    updateViewportHeightVar();

    // キャンバスレイアウトも安全に再同期
    if (typeof Draw !== 'undefined' && typeof Draw.syncCanvasToWrap === 'function') {
      Draw.syncCanvasToWrap();
    }
  }

  function bindOrientation() {
    if (typeof window === 'undefined') return;
    window.addEventListener('resize', updateOrientation);
    window.addEventListener('orientationchange', updateOrientation);
  }

  function bindNav() {
    const btnPractice = document.getElementById('btn-practice');
    if (btnPractice) btnPractice.addEventListener('click', () => showView('practice'));
    const btnTest = document.getElementById('btn-test');
    if (btnTest) btnTest.addEventListener('click', () => showView('test'));
    const btnHistory = document.getElementById('btn-history');
    if (btnHistory) btnHistory.addEventListener('click', () => showView('history'));

    const btnBackPractice = document.getElementById('btn-back-practice');
    if (btnBackPractice) btnBackPractice.addEventListener('click', () => showView('home'));
    const btnBackTest = document.getElementById('btn-back-test');
    if (btnBackTest) btnBackTest.addEventListener('click', () => showView('home'));
    const btnBackHistory = document.getElementById('btn-back-history');
    if (btnBackHistory) btnBackHistory.addEventListener('click', () => showView('home'));
  }

  function init() {
    bindNav();
    bindOrientation();
    updateOrientation();
    showView('home');
  }

  global.App = { showView };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(typeof window !== 'undefined' ? window : this);
