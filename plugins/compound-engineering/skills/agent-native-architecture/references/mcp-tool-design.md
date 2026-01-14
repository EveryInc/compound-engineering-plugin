<overview>
プロンプトネイティブの原則に従ってMCPツールを設計する方法。ツールは能力を有効にするプリミティブであるべきで、決定をエンコードするワークフローではありません。

**コア原則:** ユーザーができることは何でも、エージェントもできるべき。エージェントを人為的に制限しない—パワーユーザーが持つのと同じプリミティブを与える。
</overview>

<principle name="primitives-not-workflows">
## ツールはワークフローではなくプリミティブ

**誤ったアプローチ:** ビジネスロジックをエンコードするツール
```typescript
tool("process_feedback", {
  feedback: z.string(),
  category: z.enum(["bug", "feature", "question"]),
  priority: z.enum(["low", "medium", "high"]),
}, async ({ feedback, category, priority }) => {
  // ツールが処理方法を決定
  const processed = categorize(feedback);
  const stored = await saveToDatabase(processed);
  const notification = await notify(priority);
  return { processed, stored, notification };
});
```

**正しいアプローチ:** 任意のワークフローを可能にするプリミティブ
```typescript
tool("store_item", {
  key: z.string(),
  value: z.any(),
}, async ({ key, value }) => {
  await db.set(key, value);
  return { text: `${key}を保存しました` };
});

tool("send_message", {
  channel: z.string(),
  content: z.string(),
}, async ({ channel, content }) => {
  await messenger.send(channel, content);
  return { text: "送信しました" };
});
```

エージェントはシステムプロンプトに基づいて分類、優先度、通知タイミングを決定。
</principle>

<principle name="descriptive-names">
## ツールには説明的でプリミティブな名前を

名前はユースケースではなく、能力を説明すべき:

| 誤り | 正解 |
|-------|-------|
| `process_user_feedback` | `store_item` |
| `create_feedback_summary` | `write_file` |
| `send_notification` | `send_message` |
| `deploy_to_production` | `git_push` |

プロンプトがエージェントに*いつ*プリミティブを使うかを伝える。ツールは*能力*だけを提供。
</principle>

<principle name="simple-inputs">
## 入力はシンプルに

ツールはデータを受け取る。決定は受け取らない。

**誤り:** ツールが決定を受け取る
```typescript
tool("format_content", {
  content: z.string(),
  format: z.enum(["markdown", "html", "json"]),
  style: z.enum(["formal", "casual", "technical"]),
}, ...)
```

**正解:** ツールがデータを受け取り、エージェントがフォーマットを決定
```typescript
tool("write_file", {
  path: z.string(),
  content: z.string(),
}, ...)
// エージェントがHTMLコンテンツでindex.htmlを書くか、JSONでdata.jsonを書くかを決定
```
</principle>

<principle name="rich-outputs">
## 出力はリッチに

エージェントが検証して反復するのに十分な情報を返す。

**誤り:** 最小限の出力
```typescript
async ({ key }) => {
  await db.delete(key);
  return { text: "削除しました" };
}
```

**正解:** リッチな出力
```typescript
async ({ key }) => {
  const existed = await db.has(key);
  if (!existed) {
    return { text: `キー${key}は存在しませんでした` };
  }
  await db.delete(key);
  return { text: `${key}を削除しました。残り${await db.count()}アイテム。` };
}
```
</principle>

<design_template>
## ツール設計テンプレート

