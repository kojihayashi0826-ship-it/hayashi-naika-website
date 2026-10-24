/* GitHub Pages direct publisher, intentionally limited to this clinic repository.
 * Secrets are sent only to api.github.com. No third-party scripts or OAuth secret.
 * Optional at-rest storage: PBKDF2-SHA256 (600k) + AES-256-GCM, random salt/IV.
 * The GitHub token grants repo Contents permission, not file-level permission.
 */
(() => {
  "use strict";
  const owner = "kojihayashi0826-ship-it";
  const repo = "hayashi-naika-website";
  const branch = "main";
  const path = "data/site-updates.json";
  const apiRoot = `https://api.github.com/repos/${owner}/${repo}`;
  const contentEndpoint = `${apiRoot}/contents/${path}`;
  const storagePrefix = `hayashi-editor:${owner}/${repo}:`;
  const vaultKey = storagePrefix + "vault-v1";
  const draftKey = storagePrefix + "draft-v1";
  const previousKey = storagePrefix + "previous-v1";
  const pendingKey = storagePrefix + "pending-v1";
  const q = selector => document.querySelector(selector);
  const copy = value => JSON.parse(JSON.stringify(value));
  let token = null;
  let baseSha = null;
  let connected = false;
  let connecting = false;
  let publishing = false;
  let lastActivity = Date.now();
  let draftTimer = null;
  let verifyTimer = null;
  let verification = 0;
  let pending = null;

  function stable(value) {
    if (Array.isArray(value)) return value.map(stable);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.keys(value).sort().filter(k=>k!=="updatedAt" && k!=="revision").map(k=>[k,stable(value[k])]));
  }
  function fingerprint(value) { return JSON.stringify(stable(value)); }
  function readStorage(key) { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } }
  function removeStorage(key) { if(key===draftKey)window.ClinicDrafts?.remove().catch(()=>{}); try { localStorage.removeItem(key); } catch { /* No persistence in restricted browsers. */ } }
  function writeStorage(key, value) { localStorage.setItem(key,JSON.stringify(value)); }
  function connectionMessage(text, type="") {
    const element=q("[data-connection-message]"); element.textContent=text;
    element.classList.toggle("is-error",type==="error"); element.classList.toggle("is-success",type==="success");
  }
  function syncControls() {
    q("[data-publish]").disabled=!connected || !loaded || !dirty || publishing || connecting || window.ClinicEditorContent?.isBusy();
    q("[data-publish]").textContent=publishing ? "送信中…" : "公開する";
    q("[data-connect]").disabled=connecting || publishing;
    q("[data-unlock]").disabled=connecting || publishing;
    q("[data-disconnect]").disabled=publishing;
    q("[data-load-current]").disabled=publishing || connecting;
    q("[data-restore-previous]").disabled=!readStorage(previousKey) || publishing;
    const chip=q("[data-connection-state]");
    chip.textContent=connecting ? "接続中…" : connected ? "接続済み" : "未接続";
    chip.classList.toggle("is-connected",connected);
    const vault=readStorage(vaultKey);
    q("[data-credentials-new]").hidden=connected || !!vault;
    q("[data-credentials-saved]").hidden=connected || !vault;
    q("[data-connected-controls]").hidden=!connected;
  }
  function toBase64(bytes) {
    let s="";
    for (let i=0;i<bytes.length;i+=8192) s+=String.fromCharCode(...bytes.subarray(i,i+8192));
    return btoa(s);
  }
  function fromBase64(text) { return Uint8Array.from(atob(text.replace(/\s/g,"")),c=>c.charCodeAt(0)); }
  function encodeContent(text) { return toBase64(new TextEncoder().encode(text)); }
  function decodeContent(value) {
    if (value?.encoding !== "base64" || typeof value.content !== "string") throw new Error("GitHubのファイルを読み取れません。形式・サイズを確認してください。");
    return new TextDecoder("utf-8",{fatal:true}).decode(fromBase64(value.content));
  }
  function secureOrigin() {
    return location.protocol === "https:" || ["localhost","127.0.0.1","[::1]"].includes(location.hostname);
  }
  async function derive(password, salt) {
    const material=await crypto.subtle.importKey("raw",new TextEncoder().encode(password),"PBKDF2",false,["deriveKey"]);
    return crypto.subtle.deriveKey({name:"PBKDF2",salt,iterations:600000,hash:"SHA-256"},material,{name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
  }
  async function seal(secret,password) {
    if (!crypto.subtle || !secureOrigin()) throw new Error("暗号化保存にはHTTPSで開いた管理画面が必要です。");
    const salt=crypto.getRandomValues(new Uint8Array(16));
    const iv=crypto.getRandomValues(new Uint8Array(12));
    const key=await derive(password,salt);
    const encrypted=await crypto.subtle.encrypt({name:"AES-GCM",iv,additionalData:new TextEncoder().encode(storagePrefix)},key,new TextEncoder().encode(secret));
    return {version:1,kdf:"PBKDF2-SHA256",iterations:600000,cipher:"AES-256-GCM",salt:toBase64(salt),iv:toBase64(iv),ciphertext:toBase64(new Uint8Array(encrypted))};
  }
  async function unseal(vault,password) {
    if (!vault || vault.version!==1 || vault.iterations!==600000 || vault.cipher!=="AES-256-GCM" || vault.kdf!=="PBKDF2-SHA256") throw new Error("保存形式を確認できません。接続キーを再設定してください。");
    try {
      const salt=fromBase64(vault.salt),iv=fromBase64(vault.iv);
      if (salt.length!==16 || iv.length!==12) throw new Error("invalid vault");
      const key=await derive(password,salt);
      const plain=await crypto.subtle.decrypt({name:"AES-GCM",iv,additionalData:new TextEncoder().encode(storagePrefix)},key,fromBase64(vault.ciphertext));
      return new TextDecoder().decode(plain);
    } catch { throw new Error("解除できません。パスワードをご確認ください。忘れた場合は保存したキーを削除して再設定します。"); }
  }
  async function github(url, options={}, credential=token) {
    if (!url.startsWith("https://api.github.com/")) throw new Error("許可されていない送信先です。");
    if (!credential) throw new Error("先にGitHubへ接続してください。");
    let response;
    try {
      response=await fetch(url,{...options,redirect:"error",cache:"no-store",referrerPolicy:"no-referrer",
        signal:AbortSignal.timeout(25000),headers:{Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28",Authorization:`Bearer ${credential}`,...(options.body ? {"Content-Type":"application/json"} : {})}});
    } catch { const e=new Error("GitHubとの通信を確認できません。ネット接続を確認し、再度お試しください。"); e.uncertain=["PUT","PATCH"].includes(options.method); throw e; }
    if (!response.ok) {
      let text;
      if (response.status===401) text="接続キーが無効または有効期限切れです。新しいキーで接続してください。";
      else if (response.status===403 && response.headers.get("x-ratelimit-remaining")==="0") text="GitHubの利用回数制限に達しました。時間をおいて再度お試しください。";
      else if (response.status===403) text="書き込み権限がありません。対象リポジトリとContentsのRead and write権限を確認してください。";
      else if (response.status===404) text="更新先が見つからないか、アクセス権限がありません。hayashi-naika-websiteを接続キーの対象に指定してください。";
      else if (response.status===409) text="別の更新と競合しました。バックアップを保存し、最新の内容を読み込んでから編集し直してください。";
      else if (response.status===422) text="GitHubが更新を受け付けませんでした。入力内容とmainブランチの保護ルールを確認してください。";
      else text=`GitHubから正常な応答を取得できません（HTTP ${response.status}）。公開状態を確認してください。`;
      const error=new Error(text); error.status=response.status; error.uncertain=response.status>=500 && ["PUT","PATCH"].includes(options.method); throw error;
    }
    return response.json();
  }
  async function remoteDocument(credential=token,ref=branch) {
    const file=await github(`${contentEndpoint}?ref=${encodeURIComponent(ref)}&t=${Date.now()}`,{},credential);
    if (typeof file.sha!=="string") throw new Error("更新元の識別情報を取得できませんでした。");
    const content=safeData(JSON.parse(decodeContent(file)));
    return {sha:file.sha,data:content};
  }
  function clearCredentialInputs() {
    ["[data-token]","[data-vault-pass]","[data-vault-confirm]","[data-unlock-pass]"].forEach(selector=>q(selector).value="");
  }
  async function establish(candidate) {
    if (!secureOrigin()) throw new Error("接続と公開はHTTPSの公開版管理画面から行ってください。ローカルファイルでは公開できません。");
    if (!/^github_pat_[A-Za-z0-9_]+$/.test(candidate)) throw new Error("Fine-grained personal access token（github_pat_で始まるキー）を入力してください。GitHubのパスワードではありません。");
    const account=await github("https://api.github.com/user",{},candidate);
    const remote=await remoteDocument(candidate);
    if (dirty && baseDocument && fingerprint(remote.data)!==fingerprint(baseDocument)) throw new Error("接続前に公開元の内容が変わっています。バックアップを保存し、最新の内容を読み込んでから再接続してください。編集内容は保持しています。");
    if (!dirty || !loaded) { data=remote.data; render(); setLoaded("GitHubから最新の内容を読み込みました"); }
    else baseDocument=copy(remote.data);
    token=candidate; baseSha=remote.sha; connected=true; lastActivity=Date.now();
    q("[data-connected-user]").textContent=`接続中：${account.login || owner} → ${repo} / ${branch}`;
    q("[data-connection]").open=false;
    connectionMessage("接続しました。内容を編集して「公開する」を押すと、GitHubへ直接反映できます。","success");
    syncControls();
  }
  async function connectNew() {
    if (connecting || publishing) return;
    connecting=true; syncControls();
    let candidate=q("[data-token]").value.trim();
    const remember=q("[data-remember]").checked;
    let password=q("[data-vault-pass]").value;
    try {
      if (remember && (password.length<12 || password!==q("[data-vault-confirm]").value)) throw new Error("解除用パスワードは12文字以上で、確認欄と同じ内容を入力してください。");
      const encrypted=remember ? await seal(candidate,password) : null;
      await establish(candidate);
      if (encrypted) {
        try { writeStorage(vaultKey,encrypted); }
        catch { q("[data-connection]").open=true; connectionMessage("接続はできましたが、Chromeへの暗号化保存はできませんでした。次回はキーを再入力してください。","error"); }
      }
    } catch(error) { connectionMessage(error.message,"error"); q("[data-connection]").open=true; }
    finally { candidate=""; password=""; clearCredentialInputs(); connecting=false; syncControls(); }
  }
  async function unlock() {
    if (connecting || publishing) return;
    connecting=true; syncControls();
    let secret="";
    try { secret=await unseal(readStorage(vaultKey),q("[data-unlock-pass]").value); await establish(secret); }
    catch(error) { connectionMessage(error.message,"error"); }
    finally { secret=""; clearCredentialInputs(); connecting=false; syncControls(); }
  }
  function disconnect(reason="接続を解除しました。編集中の内容は保持しています。") {
    if (publishing) return;
    token=null; connected=false; baseSha=null; clearCredentialInputs();
    q("[data-connected-user]").textContent=""; q("[data-connection]").open=true;
    connectionMessage(reason); syncControls();
  }
  async function reload() {
    try {
      q("[data-load-current]").disabled=true;
      const remote=await remoteDocument(); data=remote.data; baseSha=remote.sha;
      render(); setLoaded("GitHubから最新の内容を読み込みました"); removeStorage(draftKey);
      q("[data-draft-recovery]").hidden=true;
    } catch(error) { setMessage(error.message,"error"); }
    finally { syncControls(); }
  }
  async function saveDraft() {
    if (!loaded || !dirty || publishing) return;
    collect();
    const snapshot=copy({savedAt:new Date().toISOString(),base:baseDocument,data});
    try { await ClinicDrafts.write(snapshot);localStorage.removeItem(draftKey); }
    catch {try{writeStorage(draftKey,snapshot);}catch{setMessage("下書きを端末に保存できません。画面を閉じる前に公開するか、バックアップJSONを保存してください。","error");}}
  }
  async function readDraft(){try{return (await ClinicDrafts.read()) || readStorage(draftKey);}catch{return readStorage(draftKey);}}
  async function showRecovery() {
    const saved=await readDraft();
    q("[data-draft-recovery]").hidden=!saved?.data || fingerprint(saved.data)===fingerprint(data);
  }
  async function restoreDraft() {
    const saved=await readDraft(); if (!saved?.data) return;
    if (dirty && !confirm("現在の編集内容を、Chromeに残っている編集内容へ置き換えますか？")) return;
    if (saved.base && baseDocument && fingerprint(safeData(saved.base))!==fingerprint(baseDocument)) {
      setMessage("下書き作成後に公開元が更新されています。自動復元を停止しました。下書きをJSON保存し、必要な変更だけ転記してください。","error");
      downloadJson(JSON.stringify(saved.data,null,2)+"\n"); return;
    }
    try { data=safeData(saved.data); render(); markDirty(); q("[data-draft-recovery]").hidden=true; }
    catch { setMessage("保存された下書きを読み込めません。","error"); }
  }
  function setFormBusy(busy) {
    const controls=[...form.querySelectorAll("input,textarea,select,button")];
    if (busy) controls.forEach(control=>{control.dataset.wasDisabled=String(control.disabled);control.disabled=true;});
    else controls.forEach(control=>{control.disabled=control.dataset.wasDisabled==="true";delete control.dataset.wasDisabled;});
    document.querySelectorAll(".backup-tools button,.backup-tools input").forEach(control=>control.disabled=busy);
    syncControls();
  }
  function noteCommitted(remote, next, old) {
    baseSha=remote.content?.sha || remote.sha;
    data=next; baseDocument=copy(next); dirty=false;
    removeStorage(draftKey); q("[data-draft-recovery]").hidden=true;
    try { writeStorage(previousKey,old); } catch { /* Git history is still the authoritative backup. */ }
    pending={revision:next.revision,updatedAt:next.updatedAt};
    try { writeStorage(pendingKey,pending); } catch { /* Optional convenience only. */ }
    setMessage("GitHubへ送信しました。ファイルを手作業で置き換える必要はありません。","success");
    q("[data-publish-status]").textContent="公開サイトへの反映を確認中です。";
    q("[data-publish-followup]").hidden=false;
    const sha=remote.commit?.sha;
    if (sha && /^[a-f0-9]{40}$/.test(sha)) { q("[data-commit-link]").href=`https://github.com/${owner}/${repo}/commit/${sha}`; q("[data-commit-link]").hidden=false; }
    syncControls(); startVerification();
  }
  async function commitMedia(next, files, faqChanged=false) {
    const ref=await github(`${apiRoot}/git/ref/heads/${branch}`);
    const head=ref.object?.sha;
    if(!head)throw new Error("公開元の識別情報を取得できませんでした。");
    const current=await remoteDocument(token,head);
    if(current.sha!==baseSha)throw new Error("別の更新を検出しました。最新の内容を読み込んでから編集し直してください。");
    const parent=await github(`${apiRoot}/git/commits/${head}`);
    const tree=[];
    if(faqChanged){
      const page=await github(`${apiRoot}/contents/index.html?ref=${encodeURIComponent(head)}`);
      const html=ClinicContent.updateFaqHTML(decodeContent(page),next.faqs);
      const blob=await github(`${apiRoot}/git/blobs`,{method:'POST',body:JSON.stringify({encoding:'utf-8',content:html})});
      tree.push({path:'index.html',mode:'100644',type:'blob',sha:blob.sha});
    }
    for(let i=0;i<files.length;i++){
      setMessage(`写真・資料を送信中… ${i+1} / ${files.length}`);
      const blob=await github(`${apiRoot}/git/blobs`,{method:"POST",body:JSON.stringify({encoding:"base64",content:files[i].content})});
      tree.push({path:files[i].path,mode:"100644",type:"blob",sha:blob.sha});
    }
    const documentBlob=await github(`${apiRoot}/git/blobs`,{method:"POST",body:JSON.stringify({encoding:"utf-8",content:JSON.stringify(next,null,2)+"\n"})});
    tree.push({path,mode:"100644",type:"blob",sha:documentBlob.sha});
    const built=await github(`${apiRoot}/git/trees`,{method:"POST",body:JSON.stringify({base_tree:parent.tree.sha,tree})});
    const commit=await github(`${apiRoot}/git/commits`,{method:"POST",body:JSON.stringify({message:"医院サイト更新：お知らせ・よくある質問・トップ画像・院内掲示物",tree:built.sha,parents:[head]})});
    // No force: concurrent changes cause a rejection rather than being overwritten.
    await github(`${apiRoot}/git/refs/heads/${branch}`,{method:"PATCH",body:JSON.stringify({sha:commit.sha,force:false})});
    return {content:{sha:documentBlob.sha},commit:{sha:commit.sha}};
  }
  async function publish() {
    if (publishing || connecting) return;
    if (!connected) { q("[data-connection]").open=true; setMessage("先にGitHubへ接続してください。","error"); return; }
    let next,files;
    try { const publication=ClinicEditorContent.publication(JSON.parse(preparedJson()));next=publication.data;files=publication.files; }
    catch(error) { setMessage(error.message,"error"); return; }
    if (!files.length && fingerprint(next)===fingerprint(baseDocument)) { dirty=false; removeStorage(draftKey); syncControls(); setMessage("公開元と同じ内容のため、更新は不要です。"); return; }
    // Latest SHA is checked before the write; Contents API also checks SHA atomically.
    publishing=true; clearTimeout(draftTimer); setFormBusy(true);
    setMessage("公開元の変更有無を確認しています…");
    const previous=copy(baseDocument);
    next.updatedAt=new Date().toISOString(); next.revision=crypto.randomUUID();
    try {
      const latest=await remoteDocument();
      if (latest.sha!==baseSha) throw new Error("他の端末またはGitHubで内容が更新されています。上書きを停止しました。バックアップを保存し、最新の内容を読み込んで必要な変更を入れ直してください。");
      setMessage("GitHubへ送信しています…");
      let result;
      try {
        const faqChanged=JSON.stringify(next.faqs)!==JSON.stringify(baseDocument.faqs);
        result=files.length || faqChanged ? await commitMedia(next,files,faqChanged) : await github(contentEndpoint,{method:"PUT",body:JSON.stringify({message:"医院サイト更新：お知らせ・休診・トップ画像・院内掲示物",branch,sha:baseSha,content:encodeContent(JSON.stringify(next,null,2)+"\n")})});
      } catch(error) {
        if (error.uncertain) {
          // Never blindly retry an uncertain PUT: it might have succeeded.
          let current=null;
          try { current=await remoteDocument(); } catch { /* Remain unconfirmed. */ }
          if (current?.data.revision===next.revision) result={sha:current.sha};
          else throw new Error("送信結果を確定できませんでした。再送前に「最新の内容を読み込む」でGitHubの状態を確認してください。編集内容は保持されています。");
        } else throw error;
      }
      if (!result?.content?.sha && !result?.sha) throw new Error("送信応答を確認できませんでした。最新の内容を読み込んで公開状態をご確認ください。");
      noteCommitted(result,next,previous);
    } catch(error) {
      setMessage(error.message,"error");
      if (error.status===401) { token=null; connected=false; q("[data-connection]").open=true; }
    } finally { publishing=false; setFormBusy(false); if (dirty) saveDraft(); }
  }
  async function verifyPublished(manual=false) {
    if (!pending) return false;
    const revision=pending.revision;
    try {
      const url=new URL("data/site-updates.json",location.href); url.searchParams.set("publish_check",`${revision}-${Date.now()}`);
      const response=await fetch(url,{cache:"no-store",referrerPolicy:"no-referrer",signal:AbortSignal.timeout(12000)});
      if (response.ok) {
        const current=await response.json();
        if (current.revision===revision) {
          q("[data-publish-status]").textContent="公開サイトへの反映を確認しました。";
          if (!dirty) setMessage("公開が完了しました。変更した掲載内容が公開サイトに反映されています。","success");
          clearTimeout(verifyTimer); verification=0; removeStorage(pendingKey); return true;
        }
        if (current.updatedAt && pending.updatedAt && Date.parse(current.updatedAt)>Date.parse(pending.updatedAt)) {
          q("[data-publish-status]").textContent="公開サイトには、別の端末によるさらに新しい更新が反映されています。最新の内容をご確認ください。";
          clearTimeout(verifyTimer); removeStorage(pendingKey); return true;
        }
      }
    } catch { /* Saving to GitHub and observing Pages deployment are separate states. */ }
    if (manual || verification>=30) q("[data-publish-status]").textContent="GitHubへの保存は完了していますが、公開サイトへの反映はまだ確認できません。反映確認ボタンで再確認できます。";
    return false;
  }
  function startVerification() {
    clearTimeout(verifyTimer); verification=0;
    const check=async()=>{
      verification++;
      if (await verifyPublished()) return;
      if (verification<30) verifyTimer=setTimeout(check,5000);
    };
    check();
  }
  q("[data-token-link]").href="https://github.com/settings/personal-access-tokens/new?"+new URLSearchParams({name:"Hayashi-clinic-editor",description:"Clinic website content editor",target_name:owner,expires_in:"90",contents:"write"});
  q("[data-remember]").addEventListener("change",()=>q("[data-vault-passwords]").hidden=!q("[data-remember]").checked);
  q("[data-connect]").addEventListener("click",connectNew);
  q("[data-unlock]").addEventListener("click",unlock);
  q("[data-disconnect]").addEventListener("click",()=>disconnect());
  q("[data-token]").addEventListener("keydown",event=>{if(event.key==="Enter"){event.preventDefault();connectNew();}});
  q("[data-unlock-pass]").addEventListener("keydown",event=>{if(event.key==="Enter"){event.preventDefault();unlock();}});
  q("[data-forget]").addEventListener("click",()=>{
    if (!confirm("このChromeに保存した接続キーを削除しますか？GitHub側のキーは失効しません。不要なキーはGitHubの設定でも削除してください。")) return;
    removeStorage(vaultKey); disconnect("保存した接続キーを削除しました。新しいキーを設定できます。");
  });
  q("[data-check-publish]").addEventListener("click",()=>verifyPublished(true));
  q("[data-restore-draft]").addEventListener("click",restoreDraft);
  q("[data-discard-draft]").addEventListener("click",()=>{if(confirm("Chromeに残っている編集内容を破棄しますか？")){removeStorage(draftKey);q("[data-draft-recovery]").hidden=true;}});
  q("[data-restore-previous]").addEventListener("click",()=>{
    const previous=readStorage(previousKey); if (!previous) return;
    if (!confirm("1回前の公開内容を編集画面へ読み込みますか？確認後に「公開する」を押すまでサイトは変わりません。")) return;
    try {data=safeData(previous);render();markDirty();} catch {setMessage("復元用データを読み込めません。GitHubの変更履歴を確認してください。","error");}
  });
  document.addEventListener("clinic-editor-changed",()=>{syncControls();clearTimeout(draftTimer);draftTimer=setTimeout(saveDraft,450);});
  document.addEventListener("clinic-editor-loaded",()=>{syncControls();showRecovery();});
  ["pointerdown","keydown","input"].forEach(name=>document.addEventListener(name,()=>lastActivity=Date.now(),{passive:true}));
  setInterval(()=>{if(connected && !publishing && Date.now()-lastActivity>30*60*1000)disconnect("30分間操作がなかったため接続を解除しました。編集内容は保持しています。");},15000);
  window.addEventListener("beforeunload",saveDraft);
  window.ClinicPublisher=Object.freeze({isConnected:()=>connected,publish,reload});
  window.editorReady?.then(()=>{syncControls();showRecovery();});
  pending=readStorage(pendingKey);
  if (pending?.revision) {q("[data-publish-followup]").hidden=false;startVerification();}
  syncControls();
})();


