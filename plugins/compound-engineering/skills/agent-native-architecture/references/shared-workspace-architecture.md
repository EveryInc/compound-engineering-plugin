<overview>
エージェントとユーザーは別々のサンドボックスではなく、同じデータ空間で作業すべき。エージェントがファイルを書くとユーザーが見える。ユーザーが何かを編集するとエージェントが変更を読める。これにより透明性が生まれ、コラボレーションが可能になり、同期レイヤーが不要になる。

**コア原則：** エージェントは隔離された領域ではなく、ユーザーと同じファイルシステムで動作する。
</overview>

<why_shared_workspace>
## なぜ共有ワークスペースなのか？

### サンドボックスアンチパターン

多くのエージェント実装はエージェントを分離する：

```
┌─────────────────┐     ┌─────────────────┐
│   ユーザー空間   │     │   エージェント空間 │
├─────────────────┤     ├─────────────────┤
│ Documents/      │     │ agent_output/   │
│ user_files/     │  ←→ │ temp_files/     │
│ settings.json   │同期 │ cache/          │
└─────────────────┘     └─────────────────┘
```

問題点：
- 空間間でデータを移動するための同期レイヤーが必要
- ユーザーがエージェントの作業を簡単に検査できない
- エージェントがユーザーの貢献の上に構築できない
- 状態の重複
- 空間の一貫性を保つ複雑さ

### 共有ワークスペースパターン

```
┌─────────────────────────────────────────┐
│           共有ワークスペース              │
├─────────────────────────────────────────┤
│ Documents/                              │
│ ├── Research/                           │
│ │   └── {bookId}/        ← エージェントが書く │
│ │       ├── full_text.txt               │
│ │       ├── introduction.md  ← ユーザーが編集可 │
│ │       └── sources/                    │
│ ├── Chats/               ← 両方が読み書き │
│ └── profile.md           ← エージェント生成、ユーザー改良 │
└─────────────────────────────────────────┘
         ↑                    ↑
       ユーザー               エージェント
       (UI)               (ツール)
```

利点：
- ユーザーがエージェントの作業を検査、編集、拡張できる
- エージェントがユーザーの貢献の上に構築できる
- 同期レイヤーが不要
- 完全な透明性
- 単一の信頼できる情報源
</why_shared_workspace>

<directory_structure>
## 共有ワークスペースの設計

### ドメインで構造化

誰が作成したかではなく、データが何を表すかで整理：

```
Documents/
├── Research/
│   └── {bookId}/
│       ├── full_text.txt        # エージェントがダウンロード
│       ├── introduction.md      # エージェント生成、ユーザー編集可
│       ├── notes.md             # ユーザーが追加、エージェントが読める
│       └── sources/
│           └── {source}.md      # エージェントが収集
├── Chats/
│   └── {conversationId}.json    # 両方が読み書き
├── Exports/
│   └── {date}/                  # エージェントがユーザーのために生成
└── profile.md                   # エージェントが写真から生成
```

### アクターで構造化しない

```
# 悪い例 - 作成者で分離
Documents/
├── user_created/
│   └── notes.md
├── agent_created/
│   └── research.md
└── system/
    └── config.json
```

これは人為的な境界を作り、コラボレーションを困難にする。

### メタデータの規約を使用

誰が作成/修正したかを追跡する必要がある場合：

```markdown
<!-- introduction.md -->
---
created_by: agent
created_at: 2024-01-15
last_modified_by: user
last_modified_at: 2024-01-16
---

# 白鯨への序文

このパーソナライズされた序文は、あなたの読書アシスタントによって生成され、
1月16日にあなたによって改良されました。
```
</directory_structure>

<file_tools>
## 共有ワークスペースのファイルツール

アプリが使用するのと同じファイルプリミティブをエージェントに与える：

