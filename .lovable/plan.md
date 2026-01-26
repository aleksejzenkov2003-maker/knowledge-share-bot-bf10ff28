
# Исправление получения домена портала Bitrix24

## Проблема
Текущий код использует `BX24.placement.info().DOMAIN`, который работает только для placement-приложений. Для обычных локальных приложений (которые открываются через меню) этот метод возвращает пустое значение.

## Решение
Использовать несколько методов получения домена с fallback:

1. `BX24.getDomain()` - основной метод для получения домена
2. `BX24.placement.info().DOMAIN` - запасной вариант для placement-приложений
3. Парсинг `document.referrer` - крайний fallback

## Изменения в файлах

### 1. `public/bitrix24-app/department.html`

Изменить строки 183-190:

```javascript
// БЫЛО:
var placement = BX24.placement.info();
var portal = placement.DOMAIN;

if (!portal) {
  showError('Не удалось определить домен портала Bitrix24.');
  return;
}

// СТАНЕТ:
var portal = null;

// Метод 1: BX24.getDomain() - основной для локальных приложений
if (typeof BX24.getDomain === 'function') {
  portal = BX24.getDomain();
}

// Метод 2: placement.info().DOMAIN - для placement-приложений
if (!portal) {
  try {
    var placement = BX24.placement.info();
    portal = placement.DOMAIN || placement.domain;
  } catch (e) {
    console.log('[AI Assistant] placement.info() не доступен');
  }
}

// Метод 3: Парсинг referrer
if (!portal && document.referrer) {
  try {
    var url = new URL(document.referrer);
    if (url.hostname.includes('bitrix24')) {
      portal = url.hostname;
    }
  } catch (e) {}
}

if (!portal) {
  showError('Не удалось определить домен портала Bitrix24. Попробуйте перезагрузить страницу.');
  return;
}
```

### 2. `public/bitrix24-app/personal.html`

Применить такое же исправление для строк 126-133.

Также обновить ссылку на виджет (строка 103) — сейчас там старый домен:
```html
<!-- БЫЛО -->
<script src="https://knowledge-share-bot.lovable.app/widget/bitrix-chat-widget-v3.js"></script>

<!-- СТАНЕТ -->
<script src="https://admin.artpatent-content.ru/widget/bitrix-chat-widget-v3.js"></script>
```

## Добавить отладку

Для упрощения отладки добавить логирование:

```javascript
console.log('[AI Assistant] Определение домена портала...');
console.log('[AI Assistant] BX24.getDomain():', typeof BX24.getDomain === 'function' ? BX24.getDomain() : 'не доступен');
console.log('[AI Assistant] document.referrer:', document.referrer);
console.log('[AI Assistant] Итоговый portal:', portal);
```

## Результат

После этих изменений приложение сможет корректно определять домен портала для любых типов приложений Bitrix24 (локальные, marketplace, placement).
