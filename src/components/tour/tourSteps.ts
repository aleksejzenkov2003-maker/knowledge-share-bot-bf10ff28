import type { DriveStep } from 'driver.js';

// ── Employee tours ──

export const chatTourSteps: DriveStep[] = [
  {
    element: '[data-tour="sidebar-chat"]',
    popover: {
      title: '💬 Чат с AI',
      description: 'Основной раздел для общения с AI-ассистентом. Задавайте вопросы, получайте ответы на базе вашей базы знаний.',
    },
  },
  {
    element: '[data-tour="chat-sidebar"]',
    popover: {
      title: '📂 История диалогов',
      description: 'Слева — список ваших чатов. Можно создать новый, переименовать или удалить существующий.',
    },
  },
  {
    element: '[data-tour="chat-input"]',
    popover: {
      title: '✍️ Поле ввода',
      description: 'Введите вопрос и нажмите Enter или кнопку отправки. Можно прикрепить файл или выбрать роль ассистента.',
    },
  },
  {
    element: '[data-tour="chat-role-selector"]',
    popover: {
      title: '🎭 Выбор ассистента',
      description: 'Переключайтесь между ролями AI-ассистента — каждая роль имеет свой контекст и набор знаний.',
    },
  },
];

export const departmentChatTourSteps: DriveStep[] = [
  {
    element: '[data-tour="sidebar-department-chat"]',
    popover: {
      title: '👥 Чат отдела',
      description: 'Общий чат вашего отдела. Все участники видят вопросы и ответы.',
    },
  },
  {
    element: '[data-tour="dept-chat-input"]',
    popover: {
      title: '@ Упоминание агентов',
      description: 'Начните сообщение с @имя_агента чтобы обратиться к конкретному AI-ассистенту.',
    },
  },
];

export const projectsTourSteps: DriveStep[] = [
  {
    element: '[data-tour="sidebar-projects"]',
    popover: {
      title: '📁 Проекты',
      description: 'Создавайте проекты для командной работы с AI. У каждого проекта — своя память и контекст.',
    },
  },
];

// ── Admin tours ──

export const dashboardTourSteps: DriveStep[] = [
  {
    element: '[data-tour="sidebar-dashboard"]',
    popover: {
      title: '📊 Дашборд',
      description: 'Обзор ключевых метрик: количество пользователей, документов, запросов к AI и статус компонентов.',
    },
  },
];

export const chatRolesTourSteps: DriveStep[] = [
  {
    element: '[data-tour="sidebar-chat-roles"]',
    popover: {
      title: '🎭 Роли чатов',
      description: 'Создавайте и настраивайте AI-ассистентов. Каждой роли можно назначить свой промпт, модель и папки с документами.',
    },
  },
];

export const knowledgeBaseTourSteps: DriveStep[] = [
  {
    element: '[data-tour="sidebar-folders"]',
    popover: {
      title: '📁 Папки',
      description: 'Организуйте документы по папкам. Каждая папка может быть привязана к определённым ролям чата.',
    },
  },
  {
    element: '[data-tour="sidebar-documents"]',
    popover: {
      title: '📄 Документы',
      description: 'Загружайте документы (PDF, DOCX, TXT) — они автоматически разбиваются на чанки и индексируются для RAG-поиска.',
    },
  },
];

export const aiConfigTourSteps: DriveStep[] = [
  {
    element: '[data-tour="sidebar-prompts"]',
    popover: {
      title: '💡 Промпты',
      description: 'Системные промпты — инструкции для AI. Каждой роли чата назначается свой промпт.',
    },
  },
  {
    element: '[data-tour="sidebar-providers"]',
    popover: {
      title: '🤖 AI Провайдеры',
      description: 'Настройте подключение к моделям AI: OpenAI, Anthropic, Lovable AI и другим.',
    },
  },
];

export const workflowTemplatesTourSteps: DriveStep[] = [
  {
    element: '[data-tour="sidebar-workflow-templates"]',
    popover: {
      title: '🧩 Шаблоны воркфлоу',
      description:
        'Здесь вы собираете многошаговые процессы из AI-агентов, проверок и условий. Опубликованные шаблоны доступны для запуска в проектах.',
    },
  },
  {
    element: '[data-tour="workflow-templates-create"]',
    popover: {
      title: '➕ Создание шаблона',
      description:
        'Введите понятное название (например, «Подготовка КП») и нажмите «Создать». Откроется визуальный редактор, где вы соберёте шаги.',
    },
  },
  {
    element: '[data-tour="workflow-templates-list"]',
    popover: {
      title: '📋 Список шаблонов',
      description:
        'Ваши шаблоны. «Активен» + «Опубликован» — пользователи видят шаблон в проектах. Черновик — только у вас.',
    },
  },
];

export const workflowEditorTourSteps: DriveStep[] = [
  {
    element: '[data-tour="workflow-editor-toolbar"]',
    popover: {
      title: '🛠️ Панель редактора',
      description:
        'Здесь имя шаблона, статус и основные действия. Название сохраняется автоматически при потере фокуса.',
    },
  },
  {
    element: '[data-tour="workflow-editor-status"]',
    popover: {
      title: '🚦 Статус шаблона',
      description:
        '«Черновик» — видите только вы. «Опубликован» — шаблон доступен для запуска в проектах. «Архив» — скрыт.',
    },
  },
  {
    element: '[data-tour="workflow-editor-add-step"]',
    popover: {
      title: '➕ Добавить шаг',
      description:
        'Основные типы шагов: «Ввод данных» (форма старта), «AI Агент» (LLM-обработка), «Условие IF/ELSE», «Проверка результата», «Скрипт», «Итог».',
    },
  },
  {
    element: '[data-tour="workflow-editor-canvas"]',
    popover: {
      title: '🗺️ Холст процесса',
      description:
        'Перетаскивайте шаги мышкой. Тяните стрелку от одного шага к другому, чтобы связать их: данные из первого станут входом для второго.',
    },
  },
  {
    element: '[data-tour="workflow-editor-validation"]',
    popover: {
      title: '✅ Проверка графа',
      description:
        'Здесь появляются предупреждения: нет стартового шага, не настроен агент, «висящий» выход. Исправьте их перед публикацией.',
    },
  },
  {
    element: '[data-tour="workflow-editor-publish"]',
    popover: {
      title: '🚀 Опубликовать',
      description:
        'Когда граф собран и проверен — опубликуйте. После этого в проектах можно будет выбрать этот шаблон для запуска.',
    },
  },
];

