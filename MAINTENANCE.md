# 保守記録：旧PHP管理画面の廃止

調査日：2026年10月24日（日本時間）
調査対象：main の 962a2aceaf002dfc17b5eda78ea3e8db78e33918 と取得できた全Git履歴。

## 更新経路

- 公開サイト：index.html → script.js → data/site-updates.json。
- 現行GUI：site-editor.html → site-editor.js / github-publisher.js → GitHub Contents API → main の data/site-updates.json。
- 旧PHP：admin/index.php → admin/config.php → サーバー上の data/site-updates.json。
- 両方式はデータ保存先の名前を共有しますが、現行GUI・公開サイトから旧PHP/CSS/JSへの依存はありません。
- リポジトリに別PHPサーバーへの配備設定・外部管理APIへの接続は見つかりませんでした。別環境の実在・稼働状況はリポジトリだけでは確認できません。

## 変更

旧管理画面の4ファイル（PHP 2、JS 1、CSS 1）を削除。
ADMIN_GUIDE.mdを現行GUIの案内に置換し、README_FIRST.mdに廃止案内を追記。
公開コンテンツ、データ、ドメイン、GUI本体、接続先、暗号化保存形式は変更しません。

## 認証情報の確認

旧config.phpには固定のsetup_keyが含まれ、2026年7月23日の初回コミット以来公開されていました。
旧PHPは認証ファイルがない場合にこのキーで初期パスワードを設定する構造です。
キー自体にGitHubへの更新権限はありません。値は本記録に転載しません。

取得した全履歴のテキストを代表的なGitHub PAT・秘密鍵・AWSアクセスキーのパターンで検査し、それらの実値は検出しませんでした。
旧認証ファイル・ログイン試行記録も追跡対象にありませんでした。これは未知の形式や外部環境を含む漏えい不存在の保証ではありません。

**別のPHPサーバーで旧版を使用している場合**は、その環境の管理画面を停止するか、setup_keyを独自の新しい値に変更してから運用してください。
Git上の削除は別サーバーへ反映されず、公開済みキーは過去の履歴・複製から取得可能です。旧キーは再利用しないでください。
本変更では履歴の強制書換えを行いません。

## 検証範囲

現行GUI・公開サイトのHTML/JS/CSS、data/site-updates.json、CNAMEが変更前と同一であることを確認。
JavaScriptの構文、JSONの解析、現行HTMLのローカル依存ファイルの存在、および旧PHP参照の不在を確認。
実際のPATを使ったGUI公開操作は、医院のコンテンツを不用意に変更しないため実施していません。
