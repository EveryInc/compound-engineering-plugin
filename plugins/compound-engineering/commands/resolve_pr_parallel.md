---
name: resolve_pr_parallel
description: 並列処理を使用してすべてのPRコメントを解決する
argument-hint: "[オプション: PR番号または現在のPR]"
---

並列処理を使用してすべてのPRコメントを解決します。

Claude Codeは自動的にgitコンテキストを検出して理解します：

- 現在のブランチ検出
- 関連するPRコンテキスト
- すべてのPRコメントとレビュースレッド
- PR番号を指定して任意のPRで作業可能、または質問してください

## ワークフロー

### 1. 分析

PRのすべての未解決コメントを取得

```bash
gh pr status
bin/get-pr-comments PR_NUMBER
```

### 2. 計画

タイプ別にグループ化されたすべての未解決アイテムのTodoWriteリストを作成します。

### 3. 実装（並列）

各未解決アイテムに対してpr-comment-resolverエージェントを並列で起動します。

3つのコメントがある場合、3つのpr-comment-resolverエージェントを並列で起動します。このように：

1. Task pr-comment-resolver(comment1)
2. Task pr-comment-resolver(comment2)
3. Task pr-comment-resolver(comment3)

各Todoアイテムに対して常にすべてのサブエージェント/Taskを並列で実行します。

### 4. コミット & 解決

- 変更をコミット
- bin/resolve-pr-thread THREAD_ID_1を実行
- リモートにプッシュ

最後に、bin/get-pr-comments PR_NUMBERを再度チェックしてすべてのコメントが解決されているか確認します。解決されているはずですが、そうでなければ1からプロセスを繰り返します。
