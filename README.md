# ひらがな→ローマ字 手書き練習アプリ

特別支援で書字に困難を持つ子も含め、成功体験を作れる調整幅を持った手書き練習アプリです。静的サイトとして完結し、GitHub Pages にそのまま公開できます。

## 機能

- **Practice（練習）**: ひらがな1文字を選び、ローマ字を手書きで練習。文字別履歴プレビュー（最新10件）、オーバーレイ表示
- **Test（テスト）**: ランダム出題 or 選択出題（文字セット指定）、5/10/20問、難易度・合格ライン設定、結果表示・間違えた文字の復習ボタン
- **History（履歴）**: 判定結果の保存・一覧・フィルタ・リプレイ再生（0.5x/1x/2x、手本重ね）・1件/全削除

### 難易度

- **Trace**: 手本が濃く表示
- **Ghost**: 手本が薄く表示
- **Fade**: 開始後 1 秒で手本が消える
- **Blind**: 手本非表示

### 支援スライダー（合理的配慮）

- 許容ゾーン太さ（10〜40px）
- 線の補正強さ（0〜1）
- 合格ライン（50〜90%）

## ローカルでの起動方法

1. リポジトリをクローン
2. 任意のローカルサーバーで起動

```bash
# Python 3 の場合
python -m http.server 8000

# Node.js (npx) の場合
npx serve .
# または
npx serve -l 3333

# VS Code Live Server でも可
```

3. ブラウザで `http://localhost:8000`（または指定ポート）を開く

> **注意**: `file://` プロトコルでは IndexedDB が正しく動作しない場合があります。必ず HTTP サーバー経由で開いてください。

## GitHub Pages での公開方法

1. リポジトリを GitHub にプッシュ
2. リポジトリの **Settings** → **Pages**
3. **Source** で `Deploy from a branch` を選択
4. **Branch** で `main`（または使用ブランチ）、`/ (root)` を選択
5. 保存後、数分で `https://<username>.github.io/<repo>/` に公開される

---

## 主要パラメータ

### 4線の位置（template.js）

キャンバス高さ `h` に対する比率：

| 定数 | 比率 | 説明 |
|------|------|------|
| `TOP_LINE` | 0.25 | topLine = h × 0.25 |
| `MID_LINE` | 0.40 | midLine = h × 0.40 |
| `BASE_LINE` | 0.62 | baseLine = h × 0.62 |
| `BOTTOM_LINE` | 0.78 | bottomLine = h × 0.78 |
| `FOUR_LINE_ALPHA` | 0.18 | 4線の半透明度 |

手本文字は topLine〜bottomLine 間に収まるようサイズ・ベースラインを調整する。

### a と g の描画パラメータ（template.js）

**a（single-storey）**（`drawLetterA`）:
- 楕円: `w = letterHeight * 0.6`, `h = letterHeight * 0.45`
- 楕円中心: `cx = originX + w*0.5`, `cy = baseLine - h*0.6`
- 楕円半径: `w*0.45`, `h`
- 右縦線（stem）: `originX + w*0.9` から `cy - h*0.3` 〜 `baseLine + letterHeight*0.1`
- フォントに依存せず Canvas 図形で描画（楕円 + stroke）

**g（single-storey）**（`drawLetterG`）:
- 上楕円: `w = letterHeight * 0.55`, `h = letterHeight * 0.4`
- 楕円中心: `cx = originX + w*0.5`, `cy = baseLine - h*0.65`
- 下ループ: 縦線から `quadraticCurveTo` で左にループ、戻る
- `descender = letterHeight * 0.5`
- フォントに依存せず Canvas 図形で描画

### 採点パラメータ（grading.js）

| パラメータ | 値 | 説明 |
|-----------|-----|------|
| `MIN_STROKE_LENGTH_RATIO` | 0.25 | 最低線長 = canvas短辺 × この値。未満は score=0, 赤 |
| `COVERAGE_GRID_SIZE` | 12 | カバレッジ用グリッド 12×12 |
| `COVERAGE_WEIGHT` | 0.5 | 最終スコア = baseScore × (0.5 + 0.5×coverage) |
| `OUTSIDE_PENALTY` | 40 | 減点 = outsideRate × 40 |
| `PENALTY` | 2.0 | ゾーン外ペナルティ（マスク内スコア計算用） |
| `W1` | 0.45 | scoreMask の重み |
| `W2` | 0.35 | scoreShape の重み |
| `MIN_POINTS` | 5 | サンプル点がこれ未満だと score=0 |
| `EDGE_MARGIN` | 8 | 端タッチ判定のマージン |