```typescript
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

export const serverName = createSdkMcpServer({
  name: "server-name",
  version: "1.0.0",
  tools: [
    // READ操作
    tool(
      "read_item",
      "キーでアイテムを読む",
      { key: z.string().describe("アイテムキー") },
      async ({ key }) => {
        const item = await storage.get(key);
        return {
          content: [{
            type: "text",
            text: item ? JSON.stringify(item, null, 2) : `見つかりません: ${key}`,
          }],
          isError: !item,
        };
      }
    ),

    tool(
      "list_items",
      "すべてのアイテムを一覧表示、オプションでフィルタ",
      {
        prefix: z.string().optional().describe("キープレフィックスでフィルタ"),
        limit: z.number().default(100).describe("最大アイテム数"),
      },
      async ({ prefix, limit }) => {
        const items = await storage.list({ prefix, limit });
        return {
          content: [{
            type: "text",
            text: `${items.length}件見つかりました:\n${items.map(i => i.key).join("\n")}`,
          }],
        };
      }
    ),

    // WRITE操作
    tool(
      "store_item",
      "アイテムを保存",
      {
        key: z.string().describe("アイテムキー"),
        value: z.any().describe("アイテムデータ"),
      },
      async ({ key, value }) => {
        await storage.set(key, value);
        return {
          content: [{ type: "text", text: `${key}を保存しました` }],
        };
      }
    ),

    tool(
      "delete_item",
      "アイテムを削除",
      { key: z.string().describe("アイテムキー") },
      async ({ key }) => {
        const existed = await storage.delete(key);
        return {
          content: [{
            type: "text",
            text: existed ? `${key}を削除しました` : `${key}は存在しませんでした`,
          }],
        };
      }
    ),

    // EXTERNAL操作
    tool(
      "call_api",
      "HTTPリクエストを行う",
      {
        url: z.string().url(),
        method: z.enum(["GET", "POST", "PUT", "DELETE"]).default("GET"),
        body: z.any().optional(),
      },
      async ({ url, method, body }) => {
        const response = await fetch(url, { method, body: JSON.stringify(body) });
        const text = await response.text();
        return {
          content: [{
            type: "text",
            text: `${response.status} ${response.statusText}\n\n${text}`,
          }],
          isError: !response.ok,
        };
      }
    ),
  ],
});
```
</design_template>

<example name="feedback-server">
## 例: フィードバックストレージサーバー

このサーバーはフィードバックを保存するためのプリミティブを提供します。フィードバックの分類や整理方法を決定しません—それはプロンプト経由でエージェントの仕事です。

```typescript
export const feedbackMcpServer = createSdkMcpServer({
  name: "feedback",
  version: "1.0.0",
  tools: [
    tool(
      "store_feedback",
      "フィードバックアイテムを保存",
      {
        item: z.object({
          id: z.string(),
          author: z.string(),
          content: z.string(),
          importance: z.number().min(1).max(5),
          timestamp: z.string(),
          status: z.string().optional(),
          urls: z.array(z.string()).optional(),
          metadata: z.any().optional(),
        }).describe("フィードバックアイテム"),
      },
      async ({ item }) => {
        await db.feedback.insert(item);
        return {
          content: [{
            type: "text",
            text: `フィードバック${item.id}を${item.author}から保存しました`,
          }],
        };
      }
    ),

    tool(
      "list_feedback",
      "フィードバックアイテムを一覧表示",
      {
        limit: z.number().default(50),
        status: z.string().optional(),
      },
      async ({ limit, status }) => {
        const items = await db.feedback.list({ limit, status });
        return {
          content: [{
            type: "text",
            text: JSON.stringify(items, null, 2),
          }],
        };
      }
    ),

    tool(
      "update_feedback",
      "フィードバックアイテムを更新",
      {
        id: z.string(),
        updates: z.object({
          status: z.string().optional(),
          importance: z.number().optional(),
          metadata: z.any().optional(),
        }),
      },
      async ({ id, updates }) => {
        await db.feedback.update(id, updates);
        return {
          content: [{ type: "text", text: `${id}を更新しました` }],
        };
      }
    ),
  ],
});
```

システムプロンプトがエージェントにこれらのプリミティブの*使い方*を伝える:

```markdown
## フィードバック処理

誰かがフィードバックを共有したとき:
1. 作者、内容、URLを抽出
2. アクション可能性に基づいて重要度を1-5で評価
3. feedback.store_feedbackを使用して保存
4. 高重要度（4-5）ならチャンネルに通知

重要度評価については自分の判断を使用。
```
</example>

<principle name="dynamic-capability-discovery">
## 動的能力発見 vs 静的ツールマッピング

**このパターンは、エージェントに外部APIへのフルアクセスを持たせたいエージェントネイティブアプリ専用です**—ユーザーが持つのと同じアクセス。これはコアエージェントネイティブ原則に従います: 「ユーザーができることは、エージェントもできる。」

