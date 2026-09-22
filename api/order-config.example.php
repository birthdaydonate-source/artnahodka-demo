<?php
// Copy OUTSIDE the document root: ../private/order-config.php.
return [
    'smtp_host' => 'smtp.yandex.ru',
    'smtp_port' => 465,
    'smtp_security' => 'ssl',
    'smtp_user' => 'zakaz@artnahodka.ru',
    'smtp_password' => getenv('ORDER_SMTP_PASSWORD') ?: '',
    'recipient' => 'zakaz@artnahodka.ru',
    'public_url' => 'https://artnahodka.ru',
    'allowed_origins' => ['https://artnahodka.ru', 'https://www.artnahodka.ru'],
    'storage_dir' => __DIR__ . '/order-data',
];
