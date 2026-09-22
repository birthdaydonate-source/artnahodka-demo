<?php
declare(strict_types=1);
require __DIR__ . '/order-common.php';
try {
    $config = orderConfig();
    $id = $_GET['id'] ?? '';
    $token = $_GET['token'] ?? '';
    $index = $_GET['file'] ?? '';
    if (!is_string($id) || !preg_match('/^[a-f0-9]{32}$/D', $id) || !is_string($token) || !is_string($index) || !preg_match('/^[0-9]$/D', $index)) {
        respond(404, ['error' => 'Файл не найден.']);
    }
    $dir = $config['storage_dir'] . '/' . $id;
    $record = is_file($dir . '/order.json') ? json_decode(file_get_contents($dir . '/order.json'), true) : null;
    if (!$record || $record['expires'] < time() || !hash_equals($record['token'], $token) || !isset($record['files'][(int)$index])) {
        respond(404, ['error' => 'Ссылка недействительна или срок хранения истёк.']);
    }
    $file = $record['files'][(int)$index];
    $path = $dir . '/' . $file['stored'];
    if (!is_file($path)) respond(404, ['error' => 'Файл не найден.']);
    header('Content-Type: application/octet-stream');
    header('Content-Disposition: attachment; filename="photo-' . $index . '.' . $file['ext'] . '"; filename*=UTF-8\'\'' . rawurlencode($file['name']));
    header('Content-Length: ' . filesize($path));
    header('Cache-Control: private, no-store');
    header('X-Content-Type-Options: nosniff');
    header('Referrer-Policy: no-referrer');
    readfile($path);
} catch (Throwable $e) {
    error_log('Order download: ' . get_class($e));
    respond(500, ['error' => 'Не удалось скачать файл.']);
}
