import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, Image as ImageIcon, Phone, Mail, Globe, MapPin, User, Calendar, Hash, FileText, TrendingUp, TrendingDown, Minus, Scale, Building2 } from 'lucide-react';

// ─── Trademark Card ────────────────────────────────────────────

export const TrademarkCard = ({ item }: { item: any }) => {
  const imageUrl = item.url || item.image_url;
  const title = item.title || item.name || 'Товарный знак';
  const regNumber = item.reg_number || item.registration_number;
  const pubDate = item.pub_date || item.publication_date;
  const purposes = item.purposes;
  const contact = item.contact_address;
  const noImage = item.no_image === true || item.no_image === 'true';
  const imageId = item.image_id;
  const patentType = item.patent_type_name || item.type;
  const country = item.publication_country_code || item.country;

  return (
    <Card className="overflow-hidden hover:shadow-md transition-shadow">
      <CardContent className="p-0">
        <div className="flex gap-4">
          {/* Image */}
          <div className="w-28 h-28 shrink-0 bg-muted flex items-center justify-center border-r">
            {imageUrl && !noImage ? (
              <a href={imageUrl} target="_blank" rel="noopener noreferrer" className="block w-full h-full">
                <img
                  src={imageUrl}
                  alt={title}
                  className="w-full h-full object-contain p-2"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                    (e.target as HTMLImageElement).parentElement!.innerHTML = `<div class="flex flex-col items-center justify-center h-full text-muted-foreground"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg><span class="text-xs mt-1">Нет фото</span></div>`;
                  }}
                />
              </a>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <ImageIcon className="h-6 w-6" />
                <span className="text-xs mt-1">Нет фото</span>
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 py-3 pr-4 space-y-1.5">
            <div className="flex items-start justify-between gap-2">
              <h4 className="font-semibold text-sm leading-tight">{title}</h4>
              {patentType && <Badge variant="secondary" className="shrink-0 text-xs">{patentType}</Badge>}
            </div>

            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {regNumber && (
                <span className="flex items-center gap-1">
                  <Hash className="h-3 w-3" /> Рег. №{regNumber}
                </span>
              )}
              {pubDate && (
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" /> {pubDate}
                </span>
              )}
              {country && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> {country}
                </span>
              )}
              {imageId && (
                <span className="flex items-center gap-1">
                  <FileText className="h-3 w-3" /> ID: {imageId}
                </span>
              )}
            </div>

            {purposes && (
              <p className="text-xs text-muted-foreground line-clamp-1">
                <span className="font-medium text-foreground">Назначение:</span> {purposes}
              </p>
            )}
            {contact && (
              <p className="text-xs text-muted-foreground line-clamp-1">
                <span className="font-medium text-foreground">Контакт:</span> {typeof contact === 'object' ? JSON.stringify(contact) : contact}
              </p>
            )}

            {imageUrl && (
              <a href={imageUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                <ExternalLink className="h-3 w-3" /> Открыть на ФИПС
              </a>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

// ─── Finance Card ──────────────────────────────────────────────

export const FinanceRenderer = ({ data }: { data: any }) => {
  if (!data) return <p className="text-sm text-muted-foreground">Нет данных</p>;

  const items = Array.isArray(data) ? data : data.items ? data.items : [data];
  if (items.length === 0) return <p className="text-sm text-muted-foreground">Нет финансовых данных</p>;

  // Try to render as yearly finance rows
  return (
    <div className="space-y-3">
      {items.map((item: any, i: number) => {
        const revenue = item.revenue || item.выручка || item.Выручка;
        const profit = item.profit || item.прибыль || item.Прибыль || item.net_profit;
        const year = item.year || item.период || item.Период || item.period;
        const assets = item.assets || item.Активы || item.активы;
        const capital = item.capital || item.Капитал || item.капитал;

        return (
          <Card key={i} className="p-4">
            <div className="flex items-center justify-between mb-3">
              {year && <Badge variant="outline" className="text-xs">{year}</Badge>}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {revenue != null && (
                <FinanceStat label="Выручка" value={revenue} icon={<TrendingUp className="h-4 w-4 text-primary" />} />
              )}
              {profit != null && (
                <FinanceStat label="Прибыль" value={profit} icon={Number(profit) >= 0 ? <TrendingUp className="h-4 w-4 text-primary" /> : <TrendingDown className="h-4 w-4 text-destructive" />} />
              )}
              {assets != null && (
                <FinanceStat label="Активы" value={assets} icon={<Minus className="h-4 w-4 text-muted-foreground" />} />
              )}
              {capital != null && (
                <FinanceStat label="Капитал" value={capital} icon={<Minus className="h-4 w-4 text-muted-foreground" />} />
              )}
            </div>
            {/* Fallback: show other fields */}
            <FallbackFields item={item} exclude={['revenue', 'profit', 'year', 'assets', 'capital', 'выручка', 'прибыль', 'период', 'Период', 'Выручка', 'Прибыль', 'Активы', 'Капитал', 'активы', 'капитал', 'net_profit', 'period']} />
          </Card>
        );
      })}
    </div>
  );
};

const FinanceStat = ({ label, value, icon }: { label: string; value: any; icon: React.ReactNode }) => (
  <div>
    <div className="flex items-center gap-1 text-xs text-muted-foreground mb-0.5">{icon}{label}</div>
    <div className="text-sm font-semibold">{formatNumber(value)}</div>
  </div>
);

// ─── Courts / Statistics ───────────────────────────────────────

export const CourtsRenderer = ({ data }: { data: any }) => {
  if (!data) return <p className="text-sm text-muted-foreground">Нет данных</p>;
  const items = Array.isArray(data) ? data : data.items ? data.items : [data];

  return (
    <div className="space-y-3">
      {items.map((item: any, i: number) => (
        <Card key={i} className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Scale className="h-4 w-4 text-primary" />
            <span className="font-medium text-sm">{item.role || item.category || item.type || `Запись ${i + 1}`}</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <FallbackGrid item={item} />
          </div>
        </Card>
      ))}
      {items.length === 0 && <p className="text-sm text-muted-foreground">Нет судебных данных</p>}
    </div>
  );
};

// ─── Contacts ──────────────────────────────────────────────────

export const ContactsRenderer = ({ data }: { data: any }) => {
  if (!data) return <p className="text-sm text-muted-foreground">Нет контактных данных</p>;
  const items = Array.isArray(data) ? data : data.items ? data.items : [data];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {items.map((item: any, i: number) => {
        const phone = item.phone || item.телефон || item.phones;
        const email = item.email || item.e_mail;
        const site = item.site || item.website || item.url;
        const address = item.address || item.адрес;
        const name = item.name || item.fio || item.person;

        return (
          <Card key={i} className="p-4">
            {name && (
              <div className="flex items-center gap-2 mb-2">
                <User className="h-4 w-4 text-primary" />
                <span className="font-medium text-sm">{typeof name === 'object' ? JSON.stringify(name) : name}</span>
              </div>
            )}
            <div className="space-y-1.5 text-sm">
              {phone && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Phone className="h-3.5 w-3.5" />
                  <span>{Array.isArray(phone) ? phone.join(', ') : typeof phone === 'object' ? JSON.stringify(phone) : phone}</span>
                </div>
              )}
              {email && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Mail className="h-3.5 w-3.5" />
                  <a href={`mailto:${email}`} className="hover:text-primary hover:underline">{email}</a>
                </div>
              )}
              {site && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Globe className="h-3.5 w-3.5" />
                  <a href={String(site).startsWith('http') ? site : `https://${site}`} target="_blank" rel="noopener noreferrer" className="hover:text-primary hover:underline truncate">{site}</a>
                </div>
              )}
              {address && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5" />
                  <span className="text-xs">{typeof address === 'object' ? (address.value || JSON.stringify(address)) : address}</span>
                </div>
              )}
            </div>
            <FallbackFields item={item} exclude={['phone', 'телефон', 'phones', 'email', 'e_mail', 'site', 'website', 'url', 'address', 'адрес', 'name', 'fio', 'person']} />
          </Card>
        );
      })}
    </div>
  );
};

