

# Апгрейд страницы Reputation -- красивый дизайн и рабочая история

## Что будет сделано

Полная переработка визуала страницы `/reputation` с красивыми иконками, выделениями, аккуратными кнопками, и рабочей историей поиска (сохраненные отчёты загружаются по клику).

## 1. Поисковая секция -- новый дизайн

- Градиентный заголовок с иконкой `Shield` и подзаголовком
- Поле поиска с увеличенным размером, мягкой тенью, иконкой типа запроса (Hash для ИНН/ОГРН, Building2 для названия)
- Кнопка "Найти" -- primary с иконкой `Search`, анимация при загрузке
- Подсказка под полем -- стилизованная с иконкой `Lightbulb`

## 2. История поиска -- полностью рабочая

Сейчас клик по сохраненным отчётам ничего не делает (`{/* TODO: load saved report */}`). Исправления:

- **Загрузка отчёта по клику**: читаем `report_data` из таблицы `reputation_reports`, подставляем в `selectedCompany`, `selectedSections`, восстанавливаем `query`
- **Удаление отчётов**: иконка корзины с подтверждением
- **Дата и время**: показываем когда был сохранён отчёт в формате "2 дня назад" / дата
- **Визуал карточек истории**: иконка `Clock`, бейдж ИНН, hover-эффект

## 3. Панель настроек -- визуальный апгрейд

- Иконки для каждой секции данных (FileText для Реквизиты, Users для Руководство, MapPin для Адрес, Briefcase для ОКВЭД, Banknote для Финансы, Stamp для ТЗ, Scale для Арбитраж, Phone для Контакты)
- Переключение чекбоксов с анимацией
- Разделители между группами

## 4. Список результатов поиска -- улучшения

- Карточки с hover-анимацией (scale + shadow)
- Цветовая индикация статуса: зелёный кружок для "Действующая", красный для "Ликвидирована"
- Иконка типа (Building2 для юрлиц, User для ИП)
- Улучшенные фильтры с иконками

## 5. Карточка компании (CompanyDetailCard) -- апгрейд

- Шапка с gradient-border, крупная иконка с цветным фоном по статусу
- Кнопки "Копировать" и "Сохранить" -- outline с hover-эффектами, иконки
- Табы -- стилизованные с иконками для каждой секции
- DataGrid -- с иконками-лейблами, чередование строк (zebra), hover
- Таблицы руководителей/сотрудников -- rounded borders, чередование, аватарки-заглушки

## 6. Пустое состояние

- Красивая заглушка при отсутствии результатов: большая иконка `SearchX`, текст-подсказка

## Технические детали

### Файл: `src/pages/Reputation.tsx`

Основные изменения в одном файле:

**Новые иконки (импорт)**:
`Shield, Clock, Trash2, Users, Phone, Banknote, Scale, Briefcase, Lightbulb, SearchX, CircleDot, User`

**Функция `loadSavedReport(id)`**:
```typescript
const loadSavedReport = async (id: string) => {
  const { data } = await supabase
    .from('reputation_reports')
    .select('*')
    .eq('id', id)
    .single();
  if (data) {
    setSelectedCompany(data.report_data);
    setEntityType(data.entity_type);
    setQuery(data.query || data.name || '');
    setSelectedSections(data.selected_sections || DATA_SECTIONS.map(s => s.key));
    setSearchResults([]);
  }
};
```

**Функция `deleteSavedReport(id)`**:
```typescript
const deleteSavedReport = async (id: string) => {
  await supabase.from('reputation_reports').delete().eq('id', id);
  loadSavedReports();
  toast({ title: 'Отчёт удалён' });
};
```

**Иконки для секций**:
```typescript
const SECTION_ICONS: Record<string, LucideIcon> = {
  requisites: FileText,
  management: Users,
  address: MapPin,
  activities: Briefcase,
  finances: Banknote,
  trademarks: Hash,
  arbitration: Scale,
  contacts: Phone,
};
```

**Форматирование даты для истории**:
```typescript
const formatRelativeDate = (dateStr: string) => {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return 'Сегодня';
  if (diffDays === 1) return 'Вчера';
  if (diffDays < 7) return `${diffDays} дн. назад`;
  return date.toLocaleDateString('ru-RU');
};
```

**Визуальные улучшения** -- обновление className для:
- Поисковой карточки: gradient border-top, увеличенный padding
- Карточек результатов: `hover:scale-[1.02] hover:shadow-lg transition-all`
- DataGrid: zebra-striping, иконки у лейблов
- Кнопок: аккуратные размеры, gap между иконкой и текстом
- Истории: hover-эффекты, кнопка удаления, бейджи

