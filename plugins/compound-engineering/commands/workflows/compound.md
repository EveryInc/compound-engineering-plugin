---
name: workflows:compound
description: 最近解決した問題を文書化してチームの知識を蓄積する
argument-hint: "[オプション: 修正に関する簡単なコンテキスト]"
---

# /compound

最近解決した問題を文書化するために、複数のサブエージェントを並列で協調させます。

## 目的

コンテキストが新鮮なうちに問題のソリューションをキャプチャし、検索性と将来の参照のためにYAMLフロントマターを含む構造化されたドキュメントを`docs/solutions/`に作成します。最大効率のために並列サブエージェントを使用します。

**なぜ「compound」（複利）？** 文書化された各ソリューションがチームの知識を複利的に増やします。初めて問題を解決するときはリサーチが必要です。それを文書化すれば、次回同じ問題が発生したときは数分で解決できます。知識は複利的に増えます。

## 使用方法

```bash
/workflows:compound                    # 最新の修正を文書化
/workflows:compound [簡単なコンテキスト]    # 追加のコンテキストヒントを提供
```

## 実行戦略：並列サブエージェント

このコマンドは効率を最大化するために複数の専門サブエージェントを並列で起動します：

### 1. **コンテキストアナライザー**（並列）
   - 会話履歴を抽出
   - 問題タイプ、コンポーネント、症状を特定
   - CORAスキーマに対して検証
   - 返却：YAMLフロントマタースケルトン

### 2. **ソリューション抽出器**（並列）
   - すべての調査ステップを分析
   - 根本原因を特定
   - コード例を含む動作するソリューションを抽出
   - 返却：ソリューションコンテンツブロック

### 3. **関連ドキュメント検索器**（並列）
   - `docs/solutions/`で関連ドキュメントを検索
   - 相互参照とリンクを特定
   - 関連するGitHubイシューを検索
   - 返却：リンクと関係性

### 4. **予防戦略家**（並列）
   - 予防戦略を策定
   - ベストプラクティスガイダンスを作成
   - 該当する場合はテストケースを生成
   - 返却：予防/テストコンテンツ

### 5. **カテゴリ分類器**（並列）
   - 最適な`docs/solutions/`カテゴリを決定
   - スキーマに対してカテゴリを検証
   - スラグに基づいてファイル名を提案
   - 返却：最終パスとファイル名

### 6. **ドキュメントライター**（並列）
   - 完全なマークダウンファイルを組み立て
   - YAMLフロントマターを検証
   - 読みやすさのためにコンテンツをフォーマット
   - 正しい場所にファイルを作成

### 7. **オプション：専門エージェントの呼び出し**（ドキュメント作成後）
   検出された問題タイプに基づいて、適用可能なエージェントを自動的に呼び出し：
   - **performance_issue** → `performance-oracle`
   - **security_issue** → `security-sentinel`
   - **database_issue** → `data-integrity-guardian`
   - **test_failure** → `cora-test-reviewer`
   - コードが多いイシュー → `kieran-rails-reviewer` + `code-simplicity-reviewer`

## キャプチャする内容

- **問題の症状**：正確なエラーメッセージ、観察された動作
- **試した調査ステップ**：何がうまくいかなかったか、なぜか
- **根本原因分析**：技術的な説明
- **動作するソリューション**：コード例を含むステップバイステップの修正
- **予防戦略**：将来の回避方法
- **相互参照**：関連するイシューとドキュメントへのリンク

## 前提条件

<preconditions enforcement="advisory">
  <check condition="problem_solved">
    問題が解決されている（進行中ではない）
  </check>
  <check condition="solution_verified">
    ソリューションが動作することが確認されている
  </check>
  <check condition="non_trivial">
    些細ではない問題（単純なタイポや明らかなエラーではない）
  </check>
</preconditions>

## 作成されるもの

**整理されたドキュメント：**

- ファイル：`docs/solutions/[category]/[filename].md`

**問題から自動検出されるカテゴリ：**

