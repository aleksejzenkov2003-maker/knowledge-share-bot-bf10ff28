import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  ExternalLink, Image as ImageIcon, Phone, Mail, Globe, MapPin, User,
  Calendar, Hash, FileText, TrendingUp, TrendingDown, Minus, Scale,
  Building2, ShieldCheck, AlertTriangle, CheckCircle2, XCircle, Info,
  Banknote, Briefcase, BarChart3
} from 'lucide-react';

// ─── LABEL MAP (human-readable Russian labels) ────────────────

const LABEL_MAP: Record<string, string> = {
  inn: 'ИНН', ogrn: 'ОГРН', kpp: 'КПП', okpo: 'ОКПО', okved: 'ОКВЭД',
  company_name: 'Название', company_short_name: 'Краткое название',
  company_full_name: 'Полное название', condition_code: 'Код состояния',
  multi_kpp: 'Доп. КПП', registration_date: 'Дата регистрации',
  // Finance
  revenue: 'Выручка', profit: 'Прибыль', net_profit: 'Чистая прибыль',
  balance: 'Баланс', assets: 'Активы', current_assets: 'Оборотные активы',
  capital: 'Капитал', authorized_capital: 'Уставный капитал',
  accounts_payable: 'Кредиторская задолженность', buyers_debts: 'Дебиторская задолженность',
  borrowed_funds_long: 'Заёмные средства (долгоср.)', borrowed_funds_short: 'Заёмные средства (краткоср.)',
  before_taxation_profit: 'Прибыль до налогообложения', additional_capital: 'Добавочный капитал',
  capital_and_reserves: 'Капитал и резервы', commercial_expenses: 'Коммерческие расходы',
  cost_price: 'Себестоимость', costs: 'Расходы', administrative_expenses: 'Управленческие расходы',
  current_income_tax: 'Текущий налог на прибыль', deferred_income_tax: 'Отложенный налог',
  // Courts
  win_defendant: 'Выигрыши (ответчик)', cost_win_defendant: 'Сумма выигрышей (ответчик)',
  loose_defendant: 'Проигрыши (ответчик)', cost_loose_defendant: 'Сумма проигрышей (ответчик)',
  undefined_defendant: 'Не определено (ответчик)', cost_undefined_defendant: 'Сумма не определено (ответчик)',
  process_defendant: 'В процессе (ответчик)', cost_process_defendant: 'Сумма в процессе (ответчик)',
  all_defendant: 'Всего дел (ответчик)', cost_defendant: 'Общая сумма (ответчик)',
  win_plaintiff: 'Выигрыши (истец)', cost_win_plaintiff: 'Сумма выигрышей (истец)',
  loose_plaintiff: 'Проигрыши (истец)', cost_loose_plaintiff: 'Сумма проигрышей (истец)',
  undefined_plaintiff: 'Не определено (истец)', cost_undefined_plaintiff: 'Сумма не определено (истец)',
  process_plaintiff: 'В процессе (истец)', cost_process_plaintiff: 'Сумма в процессе (истец)',
  all_plaintiff: 'Всего дел (истец)', cost_plaintiff: 'Общая сумма (истец)',
  exec_sheets: 'Исполнительные листы', cost_exec_sheets: 'Сумма исп. листов',
  actual_exec_sheets: 'Активные исп. листы', cost_actual_exec_sheets: 'Сумма активных исп. листов',
  // Reliability
  advantages: 'Преимущества', disadvantages: 'Недостатки',
  advantages_sum_value: 'Оценка преимуществ', disadvantages_sum_value: 'Оценка недостатков',
  additional_sum_value: 'Дополнительная оценка', has_critical: 'Есть критические',
  // Contacts
  phone_numbers: 'Телефоны', emails: 'Email', sites: 'Сайты',
  // Tenders
  publish_date: 'Дата публикации', amount: 'Сумма', lot_name: 'Лот',
  end_offer_date: 'Срок окончания', region: 'Регион', tp_brief: 'Площадка',
  proc_type: 'Тип закупки', currency_brief: 'Валюта', winner_name: 'Победитель',
  company_name_field: 'Компания', tp_type_name: 'Тип', industry: 'Отрасль',
};

