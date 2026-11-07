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
let data = { ...clone(defaultData), ...ClinicContent.normalize(defaultData) };
let loaded = false;
let dirty = false;
let baseDocument = null;
// Ignore an older read if a newer read, connection, or edit has already won.
let contentLoadVersion = 0;
let contentEditVersion = 0;

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

function localDateString() { return ClinicSchedule.japanNow().key; }

function safeData(input) {
  if (!input || typeof input !== "object" || !Array.isArray(input.news) || !Array.isArray(input.closures)) throw new Error("お知らせ・休診情報を含むsite-updates.jsonを指定してください。");
  const source = input;
  const merged = { ...clone(defaultData), ...source, ...ClinicContent.normalize(source) };
  merged.siteStatus = { ...defaultData.siteStatus, ...(source.siteStatus || {}) };
  merged.highlight = merged.highlights[0] ? { ...merged.highlights[0] } : { ...defaultData.highlight };
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
        published: item?.published !== false,
        featured: item?.featured === true
      }))
    : [];
  merged.closures = source.closures.map(item => ({ ...ClinicSchedule.normalize(item), id: item?.id || makeId("closure") }));
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
  form.removeAttribute('inert');
  dirty = false;
  status.textContent = text;
  downloadButton.disabled = false;
  folderButton.disabled = !("showDirectoryPicker" in window);
  document.querySelector("[data-preview]").disabled = false;
  baseDocument = clone(data);
  setMessage("内容を編集し、表示を確認してから「公開する」を押してください。");
  document.dispatchEvent(new CustomEvent("clinic-editor-loaded"));
}

function markDirty() {
  if (!loaded) return;
  dirty = true;
  contentEditVersion++;
  setMessage("未公開の変更があります。");
  document.dispatchEvent(new CustomEvent("clinic-editor-changed"));
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
    chip.textContent = item.published ? "掲載対象" : "非掲載";
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
      ["vaccine", "予防接種"]
    ].forEach(([value, label]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      option.selected = (item.category === "trend" ? "notice" : item.category) === value;
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
    publishText.textContent = "掲載する";
    publishLabel.append(publishInput, publishText);
    const featuredLabel=document.createElement('label');featuredLabel.className='publish-switch';
    const featuredInput=document.createElement('input');featuredInput.type='checkbox';featuredInput.checked=item.featured===true;featuredInput.dataset.newsField='featured';
    const featuredText=document.createElement('span');featuredText.textContent='ページ上部にも表示';
    featuredLabel.append(featuredInput,featuredText);
    meta.append(dateLabel, categoryLabel, publishLabel, featuredLabel);

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
    published: row.querySelector('[data-news-field="published"]').checked,
    featured: row.querySelector('[data-news-field="featured"]').checked
  }));
}

function closureField(row, key, labelText, type, value, choices = ClinicSchedule.periods) {
  const label = document.createElement("label"); label.textContent = labelText;
  const input = document.createElement(type === "textarea" ? "textarea" : type === "select" ? "select" : "input");
  if (type === "select") {
    Object.entries(choices).forEach(([value,text]) => { const option = document.createElement("option"); option.value=value; option.textContent=text; input.append(option); });
  } else if (type === "textarea") { input.rows=3; input.maxLength=800; }
  else input.type = type;
  if (type === "text") input.maxLength=80;
  input.dataset.closureField = key;
  if (type === "checkbox") { input.checked=Boolean(value); label.className="inline-check"; label.prepend(input); }
  else { input.value=value || ""; label.append(input); }
  row.append(label); return input;
}

