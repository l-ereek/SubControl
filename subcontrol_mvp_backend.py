"""
SubControl MVP — Backend API (FastAPI + SQLite)
Сервис автоматического сбора, учёта и оптимизации цифровых подписок.
Полностью синхронизирован с 6 экранами дизайна в Figma и готовый к подключению фронтенда (CORS включён).

Запуск:
    pip install fastapi uvicorn pydantic
    uvicorn subcontrol_mvp_backend:app --reload --port 8000

Документация Swagger UI:
    http://127.0.0.1:8000/docs
"""

from datetime import datetime, timedelta
import re
import sqlite3
from typing import List, Optional
from fastapi import FastAPI, HTTPException, Depends
from fastapi.responses import FileResponse
import os
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr, Field

DB_PATH = "subcontrol_mvp.db"

app = FastAPI(
    title="SubControl MVP API",
    description="Бэкенд сервиса учёта подписок, контроля Free Trials и защиты бюджета («AdBlock для банковских карт»)",
    version="1.0.0"
)

# Разрешаем запросы с любого фронтенда (React, Vue, HTML/JS, Telegram Mini App)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =====================================================================
# 1. СХЕМЫ ДАННЫХ (Pydantic Models) — под все 6 экранов Figma
# =====================================================================

class LoginRequest(BaseModel):
    email: str = Field(..., example="olga@student.dstu.ru")
    password: str = Field(..., example="subcontrol2026")


class RegisterRequest(BaseModel):
    email: str = Field(..., example="olga@student.dstu.ru")
    password: str = Field(..., example="subcontrol2026")
    confirm_password: str = Field(..., example="subcontrol2026")
    phone: str = Field(..., example="+7 (999) 123-45-67")
    full_name: str = Field("Ольга Работнова", example="Ольга Работнова")


class SubscriptionCreate(BaseModel):
    name: str = Field(..., example="Кинопоиск + Плюс")
    category: str = Field("Кино и музыка", example="Кино и музыка")
    price: int = Field(..., example=399)
    card_name: str = Field("Сбер *9012", example="Сбер *9012")
    next_payment_date: str = Field("2026-11-20", example="2026-11-20")
    is_trial: bool = Field(False, example=False)
    trial_hours_left: Optional[int] = Field(None, example=28)
    inactive_days: int = Field(0, example=0)
    cancel_deeplink: str = Field("https://plus.yandex.ru/my", example="https://plus.yandex.ru/my")
    icon_code: str = Field("Я+", example="Я+")
    color_hex: str = Field("#EF4444", example="#EF4444")


class SMSParseRequest(BaseModel):
    sms_text: str = Field(
        ...,
        example="СберБанк: Списание 399р Карта *9012 YANDEX PLUS. Следующий платеж через 30 дней."
    )


class UserSettingsUpdate(BaseModel):
    push_enabled: Optional[bool] = None
    trial_timer_enabled: Optional[bool] = None
    zombie_detector_enabled: Optional[bool] = None
    notify_hours_before: Optional[int] = Field(None, ge=12, le=72)
    zombie_days_threshold: Optional[int] = Field(None, ge=7, le=60)


# =====================================================================
# 2. ИНИЦИАЛИЗАЦИЯ БАЗЫ ДАННЫХ И ДЕМО-ДАННЫХ (под макет Figma)
# =====================================================================

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()


def init_db()


@app.get("/", include_in_schema=False)
def serve_frontend():
    if os.path.exists("index.html"):
        return FileResponse("index.html")
    return {"message": "SubControl API работает! Откройте /docs для просмотра документации."}


@app.get("/manifest.json", include_in_schema=False)
def serve_manifest():
    if os.path.exists("manifest.json"):
        return FileResponse("manifest.json")
    return {}
