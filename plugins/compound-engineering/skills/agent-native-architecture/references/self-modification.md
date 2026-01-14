<overview>
自己修正はエージェントネイティブエンジニアリングの上級ティア：自身のコード、プロンプト、動作を進化させることができるエージェント。すべてのアプリに必要というわけではないが、未来の大きな部分。

これは「開発者ができることは何でもエージェントもできる」の論理的拡張。
</overview>

<why_self_modification>
## なぜ自己修正なのか？

従来のソフトウェアは静的—書いたことをそのまま実行し、それ以上のことはしない。自己修正エージェントは以下が可能：

- **自身のバグを修正** - エラーを見て、コードをパッチし、再起動
- **新しい機能を追加** - ユーザーが新しいことを要求、エージェントが実装
- **動作を進化** - フィードバックから学び、プロンプトを調整
- **自身をデプロイ** - コードをプッシュ、ビルドをトリガー、再起動

エージェントは凍結されたコードではなく、時間とともに改善する生きたシステムになる。
</why_self_modification>

<capabilities>
## 自己修正が可能にすること

**コード修正：**
- ソースファイルを読んで理解
- 修正と新機能を書く
- バージョン管理にコミットしてプッシュ
- ビルドをトリガーしてパスを確認

**プロンプト進化：**
- フィードバックに基づいてシステムプロンプトを編集
- プロンプトセクションとして新機能を追加
- 機能していない判断基準を改善

**インフラストラクチャ制御：**
- アップストリームから最新コードをプル
- 他のブランチ/インスタンスからマージ
- 変更後に再起動
- 何か壊れたらロールバック

**サイト/出力生成：**
- ウェブサイトを生成して維持
- ドキュメントを作成
- データからダッシュボードを構築
</capabilities>

<guardrails>
## 必須のガードレール

自己修正は強力。安全メカニズムが必要。

**コード変更の承認ゲート：**
```typescript
tool("write_file", async ({ path, content }) => {
  if (isCodeFile(path)) {
    // 承認のために保存、すぐには適用しない
    pendingChanges.set(path, content);
    const diff = generateDiff(path, content);
    return { text: `承認が必要：\n\n${diff}\n\n適用するには"yes"と返信。` };
  }
  // コード以外のファイルはすぐに適用
  writeFileSync(path, content);
  return { text: `Wrote ${path}` };
});
```

**変更前の自動コミット：**
```typescript
tool("self_deploy", async () => {
  // まず現在の状態を保存
  runGit("stash");  // またはコミットされていない変更をコミット

  // その後pull/merge
  runGit("fetch origin");
  runGit("merge origin/main --no-edit");

  // ビルドして確認
  runCommand("npm run build");

  // その後のみ再起動
  scheduleRestart();
});
```

**ビルド検証：**
```typescript
// ビルドがパスしない限り再起動しない
try {
  runCommand("npm run build", { timeout: 120000 });
} catch (error) {
  // マージをロールバック
  runGit("merge --abort");
  return { text: "ビルド失敗、デプロイを中止", isError: true };
}
```

**再起動後のヘルスチェック：**
```typescript
tool("health_check", async () => {
  const uptime = process.uptime();
  const buildValid = existsSync("dist/index.js");
  const gitClean = !runGit("status --porcelain");

  return {
    text: JSON.stringify({
      status: "healthy",
      uptime: `${Math.floor(uptime / 60)}m`,
      build: buildValid ? "valid" : "missing",
      git: gitClean ? "clean" : "uncommitted changes",
    }, null, 2),
  };
});
```
</guardrails>

<git_architecture>
## Gitベースの自己修正

gitを自己修正の基盤として使用。以下を提供：
- バージョン履歴（ロールバック機能）
- ブランチ（安全に実験）
- マージ（他のインスタンスと同期）
- プッシュ/プル（デプロイとコラボレーション）

**必須のgitツール：**
```typescript
tool("status", "Show git status", {}, ...);
tool("diff", "Show file changes", { path: z.string().optional() }, ...);
tool("log", "Show commit history", { count: z.number() }, ...);
tool("commit_code", "Commit code changes", { message: z.string() }, ...);
tool("git_push", "Push to GitHub", { branch: z.string().optional() }, ...);
tool("pull", "Pull from GitHub", { source: z.enum(["main", "instance"]) }, ...);
tool("rollback", "Revert recent commits", { commits: z.number() }, ...);
```

