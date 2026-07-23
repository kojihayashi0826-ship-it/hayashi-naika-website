const source = document.querySelector("#admin-data");
const parsed = source ? JSON.parse(source.textContent) : {};
const state = {
  news: Array.isArray(parsed.news) ? parsed.news : [],
  closures: Array.isArray(parsed.closures) ? parsed.closures : [],
  tests: Array.isArray(parsed.tests) ? parsed.tests : [],
  vaccines: Array.isArray(parsed.vaccines) ? parsed.vaccines : [],
  checkups: Array.isArray(parsed.checkups) ? parsed.checkups : [],
  vaccineNote: typeof parsed.vaccineNote === "string" ? parsed.vaccineNote : "",
  checkupNote: typeof parsed.checkupNote === "string" ? parsed.checkupNote : "",
  highlight: (parsed.highlight && typeof parsed.highlight === "object") ? parsed.highlight : {}
};

const newsEditor = document.querySelector("[data-news-editor]");
const closureEditor = document.querySelector("[data-closure-editor]");
const testEditor = document.querySelector("[data-test-editor]");
const vaccineEditor = document.querySelector("[data-vaccine-editor]");
const checkupEditor = document.querySelector("[data-checkup-editor]");
const contentForm = document.querySelector("#content-form");
const payloadInput = document.querySelector("#content-payload");
const saveBar = document.querySelector("[data-save-bar]");
const saveStatus = document.querySelector("[data-save-status]");
let isDirty = false;

const categoryLabels = {
  notice: "お知らせ",
  trend: "流行情報",
  vaccine: "予防接種"
};

function createElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function createInput(type, value, options = {}) {
  const input = document.createElement("input");
  input.type = type;
  input.value = value || "";
  Object.entries(options).forEach(([key, option]) => {
    if (key in input) input[key] = option;
    else input.setAttribute(key, option);
  });
  return input;
}

function createField(labelText, control, className = "") {
  const label = createElement("label", `field ${className}`.trim());
  label.append(createElement("span", "field-label", labelText), control);
  return label;
}

