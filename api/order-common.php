<?php
declare(strict_types=1);
ini_set('display_errors', '0');

function respond(int $status, array $body): never {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function orderConfig(): array {
    $path = getenv('ORDER_CONFIG') ?: dirname(__DIR__, 2) . '/private/order-config.php';
    if (!is_file($path)) respond(503, ['error' => 'Отправка ещё не настроена. Свяжитесь с нами в мессенджере.']);
    $config = require $path;
    foreach (['smtp_host', 'smtp_user', 'smtp_password', 'recipient', 'public_url', 'storage_dir'] as $key) {
        if (empty($config[$key])) respond(503, ['error' => 'Отправка временно недоступна.']);
    }
    $root = $config['storage_dir'];
    if (!is_dir($root) && !mkdir($root, 0700, true)) throw new RuntimeException('Storage unavailable');
    $realRoot = realpath($root);
    $webRoot = realpath(dirname(__DIR__));
    if (!$realRoot || $realRoot === $webRoot || str_starts_with($realRoot, $webRoot . DIRECTORY_SEPARATOR)) {
        throw new RuntimeException('Storage must be outside document root');
    }
    return $config;
}

function field(string $key, int $limit = 500): string {
    $value = $_POST[$key] ?? '';
    if (!is_string($value) || strlen($value) > $limit * 4 || !preg_match('//u', $value) || preg_match('/[\x00-\x08\x0b\x0c\x0e-\x1f]/', $value)) {
        respond(422, ['error' => 'Проверьте поля формы.']);
    }
    return trim($value);
}

function saveJson(string $path, array $value): void {
    $tmp = $path . '.tmp';
    if (file_put_contents($tmp, json_encode($value, JSON_UNESCAPED_UNICODE), LOCK_EX) === false || !rename($tmp, $path)) {
        throw new RuntimeException('Cannot save order');
    }
    chmod($path, 0600);
}