**判定**: passLine 以上で緑、passLine-10 以上で黄、それ未満で赤。

### Canvas リサイズと座標系

- 以前は canvas の内部解像度と CSS サイズの比率で座標を補正しており、リサイズ後にわずかな差が出た環境で「テンプレの位置と実際に書ける位置」が横方向にずれることがありました。
- 現在は `ResizeObserver` で親要素の CSS 幅・高さを監視し、`canvas.width = cssWidth * devicePixelRatio` / `canvas.height = cssHeight * devicePixelRatio` としたうえで、毎回 `ctx.setTransform(dpr, 0, 0, dpr, 0, 0)` を設定し、ポインタ位置は常に `getBoundingClientRect()` から得た CSS ピクセル座標 `x = clientX - rect.left`, `y = clientY - rect.top` をそのまま使っています。
- リサイズ（画面回転を含む）中に描画していたストロークは安全のためキャンセルし、4線・手本・ユーザー線・オーバーレイをすべて再描画します。

### Fade / Blind の正規化採点

- **Trace / Ghost**: これまでどおり「位置ズレも含めて評価」します。
- **Fade / Blind**: 書きやすさを優先し、「形が合っていれば少しの位置ズレでは落ちにくい」ように以下の正規化を行います。
  1. ユーザーの全ストローク点列からバウンディングボックス（bbox）を取り、中心と幅・高さを算出。
  2. テンプレ側もマスク画像から bbox を取り、中心と幅・高さを算出。
  3. ユーザー点列を「中心合わせ + 等方スケール」でテンプレ bbox にフィットさせた座標に正規化してから、マスク一致・shape 距離・coverage を計算。
- 正規化の前に、ユーザー bbox の中心がテンプレ中心から **横 0.35・縦 0.25（キャンバス比）以上** 離れている場合は「位置が大きくずれています」とみなし score=0 の赤判定にします（極端に違う場所に書いたケースの抑止）。
- また Fade / Blind では、中心のズレが小さければ減点なし、大きいほど **横方向より縦方向をやや厳しめ** に追加減点することで、4線に対する上下位置（ベースライン付近）の学習要素を残しています。

---

## 手本の追加ガイド

手本は `template.js` の `drawTemplateLetter` / `drawTemplateRomaji` に集約。a と g はフォントに依存しない固定ベクタ描画、それ以外は同梱の `TeachersWeb` フォントで描画します。

### ひらがな→ローマ字の追加

`src/data.js` の `KANA_DATA` にオブジェクトを追加します。

```javascript
{
  kana: 'は',
  romaji: 'ha',
  category: 'basic'  // basic / dakuten / yoon / other
}
```

- 促音・長音など手本を出したくない場合は `romaji` を `'(pause)'` のように括弧で始めると、手本は非表示になります。

## ファイル構成

```
/
├── index.html
├── styles.css
├── README.md
└── src/
    ├── app.js      # 画面制御・ルーティング
    ├── practice.js # Practice 画面 UI
    ├── test.js     # Test 画面 UI
    ├── history.js  # History 画面 UI
    ├── data.js     # ひらがな・ローマ字対応データ
    ├── db.js       # IndexedDB ラッパー
    ├── draw.js     # 入力・描画・リプレイ
    ├── template.js # 手本描画（Teachers フォントベース）
    ├── grading.js  # 採点アルゴリズム
    └── utils.js    # ユーティリティ
```

## 技術仕様

- **フレームワーク**: なし（Vanilla JS）
- **表示フォント**: `/fonts/Teachers-*.ttf` を同梱し、`TeachersWeb` として UI・テンプレ表示を統一
- **ストレージ**: IndexedDB
- **入力**: Pointer Events（指・ペン・マウス対応）
- **高DPI**: `devicePixelRatio` を考慮した Canvas 描画
- **パームリジェクション**: ペン検出時はタッチ入力を無視
- **レスポンシブ**: 画面の縦横比で `data-orientation`（`landscape` / `portrait`）を切り替え、landscape では 2カラム、portrait では 1カラム。ResizeObserver で Canvas を再計算。

### フォントとライセンス

- 本アプリは [Teachers フォント](https://github.com/googlefonts/teachers/) を同梱し、`styles.css` の `@font-face` で `TeachersWeb` として読み込んでいます。
- Teachers フォントは **SIL Open Font License (OFL)** で配布されており、本リポジトリには `fonts/OFL.txt` を同梱してください。アプリ本体コードは MIT ライセンスですが、フォント自体は OFL の条件に従います。

## ライセンス

アプリケーションコード: MIT  
Teachers フォント: SIL Open Font License (OFL)（`/fonts/OFL.txt` を参照）
