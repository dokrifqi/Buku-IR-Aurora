let ENTRIES = [];
let CATEGORIES = [];
let SECTIONS = {};
let COMMUNITY_NOTES = [];
let COMMENTS_BY_PAGE = {};
let HISTORY = [];
let activeCat = 'all';
let BOOKMARKS = new Set(JSON.parse(localStorage.getItem('aurora_bookmarks') || '[]'));
let OPEN_SECTIONS = new Set(JSON.parse(localStorage.getItem('aurora_open_sections') || '[]'));
let dbReady = false;
let reportContext = null; // {page, cat}

const contentEl = document.getElementById('content');
const catListEl = document.getElementById('catList');
const searchInput = document.getElementById('searchInput');
const totalCountEl = document.getElementById('totalCount');
const heroStatsEl = document.getElementById('heroStats');
const heroEl = document.getElementById('hero');

async function init(){
  const [entries, cats, sections] = await Promise.all([
    fetch('data/entries.json').then(r=>r.json()),
    fetch('data/categories.json').then(r=>r.json()),
    fetch('data/sections.json').then(r=>r.json()).catch(()=>({}))
  ]);
  ENTRIES = entries;
  CATEGORIES = cats;
  SECTIONS = sections;
  totalCountEl.textContent = entries.length;
  renderStats();
  renderCatList();
  populateNoteCategorySelect();
  render();
  bindEvents();
  initDarkMode();
  initPWA();
  initCollab();
}

function renderStats(){
  const imgCount = ENTRIES.reduce((a,e)=>a+e.images.length,0);
  heroStatsEl.innerHTML = `
    <div class="hero-stat"><span class="hero-stat-num">${ENTRIES.length}</span><span class="hero-stat-label">catatan</span></div>
    <div class="hero-stat"><span class="hero-stat-num">${CATEGORIES.length}</span><span class="hero-stat-label">kategori</span></div>
    <div class="hero-stat"><span class="hero-stat-num">${imgCount}</span><span class="hero-stat-label">gambar & diagram</span></div>
  `;
}

function renderCatList(){
  const favCount = BOOKMARKS.size;
  let html = `<div class="cat-item fav ${activeCat==='fav'?'active':''}" data-cat="fav">
    <span>&#9733; Favorit</span><span class="cat-count">${favCount}</span>
  </div>`;
  html += `<div class="cat-item community ${activeCat==='community'?'active':''}" data-cat="community">
    <span>&#128221; Catatan Angkatan</span><span class="cat-count">${COMMUNITY_NOTES.length}</span>
  </div>`;
  html += `<div class="cat-item all ${activeCat==='all'?'active':''}" data-cat="all">
    <span>Semua Topik</span><span class="cat-count">${ENTRIES.length}</span>
  </div>`;
  html += CATEGORIES.map(c => `
    <div class="cat-item ${activeCat===c.key?'active':''}" data-cat="${c.key}">
      <span>${c.label}</span><span class="cat-count">${c.count}</span>
    </div>
  `).join('');
  catListEl.innerHTML = html;
  catListEl.querySelectorAll('.cat-item').forEach(el=>{
    el.addEventListener('click', ()=>{
      activeCat = el.dataset.cat;
      searchInput.value = '';
      renderCatList();
      clearSpecialNavActive();
      render();
      closeSidebar();
      window.scrollTo({top:0, behavior:'smooth'});
    });
  });
}

function clearSpecialNavActive(){
  document.getElementById('historyNavItem').classList.remove('active');
  document.getElementById('recentNavItem').classList.remove('active');
}

function populateNoteCategorySelect(){
  const sel = document.getElementById('noteCategory');
  sel.innerHTML = CATEGORIES.map(c=>`<option value="${c.key}">${c.label}</option>`).join('');
}

function highlight(text, q){
  if(!q) return linkify(escapeHtml(text));
  const esc = escapeHtml(text);
  const safeQ = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const marked = esc.replace(new RegExp('('+safeQ+')','ig'), '<mark>$1</mark>');
  return linkify(marked);
}

