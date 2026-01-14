---
name: git-worktree
description: このスキルは、分離された並行開発のためにGit worktreeを管理します。worktreeの作成、一覧表示、切り替え、クリーンアップを、KISSの原則に従ったシンプルなインタラクティブインターフェースで処理します。
---

# Git Worktreeマネージャー

このスキルは、開発ワークフロー全体でGit worktreeを管理するための統一されたインターフェースを提供します。PRを分離してレビューする場合でも、機能を並行して作業する場合でも、このスキルがすべての複雑さを処理します。

## このスキルができること

- mainブランチから明確なブランチ名で**worktreeを作成**
- 現在の状態と共に**worktreeを一覧表示**
- 並行作業のために**worktree間を切り替え**
- 完了したworktreeを自動的に**クリーンアップ**
- 各ステップでの**インタラクティブな確認**
- worktreeディレクトリの**自動.gitignore管理**
- メインリポジトリから新しいworktreeへの**自動.envファイルコピー**

## 重要：常にマネージャースクリプトを使用

**直接`git worktree add`を呼び出さない。** 常に`worktree-manager.sh`スクリプトを使用。

スクリプトは生のgitコマンドでは処理されない重要なセットアップを行う：
1. メインリポジトリから`.env`、`.env.local`、`.env.test`などをコピー
2. `.worktrees`が`.gitignore`にあることを確認
3. 一貫したディレクトリ構造を作成

```bash
# ✅ 正しい - 常にスクリプトを使用
bash ${CLAUDE_PLUGIN_ROOT}/skills/git-worktree/scripts/worktree-manager.sh create feature-name

# ❌ 間違い - 直接これをしない
git worktree add .worktrees/feature-name -b feature-name main
```

## このスキルを使用する場面

以下のシナリオでこのスキルを使用：

1. **コードレビュー（`/workflows:review`）**：PRブランチにいない場合、分離したレビューのためにworktreeを提案
2. **機能作業（`/workflows:work`）**：常にユーザーに並行worktreeかライブブランチ作業かを確認
3. **並行開発**：複数の機能を同時に作業する場合
4. **クリーンアップ**：worktreeでの作業完了後

## 使用方法

### Claude Codeワークフローでの使用

スキルは`/workflows:review`と`/workflows:work`コマンドから自動的に呼び出される：

```
# レビュー時：PRブランチにいない場合はworktreeを提案
# 作業時：常に確認 - 新しいブランチかworktreeか？
```

### 手動での使用

bashから直接スキルを呼び出すことも可能：

```bash
# 新しいworktreeを作成（.envファイルを自動コピー）
bash ${CLAUDE_PLUGIN_ROOT}/skills/git-worktree/scripts/worktree-manager.sh create feature-login

# すべてのworktreeを一覧表示
bash ${CLAUDE_PLUGIN_ROOT}/skills/git-worktree/scripts/worktree-manager.sh list

# worktreeに切り替え
bash ${CLAUDE_PLUGIN_ROOT}/skills/git-worktree/scripts/worktree-manager.sh switch feature-login

# 既存のworktreeに.envファイルをコピー（コピーされていない場合）
bash ${CLAUDE_PLUGIN_ROOT}/skills/git-worktree/scripts/worktree-manager.sh copy-env feature-login

# 完了したworktreeをクリーンアップ
bash ${CLAUDE_PLUGIN_ROOT}/skills/git-worktree/scripts/worktree-manager.sh cleanup
```

## コマンド

### `create <branch-name> [from-branch]`

指定されたブランチ名で新しいworktreeを作成。

**オプション：**
- `branch-name`（必須）：新しいブランチとworktreeの名前
- `from-branch`（オプション）：作成元のベースブランチ（デフォルトは`main`）

**例：**
```bash
bash ${CLAUDE_PLUGIN_ROOT}/skills/git-worktree/scripts/worktree-manager.sh create feature-login
```

**動作：**
1. worktreeが既に存在するか確認
2. リモートからベースブランチを更新
3. 新しいworktreeとブランチを作成
4. **メインリポジトリからすべての.envファイルをコピー**（.env、.env.local、.env.testなど）
5. worktreeへのcdパスを表示

### `list`または`ls`

ブランチと現在の状態を含むすべての利用可能なworktreeを一覧表示。

**例：**
```bash
bash ${CLAUDE_PLUGIN_ROOT}/skills/git-worktree/scripts/worktree-manager.sh list
```

**出力表示：**
- worktree名
- ブランチ名
- 現在のもの（✓でマーク）
- メインリポジトリの状態

### `switch <name>`または`go <name>`

既存のworktreeに切り替えてcdで移動。

**例：**
```bash
bash ${CLAUDE_PLUGIN_ROOT}/skills/git-worktree/scripts/worktree-manager.sh switch feature-login
```

**オプション：**
- 名前が指定されていない場合、利用可能なworktreeを一覧表示して選択を促す

### `cleanup`または`clean`

非アクティブなworktreeを確認付きでインタラクティブにクリーンアップ。

**例：**
```bash
bash ${CLAUDE_PLUGIN_ROOT}/skills/git-worktree/scripts/worktree-manager.sh cleanup
```

