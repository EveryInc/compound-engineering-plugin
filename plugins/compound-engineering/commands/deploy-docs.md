---
name: deploy-docs
description: ドキュメントを検証し、GitHub Pagesデプロイメントのために準備する
---

# ドキュメントデプロイコマンド

ドキュメントサイトを検証し、GitHub Pagesデプロイメントのために準備します。

## ステップ1: ドキュメントの検証

以下のチェックを実行：

```bash
# コンポーネントをカウント
echo "Agents: $(ls plugins/compound-engineering/agents/*.md | wc -l)"
echo "Commands: $(ls plugins/compound-engineering/commands/*.md | wc -l)"
echo "Skills: $(ls -d plugins/compound-engineering/skills/*/ 2>/dev/null | wc -l)"

# JSONを検証
cat .claude-plugin/marketplace.json | jq . > /dev/null && echo "✓ marketplace.json valid"
cat plugins/compound-engineering/.claude-plugin/plugin.json | jq . > /dev/null && echo "✓ plugin.json valid"

# すべてのHTMLファイルが存在するかチェック
for page in index agents commands skills mcp-servers changelog getting-started; do
  if [ -f "plugins/compound-engineering/docs/pages/${page}.html" ] || [ -f "plugins/compound-engineering/docs/${page}.html" ]; then
    echo "✓ ${page}.html exists"
  else
    echo "✗ ${page}.html MISSING"
  fi
done
```

## ステップ2: コミットされていない変更をチェック

```bash
git status --porcelain plugins/compound-engineering/docs/
```

コミットされていない変更がある場合、ユーザーに先にコミットするよう警告します。

## ステップ3: デプロイメント手順

GitHub Pagesのデプロイメントには特別な権限を持つワークフローファイルが必要なため、以下の手順を提供します：

### 初回セットアップ

1. GitHub Pagesワークフローを含む`.github/workflows/deploy-docs.yml`を作成
2. リポジトリの設定 > Pagesに移動
3. ソースを「GitHub Actions」に設定

### デプロイ

`main`にマージした後、ドキュメントは自動デプロイされます。または：

1. Actionsタブに移動
2. 「Deploy Documentation to GitHub Pages」を選択
3. 「Run workflow」をクリック

### ワークフローファイルの内容

```yaml
name: Deploy Documentation to GitHub Pages

on:
  push:
    branches: [main]
    paths:
      - 'plugins/compound-engineering/docs/**'
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: "pages"
  cancel-in-progress: false

jobs:
  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/configure-pages@v4
      - uses: actions/upload-pages-artifact@v3
        with:
          path: 'plugins/compound-engineering/docs'
      - uses: actions/deploy-pages@v4
```

## ステップ4: ステータス報告

サマリーを提供：

```
## デプロイメント準備状況

✓ すべてのHTMLページが存在
✓ JSONファイルが有効
✓ コンポーネントカウントが一致

### 次のステップ
- [ ] 保留中の変更をコミット
- [ ] mainブランチにプッシュ
- [ ] GitHub Pagesワークフローの存在を確認
- [ ] https://everyinc.github.io/every-marketplace/ でデプロイメントを確認
```