function linkify(html){
  return html.replace(/(https?:\/\/[^\s<]+)/g, (match) => {
    let url = match;
    let trailing = '';
    const trailRe = /[.,;:!?)\]}"']+$/;
    const m = url.match(trailRe);
    if(m){ trailing = m[0]; url = url.slice(0, -trailing.length); }
    if(!url) return match;
    return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="entry-link">${url}</a>${trailing}`;
  });
}

function escapeHtml(s){
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function tsMillis(ts){
  if(!ts) return 0;
  if(ts.toDate) return ts.toDate().getTime();
  if(ts.seconds) return ts.seconds*1000;
  return new Date(ts).getTime();
}

function timeAgo(ts){
  if(!ts) return '';
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  const diff = Math.floor((Date.now() - date.getTime())/1000);
  if(diff < 60) return 'baru saja';
  if(diff < 3600) return Math.floor(diff/60)+' menit lalu';
  if(diff < 86400) return Math.floor(diff/3600)+' jam lalu';
  if(diff < 2592000) return Math.floor(diff/86400)+' hari lalu';
  return date.toLocaleDateString('id-ID', {day:'numeric', month:'short', year:'numeric'});
}

function render(){
  if(activeCat === 'history'){ renderHistoryView(); return; }
  if(activeCat === 'recent'){ renderRecentView(); return; }

  const q = searchInput.value.trim().toLowerCase();

  const communityAsEntries = COMMUNITY_NOTES.map(n => ({
    pageKey: 'note:'+n.id, page: null, cat: n.cat, cat_label: catLabel(n.cat),
    text: n.text, images: [], isCommunity: true, author: n.author, createdAt: n.createdAt
  }));
  const pdfAsEntries = ENTRIES.map(e => ({...e, pageKey: String(e.page)}));

  let pool;
  if(activeCat === 'fav'){
    pool = pdfAsEntries.filter(e=>BOOKMARKS.has(e.page));
  } else if(activeCat === 'community'){
    pool = communityAsEntries;
    markSeen('community');
    updateNavBadges();
  } else if(activeCat === 'all'){
    pool = [...communityAsEntries, ...pdfAsEntries];
  } else {
    pool = [...communityAsEntries.filter(e=>e.cat===activeCat), ...pdfAsEntries.filter(e=>e.cat===activeCat)];
  }
  if(q) pool = pool.filter(e=> e.text.toLowerCase().includes(q) || e.cat_label.toLowerCase().includes(q));

  heroEl.style.display = q ? 'none' : '';

  if(pool.length === 0){
    let msg;
    if(activeCat === 'fav') msg = `<h3>Belum ada favorit</h3><p>Ketuk ikon &#9733; di kartu catatan untuk menyimpannya di sini.</p>`;
    else if(activeCat === 'community') msg = `<h3>Belum ada catatan tambahan</h3><p>Jadi yang pertama nambahin lewat tombol + di pojok kanan bawah.</p>`;
    else msg = `<h3>Tidak ditemukan</h3><p>Coba kata kunci lain, misalnya "NICU", "kemoterapi", atau "cairan".</p>`;
    contentEl.innerHTML = `<div class="empty-state">${msg}</div>`;
    return;
  }

  // Single-category view with defined subsections -> render as collapsible accordion
  if(!q && SECTIONS[activeCat] && activeCat !== 'fav' && activeCat !== 'community' && activeCat !== 'all'){
    renderCategoryWithSections(activeCat, pool);
    return;
  }

  const order = CATEGORIES.map(c=>c.key);
  const grouped = {};
  pool.forEach(e=>{
    grouped[e.cat] = grouped[e.cat] || [];
    grouped[e.cat].push(e);
  });

  let html = '';
  const groupKeys = (activeCat==='fav'||activeCat==='community') ? Object.keys(grouped) : order.filter(k=>grouped[k]);
  groupKeys.forEach(key=>{
    const list = grouped[key];
    if(!list) return;
    const label = list[0].cat_label;
    html += `<section class="cat-section" data-catkey="${key}">
      <div class="cat-section-head">
        <h2>${label}</h2>
        <div class="cat-section-head-right">
          <span class="n">${list.length}</span>
          <button class="print-btn" data-catkey="${key}" data-catlabel="${escapeHtml(label)}" title="Print / simpan PDF kategori ini">
            &#128424; Print
          </button>
        </div>
      </div>
      ${list.map(e=>entryHtml(e,q)).join('')}
    </section>`;
  });

  contentEl.innerHTML = html;

  contentEl.querySelectorAll('.entry-images img').forEach(img=>{
    img.addEventListener('click', ()=> openLightbox(img.src));
  });
  bindCopyButtons();
  bindWaButtons();
  bindBookmarkButtons();
  bindCommentToggles();
  bindReportButtons();
  bindPrintButtons();
}

function catLabel(key){
  const c = CATEGORIES.find(c=>c.key===key);
  return c ? c.label : key;
}

