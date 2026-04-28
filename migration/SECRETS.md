# Секреты для переноса в Edge Functions нового Supabase

Добавьте каждый в **Edge Functions → Manage secrets** в новом дашборде.

⚠️ Значения возьмите из текущего Lovable проекта (Backend → Edge Functions → Secrets) или из исходных аккаунтов сервисов.

## Автоматические (создаются Supabase сами — НЕ добавлять вручную)
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_DB_URL`
- `SUPABASE_JWKS`
- `SUPABASE_PUBLISHABLE_KEY`

## AI-провайдеры

| Секрет | Где взять | Используется в |
|---|---|---|
| `OPENAI_API_KEY` | https://platform.openai.com/api-keys | chat, chat-stream, audio-transcribe, voice-transcribe |
| `ANTHROPIC_API_KEY` | https://console.anthropic.com/settings/keys | chat-stream (Claude) |
| `GEMINI_API_KEY` | https://aistudio.google.com/apikey | chat-stream (Gemini) |
| `PERPLEXITY_API_KEY` | https://www.perplexity.ai/settings/api | deep-research, reputation-web-search |
| `OPENROUTER_API_KEY` | https://openrouter.ai/keys | chat-stream (фоллбэк) |
| `KIMI_API_KEY` | https://platform.moonshot.ai (международный) | chat-stream |
| `QWEN_API_KEY` | https://dashscope.console.aliyun.com | chat-stream |
| `GIGACHAT_API_KEY` | https://developers.sber.ru/studio | chat-stream |
| ~~`LOVABLE_API_KEY`~~ | **❌ Нельзя перенести.** Это внутренний ключ Lovable AI Gateway. Замените на прямые вызовы OpenAI/Anthropic/Gemini в коде функций. | chat, chat-stream |

## Внешние API

| Секрет | Где взять | Используется |
|---|---|---|
| `REPUTATION_API_KEY` | reputation.ru — личный кабинет | reputation-api |
| `SCREENSHOTONE_API_KEY` | https://screenshotone.com/dashboard | spy-market-scan |
| `SBIS_LOGIN` | СБИС логин | sbis-api |
| `SBIS_PASSWORD` | СБИС пароль | sbis-api |
| `SBIS_APP_CLIENT_ID` | СБИС приложение | sbis-api |
| `SBIS_APP_SECRET` | СБИС приложение | sbis-api |
| `SBIS_SECRET_KEY` | СБИС приложение | sbis-api |

## PII / Безопасность

| Секрет | Где взять | Используется |
|---|---|---|
| `PII_ENCRYPTION_KEY` | Сгенерируйте новый: `openssl rand -hex 32` ⚠️ Если изменить — старые зашифрованные PII в `pii_mappings` станут нечитаемыми! Лучше скопировать старое значение. | pii-mask, pii-unmask |
| `BITRIX_JWT_SECRET` | Сгенерируйте: `openssl rand -hex 64`. ⚠️ После смены все Bitrix-сессии разлогинятся — пользователям нужно зайти заново. Лучше скопировать старое значение. | bitrix-chat-api |

---

## Как скопировать значения из Lovable

В Lovable секреты **нельзя посмотреть** через UI, только перезаписать. Варианты:

1. **Из исходных сервисов** — самый надёжный, идите в каждый кабинет и пересоздайте/скопируйте ключ.
2. **Через Edge Function-дамп** (одноразово): создайте временную функцию в Lovable, которая возвращает `Deno.env.get(...)` — но это рискованно по безопасности, лучше путь №1.

## Контрольный список (24 секрета)

- [ ] OPENAI_API_KEY
- [ ] ANTHROPIC_API_KEY
- [ ] GEMINI_API_KEY
- [ ] PERPLEXITY_API_KEY
- [ ] OPENROUTER_API_KEY
- [ ] KIMI_API_KEY
- [ ] QWEN_API_KEY
- [ ] GIGACHAT_API_KEY
- [ ] REPUTATION_API_KEY
- [ ] SCREENSHOTONE_API_KEY
- [ ] SBIS_LOGIN
- [ ] SBIS_PASSWORD
- [ ] SBIS_APP_CLIENT_ID
- [ ] SBIS_APP_SECRET
- [ ] SBIS_SECRET_KEY
- [ ] PII_ENCRYPTION_KEY
- [ ] BITRIX_JWT_SECRET
- [ ] (LOVABLE_API_KEY — заменить на прямые AI-провайдеры)
