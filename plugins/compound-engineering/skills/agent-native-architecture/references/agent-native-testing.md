<overview>
エージェントネイティブアプリのテストには、従来のユニットテストとは異なるアプローチが必要です。特定の関数を呼び出すかではなく、エージェントが結果を達成するかをテストします。このガイドは、アプリが本当にエージェントネイティブであることを検証するための具体的なテストパターンを提供します。
</overview>

<testing_philosophy>
## テスト哲学

### 手順ではなく結果をテスト

**従来型（手順重視）:**
```typescript
// 特定の引数で特定の関数が呼ばれたことをテスト
expect(mockProcessFeedback).toHaveBeenCalledWith({
  message: "Great app!",
  category: "praise",
  priority: 2
});
```

**エージェントネイティブ（結果重視）:**
```typescript
// 結果が達成されたことをテスト
const result = await agent.process("Great app!");
const storedFeedback = await db.feedback.getLatest();

expect(storedFeedback.content).toContain("Great app");
expect(storedFeedback.importance).toBeGreaterThanOrEqual(1);
expect(storedFeedback.importance).toBeLessThanOrEqual(5);
// どのように分類したかは気にしない—合理的であればよい
```

### 変動性を受け入れる

エージェントは毎回異なる方法で問題を解決する可能性があります。テストは：
- 経路ではなく最終状態を検証
- 正確な値ではなく合理的な範囲を受け入れる
- 正確なフォーマットではなく必要な要素の存在を確認
</testing_philosophy>

<can_agent_do_it_test>
## 「エージェントはできるか？」テスト

各UI機能について、テストプロンプトを書き、エージェントが達成できることを検証。

### テンプレート

```typescript
describe('Agent Capability Tests', () => {
  test('Agent can add a book to library', async () => {
    const result = await agent.chat("ライブラリに'白鯨' by ハーマン・メルヴィルを追加して");

    // 結果を検証
    const library = await libraryService.getBooks();
    const mobyDick = library.find(b => b.title.includes("白鯨"));

    expect(mobyDick).toBeDefined();
    expect(mobyDick.author).toContain("メルヴィル");
  });

  test('Agent can publish to feed', async () => {
    // セットアップ: 本が存在することを確認
    await libraryService.addBook({ id: "book_123", title: "1984" });

    const result = await agent.chat("監視テーマについて何かフィードに書いて");

    // 結果を検証
    const feed = await feedService.getItems();
    const newItem = feed.find(item => item.bookId === "book_123");

    expect(newItem).toBeDefined();
    expect(newItem.content.toLowerCase()).toMatch(/surveillance|watching|control/);
  });

  test('Agent can search and save research', async () => {
    await libraryService.addBook({ id: "book_456", title: "白鯨" });

    const result = await agent.chat("白鯨の鯨の象徴をリサーチして");

    // ファイルが作成されたことを検証
    const files = await fileService.listFiles("Research/book_456/");
    expect(files.length).toBeGreaterThan(0);

    // コンテンツが関連していることを検証
    const content = await fileService.readFile(files[0]);
    expect(content.toLowerCase()).toMatch(/whale|symbolism|melville/);
  });
});
```

### 「場所に書き込み」テスト

重要なリトマステスト: エージェントは特定のアプリの場所にコンテンツを作成できるか？

```typescript
describe('Location Awareness Tests', () => {
  const locations = [
    { userPhrase: "私の読書フィード", expectedTool: "publish_to_feed" },
    { userPhrase: "私のライブラリ", expectedTool: "add_book" },
    { userPhrase: "私のリサーチフォルダ", expectedTool: "write_file" },
    { userPhrase: "私のプロフィール", expectedTool: "write_file" },
  ];

  for (const { userPhrase, expectedTool } of locations) {
    test(`Agent knows how to write to "${userPhrase}"`, async () => {
      const prompt = `${userPhrase}にテストノートを書いて`;
      const result = await agent.chat(prompt);

      // エージェントが正しいツールを使用した（または結果を達成した）ことを確認
      expect(result.toolCalls).toContainEqual(
        expect.objectContaining({ name: expectedTool })
      );

      // または直接結果を検証
      // expect(await locationHasNewContent(userPhrase)).toBe(true);
    });
  }
});
```
</can_agent_do_it_test>

<surprise_test>
## 「サプライズテスト」

よく設計されたエージェントネイティブアプリは、エージェントが創造的なアプローチを考え出すことを可能にします。オープンエンドなリクエストを与えてこれをテスト。