:
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    # Таблица пользователей и настроек (Экран 1, 2, 6)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            phone TEXT,
            full_name TEXT NOT NULL,
            initials TEXT NOT NULL,
            is_premium INTEGER DEFAULT 0,
            saved_month INTEGER DEFAULT 1190,
            saved_year INTEGER DEFAULT 4350,
            push_enabled INTEGER DEFAULT 1,
            trial_timer_enabled INTEGER DEFAULT 1,
            zombie_detector_enabled INTEGER DEFAULT 1,
            notify_hours_before INTEGER DEFAULT 48,
            zombie_days_threshold INTEGER DEFAULT 14
        )
    """)

    # Таблица привязанных карт (Экран 6)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS bank_cards (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            bank_name TEXT NOT NULL,
            card_mask TEXT NOT NULL,
            label TEXT NOT NULL
        )
    """)

    # Таблица активных подписок пользователя (Экран 3 и 4)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS subscriptions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            category TEXT NOT NULL,
            price INTEGER NOT NULL,
            card_name TEXT NOT NULL,
            next_payment_date TEXT NOT NULL,
            is_trial INTEGER DEFAULT 0,
            trial_hours_left INTEGER,
            inactive_days INTEGER DEFAULT 0,
            is_active INTEGER DEFAULT 1,
            cancel_deeplink TEXT NOT NULL,
            icon_code TEXT NOT NULL,
            color_hex TEXT NOT NULL
        )
    """)

    # Таблица готовых шаблонов сервисов РФ (Экран 5)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS templates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            category TEXT NOT NULL,
            price INTEGER NOT NULL,
            is_student_offer INTEGER DEFAULT 0,
            description TEXT NOT NULL,
            cancel_deeplink TEXT NOT NULL,
            icon_code TEXT NOT NULL,
            color_hex TEXT NOT NULL
        )
    """)

    # Проверяем, есть ли уже демо-пользователь
    cur.execute("SELECT COUNT(*) FROM users")
    if cur.fetchone()[0] == 0:
        # 1. Создаём демо-профиль Ольги Работновой
        cur.execute("""
            INSERT INTO users (
                email, password, phone, full_name, initials,
                is_premium, saved_month, saved_year,
                push_enabled, trial_timer_enabled, zombie_detector_enabled,
                notify_hours_before, zombie_days_threshold
            ) VALUES (?, ?, ?, ?, ?, 0, 1190, 4350, 1, 1, 1, 48, 14)
        """, ("olga@student.dstu.ru", "subcontrol2026", "+7 (999) 123-45-67", "Ольга Работнова", "ОР"))
        user_id = cur.lastrowid

        # 2. Добавляем 3 банковские карты
        cards = [
            (user_id, "Сбер", "*9012", "Сбер *9012"),
            (user_id, "Т-Банк", "*4821", "Т-Банк *4821"),
            (user_id, "Альфа", "*1104", "Альфа *1104"),
        ]
        cur.executemany(
            "INSERT INTO bank_cards (user_id, bank_name, card_mask, label) VALUES (?, ?, ?, ?)",
            cards
        )

        # 3. Добавляем 5 активных подписок (сумма ровно 1 886 ₽/мес, как на макете!)
        # 399 (Иви) + 399 (Яндекс Плюс) + 299 (Telegram) + 199 (ВК Музыка) + 590 (Облако + ИИ) = 1886 ₽
        demo_subs = [
            (user_id, "Иви (триал)", "Кино и музыка", 399, "Т-Банк *4821", "2026-11-18",
             1, 28, 0, 1, "https://www.ivi.ru/profile/subscriptions", "И", "#EF4444"),
            (user_id, "Яндекс Плюс", "Экосистемы", 399, "Сбер *9012", "2026-11-20",
             0, None, 2, 1, "https://plus.yandex.ru/my", "Я", "#EF4444"),
            (user_id, "Telegram Premium", "Связь и софт", 299, "Т-Банк *4821", "2026-11-25",
             0, None, 0, 1, "https://t.me/PremiumBot", "TG", "#38BDF8"),
            (user_id, "ВК Музыка", "Кино и музыка", 199, "Альфа *1104", "2026-11-28",
             0, None, 26, 1, "https://id.vk.com/account/#/services", "VK", "#2563EB"),
            (user_id, "МТС Premium + Облако", "Связь и софт", 590, "Сбер *9012", "2026-11-30",
             0, None, 5, 1, "https://premium.mts.ru/", "МТС", "#E11D48"),
        ]
        cur.executemany("""
            INSERT INTO subscriptions (
                user_id, name, category, price, card_name, next_payment_date,
                is_trial, trial_hours_left, inactive_days, is_active,
                cancel_deeplink, icon_code, color_hex
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, demo_subs)

        # 4. Заполняем каталог шаблонов для добавления в 1 клик (Экран 5)
        demo_templates = [
            ("Яндекс Плюс", "Популярные", 399, 0, "Кинопоиск, Музыка, кэшбэк баллами", "https://plus.yandex.ru/my", "Я", "#EF4444"),
            ("Telegram Premium", "Популярные", 299, 0, "Расшифровка ГС, быстрая загрузка", "https://t.me/PremiumBot", "TG", "#38BDF8"),
            ("ВК Музыка (Студенческая)", "Студентам (-50%)", 99, 1, "Спецтариф по студ. билету (-50%)", "https://id.vk.com/account/#/services", "VK", "#00E676"),
            ("СберПрайм Молодёжный", "Студентам (-50%)", 149, 1, "Окко, Звук и доставка для 18–25 лет", "https://www.sberbank.com/sberprime", "СБ", "#00E676"),
            ("Кинотеатр Иви", "Кино и музыка", 399, 0, "Фильмы и сериалы • Триал 30 дней", "https://www.ivi.ru/profile/subscriptions", "И", "#E11D48"),
            ("МТС Premium + KION", "Связь и софт", 249, 0, "50 ГБ интернета, кинотеатр KION", "https://premium.mts.ru/", "МТС", "#E11D48"),
        ]
        cur.executemany("""
            INSERT INTO templates (
                name, category, price, is_student_offer, description,
                cancel_deeplink, icon_code, color_hex
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, demo_templates)

    conn.commit()
    conn.close()


init_db()


# =====================================================================
# 3. ЭНДПОИНТЫ ЭКРАНОВ 1 И 2: ВХОД И РЕГИСТРАЦИЯ
# =====================================================================

@app.post("/api/auth/login", tags=["Экраны 1-2: Авторизация"])
def login(payload: LoginRequest, db: sqlite3.Connection = Depends(get_db)):
    cur = db.cursor()
    cur.execute("SELECT * FROM users WHERE email = ? AND password = ?", (payload.email, payload.password))
    user = cur.fetchone()
    if not user:
        raise HTTPException(status_code=401, detail="Неверный email или пароль")
    return {
        "status": "ok",
        "message": f"Добро пожаловать в SubControl, {user['full_name']}!",
        "token": f"subcontrol-jwt-token-user-{user['id']}",
        "user": {
            "id": user["id"],
            "email": user["email"],
            "full_name": user["full_name"],
            "initials": user["initials"],
            "is_premium": bool(user["is_premium"])
        }
    }


@app.post("/api/auth/register", tags=["Экраны 1-2: Авторизация"])
def register(payload: RegisterRequest, db: sqlite3.Connection = Depends(get_db)):
    if payload.password != payload.confirm_password:
        raise HTTPException(status_code=400, detail="Пароли не совпадают")

    parts = payload.full_name.strip().split()
    initials = "".join([p[0].upper() for p in parts[:2]]) if parts else "SC"

    cur = db.cursor()
    try:
        cur.execute("""
            INSERT INTO users (email, password, phone, full_name, initials)
            VALUES (?, ?, ?, ?, ?)
        """, (payload.email, payload.password, payload.phone, payload.full_name, initials))
        db.commit()
        new_id = cur.lastrowid
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=400, detail="Пользователь с таким Email уже зарегистрирован")

    return {
        "status": "ok",
        "message": "Регистрация успешно завершена",
        "token": f"subcontrol-jwt-token-user-{new_id}",
        "user_id": new_id
    }


