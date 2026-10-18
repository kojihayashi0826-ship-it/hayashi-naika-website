const defaultData = {
  updatedAt: null,
  siteStatus: {
    enabled: true,
    title: "正式公開前・ウェブサイト調整中",
    body: "新医院の開院に向けて、掲載内容を最終調整しています。内容は変更になる場合があります。"
  },
  highlight: { enabled: false, mode: "banner", title: "", body: "", linkText: "", linkUrl: "" },
  recruitment: {
    enabled: false,
    title: "スタッフ募集中",
    lead: "林内科医院では、一緒に働いていただけるスタッフを募集しています。",
    conditions: [],
    note: "",
    buttonText: "電話で問い合わせる",
    buttonUrl: "tel:0761246288"
  },
  news: [],
  closures: [],
  tests: [],
  vaccines: [],
  vaccineNote: "",
  checkups: [],
  checkupNote: ""
};

const clone = (value) => JSON.parse(JSON.stringify(value));
let data = clone(defaultData);
let loaded = false;
let dirty = false;

const form = document.querySelector("[data-editor-form]");
const status = document.querySelector("[data-load-status]");
const message = document.querySelector("[data-editor-message]");
const newsRoot = document.querySelector("[data-news-items]");
const closuresRoot = document.querySelector("[data-closures]");
const conditionsRoot = document.querySelector("[data-conditions]");
const downloadButton = document.querySelector("[data-download-json]");
const folderButton = document.querySelector("[data-save-folder]");

function makeId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function localDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function safeData(input) {
  const source = input && typeof input === "object" ? input : {};
  const merged = { ...clone(defaultData), ...source };
  merged.siteStatus = { ...defaultData.siteStatus, ...(source.siteStatus || {}) };
  merged.highlight = { ...defaultData.highlight, ...(source.highlight || {}) };
  merged.recruitment = { ...defaultData.recruitment, ...(source.recruitment || {}) };
  merged.recruitment.conditions = Array.isArray(source.recruitment?.conditions)
    ? source.recruitment.conditions.map((item) => ({
        id: item?.id || makeId("condition"),
        label: typeof item?.label === "string" ? item.label : "",
        value: typeof item?.value === "string" ? item.value : ""
      }))
    : [];
  merged.news = Array.isArray(source.news)
    ? source.news.map((item) => ({
        id: item?.id || makeId("news"),
        date: typeof item?.date === "string" ? item.date : localDateString(),
        category: ["notice", "trend", "vaccine"].includes(item?.category) ? item.category : "notice",
        title: typeof item?.title === "string" ? item.title : "",
        body: typeof item?.body === "string" ? item.body : "",
        published: item?.published !== false
      }))
    : [];
  merged.closures = Array.isArray(source.closures)
    ? source.closures.map((item) => ({
        id: item?.id || makeId("closure"),
        start: typeof item?.start === "string" ? item.start : "",
        end: typeof item?.end === "string" ? item.end : "",
        label: typeof item?.label === "string" ? item.label : "臨時休診"
      }))
    : [];
  return merged;
}

function field(path) {
  return document.querySelector(`[data-field="${path}"]`);
}

function setValue(path, value) {
  const element = field(path);
  if (!element) return;
  if (element.type === "checkbox") element.checked = Boolean(value);
  else element.value = typeof value === "string" ? value : "";
}

function getValue(path) {
  const element = field(path);
  if (!element) return "";
  return element.type === "checkbox" ? element.checked : element.value.trim();
}

function setMessage(text, type = "") {
  message.textContent = text;
  message.classList.toggle("is-error", type === "error");
  message.classList.toggle("is-success", type === "success");
}

function setLoaded(text) {
  loaded = true;
  dirty = false;
  status.textContent = text;
  downloadButton.disabled = false;
  folderButton.disabled = !("showDirectoryPicker" in window);
  setMessage("内容を編集後、更新用JSONを作成してください。");
}