```swift
// iOS/Swift実装
struct FileTools {
    static func readFile() -> AgentTool {
        tool(
            name: "read_file",
            description: "Read a file from the user's documents",
            parameters: ["path": .string("File path relative to Documents/")],
            execute: { params in
                let path = params["path"] as! String
                let documentsURL = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
                let fileURL = documentsURL.appendingPathComponent(path)
                let content = try String(contentsOf: fileURL)
                return ToolResult(text: content)
            }
        )
    }

    static func writeFile() -> AgentTool {
        tool(
            name: "write_file",
            description: "Write a file to the user's documents",
            parameters: [
                "path": .string("File path relative to Documents/"),
                "content": .string("File content")
            ],
            execute: { params in
                let path = params["path"] as! String
                let content = params["content"] as! String
                let documentsURL = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
                let fileURL = documentsURL.appendingPathComponent(path)

                // 必要に応じて親ディレクトリを作成
                try FileManager.default.createDirectory(
                    at: fileURL.deletingLastPathComponent(),
                    withIntermediateDirectories: true
                )

                try content.write(to: fileURL, atomically: true, encoding: .utf8)
                return ToolResult(text: "Wrote \(path)")
            }
        )
    }

    static func listFiles() -> AgentTool {
        tool(
            name: "list_files",
            description: "List files in a directory",
            parameters: ["path": .string("Directory path relative to Documents/")],
            execute: { params in
                let path = params["path"] as! String
                let documentsURL = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
                let dirURL = documentsURL.appendingPathComponent(path)
                let contents = try FileManager.default.contentsOfDirectory(atPath: dirURL.path)
                return ToolResult(text: contents.joined(separator: "\n"))
            }
        )
    }

    static func searchText() -> AgentTool {
        tool(
            name: "search_text",
            description: "Search for text across files",
            parameters: [
                "query": .string("Text to search for"),
                "path": .string("Directory to search in").optional()
            ],
            execute: { params in
                // ドキュメント全体でテキスト検索を実装
                // 一致するファイルとスニペットを返す
            }
        )
    }
}
```

### TypeScript/Node.js実装

```typescript
const fileTools = [
  tool(
    "read_file",
    "Read a file from the workspace",
    { path: z.string().describe("File path") },
    async ({ path }) => {
      const content = await fs.readFile(path, 'utf-8');
      return { text: content };
    }
  ),

  tool(
    "write_file",
    "Write a file to the workspace",
    {
      path: z.string().describe("File path"),
      content: z.string().describe("File content")
    },
    async ({ path, content }) => {
      await fs.mkdir(dirname(path), { recursive: true });
      await fs.writeFile(path, content, 'utf-8');
      return { text: `Wrote ${path}` };
    }
  ),

  tool(
    "list_files",
    "List files in a directory",
    { path: z.string().describe("Directory path") },
    async ({ path }) => {
      const files = await fs.readdir(path);
      return { text: files.join('\n') };
    }
  ),

  tool(
    "append_file",
    "Append content to a file",
    {
      path: z.string().describe("File path"),
      content: z.string().describe("Content to append")
    },
    async ({ path, content }) => {
      await fs.appendFile(path, content, 'utf-8');
      return { text: `Appended to ${path}` };
    }
  ),
];
```
</file_tools>

<ui_integration>
## 共有ワークスペースとのUI統合

UIはエージェントが書くのと同じファイルを監視すべき：

### パターン1：ファイルベースのリアクティビティ（iOS）

```swift
class ResearchViewModel: ObservableObject {
    @Published var researchFiles: [ResearchFile] = []

    private var watcher: DirectoryWatcher?

    func startWatching(bookId: String) {
        let researchPath = documentsURL
            .appendingPathComponent("Research")
            .appendingPathComponent(bookId)

        watcher = DirectoryWatcher(url: researchPath) { [weak self] in
            // エージェントが新しいファイルを書いたらリロード
            self?.loadResearchFiles(from: researchPath)
        }

        loadResearchFiles(from: researchPath)
    }
}

// SwiftUIはファイル変更時に自動更新
struct ResearchView: View {
    @StateObject var viewModel = ResearchViewModel()

    var body: some View {
        List(viewModel.researchFiles) { file in
            ResearchFileRow(file: file)
        }
    }
}
```

### パターン2：共有データストア

ファイル監視が実用的でない場合、共有データストアを使用：

