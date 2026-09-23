<?php
declare(strict_types=1);

function formPhone(string $value): string {
    if ($value === '') return '';
    $digits = preg_replace('/\D/', '', $value);
    if (!preg_match('/^[+\d\s()−–-]+$/uD', $value) || !preg_match('/^\d{10,15}$/D', $digits) || strpbrk($value, "\r\n") !== false) respond(422, ['error' => 'Проверьте телефон: укажите от 10 до 15 цифр с кодом страны.']);
    if (strlen($digits) === 11 && $digits[0] === '8') $digits = '7' . substr($digits, 1);
    return '+' . $digits;
}

function formContacts(string $legacy): array {
    $v2 = field('formVersion', 2) === '2';
    $method = $v2 ? field('contactMethod', 20) : (filter_var($legacy, FILTER_VALIDATE_EMAIL) ? 'email' : (str_starts_with($legacy, '@') ? 'telegram' : 'phone'));
    if (!in_array($method, ['phone', 'email', 'telegram', 'max'], true)) respond(422, ['error' => 'Выберите удобный способ связи.']);
    $phone = formPhone($v2 ? field('phone', 40) : ($method === 'phone' ? $legacy : ''));
    $email = strtolower($v2 ? field('email', 150) : ($method === 'email' ? $legacy : ''));
    $telegram = $v2 ? field('telegram', 33) : ($method === 'telegram' ? $legacy : '');
    if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) respond(422, ['error' => 'Проверьте адрес электронной почты.']);
    if ($telegram !== '' && !preg_match('/^@[a-z0-9_]{5,32}$/iD', $telegram)) respond(422, ['error' => 'Укажите Telegram в формате @username.']);
    $contact = ['phone' => $phone, 'max' => $phone, 'email' => $email, 'telegram' => $telegram][$method];
    if ($contact === '') respond(422, ['error' => 'Заполните контакт для выбранного способа связи.']);
    return compact('phone', 'email', 'telegram', 'method', 'contact', 'v2');
}

function formQuote(string $type): array {
    $catalog = json_decode(file_get_contents(dirname(__DIR__) . '/assets/data/order-pricing.json'), true, 32, JSON_THROW_ON_ERROR);
    $size = $type === 'detailed' ? field('size', 50) : 'unknown';
    if (!in_array($size, ['', 'unknown', 'custom'], true) && !array_key_exists($size, $catalog['prices'])) respond(422, ['error' => 'Выберите размер из списка или укажите свой размер.']);
    $dimensions = null;
    $rawSize = $size === 'custom' ? field('customSize', 50) : $size;
    if (preg_match('/^(\d{1,4}(?:[.,]\d{1,2})?)\s*[×xхXХ*]\s*(\d{1,4}(?:[.,]\d{1,2})?)\s*(?:см)?$/uD', $rawSize, $m)) $dimensions = [(float)str_replace(',', '.', $m[1]), (float)str_replace(',', '.', $m[2])];
    if ($size === 'custom' && (!$dimensions || min($dimensions) <= 0 || max($dimensions) > 1000)) respond(422, ['error' => 'Укажите свой размер в сантиметрах, например 70 × 100.']);
    if ($type === 'detailed') {
        $orientation = field('orientation', 50);
        if (!in_array($orientation, ['', 'unknown', 'Вертикальная', 'Горизонтальная', 'Квадратная'], true)) respond(422, ['error' => 'Выберите ориентацию из списка.']);
        if ($dimensions && ($dimensions[0] === $dimensions[1] ? $orientation !== 'Квадратная' : $orientation === 'Квадратная')) respond(422, ['error' => 'Ориентация не соответствует размеру. Проверьте выбор размера и ориентации.']);
    }
    $base = $catalog['prices'][$size] ?? null;
    $extras = []; $unknown = [];
    if ($base === null) $unknown[] = 'Размер и базовая стоимость';
    foreach (['lacquer' => 'Лак', 'giftWrap' => 'Подарочная упаковка'] as $key => $label) {
        if ($type === 'detailed' && field($key, 5) === 'on') $extras[] = ['key' => $key, 'label' => $label, 'amount' => $catalog['extras'][$key]];
    }
    if ($type === 'detailed' && field('frame', 5) === 'on') $unknown[] = 'Багет';
    if ($type !== 'detailed' || field('delivery', 20) !== 'pickup') $unknown[] = 'Доставка';
    $subtotal = $base === null ? null : $base + array_sum(array_column($extras, 'amount'));
    $quote = ['version' => $catalog['version'], 'currency' => 'RUB', 'base' => $base, 'extras' => $extras, 'subtotal' => $subtotal, 'unknown' => $unknown];
    if ($type === 'detailed' && field('formVersion', 2) === '2' && (field('pricingVersion', 50) !== $catalog['version'] || field('estimatedTotal', 30) !== ($subtotal === null ? '' : (string)$subtotal))) respond(409, ['code' => 'price_changed', 'error' => 'Расчёт обновлён. Проверьте сумму и нажмите «Отправить заявку» ещё раз.', 'catalog' => $catalog, 'quote' => $quote]);
    return $quote;
}

