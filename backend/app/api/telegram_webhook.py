from fastapi import APIRouter, Request
from aiogram import Bot
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton, WebAppInfo, Update
import os

router = APIRouter()
bot = Bot(token=os.getenv("BOT_TOKEN"))

# ИСПРАВЛЕНО (15.07.2026): обработка /start ig_auth для формы Instagram
def get_start_param(text: str) -> str | None:
    """Извлекает параметр из /start param"""
    if text and text.startswith("/start "):
        return text[7:]  # После "/start "
    return None

@router.post("/telegram")
async def telegram_webhook(request: Request):
    data = await request.json()
    update = Update(**data)

    if update.message and update.message.text:
        start_param = get_start_param(update.message.text)
        
        # ИСПРАВЛЕНО (15.07.2026): обработка ig_auth - форма подключения Instagram
        if start_param == "ig_auth":
            keyboard = InlineKeyboardMarkup(inline_keyboard=[[
                InlineKeyboardButton(
                    text="🔗 Подключить Instagram",
                    web_app=WebAppInfo(url="https://almarathon.com/settings")
                )
            ]])
            await bot.send_message(
                chat_id=update.message.chat.id,
                text="Подключите ваш Instagram аккаунт для автоматизации",
                reply_markup=keyboard,
            )
        elif update.message.text == "/start":
            keyboard = InlineKeyboardMarkup(inline_keyboard=[[
                InlineKeyboardButton(
                    text="🟢 Войти в приложение",
                    web_app=WebAppInfo(url="https://almarathon.com")
                )
            ]])
            await bot.send_message(
                chat_id=update.message.chat.id,
                text="Добро пожаловать в <b>MediaHave</b>",
                reply_markup=keyboard,
                parse_mode="HTML"
            )

    return {"ok": True}