function markDirty() {
  if (!loaded) return;
  dirty = true;
  setMessage("未保存の変更があります。");
}

function emptyState(text) {
  const element = document.createElement("p");
  element.className = "empty-state";
  element.textContent = text;
  return element;
}

function createButton(label, className, action) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  button.addEventListener("click", action);
  return button;
}

function renderNews() {
  newsRoot.replaceChildren();
  if (data.news.length === 0) {
    newsRoot.appendChild(emptyState("お知らせは未登録です。「新規追加」から作成してください。"));
    return;
  }

  data.news.forEach((item, index) => {
    const card = document.createElement("article");
    card.className = "item-card news-row";
    card.dataset.id = item.id || makeId("news");

    const header = document.createElement("div");
    header.className = "item-card-header";
    const titleWrap = document.createElement("div");
    titleWrap.className = "item-card-title";
    const chip = document.createElement("span");
    chip.className = `status-chip${item.published ? " is-published" : ""}`;
    chip.textContent = item.published ? "公開中" : "下書き";
    const heading = document.createElement("strong");
    heading.textContent = item.title || `新しいお知らせ ${index + 1}`;
    titleWrap.append(chip, heading);
    const actions = document.createElement("div");
    actions.className = "item-actions";
    actions.appendChild(createButton("削除", "danger-button", () => {
      if (!window.confirm("このお知らせを削除しますか？")) return;
      collectNews();
      data.news.splice(index, 1);
      renderNews();
      markDirty();
    }));
    header.append(titleWrap, actions);

    const meta = document.createElement("div");
    meta.className = "news-meta";
    const dateLabel = document.createElement("label");
    dateLabel.textContent = "日付";
    const dateInput = document.createElement("input");
    dateInput.type = "date";
    dateInput.value = item.date || localDateString();
    dateInput.dataset.newsField = "date";
    dateLabel.appendChild(dateInput);

    const categoryLabel = document.createElement("label");
    categoryLabel.textContent = "分類";
    const select = document.createElement("select");
    select.dataset.newsField = "category";
    [
      ["notice", "お知らせ"],
      ["trend", "流行情報"],
      ["vaccine", "予防接種"]
    ].forEach(([value, label]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      option.selected = item.category === value;
      select.appendChild(option);
    });
    categoryLabel.appendChild(select);

    const publishLabel = document.createElement("label");
    publishLabel.className = "publish-switch";
    const publishInput = document.createElement("input");
    publishInput.type = "checkbox";
    publishInput.checked = item.published !== false;
    publishInput.dataset.newsField = "published";
    const publishText = document.createElement("span");
    publishText.textContent = "公開する";
    publishLabel.append(publishInput, publishText);
    meta.append(dateLabel, categoryLabel, publishLabel);

    const titleLabel = document.createElement("label");
    titleLabel.textContent = "見出し";
    const titleInput = document.createElement("input");
    titleInput.type = "text";
    titleInput.maxLength = 120;
    titleInput.value = item.title || "";
    titleInput.dataset.newsField = "title";
    titleLabel.appendChild(titleInput);

    const bodyLabel = document.createElement("label");
    bodyLabel.textContent = "本文";
    const bodyInput = document.createElement("textarea");
    bodyInput.rows = 3;
    bodyInput.maxLength = 800;
    bodyInput.value = item.body || "";
    bodyInput.dataset.newsField = "body";
    bodyLabel.appendChild(bodyInput);

    card.append(header, meta, titleLabel, bodyLabel);
    newsRoot.appendChild(card);
  });
}

function collectNews() {
  data.news = [...newsRoot.querySelectorAll(".news-row")].map((row) => ({
    id: row.dataset.id || makeId("news"),
    date: row.querySelector('[data-news-field="date"]').value,
    category: row.querySelector('[data-news-field="category"]').value,
    title: row.querySelector('[data-news-field="title"]').value.trim(),
    body: row.querySelector('[data-news-field="body"]').value.trim(),
    published: row.querySelector('[data-news-field="published"]').checked
  }));
}

