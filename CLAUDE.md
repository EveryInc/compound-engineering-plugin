# Every Marketplace - Claude Code プラグインマーケットプレイス

このリポジトリは、AIツールを使って開発する開発者に`compound-engineering`プラグインを配布するClaude Codeプラグインマーケットプレイスです。

## リポジトリ構造

```
every-marketplace/
├── .claude-plugin/
│   └── marketplace.json          # マーケットプレイスカタログ（利用可能なプラグイン一覧）
├── docs/                         # ドキュメントサイト（GitHub Pages）
│   ├── index.html                # ランディングページ
│   ├── css/                      # スタイルシート
│   ├── js/                       # JavaScript
│   └── pages/                    # リファレンスページ
└── plugins/
    └── compound-engineering/   # 実際のプラグイン
        ├── .claude-plugin/
        │   └── plugin.json        # プラグインメタデータ
        ├── agents/                # 24の専門AIエージェント
        ├── commands/              # 13のスラッシュコマンド
        ├── skills/                # 11のスキル
        ├── mcp-servers/           # 2つのMCPサーバー（playwright、context7）
        ├── README.md              # プラグインドキュメント
        └── CHANGELOG.md           # バージョン履歴
```

## 哲学：コンパウンドエンジニアリング

**エンジニアリング作業の各単位が、その後の単位をより簡単にするべき—より難しくではなく。**

このリポジトリで作業する際は、コンパウンドエンジニアリングプロセスに従ってください：

1. **計画** → 必要な変更とその影響を理解する
2. **委譲** → AIツールを活用して実装を支援
3. **評価** → 変更が期待通りに動作することを確認
4. **体系化** → 学びをこのCLAUDE.mdに更新

## このリポジトリでの作業

### 新しいプラグインの追加

1. プラグインディレクトリを作成：`plugins/new-plugin-name/`
2. プラグイン構造を追加：
   ```
   plugins/new-plugin-name/
   ├── .claude-plugin/plugin.json
   ├── agents/
   ├── commands/
   └── README.md
   ```
3. `.claude-plugin/marketplace.json`を更新して新しいプラグインを含める
4. コミット前にローカルでテスト

### コンパウンドエンジニアリングプラグインの更新

エージェント、コマンド、スキルを追加/削除する際は、このチェックリストに従ってください：

#### 1. すべてのコンポーネントを正確にカウント

```bash
# エージェントをカウント
ls plugins/compound-engineering/agents/*.md | wc -l

# コマンドをカウント
ls plugins/compound-engineering/commands/*.md | wc -l

# スキルをカウント
ls -d plugins/compound-engineering/skills/*/ 2>/dev/null | wc -l
```

#### 2. 正しいカウントですべての説明文を更新

説明は複数の場所に表示され、すべて一致する必要があります：

- [ ] `plugins/compound-engineering/.claude-plugin/plugin.json` → `description`フィールド
- [ ] `.claude-plugin/marketplace.json` → プラグインの`description`フィールド
- [ ] `plugins/compound-engineering/README.md` → イントロ段落

形式：`"X個の専門エージェント、Yつのコマンド、Z個のスキルを含む。"`

#### 3. バージョン番号を更新

新しい機能を追加する際は、以下でバージョンを上げてください：

- [ ] `plugins/compound-engineering/.claude-plugin/plugin.json` → `version`
- [ ] `.claude-plugin/marketplace.json` → プラグインの`version`

#### 4. ドキュメントを更新

- [ ] `plugins/compound-engineering/README.md` → すべてのコンポーネントをリスト
- [ ] `plugins/compound-engineering/CHANGELOG.md` → 変更を記録
- [ ] `CLAUDE.md` → 必要に応じて構造図を更新

#### 5. ドキュメントサイトを再ビルド

release-docsコマンドを実行してすべてのドキュメントページを更新：

```bash
claude /release-docs
```

これにより：
- ランディングページの統計を更新
- リファレンスページを再生成（エージェント、コマンド、スキル、MCPサーバー）
- 変更履歴ページを更新
- すべてのカウントが実際のファイルと一致することを検証

#### 6. JSONファイルを検証

```bash
cat .claude-plugin/marketplace.json | jq .
cat plugins/compound-engineering/.claude-plugin/plugin.json | jq .
```