function renderCategoryWithSections(catKey, pool){
  const catIndex = CATEGORIES.findIndex(c=>c.key===catKey) + 1;
  const label = catLabel(catKey);
  const subs = SECTIONS[catKey];

  const byPage = {};
  pool.forEach(e=>{ if(!e.isCommunity) byPage[e.page] = e; });
  const communityItems = pool.filter(e=>e.isCommunity);

  let sectionsHtml = subs.map(sub=>{
    const items = sub.pages.map(p=>byPage[p]).filter(Boolean);
    if(items.length === 0) return '';
    const secId = `${catKey}-${sub.num}`;
    const isOpen = OPEN_SECTIONS.has(secId) || sub.num === 1;
    return `<details class="section-accordion" data-secid="${secId}" ${isOpen?'open':''}>
      <summary class="section-summary">
        <span class="section-num">${catIndex}.${sub.num}</span>
        <span class="section-title">${escapeHtml(sub.title)}</span>
        <span class="section-count">${items.length}</span>
        <svg class="section-chevron" viewBox="0 0 24 24" width="16" height="16"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </summary>
      <div class="section-body">
        ${items.map(e=>entryHtml(e,'')).join('')}
      </div>
    </details>`;
  }).join('');

  let communityHtml = '';
  if(communityItems.length){
    const secId = `${catKey}-community`;
    const isOpen = OPEN_SECTIONS.has(secId);
    communityHtml = `<details class="section-accordion section-accordion-community" data-secid="${secId}" ${isOpen?'open':''}>
      <summary class="section-summary">
        <span class="section-num">&#128221;</span>
        <span class="section-title">Catatan Tambahan dari Angkatan</span>
        <span class="section-count">${communityItems.length}</span>
        <svg class="section-chevron" viewBox="0 0 24 24" width="16" height="16"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </summary>
      <div class="section-body">
        ${communityItems.map(e=>entryHtml(e,'')).join('')}
      </div>
    </details>`;
  }

  contentEl.innerHTML = `<section class="cat-section" data-catkey="${catKey}">
    <div class="cat-section-head">
      <h2>${label}</h2>
      <div class="cat-section-head-right">
        <span class="n">${pool.length}</span>
        <button class="expand-all-btn" id="expandAllBtn">Buka Semua</button>
        <button class="print-btn" data-catkey="${catKey}" data-catlabel="${escapeHtml(label)}" title="Print / simpan PDF kategori ini">&#128424; Print</button>
      </div>
    </div>
    ${sectionsHtml}
    ${communityHtml}
  </section>`;

  contentEl.querySelectorAll('.section-accordion').forEach(det=>{
    det.addEventListener('toggle', ()=>{
      const id = det.dataset.secid;
      if(det.open) OPEN_SECTIONS.add(id); else OPEN_SECTIONS.delete(id);
      localStorage.setItem('aurora_open_sections', JSON.stringify([...OPEN_SECTIONS]));
    });
  });

  let allOpen = false;
  document.getElementById('expandAllBtn').addEventListener('click', ()=>{
    allOpen = !allOpen;
    contentEl.querySelectorAll('.section-accordion').forEach(det=>{ det.open = allOpen; });
    document.getElementById('expandAllBtn').textContent = allOpen ? 'Tutup Semua' : 'Buka Semua';
  });

  contentEl.querySelectorAll('.entry-images img').forEach(img=>{
    img.addEventListener('click', ()=> openLightbox(img.src));
  });
  bindCopyButtons();
  bindWaButtons();
  bindBookmarkButtons();
  bindCommentToggles();
  bindReportButtons();
  contentEl.querySelectorAll('.print-btn').forEach(btn=>{
    btn.addEventListener('click', ()=> printCategory(btn.dataset.catkey, btn.dataset.catlabel));
  });
}

