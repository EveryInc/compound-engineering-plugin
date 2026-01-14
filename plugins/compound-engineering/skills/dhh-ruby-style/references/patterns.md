# DHH Ruby/Rails パターンリファレンス

37signalsのCampfireコードベースとDHHの公開教材から抽出した包括的なコードパターン。

## コントローラーパターン

### REST純粋主義のコントローラー設計

DHHのコントローラー哲学はRESTに対して「原理主義的」。すべてのコントローラーは7つの標準アクションのみを持つリソースにマッピング。

```ruby
# ✅ 正しい：標準RESTアクションのみ
class MessagesController < ApplicationController
  def index; end
  def show; end
  def new; end
  def create; end
  def edit; end
  def update; end
  def destroy; end
end

# ❌ 間違い：カスタムアクション
class MessagesController < ApplicationController
  def archive    # NG
  def unarchive  # NG
  def search     # NG
  def drafts     # NG
end

# ✅ 正しい：カスタム動作には新しいコントローラー
class Messages::ArchivesController < ApplicationController
  def create  # メッセージをアーカイブ
  def destroy # アーカイブを解除
end

class Messages::DraftsController < ApplicationController
  def index   # 下書きを一覧表示
end

class Messages::SearchesController < ApplicationController
  def show    # 検索結果を表示
end
```

### 共有動作のためのコントローラーConcern

```ruby
# app/controllers/concerns/room_scoped.rb
module RoomScoped
  extend ActiveSupport::Concern

  included do
    before_action :set_room
  end

  private
    def set_room
      @room = Current.user.rooms.find(params[:room_id])
    end
end

# 使用法
class MessagesController < ApplicationController
  include RoomScoped
end
```

### 完全なコントローラー例

```ruby
class MessagesController < ApplicationController
  include ActiveStorage::SetCurrent, RoomScoped

  before_action :set_room, except: :create
  before_action :set_message, only: %i[ show edit update destroy ]
  before_action :ensure_can_administer, only: %i[ edit update destroy ]

  layout false, only: :index

  def index
    @messages = find_paged_messages
    if @messages.any?
      fresh_when @messages
    else
      head :no_content
    end
  end

  def create
    set_room
    @message = @room.messages.create_with_attachment!(message_params)
    @message.broadcast_create
    deliver_webhooks_to_bots
  rescue ActiveRecord::RecordNotFound
    render action: :room_not_found
  end

  def show
  end

  def edit
  end

  def update
    @message.update!(message_params)
    @message.broadcast_replace_to @room, :messages,
      target: [ @message, :presentation ],
      partial: "messages/presentation",
      attributes: { maintain_scroll: true }
    redirect_to room_message_url(@room, @message)
  end

  def destroy
    @message.destroy
    @message.broadcast_remove_to @room, :messages
  end

  private
    def set_message
      @message = @room.messages.find(params[:id])
    end

    def ensure_can_administer
      head :forbidden unless Current.user.can_administer?(@message)
    end

    def find_paged_messages
      case
      when params[:before].present?
        @room.messages.with_creator.page_before(@room.messages.find(params[:before]))
      when params[:after].present?
        @room.messages.with_creator.page_after(@room.messages.find(params[:after]))
      else
        @room.messages.with_creator.last_page
      end
    end

    def message_params
      params.require(:message).permit(:body, :attachment, :client_message_id)
    end

    def deliver_webhooks_to_bots
      bots_eligible_for_webhook.excluding(@message.creator).each { |bot| bot.deliver_webhook_later(@message) }
    end

    def bots_eligible_for_webhook
      @room.direct? ? @room.users.active_bots : @message.mentionees.active_bots
    end
end
```

## モデルパターン

### 意味的な関連付け命名

```ruby
class Message < ApplicationRecord
  # ✅ ドメイン概念を表現する意味的な名前
  belongs_to :creator, class_name: "User"
  belongs_to :room
  has_many :mentions
  has_many :mentionees, through: :mentions, source: :user

  # ❌ 汎用的な名前
  belongs_to :user  # 汎用的すぎる - creatorの方が明確
end

class Room < ApplicationRecord
  has_many :memberships
  has_many :users, through: :memberships
  has_many :messages, dependent: :destroy

  # 意味的なスコープ
  scope :direct, -> { where(direct: true) }

  def direct?
    direct
  end
end
```

### スコープ設計

