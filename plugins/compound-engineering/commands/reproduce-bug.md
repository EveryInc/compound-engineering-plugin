---
name: reproduce-bug
description: ログとコンソール検査を使用してバグを再現し調査する
argument-hint: "[GitHubイシュー番号]"
---

GitHubイシュー #$ARGUMENTS を確認し、イシューの説明とコメントを読みます。

その後、以下のエージェントを並列で実行してバグを再現：

1. Task rails-console-explorer(issue_description)
2. Task appsignal-log-investigator (issue_description)

次に、コードベースを見て問題が発生しうる場所を検討します。探すべきログ出力を探します。

その後、バグの再現に役立つログを見つけるために再度以下のエージェントを並列で実行：

1. Task rails-console-explorer(issue_description)
2. Task appsignal-log-investigator (issue_description)

何が起きているかよく理解できるまでこれらのエージェントを実行し続けます。

**リファレンス収集：**

- [ ] 具体的なファイルパス（例：`app/services/example_service.rb:42`）ですべてのリサーチ結果を文書化

その後、発見事項とバグの再現方法についてイシューにコメントを追加します。
