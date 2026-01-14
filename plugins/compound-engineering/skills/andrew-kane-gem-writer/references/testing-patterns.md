# テストパターン

## Minitestセットアップ

KaneはMinitestのみを使用—RSpecは使わない。

```ruby
# test/test_helper.rb
require "bundler/setup"
Bundler.require(:default)
require "minitest/autorun"
require "minitest/pride"

# gemをロード
require "gemname"

# テストデータベースセットアップ（必要な場合）
ActiveRecord::Base.establish_connection(
  adapter: "postgresql",
  database: "gemname_test"
)

# ベーステストクラス
class Minitest::Test
  def setup
    # 各テスト前に状態をリセット
  end
end
```

## テストファイル構造

```ruby
# test/model_test.rb
require_relative "test_helper"

class ModelTest < Minitest::Test
  def setup
    User.delete_all
  end

  def test_basic_functionality
    user = User.create!(email: "test@example.org")
    assert_equal "test@example.org", user.email
  end

  def test_with_invalid_input
    error = assert_raises(ArgumentError) do
      User.create!(email: nil)
    end
    assert_match /email/, error.message
  end

  def test_class_method
    result = User.search("test")
    assert_kind_of Array, result
  end
end
```

## マルチバージョンテスト

gemfileを使用して複数のRails/Rubyバージョンに対してテスト：

```
test/
├── test_helper.rb
└── gemfiles/
    ├── activerecord70.gemfile
    ├── activerecord71.gemfile
    └── activerecord72.gemfile
```

```ruby
# test/gemfiles/activerecord70.gemfile
source "https://rubygems.org"
gemspec path: "../../"

gem "activerecord", "~> 7.0.0"
gem "sqlite3"
```

```ruby
# test/gemfiles/activerecord72.gemfile
source "https://rubygems.org"
gemspec path: "../../"

gem "activerecord", "~> 7.2.0"
gem "sqlite3"
```

特定のgemfileで実行：

```bash
BUNDLE_GEMFILE=test/gemfiles/activerecord70.gemfile bundle install
BUNDLE_GEMFILE=test/gemfiles/activerecord70.gemfile bundle exec rake test
```

## Rakefile

```ruby
# Rakefile
require "bundler/gem_tasks"
require "rake/testtask"

Rake::TestTask.new(:test) do |t|
  t.libs << "test"
  t.pattern = "test/**/*_test.rb"
end

task default: :test
```

## GitHub Actions CI

```yaml
# .github/workflows/build.yml
name: build

on: [push, pull_request]

jobs:
  build:
    runs-on: ubuntu-latest

    strategy:
      fail-fast: false
      matrix:
        include:
          - ruby: "3.2"
            gemfile: activerecord70
          - ruby: "3.3"
            gemfile: activerecord71
          - ruby: "3.3"
            gemfile: activerecord72

    env:
      BUNDLE_GEMFILE: test/gemfiles/${{ matrix.gemfile }}.gemfile

    steps:
      - uses: actions/checkout@v4

      - uses: ruby/setup-ruby@v1
        with:
          ruby-version: ${{ matrix.ruby }}
          bundler-cache: true

      - run: bundle exec rake test
```

## データベース固有のテスト

```yaml
# .github/workflows/build.yml（サービス付き）
services:
  postgres:
    image: postgres:15
    env:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    ports:
      - 5432:5432
    options: >-
      --health-cmd pg_isready
      --health-interval 10s
      --health-timeout 5s
      --health-retries 5

env:
  DATABASE_URL: postgres://postgres:postgres@localhost/gemname_test
```

## テストデータベースセットアップ

```ruby
# test/test_helper.rb
require "active_record"

# データベースに接続
ActiveRecord::Base.establish_connection(
  ENV["DATABASE_URL"] || {
    adapter: "postgresql",
    database: "gemname_test"
  }
)

# テーブルを作成
ActiveRecord::Schema.define do
  create_table :users, force: true do |t|
    t.string :email
    t.text :encrypted_data
    t.timestamps
  end
end

# モデルを定義
class User < ActiveRecord::Base
  gemname_feature :email
end
```

## アサーションパターン

```ruby
# 基本アサーション
assert result
assert_equal expected, actual
assert_nil value
assert_empty array

# 例外テスト
assert_raises(ArgumentError) { bad_code }

error = assert_raises(GemName::Error) do
  risky_operation
end
assert_match /expected message/, error.message

# 否定
refute condition
refute_equal unexpected, actual
refute_nil value
```

## テストヘルパー

```ruby
# test/test_helper.rb
class Minitest::Test
  def with_options(options)
    original = GemName.options.dup
    GemName.options.merge!(options)
    yield
  ensure
    GemName.options = original
  end

  def assert_queries(expected_count)
    queries = []
    callback = ->(*, payload) { queries << payload[:sql] }
    ActiveSupport::Notifications.subscribe("sql.active_record", callback)
    yield
    assert_equal expected_count, queries.size, "Expected #{expected_count} queries, got #{queries.size}"
  ensure
    ActiveSupport::Notifications.unsubscribe(callback)
  end
end
```

## テストのスキップ

```ruby
def test_postgresql_specific
  skip "PostgreSQL only" unless postgresql?
  # テストコード
end

def postgresql?
  ActiveRecord::Base.connection.adapter_name =~ /postg/i
end
```
