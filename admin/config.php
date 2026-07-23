<?php
declare(strict_types=1);

// このファイルへの直接アクセスを拒否（.htaccessが無効な環境向けの保険）
if (basename($_SERVER['SCRIPT_FILENAME'] ?? '') === basename(__FILE__)) {
    http_response_code(404);
    exit;
}

return [
    'clinic_name' => '林内科医院',
    'timezone' => 'Asia/Tokyo',
    'session_name' => 'hayashi_clinic_admin',
    // 重要: setup_key は初期設定・パスワード再設定に使う秘密情報です。
    // 公開前に必ず独自のランダム値へ変更し、再設定を行うたびに新しい値へ更新してください。
    // 生成例: ターミナルで  openssl rand -hex 20
    'setup_key' => '744c74ea135911494149b1011765495cd9e25238',
    'auth_file' => __DIR__ . '/.admin-auth.php',
    'attempts_file' => __DIR__ . '/.login-attempts.php',
    'data_file' => dirname(__DIR__) . '/data/site-updates.json',
    'max_news' => 50,
    'max_closures' => 50,
    'max_tests' => 40,
    'max_vaccines' => 40,
    'max_checkups' => 40,
    // ログイン試行制限（IP単位・ファイル記録）
    'max_login_attempts' => 5,
    'lockout_seconds' => 600,
];
