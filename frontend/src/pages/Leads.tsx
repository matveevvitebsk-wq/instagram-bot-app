import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '@/utils/api';

interface InstagramAccount {
  id: string;
  username: string;
  page_id: string;
}

interface Lead {
  id: string;
  instagram_id: string;
  username: string | null;
  full_name: string | null;
  is_follower: boolean | null;
  lead_status: string | null;
  last_interaction_at: string | null;
  created_at: string;
  instagram_account: string | null;
}

interface Interaction {
  id: string;
  interaction_type: string;
  text_content: string | null;
  created_at: string;
  from_username: string | null;
  media_id: string | null;
  media_product_type: string | null;
  event_field: string | null;
  status_response: boolean | null;
  text_answer: string | null;
  response_at: string | null;
}

const PAGE_SIZE = 50;
const cardStyle = {
  background: 'var(--tg-theme-secondary-bg-color)',
  border: '1px solid rgba(127,127,127,0.14)',
};
const primaryText = { color: 'var(--tg-theme-text-color)' };
const hintText = { color: 'var(--tg-theme-hint-color)' };

function formatDate(value: string | null | undefined) {
  if (!value) return 'Нет данных';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Нет данных'
    : date.toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
}

export default function Leads() {
  const [accounts, setAccounts] = useState<InstagramAccount[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [accountId, setAccountId] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedLead, setExpandedLead] = useState<string | null>(null);
  const [history, setHistory] = useState<Record<string, Interaction[]>>({});
  const [historyLoading, setHistoryLoading] = useState<string | null>(null);

  const loadLeads = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get('/api/analytics/leads', {
        params: {
          limit: PAGE_SIZE,
          offset,
          ...(accountId ? { account_id: accountId } : {}),
          ...(status ? { status_filter: status } : {}),
          ...(search.trim() ? { search: search.trim() } : {}),
        },
      });
      setLeads(response.data.leads ?? []);
      setTotal(response.data.total ?? 0);
      setAccounts(response.data.accounts ?? []);
    } catch (requestError) {
      console.error('Failed to load leads:', requestError);
      setError('Не удалось загрузить лидов. Повторите попытку.');
    } finally {
      setLoading(false);
    }
  }, [accountId, offset, search, status]);

  useEffect(() => {
    void loadLeads();
  }, [loadLeads]);

  const loadHistory = async (leadId: string) => {
    if (expandedLead === leadId) {
      setExpandedLead(null);
      return;
    }

    setExpandedLead(leadId);
    if (history[leadId]) return;

    setHistoryLoading(leadId);
    try {
      const response = await api.get(
        `/api/analytics/leads/${leadId}/interactions`,
      );
      setHistory((current) => ({
        ...current,
        [leadId]: response.data.interactions ?? [],
      }));
    } catch (requestError) {
      console.error('Failed to load lead interactions:', requestError);
      setHistory((current) => ({ ...current, [leadId]: [] }));
    } finally {
      setHistoryLoading(null);
    }
  };

  const statusOptions = useMemo(
    () =>
      Array.from(
        new Set(leads.map((lead) => lead.lead_status).filter(Boolean)),
      ),
    [leads],
  );

  return (
    <div className='p-4 pt-5 pb-24 space-y-4'>
      <div className='flex items-center justify-between gap-3'>
        <h1 className='text-xl font-semibold' style={primaryText}>
          Лиды
        </h1>
        <span className='text-sm font-medium' style={hintText}>
          {total} всего
        </span>
      </div>

      <div className='rounded-2xl p-3 space-y-3' style={cardStyle}>
        <label className='block'>
          <span className='block text-xs mb-1' style={hintText}>
            Instagram аккаунт
          </span>
          <select
            value={accountId}
            onChange={(event) => {
              setAccountId(event.target.value);
              setOffset(0);
              setExpandedLead(null);
            }}
            className='w-full rounded-xl px-3 py-2.5 text-sm'
            style={{
              background: 'var(--tg-theme-bg-color)',
              color: 'var(--tg-theme-text-color)',
              border: '1px solid rgba(127,127,127,0.25)',
            }}
          >
            <option value=''>Все аккаунты</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                @{account.username}
              </option>
            ))}
          </select>
        </label>

        <label className='block'>
          <span className='block text-xs mb-1' style={hintText}>
            Статус
          </span>
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setOffset(0);
            }}
            className='w-full rounded-xl px-3 py-2.5 text-sm'
            style={{
              background: 'var(--tg-theme-bg-color)',
              color: 'var(--tg-theme-text-color)',
              border: '1px solid rgba(127,127,127,0.25)',
            }}
          >
            <option value=''>Все статусы</option>
            {statusOptions.map((value) => (
              <option key={value} value={value as string}>
                {value}
              </option>
            ))}
            {!statusOptions.includes('COLD') && (
              <option value='COLD'>COLD</option>
            )}
          </select>
        </label>

        <label className='block'>
          <span className='block text-xs mb-1' style={hintText}>
            Поиск по username, имени или Instagram ID
          </span>
          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setOffset(0);
            }}
            placeholder='Например, username'
            className='w-full rounded-xl px-3 py-2.5 text-sm'
            style={{
              background: 'var(--tg-theme-bg-color)',
              color: 'var(--tg-theme-text-color)',
              border: '1px solid rgba(127,127,127,0.25)',
            }}
          />
        </label>
      </div>

      {error && (
        <div
          className='rounded-xl p-3 text-sm'
          style={{ ...cardStyle, color: '#ff453a' }}
        >
          {error}
          <button className='ml-2 underline' onClick={() => void loadLeads()}>
            Повторить
          </button>
        </div>
      )}

      {loading ? (
        <div className='space-y-3'>
          {[1, 2, 3].map((item) => (
            <div
              key={item}
              className='rounded-2xl h-24 animate-pulse'
              style={cardStyle}
            />
          ))}
        </div>
      ) : leads.length === 0 ? (
        <div className='rounded-2xl p-5 text-center' style={cardStyle}>
          <p className='font-medium' style={primaryText}>
            Лиды не найдены
          </p>
          <p className='text-sm mt-1' style={hintText}>
            Подключите Instagram аккаунт или измените фильтры.
          </p>
        </div>
      ) : (
        <div className='space-y-3'>
          {leads.map((lead) => (
            <article
              key={lead.id}
              className='rounded-2xl p-4'
              style={cardStyle}
            >
              <button
                type='button'
                onClick={() => void loadHistory(lead.id)}
                className='w-full text-left'
                aria-expanded={expandedLead === lead.id}
              >
                <div className='flex items-start justify-between gap-3'>
                  <div className='min-w-0'>
                    <p
                      className='font-semibold break-words'
                      style={primaryText}
                    >
                      {lead.full_name ||
                        (lead.username
                          ? `@${lead.username}`
                          : 'Instagram пользователь')}
                    </p>
                    {lead.username && (
                      <p className='text-sm break-all' style={hintText}>
                        @{lead.username}
                      </p>
                    )}
                    <p className='text-xs mt-1' style={hintText}>
                      @{lead.instagram_account || 'аккаунт'} ·{' '}
                      {lead.lead_status || 'Без статуса'}
                    </p>
                  </div>
                  <span className='text-xs shrink-0' style={hintText}>
                    {expandedLead === lead.id ? 'Скрыть ▲' : 'История ▼'}
                  </span>
                </div>
                <p className='text-xs mt-3' style={hintText}>
                  Последний контакт: {formatDate(lead.last_interaction_at)}
                </p>
              </button>

              {expandedLead === lead.id && (
                <div
                  className='mt-4 pt-3 space-y-3'
                  style={{ borderTop: '1px solid rgba(127,127,127,0.18)' }}
                >
                  <p className='text-sm font-medium' style={primaryText}>
                    История взаимодействий
                  </p>
                  {historyLoading === lead.id ? (
                    <p className='text-sm' style={hintText}>
                      Загрузка истории...
                    </p>
                  ) : (history[lead.id] ?? []).length === 0 ? (
                    <p className='text-sm' style={hintText}>
                      Взаимодействий пока нет.
                    </p>
                  ) : (
                    (history[lead.id] ?? []).map((item) => (
                      <div
                        key={item.id}
                        className='rounded-xl p-3'
                        style={{ background: 'var(--tg-theme-bg-color)' }}
                      >
                        <div
                          className='flex justify-between gap-2 text-xs'
                          style={hintText}
                        >
                          <span>{item.interaction_type}</span>
                          <span>{formatDate(item.created_at)}</span>
                        </div>
                        <p
                          className='text-sm mt-2 whitespace-pre-wrap break-words'
                          style={primaryText}
                        >
                          {item.text_content || 'Текст комментария отсутствует'}
                        </p>
                        {item.media_id && (
                          <p
                            className='text-xs mt-2 break-all'
                            style={hintText}
                          >
                            Публикация: {item.media_id}
                          </p>
                        )}
                        {item.text_answer && (
                          <p className='text-sm mt-2' style={primaryText}>
                            Ответ: {item.text_answer}
                          </p>
                        )}
                        {item.response_at && (
                          <p className='text-xs mt-1' style={hintText}>
                            Ответ отправлен: {formatDate(item.response_at)}
                          </p>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      {!loading && total > PAGE_SIZE && (
        <div className='flex items-center justify-between gap-3'>
          <button
            disabled={offset === 0}
            onClick={() => setOffset((value) => Math.max(0, value - PAGE_SIZE))}
            className='rounded-xl px-4 py-2 text-sm disabled:opacity-40'
            style={{
              background: 'var(--tg-theme-button-color)',
              color: 'var(--tg-theme-button-text-color)',
            }}
          >
            Назад
          </button>
          <span className='text-xs' style={hintText}>
            {Math.floor(offset / PAGE_SIZE) + 1} /{' '}
            {Math.ceil(total / PAGE_SIZE)}
          </span>
          <button
            disabled={offset + PAGE_SIZE >= total}
            onClick={() => setOffset((value) => value + PAGE_SIZE)}
            className='rounded-xl px-4 py-2 text-sm disabled:opacity-40'
            style={{
              background: 'var(--tg-theme-button-color)',
              color: 'var(--tg-theme-button-text-color)',
            }}
          >
            Далее
          </button>
        </div>
      )}
    </div>
  );
}