- build-errors/
- test-failures/
- runtime-errors/
- performance-issues/
- database-issues/
- security-issues/
- ui-bugs/
- integration-issues/
- logic-errors/

## 成功時の出力

```
✓ 並列ドキュメント生成完了

主要サブエージェントの結果:
  ✓ コンテキストアナライザー: brief_systemでperformance_issueを特定
  ✓ ソリューション抽出器: 3つのコード修正を抽出
  ✓ 関連ドキュメント検索器: 2つの関連イシューを発見
  ✓ 予防戦略家: テストケースを生成
  ✓ カテゴリ分類器: docs/solutions/performance-issues/
  ✓ ドキュメントライター: 完全なマークダウンを作成

専門エージェントレビュー（自動トリガー）:
  ✓ performance-oracle: クエリ最適化アプローチを検証
  ✓ kieran-rails-reviewer: コード例がRails標準を満たす
  ✓ code-simplicity-reviewer: ソリューションが適切に最小限
  ✓ every-style-editor: ドキュメントスタイルを検証

作成されたファイル:
- docs/solutions/performance-issues/n-plus-one-brief-generation.md

このドキュメントは、Email ProcessingまたはBrief Systemモジュールで
類似の問題が発生した場合に、将来の参照として検索可能です。

次は何をしますか？
1. ワークフローを続行（推奨）
2. 関連ドキュメントをリンク
3. 他の参照を更新
4. ドキュメントを表示
5. その他
```

## 複利の哲学

これは複利的な知識システムを作成します：

1. 初めて「ブリーフ生成でのN+1クエリ」を解決 → リサーチ（30分）
2. ソリューションを文書化 → docs/solutions/performance-issues/n-plus-one-briefs.md（5分）
3. 次回同様の問題が発生 → クイック検索（2分）
4. 知識が複利的に増加 → チームがより賢くなる

フィードバックループ：

```
ビルド → テスト → 問題発見 → リサーチ → 改善 → 文書化 → 検証 → デプロイ
    ↑                                                                      ↓
    └──────────────────────────────────────────────────────────────────────┘
```

**各エンジニアリング作業単位は、後続の作業単位をより困難ではなく、より容易にすべきです。**

## 自動呼び出し

<auto_invoke> <trigger_phrases> - "that worked" - "it's fixed" - "working now" - "problem solved" </trigger_phrases>

<manual_override> 自動検出を待たずにすぐに文書化するには /workflows:compound [context] を使用。 </manual_override> </auto_invoke>

## ルート先

`compound-docs` スキル

## 適用可能な専門エージェント

問題タイプに基づいて、これらのエージェントがドキュメントを強化できます：

### コード品質 & レビュー
- **kieran-rails-reviewer**: Railsのベストプラクティスに対してコード例をレビュー
- **code-simplicity-reviewer**: ソリューションコードが最小限で明確であることを確認
- **pattern-recognition-specialist**: アンチパターンや繰り返しの問題を特定

### 特定ドメインエキスパート
- **performance-oracle**: performance_issueカテゴリのソリューションを分析
- **security-sentinel**: security_issueソリューションの脆弱性をレビュー
- **cora-test-reviewer**: 予防戦略のテストケースを作成
- **data-integrity-guardian**: database_issueのマイグレーションとクエリをレビュー

### 強化 & ドキュメント
- **best-practices-researcher**: 業界のベストプラクティスでソリューションを充実
- **every-style-editor**: ドキュメントのスタイルと明確さをレビュー
- **framework-docs-researcher**: Rails/gemドキュメントへの参照をリンク

### いつ呼び出すか
- **自動トリガー**（オプション）：エージェントはドキュメント作成後に強化のために実行可能
- **手動トリガー**：ユーザーは/workflows:compound完了後により深いレビューのためにエージェントを呼び出し可能

## 関連コマンド

- `/research [topic]` - 深い調査（docs/solutions/でパターンを検索）
- `/workflows:plan` - 計画ワークフロー（文書化されたソリューションを参照）
