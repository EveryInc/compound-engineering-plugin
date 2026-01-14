# コントローラー - DHH Railsスタイル

<rest_mapping>
## すべてがCRUDにマッピング

カスタムアクションは新しいリソースになる。既存のリソースへの動詞ではなく、名詞リソースを作成：

```ruby
# これの代わりに：
POST /cards/:id/close
DELETE /cards/:id/close
POST /cards/:id/archive

# こうする：
POST /cards/:id/closure      # closureを作成
DELETE /cards/:id/closure    # closureを削除
POST /cards/:id/archival     # archivalを作成
```

**37signalsの実例：**
```ruby
resources :cards do
  resource :closure       # クローズ/再開
  resource :goldness      # 重要としてマーク
  resource :not_now       # 延期
  resources :assignments  # 担当者管理
end
```

各リソースは標準CRUDアクションを持つ独自のコントローラーを取得。
</rest_mapping>

<controller_concerns>
## 共有動作のためのConcern

コントローラーはconcernsを広範に使用。一般的なパターン：

**CardScoped** - @card、@boardを読み込み、render_card_replacementを提供
```ruby
module CardScoped
  extend ActiveSupport::Concern

  included do
    before_action :set_card
  end

  private
    def set_card
      @card = Card.find(params[:card_id])
      @board = @card.board
    end

    def render_card_replacement
      render turbo_stream: turbo_stream.replace(@card)
    end
end
```

**BoardScoped** - @boardを読み込み
**CurrentRequest** - リクエストデータでCurrentを設定
**CurrentTimezone** - ユーザーのタイムゾーンでリクエストをラップ
**FilterScoped** - 複雑なフィルタリングを処理
**TurboFlash** - Turbo Stream経由のフラッシュメッセージ
**ViewTransitions** - ページリフレッシュ時に無効化
**BlockSearchEngineIndexing** - X-Robots-Tagヘッダーを設定
**RequestForgeryProtection** - Sec-Fetch-Site CSRF（モダンブラウザ）
</controller_concerns>

<authorization_patterns>
## 認可パターン

コントローラーはbefore_action経由で権限をチェック、モデルは権限の意味を定義：

```ruby
# コントローラーconcern
module Authorization
  extend ActiveSupport::Concern

  private
    def ensure_can_administer
      head :forbidden unless Current.user.admin?
    end

    def ensure_is_staff_member
      head :forbidden unless Current.user.staff?
    end
end

# 使用法
class BoardsController < ApplicationController
  before_action :ensure_can_administer, only: [:destroy]
end
```

**モデルレベルの認可：**
```ruby
class Board < ApplicationRecord
  def editable_by?(user)
    user.admin? || user == creator
  end

  def publishable_by?(user)
    editable_by?(user) && !published?
  end
end
```

認可はシンプル、読みやすく、ドメインと共存させる。
</authorization_patterns>

<security_concerns>
## セキュリティConcern

**Sec-Fetch-Site CSRF保護：**
モダンブラウザはSec-Fetch-Siteヘッダーを送信。深層防御に使用：

```ruby
module RequestForgeryProtection
  extend ActiveSupport::Concern

  included do
    before_action :verify_request_origin
  end

  private
    def verify_request_origin
      return if request.get? || request.head?
      return if %w[same-origin same-site].include?(
        request.headers["Sec-Fetch-Site"]&.downcase
      )
      # 古いブラウザにはトークン検証にフォールバック
      verify_authenticity_token
    end
end
```

**レート制限（Rails 8以降）：**
```ruby
class MagicLinksController < ApplicationController
  rate_limit to: 10, within: 15.minutes, only: :create
end
```

適用先：認証エンドポイント、メール送信、外部API呼び出し、リソース作成。
</security_concerns>

<request_context>
## リクエストコンテキストConcern

**CurrentRequest** - HTTPメタデータでCurrentを設定：
```ruby
module CurrentRequest
  extend ActiveSupport::Concern

  included do
    before_action :set_current_request
  end

  private
    def set_current_request
      Current.request_id = request.request_id
      Current.user_agent = request.user_agent
      Current.ip_address = request.remote_ip
      Current.referrer = request.referrer
    end
end
```

**CurrentTimezone** - ユーザーのタイムゾーンでリクエストをラップ：
```ruby
module CurrentTimezone
  extend ActiveSupport::Concern

  included do
    around_action :set_timezone
    helper_method :timezone_from_cookie
  end

  private
    def set_timezone
      Time.use_zone(timezone_from_cookie) { yield }
    end

    def timezone_from_cookie
      cookies[:timezone] || "UTC"
    end
end
```

**SetPlatform** - モバイル/デスクトップを検出：
```ruby
module SetPlatform
  extend ActiveSupport::Concern

  included do
    helper_method :platform
  end

  def platform
    @platform ||= request.user_agent&.match?(/Mobile|Android/) ? :mobile : :desktop
  end
end
```
</request_context>

<turbo_responses>
## Turbo Streamレスポンス

部分更新にはTurbo Streamsを使用：

```ruby
class Cards::ClosuresController < ApplicationController
  include CardScoped

  def create
    @card.close
    render_card_replacement
  end

  def destroy
    @card.reopen
    render_card_replacement
  end
end
```

複雑な更新にはモーフィングを使用：
```ruby
render turbo_stream: turbo_stream.morph(@card)
```
</turbo_responses>

<api_patterns>
## API設計

同じコントローラー、異なるフォーマット。レスポンスの規約：

```ruby
def create
  @card = Card.create!(card_params)

  respond_to do |format|
    format.html { redirect_to @card }
    format.json { head :created, location: @card }
  end
end

def update
  @card.update!(card_params)

  respond_to do |format|
    format.html { redirect_to @card }
    format.json { head :no_content }
  end
end

def destroy
  @card.destroy

  respond_to do |format|
    format.html { redirect_to cards_path }
    format.json { head :no_content }
  end
end
```

**ステータスコード：**
- Create：201 Created + Locationヘッダー
- Update：204 No Content
- Delete：204 No Content
- Bearerトークン認証
</api_patterns>

<http_caching>
## HTTPキャッシュ

ETagと条件付きGETを広範に使用：

```ruby
class CardsController < ApplicationController
  def show
    @card = Card.find(params[:id])
    fresh_when etag: [@card, Current.user.timezone]
  end

  def index
    @cards = @board.cards.preloaded
    fresh_when etag: [@cards, @board.updated_at]
  end
end
```

重要な洞察：時間はユーザーのタイムゾーンでサーバー側レンダリングされるため、他のタイムゾーンに間違った時間を提供しないようにタイムゾーンがETagに影響する必要がある。

**ApplicationControllerのグローバルetag：**
```ruby
class ApplicationController < ActionController::Base
  etag { "v1" }  # すべてのキャッシュを無効化するために上げる
end
```

キャッシュ無効化には関連付けで`touch: true`を使用。
</http_caching>
