from fastapi import APIRouter, Request
from aiogram import Bot
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton, WebAppInfo, Update
import os

router = APIRouter()
bot = Bot(token=os.getenv("BOT_TOKEN"))

@router.post("/telegram")
async def telegram_webhook(request: Request):
    data = await request.json()
    update = Update(**data)

    if update.message and update.message.text == "/start":
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
