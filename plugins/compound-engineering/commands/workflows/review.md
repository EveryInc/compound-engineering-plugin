---
name: workflows:review
description: マルチエージェント分析、ウルトラシンキング、worktreeを使用して徹底的なコードレビューを実行する
argument-hint: "[PR番号、GitHub URL、ブランチ名、またはlatest]"
---

# レビューコマンド

<command_purpose> マルチエージェント分析、ウルトラシンキング、およびGit worktreeを使用して徹底的なコードレビューを実行し、深いローカル検査を行う。 </command_purpose>

## はじめに

<role>セキュリティ、パフォーマンス、アーキテクチャ、品質保証の専門知識を持つシニアコードレビューアーキテクト</role>

## 前提条件

<requirements>
- GitHub CLI（`gh`）がインストールされ認証されたGitリポジトリ
- クリーンなmain/masterブランチ
- worktreeを作成しリポジトリにアクセスする適切な権限
- ドキュメントレビューの場合：マークダウンファイルまたはドキュメントへのパス
</requirements>

## 主要タスク

### 1. レビュー対象の決定 & セットアップ（常に最初）

<review_target> #$ARGUMENTS </review_target>

<thinking>
まず、レビュー対象タイプを決定し、分析用にコードをセットアップする必要があります。
</thinking>

#### 即座のアクション：

<task_list>

- [ ] レビュータイプを決定：PR番号（数値）、GitHub URL、ファイルパス（.md）、または空（現在のブランチ）
- [ ] 現在のgitブランチをチェック
- [ ] すでにPRブランチにいる場合 → 現在のブランチで分析を進める
- [ ] 異なるブランチの場合 → worktreeの使用を提案：「分離のためにgit-worktreeスキルを使用」`skill: git-worktree`をブランチ名で呼び出す
- [ ] `gh pr view --json`でPRメタデータを取得（タイトル、本文、ファイル、リンクされたイシュー）
- [ ] 言語固有の分析ツールをセットアップ
- [ ] セキュリティスキャン環境を準備
- [ ] レビュー対象のブランチにいることを確認。gh pr checkoutでブランチに切り替えるか、手動でブランチをcheckout。

コードが分析準備完了（worktreeまたは現在のブランチ）であることを確認。そうして初めて次のステップに進む。

</task_list>

#### PRをレビューする並列エージェント：

<parallel_tasks>

これらのエージェントをすべてまたはほとんど同時に実行：

1. Task kieran-rails-reviewer(PR content)
2. Task dhh-rails-reviewer(PR title)
3. turboが使用されている場合：Task rails-turbo-expert(PR content)
4. Task git-history-analyzer(PR content)
5. Task dependency-detective(PR content)
6. Task pattern-recognition-specialist(PR content)
7. Task architecture-strategist(PR content)
8. Task code-philosopher(PR content)
9. Task security-sentinel(PR content)
10. Task performance-oracle(PR content)
11. Task devops-harmony-analyst(PR content)
12. Task data-integrity-guardian(PR content)
13. Task agent-native-reviewer(PR content) - 新機能がエージェントアクセス可能か確認

</parallel_tasks>

#### 条件付きエージェント（該当する場合に実行）：

<conditional_agents>

これらのエージェントはPRが特定の基準に一致する場合にのみ実行。PRファイルリストをチェックして適用されるか判断：

