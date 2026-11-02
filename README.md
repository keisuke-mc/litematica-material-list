# 建材リストビューア（Litematica Material List Viewer）

Litematica の設計図（`.litematic`）をアップロードすると、日本語名・アイコン付きの建材リストを表示する静的Webサイトです。
バニラの構造ブロック形式（`.nbt`）や WorldEdit / Sponge 形式（`.schem`）にも対応しています。

**ビルド不要・依存ライブラリなし。** このフォルダ内のファイルをそのまま静的ホスティングすれば動きます。

---

## 機能

- **設計図のアップロード**: ドラッグ＆ドロップまたはファイル選択。複数リージョン対応
  - 対応形式: `.litematic`（Litematica）／ `.nbt`（バニラ構造ブロック 1.13 以降）／ `.schem`（WorldEdit 7 以降 / Sponge v2 以降）
- **合計ブロック数表示**: 合計ブロック数・アイテム種類数・スタック合計・シュルカーボックス合計
- **日本語アイテム名**: Mojang 公式の日本語言語ファイルを基にした翻訳（Mod 追加ブロックは ID 表示にフォールバック）
- **アイコン**: 各ブロックの特徴的な色を使った SVG アイコン（階段・ハーフブロック・ガラス板・松明などの形状も描き分け）
- **スタック数・シュルカーボックス数**: 各アイテムについて 1 スタック = 64 個、1 シュルカー = 27 スタック（1,728 個）換算で表示
- **並べ替え（見出しクリック）**:
  - アイテム名 → 五十音順 ⇄ 逆順（漢字始まりの名前は読み仮名マップでソート）
  - 個数・スタック数・シュルカーボックス数 → 多い順 ⇄ 少ない順
- **レシピツールチップ**: 行にカーソルを合わせると
  - 作業台（3×3 グリッド）／かまど／石切台のレシピ
  - 「そのアイテムを必要個数ぶん全部作る」ための素材数
  - 素材をさらに展開した原材料の目安（例: 石レンガ → 丸石 → 精錬回数と必要石炭の目安）
  - クラフトできないブロックは入手方法のヒントを表示
- **アップロード履歴**: クッキーに保存（同一ブラウザで最大 12 件）。履歴の再表示・個別削除・全消去が可能
- **プライバシー**: すべての解析はブラウザ内で完結。ファイルはどこにも送信されません

## GitHub Pages での公開手順

### 1. リポジトリを作成

1. [github.com](https://github.com) にログインし、右上の **+** → **New repository** を選択
2. Repository name を入力（例: `litematic-material-list`）
3. **Public** を選択（Private でも GitHub Pages は使えますが、無料プランでは Public のみ）
4. **Create repository** をクリック

### 2. ファイルをアップロード

1. 作成したリポジトリのページで **Add file** → **Upload files** をクリック
2. この ZIP を展開した中身（`index.html`、`css/`、`js/`、`sample.litematic`、`README.md`、`.nojekyll`）をすべてドラッグ
   - ※ フォルダごとではなく、中身をリポジトリ直下に置いてください（`index.html` がリポジトリのルートにくる状態）
   - ※ `.nojekyll` は隠しファイルです。Finder / エクスプローラーで表示して一緒にアップロードしてください（なくても動作しますが、GitHub Pages の Jekyll 処理を無効化するため推奨）
3. **Commit changes** をクリック

### 3. GitHub Pages を有効化

1. リポジトリの **Settings** → 左メニュー **Pages** を開く
2. **Build and deployment** の **Source** で **Deploy from a branch** を選択
3. **Branch** で `main` / `(Root)` を選び、**Save** をクリック
4. 1〜2 分待つと `https://<ユーザー名>.github.io/<リポジトリ名>/` で公開されます（Pages の画面に URL が表示されます）

### 4. 更新したいとき

リポジトリの **Add file** → **Upload files** から上書きアップロードして commit するだけです。

## ローカルで試すとき

`index.html` をダブルクリックしても動作しますが、環境によっては履歴機能（クッキー）が制限されることがあります。
次のようにローカルサーバーを立てると本番と同じ挙動になります:

```bash
# Python の場合（このフォルダ内で）
python3 -m http.server 8000
# → http://localhost:8000 をブラウザで開く
```

## ファイル構成

```
├── index.html        … メインページ
├── css/style.css     … スタイル（Minecraft風ダークテーマ）
├── js/
│   ├── nbt.js          … NBT(Gzip) パーサ
│   ├── litematic.js    … .litematic / .nbt / .schem パーサ
│   ├── app.js          … UI（ソート・ツールチップ・履歴）
│   ├── data-ja.js      … 日本語名データ（公式言語ファイルから生成）
│   ├── data-recipes.js … レシピデータ（crafting: minecraft-data / 精錬・石切台: 手動収集）
│   ├── data-icons.js   … アイコン用カラーデータ
│   ├── data-notes.js   … 入手方法メモ
│   └── data-sample.js  … サンプル設計図（埋め込み）
├── sample.litematic  … サンプルの小屋（実際にアップロードしても試せます）
├── .nojekyll         … GitHub Pages の Jekyll 処理を無効化
└── README.md         … このファイル
```

## 技術メモ

- **ビットパッキング**: `.litematic` の BlockStates は Litematica 方式（`bits = max(2, ceil(log2(パレットサイズ)))`、64bit long をまたぐパッキング・LSB ファースト）で解析します。配列長から別方式（1.16 以降のチャンク方式）も自動判定できるため、一部ツールが生成した変種ファイルにも対応します。
- **集計**: 空気 (`air` / `cave_air` / `void_air`)、`structure_void`、`light`、`barrier` はリストから除外しています。ブロック状態（向きや水没状態など）は同じアイテムとして合算します。
- **レシピデータ**: クラフトレシピは [PrismarineJS/minecraft-data](https://github.com/PrismarineJS/minecraft-data)（Minecraft 26.1 相当）から生成し、主要レシピ 22 種を自動検証しています。精錬・石切台レシピは手動で収集しています。
- **アイコン**: Minecraft のテクスチャ画像は使用していらず、ブロック ID から独自の配色・形状を計算して SVG 描画しています。

## 動作環境

- モダンブラウザ（Chrome 80+ / Firefox 113+ / Safari 16.4+ / Edge 80+）
- `DecompressionStream` API（Gzip 解凍に使用）に対応している必要があります

## ライセンス・クレジット

- 本ツールは非公式のファンメイドツールです。Minecraft は Mojang Synergies AB の商標であり、本ツールは Mojang とは無関係です。
- 日本語アイテム名は Mojang 公式の言語ファイル（`ja_jp.json`）に基づきます。
- レシピデータの一部は PrismarineJS/minecraft-data（MIT License）を利用しています。
