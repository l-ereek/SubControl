const API_BASE = "http://127.0.0.1:8000";
const STORAGE_KEY = "subcontrol_state_v3";
const TODAY_ISO = "2026-11-18"; // Сегодня: 18 ноября 2026

let isBackendOnline = false;

const MONTH_NAMES = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"
];

const MONTH_GENITIVE = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря"
];

const MONTH_PREP = [
  "январе", "феврале", "марте", "апреле", "мае", "июне",
  "июле", "августе", "сентябре", "октябре", "ноябре", "декабре"
];

const DEFAULT_STATE = {
  savedMonth: 5886,
  savedYear: 4350,
  isPremium: false,
  cards: [
    { id: "c-1", bank: "Сбер", last4: "9012", note: "Основная" },
    { id: "c-2", bank: "Т-Банк", last4: "4821", note: "Для подписок" },
    { id: "c-3", bank: "Альфа", last4: "1104", note: "Запасная" }
  ],
  subscriptions: [
    { id: 1, name: "ВК Музыка", price: 199, card_name: "Альфа *1104", next_payment_date: "2026-11-17", billing_day: 17, is_trial: false, is_zombie: true, cancel_deeplink: "https://id.vk.com/account/#/services", icon_code: "VK", color_hex: "#2563EB" },
    { id: 2, name: "ИВИ Trial", price: 399, card_name: "Т-Банк *4821", next_payment_date: "2026-11-18", billing_day: 18, is_trial: true, trial_hours_left: 28, is_zombie: false, cancel_deeplink: "https://www.ivi.ru/profile/subscriptions", icon_code: "И", color_hex: "#EF4444" },
    { id: 3, name: "МТС Premium", price: 590, card_name: "Сбер *9012", next_payment_date: "2026-11-19", billing_day: 19, is_trial: false, is_zombie: false, cancel_deeplink: "https://premium.mts.ru/", icon_code: "МТС", color_hex: "#E11D48" },
    { id: 4, name: "Telegram Premium", price: 299, card_name: "Т-Банк *4821", next_payment_date: "2026-11-21", billing_day: 21, is_trial: false, is_zombie: false, cancel_deeplink: "https://t.me/PremiumBot", icon_code: "TG", color_hex: "#38BDF8" },
    { id: 5, name: "Яндекс Плюс", price: 399, card_name: "Сбер *9012", next_payment_date: "2026-11-25", billing_day: 25, is_trial: false, is_zombie: false, cancel_deeplink: "https://plus.yandex.ru/my", icon_code: "Я", color_hex: "#EF4444" }
  ],
  history: [
    { id: "h-nov-17", name: "ВК Музыка", price: 199, card_name: "Альфа *1104", date: "2026-11-17", status: "paid" },
    { id: "h-oct-17", name: "ВК Музыка", price: 199, card_name: "Альфа *1104", date: "2026-10-17", status: "paid" },
    { id: "h-oct-19", name: "МТС Premium", price: 590, card_name: "Сбер *9012", date: "2026-10-19", status: "paid" },
    { id: "h-oct-21", name: "Telegram Premium", price: 299, card_name: "Т-Банк *4821", date: "2026-10-21", status: "paid" },
    { id: "h-oct-25", name: "Яндекс Плюс", price: 399, card_name: "Сбер *9012", date: "2026-10-25", status: "paid" },
    { id: "h-sep-17", name: "ВК Музыка", price: 199, card_name: "Альфа *1104", date: "2026-09-17", status: "paid" },
    { id: "h-sep-19", name: "МТС Premium", price: 590, card_name: "Сбер *9012", date: "2026-09-19", status: "paid" },
    { id: "h-sep-25", name: "Яндекс Плюс", price: 399, card_name: "Сбер *9012", date: "2026-09-25", status: "paid" }
  ]
};

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.subscriptions) && Array.isArray(parsed.history)) {
        if (!Array.isArray(parsed.cards))
            parsed.cards = JSON.parse(JSON.stringify(DEFAULT_STATE.cards));
        return parsed;
      }
    }
  } catch (e) {}
  return JSON.parse(JSON.stringify(DEFAULT_STATE));
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(localState));
  } catch (e) {}
}

let localState = loadState();
let selectedDateIso = TODAY_ISO;
let viewYear = 2026;
let viewMonth = 10; // 0-indexed: 10 = Ноябрь
let modalYear = 2026;

const COL_W = 48;
const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;