```swift
// UIとエージェントツールの両方が使用する共有サービス
class BookLibraryService: ObservableObject {
    static let shared = BookLibraryService()

    @Published var books: [Book] = []
    @Published var analysisRecords: [AnalysisRecord] = []

    func addAnalysisRecord(_ record: AnalysisRecord) {
        analysisRecords.append(record)
        // 共有ストレージに永続化
        saveToStorage()
    }
}

// エージェントツールは同じサービスを通じて書き込み
tool("publish_to_feed", async ({ bookId, content, headline }) => {
    let record = AnalysisRecord(bookId: bookId, content: content, headline: headline)
    BookLibraryService.shared.addAnalysisRecord(record)
    return { text: "Published to feed" }
})

// UIは同じサービスを監視
struct FeedView: View {
    @StateObject var library = BookLibraryService.shared

    var body: some View {
        List(library.analysisRecords) { record in
            FeedItemRow(record: record)
        }
    }
}
```

### パターン3：ハイブリッド（ファイル＋インデックス）

コンテンツにはファイル、インデックスにはデータベースを使用：

```
Documents/
├── Research/
│   └── book_123/
│       └── introduction.md   # 実際のコンテンツ（ファイル）

Database:
├── research_index
│   └── { bookId: "book_123", path: "Research/book_123/introduction.md", ... }
```

```swift
// エージェントがファイルを書く
await writeFile("Research/\(bookId)/introduction.md", content)

// そしてインデックスを更新
await database.insert("research_index", {
    bookId: bookId,
    path: "Research/\(bookId)/introduction.md",
    title: extractTitle(content),
    createdAt: Date()
})

// UIはインデックスをクエリしてからファイルを読む
let items = database.query("research_index", where: bookId == "book_123")
for item in items {
    let content = readFile(item.path)
    // 表示...
}
```
</ui_integration>

<collaboration_patterns>
## エージェント-ユーザーコラボレーションパターン

### パターン：エージェントが下書き、ユーザーが改良

```
1. エージェントがintroduction.mdを生成
2. ユーザーがファイルアプリまたはアプリ内エディタで開く
3. ユーザーが改良を加える
4. エージェントがread_fileで変更を確認できる
5. 将来のエージェント作業はユーザーの改良の上に構築
```

エージェントのシステムプロンプトはこれを認識すべき：

```markdown
## ユーザーコンテンツとの作業

コンテンツ（序文、リサーチノートなど）を作成するとき、ユーザーが後で
編集する可能性があります。変更する前に常に既存のファイルを読む—ユーザーが
保持すべき改善を行っているかもしれません。

ファイルが存在し、ユーザーによって修正されている場合（メタデータを確認するか
最後に知っているバージョンと比較）、上書きする前に確認。
```

### パターン：ユーザーが種を蒔き、エージェントが拡張

```
1. ユーザーが最初の考えでnotes.mdを作成
2. ユーザーが依頼：「これについてもっと調べて」
3. エージェントがnotes.mdを読んでコンテキストを理解
4. エージェントがnotes.mdに追加するか関連ファイルを作成
5. ユーザーがエージェントの追加の上に構築を続ける
```

### パターン：追記専用コラボレーション

チャットログやアクティビティストリーム用：

```markdown
<!-- activity.md - 両方が追記、どちらも上書きしない -->

## 2024-01-15

**ユーザー：** 「白鯨」を読み始めた

**エージェント：** 全文をダウンロードしてリサーチフォルダを作成

**ユーザー：** 鯨の象徴についてのハイライトを追加

**エージェント：** メルヴィルの作品における鯨の象徴に関する3つの学術ソースを発見
```
</collaboration_patterns>

<security_considerations>
## 共有ワークスペースのセキュリティ

### ワークスペースのスコープを限定

エージェントにファイルシステム全体へのアクセスを与えない：

```swift
// 良い例：アプリのドキュメントにスコープ
let documentsURL = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]

tool("read_file", { path }) {
    // パスはドキュメントからの相対、エスケープ不可
    let fileURL = documentsURL.appendingPathComponent(path)
    guard fileURL.path.hasPrefix(documentsURL.path) else {
        throw ToolError("Invalid path")
    }
    return try String(contentsOf: fileURL)
}

// 悪い例：絶対パスはエスケープを許可
tool("read_file", { path }) {
    return try String(contentsOf: URL(fileURLWithPath: path))  // /etc/passwdを読める！
}
```

### 機密ファイルを保護