function renderClosures() {
  closuresRoot.replaceChildren();
  if (data.closures.length === 0) {
    closuresRoot.appendChild(emptyState("臨時休診は未登録です。"));
    return;
  }

  data.closures.forEach((item, index) => {
    const row = document.createElement("div");
    row.className = "item-card closure-row";
    row.dataset.id = item.id || makeId("closure");

    const startLabel = document.createElement("label");
    startLabel.textContent = "開始日";
    const start = document.createElement("input");
    start.type = "date";
    start.value = item.start || "";
    start.dataset.closureField = "start";
    startLabel.appendChild(start);

    const endLabel = document.createElement("label");
    endLabel.textContent = "終了日";
    const end = document.createElement("input");
    end.type = "date";
    end.value = item.end || item.start || "";
    end.dataset.closureField = "end";
    endLabel.appendChild(end);

    const label = document.createElement("label");
    label.textContent = "表示名";
    const labelInput = document.createElement("input");
    labelInput.type = "text";
    labelInput.maxLength = 80;
    labelInput.value = item.label || "臨時休診";
    labelInput.dataset.closureField = "label";
    label.appendChild(labelInput);

    const remove = createButton("削除", "danger-button", () => {
      collectClosures();
      data.closures.splice(index, 1);
      renderClosures();
      markDirty();
    });
    row.append(startLabel, endLabel, label, remove);
    closuresRoot.appendChild(row);
  });
}

function collectClosures() {
  data.closures = [...closuresRoot.querySelectorAll(".closure-row")].map((row) => ({
    id: row.dataset.id || makeId("closure"),
    start: row.querySelector('[data-closure-field="start"]').value,
    end: row.querySelector('[data-closure-field="end"]').value,
    label: row.querySelector('[data-closure-field="label"]').value.trim()
  })).filter((item) => item.start || item.end || item.label);
}

function renderConditions() {
  conditionsRoot.replaceChildren();
  if (data.recruitment.conditions.length === 0) {
    conditionsRoot.appendChild(emptyState("募集条件は未登録です。必要な項目を追加してください。"));
    return;
  }

  data.recruitment.conditions.forEach((item, index) => {
    const row = document.createElement("div");
    row.className = "item-card condition-row";
    row.dataset.id = item.id || makeId("condition");

    const label = document.createElement("label");
    label.textContent = "項目名";
    const labelInput = document.createElement("input");
    labelInput.maxLength = 40;
    labelInput.value = item.label || "";
    labelInput.dataset.conditionField = "label";
    label.appendChild(labelInput);

    const value = document.createElement("label");
    value.textContent = "内容";
    const valueInput = document.createElement("textarea");
    valueInput.rows = 2;
    valueInput.maxLength = 300;
    valueInput.value = item.value || "";
    valueInput.dataset.conditionField = "value";
    value.appendChild(valueInput);

    const remove = createButton("削除", "danger-button", () => {
      collectConditions();
      data.recruitment.conditions.splice(index, 1);
      renderConditions();
      markDirty();
    });
    row.append(label, value, remove);
    conditionsRoot.appendChild(row);
  });
}

function collectConditions() {
  data.recruitment.conditions = [...conditionsRoot.querySelectorAll(".condition-row")].map((row) => ({
    id: row.dataset.id || makeId("condition"),
    label: row.querySelector('[data-condition-field="label"]').value.trim(),
    value: row.querySelector('[data-condition-field="value"]').value.trim()
  })).filter((item) => item.label || item.value);
}

function render() {
  ["enabled", "title", "body"].forEach((key) => setValue(`siteStatus.${key}`, data.siteStatus[key]));
  ["enabled", "mode", "title", "body", "linkText", "linkUrl"].forEach((key) => setValue(`highlight.${key}`, data.highlight[key]));
  ["enabled", "title", "lead", "note", "buttonText", "buttonUrl"].forEach((key) => setValue(`recruitment.${key}`, data.recruitment[key]));
  renderNews();
  renderClosures();
  renderConditions();
}

