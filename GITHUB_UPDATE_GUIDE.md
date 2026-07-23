# GitHub Pages 更新手順

## サイト全体を更新する

1. このZIPを展開します。
2. GitHubの公開元ブランチ（通常 `main`）のファイルを、展開したファイルで置き換えます。
3. `CNAME`（内容: `www.hayashinaika.clinic`）を削除しないでください。
4. 変更をコミットします。
5. GitHub Pagesが自動で再公開します。通常は数分、最大10分程度かかります。

## 予約・スタッフ募集だけ更新する

1. `https://www.hayashinaika.clinic/site-editor.html` を開きます。
2. 現在の設定を読み込み、内容を変更します。
3. `site-updates.json` を作成します。
4. GitHubで `data/site-updates.json` だけを置き換えてコミットします。

## 注意

- GitHub PagesではPHPが動かないため、`admin/` のPHP管理画面は使用できません。
- 予約ボタンを表示するには、林内科医院専用のデジスマ予約URLが必要です。URLが空欄の間はボタンを非表示にしてください。
- 更新後に表示が変わらない場合は、数分待ってからブラウザを再読み込みしてください。
