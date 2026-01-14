---
name: andrew-kane-gem-writer
description: このスキルは、Andrew Kaneの実績あるパターンと哲学に従ってRuby gemを書く際に使用されるべきです。新しいRuby gemの作成、既存gemのリファクタリング、gem APIの設計、またはクリーンでミニマル、本番対応のRubyライブラリコードが必要な場合に適用されます。「gemを作成」、「Rubyライブラリを書く」、「gem APIを設計」などのリクエストや、Andrew Kaneのスタイルへの言及でトリガーされます。
---

# Andrew Kane Gem Writer

Andrew Kaneの100以上のgemと374M以上のダウンロード（Searchkick、PgHero、Chartkick、Strong Migrations、Lockbox、Ahoy、Blazer、Groupdate、Neighbor、Blind Index）から得た実戦的なパターンに従ってRuby gemを書く。

## コア哲学

**シンプルさは巧妙さに勝る。** 依存関係はゼロまたは最小限。メタプログラミングよりも明示的なコード。Rails結合なしでRails統合。すべてのパターンは本番ユースケースに対応。

## エントリーポイント構造

すべてのgemは`lib/gemname.rb`でこの正確なパターンに従う：

```ruby
# 1. 依存関係（stdlibを優先）
require "forwardable"

# 2. 内部モジュール
require_relative "gemname/model"
require_relative "gemname/version"

# 3. 条件付きRails（重要 - Railsを直接requireしない）
require_relative "gemname/railtie" if defined?(Rails)

# 4. 設定とエラーを持つモジュール
module GemName
  class Error < StandardError; end
  class InvalidConfigError < Error; end

  class << self
    attr_accessor :timeout, :logger
    attr_writer :client
  end

  self.timeout = 10  # デフォルトをすぐに設定
end
```

## クラスマクロDSLパターン

Kaneの特徴的パターン—単一メソッド呼び出しですべてを設定：

```ruby
# 使用法
class Product < ApplicationRecord
  searchkick word_start: [:name]
end

# 実装
module GemName
  module Model
    def gemname(**options)
      unknown = options.keys - KNOWN_KEYWORDS
      raise ArgumentError, "unknown keywords: #{unknown.join(", ")}" if unknown.any?

      mod = Module.new
      mod.module_eval do
        define_method :some_method do
          # 実装
        end unless method_defined?(:some_method)
      end
      include mod

      class_eval do
        cattr_reader :gemname_options, instance_reader: false
        class_variable_set :@@gemname_options, options.dup
      end
    end
  end
end
```

## Rails統合

**常に`ActiveSupport.on_load`を使用—Rails gemを直接requireしない：**

```ruby
# 間違い
require "active_record"
ActiveRecord::Base.include(MyGem::Model)

# 正しい
ActiveSupport.on_load(:active_record) do
  extend GemName::Model
end

# 動作修正にはprependを使用
ActiveSupport.on_load(:active_record) do
  ActiveRecord::Migration.prepend(GemName::Migration)
end
```

## 設定パターン

Configurationオブジェクトではなく、`class << self`と`attr_accessor`を使用：

```ruby
module GemName
  class << self
    attr_accessor :timeout, :logger
    attr_writer :master_key
  end

  def self.master_key
    @master_key ||= ENV["GEMNAME_MASTER_KEY"]
  end

  self.timeout = 10
  self.logger = nil
end
```

## エラー処理

情報量の多いメッセージを持つシンプルな階層：

```ruby
module GemName
  class Error < StandardError; end
  class ConfigError < Error; end
  class ValidationError < Error; end
end

# ArgumentErrorで早期検証
def initialize(key:)
  raise ArgumentError, "Key must be 32 bytes" unless key&.bytesize == 32
end
```

## テスト（Minitestのみ）

```ruby
# test/test_helper.rb
require "bundler/setup"
Bundler.require(:default)
require "minitest/autorun"
require "minitest/pride"

# test/model_test.rb
class ModelTest < Minitest::Test
  def test_basic_functionality
    assert_equal expected, actual
  end
end
```

## Gemspecパターン

可能な限りランタイム依存関係ゼロ：

```ruby
Gem::Specification.new do |spec|
  spec.name = "gemname"
  spec.version = GemName::VERSION
  spec.required_ruby_version = ">= 3.1"
  spec.files = Dir["*.{md,txt}", "{lib}/**/*"]
  spec.require_path = "lib"
  # add_dependency行なし - 開発用depsはGemfileへ
end
```

## 避けるべきアンチパターン

- `method_missing`（代わりに`define_method`を使用）
- Configurationオブジェクト（クラスアクセサを使用）
- `@@class_variables`（`class << self`を使用）
- Rails gemの直接require
- 多数のランタイム依存関係
- gemでGemfile.lockをコミット
- RSpec（Minitestを使用）
- 重いDSL（明示的なRubyを優先）

## リファレンスファイル

より深いパターンについては：
- **[references/module-organization.md](references/module-organization.md)** - ディレクトリレイアウト、メソッド分解
- **[references/rails-integration.md](references/rails-integration.md)** - Railtie、Engine、on_loadパターン
- **[references/database-adapters.md](references/database-adapters.md)** - マルチデータベースサポートパターン
- **[references/testing-patterns.md](references/testing-patterns.md)** - マルチバージョンテスト、CIセットアップ
- **[references/resources.md](references/resources.md)** - Kaneのリポジトリと記事へのリンク