// ─── Owners / Relations ────────────────────────────────────────

export const OwnersRenderer = ({ data }: { data: any }) => {
  if (!data) return <p className="text-sm text-muted-foreground">Нет данных</p>;
  const items = Array.isArray(data) ? data : data.items ? data.items : [data];

  return (
    <div className="space-y-3">
      {items.map((item: any, i: number) => {
        const name = item.name || item.full_name || item.fio || item.company_name;
        const role = item.role || item.position || item.type;
        const share = item.share || item.доля || item.percent;
        const inn = item.inn || item.INN;

        return (
          <Card key={i} className="p-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                {item.is_company ? <Building2 className="h-4 w-4 text-primary" /> : <User className="h-4 w-4 text-primary" />}
                <div>
                  <div className="font-medium text-sm">{typeof name === 'object' ? JSON.stringify(name) : (name || `Запись ${i + 1}`)}</div>
                  {role && <div className="text-xs text-muted-foreground">{typeof role === 'object' ? JSON.stringify(role) : role}</div>}
                </div>
              </div>
              <div className="flex gap-2">
                {share != null && <Badge variant="secondary">{share}%</Badge>}
                {inn && <Badge variant="outline" className="text-xs">ИНН: {inn}</Badge>}
              </div>
            </div>
            <FallbackFields item={item} exclude={['name', 'full_name', 'fio', 'company_name', 'role', 'position', 'type', 'share', 'доля', 'percent', 'inn', 'INN', 'is_company']} />
          </Card>
        );
      })}
      {items.length === 0 && <p className="text-sm text-muted-foreground">Нет данных о связях</p>}
    </div>
  );
};

