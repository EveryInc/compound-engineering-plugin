# フロントエンド - DHH Railsスタイル

<turbo_patterns>
## Turboパターン

**Turbo Streams**で部分更新：
```erb
<%# app/views/cards/closures/create.turbo_stream.erb %>
<%= turbo_stream.replace @card %>
```

**モーフィング**で複雑な更新：
```ruby
render turbo_stream: turbo_stream.morph(@card)
```

**グローバルモーフィング** - レイアウトで有効化：
```ruby
turbo_refreshes_with method: :morph, scroll: :preserve
```

**フラグメントキャッシュ**で`cached: true`：
```erb
<%= render partial: "card", collection: @cards, cached: true %>
```

**ViewComponentsは使わない** - 標準パーシャルで十分。
</turbo_patterns>

<turbo_morphing>
## Turboモーフィングのベストプラクティス

**morphイベントをリッスン**してクライアント状態を復元：
```javascript
document.addEventListener("turbo:morph-element", (event) => {
  // morph後にクライアント側の状態を復元
})
```

**永続要素** - data属性でモーフィングをスキップ：
```erb
<div data-turbo-permanent id="notification-count">
  <%= @count %>
</div>
```

**フレームモーフィング** - refresh属性を追加：
```erb
<%= turbo_frame_tag :assignment, src: path, refresh: :morph %>
```

**一般的な問題と解決策：**

| 問題 | 解決策 |
|---------|----------|
| タイマーが更新されない | morphイベントリスナーでクリア/再開 |
| フォームがリセットされる | フォームセクションをturbo framesでラップ |
| ページネーションが壊れる | `refresh: :morph`付きturbo framesを使用 |
| replaceでちらつき | replaceの代わりにmorphに切り替え |
| localStorageの喪失 | `turbo:morph-element`をリッスンして状態を復元 |
</turbo_morphing>

<turbo_frames>
## Turbo Frames

**遅延読み込み**とスピナー：
```erb
<%= turbo_frame_tag "menu",
      src: menu_path,
      loading: :lazy do %>
  <div class="spinner">Loading...</div>
<% end %>
```

**インライン編集**で編集/表示切り替え：
```erb
<%= turbo_frame_tag dom_id(card, :edit) do %>
  <%= link_to "Edit", edit_card_path(card),
        data: { turbo_frame: dom_id(card, :edit) } %>
<% end %>
```

**親フレームをターゲット**にハードコーディングなしで：
```erb
<%= form_with model: @card, data: { turbo_frame: "_parent" } do |f| %>
```

**リアルタイムサブスクリプション：**
```erb
<%= turbo_stream_from @card %>
<%= turbo_stream_from @card, :activity %>
```
</turbo_frames>

<stimulus_controllers>
## Stimulusコントローラー

Fizzyで52のコントローラー、62%が再利用可能、38%がドメイン固有。

**特徴：**
- コントローラーごとに単一責任
- values/classes経由で設定
- 通信にはイベント
- #でプライベートメソッド
- ほとんどが50行未満

**例：**

```javascript
// copy-to-clipboard（25行）
import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static values = { content: String }

  copy() {
    navigator.clipboard.writeText(this.contentValue)
    this.#showFeedback()
  }

  #showFeedback() {
    this.element.classList.add("copied")
    setTimeout(() => this.element.classList.remove("copied"), 1500)
  }
}
```

```javascript
// auto-click（7行）
import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  connect() {
    this.element.click()
  }
}
```

```javascript
// toggle-class（31行）
import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static classes = ["toggle"]
  static values = { open: { type: Boolean, default: false } }

  toggle() {
    this.openValue = !this.openValue
  }

  openValueChanged() {
    this.element.classList.toggle(this.toggleClass, this.openValue)
  }
}
```

```javascript
// auto-submit（28行）- デバウンスされたフォーム送信
import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static values = { delay: { type: Number, default: 300 } }

  connect() {
    this.timeout = null
  }

  submit() {
    clearTimeout(this.timeout)
    this.timeout = setTimeout(() => {
      this.element.requestSubmit()
    }, this.delayValue)
  }

  disconnect() {
    clearTimeout(this.timeout)
  }
}
```

```javascript
// dialog（45行）- ネイティブHTMLダイアログ管理
import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  open() {
    this.element.showModal()
  }

  close() {
    this.element.close()
    this.dispatch("closed")
  }

  clickOutside(event) {
    if (event.target === this.element) this.close()
  }
}
```

```javascript
// local-time（40行）- 相対時間表示
import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static values = { datetime: String }

  connect() {
    this.#updateTime()
  }

  #updateTime() {
    const date = new Date(this.datetimeValue)
    const now = new Date()
    const diffMinutes = Math.floor((now - date) / 60000)

    if (diffMinutes < 60) {
      this.element.textContent = `${diffMinutes}m ago`
    } else if (diffMinutes < 1440) {
      this.element.textContent = `${Math.floor(diffMinutes / 60)}h ago`
    } else {
      this.element.textContent = `${Math.floor(diffMinutes / 1440)}d ago`
    }
  }
}
```
</stimulus_controllers>

<stimulus_best_practices>
## Stimulusベストプラクティス

**Values API**をgetAttributeの代わりに：
```javascript
// 良い
static values = { delay: { type: Number, default: 300 } }

// 避ける
this.element.getAttribute("data-delay")
```

**disconnectでクリーンアップ：**
```javascript
disconnect() {
  clearTimeout(this.timeout)
  this.observer?.disconnect()
  document.removeEventListener("keydown", this.boundHandler)
}
```

**アクションフィルター** - `:self`でバブリングを防止：
```erb
<div data-action="click->menu#toggle:self">
```

