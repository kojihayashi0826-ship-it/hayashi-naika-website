(() => {
  'use strict';
  const root = document.querySelector('[data-public-documents]');
  if (!root) return;
  let loading = false;
  async function refresh() {
    if (loading) return;
    loading = true;
    root.setAttribute('aria-busy', 'true');
    const pending = document.createElement('p');
    pending.className = 'documents-empty';
    pending.textContent = '資料を読み込んでいます…';
    root.replaceChildren(pending);
    try {
      const source = await ClinicContent.fetchJSON('data/site-updates.json?v=' + Date.now());
      if (!source || !Array.isArray(source.news) || !Array.isArray(source.closures)) throw new Error('invalid data');
      const content = ClinicContent.normalize(source);
      ClinicDesign.apply(content.design, content.theme);
      ClinicContent.documentList(root, content.documents);
    } catch {
      const p = document.createElement('p');
      p.className = 'documents-empty';
      p.textContent = '資料を読み込めませんでした。お電話でご確認ください。';
      const phone = document.createElement('a');
      phone.href = 'tel:0761246288';
      phone.textContent = '0761-24-6288';
      p.append(' ', phone);
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.textContent = 'もう一度読み込む';
      retry.addEventListener('click', refresh);
      root.replaceChildren(p, retry);
    } finally {
      loading = false;
      root.setAttribute('aria-busy', 'false');
    }
  }
  refresh();
  setInterval(() => { if (!document.hidden) refresh(); }, 120000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
})();
