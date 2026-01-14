# アーキテクチャ - DHH Railsスタイル

<routing>
## ルーティング

すべてがCRUDにマッピング。関連するアクションにはネストされたリソース：

```ruby
Rails.application.routes.draw do
  resources :boards do
    resources :cards do
      resource :closure
      resource :goldness
      resource :not_now
      resources :assignments
      resources :comments
    end
  end
end
```

**動詞から名詞への変換：**
| アクション | リソース |
|--------|----------|
| カードを閉じる | `card.closure` |
| ボードを監視する | `board.watching` |
| 重要としてマークする | `card.goldness` |
| カードをアーカイブする | `card.archival` |

**浅いネスト** - 深いURLを避ける：
```ruby
resources :boards do
  resources :cards, shallow: true  # /boards/:id/cards、ただし /cards/:id
end
```

**親ごとに1つの場合は単数リソース**：
```ruby
resource :closure   # resourcesではなく
resource :goldness
```

**URL生成のためのresolve：**
```ruby
# config/routes.rb
resolve("Comment") { |comment| [comment.card, anchor: dom_id(comment)] }

# これでurl_for(@comment)が正しく動作
```
</routing>

<multi_tenancy>
## マルチテナンシー（パスベース）

**ミドルウェアがURLプレフィックスからテナントを抽出**：

```ruby
# lib/tenant_extractor.rb
class TenantExtractor
  def initialize(app)
    @app = app
  end

  def call(env)
    path = env["PATH_INFO"]
    if match = path.match(%r{^/(\d+)(/.*)?$})
      env["SCRIPT_NAME"] = "/#{match[1]}"
      env["PATH_INFO"] = match[2] || "/"
    end
    @app.call(env)
  end
end
```

**テナントごとのCookieスコープ**：
```ruby
# テナントパスにスコープされたCookie
cookies.signed[:session_id] = {
  value: session.id,
  path: "/#{Current.account.id}"
}
```

**バックグラウンドジョブコンテキスト** - テナントをシリアライズ：
```ruby
class ApplicationJob < ActiveJob::Base
  around_perform do |job, block|
    Current.set(account: job.arguments.first.account) { block.call }
  end
end
```

**定期ジョブ**はすべてのテナントを反復する必要がある：
```ruby
class DailyDigestJob < ApplicationJob
  def perform
    Account.find_each do |account|
      Current.set(account: account) do
        send_digest_for(account)
      end
    end
  end
end
```

**コントローラーセキュリティ** - 常にテナント経由でスコープ：
```ruby
# 良い - ユーザーのアクセス可能なレコード経由でスコープ
@card = Current.user.accessible_cards.find(params[:id])

# 避ける - 直接ルックアップ
@card = Card.find(params[:id])
```
</multi_tenancy>

<authentication>
## 認証

カスタムのパスワードレスマジックリンク認証（合計約150行）：

```ruby
# app/models/session.rb
class Session < ApplicationRecord
  belongs_to :user

  before_create { self.token = SecureRandom.urlsafe_base64(32) }
end

# app/models/magic_link.rb
class MagicLink < ApplicationRecord
  belongs_to :user

  before_create do
    self.code = SecureRandom.random_number(100_000..999_999).to_s
    self.expires_at = 15.minutes.from_now
  end

  def expired?
    expires_at < Time.current
  end
end
```

**なぜDeviseではないか：**
- 約150行 vs 巨大な依存関係
- パスワード保存の責任なし
- ユーザーにとってよりシンプルなUX
- フローの完全な制御

**APIのためのBearerトークン**：
```ruby
module Authentication
  extend ActiveSupport::Concern

  included do
    before_action :authenticate
  end

  private
    def authenticate
      if bearer_token = request.headers["Authorization"]&.split(" ")&.last
        Current.session = Session.find_by(token: bearer_token)
      else
        Current.session = Session.find_by(id: cookies.signed[:session_id])
      end

      redirect_to login_path unless Current.session
    end
end
```
</authentication>

<background_jobs>
## バックグラウンドジョブ

ジョブはモデルメソッドを呼び出す浅いラッパー：

```ruby
class NotifyWatchersJob < ApplicationJob
  def perform(card)
    card.notify_watchers
  end
end
```

**命名規約：**
- 非同期には`_later`サフィックス：`card.notify_watchers_later`
- 即時には`_now`サフィックス：`card.notify_watchers_now`

```ruby
module Watchable
  def notify_watchers_later
    NotifyWatchersJob.perform_later(self)
  end

  def notify_watchers_now
    NotifyWatchersJob.perform_now(self)
  end

  def notify_watchers
    watchers.each do |watcher|
      WatcherMailer.notification(watcher, self).deliver_later
    end
  end
end
```

**データベースバックド** - Solid Queue使用：
- Redisが不要
- データと同じトランザクション保証
- シンプルなインフラストラクチャ

**トランザクションの安全性：**
```ruby
# config/application.rb
config.active_job.enqueue_after_transaction_commit = true
```

