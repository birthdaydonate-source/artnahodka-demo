<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require dirname(__DIR__) . '/api/order-common.php';
$config = orderConfig();
$root = $config['storage_dir'];
foreach (glob($root . '/*') as $path) {
    if (is_link($path)) continue;
    if (is_file($path) && str_starts_with(basename($path), 'rate-')) {
        // Keep rate files to avoid racing another worker's lock/inode.
        continue;
    }
    if (!is_dir($path) || !preg_match('/^[a-f0-9]{32}$/D', basename($path))) continue;
    $lock = fopen($path . '/lock', 'c+');
    if (!$lock || !flock($lock, LOCK_EX | LOCK_NB)) continue;
    $recordPath = $path . '/order.json';
    $record = is_file($recordPath) ? json_decode(file_get_contents($recordPath), true) : null;
    $expires = $record['expires'] ?? (filemtime($path) + 7 * 86400);
    if ($expires < time()) {
        foreach (glob($path . '/*') as $file) if (is_file($file) && !is_link($file)) unlink($file);
        rmdir($path);
    }
    flock($lock, LOCK_UN); fclose($lock);
}
