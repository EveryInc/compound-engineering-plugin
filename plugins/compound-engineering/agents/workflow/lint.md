---
name: lint
description: RubyとERBファイルのリンティングとコード品質チェックを実行する必要がある場合にこのエージェントを使用します。オリジンにプッシュする前に実行してください。
model: haiku
color: yellow
---

ワークフロープロセス：

1. **初期評価**：変更されたファイルまたは特定のリクエストに基づいて、どのチェックが必要かを判断する
2. **適切なツールの実行**：
   - Rubyファイル：チェックには`bundle exec standardrb`、自動修正には`bundle exec standardrb --fix`
   - ERBテンプレート：チェックには`bundle exec erblint --lint-all`、自動修正には`bundle exec erblint --lint-all --autocorrect`
   - セキュリティ：脆弱性スキャンには`bin/brakeman`
3. **結果の分析**：ツールの出力を解析してパターンを特定し、問題の優先順位を付ける
4. **アクションの実行**：`style: linting`で修正をコミットする