export const adminTourSteps: DriveStep[] = [
  {
    element: '[data-tour="sidebar-users"]',
    popover: {
      title: '👤 Пользователи',
      description: 'Управляйте пользователями: назначайте роли (администратор, модератор, сотрудник) и отделы.',
    },
  },
  {
    element: '[data-tour="sidebar-departments"]',
    popover: {
      title: '🏢 Отделы',
      description: 'Создавайте отделы для группировки пользователей. Каждый отдел имеет свой чат.',
    },
  },
  {
    element: '[data-tour="sidebar-golden"]',
    popover: {
      title: '⭐ Эталоны',
      description: 'Сохраняйте лучшие ответы AI как эталонные — они будут использоваться для улучшения качества.',
    },
  },
  {
    element: '[data-tour="sidebar-api-keys"]',
    popover: {
      title: '🔑 API-ключи',
      description: 'Управляйте ключами для внешних интеграций, включая Bitrix24.',
    },
  },
  {
    element: '[data-tour="sidebar-chat-logs"]',
    popover: {
      title: '📋 Логи чатов',
      description: 'Просматривайте историю всех запросов к AI: тексты, токены, время ответа.',
    },
  },
  {
    element: '[data-tour="sidebar-pii-audit"]',
    popover: {
      title: '🛡️ Аудит ПДн',
      description: 'Отслеживайте маскирование персональных данных в документах и чатах.',
    },
  },
  {
    element: '[data-tour="sidebar-bitrix-sessions"]',
    popover: {
      title: '🔗 Битрикс-сессии',
      description: 'Мониторинг активных сессий пользователей из Bitrix24.',
    },
  },
];

// ── Bitrix widget tour ──

export const bitrixTourSteps: DriveStep[] = [
  {
    element: '[data-tour="bitrix-input"]',
    popover: {
      title: '✍️ Задайте вопрос',
      description: 'Введите вопрос в поле ввода. Можно использовать @упоминание для выбора агента.',
    },
  },
  {
    element: '[data-tour="bitrix-agents"]',
    popover: {
      title: '🤖 Доступные агенты',
      description: 'Нажмите @, чтобы увидеть список доступных AI-агентов и выбрать нужного.',
    },
  },
  {
    element: '[data-tour="bitrix-attach"]',
    popover: {
      title: '📎 Прикрепить файл',
      description: 'Можно прикрепить документ для анализа вместе с вопросом.',
    },
  },
];

// ── Tour definitions ──

export interface TourDefinition {
  id: string;
  label: string;
  description: string;
  steps: DriveStep[];
  navigateTo?: string;
  roles?: ('admin' | 'moderator' | 'employee')[];
}

export const employeeTours: TourDefinition[] = [
  {
    id: 'chat',
    label: 'Как пользоваться чатом',
    description: 'Отправка сообщений, выбор ассистента, файлы',
    steps: chatTourSteps,
    navigateTo: '/chat',
  },
  {
    id: 'department-chat',
    label: 'Чат отдела',
    description: 'Групповой чат с @упоминаниями агентов',
    steps: departmentChatTourSteps,
    navigateTo: '/department-chat',
  },
  {
    id: 'projects',
    label: 'Проекты',
    description: 'Командная работа с AI-памятью',
    steps: projectsTourSteps,
    navigateTo: '/projects',
  },
];

export const adminTours: TourDefinition[] = [
  {
    id: 'dashboard',
    label: 'Дашборд',
    description: 'Обзор метрик и статус системы',
    steps: dashboardTourSteps,
    navigateTo: '/',
    roles: ['admin', 'moderator'],
  },
  {
    id: 'chat-roles',
    label: 'Управление ролями',
    description: 'Создание и настройка AI-ассистентов',
    steps: chatRolesTourSteps,
    navigateTo: '/chat-roles',
    roles: ['admin'],
  },
  {
    id: 'knowledge-base',
    label: 'База знаний',
    description: 'Папки и документы для RAG',
    steps: knowledgeBaseTourSteps,
    navigateTo: '/folders',
    roles: ['admin'],
  },
  {
    id: 'ai-config',
    label: 'Настройка AI',
    description: 'Промпты и провайдеры',
    steps: aiConfigTourSteps,
    navigateTo: '/prompts',
    roles: ['admin'],
  },
  {
    id: 'workflow-templates',
    label: 'Шаблоны воркфлоу',
    description: 'Список шаблонов и создание нового',
    steps: workflowTemplatesTourSteps,
    navigateTo: '/workflow-templates',
    roles: ['admin'],
  },
  {
    id: 'workflow-editor',
    label: 'Редактор воркфлоу',
    description: 'Как устроен визуальный редактор процессов',
    steps: workflowEditorTourSteps,
    roles: ['admin'],
  },
  {
    id: 'admin',
    label: 'Администрирование',
    description: 'Пользователи, отделы, логи',
    steps: adminTourSteps,
    roles: ['admin', 'moderator'],
  },
];