function hapticImpact() {
  if (tg && tg.HapticFeedback) {
    try { tg.HapticFeedback.impactOccurred("light"); } catch (e) {}
  }
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function makeIso(year, monthIdx, day) {
  return `${year}-${pad2(monthIdx + 1)}-${pad2(day)}`;
}

function parseIso(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return { year: y, monthIdx: m - 1, day: d };
}

function daysInMonth(year, monthIdx) {
  return new Date(year, monthIdx + 1, 0).getDate();
}

function getBillingDay(sub) {
  if (sub.billing_day) return sub.billing_day;
  if (sub.next_payment_date) {
    const parts = sub.next_payment_date.split("-");
    if (parts.length === 3) return parseInt(parts[2], 10) || 18;
  }
  return 18;
}

function showToast(msg, linkUrl = null) {
  const box = document.getElementById("toastBox");
  const txt = document.getElementById("toastText");
  const lnk = document.getElementById("toastLink");
  if (!box || !txt) return;

  txt.innerText = msg;
  if (lnk) {
    if (linkUrl) {
      lnk.href = linkUrl;
      lnk.style.display = "inline";
    } else {
      lnk.style.display = "none";
    }
  }
  box.classList.add("show");
  setTimeout(() => box.classList.remove("show"), 4200);
}

function switchTab(screenId, navIndex) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  const target = document.getElementById(screenId);
  if (target) target.classList.add("active");

  const nav = document.getElementById("bottomNav");
  if (nav) nav.style.display = "flex";

  document.querySelectorAll(".nav-item").forEach((btn, idx) => {
    btn.classList.toggle("active", idx === navIndex);
  });

  hapticImpact();
  refreshData();

  if (screenId === "screen-calendar") {
    requestAnimationFrame(() => scrollRibbonToDate(selectedDateIso, false));
  }
}

function openAuthScreen(screenId) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  const target = document.getElementById(screenId);
  if (target) target.classList.add("active");

  const nav = document.getElementById("bottomNav");
  if (nav) nav.style.display = "none";
}

/* ==========================================================
   КАЛЕНДАРЬ: события месяца, лента дат, ветки и окно года
   ========================================================== */
