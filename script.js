const schedule = {
  0: [],
  1: [["09:00", "12:00"], ["13:30", "18:30"]],
  2: [["09:00", "12:00"], ["13:30", "18:30"]],
  3: [["09:00", "12:00"], ["13:30", "18:30"]],
  4: [],
  5: [["09:00", "12:00"], ["13:30", "18:30"]],
  6: [["09:00", "12:00"], ["13:30", "18:30"]]
};

// 診療カレンダーは当月から1年先まで表示します。翌年分は正式確定前の暫定情報として扱います。
const nationalHolidays = {
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

const maxHolidayYear = Math.max(
  ...Object.keys(nationalHolidays).map((key) => Number(key.slice(0, 4)))
);

const defaultManagedContent = {
  closures: [],
  news: [],
  // 検査・ワクチン・健診・重要なお知らせ（ハイライト）は data/site-updates.json で編集します。
  // 管理データ取得失敗時に、古いお知らせや仮の休診日を代替表示しない設計です。
  highlight: { enabled: false, mode: "banner", title: "", body: "", linkText: "", linkUrl: "" },
  tests: [],
  vaccines: [],
  vaccineNote: "",
  checkups: [],
  checkupNote: "",
  loadError: false
};

let specialClosureRanges = [...defaultManagedContent.closures];


// 日本語の医療用語・固有表現を途中で改行しないための補助処理。
// CSS の word-break: auto-phrase に未対応のブラウザーでも、重要語は一まとまりで表示します。
const protectedJapanesePhrases = [
  "大腸がん検診（便潜血検査）",
  "胃カメラ・大腸カメラ",
  "発熱・せき・のどの痛み",
  "上部内視鏡検査",
  "下部内視鏡検査",
  "睡眠時無呼吸検査",
  "インフルエンザワクチン",
  "新型コロナワクチン",
  "肺炎球菌ワクチン",
  "帯状疱疹ワクチン",
  "子宮頸がん予防",
  "日本脳炎ワクチン",
  "後期高齢者健康診査",
  "特定健康診査",
  "雇入時・定期健康診断",
  "食道・胃・十二指腸",
  "循環器・消化器",
  "心電図・ABI検査",
  "ホルター心電図",
  "レントゲン検査",
  "骨密度検査",
  "骨粗しょう症",
  "便潜血検査",
  "大腸がん検診",
  "胃カメラ",
  "大腸カメラ",
  "生活習慣病",
  "体調不良",
  "マイナ保険証",
  "資格確認書",
  "鎮静薬",
  "心エコー",
  "腹部エコー",
  "ABI検査",
  "心電図",
  "予防接種",
  "健康診断",
  "林内科医院",
  "地域の皆さま",
  "大学病院",
  "医療機関",
  "かかりつけ医",
  "分かりやすく",
  "わかりやすく",
  "丁寧に診療",
  "1988年の開業以来",
  "心より御礼申し上げます",
  "院長を務めること",
  "経験を重ねてまいりました",
  "毎日の健康",
  "体調の不安",
  "健康の悩み",
  "病院にかかるほどだろうか",
  "気軽にお話しください",
  "身近で相談しやすい",
  "わかりやすく丁寧な診療",
  "安心して毎日",
  "よろしくお願い申し上げます"
].sort((a, b) => b.length - a.length);

const readableJapaneseSelector = [
  ".hero-lead",
  ".reservation-copy h3",
  ".reservation-copy p",
  ".guide-card h3",
  ".guide-card p",
  ".first-visit-intro",
  ".step-body",
  ".bring-note",
  ".section-heading h2",
  ".section-heading > p:not(.eyebrow)",
  ".care-card h3",
  ".care-card p",
  ".emergency-note",
  ".test-list h3",
  ".test-list p",
  ".prevention-grid li",
  ".prevention-grid article > p",
  ".doctor-message p",
  ".doctor-profile dd",
  ".access-info",
  ".news-content",
  ".faq-list summary",
  ".faq-list p",
  ".contact-details",
  ".site-banner-text",
  ".highlight-modal-box p"
].join(",");

function escapeForRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function protectJapanesePhrases(root = document) {
  const phrasePattern = new RegExp(`(${protectedJapanesePhrases.map(escapeForRegExp).join("|")})`, "g");
  const targets = root.querySelectorAll(readableJapaneseSelector);

  targets.forEach((target) => {
    const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue || !protectedJapanesePhrases.some((phrase) => node.nodeValue.includes(phrase))) {
          return NodeFilter.FILTER_REJECT;
        }
        const parent = node.parentElement;
        if (!parent || parent.closest(".no-break, script, style, textarea, option")) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);

    textNodes.forEach((node) => {
      const parts = node.nodeValue.split(phrasePattern);
      if (parts.length < 2) return;

      const fragment = document.createDocumentFragment();
      parts.forEach((part) => {
        if (!part) return;
        if (protectedJapanesePhrases.includes(part)) {
          const span = document.createElement("span");
          span.className = "no-break";
          span.textContent = part;
          fragment.appendChild(span);
        } else {
          fragment.appendChild(document.createTextNode(part));
        }
      });
      node.replaceWith(fragment);
    });
  });
}

