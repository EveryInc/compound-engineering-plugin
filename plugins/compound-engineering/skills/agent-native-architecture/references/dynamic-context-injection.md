<overview>
エージェントのシステムプロンプトに動的ランタイムコンテキストを注入する方法。エージェントは何を扱えるかを知るために、アプリに存在するものを知る必要があります。静的プロンプトでは不十分です—エージェントはユーザーが見るのと同じコンテキストを見る必要があります。

**コア原則:** ユーザーのコンテキスト = エージェントのコンテキスト
</overview>

<why_context_matters>
## なぜ動的コンテキスト注入か？

静的システムプロンプトはエージェントに何ができるかを伝えます。動的コンテキストはユーザーの実際のデータで今何ができるかを伝えます。

**失敗ケース:**
```
ユーザー: 「私の読書フィードにエカテリーナ大帝について何か書いて」
エージェント: 「どのシステムを指していますか？読書フィードの意味がわかりません。」
```

エージェントは以下を知らなかったため失敗しました:
- ユーザーのライブラリに存在する本
- 「読書フィード」とは何か
- そこに公開するためのツール

**修正:** アプリ状態に関するランタイムコンテキストをシステムプロンプトに注入。
</why_context_matters>

<pattern name="context-injection">
## コンテキスト注入パターン

現在のアプリ状態を含めて、システムプロンプトを動的に構築:

```swift
func buildSystemPrompt() -> String {
    // 現在の状態を収集
    let availableBooks = libraryService.books
    let recentActivity = analysisService.recentRecords(limit: 10)
    let userProfile = profileService.currentProfile

    return """
    # あなたのアイデンティティ

    あなたは\(userProfile.name)のライブラリの読書アシスタントです。

    ## ユーザーのライブラリ内の利用可能な本

    \(availableBooks.map { "- 「\($0.title)」by \($0.author) (id: \($0.id))" }.joined(separator: "\n"))

    ## 最近の読書活動

    \(recentActivity.map { "- 「\($0.bookTitle)」を分析: \($0.excerptPreview)" }.joined(separator: "\n"))

    ## あなたの能力

    - **publish_to_feed**: フィードタブに表示されるインサイトを作成
    - **read_library**: 本、ハイライト、分析を表示
    - **web_search**: リサーチのためにインターネットを検索
    - **write_file**: Documents/Research/{bookId}/にリサーチを保存

    ユーザーが「フィード」や「読書フィード」と言及した場合、それはインサイトが表示される
    フィードタブを意味します。そこにコンテンツを作成するには`publish_to_feed`を使用。
    """
}
```
</pattern>

<what_to_inject>
## 注入すべきコンテキスト

### 1. 利用可能なリソース
エージェントがアクセスできるデータ/ファイルは何か？

```swift
## ユーザーのライブラリ内で利用可能

本:
- 「白鯨」by ハーマン・メルヴィル (id: book_123)
- 「1984」by ジョージ・オーウェル (id: book_456)

リサーチフォルダ:
- Documents/Research/book_123/ (3ファイル)
- Documents/Research/book_456/ (1ファイル)
```

### 2. 現在の状態
ユーザーが最近何をしたか？現在のコンテキストは何か？

```swift
## 最近の活動

- 2時間前: 「1984」で監視についてのパッセージをハイライト
- 昨日: 「白鯨」の鯨の象徴についてのリサーチを完了
- 今週: ライブラリに3冊の新しい本を追加
```

### 3. 能力マッピング
どのツールがどのUI機能にマップするか？ユーザーの言語を使用。

```swift
## できること

| ユーザーが言う | 使うべきもの | 結果 |
|-----------|----------------|--------|
| 「私のフィード」/「読書フィード」 | `publish_to_feed` | フィードタブにインサイトを作成 |
| 「私のライブラリ」/「私の本」 | `read_library` | 本のコレクションを表示 |
| 「これをリサーチ」 | `web_search` + `write_file` | Researchフォルダに保存 |
| 「私のプロフィール」 | `read_file("profile.md")` | 読書プロフィールを表示 |
```

### 4. ドメイン語彙
ユーザーが使う可能性のあるアプリ固有の用語を説明。

```swift
## 語彙

- **フィード**: 読書インサイトと分析を表示するフィードタブ
- **リサーチフォルダ**: リサーチが保存されるDocuments/Research/{bookId}/
- **読書プロフィール**: ユーザーの読書嗜好を説明するマークダウンファイル
- **ハイライト**: ユーザーが本でマークしたパッセージ
```
</what_to_inject>

<implementation_patterns>
## 実装パターン

### パターン1: サービスベースの注入（Swift/iOS）

```swift
class AgentContextBuilder {
    let libraryService: BookLibraryService
    let profileService: ReadingProfileService
    let activityService: ActivityService

    func buildContext() -> String {
        let books = libraryService.books
        let profile = profileService.currentProfile
        let activity = activityService.recent(limit: 10)

        return """
        ## ライブラリ (\(books.count)冊)
        \(formatBooks(books))

        ## プロフィール
        \(profile.summary)

        ## 最近の活動
        \(formatActivity(activity))
        """
    }

    private func formatBooks(_ books: [Book]) -> String {
        books.map { "- 「\($0.title)」 (id: \($0.id))" }.joined(separator: "\n")
    }
}

// エージェント初期化時の使用
let context = AgentContextBuilder(
    libraryService: .shared,
    profileService: .shared,
    activityService: .shared
).buildContext()

let systemPrompt = basePrompt + "\n\n" + context
```

