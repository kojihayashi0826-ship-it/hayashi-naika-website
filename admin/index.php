<?php
declare(strict_types=1);

$config = require __DIR__ . '/config.php';
date_default_timezone_set($config['timezone']);

$isHttps = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
    || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
$hostName = strtolower(explode(':', $_SERVER['HTTP_HOST'] ?? '')[0]);
$isLocalHost = in_array($hostName, ['localhost', '127.0.0.1', '::1'], true);

// 管理画面はHTTPS必須（ローカル動作確認時のみ例外）
if (!$isHttps && !$isLocalHost) {
    $target = 'https://' . ($_SERVER['HTTP_HOST'] ?? '') . ($_SERVER['REQUEST_URI'] ?? '/admin/');
    header('Location: ' . $target, true, 301);
    exit;
}
if ($isHttps) {
    header('Strict-Transport-Security: max-age=31536000');
}

session_name($config['session_name']);
ini_set('session.use_strict_mode', '1');
session_set_cookie_params([
    'lifetime' => 0,
    'path' => '/',
    'secure' => $isHttps,
    'httponly' => true,
    'samesite' => 'Strict',
]);
session_start();

header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: no-referrer');
header("Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
header('Cache-Control: no-store, no-cache, must-revalidate');

function escapeHtml(string $value): string
{
    return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function redirectToAdmin(): void
{
    header('Location: ./');
    exit;
}

function setFlash(string $type, string $message): void
{
    $_SESSION['flash'] = ['type' => $type, 'message' => $message];
}

function getFlash(): ?array
{
    $flash = $_SESSION['flash'] ?? null;
    unset($_SESSION['flash']);
    return is_array($flash) ? $flash : null;
}

function csrfToken(): string
{
    if (empty($_SESSION['csrf'])) {
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf'];
}

function validCsrf(): bool
{
    $submitted = $_POST['csrf'] ?? '';
    return is_string($submitted) && hash_equals(csrfToken(), $submitted);
}

function loadPasswordHash(string $path): ?string
{
    if (!is_file($path)) {
        return null;
    }
    try {
        $hash = require $path;
    } catch (Throwable $error) {
        return null;
    }
    return is_string($hash) && $hash !== '' ? $hash : null;
}

function writePasswordHash(string $path, string $hash): bool
{
    $contents = "<?php\ndeclare(strict_types=1);\nif (basename(\$_SERVER['SCRIPT_FILENAME'] ?? '') === basename(__FILE__)) { http_response_code(404); exit; }\nreturn " . var_export($hash, true) . ";\n";
    $written = file_put_contents($path, $contents, LOCK_EX);
    if ($written === false) {
        return false;
    }
    @chmod($path, 0600);
    return true;
}

// --- ログイン試行制限（IP単位・ファイル記録。セッション非依存） ---

function clientKey(): string
{
    return hash('sha256', $_SERVER['REMOTE_ADDR'] ?? 'unknown');
}

function loadAttempts(string $path): array
{
    if (!is_file($path)) {
        return [];
    }
    try {
        $data = require $path;
    } catch (Throwable $error) {
        return [];
    }
    return is_array($data) ? $data : [];
}

function saveAttempts(string $path, array $attempts): void
{
    // 古いレコードを掃除
    $now = time();
    $attempts = array_filter(
        $attempts,
        static fn(array $entry): bool => ($entry['last'] ?? 0) > $now - 86400
    );
    $contents = "<?php\ndeclare(strict_types=1);\nif (basename(\$_SERVER['SCRIPT_FILENAME'] ?? '') === basename(__FILE__)) { http_response_code(404); exit; }\nreturn " . var_export($attempts, true) . ";\n";
    if (file_put_contents($path, $contents, LOCK_EX) !== false) {
        @chmod($path, 0600);
    }
}

function loginLockedUntil(array $config): int
{
    $attempts = loadAttempts($config['attempts_file']);
    $entry = $attempts[clientKey()] ?? null;
    if (!is_array($entry)) {
        return 0;
    }
    if (($entry['count'] ?? 0) >= $config['max_login_attempts']) {
        $lockedUntil = ($entry['last'] ?? 0) + $config['lockout_seconds'];
        if ($lockedUntil > time()) {
            return $lockedUntil;
        }
    }
    return 0;
}

function recordLoginFailure(array $config): void
{
    $attempts = loadAttempts($config['attempts_file']);
    $key = clientKey();
    $entry = is_array($attempts[$key] ?? null) ? $attempts[$key] : ['count' => 0, 'last' => 0];
    // ロック期間経過後はカウントをリセット
    if (($entry['count'] ?? 0) >= $config['max_login_attempts']
        && ($entry['last'] ?? 0) + $config['lockout_seconds'] <= time()) {
        $entry = ['count' => 0, 'last' => 0];
    }
    $entry['count'] = ($entry['count'] ?? 0) + 1;
    $entry['last'] = time();
    $attempts[$key] = $entry;
    saveAttempts($config['attempts_file'], $attempts);
}

function clearLoginFailures(array $config): void
{
    $attempts = loadAttempts($config['attempts_file']);
    unset($attempts[clientKey()]);
    saveAttempts($config['attempts_file'], $attempts);
}

function defaultHighlight(): array
{
    return ['enabled' => false, 'mode' => 'banner', 'title' => '', 'body' => '', 'linkText' => '', 'linkUrl' => ''];
}

function loadManagedData(string $path): array
{
    $fallback = [
        'updatedAt' => null,
        'highlight' => defaultHighlight(),
        'news' => [],
        'closures' => [],
        'tests' => [],
        'vaccines' => [],
        'vaccineNote' => '',
        'checkups' => [],
        'checkupNote' => '',
    ];
    if (!is_file($path)) {
        return $fallback;
    }
    $contents = file_get_contents($path);
    if ($contents === false) {
        return $fallback;
    }
    try {
        $data = json_decode($contents, true, 512, JSON_THROW_ON_ERROR);
    } catch (Throwable $error) {
        return $fallback;
    }
    if (!is_array($data)) {
        return $fallback;
    }
    $highlight = isset($data['highlight']) && is_array($data['highlight']) ? $data['highlight'] : [];
    return [
        'updatedAt' => isset($data['updatedAt']) && is_string($data['updatedAt']) ? $data['updatedAt'] : null,
        'highlight' => [
            'enabled' => !empty($highlight['enabled']),
            'mode' => (($highlight['mode'] ?? 'banner') === 'popup') ? 'popup' : 'banner',
            'title' => is_string($highlight['title'] ?? null) ? $highlight['title'] : '',
            'body' => is_string($highlight['body'] ?? null) ? $highlight['body'] : '',
            'linkText' => is_string($highlight['linkText'] ?? null) ? $highlight['linkText'] : '',
            'linkUrl' => is_string($highlight['linkUrl'] ?? null) ? $highlight['linkUrl'] : '',
        ],
        'news' => isset($data['news']) && is_array($data['news']) ? $data['news'] : [],
        'closures' => isset($data['closures']) && is_array($data['closures']) ? $data['closures'] : [],
        'tests' => isset($data['tests']) && is_array($data['tests']) ? $data['tests'] : [],
        'vaccines' => isset($data['vaccines']) && is_array($data['vaccines']) ? $data['vaccines'] : [],
        'vaccineNote' => isset($data['vaccineNote']) && is_string($data['vaccineNote']) ? $data['vaccineNote'] : '',
        'checkups' => isset($data['checkups']) && is_array($data['checkups']) ? $data['checkups'] : [],
        'checkupNote' => isset($data['checkupNote']) && is_string($data['checkupNote']) ? $data['checkupNote'] : '',
    ];
}

function textLength(string $value): int
{
    return function_exists('mb_strlen') ? mb_strlen($value, 'UTF-8') : strlen($value);
}

function cleanText($value, int $maxLength, string $field): string
{
    if (!is_string($value)) {
        throw new RuntimeException($field . 'の形式が正しくありません。');
    }
    $value = trim(strip_tags($value));
    if (textLength($value) > $maxLength) {
        throw new RuntimeException($field . 'が長すぎます。');
    }
    return $value;
}

function validDate($value): bool
{
    if (!is_string($value) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $value)) {
        return false;
    }
    $date = DateTimeImmutable::createFromFormat('!Y-m-d', $value);
    return $date !== false && $date->format('Y-m-d') === $value;
}

function cleanId($value, string $prefix): string
{
    $id = is_string($value) ? preg_replace('/[^a-zA-Z0-9_-]/', '', $value) : '';
    return is_string($id) && $id !== '' ? $id : $prefix . '-' . bin2hex(random_bytes(6));
}

function safeLinkUrl(string $url): string
{
    $url = trim($url);
    if ($url === '') {
        return '';
    }
    // 許可するのは https/http、電話、ページ内アンカーのみ（javascript: 等は拒否）
    if (!preg_match('~^(https?://|tel:|#)~i', $url)) {
        throw new RuntimeException('リンク先URLはhttpから始まるアドレス、電話番号（tel:）、または#で始まるページ内リンクのみ設定できます。');
    }
    return $url;
}

function validateHighlight($input): array
{
    if (!is_array($input)) {
        return defaultHighlight();
    }
    $title = cleanText($input['title'] ?? '', 80, '重要なお知らせのタイトル');
    $body = cleanText($input['body'] ?? '', 300, '重要なお知らせの本文');
    $body = str_replace(["\r\n", "\r"], "\n", $body);
    $linkText = cleanText($input['linkText'] ?? '', 40, 'リンクの表示文言');
    $linkUrl = safeLinkUrl(is_string($input['linkUrl'] ?? null) ? $input['linkUrl'] : '');
    $enabled = !empty($input['enabled']);
    if ($enabled && $title === '') {
        throw new RuntimeException('重要なお知らせを表示するには、タイトルを入力してください。');
    }
    return [
        'enabled' => $enabled,
        'mode' => (($input['mode'] ?? 'banner') === 'popup') ? 'popup' : 'banner',
        'title' => $title,
        'body' => $body,
        'linkText' => $linkText,
        'linkUrl' => $linkUrl,
    ];
}

function validatePayload(array $payload, array $config): array
{
    $newsInput = $payload['news'] ?? [];
    $closuresInput = $payload['closures'] ?? [];
    $testsInput = $payload['tests'] ?? [];
    $vaccinesInput = $payload['vaccines'] ?? [];
    $checkupsInput = $payload['checkups'] ?? [];
    if (!is_array($newsInput) || !is_array($closuresInput)
        || !is_array($testsInput) || !is_array($vaccinesInput) || !is_array($checkupsInput)) {
        throw new RuntimeException('保存データの形式が正しくありません。');
    }
    if (count($newsInput) > $config['max_news'] || count($closuresInput) > $config['max_closures']
        || count($testsInput) > $config['max_tests']
        || count($vaccinesInput) > $config['max_vaccines']
        || count($checkupsInput) > $config['max_checkups']) {
        throw new RuntimeException('登録件数が上限を超えています。');
    }

    $news = [];
    foreach ($newsInput as $item) {
        if (!is_array($item) || !validDate($item['date'] ?? null)) {
            throw new RuntimeException('お知らせの日付を確認してください。');
        }
        $category = $item['category'] ?? 'notice';
        if (!in_array($category, ['notice', 'trend', 'vaccine'], true)) {
            $category = 'notice';
        }
        $title = cleanText($item['title'] ?? '', 100, 'お知らせのタイトル');
        if ($title === '') {
            throw new RuntimeException('お知らせのタイトルを入力してください。');
        }
        $body = cleanText($item['body'] ?? '', 1000, 'お知らせの本文');
        $body = str_replace(["\r\n", "\r"], "\n", $body);
        $news[] = [
            'id' => cleanId($item['id'] ?? '', 'news'),
            'date' => $item['date'],
            'category' => $category,
            'title' => $title,
            'body' => $body,
            'published' => !empty($item['published']),
        ];
    }
    usort($news, static fn(array $a, array $b): int => strcmp($b['date'], $a['date']));

    $closures = [];
    foreach ($closuresInput as $item) {
        if (!is_array($item) || !validDate($item['start'] ?? null) || !validDate($item['end'] ?? null)) {
            throw new RuntimeException('臨時休診の日付を確認してください。');
        }
        if ($item['start'] > $item['end']) {
            throw new RuntimeException('臨時休診の終了日は開始日以降にしてください。');
        }
        $label = cleanText($item['label'] ?? '', 40, '臨時休診の名称');
        if ($label === '') {
            throw new RuntimeException('臨時休診の名称を入力してください。');
        }
        $closures[] = [
            'id' => cleanId($item['id'] ?? '', 'closure'),
            'start' => $item['start'],
            'end' => $item['end'],
            'label' => $label,
        ];
    }
    usort($closures, static fn(array $a, array $b): int => strcmp($a['start'], $b['start']));

    // 検査（表示順は入力順を保持）
    $tests = [];
    foreach ($testsInput as $item) {
        if (!is_array($item)) {
            throw new RuntimeException('検査の形式が正しくありません。');
        }
        $title = cleanText($item['title'] ?? '', 100, '検査の名称');
        if ($title === '') {
            throw new RuntimeException('検査の名称を入力してください。');
        }
        $tests[] = [
            'id' => cleanId($item['id'] ?? '', 'test'),
            'title' => $title,
            'body' => cleanText($item['body'] ?? '', 600, '検査の説明'),
        ];
    }

    // ワクチン（表示順は入力順を保持）
    $vaccines = [];
    foreach ($vaccinesInput as $item) {
        if (!is_array($item)) {
            throw new RuntimeException('ワクチンの形式が正しくありません。');
        }
        $label = cleanText($item['label'] ?? '', 60, 'ワクチンの名称');
        if ($label === '') {
            throw new RuntimeException('ワクチンの名称を入力してください。');
        }
        $vaccines[] = [
            'id' => cleanId($item['id'] ?? '', 'vac'),
            'label' => $label,
            'wide' => !empty($item['wide']),
        ];
    }

    // 健診（表示順は入力順を保持）
    $checkups = [];
    foreach ($checkupsInput as $item) {
        if (!is_array($item)) {
            throw new RuntimeException('健診の形式が正しくありません。');
        }
        $label = cleanText($item['label'] ?? '', 60, '健診の名称');
        if ($label === '') {
            throw new RuntimeException('健診の名称を入力してください。');
        }
        $checkups[] = [
            'id' => cleanId($item['id'] ?? '', 'chk'),
            'label' => $label,
        ];
    }

    $vaccineNote = cleanText($payload['vaccineNote'] ?? '', 500, 'ワクチンの補足');
    $checkupNote = cleanText($payload['checkupNote'] ?? '', 500, '健診の補足');

    return [
        'updatedAt' => date(DATE_ATOM),
        'highlight' => validateHighlight($payload['highlight'] ?? []),
        'news' => $news,
        'closures' => $closures,
        'tests' => $tests,
        'vaccines' => $vaccines,
        'vaccineNote' => $vaccineNote,
        'checkups' => $checkups,
        'checkupNote' => $checkupNote,
    ];
}

function saveManagedData(string $path, array $data): bool
{
    $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
    if ($json === false) {
        return false;
    }
    $directory = dirname($path);
    $temporary = tempnam($directory, 'updates-');
    if ($temporary === false) {
        return false;
    }
    $written = file_put_contents($temporary, $json . "\n", LOCK_EX);
    if ($written === false) {
        @unlink($temporary);
        return false;
    }
    @chmod($temporary, 0644);
    if (!rename($temporary, $path)) {
        @unlink($temporary);
        return false;
    }
    return true;
}

$passwordHash = loadPasswordHash($config['auth_file']);
$isAuthenticated = !empty($_SESSION['authenticated']) && $passwordHash !== null;

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!validCsrf()) {
        setFlash('error', '画面の有効期限が切れました。もう一度操作してください。');
        redirectToAdmin();
    }

    $action = isset($_POST['action']) && is_string($_POST['action']) ? $_POST['action'] : '';

    if ($action === 'setup' && $passwordHash === null) {
        if (loginLockedUntil($config) > time()) {
            setFlash('error', '試行回数が上限に達しました。しばらく待ってからお試しください。');
            redirectToAdmin();
        }
        $setupKey = isset($_POST['setup_key']) && is_string($_POST['setup_key']) ? trim($_POST['setup_key']) : '';
        $password = isset($_POST['password']) && is_string($_POST['password']) ? $_POST['password'] : '';
        $confirmation = isset($_POST['password_confirmation']) && is_string($_POST['password_confirmation']) ? $_POST['password_confirmation'] : '';
        if (!hash_equals($config['setup_key'], $setupKey)) {
            recordLoginFailure($config);
            setFlash('error', 'セットアップキーが正しくありません。');
        } elseif (textLength($password) < 12 || textLength($password) > 200) {
            setFlash('error', 'パスワードは12文字以上で設定してください。');
        } elseif ($password !== $confirmation) {
            setFlash('error', '確認用パスワードが一致しません。');
        } else {
            $newHash = password_hash($password, PASSWORD_DEFAULT);
            if (is_string($newHash) && writePasswordHash($config['auth_file'], $newHash)) {
                clearLoginFailures($config);
                session_regenerate_id(true);
                $_SESSION['authenticated'] = true;
                setFlash('success', '管理者パスワードを設定しました。');
            } else {
                setFlash('error', '設定ファイルを保存できません。adminフォルダの書き込み権限を確認してください。');
            }
        }
        redirectToAdmin();
    }

    if ($action === 'login' && $passwordHash !== null) {
        if (loginLockedUntil($config) > time()) {
            setFlash('error', 'ログイン試行回数が上限に達しました。10分ほど待ってからお試しください。');
            redirectToAdmin();
        }
        $password = isset($_POST['password']) && is_string($_POST['password']) ? $_POST['password'] : '';
        if (password_verify($password, $passwordHash)) {
            clearLoginFailures($config);
            session_regenerate_id(true);
            $_SESSION['authenticated'] = true;
            setFlash('success', 'ログインしました。');
        } else {
            recordLoginFailure($config);
            setFlash('error', 'パスワードが正しくありません。');
        }
        redirectToAdmin();
    }

    if ($action === 'logout') {
        unset($_SESSION['authenticated']);
        session_regenerate_id(true);
        setFlash('success', 'ログアウトしました。');
        redirectToAdmin();
    }

    if (!$isAuthenticated) {
        setFlash('error', 'ログインしてください。');
        redirectToAdmin();
    }

    if ($action === 'save') {
        $payloadText = isset($_POST['payload']) && is_string($_POST['payload']) ? $_POST['payload'] : '';
        try {
            $payload = json_decode($payloadText, true, 512, JSON_THROW_ON_ERROR);
            if (!is_array($payload)) {
                throw new RuntimeException('保存データを読み込めません。');
            }
            $cleanData = validatePayload($payload, $config);
            if (!saveManagedData($config['data_file'], $cleanData)) {
                throw new RuntimeException('更新データを保存できません。dataフォルダの書き込み権限を確認してください。');
            }
            setFlash('success', '公開内容を保存しました。サイトへすぐに反映されます。');
        } catch (Throwable $error) {
            setFlash('error', $error->getMessage());
        }
        redirectToAdmin();
    }

    if ($action === 'change_password') {
        $current = isset($_POST['current_password']) && is_string($_POST['current_password']) ? $_POST['current_password'] : '';
        $new = isset($_POST['new_password']) && is_string($_POST['new_password']) ? $_POST['new_password'] : '';
        $confirmation = isset($_POST['new_password_confirmation']) && is_string($_POST['new_password_confirmation']) ? $_POST['new_password_confirmation'] : '';
        if (!password_verify($current, $passwordHash)) {
            setFlash('error', '現在のパスワードが正しくありません。');
        } elseif (textLength($new) < 12 || textLength($new) > 200) {
            setFlash('error', '新しいパスワードは12文字以上で設定してください。');
        } elseif ($new !== $confirmation) {
            setFlash('error', '確認用パスワードが一致しません。');
        } else {
            $newHash = password_hash($new, PASSWORD_DEFAULT);
            if (is_string($newHash) && writePasswordHash($config['auth_file'], $newHash)) {
                session_regenerate_id(true);
                setFlash('success', 'パスワードを変更しました。');
            } else {
                setFlash('error', 'パスワードを保存できませんでした。');
            }
        }
        redirectToAdmin();
    }

    setFlash('error', '操作を完了できませんでした。');
    redirectToAdmin();
}