function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatShortDate(date) {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function getSpecialClosure(key) {
  return specialClosureRanges.find(({ start, end }) => key >= start && key <= end);
}

function getClosedReason(date) {
  const key = dateKey(date);
  const special = getSpecialClosure(key);
  if (special) return special.label;
  if (nationalHolidays[key]) return nationalHolidays[key];
  if (date.getDay() === 4) return "木曜休診";
  if (date.getDay() === 0) return "日曜休診";
  return "";
}

function minutes(time) {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

function findNextOpening(fromDate) {
  const start = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate() + 1);
  for (let offset = 0; offset < 370; offset += 1) {
    const candidate = new Date(start.getFullYear(), start.getMonth(), start.getDate() + offset);
    const sessions = getClosedReason(candidate) ? [] : schedule[candidate.getDay()];
    if (sessions && sessions.length > 0) {
      return { date: candidate, time: sessions[0][0] };
    }
  }
  return null;
}

function formatNextOpening(nextOpening) {
  if (!nextOpening) return "次回診療日は診療時間表をご確認ください";
  const dateText = new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric",
    weekday: "short"
  }).format(nextOpening.date);
  return `次回は${dateText} ${nextOpening.time}からです`;
}

function updateTodayStatus() {
  const now = new Date();
  const day = now.getDay();
  const current = now.getHours() * 60 + now.getMinutes();
  const closedReason = getClosedReason(now);
  const sessions = closedReason ? [] : schedule[day];
  const panel = document.querySelector(".today-panel");
  const date = document.querySelector("#today-date");
  const label = document.querySelector("#today-label");
  const detail = document.querySelector("#today-detail");
  if (!panel || !date || !label || !detail) return;

  date.textContent = new Intl.DateTimeFormat("ja-JP", {
    month: "long",
    day: "numeric",
    weekday: "short"
  }).format(now) + "の診療";

  const active = sessions.find(([start, end]) => current >= minutes(start) && current < minutes(end));
  const upcoming = sessions.find(([start]) => current < minutes(start));
  const nextOpening = findNextOpening(now);

  panel.classList.remove("closed");

  if (closedReason) {
    panel.classList.add("closed");
    label.textContent = "本日は休診日です";
    detail.textContent = `${closedReason}。${formatNextOpening(nextOpening)}`;
    return;
  }

  if (active) {
    label.textContent = "本日は診療しています";
    detail.textContent = `${active[1]}まで（受付時間はお問い合わせください）`;
  } else if (upcoming) {
    label.textContent = "本日は診療日です";
    detail.textContent = `次の診療は${upcoming[0]}からです`;
  } else {
    panel.classList.add("closed");
    label.textContent = sessions.length ? "本日の診療は終了しました" : "本日は休診日です";
    detail.textContent = formatNextOpening(nextOpening);
  }
}