```ruby
class Message < ApplicationRecord
  # Eager loadingスコープ
  scope :with_creator, -> { includes(:creator) }
  scope :with_attachments, -> { includes(attachment_attachment: :blob) }

  # カーソルベースのページネーションスコープ
  scope :page_before, ->(cursor) {
    where("id < ?", cursor.id).order(id: :desc).limit(50)
  }
  scope :page_after, ->(cursor) {
    where("id > ?", cursor.id).order(id: :asc).limit(50)
  }
  scope :last_page, -> { order(id: :desc).limit(50) }

  # チェイン可能なラムダとしてのステータススコープ
  scope :recent, -> { where("created_at > ?", 24.hours.ago) }
  scope :pinned, -> { where(pinned: true) }
end
```

### カスタム作成メソッド

```ruby
class Message < ApplicationRecord
  def self.create_with_attachment!(params)
    transaction do
      message = create!(params.except(:attachment))
      message.attach_file(params[:attachment]) if params[:attachment].present?
      message
    end
  end

  def attach_file(attachment)
    file.attach(attachment)
    update!(has_attachment: true)
  end
end
```

### モデルでの認可

```ruby
class User < ApplicationRecord
  def can_administer?(message)
    message.creator == self || admin?
  end

  def can_access?(room)
    rooms.include?(room) || admin?
  end

  def can_invite_to?(room)
    room.creator == self || admin?
  end
end

# コントローラーでの使用
def ensure_can_administer
  head :forbidden unless Current.user.can_administer?(@message)
end
```

### モデルのブロードキャスト

```ruby
class Message < ApplicationRecord
  after_create_commit :broadcast_create
  after_update_commit :broadcast_update
  after_destroy_commit :broadcast_destroy

  def broadcast_create
    broadcast_append_to room, :messages,
      target: "messages",
      partial: "messages/message"
  end

  def broadcast_update
    broadcast_replace_to room, :messages,
      target: dom_id(self, :presentation),
      partial: "messages/presentation"
  end

  def broadcast_destroy
    broadcast_remove_to room, :messages
  end
end
```

## Current属性パターン

### 定義

```ruby
# app/models/current.rb
class Current < ActiveSupport::CurrentAttributes
  attribute :user
  attribute :session
  attribute :request_id
  attribute :user_agent

  resets { Time.zone = nil }

  def user=(user)
    super
    Time.zone = user&.time_zone
  end
end
```

### コントローラーでの設定

```ruby
class ApplicationController < ActionController::Base
  before_action :set_current_attributes

  private
    def set_current_attributes
      Current.user = authenticate_user
      Current.session = session
      Current.request_id = request.request_id
      Current.user_agent = request.user_agent
    end
end
```

### アプリ全体での使用

```ruby
# モデル内
class Message < ApplicationRecord
  before_create :set_creator

  private
    def set_creator
      self.creator ||= Current.user
    end
end

# ビュー内
<%= Current.user.name %>

# ジョブ内
class NotificationJob < ApplicationJob
  def perform(message)
    # Currentはジョブ内でリセットされる - 必要なものを渡す
    message.room.users.each { |user| notify(user, message) }
  end
end
```

## Rubyイディオム

### ネストした条件よりガード節

```ruby
# ✅ ガード節
def process_message
  return unless message.valid?
  return if message.spam?
  return unless Current.user.can_access?(message.room)

  message.deliver
end

# ❌ ネストした条件
def process_message
  if message.valid?
    unless message.spam?
      if Current.user.can_access?(message.room)
        message.deliver
      end
    end
  end
end
```

### 式なしcase文

```ruby
# ✅ 式なしのクリーンなcase
def status_class
  case
  when urgent? then "bg-red"
  when pending? then "bg-yellow"
  when completed? then "bg-green"
  else "bg-gray"
  end
end

# ルーティング/ディスパッチロジック用
def find_paged_messages
  case
  when params[:before].present?
    messages.page_before(params[:before])
  when params[:after].present?
    messages.page_after(params[:after])
  else
    messages.last_page
  end
end
```

### メソッドチェイン

```ruby
# ✅ 流暢でチェイン可能なAPI
@room.messages
     .with_creator
     .with_attachments
     .excluding(@message.creator)
     .page_before(cursor)

# コレクションに対して
bots_eligible_for_webhook
  .excluding(@message.creator)
  .each { |bot| bot.deliver_webhook_later(@message) }
```

### 暗黙的なreturn

