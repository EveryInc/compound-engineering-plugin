# Gems - DHH Railsスタイル

<what_they_use>
## 37signalsが使用するもの

**コアRailsスタック：**
- turbo-rails、stimulus-rails、importmap-rails
- propshaft（アセットパイプライン）

**データベースバックドサービス（Solidスイート）：**
- solid_queue - バックグラウンドジョブ
- solid_cache - キャッシュ
- solid_cable - WebSockets/Action Cable

**認証とセキュリティ：**
- bcrypt（パスワードハッシュが必要な場合）

**自社製gem：**
- geared_pagination（カーソルベースのページネーション）
- lexxy（リッチテキストエディタ）
- mittens（メーラーユーティリティ）

**ユーティリティ：**
- rqrcode（QRコード生成）
- redcarpet + rouge（Markdownレンダリング）
- web-push（プッシュ通知）

**デプロイメントと運用：**
- kamal（Dockerデプロイメント）
- thruster（HTTP/2プロキシ）
- mission_control-jobs（ジョブモニタリング）
- autotuner（GCチューニング）
</what_they_use>

<what_they_avoid>
## 意図的に避けているもの

**認証：**
```
devise → カスタム約150行の認証
```
理由：完全な制御、マジックリンクでパスワードの責任なし、よりシンプル。

**認可：**
```
pundit/cancancan → モデルでのシンプルな役割チェック
```
理由：ほとんどのアプリはポリシーオブジェクトを必要としない。モデルのメソッドで十分：
```ruby
class Board < ApplicationRecord
  def editable_by?(user)
    user.admin? || user == creator
  end
end
```

**バックグラウンドジョブ：**
```
sidekiq → Solid Queue
```
理由：データベースバックドはRedis不要、同じトランザクション保証。

**キャッシュ：**
```
redis → Solid Cache
```
理由：データベースは既にある、シンプルなインフラストラクチャ。

**検索：**
```
elasticsearch → カスタムシャード検索
```
理由：必要なものを正確に構築、外部サービス依存なし。

**ビューレイヤー：**
```
view_component → 標準パーシャル
```
理由：パーシャルで十分機能する。ViewComponentsはユースケースに対して明確なメリットなく複雑さを追加。

**API：**
```
GraphQL → TurboでREST
```
理由：両端を制御する場合はRESTで十分。GraphQLの複雑さは正当化されない。

**ファクトリー：**
```
factory_bot → フィクスチャ
```
理由：フィクスチャはよりシンプルで高速、データの関係性を事前に考えることを促進。

**サービスオブジェクト：**
```
Interactor、Trailblazer → ファットモデル
```
理由：ビジネスロジックはモデルに置く。`CardCloser.call(card)`ではなく`card.close`のようなメソッド。

**フォームオブジェクト：**
```
Reform、dry-validation → params.expect + モデルバリデーション
```
理由：Rails 7.1の`params.expect`は十分クリーン。モデルでのコンテキストバリデーション。

**デコレーター：**
```
Draper → ビューヘルパー + パーシャル
```
理由：ヘルパーとパーシャルはよりシンプル。デコレーターの間接化なし。

**CSS：**
```
Tailwind、Sass → ネイティブCSS
```
理由：モダンCSSにはネスト、変数、レイヤーがある。ビルドステップ不要。

**フロントエンド：**
```
React、Vue、SPA → Turbo + Stimulus
```
理由：サーバーレンダリングHTMLにJSを少々。SPAの複雑さは正当化されない。

**テスト：**
```
RSpec → Minitest
```
理由：よりシンプル、起動が速い、DSLマジックが少ない、Railsに同梱。
</what_they_avoid>

<testing_philosophy>
## テスト哲学

**Minitest** - よりシンプルで高速：
```ruby
class CardTest < ActiveSupport::TestCase
  test "closing creates closure" do
    card = cards(:one)
    assert_difference -> { Card::Closure.count } do
      card.close
    end
    assert card.closed?
  end
end
```

**フィクスチャ** - 一度読み込み、決定論的：
```yaml
# test/fixtures/cards.yml
open_card:
  title: Open Card
  board: main
  creator: alice

closed_card:
  title: Closed Card
  board: main
  creator: bob
```

**動的タイムスタンプ**にはERBを使用：
```yaml
recent:
  title: Recent
  created_at: <%= 1.hour.ago %>

old:
  title: Old
  created_at: <%= 1.month.ago %>
```

**タイムトラベル**で時間依存テスト：
```ruby
test "expires after 15 minutes" do
  magic_link = MagicLink.create!(user: users(:alice))

  travel 16.minutes

  assert magic_link.expired?
end
```

**VCR**で外部API：
```ruby
VCR.use_cassette("stripe/charge") do
  charge = Stripe::Charge.create(amount: 1000)
  assert charge.paid
end
```

**テストは機能と一緒に出荷** - 同じコミット、前後ではない。
</testing_philosophy>

<decision_framework>
## 決定フレームワーク

gemを追加する前に確認：

1. **バニラRailsでできるか？**
   - ActiveRecordはSequelができることのほとんどができる
   - ActionMailerはメールを十分に処理
   - ActiveJobはほとんどのジョブニーズに対応

2. **複雑さに見合う価値があるか？**
   - カスタムコード150行 vs 10,000行のgem
   - 自分のコードはより理解しやすい
   - アップグレードの頭痛が少ない

3. **インフラストラクチャを追加するか？**
   - Redis？データベースバックドの代替を検討
   - 外部サービス？社内構築を検討
   - シンプルなインフラストラクチャ = 障害モードが少ない

4. **信頼できる人からか？**
   - 37signalsのgem：スケールで実戦テスト済み
   - メンテナンスされた、集中したgem：通常問題なし
   - キッチンシンクgem：おそらく過剰

**哲学：**
> 「gemに手を伸ばす前にソリューションを構築する。」

アンチgemではなく、プロ理解。持っている問題を本当に解決するときにgemを使う、持つかもしれない問題ではなく。
</decision_framework>

<gem_patterns>
## Gem使用パターン

**ページネーション：**
```ruby
# geared_pagination - カーソルベース
class CardsController < ApplicationController
  def index
    @cards = @board.cards.geared(page: params[:page])
  end
end
```

**Markdown：**
```ruby
# redcarpet + rouge
class MarkdownRenderer
  def self.render(text)
    Redcarpet::Markdown.new(
      Redcarpet::Render::HTML.new(filter_html: true),
      autolink: true,
      fenced_code_blocks: true
    ).render(text)
  end
end
```

**バックグラウンドジョブ：**
```ruby
# solid_queue - Redisなし
class ApplicationJob < ActiveJob::Base
  queue_as :default
  # そのまま動作、データベースバックド
end
```

**キャッシュ：**
```ruby
# solid_cache - Redisなし
# config/environments/production.rb
config.cache_store = :solid_cache_store
```
</gem_patterns>
