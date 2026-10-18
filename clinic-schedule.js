/* Shared by the public site and editor. Dates and opening status use Asia/Tokyo.
 * No external dependencies. Legacy {start,end,label} closures remain compatible. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ClinicSchedule = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const holidays = {
  "2026-01-01": "元日",
  "2026-01-12": "成人の日",
  "2026-02-11": "建国記念の日",
  "2026-02-23": "天皇誕生日",
  "2026-03-20": "春分の日",
  "2026-04-29": "昭和の日",
  "2026-05-03": "憲法記念日",
  "2026-05-04": "みどりの日",
  "2026-05-05": "こどもの日",
  "2026-05-06": "休日",
  "2026-07-20": "海の日",
  "2026-08-11": "山の日",
  "2026-09-21": "敬老の日",
  "2026-09-22": "休日",
  "2026-09-23": "秋分の日",
  "2026-10-12": "スポーツの日",
  "2026-11-03": "文化の日",
  "2026-11-23": "勤労感謝の日",
  "2027-01-01": "元日",
  "2027-01-11": "成人の日",
  "2027-02-11": "建国記念の日",
  "2027-02-23": "天皇誕生日",
  "2027-03-21": "春分の日",
  "2027-03-22": "休日",
  "2027-04-29": "昭和の日",
  "2027-05-03": "憲法記念日",
  "2027-05-04": "みどりの日",
  "2027-05-05": "こどもの日",
  "2027-07-19": "海の日",
  "2027-08-11": "山の日",
  "2027-09-20": "敬老の日",
  "2027-09-23": "秋分の日",
  "2027-10-11": "スポーツの日",
  "2027-11-03": "文化の日",
  "2027-11-23": "勤労感謝の日"
};
  const periods = { all: "終日休診", am: "午前休診", pm: "午後休診" };
  const regular = { 0: [], 1: [["09:00","12:00"],["13:30","18:30"]],
    2: [["09:00","12:00"],["13:30","18:30"]], 3: [["09:00","12:00"],["13:30","18:30"]],
    4: [], 5: [["09:00","12:00"],["13:30","18:30"]], 6: [["09:00","12:00"],["13:30","18:30"]] };

  function isDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const time = Date.parse(value + "T00:00:00Z");
    return Number.isFinite(time) && new Date(time).toISOString().slice(0,10) === value;
  }
  function utc(key) { return new Date(key + "T00:00:00Z"); }
  function shift(key, days) { const date = utc(key); date.setUTCDate(date.getUTCDate()+days); return date.toISOString().slice(0,10); }
  function japanNow(date = new Date()) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23"
    }).formatToParts(date).map(x => [x.type,x.value]));
    return { key: `${parts.year}-${parts.month}-${parts.day}`, minute: Number(parts.hour)*60 + Number(parts.minute) };
  }
  function normalize(item) {
    const c = item && typeof item === "object" ? item : {};
    return { ...c, start: typeof c.start === "string" ? c.start : "",
      end: typeof c.end === "string" && c.end ? c.end : (c.start || ""),
      label: typeof c.label === "string" && c.label.trim() ? c.label.trim() : "臨時休診",
      period: Object.hasOwn(periods,c.period) ? c.period : "all",
      published: c.published !== false && c.enabled !== false,
      announce: c.announce !== false,
      noticeDate: isDate(c.noticeDate) ? c.noticeDate : (isDate(c.start) ? c.start : ""),
      body: typeof c.body === "string" ? c.body : "" };
  }
  function active(closures) {
    return (Array.isArray(closures) ? closures : []).map(normalize)
      .filter(c => c.published && isDate(c.start) && isDate(c.end) && c.start <= c.end);
  }
  function matching(key, closures) { return active(closures).filter(c => c.start <= key && key <= c.end); }
  function dayState(key, closures) {
    if (!isDate(key)) throw new Error("日付が正しくありません。");
    const day = utc(key).getUTCDay();
    const regularReason = holidays[key] || (day === 4 ? "木曜休診" : day === 0 ? "日曜休診" : "");
    const matches = matching(key,closures);
    const am = matches.some(c => c.period === "all" || c.period === "am");
    const pm = matches.some(c => c.period === "all" || c.period === "pm");
    const sessions = regularReason ? [] : regular[day].filter(([start]) => parseInt(start,10) < 12 ? !am : !pm);
    const closed = sessions.length === 0;
    const partial = !closed && (am || pm);
    const status = closed ? (matches.length ? "終日休診" : "休診") : partial ? (am ? "午前休診" : "午後休診") : "診療日";
    const details = [...new Set(matches.map(c => `${c.label}（${periods[c.period]}）`))];
    if (regularReason) details.unshift(regularReason);
    return { key, closed, partial, special: matches.length > 0, status, sessions,
      reason: details.join("・"), matches, regularReason };
  }
  function mins(time) { const [h,m] = time.split(":").map(Number); return h*60+m; }
  function nextOpening(date, closures) {
    const now = japanNow(date);
    for (let offset = 0; offset < 370; offset++) {
      const key = shift(now.key,offset);
      const sessions = dayState(key,closures).sessions;
      const session = sessions.find(([start]) => offset > 0 || mins(start) > now.minute);
      if (session) return { key, time: session[0] };
    }
    return null;
  }
  function pretty(key, withYear = false) {
    if (!isDate(key)) return "";
    const d = utc(key);
    return `${withYear ? d.getUTCFullYear()+"年" : ""}${d.getUTCMonth()+1}月${d.getUTCDate()}日（${"日月火水木金土"[d.getUTCDay()]}）`;
  }
  function rangeLabel(item) {
    const c = normalize(item);
    return c.start === c.end ? pretty(c.start,true) : `${pretty(c.start,true)}〜${pretty(c.end,true)}`;
  }
  function closureNews(closures) {
    return active(closures).filter(c => c.announce).map(c => ({
      id: `closure-news-${c.id || c.start+"-"+c.end+"-"+c.period}`, date: c.noticeDate,
      category: "closure", title: c.label.endsWith("お知らせ") ? c.label : `${c.label}のお知らせ`, published: true,
      body: `${rangeLabel(c)}は${periods[c.period]}です。${c.body ? "\n"+c.body : ""}`
    }));
  }
  function calendarMarkup() {
    return `<div class="calendar-header"><h3 data-calendar-title></h3><div class="calendar-controls"><button type="button" data-calendar-prev aria-label="前の月">前月</button><button type="button" data-calendar-next aria-label="次の月">翌月</button></div></div><div class="calendar-legend"></div><div class="calendar-grid" data-calendar-grid aria-live="polite"></div><p class="calendar-note" data-calendar-note></p><div class="seasonal-closures" data-closure-summary hidden></div>`;
  }
  function renderCalendar(root, closures, options = {}) {
    if (!root) return;
    const now = japanNow().key;
    const first = now.slice(0,7);
    const last = `${Number(first.slice(0,4))+1}${first.slice(4)}`;
    if (!root.querySelector("[data-calendar-grid]")) root.innerHTML = calendarMarkup();
    root.classList.add("clinic-calendar");
    let month = options.month || root.dataset.month || first;
    if (!/^\d{4}-\d{2}$/.test(month) || !isDate(month+"-01")) month = first;
    if (options.limit !== false) month = month < first ? first : month > last ? last : month;
    root.dataset.month = month;
    const query = selector => root.querySelector(selector);
    const title = query("[data-calendar-title]");
    const grid = query("[data-calendar-grid]");
    const note = query("[data-calendar-note]");
    const legend = query(".calendar-legend");
    if (legend) legend.innerHTML = '<span><i class="legend-open"></i>診療日</span><span><i class="legend-closed"></i>定期休診・祝日</span><span><i class="legend-special"></i>臨時休診（終日）</span><span><i class="legend-partial"></i>午前・午後休診</span>';
    const [year,m] = month.split("-").map(Number);
    title.textContent = `${year}年${m}月`;
    grid.replaceChildren();
    for (const name of "日月火水木金土") {
      const e = document.createElement("div"); e.className="calendar-weekday"; e.textContent=name; grid.append(e);
    }
    const startWeek = utc(month+"-01").getUTCDay();
    for (let i=0; i<startWeek; i++) {
      const e = document.createElement("div"); e.className="calendar-day is-empty"; e.setAttribute("aria-hidden","true"); grid.append(e);
    }
    const count = new Date(Date.UTC(year,m,0)).getUTCDate();
    const notes = [];
    for (let i=1; i<=count; i++) {
      const key = month+"-"+String(i).padStart(2,"0");
      const s = dayState(key,closures);
      const e = document.createElement("div"); e.className="calendar-day"; e.dataset.date=key;
      const num = document.createElement("span"); num.className="day-number"; num.textContent=i; e.append(num);
      const label = document.createElement("span"); label.className="day-status";
      label.textContent = options.loadError ? (s.regularReason ? "定期休診" : "要確認") : s.status;
      e.append(label);
      if (s.closed) e.classList.add("is-closed");
      if (s.special && !options.loadError) e.classList.add(s.partial ? "is-partial" : "is-special");
      if (key === now) e.classList.add("is-today");
      if (options.loadError && !s.regularReason) e.classList.add("is-unknown");
      const explanation = options.loadError ? "臨時休診情報を取得できません。お電話でご確認ください。" : s.reason || "診療日";
      e.title = `${pretty(key,true)} ${explanation}`;
      e.setAttribute("aria-label",`${pretty(key,true)} ${label.textContent} ${explanation}`);
      grid.append(e);
      if (s.regularReason && holidays[key]) notes.push(`${m}/${i} ${holidays[key]}`);
    }
    const inMonth = active(closures).filter(c => c.start <= month+"-"+count && c.end >= month+"-01");
    for (const c of inMonth) notes.push(`${rangeLabel(c)} ${c.label}（${periods[c.period]}）`);
    note.textContent = options.loadError ? "休診情報を取得できません。臨時休診はお電話（0761-24-6288）でご確認ください。" :
      (notes.length ? notes.join("／") : "木曜・日曜・祝日は休診です。") + " 休診予定は変更になる場合があります。";
    if (year > Math.max(...Object.keys(holidays).map(k=>Number(k.slice(0,4))))) note.textContent += ` ※${year}年の祝日は未登録です。`;
    const summary = query("[data-closure-summary]");
    if (summary) { summary.replaceChildren(); summary.hidden=true; }
    for (const [selector,step] of [["[data-calendar-prev]",-1],["[data-calendar-next]",1]]) {
      const button=query(selector); if (!button) continue;
      button.disabled=options.limit !== false && (step === -1 ? month <= first : month >= last);
      button.setAttribute("aria-disabled",String(button.disabled));
      button.onclick=()=>{ const next=new Date(Date.UTC(year,m-1+step,1)).toISOString().slice(0,7); renderCalendar(root,closures,{...options,month:next}); };
    }
  }
  return Object.freeze({ holidays, regular, periods, isDate, shift, japanNow, normalize, active, matching,
    dayState, nextOpening, pretty, rangeLabel, closureNews, renderCalendar });
});