# =====================================================================
# 4. ЭНДПОИНТЫ ЭКРАНА 3: ГЛАВНАЯ СТРАНИЦА (Единый список + Экономия)
# =====================================================================

@app.get("/api/dashboard", tags=["Экран 3: Главная страница"])
def get_dashboard(user_id: int = 1, db: sqlite3.Connection = Depends(get_db)):
    """
    Возвращает все данные для Главного экрана:
    - Общая сумма расходов в месяц (1 886 ₽) и прогноз на год (22 632 ₽)
    - Плашка сохранённых денег (+1 190 ₽ в ноябре)
    - Единый список активных подписок со всех карт с подсветкой триалов и «зомби»
    """
    cur = db.cursor()
    cur.execute("SELECT * FROM users WHERE id = ?", (user_id,))
    user = cur.fetchone()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    cur.execute("""
        SELECT * FROM subscriptions
        WHERE user_id = ? AND is_active = 1
        ORDER BY is_trial DESC, next_payment_date ASC
    """, (user_id,))
    rows = cur.fetchall()

    monthly_total = sum(r["price"] for r in rows)
    yearly_forecast = monthly_total * 12

    subscriptions_list = []
    urgent_trials = []

    for r in rows:
        is_zombie = bool(
            user["zombie_detector_enabled"]
            and r["inactive_days"] >= user["zombie_days_threshold"]
        )
        item = {
            "id": r["id"],
            "name": r["name"],
            "category": r["category"],
            "price": r["price"],
            "card_name": r["card_name"],
            "next_payment_date": r["next_payment_date"],
            "is_trial": bool(r["is_trial"]),
            "trial_hours_left": r["trial_hours_left"],
            "inactive_days": r["inactive_days"],
            "is_zombie": is_zombie,
            "status_badge": (
                f"Триал • {r['trial_hours_left']} ч" if r["is_trial"]
                else (f"Зомби • {r['inactive_days']} дн." if is_zombie else f"Пуш за {user['notify_hours_before']}ч ✓")
            ),
            "cancel_deeplink": r["cancel_deeplink"],
            "icon_code": r["icon_code"],
            "color_hex": r["color_hex"],
        }
        subscriptions_list.append(item)
        if r["is_trial"]:
            urgent_trials.append(item)

    return {
        "monthly_total_rub": monthly_total,
        "yearly_forecast_rub": yearly_forecast,
        "saved_this_month_rub": user["saved_month"],
        "saved_this_year_rub": user["saved_year"],
        "active_count": len(subscriptions_list),
        "urgent_trials": urgent_trials,
        "subscriptions": subscriptions_list,
        "show_ads": not bool(user["is_premium"]),
        "ad_banner": None if user["is_premium"] else {
            "title": "Карта с кэшбэком 20% на все подписки",
            "partner": "Партнёрское предложение банка (РСЯ)",
            "remove_ads_price_rub": 99
        }
    }