**タイプ別のエラーハンドリング：**
```ruby
class DeliveryJob < ApplicationJob
  # 一時的なエラー - バックオフでリトライ
  retry_on Net::OpenTimeout, Net::ReadTimeout,
           Resolv::ResolvError,
           wait: :polynomially_longer

  # 永続的なエラー - ログして破棄
  discard_on Net::SMTPSyntaxError do |job, error|
    Sentry.capture_exception(error, level: :info)
  end
end
```

**continuableでのバッチ処理：**
```ruby
class ProcessCardsJob < ApplicationJob
  include ActiveJob::Continuable

  def perform
    Card.in_batches.each_record do |card|
      checkpoint!  # 中断時にここから再開
      process(card)
    end
  end
end
```
</background_jobs>

<database_patterns>
## データベースパターン

**主キーとしてのUUID**（時間ソート可能なUUIDv7）：
```ruby
# マイグレーション
create_table :cards, id: :uuid do |t|
  t.references :board, type: :uuid, foreign_key: true
end
```

メリット：ID列挙なし、分散対応、クライアント側生成。

**レコードとしての状態**（ブール値ではなく）：
```ruby
# closed: booleanの代わりに
class Card::Closure < ApplicationRecord
  belongs_to :card
  belongs_to :creator, class_name: "User"
end

# クエリはjoinsになる
Card.joins(:closure)          # クローズ済み
Card.where.missing(:closure)  # オープン
```

**ハードデリート** - ソフトデリートなし：
```ruby
# 単にdestroy
card.destroy!

# 履歴にはイベントを使用
card.record_event(:deleted, by: Current.user)
```

クエリを簡素化し、監査にはイベントログを使用。

**パフォーマンスのためのカウンターキャッシュ：**
```ruby
class Comment < ApplicationRecord
  belongs_to :card, counter_cache: true
end

# card.comments_countがクエリなしで利用可能
```

**すべてのテーブルでのアカウントスコープ：**
```ruby
class Card < ApplicationRecord
  belongs_to :account
  default_scope { where(account: Current.account) }
end
```
</database_patterns>

<current_attributes>
## Current属性

リクエストスコープの状態には`Current`を使用：

```ruby
# app/models/current.rb
class Current < ActiveSupport::CurrentAttributes
  attribute :session, :user, :account, :request_id

  delegate :user, to: :session, allow_nil: true

  def account=(account)
    super
    Time.zone = account&.time_zone || "UTC"
  end
end
```

コントローラーで設定：
```ruby
class ApplicationController < ActionController::Base
  before_action :set_current_request

  private
    def set_current_request
      Current.session = authenticated_session
      Current.account = Account.find(params[:account_id])
      Current.request_id = request.request_id
    end
end
```

アプリ全体で使用：
```ruby
class Card < ApplicationRecord
  belongs_to :creator, default: -> { Current.user }
end
```
</current_attributes>

<caching>
## キャッシュ

**ETagを使用したHTTPキャッシュ：**
```ruby
fresh_when etag: [@card, Current.user.timezone]
```

**フラグメントキャッシュ：**
```erb
<% cache card do %>
  <%= render card %>
<% end %>
```

**ロシア人形キャッシュ：**
```erb
<% cache @board do %>
  <% @board.cards.each do |card| %>
    <% cache card do %>
      <%= render card %>
    <% end %>
  <% end %>
<% end %>
```

**`touch: true`によるキャッシュ無効化：**
```ruby
class Card < ApplicationRecord
  belongs_to :board, touch: true
end
```

**Solid Cache** - データベースバックド：
- Redisが不要
- アプリケーションデータと一貫性
- シンプルなインフラストラクチャ
</caching>

<configuration>
## 設定

**デフォルト付きのENV.fetch：**
```ruby
# config/application.rb
config.active_job.queue_adapter = ENV.fetch("QUEUE_ADAPTER", "solid_queue").to_sym
config.cache_store = ENV.fetch("CACHE_STORE", "solid_cache").to_sym
```

**複数データベース：**
```yaml
# config/database.yml
production:
  primary:
    <<: *default
  cable:
    <<: *default
    migrations_paths: db/cable_migrate
  queue:
    <<: *default
    migrations_paths: db/queue_migrate
  cache:
    <<: *default
    migrations_paths: db/cache_migrate
```

**ENV経由でSQLiteとMySQLを切り替え：**
```ruby
adapter = ENV.fetch("DATABASE_ADAPTER", "sqlite3")
```

**ENV経由で拡張可能なCSP：**
```ruby
config.content_security_policy do |policy|
  policy.default_src :self
  policy.script_src :self, *ENV.fetch("CSP_SCRIPT_SRC", "").split(",")
end
```
</configuration>

<testing>
## テスト

**Minitest**、RSpecではなく：
```ruby
class CardTest < ActiveSupport::TestCase
  test "closing a card creates a closure" do
    card = cards(:one)

    card.close

    assert card.closed?
    assert_not_nil card.closure
  end
end
```