限られた能力を持つ制約されたエージェントを構築している場合、静的ツールマッピングは意図的かもしれません。しかしHealthKit、HomeKit、GraphQL、または類似のAPIと統合するエージェントネイティブアプリの場合:

**静的ツールマッピング（エージェントネイティブのアンチパターン）:**
各API能力に対して個別のツールを構築。常に古く、エージェントを予測したものだけに制限。

```typescript
// ❌ 静的: すべてのAPIタイプにハードコードされたツールが必要
tool("read_steps", async ({ startDate, endDate }) => {
  return healthKit.query(HKQuantityType.stepCount, startDate, endDate);
});

tool("read_heart_rate", async ({ startDate, endDate }) => {
  return healthKit.query(HKQuantityType.heartRate, startDate, endDate);
});

tool("read_sleep", async ({ startDate, endDate }) => {
  return healthKit.query(HKCategoryType.sleepAnalysis, startDate, endDate);
});

// HealthKitがグルコーストラッキングを追加したら...コード変更が必要
```

**動的能力発見（推奨）:**
利用可能なものを発見するメタツールと、何にでもアクセスできる汎用ツールを構築。

```typescript
// ✅ 動的: エージェントが任意の能力を発見して使用
// 発見ツール - ランタイムで利用可能なものを返す
tool("list_available_capabilities", async () => {
  const quantityTypes = await healthKit.availableQuantityTypes();
  const categoryTypes = await healthKit.availableCategoryTypes();

  return {
    text: `利用可能なヘルスメトリクス:\n` +
          `量タイプ: ${quantityTypes.join(", ")}\n` +
          `カテゴリタイプ: ${categoryTypes.join(", ")}\n` +
          `\nこれらのタイプでread_health_dataを使用。`
  };
});

// 汎用アクセスツール - タイプは文字列、APIが検証
tool("read_health_data", {
  dataType: z.string(),  // z.enumではない - HealthKitに検証させる
  startDate: z.string(),
  endDate: z.string(),
  aggregation: z.enum(["sum", "average", "samples"]).optional()
}, async ({ dataType, startDate, endDate, aggregation }) => {
  // HealthKitがタイプを検証、無効なら役立つエラーを返す
  const result = await healthKit.query(dataType, startDate, endDate, aggregation);
  return { text: JSON.stringify(result, null, 2) };
});
```

**各アプローチをいつ使用するか:**

| 動的（エージェントネイティブ） | 静的（制約されたエージェント） |
|------------------------|---------------------------|
| エージェントがユーザーができることすべてにアクセスすべき | エージェントが意図的に限定されたスコープ |
| 多くのエンドポイントを持つ外部API（HealthKit、HomeKit、GraphQL） | 固定された操作を持つ内部ドメイン |
| APIがコードから独立して進化 | 密結合されたドメインロジック |
| フルアクションパリティが欲しい | 厳格なガードレールが欲しい |

**エージェントネイティブのデフォルトは動的。** 静的は意図的にエージェントの能力を制限する場合のみ使用。

**完全な動的パターン:**

```swift
// 1. 発見ツール: 何にアクセスできるか？
tool("list_health_types", "利用可能なヘルスデータタイプを取得") { _ in
    let store = HKHealthStore()

    let quantityTypes = HKQuantityTypeIdentifier.allCases.map { $0.rawValue }
    let categoryTypes = HKCategoryTypeIdentifier.allCases.map { $0.rawValue }
    let characteristicTypes = HKCharacteristicTypeIdentifier.allCases.map { $0.rawValue }

    return ToolResult(text: """
        利用可能なHealthKitタイプ:

        ## 量タイプ（数値）
        \(quantityTypes.joined(separator: ", "))

        ## カテゴリタイプ（カテゴリデータ）
        \(categoryTypes.joined(separator: ", "))

        ## 特性タイプ（ユーザー情報）
        \(characteristicTypes.joined(separator: ", "))

        これらでread_health_dataまたはwrite_health_dataを使用。
        """)
}

// 2. 汎用読み取り: 名前で任意のタイプにアクセス
tool("read_health_data", "任意のヘルスメトリクスを読む", {
    dataType: z.string().describe("list_health_typesからのタイプ名"),
    startDate: z.string(),
    endDate: z.string()
}) { request in
    // HealthKitにタイプ名を検証させる
    guard let type = HKQuantityTypeIdentifier(rawValue: request.dataType)
                     ?? HKCategoryTypeIdentifier(rawValue: request.dataType) else {
        return ToolResult(
            text: "不明なタイプ: \(request.dataType)。利用可能なタイプを見るにはlist_health_typesを使用。",
            isError: true
        )
    }

    let samples = try await healthStore.querySamples(type: type, start: startDate, end: endDate)
    return ToolResult(text: samples.formatted())
}

// 3. コンテキスト注入: システムプロンプトで利用可能なものをエージェントに伝える
func buildSystemPrompt() -> String {
    let availableTypes = healthService.getAuthorizedTypes()

    return """
    ## 利用可能なヘルスデータ

    これらのヘルスメトリクスにアクセスできます:
    \(availableTypes.map { "- \($0)" }.joined(separator: "\n"))

    上記の任意のタイプでread_health_dataを使用。リストにない新しいタイプについては、
    list_health_typesを使用して利用可能なものを発見。
    """
}
```