### テスト

```typescript
describe('Agent Creativity Tests', () => {
  test('Agent can handle open-ended requests', async () => {
    // セットアップ: ユーザーがいくつかの本を持っている
    await libraryService.addBook({ id: "1", title: "1984", author: "オーウェル" });
    await libraryService.addBook({ id: "2", title: "すばらしい新世界", author: "ハクスリー" });
    await libraryService.addBook({ id: "3", title: "華氏451度", author: "ブラッドベリ" });

    // オープンエンドなリクエスト
    const result = await agent.chat("来月の読書計画を立てて");

    // エージェントは何か有用なことをすべき
    // 正確に何かは指定しない—それがポイント
    expect(result.toolCalls.length).toBeGreaterThan(0);

    // ライブラリに関与すべき
    const libraryTools = ["read_library", "write_file", "publish_to_feed"];
    const usedLibraryTool = result.toolCalls.some(
      call => libraryTools.includes(call.name)
    );
    expect(usedLibraryTool).toBe(true);
  });

  test('Agent finds creative solutions', async () => {
    // タスクの達成方法を指定しない
    const result = await agent.chat(
      "私のSF本全体のディストピアテーマを理解したい"
    );

    // エージェントがするかもしれないこと:
    // - すべての本を読んで比較ドキュメントを作成
    // - ディストピア文学をリサーチしてユーザーの本と関連付け
    // - マークダウンファイルでマインドマップを作成
    // - フィードに一連のインサイトを公開

    // 実質的な何かをしたことを検証するだけ
    expect(result.response.length).toBeGreaterThan(100);
    expect(result.toolCalls.length).toBeGreaterThan(0);
  });
});
```

### 失敗の見た目

```typescript
// 失敗: エージェントはそれができないと言うだけ
const result = await agent.chat("ブッククラブのディスカッションに備えて");

// 悪い結果:
expect(result.response).not.toContain("できません");
expect(result.response).not.toContain("そのためのツールがありません");
expect(result.response).not.toContain("明確にしていただけますか");

// エージェントが理解すべきことについて明確化を求める場合、
// コンテキスト注入または能力のギャップがある
```
</surprise_test>

<parity_testing>
## 自動パリティテスト

すべてのUIアクションにエージェント相当があることを確認。

### 能力マップテスト

```typescript
// capability-map.ts
export const capabilityMap = {
  // UIアクション: エージェントツール
  "ライブラリを表示": "read_library",
  "本を追加": "add_book",
  "本を削除": "delete_book",
  "インサイトを公開": "publish_to_feed",
  "リサーチを開始": "start_research",
  "ハイライトを表示": "read_library",  // 同じツール、異なるクエリ
  "プロフィールを編集": "write_file",
  "ウェブ検索": "web_search",
  "データをエクスポート": "N/A",  // UI専用アクション
};

// parity.test.ts
import { capabilityMap } from './capability-map';
import { getAgentTools } from './agent-config';
import { getSystemPrompt } from './system-prompt';

describe('Action Parity', () => {
  const agentTools = getAgentTools();
  const systemPrompt = getSystemPrompt();

  for (const [uiAction, toolName] of Object.entries(capabilityMap)) {
    if (toolName === 'N/A') continue;

    test(`"${uiAction}" has agent tool: ${toolName}`, () => {
      const toolNames = agentTools.map(t => t.name);
      expect(toolNames).toContain(toolName);
    });

    test(`${toolName} is documented in system prompt`, () => {
      expect(systemPrompt).toContain(toolName);
    });
  }
});
```

### コンテキストパリティテスト

```typescript
describe('Context Parity', () => {
  test('Agent sees all data that UI shows', async () => {
    // セットアップ: データを作成
    await libraryService.addBook({ id: "1", title: "テスト本" });
    await feedService.addItem({ id: "f1", content: "テストインサイト" });

    // システムプロンプトを取得（コンテキストを含む）
    const systemPrompt = await buildSystemPrompt();

    // データが含まれていることを検証
    expect(systemPrompt).toContain("テスト本");
    expect(systemPrompt).toContain("テストインサイト");
  });

  test('Recent activity is visible to agent', async () => {
    // いくつかのアクションを実行
    await activityService.log({ action: "highlighted", bookId: "1" });
    await activityService.log({ action: "researched", bookId: "2" });

    const systemPrompt = await buildSystemPrompt();

    // 活動が含まれていることを検証
    expect(systemPrompt).toMatch(/highlighted|researched/);
  });
});
```
</parity_testing>