function entryHtml(e, q){
  const textHtml = highlight(e.text, q).replace(/\n/g, '<br>');
  const imgs = e.images.map(f=>`<img src="img/${f}" loading="lazy" alt="Halaman ${e.page}">`).join('');
  const encoded = encodeURIComponent(e.text);
  const waHeader = e.isCommunity
    ? `Catatan Angkatan (dari ${e.author||'Anonim'}) - IR Notulensi AURORA`
    : `Hal. ${e.page} - IR Notulensi AURORA`;
  const waEncoded = encodeURIComponent(`${waHeader}\n\n${e.text}`);
  const pageKey = e.pageKey;
  const commentList = COMMENTS_BY_PAGE[pageKey] || [];
  const hasComments = commentList.length > 0;

  let badgeHtml;
  if(e.isCommunity){
    badgeHtml = `<span class="entry-page community-badge">&#128221; ${escapeHtml(e.author||'Anonim')} &middot; ${timeAgo(e.createdAt)}</span>`;
  } else {
    badgeHtml = `<span class="entry-page">Hal. ${e.page}</span>`;
  }
  const correctedBadge = hasComments ? `<span class="corrected-badge" title="Ada komentar/koreksi di halaman ini">&#128295; Dikoreksi</span>` : '';

  const isFav = !e.isCommunity && BOOKMARKS.has(e.page);
  const bookmarkBtn = e.isCommunity ? '' : `
        <button class="icon-action-btn bookmark-btn ${isFav?'active':''}" data-page="${e.page}" title="${isFav?'Hapus dari favorit':'Simpan ke favorit'}">
          <svg viewBox="0 0 24 24" width="15" height="15"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.77 5.82 21 7 14.14l-5-4.87 6.91-1.01L12 2z" fill="${isFav?'currentColor':'none'}" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>
        </button>`;
  const reportBtn = e.isCommunity ? '' : `
        <button class="icon-action-btn report-btn" data-page="${e.page}" data-cat="${e.cat}" title="Laporkan kategori salah">
          <svg viewBox="0 0 24 24" width="15" height="15"><path d="M5 3v18M5 4h11l-2 4 2 4H5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/></svg>
        </button>`;

  return `<article class="entry ${e.isCommunity?'entry-community':''} ${hasComments?'entry-has-comments':''}">
    <div class="entry-head">
      <div class="entry-head-left">${badgeHtml}${correctedBadge}</div>
      <div class="entry-actions">
        ${bookmarkBtn}
        ${reportBtn}
        <button class="wa-btn" data-text="${waEncoded}" title="Bagikan ke WhatsApp">
          <svg viewBox="0 0 24 24" width="15" height="15"><path d="M17.6 6.4A8 8 0 1 0 6 18.9L4 22l3.2-1.9A8 8 0 0 0 17.6 6.4z" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M8.5 8.7c.3-.6.6-.6.9-.6h.6c.2 0 .4 0 .6.5s.6 1.6.7 1.7.1.3 0 .5-.2.3-.4.5-.4.4-.2.7c.3.4.7 1 1.4 1.6.8.7 1.3.9 1.6 1s.5.1.7-.1.7-.7.9-1 .4-.2.6-.1l1.5.7c.2.1.4.2.4.4s0 .8-.3 1.5-1.4 1.2-2 1.3-1.1.1-1.9-.1c-.5-.1-1.1-.3-1.9-.7-1.6-.7-2.7-2.1-2.9-2.4s-1.4-1.9-1.4-3.5.9-2.5 1-2.6z" fill="currentColor" stroke="none"/></svg>
          <span class="copy-label">WA</span>
        </button>
        <button class="copy-btn" data-text="${encoded}" title="Salin teks ini">
          <svg viewBox="0 0 24 24" width="15" height="15"><rect x="8" y="8" width="12" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M4 16V5a1 1 0 0 1 1-1h11" fill="none" stroke="currentColor" stroke-width="2"/></svg>
          <span class="copy-label">Salin</span>
        </button>
      </div>
    </div>
    <div class="entry-text">${textHtml}</div>
    ${imgs ? `<div class="entry-images">${imgs}</div>` : ''}
    <div class="comment-block">
      <button class="comment-toggle" data-pagekey="${pageKey}">
        &#128172; Komentar / Koreksi ${commentList.length ? `(${commentList.length})` : ''}
      </button>
      <div class="comment-panel" id="panel-${cssSafe(pageKey)}" style="display:none;">
        <div class="comment-list">
          ${commentList.map(c=>`
            <div class="comment-item">
              <span class="comment-author">${escapeHtml(c.author||'Anonim')}</span>
              <span class="comment-time">${timeAgo(c.createdAt)}</span>
              <p>${linkify(escapeHtml(c.text))}</p>
            </div>
          `).join('') || '<p class="comment-empty">Belum ada komentar.</p>'}
        </div>
        ${dbReady ? `
        <div class="comment-form">
          <textarea class="comment-input" placeholder="Tulis koreksi atau komentar..." rows="2"></textarea>
          <div class="comment-form-row">
            <input type="text" class="comment-author-input" placeholder="Nama kamu" value="${escapeHtml(localStorage.getItem('aurora_author')||'')}">
            <button class="comment-submit" data-pagekey="${pageKey}">Kirim</button>
          </div>
        </div>` : `<p class="comment-disabled">Fitur komentar belum aktif. Lihat FIRESTORE_SETUP.md.</p>`}
      </div>
    </div>
  </article>`;
}

function cssSafe(s){ return s.replace(/[^a-zA-Z0-9]/g,'_'); }

function bindWaButtons(){
  contentEl.querySelectorAll('.wa-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const text = btn.dataset.text; // already encoded
      window.open(`https://wa.me/?text=${text}`, '_blank');
    });
  });
}

function bindCopyButtons(){
  contentEl.querySelectorAll('.copy-btn').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const text = decodeURIComponent(btn.dataset.text);
      try{ await navigator.clipboard.writeText(text); }
      catch(err){
        const ta = document.createElement('textarea');
        ta.value = text; document.body.appendChild(ta); ta.select();
        document.execCommand('copy'); document.body.removeChild(ta);
      }
      const label = btn.querySelector('.copy-label');
      const original = label.textContent;
      btn.classList.add('copied'); label.textContent = 'Tersalin!';
      setTimeout(()=>{ btn.classList.remove('copied'); label.textContent = original; }, 1500);
    });
  });
}

function bindBookmarkButtons(){
  contentEl.querySelectorAll('.bookmark-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const page = Number(btn.dataset.page);
      if(BOOKMARKS.has(page)) BOOKMARKS.delete(page); else BOOKMARKS.add(page);
      localStorage.setItem('aurora_bookmarks', JSON.stringify([...BOOKMARKS]));
      renderCatList();
      if(activeCat === 'fav'){ render(); }
      else {
        btn.classList.toggle('active');
        const svgPath = btn.querySelector('path');
        const nowFav = BOOKMARKS.has(page);
        svgPath.setAttribute('fill', nowFav ? 'currentColor' : 'none');
        btn.title = nowFav ? 'Hapus dari favorit' : 'Simpan ke favorit';
      }
    });
  });
}

function bindCommentToggles(){
  contentEl.querySelectorAll('.comment-toggle').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const key = btn.dataset.pagekey;
      const panel = document.getElementById('panel-'+cssSafe(key));
      panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    });
  });
  contentEl.querySelectorAll('.comment-submit').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const key = btn.dataset.pagekey;
      const panel = document.getElementById('panel-'+cssSafe(key));
      const textarea = panel.querySelector('.comment-input');
      const authorInput = panel.querySelector('.comment-author-input');
      const text = textarea.value.trim();
      if(!text) return;
      const author = authorInput.value.trim() || 'Anonim';
      localStorage.setItem('aurora_author', author);
      btn.disabled = true; btn.textContent = 'Mengirim...';
      try{
        await window.AuroraDB.addComment(key, text, author);
        textarea.value = '';
      }catch(e){ alert('Gagal mengirim komentar. Coba lagi.'); }
      btn.disabled = false; btn.textContent = 'Kirim';
    });
  });
}