#### 6. コミット前に確認

```bash
# 説明のカウントが実際のファイルと一致することを確認
grep -o "Includes [0-9]* specialized agents" plugins/compound-engineering/.claude-plugin/plugin.json
ls plugins/compound-engineering/agents/*.md | wc -l
```

### Marketplace.jsonの構造

marketplace.jsonは公式Claude Codeの仕様に従います：

```json
{
  "name": "marketplace-identifier",
  "owner": {
    "name": "オーナー名",
    "url": "https://github.com/owner"
  },
  "metadata": {
    "description": "マーケットプレイスの説明",
    "version": "1.0.0"
  },
  "plugins": [
    {
      "name": "plugin-name",
      "description": "プラグインの説明",
      "version": "1.0.0",
      "author": { ... },
      "homepage": "https://...",
      "tags": ["tag1", "tag2"],
      "source": "./plugins/plugin-name"
    }
  ]
}
```

**公式仕様にあるフィールドのみを含めてください。** 以下のようなカスタムフィールドは追加しないでください：

- `downloads`、`stars`、`rating`（表示専用）
- `categories`、`featured_plugins`、`trending`（仕様にない）
- `type`、`verified`、`featured`（仕様にない）

### Plugin.jsonの構造

各プラグインには詳細なメタデータを含む独自のplugin.jsonがあります：

```json
{
  "name": "plugin-name",
  "version": "1.0.0",
  "description": "プラグインの説明",
  "author": { ... },
  "keywords": ["keyword1", "keyword2"],
  "components": {
    "agents": 15,
    "commands": 6,
    "hooks": 2
  },
  "agents": {
    "category": [
      {
        "name": "agent-name",
        "description": "エージェントの説明",
        "use_cases": ["use-case-1", "use-case-2"]
      }
    ]
  },
  "commands": {
    "category": ["command1", "command2"]
  }
}
```

## ドキュメントサイト

ドキュメントサイトはリポジトリルートの`/docs`にあります（GitHub Pages用）。このサイトはプレーンなHTML/CSS/JS（Evil MartiansのLaunchKitテンプレートベース）で構築されており、表示にビルドステップは不要です。

### ドキュメント構造

```
docs/
├── index.html           # 統計と哲学を含むランディングページ
├── css/
│   ├── style.css        # メインスタイル（LaunchKitベース）
│   └── docs.css         # ドキュメント固有のスタイル
├── js/
│   └── main.js          # インタラクティビティ（テーマ切り替え、モバイルナビ）
└── pages/
    ├── getting-started.html  # インストールとクイックスタート
    ├── agents.html           # 全24エージェントリファレンス
    ├── commands.html         # 全13コマンドリファレンス
    ├── skills.html           # 全11スキルリファレンス
    ├── mcp-servers.html      # MCPサーバーリファレンス
    └── changelog.html        # バージョン履歴
```

### ドキュメントを最新に保つ

**重要：** エージェント、コマンド、スキル、MCPサーバーに変更があった後は必ず実行：

```bash
claude /release-docs
```

このコマンドは：
1. 現在のすべてのコンポーネントをカウント
2. すべてのエージェント/コマンド/スキル/MCPファイルを読み込み
3. すべてのリファレンスページを再生成
4. ランディングページの統計を更新
5. CHANGELOG.mdから変更履歴を更新
6. すべてのファイルでカウントが一致することを検証

### 手動更新

手動でドキュメントを更新する必要がある場合：

1. **ランディングページの統計** - `docs/index.html`の数字を更新：
   ```html
   <span class="stat-number">24</span>  <!-- エージェント -->
   <span class="stat-number">13</span>  <!-- コマンド -->
   ```

2. **リファレンスページ** - `docs/pages/`の各ページはそのカテゴリのすべてのコンポーネントを文書化

3. **変更履歴** - `docs/pages/changelog.html`は`CHANGELOG.md`をHTML形式でミラー

### ローカルでドキュメントを表示

ドキュメントは静的HTMLなので、直接表示できます：

```bash
# ブラウザで開く
open docs/index.html

# またはローカルサーバーを起動
cd docs
python -m http.server 8000
# その後 http://localhost:8000 にアクセス
```

## 変更のテスト

### ローカルでテスト

