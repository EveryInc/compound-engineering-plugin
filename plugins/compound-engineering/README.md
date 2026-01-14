# コンパウンドエンジニアリング プラグイン

使用するたびに賢くなるAI駆動開発ツール。エンジニアリング作業の各単位を前回より簡単に。

## コンポーネント

| コンポーネント | 数 |
|-----------|-------|
| エージェント | 25 |
| コマンド | 15 |
| スキル | 13 |
| MCPサーバー | 1 |

## エージェント

エージェントは発見しやすいようにカテゴリに整理されています。

### レビュー (14)

| エージェント | 説明 |
|-------|-------------|
| `agent-native-reviewer` | 機能がエージェントネイティブか確認（アクション + コンテキストの同等性） |
| `architecture-strategist` | アーキテクチャ上の決定とコンプライアンスを分析 |
| `code-simplicity-reviewer` | シンプルさとミニマリズムの最終チェック |
| `data-integrity-guardian` | データベースマイグレーションとデータ整合性 |
| `data-migration-expert` | IDマッピングが本番と一致するか検証、値の入れ替わりをチェック |
| `deployment-verification-agent` | リスクのあるデータ変更のGo/No-Goデプロイチェックリストを作成 |
| `dhh-rails-reviewer` | DHHの視点からのRailsレビュー |
| `kieran-rails-reviewer` | 厳格な規約でRailsコードをレビュー |
| `kieran-python-reviewer` | 厳格な規約でPythonコードをレビュー |
| `kieran-typescript-reviewer` | 厳格な規約でTypeScriptコードをレビュー |
| `pattern-recognition-specialist` | コードのパターンとアンチパターンを分析 |
| `performance-oracle` | パフォーマンス分析と最適化 |
| `security-sentinel` | セキュリティ監査と脆弱性評価 |
| `julik-frontend-races-reviewer` | JavaScript/Stimulusコードのレースコンディションをレビュー |

### リサーチ (4)

| エージェント | 説明 |
|-------|-------------|
| `best-practices-researcher` | 外部のベストプラクティスと例を収集 |
| `framework-docs-researcher` | フレームワークのドキュメントとベストプラクティスをリサーチ |
| `git-history-analyzer` | Git履歴とコードの進化を分析 |
| `repo-research-analyst` | リポジトリ構造と規約をリサーチ |

### デザイン (3)

| エージェント | 説明 |
|-------|-------------|
| `design-implementation-reviewer` | UI実装がFigmaデザインと一致するか確認 |
| `design-iterator` | 体系的なデザインイテレーションでUIを反復的に改良 |
| `figma-design-sync` | Web実装をFigmaデザインと同期 |

### ワークフロー (4)

| エージェント | 説明 |
|-------|-------------|
| `bug-reproduction-validator` | バグレポートを体系的に再現し検証 |
| `lint` | RubyとERBファイルのリンティングとコード品質チェックを実行 |
| `pr-comment-resolver` | PRコメントに対応し修正を実装 |
| `spec-flow-analyzer` | ユーザーフローを分析し仕様のギャップを特定 |

## コマンド

### ワークフローコマンド

コアワークフローコマンドは組み込みコマンドとの衝突を避けるため`workflows:`プレフィックスを使用：

| コマンド | 説明 |
|---------|-------------|
| `/workflows:plan` | 実装計画を作成 |
| `/workflows:review` | 包括的なコードレビューを実行 |
| `/workflows:work` | 作業項目を体系的に実行 |
| `/workflows:compound` | 解決した問題を文書化してチームの知識を蓄積 |

### ユーティリティコマンド

| コマンド | 説明 |
|---------|-------------|
| `/deepen-plan` | 各セクションに並行リサーチエージェントで計画を強化 |
| `/changelog` | 最近のマージの変更履歴を作成 |
| `/generate_command` | 新しいスラッシュコマンドを生成 |
| `/heal-skill` | スキルドキュメントの問題を修正 |
| `/plan_review` | マルチエージェントで並行して計画をレビュー |
| `/reproduce-bug` | ログとコンソールを使用してバグを再現 |
| `/resolve_parallel` | TODOコメントを並行で解決 |
| `/resolve_pr_parallel` | PRコメントを並行で解決 |
| `/resolve_todo_parallel` | todoを並行で解決 |
| `/triage` | 問題をトリアージして優先順位付け |
| `/browser-test` | PRに影響を受けたページでブラウザテストを実行 |

## スキル

### アーキテクチャ＆デザイン

| スキル | 説明 |
|-------|-------------|
| `agent-native-architecture` | プロンプトネイティブアーキテクチャを使用してAIエージェントを構築 |

### 開発ツール

| スキル | 説明 |
|-------|-------------|
| `andrew-kane-gem-writer` | Andrew Kaneのパターンに従ってRuby gemを作成 |
| `compound-docs` | 解決した問題をカテゴリ化されたドキュメントとして記録 |
| `create-agent-skills` | Claude Codeスキル作成のエキスパートガイダンス |
| `dhh-ruby-style` | DHHの37signalsスタイルでRuby/Railsコードを作成 |
| `frontend-design` | プロダクショングレードのフロントエンドインターフェースを作成 |
| `kieran-code-quality` | すべてのKieranレビュアー用の言語に依存しないコード品質原則 |
| `skill-creator` | 効果的なClaude Codeスキル作成のガイド |

### コンテンツ＆ワークフロー

| スキル | 説明 |
|-------|-------------|
| `every-style-editor` | Everyのスタイルガイド準拠のためにコピーをレビュー |
| `file-todos` | ファイルベースのtodo追跡システム |
| `git-worktree` | 並行開発のためのGitワークツリーを管理 |

### 画像生成

| スキル | 説明 |
|-------|-------------|
| `gemini-imagegen` | GoogleのGemini APIを使用して画像を生成・編集 |

### ブラウザ自動化

| スキル | 説明 |
|-------|-------------|
| `agent-browser` | Webテスト、フォーム入力、スクリーンショット、データ抽出のためのブラウザ操作を自動化 |

**gemini-imagegenの機能：**
- テキストから画像を生成
- 画像の編集と加工
- マルチターン改良
- 複数の参照画像の合成（最大14画像）

**要件：**
- `GEMINI_API_KEY`環境変数
- Pythonパッケージ：`google-genai`、`pillow`

## MCPサーバー

| サーバー | 説明 |
|--------|-------------|
| `context7` | Context7経由でフレームワークドキュメントを検索 |

### Context7

**提供されるツール：**
- `resolve-library-id` - フレームワーク/パッケージのライブラリIDを検索
- `get-library-docs` - 特定のライブラリのドキュメントを取得

Rails、React、Next.js、Vue、Django、Laravelなど100以上のフレームワークをサポート。

MCPサーバーはプラグインが有効化されると自動的に起動します。

## インストール

```bash
claude /plugin install compound-engineering
```

## 既知の問題

### MCPサーバーが自動ロードされない

**問題：** バンドルされたMCPサーバー（Context7）がプラグインインストール時に自動的にロードされない場合があります。

**回避策：** プロジェクトの`.claude/settings.json`に手動で追加：

```json
{
  "mcpServers": {
    "context7": {
      "type": "http",
      "url": "https://mcp.context7.com/mcp"
    }
  }
}
```

または、すべてのプロジェクトに対してグローバルに`~/.claude/settings.json`に追加。

## バージョン履歴

詳細なバージョン履歴は[CHANGELOG.md](CHANGELOG.md)を参照。

## ライセンス

MIT