<integration_testing>
## 統合テスト

ユーザーリクエストから結果までの完全なフローをテスト。

### エンドツーエンドフローテスト

```typescript
describe('End-to-End Flows', () => {
  test('Research flow: request → web search → file creation', async () => {
    // セットアップ
    const bookId = "book_123";
    await libraryService.addBook({ id: bookId, title: "白鯨" });

    // ユーザーリクエスト
    await agent.chat("白鯨の捕鯨の歴史的背景をリサーチして");

    // 検証: ウェブ検索が実行された
    const searchCalls = mockWebSearch.mock.calls;
    expect(searchCalls.length).toBeGreaterThan(0);
    expect(searchCalls.some(call =>
      call[0].query.toLowerCase().includes("whaling")
    )).toBe(true);

    // 検証: ファイルが作成された
    const researchFiles = await fileService.listFiles(`Research/${bookId}/`);
    expect(researchFiles.length).toBeGreaterThan(0);

    // 検証: コンテンツが関連している
    const content = await fileService.readFile(researchFiles[0]);
    expect(content.toLowerCase()).toMatch(/whale|whaling|nantucket|melville/);
  });

  test('Publish flow: request → tool call → feed update → UI reflects', async () => {
    // セットアップ
    await libraryService.addBook({ id: "book_1", title: "1984" });

    // 初期状態
    const feedBefore = await feedService.getItems();

    // ユーザーリクエスト
    await agent.chat("私の読書フィードにビッグブラザーについて何か書いて");

    // フィードが更新されたことを検証
    const feedAfter = await feedService.getItems();
    expect(feedAfter.length).toBe(feedBefore.length + 1);

    // コンテンツを検証
    const newItem = feedAfter.find(item =>
      !feedBefore.some(old => old.id === item.id)
    );
    expect(newItem).toBeDefined();
    expect(newItem.content.toLowerCase()).toMatch(/big brother|surveillance|watching/);
  });
});
```

### 失敗復旧テスト

```typescript
describe('Failure Recovery', () => {
  test('Agent handles missing book gracefully', async () => {
    const result = await agent.chat("'存在しない本'について教えて");

    // エージェントはクラッシュすべきでない
    expect(result.error).toBeUndefined();

    // エージェントは問題を認識すべき
    expect(result.response.toLowerCase()).toMatch(
      /見つかりません|見えません|ライブラリ/
    );
  });

  test('Agent recovers from API failure', async () => {
    // API失敗をモック
    mockWebSearch.mockRejectedValueOnce(new Error("Network error"));

    const result = await agent.chat("このトピックをリサーチして");

    // エージェントは優雅に処理すべき
    expect(result.error).toBeUndefined();
    expect(result.response).not.toContain("unhandled exception");

    // エージェントは問題を伝えるべき
    expect(result.response.toLowerCase()).toMatch(
      /検索できませんでした|できません|再試行/
    );
  });
});
```
</integration_testing>

<snapshot_testing>
## システムプロンプトのスナップショットテスト

システムプロンプトとコンテキスト注入の変更を時間の経過とともに追跡。

```typescript
describe('System Prompt Stability', () => {
  test('System prompt structure matches snapshot', async () => {
    const systemPrompt = await buildSystemPrompt();

    // 構造を抽出（動的データを除去）
    const structure = systemPrompt
      .replace(/id: \w+/g, 'id: [ID]')
      .replace(/"[^"]+"/g, '"[TITLE]"')
      .replace(/\d{4}-\d{2}-\d{2}/g, '[DATE]');

    expect(structure).toMatchSnapshot();
  });

  test('All capability sections are present', async () => {
    const systemPrompt = await buildSystemPrompt();

    const requiredSections = [
      "あなたの能力",
      "利用可能な本",
      "最近の活動",
    ];

    for (const section of requiredSections) {
      expect(systemPrompt).toContain(section);
    }
  });
});
```
</snapshot_testing>

<manual_testing>
## 手動テストチェックリスト

開発中に手動でテストするのが最善なものもある：

### 自然言語バリエーションテスト

同じリクエストに対して複数のフレーズを試す：

```
「これをフィードに追加」
「私の読書フィードに何か書いて」
「これについてのインサイトを公開」
「これをフィードに入れて」
「これをフィードに入れたい」
```

コンテキスト注入が正しければすべて機能するはず。

### エッジケースプロンプト