// ─── Tenders ───────────────────────────────────────────────────

export const TendersRenderer = ({ data }: { data: any }) => {
  if (!data) return <p className="text-sm text-muted-foreground">Нет данных</p>;
  const items = Array.isArray(data) ? data : data.items ? data.items : [data];

  return (
    <div className="space-y-3">
      {items.map((item: any, i: number) => {
        const name = item.name || item.subject || item.title || item.description;
        const price = item.price || item.sum || item.amount || item.contract_price;
        const status = item.status || item.state;
        const date = item.date || item.published_date || item.pub_date;
        const customer = item.customer || item.заказчик;

        return (
          <Card key={i} className="p-4">
            <div className="flex items-start justify-between gap-2 mb-2">
              <h4 className="font-medium text-sm line-clamp-2">{typeof name === 'object' ? JSON.stringify(name) : (name || `Контракт ${i + 1}`)}</h4>
              {status && <Badge variant="secondary" className="shrink-0">{typeof status === 'object' ? JSON.stringify(status) : status}</Badge>}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {price != null && <span className="font-semibold text-foreground">{formatNumber(price)} ₽</span>}
              {date && <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{date}</span>}
              {customer && <span>{typeof customer === 'object' ? JSON.stringify(customer) : customer}</span>}
            </div>
            <FallbackFields item={item} exclude={['name', 'subject', 'title', 'description', 'price', 'sum', 'amount', 'contract_price', 'status', 'state', 'date', 'published_date', 'pub_date', 'customer', 'заказчик']} />
          </Card>
        );
      })}
      {items.length === 0 && <p className="text-sm text-muted-foreground">Нет данных о госзакупках</p>}
    </div>
  );
};

// ─── Reliability ───────────────────────────────────────────────