```ruby
# ✅ 暗黙的なreturn - Rubyの流儀
def full_name
  "#{first_name} #{last_name}"
end

def can_administer?(message)
  message.creator == self || admin?
end

# ❌ 明示的なreturn（早期終了の場合のみ必要）
def full_name
  return "#{first_name} #{last_name}"  # 不要
end
```

## ビューパターン

### 複雑なHTMLのためのヘルパーメソッド

```ruby
# app/helpers/messages_helper.rb
module MessagesHelper
  def message_container(message, &block)
    tag.div(
      id: dom_id(message),
      class: message_classes(message),
      data: {
        controller: "message",
        message_id_value: message.id,
        action: "click->message#select"
      },
      &block
    )
  end

  private
    def message_classes(message)
      classes = ["message"]
      classes << "message--mine" if message.creator == Current.user
      classes << "message--highlighted" if message.highlighted?
      classes.join(" ")
    end
end
```

### Turbo Frameパターン

```erb
<%# app/views/messages/index.html.erb %>
<%= turbo_frame_tag "messages", data: { turbo_action: "advance" } do %>
  <%= render @messages %>

  <% if @messages.any? %>
    <%= link_to "Load more",
          room_messages_path(@room, before: @messages.last.id),
          data: { turbo_frame: "messages" } %>
  <% end %>
<% end %>
```

### Stimulusコントローラー統合

```erb
<div data-controller="message-form"
     data-message-form-submit-url-value="<%= room_messages_path(@room) %>">
  <%= form_with model: [@room, Message.new],
        data: { action: "submit->message-form#submit" } do |f| %>
    <%= f.text_area :body,
          data: { action: "keydown.enter->message-form#submitOnEnter" } %>
    <%= f.submit "Send" %>
  <% end %>
</div>
```

## テストパターン

### システムテストを最優先

```ruby
# test/system/messages_test.rb
class MessagesTest < ApplicationSystemTestCase
  test "sending a message" do
    sign_in users(:david)
    visit room_path(rooms(:watercooler))

    fill_in "Message", with: "Hello, world!"
    click_button "Send"

    assert_text "Hello, world!"
  end

  test "editing own message" do
    sign_in users(:david)
    visit room_path(rooms(:watercooler))

    within "#message_#{messages(:greeting).id}" do
      click_on "Edit"
    end

    fill_in "Message", with: "Updated message"
    click_button "Save"

    assert_text "Updated message"
  end
end
```

### ファクトリーよりフィクスチャ

```yaml
# test/fixtures/users.yml
david:
  name: David
  email: david@example.com
  admin: true

jason:
  name: Jason
  email: jason@example.com
  admin: false

# test/fixtures/rooms.yml
watercooler:
  name: Water Cooler
  creator: david
  direct: false

# test/fixtures/messages.yml
greeting:
  body: Hello everyone!
  room: watercooler
  creator: david
```

### APIの統合テスト

```ruby
# test/integration/messages_api_test.rb
class MessagesApiTest < ActionDispatch::IntegrationTest
  test "creating a message via API" do
    post room_messages_url(rooms(:watercooler)),
      params: { message: { body: "API message" } },
      headers: auth_headers(users(:david))

    assert_response :success
    assert Message.exists?(body: "API message")
  end
end
```

## 設定パターン

### Solid Queueセットアップ

```ruby
# config/queue.yml
default: &default
  dispatchers:
    - polling_interval: 1
      batch_size: 500
  workers:
    - queues: "*"
      threads: 5
      processes: 1
      polling_interval: 0.1

development:
  <<: *default

production:
  <<: *default
  workers:
    - queues: "*"
      threads: 10
      processes: 2
```

### SQLite用データベース設定

```ruby
# config/database.yml
default: &default
  adapter: sqlite3
  pool: <%= ENV.fetch("RAILS_MAX_THREADS") { 5 } %>
  timeout: 5000

development:
  <<: *default
  database: storage/development.sqlite3

production:
  <<: *default
  database: storage/production.sqlite3
```

### 単一コンテナデプロイメント

```dockerfile
# Dockerfile
FROM ruby:3.3

RUN apt-get update && apt-get install -y \
    libsqlite3-dev \
    libvips \
    ffmpeg

WORKDIR /rails
COPY . .
RUN bundle install
RUN rails assets:precompile

EXPOSE 80 443
CMD ["./bin/rails", "server", "-b", "0.0.0.0"]
```

## 開発哲学

### 出荷、検証、改善