function bindReportButtons(){
  contentEl.querySelectorAll('.report-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      reportContext = { page: Number(btn.dataset.page), cat: btn.dataset.cat };
      openReportModal();
    });
  });
}

function bindPrintButtons(){
  contentEl.querySelectorAll('.print-btn').forEach(btn=>{
    btn.addEventListener('click', ()=> printCategory(btn.dataset.catkey, btn.dataset.catlabel));
  });
}

function printCategory(key, label){
  document.querySelectorAll('.cat-section').forEach(sec=>{
    sec.classList.toggle('print-hide', sec.dataset.catkey !== key);
  });
  // force all accordions open so print output includes every subsection
  const accordions = document.querySelectorAll('.section-accordion');
  const wasOpen = new Map();
  accordions.forEach(det=>{ wasOpen.set(det, det.open); det.open = true; });

  document.body.classList.add('printing-single');
  document.title = 'AURORA - ' + label;
  setTimeout(()=>{
    window.print();
    setTimeout(()=>{
      document.body.classList.remove('printing-single');
      document.querySelectorAll('.cat-section').forEach(sec=> sec.classList.remove('print-hide'));
      accordions.forEach(det=>{ det.open = wasOpen.get(det); });
      document.title = 'IR · Notulensi AURORA — PPDS IKA FK UNS';
    }, 300);
  }, 100);
}

/* ===== Riwayat (history) view ===== */
function renderHistoryView(){
  heroEl.style.display = 'none';
  markSeen('history');
  updateNavBadges();
  if(!dbReady){
    contentEl.innerHTML = `<div class="empty-state"><h3>Riwayat belum aktif</h3><p>Fitur ini butuh konfigurasi database. Lihat FIRESTORE_SETUP.md di paket file.</p></div>`;
    return;
  }
  if(HISTORY.length === 0){
    contentEl.innerHTML = `<div class="empty-state"><h3>Belum ada riwayat</h3><p>Perubahan (catatan baru, komentar, laporan kategori) akan muncul di sini.</p></div>`;
    return;
  }
  const icons = { note: '&#128221;', comment: '&#128172;', report: '&#128681;' };
  const html = HISTORY.map(h => `
    <div class="history-item-row">
      <span class="history-icon">${icons[h.type] || '&#8226;'}</span>
      <div>
        <p><strong>${escapeHtml(h.author||'Anonim')}</strong> ${escapeHtml(h.summary||'')}</p>
        <span class="history-time">${timeAgo(h.createdAt)}</span>
      </div>
    </div>
  `).join('');
  contentEl.innerHTML = `<section class="cat-section">
    <div class="cat-section-head"><h2>Riwayat Perubahan</h2><span class="n">${HISTORY.length}</span></div>
    <div class="history-list">${html}</div>
  </section>`;
}

/* ===== Terbaru (recent feed) view ===== */
function renderRecentView(){
  heroEl.style.display = 'none';
  markSeen('recent');
  updateNavBadges();
  if(!dbReady){
    contentEl.innerHTML = `<div class="empty-state"><h3>Fitur ini belum aktif</h3><p>Butuh konfigurasi database. Lihat FIRESTORE_SETUP.md.</p></div>`;
    return;
  }
  const noteItems = COMMUNITY_NOTES.map(n => ({
    kind:'note', createdAt:n.createdAt, author:n.author, text:n.text, cat:n.cat
  }));
  const commentItems = [];
  Object.entries(COMMENTS_BY_PAGE).forEach(([page, list])=>{
    list.forEach(c => commentItems.push({ kind:'comment', createdAt:c.createdAt, author:c.author, text:c.text, page }));
  });
  const feed = [...noteItems, ...commentItems].sort((a,b)=> tsMillis(b.createdAt)-tsMillis(a.createdAt)).slice(0,60);

  if(feed.length === 0){
    contentEl.innerHTML = `<div class="empty-state"><h3>Belum ada aktivitas</h3><p>Catatan baru dan komentar dari seangkatan akan muncul di sini.</p></div>`;
    return;
  }

  const html = feed.map(item=>{
    if(item.kind === 'note'){
      return `<div class="feed-item feed-note" data-jump-cat="${item.cat}">
        <div class="feed-item-top"><span class="feed-kind">&#128221; Catatan baru</span><span class="feed-time">${timeAgo(item.createdAt)}</span></div>
        <p class="feed-text">${linkify(escapeHtml(item.text))}</p>
        <span class="feed-meta">${escapeHtml(item.author||'Anonim')} &middot; ${catLabel(item.cat)}</span>
      </div>`;
    }
    return `<div class="feed-item feed-comment" data-jump-page="${item.page}">
      <div class="feed-item-top"><span class="feed-kind">&#128172; Komentar di Hal. ${item.page}</span><span class="feed-time">${timeAgo(item.createdAt)}</span></div>
      <p class="feed-text">${linkify(escapeHtml(item.text))}</p>
      <span class="feed-meta">${escapeHtml(item.author||'Anonim')}</span>
    </div>`;
  }).join('');

  contentEl.innerHTML = `<section class="cat-section">
    <div class="cat-section-head"><h2>Terbaru</h2><span class="n">${feed.length}</span></div>
    <div class="feed-list">${html}</div>
  </section>`;

  contentEl.querySelectorAll('.feed-note').forEach(el=>{
    el.addEventListener('click', ()=>{
      activeCat = el.dataset.jumpCat;
      renderCatList(); clearSpecialNavActive(); render();
      window.scrollTo({top:0, behavior:'smooth'});
    });
  });
  contentEl.querySelectorAll('.feed-comment').forEach(el=>{
    el.addEventListener('click', ()=>{
      const page = Number(el.dataset.jumpPage);
      const entry = ENTRIES.find(e=>e.page===page);
      activeCat = entry ? entry.cat : 'all';
      renderCatList(); clearSpecialNavActive(); render();
      window.scrollTo({top:0, behavior:'smooth'});
    });
  });
}