function renderMonthlyCalendar() {
  const calendar = document.querySelector("[data-calendar]");
  if (!calendar) return;

  const title = calendar.querySelector("[data-calendar-title]");
  const grid = calendar.querySelector("[data-calendar-grid]");
  const note = calendar.querySelector("[data-calendar-note]");
  const summary = calendar.querySelector("[data-closure-summary]");
  const prev = calendar.querySelector("[data-calendar-prev]");
  const next = calendar.querySelector("[data-calendar-next]");
  const today = new Date();
  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
  const firstVisibleMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastVisibleMonth = new Date(today.getFullYear(), today.getMonth() + 12, 1);
  let activeMonth = new Date(firstVisibleMonth);

  function sameMonth(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
  }

  function draw() {
    const year = activeMonth.getFullYear();
    const month = activeMonth.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay();
    const specialNotes = [];

    title.textContent = `${year}年${month + 1}月`;
    grid.innerHTML = "";

    weekdays.forEach((weekday) => {
      const cell = document.createElement("div");
      cell.className = "calendar-weekday";
      cell.textContent = weekday;
      grid.appendChild(cell);
    });

    for (let i = 0; i < firstDay; i += 1) {
      const cell = document.createElement("div");
      cell.className = "calendar-day is-empty";
      cell.setAttribute("aria-hidden", "true");
      grid.appendChild(cell);
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = new Date(year, month, day);
      const reason = getClosedReason(date);
      const key = dateKey(date);
      const cell = document.createElement("div");
      cell.className = "calendar-day";
      cell.textContent = day;

      if (reason) cell.classList.add("is-closed");
      if (getSpecialClosure(key)) cell.classList.add("is-special");
      if (key === dateKey(today)) cell.classList.add("is-today");
      cell.setAttribute("aria-label", reason ? `${formatShortDate(date)} ${reason}` : `${formatShortDate(date)} 診療日`);

      if (reason && !["木曜休診", "日曜休診"].includes(reason)) {
        specialNotes.push(`${formatShortDate(date)} ${reason}`);
      }

      grid.appendChild(cell);
    }

    let noteText = specialNotes.length
      ? `この月の休診：${[...new Set(specialNotes)].join("、")}`
      : "休診：木曜・日曜・祝日。長期休診は決まり次第更新します。";

    if (year > today.getFullYear()) {
      noteText += " ※翌年の祝日・休診予定は暫定です。正式決定後に更新します。";
    }
    if (year > maxHolidayYear) {
      noteText += ` ※${year}年の祝日は未登録のため反映されていません。`;
    }
    note.textContent = noteText;

    if (summary) {
      const monthStart = dateKey(new Date(year, month, 1));
      const monthEnd = dateKey(new Date(year, month, daysInMonth));
      const labels = specialClosureRanges
        .filter(({ start, end }) => start <= monthEnd && end >= monthStart)
        .map(({ label }) => label);
      summary.replaceChildren();
      [...new Set(labels)].forEach((label) => {
        const badge = document.createElement("span");
        badge.textContent = label;
        summary.appendChild(badge);
      });
      summary.hidden = labels.length === 0;
    }

    prev.disabled = sameMonth(activeMonth, firstVisibleMonth);
    next.disabled = sameMonth(activeMonth, lastVisibleMonth);
    prev.setAttribute("aria-disabled", String(prev.disabled));
    next.setAttribute("aria-disabled", String(next.disabled));
  }

  prev.addEventListener("click", () => {
    if (prev.disabled) return;
    activeMonth = new Date(activeMonth.getFullYear(), activeMonth.getMonth() - 1, 1);
    draw();
  });

  next.addEventListener("click", () => {
    if (next.disabled) return;
    activeMonth = new Date(activeMonth.getFullYear(), activeMonth.getMonth() + 1, 1);
    draw();
  });

  draw();
}

function formatNewsDate(value) {
  return value.replaceAll("-", ".");
}

