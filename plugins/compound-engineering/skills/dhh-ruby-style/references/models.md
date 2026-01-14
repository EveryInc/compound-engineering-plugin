# Models - DHH Railsスタイル

<model_concerns>
## 水平的な振る舞いのためのConcerns

モデルはconcernsを多用する。典型的なCardモデルには14以上のconcernsが含まれる：

```ruby
class Card < ApplicationRecord
  include Assignable
  include Attachments
  include Broadcastable
  include Closeable
  include Colored
  include Eventable
  include Golden
  include Mentions
  include Multistep
  include Pinnable
  include Postponable
  include Readable
  include Searchable
  include Taggable
  include Watchable
end
```

各concernは関連付け、スコープ、メソッドを含む自己完結型。

**命名：** 能力を表す形容詞（`Closeable`、`Publishable`、`Watchable`）
</model_concerns>

<state_records>
## ブール値ではなくレコードとしての状態

ブール値カラムの代わりに、個別のレコードを作成：

```ruby
# 代わりに：
closed: boolean
is_golden: boolean
postponed: boolean

# レコードを作成：
class Card::Closure < ApplicationRecord
  belongs_to :card
  belongs_to :creator, class_name: "User"
end

class Card::Goldness < ApplicationRecord
  belongs_to :card
  belongs_to :creator, class_name: "User"
end

class Card::NotNow < ApplicationRecord
  belongs_to :card
  belongs_to :creator, class_name: "User"
end
```

**メリット：**
- 自動タイムスタンプ（いつ発生したか）
- 誰が変更したかを追跡
- joinsと`where.missing`による簡単なフィルタリング
- いつ/誰がを表示するリッチUIを可能に

**モデル内で：**
```ruby
module Closeable
  extend ActiveSupport::Concern

  included do
    has_one :closure, dependent: :destroy
  end

  def closed?
    closure.present?
  end

  def close(creator: Current.user)
    create_closure!(creator: creator)
  end

  def reopen
    closure&.destroy
  end
end
```

**クエリ：**
```ruby
Card.joins(:closure)         # クローズされたカード
Card.where.missing(:closure) # オープンなカード
```
</state_records>

<callbacks>
## コールバック - 控えめに使用

Fizzyで30ファイルにわたって38のコールバック出現のみ。ガイドライン：

**使用する場合：**
- 非同期処理に`after_commit`
- 派生データに`before_save`
- 副作用に`after_create_commit`

**避ける場合：**
- 複雑なコールバックチェーン
- コールバック内のビジネスロジック
- 同期的な外部呼び出し

```ruby
class Card < ApplicationRecord
  after_create_commit :notify_watchers_later
  before_save :update_search_index, if: :title_changed?

  private
    def notify_watchers_later
      NotifyWatchersJob.perform_later(self)
    end
end
```
</callbacks>

<scopes>
## スコープ命名

標準的なスコープ名：

```ruby
class Card < ApplicationRecord
  scope :chronologically, -> { order(created_at: :asc) }
  scope :reverse_chronologically, -> { order(created_at: :desc) }
  scope :alphabetically, -> { order(title: :asc) }
  scope :latest, -> { reverse_chronologically.limit(10) }

  # 標準的なeager loading
  scope :preloaded, -> { includes(:creator, :assignees, :tags) }

  # パラメータ付き
  scope :indexed_by, ->(column) { order(column => :asc) }
  scope :sorted_by, ->(column, direction = :asc) { order(column => direction) }
end
```
</scopes>

<poros>
## プレーンオールドRubyオブジェクト

POROは親モデルの名前空間下に配置：

```ruby
# app/models/event/description.rb
class Event::Description
  def initialize(event)
    @event = event
  end

  def to_s
    # イベント説明のプレゼンテーションロジック
  end
end

# app/models/card/eventable/system_commenter.rb
class Card::Eventable::SystemCommenter
  def initialize(card)
    @card = card
  end

  def comment(message)
    # ビジネスロジック
  end
end

# app/models/user/filtering.rb
class User::Filtering
  # ビューコンテキストのバンドル
end
```

**サービスオブジェクトには使用しない。** ビジネスロジックはモデルに置く。
</poros>

<verbs_predicates>
## メソッド命名

