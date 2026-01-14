# Compound Engineering プラグイン

エンジニアリング作業の各単位を前回より簡単にするClaude Codeプラグイン。

## インストール

```bash
/plugin marketplace add https://github.com/EveryInc/compound-engineering-plugin
/plugin install compound-engineering
```

## ワークフロー

```
計画 → 実行 → レビュー → 蓄積 → 繰り返し
```

| コマンド | 目的 |
|---------|---------|
| `/workflows:plan` | 機能アイデアを詳細な実装計画に変換 |
| `/workflows:work` | ワークツリーとタスク追跡で計画を実行 |
| `/workflows:review` | マージ前にマルチエージェントでコードレビュー |
| `/workflows:compound` | 今後の作業を簡単にするために学びを文書化 |

各サイクルが蓄積される：計画は将来の計画に役立ち、レビューはより多くの問題を発見し、パターンが文書化される。

## 哲学

**エンジニアリング作業の各単位が、その後の単位をより簡単にするべき—より難しくではなく。**

従来の開発は技術的負債を蓄積する。すべての機能が複雑さを加え、コードベースは時間とともに扱いにくくなる。

コンパウンドエンジニアリングはこれを逆転させる。80%は計画とレビューに、20%は実行に：
- コードを書く前に徹底的に計画する
- 問題を発見し学びを捉えるためにレビューする
- 再利用できるように知識を体系化する
- 将来の変更が容易になるよう品質を高く保つ

## さらに詳しく

- [全コンポーネントリファレンス](plugins/compound-engineering/README.md) - すべてのエージェント、コマンド、スキル
- [Compound engineering: EveryがAIエージェントとどうコーディングするか](https://every.to/chain-of-thought/compound-engineering-how-every-codes-with-agents)
- [コンパウンドエンジニアリングの背景](https://every.to/source-code/my-ai-had-already-fixed-the-code-before-i-saw-it)