**マルチインスタンスアーキテクチャ：**
```
main                      # 共有コード
├── instance/bot-a       # インスタンスAのブランチ
├── instance/bot-b       # インスタンスBのブランチ
└── instance/bot-c       # インスタンスCのブランチ
```

各インスタンスが可能：
- mainから更新をプル
- 改善をmainにプッシュバック（PR経由）
- 他のインスタンスから機能を同期
- インスタンス固有の設定を維持
</git_architecture>

<prompt_evolution>
## 自己修正プロンプト

システムプロンプトはエージェントが読み書きできるファイル。

```typescript
// エージェントは自身のプロンプトを読める
tool("read_file", ...);  // src/prompts/system.mdを読める

// エージェントは変更を提案できる
tool("write_file", ...);  // src/prompts/system.mdに書ける（承認付き）
```

**生きたドキュメントとしてのシステムプロンプト：**
```markdown
## フィードバック処理

誰かがフィードバックを共有したとき：
1. 温かく認める
2. 重要度を1-5で評価
3. フィードバックツールを使用して保存

<!-- 自分へのメモ：ビデオウォークスルーは常に4-5にすべき、
     2024-12-07のDanのフィードバックから学んだ -->
```

エージェントが可能：
- 自分自身にメモを追加
- 判断基準を改善
- 新しい機能セクションを追加
- 学んだエッジケースを文書化
</prompt_evolution>

<when_to_use>
## 自己修正をいつ実装するか

**良い候補：**
- 長時間実行される自律エージェント
- フィードバックに適応する必要があるエージェント
- 動作の進化が価値あるシステム
- 迅速な反復が重要な内部ツール

**必要ない場合：**
- シンプルな単一タスクエージェント
- 高度に規制された環境
- 動作が監査可能でなければならないシステム
- 一回限りまたは短命のエージェント

まず自己修正しないプロンプトネイティブエージェントから始める。必要になったら自己修正を追加。
</when_to_use>

<example_tools>
## 完全な自己修正ツールセット

```typescript
const selfMcpServer = createSdkMcpServer({
  name: "self",
  version: "1.0.0",
  tools: [
    // ファイル操作
    tool("read_file", "Read any project file", { path: z.string() }, ...),
    tool("write_file", "Write a file (code requires approval)", { path, content }, ...),
    tool("list_files", "List directory contents", { path: z.string() }, ...),
    tool("search_code", "Search for patterns", { pattern: z.string() }, ...),

    // 承認ワークフロー
    tool("apply_pending", "Apply approved changes", {}, ...),
    tool("get_pending", "Show pending changes", {}, ...),
    tool("clear_pending", "Discard pending changes", {}, ...),

    // 再起動
    tool("restart", "Rebuild and restart", {}, ...),
    tool("health_check", "Check if bot is healthy", {}, ...),
  ],
});

const gitMcpServer = createSdkMcpServer({
  name: "git",
  version: "1.0.0",
  tools: [
    // ステータス
    tool("status", "Show git status", {}, ...),
    tool("diff", "Show changes", { path: z.string().optional() }, ...),
    tool("log", "Show history", { count: z.number() }, ...),

    // コミット＆プッシュ
    tool("commit_code", "Commit code changes", { message: z.string() }, ...),
    tool("git_push", "Push to GitHub", { branch: z.string().optional() }, ...),

    // 同期
    tool("pull", "Pull from upstream", { source: z.enum(["main", "instance"]) }, ...),
    tool("self_deploy", "Pull, build, restart", { source: z.enum(["main", "instance"]) }, ...),

    // 安全
    tool("rollback", "Revert commits", { commits: z.number() }, ...),
    tool("health_check", "Detailed health report", {}, ...),
  ],
});
```
</example_tools>

<checklist>
## 自己修正チェックリスト

自己修正を有効にする前に：
- [ ] Gitベースのバージョン管理をセットアップ
- [ ] コード変更の承認ゲート
- [ ] 再起動前のビルド検証
- [ ] ロールバックメカニズムが利用可能
- [ ] ヘルスチェックエンドポイント
- [ ] インスタンスIDを設定

実装時：
- [ ] エージェントがすべてのプロジェクトファイルを読める
- [ ] エージェントがファイルを書ける（適切な承認付き）
- [ ] エージェントがコミットしてプッシュできる
- [ ] エージェントが更新をプルできる
- [ ] エージェントが自身を再起動できる
- [ ] エージェントが必要に応じてロールバックできる
</checklist>