function formMoney($amount): string {
    return $amount === null ? 'Рассчитаем индивидуально' : number_format((float)$amount, 0, ',', ' ') . ' ₽';
}

function formRequest(string $id, string $type, array $details, array $contacts, array $quote, int $fileCount): array {
    $methodNames = ['phone' => 'Телефон', 'email' => 'Email', 'telegram' => 'Telegram', 'max' => 'MAX'];
    $details['Контакт'] = $contacts['contact'];
    $details['Телефон'] = $contacts['phone'];
    $details['Email'] = $contacts['email'];
    $details['Telegram'] = $contacts['telegram'];
    $details['Предпочтительный способ связи'] = $methodNames[$contacts['method']];
    if ($type === 'detailed') {
        $delivery = field('delivery', 20);
        if ($delivery !== 'later' && $contacts['phone'] === '') respond(422, ['error' => 'Для выбранного способа доставки укажите телефон в отдельном поле.']);
        $different = $delivery !== 'later' && field('differentRecipient', 5) === 'on';
        $recipient = $different ? field('recipientName', 80) : ($details['Имя'] ?? '');
        $recipientPhone = $different ? formPhone(field('recipientPhone', 40)) : $contacts['phone'];
        if ($different && ($recipient === '' || $recipientPhone === '')) respond(422, ['error' => 'Укажите имя и телефон другого получателя.']);
        $details['Получатель'] = $recipient;
        $details['Телефон получателя'] = $recipientPhone;
        $details['Базовая стоимость'] = formMoney($quote['base']);
        $details['Стоимость опций'] = $quote['extras'] ? implode('; ', array_map(fn($x) => $x['label'] . ': ' . formMoney($x['amount']), $quote['extras'])) : 'Нет платных опций с фиксированной ценой';
        $details['Предварительная сумма'] = formMoney($quote['subtotal']);
        $details['Рассчитывается отдельно'] = implode(', ', $quote['unknown']);
        $details['Стоимость доставки'] = $delivery === 'pickup' ? '0 ₽ — самовывоз' : 'Согласуем отдельно';
    }
    $summary = array_intersect_key($details, array_flip(['Форма', 'Имя', 'Размер', 'Свой размер', 'Ориентация', 'Багет', 'Лак', 'Подарочная упаковка', 'Доставка', 'Город', 'Адрес курьера', 'Адрес ПВЗ СДЭК', 'К нужной дате', 'Телефон', 'Email', 'Telegram', 'Предпочтительный способ связи', 'Получатель', 'Телефон получателя', 'Базовая стоимость', 'Стоимость опций', 'Предварительная сумма', 'Рассчитывается отдельно', 'Стоимость доставки'])));
    foreach (['Размер', 'Ориентация'] as $key) if (($summary[$key] ?? '') === 'unknown') $summary[$key] = 'Уточним при согласовании';
    if (($summary['Размер'] ?? '') === 'custom') $summary['Размер'] = 'Свой размер';
    $summary['Фотографий'] = $fileCount;
    return ['schema_version' => 2, 'request_id' => $id, 'form_type' => $type, 'fields' => ['Номер заявки' => $id] + $details, 'quote' => $type === 'detailed' ? $quote : null, 'summary' => $summary];
}