function getEventsForMonth(year, monthIdx) {
  const maxDay = daysInMonth(year, monthIdx);
  const events = [];
  const seenKeys = new Set();
  const prefix = `${year}-${pad2(monthIdx + 1)}-`;

  (localState.history || []).forEach(h => {
    if (h.date && h.date.startsWith(prefix)) {
      const key = `${h.date}|${h.name}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        events.push({
          id: h.id,
          name: h.name,
          price: h.price,
          card_name: h.card_name || "Карта",
          date: h.date,
          is_past: h.date < TODAY_ISO,
          is_trial: false
        });
      }
    }
  });

  (localState.subscriptions || []).forEach(sub => {
    const day = Math.min(getBillingDay(sub), maxDay);
    const iso = makeIso(year, monthIdx, day);
    const key = `${iso}|${sub.name}`;

    if (iso >= TODAY_ISO && !seenKeys.has(key)) {
      seenKeys.add(key);
      events.push({
        id: sub.id,
        name: sub.name,
        price: sub.price,
        card_name: sub.card_name || "Карта",
        date: iso,
        is_past: false,
        is_trial: Boolean(sub.is_trial) && iso === sub.next_payment_date
      });
    }
  });

  events.sort((a, b) => a.date.localeCompare(b.date));
  return events;
}

function renderCalendarScreen(shouldCenterScroll = false) {
  const stripEl = document.getElementById("calendarStrip");
  const svgEl = document.getElementById("calendarBranchSvg");
  const trackEl = document.getElementById("calendarRibbonTrack");
  const monthLbl = document.getElementById("calendarMonthLabel");
  const listTitleEl = document.getElementById("calendarListTitle");
  const totalEl = document.getElementById("calendarTotalText");
  const bannerEl = document.getElementById("selectedDayBanner");
  const timelineEl = document.getElementById("calendarTimeline");
  const timelineLineEl = document.getElementById("calendarTimelineLine");
  const todayBtn = document.getElementById("calTodayBtn");

  if (!stripEl || !svgEl || !trackEl) return;

  const totalDays = daysInMonth(viewYear, viewMonth);
  const events = getEventsForMonth(viewYear, viewMonth);
  const hasActiveSubscriptions = Boolean(localState.subscriptions && localState.subscriptions.length > 0);
  const hasAnyEvents = events.length > 0;

  const eventsByDay = {};
  events.forEach(ev => {
    const d = parseIso(ev.date).day;
    if (!eventsByDay[d]) eventsByDay[d] = [];
    eventsByDay[d].push(ev);
  });

  if (monthLbl) monthLbl.innerText = `${MONTH_NAMES[viewMonth]} ${viewYear}`;
  if (todayBtn) {
    const todayParts = parseIso(TODAY_ISO);
    todayBtn.innerText = `Сегодня • ${todayParts.day}`;
    todayBtn.style.opacity = selectedDateIso === TODAY_ISO ? "0.55" : "1";
  }

  const totalWidth = totalDays * COL_W;
  trackEl.style.width = `${totalWidth}px`;

  let stripHtml = "";
  for (let d = 1; d <= totalDays; d++) {
    const iso = makeIso(viewYear, viewMonth, d);
    const isSelected = iso === selectedDateIso;
    const isToday = iso === TODAY_ISO;
    const isPastSelected = isSelected && iso < TODAY_ISO;
    const cls = [
      "date-num",
      isSelected ? "active" : "",
      isToday ? "is-today" : "",
      isPastSelected ? "past-selected" : ""
    ].filter(Boolean).join(" ");

    stripHtml += `
      <div class="date-cell">
        <div class="${cls}" data-iso="${iso}" onclick="selectCalendarDate('${iso}')">${d}</div>
      </div>
    `;
  }
  stripEl.innerHTML = stripHtml;

  const yBase = 42;
  const selParts = parseIso(selectedDateIso);
  const selDayInView = (selParts.year === viewYear && selParts.monthIdx === viewMonth) ? selParts.day : null;
  const selX = selDayInView ? (selDayInView - 1) * COL_W + COL_W / 2 : null;

  svgEl.setAttribute("width", totalWidth);
  svgEl.setAttribute("height", 52);
  svgEl.setAttribute("viewBox", `0 0 ${totalWidth} 52`);

  if (!hasActiveSubscriptions && !hasAnyEvents) {
    svgEl.innerHTML = `<line x1="0" y1="${yBase}" x2="${totalWidth}" y2="${yBase}" stroke="#1E2738" stroke-width="1.2"/>`;
  } else {
    const greenPaths = [];
    const redPaths = [];
    const paymentDays = Object.keys(eventsByDay).map(Number).sort((a, b) => a - b);
    const nearbyFutureDays = selDayInView
      ? paymentDays.filter(d => {
          const iso = makeIso(viewYear, viewMonth, d);
          return iso >= TODAY_ISO && d > selDayInView && (d - selDayInView) <= 4;
        }).slice(0, 2)
      : [];

    paymentDays.forEach(d => {
      const iso = makeIso(viewYear, viewMonth, d);
      const x = (d - 1) * COL_W + COL_W / 2;
      const isPast = iso < TODAY_ISO;

      if (isPast) {
        const topY = (d === selDayInView) ? 0 : 4;
        redPaths.push(`<path d="M ${x} ${topY} V ${yBase - 8} Q ${x} ${yBase} ${x + 8} ${yBase}" stroke-width="2.2"/>`);
      } else {
        const nearIdx = nearbyFutureDays.indexOf(d);
        if (d === selDayInView) {
          greenPaths.push(`<path d="M ${x - 8} ${yBase} Q ${x} ${yBase} ${x} ${yBase - 8} V 0" stroke-width="2.3"/>`);
        } else if (nearIdx !== -1 && selX !== null) {
          const stemX = selX + 7 + nearIdx * 6;
          const levelY = 18 + nearIdx * 9;
          greenPaths.push(
            `<path d="M ${x} 4 V ${levelY - 7} Q ${x} ${levelY} ${x - 7} ${levelY} H ${stemX + 6} Q ${stemX} ${levelY} ${stemX} ${levelY + 6} V ${yBase}" stroke-width="2"/>`
          );
        } else {
          const dir = (selX !== null && x < selX) ? 1 : -1;
          greenPaths.push(`<path d="M ${x} 4 V ${yBase - 8} Q ${x} ${yBase} ${x + dir * 8} ${yBase}" stroke-width="2"/>`);
        }
      }
    });

    svgEl.innerHTML = `
      <defs>
        <filter id="calGreenGlow" x="-5%" y="-30%" width="110%" height="180%">
          <feGaussianBlur stdDeviation="2.1" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <filter id="calRedGlow" x="-20%" y="-30%" width="140%" height="180%">
          <feGaussianBlur stdDeviation="2.1" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      ${hasActiveSubscriptions
        ? `<line x1="0" y1="${yBase}" x2="${totalWidth}" y2="${yBase}" stroke="#38F28A" stroke-width="2.2" filter="url(#calGreenGlow)"/>`
        : `<line x1="0" y1="${yBase}" x2="${totalWidth}" y2="${yBase}" stroke="#1E2738" stroke-width="1.2"/>`}
      <g filter="url(#calGreenGlow)" stroke="#38F28A" stroke-linecap="round" stroke-linejoin="round" fill="none">
        ${greenPaths.join("")}
      </g>
      <g filter="url(#calRedGlow)" stroke="#EF4444" stroke-linecap="round" stroke-linejoin="round" fill="none">
        ${redPaths.join("")}
      </g>
    `;
  }

  if (bannerEl) {
    const selEvents = selDayInView ? (eventsByDay[selDayInView] || []) : [];
    const dateLabel = `${selParts.day} ${MONTH_GENITIVE[selParts.monthIdx]} ${selParts.year}`;
    const badgeText = selectedDateIso < TODAY_ISO
      ? "Прошедшая дата"
      : (selectedDateIso === TODAY_ISO ? "Сегодня" : "Запланировано");
    const badgeClass = selectedDateIso < TODAY_ISO
      ? "past"
      : (selectedDateIso === TODAY_ISO ? "today" : "future");

    const bodyHtml = selEvents.length
      ? selEvents.map(ev => `
          <div class="sdb-item">
            <span>${ev.name}</span>
            <span style="color: ${ev.is_past ? '#F87171' : '#38F28A'};">- ${ev.price} ₽</span>
          </div>
        `).join("")
      : `<div class="sdb-empty">На эту дату списаний нет</div>`;

    bannerEl.innerHTML = `
      <div class="sdb-head">
        <span>${dateLabel}</span>
        <span class="sdb-badge ${badgeClass}">${badgeText}</span>
      </div>
      ${bodyHtml}
    `;
  }

  const monthSum = events.reduce((acc, ev) => acc + ev.price, 0);
  const currentMonthKey = TODAY_ISO.slice(0, 7);
  const viewedMonthKey = `${viewYear}-${pad2(viewMonth + 1)}`;

  if (listTitleEl) {
    if (viewedMonthKey < currentMonthKey) {
      listTitleEl.innerText = `История за ${MONTH_NAMES[viewMonth].toLowerCase()}`;
    } else if (viewedMonthKey > currentMonthKey) {
      listTitleEl.innerText = `План на ${MONTH_NAMES[viewMonth].toLowerCase()}`;
    } else {
      listTitleEl.innerText = `Списания в ${MONTH_PREP[viewMonth]}`;
    }
  }
  if (totalEl) totalEl.innerText = `${monthSum.toLocaleString("ru-RU")} ₽`;

  if (timelineEl) {
    if (!events.length) {
      if (timelineLineEl) timelineLineEl.style.display = "none";
      timelineEl.innerHTML = `<div class="timeline-empty-state">В этом месяце нет списаний</div>`;
    } else {
      if (timelineLineEl) timelineLineEl.style.display = "block";
      timelineEl.innerHTML = events.map(ev => {
        const isSel = ev.date === selectedDateIso;
        const rowCls = ["timeline-node", ev.is_past ? "is-past" : "", isSel ? "is-selected" : ""].filter(Boolean).join(" ");
        const dotCls = ["node-dot", ev.is_trial || ev.is_past ? "trial" : ""].filter(Boolean).join(" ");
        const statusTxt = ev.is_past ? "Оплачено" : (ev.date === TODAY_ISO ? "Сегодня" : ev.card_name);

        return `
          <div class="${rowCls}" onclick="selectCalendarDate('${ev.date}')" style="cursor:pointer;">
            <div class="${dotCls}"></div>
            <div>
              <div class="node-title">${ev.name}</div>
              <div class="node-date">${formatDateRus(ev.date)} • ${statusTxt}</div>
            </div>
            <div class="node-price ${ev.is_trial ? 'trial' : ''}">- ${ev.price} ₽</div>
          </div>
        `;
      }).join("");
    }
  }

  if (shouldCenterScroll) {
    requestAnimationFrame(() => scrollRibbonToDate(selectedDateIso, true));
  }
}

function scrollRibbonToDate(iso, smooth = true) {
  const viewport = document.getElementById("calendarScrollViewport");
  if (!viewport) return;
  const { year, monthIdx, day } = parseIso(iso);
  if (year !== viewYear || monthIdx !== viewMonth) return;

  const targetCenter = (day - 1) * COL_W + COL_W / 2;
  const desiredLeft = Math.max(0, targetCenter - viewport.clientWidth / 2);
  viewport.scrollTo({ left: desiredLeft, behavior: smooth ? "smooth" : "auto" });
}

function selectCalendarDate(iso) {
  const { year, monthIdx } = parseIso(iso);
  const changedMonth = (year !== viewYear || monthIdx !== viewMonth);
  selectedDateIso = iso;
  viewYear = year;
  viewMonth = monthIdx;
  hapticImpact();
  renderCalendarScreen(changedMonth);
  if (!changedMonth) {
    scrollRibbonToDate(iso, true);
  }
}

function jumpToToday(fromModal = false) {
  const t = parseIso(TODAY_ISO);
  selectedDateIso = TODAY_ISO;
  viewYear = t.year;
  viewMonth = t.monthIdx;
  modalYear = t.year;
  if (fromModal) closeYearCalendarModal();
  renderCalendarScreen(true);
  hapticImpact();
}

function openYearCalendarModal() {
  const modal = document.getElementById("yearCalendarModal");
  if (!modal) return;
  modalYear = viewYear;
  renderYearCalendarModal();
  modal.classList.add("open");
  hapticImpact();

  requestAnimationFrame(() => {
    const targetMonthBlock = document.getElementById(`tg-month-${modalYear}-${viewMonth}`);
    if (targetMonthBlock) {
      targetMonthBlock.scrollIntoView({ block: "start", behavior: "auto" });
    }
  });
}

function closeYearCalendarModal() {
  const modal = document.getElementById("yearCalendarModal");
  if (modal) modal.classList.remove("open");
}

function shiftModalYear(delta) {
  modalYear += delta;
  renderYearCalendarModal();
  hapticImpact();
}

function renderYearCalendarModal() {
  const yearTxt = document.getElementById("tgModalYearText");
  const container = document.getElementById("tgMonthsContainer");
  if (!container) return;
  if (yearTxt) yearTxt.innerText = String(modalYear);

  let html = "";
  for (let m = 0; m < 12; m++) {
    const events = getEventsForMonth(modalYear, m);
    const eventsByDay = {};
    let mSum = 0;
    events.forEach(ev => {
      const d = parseIso(ev.date).day;
      if (!eventsByDay[d]) eventsByDay[d] = [];
      eventsByDay[d].push(ev);
      mSum += ev.price;
    });

    const firstWeekday = (new Date(modalYear, m, 1).getDay() + 6) % 7;
    const totalDays = daysInMonth(modalYear, m);
    const isPastMonth = `${modalYear}-${pad2(m + 1)}` < TODAY_ISO.slice(0, 7);

    let cells = "<div></div>".repeat(firstWeekday);
    for (let d = 1; d <= totalDays; d++) {
      const iso = makeIso(modalYear, m, d);
      const dayEvents = eventsByDay[d] || [];
      const btnCls = [
        "tg-day-btn",
        iso === TODAY_ISO ? "is-today" : "",
        iso === selectedDateIso ? "is-selected" : "",
        (iso === selectedDateIso && iso < TODAY_ISO) ? "is-past-sel" : ""
      ].filter(Boolean).join(" ");

      let dotsHtml = "";
      if (dayEvents.some(e => e.is_past)) dotsHtml += `<span class="tg-dot red"></span>`;
      if (dayEvents.some(e => !e.is_past)) dotsHtml += `<span class="tg-dot green"></span>`;

      cells += `
        <button class="${btnCls}" onclick="pickDateFromModal('${iso}')">
          <span>${d}</span>
          <span class="tg-day-dots">${dotsHtml}</span>
        </button>
      `;
    }

    const sumHtml = mSum > 0
      ? `<span class="tg-month-sum ${isPastMonth ? 'past' : ''}">${mSum.toLocaleString("ru-RU")} ₽</span>`
      : "";

    html += `
      <div class="tg-month-block" id="tg-month-${modalYear}-${m}">
        <div class="tg-month-name">
          <span>${MONTH_NAMES[m]} ${modalYear}</span>
          ${sumHtml}
        </div>
        <div class="tg-days-grid">${cells}</div>
      </div>
    `;
  }
  container.innerHTML = html;
}

function pickDateFromModal(iso) {
  const { year, monthIdx } = parseIso(iso);
  selectedDateIso = iso;
  viewYear = year;
  viewMonth = monthIdx;
  closeYearCalendarModal();
  renderCalendarScreen(true);
  hapticImpact();
}

function setupCalendarScrollInteractions() {
  const vp = document.getElementById("calendarScrollViewport");
  if (!vp) return;

  vp.addEventListener("wheel", (e) => {
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      e.preventDefault();
      vp.scrollLeft += e.deltaY;
    }
  }, { passive: false });

  let isDown = false;
  let startX = 0;
  let startScrollLeft = 0;

  vp.addEventListener("mousedown", (e) => {
    isDown = true;
    startX = e.pageX - vp.offsetLeft;
    startScrollLeft = vp.scrollLeft;
  });
  window.addEventListener("mouseup", () => { isDown = false; });
  vp.addEventListener("mousemove", (e) => {
    if (!isDown) return;
    const x = e.pageX - vp.offsetLeft;
    vp.scrollLeft = startScrollLeft - (x - startX);
  });
}

/* ==========================================================
   ПРОФИЛЬ: слайдеры
   ========================================================== */
function updateSliderUI(input, labelId, suffix, formatNum = false) {
  if (!input) return;
  const min = parseFloat(input.min);
  const max = parseFloat(input.max);
  const val = parseFloat(input.value);
  const pct = ((val - min) / (max - min)) * 100;

  input.style.background = `linear-gradient(90deg, #6EE7B7 ${pct}%, #263040 ${pct}%)`;

  const lbl = document.getElementById(labelId);
  if (lbl) {
    const shownVal = formatNum ? val.toLocaleString("ru-RU") : val;
    lbl.innerText = `${shownVal}${suffix}`;
  }
}

/* ==========================================================
   ЗАГРУЗКА И РЕНДЕР ДАННЫХ
   ========================================================== */
async function refreshData() {
  const badge = document.getElementById("apiBadge");
  const statusTxt = document.getElementById("apiStatusText");

  try {
    const res = await fetch(`${API_BASE}/api/dashboard`);
    if (!res.ok) throw new Error("Server offline");
    const data = await res.json();

    isBackendOnline = true;
    if (badge) badge.classList.remove("offline");
    if (statusTxt) statusTxt.innerText = "Подключено к Python FastAPI (127.0.0.1:8000)";

    localState.subscriptions = data.subscriptions.map(s => ({
      ...s,
      billing_day: getBillingDay(s)
    }));
    renderDashboard(
      data.monthly_total_rub,
      data.yearly_forecast_rub,
      data.saved_this_month_rub,
      data.saved_this_year_rub,
      localState.subscriptions
    );
  } catch (e) {
    isBackendOnline = false;
    if (badge) badge.classList.add("offline");
    if (statusTxt) statusTxt.innerText = "Автономный демо-режим (сервер не запущен)";

    const monthly = localState.subscriptions.reduce((acc, s) => acc + s.price, 0);
    renderDashboard(monthly, monthly * 12, localState.savedMonth, localState.savedYear, localState.subscriptions);
  }
}

function renderDashboard(monthly, yearly, savedMonth, savedYear, subs) {
  const setTxt = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.innerText = text;
  };

  setTxt("monthlyTotalText", `${monthly.toLocaleString("ru-RU")} ₽`);
  setTxt("yearlyForecastText", `Прогноз на год: ${yearly.toLocaleString("ru-RU")} ₽`);
  setTxt("ringSavedVal", `${savedMonth.toLocaleString("ru-RU")} ₽`);
  setTxt("profileSavedYear", `Спасено за год: ${savedYear.toLocaleString("ru-RU")} ₽`);
  setTxt("subsCountTitle", `Активные подписки (${subs.length})`);

  const arc = document.getElementById("ringProgressArc");
  if (arc) {
    const totalPool = Math.max(savedMonth + monthly, 1);
    const ratio = Math.min(Math.max(savedMonth / totalPool, 0.25), 0.92);
    const circumference = 603;
    arc.setAttribute("stroke-dashoffset", Math.round(circumference * (1 - ratio)));
  }

  const trialBox = document.getElementById("urgentTrialContainer");
  if (trialBox) {
    const urgent = subs.find(s => s.is_trial);
    if (urgent) {
      trialBox.innerHTML = `
        <div class="trial-alert-card">
          <div class="trial-left">
            <svg class="trial-tri-icon" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 3L2 20h20L12 3zm0 5.5c.6 0 1 .4 1 1v4c0 .6-.4 1-1 1s-1-.4-1-1v-4c0-.6.4-1 1-1zm0 9a1.2 1.2 0 1 1 0-2.4 1.2 1.2 0 0 1 0 2.4z"/>
            </svg>
            <div class="trial-info">${urgent.name} • ${urgent.trial_hours_left || 28} ч осталось</div>
          </div>
          <button class="cancel-btn-red" onclick="cancelSubscription(${urgent.id})">Отмена</button>
        </div>
      `;
    } else {
      trialBox.innerHTML = "";
    }
  }

  const listEl = document.getElementById("subscriptionsList");
  if (listEl) {
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
            ${s.is_trial ? 'Отменить триал' : (s.is_zombie ? 'Зомби • Отвязать' : 'Отключить')}
          </button>
        </div>
      </div>
    `).join("");
  }

  renderCalendarScreen(false);
}

function formatDateRus(iso) {
  const parts = iso.split("-");
  return parts.length === 3 ? `${parts[2]}.${parts[1]}.${parts[0]}` : iso;
}

function formatDateShort(iso) {
  const parts = iso.split("-");
  return parts.length === 3 ? `${parts[2]}.${parts[1]}` : iso;
}

/* ==========================================================
   ДЕЙСТВИЯ ПОЛЬЗОВАТЕЛЯ
   ========================================================== */
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
  const idx = localState.subscriptions.findIndex(s => s.id === subId);
  if (idx !== -1) {
    const removed = localState.subscriptions.splice(idx, 1)[0];
    localState.savedMonth += removed.price;
    localState.savedYear += removed.price;
    saveState();
    showToast(`«${removed.name}» отключена! Сберегли +${removed.price} ₽`, removed.cancel_deeplink);
    refreshData();
  }
}



function fillDemoSMS() {
  const input = document.getElementById("smsInput");
  if (input) input.value = "СберБанк: Списание 1р Карта *9012 IVI TRIAL. Пробный период 7 дней.";
}

async function handleParseSMS() {
  const input = document.getElementById("smsInput");
  if (!input) return;

  const text = input.value.trim();
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
      input.value = "";
      switchTab("screen-home", 0);
      return;
    }
  }

  localState.subscriptions.unshift({
    id: Date.now(),
    name: "ИВИ Trial (СМС)",
    price: 399,
    card_name: "Сбер *9012",
    next_payment_date: "2026-11-24",
    billing_day: 24,
    is_trial: true,
    trial_hours_left: 72,
    is_zombie: false,
    cancel_deeplink: "https://www.ivi.ru/profile/subscriptions",
    icon_code: "И",
    color_hex: "#EF4444"
  });
  saveState();
  showToast("Распознано из СМС: ИВИ Trial (399 ₽)");
  input.value = "";
  switchTab("screen-home", 0);
}

const TEMPLATE_CATALOG = {
  1: { name: "Яндекс Плюс", price: 399, icon_code: "Я", color_hex: "#EF4444", cancel_deeplink: "https://plus.yandex.ru/my" },
  2: { name: "Telegram Premium", price: 299, icon_code: "TG", color_hex: "#38BDF8", cancel_deeplink: "https://t.me/PremiumBot" },
  3: { name: "ВК Музыка", price: 99, icon_code: "VK", color_hex: "#2563EB", cancel_deeplink: "https://id.vk.com/account/#/services" },
  4: { name: "СберПрайм", price: 149, icon_code: "СБ", color_hex: "#00E676", cancel_deeplink: "https://www.sberbank.com/sberprime" },
  5: { name: "Иви", price: 399, icon_code: "ivi", color_hex: "#EA003D", cancel_deeplink: "https://www.ivi.ru/profile/subscriptions" },
  6: { name: "МТС Premium", price: 249, icon_code: "МТС", color_hex: "#E11D48", cancel_deeplink: "https://premium.mts.ru/" }
};

let activeTemplatePreset = null;
let selectedModalCard = getUserCardLabels()[0];

function addOneMonthIso(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const nextMonthIndex = m; // m уже 1..12, значит это следующий месяц (0-indexed)
  const targetYear = y + Math.floor(nextMonthIndex / 12);
  const targetMonth = nextMonthIndex % 12;
  const maxDay = daysInMonth(targetYear, targetMonth);
  return makeIso(targetYear, targetMonth, Math.min(d, maxDay));
}

function getUserCardLabels() {
  if (!Array.isArray(localState.cards) || !localState.cards.length) {
    return ["Без карты"];
  }
  return localState.cards.map(c => `${c.bank} *${c.last4}`);
}

function renderProfileCards() {
  const box = document.getElementById("profileCardsList");
  if (!box) return;

  const cards = Array.isArray(localState.cards) ? localState.cards : [];
  const cardsHtml = cards.map(c => {
    const label = `${c.bank} *${c.last4}`;
    const noteText = c.note ? `${label} — ${c.note}` : label;
    return `
      <div class="bank-pill" onclick="showToast('${noteText.replace(/'/g, "\\'")}')">
        <span>${label}</span>
        <button type="button" class="bank-pill-del" title="Удалить карту"
                onclick="event.stopPropagation(); deleteUserCard('${c.id}')">×</button>
      </div>
    `;
  }).join("");

  box.innerHTML = `<button type="button" class="bank-pill bank-pill-add" onclick="openCardModal()">+ Своя</button>${cardsHtml}`;
}

function openCardModal() {
  const modal = document.getElementById("cardFormModal");
  if (!modal) return;
  const bankInp = document.getElementById("cardBankInput");
  const last4Inp = document.getElementById("cardLast4Input");
  const noteInp = document.getElementById("cardNoteInput");
  if (bankInp) bankInp.value = "";
  if (last4Inp) last4Inp.value = "";
  if (noteInp) noteInp.value = "";
  modal.classList.add("open");
  hapticImpact();
}

function closeCardModal() {
  const modal = document.getElementById("cardFormModal");
  if (modal) modal.classList.remove("open");
}

function pickQuickBank(bankName) {
  const bankInp = document.getElementById("cardBankInput");
  if (bankInp) bankInp.value = bankName;
  hapticImpact();
}

function submitCardModal() {
  const bank = (document.getElementById("cardBankInput")?.value || "").trim();
  const last4 = (document.getElementById("cardLast4Input")?.value || "").replace(/\D/g, "");
  const note = (document.getElementById("cardNoteInput")?.value || "").trim();

  if (!bank) {
    showToast("Укажите название банка");
    return;
  }
  if (last4.length !== 4) {
    showToast("Введите последние 4 цифры карты");
    return;
  }

  if (!Array.isArray(localState.cards)) localState.cards = [];
  localState.cards.push({
    id: `c-${Date.now()}`,
    bank,
    last4,
    note
  });

  saveState();
  closeCardModal();
  renderProfileCards();
  showToast(`Карта ${bank} *${last4} добавлена`);
}

function deleteUserCard(cardId) {
  if (!Array.isArray(localState.cards)) return;
  const idx = localState.cards.findIndex(c => c.id === cardId);
  if (idx === -1) return;

  const removed = localState.cards.splice(idx, 1)[0];
  saveState();
  renderProfileCards();
  showToast(`Карта ${removed.bank} *${removed.last4} удалена`);
}

function renderModalCardPills() {
  const box = document.getElementById("subCardSelector");
  if (!box) return;
  const labels = getUserCardLabels();
  if (!labels.includes(selectedModalCard)) {
    selectedModalCard = labels[0];
  }
  box.innerHTML = labels.map(card => `
    <button type="button" class="sub-card-pill ${card === selectedModalCard ? 'active' : ''}"
            onclick="selectModalCard('${card}')">${card}</button>
  `).join("");
}

function selectModalCard(cardName) {
  selectedModalCard = cardName;
  renderModalCardPills();
  hapticImpact();
}

function syncBillingDateFromConnect() {
  const connectEl = document.getElementById("subConnectDate");
  const billingEl = document.getElementById("subBillingDate");
  if (connectEl && billingEl && connectEl.value) {
    billingEl.value = addOneMonthIso(connectEl.value);
  }
}

function openSubModal(tplId = null) {
  const modal = document.getElementById("subFormModal");
  if (!modal) return;

  const titleEl = document.getElementById("subModalTitle");
  const presetBox = document.getElementById("subPresetPreview");
  const customBox = document.getElementById("subCustomFields");
  const nameInp = document.getElementById("subNameInput");
  const priceInp = document.getElementById("subPriceInput");
  const linkInp = document.getElementById("subLinkInput");
  const connectInp = document.getElementById("subConnectDate");
  const billingInp = document.getElementById("subBillingDate");

  selectedModalCard = getUserCardLabels()[0];
  renderModalCardPills();

  if (connectInp) connectInp.value = TODAY_ISO;
  if (billingInp) billingInp.value = addOneMonthIso(TODAY_ISO);

  if (tplId && TEMPLATE_CATALOG[tplId]) {
    activeTemplatePreset = TEMPLATE_CATALOG[tplId];
    if (titleEl) titleEl.innerText = "Добавить подписку";
    if (presetBox) presetBox.style.display = "flex";
    if (customBox) customBox.style.display = "none";

    const pIcon = document.getElementById("subPresetIcon");
    const pName = document.getElementById("subPresetName");
    const pPrice = document.getElementById("subPresetPrice");
    if (pIcon) {
      pIcon.innerText = activeTemplatePreset.icon_code;
      pIcon.style.background = activeTemplatePreset.color_hex;
    }
    if (pName) pName.innerText = activeTemplatePreset.name;
    if (pPrice) pPrice.innerText = `${activeTemplatePreset.price} ₽ / мес`;
  } else {
    activeTemplatePreset = null;
    if (titleEl) titleEl.innerText = "Новая подписка";
    if (presetBox) presetBox.style.display = "none";
    if (customBox) customBox.style.display = "block";
    if (nameInp) nameInp.value = "";
    if (priceInp) priceInp.value = "";
    if (linkInp) linkInp.value = "";
  }

  modal.classList.add("open");
  hapticImpact();
}

function closeSubModal() {
  const modal = document.getElementById("subFormModal");
  if (modal) modal.classList.remove("open");
}

function submitSubModal() {
  const connectDate = (document.getElementById("subConnectDate")?.value || TODAY_ISO).trim();
  const billingDate = (document.getElementById("subBillingDate")?.value || addOneMonthIso(connectDate)).trim();
  const billingDay = parseIso(billingDate).day || 18;

  let name, price, link, iconCode, colorHex;

  if (activeTemplatePreset) {
    name = activeTemplatePreset.name;
    price = activeTemplatePreset.price;
    link = activeTemplatePreset.cancel_deeplink;
    iconCode = activeTemplatePreset.icon_code;
    colorHex = activeTemplatePreset.color_hex;
  } else {
    name = (document.getElementById("subNameInput")?.value || "").trim();
    price = parseInt(document.getElementById("subPriceInput")?.value || "0", 10);
    link = (document.getElementById("subLinkInput")?.value || "").trim() || "https://subcontrol.ru";

    if (!name) {
      showToast("Введите название подписки");
      return;
    }
    if (isNaN(price) || price <= 0) {
      showToast("Укажите стоимость в рублях");
      return;
    }
    iconCode = name.slice(0, 2).toUpperCase();
    colorHex = "#059669";
  }

  localState.subscriptions.push({
    id: Date.now(),
    name,
    price,
    card_name: selectedModalCard,
    connected_date: connectDate,
    next_payment_date: billingDate,
    billing_day: billingDay,
    is_trial: false,
    is_zombie: false,
    cancel_deeplink: link,
    icon_code: iconCode,
    color_hex: colorHex
  });

  saveState();
  closeSubModal();
  showToast(`Подписка «${name}» добавлена (${selectedModalCard})`);
  switchTab("screen-home", 0);
}

function handleLogin() {
  showToast("Добро пожаловать в SubControl, Ольга!");
  switchTab("screen-home", 0);
}

function handleRegister() {
  showToast("Аккаунт создан! Защита бюджета включена.");
  switchTab("screen-home", 0);
}

function toggleSwitch(el) {
  el.classList.toggle("on");
  hapticImpact();
  showToast("Настройки уведомлений сохранены");
}

async function upgradePremium() {
  if (isBackendOnline) {
    await fetch(`${API_BASE}/api/profile/upgrade-premium`, { method: "POST" });
  }
  const btn = document.getElementById("premiumBtn");
  if (btn) {
    btn.innerText = "✓ Тариф «Без рекламы» активен";
    btn.style.background = "#00E676";
  }
  showToast("Реклама успешно отключена!");
}

/* ==========================================================
   ИНИЦИАЛИЗАЦИЯ ПРИ ЗАГРУЗКЕ
   ========================================================== */
function initApp() {
  if (tg && tg.initDataUnsafe) {
    tg.ready();
    tg.expand();
    try {
      tg.setHeaderColor("#0A0D14");
      tg.setBackgroundColor("#0A0D14");
    } catch (e) {}

    if (tg.initDataUnsafe.user) {
      const u = tg.initDataUnsafe.user;
      const fullName = [u.first_name, u.last_name].filter(Boolean).join(" ") || "Ольга Работнова";
      const initials = fullName.split(" ").map(p => p[0]).join("").toUpperCase().slice(0, 2);
      const nameEl = document.getElementById("profileName");
      const initEl = document.getElementById("profileInitials");
      if (nameEl) nameEl.innerText = fullName;
      if (initEl) initEl.innerText = initials;
    }
  }

  const rHours = document.getElementById("rangeHours");
  const rLimit = document.getElementById("rangeLimit");
  if (rHours) updateSliderUI(rHours, "lblHours", " ч");
  if (rLimit) updateSliderUI(rLimit, "lblLimit", " ₽", true);

  renderProfileCards();
  setupCalendarScrollInteractions();
  refreshData();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}