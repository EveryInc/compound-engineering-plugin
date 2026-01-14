# モジュール構成パターン

## シンプルなGemレイアウト

```
lib/
├── gemname.rb          # エントリーポイント、設定、エラー
└── gemname/
    ├── helper.rb       # コア機能
    ├── engine.rb       # Railsエンジン（必要な場合）
    └── version.rb      # VERSION定数のみ
```

## 複雑なGemレイアウト（PgHeroパターン）

```
lib/
├── pghero.rb
└── pghero/
    ├── database.rb     # メインクラス
    ├── engine.rb       # Railsエンジン
    └── methods/        # 機能分解
        ├── basic.rb
        ├── connections.rb
        ├── indexes.rb
        ├── queries.rb
        └── replication.rb
```

## メソッド分解パターン

大きなクラスを機能ごとにインクルード可能なモジュールに分割：

```ruby
# lib/pghero/database.rb
module PgHero
  class Database
    include Methods::Basic
    include Methods::Connections
    include Methods::Indexes
    include Methods::Queries
  end
end

# lib/pghero/methods/indexes.rb
module PgHero
  module Methods
    module Indexes
      def index_hit_rate
        # 実装
      end

      def unused_indexes
        # 実装
      end
    end
  end
end
```

## Versionファイルパターン

version.rbは最小限に：

```ruby
# lib/gemname/version.rb
module GemName
  VERSION = "2.0.0"
end
```

## エントリーポイントでのRequire順序

```ruby
# lib/searchkick.rb

# 1. 標準ライブラリ
require "forwardable"
require "json"

# 2. 外部依存関係（最小限）
require "active_support"

# 3. require_relativeで内部ファイル
require_relative "searchkick/index"
require_relative "searchkick/model"
require_relative "searchkick/query"
require_relative "searchkick/version"

# 4. 条件付きRailsローディング（最後）
require_relative "searchkick/railtie" if defined?(Rails)
```

## Autoload vs Require

Kaneはautoloadではなく明示的な`require_relative`を使用：

```ruby
# 正しい
require_relative "gemname/model"
require_relative "gemname/query"

# 避ける
autoload :Model, "gemname/model"
autoload :Query, "gemname/query"
```

## コメントスタイル

最小限のセクションヘッダーのみ：

```ruby
# dependencies
require "active_support"

# adapters
require_relative "adapters/postgresql_adapter"

# modules
require_relative "migration"
```