$passwordHash = loadPasswordHash($config['auth_file']);
$isAuthenticated = !empty($_SESSION['authenticated']) && $passwordHash !== null;
$data = $isAuthenticated ? loadManagedData($config['data_file']) : ['updatedAt' => null, 'news' => [], 'closures' => []];
$flash = getFlash();
$csrf = csrfToken();
$jsonForPage = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT);
$dataWritable = is_writable($config['data_file']) || (!file_exists($config['data_file']) && is_writable(dirname($config['data_file'])));
?>
<!doctype html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex,nofollow,noarchive">
  <meta name="theme-color" content="#315545">
  <title>サイト管理｜<?= escapeHtml($config['clinic_name']) ?></title>
  <link rel="stylesheet" href="admin.css?v=2">
  <?php if ($isAuthenticated): ?><script src="admin.js?v=2" defer></script><?php endif; ?>
</head>
<body>
  <header class="admin-header">
    <a class="admin-brand" href="./" aria-label="管理画面トップ">
      <span class="brand-mark">林</span>
      <span><?= escapeHtml($config['clinic_name']) ?><small>サイト管理</small></span>
    </a>
    <?php if ($isAuthenticated): ?>
      <div class="header-actions">
        <a class="secondary-button" href="../index.html" target="_blank" rel="noopener">公開サイトを確認</a>
        <form method="post">
          <input type="hidden" name="csrf" value="<?= escapeHtml($csrf) ?>">
          <input type="hidden" name="action" value="logout">
          <button class="text-button" type="submit">ログアウト</button>
        </form>
      </div>
    <?php endif; ?>
  </header>

  <?php if ($flash): ?>
    <div class="flash <?= $flash['type'] === 'success' ? 'is-success' : 'is-error' ?>" role="status">
      <?= escapeHtml((string) $flash['message']) ?>
    </div>
  <?php endif; ?>

  <?php if ($passwordHash === null): ?>
    <main class="auth-layout">
      <section class="auth-panel" aria-labelledby="setup-title">
        <p class="eyebrow">FIRST SETUP</p>
        <h1 id="setup-title">管理画面の初期設定</h1>
        <p>セットアップキーを入力し、管理者用パスワードを登録してください。この操作は初回のみです。</p>
        <form class="auth-form" method="post">
          <input type="hidden" name="csrf" value="<?= escapeHtml($csrf) ?>">
          <input type="hidden" name="action" value="setup">
          <label>セットアップキー<input type="text" name="setup_key" autocomplete="off" required></label>
          <label>パスワード<input type="password" name="password" minlength="12" maxlength="200" autocomplete="new-password" required><small>12文字以上で設定してください。</small></label>
          <label>パスワード（確認）<input type="password" name="password_confirmation" minlength="12" maxlength="200" autocomplete="new-password" required></label>
          <button class="primary-button" type="submit">管理画面を開始</button>
        </form>
      </section>
    </main>
  <?php elseif (!$isAuthenticated): ?>
    <main class="auth-layout">
      <section class="auth-panel" aria-labelledby="login-title">
        <p class="eyebrow">ADMIN LOGIN</p>
        <h1 id="login-title">管理画面にログイン</h1>
        <form class="auth-form" method="post">
          <input type="hidden" name="csrf" value="<?= escapeHtml($csrf) ?>">
          <input type="hidden" name="action" value="login">
          <label>パスワード<input type="password" name="password" autocomplete="current-password" required autofocus></label>
          <button class="primary-button" type="submit">ログイン</button>
        </form>
      </section>
    </main>
  <?php else: ?>
    <main class="dashboard">
      <div class="page-heading">
        <div>
          <p class="eyebrow">WEBSITE CONTENT</p>
          <h1>公開内容の管理</h1>
        </div>
        <div class="update-meta">
          <span>最終更新</span>
          <strong><?= $data['updatedAt'] ? escapeHtml(date('Y年n月j日 H:i', strtotime($data['updatedAt']))) : '未保存' ?></strong>
        </div>
      </div>

      <?php if (!$dataWritable): ?>
        <div class="permission-warning" role="alert">更新データへ書き込めません。サーバー上のdataフォルダの権限を確認してください。</div>
      <?php endif; ?>

      <div class="summary-grid" aria-label="登録状況">
        <div><span>お知らせ</span><strong><?= count($data['news']) ?></strong><small>件</small></div>
        <div><span>臨時休診</span><strong><?= count($data['closures']) ?></strong><small>件</small></div>
        <div><span>検査</span><strong><?= count($data['tests']) ?></strong><small>件</small></div>
        <div><span>ワクチン</span><strong><?= count($data['vaccines']) ?></strong><small>件</small></div>
        <div><span>健診</span><strong><?= count($data['checkups']) ?></strong><small>件</small></div>
      </div>

      <div class="tab-list" role="tablist" aria-label="編集する内容">
        <button class="is-active" type="button" role="tab" aria-selected="true" data-tab="highlight">重要なお知らせ</button>
        <button type="button" role="tab" aria-selected="false" data-tab="news">お知らせ・流行情報</button>
        <button type="button" role="tab" aria-selected="false" data-tab="closures">臨時休診</button>
        <button type="button" role="tab" aria-selected="false" data-tab="tests">検査</button>
        <button type="button" role="tab" aria-selected="false" data-tab="vaccines">ワクチン・健診</button>
        <button type="button" role="tab" aria-selected="false" data-tab="settings">設定</button>
      </div>

      <form id="content-form" method="post">
        <input type="hidden" name="csrf" value="<?= escapeHtml($csrf) ?>">
        <input type="hidden" name="action" value="save">
        <input id="content-payload" type="hidden" name="payload">

        <section class="editor-panel" role="tabpanel" data-panel="highlight" aria-labelledby="highlight-editor-title">
          <div class="panel-heading">
            <div>
              <h2 id="highlight-editor-title">重要なお知らせ</h2>
              <p class="panel-hint">サイトの一番上に帯を出すか、開いた直後にポップアップを表示できます。臨時の休診連絡や急な流行情報など、特に知ってほしいことにお使いください。</p>
            </div>
          </div>
          <div class="highlight-editor">
            <label class="publish-toggle highlight-enable">
              <input type="checkbox" data-highlight-field="enabled">
              <span>このお知らせを表示する</span>
            </label>
            <div class="field">
              <span class="field-label">表示方法</span>
              <div class="radio-row">
                <label><input type="radio" name="highlight-mode" value="banner" data-highlight-mode>ページ上部の帯</label>
                <label><input type="radio" name="highlight-mode" value="popup" data-highlight-mode>ポップアップ</label>
              </div>
            </div>
            <label class="field field-wide">
              <span class="field-label">タイトル（必須）</span>
              <input type="text" maxlength="80" data-highlight-field="title" placeholder="例：12月30日は臨時休診です">
            </label>
            <label class="field field-wide">
              <span class="field-label">本文</span>
              <textarea rows="3" maxlength="300" data-highlight-field="body" placeholder="補足があれば入力してください（任意）"></textarea>
            </label>
            <label class="field">
              <span class="field-label">リンクの文言（任意）</span>
              <input type="text" maxlength="40" data-highlight-field="linkText" placeholder="例：詳しくはこちら">
            </label>
            <label class="field">
              <span class="field-label">リンク先URL（任意）</span>
              <input type="text" maxlength="300" data-highlight-field="linkUrl" placeholder="https:// で始まるURL・tel: ・#access など">
            </label>
            <p class="panel-hint">ポップアップは、閲覧者が一度閉じると同じ内容では再表示されません。内容を書き換えると再び表示されます。</p>
          </div>
        </section>

        <section class="editor-panel" role="tabpanel" data-panel="news" aria-labelledby="news-editor-title" hidden>
          <div class="panel-heading">
            <div><h2 id="news-editor-title">お知らせ・流行情報</h2></div>
            <button class="secondary-button" type="button" data-add-news>追加</button>
          </div>
          <div class="record-list" data-news-editor></div>
        </section>

        <section class="editor-panel" role="tabpanel" data-panel="closures" aria-labelledby="closure-editor-title" hidden>
          <div class="panel-heading">
            <div><h2 id="closure-editor-title">臨時休診</h2></div>
            <button class="secondary-button" type="button" data-add-closure>追加</button>
          </div>
          <div class="record-list" data-closure-editor></div>
        </section>

        <section class="editor-panel" role="tabpanel" data-panel="tests" aria-labelledby="test-editor-title" hidden>
          <div class="panel-heading">
            <div>
              <h2 id="test-editor-title">院内でできる検査</h2>
              <p class="panel-hint">「院内でできる検査」に表示されます。「↑」「↓」で並び順を変えられます。</p>
            </div>
            <button class="secondary-button" type="button" data-add-test>追加</button>
          </div>
          <div class="record-list" data-test-editor></div>
        </section>

        <section class="editor-panel" role="tabpanel" data-panel="vaccines" aria-labelledby="vaccine-editor-title" hidden>
          <div class="panel-heading">
            <div>
              <h2 id="vaccine-editor-title">ワクチン・健診</h2>
              <p class="panel-hint">「ワクチン・健康診断」に表示されます。名称だけの箇条書きです。</p>
            </div>
          </div>
          <div class="subsection-heading">
            <h3>各種ワクチン</h3>
            <button class="secondary-button" type="button" data-add-vaccine>追加</button>
          </div>
          <div class="record-list compact-list" data-vaccine-editor></div>
          <label class="field field-wide">
            <span class="field-label">ワクチンの補足文</span>
            <textarea rows="3" maxlength="500" data-note-field="vaccineNote"></textarea>
          </label>
          <div class="subsection-heading">
            <h3>健診・検診</h3>
            <button class="secondary-button" type="button" data-add-checkup>追加</button>
          </div>
          <div class="record-list compact-list" data-checkup-editor></div>
          <label class="field field-wide">
            <span class="field-label">健診の補足文</span>
            <textarea rows="3" maxlength="500" data-note-field="checkupNote"></textarea>
          </label>
        </section>

        <div class="save-bar" data-save-bar>
          <p data-save-status aria-live="polite">変更はありません</p>
          <button class="primary-button" type="submit" <?= $dataWritable ? '' : 'disabled' ?>>変更を保存</button>
        </div>
      </form>

      <section class="editor-panel settings-panel" role="tabpanel" data-panel="settings" hidden>
        <div class="panel-heading"><div><h2>パスワード変更</h2></div></div>
        <form class="password-form" method="post">
          <input type="hidden" name="csrf" value="<?= escapeHtml($csrf) ?>">
          <input type="hidden" name="action" value="change_password">
          <label>現在のパスワード<input type="password" name="current_password" autocomplete="current-password" required></label>
          <label>新しいパスワード<input type="password" name="new_password" minlength="12" maxlength="200" autocomplete="new-password" required></label>
          <label>新しいパスワード（確認）<input type="password" name="new_password_confirmation" minlength="12" maxlength="200" autocomplete="new-password" required></label>
          <button class="secondary-button" type="submit">パスワードを変更</button>
        </form>
      </section>
    </main>
    <script id="admin-data" type="application/json"><?= $jsonForPage ?: '{}' ?></script>
    <noscript><div class="noscript-warning">管理画面を使用するにはJavaScriptを有効にしてください。</div></noscript>
  <?php endif; ?>
</body>
</html>
