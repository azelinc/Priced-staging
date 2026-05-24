// Priced — Price Database & Comparison
// Firebase: ainvested-703ec

const FB_CONFIG = {
  apiKey: "AIzaSyC2fezwrXSOeDCytG84RES-dJ04teLvmuo",
  authDomain: "ainvested-703ec.firebaseapp.com",
  databaseURL: "https://ainvested-703ec-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "ainvested-703ec",
  storageBucket: "ainvested-703ec.appspot.com",
  messagingSenderId: "727721440588",
  appId: "1:727721440588:web:5a7b8c9d0e1f2a3b4c5d6e"
};

const CATEGORIES = [
  { id: 'produce', label: 'Produce', color: '#3fb950' },
  { id: 'dairy', label: 'Dairy & Eggs', color: '#a371f7' },
  { id: 'meat', label: 'Meat & Seafood', color: '#da3633' },
  { id: 'bakery', label: 'Bakery', color: '#d29922' },
  { id: 'pantry', label: 'Pantry', color: '#db6d28' },
  { id: 'frozen', label: 'Frozen', color: '#39d2c0' },
  { id: 'beverages', label: 'Beverages', color: '#58a6ff' },
  { id: 'snacks', label: 'Snacks', color: '#f778ba' },
  { id: 'household', label: 'Household', color: '#8b949e' },
  { id: 'other', label: 'Other', color: '#6e7681' }
];

const LS_KEY = 'priced_v2';
const STORES = ['AEON', 'Lotus\'s', 'NSK', 'Village Grocer', 'Jaya Grocer', 'Mydin', 'Econsave', 'Speedmart', 'Giant', 'HappyFresh'];

// State
let items = [];
let user = null;
let db = null;
let selectedCat = '';
let priceEditIdx = -1;
let detailItemId = null;

// DOM refs
const $list = document.getElementById('items-list');
const $search = document.getElementById('search');
const $filterStore = document.getElementById('filter-store');
const $filterCat = document.getElementById('filter-category');
const $itemModal = document.getElementById('item-modal');
const $detailModal = document.getElementById('detail-modal');
const $priceModal = document.getElementById('price-modal');
const $toast = document.getElementById('toast');
const $btnLogin = document.getElementById('btn-login');

// Init
document.addEventListener('DOMContentLoaded', () => {
  initCategories();
  loadLocal();
  renderCategoryFilter();
  initFirebase();
  bindEvents();
});

function initCategories() {
  document.getElementById('cat-chips').innerHTML = CATEGORIES.map(c =>
    `<span class="chip" data-cat="${c.id}">${c.label}</span>`
  ).join('');
  document.getElementById('cat-chips').addEventListener('click', e => {
    if (e.target.classList.contains('chip')) {
      const cat = e.target.dataset.cat;
      selectedCat = selectedCat === cat ? '' : cat;
      document.querySelectorAll('#cat-chips .chip').forEach(c => c.classList.remove('selected'));
      if (selectedCat) e.target.classList.add('selected');
    }
  });

}

function bindEvents() {
  document.getElementById('btn-add').addEventListener('click', () => openItemModal());
  document.getElementById('btn-item-cancel').addEventListener('click', closeItemModal);
  document.getElementById('btn-item-save').addEventListener('click', saveItem);
  document.getElementById('btn-item-delete').addEventListener('click', deleteItem);
  document.getElementById('item-modal').addEventListener('click', e => { if (e.target === $itemModal) closeItemModal(); });

  document.getElementById('btn-detail-close').addEventListener('click', closeDetailModal);
  document.getElementById('btn-search-prices').addEventListener('click', () => {
    if (detailItemId) searchItemPrices(detailItemId);
  });
  document.getElementById('btn-detail-add-price').addEventListener('click', () => {
    closeDetailModal();
    openPriceModal(detailItemId);
  });
  document.getElementById('detail-modal').addEventListener('click', e => { if (e.target === $detailModal) closeDetailModal(); });

  document.getElementById('btn-price-cancel').addEventListener('click', closePriceModal);
  document.getElementById('btn-price-save').addEventListener('click', savePriceEntry);
  document.getElementById('btn-price-delete').addEventListener('click', deletePriceEntry);
  document.getElementById('price-modal').addEventListener('click', e => { if (e.target === $priceModal) closePriceModal(); });

  $search.addEventListener('input', render);
  $filterStore.addEventListener('change', render);
  $filterCat.addEventListener('change', render);
  $btnLogin.addEventListener('click', toggleAuth);

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if ($priceModal.classList.contains('show')) closePriceModal();
      else if ($detailModal.classList.contains('show')) closeDetailModal();
      else if ($itemModal.classList.contains('show')) closeItemModal();
    }
  });
}

