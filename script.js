const API_BASE = "http://127.0.0.1:8000";
let isBackendOnline = false;

// Резервное состояние (на случай если открыли файл без запущенного терминала)
let localState = {
    savedMonth: 1190,
    savedYear: 4350,
    isPremium: false,
    subscriptions: [
    { id: 1, name: "Иви (триал)", price: 399, card_name: "Т-Банк *4821", next_payment_date: "2026-11-18", is_trial: true, trial_hours_left: 28, is_zombie: false, cancel_deeplink: "https://www.ivi.ru/profile/subscriptions", icon_code: "И", color_hex: "#EF4444" },
    { id: 2, name: "Яндекс Плюс", price: 399, card_name: "Сбер *9012", next_payment_date: "2026-11-20", is_trial: false, is_zombie: false, cancel_deeplink: "https://plus.yandex.ru/my", icon_code: "Я", color_hex: "#EF4444" },
    { id: 3, name: "Telegram Premium", price: 299, card_name: "Т-Банк *4821", next_payment_date: "2026-11-25", is_trial: false, is_zombie: false, cancel_deeplink: "https://t.me/PremiumBot", icon_code: "TG", color_hex: "#38BDF8" },
    { id: 4, name: "ВК Музыка", price: 199, card_name: "Альфа *1104", next_payment_date: "2026-11-28", is_trial: false, is_zombie: true, cancel_deeplink: "https://id.vk.com/account/#/services", icon_code: "VK", color_hex: "#2563EB" },
    { id: 5, name: "МТС Premium + Облако", price: 590, card_name: "Сбер *9012", next_payment_date: "2026-11-30", is_trial: false, is_zombie: false, cancel_deeplink: "https://premium.mts.ru/", icon_code: "МТС", color_hex: "#E11D48" }
    ]
};

function showToast(msg, linkUrl = null) {
    const box = document.getElementById("toastBox");
    const txt = document.getElementById("toastText");
    const lnk = document.getElementById("toastLink");
    txt.innerText = msg;
    if (linkUrl) {
    lnk.href = linkUrl;
    lnk.style.display = "inline";
    } else {
    lnk.style.display = "none";
    }
    box.classList.add("show");
    setTimeout(() => box.classList.remove("show"), 4200);
}

function switchTab(screenId, navIndex) {
    document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
    document.getElementById(screenId).classList.add("active");
    document.getElementById("bottomNav").style.display = "flex";

    const navItems = document.querySelectorAll(".nav-item");
    navItems.forEach((btn, idx) => {
    btn.classList.toggle("active", idx === navIndex);
    });
    refreshData();
}

function openAuthScreen(screenId) {
    document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
    document.getElementById(screenId).classList.add("active");
    document.getElementById("bottomNav").style.display = "none";
}

function toggleRingView() {
    const rb = document.getElementById("ringBlock");
    rb.style.display = rb.style.display === "none" ? "flex" : "none";
}

async function refreshData() {
    const badge = document.getElementById("apiBadge");
    const statusTxt = document.getElementById("apiStatusText");
    try {
    const res = await fetch(`${API_BASE}/api/dashboard`);
    if (!res.ok) throw new Error("Server offline");
    const data = await res.json();
    isBackendOnline = true;
    badge.classList.remove("offline");
    statusTxt.innerText = "Подключено к Python FastAPI (127.0.0.1:8000)";
    renderDashboard(data.monthly_total_rub, data.yearly_forecast_rub, data.saved_this_month_rub, data.saved_this_year_rub, data.subscriptions);
    } catch (e) {
    isBackendOnline = false;
    badge.classList.add("offline");
    statusTxt.innerText = "Автономный демо-режим (сервер не запущен)";
    const monthly = localState.subscriptions.reduce((acc, s) => acc + s.price, 0);
    renderDashboard(monthly, monthly * 12, localState.savedMonth, localState.savedYear, localState.subscriptions);
    }
}