function collect() {
  data.siteStatus = {
    enabled: getValue("siteStatus.enabled"),
    title: getValue("siteStatus.title"),
    body: getValue("siteStatus.body")
  };
  data.highlight = {
    enabled: getValue("highlight.enabled"),
    mode: getValue("highlight.mode") || "banner",
    title: getValue("highlight.title"),
    body: getValue("highlight.body"),
    linkText: getValue("highlight.linkText"),
    linkUrl: getValue("highlight.linkUrl")
  };
  collectNews();
  collectClosures();
  collectConditions();
  data.recruitment = {
    enabled: getValue("recruitment.enabled"),
    title: getValue("recruitment.title"),
    lead: getValue("recruitment.lead"),
    conditions: data.recruitment.conditions,
    note: getValue("recruitment.note"),
    buttonText: getValue("recruitment.buttonText"),
    buttonUrl: getValue("recruitment.buttonUrl")
  };
  data.updatedAt = new Date().toISOString();
}

function isSafeLink(value) {
  return value === "" || /^(https?:\/\/|tel:|#)/.test(value);
}

function validate() {
  const errors = [];
  if (data.siteStatus.enabled && !data.siteStatus.title && !data.siteStatus.body) {
    errors.push("正式公開前の案内を表示する場合は、見出しか本文を入力してください。");
  }
  if (data.highlight.enabled && !data.highlight.title) {
    errors.push("重要なお知らせを表示する場合は、見出しを入力してください。");
  }
  if (!isSafeLink(data.highlight.linkUrl)) {
    errors.push("重要なお知らせのリンク先は、https://、http://、tel:、# のいずれかで始めてください。");
  }
  data.news.forEach((item, index) => {
    if (item.published && !/^\d{4}-\d{2}-\d{2}$/.test(item.date)) {
      errors.push(`公開するお知らせ ${index + 1} の日付を入力してください。`);
    }
    if (item.published && !item.title) {
      errors.push(`公開するお知らせ ${index + 1} の見出しを入力してください。`);
    }
  });
  data.closures.forEach((item, index) => {
    if (!item.start || !item.end || !item.label) {
      errors.push(`臨時休診 ${index + 1} は開始日・終了日・表示名をすべて入力してください。`);
    } else if (item.end < item.start) {
      errors.push(`臨時休診 ${index + 1} は終了日を開始日以降にしてください。`);
    }
  });
  if (data.recruitment.enabled && !data.recruitment.title) {
    errors.push("スタッフ募集を掲載する場合は、見出しを入力してください。");
  }
  if (!isSafeLink(data.recruitment.buttonUrl)) {
    errors.push("スタッフ募集の問い合わせ先は、https://、http://、tel:、# のいずれかで始めてください。");
  }
  return errors;
}

function preparedJson() {
  if (!loaded) throw new Error("先に現在の設定またはJSONファイルを読み込んでください。");
  collect();
  const errors = validate();
  if (errors.length) throw new Error(errors[0]);
  return JSON.stringify(data, null, 2) + "\n";
}

async function loadCurrent() {
  status.textContent = "読み込み中…";
  try {
    if (window.location.protocol === "file:") throw new Error("file protocol");
    const response = await fetch("data/site-updates.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    data = safeData(await response.json());
    render();
    setLoaded("現在の公開設定を読み込みました");
  } catch (error) {
    loaded = false;
    downloadButton.disabled = true;
    folderButton.disabled = true;
    status.textContent = "自動読込できません。手元の site-updates.json を選択してください。";
    setMessage("公開前やローカル表示では「手元のJSONを選択」を使用します。", "error");
  }
}

function loadFromFile(file) {
  return file.text().then((text) => {
    data = safeData(JSON.parse(text));
    render();
    setLoaded(`${file.name} を読み込みました`);
  });
}

function downloadJson(text) {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "site-updates.json";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

async function saveToFolder() {
  try {
    const text = preparedJson();
    if (!("showDirectoryPicker" in window)) throw new Error("この機能はChromeで利用してください。");
    const rootHandle = await window.showDirectoryPicker({ mode: "readwrite" });
    try {
      await rootHandle.getFileHandle("index.html");
    } catch (error) {
      throw new Error("index.html があるサイト最上位フォルダを選択してください。");
    }
    const dataHandle = await rootHandle.getDirectoryHandle("data", { create: true });
    const fileHandle = await dataHandle.getFileHandle("site-updates.json", { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(text);
    await writable.close();
    dirty = false;
    setMessage("サイトフォルダ内の data/site-updates.json を更新しました。次にGitHubへ反映してください。", "success");
  } catch (error) {
    if (error?.name === "AbortError") return;
    setMessage(error.message || "フォルダへの保存に失敗しました。", "error");
  }
}

// Tabs
const tabButtons = [...document.querySelectorAll("[data-tab]")];
const panels = [...document.querySelectorAll("[data-panel]")];
tabButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const target = button.dataset.tab;
    tabButtons.forEach((item) => item.setAttribute("aria-selected", String(item === button)));
    panels.forEach((panel) => { panel.hidden = panel.dataset.panel !== target; });
  });
});

document.querySelector("[data-load-current]").addEventListener("click", loadCurrent);
document.querySelector("[data-file-input]").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    await loadFromFile(file);
  } catch (error) {
    status.textContent = "JSONを読み込めませんでした";
    setMessage("ファイル形式を確認してください。", "error");
  }
});