// Firebase
function initFirebase() {
  try {
    firebase.initializeApp(FB_CONFIG);
    db = firebase.database();
    firebase.auth().onAuthStateChanged(u => {
      user = u;
      $btnLogin.textContent = u ? '👤' : '🔐';
      if (u) loadFirebase();
      else { loadLocal(); }
    });
  } catch(e) {
    console.warn('Firebase unavailable', e);
    render();
  }
}

function toggleAuth() {
  if (user) firebase.auth().signOut();
  else firebase.auth().signInAnonymously().catch(e => toast('Sign in failed: ' + e.message));
}

// Data
function loadLocal() {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_KEY) || '[]');
    items = migrateItems(raw);
  } catch { items = []; }
  render();
  updateFilters();
}

function loadFirebase() {
  if (!user) return;
  db.ref(`users/${user.uid}/priced`).once('value', snap => {
    const data = snap.val();
    const raw = data ? Object.entries(data).map(([id, v]) => ({ id, ...v })) : [];
    items = migrateItems(raw);
    saveLocal();
    render();
    updateFilters();
  });
}

function saveLocal() {
  localStorage.setItem(LS_KEY, JSON.stringify(items));
}

function saveFirebase(item) {
  if (!user) return;
  const { id, ...data } = item;
  db.ref(`users/${user.uid}/priced/${id}`).set(data);
}

function deleteFirebase(id) {
  if (!user) return;
  db.ref(`users/${user.uid}/priced/${id}`).remove();
}

// Migrate legacy flat items to multi-price format
function migrateItems(raw) {
  return raw.map(i => {
    if (i.prices) return i; // already new format
    // Legacy: single {price, qty, store, date, notes}
    return {
      id: i.id,
      name: i.name,
      category: i.category || 'other',
      createdAt: i.createdAt || Date.now(),
      updatedAt: i.updatedAt || Date.now(),
      prices: [{
        id: 'p1',
        store: i.store || '',
        price: parseFloat(i.price) || 0,
        qty: i.qty || '1 unit',
        date: i.date || new Date().toISOString().split('T')[0],
        notes: i.notes || '',
        type: 'manual'
      }]
    };
  });
}

function getCheapest(item) {
  if (!item.prices || item.prices.length === 0) return null;
  return item.prices.reduce((a, b) => (a.price || 0) <= (b.price || 0) ? a : b);
}

// CRUD
function addItem(data) {
  const item = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name: data.name.trim(),
    category: selectedCat || 'other',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    prices: []
  };
  items.unshift(item);
  saveLocal();
  saveFirebase(item);
  render();
  closeItemModal();
  // Open detail view so user can add prices
  setTimeout(() => openDetail(item.id), 100);
  toast('Item added — now add prices');
}

function updateItem(id, data) {
  const idx = items.findIndex(i => i.id === id);
  if (idx === -1) return;
  items[idx].name = data.name.trim();
  items[idx].category = data.category || items[idx].category;
  items[idx].updatedAt = Date.now();
  saveLocal();
  saveFirebase(items[idx]);
  render();
}

function removeItem(id) {
  items = items.filter(i => i.id !== id);
  saveLocal();
  deleteFirebase(id);
  render();
}