function getLabel(key: string): string {
  return LABEL_MAP[key] || key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ─── Format numbers ────────────────────────────────────────────

function formatNumber(val: any): string {
  const n = Number(val);
  if (isNaN(n)) return String(val);
  if (Math.abs(n) >= 1e12) return (n / 1e12).toFixed(2) + ' трлн';
  if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(1) + ' млрд';
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1) + ' млн';
  if (Math.abs(n) >= 1e3) return n.toLocaleString('ru-RU');
  return n.toLocaleString('ru-RU');
}

function formatMoney(val: any): string {
  const n = Number(val);
  if (isNaN(n)) return String(val);
  return formatNumber(n) + ' ₽';
}

// ─── Requisites (tab "Реквизиты") ──────────────────────────────

export const RequisitesRenderer = ({ data }: { data: any }) => {
  if (!data || typeof data !== 'object') return <p className="text-sm text-muted-foreground">Нет данных</p>;

  // The VOK req endpoint may return an array (e.g. [[{...}]]) or single object
  const obj = Array.isArray(data) ? (Array.isArray(data[0]) ? data[0][0] : data[0]) : data;
  if (!obj) return <p className="text-sm text-muted-foreground">Нет данных</p>;

  const mainFields = [
    { key: 'inn', icon: <Hash className="h-4 w-4" /> },
    { key: 'kpp', icon: <Hash className="h-4 w-4" /> },
    { key: 'ogrn', icon: <Hash className="h-4 w-4" /> },
    { key: 'okpo', icon: <Hash className="h-4 w-4" /> },
    { key: 'company_short_name', icon: <Building2 className="h-4 w-4" /> },
    { key: 'company_full_name', icon: <Building2 className="h-4 w-4" /> },
    { key: 'company_name', icon: <Building2 className="h-4 w-4" /> },
    { key: 'condition_code', icon: <Info className="h-4 w-4" /> },
    { key: 'registration_date', icon: <Calendar className="h-4 w-4" /> },
  ];

  const displayedKeys = new Set(mainFields.map(f => f.key));

  return (
    <div className="space-y-4">
      {/* Main fields */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {mainFields.map(({ key, icon }) => {
          const val = obj[key];
          if (val == null || val === '') return null;
          return (
            <div key={key} className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
              <div className="text-muted-foreground mt-0.5">{icon}</div>
              <div>
                <div className="text-xs text-muted-foreground">{getLabel(key)}</div>
                <div className="text-sm font-semibold break-all">
                  {typeof val === 'object' ? (Array.isArray(val) ? `[${val.length} элементов]` : JSON.stringify(val)) : String(val)}
                </div>
              </div>
            </div>
          );
        }).filter(Boolean)}
      </div>

      {/* ОКВЭД */}
      {obj.okved && (
        <div className="p-3 rounded-lg bg-muted/30">
          <div className="text-xs text-muted-foreground mb-1">ОКВЭД</div>
          <div className="text-xs break-all leading-relaxed">{typeof obj.okved === 'object' ? JSON.stringify(obj.okved) : String(obj.okved)}</div>
        </div>
      )}

      {/* Remaining fields */}
      <RemainingFields obj={obj} exclude={[...displayedKeys, 'okved']} />
    </div>
  );
};

// ─── Finance ───────────────────────────────────────────────────

export const FinanceRenderer = ({ data }: { data: any }) => {
  if (!data) return <p className="text-sm text-muted-foreground">Нет данных</p>;

  const obj = Array.isArray(data) ? (Array.isArray(data[0]) ? data[0][0] : data[0]) : data;
  if (!obj) return <p className="text-sm text-muted-foreground">Нет финансовых данных</p>;

  // Sections: state descriptions (efficiency_state, financial_position_state, etc.)
  const stateKeys = Object.keys(obj).filter(k =>
    k.endsWith('_state') || k === 'current_assets' || k === 'dependence_on_creditors' || k === 'estate_description'
  );

  // Financial indicators: { "2004": { "accounts_payable": { formula, value }, ... } }
  const finIndicators = obj.financial_indicators;

  return (
    <div className="space-y-6">
      {/* State descriptions */}
      {stateKeys.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {stateKeys.map(key => {
            const val = obj[key];
            if (val == null) return null;

            // Could be a string like "normal" / "bad" / "good" or an object with {description, state}
            const isObj = typeof val === 'object' && val !== null;
            const state = isObj ? val.state : val;
            const description = isObj ? val.description : null;

            return (
              <Card key={key} className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <StateIcon state={state} />
                  <span className="text-sm font-medium">{getLabel(key)}</span>
                  <StateBadge state={state} />
                </div>
                {description && (
                  <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
                )}
              </Card>
            );
          }).filter(Boolean)}
        </div>
      )}

      {/* Financial indicators table */}
      {finIndicators && typeof finIndicators === 'object' && (
        <FinancialIndicatorsTable data={finIndicators} />
      )}

      {/* Remaining top-level fields */}
      <RemainingFields obj={obj} exclude={[...stateKeys, 'financial_indicators']} />
    </div>
  );
};

