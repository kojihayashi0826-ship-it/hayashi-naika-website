const schedule = ClinicSchedule.regular;
const nationalHolidays = ClinicSchedule.holidays;
let managedContentUnavailable = false;

const defaultManagedContent = {
  closures: [],
  news: [],
  // サイト案内・お知らせ・休診・スタッフ募集・検査等は data/site-updates.json で管理します。
  // 管理データ取得失敗時に、古いお知らせや仮の休診日を代替表示しない設計です。
  siteStatus: { enabled: true, title: "正式公開前・ウェブサイト調整中", body: "新医院の開院に向けて、掲載内容を最終調整しています。内容は変更になる場合があります。" },
  highlight: { enabled: false, mode: "banner", title: "", body: "", linkText: "", linkUrl: "" },
  recruitment: { enabled: false, title: "スタッフ募集中", lead: "", conditions: [], note: "", buttonText: "", buttonUrl: "" },
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
  ".walkin-copy h3",
  ".walkin-copy p",
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
  ".prelaunch-notice",
  ".site-banner-text",
  ".highlight-modal-box p",
  ".recruitment-section h2",
  ".recruitment-section p",
  ".recruitment-conditions dt",
  ".recruitment-conditions dd"
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

function updateTodayStatus() {
  const panel = document.querySelector(".today-panel");
  const date = document.querySelector("#today-date");
  const label = document.querySelector("#today-label");
  const detail = document.querySelector("#today-detail");
  if (!panel || !date || !label || !detail) return;
  const now = new Date();
  const clock = ClinicSchedule.japanNow(now);
  date.textContent = ClinicSchedule.pretty(clock.key) + "の診療";
  panel.classList.remove("closed");
  if (managedContentUnavailable) {
    label.textContent = "診療状況はお電話でご確認ください";
    detail.textContent = "臨時休診情報を取得できません（0761-24-6288）";
    return;
  }
  const state = ClinicSchedule.dayState(clock.key, specialClosureRanges);
  const minutes = time => { const [h,m] = time.split(":").map(Number); return h*60+m; };
  const active = state.sessions.find(([a,b]) => clock.minute >= minutes(a) && clock.minute < minutes(b));
  const upcoming = state.sessions.find(([a]) => clock.minute < minutes(a));
  const next = ClinicSchedule.nextOpening(now, specialClosureRanges);
  const nextText = next ? `次回は${ClinicSchedule.pretty(next.key)} ${next.time}からです` : "次回診療日はお電話でご確認ください";
  if (state.closed) {
    panel.classList.add("closed"); label.textContent = "本日は休診日です";
    detail.textContent = `${state.reason}。${nextText}`;
  } else if (active) {
    label.textContent = state.partial ? `診療中（本日は${state.status}）` : "本日は診療しています";
    detail.textContent = `${active[1]}まで診療しています`;
  } else if (upcoming) {
    label.textContent = state.partial ? `本日は${state.status}です` : "本日は診療日です";
    detail.textContent = `次の診療は${upcoming[0]}からです`;
  } else {
    panel.classList.add("closed");
    label.textContent = state.partial ? `本日は${state.status}です` : "本日の診療は終了しました";
    detail.textContent = nextText;
  }
}

function renderMonthlyCalendar() {
  ClinicSchedule.renderCalendar(document.querySelector("[data-calendar]"), specialClosureRanges, { loadError: managedContentUnavailable });
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
    trend: "お知らせ",
    vaccine: "予防接種",
    closure: "臨時休診"
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
    ".quick-guide .walkin-bar",
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
    ".recruitment-card",
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

async function loadManagedContent() {
  if (window.location.protocol === "file:") return { ...defaultManagedContent, loadError: true };

  try {
    const response = await fetch("data/site-updates.json?v=" + Date.now(), { cache: "no-store", signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const content = await response.json();
    if (!content || !Array.isArray(content.closures) || !Array.isArray(content.news)) throw new Error("更新データの形式が不正です");
    return {
      ...ClinicContent.normalize(content),
      closures: Array.isArray(content.closures) ? content.closures : [],
      news: Array.isArray(content.news) ? content.news : [],
      siteStatus: (content.siteStatus && typeof content.siteStatus === "object")
        ? content.siteStatus : defaultManagedContent.siteStatus,
      highlight: (content.highlight && typeof content.highlight === "object")
        ? content.highlight : defaultManagedContent.highlight,
      recruitment: (content.recruitment && typeof content.recruitment === "object")
        ? content.recruitment : defaultManagedContent.recruitment,
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



function renderSiteStatus(siteStatus) {
  const section = document.querySelector("[data-site-status]");
  if (!section) return;

  const enabled = !!(siteStatus && siteStatus.enabled);
  section.hidden = !enabled;
  if (!enabled) return;

  const title = section.querySelector("[data-site-status-title]");
  const body = section.querySelector("[data-site-status-body]");
  const titleText = typeof siteStatus.title === "string" ? siteStatus.title.trim() : "";
  const bodyText = typeof siteStatus.body === "string" ? siteStatus.body.trim() : "";

  if (title) {
    title.textContent = titleText;
    title.hidden = titleText === "";
  }
  if (body) {
    body.textContent = bodyText;
    body.hidden = bodyText === "";
  }
}

function renderRecruitment(recruitment) {
  const section = document.querySelector("[data-recruitment-section]");
  const enabled = !!(recruitment && recruitment.enabled);
  document.querySelectorAll("[data-recruitment-nav], [data-recruitment-footer]").forEach((link) => {
    link.hidden = !enabled;
  });
  if (!section) return;
  section.hidden = !enabled;
  if (!enabled) return;

  const title = section.querySelector("[data-recruitment-title]");
  const lead = section.querySelector("[data-recruitment-lead]");
  const conditions = section.querySelector("[data-recruitment-conditions]");
  const note = section.querySelector("[data-recruitment-note]");
  const button = section.querySelector("[data-recruitment-link]");

  if (title) title.textContent = (recruitment.title || "スタッフ募集中").trim();
  if (lead) {
    const text = typeof recruitment.lead === "string" ? recruitment.lead.trim() : "";
    lead.textContent = text;
    lead.hidden = text === "";
  }

  if (conditions) {
    conditions.replaceChildren();
    const items = Array.isArray(recruitment.conditions) ? recruitment.conditions : [];
    items.filter((item) => item && item.label && item.value).forEach((item) => {
      const row = document.createElement("div");
      const dt = document.createElement("dt");
      const dd = document.createElement("dd");
      dt.textContent = item.label;
      dd.textContent = item.value;
      row.append(dt, dd);
      conditions.appendChild(row);
    });
    conditions.hidden = conditions.children.length === 0;
  }

  if (note) {
    const text = typeof recruitment.note === "string" ? recruitment.note.trim() : "";
    note.textContent = text;
    note.hidden = text === "";
  }

  if (button) {
    const url = typeof recruitment.buttonUrl === "string" ? recruitment.buttonUrl.trim() : "";
    if (url && isSafeLink(url)) {
      button.textContent = (recruitment.buttonText || "お問い合わせ").trim();
      button.href = url;
      button.hidden = false;
      if (url.startsWith("http")) {
        button.target = "_blank";
        button.rel = "noopener";
      } else {
        button.removeAttribute("target");
        button.removeAttribute("rel");
      }
    } else {
      button.hidden = true;
      button.removeAttribute("href");
    }
  }
}

function isSafeLink(url) {
  return typeof url === "string" && /^(https?:\/\/|tel:|#)/.test(url);
}

const menuButton = document.querySelector(".menu-button");
const globalNav = document.querySelector(".global-nav");



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

let lastContentSignature = "";
function applyManagedContent(content) {
  const signature = JSON.stringify(content);
  if (signature === lastContentSignature) { updateTodayStatus(); renderMonthlyCalendar(); return; }
  lastContentSignature = signature;
  specialClosureRanges = ClinicSchedule.active(content.closures);
  managedContentUnavailable = content.loadError;
  renderNews([...content.news, ...ClinicSchedule.closureNews(content.closures)], content.loadError);
  renderTests(content.tests);
  renderPreventionContent(content);
  renderSiteStatus(content.siteStatus);
  renderRecruitment(content.recruitment);
  ClinicPublicContent.apply(content);
  protectJapanesePhrases();
  updateTodayStatus();
  renderMonthlyCalendar();
}
let refreshingContent = false;
async function refreshManagedContent() {
  if (refreshingContent) return;
  refreshingContent = true;
  try { applyManagedContent(await loadManagedContent()); }
  finally { refreshingContent = false; }
}
refreshManagedContent().then(initPageMotion);
setInterval(updateTodayStatus, 60000);
setInterval(() => { if (!document.hidden) refreshManagedContent(); }, 120000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) refreshManagedContent(); });


/* Show the compact status only after the full today panel leaves view. */
(() => {
  const panel=document.querySelector('.today-panel'), floating=document.querySelector('.today-floating');
  if(!panel||!floating)return;
  const sync=()=>{const r=panel.getBoundingClientRect();floating.classList.toggle('visible',r.bottom<0);const label=document.querySelector('#today-label');const target=document.querySelector('#floating-today-label');if(label&&target)target.textContent=label.textContent;};
  window.addEventListener('scroll',sync,{passive:true});window.addEventListener('resize',sync);sync();
})();