```swift
let protectedPaths = [".env", "credentials.json", "secrets/"]

tool("read_file", { path }) {
    if protectedPaths.any({ path.contains($0) }) {
        throw ToolError("Cannot access protected file")
    }
    // ...
}
```

### エージェントアクションを監査

エージェントが何を読み書きしているかログ：

```swift
func logFileAccess(action: String, path: String, agentId: String) {
    logger.info("[\(agentId)] \(action): \(path)")
}

tool("write_file", { path, content }) {
    logFileAccess(action: "WRITE", path: path, agentId: context.agentId)
    // ...
}
```
</security_considerations>

<examples>
## 実世界の例：Every Reader

Every Readerアプリはリサーチに共有ワークスペースを使用：

```
Documents/
├── Research/
│   └── book_moby_dick/
│       ├── full_text.txt           # エージェントがGutenbergからダウンロード
│       ├── introduction.md         # エージェントが生成、パーソナライズ
│       ├── sources/
│       │   ├── whale_symbolism.md  # エージェントがリサーチ
│       │   └── melville_bio.md     # エージェントがリサーチ
│       └── user_notes.md           # ユーザーが自分のノートを追加可能
├── Chats/
│   └── 2024-01-15.json             # チャット履歴
└── profile.md                       # エージェントが写真から生成
```

**動作の仕組み：**

1. ユーザーがライブラリに「白鯨」を追加
2. ユーザーがリサーチエージェントを開始
3. エージェントが全文を`Research/book_moby_dick/full_text.txt`にダウンロード
4. エージェントがリサーチして`sources/`に書き込み
5. エージェントがユーザーの読書プロファイルに基づいて`introduction.md`を生成
6. ユーザーはアプリまたはFiles.appですべてのファイルを表示可能
7. ユーザーは`introduction.md`を編集して改良可能
8. チャットエージェントは質問に答えるときにこのコンテキストをすべて読める
</examples>

<icloud_sync>
## マルチデバイス同期のためのiCloudファイルストレージ（iOS）

エージェントネイティブiOSアプリには、共有ワークスペースにiCloud DriveのDocumentsフォルダを使用。これにより、同期レイヤーの構築やサーバーの運用なしに**無料の自動マルチデバイス同期**が得られる。

### なぜiCloud Documentsなのか？

| アプローチ | コスト | 複雑さ | オフライン | マルチデバイス |
|----------|------|--------|---------|------------|
| カスタムバックエンド + 同期 | $$$ | 高 | 手動 | はい |
| CloudKitデータベース | 無料枠制限あり | 中 | 手動 | はい |
| **iCloud Documents** | 無料（ユーザーのストレージ） | 低 | 自動 | 自動 |

iCloud Documents：
- ユーザーの既存iCloudストレージを使用（無料5GB、ほとんどのユーザーはそれ以上）
- すべてのユーザーデバイスで自動同期
- オフラインで動作、オンラインで同期
- Files.appで透明性のためにファイルが見える
- サーバーコストなし、維持する同期コードなし

### 実装パターン

```swift
// iCloud Documentsコンテナを取得
func iCloudDocumentsURL() -> URL? {
    FileManager.default.url(forUbiquityContainerIdentifier: nil)?
        .appendingPathComponent("Documents")
}

// 共有ワークスペースはiCloudに存在
class SharedWorkspace {
    let rootURL: URL

    init() {
        // iCloudが利用可能ならそれを使用、なければローカルにフォールバック
        if let iCloudURL = iCloudDocumentsURL() {
            self.rootURL = iCloudURL
        } else {
            // ローカルDocumentsにフォールバック（ユーザーがiCloudにサインインしていない）
            self.rootURL = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first!
        }
    }

    // すべてのファイル操作はこのルートを通る
    func researchPath(for bookId: String) -> URL {
        rootURL.appendingPathComponent("Research/\(bookId)")
    }

    func journalPath() -> URL {
        rootURL.appendingPathComponent("Journal")
    }
}
```

### iCloudのディレクトリ構造

```
iCloud Drive/
└── YourApp/                          # アプリのコンテナ
    └── Documents/                    # Files.appで見える
        ├── Journal/
        │   ├── user/
        │   │   └── 2025-01-15.md     # デバイス間で同期
        │   └── agent/
        │       └── 2025-01-15.md     # エージェントの観察も同期
        ├── Experiments/
        │   └── magnesium-sleep/
        │       ├── config.json
        │       └── log.json
        └── Research/
            └── {topic}/
                └── sources.md
```

