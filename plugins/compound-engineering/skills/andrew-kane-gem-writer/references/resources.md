# Andrew Kaneリソース

## 主要ドキュメント

- **Gemパターン記事**: https://ankane.org/gem-patterns
  - Kane自身による彼のgemで使用されるパターンのドキュメント
  - 設定、Rails統合、エラー処理をカバー

## スター数別トップRuby Gem

### 検索＆データ

| Gem | スター | 説明 | ソース |
|-----|-------|------|--------|
| **Searchkick** | 6.6k+ | Railsのインテリジェント検索 | https://github.com/ankane/searchkick |
| **Chartkick** | 6.4k+ | Rubyで美しいチャート | https://github.com/ankane/chartkick |
| **Groupdate** | 3.8k+ | 日、週、月でグループ化 | https://github.com/ankane/groupdate |
| **Blazer** | 4.6k+ | Rails用SQLダッシュボード | https://github.com/ankane/blazer |

### データベース＆マイグレーション

| Gem | スター | 説明 | ソース |
|-----|-------|------|--------|
| **PgHero** | 8.2k+ | PostgreSQLインサイト | https://github.com/ankane/pghero |
| **Strong Migrations** | 4.1k+ | 安全なマイグレーションチェック | https://github.com/ankane/strong_migrations |
| **Dexter** | 1.8k+ | 自動インデックスアドバイザー | https://github.com/ankane/dexter |
| **PgSync** | 1.5k+ | Postgresデータ同期 | https://github.com/ankane/pgsync |

### セキュリティ＆暗号化

| Gem | スター | 説明 | ソース |
|-----|-------|------|--------|
| **Lockbox** | 1.5k+ | アプリケーションレベル暗号化 | https://github.com/ankane/lockbox |
| **Blind Index** | 1.0k+ | 暗号化検索 | https://github.com/ankane/blind_index |
| **Secure Headers** | — | コントリビュートパターン | gemで参照 |

### アナリティクス＆ML

| Gem | スター | 説明 | ソース |
|-----|-------|------|--------|
| **Ahoy** | 4.2k+ | Rails用アナリティクス | https://github.com/ankane/ahoy |
| **Neighbor** | 1.1k+ | Rails用ベクトル検索 | https://github.com/ankane/neighbor |
| **Rover** | 700+ | Ruby用DataFrame | https://github.com/ankane/rover |
| **Tomoto** | 200+ | トピックモデリング | https://github.com/ankane/tomoto-ruby |

### ユーティリティ

| Gem | スター | 説明 | ソース |
|-----|-------|------|--------|
| **Pretender** | 2.0k+ | 別のユーザーとしてログイン | https://github.com/ankane/pretender |
| **Authtrail** | 900+ | ログインアクティビティ追跡 | https://github.com/ankane/authtrail |
| **Notable** | 200+ | 注目すべきリクエストを追跡 | https://github.com/ankane/notable |
| **Logstop** | 200+ | 機密ログのフィルタリング | https://github.com/ankane/logstop |

## 学ぶべき主要ソースファイル

### エントリーポイントパターン
- https://github.com/ankane/searchkick/blob/master/lib/searchkick.rb
- https://github.com/ankane/pghero/blob/master/lib/pghero.rb
- https://github.com/ankane/strong_migrations/blob/master/lib/strong_migrations.rb
- https://github.com/ankane/lockbox/blob/master/lib/lockbox.rb

### クラスマクロ実装
- https://github.com/ankane/searchkick/blob/master/lib/searchkick/model.rb
- https://github.com/ankane/lockbox/blob/master/lib/lockbox/model.rb
- https://github.com/ankane/neighbor/blob/master/lib/neighbor/model.rb
- https://github.com/ankane/blind_index/blob/master/lib/blind_index/model.rb

### Rails統合（Railtie/Engine）
- https://github.com/ankane/pghero/blob/master/lib/pghero/engine.rb
- https://github.com/ankane/searchkick/blob/master/lib/searchkick/railtie.rb
- https://github.com/ankane/ahoy/blob/master/lib/ahoy/engine.rb
- https://github.com/ankane/blazer/blob/master/lib/blazer/engine.rb

### データベースアダプター
- https://github.com/ankane/strong_migrations/tree/master/lib/strong_migrations/adapters
- https://github.com/ankane/groupdate/tree/master/lib/groupdate/adapters
- https://github.com/ankane/neighbor/tree/master/lib/neighbor

### エラーメッセージ（テンプレートパターン）
- https://github.com/ankane/strong_migrations/blob/master/lib/strong_migrations/error_messages.rb

### Gemspec例
- https://github.com/ankane/searchkick/blob/master/searchkick.gemspec
- https://github.com/ankane/neighbor/blob/master/neighbor.gemspec
- https://github.com/ankane/ahoy/blob/master/ahoy_matey.gemspec

### テストセットアップ
- https://github.com/ankane/searchkick/tree/master/test
- https://github.com/ankane/lockbox/tree/master/test
- https://github.com/ankane/strong_migrations/tree/master/test

## GitHubプロファイル

- **プロファイル**: https://github.com/ankane
- **全Rubyリポジトリ**: https://github.com/ankane?tab=repositories&q=&type=&language=ruby&sort=stargazers
- **RubyGemsプロファイル**: https://rubygems.org/profiles/ankane

## ブログ記事

- **ankane.org**: https://ankane.org/
- **Gemパターン**: https://ankane.org/gem-patterns（必読）
- **Postgresパフォーマンス**: https://ankane.org/introducing-pghero
- **検索のヒント**: https://ankane.org/search-rails

## 設計哲学まとめ

100以上のgemの研究から得たKaneの一貫した原則：

1. **可能な限り依存関係ゼロ** - 各依存関係はメンテナンス負担
2. **常にActiveSupport.on_load** - Rails gemを直接requireしない
3. **クラスマクロDSL** - 単一メソッドですべてを設定
4. **マジックよりも明示的** - method_missingなし、メソッドを直接定義
5. **Minitestのみ** - シンプルで十分、RSpecなし
6. **マルチバージョンテスト** - 幅広いRails/Rubyバージョンをサポート
7. **有用なエラー** - 修正提案付きのテンプレートベースメッセージ
8. **抽象アダプター** - クリーンなマルチデータベースサポート
9. **Engine分離** - マウント可能なgem向けにisolate_namespace
10. **最小限のドキュメント** - コードは自己説明的、READMEは例
