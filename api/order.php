<?php
declare(strict_types=1);
use PHPMailer\PHPMailer\PHPMailer;
require __DIR__ . '/order-common.php';
require __DIR__ . '/form-v2.php';
require __DIR__ . '/vendor/PHPMailer/Exception.php';
require __DIR__ . '/vendor/PHPMailer/PHPMailer.php';
require __DIR__ . '/vendor/PHPMailer/SMTP.php';

$dir = null;
$attempted = false;
try {
    $config = orderConfig();
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if ($origin !== '' && !in_array($origin, $config['allowed_origins'] ?? [], true)) respond(403, ['error' => 'Отправка с этого сайта запрещена.']);
    if ($origin !== '') { header('Access-Control-Allow-Origin: ' . $origin); header('Vary: Origin'); }
    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        header('Access-Control-Allow-Methods: POST, OPTIONS');
        respond(204, []);
    }
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') { header('Allow: POST'); respond(405, ['error' => 'Используйте форму заказа.']); }
    if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 155 * 1024 * 1024 || (!$_POST && !$_FILES)) respond(413, ['error' => 'Файлы превышают лимит сервера. Уменьшите их размер.']);
    if (field('website') !== '') respond(422, ['error' => 'Не удалось проверить заявку.']);
    $id = field('requestId', 32);
    if (!preg_match('/^[a-f0-9]{32}$/D', $id)) respond(422, ['error' => 'Обновите страницу и повторите отправку.']);
    $contacts = formContacts(field('contact', 150));
    $contact = $contacts['contact'];
    if (field('consent') !== 'on') respond(422, ['error' => 'Необходимо согласие на обработку данных.']);
    $formType = field('formType', 20) ?: 'detailed';
    $formNames = ['detailed' => 'Подробная форма', 'quick' => 'Быстрый заказ', 'messenger' => 'Быстрый заказ — страница QR'];
    if (!isset($formNames[$formType])) respond(422, ['error' => 'Неизвестный тип формы. Обновите страницу.']);
    $delivery = $formType === 'detailed' ? field('delivery', 20) : 'later';
    $deliveryNames = ['later' => 'Обсудим позже', 'cdek' => 'СДЭК в ПВЗ', 'courier' => 'Курьер', 'pickup' => 'Самовывоз'];
    if (!isset($deliveryNames[$delivery])) respond(422, ['error' => 'Выберите способ доставки.']);
    $city = field('city', 120);
    if (in_array($delivery, ['cdek', 'courier'], true) && !$city) respond(422, ['error' => 'Укажите город доставки.']);
    $details = ['Контакт' => $contact, 'Имя' => field('name', 80), 'Пожелания' => field('comment', 3000), 'Размер' => field('size', 50), 'Свой размер' => field('customSize', 50), 'Ориентация' => field('orientation', 50), 'К нужной дате' => field('date', 20), 'Город' => $city, 'Доставка' => $deliveryNames[$delivery]];
    if ($delivery === 'courier') {
        $details['Адрес курьера'] = field('courierAddress');
        $details['Комментарий курьеру'] = field('courierComment');
        if (!$details['Адрес курьера']) respond(422, ['error' => 'Укажите адрес курьера.']);
    }
    if ($delivery === 'cdek') {
        $cityCode = field('cdekCityCode', 20); $pointCode = field('cdekPvzCode', 30);
        $data = json_decode(file_get_contents(dirname(__DIR__) . '/assets/data/cdek-offices.json'), true, 512, JSON_THROW_ON_ERROR);
        $point = null; $canonicalCity = null;
        foreach ($data['offices'][$cityCode] ?? [] as $candidate) if ($candidate[0] === $pointCode) $point = $candidate;
        foreach ($data['cities'] as $candidate) if ((string)$candidate[0] === $cityCode) $canonicalCity = trim($candidate[1]) . ', ' . $candidate[2];
        if (!$point || !$canonicalCity) respond(422, ['error' => 'Заново выберите пункт СДЭК на карте.']);
        $details['Город СДЭК'] = $canonicalCity;
        $details['Код города СДЭК'] = $cityCode;
        $details['Код ПВЗ СДЭК'] = $pointCode;
        $details['Адрес ПВЗ СДЭК'] = $point[1];
    }
    foreach (['frame' => 'Багет', 'lacquer' => 'Лак', 'giftWrap' => 'Подарочная упаковка'] as $key => $label) $details[$label] = field($key, 5) === 'on' ? 'Да' : 'Нет';
    $details['Пример багета'] = field('frameExample');
    $details['Выбранная работа'] = field('selectedWork', 500);
    if ($formType !== 'detailed') {
        $details = array_intersect_key($details, array_flip(['Контакт', 'Имя', 'Пожелания', 'Выбранная работа']));
    }
    $details = ['Форма' => $formNames[$formType]] + $details;
    $details['Согласие на обработку данных'] = 'Получено ' . gmdate('c') . ' (UTC)';
    $uploads = $_FILES['photos'] ?? null;
    if (!$uploads || !is_array($uploads['name']) || count($uploads['name']) < 1 || count($uploads['name']) > 10) respond(422, ['error' => 'Добавьте от 1 до 10 фотографий.']);
    $checked = []; $total = 0; $finfo = new finfo(FILEINFO_MIME_TYPE);
    foreach ($uploads['name'] as $i => $name) {
        if (!is_string($name) || !isset($uploads['tmp_name'][$i], $uploads['error'][$i]) || $uploads['error'][$i] !== UPLOAD_ERR_OK || !is_uploaded_file($uploads['tmp_name'][$i])) respond(422, ['error' => 'Фотография не загрузилась. Проверьте размер файлов.']);
        $tmp = $uploads['tmp_name'][$i]; $size = filesize($tmp); $total += $size;
        if ($size < 1 || $size > 30 * 1024 * 1024 || $total > 150 * 1024 * 1024) respond(413, ['error' => 'До 30 МБ на фотографию и до 150 МБ вместе.']);
        $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
        $mime = $finfo->file($tmp);
        $allowed = ['jpg' => ['image/jpeg'], 'jpeg' => ['image/jpeg'], 'png' => ['image/png'], 'webp' => ['image/webp'], 'heic' => ['image/heic', 'image/heif', 'image/heic-sequence'], 'heif' => ['image/heif', 'image/heic', 'image/heif-sequence']];
        if (!isset($allowed[$ext]) || !in_array($mime, $allowed[$ext], true)) respond(422, ['error' => 'Разрешены только фотографии JPG, PNG, WebP, HEIC/HEIF.']);
        $safeName = preg_replace('/[\x00-\x1f\x7f\\\\\/]/', '_', $name);
        if (strlen($safeName) > 180 || !preg_match('//u', $safeName)) $safeName = 'photo-' . ($i + 1) . '.' . $ext;
        $checked[] = ['tmp' => $tmp, 'name' => $safeName, 'stored' => $i . '.' . $ext, 'ext' => $ext, 'mime' => $mime];
    }
    $fingerprintFields = $_POST; ksort($fingerprintFields);
    $fingerprint = hash('sha256', json_encode([$fingerprintFields, array_map(fn($f) => [$f['name'], hash_file('sha256', $f['tmp'])], $checked)], JSON_UNESCAPED_UNICODE));
    $root = $config['storage_dir'];
    // Serialize each IP, without storing the raw address or trusting forwarded headers.
    $ratePath = $root . '/rate-' . hash('sha256', $_SERVER['REMOTE_ADDR'] ?? 'unknown');
    $rateLock = fopen($ratePath, 'c+');
    if (!$rateLock || !flock($rateLock, LOCK_EX)) throw new RuntimeException('Rate lock unavailable');
    chmod($ratePath, 0600);
    $times = json_decode(stream_get_contents($rateLock), true) ?: [];
    $times = array_values(array_filter($times, fn($t) => $t > time() - 3600));
    $dir = $root . '/' . $id;
    if (!is_dir($dir) && !mkdir($dir, 0700)) throw new RuntimeException('Order directory unavailable');
    $lock = fopen($dir . '/lock', 'c+');
    if (!$lock || !flock($lock, LOCK_EX)) throw new RuntimeException('Order lock unavailable');
    $existing = is_file($dir . '/order.json') ? json_decode(file_get_contents($dir . '/order.json'), true) : null;
    if ($existing && isset($existing['fingerprint']) && !hash_equals($existing['fingerprint'], $fingerprint)) respond(409, ['code' => 'request_changed', 'error' => 'Этот номер уже связан с другой версией заявки. Уточните статус отправки у менеджера, назвав номер ' . $id . '.']);
    if ($existing && $existing['status'] === 'sent') respond(200, ['ok' => true, 'orderId' => $id, 'summary' => $existing['request']['summary'] ?? []]);
    if ($existing && $existing['status'] === 'sending') respond(409, ['error' => 'Статус отправки уточняется. Свяжитесь с нами и назовите номер ' . $id . '.']);
    $quote = formQuote($formType);
    $request = formRequest($id, $formType, $details, $contacts, $quote, count($checked));
    $details = $request['fields']; unset($details['Номер заявки']);
    if (count($times) >= 5) { header('Retry-After: 3600'); respond(429, ['error' => 'Слишком много заявок. Попробуйте позже или напишите нам.']); }
    $times[] = time(); rewind($rateLock); ftruncate($rateLock, 0); fwrite($rateLock, json_encode($times)); fflush($rateLock); flock($rateLock, LOCK_UN); fclose($rateLock);
    $record = ['status' => 'prepared', 'expires' => time() + 7 * 86400, 'token' => bin2hex(random_bytes(32)), 'files' => [], 'fingerprint' => $fingerprint, 'request' => $request];
    foreach ($checked as $file) {
        if (!move_uploaded_file($file['tmp'], $dir . '/' . $file['stored'])) throw new RuntimeException('Cannot store upload');
        chmod($dir . '/' . $file['stored'], 0600);
        unset($file['tmp']); $record['files'][] = $file;
    }
    saveJson($dir . '/order.json', $record);
    $mail = new PHPMailer(true);
    $mail->isSMTP(); $mail->Host = $config['smtp_host']; $mail->Port = (int)($config['smtp_port'] ?? 465);
    $mail->SMTPSecure = $config['smtp_security'] ?? PHPMailer::ENCRYPTION_SMTPS;
    $mail->SMTPAuth = true; $mail->Username = $config['smtp_user']; $mail->Password = $config['smtp_password'];
    $mail->Timeout = 30; $mail->getSMTPInstance()->Timelimit = 40; $mail->CharSet = 'UTF-8';
    $mail->setFrom($config['smtp_user'], 'АртНаходка — заявки');
    $mail->addAddress($config['recipient']);
    if ($contacts['email'] !== '') $mail->addReplyTo($contacts['email']);
    $mail->addCustomHeader('X-Artnahodka-Form-Version', '2');
    $mail->addStringAttachment(json_encode($request, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR), 'artnahodka-request.json', 'base64', 'application/json');
    $mail->Subject = 'Новая заявка АртНаходка — ' . $formNames[$formType] . ' № ' . $id;
    $body = "Номер заявки: $id\n\n";
    foreach ($details as $label => $value) if ($value !== '') $body .= "$label: $value\n";
    $body .= "\nФотографии (ссылки действуют 7 дней):\n";
    foreach ($record['files'] as $i => $file) {
        $url = rtrim($config['public_url'], '/') . '/api/order-file.php?' . http_build_query(['id' => $id, 'token' => $record['token'], 'file' => $i]);
        $body .= $file['name'] . "\n$url\n\n";
        if ($total <= 18 * 1024 * 1024) $mail->addAttachment($dir . '/' . $file['stored'], $file['name'], 'base64', $file['mime']);
    }
    $mail->Body = $body;
    // Authentication failures are safe to retry; uncertainty starts at mail delivery.
    $mail->smtpConnect();
    $record['status'] = 'sending'; saveJson($dir . '/order.json', $record);
    $attempted = true; $mail->send();
    $record['status'] = 'sent'; saveJson($dir . '/order.json', $record);
    respond(200, ['ok' => true, 'orderId' => $id, 'summary' => $request['summary']]);
} catch (Throwable $e) {
    // No SMTP transcripts, credentials or customer details in public responses/logs.
    error_log('Order failure: ' . get_class($e));
    respond(503, ['error' => $attempted ? 'Не удалось подтвердить отправку. Сохраните номер заявки ' . ($id ?? '') . ' и свяжитесь с нами.' : 'Не удалось отправить заявку. Данные остались в форме. Попробуйте позже.']);
}