1. マーケットプレイスをローカルにインストール：

   ```bash
   claude /plugin marketplace add /Users/yourusername/every-marketplace
   ```

2. プラグインをインストール：

   ```bash
   claude /plugin install compound-engineering
   ```

3. エージェントとコマンドをテスト：
   ```bash
   claude /review
   claude agent kieran-rails-reviewer "test message"
   ```

### JSONを検証

コミット前に、JSONファイルが有効であることを確認：

```bash
cat .claude-plugin/marketplace.json | jq .
cat plugins/compound-engineering/.claude-plugin/plugin.json | jq .
```

## よくあるタスク

### 新しいエージェントの追加

1. `plugins/compound-engineering/agents/new-agent.md`を作成
2. plugin.jsonのエージェントカウントとエージェントリストを更新
3. README.mdのエージェントリストを更新
4. `claude agent new-agent "test"`でテスト

### 新しいコマンドの追加

1. `plugins/compound-engineering/commands/new-command.md`を作成
2. plugin.jsonのコマンドカウントとコマンドリストを更新
3. README.mdのコマンドリストを更新
4. `claude /new-command`でテスト

### 新しいスキルの追加

1. スキルディレクトリを作成：`plugins/compound-engineering/skills/skill-name/`
2. スキル構造を追加：
   ```
   skills/skill-name/
   ├── SKILL.md           # フロントマター付きスキル定義（name、description）
   └── scripts/           # サポートスクリプト（オプション）
   ```
3. plugin.jsonの説明を新しいスキルカウントで更新
4. marketplace.jsonの説明を新しいスキルカウントで更新
5. README.mdをスキルドキュメントで更新
6. CHANGELOG.mdに追加を記録
7. `claude skill skill-name`でテスト

**スキルファイル形式（SKILL.md）：**
```markdown
---
name: skill-name
description: スキルが何をするかの簡単な説明
---

# スキルタイトル

詳細なドキュメント...
```

### タグ/キーワードの更新

タグはコンパウンドエンジニアリングの哲学を反映すべきです：

- 使用：`ai-powered`、`compound-engineering`、`workflow-automation`、`knowledge-management`
- 避ける：プラグインがフレームワーク固有でない限り、フレームワーク固有のタグ

## コミット規約

コミットメッセージには以下のパターンに従ってください：

- `Add [agent/command name]` - 新機能の追加
- `Remove [agent/command name]` - 機能の削除
- `Update [file] to [what changed]` - 既存ファイルの更新
- `Fix [issue]` - バグ修正
- `Simplify [component] to [improvement]` - リファクタリング

Claude Codeフッターを含める：

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

## 詳細情報を探す際のリソース

- [Claude Code プラグインドキュメント](https://docs.claude.com/en/docs/claude-code/plugins)
- [プラグインマーケットプレイスドキュメント](https://docs.claude.com/en/docs/claude-code/plugin-marketplaces)
- [プラグインリファレンス](https://docs.claude.com/en/docs/claude-code/plugins-reference)

## 主要な学び

_このセクションでは、このリポジトリで作業しながら得た重要な学びを記録します。_

### 2024-11-22: gemini-imagegenスキルを追加し、コンポーネントカウントを修正

プラグインに最初のスキルを追加し、コンポーネントカウントが間違っていることを発見（15エージェントと記載していたが、実際には17だった）。今後これを防ぐための包括的なチェックリストを作成。

**学び：** 説明を更新する前に必ず実際のファイルをカウントすること。カウントは複数の場所（plugin.json、marketplace.json、README.md）に表示され、すべて一致する必要がある。上記のチェックリストの確認コマンドを使用すること。

### 2024-10-09: marketplace.jsonを公式仕様に合わせて簡素化

初期のmarketplace.jsonには、Claude Code仕様に含まれていない多くのカスタムフィールド（downloads、stars、rating、categories、trending）が含まれていた。以下のみを含むように簡素化：

- 必須：`name`、`owner`、`plugins`
- オプション：`metadata`（説明とバージョンを含む）
- プラグインエントリ：`name`、`description`、`version`、`author`、`homepage`、`tags`、`source`

**学び：** 公式仕様に従う。カスタムフィールドはユーザーを混乱させたり、将来のバージョンとの互換性を壊す可能性がある。