**PRにデータベースマイグレーション（db/migrate/*.rbファイル）またはデータバックフィルが含まれる場合：**

14. Task data-migration-expert(PR content) - IDマッピングが本番環境と一致することを検証、値の入れ替えをチェック、ロールバックの安全性を確認
15. Task deployment-verification-agent(PR content) - SQL検証クエリを含むGo/No-Goデプロイメントチェックリストを作成

**マイグレーションエージェントを実行するタイミング：**
- PRに`db/migrate/*.rb`に一致するファイルが含まれる
- PRがID、enum、またはマッピングを格納するカラムを変更
- PRにデータバックフィルスクリプトまたはrakeタスクが含まれる
- PRがデータの読み書き方法を変更（例：FKから文字列カラムへの変更）
- PRタイトル/本文に言及：migration、backfill、data transformation、ID mapping

**これらのエージェントがチェックする内容：**
- `data-migration-expert`: ハードコードされたマッピングが本番環境の実態と一致することを確認（IDの入れ替えを防止）、孤立した関連付けをチェック、デュアルライトパターンを検証
- `deployment-verification-agent`: 実行可能なpre/postデプロイチェックリスト、SQLクエリ、ロールバック手順、監視プランを作成

</conditional_agents>

### 4. ウルトラシンキング深掘りフェーズ

<ultrathink_instruction> 以下の各フェーズで最大の認知努力を費やす。ステップバイステップで考える。すべての角度を検討。仮定に疑問を呈する。そしてすべてのレビューをユーザーへの統合に持ち込む。</ultrathink_instruction>

<deliverable>
コンポーネント間のインタラクションを含む完全なシステムコンテキストマップ
</deliverable>

#### フェーズ3：ステークホルダー視点分析

<thinking_prompt> ウルトラシンク：各ステークホルダーの立場に立つ。彼らにとって何が重要か？彼らのペインポイントは何か？ </thinking_prompt>

<stakeholder_perspectives>

1. **開発者の視点** <questions>

   - これは理解しやすく変更しやすいか？
   - APIは直感的か？
   - デバッグは簡単か？
   - これを簡単にテストできるか？ </questions>

2. **運用の視点** <questions>

   - これを安全にデプロイするには？
   - どのメトリクスとログが利用可能か？
   - 問題のトラブルシューティングはどうするか？
   - リソース要件は何か？ </questions>

3. **エンドユーザーの視点** <questions>

   - 機能は直感的か？
   - エラーメッセージは役に立つか？
   - パフォーマンスは許容範囲か？
   - 私の問題を解決するか？ </questions>

4. **セキュリティチームの視点** <questions>

   - 攻撃対象領域は何か？
   - コンプライアンス要件はあるか？
   - データはどう保護されているか？
   - 監査機能は何か？ </questions>

5. **ビジネスの視点** <questions>
   - ROIは何か？
   - 法的/コンプライアンスリスクはあるか？
   - これは市場投入までの時間にどう影響するか？
   - 総所有コストは何か？ </questions> </stakeholder_perspectives>

#### フェーズ4：シナリオ探索

<thinking_prompt> ウルトラシンク：エッジケースと障害シナリオを探索。何がうまくいかない可能性があるか？ストレス下でシステムはどう動作するか？ </thinking_prompt>

<scenario_checklist>

- [ ] **ハッピーパス**：有効な入力での通常動作
- [ ] **無効な入力**：Null、空、不正なデータ
- [ ] **境界条件**：最小/最大値、空のコレクション
- [ ] **並行アクセス**：レースコンディション、デッドロック
- [ ] **スケールテスト**：通常負荷の10倍、100倍、1000倍
- [ ] **ネットワーク問題**：タイムアウト、部分的障害
- [ ] **リソース枯渇**：メモリ、ディスク、接続
- [ ] **セキュリティ攻撃**：インジェクション、オーバーフロー、DoS
- [ ] **データ破損**：部分書き込み、不整合
- [ ] **カスケード障害**：ダウンストリームサービスの問題 </scenario_checklist>

### 6. 多角度レビュー視点

#### 技術的卓越性の角度

- コード職人技の評価
- エンジニアリングベストプラクティス
- 技術ドキュメントの品質
- ツールと自動化の評価

#### ビジネス価値の角度

- 機能完全性の検証
- ユーザーへのパフォーマンス影響
- 費用対効果分析
- 市場投入時間の考慮

#### リスク管理の角度

- セキュリティリスク評価
- 運用リスク評価
- コンプライアンスリスク検証
- 技術的負債の蓄積

#### チームダイナミクスの角度

- コードレビューのエチケット
- 知識共有の効果
- コラボレーションパターン
- メンタリングの機会

### 4. 簡素化とミニマリズムレビュー

Task code-simplicity-reviewer()を実行してコードを簡素化できるか確認。

### 5. file-todosスキルを使用した発見事項の統合とTodo作成

<critical_requirement> すべての発見事項はfile-todosスキルを使用してtodos/ディレクトリに保存する必要があります。統合後すぐにTodoファイルを作成 - ユーザー承認のために発見事項を最初に提示しない。構造化されたTodo管理にスキルを使用。 </critical_requirement>

#### ステップ1：すべての発見事項を統合

<thinking>
すべてのエージェントレポートをカテゴリ分けされた発見事項リストに統合。
重複を除去し、重大度と影響度で優先順位付け。
</thinking>

<synthesis_tasks>

- [ ] すべての並列エージェントから発見事項を収集
- [ ] タイプ別にカテゴリ分け：セキュリティ、パフォーマンス、アーキテクチャ、品質など
- [ ] 重大度レベルを割り当て：🔴 クリティカル（P1）、🟡 重要（P2）、🔵 あれば良い（P3）
- [ ] 重複または重複する発見事項を除去
- [ ] 各発見事項の工数を見積もり（小規模/中規模/大規模）

</synthesis_tasks>

#### ステップ2：file-todosスキルを使用してTodoファイルを作成

<critical_instruction> file-todosスキルを使用してすべての発見事項のTodoファイルをすぐに作成。ユーザー承認を求めて発見事項を一つずつ提示しない。スキルを使用してすべてのTodoファイルを並列で作成し、結果をユーザーにサマリー。 </critical_instruction>

**実装オプション：**

**オプションA：直接ファイル作成（高速）**

- Writeツールを使用してTodoファイルを直接作成
- 速度のためにすべての発見事項を並列で
- `.claude/skills/file-todos/assets/todo-template.md`の標準テンプレートを使用
- 命名規約に従う：`{issue_id}-pending-{priority}-{description}.md`

**オプションB：並列サブエージェント（スケールに推奨）** 15以上の発見事項がある大規模PRでは、サブエージェントを使用して並列で発見ファイルを作成：

```bash
# 複数のfinding-creatorエージェントを並列で起動
Task() - 最初の発見のTodoを作成
Task() - 2番目の発見のTodoを作成
Task() - 3番目の発見のTodoを作成
など、各発見について。
```

サブエージェントは以下が可能：

- 複数の発見事項を同時に処理
- すべてのセクションが埋まった詳細なTodoファイルを書く
- 重大度別に発見事項を整理
- 包括的な提案されるソリューションを作成
- 受け入れ基準と作業ログを追加
- 順次処理よりはるかに速く完了

**実行戦略：**

1. すべての発見事項をカテゴリに統合（P1/P2/P3）
2. 重大度別に発見事項をグループ化
3. 3つの並列サブエージェントを起動（重大度レベルごとに1つ）
4. 各サブエージェントがfile-todosスキルを使用してTodoのバッチを作成
5. 結果を統合してサマリーを提示

**プロセス（file-todosスキルを使用）：**

1. 各発見事項について：

   - 重大度を決定（P1/P2/P3）
   - 詳細な問題文と発見事項を書く
   - 長所/短所/工数/リスクを含む2-3の提案されるソリューションを作成
   - 工数を見積もり（小規模/中規模/大規模）
   - 受け入れ基準と作業ログを追加

2. 構造化されたTodo管理にfile-todosスキルを使用：

   ```bash
   skill: file-todos
   ```

   スキルが提供するもの：

   - テンプレートの場所：`.claude/skills/file-todos/assets/todo-template.md`
   - 命名規約：`{issue_id}-{status}-{priority}-{description}.md`
   - YAMLフロントマター構造：status、priority、issue_id、tags、dependencies
   - すべての必須セクション：Problem Statement、Findings、Solutionsなど

3. Todoファイルを並列で作成：

   ```bash
   {next_id}-pending-{priority}-{description}.md
   ```

4. 例：

   ```
   001-pending-p1-path-traversal-vulnerability.md
   002-pending-p1-api-response-validation.md
   003-pending-p2-concurrency-limit.md
   004-pending-p3-unused-parameter.md
   ```

5. file-todosスキルのテンプレート構造に従う：`.claude/skills/file-todos/assets/todo-template.md`

**Todoファイル構造（テンプレートから）：**

各Todoに含める必要があるもの：

- **YAMLフロントマター**：status、priority、issue_id、tags、dependencies
- **問題文**：何が壊れている/欠けている、なぜ重要か
- **発見事項**：証拠/場所を含むエージェントからの発見
- **提案されるソリューション**：2-3のオプション、各々長所/短所/工数/リスク付き
- **推奨アクション**：（トリアージ中に入力、最初は空白）
- **技術詳細**：影響を受けるファイル、コンポーネント、データベース変更
- **受け入れ基準**：テスト可能なチェックリスト項目
- **作業ログ**：アクションと学びを含む日付付き記録
- **リソース**：PR、イシュー、ドキュメント、類似パターンへのリンク

**ファイル命名規約：**

```
{issue_id}-{status}-{priority}-{description}.md

例：
- 001-pending-p1-security-vulnerability.md
- 002-pending-p2-performance-optimization.md
- 003-pending-p3-code-cleanup.md
```

**ステータス値：**

- `pending` - 新しい発見事項、トリアージ/決定が必要
- `ready` - マネージャーにより承認、作業準備完了
- `complete` - 作業完了

**優先度値：**

- `p1` - クリティカル（マージをブロック、セキュリティ/データの問題）
- `p2` - 重要（修正すべき、アーキテクチャ/パフォーマンス）
- `p3` - あれば良い（強化、クリーンアップ）

**タグ付け：** 常に`code-review`タグを追加、さらに：`security`、`performance`、`architecture`、`rails`、`quality`など

#### ステップ3：サマリーレポート

すべてのTodoファイル作成後、包括的なサマリーを提示：

````markdown
## ✅ コードレビュー完了

**レビュー対象：** PR #XXXX - [PRタイトル] **ブランチ：** [branch-name]

### 発見事項サマリー：

- **合計発見事項：** [X]
- **🔴 クリティカル（P1）：** [count] - マージをブロック
- **🟡 重要（P2）：** [count] - 修正すべき
- **🔵 あれば良い（P3）：** [count] - 強化

### 作成されたTodoファイル：

**P1 - クリティカル（マージをブロック）：**

- `001-pending-p1-{finding}.md` - {description}
- `002-pending-p1-{finding}.md` - {description}

**P2 - 重要：**

- `003-pending-p2-{finding}.md` - {description}
- `004-pending-p2-{finding}.md` - {description}

**P3 - あれば良い：**

- `005-pending-p3-{finding}.md` - {description}

### 使用したレビューエージェント：

- kieran-rails-reviewer
- security-sentinel
- performance-oracle
- architecture-strategist
- agent-native-reviewer
- [その他のエージェント]

### 次のステップ：

1. **P1発見事項に対処**：クリティカル - マージ前に修正必須

   - 各P1 Todoを詳細にレビュー
   - 修正を実装するか免除をリクエスト
   - PRをマージする前に修正を確認

2. **すべてのTodoをトリアージ**：
   ```bash
   ls todos/*-pending-*.md  # すべての保留中Todoを表示
   /triage                  # インタラクティブトリアージにスラッシュコマンドを使用
   ```
````

3. **承認されたTodoに取り組む**：

   ```bash
   /resolve_todo_parallel  # すべての承認済みアイテムを効率的に修正
   ```

4. **進捗を追跡**：
   - ステータス変更時にファイル名を変更：pending → ready → complete
   - 作業に応じて作業ログを更新
   - Todoをコミット：`git add todos/ && git commit -m "refactor: add code review findings"`

### 重大度の内訳：

**🔴 P1（クリティカル - マージをブロック）：**

- セキュリティ脆弱性
- データ破損リスク
- 破壊的変更
- 重大なアーキテクチャ問題

**🟡 P2（重要 - 修正すべき）：**

- パフォーマンス問題
- 重大なアーキテクチャ懸念
- 主要なコード品質問題
- 信頼性の問題

**🔵 P3（あれば良い）：**

- 軽微な改善
- コードクリーンアップ
- 最適化の機会
- ドキュメント更新

```

### 7. エンドツーエンドテスト（オプション）

<offer_testing>

サマリーレポート提示後、ブラウザテストを提案：

```markdown
**「影響を受けるページでブラウザテストを実行しますか？」**
1. はい - `/browser-test`を実行
2. いいえ - スキップ
```

</offer_testing>

#### ユーザーがWebテストを受け入れた場合：

サブエージェントを起動してブラウザテストを実行（メインコンテキストを保持）：

```
Task general-purpose("PR #[number]の/browser-testを実行。影響を受けるすべてのページをテストし、コンソールエラーをチェックし、Todoを作成して修正することで失敗を処理。")
```

サブエージェントは以下を行う：
1. PRで影響を受けるページを特定
2. 各ページに移動してスナップショットをキャプチャ
3. コンソールエラーをチェック
4. 重要なインタラクションをテスト
5. OAuth/メール/決済フローで人間の検証のために一時停止
6. 失敗に対してP1 Todoを作成
7. すべてのテストがパスするまで修正して再試行

**スタンドアロン：** `/browser-test [PR番号]`

### 重要：P1発見事項はマージをブロック

**🔴 P1（クリティカル）**の発見事項はPRをマージする前に対処する必要があります。これらを目立つように提示し、PRを受け入れる前に解決されることを確認します。
```