document.querySelector("[data-add-news]").addEventListener("click", () => {
  collectNews();
  data.news.unshift({
    id: makeId("news"),
    date: localDateString(),
    category: "notice",
    title: "",
    body: "",
    published: false
  });
  renderNews();
  newsRoot.querySelector('[data-news-field="title"]')?.focus();
  markDirty();
});

document.querySelector("[data-add-closure]").addEventListener("click", () => {
  collectClosures();
  data.closures.push({ id: makeId("closure"), start: "", end: "", label: "臨時休診" });
  renderClosures();
  closuresRoot.lastElementChild?.querySelector("input")?.focus();
  markDirty();
});

document.querySelector("[data-add-condition]").addEventListener("click", () => {
  collectConditions();
  data.recruitment.conditions.push({ id: makeId("condition"), label: "", value: "" });
  renderConditions();
  conditionsRoot.lastElementChild?.querySelector("input")?.focus();
  markDirty();
});

form.addEventListener("input", (event) => {
  if (event.target.matches("input, textarea, select")) markDirty();
  if (event.target.matches('[data-news-field="published"], [data-news-field="title"]')) {
    const row = event.target.closest(".news-row");
    const chip = row?.querySelector(".status-chip");
    const heading = row?.querySelector(".item-card-title strong");
    if (chip) {
      const published = row.querySelector('[data-news-field="published"]').checked;
      chip.textContent = published ? "公開中" : "下書き";
      chip.classList.toggle("is-published", published);
    }
    if (heading && event.target.matches('[data-news-field="title"]')) {
      heading.textContent = event.target.value || "新しいお知らせ";
    }
  }
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  try {
    const text = preparedJson();
    downloadJson(text);
    dirty = false;
    setMessage("site-updates.json を作成しました。GitHubの data フォルダ内で置き換えてください。", "success");
  } catch (error) {
    setMessage(error.message || "入力内容を確認してください。", "error");
  }
});

folderButton.addEventListener("click", saveToFolder);
window.addEventListener("beforeunload", (event) => {
  if (!dirty) return;
  event.preventDefault();
  event.returnValue = "";
});

render();
loadCurrent();