function renderClosures() {
  closuresRoot.replaceChildren();
  if (!data.closures.length) closuresRoot.append(emptyState("休診日はまだ登録されていません。"));
  data.closures.forEach((item,index) => {
    const card=document.createElement("article"); card.className="item-card closure-row"; card.dataset.id=item.id || makeId("closure");
    const season = Object.hasOwn(ClinicSchedule.seasonalNotices, item.season) ? ClinicSchedule.seasonalNotices[item.season] : null;
    if (season) card.dataset.season = item.season;
    const header=document.createElement("div"); header.className="item-card-header";
    const title=document.createElement("strong"); title.textContent=season ? season.title : `休診のお知らせ ${index+1}`;
    header.append(title,createButton("削除", "danger-button",()=>{
      if (!window.confirm("この休診を削除しますか？公開後にカレンダーとお知らせの両方から消えます。")) return;
      collectClosures(); data.closures.splice(index,1); renderClosures(); markDirty();
    })); card.append(header);
    const dates=document.createElement("div"); dates.className="closure-dates";
    const sessionRange = ClinicSchedule.hasSessionRange(item) || (season && (!item.period || item.period === "all"));
    const start=closureField(dates,"start","休診開始日","date",item.start);
    if (sessionRange) closureField(dates,"startSession","休診開始の時間帯","select",item.startSession || "am", { am: "午前から休診", pm: "午後から休診（午前は診療）" });
    const end=closureField(dates,"end","休診最終日（1日だけなら空欄可）","date",item.end);
    if (sessionRange) {
      dates.classList.add("closure-session-dates");
      closureField(dates,"endSession","休診終了の時間帯","select",item.endSession || "pm", { pm: "午後まで休診", am: "午前まで休診（午後は診療）" });
    }
    end.min=start.value;
    if (!sessionRange) closureField(dates,"period","期間中、毎日休診する時間帯","select",item.period || "all");
    let previousStart=start.value;
    start.addEventListener("input",()=>{
      if (!end.value || end.value === previousStart) end.value=start.value;
      end.min=start.value;
      previousStart=start.value; collectClosures(); updateClosurePreview(true,start.value);
    });
    card.append(dates);
    if (season) {
      closureField(card,"noticeDate","お知らせの掲載日（表示用）","date",item.noticeDate || localDateString());
      const help=document.createElement("p"); help.className="field-help";
      help.textContent=sessionRange ? "初日と最終日の間は終日休診です。半日だけ休む場合は同じ日付にし、午前のみは「午前から／午前まで」、午後のみは「午後から／午後まで」を選びます。木曜・日曜・祝日は通常どおり休診です。" : "この予定は、期間中の各日に同じ時間帯の休診を設定しています。";
      card.append(help);
    }
    if (!season) {
      const text=document.createElement("div"); text.className="two-columns";
      closureField(text,"label","見出し（例：移転に伴う臨時休診）","text",item.label);
      closureField(text,"noticeDate","お知らせの掲載日（表示用）","date",item.noticeDate || localDateString());
      card.append(text);
    }
    closureField(card,"body",season ? "お知らせに追記する内容（任意）" : "補足・理由（任意）","textarea",item.body);
    const noticePreview=document.createElement("p"); noticePreview.className="closure-notice-preview"; noticePreview.dataset.closureNoticePreview=""; card.append(noticePreview);
    const flags=document.createElement("div"); flags.className="closure-flags";
    closureField(flags,"published","この休診を反映する","checkbox",item.published !== false);
    closureField(flags,"announce","「お知らせ」にも自動掲載する","checkbox",item.announce !== false);
    card.append(flags); closuresRoot.append(card);
  });
  updateClosurePreview();
}