```ruby
# 1. プロトタイプ品質のコードをマージして実際の使用をテスト
# 2. 実際のフィードバックに基づいて反復
# 3. 機能するものを磨き、機能しないものを削除
```

DHHは本番環境で検証するために機能を早期にマージする。誰も使わない完璧なコードは、フィードバックを得る粗いコードよりも悪い。

### 根本原因を修正

```ruby
# ✅ 根本でレース条件を防ぐ
config.active_job.enqueue_after_transaction_commit = true

# ❌ リトライによる絆創膏的修正
retry_on ActiveRecord::RecordNotFound, wait: 1.second
```

症状ではなく根本的な問題に対処する。

### 抽象化よりバニラRails

```ruby
# ✅ 直接ActiveRecord
@card.comments.create!(comment_params)

# ❌ サービスレイヤーの間接化
CreateCommentService.call(@card, comment_params)
```

Rails規約を使用する。本当の痛みが現れてから抽象化する。

## Rails 7.1以降のイディオム

### params.expect（PR #120）

```ruby
# ✅ Rails 7.1+スタイル
def card_params
  params.expect(card: [:title, :description, tags: []])
end

# 構造が無効な場合は400 Bad Requestを返す

# 旧スタイル
def card_params
  params.require(:card).permit(:title, :description, tags: [])
end
```

### StringInquirer（PR #425）

```ruby
# ✅ 読みやすい述語
event.action.inquiry.completed?
event.action.inquiry.pending?

# 使用法
case
when event.action.inquiry.completed?
  send_notification
when event.action.inquiry.failed?
  send_alert
end

# 旧スタイル
event.action == "completed"
```

### 肯定的な命名

```ruby
# ✅ 肯定的な名前
scope :active, -> { where(active: true) }
scope :visible, -> { where(visible: true) }
scope :published, -> { where.not(published_at: nil) }

# ❌ 否定的な名前
scope :not_deleted, -> { ... }  # :activeを使用
scope :non_hidden, -> { ... }   # :visibleを使用
scope :is_not_draft, -> { ... } # :publishedを使用
```

## 抽出ガイドライン

### 3回のルール

```ruby
# 1回目：インラインでそのまま実行
def process
  # インラインロジック
end

# 2回目：まだインライン、重複をメモ
def process_again
  # 同じロジック
end

# 3回目：今度は抽出
module Processing
  def shared_logic
    # 抽出済み
  end
end
```

本当の痛みが出るまで抽出を待つ。

### コントローラーから始めて、複雑になったら抽出

```ruby
# フェーズ1：コントローラー内のロジック
def index
  @cards = @board.cards.where(status: params[:status])
end

# フェーズ2：モデルスコープに移動
def index
  @cards = @board.cards.by_status(params[:status])
end

# フェーズ3：再利用される場合はconcernを抽出
def index
  @cards = @board.cards.filtered(params)
end
```

## 避けるべきアンチパターン

### シンプルなケースにサービスオブジェクトを追加しない

```ruby
# ❌ 過剰な抽象化
class MessageCreationService
  def initialize(room, params, user)
    @room = room
    @params = params
    @user = user
  end

  def call
    message = @room.messages.build(@params)
    message.creator = @user
    message.save!
    BroadcastService.new(message).call
    message
  end
end

# ✅ モデルに保持
class Message < ApplicationRecord
  def self.create_with_broadcast!(params)
    create!(params).tap(&:broadcast_create)
  end
end
```

### シンプルな認可にポリシーオブジェクトを使わない

```ruby
# ❌ 別のポリシークラス
class MessagePolicy
  def initialize(user, message)
    @user = user
    @message = message
  end

  def update?
    @message.creator == @user || @user.admin?
  end
end

# ✅ Userモデルのメソッド
class User < ApplicationRecord
  def can_administer?(message)
    message.creator == self || admin?
  end
end
```

### 何でもモックしない

```ruby
# ❌ 過度にモック化されたテスト
test "sending message" do
  room = mock("room")
  user = mock("user")
  message = mock("message")

  room.expects(:messages).returns(stub(create!: message))
  message.expects(:broadcast_create)

  MessagesController.new.create
end

# ✅ 本物をテスト
test "sending message" do
  sign_in users(:david)
  post room_messages_url(rooms(:watercooler)),
    params: { message: { body: "Hello" } }

  assert_response :success
  assert Message.exists?(body: "Hello")
end
```