const FinancialIndicatorsTable = ({ data }: { data: Record<string, any> }) => {
  // data is like { "2004": { indicator_key: { formula: "...", value: number }, ... }, ... }
  // or could be a single year or list
  const years = Object.keys(data).filter(k => /^\d{4}$/.test(k)).sort((a, b) => Number(b) - Number(a));

  if (years.length === 0) {
    // Maybe it's already flat indicators
    return <IndicatorCards indicators={data} />;
  }

  return (
    <div className="space-y-4">
      {years.map(year => (
        <div key={year}>
          <div className="flex items-center gap-2 mb-3">
            <Badge variant="outline" className="text-xs">{year} год</Badge>
          </div>
          <IndicatorCards indicators={data[year]} />
        </div>
      ))}
    </div>
  );
};

const IndicatorCards = ({ indicators }: { indicators: Record<string, any> }) => {
  if (!indicators || typeof indicators !== 'object') return null;

  // Key financial metrics to highlight
  const keyMetrics = ['revenue', 'balance', 'before_taxation_profit', 'net_profit', 'capital_and_reserves', 'current_assets', 'authorized_capital', 'cost_price', 'costs'];
  const entries = Object.entries(indicators);
  const highlighted = entries.filter(([k]) => keyMetrics.includes(k));
  const rest = entries.filter(([k]) => !keyMetrics.includes(k));

  return (
    <div className="space-y-3">
      {/* Key metrics as bigger cards */}
      {highlighted.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {highlighted.map(([key, val]) => {
            const value = typeof val === 'object' && val?.value != null ? val.value : val;
            const numVal = Number(value);
            return (
              <Card key={key} className="p-3">
                <div className="text-xs text-muted-foreground mb-1">{getLabel(key)}</div>
                <div className="text-lg font-bold flex items-center gap-1">
                  {!isNaN(numVal) && numVal > 0 && <TrendingUp className="h-4 w-4 text-emerald-500" />}
                  {!isNaN(numVal) && numVal < 0 && <TrendingDown className="h-4 w-4 text-destructive" />}
                  {formatMoney(value)}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Rest as compact grid */}
      {rest.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {rest.slice(0, 20).map(([key, val]) => {
            const value = typeof val === 'object' && val?.value != null ? val.value : val;
            return (
              <div key={key} className="p-2 rounded bg-muted/30">
                <div className="text-[10px] text-muted-foreground truncate">{getLabel(key)}</div>
                <div className="text-xs font-semibold">{formatMoney(value)}</div>
              </div>
            );
          })}
          {rest.length > 20 && (
            <div className="p-2 text-xs text-muted-foreground">...и ещё {rest.length - 20} показателей</div>
          )}
        </div>
      )}
    </div>
  );
};

// ─── Courts / Statistics ───────────────────────────────────────

export const CourtsRenderer = ({ data }: { data: any }) => {
  if (!data) return <p className="text-sm text-muted-foreground">Нет данных</p>;

  const obj = Array.isArray(data) ? (Array.isArray(data[0]) ? data[0][0] : data[0]) : data;
  if (!obj || typeof obj !== 'object') return <p className="text-sm text-muted-foreground">Нет судебных данных</p>;

  // Group court stats into defendant / plaintiff / exec sections
  const defendantKeys = Object.keys(obj).filter(k => k.includes('defendant'));
  const plaintiffKeys = Object.keys(obj).filter(k => k.includes('plaintiff'));
  const execKeys = Object.keys(obj).filter(k => k.includes('exec'));
  const otherKeys = Object.keys(obj).filter(k =>
    !k.includes('defendant') && !k.includes('plaintiff') && !k.includes('exec')
  );

  const renderGroup = (title: string, icon: React.ReactNode, keys: string[]) => {
    if (keys.length === 0) return null;
    return (
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          {icon}
          <span className="font-medium text-sm">{title}</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {keys.map(k => {
            const val = obj[k];
            const isCost = k.startsWith('cost_');
            return (
              <div key={k}>
                <div className="text-[10px] text-muted-foreground">{getLabel(k)}</div>
                <div className="text-sm font-semibold">
                  {isCost ? formatMoney(val) : formatNumber(val)}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    );
  };

  return (
    <div className="space-y-4">
      {renderGroup('Ответчик', <Scale className="h-4 w-4 text-destructive" />, defendantKeys)}
      {renderGroup('Истец', <Scale className="h-4 w-4 text-primary" />, plaintiffKeys)}
      {renderGroup('Исполнительные листы', <FileText className="h-4 w-4 text-amber-500" />, execKeys)}
      {otherKeys.length > 0 && renderGroup('Прочее', <Info className="h-4 w-4 text-muted-foreground" />, otherKeys)}
    </div>
  );
};

// ─── Contacts ──────────────────────────────────────────────────

export const ContactsRenderer = ({ data }: { data: any }) => {
  if (!data) return <p className="text-sm text-muted-foreground">Нет контактных данных</p>;

  const obj = Array.isArray(data) ? (Array.isArray(data[0]) ? data[0][0] : data[0]) : data;
  if (!obj) return <p className="text-sm text-muted-foreground">Нет контактных данных</p>;

  const phones = obj.phone_numbers || obj.phones || obj.phone;
  const emails = obj.emails || obj.email || obj.e_mail;
  const sites = obj.sites || obj.site || obj.website;
  const address = obj.address || obj.адрес;

  const phoneList = Array.isArray(phones) ? phones : (phones ? String(phones).split(',').map(s => s.trim()) : []);
  const emailList = Array.isArray(emails) ? emails : (emails ? String(emails).split(',').map(s => s.trim()) : []);
  const siteList = Array.isArray(sites) ? sites : (sites ? String(sites).split(',').map(s => s.trim()) : []);

  const displayedKeys = new Set(['phone_numbers', 'phones', 'phone', 'emails', 'email', 'e_mail', 'sites', 'site', 'website', 'address', 'адрес']);

  return (
    <div className="space-y-4">
      {/* Phones */}
      {phoneList.length > 0 && (
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Phone className="h-4 w-4 text-primary" />
            <span className="font-medium text-sm">Телефоны</span>
            <Badge variant="secondary" className="text-xs">{phoneList.length}</Badge>
          </div>
          <div className="flex flex-wrap gap-2">
            {phoneList.map((p: string, i: number) => (
              <a
                key={i}
                href={`tel:${p}`}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-muted/50 text-sm hover:bg-muted transition-colors"
              >
                <Phone className="h-3 w-3" />
                {formatPhone(String(p))}
              </a>
            ))}
          </div>
        </Card>
      )}

      {/* Emails */}
      {emailList.length > 0 && (
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Mail className="h-4 w-4 text-primary" />
            <span className="font-medium text-sm">Email</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {emailList.map((e: string, i: number) => (
              <a
                key={i}
                href={`mailto:${e}`}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-muted/50 text-sm hover:bg-primary/10 hover:text-primary transition-colors"
              >
                <Mail className="h-3 w-3" />
                {e}
              </a>
            ))}
          </div>
        </Card>
      )}

      {/* Sites */}
      {siteList.length > 0 && (
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Globe className="h-4 w-4 text-primary" />
            <span className="font-medium text-sm">Сайты</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {siteList.map((s: string, i: number) => (
              <a
                key={i}
                href={String(s).startsWith('http') ? s : `https://${s}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-muted/50 text-sm hover:bg-primary/10 hover:text-primary transition-colors"
              >
                <ExternalLink className="h-3 w-3" />
                {s}
              </a>
            ))}
          </div>
        </Card>
      )}

      {/* Address */}
      {address && (
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <MapPin className="h-4 w-4 text-primary" />
            <span className="font-medium text-sm">Адрес</span>
          </div>
          <p className="text-sm text-muted-foreground">
            {typeof address === 'object' ? (address.value || JSON.stringify(address)) : address}
          </p>
        </Card>
      )}

      <RemainingFields obj={obj} exclude={displayedKeys} />
    </div>
  );
};

// ─── Owners / Relations ────────────────────────────────────────

export const OwnersRenderer = ({ data }: { data: any }) => {
  if (!data) return <p className="text-sm text-muted-foreground">Нет данных</p>;

  // Could be array of arrays or plain array or object
  let items: any[];
  if (Array.isArray(data)) {
    items = Array.isArray(data[0]) ? data[0] : data;
  } else if (data.items) {
    items = data.items;
  } else {
    items = [data];
  }

  if (items.length === 0) return <p className="text-sm text-muted-foreground">Нет данных о связях</p>;

  return (
    <div className="space-y-3">
      {items.map((item: any, i: number) => {
        const name = item.name || item.full_name || item.fio || item.company_name || item.Name;
        const role = item.role || item.position || item.type;
        const share = item.share || item.доля || item.percent || item.share_percent;
        const inn = item.inn || item.INN;
        const isCompany = item.is_company || item.type === 'company';

        return (
          <Card key={i} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 shrink-0">
                  {isCompany ? <Building2 className="h-4 w-4 text-primary" /> : <User className="h-4 w-4 text-primary" />}
                </div>
                <div>
                  <div className="font-medium text-sm">{typeof name === 'object' ? JSON.stringify(name) : (name || `Запись ${i + 1}`)}</div>
                  {role && <div className="text-xs text-muted-foreground">{typeof role === 'object' ? JSON.stringify(role) : role}</div>}
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                {share != null && <Badge variant="secondary">{share}%</Badge>}
                {inn && <Badge variant="outline" className="text-xs font-mono">ИНН {inn}</Badge>}
              </div>
            </div>
            <RemainingFields obj={item} exclude={new Set(['name', 'full_name', 'fio', 'company_name', 'Name', 'role', 'position', 'type', 'share', 'доля', 'percent', 'share_percent', 'inn', 'INN', 'is_company'])} compact />
          </Card>
        );
      })}
    </div>
  );
};

// ─── Tenders ───────────────────────────────────────────────────

export const TendersRenderer = ({ data }: { data: any }) => {
  if (!data) return <p className="text-sm text-muted-foreground">Нет данных</p>;

  let items: any[];
  if (Array.isArray(data)) {
    items = Array.isArray(data[0]) ? data[0] : data;
  } else if (data.items) {
    items = data.items;
  } else {
    items = [data];
  }

  if (items.length === 0) return <p className="text-sm text-muted-foreground">Нет данных о госзакупках</p>;

  return (
    <div className="space-y-3">
      {items.map((item: any, i: number) => {
        const lotName = item.lot_name || item.name || item.subject || item.title;
        const amount = item.amount || item.price || item.sum || item.contract_price;
        const publishDate = item.publish_date || item.date;
        const endDate = item.end_offer_date;
        const region = item.region;
        const procType = item.proc_type;
        const tpBrief = item.tp_brief;
        const winner = item.winner_name;
        const currency = item.currency_brief || 'RUB';
        const companyName = item.company_name;
        const industry = item.industry;

        const displayedKeys = new Set(['lot_name', 'name', 'subject', 'title', 'amount', 'price', 'sum', 'contract_price',
          'publish_date', 'date', 'end_offer_date', 'region', 'proc_type', 'tp_brief', 'winner_name',
          'currency_brief', 'company_name', 'industry', 'tp_type_name']);

        return (
          <Card key={i} className="p-4">
            <div className="space-y-3">
              {/* Title + amount */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <h4 className="font-medium text-sm leading-snug">{typeof lotName === 'object' ? JSON.stringify(lotName) : (lotName || `Контракт ${i + 1}`)}</h4>
                  {item.tp_type_name && <Badge variant="outline" className="mt-1 text-xs">{item.tp_type_name}</Badge>}
                </div>
                {amount != null && (
                  <div className="text-right shrink-0">
                    <div className="text-lg font-bold text-primary">{formatMoney(amount)}</div>
                    {currency && currency !== 'RUB' && <div className="text-xs text-muted-foreground">{currency}</div>}
                  </div>
                )}
              </div>

              {/* Meta row */}
              <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                {publishDate && (
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" /> {formatDate(publishDate)}
                  </span>
                )}
                {endDate && (
                  <span className="flex items-center gap-1">
                    до {formatDate(endDate)}
                  </span>
                )}
                {region && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> {region}
                  </span>
                )}
                {tpBrief && <Badge variant="secondary" className="text-[10px]">{tpBrief}</Badge>}
              </div>

              {/* Proc type */}
              {procType && (
                <p className="text-xs text-muted-foreground">{typeof procType === 'object' ? JSON.stringify(procType) : procType}</p>
              )}

              {/* Winner / Company */}
              {(winner || companyName) && (
                <div className="flex items-center gap-2 text-xs">
                  <Building2 className="h-3 w-3 text-muted-foreground" />
                  <span>{winner || companyName}</span>
                </div>
              )}

              {/* Industry */}
              {industry && (
                <div className="flex flex-wrap gap-1">
                  {(Array.isArray(industry) ? industry : [industry]).map((ind: string, j: number) => (
                    <Badge key={j} variant="secondary" className="text-[10px]">{ind}</Badge>
                  ))}
                </div>
              )}

              <RemainingFields obj={item} exclude={displayedKeys} compact />
            </div>
          </Card>
        );
      })}
    </div>
  );
};

// ─── Trademarks ────────────────────────────────────────────────

export const TrademarkCard = ({ item }: { item: any }) => {
  const imageUrl = item.url || item.image_url;
  const title = item.title || item.name || 'Товарный знак';
  const regNumber = item.reg_number || item.registration_number;
  const pubDate = item.pub_date || item.publication_date;
  const noImage = item.no_image === true || item.no_image === 'true';

  return (
    <Card className="overflow-hidden hover:shadow-md transition-shadow">
      <CardContent className="p-0">
        <div className="flex gap-4">
          <div className="w-28 h-28 shrink-0 bg-muted flex items-center justify-center border-r">
            {imageUrl && !noImage ? (
              <a href={imageUrl} target="_blank" rel="noopener noreferrer" className="block w-full h-full">
                <img src={imageUrl} alt={title} className="w-full h-full object-contain p-2"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              </a>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <ImageIcon className="h-6 w-6" />
                <span className="text-xs mt-1">Нет фото</span>
              </div>
            )}
          </div>
          <div className="flex-1 py-3 pr-4 space-y-1.5">
            <h4 className="font-semibold text-sm">{title}</h4>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {regNumber && <span className="flex items-center gap-1"><Hash className="h-3 w-3" /> Рег. №{regNumber}</span>}
              {pubDate && <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {pubDate}</span>}
            </div>
            {imageUrl && (
              <a href={imageUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                <ExternalLink className="h-3 w-3" /> Открыть
              </a>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

const TrademarksSection = ({ data }: { data: any }) => {
  let items: any[];
  if (Array.isArray(data)) {
    items = Array.isArray(data[0]) ? data[0] : data;
  } else if (data?.items) {
    items = data.items;
  } else {
    items = [data];
  }

  if (items.length === 0) return <p className="text-sm text-muted-foreground">Нет товарных знаков</p>;

  return (
    <div className="space-y-3">
      {items.map((item: any, i: number) => <TrademarkCard key={i} item={item} />)}
    </div>
  );
};

// ─── Reliability ───────────────────────────────────────────────

export const ReliabilityRenderer = ({ data }: { data: any }) => {
  if (!data) return <p className="text-sm text-muted-foreground">Нет данных</p>;

  const obj = Array.isArray(data) ? (Array.isArray(data[0]) ? data[0][0] : data[0]) : data;
  if (!obj) return <p className="text-sm text-muted-foreground">Нет данных</p>;

  const score = obj.score || obj.reliability || obj.rating;
  const advantages = obj.advantages;
  const disadvantages = obj.disadvantages;
  const advValue = obj.advantages_sum_value;
  const disValue = obj.disadvantages_sum_value;
  const hasCritical = obj.has_critical;
  const addValue = obj.additional_sum_value;

  const excludeKeys = new Set(['score', 'reliability', 'rating', 'advantages', 'disadvantages',
    'advantages_sum_value', 'disadvantages_sum_value', 'has_critical', 'additional_sum_value']);

  return (
    <div className="space-y-4">
      {/* Score & summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {score != null && (
          <Card className="p-4 text-center">
            <div className="text-3xl font-bold text-primary">{score}</div>
            <div className="text-xs text-muted-foreground">Рейтинг</div>
          </Card>
        )}
        {advValue != null && (
          <Card className="p-4 text-center">
            <div className="text-2xl font-bold text-emerald-600">{advValue}</div>
            <div className="text-xs text-muted-foreground">Преимущества</div>
          </Card>
        )}
        {disValue != null && (
          <Card className="p-4 text-center">
            <div className="text-2xl font-bold text-destructive">{disValue}</div>
            <div className="text-xs text-muted-foreground">Недостатки</div>
          </Card>
        )}
        {hasCritical != null && (
          <Card className="p-4 text-center">
            <div className="flex justify-center mb-1">
              {hasCritical ? <XCircle className="h-6 w-6 text-destructive" /> : <CheckCircle2 className="h-6 w-6 text-emerald-600" />}
            </div>
            <div className="text-xs text-muted-foreground">Критические</div>
            <div className="text-sm font-semibold">{hasCritical ? 'Есть' : 'Нет'}</div>
          </Card>
        )}
        {addValue != null && (
          <Card className="p-4 text-center">
            <div className="text-2xl font-bold">{addValue}</div>
            <div className="text-xs text-muted-foreground">Доп. оценка</div>
          </Card>
        )}
      </div>

      {/* Advantages list */}
      {Array.isArray(advantages) && advantages.length > 0 && (
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <span className="font-medium text-sm">Преимущества ({advantages.length})</span>
          </div>
          <div className="space-y-1.5">
            {advantages.map((a: any, i: number) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                <span className="text-emerald-600 shrink-0">+</span>
                <span>{typeof a === 'object' ? (a.description || a.text || a.name || JSON.stringify(a)) : a}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Disadvantages list */}
      {Array.isArray(disadvantages) && disadvantages.length > 0 && (
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <span className="font-medium text-sm">Недостатки ({disadvantages.length})</span>
          </div>
          <div className="space-y-1.5">
            {disadvantages.map((d: any, i: number) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                <span className="text-destructive shrink-0">−</span>
                <span>{typeof d === 'object' ? (d.description || d.text || d.name || JSON.stringify(d)) : d}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <RemainingFields obj={obj} exclude={excludeKeys} />
    </div>
  );
};

// ─── Generic Renderer ──────────────────────────────────────────

export const GenericRenderer = ({ data }: { data: any }) => {
  if (!data) return <p className="text-sm text-muted-foreground">Нет данных</p>;

  // Unwrap nested arrays
  const unwrapped = Array.isArray(data) && Array.isArray(data[0]) ? data[0] : data;

  if (Array.isArray(unwrapped)) {
    if (unwrapped.length === 0) return <p className="text-sm text-muted-foreground">Нет данных</p>;
    return (
      <div className="space-y-3">
        {unwrapped.map((item: any, i: number) => (
          <Card key={i} className="p-4">
            {typeof item === 'object' ? (
              <SmartObjectDisplay obj={item} />
            ) : (
              <p className="text-sm">{String(item)}</p>
            )}
          </Card>
        ))}
      </div>
    );
  }

  if (typeof unwrapped === 'object') {
    if (unwrapped.items && Array.isArray(unwrapped.items)) {
      return <GenericRenderer data={unwrapped.items} />;
    }
    return (
      <Card className="p-4">
        <SmartObjectDisplay obj={unwrapped} />
      </Card>
    );
  }

  return <pre className="text-xs overflow-auto max-h-96 bg-muted p-3 rounded">{JSON.stringify(data, null, 2)}</pre>;
};

// ─── Section Router ────────────────────────────────────────────

export const renderSectionData = (sectionKey: string, data: any) => {
  switch (sectionKey) {
    case 'requisites': return <RequisitesRenderer data={data} />;
    case 'trademarks': return <TrademarksSection data={data} />;
    case 'finance': return <FinanceRenderer data={data} />;
    case 'courts': return <CourtsRenderer data={data} />;
    case 'contacts': return <ContactsRenderer data={data} />;
    case 'owners': return <OwnersRenderer data={data} />;
    case 'tenders': return <TendersRenderer data={data} />;
    case 'reliability': return <ReliabilityRenderer data={data} />;
    default: return <GenericRenderer data={data} />;
  }
};

// ─── Shared Helpers ────────────────────────────────────────────

const StateIcon = ({ state }: { state: string }) => {
  switch (state) {
    case 'good': return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
    case 'bad': return <XCircle className="h-4 w-4 text-destructive" />;
    case 'normal': return <Info className="h-4 w-4 text-amber-500" />;
    default: return <Info className="h-4 w-4 text-muted-foreground" />;
  }
};

const StateBadge = ({ state }: { state: string }) => {
  const variants: Record<string, string> = {
    good: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    bad: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    normal: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  };
  const labels: Record<string, string> = { good: 'Хорошо', bad: 'Плохо', normal: 'Нормально' };
  const cls = variants[state] || 'bg-muted text-muted-foreground';
  return <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${cls}`}>{labels[state] || state}</span>;
};

function formatPhone(p: string): string {
  const digits = p.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('7')) {
    return `+7 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7, 9)}-${digits.slice(9)}`;
  }
  return p;
}

function formatDate(d: string): string {
  if (!d) return '';
  // Remove time portion "2026-02-16 00:00:00" → "16.02.2026"
  const match = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[3]}.${match[2]}.${match[1]}`;
  return d;
}

/** Display remaining fields that weren't explicitly rendered */
const RemainingFields = ({ obj, exclude, compact }: { obj: any; exclude: Set<string> | string[]; compact?: boolean }) => {
  if (!obj || typeof obj !== 'object') return null;
  const excludeSet = exclude instanceof Set ? exclude : new Set(exclude);
  const fields = Object.entries(obj).filter(
    ([k, v]) => !excludeSet.has(k) && v != null && v !== '' && v !== false
  );
  if (fields.length === 0) return null;

  return (
    <div className={`${compact ? 'mt-2 pt-2' : 'mt-3 pt-3'} border-t`}>
      <div className={`grid ${compact ? 'grid-cols-2 gap-1.5' : 'grid-cols-2 sm:grid-cols-3 gap-2'}`}>
        {fields.slice(0, compact ? 6 : 12).map(([k, v]) => (
          <div key={k}>
            <div className="text-[10px] text-muted-foreground">{getLabel(k)}</div>
            <div className="text-xs font-medium break-words">{renderValue(v)}</div>
          </div>
        ))}
        {fields.length > (compact ? 6 : 12) && (
          <div className="text-[10px] text-muted-foreground col-span-full">...и ещё {fields.length - (compact ? 6 : 12)} полей</div>
        )}
      </div>
    </div>
  );
};

/** Smart display for a generic object */
const SmartObjectDisplay = ({ obj }: { obj: any }) => {
  if (!obj || typeof obj !== 'object') return <p className="text-sm">{String(obj)}</p>;
  const entries = Object.entries(obj).filter(([, v]) => v != null && v !== '');

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {entries.slice(0, 15).map(([k, v]) => (
        <div key={k}>
          <div className="text-[10px] text-muted-foreground">{getLabel(k)}</div>
          <div className="text-sm font-medium break-words">{renderValue(v)}</div>
        </div>
      ))}
      {entries.length > 15 && <div className="text-xs text-muted-foreground col-span-full">...и ещё {entries.length - 15} полей</div>}
    </div>
  );
};

function renderValue(v: any): string {
  if (v == null) return '';
  if (typeof v === 'boolean') return v ? 'Да' : 'Нет';
  if (Array.isArray(v)) {
    if (v.length === 0) return '—';
    if (typeof v[0] === 'string' || typeof v[0] === 'number') return v.join(', ');
    return `[${v.length} элементов]`;
  }
  if (typeof v === 'object') {
    if (v.value != null) return formatNumber(v.value);
    return v.name || v.text || v.description || JSON.stringify(v);
  }
  const n = Number(v);
  if (!isNaN(n) && String(v).length > 3 && Math.abs(n) >= 1000) return formatNumber(n);
  return String(v);
}