**動詞** - 状態を変更するアクション：
```ruby
card.close
card.reopen
card.gild      # ゴールデンにする
card.ungild
board.publish
board.archive
```

**述語** - 状態から派生するクエリ：
```ruby
card.closed?    # closure.present?
card.golden?    # goldness.present?
board.published?
```

**避ける**べき汎用セッター：
```ruby
# 悪い
card.set_closed(true)
card.update_golden_status(false)

# 良い
card.close
card.ungild
```
</verbs_predicates>

<validation_philosophy>
## バリデーション哲学

モデルでのバリデーションは最小限に。フォーム/オペレーションオブジェクトでコンテキストバリデーションを使用：

```ruby
# モデル - 最小限
class User < ApplicationRecord
  validates :email, presence: true, format: { with: URI::MailTo::EMAIL_REGEXP }
end

# フォームオブジェクト - コンテキスト依存
class Signup
  include ActiveModel::Model

  attr_accessor :email, :name, :terms_accepted

  validates :email, :name, presence: true
  validates :terms_accepted, acceptance: true

  def save
    return false unless valid?
    User.create!(email: email, name: name)
  end
end
```

データ整合性のためにはモデルバリデーションよりも**データベース制約を優先**：
```ruby
# マイグレーション
add_index :users, :email, unique: true
add_foreign_key :cards, :boards
```
</validation_philosophy>

<error_handling>
## クラッシュさせる哲学

失敗時に例外を発生させるバングメソッドを使用：

```ruby
# 推奨 - 失敗時に例外
@card = Card.create!(card_params)
@card.update!(title: new_title)
@comment.destroy!

# 避ける - サイレント失敗
@card = Card.create(card_params)  # 失敗時にfalseを返す
if @card.save
  # ...
end
```

エラーは自然に伝播させる。RailsはActiveRecord::RecordInvalidを422レスポンスで処理。
</error_handling>

<default_values>
## ラムダでのデフォルト値

Currentを使用する関連付けにはラムダデフォルトを使用：

```ruby
class Card < ApplicationRecord
  belongs_to :creator, class_name: "User", default: -> { Current.user }
  belongs_to :account, default: -> { Current.account }
end

class Comment < ApplicationRecord
  belongs_to :commenter, class_name: "User", default: -> { Current.user }
end
```

ラムダは作成時の動的解決を保証。
</default_values>

<rails_71_patterns>
## Rails 7.1以降のモデルパターン

**Normalizes** - バリデーション前にデータをクリーン：
```ruby
class User < ApplicationRecord
  normalizes :email, with: ->(email) { email.strip.downcase }
  normalizes :phone, with: ->(phone) { phone.gsub(/\D/, "") }
end
```

**Delegated Types** - ポリモーフィック関連付けを置き換え：
```ruby
class Message < ApplicationRecord
  delegated_type :messageable, types: %w[Comment Reply Announcement]
end

# これで取得できる：
message.comment?        # Commentならtrue
message.comment         # Commentを返す
Message.comments        # Commentメッセージのスコープ
```

**Store Accessor** - 構造化JSONストレージ：
```ruby
class User < ApplicationRecord
  store :settings, accessors: [:theme, :notifications_enabled], coder: JSON
end

user.theme = "dark"
user.notifications_enabled = true
```
</rails_71_patterns>

<concern_guidelines>
## Concernガイドライン

- concernあたり**50〜150行**（ほとんどは約100行）
- **一貫性** - 関連する機能のみ
- **能力で命名** - `Closeable`、`Watchable`、`CardHelpers`ではない
- **自己完結型** - 関連付け、スコープ、メソッドを一緒に
- **単なる整理のためではない** - 本当の再利用が必要な場合に作成

**キャッシュ無効化のためのタッチチェーン：**
```ruby
class Comment < ApplicationRecord
  belongs_to :card, touch: true
end

class Card < ApplicationRecord
  belongs_to :board, touch: true
end
```

コメントが更新されると、cardの`updated_at`が変更され、boardにカスケード。

**関連する更新のためのトランザクションラッピング：**
```ruby
class Card < ApplicationRecord
  def close(creator: Current.user)
    transaction do
      create_closure!(creator: creator)
      record_event(:closed)
      notify_watchers_later
    end
  end
end
```
</concern_guidelines>