**動作：**
1. すべての非アクティブなworktreeを一覧表示
2. 確認を求める
3. 選択されたworktreeを削除
4. 空のディレクトリをクリーンアップ

## ワークフローの例

### Worktreeを使用したコードレビュー

```bash
# Claude CodeがPRブランチにいないことを認識
# 提案：「分離したレビューにworktreeを使用しますか？（y/n）」

# 回答：yes
# スクリプトが実行（.envファイルを自動コピー）：
bash ${CLAUDE_PLUGIN_ROOT}/skills/git-worktree/scripts/worktree-manager.sh create pr-123-feature-name

# すべてのenv変数を持つ分離されたworktreeでレビュー
cd .worktrees/pr-123-feature-name

# レビュー後、メインに戻る：
cd ../..
bash ${CLAUDE_PLUGIN_ROOT}/skills/git-worktree/scripts/worktree-manager.sh cleanup
```

### 並行機能開発

```bash
# 最初の機能用（.envファイルをコピー）：
bash ${CLAUDE_PLUGIN_ROOT}/skills/git-worktree/scripts/worktree-manager.sh create feature-login

# 後で、2番目の機能を開始（.envファイルもコピー）：
bash ${CLAUDE_PLUGIN_ROOT}/skills/git-worktree/scripts/worktree-manager.sh create feature-notifications

# 持っているものを一覧表示：
bash ${CLAUDE_PLUGIN_ROOT}/skills/git-worktree/scripts/worktree-manager.sh list

# 必要に応じて切り替え：
bash ${CLAUDE_PLUGIN_ROOT}/skills/git-worktree/scripts/worktree-manager.sh switch feature-login

# メインに戻り、完了時にクリーンアップ：
cd .
bash ${CLAUDE_PLUGIN_ROOT}/skills/git-worktree/scripts/worktree-manager.sh cleanup
```

## 主要な設計原則

### KISS（Keep It Simple, Stupid）

- **1つのマネージャースクリプト**がすべてのworktree操作を処理
- 賢明なデフォルトを持つ**シンプルなコマンド**
- **インタラクティブなプロンプト**が誤操作を防止
- ブランチ名を直接使用する**明確な命名**

### 意見のあるデフォルト

- worktreeは常に**main**から作成（指定がない限り）
- worktreeは**.worktrees/**ディレクトリに保存
- ブランチ名がworktree名になる
- **.gitignore**は自動管理

### 安全第一

- worktree作成前に**確認**
- 誤削除を防ぐため**クリーンアップ前に確認**
- **現在のworktreeは削除しない**
- 問題に対する**明確なエラーメッセージ**

## ワークフローとの統合

### `/workflows:review`

常にworktreeを作成する代わりに：

```
1. 現在のブランチを確認
2. すでにPRブランチにいる場合 → そこに留まる、worktree不要
3. 別のブランチにいる場合 → worktreeを提案：
   「分離したレビューにworktreeを使用しますか？（y/n）」
   - yes → git-worktreeスキルを呼び出す
   - no → 現在のブランチでPR差分を進める
```

### `/workflows:work`

常に選択を提供：

```
1. 確認：「どのように作業しますか？
   1. 現在のworktreeに新しいブランチ（ライブ作業）
   2. Worktree（並行作業）」

2. 選択1の場合 → 通常どおり新しいブランチを作成
3. 選択2の場合 → git-worktreeスキルを呼び出してmainから作成
```

## トラブルシューティング

### 「Worktree already exists」

これが表示された場合、スクリプトは代わりに切り替えるかを確認します。

### 「Cannot remove worktree: it is the current worktree」

最初にworktreeから出て（メインリポジトリへ）、それからクリーンアップ：

```bash
cd $(git rev-parse --show-toplevel)
bash ${CLAUDE_PLUGIN_ROOT}/skills/git-worktree/scripts/worktree-manager.sh cleanup
```

### worktreeで迷った？

現在地を確認：

```bash
bash ${CLAUDE_PLUGIN_ROOT}/skills/git-worktree/scripts/worktree-manager.sh list
```

### worktreeに.envファイルがない？

worktreeが.envファイルなしで作成された場合（例：生の`git worktree add`経由）、コピーする：

```bash
bash ${CLAUDE_PLUGIN_ROOT}/skills/git-worktree/scripts/worktree-manager.sh copy-env feature-name
```

メインに戻る：

```bash
cd $(git rev-parse --show-toplevel)
```

## 技術的詳細

### ディレクトリ構造

```
.worktrees/
├── feature-login/          # Worktree 1
│   ├── .git
│   ├── app/
│   └── ...
├── feature-notifications/  # Worktree 2
│   ├── .git
│   ├── app/
│   └── ...
└── ...

.gitignore（.worktreesを含むように更新）
```

### 動作原理

- 分離された環境に`git worktree add`を使用
- 各worktreeは独自のブランチを持つ
- 1つのworktreeでの変更は他に影響しない
- メインリポジトリとgit履歴を共有
- 任意のworktreeからプッシュ可能

### パフォーマンス

- worktreeは軽量（ファイルシステムリンクのみ）
- リポジトリの複製なし
- 効率のための共有gitオブジェクト
- クローンやstash/切り替えよりはるかに高速