```
「何ができる？」
→ エージェントは能力を説明すべき

「私の本を手伝って」
→ エージェントはライブラリに関与し、「本」の意味を聞かない

「何か書いて」
→ エージェントはどこに（フィード、ファイルなど）を聞くべき（明確でない場合）

「すべて削除」
→ エージェントは破壊的アクションの前に確認すべき
```

### 混乱テスト

存在すべきだが適切に接続されていないかもしれないものについて尋ねる：

```
「リサーチフォルダには何がある？」
→ ファイルをリストすべき、「どのリサーチフォルダ？」と聞かない

「最近の読書を見せて」
→ 活動を表示すべき、「どういう意味？」と聞かない

「中断したところから続けて」
→ 利用可能なら最近の活動を参照すべき
```
</manual_testing>

<ci_integration>
## CI/CD統合

エージェントネイティブテストをCIパイプラインに追加：

```yaml
# .github/workflows/test.yml
name: Agent-Native Tests

on: [push, pull_request]

jobs:
  agent-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup
        run: npm install

      - name: Run Parity Tests
        run: npm run test:parity

      - name: Run Capability Tests
        run: npm run test:capabilities
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}

      - name: Check System Prompt Completeness
        run: npm run test:system-prompt

      - name: Verify Capability Map
        run: |
          # 能力マップが最新であることを確認
          npm run generate:capability-map
          git diff --exit-code capability-map.ts
```

### コスト意識のあるテスト

エージェントテストはAPIトークンを消費します。管理戦略：

```typescript
// 基本テストには小さいモデルを使用
const testConfig = {
  model: process.env.CI ? "claude-3-haiku" : "claude-3-opus",
  maxTokens: 500,  // 出力長を制限
};

// 決定論的テストのためにレスポンスをキャッシュ
const cachedAgent = new CachedAgent({
  cacheDir: ".test-cache",
  ttl: 24 * 60 * 60 * 1000,  // 24時間
});

// 高価なテストはmainブランチでのみ実行
if (process.env.GITHUB_REF === 'refs/heads/main') {
  describe('Full Integration Tests', () => { ... });
}
```
</ci_integration>

<test_utilities>
## テストユーティリティ

### エージェントテストハーネス

```typescript
class AgentTestHarness {
  private agent: Agent;
  private mockServices: MockServices;

  async setup() {
    this.mockServices = createMockServices();
    this.agent = await createAgent({
      services: this.mockServices,
      model: "claude-3-haiku",  // テスト用に安価
    });
  }

  async chat(message: string): Promise<AgentResponse> {
    return this.agent.chat(message);
  }

  async expectToolCall(toolName: string) {
    const lastResponse = this.agent.getLastResponse();
    expect(lastResponse.toolCalls.map(t => t.name)).toContain(toolName);
  }

  async expectOutcome(check: () => Promise<boolean>) {
    const result = await check();
    expect(result).toBe(true);
  }

  getState() {
    return {
      library: this.mockServices.library.getBooks(),
      feed: this.mockServices.feed.getItems(),
      files: this.mockServices.files.listAll(),
    };
  }
}

// 使用法
test('full flow', async () => {
  const harness = new AgentTestHarness();
  await harness.setup();

  await harness.chat("ライブラリに'白鯨'を追加");
  await harness.expectToolCall("add_book");
  await harness.expectOutcome(async () => {
    const state = harness.getState();
    return state.library.some(b => b.title.includes("白鯨"));
  });
});
```
</test_utilities>

<checklist>
## テストチェックリスト

自動テスト：
- [ ] 各UIアクションの「エージェントはできるか？」テスト
- [ ] 場所認識テスト（「フィードに書いて」）
- [ ] パリティテスト（ツールが存在し、プロンプトに文書化）
- [ ] コンテキストパリティテスト（エージェントはUIが表示するものを見れる）
- [ ] エンドツーエンドフローテスト
- [ ] 失敗復旧テスト

手動テスト：
- [ ] 自然言語バリエーション（複数のフレーズが機能）
- [ ] エッジケースプロンプト（オープンエンドなリクエスト）
- [ ] 混乱テスト（エージェントはアプリの語彙を知っている）
- [ ] サプライズテスト（エージェントは創造的になれる）

CI統合：
- [ ] パリティテストがすべてのPRで実行
- [ ] 能力テストがAPIキーで実行
- [ ] システムプロンプトの完全性チェック
- [ ] 能力マップのドリフト検出
</checklist>
