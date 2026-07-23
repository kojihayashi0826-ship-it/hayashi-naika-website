const defaultData = {
  updatedAt: null,
  highlight: { enabled:false, mode:"banner", title:"", body:"", linkText:"", linkUrl:"" },
  reservation: { enabled:false, buttonText:"予約はこちら（デジスマ）", url:"", note:"" },
  recruitment: { enabled:false, title:"スタッフ募集中", lead:"", conditions:[], note:"", buttonText:"電話で問い合わせる", buttonUrl:"tel:0761246288" },
  news: [], closures: [], tests: [], vaccines: [], vaccineNote:"", checkups: [], checkupNote:""
};
let data = structuredClone(defaultData);
const form = document.querySelector("[data-editor-form]");
const conditionsRoot = document.querySelector("[data-conditions]");
const status = document.querySelector("[data-load-status]");
const message = document.querySelector("[data-editor-message]");

function makeId() { return `recruit-${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function safeData(input) {
  const merged = { ...structuredClone(defaultData), ...(input && typeof input === "object" ? input : {}) };
  merged.reservation = { ...defaultData.reservation, ...(input?.reservation || {}) };
  merged.recruitment = { ...defaultData.recruitment, ...(input?.recruitment || {}) };
  merged.recruitment.conditions = Array.isArray(input?.recruitment?.conditions) ? input.recruitment.conditions : [];
  return merged;
}
function field(path) { return document.querySelector(`[data-field="${path}"]`); }
function setValue(path, value) {
  const el = field(path); if (!el) return;
  if (el.type === "checkbox") el.checked = !!value; else el.value = typeof value === "string" ? value : "";
}
function renderConditions() {
  conditionsRoot.replaceChildren();
  data.recruitment.conditions.forEach((item, index) => {
    const row = document.createElement("div"); row.className = "condition-row"; row.dataset.id = item.id || makeId();
    const label = document.createElement("label"); label.textContent = "項目名";
    const labelInput = document.createElement("input"); labelInput.maxLength = 40; labelInput.value = item.label || ""; labelInput.dataset.conditionField = "label"; label.appendChild(labelInput);
    const value = document.createElement("label"); value.textContent = "内容";
    const valueInput = document.createElement("textarea"); valueInput.rows = 2; valueInput.maxLength = 300; valueInput.value = item.value || ""; valueInput.dataset.conditionField = "value"; value.appendChild(valueInput);
    const remove = document.createElement("button"); remove.type = "button"; remove.textContent = "削除"; remove.addEventListener("click", () => { collectConditions(); data.recruitment.conditions.splice(index,1); renderConditions(); });
    row.append(label,value,remove); conditionsRoot.appendChild(row);
  });
}
function render() {
  ["enabled","buttonText","url","note"].forEach(k => setValue(`reservation.${k}`, data.reservation[k]));
  ["enabled","title","lead","note","buttonText","buttonUrl"].forEach(k => setValue(`recruitment.${k}`, data.recruitment[k]));
  renderConditions();
}
function collectConditions() {
  data.recruitment.conditions = [...conditionsRoot.querySelectorAll(".condition-row")].map(row => ({ id:row.dataset.id, label:row.querySelector('[data-condition-field="label"]').value.trim(), value:row.querySelector('[data-condition-field="value"]').value.trim() })).filter(i => i.label || i.value);
}
function collect() {
  const get = p => { const el=field(p); return el.type === "checkbox" ? el.checked : el.value.trim(); };
  data.reservation = { enabled:get("reservation.enabled"), buttonText:get("reservation.buttonText"), url:get("reservation.url"), note:get("reservation.note") };
  collectConditions();
  data.recruitment = { enabled:get("recruitment.enabled"), title:get("recruitment.title"), lead:get("recruitment.lead"), conditions:data.recruitment.conditions, note:get("recruitment.note"), buttonText:get("recruitment.buttonText"), buttonUrl:get("recruitment.buttonUrl") };
  data.updatedAt = new Date().toISOString();
}
async function loadCurrent() {
  try { const response = await fetch("data/site-updates.json", { cache:"no-store" }); if(!response.ok) throw new Error(`HTTP ${response.status}`); data=safeData(await response.json()); render(); status.textContent="現在の設定を読み込みました"; message.textContent="内容を編集後、更新用JSONを作成してください。"; }
  catch(e){ status.textContent="自動読込に失敗しました。JSONを選択してください。"; message.textContent="GitHub Pages公開前やローカル表示では、JSON選択を使用してください。"; }
}
document.querySelector("[data-load-current]").addEventListener("click", loadCurrent);
document.querySelector("[data-file-input]").addEventListener("change", async (event) => { const file=event.target.files?.[0]; if(!file)return; try{ data=safeData(JSON.parse(await file.text())); render(); status.textContent=`${file.name} を読み込みました`; message.textContent="内容を編集後、更新用JSONを作成してください。"; }catch(e){ status.textContent="JSONを読み込めませんでした"; } });
document.querySelector("[data-add-condition]").addEventListener("click", () => { collectConditions(); data.recruitment.conditions.push({id:makeId(),label:"",value:""}); renderConditions(); conditionsRoot.lastElementChild?.querySelector("input")?.focus(); });
form.addEventListener("submit", (event) => { event.preventDefault(); collect(); if(data.reservation.enabled && !/^https?:\/\//.test(data.reservation.url)){ message.textContent="予約ボタンを表示する場合は、https:// から始まる予約URLが必要です。"; return; } if(data.recruitment.enabled && !data.recruitment.title){ message.textContent="スタッフ募集を表示する場合は、見出しを入力してください。"; return; } const blob=new Blob([JSON.stringify(data,null,2)+"\n"],{type:"application/json"}); const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download="site-updates.json"; a.click(); URL.revokeObjectURL(url); message.textContent="site-updates.jsonを作成しました。GitHubのdataフォルダ内で置き換えてください。"; });
render();
