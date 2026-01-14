<overview>
プロンプトネイティブエージェントシステムを構築するためのアーキテクチャパターン。これらのパターンは、機能はコードではなくプロンプトで定義されるべきであり、ツールはプリミティブであるべきという哲学から生まれています。
</overview>

<pattern name="event-driven-agent">
## イベント駆動エージェントアーキテクチャ

エージェントはイベントに応答する長寿命プロセスとして実行されます。イベントはプロンプトになります。

```
┌─────────────────────────────────────────────────────────────┐
│                    エージェントループ                        │
├─────────────────────────────────────────────────────────────┤
│  イベントソース → エージェント (Claude) → ツール呼び出し → レスポンス │
└─────────────────────────────────────────────────────────────┘
                          │
          ┌───────────────┼───────────────┐
          ▼               ▼               ▼
    ┌─────────┐    ┌──────────┐    ┌───────────┐
    │ コンテンツ │    │   セルフ   │    │   データ   │
    │  ツール   │    │   ツール   │    │   ツール   │
    └─────────┘    └──────────┘    └───────────┘
    (write_file)   (read_source)   (store_item)
                   (restart)       (list_items)
```

**主要な特徴:**
- イベント（メッセージ、webhook、タイマー）がエージェントのターンをトリガー
- エージェントはシステムプロンプトに基づいて応答方法を決定
- ツールはビジネスロジックではなくIOのためのプリミティブ
- 状態はデータツールを介してイベント間で持続

**例: Discordフィードバックボット**
```typescript
// イベントソース
client.on("messageCreate", (message) => {
  if (!message.author.bot) {
    runAgent({
      userMessage: `${message.author}からの新しいメッセージ: "${message.content}"`,
      channelId: message.channelId,
    });
  }
});

// システムプロンプトが動作を定義
const systemPrompt = `
誰かがフィードバックを共有したとき:
1. フィードバックを温かく認める
2. 必要に応じて明確化の質問をする
3. フィードバックツールを使用して保存する
4. フィードバックサイトを更新する

重要度と分類については自分の判断を使用。
`;
```
</pattern>

<pattern name="two-layer-git">
## 2層Gitアーキテクチャ

自己修正エージェントの場合、コード（共有）とデータ（インスタンス固有）を分離。

```
┌─────────────────────────────────────────────────────────────┐
│                     GitHub（共有リポジトリ）                  │
│  - src/           (エージェントコード)                       │
│  - site/          (ウェブインターフェース)                    │
│  - package.json   (依存関係)                                │
│  - .gitignore     (data/, logs/を除外)                      │
└─────────────────────────────────────────────────────────────┘
                          │
                     git clone
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                  インスタンス（サーバー）                      │
│                                                              │
│  GITHUBから（追跡）:                                         │
│  - src/           → コード変更時にプッシュバック              │
│  - site/          → プッシュでデプロイをトリガー             │
│                                                              │
│  ローカルのみ（追跡されない）:                                │
│  - data/          → インスタンス固有のストレージ             │
│  - logs/          → ランタイムログ                          │
│  - .env           → シークレット                            │
└─────────────────────────────────────────────────────────────┘
```

**なぜこれが機能するか:**
- コードとサイトはバージョン管理される（GitHub）
- 生データはローカルに留まる（インスタンス固有）
- サイトはデータから生成されるので再現可能
- git履歴による自動ロールバック
</pattern>

<pattern name="multi-instance">
## マルチインスタンスブランチング

各エージェントインスタンスは、コアコードを共有しながら独自のブランチを取得。

```
main                        # 共有機能、バグ修正
├── instance/feedback-bot   # Every Readerフィードバックボット
├── instance/support-bot    # カスタマーサポートボット
└── instance/research-bot   # リサーチアシスタント
```