@app.post("/api/subscriptions/{sub_id}/cancel", tags=["Экран 3: Главная страница"])
def cancel_subscription_one_click(sub_id: int, user_id: int = 1, db: sqlite3.Connection = Depends(get_db)):
    """
    Отмена подписки в 1 клик:
    - Деактивирует подписку в списке
    - Автоматически прибавляет стоимость подписки к счётчику сэкономленных денег («Сберегли в ноябре»)
    - Возвращает прямую ссылку (диплинк) на страницу отвязки карты в сервисе
    """
    cur = db.cursor()
    cur.execute("SELECT * FROM subscriptions WHERE id = ? AND user_id = ?", (sub_id, user_id))
    sub = cur.fetchone()
    if not sub:
        raise HTTPException(status_code=404, detail="Подписка не найдена")

    if sub["is_active"] == 0:
        raise HTTPException(status_code=400, detail="Подписка уже отменена")

    cur.execute("UPDATE subscriptions SET is_active = 0 WHERE id = ?", (sub_id,))
    cur.execute("""
        UPDATE users
        SET saved_month = saved_month + ?,
            saved_year = saved_year + ?
        WHERE id = ?
    """, (sub["price"], sub["price"], user_id))
    db.commit()

    cur.execute("SELECT saved_month, saved_year FROM users WHERE id = ?", (user_id,))
    updated_user = cur.fetchone()

    return {
        "status": "cancelled",
        "message": f"Подписка «{sub['name']}» отключена! Вы сохранили +{sub['price']} ₽.",
        "redirect_deeplink": sub["cancel_deeplink"],
        "new_saved_month_rub": updated_user["saved_month"],
        "new_saved_year_rub": updated_user["saved_year"]
    }


