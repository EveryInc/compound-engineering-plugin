<overview>
既存のエージェントコードをプロンプトネイティブ原則に従うようにリファクタリングする方法。目標：動作をコードからプロンプトに移動し、ツールをプリミティブに簡素化する。
</overview>

<diagnosis>
## 非プロンプトネイティブコードの診断

エージェントがプロンプトネイティブでない兆候：

**ワークフローをエンコードしているツール：**
```typescript
// 危険信号：ツールにビジネスロジックが含まれている
tool("process_feedback", async ({ message }) => {
  const category = categorize(message);        // コード内のロジック
  const priority = calculatePriority(message); // コード内のロジック
  await store(message, category, priority);    // コード内のオーケストレーション
  if (priority > 3) await notify();            // コード内の決定
});
```

**エージェントが物事を判断する代わりに関数を呼び出している：**
```typescript
// 危険信号：エージェントが単なる関数呼び出し器になっている
"受信メッセージを処理するにはprocess_feedbackを使用"
// vs.
"フィードバックが来たら、重要度を判断し、保存し、高ければ通知"
```

**エージェント能力に人為的な制限：**
```typescript
// 危険信号：ツールがエージェントにユーザーができることをさせない
tool("read_file", async ({ path }) => {
  if (!ALLOWED_PATHS.includes(path)) {
    throw new Error("このファイルの読み取りは許可されていません");
  }
  return readFile(path);
});
```

**WHATではなくHOWを指定するプロンプト：**
```markdown
// 危険信号：エージェントを細かく管理している
要約を作成するとき：
1. 正確に3つの箇条書きを使用
2. 各箇条書きは20語以下
3. サブポイントにはemダッシュでフォーマット
4. 各箇条書きの最初の単語を太字に
```
</diagnosis>

<refactoring_workflow>
## ステップバイステップのリファクタリング

**ステップ1：ワークフローツールを特定**

すべてのツールをリストアップ。以下に該当するものをマーク：
- ビジネスロジックがある（分類、計算、決定）
- 複数の操作をオーケストレーションしている
- エージェントの代わりに決定を下している
- 条件付きロジックを含む（内容に基づくif/else）

**ステップ2：プリミティブを抽出**

各ワークフローツールについて、基盤となるプリミティブを特定：

| ワークフローツール | 隠れたプリミティブ |
|-------------------|-------------------|
| `process_feedback` | `store_item`, `send_message` |
| `generate_report` | `read_file`, `write_file` |
| `deploy_and_notify` | `git_push`, `send_message` |

**ステップ3：動作をプロンプトに移動**

ワークフローツールからロジックを取り出し、自然言語で表現：

```typescript
// 前（コード内）：
async function processFeedback(message) {
  const priority = message.includes("crash") ? 5 :
                   message.includes("bug") ? 4 : 3;
  await store(message, priority);
  if (priority >= 4) await notify();
}
```

```markdown
// 後（プロンプト内）：
## フィードバック処理

誰かがフィードバックを共有したとき：
1. 重要度を1-5で評価：
   - 5：クラッシュ、データ損失、セキュリティ問題
   - 4：明確な再現手順のあるバグレポート
   - 3：一般的な提案、軽微な問題
2. store_itemを使用して保存
3. 重要度が4以上の場合、チームに通知

判断を使用。キーワードよりコンテキストが重要。
```

**ステップ4：ツールをプリミティブに簡素化**

```typescript
// 前：1つのワークフローツール
tool("process_feedback", { message, category, priority }, ...複雑なロジック...)

// 後：2つのプリミティブツール
tool("store_item", { key: z.string(), value: z.any() }, ...シンプルなストレージ...)
tool("send_message", { channel: z.string(), content: z.string() }, ...シンプルな送信...)
```

**ステップ5：人為的な制限を削除**

```typescript
// 前：制限された能力
tool("read_file", async ({ path }) => {
  if (!isAllowed(path)) throw new Error("禁止");
  return readFile(path);
});

// 後：完全な能力
tool("read_file", async ({ path }) => {
  return readFile(path);  // エージェントは何でも読める
});
// 読み取りへの人為的な制限ではなく、書き込みに承認ゲートを使用
```

**ステップ6：手順ではなく結果でテスト**

「正しい関数を呼び出しているか？」ではなく「結果を達成しているか？」をテスト

```typescript
// 前：手順のテスト
expect(mockProcessFeedback).toHaveBeenCalledWith(...)

// 後：結果のテスト
// フィードバックを送信 → 妥当な重要度で保存されたか確認
// 高優先度フィードバックを送信 → 通知が送信されたか確認
```
</refactoring_workflow>

<before_after>
## 前後の例

**例1：フィードバック処理**