**変更フロー:**
| 変更タイプ | 作業場所 | その後 |
|-------------|---------|------|
| コア機能 | main | インスタンスブランチにマージ |
| バグ修正 | main | インスタンスブランチにマージ |
| インスタンス設定 | インスタンスブランチ | 完了 |
| インスタンスデータ | インスタンスブランチ | 完了 |

**同期ツール:**
```typescript
tool("self_deploy", "mainから最新をプル、リビルド、再起動", ...)
tool("sync_from_instance", "別のインスタンスからマージ", ...)
tool("propose_to_main", "改善を共有するためPRを作成", ...)
```
</pattern>

<pattern name="site-as-output">
## エージェント出力としてのサイト

エージェントは、専門的なサイトツールではなく、自然な出力としてウェブサイトを生成・維持。

```
Discordメッセージ
      ↓
エージェントが処理し、インサイトを抽出
      ↓
エージェントが必要なサイト更新を決定
      ↓
エージェントがwrite_fileプリミティブを使用してファイルを書く
      ↓
Gitコミット + プッシュがデプロイをトリガー
      ↓
サイトが自動更新
```

**重要なインサイト:** サイト生成ツールを構築しない。エージェントにファイルツールを与え、良いサイトを作成する方法をプロンプトで教える。

```markdown
## サイト管理

公開フィードバックサイトを維持します。フィードバックが入ってきたら:
1. write_fileを使用してsite/public/content/feedback.jsonを更新
2. サイトのReactコンポーネントに改善が必要なら、それを修正
3. 変更をコミットしてプッシュし、Vercelデプロイをトリガー

サイトは以下のようにすべき:
- クリーンでモダンなダッシュボードの美学
- 明確な視覚的階層
- ステータス整理（受信トレイ、アクティブ、完了）

あなたが構造を決める。良いものにしてください。
```
</pattern>

<pattern name="approval-gates">
## 承認ゲートパターン

危険な操作のために「提案」と「適用」を分離。

```typescript
// 保留中の変更を別に保存
const pendingChanges = new Map<string, string>();

tool("write_file", async ({ path, content }) => {
  if (requiresApproval(path)) {
    // 承認のために保存
    pendingChanges.set(path, content);
    const diff = generateDiff(path, content);
    return {
      text: `変更には承認が必要です。\n\n${diff}\n\n「yes」と返信して適用。`
    };
  } else {
    // 即座に適用
    writeFileSync(path, content);
    return { text: `${path}を書きました` };
  }
});

tool("apply_pending", async () => {
  for (const [path, content] of pendingChanges) {
    writeFileSync(path, content);
  }
  pendingChanges.clear();
  return { text: "保留中のすべての変更を適用しました" };
});
```

