---
name: dhh-ruby-style
description: このスキルは、DHHの独特な37signalsスタイルでRubyおよびRailsコードを書く際に使用されるべきです。Rubyコード、Railsアプリケーションの作成、モデル、コントローラー、または任意のRubyファイルの作成時に適用されます。Ruby/Railsコード生成、リファクタリングリクエスト、コードレビュー、またはユーザーがDHH、37signals、Basecamp、HEY、Campfireスタイルに言及した場合にトリガーされます。RESTの純粋性、ファットモデル、薄いコントローラー、Current属性、Hotwireパターン、そして「賢さより明確さ」の哲学を体現します。
---

# DHH Ruby/Rails スタイルガイド

DHHの哲学に従ってRubyとRailsコードを書く：**賢さより明確さ**、**設定より規約**、何よりも**開発者の幸福**。

## クイックリファレンス

### コントローラーアクション
- **7つのRESTアクションのみ**: `index`、`show`、`new`、`create`、`edit`、`update`、`destroy`
- **新しい振る舞い？** カスタムアクションではなく、新しいコントローラーを作成
- **アクションの長さ**: 最大1〜5行
- **空のアクションも可**: Rails規約にレンダリングを任せる

```ruby
class MessagesController < ApplicationController
  before_action :set_message, only: %i[ show edit update destroy ]

  def index
    @messages = @room.messages.with_creator.last_page
    fresh_when @messages
  end

  def show
  end

  def create
    @message = @room.messages.create_with_attachment!(message_params)
    @message.broadcast_create
  end

  private
    def set_message
      @message = @room.messages.find(params[:id])
    end

    def message_params
      params.require(:message).permit(:body, :attachment)
    end
end
```

### プライベートメソッドのインデント
プライベートメソッドは`private`キーワードの下に1レベルインデント：

```ruby
  private
    def set_message
      @message = Message.find(params[:id])
    end

    def message_params
      params.require(:message).permit(:body)
    end
```

### モデル設計（ファットモデル）
モデルはビジネスロジック、認可、ブロードキャストを所有：

```ruby
class Message < ApplicationRecord
  belongs_to :room
  belongs_to :creator, class_name: "User"
  has_many :mentions

  scope :with_creator, -> { includes(:creator) }
  scope :page_before, ->(cursor) { where("id < ?", cursor.id).order(id: :desc).limit(50) }

  def broadcast_create
    broadcast_append_to room, :messages, target: "messages"
  end

  def mentionees
    mentions.includes(:user).map(&:user)
  end
end

class User < ApplicationRecord
  def can_administer?(message)
    message.creator == self || admin?
  end
end
```

### Current属性
リクエストコンテキストには`Current`を使用、どこでも`current_user`を渡さない：

```ruby
class Current < ActiveSupport::CurrentAttributes
  attribute :user, :session
end

# アプリ内のどこでも使用可能
Current.user.can_administer?(@message)
```

### Ruby構文の好み

```ruby
# 括弧内にスペースを入れたシンボル配列
before_action :set_message, only: %i[ show edit update destroy ]

# モダンハッシュ構文のみ
params.require(:message).permit(:body, :attachment)

# 1行ブロックには波括弧
users.each { |user| user.notify }

# シンプルな条件には三項演算子
@room.direct? ? @room.users : @message.mentionees

# フェイルファストにはバングメソッド
@message = Message.create!(params)
@message.update!(message_params)

# 述語メソッドには疑問符
@room.direct?
user.can_administer?(@message)
@messages.any?

# 式なしcaseでクリーンな条件分岐
case
when params[:before].present?
  @room.messages.page_before(params[:before])
when params[:after].present?
  @room.messages.page_after(params[:after])
else
  @room.messages.last_page
end
```

### 命名規約

| 要素 | 規約 | 例 |
|---------|------------|---------|
| セッターメソッド | `set_`プレフィックス | `set_message`、`set_room` |
| パラメータメソッド | `{model}_params` | `message_params` |
| 関連付け名 | 汎用ではなく意味的 | `user`ではなく`creator` |
| スコープ | チェイン可能、説明的 | `with_creator`、`page_before` |
| 述語 | `?`で終わる | `direct?`、`can_administer?` |

### Hotwire/Turboパターン
ブロードキャストはモデルの責任：

```ruby
# モデル内
def broadcast_create
  broadcast_append_to room, :messages, target: "messages"
end

# コントローラー内
@message.broadcast_replace_to @room, :messages,
  target: [ @message, :presentation ],
  partial: "messages/presentation",
  attributes: { maintain_scroll: true }
```

### エラーハンドリング
特定の例外をレスキュー、バングメソッドでフェイルファスト：

```ruby
def create
  @message = @room.messages.create_with_attachment!(message_params)
  @message.broadcast_create
rescue ActiveRecord::RecordNotFound
  render action: :room_not_found
end
```

### アーキテクチャの好み

| 従来型 | DHH流 |
|-------------|---------|
| PostgreSQL | SQLite（シングルテナント向け） |
| Redis + Sidekiq | Solid Queue |
| Redisキャッシュ | Solid Cache |
| Kubernetes | 単一Dockerコンテナ |
| サービスオブジェクト | ファットモデル |
| ポリシーオブジェクト（Pundit） | Userモデルでの認可 |
| FactoryBot | フィクスチャ |

## 詳細リファレンス

包括的なパターンと例については以下を参照：
- [controllers.md](./references/controllers.md) - RESTマッピング、concerns、Turboレスポンス、APIパターン
- [models.md](./references/models.md) - Concerns、状態レコード、コールバック、スコープ、PORO
- [frontend.md](./references/frontend.md) - Turbo、Stimulus、CSSアーキテクチャ、ビューパターン
- [architecture.md](./references/architecture.md) - ルーティング、認証、ジョブ、キャッシュ、マルチテナンシー、設定
- [gems.md](./references/gems.md) - 使用するものと避けるもの、その理由
- [patterns.md](./references/patterns.md) - 説明付きの完全なコードパターン
- [resources.md](./references/resources.md) - ソース資料と参考文献へのリンク

## 哲学のまとめ

1. **RESTの純粋性**: 7アクションのみ；バリエーションには新しいコントローラー
2. **ファットモデル**: 認可、ブロードキャスト、ビジネスロジックはモデルに
3. **薄いコントローラー**: 1〜5行のアクション；複雑さは抽出
4. **設定より規約**: 空のメソッド、暗黙的なレンダリング
5. **最小限の抽象化**: シンプルなケースにはサービスオブジェクトなし
6. **Current属性**: スレッドローカルなリクエストコンテキストをどこでも
7. **Hotwireファースト**: モデルレベルのブロードキャスト、Turbo Streams、Stimulus
8. **読みやすいコード**: 意味的な命名、小さなメソッド、コメント不要
9. **実用的なテスト**: ユニットテストよりシステムテスト、実際のインテグレーション