// Price entry CRUD
function addPriceEntry(itemId, data) {
  const item = items.find(i => i.id === itemId);
  if (!item) return;
  if (!item.prices) item.prices = [];
  const entry = {
    id: 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 4),
    store: data.store.trim(),
    price: parseFloat(data.price) || 0,
    qty: data.qty.trim() || '1 unit',
    date: data.date || new Date().toISOString().split('T')[0],
    notes: data.notes.trim(),
    type: data.type || 'manual'
  };
  item.prices.push(entry);
  item.updatedAt = Date.now();
  saveLocal();
  saveFirebase(item);
  render();
}

function updatePriceEntry(itemId, entryId, data) {
  const item = items.find(i => i.id === itemId);
  if (!item || !item.prices) return;
  const idx = item.prices.findIndex(p => p.id === entryId);
  if (idx === -1) return;
  item.prices[idx] = {
    ...item.prices[idx],
    store: data.store.trim(),
    price: parseFloat(data.price) || 0,
    qty: data.qty.trim() || '1 unit',
    date: data.date,
    notes: data.notes.trim()
  };
  item.updatedAt = Date.now();
  saveLocal();
  saveFirebase(item);
  render();
}

function removePriceEntry(itemId, entryId) {
  const item = items.find(i => i.id === itemId);
  if (!item || !item.prices) return;
  item.prices = item.prices.filter(p => p.id !== entryId);
  item.updatedAt = Date.now();
  saveLocal();
  saveFirebase(item);
  // Remove item entirely if no prices left
  if (item.prices.length === 0) {
    removeItem(itemId);
    toast('Item removed (no prices)');
  }
  render();
}