export const ReliabilityRenderer = ({ data }: { data: any }) => {
  if (!data) return <p className="text-sm text-muted-foreground">Нет данных</p>;

  // It might be a single object
  const obj = Array.isArray(data) ? data[0] : data;
  if (!obj) return <p className="text-sm text-muted-foreground">Нет данных</p>;

  const score = obj.score || obj.reliability || obj.rating;

  return (
    <Card className="p-6">
      {score != null && (
        <div className="text-center mb-4">
          <div className="text-4xl font-bold text-primary">{score}</div>
          <div className="text-sm text-muted-foreground">Рейтинг надёжности</div>
        </div>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <FallbackGrid item={obj} exclude={['score', 'reliability', 'rating']} />
      </div>
    </Card>
  );
};

// ─── Generic Section Renderer (chooses right one) ──────────────

export const renderSectionData = (sectionKey: string, data: any) => {
  switch (sectionKey) {
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

// ─── Trademarks Section ────────────────────────────────────────

const TrademarksSection = ({ data }: { data: any }) => {
  const items = Array.isArray(data) ? data : data?.items ? data.items : [data];
  if (items.length === 0) return <p className="text-sm text-muted-foreground">Нет товарных знаков</p>;

  return (
    <div className="space-y-3">
      {items.map((item: any, i: number) => (
        <TrademarkCard key={i} item={item} />
      ))}
    </div>
  );
};

// ─── Generic Renderer (fallback) ───────────────────────────────

export const GenericRenderer = ({ data }: { data: any }) => {
  if (!data) return <p className="text-sm text-muted-foreground">Нет данных</p>;

  if (Array.isArray(data)) {
    if (data.length === 0) return <p className="text-sm text-muted-foreground">Нет данных</p>;
    return (
      <div className="space-y-3">
        {data.map((item: any, i: number) => (
          <Card key={i} className="p-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <FallbackGrid item={item} />
            </div>
          </Card>
        ))}
      </div>
    );
  }

  if (typeof data === 'object') {
    if (data.items && Array.isArray(data.items)) {
      return <GenericRenderer data={data.items} />;
    }
    return (
      <Card className="p-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <FallbackGrid item={data} />
        </div>
      </Card>
    );
  }

  return <pre className="text-xs overflow-auto max-h-96 bg-muted p-3 rounded">{JSON.stringify(data, null, 2)}</pre>;
};

// ─── Helpers ───────────────────────────────────────────────────

function formatNumber(val: any): string {
  const n = Number(val);
  if (isNaN(n)) return String(val);
  if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(1) + ' млрд';
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1) + ' млн';
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1) + ' тыс';
  return n.toLocaleString('ru-RU');
}

/** Show remaining fields that weren't explicitly rendered */
const FallbackFields = ({ item, exclude = [] }: { item: any; exclude?: string[] }) => {
  if (!item || typeof item !== 'object') return null;
  const fields = Object.entries(item).filter(
    ([k, v]) => !exclude.includes(k) && v != null && v !== '' && v !== false
  );
  if (fields.length === 0) return null;

  return (
    <div className="mt-3 pt-3 border-t grid grid-cols-2 gap-2">
      {fields.slice(0, 8).map(([k, v]) => (
        <div key={k}>
          <div className="text-xs text-muted-foreground">{k}</div>
          <div className="text-xs font-medium break-words">{renderValue(v)}</div>
        </div>
      ))}
      {fields.length > 8 && <div className="text-xs text-muted-foreground col-span-2">...и ещё {fields.length - 8} полей</div>}
    </div>
  );
};

const FallbackGrid = ({ item, exclude = [] }: { item: any; exclude?: string[] }) => {
  if (!item || typeof item !== 'object') return null;
  const fields = Object.entries(item).filter(
    ([k, v]) => !exclude.includes(k) && v != null && v !== ''
  );

  return (
    <>
      {fields.map(([k, v]) => (
        <div key={k}>
          <div className="text-xs text-muted-foreground">{k}</div>
          <div className="text-sm font-medium break-words">{renderValue(v)}</div>
        </div>
      ))}
    </>
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
    return v.value || v.name || v.text || JSON.stringify(v);
  }
  return String(v);
}