/* ===== Unread badges ===== */
function markSeen(kind){
  localStorage.setItem('aurora_seen_'+kind, String(Date.now()));
}
function lastSeen(kind){
  return Number(localStorage.getItem('aurora_seen_'+kind) || 0);
}
function updateNavBadges(){
  const communityBadge = document.querySelector('.cat-item.community .cat-count');
  const historyBadge = document.getElementById('historyBadge');
  const recentBadge = document.getElementById('recentBadge');

  const unreadCommunity = COMMUNITY_NOTES.filter(n => tsMillis(n.createdAt) > lastSeen('community')).length;
  if(communityBadge && unreadCommunity > 0 && activeCat !== 'community'){
    communityBadge.classList.add('unread-count');
  } else if(communityBadge){
    communityBadge.classList.remove('unread-count');
  }

  const unreadHistory = HISTORY.filter(h => tsMillis(h.createdAt) > lastSeen('history')).length;
  if(historyBadge){
    if(unreadHistory > 0 && activeCat !== 'history'){
      historyBadge.textContent = unreadHistory > 9 ? '9+' : unreadHistory;
      historyBadge.style.display = 'inline-flex';
    } else { historyBadge.style.display = 'none'; }
  }

  const recentTotal = COMMUNITY_NOTES.length + Object.values(COMMENTS_BY_PAGE).reduce((a,l)=>a+l.length,0);
  const recentSeenAt = lastSeen('recent');
  const unreadRecent =
    COMMUNITY_NOTES.filter(n=>tsMillis(n.createdAt) > recentSeenAt).length +
    Object.values(COMMENTS_BY_PAGE).flat().filter(c=>tsMillis(c.createdAt) > recentSeenAt).length;
  if(recentBadge){
    if(unreadRecent > 0 && activeCat !== 'recent'){
      recentBadge.textContent = unreadRecent > 9 ? '9+' : unreadRecent;
      recentBadge.style.display = 'inline-flex';
    } else { recentBadge.style.display = 'none'; }
  }
}

/* ===== Report category modal ===== */
function openReportModal(){
  const sel = document.getElementById('reportCategory');
  sel.innerHTML = CATEGORIES.filter(c=>c.key !== reportContext.cat)
    .map(c=>`<option value="${c.key}">${c.label}</option>`).join('');
  document.getElementById('reportContext').textContent =
    `Halaman ${reportContext.page} &middot; sekarang di kategori "${catLabel(reportContext.cat)}"`.replace('&middot;','·');
  document.getElementById('reportNote').value = '';
  document.getElementById('reportStatus').textContent = '';
  document.getElementById('reportModal').classList.add('open');
}
function closeReportModal(){
  document.getElementById('reportModal').classList.remove('open');
  reportContext = null;
}
async function submitReport(){
  if(!reportContext) return;
  const statusEl = document.getElementById('reportStatus');
  if(!dbReady){ statusEl.textContent = 'Fitur ini belum aktif — lihat FIRESTORE_SETUP.md.'; return; }
  const suggestedCat = document.getElementById('reportCategory').value;
  const note = document.getElementById('reportNote').value.trim();
  const author = localStorage.getItem('aurora_author') || 'Anonim';
  const btn = document.getElementById('submitReport');
  btn.disabled = true; btn.textContent = 'Mengirim...';
  try{
    await window.AuroraDB.addCategoryReport(reportContext.page, reportContext.cat, suggestedCat, note, author);
    statusEl.textContent = 'Laporan terkirim, makasih!';
    setTimeout(closeReportModal, 900);
  }catch(e){ statusEl.textContent = 'Gagal mengirim. Coba lagi.'; }
  btn.disabled = false; btn.textContent = 'Kirim Laporan';
}

function closeAIModal(){
  document.getElementById('aiModal').classList.remove('open');
}