function renderNews(items, loadError = false) {
  const list = document.querySelector("[data-news-list]");
  const showAllButton = document.querySelector("[data-show-all]");
  if (!list) return;

  const categoryLabels = {
    notice: "お知らせ",
    trend: "流行情報",
    vaccine: "予防接種"
  };
  const publishedItems = Array.isArray(items) ? items
    .filter((item) => item && item.published !== false && /^\d{4}-\d{2}-\d{2}$/.test(item.date) && item.title)
    .sort((a, b) => b.date.localeCompare(a.date)) : [];

  list.replaceChildren();

  if (loadError) {
    const empty = document.createElement("div");
    empty.className = "news-empty is-error";
    const message = document.createElement("p");
    message.textContent = "現在、お知らせ情報を取得できません。診療状況はお電話でご確認ください。";
    const phone = document.createElement("a");
    phone.href = "tel:0761246288";
    phone.textContent = "0761-24-6288";
    empty.append(message, phone);
    list.appendChild(empty);
  } else if (publishedItems.length === 0) {
    const empty = document.createElement("p");
    empty.className = "news-empty";
    empty.textContent = "現在、新しいお知らせはありません。";
    list.appendChild(empty);
  }

  publishedItems.forEach((item, index) => {
    const article = document.createElement("article");
    if (index >= 3) {
      article.classList.add("extra-news");
      article.hidden = true;
    }

    const time = document.createElement("time");
    time.dateTime = item.date;
    time.textContent = formatNewsDate(item.date);

    const tag = document.createElement("span");
    const category = categoryLabels[item.category] ? item.category : "notice";
    tag.className = `news-tag ${category}`;
    tag.textContent = categoryLabels[category];

    const content = document.createElement("div");
    content.className = "news-content";
    const title = document.createElement("h3");
    title.textContent = item.title;
    content.appendChild(title);

    if (item.body) {
      const body = document.createElement("p");
      body.textContent = item.body;
      content.appendChild(body);
    }

    article.append(time, tag, content);
    list.appendChild(article);
  });

  if (showAllButton) {
    showAllButton.hidden = loadError || publishedItems.length <= 3;
    showAllButton.dataset.expanded = "false";
    if (showAllButton.firstChild) showAllButton.firstChild.textContent = "すべて見る ";
  }
}

function initPageMotion() {
  const reducedMotion = typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const header = document.querySelector(".site-header");

  const updateHeader = () => {
    if (header) header.classList.toggle("is-scrolled", window.scrollY > 24);
  };
  updateHeader();
  window.addEventListener("scroll", updateHeader, { passive: true });

  const revealTargets = document.querySelectorAll([
    ".quick-guide .reservation-bar",
    ".quick-guide .guide-card",
    ".section-heading",
    ".care-card",
    ".test-list article",
    ".prevention-grid article",
    ".doctor-portrait",
    ".doctor-copy",
    ".map-card",
    ".access-info",
    ".news-list article",
    ".faq-list details",
    ".contact-inner"
  ].join(","));

  if (reducedMotion || !("IntersectionObserver" in window)) {
    revealTargets.forEach((target) => target.classList.add("is-visible"));
  } else {
    document.documentElement.classList.add("motion-ready");
    const revealObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });

    revealTargets.forEach((target, index) => {
      target.classList.add("reveal");
      target.style.setProperty("--reveal-delay", `${(index % 3) * 70}ms`);
      revealObserver.observe(target);
    });
  }

  const navLinks = [...document.querySelectorAll('.global-nav a[href^="#"]')];
  const sections = navLinks
    .map((link) => document.querySelector(link.getAttribute("href")))
    .filter(Boolean);

  if ("IntersectionObserver" in window && sections.length) {
    const sectionObserver = new IntersectionObserver((entries) => {
      const visible = entries.find((entry) => entry.isIntersecting);
      if (!visible) return;
      navLinks.forEach((link) => {
        link.classList.toggle("is-current", link.getAttribute("href") === `#${visible.target.id}`);
      });
    }, { rootMargin: "-30% 0px -60% 0px", threshold: 0 });
    sections.forEach((section) => sectionObserver.observe(section));
  }
}

function initHeroZoomLoop() {
  const image = document.querySelector(".hero-visual img");
  const badge = document.querySelector(".parking-badge");
  if (!image) return;

  // 医療サイトでは常時ループする動きより、初回だけの穏やかな表示を優先します。
  image.style.animation = "none";
  if (badge) badge.style.animation = "none";

  const reducedMotion = typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reducedMotion || typeof image.animate !== "function") return;

  image.animate([
    { opacity: 0.78, transform: "scale(1.018)" },
    { opacity: 1, transform: "scale(1)" }
  ], { duration: 1100, easing: "cubic-bezier(.2,.75,.25,1)", fill: "both" });

  if (badge && typeof badge.animate === "function") {
    badge.animate([
      { opacity: 0, transform: "translateY(10px)" },
      { opacity: 1, transform: "translateY(0)" }
    ], { duration: 650, delay: 420, easing: "ease-out", fill: "both" });
  }
}

