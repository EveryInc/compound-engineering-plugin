# DHH Rubyスタイル リソース

DHHのRuby/Railsスタイルを習得するためのソース資料、ドキュメント、参考文献へのリンク。

## 主要ソースコード

### Campfire (Once)
このスタイルガイドの元となった主要なコードベース。

- **リポジトリ**: https://github.com/basecamp/once-campfire
- **メッセージコントローラー**: https://github.com/basecamp/once-campfire/blob/main/app/controllers/messages_controller.rb
- **JavaScript/Stimulus**: https://github.com/basecamp/once-campfire/tree/main/app/javascript
- **デプロイメント**: SQLiteを使用した単一Dockerコンテナ

### その他の37signalsオープンソース
- **Solid Queue**: https://github.com/rails/solid_queue - データベースバックドActive Jobバックエンド
- **Solid Cache**: https://github.com/rails/solid_cache - データベースバックドRailsキャッシュ
- **Solid Cable**: https://github.com/rails/solid_cable - データベースバックドAction Cableアダプター
- **Kamal**: https://github.com/basecamp/kamal - ゼロダウンタイムデプロイメントツール
- **Turbo**: https://github.com/hotwired/turbo-rails - HotwireのSPAライクなページアクセラレーター
- **Stimulus**: https://github.com/hotwired/stimulus - 控えめなJavaScriptフレームワーク

## 記事とブログ投稿

### コントローラー構成
- **DHHがRailsコントローラーを整理する方法**: https://jeromedalbert.com/how-dhh-organizes-his-rails-controllers/
  - REST純粋主義のコントローラー設計に関する決定版記事
  - 「7アクションのみ」哲学を文書化
  - カスタムアクションの代わりに新しいコントローラーを作成する方法を示す

### テスト哲学
- **37signals Dev - Pending Tests**: https://dev.37signals.com/pending-tests/
  - 37signalsが不完全なテストを処理する方法
  - テストカバレッジへの実用的なアプローチ
- **37signals Dev - All About QA**: https://dev.37signals.com/all-about-qa/
  - 37signalsでのQA哲学
  - 自動テストと手動テストのバランス

### アーキテクチャとデプロイメント
- **RailwayにCampfireをデプロイ**: https://railway.com/deploy/campfire
  - 単一コンテナデプロイメントの例
  - 本番環境でのSQLiteパターン

## 公式ドキュメント

### Railsガイド（DHHのビジョン）
- **Rails Doctrine**: https://rubyonrails.org/doctrine
  - 哲学的基盤
  - 設定より規約の説明
  - 「プログラマーの幸福のための最適化」

### Hotwire
- **Hotwire**: https://hotwired.dev/
  - 公式Hotwireドキュメント
  - Turbo Drive、Frames、Streams
- **Turboハンドブック**: https://turbo.hotwired.dev/handbook/introduction
- **Stimulusハンドブック**: https://stimulus.hotwired.dev/handbook/introduction

### Current属性
- **Rails API - CurrentAttributes**: https://api.rubyonrails.org/classes/ActiveSupport/CurrentAttributes.html
  - Currentパターンの公式ドキュメント
  - スレッド分離された属性シングルトン

## 動画と講演

### DHH基調講演
- **RailsConf基調講演**: YouTubeで「DHH RailsConf」を検索
  - 毎年のRailsの現状報告
  - 哲学と方向性の議論

### Hotwireチュートリアル
- **DHHによるHotwireデモ**: アプローチを示すオリジナルデモ
- **GoRails Hotwireシリーズ**: 実践的な実装チュートリアル

## 書籍

### DHHと37signalsによる
- **Getting Real**: https://basecamp.com/gettingreal
  - 製品開発哲学
  - 少ないほど良いアプローチ
- **Remote**: リモートワークの哲学
- **It Doesn't Have to Be Crazy at Work**: 穏やかな会社文化

### Rails書籍
- **Agile Web Development with Rails**: オリジナルのRails本
- **The Rails Way**: 包括的なRailsパターン

## 使用するGemとツール

### コアスタック
```ruby
# Campfireからのパターン
gem "rails", "~> 8.0"
gem "sqlite3"
gem "propshaft"        # アセットパイプライン
gem "importmap-rails"  # JavaScriptインポート
gem "turbo-rails"      # Hotwire Turbo
gem "stimulus-rails"   # Hotwire Stimulus
gem "solid_queue"      # ジョブバックエンド
gem "solid_cache"      # キャッシュバックエンド
gem "solid_cable"      # WebSocketバックエンド
gem "kamal"            # デプロイメント
gem "thruster"         # HTTP/2プロキシ
gem "image_processing" # Active Storageバリアント
```

### 開発
```ruby
group :development do
  gem "web-console"
  gem "rubocop-rails-omakase"  # 37signalsスタイルルール
end

group :test do
  gem "capybara"
  gem "selenium-webdriver"
end
```

## RuboCop設定

37signalsは彼らのRuboCopルールを公開：
- **rubocop-rails-omakase**: https://github.com/rails/rubocop-rails-omakase
  - 公式Rails/37signalsスタイルルール
  - 一貫したスタイル強制に使用

```yaml
# .rubocop.yml
inherit_gem:
  rubocop-rails-omakase: rubocop.yml

# 必要に応じてプロジェクト固有のオーバーライド
```

## コミュニティリソース

### フォーラムとディスカッション
- **Ruby on Rails Discourse**: https://discuss.rubyonrails.org/
- **Reddit r/rails**: https://reddit.com/r/rails

### ポッドキャスト
- **Remote Ruby**: Ruby/Railsのディスカッション
- **Ruby Rogues**: 長年続くRubyポッドキャスト
- **The Bike Shed**: Thoughtbotの開発ポッドキャスト

## 重要な哲学文書

### Rails Doctrineの柱
1. プログラマーの幸福のための最適化
2. 設定より規約
3. メニューはお任せ
4. 単一のパラダイムはない
5. 美しいコードを称える
6. 鋭いナイフを提供
7. 統合システムを重視
8. 安定性より進歩
9. 大きなテントを張る

### 覚えておくべきDHHの言葉

> 「Railsコントローラーの大多数は同じ7つのアクションを使用できます。」

> 「カスタムアクションを追加しているなら、おそらくコントローラーが足りていません。」

> 「明確なコードは賢いコードよりも優れています。」

> 「テストファイルはコードへのラブレターであるべきです。」

> 「SQLiteはほとんどのアプリケーションに十分です。」

## バージョン履歴

このスタイルガイドは以下に基づいています：
- Campfireソースコード（2024年）
- Rails 8.0規約
- Ruby 3.3構文の好み
- Hotwire 2.0パターン

最終更新：2024年