**ファクトリーの代わりにフィクスチャ：**
```yaml
# test/fixtures/cards.yml
one:
  title: First Card
  board: main
  creator: alice

two:
  title: Second Card
  board: main
  creator: bob
```

**コントローラーの統合テスト：**
```ruby
class CardsControllerTest < ActionDispatch::IntegrationTest
  test "closing a card" do
    card = cards(:one)
    sign_in users(:alice)

    post card_closure_path(card)

    assert_response :success
    assert card.reload.closed?
  end
end
```

**テストは機能と一緒に出荷** - 同じコミット、TDDファーストではなく一緒に。

**セキュリティ修正にはリグレッションテスト** - 常に。
</testing>

<events>
## イベント追跡

イベントは信頼できる唯一の情報源：

```ruby
class Event < ApplicationRecord
  belongs_to :creator, class_name: "User"
  belongs_to :eventable, polymorphic: true

  serialize :particulars, coder: JSON
end
```

**Eventable concern：**
```ruby
module Eventable
  extend ActiveSupport::Concern

  included do
    has_many :events, as: :eventable, dependent: :destroy
  end

  def record_event(action, particulars = {})
    events.create!(
      creator: Current.user,
      action: action,
      particulars: particulars
    )
  end
end
```

**イベント駆動のWebhook** - イベントが正規のソース。
</events>

<email_patterns>
## メールパターン

**マルチテナントURLヘルパー：**
```ruby
class ApplicationMailer < ActionMailer::Base
  def default_url_options
    options = super
    if Current.account
      options[:script_name] = "/#{Current.account.id}"
    end
    options
  end
end
```

**タイムゾーン対応の配信：**
```ruby
class NotificationMailer < ApplicationMailer
  def daily_digest(user)
    Time.use_zone(user.timezone) do
      @user = user
      @digest = user.digest_for_today
      mail(to: user.email, subject: "Daily Digest")
    end
  end
end
```

**バッチ配信：**
```ruby
emails = users.map { |user| NotificationMailer.digest(user) }
ActiveJob.perform_all_later(emails.map(&:deliver_later))
```

**ワンクリック購読解除（RFC 8058）：**
```ruby
class ApplicationMailer < ActionMailer::Base
  after_action :set_unsubscribe_headers

  private
    def set_unsubscribe_headers
      headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click"
      headers["List-Unsubscribe"] = "<#{unsubscribe_url}>"
    end
end
```
</email_patterns>

<security_patterns>
## セキュリティパターン

**XSS防止** - ヘルパーでエスケープ：
```ruby
def formatted_content(text)
  # まずエスケープ、次にセーフとしてマーク
  simple_format(h(text)).html_safe
end
```

**SSRF保護：**
```ruby
# DNSを一度解決し、IPを固定
def fetch_safely(url)
  uri = URI.parse(url)
  ip = Resolv.getaddress(uri.host)

  # プライベートネットワークをブロック
  raise "Private IP" if private_ip?(ip)

  # リクエストに固定IPを使用
  Net::HTTP.start(uri.host, uri.port, ipaddr: ip) { |http| ... }
end

def private_ip?(ip)
  ip.start_with?("127.", "10.", "192.168.") ||
    ip.match?(/^172\.(1[6-9]|2[0-9]|3[0-1])\./)
end
```

**コンテンツセキュリティポリシー：**
```ruby
# config/initializers/content_security_policy.rb
Rails.application.configure do
  config.content_security_policy do |policy|
    policy.default_src :self
    policy.script_src :self
    policy.style_src :self, :unsafe_inline
    policy.base_uri :none
    policy.form_action :self
    policy.frame_ancestors :self
  end
end
```

**ActionTextサニタイズ：**
```ruby
# config/initializers/action_text.rb
Rails.application.config.after_initialize do
  ActionText::ContentHelper.allowed_tags = %w[
    strong em a ul ol li p br h1 h2 h3 h4 blockquote
  ]
end
```
</security_patterns>

<active_storage>
## Active Storageパターン

**バリアントの事前処理：**
```ruby
class User < ApplicationRecord
  has_one_attached :avatar do |attachable|
    attachable.variant :thumb, resize_to_limit: [100, 100], preprocessed: true
    attachable.variant :medium, resize_to_limit: [300, 300], preprocessed: true
  end
end
```

**ダイレクトアップロードの有効期限** - 遅い接続のために延長：
```ruby
# config/initializers/active_storage.rb
Rails.application.config.active_storage.service_urls_expire_in = 48.hours
```

**アバター最適化** - blobにリダイレクト：
```ruby
def show
  expires_in 1.year, public: true
  redirect_to @user.avatar.variant(:thumb).processed.url, allow_other_host: true
end
```

**移行のためのミラーサービス：**
```yaml
# config/storage.yml
production:
  service: Mirror
  primary: amazon
  mirrors: [google]
```
</active_storage>
