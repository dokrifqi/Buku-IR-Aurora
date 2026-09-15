let ENTRIES = [];
let CATEGORIES = [];
let COMMUNITY_NOTES = [];
let COMMENTS_BY_PAGE = {};
let HISTORY = [];
let activeCat = 'all';
let BOOKMARKS = new Set(JSON.parse(localStorage.getItem('aurora_bookmarks') || '[]'));
let dbReady = false;

const contentEl = document.getElementById('content');
const catListEl = document.getElementById('catList');
const searchInput = document.getElementById('searchInput');
const totalCountEl = document.getElementById('totalCount');
const heroStatsEl = document.getElementById('heroStats');
const heroEl = document.getElementById('hero');

async function init(){
  const [entries, cats] = await Promise.all([
    fetch('data/entries.json').then(r=>r.json()),
    fetch('data/categories.json').then(r=>r.json())
  ]);
  ENTRIES = entries;
  CATEGORIES = cats;
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
      document.getElementById('historyNavItem').classList.remove('active');
      render();
      closeSidebar();
      window.scrollTo({top:0, behavior:'smooth'});
    });
  });
}

function populateNoteCategorySelect(){
  const sel = document.getElementById('noteCategory');
  sel.innerHTML = CATEGORIES.map(c=>`<option value="${c.key}">${c.label}</option>`).join('');
}

function highlight(text, q){
  if(!q) return escapeHtml(text);
  const esc = escapeHtml(text);
  const safeQ = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return esc.replace(new RegExp('('+safeQ+')','ig'), '<mark>$1</mark>');
}

function escapeHtml(s){
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
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

  const q = searchInput.value.trim().toLowerCase();

  // build unified pool: PDF entries + community notes (as pseudo-entries)
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
    html += `<section class="cat-section">
      <div class="cat-section-head"><h2>${label}</h2><span class="n">${list.length}</span></div>
      ${list.map(e=>entryHtml(e,q)).join('')}
    </section>`;
  });

  contentEl.innerHTML = html;

  contentEl.querySelectorAll('.entry-images img').forEach(img=>{
    img.addEventListener('click', ()=> openLightbox(img.src));
  });
  bindCopyButtons();
  bindBookmarkButtons();
  bindCommentToggles();
}

function catLabel(key){
  const c = CATEGORIES.find(c=>c.key===key);
  return c ? c.label : key;
}

function entryHtml(e, q){
  const textHtml = highlight(e.text, q).replace(/\n/g, '<br>');
  const imgs = e.images.map(f=>`<img src="img/${f}" loading="lazy" alt="Halaman ${e.page}">`).join('');
  const encoded = encodeURIComponent(e.text);
  const pageKey = e.pageKey;
  const commentList = COMMENTS_BY_PAGE[pageKey] || [];

  let badgeHtml;
  if(e.isCommunity){
    badgeHtml = `<span class="entry-page community-badge">&#128221; ${escapeHtml(e.author||'Anonim')} &middot; ${timeAgo(e.createdAt)}</span>`;
  } else {
    badgeHtml = `<span class="entry-page">Hal. ${e.page}</span>`;
  }

  const isFav = !e.isCommunity && BOOKMARKS.has(e.page);
  const bookmarkBtn = e.isCommunity ? '' : `
        <button class="icon-action-btn bookmark-btn ${isFav?'active':''}" data-page="${e.page}" title="${isFav?'Hapus dari favorit':'Simpan ke favorit'}">
          <svg viewBox="0 0 24 24" width="15" height="15"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.77 5.82 21 7 14.14l-5-4.87 6.91-1.01L12 2z" fill="${isFav?'currentColor':'none'}" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>
        </button>`;

  return `<article class="entry ${e.isCommunity?'entry-community':''}">
    <div class="entry-head">
      ${badgeHtml}
      <div class="entry-actions">
        ${bookmarkBtn}
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
              <p>${escapeHtml(c.text)}</p>
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

function renderHistoryView(){
  heroEl.style.display = 'none';
  if(!dbReady){
    contentEl.innerHTML = `<div class="empty-state"><h3>Riwayat belum aktif</h3><p>Fitur ini butuh konfigurasi database. Lihat FIRESTORE_SETUP.md di paket file.</p></div>`;
    return;
  }
  if(HISTORY.length === 0){
    contentEl.innerHTML = `<div class="empty-state"><h3>Belum ada riwayat</h3><p>Perubahan (catatan baru & komentar) akan muncul di sini.</p></div>`;
    return;
  }
  const icons = { note: '&#128221;', comment: '&#128172;' };
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
  if('serviceWorker' in navigator){ navigator.serviceWorker.register('sw.js').catch(()=>{}); }
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
      window.AuroraDB.subscribeNotes(notes => { COMMUNITY_NOTES = notes; renderCatList(); render(); });
      window.AuroraDB.subscribeComments(comments => {
        const grouped = {};
        comments.forEach(c => { grouped[c.page] = grouped[c.page] || []; grouped[c.page].push(c); });
        COMMENTS_BY_PAGE = grouped;
        render();
      });
      window.AuroraDB.subscribeHistory(hist => { HISTORY = hist; if(activeCat==='history') renderHistoryView(); });
    } else {
      render();
    }
  });

  document.getElementById('fabAdd').addEventListener('click', ()=>{
    document.getElementById('addNoteModal').classList.add('open');
  });
  document.getElementById('closeAddNote').addEventListener('click', closeAddNoteModal);
  document.getElementById('addNoteModal').addEventListener('click', (ev)=>{
    if(ev.target.id === 'addNoteModal') closeAddNoteModal();
  });
  document.getElementById('submitNote').addEventListener('click', submitNewNote);

  document.getElementById('historyNavItem').addEventListener('click', ()=>{
    activeCat = 'history';
    document.querySelectorAll('.cat-item').forEach(el=>el.classList.remove('active'));
    document.getElementById('historyNavItem').classList.add('active');
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
  document.addEventListener('keydown', (ev)=>{ if(ev.key==='Escape'){ closeLightbox(); closeAddNoteModal(); } });

  document.getElementById('menuBtn').addEventListener('click', openSidebar);
  document.getElementById('scrim').addEventListener('click', closeSidebar);
  document.getElementById('searchBtn').addEventListener('click', ()=>{
    openSidebar();
    setTimeout(()=>searchInput.focus(), 200);
  });
}

init();
