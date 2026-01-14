# Rails統合パターン

## 黄金律

**Rails gemを直接requireしない。** これはローディング順序の問題を引き起こす。

```ruby
# 間違い - 早期ローディングを引き起こす
require "active_record"
ActiveRecord::Base.include(MyGem::Model)

# 正しい - 遅延ローディング
ActiveSupport.on_load(:active_record) do
  extend MyGem::Model
end
```

## ActiveSupport.on_loadフック

一般的なフックとその用途：

```ruby
# モデル
ActiveSupport.on_load(:active_record) do
  extend GemName::Model        # クラスメソッドを追加（searchkick、has_encrypted）
  include GemName::Callbacks   # インスタンスメソッドを追加
end

# コントローラー
ActiveSupport.on_load(:action_controller) do
  include Ahoy::Controller
end

# ジョブ
ActiveSupport.on_load(:active_job) do
  include GemName::JobExtensions
end

# メーラー
ActiveSupport.on_load(:action_mailer) do
  include GemName::MailerExtensions
end
```

## 動作変更にはPrepend

既存のRailsメソッドをオーバーライドする場合：

```ruby
ActiveSupport.on_load(:active_record) do
  ActiveRecord::Migration.prepend(StrongMigrations::Migration)
  ActiveRecord::Migrator.prepend(StrongMigrations::Migrator)
end
```

## Railtieパターン

マウント不要なgem向けの最小限のRailtie：

```ruby
# lib/gemname/railtie.rb
module GemName
  class Railtie < Rails::Railtie
    initializer "gemname.configure" do
      ActiveSupport.on_load(:active_record) do
        extend GemName::Model
      end
    end

    # オプション：コントローラーランタイムロギングに追加
    initializer "gemname.log_runtime" do
      require_relative "controller_runtime"
      ActiveSupport.on_load(:action_controller) do
        include GemName::ControllerRuntime
      end
    end

    # オプション：Rakeタスク
    rake_tasks do
      load "tasks/gemname.rake"
    end
  end
end
```

## Engineパターン（マウント可能なGem）

Webインターフェースを持つgem（PgHero、Blazer、Ahoy）向け：

```ruby
# lib/pghero/engine.rb
module PgHero
  class Engine < ::Rails::Engine
    isolate_namespace PgHero

    initializer "pghero.assets", group: :all do |app|
      if app.config.respond_to?(:assets) && defined?(Sprockets)
        app.config.assets.precompile << "pghero/application.js"
        app.config.assets.precompile << "pghero/application.css"
      end
    end

    initializer "pghero.config" do
      PgHero.config = Rails.application.config_for(:pghero) rescue {}
    end
  end
end
```

## Engineのルート

```ruby
# config/routes.rb（engine内）
PgHero::Engine.routes.draw do
  root to: "home#index"
  resources :databases, only: [:show]
end
```

アプリでマウント：

```ruby
# config/routes.rb（アプリ内）
mount PgHero::Engine, at: "pghero"
```

## ERB付きYAML設定

設定ファイルが必要な複雑なgem向け：

```ruby
def self.settings
  @settings ||= begin
    path = Rails.root.join("config", "blazer.yml")
    if path.exist?
      YAML.safe_load(ERB.new(File.read(path)).result, aliases: true)
    else
      {}
    end
  end
end
```

## ジェネレーターパターン

```ruby
# lib/generators/gemname/install_generator.rb
module GemName
  module Generators
    class InstallGenerator < Rails::Generators::Base
      source_root File.expand_path("templates", __dir__)

      def copy_initializer
        template "initializer.rb", "config/initializers/gemname.rb"
      end

      def copy_migration
        migration_template "migration.rb", "db/migrate/create_gemname_tables.rb"
      end
    end
  end
end
```

## 条件付き機能検出

```ruby
# 特定のRailsバージョンをチェック
if ActiveRecord.version >= Gem::Version.new("7.0")
  # Rails 7+固有のコード
end

# オプション依存関係をチェック
def self.client
  @client ||= if defined?(OpenSearch::Client)
    OpenSearch::Client.new
  elsif defined?(Elasticsearch::Client)
    Elasticsearch::Client.new
  else
    raise Error, "Install elasticsearch or opensearch-ruby"
  end
end
```
