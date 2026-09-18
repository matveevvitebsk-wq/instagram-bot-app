# Итог чата — handoff для продолжения (2026-08-03)

Документ зафиксирован на `main`, чтобы следующий чат мог продолжить без потери контекста.

Связанные материалы:

- [`meta-token-n8n-architecture.md`](./meta-token-n8n-architecture.md) — архитектура (EN)
- [`meta-token-n8n-architecture-ru-visual.md`](./meta-token-n8n-architecture-ru-visual.md) — визуальный гайд (RU + Mermaid)
- [`assets/meta-architecture/`](./assets/meta-architecture/) — PNG / JPEG / PPTX / HTML
- [`server-git-pull-recovery.md`](./server-git-pull-recovery.md) — восстановление `git pull` на сервере
- Deploy path: `/opt/instagram-bot/instagram-bot-app` (не `/home/almat/n8n-docker-caddy`)

Актуальный tip `main` на момент записи: `a9c99c5`.

---

## 1. Что получилось

### 1.1 Продукт / UI / backend (уже в `main`)

| Область | Результат |
|---|---|
| Авто-ответ в DM | UI переименован с «Воронки»; CRUD на `automation_tasks` (`keyword_funnel` / `dm_reply`); Edit; Delete; toggle статуса |
| Задачи | Edit/delete для необработанных; hard delete; выбор «Авто-ответ в DM» ведёт на `/auto-reply-dm`; удаление без «воскрешения» |
| Баг создания auto-reply | Исправлено: aliases `n8n_base_url` / `n8n_api_key`; сбой n8n dispatch не валит create |
| Dashboard / Settings | Разделение stats vs actions; Telegram/Instagram аватары; disconnect очищает кэш и UI |
| Telegram username | Sync профиля при каждом открытии Mini App → `customer_profiles` |
| Facebook EAAV | Миграция `facebook_access_token` + lifecycle service; OAuth URL/callback; `META_FACEBOOK_CONFIG_ID` |
| Facebook UI | Кнопка комментариев отключена: «Facebook для комментариев — временно недоступен» |
| CORS | PATCH для funnels/status больше не ломается из‑за OPTIONS |

### 1.2 Документация и архитектура

| Материал | Статус |
|---|---|
| EN architecture plan (без смены app-кода) | ✅ `docs/meta-token-n8n-architecture.md` |
| RU visual + Mermaid | ✅ `docs/meta-token-n8n-architecture-ru-visual.md` |
| PNG + JPEG (7 схем) | ✅ `docs/assets/meta-architecture/` |
| PPTX + HTML презентация (RU) | ✅ там же |
| Генератор визуалов | ✅ `scripts/generate_meta_architecture_visuals.py` |
| Гайд восстановления `git pull` на сервере | ✅ `docs/server-git-pull-recovery.md` |

### 1.3 Операционные выводы, которые подтвердились на практике

1. **Deploy только из** `/opt/instagram-bot/instagram-bot-app`.
2. **`ig_accounts.access_token` = IGAA**; **`facebook_access_token` = EAAV** — не смешивать.
3. **IGAA → `graph.instagram.com`**; **EAAV → `graph.facebook.com`**.
4. Публичный ответ на комментарий через Facebook Graph требует **Facebook comment ID**, а не Instagram webhook comment ID; матч через `/{media_id}/comments`.
5. Backend не должен **изобретать** EAAV при rebuild — только validate/refresh существующих.
6. Экспорт workflow `mary-fitness` содержал живые секреты → считать **скомпрометированными**, ротировать.
7. Auto-reply правила живут в **`automation_tasks`**, не в `automation_funnels` (funnels оставлены на будущее).
8. Dashboard «В очереди» = count `automation_tasks` со `status=pending`.

---

## 2. Что не получилось / где были проблемы

| Проблема | Что произошло | Итог |
|---|---|---|
| Production `git pull` залипал около `61137c6` | Локальные изменения + права на `n8n/workflows` | В итоге вытащили новее через stash/chown; процедура записана в `server-git-pull-recovery.md` |
| Facebook comments connect | UI временно отключён; полный рабочий публичный reply path не доведён до production-ready | Кнопка disabled |
| `mmdc` (Mermaid CLI) в среде агента | Не был установлен | Визуалы сделаны через Pillow + python-pptx вместо Mermaid→PNG |
| Секреты в upload workflow | Токены/pinData оказались в экспорте | Документация предупреждает; **ротация секретов в чате не выполнялась** |
| PR visuals сначала ушёл в feature branch | Пользователь потребовал «All saves in main» | Fast-forward merge в `main` выполнен (`a9c99c5`) |

---

## 3. Что не сделали (осознанно или не успели)

Это **не сделано в коде приложения** — архитектура описана, реализация брокера не начата:

1. **Backend Meta action broker** (n8n → команда без токена → FastAPI → Graph).
2. **Webhook ingress** с проверкой `X-Hub-Signature-256`, дедупликацией, быстрым HTTP 200 и очередью.
3. **Vault / KMS** для хранения bearer-токенов (сейчас токены ещё в модели/БД; целевое — secret_reference).
4. **Перепись n8n workflow `mary-fitness`** под брокер (убрать IGAA/EAAV из HTTP-нод).
5. **Планировщик жизненного цикла токенов** (validate/refresh/reauth_required) как production job.
6. **Ротация скомпрометированных токенов/секретов** из экспорта workflow.
7. **Включение Facebook comments** в UI после готовности EAAV + Graph path.
8. **Мониторинг/алерты** (OAuth errors, rate limit, Graph 5xx, reauth).
9. **Полный production deploy** последнего docs/visuals коммита на droplet в этом чате не верифицировался end-to-end после `a9c99c5`.

---

## 4. К каким результатам и выводам пришли

### Целевая модель

```text
Meta → verified ingress → queue → n8n (оркестрация)
                              ↓
                     FastAPI Meta broker
                     (owner check, token pick, Graph)
                              ↓
                     Supabase metadata + Vault secrets
```

### Ключевые принципы

- n8n **не владеет** bearer-токенами.
- Выбор токена — по **операции + метаданным**, не по префиксу строки.
- Один ответ на одно событие (idempotency / dedupe).
- Быстрый 200 webhook до тяжёлой работы.
- Ранее экспортированные токены = leaked → rotate.

### Разделение данных

| Сущность | Смысл |
|---|---|
| `customer_profiles` | Пользователь Telegram / MediaHave |
| `ig_accounts` | Instagram-аккаунт; IGAA + EAAV поля |
| `automation_tasks` | Правила auto-reply DM и задачи очереди |
| `automation_funnels` | Зарезервировано под будущие воронки |

### Рекомендуемые этапы внедрения (из архитектуры)

1. **A** — ingress + signature + dedupe + ротация секретов  
2. **B** — явные метаданные токенов (`token_kind`, expiry, secret_reference)  
3. **C** — broker API + Graph только из backend  
4. **D** — scheduler, мониторинг, критерии готовности  

---

## 5. Новые задачи (бэклог для следующего чата)

Приоритет сверху вниз — практический порядок продолжения.

### P0 — безопасность и доступность

1. Ротировать все секреты из экспорта `mary-fitness` (IGAA, EAAV, verify token, связанные app secrets при необходимости).
2. Убрать `pinData` / production PII из shared workflow exports.
3. Проверить production deploy path после pull: frontend build + backend recreate + nginx restart.

### P1 — минимальный безопасный путь комментариев/DM

4. Реализовать webhook ingress (HMAC + dedupe + 200).
5. Сделать первый endpoint брокера, например `private_reply` / `public_comment_reply`, без возврата токена в n8n.
6. Сопоставить Instagram webhook comment id → Facebook Graph comment id перед public reply.
7. Включить Facebook comments UI только после стабильного EAAV path.

### P2 — хранение и lifecycle

8. Ввести `meta_connections` (или эквивалент) с `secret_reference` / `secret_version`.
9. Временное шифрование at-rest в FastAPI, если Vault ещё нет.
10. Scheduler: validate IGAA/EAAV, refresh где возможно, иначе `refresh_required` / UI reauth.

### P3 — n8n и продукт

11. Переписать `mary-fitness` workflow: команды брокеру вместо embedded tokens.
12. Классификация ошибок Graph (retryable vs terminal) + запись в аудит.
13. Вернуться к `automation_funnels` как отдельному продуктовому контуру, если нужны «воронки» помимо auto-reply DM.

### Документы / артефакты уже готовы как вход

- EN plan + RU visual + PNG/JPEG/PPTX/HTML — можно сразу использовать как ТЗ.
- Пересоздать визуалы: `python3 scripts/generate_meta_architecture_visuals.py` (нужны `pillow`, `python-pptx`).

---

## 6. Важные пути и команды

### Репозиторий

- App: GitHub `Almavit/instagram-bot-app`
- Предпочтительная ветка для сохранения: **`main`** (явное требование пользователя)

### Production deploy

```bash
cd /opt/instagram-bot/instagram-bot-app
git pull origin main
cd frontend && npm install && npm run build && cd ..
docker compose build --no-cache backend
docker compose up -d --force-recreate backend
docker compose restart nginx
```

Не использовать `docker compose up ... backend frontend` из `/home/almat/n8n-docker-caddy`.

### Формат комментариев к изменениям

`YYYY-MM-DD cursor <comment>`

---

## 7. Короткий вердикт

**Сделано:** продуктовые фиксы Auto-Reply/Tasks/Dashboard/Settings/Telegram sync; задел Facebook EAAV; полная архитектурная документация на русском и английском; визуальные материалы (PNG/JPEG/PPTX/HTML) на `main`.

**Не сделано:** реализация безопасного Meta broker + ingress + Vault + перепись n8n + ротация leaked секретов + включение Facebook comments в prod.

**Главный вывод следующего этапа:** перестать держать токены в n8n и провести события через verified ingress → очередь → n8n → FastAPI broker → Graph.