前：
```typescript
tool("handle_feedback", async ({ message, author }) => {
  const category = detectCategory(message);
  const priority = calculatePriority(message, category);
  const feedbackId = await db.feedback.insert({
    id: generateId(),
    author,
    message,
    category,
    priority,
    timestamp: new Date().toISOString(),
  });

  if (priority >= 4) {
    await discord.send(ALERT_CHANNEL, `High priority feedback from ${author}`);
  }

  return { feedbackId, category, priority };
});
```

後：
```typescript
// シンプルなストレージプリミティブ
tool("store_feedback", async ({ item }) => {
  await db.feedback.insert(item);
  return { text: `Stored feedback ${item.id}` };
});

// シンプルなメッセージプリミティブ
tool("send_message", async ({ channel, content }) => {
  await discord.send(channel, content);
  return { text: "Sent" };
});
```

システムプロンプト：
```markdown
## フィードバック処理

誰かがフィードバックを共有したとき：
1. ユニークなIDを生成
2. 影響度と緊急性に基づいて重要度を1-5で評価
3. store_feedbackを使用してアイテム全体を保存
4. 重要度が4以上の場合、チームチャンネルに通知を送信

重要度のガイドライン：
- 5：クリティカル（クラッシュ、データ損失、セキュリティ）
- 4：高（詳細なバグレポート、ブロッキング問題）
- 3：中（提案、軽微なバグ）
- 2：低（見た目、エッジケース）
- 1：最小（オフトピック、重複）
```

**例2：レポート生成**

前：
```typescript
tool("generate_weekly_report", async ({ startDate, endDate, format }) => {
  const data = await fetchMetrics(startDate, endDate);
  const summary = summarizeMetrics(data);
  const charts = generateCharts(data);

  if (format === "html") {
    return renderHtmlReport(summary, charts);
  } else if (format === "markdown") {
    return renderMarkdownReport(summary, charts);
  } else {
    return renderPdfReport(summary, charts);
  }
});
```

後：
```typescript
tool("query_metrics", async ({ start, end }) => {
  const data = await db.metrics.query({ start, end });
  return { text: JSON.stringify(data, null, 2) };
});

tool("write_file", async ({ path, content }) => {
  writeFileSync(path, content);
  return { text: `Wrote ${path}` };
});
```

システムプロンプト：
```markdown
## レポート生成

レポートの生成を依頼されたとき：
1. query_metricsを使用して関連メトリクスをクエリ
2. データを分析し、主要なトレンドを特定
3. 明確で適切にフォーマットされたレポートを作成
4. write_fileを使用して適切なフォーマットで書き出す

フォーマットと構造については判断を使用。有用なものにする。
```
</before_after>

<common_challenges>
## よくあるリファクタリングの課題

**「でもエージェントがミスするかも！」**

はい、そして反復できます。ガイダンスを追加するようにプロンプトを変更：
```markdown
// 前
重要度を1-5で評価。

// 後（エージェントが高く評価しすぎる場合）
重要度を1-5で評価。控えめに—ほとんどのフィードバックは2-3。
本当にブロッキングまたはクリティカルな問題にのみ4-5を使用。
```

**「ワークフローが複雑！」**

複雑なワークフローもプロンプトで表現できます。エージェントは賢い。
```markdown
ビデオフィードバックを処理するとき：
1. Loom、YouTube、または直接リンクかを確認
2. YouTubeの場合、URLをそのままビデオ分析に渡す
3. その他の場合、まずダウンロードしてから分析
4. タイムスタンプ付きの問題を抽出
5. 問題の密度と深刻度に基づいて評価
```

**「決定論的な動作が必要！」**

一部の操作はコードに残すべき。それは問題ない。プロンプトネイティブはオールオアナッシングではない。

コードに残す：
- セキュリティ検証
- レート制限
- 監査ログ
- 正確なフォーマット要件

プロンプトに移動：
- 分類の決定
- 優先度の判断
- コンテンツ生成
- ワークフローオーケストレーション

**「テストはどうする？」**

手順ではなく結果をテスト：
- 「この入力が与えられたとき、エージェントは正しい結果を達成するか？」
- 「保存されたフィードバックは妥当な重要度評価を持っているか？」
- 「本当に高優先度のアイテムに通知が送信されているか？」
</common_challenges>

<checklist>
## リファクタリングチェックリスト

診断：
- [ ] ビジネスロジックを持つすべてのツールをリスト化
- [ ] エージェント能力への人為的な制限を特定
- [ ] HOWを細かく管理しているプロンプトを発見

リファクタリング：
- [ ] ワークフローツールからプリミティブを抽出
- [ ] ビジネスロジックをシステムプロンプトに移動
- [ ] 人為的な制限を削除
- [ ] ツール入力を決定ではなくデータに簡素化

検証：
- [ ] エージェントがプリミティブで同じ結果を達成
- [ ] プロンプトを編集することで動作を変更可能
- [ ] 新しいツールなしで新機能を追加可能
</checklist>