function appendAIBubble(role, html, id){
  const log = document.getElementById('aiLog');
  const div = document.createElement('div');
  div.className = 'ai-bubble ai-'+role;
  if(id) div.id = id;
  div.innerHTML = html;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
  return div;
}

async function sendAIQuestion(){
  const input = document.getElementById('aiQuestion');
  const question = input.value.trim();
  if(!question) return;
  input.value = '';

  appendAIBubble('user', escapeHtml(question));
  const loadingId = 'ai-loading-'+Date.now();
  appendAIBubble('bot', `<span class="ai-typing">Sedang mencari jawaban di notulensi...</span>`, loadingId);

  const sendBtn = document.getElementById('aiSend');
  sendBtn.disabled = true;

  try{
    const res = await fetch('/api/ask', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ question })
    });
    const data = await res.json();
    const bubble = document.getElementById(loadingId);
    if(!res.ok){
      bubble.innerHTML = `<span class="ai-error">${escapeHtml(data.error || 'Terjadi kesalahan.')}</span>`;
    } else {
      const sourcesHtml = (data.sources && data.sources.length)
        ? `<div class="ai-sources">${[...new Set(data.sources)].map(p=>`<span class="ai-source-chip" data-page="${p}">Hal. ${p}</span>`).join('')}</div>`
        : '';
      bubble.innerHTML = `<div class="ai-answer">${linkify(escapeHtml(data.answer)).replace(/\n/g,'<br>')}</div>${sourcesHtml}`;
      bubble.querySelectorAll('.ai-source-chip').forEach(chip=>{
        chip.addEventListener('click', ()=>{
          const page = Number(chip.dataset.page);
          const entry = ENTRIES.find(e=>e.page===page);
          if(entry){
            activeCat = entry.cat;
            renderCatList(); clearSpecialNavActive(); render();
            closeAIModal();
            window.scrollTo({top:0, behavior:'smooth'});
          }
        });
      });
    }
  }catch(e){
    const bubble = document.getElementById(loadingId);
    bubble.innerHTML = `<span class="ai-error">Gagal menghubungi server. Coba lagi.</span>`;
  }
  sendBtn.disabled = false;
}


function openLightbox(src){
  document.getElementById('lightboxImg').src = src;
  document.getElementById('lightbox').classList.add('open');
}
function closeLightbox(){
  document.getElementById('lightbox').classList.remove('open');
}
function openSidebar(){
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('scrim').classList.add('open');
}
function closeSidebar(){
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('scrim').classList.remove('open');
}

/* ===== Dark mode ===== */
function initDarkMode(){
  const stored = localStorage.getItem('aurora_theme');
  if(stored === 'dark') document.documentElement.classList.add('dark');
  updateDarkLabel();
  const toggle = () => {
    document.documentElement.classList.toggle('dark');
    const isDark = document.documentElement.classList.contains('dark');
    localStorage.setItem('aurora_theme', isDark ? 'dark' : 'light');
    updateDarkLabel();
  };
  document.getElementById('darkBtn').addEventListener('click', toggle);
  document.getElementById('darkBtnDesktop').addEventListener('click', toggle);
}
function updateDarkLabel(){
  const isDark = document.documentElement.classList.contains('dark');
  const label = document.getElementById('darkLabel');
  if(label) label.textContent = isDark ? 'Mode Terang' : 'Mode Gelap';
}

/* ===== PWA install + offline status ===== */
function initPWA(){
  if('serviceWorker' in navigator){
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('sw.js').then(reg=>{
      reg.update().catch(()=>{});
      reg.addEventListener('updatefound', ()=>{
        const newWorker = reg.installing;
        if(!newWorker) return;
        newWorker.addEventListener('statechange', ()=>{
          // only reload if a service worker was ALREADY controlling this page before —
          // that means this is a genuine update, not the very first install
          if(newWorker.state === 'activated' && hadController){
            if(!sessionStorage.getItem('aurora_just_reloaded')){
              sessionStorage.setItem('aurora_just_reloaded', '1');
              window.location.reload();
            }
          }
        });
      });
    }).catch(()=>{});
  }
  let deferredPrompt = null;
  const installBtn = document.getElementById('installBtn');
  window.addEventListener('beforeinstallprompt', (e)=>{
    e.preventDefault(); deferredPrompt = e; installBtn.style.display = 'flex';
  });
  installBtn.addEventListener('click', async ()=>{
    if(!deferredPrompt) return;
    deferredPrompt.prompt(); await deferredPrompt.userChoice;
    deferredPrompt = null; installBtn.style.display = 'none';
  });
  window.addEventListener('appinstalled', ()=>{ installBtn.style.display = 'none'; });
  updateOfflineBadge();
  window.addEventListener('online', updateOfflineBadge);
  window.addEventListener('offline', updateOfflineBadge);
}
function updateOfflineBadge(){
  const badge = document.getElementById('offlineBadge');
  if(!badge) return;
  if(navigator.onLine){ badge.textContent = 'Siap dipakai offline'; badge.classList.remove('is-offline'); }
  else { badge.textContent = 'Mode offline aktif'; badge.classList.add('is-offline'); }
}

