# Визуальные материалы: Meta-токены, n8n, MediaHave

Русскоязычные схемы и презентации по документу
[`meta-token-n8n-architecture.md`](../../meta-token-n8n-architecture.md).

## Файлы

### Презентации

- `meta-token-n8n-architecture-ru.pptx` — PowerPoint
- `meta-token-n8n-architecture-ru.html` — HTML-слайды (откройте в браузере)

### Схемы (PNG и JPEG)

| № | Тема | PNG | JPEG |
|---|---|---|---|
| 1 | Текущее состояние | `01-tekushchee-sostoyanie.png` | `.jpg` |
| 2 | Целевая архитектура | `02-tselevaya-arkhitektura.png` | `.jpg` |
| 3 | Роли IGAA и EAAV | `03-roli-igaa-eaav.png` | `.jpg` |
| 4 | Обработка webhook | `04-obrabotka-webhook.png` | `.jpg` |
| 5 | Безопасное хранение | `05-bezopasnoe-hranenie.png` | `.jpg` |
| 6 | Жизненный цикл токенов | `06-zhiznennyy-tsikl.png` | `.jpg` |
| 7 | Этапы внедрения | `07-etapy-vnedreniya.png` | `.jpg` |

## Пересоздание

```bash
pip3 install pillow python-pptx
python3 scripts/generate_meta_architecture_visuals.py
```

Секреты и значения токенов в материалы не включаются.