function makeId(prefix) {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return `${prefix}-${window.crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function todayKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function markDirty() {
  isDirty = true;
  if (saveStatus) {
    saveStatus.textContent = "未保存の変更があります";
    saveStatus.classList.add("is-dirty");
  }
}

function move(list, index, direction) {
  const target = index + direction;
  if (target < 0 || target >= list.length) return false;
  const temp = list[index];
  list[index] = list[target];
  list[target] = temp;
  return true;
}

function createRecordHeader(title, options = {}) {
  const header = createElement("div", "record-heading");
  header.appendChild(createElement("h3", "", title));
  const controls = createElement("div", "record-controls");

  if (options.onUp || options.onDown) {
    const up = createElement("button", "move-button", "↑");
    up.type = "button";
    up.setAttribute("aria-label", "上へ移動");
    up.addEventListener("click", () => { options.onUp && options.onUp(); });
    const down = createElement("button", "move-button", "↓");
    down.type = "button";
    down.setAttribute("aria-label", "下へ移動");
    down.addEventListener("click", () => { options.onDown && options.onDown(); });
    controls.append(up, down);
  }

  if (options.onDelete) {
    const remove = createElement("button", "delete-button", "削除");
    remove.type = "button";
    remove.addEventListener("click", () => {
      if (!window.confirm("この項目を削除しますか？")) return;
      options.onDelete();
      markDirty();
    });
    controls.appendChild(remove);
  }
  header.appendChild(controls);
  return header;
}

/* ===== お知らせ ===== */
function renderNews() {
  if (!newsEditor) return;
  newsEditor.replaceChildren();

  if (state.news.length === 0) {
    newsEditor.appendChild(createElement("p", "editor-empty", "お知らせはまだ登録されていません。"));
    return;
  }

  state.news.forEach((item, index) => {
    const record = createElement("article", "admin-record");
    record.dataset.id = item.id || makeId("news");
    record.appendChild(createRecordHeader(`お知らせ ${index + 1}`, {
      onUp: () => { state.news = collectNews(); if (move(state.news, index, -1)) { renderNews(); markDirty(); } },
      onDown: () => { state.news = collectNews(); if (move(state.news, index, 1)) { renderNews(); markDirty(); } },
      onDelete: () => {
        const targetId = record.dataset.id;
        state.news = collectNews().filter((newsItem) => newsItem.id !== targetId);
        renderNews();
      }
    }));

    const grid = createElement("div", "record-grid");
    const date = createInput("date", item.date, { required: true });
    date.dataset.field = "date";

    const category = document.createElement("select");
    category.dataset.field = "category";
    Object.entries(categoryLabels).forEach(([value, label]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      option.selected = item.category === value;
      category.appendChild(option);
    });

    const title = createInput("text", item.title, { required: true, maxLength: 100 });
    title.dataset.field = "title";

    const body = document.createElement("textarea");
    body.value = item.body || "";
    body.maxLength = 1000;
    body.rows = 3;
    body.placeholder = "補足が必要な場合のみ入力してください";
    body.dataset.field = "body";

    const published = createInput("checkbox", "");
    published.checked = item.published !== false;
    published.dataset.field = "published";
    const publishLabel = createElement("label", "publish-toggle");
    publishLabel.append(published, createElement("span", "", "公開する"));

    grid.append(
      createField("公開日", date),
      createField("分類", category),
      createField("タイトル", title, "field-wide"),
      createField("詳細", body, "field-wide"),
      publishLabel
    );
    record.appendChild(grid);
    newsEditor.appendChild(record);
  });
}

function collectNews() {
  return [...newsEditor.querySelectorAll(".admin-record")].map((record) => ({
    id: record.dataset.id,
    date: record.querySelector('[data-field="date"]').value,
    category: record.querySelector('[data-field="category"]').value,
    title: record.querySelector('[data-field="title"]').value.trim(),
    body: record.querySelector('[data-field="body"]').value.trim(),
    published: record.querySelector('[data-field="published"]').checked
  }));
}

/* ===== 臨時休診 ===== */
function renderClosures() {
  if (!closureEditor) return;
  closureEditor.replaceChildren();

  if (state.closures.length === 0) {
    closureEditor.appendChild(createElement("p", "editor-empty", "臨時休診はまだ登録されていません。"));
    return;
  }

  state.closures.forEach((item, index) => {
    const record = createElement("article", "admin-record");
    record.dataset.id = item.id || makeId("closure");
    record.appendChild(createRecordHeader(`臨時休診 ${index + 1}`, {
      onDelete: () => {
        const targetId = record.dataset.id;
        state.closures = collectClosures().filter((closureItem) => closureItem.id !== targetId);
        renderClosures();
      }
    }));

    const grid = createElement("div", "record-grid closure-grid");
    const start = createInput("date", item.start, { required: true });
    start.dataset.field = "start";
    const end = createInput("date", item.end, { required: true });
    end.dataset.field = "end";
    end.min = item.start || "";
    start.addEventListener("change", () => {
      end.min = start.value;
      if (end.value < start.value) end.value = start.value;
    });
    const label = createInput("text", item.label, { required: true, maxLength: 40, placeholder: "例：年末年始" });
    label.dataset.field = "label";

    grid.append(
      createField("開始日", start),
      createField("終了日", end),
      createField("カレンダーの表示名", label, "field-wide")
    );
    record.appendChild(grid);
    closureEditor.appendChild(record);
  });
}

function collectClosures() {
  return [...closureEditor.querySelectorAll(".admin-record")].map((record) => ({
    id: record.dataset.id,
    start: record.querySelector('[data-field="start"]').value,
    end: record.querySelector('[data-field="end"]').value,
    label: record.querySelector('[data-field="label"]').value.trim()
  }));
}

/* ===== 検査 ===== */
function renderTests() {
  if (!testEditor) return;
  testEditor.replaceChildren();

  if (state.tests.length === 0) {
    testEditor.appendChild(createElement("p", "editor-empty", "検査はまだ登録されていません。"));
    return;
  }

  state.tests.forEach((item, index) => {
    const record = createElement("article", "admin-record");
    record.dataset.id = item.id || makeId("test");
    record.appendChild(createRecordHeader(`検査 ${index + 1}`, {
      onUp: () => { state.tests = collectTests(); if (move(state.tests, index, -1)) { renderTests(); markDirty(); } },
      onDown: () => { state.tests = collectTests(); if (move(state.tests, index, 1)) { renderTests(); markDirty(); } },
      onDelete: () => {
        const targetId = record.dataset.id;
        state.tests = collectTests().filter((test) => test.id !== targetId);
        renderTests();
      }
    }));

    const grid = createElement("div", "record-grid");
    const title = createInput("text", item.title, { required: true, maxLength: 100 });
    title.dataset.field = "title";
    const body = document.createElement("textarea");
    body.value = item.body || "";
    body.maxLength = 600;
    body.rows = 3;
    body.placeholder = "検査の説明（任意）";
    body.dataset.field = "body";

    grid.append(
      createField("検査の名称", title, "field-wide"),
      createField("説明", body, "field-wide")
    );
    record.appendChild(grid);
    testEditor.appendChild(record);
  });
}

function collectTests() {
  return [...testEditor.querySelectorAll(".admin-record")].map((record) => ({
    id: record.dataset.id,
    title: record.querySelector('[data-field="title"]').value.trim(),
    body: record.querySelector('[data-field="body"]').value.trim()
  }));
}

/* ===== ワクチン ===== */
function renderVaccines() {
  if (!vaccineEditor) return;
  vaccineEditor.replaceChildren();

  if (state.vaccines.length === 0) {
    vaccineEditor.appendChild(createElement("p", "editor-empty", "ワクチンはまだ登録されていません。"));
    return;
  }

  state.vaccines.forEach((item, index) => {
    const record = createElement("article", "admin-record compact-record");
    record.dataset.id = item.id || makeId("vac");
    record.appendChild(createRecordHeader(`ワクチン ${index + 1}`, {
      onUp: () => { state.vaccines = collectVaccines(); if (move(state.vaccines, index, -1)) { renderVaccines(); markDirty(); } },
      onDown: () => { state.vaccines = collectVaccines(); if (move(state.vaccines, index, 1)) { renderVaccines(); markDirty(); } },
      onDelete: () => {
        const targetId = record.dataset.id;
        state.vaccines = collectVaccines().filter((vac) => vac.id !== targetId);
        renderVaccines();
      }
    }));

    const grid = createElement("div", "record-grid");
    const label = createInput("text", item.label, { required: true, maxLength: 60, placeholder: "例：インフルエンザワクチン" });
    label.dataset.field = "label";

    const wide = createInput("checkbox", "");
    wide.checked = !!item.wide;
    wide.dataset.field = "wide";
    const wideLabel = createElement("label", "publish-toggle");
    wideLabel.append(wide, createElement("span", "", "横幅いっぱいで表示（長い名称向け）"));

    grid.append(createField("名称", label, "field-wide"), wideLabel);
    record.appendChild(grid);
    vaccineEditor.appendChild(record);
  });
}

function collectVaccines() {
  return [...vaccineEditor.querySelectorAll(".admin-record")].map((record) => ({
    id: record.dataset.id,
    label: record.querySelector('[data-field="label"]').value.trim(),
    wide: record.querySelector('[data-field="wide"]').checked
  }));
}

/* ===== 健診 ===== */
function renderCheckups() {
  if (!checkupEditor) return;
  checkupEditor.replaceChildren();

  if (state.checkups.length === 0) {
    checkupEditor.appendChild(createElement("p", "editor-empty", "健診はまだ登録されていません。"));
    return;
  }

  state.checkups.forEach((item, index) => {
    const record = createElement("article", "admin-record compact-record");
    record.dataset.id = item.id || makeId("chk");
    record.appendChild(createRecordHeader(`健診 ${index + 1}`, {
      onUp: () => { state.checkups = collectCheckups(); if (move(state.checkups, index, -1)) { renderCheckups(); markDirty(); } },
      onDown: () => { state.checkups = collectCheckups(); if (move(state.checkups, index, 1)) { renderCheckups(); markDirty(); } },
      onDelete: () => {
        const targetId = record.dataset.id;
        state.checkups = collectCheckups().filter((chk) => chk.id !== targetId);
        renderCheckups();
      }
    }));

    const grid = createElement("div", "record-grid");
    const label = createInput("text", item.label, { required: true, maxLength: 60, placeholder: "例：小松市の特定健康診査" });
    label.dataset.field = "label";
    grid.append(createField("名称", label, "field-wide"));
    record.appendChild(grid);
    checkupEditor.appendChild(record);
  });
}

function collectCheckups() {
  return [...checkupEditor.querySelectorAll(".admin-record")].map((record) => ({
    id: record.dataset.id,
    label: record.querySelector('[data-field="label"]').value.trim()
  }));
}

/* ===== ハイライト（重要なお知らせ） ===== */
function initHighlight() {
  const h = state.highlight || {};
  const enabled = document.querySelector('[data-highlight-field="enabled"]');
  if (enabled) enabled.checked = !!h.enabled;
  const mode = (h.mode === "popup") ? "popup" : "banner";
  const modeInput = document.querySelector(`[data-highlight-mode][value="${mode}"]`);
  if (modeInput) modeInput.checked = true;
  ["title", "body", "linkText", "linkUrl"].forEach((key) => {
    const field = document.querySelector(`[data-highlight-field="${key}"]`);
    if (field) field.value = typeof h[key] === "string" ? h[key] : "";
  });
}

function collectHighlight() {
  const get = (key) => {
    const field = document.querySelector(`[data-highlight-field="${key}"]`);
    return field ? field.value.trim() : "";
  };
  const enabledField = document.querySelector('[data-highlight-field="enabled"]');
  const modeField = document.querySelector('[data-highlight-mode]:checked');
  return {
    enabled: enabledField ? enabledField.checked : false,
    mode: modeField ? modeField.value : "banner",
    title: get("title"),
    body: get("body"),
    linkText: get("linkText"),
    linkUrl: get("linkUrl")
  };
}

function collectNote(name) {
  const field = document.querySelector(`[data-note-field="${name}"]`);
  return field ? field.value.trim() : "";
}

function initNotes() {
  const vac = document.querySelector('[data-note-field="vaccineNote"]');
  if (vac) vac.value = state.vaccineNote || "";
  const chk = document.querySelector('[data-note-field="checkupNote"]');
  if (chk) chk.value = state.checkupNote || "";
}

/* ===== 追加ボタン ===== */
document.querySelector("[data-add-news]")?.addEventListener("click", () => {
  state.news = collectNews();
  state.news.unshift({ id: makeId("news"), date: todayKey(), category: "notice", title: "", body: "", published: true });
  renderNews();
  markDirty();
  newsEditor.querySelector('input[data-field="title"]')?.focus();
});

document.querySelector("[data-add-closure]")?.addEventListener("click", () => {
  state.closures = collectClosures();
  const date = todayKey();
  state.closures.unshift({ id: makeId("closure"), start: date, end: date, label: "" });
  renderClosures();
  markDirty();
  closureEditor.querySelector('input[data-field="label"]')?.focus();
});

document.querySelector("[data-add-test]")?.addEventListener("click", () => {
  state.tests = collectTests();
  state.tests.push({ id: makeId("test"), title: "", body: "" });
  renderTests();
  markDirty();
  [...testEditor.querySelectorAll('input[data-field="title"]')].pop()?.focus();
});

document.querySelector("[data-add-vaccine]")?.addEventListener("click", () => {
  state.vaccines = collectVaccines();
  state.vaccines.push({ id: makeId("vac"), label: "", wide: false });
  renderVaccines();
  markDirty();
  [...vaccineEditor.querySelectorAll('input[data-field="label"]')].pop()?.focus();
});

document.querySelector("[data-add-checkup]")?.addEventListener("click", () => {
  state.checkups = collectCheckups();
  state.checkups.push({ id: makeId("chk"), label: "" });
  renderCheckups();
  markDirty();
  [...checkupEditor.querySelectorAll('input[data-field="label"]')].pop()?.focus();
});

/* ===== タブ ===== */
document.querySelectorAll("[data-tab]").forEach((tab) => {
  tab.addEventListener("click", () => {
    const selected = tab.dataset.tab;
    document.querySelectorAll("[data-tab]").forEach((button) => {
      const active = button === tab;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", String(active));
    });
    document.querySelectorAll("[data-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.panel !== selected;
    });
    if (saveBar) saveBar.hidden = selected === "settings";
  });
});

contentForm?.addEventListener("input", markDirty);

contentForm?.addEventListener("submit", (event) => {
  const invalidControl = contentForm.querySelector(":invalid");
  if (invalidControl) {
    event.preventDefault();
    const panel = invalidControl.closest("[data-panel]");
    if (panel) document.querySelector(`[data-tab="${panel.dataset.panel}"]`)?.click();
    invalidControl.focus();
    invalidControl.reportValidity();
    return;
  }
  const closures = collectClosures();
  const invalidRange = closures.find((item) => item.start > item.end);
  if (invalidRange) {
    event.preventDefault();
    document.querySelector('[data-tab="closures"]')?.click();
    window.alert("臨時休診の終了日は開始日以降にしてください。");
    return;
  }
  payloadInput.value = JSON.stringify({
    highlight: collectHighlight(),
    news: collectNews(),
    closures,
    tests: collectTests(),
    vaccines: collectVaccines(),
    vaccineNote: collectNote("vaccineNote"),
    checkups: collectCheckups(),
    checkupNote: collectNote("checkupNote")
  });
  isDirty = false;
});

window.addEventListener("beforeunload", (event) => {
  if (!isDirty) return;
  event.preventDefault();
  event.returnValue = "";
});

renderNews();
renderClosures();
renderTests();
renderVaccines();
renderCheckups();
initHighlight();
initNotes();
