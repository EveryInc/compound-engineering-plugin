---
name: release-docs
description: 現在のプラグインコンポーネントでドキュメントサイトをビルドして更新する
argument-hint: "[オプション: --dry-runで書き込みなしにプレビュー]"
---

# ドキュメントリリースコマンド

あなたはcompound-engineeringプラグインのドキュメント生成者です。`plugins/compound-engineering/docs/`にあるドキュメントサイトが実際のプラグインコンポーネントと常に最新であることを確認することが仕事です。

## 概要

ドキュメントサイトはEvil MartiansのLaunchKitテンプレートをベースにした静的HTML/CSS/JSサイトです。以下の場合に再生成が必要です：

- エージェントが追加、削除、または変更された
- コマンドが追加、削除、または変更された
- スキルが追加、削除、または変更された
- MCPサーバーが追加、削除、または変更された

## ステップ1: 現在のコンポーネントの棚卸し

まず、すべての現在のコンポーネントをカウントしてリスト：

```bash
# エージェントをカウント
ls plugins/compound-engineering/agents/*.md | wc -l

# コマンドをカウント
ls plugins/compound-engineering/commands/*.md | wc -l

# スキルをカウント
ls -d plugins/compound-engineering/skills/*/ 2>/dev/null | wc -l

# MCPサーバーをカウント
ls -d plugins/compound-engineering/mcp-servers/*/ 2>/dev/null | wc -l
```

すべてのコンポーネントファイルを読んでメタデータを取得：

### エージェント
`plugins/compound-engineering/agents/*.md`の各エージェントファイルについて：
- フロントマター（name、description）を抽出
- カテゴリをメモ（Review、Research、Workflow、Design、Docs）
- コンテンツから主な責任を取得

### コマンド
`plugins/compound-engineering/commands/*.md`の各コマンドファイルについて：
- フロントマター（name、description、argument-hint）を抽出
- WorkflowまたはUtilityコマンドとして分類

### スキル
`plugins/compound-engineering/skills/*/`の各スキルディレクトリについて：
- フロントマター（name、description）のためにSKILL.mdファイルを読む
- スクリプトやサポートファイルをメモ

### MCPサーバー
`plugins/compound-engineering/mcp-servers/*/`の各MCPサーバーについて：
- 設定とREADMEを読む
- 提供されるツールをリスト

## ステップ2: ドキュメントページの更新

### 2a. `docs/index.html`を更新

正確なカウントでスタッツセクションを更新：
```html
<div class="stats-grid">
  <div class="stat-card">
    <span class="stat-number">[AGENT_COUNT]</span>
    <span class="stat-label">Specialized Agents</span>
  </div>
  <!-- すべてのスタットカードを更新 -->
</div>
```

コンポーネントサマリーセクションが主要なコンポーネントを正確にリストしていることを確認。

### 2b. `docs/pages/agents.html`を更新

完全なエージェントリファレンスページを再生成：
- カテゴリ別にエージェントをグループ化（Review、Research、Workflow、Design、Docs）
- 各エージェントに含める：
  - 名前と説明
  - 主な責任（箇条書きリスト）
  - 使用例：`claude agent [agent-name] "your message"`
  - ユースケース

### 2c. `docs/pages/commands.html`を更新

完全なコマンドリファレンスページを再生成：
- タイプ別にコマンドをグループ化（Workflow、Utility）
- 各コマンドに含める：
  - 名前と説明
  - 引数（ある場合）
  - プロセス/ワークフローステップ
  - 使用例

### 2d. `docs/pages/skills.html`を更新

完全なスキルリファレンスページを再生成：
- カテゴリ別にスキルをグループ化（Development Tools、Content & Workflow、Image Generation）
- 各スキルに含める：
  - 名前と説明
  - 使用法：`claude skill [skill-name]`
  - 機能と能力

### 2e. `docs/pages/mcp-servers.html`を更新

MCPサーバーリファレンスページを再生成：
- 各サーバーについて：
  - 名前と目的
  - 提供されるツール
  - 設定詳細
  - サポートされるフレームワーク/サービス

## ステップ3: メタデータファイルの更新

以下全体でカウントが一貫していることを確認：

1. **`plugins/compound-engineering/.claude-plugin/plugin.json`**
   - 正しいカウントで`description`を更新
   - カウントで`components`オブジェクトを更新
   - 現在のアイテムで`agents`、`commands`配列を更新

2. **`.claude-plugin/marketplace.json`**
   - 正しいカウントでプラグイン`description`を更新

3. **`plugins/compound-engineering/README.md`**
   - カウントで紹介段落を更新
   - コンポーネントリストを更新

## ステップ4: 検証

検証チェックを実行：

```bash
# JSONファイルを検証
cat .claude-plugin/marketplace.json | jq .
cat plugins/compound-engineering/.claude-plugin/plugin.json | jq .

# カウントが一致することを確認
echo "Agents in files: $(ls plugins/compound-engineering/agents/*.md | wc -l)"
grep -o "[0-9]* specialized agents" plugins/compound-engineering/docs/index.html

echo "Commands in files: $(ls plugins/compound-engineering/commands/*.md | wc -l)"
grep -o "[0-9]* slash commands" plugins/compound-engineering/docs/index.html
```

## ステップ5: 変更の報告

更新された内容のサマリーを提供：

```
## ドキュメントリリースサマリー

### コンポーネントカウント
- Agents: X（以前Y）
- Commands: X（以前Y）
- Skills: X（以前Y）
- MCP Servers: X（以前Y）

### 更新されたファイル
- docs/index.html - スタッツとコンポーネントサマリーを更新
- docs/pages/agents.html - Xエージェントで再生成
- docs/pages/commands.html - Xコマンドで再生成
- docs/pages/skills.html - Xスキルで再生成
- docs/pages/mcp-servers.html - Xサーバーで再生成
- plugin.json - カウントとコンポーネントリストを更新
- marketplace.json - 説明を更新
- README.md - コンポーネントリストを更新

### 追加された新コンポーネント
- [新しいエージェント/コマンド/スキルをリスト]

### 削除されたコンポーネント
- [削除されたエージェント/コマンド/スキルをリスト]
```

## ドライランモード

`--dry-run`が指定された場合：
- すべての棚卸しと検証ステップを実行
- 更新されるものを報告
- ファイルを書き込まない
- 提案された変更の差分プレビューを表示

## エラーハンドリング

- コンポーネントファイルに無効なフロントマターがある場合、エラーを報告してスキップ
- JSON検証が失敗した場合、報告して中止
- 常に有効な状態を維持 - 部分的に更新しない

## リリース後

成功したリリース後：
1. ドキュメント変更でCHANGELOG.mdを更新することを提案
2. メッセージでコミットすることを思い出させる：`docs: Update documentation site to match plugin components`
3. 変更をプッシュすることを思い出させる

## 使用例

```bash
# フルドキュメントリリース
claude /release-docs

# 書き込みなしに変更をプレビュー
claude /release-docs --dry-run

# 新しいエージェント追加後
claude /release-docs
```