function renderDashboard(monthly, yearly, savedMonth, savedYear, subs) {
    document.getElementById("monthlyTotalText").innerText = `${monthly.toLocaleString("ru-RU")} ₽`;
    document.getElementById("yearlyForecastText").innerText = `Прогноз на год: ${yearly.toLocaleString("ru-RU")} ₽`;
    document.getElementById("savedMonthText").innerText = `+${savedMonth.toLocaleString("ru-RU")} ₽`;
    document.getElementById("ringSavedVal").innerText = `+${savedMonth.toLocaleString("ru-RU")} ₽`;
    document.getElementById("profileSavedYear").innerText = `✓ Спасено за год: ${savedYear.toLocaleString("ru-RU")} ₽`;
    document.getElementById("subsCountTitle").innerText = `Единый список подписок (${subs.length})`;
    document.getElementById("calendarTotalText").innerText = `${monthly.toLocaleString("ru-RU")} ₽`;

    // 1. Рендер горящего триала
    const trialBox = document.getElementById("urgentTrialContainer");
    const urgent = subs.find(s => s.is_trial);
    if (urgent) {
    trialBox.innerHTML = `
        <div class="trial-alert-card">
        <div>
            <div class="trial-info">▲ ${urgent.name} • ${urgent.trial_hours_left || 28} ч осталось</div>
            <div class="trial-sub">${urgent.card_name} • Списание ${urgent.price} ₽</div>
        </div>
        <button class="cancel-btn-red" onclick="cancelSubscription(${urgent.id})">Отмена</button>
        </div>
    `;
    } else {
    trialBox.innerHTML = "";
    }

    // 2. Рендер единого списка подписок
    const listEl = document.getElementById("subscriptionsList");
    listEl.innerHTML = subs.map(s => `
    <div class="sub-item">
        <div class="sub-left">
        <div class="sub-icon" style="background: ${s.color_hex || '#2563EB'};">${s.icon_code || 'SC'}</div>
        <div>
            <div class="sub-name">${s.name}</div>
            <div class="sub-meta">${s.card_name} • до ${formatDateShort(s.next_payment_date)}</div>
        </div>
        </div>
        <div class="sub-right">
        <div class="sub-price">${s.price} ₽</div>
        <button class="sub-action-link ${s.is_trial || s.is_zombie ? 'danger' : ''}" onclick="cancelSubscription(${s.id})">
            ${s.is_trial ? 'Отменить триал ↗' : (s.is_zombie ? 'Зомби • Отвязать ↗' : 'Отключить')}
        </button>
        </div>
    </div>
    `).join("");

    // 3. Рендер таймлайна календаря
    const calEl = document.getElementById("calendarTimeline");
    calEl.innerHTML = subs.map(s => `
    <div class="timeline-node">
        <div class="node-dot ${s.is_trial ? 'trial' : ''}"></div>
        <div>
        <div class="node-title">${s.name}</div>
        <div class="node-date">${formatDateRus(s.next_payment_date)} • ${s.card_name}</div>
        </div>
        <div class="node-price ${s.is_trial ? 'trial' : ''}">- ${s.price} ₽</div>
    </div>
    `).join("");
}

function formatDateRus(iso) {
    const parts = iso.split("-");
    return parts.length === 3 ? `${parts[2]}.${parts[1]}.${parts[0]}` : iso;
}

function formatDateShort(iso) {
    const parts = iso.split("-");
    return parts.length === 3 ? `${parts[2]}.${parts[1]}` : iso;
}

async function cancelSubscription(subId) {
    if (isBackendOnline) {
    const res = await fetch(`${API_BASE}/api/subscriptions/${subId}/cancel`, { method: "POST" });
    if (res.ok) {
        const data = await res.json();
        showToast(data.message, data.redirect_deeplink);
        refreshData();
        return;
    }
    }
    // Локальный режим
    const idx = localState.subscriptions.findIndex(s => s.id === subId);
    if (idx !== -1) {
    const removed = localState.subscriptions.splice(idx, 1)[0];
    localState.savedMonth += removed.price;
    localState.savedYear += removed.price;
    showToast(`«${removed.name}» отключена! Сберегли +${removed.price} ₽`, removed.cancel_deeplink);
    refreshData();
    }
}

