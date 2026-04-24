
## Диагностика и фикс «Sonar / Perplexity барахлит»

### Что сейчас на самом деле происходит

1. **`sonar-deep-research`** (роли «Исследование», «(2-2) Подбор нормативки») — идёт через `deep-research` edge function. На скриншоте было видно: ответ реально приходит (112с, 10 источников), но всплывает красный **«Load failed»**.
2. **`sonar-pro`** (Поиск PRO, Поиск бренда, Поисковик, Досье-аналитик и др., 7 ролей) — идёт через обычный `chat-stream`. На скриншоте видно «Загрузка не удалась» — и тоже после длительного ожидания.

### Корневая причина (3 связанных бага)

**A. JWT истекает за время длинного запроса.** 
Access-token живёт ~1 час, но в `useOptimizedChat.ts` (строка 302–303) токен берётся **один раз** перед `fetch`. После 60+ секунд деep-research запрос ещё идёт, но дальнейшие операции после стрима — `saveMessage()` (505), `update conversations` (512), `invalidateQueries` (519) — могут стрелять с истёкшим токеном → 401 → toast «Load failed».

**B. Сам HTTP-запрос на edge function.** 
`fetch(...)` к Supabase Edge Function использует тот же Bearer-токен. Если на момент **отправки** токен жив, но **процесс длится 100+ секунд**, то на стороне Supabase Edge Runtime валидация может сработать у границы периода ротации. Особенно если пользователь только что вернулся в таб и `autoRefreshToken` едва успел отработать (видно в логах: `token_revoked` при refresh — старый токен сразу инвалидируется).

**C. У `sonar-pro` (не deep-research) в `useOptimizedChat` нет client-side таймаута** (строка 331: `clientTimeout = isDeepResearch ? 360000 : undefined`). Если Perplexity подвис — браузер ждёт системный таймаут (обычно ~120с в Safari/iOS) и кидает generic «Load failed» от `fetch`. Запись в БД при этом не падает — теряется только UI.

### Что чиню

#### 1. Принудительный refresh токена прямо перед длинным запросом
В `useOptimizedChat.ts` (и `useChat.ts` для парности) — если до истечения токена < 5 минут или это deep-research / perplexity-роль, делать `supabase.auth.refreshSession()` перед `fetch`. Так свежий JWT проживёт 60 минут с момента старта запроса — гарантированно покроет 5-минутный deep-research + последующие save/update.

```ts
// перед получением token
const { data: sessionData } = await supabase.auth.getSession();
const expiresAt = sessionData.session?.expires_at ?? 0;
const secondsLeft = expiresAt - Math.floor(Date.now() / 1000);
const isPerplexity = isDeepResearch || roleConfig?.model_config?.model?.includes('sonar');
if (secondsLeft < 600 || isPerplexity) {
  const { data: refreshed } = await supabase.auth.refreshSession();
  token = refreshed.session?.access_token ?? token;
}
```

#### 2. Повторное получение токена для post-stream операций
После окончания стрима (строки 505–519) делать ещё один `getSession()` — чтобы `saveMessage` / `conversations.update` шли со свежим JWT, а не со 100-секундной давности.

#### 3. Client-side таймаут для Perplexity не-deep моделей
`sonar-pro`, `sonar-reasoning-pro` тоже бывают долгими (30–90с). Поднять таймаут до **150с** (вместо системного):
```ts
const isPerplexityModel = isDeepResearch || mc?.model?.includes('sonar');
const clientTimeout = isDeepResearch ? 360000 : (isPerplexityModel ? 150000 : undefined);
```

#### 4. Понятный текст ошибки вместо «Load failed»
Перехватывать `TypeError: Load failed` / `Failed to fetch` в catch (строки 521–574) и показывать:
- «Ответ от модели получен, но соединение оборвалось при сохранении. Перезагрузите чат — сообщение должно быть на месте.» — если streamingContentRef не пустой,
- «Сервер Perplexity не ответил вовремя. Попробуйте ещё раз или сократите запрос.» — если пусто.

И главное — **сохранять частичный контент** даже на не-Abort ошибках (сейчас это делается только для AbortError, строка 528). Это спасёт ответ deep-research, который пришёл полностью, но упал save.

#### 5. На бэкенде — двойная проверка
В `deep-research/index.ts` уже есть `getClaims(token)` (строка 233). Добавлю log с временем валидации, чтобы в следующий раз сразу было видно — это JWT-401 или что-то ещё. Плюс если `claimsError` — возвращать `error: 'TOKEN_EXPIRED'` явным текстом, чтобы фронт мог сделать refresh + retry автоматически.

#### 6. Проверить и единый retry-on-401 в фронте
Если первый `fetch` к edge function вернул 401 — попробовать `refreshSession()` и повторить **один раз**. Это уберёт случайные ошибки из-за гонки рефреша.

### Файлы для правки

**Frontend:**
- `src/hooks/useOptimizedChat.ts` — refresh токена до и после, таймаут для sonar-pro, спасение partial content на ошибках, retry on 401, понятные тексты ошибок
- `src/hooks/useChat.ts` — то же самое (используется в Bitrix-чатах)
- `src/hooks/useOptimizedDepartmentChat.ts` — гляну, скорее всего та же история
- `src/hooks/useProjectChat.ts` — аналогично

**Backend:**
- `supabase/functions/deep-research/index.ts` — явный код ошибки `TOKEN_EXPIRED`, чуть больше логов (роль, модель, время до истечения JWT)
- `supabase/functions/chat-stream/index.ts` — то же для sonar-веток (не трогаю остальную логику)

### Чего НЕ делаю

- Не перевожу на queue-based (overkill, основная боль — JWT, а не лимит CPU; deep-research уже укладывается в 300с)
- Не меняю модели и промпты Perplexity-ролей
- Не трогаю SSE-парсинг и watchdog'и — они работают, ответ-то реально приходит

### Как проверим что починилось

1. Запустить `sonar-deep-research` роль с долгим вопросом — должен дойти ответ + сохраниться + НЕ показать «Load failed».
2. Запустить `sonar-pro` (например «Поиск PRO») — таймаут 150с, понятная ошибка если Perplexity молчит.
3. Если в момент запроса токен близок к истечению (можно искусственно подождать ~55 минут) — должен автоматом обновиться без ошибок.