### 同期コンフリクトの処理

iCloudは自動的にコンフリクトを処理するが、それを考慮して設計すべき：

```swift
// 読み取り時にコンフリクトを確認
func readJournalEntry(at url: URL) throws -> JournalEntry {
    // iCloudはまだダウンロードされていないコンテンツに.icloudプレースホルダーファイルを作成する可能性
    if url.pathExtension == "icloud" {
        // ダウンロードをトリガー
        try FileManager.default.startDownloadingUbiquitousItem(at: url)
        throw FileNotYetAvailableError()
    }

    let data = try Data(contentsOf: url)
    return try JSONDecoder().decode(JournalEntry.self, from: data)
}

// 書き込みには協調ファイルアクセスを使用
func writeJournalEntry(_ entry: JournalEntry, to url: URL) throws {
    let coordinator = NSFileCoordinator()
    var error: NSError?

    coordinator.coordinate(writingItemAt: url, options: .forReplacing, error: &error) { newURL in
        let data = try? JSONEncoder().encode(entry)
        try? data?.write(to: newURL)
    }

    if let error = error {
        throw error
    }
}
```

### これが可能にすること

1. **ユーザーがiPhoneで実験を開始** → エージェントが`Experiments/sleep-tracking/config.json`を作成
2. **ユーザーがiPadでアプリを開く** → 同じ実験が見える、同期コードは不要
3. **エージェントがiPhoneで観察をログ** → iPadに自動同期
4. **ユーザーがiPadでジャーナルを編集** → iPhoneが編集を確認

### 必要なEntitlements

アプリのentitlementsに追加：

```xml
<key>com.apple.developer.icloud-container-identifiers</key>
<array>
    <string>iCloud.com.yourcompany.yourapp</string>
</array>
<key>com.apple.developer.icloud-services</key>
<array>
    <string>CloudDocuments</string>
</array>
<key>com.apple.developer.ubiquity-container-identifiers</key>
<array>
    <string>iCloud.com.yourcompany.yourapp</string>
</array>
```

### iCloud Documentsを使用しない場合

- **機密データ** - 代わりにKeychainまたは暗号化されたローカルストレージを使用
- **高頻度書き込み** - iCloud同期には遅延がある；ローカル + 定期的な同期を使用
- **大きなメディアファイル** - CloudKit Assetsまたはオンデマンドリソースを検討
- **ユーザー間共有** - iCloud Documentsはシングルユーザー；共有にはCloudKitを使用
</icloud_sync>

<checklist>
## 共有ワークスペースチェックリスト

アーキテクチャ：
- [ ] エージェントとユーザーデータの単一共有ディレクトリ
- [ ] アクターではなくドメインで整理
- [ ] ファイルツールはワークスペースにスコープ（エスケープなし）
- [ ] 機密ファイルの保護パス

ツール：
- [ ] `read_file` - ワークスペース内の任意のファイルを読む
- [ ] `write_file` - ワークスペース内の任意のファイルに書く
- [ ] `list_files` - ディレクトリ構造を参照
- [ ] `search_text` - ファイル全体でコンテンツを検索（オプション）

UI統合：
- [ ] UIがエージェントの書くファイルと同じものを監視
- [ ] 変更が即座に反映（ファイル監視または共有ストア）
- [ ] ユーザーがエージェント作成ファイルを編集可能
- [ ] エージェントが上書き前にユーザーの変更を読む

コラボレーション：
- [ ] システムプロンプトがユーザーがファイルを編集する可能性を認識
- [ ] エージェントが上書き前にユーザーの変更を確認
- [ ] 作成者/変更者を追跡するメタデータ（オプション）

マルチデバイス（iOS）：
- [ ] 共有ワークスペースにiCloud Documentsを使用（無料同期）
- [ ] iCloudが利用不可ならローカルDocumentsにフォールバック
- [ ] `.icloud`プレースホルダーファイルを処理（ダウンロードをトリガー）
- [ ] コンフリクトセーフな書き込みにNSFileCoordinatorを使用
</checklist>
