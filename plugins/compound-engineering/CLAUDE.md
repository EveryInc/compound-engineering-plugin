# コンパウンドエンジニアリングプラグイン開発

## バージョニング要件

**重要**：このプラグインへのすべての変更には、3つのファイルすべての更新が必要です：

1. **`.claude-plugin/plugin.json`** - semverを使用してバージョンを上げる
2. **`CHANGELOG.md`** - Keep a Changelog形式で変更を記録
3. **`README.md`** - コンポーネントカウントとテーブルを確認/更新

### バージョン更新ルール

- **MAJOR**（1.0.0 → 2.0.0）：破壊的変更、大規模な再編成
- **MINOR**（1.0.0 → 1.1.0）：新しいエージェント、コマンド、またはスキル
- **PATCH**（1.0.0 → 1.0.1）：バグ修正、ドキュメント更新、軽微な改善

### コミット前チェックリスト

変更をコミットする前に：

- [ ] `.claude-plugin/plugin.json`でバージョンを上げた
- [ ] CHANGELOG.mdを変更で更新した
- [ ] README.mdのコンポーネントカウントを確認した
- [ ] README.mdのテーブルが正確（エージェント、コマンド、スキル）
- [ ] plugin.jsonの説明が現在のカウントと一致

### ディレクトリ構造

```
agents/
├── review/     # コードレビューエージェント
├── research/   # リサーチ・分析エージェント
├── design/     # デザイン・UIエージェント
├── workflow/   # ワークフロー自動化エージェント
└── docs/       # ドキュメントエージェント

commands/
├── workflows/  # コアワークフローコマンド（workflows:plan、workflows:reviewなど）
└── *.md        # ユーティリティコマンド

skills/
└── *.md        # すべてのスキルはルートレベルに
```

## コマンド命名規約

**ワークフローコマンド**は組み込みコマンドとの衝突を避けるため`workflows:`プレフィックスを使用：
- `/workflows:plan` - 実装計画を作成
- `/workflows:review` - 包括的なコードレビューを実行
- `/workflows:work` - 作業項目を体系的に実行
- `/workflows:compound` - 解決した問題を文書化

**なぜ`workflows:`?** Claude Codeには組み込みの`/plan`と`/review`コマンドがあります。フロントマターで`name: workflows:plan`を使用すると、衝突のないユニークな`/workflows:plan`コマンドが作成されます。

## スキルコンプライアンスチェックリスト

スキルを追加または変更する際は、skill-creator仕様への準拠を確認：

### YAMLフロントマター（必須）

- [ ] `name:`が存在し、ディレクトリ名と一致（lowercase-with-hyphens）
- [ ] `description:`が存在し、**三人称**を使用（「このスキルは...に使用されるべき」であり「このスキルを...に使用する」ではない）

### リファレンスリンク（references/が存在する場合は必須）

- [ ] `references/`内のすべてのファイルは`[filename.md](./references/filename.md)`としてリンク
- [ ] `assets/`内のすべてのファイルは`[filename](./assets/filename)`としてリンク
- [ ] `scripts/`内のすべてのファイルは`[filename](./scripts/filename)`としてリンク
- [ ] `` `references/file.md` ``のような素のバッククォート参照は使用しない - 適切なマークダウンリンクを使用

### 文体

- [ ] 命令形/不定形を使用（動詞から始まる指示）
- [ ] 二人称（「あなたは...すべき」）を避ける - 客観的な言語を使用（「Xを達成するには、Yを行う」）

### クイック検証コマンド

```bash
# スキル内のリンクされていないリファレンスをチェック
grep -E '`(references|assets|scripts)/[^`]+`' skills/*/SKILL.md
# すべての参照が適切にリンクされていれば何も返さないはず

# 説明形式をチェック
grep -E '^description:' skills/*/SKILL.md | grep -v 'This skill'
# すべてが三人称を使用していれば何も返さないはず
```

## ドキュメント

詳細なバージョニングワークフローについては`docs/solutions/plugin-versioning-requirements.md`を参照。
