Original prompt: 以下の手書き文字練習アプリを修正してください。今回は不具合修正、採点基準変更、JSON出力仕様変更、日本語対応をまとめて行います。全面作り直しではなく、既存構造を活かした最小変更を優先してください。

- 2026-03-10: 既存コード確認。practice/test/grading/draw/template/index/styles/data を対象化。
- 2026-03-10: 文字化けが UI 文字列とデータに広く存在。まず日本語文言とJSON仕様を優先修正予定。
- TODO: 判定ボタン発火安定化、70/80基準統一、JSON2種出力、m/w収まり改善、日本語統一。

- 2026-03-13: Andikaフォント導入に着手。template.js で4線位置と英字の ascender/x-height/descender 帯に合わせた描画ロジックへ変更中。

- 2026-03-13: Andikaへ切替。4線ガイドのベースラインを薄い赤に変更し、uppercase/ascender/x-height/descenderごとに文字帯を分けてテンプレート描画位置を調整。qa_live_check で既存導線再確認予定。
- 2026-03-14: `C:/Users/User/Documents/Codex/handwritingapp/packages/handwriting-core` を参照。`guide.js` の4線比率 `0.18/0.42/0.68/0.88` に合わせてテンプレートを補正し、`scoring.js` の方針を参考に shape/distribution を少し重く、OCR は形が合う時はヒント寄りに緩和。
