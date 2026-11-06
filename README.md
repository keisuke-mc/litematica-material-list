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
- **アイコン**: 実際のゲームレンダーによるアイテム画像（[MinecraftAllImages](https://github.com/TinyTank800/MinecraftAllImages) を CDN 経由で読み込み・1,100 種以上）。画像ファイルは同梱していません。オフライン時や画像が無い ID は配色・形状を計算した SVG アイコンで代替表示
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

## 公開・設置について

このフォルダは完全静的サイトなので、**任意の静的ホスティング（レンタルサーバー・Netlify・Vercel・Cloudflare Pages など）に置くだけで動きます**。`index.html` をブラウザで直接開いても動作します（その場合、履歴はクッキーではなく localStorage に保存されます）。

アイコン画像は外部 CDN（jsDelivr / raw.githubusercontent.com）から読み込むため、アイコン表示にはインターネット接続が必要です（オフライン時は内蔵 SVG アイコンで代替表示されます）。設計図の解析自体は完全にブラウザ内で完結します。

## ローカルで試すとき

`index.html` をダブルクリックすれば動作します。本番と同じ挙動（クッキーによる履歴）を確認したい場合はローカルサーバーを立ててください:

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
│   ├── data-icons.js   … SVG フォールバック用カラーデータ
│   ├── data-imgicons.js… アイテム画像マニフェスト（ID → CDN 上の画像ファイル名）
│   ├── data-notes.js   … 入手方法メモ
│   └── data-sample.js  … サンプル設計図（埋め込み）
├── sample.litematic  … サンプルの小屋（実際にアップロードしても試せます）
├── .nojekyll         … GitHub Pages の Jekyll 処理を無効化
└── README.md         … このファイル
```

## 技術メモ

- **ビットパッキング**: `.litematic` の BlockStates は Litematica 方式（`bits = max(2, ceil(log2(パレットサイズ)))`、64bit long をまたぐパッキング・LSB ファースト）で解析します。配列長から別方式（1.16 以降のチャンク方式）も自動判定できるため、一部ツールが生成した変種ファイルにも対応します。
- **集計**: 空気 (`air` / `cave_air` / `void_air`)、`structure_void`、`light`、`barrier` に加え、ピストンが伸びた際に生成される `piston_head` / `sticky_piston_head`（設置できるアイテムではないため）をリストから除外しています。ブロック状態（向きや水没状態など）は同じアイテムとして合算します。壁付けバリアント（`oak_wall_sign`・`wall_torch`・`white_wall_banner` など）も同じアイテムとして通常版（`oak_sign`・`torch`・`white_banner`）に合算します（対象: 壁付けの看板・吊り看板・旗・サンゴファン・松明・頭・頭蓋骨）。「〇〇_wall」（石レンガの塀など）は独立したアイテムなのでそのまま表示します。設置状態のブロックIDがアイテムIDと異なるもの (`redstone_wire` など) はアイテムID (`minecraft:redstone` = レッドストーンダスト) に統合します。パワー 0〜15 などのブロック状態は区別しません。
- **レシピデータ**: クラフトレシピは [PrismarineJS/minecraft-data](https://github.com/PrismarineJS/minecraft-data)（Minecraft 26.1 相当）から生成し、主要レシピ 22 種を自動検証しています。精錬・石切台レシピは手動で収集しています。
- **アイコン**: アイテム画像は [MinecraftAllImages](https://github.com/TinyTank800/MinecraftAllImages)（MIT License）のレンダー（`images-v2/26.2`・128×128 webp）を、**リポジトリの内容を固定したコミットハッシュ付き CDN URL（jsDelivr → raw.githubusercontent の 2 段階）から直接読み込み**ます。画像ファイルは本サイトに同梱していません（配布サイズを削減）。バニラの全ブロック ID とレシピ素材をカバーし、壁付き看板・ポット植え・作物などの対応はエイリアス解決します。CDN に接続できない場合や画像が無い ID（空気・炎・ポータル類・Mod 追加ブロックなど）は、ブロック ID から独自の配色・形状を計算した SVG アイコンに自動フォールバックします。

## 動作環境

- モダンブラウザ（Chrome 80+ / Firefox 113+ / Safari 16.4+ / Edge 80+）
- `DecompressionStream` API（Gzip 解凍に使用）に対応している必要があります
- アイコン画像の表示にはインターネット接続が必要です（オフライン時は SVG アイコンで代替表示）

## ライセンス・クレジット

- 本ツールは非公式のファンメイドツールです。Minecraft は Mojang Synergies AB の商標であり、本ツールは Mojang とは無関係です。
- 日本語アイテム名は Mojang 公式の言語ファイル（`ja_jp.json`）に基づきます。
- レシピデータの一部は PrismarineJS/minecraft-data（MIT License）を利用しています。
- アイテム画像は [MinecraftAllImages](https://github.com/TinyTank800/MinecraftAllImages)（MIT License, © 2025 TinyTank800）を利用しています。画像は Minecraft ゲームコンテンツのレンダリングであり、Minecraft に関する権利は Mojang Synergies AB に帰属します。
