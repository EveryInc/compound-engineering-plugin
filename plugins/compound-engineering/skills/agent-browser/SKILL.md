---
name: agent-browser
description: このスキルは、Webテスト、フォーム入力、スクリーンショット、データ抽出のためのブラウザ操作を自動化する際に使用されるべきです。
---

# agent-browserによるブラウザ自動化

## クイックスタート

```bash
agent-browser open <url>        # ページに移動
agent-browser snapshot -i       # refを持つインタラクティブ要素を取得
agent-browser click @e1         # refで要素をクリック
agent-browser fill @e2 "text"   # refで入力フィールドに入力
agent-browser close             # ブラウザを閉じる
```

## コアワークフロー

1. ナビゲート: `agent-browser open <url>`
2. スナップショット: `agent-browser snapshot -i` (`@e1`、`@e2`のようなrefを持つ要素を返す)
3. スナップショットからのrefを使用して操作
4. ナビゲーションまたは重要なDOM変更後に再スナップショット

## コマンド

### ナビゲーション
```bash
agent-browser open <url>      # URLに移動
agent-browser back            # 戻る
agent-browser forward         # 進む
agent-browser reload          # ページを再読み込み
agent-browser close           # ブラウザを閉じる
```

### スナップショット（ページ分析）
```bash
agent-browser snapshot        # 完全なアクセシビリティツリー
agent-browser snapshot -i     # インタラクティブ要素のみ（推奨）
agent-browser snapshot -c     # コンパクト出力
agent-browser snapshot -d 3   # 深さを3に制限
```

### 操作（スナップショットからの@refを使用）
```bash
agent-browser click @e1           # クリック
agent-browser dblclick @e1        # ダブルクリック
agent-browser fill @e2 "text"     # クリアして入力
agent-browser type @e2 "text"     # クリアせずに入力
agent-browser press Enter         # キーを押す
agent-browser press Control+a     # キーの組み合わせ
agent-browser hover @e1           # ホバー
agent-browser check @e1           # チェックボックスをチェック
agent-browser uncheck @e1         # チェックボックスのチェックを外す
agent-browser select @e1 "value"  # ドロップダウンを選択
agent-browser scroll down 500     # ページをスクロール
agent-browser scrollintoview @e1  # 要素を表示範囲にスクロール
```

### 情報の取得
```bash
agent-browser get text @e1        # 要素のテキストを取得
agent-browser get value @e1       # 入力値を取得
agent-browser get title           # ページタイトルを取得
agent-browser get url             # 現在のURLを取得
```

### スクリーンショット
```bash
agent-browser screenshot          # スクリーンショットを標準出力
agent-browser screenshot path.png # ファイルに保存
agent-browser screenshot --full   # ページ全体
```

### 待機
```bash
agent-browser wait @e1                     # 要素を待機
agent-browser wait 2000                    # ミリ秒待機
agent-browser wait --text "Success"        # テキストを待機
agent-browser wait --load networkidle      # ネットワークアイドルを待機
```

### セマンティックロケーター（refの代替）
```bash
agent-browser find role button click --name "Submit"
agent-browser find text "Sign In" click
agent-browser find label "Email" fill "user@test.com"
```

## 例：フォーム送信

```bash
agent-browser open https://example.com/form
agent-browser snapshot -i
# 出力: textbox "Email" [ref=e1], textbox "Password" [ref=e2], button "Submit" [ref=e3]

agent-browser fill @e1 "user@example.com"
agent-browser fill @e2 "password123"
agent-browser click @e3
agent-browser wait --load networkidle
agent-browser snapshot -i  # 結果を確認
```

## 例：保存された状態での認証

```bash
# 一度ログイン
agent-browser open https://app.example.com/login
agent-browser snapshot -i
agent-browser fill @e1 "username"
agent-browser fill @e2 "password"
agent-browser click @e3
agent-browser wait --url "**/dashboard"
agent-browser state save auth.json

# 後のセッション：保存された状態を読み込み
agent-browser state load auth.json
agent-browser open https://app.example.com/dashboard
```

## セッション（並列ブラウザ）

```bash
agent-browser --session test1 open site-a.com
agent-browser --session test2 open site-b.com
agent-browser session list
```

## JSON出力（パース用）

機械可読出力には`--json`を追加：
```bash
agent-browser snapshot -i --json
agent-browser get text @e1 --json
```

## デバッグ

```bash
agent-browser open example.com --headed  # ブラウザウィンドウを表示
agent-browser console                    # コンソールメッセージを表示
agent-browser errors                     # ページエラーを表示
```
