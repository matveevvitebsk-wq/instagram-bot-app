#!/usr/bin/env python3
"""Generate Russian visual assets for Meta token / n8n architecture docs."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import PP_ALIGN
from pptx.util import Inches, Pt

OUT_DIR = Path(__file__).resolve().parents[1] / "docs" / "assets" / "meta-architecture"
FONT_REG = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

# Visual direction: cool slate + teal accent (not purple / cream / broadsheet)
BG = (245, 248, 252)
INK = (22, 32, 48)
MUTED = (90, 104, 122)
TEAL = (14, 116, 128)
TEAL_SOFT = (204, 236, 240)
AMBER = (180, 98, 18)
AMBER_SOFT = (255, 236, 210)
ROSE = (164, 52, 52)
ROSE_SOFT = (255, 228, 228)
GREEN = (34, 120, 78)
GREEN_SOFT = (220, 242, 228)
CARD = (255, 255, 255)
LINE = (180, 194, 210)


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(FONT_BOLD if bold else FONT_REG, size)


def new_canvas(w: int, h: int) -> tuple[Image.Image, ImageDraw.ImageDraw]:
    img = Image.new("RGB", (w, h), BG)
    draw = ImageDraw.Draw(img)
    # subtle top band
    draw.rectangle((0, 0, w, 12), fill=TEAL)
    return img, draw


def text_size(draw: ImageDraw.ImageDraw, text: str, f: ImageFont.ImageFont) -> tuple[int, int]:
    bbox = draw.textbbox((0, 0), text, font=f)
    return bbox[2] - bbox[0], bbox[3] - bbox[1]


def draw_title(draw: ImageDraw.ImageDraw, title: str, subtitle: str, y: int = 36) -> int:
    draw.text((48, y), title, fill=INK, font=font(36, True))
    draw.text((48, y + 52), subtitle, fill=MUTED, font=font(18))
    return y + 100


def rounded_box(
    draw: ImageDraw.ImageDraw,
    xy: tuple[int, int, int, int],
    fill: tuple[int, int, int],
    outline: tuple[int, int, int] = LINE,
    radius: int = 18,
    width: int = 2,
) -> None:
    draw.rounded_rectangle(xy, radius=radius, fill=fill, outline=outline, width=width)


def box_with_text(
    draw: ImageDraw.ImageDraw,
    x: int,
    y: int,
    w: int,
    h: int,
    title: str,
    lines: list[str] | None = None,
    fill: tuple[int, int, int] = CARD,
    accent: tuple[int, int, int] = TEAL,
) -> tuple[int, int, int, int]:
    xy = (x, y, x + w, y + h)
    rounded_box(draw, xy, fill=fill, outline=accent, radius=16, width=3)
    draw.rectangle((x, y, x + 10, y + h), fill=accent)
    draw.text((x + 24, y + 16), title, fill=INK, font=font(20, True))
    if lines:
        yy = y + 50
        for line in lines:
            draw.text((x + 24, yy), line, fill=MUTED, font=font(15))
            yy += 24
    return xy


def arrow_right(draw: ImageDraw.ImageDraw, x1: int, y: int, x2: int, color=TEAL) -> None:
    draw.line((x1, y, x2 - 10, y), fill=color, width=4)
    draw.polygon([(x2, y), (x2 - 14, y - 8), (x2 - 14, y + 8)], fill=color)


def arrow_down(draw: ImageDraw.ImageDraw, x: int, y1: int, y2: int, color=TEAL) -> None:
    draw.line((x, y1, x, y2 - 10), fill=color, width=4)
    draw.polygon([(x, y2), (x - 8, y2 - 14), (x + 8, y2 - 14)], fill=color)


def save(img: Image.Image, stem: str) -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    png = OUT_DIR / f"{stem}.png"
    jpg = OUT_DIR / f"{stem}.jpg"
    img.save(png, "PNG", optimize=True)
    img.convert("RGB").save(jpg, "JPEG", quality=90, optimize=True)
    print(f"wrote {png.name} / {jpg.name}")


def diagram_01_current_flow() -> None:
    img, draw = new_canvas(1600, 900)
    y = draw_title(
        draw,
        "1. Текущее состояние",
        "Meta → n8n → Supabase → Graph API (токены внутри workflow)",
    )
    boxes = [
        (60, "Meta webhook", ["События комментариев", "и сообщений"]),
        (360, "n8n Webhook", ["Switch / IF", "маршрутизация"]),
        (660, "Supabase", ["ig_accounts", "automation_tasks"]),
        (960, "Приватный ответ", ["Instagram Graph", "IGAA в ноде"]),
        (1260, "Публичный ответ", ["Facebook Graph", "EAAV в ноде"]),
    ]
    for x, title, lines in boxes:
        box_with_text(draw, x, y + 40, 260, 160, title, lines, accent=AMBER if "ответ" in title else TEAL)
    for x in (320, 620, 920):
        arrow_right(draw, x, y + 120, x + 40)
    arrow_right(draw, 1220, y + 120, 1260)

    # warning strip
    rounded_box(draw, (60, y + 260, 1540, y + 420), fill=ROSE_SOFT, outline=ROSE)
    draw.text((90, y + 290), "Риски текущего подхода", fill=ROSE, font=font(24, True))
    risks = [
        "• Статические IGAA / EAAV в HTTP-нодах n8n",
        "• Токены попадают в экспорт, историю execution и pinData",
        "• Нет проверки X-Hub-Signature-256 и дедупликации событий",
        "• Один токен может обработать событие чужого аккаунта",
    ]
    for i, r in enumerate(risks):
        draw.text((90, y + 340 + i * 28), r, fill=INK, font=font(17))

    # data link
    rounded_box(draw, (60, y + 460, 1540, y + 620), fill=CARD, outline=LINE)
    draw.text((90, y + 490), "Связь данных", fill=INK, font=font(22, True))
    draw.text(
        (90, y + 540),
        "webhook entry.id  →  ig_accounts.page_id  →  owner_id  →  automation_tasks.payload.reply_text",
        fill=MUTED,
        font=font(18),
    )
    draw.text(
        (90, y + 575),
        "Все ранее экспортированные токены считаются раскрытыми и должны быть заменены.",
        fill=ROSE,
        font=font(16, True),
    )
    save(img, "01-tekushchee-sostoyanie")


def diagram_02_target_architecture() -> None:
    img, draw = new_canvas(1600, 1000)
    y = draw_title(
        draw,
        "2. Целевая архитектура",
        "Backend-брокер действий: n8n оркестрирует, FastAPI владеет токенами",
    )

    # top row
    box_with_text(draw, 80, y, 280, 130, "Meta", ["События + Graph API"], accent=TEAL)
    box_with_text(draw, 430, y, 320, 130, "Webhook ingress", ["HMAC, dedupe,", "быстрый HTTP 200"], accent=GREEN)
    box_with_text(draw, 820, y, 280, 130, "Очередь", ["Надёжная", "асинхронная доставка"], accent=TEAL)
    box_with_text(draw, 1170, y, 320, 130, "n8n", ["Сценарии, правила,", "ветвление"], accent=AMBER)
    arrow_right(draw, 360, y + 65, 430)
    arrow_right(draw, 750, y + 65, 820)
    arrow_right(draw, 1100, y + 65, 1170)

    arrow_down(draw, 1330, y + 130, y + 210)
    box_with_text(
        draw,
        980,
        y + 210,
        510,
        160,
        "FastAPI Meta broker",
        ["Команда без токена → проверка владельца", "выбор токена → Graph → очищенный результат"],
        fill=TEAL_SOFT,
        accent=TEAL,
    )
    arrow_down(draw, 1130, y + 370, y + 450)

    box_with_text(draw, 80, y + 450, 360, 150, "Supabase", ["Метаданные аккаунтов,", "правила, аудит"], accent=TEAL)
    box_with_text(draw, 520, y + 450, 360, 150, "Vault / KMS", ["Зашифрованные IGAA", "и EAAV"], accent=GREEN)
    box_with_text(draw, 960, y + 450, 530, 150, "Meta Graph API", ["graph.instagram.com (IGAA)", "graph.facebook.com (EAAV)"], accent=TEAL)

    draw.text((80, y + 650), "Гарантии системы", fill=INK, font=font(22, True))
    guarantees = [
        "Изоляция владельцев",
        "Правильный аккаунт",
        "Правильный тип токена",
        "Нет токенов в n8n",
        "Проверка webhook",
        "Один ответ на событие",
        "Контроль срока токена",
        "Повторная авторизация",
    ]
    for i, g in enumerate(guarantees):
        col = i % 4
        row = i // 4
        x = 80 + col * 370
        yy = y + 700 + row * 70
        rounded_box(draw, (x, yy, x + 340, yy + 52), fill=GREEN_SOFT, outline=GREEN, radius=12)
        draw.text((x + 20, yy + 14), f"✓  {g}", fill=GREEN, font=font(17, True))
    save(img, "02-tselevaya-arkhitektura")


def diagram_03_token_roles() -> None:
    img, draw = new_canvas(1600, 950)
    y = draw_title(
        draw,
        "3. Роли IGAA и EAAV",
        "Тип действия определяет API и токен; префикс — не единственный критерий",
    )

    box_with_text(
        draw,
        560,
        y,
        480,
        100,
        "Какое действие требуется?",
        ["Операция + метаданные аккаунта"],
        fill=AMBER_SOFT,
        accent=AMBER,
    )
    arrow_down(draw, 700, y + 100, y + 170)
    arrow_down(draw, 900, y + 100, y + 170)

    # IGAA column
    box_with_text(
        draw,
        120,
        y + 180,
        620,
        420,
        "IGAA → graph.instagram.com",
        [
            "• Профиль Instagram",
            "• Медиа Instagram",
            "• Messaging / private reply",
            "• Обновление: refresh_access_token",
            "",
            "Хранить метаданные:",
            "app_id, scopes, account_id, expires_at",
        ],
        fill=TEAL_SOFT,
        accent=TEAL,
    )

    # EAAV column
    box_with_text(
        draw,
        860,
        y + 180,
        620,
        420,
        "EAAV → graph.facebook.com",
        [
            "• Публичные комментарии / Pages",
            "• Facebook Login for Business",
            "• debug_token (+ app access token)",
            "• Page / System User token",
            "",
            "Не смешивать хосты Graph API",
            "и типы токенов между собой",
        ],
        fill=AMBER_SOFT,
        accent=AMBER,
    )

    draw.text(
        (120, y + 650),
        "Правило: n8n передаёт намерение действия; backend выбирает токен по метаданным, а не по префиксу строки.",
        fill=MUTED,
        font=font(18),
    )
    save(img, "03-roli-igaa-eaav")


def diagram_04_webhook_sequence() -> None:
    img, draw = new_canvas(1600, 1000)
    y = draw_title(
        draw,
        "4. Обработка webhook",
        "Быстрый HTTP 200, затем асинхронная оркестрация и вызов Graph через брокер",
    )

    actors = [
        (100, "Meta"),
        (320, "Ingress"),
        (540, "Очередь"),
        (760, "n8n"),
        (980, "Broker"),
        (1200, "Supabase"),
        (1420, "Graph"),
    ]
    for x, name in actors:
        rounded_box(draw, (x - 50, y, x + 70, y + 48), fill=TEAL_SOFT, outline=TEAL, radius=10)
        tw, _ = text_size(draw, name, font(15, True))
        draw.text((x - tw // 2, y + 12), name, fill=TEAL, font=font(15, True))
        draw.line((x, y + 48, x, y + 700), fill=LINE, width=2)

    steps = [
        (0, 1, "1. Подписанное событие", y + 80),
        (1, 1, "2. HMAC + account + dedupe", y + 150),
        (1, 2, "3. Каноническое событие", y + 220),
        (1, 0, "4. HTTP 200", y + 290),
        (2, 3, "5. Передача в n8n", y + 360),
        (3, 5, "6. Активное правило", y + 430),
        (3, 4, "7. Команда + idempotency key", y + 500),
        (4, 5, "8. Владелец / метаданные", y + 570),
        (4, 6, "9. Graph-запрос", y + 640),
        (4, 3, "10. Результат без токена", y + 710),
    ]
    xs = [a[0] for a in actors]
    for a, b, label, yy in steps:
        x1, x2 = xs[a], xs[b]
        if a == b:
            rounded_box(draw, (x1 + 20, yy - 10, x1 + 280, yy + 28), fill=CARD, outline=TEAL, radius=8)
            draw.text((x1 + 30, yy - 4), label, fill=INK, font=font(13))
        else:
            left, right = min(x1, x2), max(x1, x2)
            draw.line((left, yy, right, yy), fill=TEAL, width=3)
            if x2 >= x1:
                draw.polygon([(right, yy), (right - 10, yy - 6), (right - 10, yy + 6)], fill=TEAL)
            else:
                draw.polygon([(left, yy), (left + 10, yy - 6), (left + 10, yy + 6)], fill=TEAL)
            mid = (left + right) // 2
            tw, th = text_size(draw, label, font(13))
            draw.rectangle((mid - tw // 2 - 8, yy - 22, mid + tw // 2 + 8, yy - 2), fill=BG)
            draw.text((mid - tw // 2, yy - 20), label, fill=INK, font=font(13))

    save(img, "04-obrabotka-webhook")


def diagram_05_storage() -> None:
    img, draw = new_canvas(1600, 900)
    y = draw_title(
        draw,
        "5. Безопасное хранение",
        "Метаданные в Supabase, секреты в Vault/KMS — брокер читает оба слоя",
    )

    box_with_text(
        draw,
        80,
        y,
        440,
        220,
        "ig_accounts / meta_connections",
        ["owner_id, page_id, provider,", "token_kind, scopes, expires_at,", "secret_reference + version"],
        accent=TEAL,
    )
    arrow_right(draw, 520, y + 80, 600)
    box_with_text(
        draw,
        600,
        y,
        400,
        220,
        "Vault / Secret Manager",
        ["Зашифрованный IGAA", "или EAAV", "доступ только у брокера"],
        fill=GREEN_SOFT,
        accent=GREEN,
    )
    arrow_right(draw, 1000, y + 80, 1080)
    box_with_text(
        draw,
        1080,
        y,
        420,
        220,
        "KMS / HSM",
        ["Ключи шифрования", "вне базы данных"],
        fill=AMBER_SOFT,
        accent=AMBER,
    )

    # allowed / forbidden
    box_with_text(
        draw,
        80,
        y + 280,
        700,
        340,
        "Можно хранить открыто",
        [
            "owner_id, ig_account_id, provider",
            "token_kind, meta_app_id, scopes",
            "instagram_account_id, facebook_page_id",
            "expires_at, is_valid, refresh_required",
            "secret_reference, secret_version",
        ],
        fill=GREEN_SOFT,
        accent=GREEN,
    )
    box_with_text(
        draw,
        820,
        y + 280,
        700,
        340,
        "Нельзя хранить открыто",
        [
            "IGAA / EAAV bearer token",
            "Meta app secret",
            "Supabase service_role",
            "полный Authorization header",
            "ключ шифрования",
        ],
        fill=ROSE_SOFT,
        accent=ROSE,
    )
    save(img, "05-bezopasnoe-hranenie")


def diagram_06_lifecycle() -> None:
    img, draw = new_canvas(1600, 900)
    y = draw_title(
        draw,
        "6. Жизненный цикл токенов",
        "Планировщик проверяет, обновляет и помечает токены на повторную авторизацию",
    )

    stages = [
        (80, "Получение", "OAuth / Login\nfor Business", TEAL),
        (380, "Проверка", "debug_token /\nvalidate", GREEN),
        (680, "Обновление", "refresh IGAA\nили renew EAAV", AMBER),
        (980, "Использование", "только через\nMeta broker", TEAL),
        (1280, "Отзыв", "reauth_required\nи очистка", ROSE),
    ]
    for x, title, body, color in stages:
        soft = {
            TEAL: TEAL_SOFT,
            GREEN: GREEN_SOFT,
            AMBER: AMBER_SOFT,
            ROSE: ROSE_SOFT,
        }[color]
        box_with_text(draw, x, y + 40, 240, 180, title, body.split("\n"), fill=soft, accent=color)
    for x in (320, 620, 920, 1220):
        arrow_right(draw, x, y + 130, x + 60)

    notes = [
        ("IGAA", "Короткоживущий / обновляемый через Instagram refresh endpoint"),
        ("EAAV", "Проверять через debug_token; не выдумывать токен при rebuild"),
        ("UI", "При невозможности обновления — запросить повторную авторизацию"),
        ("n8n", "Никогда не получает raw bearer token"),
    ]
    for i, (k, v) in enumerate(notes):
        yy = y + 300 + i * 80
        rounded_box(draw, (80, yy, 1520, yy + 64), fill=CARD, outline=LINE, radius=12)
        rounded_box(draw, (100, yy + 14, 220, yy + 50), fill=TEAL_SOFT, outline=TEAL, radius=8)
        draw.text((120, yy + 22), k, fill=TEAL, font=font(16, True))
        draw.text((250, yy + 22), v, fill=INK, font=font(17))
    save(img, "06-zhiznennyy-tsikl")


def diagram_07_roadmap() -> None:
    img, draw = new_canvas(1600, 950)
    y = draw_title(
        draw,
        "7. Этапы внедрения",
        "От безопасного ingress до полного брокера без токенов в n8n",
    )
    phases = [
        ("Этап A", "Ingress и безопасность", ["Проверка подписи", "Дедупликация", "Быстрый 200", "Ротация секретов"]),
        ("Этап B", "Метаданные токенов", ["Явный token_kind", "expires_at / scopes", "secret_reference", "Статусы refresh"]),
        ("Этап C", "Брокер действий", ["Командный API", "Изоляция владельцев", "Graph из backend", "Очищенный ответ"]),
        ("Этап D", "Операции", ["Планировщик", "Мониторинг", "Алерты reauth", "Критерии готовности"]),
    ]
    for i, (stage, title, items) in enumerate(phases):
        x = 80 + i * 380
        box_with_text(draw, x, y + 20, 340, 360, f"{stage}: {title}", [f"• {it}" for it in items], accent=TEAL)
        if i < 3:
            arrow_right(draw, x + 340, y + 180, x + 380)

    rounded_box(draw, (80, y + 440, 1520, y + 620), fill=TEAL_SOFT, outline=TEAL)
    draw.text((110, y + 470), "Критерии готовности", fill=TEAL, font=font(24, True))
    done = [
        "В n8n нет bearer-токенов Meta",
        "Webhook проверяется и дедуплицируется",
        "Публичный и приватный ответ идут через правильный API",
        "Токены обновляются или требуют повторной авторизации автоматически",
    ]
    for i, d in enumerate(done):
        draw.text((110, y + 520 + i * 28), f"✓  {d}", fill=INK, font=font(17))
    save(img, "07-etapy-vnedreniya")


def build_pptx(image_stems: list[str]) -> Path:
    prs = Presentation()
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)

    def add_title_slide(title: str, subtitle: str) -> None:
        slide = prs.slides.add_slide(prs.slide_layouts[6])
        shape = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0), Inches(0), Inches(13.333), Inches(0.2))
        shape.fill.solid()
        shape.fill.fore_color.rgb = RGBColor(14, 116, 128)
        shape.line.fill.background()
        box = slide.shapes.add_textbox(Inches(0.8), Inches(2.4), Inches(11.5), Inches(1.2))
        tf = box.text_frame
        p = tf.paragraphs[0]
        p.text = title
        p.font.size = Pt(40)
        p.font.bold = True
        p.font.color.rgb = RGBColor(22, 32, 48)
        p.font.name = "DejaVu Sans"
        sub = slide.shapes.add_textbox(Inches(0.8), Inches(3.6), Inches(11.5), Inches(1.2))
        stf = sub.text_frame
        sp = stf.paragraphs[0]
        sp.text = subtitle
        sp.font.size = Pt(20)
        sp.font.color.rgb = RGBColor(90, 104, 122)
        sp.font.name = "DejaVu Sans"

    def add_bullets(title: str, bullets: list[str]) -> None:
        slide = prs.slides.add_slide(prs.slide_layouts[6])
        shape = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0), Inches(0), Inches(13.333), Inches(0.2))
        shape.fill.solid()
        shape.fill.fore_color.rgb = RGBColor(14, 116, 128)
        shape.line.fill.background()
        tbox = slide.shapes.add_textbox(Inches(0.7), Inches(0.5), Inches(12), Inches(0.8))
        tp = tbox.text_frame.paragraphs[0]
        tp.text = title
        tp.font.size = Pt(30)
        tp.font.bold = True
        tp.font.color.rgb = RGBColor(22, 32, 48)
        tp.font.name = "DejaVu Sans"
        bbox = slide.shapes.add_textbox(Inches(0.9), Inches(1.5), Inches(11.5), Inches(5.5))
        tf = bbox.text_frame
        tf.word_wrap = True
        for i, b in enumerate(bullets):
            p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
            p.text = b
            p.level = 0
            p.font.size = Pt(20)
            p.font.color.rgb = RGBColor(22, 32, 48)
            p.font.name = "DejaVu Sans"
            p.space_after = Pt(12)

    def add_image_slide(title: str, image_path: Path) -> None:
        slide = prs.slides.add_slide(prs.slide_layouts[6])
        shape = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0), Inches(0), Inches(13.333), Inches(0.2))
        shape.fill.solid()
        shape.fill.fore_color.rgb = RGBColor(14, 116, 128)
        shape.line.fill.background()
        tbox = slide.shapes.add_textbox(Inches(0.5), Inches(0.35), Inches(12.3), Inches(0.5))
        tp = tbox.text_frame.paragraphs[0]
        tp.text = title
        tp.font.size = Pt(22)
        tp.font.bold = True
        tp.font.color.rgb = RGBColor(22, 32, 48)
        tp.font.name = "DejaVu Sans"
        slide.shapes.add_picture(str(image_path), Inches(0.45), Inches(0.95), width=Inches(12.4))

    add_title_slide(
        "Архитектура Meta-токенов, n8n и MediaHave",
        "Русскоязычная презентация целевого контура безопасности и оркестрации",
    )
    add_bullets(
        "Содержание",
        [
            "1. Текущее состояние и риски",
            "2. Целевая архитектура с backend-брокером",
            "3. Роли IGAA и EAAV",
            "4. Обработка webhook",
            "5. Безопасное хранение секретов",
            "6. Жизненный цикл токенов",
            "7. Этапы внедрения и критерии готовности",
        ],
    )

    titles = {
        "01-tekushchee-sostoyanie": "Текущее состояние",
        "02-tselevaya-arkhitektura": "Целевая архитектура",
        "03-roli-igaa-eaav": "Роли IGAA и EAAV",
        "04-obrabotka-webhook": "Обработка webhook",
        "05-bezopasnoe-hranenie": "Безопасное хранение",
        "06-zhiznennyy-tsikl": "Жизненный цикл токенов",
        "07-etapy-vnedreniya": "Этапы внедрения",
    }
    for stem in image_stems:
        add_image_slide(titles[stem], OUT_DIR / f"{stem}.png")

    add_bullets(
        "Ключевые принципы",
        [
            "n8n управляет сценарием, backend управляет токенами и Graph API",
            "Токены не передаются в n8n и не хранятся в workflow",
            "Webhook проверяется по X-Hub-Signature-256 до обработки",
            "IGAA → graph.instagram.com; EAAV → graph.facebook.com",
            "Секреты — в Vault/KMS; в БД только метаданные и ссылки",
            "Ранее раскрытые токены необходимо ротировать",
        ],
    )

    out = OUT_DIR / "meta-token-n8n-architecture-ru.pptx"
    prs.save(out)
    print(f"wrote {out.name}")
    return out


def build_html(image_stems: list[str]) -> Path:
    titles = {
        "01-tekushchee-sostoyanie": "Текущее состояние",
        "02-tselevaya-arkhitektura": "Целевая архитектура",
        "03-roli-igaa-eaav": "Роли IGAA и EAAV",
        "04-obrabotka-webhook": "Обработка webhook",
        "05-bezopasnoe-hranenie": "Безопасное хранение",
        "06-zhiznennyy-tsikl": "Жизненный цикл токенов",
        "07-etapy-vnedreniya": "Этапы внедрения",
    }
    slides = [
        """
        <section class="slide title-slide">
          <p class="brand">MediaHave</p>
          <h1>Архитектура Meta-токенов, n8n и MediaHave</h1>
          <p class="lead">Русскоязычная визуальная презентация безопасного контура оркестрации</p>
          <p class="hint">← → или пробел для навигации</p>
        </section>
        """,
        """
        <section class="slide">
          <h2>Содержание</h2>
          <ol>
            <li>Текущее состояние и риски</li>
            <li>Целевая архитектура с backend-брокером</li>
            <li>Роли IGAA и EAAV</li>
            <li>Обработка webhook</li>
            <li>Безопасное хранение секретов</li>
            <li>Жизненный цикл токенов</li>
            <li>Этапы внедрения</li>
          </ol>
        </section>
        """,
    ]
    for stem in image_stems:
        slides.append(
            f"""
        <section class="slide image-slide">
          <h2>{titles[stem]}</h2>
          <img src="{stem}.png" alt="{titles[stem]}" />
        </section>
        """
        )
    slides.append(
        """
        <section class="slide">
          <h2>Ключевые принципы</h2>
          <ul>
            <li>n8n управляет сценарием, backend — токенами и Graph API</li>
            <li>Токены не передаются в n8n и не хранятся в workflow</li>
            <li>Webhook проверяется по X-Hub-Signature-256</li>
            <li>IGAA → graph.instagram.com; EAAV → graph.facebook.com</li>
            <li>Секреты — в Vault/KMS; в БД только метаданные</li>
            <li>Ранее раскрытые токены необходимо ротировать</li>
          </ul>
        </section>
        """
    )

    html = f"""<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Архитектура Meta-токенов — MediaHave</title>
  <style>
    :root {{
      --bg: #f5f8fc;
      --ink: #162030;
      --muted: #5a687a;
      --teal: #0e7480;
      --soft: #ccecf0;
    }}
    * {{ box-sizing: border-box; }}
    html, body {{ margin: 0; height: 100%; background:
      radial-gradient(1200px 600px at 10% -10%, #d7eef1 0%, transparent 55%),
      radial-gradient(900px 500px at 100% 0%, #e8f0f8 0%, transparent 50%),
      var(--bg);
      color: var(--ink);
      font-family: "DejaVu Sans", "Noto Sans", sans-serif; }}
    .deck {{ height: 100%; overflow: hidden; }}
    .slide {{
      display: none; height: 100%; padding: 48px 64px;
      flex-direction: column; justify-content: center;
      animation: fade .35s ease;
    }}
    .slide.active {{ display: flex; }}
    .brand {{
      font-size: clamp(40px, 6vw, 72px); font-weight: 700;
      color: var(--teal); margin: 0 0 12px; letter-spacing: -0.03em;
    }}
    h1 {{ font-size: clamp(28px, 4vw, 44px); margin: 0 0 16px; max-width: 16ch; }}
    h2 {{ font-size: clamp(24px, 3vw, 36px); margin: 0 0 24px; color: var(--teal); }}
    .lead {{ font-size: 1.25rem; color: var(--muted); max-width: 42ch; }}
    .hint {{ margin-top: 40px; color: var(--muted); font-size: .95rem; }}
    ol, ul {{ font-size: 1.25rem; line-height: 1.7; max-width: 48ch; }}
    .image-slide {{ justify-content: flex-start; }}
    .image-slide img {{
      width: 100%; max-height: calc(100vh - 140px); object-fit: contain;
      border-radius: 12px; box-shadow: 0 8px 32px rgba(22,32,48,.08);
      background: white;
    }}
    .progress {{
      position: fixed; left: 0; right: 0; bottom: 0; height: 4px; background: #d7e2ec;
    }}
    .progress > i {{
      display: block; height: 100%; background: var(--teal); width: 0%; transition: width .25s ease;
    }}
    .nav {{
      position: fixed; right: 24px; bottom: 24px; display: flex; gap: 8px;
    }}
    .nav button {{
      border: 0; background: var(--teal); color: white; border-radius: 10px;
      padding: 10px 14px; font: inherit; cursor: pointer;
    }}
    @keyframes fade {{ from {{ opacity: 0; transform: translateY(8px); }} to {{ opacity: 1; transform: none; }} }}
    @media (max-width: 720px) {{
      .slide {{ padding: 28px 20px; }}
      ol, ul {{ font-size: 1.05rem; }}
    }}
  </style>
</head>
<body>
  <div class="deck" id="deck">
    {''.join(slides)}
  </div>
  <div class="progress"><i id="bar"></i></div>
  <div class="nav">
    <button type="button" id="prev">Назад</button>
    <button type="button" id="next">Далее</button>
  </div>
  <script>
    const slides = [...document.querySelectorAll('.slide')];
    let i = 0;
    const bar = document.getElementById('bar');
    function show(n) {{
      i = Math.max(0, Math.min(slides.length - 1, n));
      slides.forEach((s, idx) => s.classList.toggle('active', idx === i));
      bar.style.width = ((i + 1) / slides.length * 100) + '%';
    }}
    document.getElementById('prev').onclick = () => show(i - 1);
    document.getElementById('next').onclick = () => show(i + 1);
    window.addEventListener('keydown', (e) => {{
      if (['ArrowRight', ' ', 'PageDown'].includes(e.key)) show(i + 1);
      if (['ArrowLeft', 'PageUp'].includes(e.key)) show(i - 1);
      if (e.key === 'Home') show(0);
      if (e.key === 'End') show(slides.length - 1);
    }});
    show(0);
  </script>
</body>
</html>
"""
    out = OUT_DIR / "meta-token-n8n-architecture-ru.html"
    out.write_text(html, encoding="utf-8")
    print(f"wrote {out.name}")
    return out


def main() -> None:
    generators = [
        diagram_01_current_flow,
        diagram_02_target_architecture,
        diagram_03_token_roles,
        diagram_04_webhook_sequence,
        diagram_05_storage,
        diagram_06_lifecycle,
        diagram_07_roadmap,
    ]
    for g in generators:
        g()
    stems = [
        "01-tekushchee-sostoyanie",
        "02-tselevaya-arkhitektura",
        "03-roli-igaa-eaav",
        "04-obrabotka-webhook",
        "05-bezopasnoe-hranenie",
        "06-zhiznennyy-tsikl",
        "07-etapy-vnedreniya",
    ]
    build_pptx(stems)
    build_html(stems)
    print(f"assets in {OUT_DIR}")


if __name__ == "__main__":
    main()