function collectClosures() {
  data.closures = [...closuresRoot.querySelectorAll(".closure-row")].map(row => {
    const c={id:row.dataset.id};
    if (row.dataset.season) {
      c.season=row.dataset.season;
      c.label=ClinicSchedule.seasonalNotices[c.season].label;
      c.period="all";
    }
    row.querySelectorAll("[data-closure-field]").forEach(input=> { c[input.dataset.closureField]=input.type === "checkbox" ? input.checked : input.value.trim(); });
    if (ClinicSchedule.hasSessionRange(c)) c.period="all";
    c.end=c.end || c.start;
    return c;
  });
}
function updateClosurePreview(jump=false,targetDate="") {
  const root = document.querySelector("[data-editor-calendar]");
  const first = data.closures.find(c=>c.published !== false && ClinicSchedule.isDate(c.start));
  const month=jump && ClinicSchedule.isDate(targetDate) ? targetDate.slice(0,7) : jump && first ? first.start.slice(0,7) : undefined;
  ClinicSchedule.renderCalendar(root,data.closures,{limit:false,month});
  closuresRoot.querySelectorAll(".closure-row").forEach((row,index)=>{
    const preview=row.querySelector("[data-closure-notice-preview]");
    const item=data.closures[index];
    const previewClosures=data.closures.map((c,i)=>i===index ? {...c,published:true,enabled:true,announce:true} : c);
    const notice=ClinicSchedule.closureNews(previewClosures).find(n=>n.id===`closure-news-${item.id}`);
    preview.textContent=notice ? notice.body : "有効な日付と時間帯を入力すると、お知らせの本文を確認できます。";
  });
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
  ClinicEditorContent.render();
  ClinicEditorTheme.render();
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
  ClinicEditorContent.collect();
  ClinicEditorTheme.collect();
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

}

function isSafeLink(value) {
  return value === "" || /^(https?:\/\/|tel:|#)/.test(value);
}

function validate() {
  const errors = [];
  if (data.siteStatus.enabled && !data.siteStatus.title && !data.siteStatus.body) {
    errors.push("正式公開前の案内を表示する場合は、見出しか本文を入力してください。");
  }
  errors.push(...ClinicEditorContent.validate());
  data.news.forEach((item, index) => {
    if (item.published && !ClinicSchedule.isDate(item.date)) {
      errors.push(`公開するお知らせ ${index + 1} の日付を入力してください。`);
    }
    if (item.published && !item.title) {
      errors.push(`公開するお知らせ ${index + 1} の見出しを入力してください。`);
    }
  });
  data.closures.forEach((item,index) => {
    if (item.published === false) return;
    if (!ClinicSchedule.isDate(item.start) || !ClinicSchedule.isDate(item.end) || !item.label) errors.push(`臨時休診 ${index+1} の日付・見出しを入力してください。`);
    else if (item.end < item.start) errors.push(`臨時休診 ${index+1} の終了日は開始日以降にしてください。`);
    else if ((Date.parse(item.end)-Date.parse(item.start))/86400000 >= 366) errors.push(`臨時休診 ${index+1} は366日以内で指定してください。`);
    if (item.announce && !ClinicSchedule.isDate(item.noticeDate)) errors.push(`臨時休診 ${index+1} の掲載日を入力してください。`);
    if (!Object.hasOwn(ClinicSchedule.periods,item.period)) errors.push(`臨時休診 ${index+1} の時間帯を確認してください。`);
    if (!ClinicSchedule.validSessionRange(item)) errors.push(`臨時休診 ${index+1} の終了時間帯は開始時間帯以降にしてください。`);
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
  if (dirty && !window.confirm("未公開の変更を破棄して、最新の内容を読み込みますか？")) return;
  if (window.ClinicPublisher?.isConnected()) return window.ClinicPublisher.reload();
  const generation=++contentLoadVersion,edits=contentEditVersion;
  status.textContent = "保存済みの最新内容を読み込み中…";
  try {
    if (window.location.protocol === "file:") throw new Error("file protocol");
    let current,fromSaved=true;
    try {
      // Editor-only read: bypass the Pages deployment delay without exposing a token.
      const file=await ClinicContent.fetchJSON("https://api.github.com/repos/kojihayashi0826-ship-it/hayashi-naika-website/contents/data/site-updates.json?ref=main&t="+Date.now());
      if(file.encoding!=='base64' || typeof file.content!=='string')throw Error('Invalid source');
      current=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(file.content.replace(/\s/g,'')),c=>c.charCodeAt(0))));
    } catch {
      fromSaved=false;
      current=await ClinicContent.fetchJSON("data/site-updates.json?v="+Date.now());
    }
    if(generation!==contentLoadVersion)return;
    if(edits!==contentEditVersion){status.textContent="編集中の内容を保持しました";return;}
    data=safeData(current);render();
    setLoaded(fromSaved?"保存済みの最新内容を読み込みました":"公開サイトの表示内容を読み込みました");
    if(!fromSaved)setMessage("保存済みデータを取得できなかったため、現在の公開内容を表示しています。保存直後の変更は接続後に確認できます。");
  } catch (error) {
    if(generation!==contentLoadVersion || edits!==contentEditVersion)return;
    if(!loaded){downloadButton.disabled=true;folderButton.disabled=true;}
    status.textContent="読み込みを確認できませんでした";
    setMessage("編集中の内容は保持しています。接続して最新内容を読み込むか、バックアップJSONを選択してください。", "error");
  }
}

