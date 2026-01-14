---
name: browser-test
description: agent-browserを使用して現在のPRまたはブランチで影響を受けるページでブラウザテストを実行する
argument-hint: "[PR番号、ブランチ名、または現在のブランチの場合は'current']"
---

# ブラウザテストコマンド

<command_purpose>agent-browser CLIを使用して、PRまたはブランチの変更で影響を受けるページでエンドツーエンドのブラウザテストを実行する。</command_purpose>

## はじめに

<role>ブラウザベースのエンドツーエンドテストを専門とするQAエンジニア</role>

このコマンドは実際のブラウザで影響を受けるページをテストし、ユニットテストでは見逃す問題をキャッチします：
- JavaScript統合バグ
- CSS/レイアウトのリグレッション
- ユーザーワークフローの破損
- コンソールエラー

## 前提条件

<requirements>
- ローカル開発サーバーが実行中（例：`bin/dev`、`rails server`）
- agent-browser CLIがインストール済み（`npx -y agent-browser@latest --help`）
- テストする変更があるGitリポジトリ
</requirements>

## 主要タスク

### 1. テスト範囲の決定

<test_target> $ARGUMENTS </test_target>

<determine_scope>

**PR番号が提供された場合：**
```bash
gh pr view [number] --json files -q '.files[].path'
```

**'current'または空の場合：**
```bash
git diff --name-only main...HEAD
```

**ブランチ名が提供された場合：**
```bash
git diff --name-only main...[branch]
```

</determine_scope>

### 2. ファイルをルートにマッピング

<file_to_route_mapping>

変更されたファイルをテスト可能なルートにマッピング：

| ファイルパターン | ルート |
|-------------|----------|
| `app/views/users/*` | `/users`, `/users/:id`, `/users/new` |
| `app/controllers/settings_controller.rb` | `/settings` |
| `app/javascript/controllers/*_controller.js` | そのStimulusコントローラーを使用するページ |
| `app/components/*_component.rb` | そのコンポーネントをレンダリングするページ |
| `app/views/layouts/*` | すべてのページ（最低限ホームページをテスト） |
| `app/assets/stylesheets/*` | 主要ページでのビジュアルリグレッション |
| `app/helpers/*_helper.rb` | そのヘルパーを使用するページ |

マッピングに基づいてテストするURLのリストを作成。

</file_to_route_mapping>

### 3. サーバーが実行中か確認

<check_server>

テスト前に、Bashを使用してローカルサーバーがアクセス可能か確認：

```bash
npx -y agent-browser@latest open http://localhost:3000
npx -y agent-browser@latest snapshot -i
npx -y agent-browser@latest close
```

サーバーが実行されていない場合、ユーザーに通知：
```markdown
**サーバーが実行されていません**

開発サーバーを起動してください：
- Rails: `bin/dev` または `rails server`
- Node: `npm run dev`

その後、`/browser-test`を再度実行してください。
```

</check_server>

### 4. 影響を受ける各ページをテスト

<test_pages>

影響を受ける各ルートについて：

**ステップ1: ナビゲートしてスナップショットをキャプチャ**
```bash
npx -y agent-browser@latest open http://localhost:3000/[route]
npx -y agent-browser@latest snapshot -i
```

**ステップ2: エラーをチェック**
```bash
npx -y agent-browser@latest console
```

**ステップ3: 主要要素を検証**
- ページタイトル/見出しが存在
- 主要コンテンツがレンダリング
- エラーメッセージが表示されていない
- フォームに期待されるフィールドがある

**ステップ4: 重要なインタラクションをテスト（該当する場合）**
```bash
# ref（スナップショット出力から）で要素をクリック
npx -y agent-browser@latest click @e1
npx -y agent-browser@latest snapshot -i
```

**ステップ5: テスト後にブラウザを閉じる**
```bash
npx -y agent-browser@latest close
```

</test_pages>

### 5. 人間による検証（必要な場合）

<human_verification>

テストが以下に触れる場合は人間の入力のために一時停止：

| フロータイプ | 質問内容 |
|-----------|-------------|
| OAuth | 「[プロバイダー]でサインインして、動作することを確認してください」 |
| メール | 「受信トレイでテストメールを確認し、受信を確認してください」 |
| 決済 | 「サンドボックスモードでテスト購入を完了してください」 |
| SMS | 「SMSコードを受信したことを確認してください」 |
| 外部API | 「[サービス]統合が動作していることを確認してください」 |

AskUserQuestionを使用：
```markdown
**人間による検証が必要**

このテストは[フロータイプ]に触れます。以下を行ってください：
1. [実行するアクション]
2. [検証する内容]

正常に動作しましたか？
1. はい - テストを続行
2. いいえ - 問題を説明
```

</human_verification>

### 6. 失敗の処理

<failure_handling>

テストが失敗した場合：

1. **失敗を文書化：**
   - エラー状態のスクリーンショット
   - コンソールエラーをキャプチャ
   - 正確な再現手順をメモ

2. **ユーザーに進め方を質問：**
   ```markdown
   **テスト失敗: [route]**

   問題: [説明]
   コンソールエラー: [ある場合]

   どう進めますか？
   1. 今すぐ修正 - デバッグと修正を手伝います
   2. Todoを作成 - 後でtodos/に追加
   3. スキップ - 他のページのテストを続行
   ```

3. **「今すぐ修正」の場合：**
   - 問題を調査
   - 修正を提案
   - 修正を適用
   - 失敗したテストを再実行

4. **「Todoを作成」の場合：**
   - `{id}-pending-p1-playwright-{description}.md`を作成
   - テストを続行

5. **「スキップ」の場合：**
   - スキップとして記録
   - テストを続行

</failure_handling>

### 7. テストサマリー

<test_summary>

すべてのテスト完了後、サマリーを提示：

```markdown
## 🌐 ブラウザテスト結果

**テスト範囲:** PR #[number] / [branch name]
**サーバー:** http://localhost:3000
**ツール:** agent-browser

### テストしたページ: [count]

| ルート | ステータス | 備考 |
|-------|--------|-------|
| `/users` | ✅ パス | |
| `/settings` | ✅ パス | |
| `/dashboard` | ❌ 失敗 | コンソールエラー: [msg] |
| `/checkout` | ⏭️ スキップ | 決済認証情報が必要 |

### コンソールエラー: [count]
- [見つかったエラーのリスト]

### 人間による検証: [count]
- OAuthフロー: ✅ 確認済み
- メール配信: ✅ 確認済み

### 失敗: [count]
- `/dashboard` - [問題の説明]

### 作成されたTodo: [count]
- `005-pending-p1-playwright-dashboard-error.md`

### 結果: [パス / 失敗 / 部分的]
```

</test_summary>

## クイック使用例

```bash
# 現在のブランチの変更をテスト
/browser-test

# 特定のPRをテスト
/browser-test 847

# 特定のブランチをテスト
/browser-test feature/new-dashboard
```
