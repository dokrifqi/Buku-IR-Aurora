let ENTRIES = [];
let CATEGORIES = [];
let activeCat = 'all';
let BOOKMARKS = new Set(JSON.parse(localStorage.getItem('aurora_bookmarks') || '[]'));

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
  render();
  bindEvents();
  initDarkMode();
  initPWA();
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
      render();
      closeSidebar();
      window.scrollTo({top:0, behavior:'smooth'});
    });
  });
}

function highlight(text, q){
  if(!q) return escapeHtml(text);
  const esc = escapeHtml(text);
  const safeQ = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return esc.replace(new RegExp('('+safeQ+')','ig'), '<mark>$1</mark>');
}

function escapeHtml(s){
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function render(){
  const q = searchInput.value.trim().toLowerCase();

  let pool = ENTRIES;
  if(activeCat === 'fav'){
    pool = pool.filter(e=>BOOKMARKS.has(e.page));
  } else if(activeCat !== 'all'){
    pool = pool.filter(e=>e.cat===activeCat);
  }
  if(q) pool = pool.filter(e=> e.text.toLowerCase().includes(q) || e.cat_label.toLowerCase().includes(q));

  heroEl.style.display = q ? 'none' : '';

  if(pool.length === 0){
    const msg = activeCat === 'fav'
      ? `<h3>Belum ada favorit</h3><p>Ketuk ikon &#9733; di kartu catatan untuk menyimpannya di sini &mdash; cocok untuk dosis obat drip atau rumus cairan yang sering dicari.</p>`
      : `<h3>Tidak ditemukan</h3><p>Coba kata kunci lain, misalnya "NICU", "kemoterapi", atau "cairan".</p>`;
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
  order.filter(k=>grouped[k]).forEach(key=>{
    const list = grouped[key];
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
}

function entryHtml(e, q){
  const textHtml = highlight(e.text, q).replace(/\n/g, '<br>');
  const imgs = e.images.map(f=>`<img src="img/${f}" loading="lazy" alt="Halaman ${e.page}">`).join('');
  const encoded = encodeURIComponent(e.text);
  const isFav = BOOKMARKS.has(e.page);
  return `<article class="entry">
    <div class="entry-head">
      <span class="entry-page">Hal. ${e.page}</span>
      <div class="entry-actions">
        <button class="icon-action-btn bookmark-btn ${isFav?'active':''}" data-page="${e.page}" title="${isFav?'Hapus dari favorit':'Simpan ke favorit'}">
          <svg viewBox="0 0 24 24" width="15" height="15"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.77 5.82 21 7 14.14l-5-4.87 6.91-1.01L12 2z" fill="${isFav?'currentColor':'none'}" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>
        </button>
        <button class="copy-btn" data-text="${encoded}" title="Salin teks ini">
          <svg viewBox="0 0 24 24" width="15" height="15"><rect x="8" y="8" width="12" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M4 16V5a1 1 0 0 1 1-1h11" fill="none" stroke="currentColor" stroke-width="2"/></svg>
          <span class="copy-label">Salin</span>
        </button>
      </div>
    </div>
    <div class="entry-text">${textHtml}</div>
    ${imgs ? `<div class="entry-images">${imgs}</div>` : ''}
  </article>`;
}

function bindCopyButtons(){
  contentEl.querySelectorAll('.copy-btn').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const text = decodeURIComponent(btn.dataset.text);
      try{
        await navigator.clipboard.writeText(text);
      }catch(err){
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      const label = btn.querySelector('.copy-label');
      const original = label.textContent;
      btn.classList.add('copied');
      label.textContent = 'Tersalin!';
      setTimeout(()=>{
        btn.classList.remove('copied');
        label.textContent = original;
      }, 1500);
    });
  });
}

function bindBookmarkButtons(){
  contentEl.querySelectorAll('.bookmark-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const page = Number(btn.dataset.page);
      if(BOOKMARKS.has(page)){
        BOOKMARKS.delete(page);
      } else {
        BOOKMARKS.add(page);
      }
      localStorage.setItem('aurora_bookmarks', JSON.stringify([...BOOKMARKS]));
      renderCatList();
      if(activeCat === 'fav'){
        render();
      } else {
        btn.classList.toggle('active');
        const svgPath = btn.querySelector('path');
        const nowFav = BOOKMARKS.has(page);
        svgPath.setAttribute('fill', nowFav ? 'currentColor' : 'none');
        btn.title = nowFav ? 'Hapus dari favorit' : 'Simpan ke favorit';
      }
    });
  });
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
    navigator.serviceWorker.register('sw.js').catch(()=>{});
  }

  let deferredPrompt = null;
  const installBtn = document.getElementById('installBtn');
  window.addEventListener('beforeinstallprompt', (e)=>{
    e.preventDefault();
    deferredPrompt = e;
    installBtn.style.display = 'flex';
  });
  installBtn.addEventListener('click', async ()=>{
    if(!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    installBtn.style.display = 'none';
  });
  window.addEventListener('appinstalled', ()=>{
    installBtn.style.display = 'none';
  });

  updateOfflineBadge();
  window.addEventListener('online', updateOfflineBadge);
  window.addEventListener('offline', updateOfflineBadge);
}
function updateOfflineBadge(){
  const badge = document.getElementById('offlineBadge');
  if(!badge) return;
  if(navigator.onLine){
    badge.textContent = 'Siap dipakai offline';
    badge.classList.remove('is-offline');
  } else {
    badge.textContent = 'Mode offline aktif';
    badge.classList.add('is-offline');
  }
}

function bindEvents(){
  searchInput.addEventListener('input', ()=> render());
  document.getElementById('lightboxClose').addEventListener('click', closeLightbox);
  document.getElementById('lightbox').addEventListener('click', (ev)=>{
    if(ev.target.id === 'lightbox') closeLightbox();
  });
  document.addEventListener('keydown', (ev)=>{ if(ev.key==='Escape') closeLightbox(); });

  document.getElementById('menuBtn').addEventListener('click', openSidebar);
  document.getElementById('scrim').addEventListener('click', closeSidebar);
  document.getElementById('searchBtn').addEventListener('click', ()=>{
    openSidebar();
    setTimeout(()=>searchInput.focus(), 200);
  });
}

init();