async function addFromTemplate(tplId) {
    if (isBackendOnline) {
    const res = await fetch(`${API_BASE}/api/subscriptions/from-template/${tplId}`, { method: "POST" });
    if (res.ok) {
        const data = await res.json();
        showToast(data.message);
        switchTab('screen-home', 0);
        return;
    }
    }
    const catalog = {
    1: { name: "Яндекс Плюс", price: 399, icon_code: "Я", color_hex: "#EF4444", cancel_deeplink: "https://plus.yandex.ru/my" },
    2: { name: "Telegram Premium", price: 299, icon_code: "TG", color_hex: "#38BDF8", cancel_deeplink: "https://t.me/PremiumBot" },
    3: { name: "ВК Музыка (Студ.)", price: 99, icon_code: "VK", color_hex: "#00E676", cancel_deeplink: "https://id.vk.com/account/#/services" },
    4: { name: "СберПрайм Молодёжный", price: 149, icon_code: "СБ", color_hex: "#00E676", cancel_deeplink: "https://www.sberbank.com/sberprime" },
    5: { name: "Кинотеатр Иви", price: 399, icon_code: "И", color_hex: "#E11D48", cancel_deeplink: "https://www.ivi.ru/profile/subscriptions" },
    6: { name: "МТС Premium + KION", price: 249, icon_code: "МТС", color_hex: "#E11D48", cancel_deeplink: "https://premium.mts.ru/" }
    };
    const item = catalog[tplId] || catalog[1];
    localState.subscriptions.push({
    id: Date.now(),
    name: item.name,
    price: item.price,
    card_name: "Сбер *9012",
    next_payment_date: "2026-11-29",
    is_trial: false,
    is_zombie: false,
    cancel_deeplink: item.cancel_deeplink,
    icon_code: item.icon_code,
    color_hex: item.color_hex
    });
    showToast(`Подписка «${item.name}» добавлена в 1 клик!`);
    switchTab('screen-home', 0);
}

function fillDemoSMS() {
    document.getElementById("smsInput").value = "СберБанк: Списание 1р Карта *9012 IVI TRIAL. Пробный период 7 дней.";
}

async function handleParseSMS() {
    const text = document.getElementById("smsInput").value.trim();
    if (!text) {
    fillDemoSMS();
    return;
    }
    if (isBackendOnline) {
    const res = await fetch(`${API_BASE}/api/subscriptions/parse-sms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sms_text: text })
    });
    if (res.ok) {
        const data = await res.json();
        showToast(`Распознано из СМС: ${data.parsed_data.service_name} (${data.parsed_data.price_rub} ₽)`);
        document.getElementById("smsInput").value = "";
        switchTab('screen-home', 0);
        return;
    }
    }
    // Локальный парсер
    localState.subscriptions.unshift({
    id: Date.now(),
    name: "Иви (из СМС)",
    price: 399,
    card_name: "Сбер *9012",
    next_payment_date: "2026-11-24",
    is_trial: true,
    trial_hours_left: 72,
    is_zombie: false,
    cancel_deeplink: "https://www.ivi.ru/profile/subscriptions",
    icon_code: "И",
    color_hex: "#E11D48"
    });
    showToast("Распознано из СМС: Иви Триал (399 ₽)");
    document.getElementById("smsInput").value = "";
    switchTab('screen-home', 0);
}

function promptCustomSub() {
    const name = prompt("Название сервиса или подписки:", "ChatGPT Plus / VPN");
    if (!name) return;
    const price = parseInt(prompt("Стоимость в месяц (₽):", "490") || "490", 10);
    localState.subscriptions.push({
    id: Date.now(),
    name,
    price: isNaN(price) ? 490 : price,
    card_name: "Т-Банк *4821",
    next_payment_date: "2026-11-30",
    is_trial: false,
    is_zombie: false,
    cancel_deeplink: "https://subcontrol.ru",
    icon_code: name.slice(0, 2).toUpperCase(),
    color_hex: "#059669"
    });
    showToast(`Подписка «${name}» добавлена!`);
    switchTab('screen-home', 0);
}

function handleLogin() {
    showToast("Добро пожаловать в SubControl, Ольга!");
    switchTab('screen-home', 0);
}

function handleRegister() {
    showToast("Аккаунт создан! Защита бюджета включена.");
    switchTab('screen-home', 0);
}

function toggleSwitch(el) {
    el.classList.toggle("on");
    showToast("Настройки уведомлений сохранены");
}

async function upgradePremium() {
    if (isBackendOnline) {
    await fetch(`${API_BASE}/api/profile/upgrade-premium`, { method: "POST" });
    }
    const btn = document.getElementById("premiumBtn");
    btn.innerText = "✓ Тариф «Без рекламы» активен";
    btn.style.background = "#00E676";
    showToast("Реклама успешно отключена!");
}

// Запуск при открытии
refreshData();