**ヘルパー抽出** - 共有ユーティリティを別モジュールに：
```javascript
// app/javascript/helpers/timing.js
export function debounce(fn, delay) {
  let timeout
  return (...args) => {
    clearTimeout(timeout)
    timeout = setTimeout(() => fn(...args), delay)
  }
}
```

**イベントディスパッチ**で疎結合：
```javascript
this.dispatch("selected", { detail: { id: this.idValue } })
```
</stimulus_best_practices>

<view_helpers>
## ビューヘルパー（Stimulus統合）

**ダイアログヘルパー：**
```ruby
def dialog_tag(id, &block)
  tag.dialog(
    id: id,
    data: {
      controller: "dialog",
      action: "click->dialog#clickOutside keydown.esc->dialog#close"
    },
    &block
  )
end
```

**自動送信フォームヘルパー：**
```ruby
def auto_submit_form_with(model:, delay: 300, **options, &block)
  form_with(
    model: model,
    data: {
      controller: "auto-submit",
      auto_submit_delay_value: delay,
      action: "input->auto-submit#submit"
    },
    **options,
    &block
  )
end
```

**コピーボタンヘルパー：**
```ruby
def copy_button(content:, label: "Copy")
  tag.button(
    label,
    data: {
      controller: "copy",
      copy_content_value: content,
      action: "click->copy#copy"
    }
  )
end
```
</view_helpers>

<css_architecture>
## CSSアーキテクチャ

モダン機能を使用したバニラCSS、プリプロセッサなし。

**CSS @layer**でカスケード制御：
```css
@layer reset, base, components, modules, utilities;

@layer reset {
  *, *::before, *::after { box-sizing: border-box; }
}

@layer base {
  body { font-family: var(--font-sans); }
}

@layer components {
  .btn { /* ボタンスタイル */ }
}

@layer modules {
  .card { /* カードモジュールスタイル */ }
}

@layer utilities {
  .hidden { display: none; }
}
```

**OKLCHカラーシステム**で知覚的均一性：
```css
:root {
  --color-primary: oklch(60% 0.15 250);
  --color-success: oklch(65% 0.2 145);
  --color-warning: oklch(75% 0.15 85);
  --color-danger: oklch(55% 0.2 25);
}
```

**ダークモード**をCSS変数で：
```css
:root {
  --bg: oklch(98% 0 0);
  --text: oklch(20% 0 0);
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: oklch(15% 0 0);
    --text: oklch(90% 0 0);
  }
}
```

**ネイティブCSSネスト：**
```css
.card {
  padding: var(--space-4);

  & .title {
    font-weight: bold;
  }

  &:hover {
    background: var(--bg-hover);
  }
}
```

**約60の最小限のユーティリティ** vs Tailwindの数百。

**使用するモダン機能：**
- エンターアニメーション用`@starting-style`
- カラー操作用`color-mix()`
- 親選択用`:has()`
- 論理プロパティ（`margin-inline`、`padding-block`）
- コンテナクエリ
</css_architecture>

<view_patterns>
## ビューパターン

**標準パーシャル** - ViewComponentsなし：
```erb
<%# app/views/cards/_card.html.erb %>
<article id="<%= dom_id(card) %>" class="card">
  <%= render "cards/header", card: card %>
  <%= render "cards/body", card: card %>
  <%= render "cards/footer", card: card %>
</article>
```

**フラグメントキャッシュ：**
```erb
<% cache card do %>
  <%= render "cards/card", card: card %>
<% end %>
```

**コレクションキャッシュ：**
```erb
<%= render partial: "card", collection: @cards, cached: true %>
```

**シンプルなコンポーネント命名** - 厳格なBEMなし：
```css
.card { }
.card .title { }
.card .actions { }
.card.golden { }
.card.closed { }
```
</view_patterns>

<caching_with_personalization>
## キャッシュ内のユーザー固有コンテンツ

キャッシュを保持するためにパーソナライゼーションをクライアント側JavaScriptに移動：

```erb
<%# キャッシュ可能なフラグメント %>
<% cache card do %>
  <article class="card"
           data-creator-id="<%= card.creator_id %>"
           data-controller="ownership"
           data-ownership-current-user-value="<%= Current.user.id %>">
    <button data-ownership-target="ownerOnly" class="hidden">Delete</button>
  </article>
<% end %>
```

```javascript
// キャッシュヒット後にユーザー固有の要素を表示
export default class extends Controller {
  static values = { currentUser: Number }
  static targets = ["ownerOnly"]

  connect() {
    const creatorId = parseInt(this.element.dataset.creatorId)
    if (creatorId === this.currentUserValue) {
      this.ownerOnlyTargets.forEach(el => el.classList.remove("hidden"))
    }
  }
}
```

**動的コンテンツを別フレームに抽出：**
```erb
<% cache [card, board] do %>
  <article class="card">
    <%= turbo_frame_tag card, :assignment,
          src: card_assignment_path(card),
          refresh: :morph %>
  </article>
<% end %>
```

担当者ドロップダウンは親キャッシュを無効化せずに独立して更新。
</caching_with_personalization>

<broadcasting>
## Turbo Streamsによるブロードキャスト

**モデルコールバック**でリアルタイム更新：
```ruby
class Card < ApplicationRecord
  include Broadcastable

  after_create_commit :broadcast_created
  after_update_commit :broadcast_updated
  after_destroy_commit :broadcast_removed

  private
    def broadcast_created
      broadcast_append_to [Current.account, board], :cards
    end

    def broadcast_updated
      broadcast_replace_to [Current.account, board], :cards
    end

    def broadcast_removed
      broadcast_remove_to [Current.account, board], :cards
    end
end
```

**テナントでスコープ**するには`[Current.account, resource]`パターンを使用。
</broadcasting>