function loadFromFile(file) {
  return file.text().then((text) => {
    const restored = safeData(JSON.parse(text));
    if (!window.confirm("ファイルの内容を編集画面へ読み込みます。公開サイトはまだ変更されません。続けますか？")) return;
    data = restored; render();
    if (!loaded) setLoaded(`${file.name} を読み込みました`);
    markDirty();
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
    const publication = ClinicEditorContent.publication(JSON.parse(preparedJson()));
    const text = JSON.stringify(publication.data,null,2)+"\n";
    if (!("showDirectoryPicker" in window)) throw new Error("この機能はChromeで利用してください。");
    const rootHandle = await window.showDirectoryPicker({ mode: "readwrite" });
    try {
      await rootHandle.getFileHandle("index.html");
    } catch (error) {
      throw new Error("index.html があるサイト最上位フォルダを選択してください。");
    }
    const indexHandle=await rootHandle.getFileHandle('index.html');
    const indexHTML=ClinicContent.updateFaqHTML(await (await indexHandle.getFile()).text(),publication.data.faqs);
    await ClinicEditorContent.saveFiles(rootHandle,publication.files);
    const indexWriter=await indexHandle.createWritable();
    await indexWriter.write(indexHTML);await indexWriter.close();
    const dataHandle = await rootHandle.getDirectoryHandle("data", { create: true });
    const fileHandle = await dataHandle.getFileHandle("site-updates.json", { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(text);
    await writable.close();
    setMessage("ローカルフォルダへ保存しました。公開サイトはまだ変更されていません。", "success");
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
    if (button.parentElement.scrollWidth > button.parentElement.clientWidth) button.parentElement.scrollLeft = Math.max(0, button.offsetLeft - 12);
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

function addClosure(season) {
  collectClosures();
  const item = { id: makeId("closure"), start: "", end: "", label: "臨時休診", period: "all", published: true, announce: true, noticeDate: localDateString(), body: "" };
  if (season) {
    item.season = season;
    item.label = ClinicSchedule.seasonalNotices[season].label;
  }
  data.closures.push(item);
  renderClosures();
  closuresRoot.lastElementChild?.querySelector("input")?.focus();
  markDirty();
}
document.querySelector("[data-add-closure]").addEventListener("click", () => addClosure());
document.querySelectorAll("[data-add-season]").forEach(button => {
  button.addEventListener("click", () => addClosure(button.dataset.addSeason));
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
  if (event.target.matches("[data-closure-field]")) { collectClosures(); updateClosurePreview(); }
  if (event.target.matches('[data-news-field="published"], [data-news-field="title"]')) {
    const row = event.target.closest(".news-row");
    const chip = row?.querySelector(".status-chip");
    const heading = row?.querySelector(".item-card-title strong");
    if (chip) {
      const published = row.querySelector('[data-news-field="published"]').checked;
      chip.textContent = published ? "掲載対象" : "非掲載";
      chip.classList.toggle("is-published", published);
    }
    if (heading && event.target.matches('[data-news-field="title"]')) {
      heading.textContent = event.target.value || "新しいお知らせ";
    }
  }
});

downloadButton.addEventListener("click",()=>{
  try { downloadJson(preparedJson()); setMessage("バックアップを保存しました。公開サイトはまだ変更されていません。"); }
  catch(error) { setMessage(error.message,"error"); }
});
form.addEventListener("submit",event=>{
  event.preventDefault();
  if (window.ClinicPublisher) window.ClinicPublisher.publish();
  else setMessage("公開機能を読み込めませんでした。ページを再読み込みしてください。","error");
});
document.querySelector("[data-new-closure-notice]").addEventListener("click",()=>{
  document.querySelector('[data-tab="closures"]').click();
  document.querySelector("[data-add-closure]").click();
});
document.querySelector("[data-open-seasonal]").addEventListener("click",()=>{
  document.querySelector('[data-tab="closures"]').click();
  document.querySelector("[data-add-season]").focus();
});
document.querySelector('[data-tab="closures"]').addEventListener("click",()=>updateClosurePreview(true));

function showPreview() {
  try { collect(); const errors=validate(); if (errors.length) throw new Error(errors[0]); }
  catch(error) { setMessage(error.message,"error"); return; }
  const root=document.querySelector("[data-preview-body]"); root.replaceChildren();
  const section=(title,body)=>{ const card=document.createElement("section"); card.className="preview-card"; const h=document.createElement("h3"); h.textContent=title; card.append(h); if (body) { const p=document.createElement("p"); p.textContent=body; card.append(p); } root.append(card); return card; };
  const themeCard=section("配色プレビュー");
  const themeSample=document.createElement("div");themeSample.className="theme-preview";themeCard.append(themeSample);
  ClinicEditorTheme.preview(themeSample,data.theme);
  if (data.siteStatus.enabled) section(data.siteStatus.title,data.siteStatus.body);
  ClinicContent.visibleHighlights(data).forEach(h=>section(h.title,h.body));
  ClinicEditorContent.preview(root,section);
  const cal=section("診療カレンダー"); const widget=document.createElement("div"); cal.append(widget);
  const first=ClinicSchedule.active(data.closures).find(c=>c.end>=localDateString());
  ClinicSchedule.renderCalendar(widget,data.closures,{limit:false,month:first?.start.slice(0,7)});
  const news=[...data.news.filter(c=>c.published),...ClinicSchedule.closureNews(data.closures)].sort((a,b)=>b.date.localeCompare(a.date));
  if (!news.length) section("お知らせ","現在、新しいお知らせはありません。");
  news.forEach(n=>section(`${n.date}　${n.title}`,n.body));
  if (data.recruitment.enabled) section(data.recruitment.title,[data.recruitment.lead,...data.recruitment.conditions.map(c=>c.label+"："+c.value),data.recruitment.note].join("\n"));
  document.querySelector("[data-preview-dialog]").showModal();
}
document.querySelector("[data-preview]").addEventListener("click",showPreview);
document.querySelector("[data-close-preview]").addEventListener("click",()=>document.querySelector("[data-preview-dialog]").close());
// Arrow-key operation for tabs; buttons are also usable with Tab and Enter.
tabButtons.forEach((button,index)=>button.addEventListener("keydown",event=>{
  if (!["ArrowLeft","ArrowRight","Home","End"].includes(event.key)) return;
  event.preventDefault();
  const next=event.key === "Home" ? 0 : event.key === "End" ? tabButtons.length-1 : (index+(event.key === "ArrowRight" ? 1 : -1)+tabButtons.length)%tabButtons.length;
  tabButtons[next].focus(); tabButtons[next].click();
}));

folderButton.addEventListener("click", saveToFolder);
window.addEventListener("beforeunload", (event) => {
  if (!dirty) return;
  event.preventDefault();
  event.returnValue = "";
});

const requestedTab = new URLSearchParams(window.location.search).get("tab");
tabButtons.find(button => button.dataset.tab === requestedTab)?.click();
render();
window.editorReady = loadCurrent();