# =====================================================================
# 5. ЭНДПОИНТЫ ЭКРАНА 4: КАЛЕНДАРЬ СПИСАНИЙ («Скоро спишут»)
# =====================================================================

@app.get("/api/calendar", tags=["Экран 4: Календарь"])
def get_calendar_timeline(user_id: int = 1, db: sqlite3.Connection = Depends(get_db)):
    """
    Возвращает данные для экрана Календаря:
    - Даты на верхней ленте (15..22 ноября) с зелёными и красными ветками
    - Вертикальный таймлайн «Скоро спишут» с точными датами и суммами
    """
    cur = db.cursor()
    cur.execute("""
        SELECT * FROM subscriptions
        WHERE user_id = ? AND is_active = 1
        ORDER BY next_payment_date ASC
    """, (user_id,))
    rows = cur.fetchall()

    timeline = []
    highlighted_days = []

    for r in rows:
        day_num = int(r["next_payment_date"].split("-")[-1])
        node_type = "trial" if r["is_trial"] else ("zombie" if r["inactive_days"] >= 14 else "regular")
        highlighted_days.append({
            "day": day_num,
            "date": r["next_payment_date"],
            "type": node_type,
            "service": r["name"],
            "price": r["price"]
        })
        timeline.append({
            "id": r["id"],
            "name": r["name"],
            "date_formatted": datetime.strptime(r["next_payment_date"], "%Y-%m-%d").strftime("%d.%m.%Y"),
            "day_number": day_num,
            "price_display": f"- {r['price']} ₽",
            "price": r["price"],
            "card_name": r["card_name"],
            "node_color": "#EF4444" if r["is_trial"] else "#00E676",
            "is_trial": bool(r["is_trial"]),
            "cancel_deeplink": r["cancel_deeplink"]
        })

    return {
        "month_title": "Ноябрь 2026",
        "date_strip": [15, 16, 17, 18, 19, 20, 21, 22],
        "active_selected_day": 18,
        "highlighted_days": highlighted_days,
        "upcoming_timeline": timeline,
        "total_upcoming_rub": sum(r["price"] for r in rows)
    }


# =====================================================================
# 6. ЭНДПОИНТЫ ЭКРАНА 5: ШАБЛОНЫ (В 1 КЛИК), ПОИСК ПО СМС И ОПТИМИЗАЦИЯ
# =====================================================================

@app.get("/api/templates", tags=["Экран 5: Шаблоны и СМС-парсер"])
def get_templates(category: Optional[str] = None, db: sqlite3.Connection = Depends(get_db)):
    cur = db.cursor()
    if category:
        cur.execute("SELECT * FROM templates WHERE category = ?", (category,))
    else:
        cur.execute("SELECT * FROM templates")
    templates = [dict(r) for r in cur.fetchall()]

    return {
        "quick_brand_circles": [
            {"id": 1, "icon": "Я", "name": "Яндекс Плюс", "color": "#EF4444"},
            {"id": 2, "icon": "TG", "name": "Telegram", "color": "#38BDF8"},
            {"id": 3, "icon": "VK", "name": "ВК Музыка", "color": "#2563EB"},
            {"id": 5, "icon": "И", "name": "Иви", "color": "#E11D48"}
        ],
        "categories": ["Популярные", "Студентам (-50%)", "Кино и музыка", "Связь и софт"],
        "templates": templates,
        "student_optimization_tip": {
            "title": "Совет: Смени тариф на студ.",
            "description": "Плати в 2 раза меньше за музыку и кино по студенческому билету.",
            "monthly_savings_rub": 350,
            "yearly_savings_rub": 4200
        }
    }