### パターン2: フックベースの注入（TypeScript）

```typescript
interface ContextProvider {
  getContext(): Promise<string>;
}

class LibraryContextProvider implements ContextProvider {
  async getContext(): Promise<string> {
    const books = await db.books.list();
    const recent = await db.activity.recent(10);

    return `
## ライブラリ
${books.map(b => `- 「${b.title}」 (${b.id})`).join('\n')}

## 最近
${recent.map(r => `- ${r.description}`).join('\n')}
    `.trim();
  }
}

// 複数のプロバイダーを合成
async function buildSystemPrompt(providers: ContextProvider[]): Promise<string> {
  const contexts = await Promise.all(providers.map(p => p.getContext()));
  return [BASE_PROMPT, ...contexts].join('\n\n');
}
```

### パターン3: テンプレートベースの注入

```markdown
# システムプロンプトテンプレート (system-prompt.template.md)

あなたは読書アシスタントです。

## 利用可能な本

{{#each books}}
- 「{{title}}」by {{author}} (id: {{id}})
{{/each}}

## 能力

{{#each capabilities}}
- **{{name}}**: {{description}}
{{/each}}

## 最近の活動

{{#each recentActivity}}
- {{timestamp}}: {{description}}
{{/each}}
```

```typescript
// ランタイムでレンダリング
const prompt = Handlebars.compile(template)({
  books: await libraryService.getBooks(),
  capabilities: getCapabilities(),
  recentActivity: await activityService.getRecent(10),
});
```
</implementation_patterns>

<context_freshness>
## コンテキストの鮮度

コンテキストはエージェント初期化時に注入し、オプションで長いセッション中に更新すべきです。

**初期化時:**
```swift
// エージェント開始時は常にフレッシュなコンテキストを注入
func startChatAgent() async -> AgentSession {
    let context = await buildCurrentContext()  // フレッシュなコンテキスト
    return await AgentOrchestrator.shared.startAgent(
        config: ChatAgent.config,
        systemPrompt: basePrompt + context
    )
}
```

**長いセッション中（オプション）:**
```swift
// 長時間実行エージェントには更新ツールを提供
tool("refresh_context", "現在のアプリ状態を取得") { _ in
    let books = libraryService.books
    let recent = activityService.recent(10)
    return """
    現在のライブラリ: \(books.count)冊
    最近: \(recent.map { $0.summary }.joined(separator: ", "))
    """
}
```

**やってはいけないこと:**
```swift
// やらない: アプリ起動時の古いコンテキストを使用
let cachedContext = appLaunchContext  // 古い！
// 本が追加されたり、活動が変わったりしているかも
```
</context_freshness>

<examples>
## 実例: Every Reader

Every Readerアプリはチャットエージェントのためにコンテキストを注入:

```swift
func getChatAgentSystemPrompt() -> String {
    // 現在のライブラリ状態を取得
    let books = BookLibraryService.shared.books
    let analyses = BookLibraryService.shared.analysisRecords.prefix(10)
    let profile = ReadingProfileService.shared.getProfileForSystemPrompt()

    let bookList = books.map { book in
        "- 「\(book.title)」by \(book.author) (id: \(book.id))"
    }.joined(separator: "\n")

    let recentList = analyses.map { record in
        let title = books.first { $0.id == record.bookId }?.title ?? "不明"
        return "- 「\(title)」から: 「\(record.excerptPreview)」"
    }.joined(separator: "\n")

    return """
    # 読書アシスタント

    ユーザーの読書と本のリサーチを手伝います。

    ## ユーザーのライブラリ内の利用可能な本

    \(bookList.isEmpty ? "まだ本がありません。" : bookList)

    ## 最近の読書ジャーナル（最新の分析）

    \(recentList.isEmpty ? "まだ分析がありません。" : recentList)

    ## 読書プロフィール

    \(profile)

    ## あなたの能力

    - **フィードに公開**: `publish_to_feed`を使用してフィードタブに表示されるインサイトを作成
    - **ライブラリアクセス**: `read_library`を使用して本とハイライトを表示
    - **リサーチ**: ウェブを検索してDocuments/Research/{bookId}/に保存
    - **プロフィール**: ユーザーの読書プロフィールを読み取り/更新

    ユーザーが「フィードに何か書いて」や「読書フィードに追加して」と依頼した場合、
    関連するbook_idで`publish_to_feed`ツールを使用。
    """
}
```

**結果:** ユーザーが「私の読書フィードにエカテリーナ大帝について何か書いて」と言うと、エージェントは:
1. 「読書フィード」を見る → `publish_to_feed`を使うことを知る
2. 利用可能な本を見る → 関連するbook IDを見つける
3. フィードタブに適切なコンテンツを作成
</examples>

<checklist>
## コンテキスト注入チェックリスト

エージェントを起動する前に:
- [ ] システムプロンプトに現在のリソース（本、ファイル、データ）が含まれている
- [ ] 最近の活動がエージェントに見える
- [ ] 能力がユーザーの語彙にマップされている
- [ ] ドメイン固有の用語が説明されている
- [ ] コンテキストはフレッシュ（エージェント開始時に収集、キャッシュではない）

新機能を追加する際:
- [ ] 新しいリソースがコンテキスト注入に含まれている
- [ ] 新しい能力がシステムプロンプトに文書化されている
- [ ] 機能のユーザー語彙がマップされている
</checklist>