**利点:**
- エージェントはコードが出荷された後に追加されたものを含む、任意のAPI能力を使用できる
- あなたのenum定義ではなくAPIがバリデータ
- 小さいツールサーフェス（Nツールではなく2-3ツール）
- エージェントは尋ねることで自然に能力を発見
- イントロスペクションを持つ任意のAPI（HealthKit、GraphQL、OpenAPI）で機能
</principle>

<principle name="crud-completeness">
## CRUDの完全性

エージェントが作成できるすべてのデータタイプは、読み取り、更新、削除もできるべき。不完全なCRUD = 壊れたアクションパリティ。

**アンチパターン: 作成のみのツール**
```typescript
// ❌ 作成できるが修正や削除はできない
tool("create_experiment", { hypothesis, variable, metric })
tool("write_journal_entry", { content, author, tags })
// ユーザー: 「その実験を削除して」 → エージェント: 「それはできません」
```

**正解: 各エンティティにフルCRUD**
```typescript
// ✅ 完全なCRUD
tool("create_experiment", { hypothesis, variable, metric })
tool("read_experiment", { id })
tool("update_experiment", { id, updates: { hypothesis?, status?, endDate? } })
tool("delete_experiment", { id })

tool("create_journal_entry", { content, author, tags })
tool("read_journal", { query?, dateRange?, author? })
tool("update_journal_entry", { id, content, tags? })
tool("delete_journal_entry", { id })
```

**CRUDの監査:**
アプリの各エンティティタイプについて検証:
- [ ] 作成: エージェントが新しいインスタンスを作成できる
- [ ] 読み取り: エージェントがクエリ/検索/一覧表示できる
- [ ] 更新: エージェントが既存のインスタンスを修正できる
- [ ] 削除: エージェントがインスタンスを削除できる

いずれかの操作が欠けていると、ユーザーは最終的にそれを求め、エージェントは失敗します。
</principle>

<checklist>
## MCPツール設計チェックリスト

**基本:**
- [ ] ツール名はユースケースではなく能力を説明
- [ ] 入力は決定ではなくデータ
- [ ] 出力はリッチ（エージェントが検証するのに十分）
- [ ] CRUD操作は別々のツール（1つのメガツールではない）
- [ ] ツール実装にビジネスロジックなし
- [ ] エラー状態は`isError`で明確に伝達
- [ ] 説明はいつ使うかではなく、何をするかを説明

**動的能力発見（エージェントネイティブアプリ用）:**
- [ ] エージェントがフルアクセスを持つべき外部APIには動的発見を使用
- [ ] 各APIサーフェスに`list_*`または`discover_*`ツールを含む
- [ ] APIが検証する場合、文字列入力を使用（enumではない）
- [ ] 利用可能な能力をランタイムでシステムプロンプトに注入
- [ ] 静的ツールマッピングは意図的にエージェントスコープを制限する場合のみ使用

**CRUDの完全性:**
- [ ] すべてのエンティティに作成、読み取り、更新、削除操作がある
- [ ] すべてのUIアクションに対応するエージェントツールがある
- [ ] テスト: 「エージェントは今したことを取り消せるか？」
</checklist>