@app.post("/api/subscriptions/from-template/{template_id}", tags=["Экран 5: Шаблоны и СМС-парсер"])
def add_subscription_from_template(
    template_id: int,
    card_name: str = "Сбер *9012",
    is_trial: bool = False,
    user_id: int = 1,
    db: sqlite3.Connection = Depends(get_db)
):
    """Добавление подписки из каталога шаблонов буквально в 1-2 клика."""
    cur = db.cursor()
    cur.execute("SELECT * FROM templates WHERE id = ?", (template_id,))
    tpl = cur.fetchone()
    if not tpl:
        raise HTTPException(status_code=404, detail="Шаблон не найден")

    next_date = (datetime.now() + timedelta(days=7 if is_trial else 30)).strftime("%Y-%m-%d")
    cur.execute("""
        INSERT INTO subscriptions (
            user_id, name, category, price, card_name, next_payment_date,
            is_trial, trial_hours_left, inactive_days, is_active,
            cancel_deeplink, icon_code, color_hex
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?, ?)
    """, (
        user_id, tpl["name"], tpl["category"], tpl["price"], card_name, next_date,
        1 if is_trial else 0, 168 if is_trial else None,
        tpl["cancel_deeplink"], tpl["icon_code"], tpl["color_hex"]
    ))
    db.commit()

    return {
        "status": "added",
        "message": f"Подписка «{tpl['name']}» ({tpl['price']} ₽/мес) добавлена в 1 клик!",
        "subscription_id": cur.lastrowid
    }


@app.post("/api/subscriptions/parse-sms", tags=["Экран 5: Шаблоны и СМС-парсер"])
def parse_bank_sms(payload: SMSParseRequest, user_id: int = 1, db: sqlite3.Connection = Depends(get_db)):
    """
    Автоматический поиск подписок по банковским СМС и Push-уведомлениям.
    Распознаёт сумму, маску карты (*9012), название сервиса и пробный период.
    """
    text = payload.sms_text

    # 1. Ищем сумму списания (например: "399р", "299 руб", "199 ₽")
    amount_match = re.search(r"(\d{1,5})\s*(?:р|руб|₽|RUB)", text, re.IGNORECASE)
    price = int(amount_match.group(1)) if amount_match else 299

    # 2. Ищем маску карты (например: "*9012", "карта 4821")
    card_match = re.search(r"\*(\d{4})", text)
    card_mask = f"*{card_match.group(1)}" if card_match else "*9012"

    bank_name = "Сбер"
    if "Т-Банк" in text or "Tinkoff" in text or "4821" in card_mask:
        bank_name = "Т-Банк"
    elif "Альфа" in text or "1104" in card_mask:
        bank_name = "Альфа"

    # 3. Определяем сервис по ключевым словам
    known_services = [
        (["YANDEX", "ЯНДЕКС", "ПЛЮС"], "Яндекс Плюс", "Экосистемы", "https://plus.yandex.ru/my", "Я", "#EF4444"),
        (["IVI", "ИВИ"], "Кинотеатр Иви", "Кино и музыка", "https://www.ivi.ru/profile/subscriptions", "И", "#E11D48"),
        (["TELEGRAM", "TG"], "Telegram Premium", "Связь и софт", "https://t.me/PremiumBot", "TG", "#38BDF8"),
        (["VK", "ВК МУЗЫКА"], "ВК Музыка", "Кино и музыка", "https://id.vk.com/account/#/services", "VK", "#2563EB"),
        (["MTS", "МТС", "KION"], "МТС Premium", "Связь и софт", "https://premium.mts.ru/", "МТС", "#E11D48"),
    ]

    detected_name = "Цифровая подписка"
    category = "Развлечения"
    deeplink = "https://subcontrol.ru/cancel-guide"
    icon_code = "SC"
    color_hex = "#059669"

    upper_text = text.upper()
    for keywords, s_name, s_cat, s_link, s_icon, s_col in known_services:
        if any(k in upper_text for k in keywords):
            detected_name = s_name
            category = s_cat
            deeplink = s_link
            icon_code = s_icon
            color_hex = s_col
            break

    # Если списание 1–10 ₽ или в тексте есть слово "пробн"/"trial" — ставим флаг Free Trial
    is_trial = price <= 10 or ("ПРОБН" in upper_text) or ("TRIAL" in upper_text)
    if is_trial and price <= 10:
        price = 399  # Полная стоимость после окончания триала

    next_date = (datetime.now() + timedelta(days=7 if is_trial else 30)).strftime("%Y-%m-%d")

    cur = db.cursor()
    cur.execute("""
        INSERT INTO subscriptions (
            user_id, name, category, price, card_name, next_payment_date,
            is_trial, trial_hours_left, inactive_days, is_active,
            cancel_deeplink, icon_code, color_hex
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?, ?)
    """, (
        user_id, detected_name, category, price, f"{bank_name} {card_mask}", next_date,
        1 if is_trial else 0, 72 if is_trial else None, deeplink, icon_code, color_hex
    ))
    db.commit()

    return {
        "status": "parsed_and_added",
        "parsed_data": {
            "service_name": detected_name,
            "price_rub": price,
            "card": f"{bank_name} {card_mask}",
            "is_trial_detected": is_trial,
            "next_payment_date": next_date,
            "cancel_deeplink": deeplink
        }
    }