/* ===== Collaboration (Firebase) ===== */
function initCollab(){
  window.addEventListener('aurora-db-ready', () => {
    dbReady = !!(window.AuroraDB && window.AuroraDB.ready);
    if(dbReady){
      window.AuroraDB.subscribeNotes(notes => { COMMUNITY_NOTES = notes; renderCatList(); updateNavBadges(); render(); });
      window.AuroraDB.subscribeComments(comments => {
        const grouped = {};
        comments.forEach(c => { grouped[c.page] = grouped[c.page] || []; grouped[c.page].push(c); });
        COMMENTS_BY_PAGE = grouped;
        updateNavBadges();
        render();
      });
      window.AuroraDB.subscribeHistory(hist => { HISTORY = hist; updateNavBadges(); if(activeCat==='history') renderHistoryView(); });
    } else {
      render();
    }
  });

  document.getElementById('fabAdd').addEventListener('click', ()=>{
    document.getElementById('addNoteModal').classList.add('open');
  });

  document.getElementById('fabAI').addEventListener('click', ()=>{
    document.getElementById('aiModal').classList.add('open');
    setTimeout(()=>document.getElementById('aiQuestion').focus(), 150);
  });
  document.getElementById('closeAI').addEventListener('click', closeAIModal);
  document.getElementById('aiModal').addEventListener('click', (ev)=>{
    if(ev.target.id === 'aiModal') closeAIModal();
  });
  document.getElementById('aiSend').addEventListener('click', sendAIQuestion);
  document.getElementById('aiQuestion').addEventListener('keydown', (ev)=>{
    if(ev.key === 'Enter' && !ev.shiftKey){ ev.preventDefault(); sendAIQuestion(); }
  });
  document.getElementById('closeAddNote').addEventListener('click', closeAddNoteModal);
  document.getElementById('addNoteModal').addEventListener('click', (ev)=>{
    if(ev.target.id === 'addNoteModal') closeAddNoteModal();
  });
  document.getElementById('submitNote').addEventListener('click', submitNewNote);

  document.getElementById('closeReport').addEventListener('click', closeReportModal);
  document.getElementById('reportModal').addEventListener('click', (ev)=>{
    if(ev.target.id === 'reportModal') closeReportModal();
  });
  document.getElementById('submitReport').addEventListener('click', submitReport);

  document.getElementById('historyNavItem').addEventListener('click', ()=>{
    activeCat = 'history';
    document.querySelectorAll('.cat-item').forEach(el=>el.classList.remove('active'));
    document.getElementById('historyNavItem').classList.add('active');
    render();
    closeSidebar();
    window.scrollTo({top:0, behavior:'smooth'});
  });
  document.getElementById('recentNavItem').addEventListener('click', ()=>{
    activeCat = 'recent';
    document.querySelectorAll('.cat-item').forEach(el=>el.classList.remove('active'));
    document.getElementById('recentNavItem').classList.add('active');
    render();
    closeSidebar();
    window.scrollTo({top:0, behavior:'smooth'});
  });

  const savedAuthor = localStorage.getItem('aurora_author');
  if(savedAuthor) document.getElementById('noteAuthor').value = savedAuthor;
}

function closeAddNoteModal(){
  document.getElementById('addNoteModal').classList.remove('open');
  document.getElementById('noteStatus').textContent = '';
}

async function submitNewNote(){
  const cat = document.getElementById('noteCategory').value;
  const text = document.getElementById('noteText').value.trim();
  const author = document.getElementById('noteAuthor').value.trim() || 'Anonim';
  const statusEl = document.getElementById('noteStatus');

  if(!text){ statusEl.textContent = 'Isi catatan dulu ya.'; return; }
  if(!dbReady){ statusEl.textContent = 'Fitur ini belum aktif — lihat FIRESTORE_SETUP.md.'; return; }

  localStorage.setItem('aurora_author', author);
  const btn = document.getElementById('submitNote');
  btn.disabled = true; btn.textContent = 'Mengirim...';
  try{
    await window.AuroraDB.addNote(cat, text, author);
    document.getElementById('noteText').value = '';
    statusEl.textContent = 'Catatan terkirim!';
    setTimeout(closeAddNoteModal, 900);
  }catch(e){
    statusEl.textContent = 'Gagal mengirim. Coba lagi.';
  }
  btn.disabled = false; btn.textContent = 'Kirim Catatan';
}

function bindEvents(){
  searchInput.addEventListener('input', ()=> render());
  document.getElementById('lightboxClose').addEventListener('click', closeLightbox);
  document.getElementById('lightbox').addEventListener('click', (ev)=>{
    if(ev.target.id === 'lightbox') closeLightbox();
  });
  document.addEventListener('keydown', (ev)=>{ if(ev.key==='Escape'){ closeLightbox(); closeAddNoteModal(); closeReportModal(); closeAIModal(); } });

  document.getElementById('menuBtn').addEventListener('click', openSidebar);
  document.getElementById('scrim').addEventListener('click', closeSidebar);
  document.getElementById('searchBtn').addEventListener('click', ()=>{
    openSidebar();
    setTimeout(()=>searchInput.focus(), 200);
  });
}

init();