// ---- RENDER: List view ----
function render() {
  const search = $search.value.toLowerCase();
  const storeFilter = $filterStore.value;
  const catFilter = $filterCat.value;

  let filtered = items;
  if (search) filtered = filtered.filter(i => i.name.toLowerCase().includes(search));
  if (catFilter) filtered = filtered.filter(i => i.category === catFilter);
  if (storeFilter) {
    filtered = filtered.filter(i =>
      i.prices && i.prices.some(p => p.store === storeFilter)
    );
  }

  if (filtered.length === 0) {
    $list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🛒</div>
        <p>${items.length === 0 ? 'No items yet' : 'No matching items'}</p>
        <p class="empty-hint">${items.length === 0 ? 'Tap + to add your first item' : 'Try a different filter'}</p>
      </div>`;
    return;
  }

  $list.innerHTML = filtered.map(item => {
    const cat = CATEGORIES.find(c => c.id === item.category) || CATEGORIES[CATEGORIES.length - 1];
    const cheapest = getCheapest(item);
    const priceCount = (item.prices || []).length;
    return `
      <div class="item" data-id="${item.id}">
        <div class="item-cat-dot" style="background:${cat.color};" title="${cat.label}"></div>
        <div class="item-body">
          <div class="item-name">${esc(item.name)}</div>
          <div class="item-meta">
            ${priceCount > 0 ? `<span class="price-count">${priceCount} price${priceCount > 1 ? 's' : ''}</span>` : '<span class="price-count empty">no prices</span>'}
            ${priceCount > 1 ? `<span>·</span><span>from ${cheapest ? esc(cheapest.store) : '—'}</span>` : ''}
          </div>
        </div>
        ${cheapest ? `<div class="item-price">RM ${cheapest.price.toFixed(2)}<div class="unit">/${cheapest.qty.split(' ')[1] || 'unit'}</div></div>` : `<div class="item-price no-price">—</div>`}
      </div>`;
  }).join('');

  $list.querySelectorAll('.item').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.dataset.id;
      openDetail(id);
    });
  });
}

function renderCategoryFilter() {
  $filterCat.innerHTML = '<option value="">All categories</option>' +
    CATEGORIES.map(c => `<option value="${c.id}">${c.label}</option>`).join('');
}

function updateFilters() {
  const allStores = [...new Set(
    items.flatMap(i => (i.prices || []).map(p => p.store))
      .filter(Boolean)
      .concat(STORES)
  )].sort();
  $filterStore.innerHTML = '<option value="">All stores</option>' +
    allStores.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('');
  document.getElementById('price-store-list').innerHTML = allStores.map(s => `<option value="${esc(s)}">`).join('');
}

// ---- MODAL: Add/Edit Item ----
function openItemModal(item) {
  if (item) {
    detailItemId = item.id;
    document.getElementById('item-title').textContent = 'Edit Item';
    document.getElementById('i-name').value = item.name;
    selectedCat = item.category;
    document.querySelectorAll('#cat-chips .chip').forEach(c => c.classList.toggle('selected', c.dataset.cat === selectedCat));
    document.getElementById('btn-item-delete').style.display = 'block';
  } else {
    detailItemId = null;
    document.getElementById('item-title').textContent = 'Add Item';
    document.getElementById('i-name').value = '';
    selectedCat = '';
    document.querySelectorAll('#cat-chips .chip').forEach(c => c.classList.remove('selected'));
    document.getElementById('btn-item-delete').style.display = 'none';
  }
  $itemModal.classList.add('show');
  document.getElementById('i-name').focus();
}

function closeItemModal() {
  $itemModal.classList.remove('show');
}

function saveItem() {
  const name = document.getElementById('i-name').value;
  if (!name.trim()) { toast('Item name is required'); return; }
  if (detailItemId) {
    updateItem(detailItemId, { name, category: selectedCat });
    toast('Updated');
  } else {
    addItem({ name });
  }
  closeItemModal();
}

function deleteItem() {
  if (!detailItemId) return;
  if (confirm('Delete this item and all its prices?')) {
    removeItem(detailItemId);
    closeItemModal();
    toast('Deleted');
  }
}

// ---- MODAL: Detail View (price comparison) ----
function openDetail(itemId) {
  const item = items.find(i => i.id === itemId);
  if (!item) return;
  detailItemId = itemId;
  const cat = CATEGORIES.find(c => c.id === item.category) || CATEGORIES[CATEGORIES.length - 1];

  document.getElementById('d-title').textContent = esc(item.name);
  document.getElementById('d-cat-badge').textContent = cat.label;
  document.getElementById('d-cat-badge').style.borderColor = cat.color;
  document.getElementById('d-cat-badge').style.color = cat.color;

  // Edit item button
  document.getElementById('d-edit-item').onclick = () => {
    closeDetailModal();
    openItemModal(item);
  };

  const prices = (item.prices || []).slice().sort((a, b) => (a.price || 0) - (b.price || 0));
  const cheapest = prices[0];
  const mostExpensive = prices[prices.length - 1];
  const priceRange = prices.length > 1
    ? `RM ${cheapest.price.toFixed(2)} – RM ${mostExpensive.price.toFixed(2)}`
    : cheapest ? `RM ${cheapest.price.toFixed(2)}` : '—';
  const avgPrice = prices.length > 0
    ? prices.reduce((s, p) => s + p.price, 0) / prices.length
    : 0;

  document.getElementById('d-range').textContent = priceRange;
  document.getElementById('d-avg').textContent = `RM ${avgPrice.toFixed(2)}`;
  document.getElementById('d-count').textContent = `${prices.length} price${prices.length !== 1 ? 's' : ''}`;

  // Best deal
  if (cheapest) {
    document.getElementById('d-best-store').textContent = esc(cheapest.store) || '—';
    document.getElementById('d-best-price').textContent = `RM ${cheapest.price.toFixed(2)}`;
    document.getElementById('d-best-qty').textContent = cheapest.qty;
    document.getElementById('d-best-date').textContent = cheapest.date;
    document.getElementById('d-best-card').style.display = 'block';
  } else {
    document.getElementById('d-best-card').style.display = 'none';
  }

  // Price list
  const $priceList = document.getElementById('d-price-list');
  if (prices.length === 0) {
    $priceList.innerHTML = `<div class="empty-state" style="padding:30px 0;"><p>No prices recorded yet</p></div>`;
  } else {
    $priceList.innerHTML = prices.map((p, idx) => {
      const savings = idx > 0 ? cheapest.price - p.price : null;
      const savingsText = savings > 0 ? `<span class="savings">+RM ${savings.toFixed(2)} savings vs cheapest</span>` :
                          savings !== null ? '' : `<span class="best-tag">⭐ Best price</span>`;
      return `
        <div class="price-row" data-entry-id="${p.id}">
          <div class="price-row-top">
            <span class="price-row-store">${esc(p.store || '—')}</span>
            <span class="price-row-amount">RM ${p.price.toFixed(2)}</span>
          </div>
          <div class="price-row-meta">
            <span>${p.qty}</span>
            <span>·</span>
            <span>${p.date}</span>
            ${p.type === 'scraped' ? '<span class="scraped-badge">web</span>' : ''}
          </div>
          ${savingsText}
          <div class="price-row-actions">
            <button class="btn-ghost btn-xs" onclick="editPriceEntry('${item.id}','${p.id}')">Edit</button>
            <button class="btn-ghost btn-xs" style="color:var(--red)" onclick="removePriceEntry('${item.id}','${p.id}')">Delete</button>
          </div>
        </div>`;
    }).join('');
  }

  $detailModal.classList.add('show');
}

function closeDetailModal() {
  $detailModal.classList.remove('show');
  detailItemId = null;
}

// ---- MODAL: Add/Edit Price Entry ----
function openPriceModal(itemId, entry) {
  detailItemId = itemId;
  if (entry) {
    priceEditIdx = entry.id;
    document.getElementById('p-title').textContent = 'Edit Price';
    document.getElementById('p-store').value = entry.store || '';
    document.getElementById('p-price').value = entry.price || '';
    document.getElementById('p-qty').value = entry.qty || '1 unit';
    document.getElementById('p-date').value = entry.date || new Date().toISOString().split('T')[0];
    document.getElementById('p-notes').value = entry.notes || '';
    document.getElementById('btn-price-delete').style.display = 'block';
  } else {
    priceEditIdx = null;
    document.getElementById('p-title').textContent = 'Add Price';
    document.getElementById('p-store').value = '';
    document.getElementById('p-price').value = '';
    document.getElementById('p-qty').value = '1 unit';
    document.getElementById('p-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('p-notes').value = '';
    document.getElementById('btn-price-delete').style.display = 'none';
  }
  $priceModal.classList.add('show');
  document.getElementById('p-store').focus();
}

function closePriceModal() {
  $priceModal.classList.remove('show');
  priceEditIdx = null;
}

function savePriceEntry() {
  const data = {
    store: document.getElementById('p-store').value,
    price: document.getElementById('p-price').value,
    qty: document.getElementById('p-qty').value,
    date: document.getElementById('p-date').value,
    notes: document.getElementById('p-notes').value
  };
  if (!data.store.trim()) { toast('Store is required'); return; }
  if (!data.price || parseFloat(data.price) < 0) { toast('Valid price is required'); return; }

  if (priceEditIdx) {
    updatePriceEntry(detailItemId, priceEditIdx, data);
    toast('Price updated');
  } else {
    addPriceEntry(detailItemId, data);
    toast('Price added');
  }
  closePriceModal();
  openDetail(detailItemId);
}

function deletePriceEntry(itemId, entryId) {
  if (confirm('Delete this price entry?')) {
    removePriceEntry(itemId, entryId);
    toast('Deleted');
    if (items.find(i => i.id === itemId)) {
      openDetail(itemId);
    } else {
      closeDetailModal();
    }
  }
}

// Called inline from HTML
function editPriceEntry(itemId, entryId) {
  const item = items.find(i => i.id === itemId);
  if (!item || !item.prices) return;
  const entry = item.prices.find(p => p.id === entryId);
  if (entry) {
    closeDetailModal();
    openPriceModal(itemId, entry);
  }
}

// ─── Client-side Price Search ─────────────────────────────────────────

async function searchItemPrices(itemId) {
  const item = items.find(i => i.id === itemId);
  if (!item) return;

  const btn = document.getElementById('btn-search-prices');
  const $results = document.getElementById('d-scrape-results');
  btn.textContent = '⏳ Searching...';
  btn.disabled = true;
  $results.innerHTML = '<div class="scrape-loading">Searching web for prices...</div>';

  const query = encodeURIComponent(item.name + ' price Malaysia RM');
  const proxies = [
    `https://api.allorigins.win/raw?url=https://www.google.com/search?q=${query}`,
    `https://corsproxy.io/?url=${encodeURIComponent('https://www.google.com/search?q=' + query)}`,
  ];

  let html = '';
  for (const proxyUrl of proxies) {
    try {
      const resp = await fetch(proxyUrl, { signal: AbortSignal.timeout(8000) });
      if (resp.ok) { html = await resp.text(); break; }
    } catch(_) { continue; }
  }

  if (!html) {
    $results.innerHTML = `<div class="scrape-error">⚠️ Web search unavailable. Ask me to scrape this item instead.</div>`;
    btn.textContent = '🔍 Search prices';
    btn.disabled = false;
    return;
  }

  // Parse prices from HTML
  const found = [];
  const rePrice = /RM\s*([0-9,.]+)/g;
  let match;
  const seen = new Set();

  while ((match = rePrice.exec(html)) !== null) {
    const price = parseFloat(match[1].replace(',', ''));
    if (isNaN(price) || price < 0.10 || price > 999) continue;

    // Get context around the price for store name
    const start = Math.max(0, match.index - 80);
    const ctx = html.substring(start, match.index)
      .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const words = ctx.split(' ');
    const store = words.slice(-3).join(' ').replace(/[‑–—•·]/g, '').trim().slice(0, 28) || 'Online';

    // Find best source name nearby
    const fullCtx = html.substring(start, match.index + 20)
      .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const nameMatch = fullCtx.match(/.{0,40}RM/);
    const name = nameMatch ? nameMatch[0].replace(/\s*RM\s*$/, '').trim().slice(0, 40) : item.name;

    const key = store + '|' + price.toFixed(2);
    if (!seen.has(key)) {
      seen.add(key);
      found.push({ store, price, name, key });
    }
  }

  // Deduplicate: keep best price per store
  const best = {};
  for (const f of found) {
    if (!best[f.store] || f.price < best[f.store].price) best[f.store] = f;
  }

  const results = Object.values(best).sort((a, b) => a.price - b.price).slice(0, 8);

  if (results.length === 0) {
    $results.innerHTML = `<div class="scrape-error">No prices found online. Ask me to scrape this item.</div>`;
  } else {
    $results.innerHTML = `
      <div class="detail-section-label" style="margin-top:12px;">🌐 Found online</div>
      ${results.map(r => `
        <div class="price-row scrape-result">
          <div class="price-row-top">
            <span class="price-row-store">${esc(r.store)}</span>
            <span class="price-row-amount">RM ${r.price.toFixed(2)}</span>
          </div>
          <div class="price-row-actions">
            <button class="btn-primary btn-xs" onclick="addScrapedPrice('${item.id}','${esc(r.store)}',${r.price})">+ Add</button>
          </div>
        </div>`).join('')}
      <div class="scrape-note">Prices are approximate — verify at store</div>`;
  }

  btn.textContent = '🔍 Search prices';
  btn.disabled = false;
}

function addScrapedPrice(itemId, store, price) {
  const today = new Date().toISOString().split('T')[0];
  addPriceEntry(itemId, {
    store: store,
    price: price,
    qty: '1 unit',
    date: today,
    notes: 'Scraped from web',
    type: 'scraped'
  });
  toast('Added: ' + store + ' — RM ' + price.toFixed(2));
  openDetail(itemId);
}

// Helpers
function esc(s) {
  const d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}

let toastTimer;
function toast(msg) {
  clearTimeout(toastTimer);
  $toast.textContent = msg;
  $toast.classList.add('show');
  toastTimer = setTimeout(() => $toast.classList.remove('show'), 2000);
}