async function loadManagedContent() {
  if (window.location.protocol === "file:") return defaultManagedContent;

  try {
    const response = await fetch("data/site-updates.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const content = await response.json();
    return {
      closures: Array.isArray(content.closures) ? content.closures : [],
      news: Array.isArray(content.news) ? content.news : [],
      highlight: (content.highlight && typeof content.highlight === "object")
        ? content.highlight : defaultManagedContent.highlight,
      tests: Array.isArray(content.tests) ? content.tests : defaultManagedContent.tests,
      vaccines: Array.isArray(content.vaccines) ? content.vaccines : defaultManagedContent.vaccines,
      vaccineNote: typeof content.vaccineNote === "string" ? content.vaccineNote : defaultManagedContent.vaccineNote,
      checkups: Array.isArray(content.checkups) ? content.checkups : defaultManagedContent.checkups,
      checkupNote: typeof content.checkupNote === "string" ? content.checkupNote : defaultManagedContent.checkupNote,
      loadError: false
    };
  } catch (error) {
    console.warn("更新データを読み込めませんでした。古いお知らせ・休診情報は代替表示しません。", error);
    return { ...defaultManagedContent, loadError: true };
  }
}

function renderTests(items) {
  const list = document.querySelector("[data-test-list]");
  if (!list || !Array.isArray(items) || items.length === 0) return;

  list.replaceChildren();
  items
    .filter((item) => item && item.title)
    .forEach((item, index) => {
      const article = document.createElement("article");
      const number = document.createElement("span");
      number.textContent = String(index + 1).padStart(2, "0");
      const body = document.createElement("div");
      const title = document.createElement("h3");
      title.textContent = item.title;
      body.appendChild(title);
      if (item.body) {
        const desc = document.createElement("p");
        desc.textContent = item.body;
        body.appendChild(desc);
      }
      article.append(number, body);
      list.appendChild(article);
    });
}

function renderList(selector, items, labelKey) {
  const list = document.querySelector(selector);
  if (!list || !Array.isArray(items) || items.length === 0) return;

  list.replaceChildren();
  items
    .filter((item) => item && item[labelKey])
    .forEach((item) => {
      const li = document.createElement("li");
      if (item.wide) li.className = "vaccine-wide";
      li.textContent = item[labelKey];
      list.appendChild(li);
    });
}

function renderNote(selector, text) {
  const note = document.querySelector(selector);
  if (!note || typeof text !== "string" || text === "") return;
  note.textContent = text;
}

function renderPreventionContent(content) {
  renderList("[data-vaccine-list]", content.vaccines, "label");
  renderNote("[data-vaccine-note]", content.vaccineNote);
  renderList("[data-checkup-list]", content.checkups, "label");
  renderNote("[data-checkup-note]", content.checkupNote);
}

function highlightKey(highlight) {
  return `hayashi-highlight:${highlight.mode}:${highlight.title}:${highlight.body}`;
}

function isSafeLink(url) {
  if (typeof url !== "string" || url === "") return false;
  return /^(https?:\/\/|tel:|#)/.test(url);
}

function renderHighlight(highlight) {
  const banner = document.querySelector("[data-highlight-banner]");
  const modal = document.querySelector("[data-highlight-modal]");
  if (!banner || !modal) return;

  banner.hidden = true;
  modal.hidden = true;

  if (!highlight || !highlight.enabled || !highlight.title) return;

  const key = highlightKey(highlight);
  const linkOk = isSafeLink(highlight.linkUrl) && highlight.linkText;

  if (highlight.mode === "popup") {
    let dismissed = false;
    try {
      dismissed = window.localStorage.getItem(key) === "closed";
    } catch (error) {
      dismissed = false;
    }
    if (dismissed) return;

    modal.querySelector("[data-modal-title]").textContent = highlight.title;
    modal.querySelector("[data-modal-body]").textContent = highlight.body || "";
    const link = modal.querySelector("[data-modal-link]");
    if (linkOk) {
      link.textContent = highlight.linkText;
      link.href = highlight.linkUrl;
      if (highlight.linkUrl.startsWith("http")) {
        link.target = "_blank";
        link.rel = "noopener";
      }
      link.hidden = false;
    } else {
      link.hidden = true;
      link.removeAttribute("href");
    }

    const closeButton = modal.querySelector(".highlight-modal-close");
    const modalBox = modal.querySelector(".highlight-modal-box");
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const backgroundStates = [...document.body.children]
      .filter((element) => element !== modal)
      .map((element) => ({ element, inert: element.inert }));

    const getFocusable = () => [...modal.querySelectorAll(
      'a[href]:not([hidden]), button:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )].filter((element) => !element.hidden && element.getClientRects().length > 0);

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = getFocusable();
      if (focusable.length === 0) {
        event.preventDefault();
        modalBox?.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    const close = () => {
      modal.hidden = true;
      document.body.classList.remove("modal-open");
      backgroundStates.forEach(({ element, inert }) => { element.inert = inert; });
      document.removeEventListener("keydown", onKeyDown);
      try {
        window.localStorage.setItem(key, "closed");
      } catch (error) {
        /* localStorage不可でも閉じる動作は継続 */
      }
      if (previousFocus && document.contains(previousFocus)) previousFocus.focus();
    };

    modal.querySelectorAll("[data-modal-close]").forEach((element) => {
      element.addEventListener("click", close, { once: true });
    });

    backgroundStates.forEach(({ element }) => { element.inert = true; });
    document.body.classList.add("modal-open");
    document.addEventListener("keydown", onKeyDown);
    modal.hidden = false;
    window.requestAnimationFrame(() => (closeButton || modalBox)?.focus());
    return;
  }

  // 既定は帯（バナー）表示
  banner.querySelector("[data-banner-title]").textContent = highlight.title;
  banner.querySelector("[data-banner-body]").textContent = highlight.body || "";
  const bannerLink = banner.querySelector("[data-banner-link]");
  if (linkOk) {
    bannerLink.textContent = highlight.linkText;
    bannerLink.href = highlight.linkUrl;
    if (highlight.linkUrl.startsWith("http")) {
      bannerLink.target = "_blank";
      bannerLink.rel = "noopener";
    }
    bannerLink.hidden = false;
  } else {
    bannerLink.hidden = true;
    bannerLink.removeAttribute("href");
  }
  const bannerClose = banner.querySelector("[data-banner-close]");
  if (bannerClose) {
    bannerClose.addEventListener("click", () => {
      banner.hidden = true;
      document.body.classList.remove("has-banner");
    }, { once: true });
  }
  banner.hidden = false;
  document.body.classList.add("has-banner");
}

const menuButton = document.querySelector(".menu-button");
const globalNav = document.querySelector(".global-nav");

initHeroZoomLoop();

if (menuButton && globalNav) {
  const setMenuOpen = (open) => {
    menuButton.setAttribute("aria-expanded", String(open));
    globalNav.classList.toggle("open", open);
    document.body.classList.toggle("menu-open", open);
    if (open) {
      const firstLink = globalNav.querySelector("a");
      window.requestAnimationFrame(() => firstLink?.focus());
    }
  };

  menuButton.addEventListener("click", () => {
    setMenuOpen(menuButton.getAttribute("aria-expanded") !== "true");
  });

  globalNav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => setMenuOpen(false));
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && menuButton.getAttribute("aria-expanded") === "true") {
      setMenuOpen(false);
      menuButton.focus();
    }
  });

  document.addEventListener("click", (event) => {
    if (menuButton.getAttribute("aria-expanded") !== "true") return;
    if (globalNav.contains(event.target) || menuButton.contains(event.target)) return;
    setMenuOpen(false);
  });
}

const showAllButton = document.querySelector("[data-show-all]");

if (showAllButton) {
  showAllButton.addEventListener("click", (event) => {
    const expanded = event.currentTarget.dataset.expanded === "true";
    document.querySelectorAll(".extra-news").forEach((item) => {
      item.hidden = expanded;
    });
    event.currentTarget.dataset.expanded = String(!expanded);
    event.currentTarget.firstChild.textContent = expanded ? "すべて見る " : "閉じる ";
  });
}

loadManagedContent().then((content) => {
  specialClosureRanges = content.closures;
  renderNews(content.news, content.loadError);
  renderTests(content.tests);
  renderPreventionContent(content);
  renderHighlight(content.highlight);
  protectJapanesePhrases();
  updateTodayStatus();
  renderMonthlyCalendar();
  initPageMotion();
  // 開きっぱなしのタブでも診療状況が古くならないよう毎分更新する
  setInterval(updateTodayStatus, 60000);
});