**承認が必要なもの:**
- src/*.ts（エージェントコード）
- package.json（依存関係）
- システムプロンプトの変更

**不要なもの:**
- data/*（インスタンスデータ）
- site/*（生成されたコンテンツ）
- docs/*（ドキュメント）
</pattern>

<pattern name="unified-agent-architecture">
## 統一エージェントアーキテクチャ

1つの実行エンジン、多くのエージェントタイプ。すべてのエージェントは同じオーケストレーターを使用するが、異なる設定で。

```
┌─────────────────────────────────────────────────────────────┐
│                    AgentOrchestrator                         │
├─────────────────────────────────────────────────────────────┤
│  - ライフサイクル管理（開始、一時停止、再開、停止）           │
│  - チェックポイント/復元（バックグラウンド実行用）            │
│  - ツール実行                                                │
│  - チャット統合                                              │
└─────────────────────────────────────────────────────────────┘
          │                    │                    │
    ┌─────┴─────┐        ┌─────┴─────┐        ┌─────┴─────┐
    │  リサーチ  │        │   チャット  │        │ プロフィール│
    │   エージェント│        │  エージェント │        │  エージェント│
    └───────────┘        └───────────┘        └───────────┘
    - web_search         - read_library       - read_photos
    - write_file         - publish_to_feed    - write_file
    - read_file          - web_search         - analyze_image
```

**実装:**

```swift
// すべてのエージェントは同じオーケストレーターを使用
let session = try await AgentOrchestrator.shared.startAgent(
    config: ResearchAgent.create(book: book),  // 設定は異なる
    tools: ResearchAgent.tools,                 // ツールは異なる
    context: ResearchAgent.context(for: book)   // コンテキストは異なる
)

// エージェントタイプは独自の設定を定義
struct ResearchAgent {
    static var tools: [AgentTool] {
        [
            FileTools.readFile(),
            FileTools.writeFile(),
            WebTools.webSearch(),
            WebTools.webFetch(),
        ]
    }

    static func context(for book: Book) -> String {
        """
        「\(book.title)」by \(book.author)をリサーチしています。
        発見をDocuments/Research/\(book.id)/に保存してください。
        """
    }
}

struct ChatAgent {
    static var tools: [AgentTool] {
        [
            FileTools.readFile(),
            FileTools.writeFile(),
            BookTools.readLibrary(),
            BookTools.publishToFeed(),  // チャットは直接公開できる
            WebTools.webSearch(),
        ]
    }

    static func context(library: [Book]) -> String {
        """
        ユーザーの読書を手伝います。
        利用可能な本: \(library.map { $0.title }.joined(separator: ", "))
        """
    }
}
```

**利点:**
- すべてのエージェントタイプで一貫したライフサイクル管理
- 自動チェックポイント/再開（モバイルに重要）
- 共有ツールプロトコル
- 新しいエージェントタイプを簡単に追加
- 集中化されたエラー処理とロギング
</pattern>

<pattern name="agent-to-ui-communication">
## エージェントからUIへの通信

エージェントがアクションを取ると、UIは即座にそれを反映すべきです。ユーザーはエージェントが何をしたかを見れるべきです。

**パターン1: 共有データストア（推奨）**

エージェントはUIが監視するのと同じサービスを通じて書き込む:

```swift
// 共有サービス
class BookLibraryService: ObservableObject {
    static let shared = BookLibraryService()
    @Published var books: [Book] = []
    @Published var feedItems: [FeedItem] = []

    func addFeedItem(_ item: FeedItem) {
        feedItems.append(item)
        persist()
    }
}

// エージェントツールは共有サービスを通じて書き込む
tool("publish_to_feed", async ({ bookId, content, headline }) => {
    let item = FeedItem(bookId: bookId, content: content, headline: headline)
    BookLibraryService.shared.addFeedItem(item)  // UIと同じサービス
    return { text: "フィードに公開しました" }
})

// UIは同じサービスを監視
struct FeedView: View {
    @StateObject var library = BookLibraryService.shared

    var body: some View {
        List(library.feedItems) { item in
            FeedItemRow(item: item)
            // エージェントがアイテムを追加すると自動更新
        }
    }
}
```

**パターン2: ファイルシステム監視**

ファイルベースのデータの場合、ファイルシステムを監視:

```swift
class ResearchWatcher: ObservableObject {
    @Published var files: [URL] = []
    private var watcher: DirectoryWatcher?

    func watch(bookId: String) {
        let path = documentsURL.appendingPathComponent("Research/\(bookId)")

        watcher = DirectoryWatcher(path: path) { [weak self] in
            self?.reload(from: path)
        }

        reload(from: path)
    }
}

// エージェントがファイルを書く
tool("write_file", { path, content }) -> {
    writeFile(documentsURL.appendingPathComponent(path), content)
    // DirectoryWatcherがUI更新を自動トリガー
}
```

**パターン3: イベントバス（クロスコンポーネント）**

複数の独立したコンポーネントを持つ複雑なアプリの場合:

```typescript
// 共有イベントバス
const agentEvents = new EventEmitter();

// エージェントツールがイベントを発行
tool("publish_to_feed", async ({ content }) => {
    const item = await feedService.add(content);
    agentEvents.emit('feed:new-item', item);
    return { text: "公開しました" };
});

// UIコンポーネントがサブスクライブ
function FeedView() {
    const [items, setItems] = useState([]);

    useEffect(() => {
        const handler = (item) => setItems(prev => [...prev, item]);
        agentEvents.on('feed:new-item', handler);
        return () => agentEvents.off('feed:new-item', handler);
    }, []);

    return <FeedList items={items} />;
}
```

**避けるべきこと:**

```swift
// 悪い: UIがエージェントの変更を監視しない
// エージェントがデータベースに直接書き込む
tool("publish_to_feed", { content }) {
    database.insert("feed", content)  // UIはこれを見ない
}

// UIは起動時に一度だけ読み込み、更新しない
struct FeedView: View {
    let items = database.query("feed")  // 古い！
}
```
</pattern>

<pattern name="model-tier-selection">
## モデルティア選択

異なるエージェントには異なる知性レベルが必要。結果を達成する最も安価なモデルを使用。

| エージェントタイプ | 推奨ティア | 理由 |
|------------|-----------------|-----------|
| チャット/会話 | バランス | 高速レスポンス、良好な推論 |
| リサーチ | バランス | ツールループ、超複雑な合成ではない |
| コンテンツ生成 | バランス | クリエイティブだが合成重視ではない |
| 複雑な分析 | パワフル | マルチドキュメント合成、微妙な判断 |
| プロフィール/オンボーディング | パワフル | 写真分析、複雑なパターン認識 |
| シンプルなクエリ | 高速/Haiku | 素早い検索、シンプルな変換 |

**実装:**

```swift
enum ModelTier {
    case fast      // claude-3-haiku: 高速、安価、シンプルなタスク
    case balanced  // claude-3-sonnet: ほとんどのタスクに良いバランス
    case powerful  // claude-3-opus: 複雑な推論、合成
}

struct AgentConfig {
    let modelTier: ModelTier
    let tools: [AgentTool]
    let systemPrompt: String
}

// リサーチエージェント: バランスティア
let researchConfig = AgentConfig(
    modelTier: .balanced,
    tools: researchTools,
    systemPrompt: researchPrompt
)

// プロフィール分析: パワフルティア（複雑な写真解釈）
let profileConfig = AgentConfig(
    modelTier: .powerful,
    tools: profileTools,
    systemPrompt: profilePrompt
)

// 素早い検索: 高速ティア
let lookupConfig = AgentConfig(
    modelTier: .fast,
    tools: [readLibrary],
    systemPrompt: "ユーザーのライブラリに関する素早い質問に答える。"
)
```

**コスト最適化戦略:**
- バランスティアから開始し、品質が不十分な場合のみアップグレード
- 各ターンがシンプルなツール重視のループには高速ティアを使用
- パワフルティアは合成タスク（複数のソースを比較）に予約
- コスト管理のためターンごとのトークン制限を検討
</pattern>

<design_questions>
## 設計時に尋ねるべき質問

1. **エージェントのターンをトリガーするイベントは何か？**（メッセージ、webhook、タイマー、ユーザーリクエスト）
2. **エージェントが必要とするプリミティブは何か？**（read、write、call API、restart）
3. **エージェントがすべき決定は何か？**（フォーマット、構造、優先度、アクション）
4. **ハードコードすべき決定は何か？**（セキュリティ境界、承認要件）
5. **エージェントはどのように作業を検証するか？**（ヘルスチェック、ビルド検証）
6. **エージェントはどのようにミスから回復するか？**（gitロールバック、承認ゲート）
7. **UIはいつエージェントが状態を変更したかをどのように知るか？**（共有ストア、ファイル監視、イベント）
8. **各エージェントタイプにどのモデルティアが必要か？**（高速、バランス、パワフル）
9. **エージェントはどのようにインフラを共有するか？**（統一オーケストレーター、共有ツール）
</design_questions>
