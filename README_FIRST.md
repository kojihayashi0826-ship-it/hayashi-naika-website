# 林内科医院ウェブサイト：直接公開・休診カレンダー連動版

更新アプリは site-editor.html です。
設置後のURL：https://www.hayashinaika.clinic/site-editor.html

## 初回

ZIPを展開し、中身をGitHubリポジトリの最上位へ配置します。
index.html と CNAME は最上位、更新データは data/site-updates.json です。
ZIPやフォルダをそのまま1段深い場所へ配置しないでください。
このZIPのダウンロードだけでは本番サイトは更新されません。

Chromeで更新アプリを開き、画面内の「初回設定の手順」に従ってGitHubに接続します。
専用端末で接続キーを暗号化保存すると、次回から解除用パスワードで接続できます。

## 普段

接続 → 編集 → プレビュー → 公開する。
JSONファイルを手作業でアップロードする必要はありません。

臨時休診は専用タブへ日付を入力すると、お知らせ・カレンダー・本日の診療へ連動します。
2026年10月30〜31日の休診は引き継いでいます。

詳しい手順・安全上の注意：START_HERE.html（Chromeで開けます）
テキスト版：PUBLISH_GUIDE.md
テストの範囲：TEST_REPORT.md
