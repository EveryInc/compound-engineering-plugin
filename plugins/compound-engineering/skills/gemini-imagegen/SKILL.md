---
name: gemini-imagegen
description: このスキルは、Gemini API（Nano Banana Pro）を使用して画像を生成および編集する際に使用されるべきです。テキストプロンプトからの画像作成、既存画像の編集、スタイル転送の適用、テキスト入りロゴの生成、ステッカー作成、製品モックアップ、または任意の画像生成/操作タスクに適用されます。テキストから画像、画像編集、マルチターン改善、複数の参照画像からの合成をサポートします。
---

# Gemini画像生成（Nano Banana Pro）

GoogleのGemini APIを使用して画像を生成および編集。環境変数`GEMINI_API_KEY`が設定されている必要があります。

## デフォルトモデル

| モデル | 解像度 | 最適な用途 |
|-------|------------|----------|
| `gemini-3-pro-image-preview` | 1K-4K | すべての画像生成（デフォルト） |

**注意：** 常にこのProモデルを使用。明示的に要求された場合のみ別のモデルを使用。

## クイックリファレンス

### デフォルト設定
- **モデル：** `gemini-3-pro-image-preview`
- **解像度：** 1K（デフォルト、オプション：1K、2K、4K）
- **アスペクト比：** 1:1（デフォルト）

### 利用可能なアスペクト比
`1:1`、`2:3`、`3:2`、`3:4`、`4:3`、`4:5`、`5:4`、`9:16`、`16:9`、`21:9`

### 利用可能な解像度
`1K`（デフォルト）、`2K`、`4K`

## コアAPIパターン

```python
import os
from google import genai
from google.genai import types

client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])

# 基本生成（1K、1:1 - デフォルト）
response = client.models.generate_content(
    model="gemini-3-pro-image-preview",
    contents=["ここにプロンプト"],
    config=types.GenerateContentConfig(
        response_modalities=['TEXT', 'IMAGE'],
    ),
)

for part in response.parts:
    if part.text:
        print(part.text)
    elif part.inline_data:
        image = part.as_image()
        image.save("output.png")
```

## カスタム解像度とアスペクト比

```python
from google.genai import types

response = client.models.generate_content(
    model="gemini-3-pro-image-preview",
    contents=[prompt],
    config=types.GenerateContentConfig(
        response_modalities=['TEXT', 'IMAGE'],
        image_config=types.ImageConfig(
            aspect_ratio="16:9",  # ワイドフォーマット
            image_size="2K"       # より高い解像度
        ),
    )
)
```

### 解像度の例

```python
# 1K（デフォルト）- 高速、プレビューに最適
image_config=types.ImageConfig(image_size="1K")

# 2K - 品質/速度のバランス
image_config=types.ImageConfig(image_size="2K")

# 4K - 最高品質、より遅い
image_config=types.ImageConfig(image_size="4K")
```

### アスペクト比の例

```python
# 正方形（デフォルト）
image_config=types.ImageConfig(aspect_ratio="1:1")

# 横長ワイド
image_config=types.ImageConfig(aspect_ratio="16:9")

# ウルトラワイドパノラマ
image_config=types.ImageConfig(aspect_ratio="21:9")

# 縦長
image_config=types.ImageConfig(aspect_ratio="9:16")

# 写真標準
image_config=types.ImageConfig(aspect_ratio="4:3")
```

## 画像の編集

既存の画像とテキストプロンプトを渡す：

```python
from PIL import Image

img = Image.open("input.png")
response = client.models.generate_content(
    model="gemini-3-pro-image-preview",
    contents=["このシーンに夕日を追加", img],
    config=types.GenerateContentConfig(
        response_modalities=['TEXT', 'IMAGE'],
    ),
)
```

## マルチターン改善

反復編集にはチャットを使用：

```python
from google.genai import types

chat = client.chats.create(
    model="gemini-3-pro-image-preview",
    config=types.GenerateContentConfig(response_modalities=['TEXT', 'IMAGE'])
)

response = chat.send_message("'Acme Corp'のロゴを作成")
# 最初の画像を保存...

response = chat.send_message("テキストをより太くして青いグラデーションを追加")
# 改善された画像を保存...
```

## プロンプティングのベストプラクティス

### フォトリアリスティックなシーン
カメラの詳細を含める：レンズタイプ、照明、角度、ムード。
> 「フォトリアリスティックなクローズアップポートレート、85mmレンズ、柔らかなゴールデンアワーの光、被写界深度が浅い」

### スタイライズされたアート
スタイルを明示的に指定：
> 「幸せなレッサーパンダのかわいいスタイルのステッカー、太い輪郭、セルシェーディング、白い背景」

### 画像内のテキスト
フォントスタイルと配置について明確に：
> 「'Daily Grind'というテキストのロゴを作成、クリーンなサンセリフ、白黒、コーヒー豆のモチーフ」

### 製品モックアップ
照明設定と表面を説明：
> 「研磨されたコンクリート上のスタジオ照明製品写真、3点ソフトボックスセットアップ、45度の角度」

## 高度な機能

### Google検索グラウンディング
リアルタイムデータに基づいて画像を生成：

```python
response = client.models.generate_content(
    model="gemini-3-pro-image-preview",
    contents=["今日の東京の天気をインフォグラフィックとして視覚化"],
    config=types.GenerateContentConfig(
        response_modalities=['TEXT', 'IMAGE'],
        tools=[{"google_search": {}}]
    )
)
```

### 複数の参照画像（最大14枚）
複数のソースから要素を組み合わせる：

```python
response = client.models.generate_content(
    model="gemini-3-pro-image-preview",
    contents=[
        "これらの人々のオフィスでのグループ写真を作成",
        Image.open("person1.png"),
        Image.open("person2.png"),
        Image.open("person3.png"),
    ],
    config=types.GenerateContentConfig(
        response_modalities=['TEXT', 'IMAGE'],
    ),
)
```

## 重要：ファイル形式とメディアタイプ

**重要：** Gemini APIはデフォルトでJPEG形式で画像を返します。保存時は、メディアタイプの不一致を避けるため常に`.jpg`拡張子を使用。

```python
# 正しい - .jpg拡張子を使用（GeminiはJPEGを返す）
image.save("output.jpg")

# 間違い - 「Image does not match media type」エラーが発生
image.save("output.png")  # PNG拡張子でJPEGを作成！
```

### PNGへの変換（必要な場合）

特にPNG形式が必要な場合：

```python
from PIL import Image

# Geminiで生成
for part in response.parts:
    if part.inline_data:
        img = part.as_image()
        # 明示的なフォーマットで保存してPNGに変換
        img.save("output.png", format="PNG")
```

### 画像形式の確認

`file`コマンドで実際の形式と拡張子を確認：

```bash
file image.png
# 出力が「JPEG image data」を示す場合 - .jpgにリネーム！
```

## 注意事項

- すべての生成画像にはSynthID透かしが含まれます
- Geminiは**デフォルトでJPEG形式**を返す - 常に`.jpg`拡張子を使用
- 画像のみモード（`responseModalities: ["IMAGE"]`）はGoogle検索グラウンディングでは動作しません
- 編集時は変更を会話的に説明 - モデルはセマンティックマスキングを理解します
- 速度のためにデフォルトで1K解像度；品質が重要な場合は2K/4Kを使用
