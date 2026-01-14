---
name: resolve_todo_parallel
description: 並列処理を使用してすべての保留中のCLI Todoを解決する
argument-hint: "[オプション: 特定のTodo IDまたはパターン]"
---

並列処理を使用してすべてのTODOコメントを解決します。

## ワークフロー

### 1. 分析

/todos/\*.mdディレクトリからすべての未解決TODOを取得

### 2. 計画

タイプ別にグループ化されたすべての未解決アイテムのTodoWriteリストを作成します。発生する可能性のある依存関係を確認し、他で必要とされるものを優先します。例えば、名前を変更する必要がある場合、他のものを先に待つ必要があります。これをどのように行えるかを示すmermaidフローダイアグラムを出力します。すべてを並列で行えますか？他を並列で進めるために最初に1つを行う必要がありますか？エージェントが順番に進む方法を知るために、mermaidダイアグラムにフロー形式でToDoを配置します。

### 3. 実装（並列）

各未解決アイテムに対してpr-comment-resolverエージェントを並列で起動します。

3つのコメントがある場合、3つのpr-comment-resolverエージェントを並列で起動します。このように：

1. Task pr-comment-resolver(comment1)
2. Task pr-comment-resolver(comment2)
3. Task pr-comment-resolver(comment3)

各Todoアイテムに対して常にすべてのサブエージェント/Taskを並列で実行します。

### 4. コミット & 解決

- 変更をコミット
- ファイルからTODOを削除し、解決済みとしてマーク
- リモートにプッシュ
