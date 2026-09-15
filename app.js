let ENTRIES = [];
let CATEGORIES = [];
let activeCat = 'all';

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
  let html = `<div class="cat-item all ${activeCat==='all'?'active':''}" data-cat="all">
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
  if(activeCat !== 'all') pool = pool.filter(e=>e.cat===activeCat);
  if(q) pool = pool.filter(e=> e.text.toLowerCase().includes(q) || e.cat_label.toLowerCase().includes(q));

  heroEl.style.display = q ? 'none' : '';

  if(pool.length === 0){
    contentEl.innerHTML = `<div class="empty-state"><h3>Tidak ditemukan</h3><p>Coba kata kunci lain, misalnya "NICU", "kemoterapi", atau "cairan".</p></div>`;
    return;
  }

  // group by category, preserving CATEGORIES order
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
}

function entryHtml(e, q){
  const textHtml = highlight(e.text, q).replace(/\n/g, '<br>');
  const imgs = e.images.map(f=>`<img src="img/${f}" loading="lazy" alt="Halaman ${e.page}">`).join('');
  return `<article class="entry">
    <span class="entry-page">Hal. ${e.page}</span>
    <div class="entry-text">${textHtml}</div>
    ${imgs ? `<div class="entry-images">${imgs}</div>` : ''}
  </article>`;
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