# =====================================================================
# 7. ЭНДПОИНТЫ ЭКРАНА 6: ПРОФИЛЬ, НАСТРОЙКИ И ОТКЛЮЧЕНИЕ РЕКЛАМЫ (99 ₽)
# =====================================================================

@app.get("/api/profile", tags=["Экран 6: Профиль и Настройки"])
def get_profile(user_id: int = 1, db: sqlite3.Connection = Depends(get_db)):
    cur = db.cursor()
    cur.execute("SELECT * FROM users WHERE id = ?", (user_id,))
    user = cur.fetchone()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    cur.execute("SELECT * FROM bank_cards WHERE user_id = ?", (user_id,))
    cards = [dict(c) for c in cur.fetchall()]

    return {
        "full_name": user["full_name"],
        "initials": user["initials"],
        "email": user["email"],
        "phone": user["phone"],
        "is_premium": bool(user["is_premium"]),
        "tariff_name": "SubControl Без рекламы (99 ₽)" if user["is_premium"] else "Бесплатный (с рекламой)",
        "saved_year_rub": user["saved_year"],
        "connected_cards": cards,
        "settings": {
            "push_enabled": bool(user["push_enabled"]),
            "trial_timer_enabled": bool(user["trial_timer_enabled"]),
            "zombie_detector_enabled": bool(user["zombie_detector_enabled"]),
            "notify_hours_before": user["notify_hours_before"],
            "zombie_days_threshold": user["zombie_days_threshold"]
        }
    }


@app.patch("/api/profile/settings", tags=["Экран 6: Профиль и Настройки"])
def update_settings(payload: UserSettingsUpdate, user_id: int = 1, db: sqlite3.Connection = Depends(get_db)):
    cur = db.cursor()
    fields = []
    values = []
    for k, v in payload.model_dump(exclude_none=True).items():
        fields.append(f"{k} = ?")
        values.append(int(v) if isinstance(v, bool) else v)

    if fields:
        values.append(user_id)
        cur.execute(f"UPDATE users SET {', '.join(fields)} WHERE id = ?", values)
        db.commit()

    return get_profile(user_id=user_id, db=db)


@app.post("/api/profile/upgrade-premium", tags=["Экран 6: Профиль и Настройки"])
def upgrade_to_ad_free(user_id: int = 1, db: sqlite3.Connection = Depends(get_db)):
    """Кнопка «Без рекламы за 99 ₽» на экране Профиля."""
    cur = db.cursor()
    cur.execute("UPDATE users SET is_premium = 1 WHERE id = ?", (user_id,))
    db.commit()
    return {
        "status": "upgraded",
        "message": "Тариф «SubControl без рекламы» (99 ₽/мес) успешно активирован! Все баннеры отключены.",
        "is_premium": True
    }
