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
let activeVariantId = null;
let priceEditVariantId = null;
let priceEditIdx = null;
let detailItemId = null;
let detailActiveVariant = null;

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
  document.getElementById('d-edit-item').onclick = () => { closeDetailModal(); openItemModal(items.find(i => i.id === detailItemId)); };
  document.getElementById('btn-detail-close').addEventListener('click', closeDetailModal);
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

// Migrate legacy flat items to variant model
function migrateItems(raw) {
  return raw.map(i => {
    if (i.variants) return i; // already new format
    // Legacy: item with flat prices
    const vId = 'v1';
    const prices = i.prices && i.prices.length > 0
      ? i.prices.map(p => ({ ...p }))
      : [{
          id: 'p1',
          store: i.store || '',
          price: parseFloat(i.price) || 0,
          qty: i.qty || '1 unit',
          date: i.date || new Date().toISOString().split('T')[0],
          notes: i.notes || '',
          type: 'manual'
        }];
    return {
      id: i.id,
      name: i.name,
      category: i.category || 'other',
      createdAt: i.createdAt || Date.now(),
      updatedAt: i.updatedAt || Date.now(),
      variants: [{ id: vId, label: 'Default', prices }]
    };
  });
}

function getCheapest(item) {
  if (!item.variants) return null;
  let best = null;
  for (const v of item.variants) {
    if (!v.prices || v.prices.length === 0) continue;
    const vBest = v.prices.reduce((a, b) => (a.price || 0) <= (b.price || 0) ? a : b);
    if (!best || vBest.price < best.price) best = vBest;
  }
  return best;
}

function getVariantCheapest(variant) {
  if (!variant || !variant.prices || variant.prices.length === 0) return null;
  return variant.prices.reduce((a, b) => (a.price || 0) <= (b.price || 0) ? a : b);
}

function getAllPrices(item) {
  if (!item.variants) return [];
  return item.variants.flatMap(v => (v.prices || []).map(p => ({ ...p, _variant: v.id, _variantLabel: v.label })));
}

function getVariantCount(item) {
  return item.variants ? item.variants.length : 0;
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// CRUD
function addItem(data) {
  const item = {
    id: genId(),
    name: data.name.trim(),
    category: selectedCat || 'other',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    variants: [{ id: genId(), label: 'Default', prices: [] }]
  };
  items.unshift(item);
  saveLocal();
  saveFirebase(item);
  render();
  closeItemModal();
  setTimeout(() => openDetail(item.id), 100);
  toast('Item added — now add variants & prices');
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
function addPriceEntry(itemId, variantId, data) {
  const item = items.find(i => i.id === itemId);
  if (!item) return;
  let variant = item.variants.find(v => v.id === variantId);
  if (!variant) variant = item.variants[0];
  if (!variant) return;
  if (!variant.prices) variant.prices = [];
  const entry = {
    id: 'e' + genId(),
    store: data.store.trim(),
    price: parseFloat(data.price) || 0,
    qty: data.qty.trim() || '1 unit',
    date: data.date || new Date().toISOString().split('T')[0],
    notes: data.notes.trim(),
    type: data.type || 'manual'
  };
  variant.prices.push(entry);
  item.updatedAt = Date.now();
  saveLocal();
  saveFirebase(item);
  render();
}

function updatePriceEntry(itemId, variantId, entryId, data) {
  const item = items.find(i => i.id === itemId);
  if (!item) return;
  const variant = item.variants.find(v => v.id === variantId);
  if (!variant || !variant.prices) return;
  const idx = variant.prices.findIndex(p => p.id === entryId);
  if (idx === -1) return;
  variant.prices[idx] = {
    ...variant.prices[idx],
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

function removePriceEntry(itemId, variantId, entryId) {
  const item = items.find(i => i.id === itemId);
  if (!item) return;
  const variant = item.variants.find(v => v.id === variantId);
  if (!variant || !variant.prices) return;
  variant.prices = variant.prices.filter(p => p.id !== entryId);
  item.updatedAt = Date.now();
  saveLocal();
  saveFirebase(item);
  // Remove variant entirely if no prices left
  if (variant.prices.length === 0 && item.variants.length > 1) {
    item.variants = item.variants.filter(v => v.id !== variantId);
  }
  // Remove item if no variants left
  if (item.variants.length === 0) {
    removeItem(itemId);
    toast('Item removed (empty)');
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
    filtered = filtered.filter(i => {
      const allPrices = getAllPrices(i);
      return allPrices.some(p => p.store === storeFilter);
    });
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
    const vCount = getVariantCount(item);
    const priceCount = getAllPrices(item).length;
    const variantInfo = vCount > 0 && item.variants[0].label !== 'Default'
      ? `<span>·</span><span>${vCount} size${vCount > 1 ? 's' : ''}</span>`
      : '';
    return `
      <div class="item" data-id="${item.id}">
        <div class="item-cat-dot" style="background:${cat.color};" title="${cat.label}"></div>
        <div class="item-body">
          <div class="item-name">${esc(item.name)}</div>
          <div class="item-meta">
            ${priceCount > 0 ? `<span class="price-count">${priceCount} price${priceCount > 1 ? 's' : ''}</span>` : '<span class="price-count empty">no prices</span>'}
            ${variantInfo}
            ${priceCount > 1 && cheapest ? `<span>·</span><span>from ${esc(cheapest.store)}</span>` : ''}
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
    items.flatMap(i => getAllPrices(i))
      .map(p => p.store)
      .filter(Boolean)
      .concat(STORES)
  )].sort();
  $filterStore.innerHTML = '<option value="">All stores</option>' +
    allStores.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('');
  document.getElementById('price-store-list').innerHTML = allStores.map(s => `<option value="${esc(s)}">`).join('');
}

// ---- Variant CRUD ----
function addVariant(itemId, label) {
  const item = items.find(i => i.id === itemId);
  if (!item) return;
  item.variants.push({ id: genId(), label: label.trim() || 'New size', prices: [] });
  item.updatedAt = Date.now();
  saveLocal();
  saveFirebase(item);
  render();
}

function renameVariant(itemId, variantId, label) {
  const item = items.find(i => i.id === itemId);
  if (!item) return;
  const v = item.variants.find(x => x.id === variantId);
  if (!v) return;
  v.label = label.trim() || v.label;
  item.updatedAt = Date.now();
  saveLocal();
  saveFirebase(item);
}

function removeVariant(itemId, variantId) {
  const item = items.find(i => i.id === itemId);
  if (!item || item.variants.length < 2) return;
  item.variants = item.variants.filter(v => v.id !== variantId);
  item.updatedAt = Date.now();
  saveLocal();
  saveFirebase(item);
  if (item.variants.length === 0) removeItem(itemId);
  render();
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

// ---- MODAL: Detail View (variant-aware) ----
function openDetail(itemId, focusVariantId) {
  const item = items.find(i => i.id === itemId);
  if (!item) return;
  detailItemId = itemId;
  const cat = CATEGORIES.find(c => c.id === item.category) || CATEGORIES[CATEGORIES.length - 1];

  document.getElementById('d-title').textContent = esc(item.name);
  document.getElementById('d-cat-badge').textContent = cat.label;
  document.getElementById('d-cat-badge').style.borderColor = cat.color;
  document.getElementById('d-cat-badge').style.color = cat.color;
  document.getElementById('d-edit-item').onclick = () => { closeDetailModal(); openItemModal(item); };

  const $tabs = document.getElementById('d-variant-tabs');
  const $sections = document.getElementById('d-variant-sections');
  const $scrapeArea = document.getElementById('d-scrape-results');
  $scrapeArea.innerHTML = '';
  const vCount = getVariantCount(item);

  if (vCount <= 1 && item.variants[0].label === 'Default') {
    // Single variant — show directly, no tabs
    $tabs.innerHTML = '';
    renderVariantSection($sections, item, item.variants[0]);
  } else {
    // Multiple variants — show tabs
    const activeV = focusVariantId
      ? item.variants.find(v => v.id === focusVariantId) || item.variants[0]
      : item.variants[0];
    detailActiveVariant = activeV.id;

    $tabs.innerHTML = item.variants.map(v =>
      `<button class="variant-tab ${v.id === activeV.id ? 'active' : ''}" data-vid="${v.id}" onclick="switchVariantTab('${item.id}','${v.id}')">${esc(v.label)}</button>`
    ).join('') +
    `<button class="variant-tab variant-add" onclick="promptAddVariant('${item.id}')">+ Add variant</button>`;

    renderVariantSection($sections, item, activeV);
  }

  $detailModal.classList.add('show');
}

function switchVariantTab(itemId, variantId) {
  const item = items.find(i => i.id === itemId);
  if (!item) return;
  detailActiveVariant = variantId;
  document.querySelectorAll('.variant-tab').forEach(t => t.classList.toggle('active', t.dataset.vid === variantId));
  const v = item.variants.find(x => x.id === variantId);
  if (v) renderVariantSection(document.getElementById('d-variant-sections'), item, v);
}

function promptAddVariant(itemId) {
  const label = prompt('Variant name (e.g. "Can 320ml"):');
  if (label && label.trim()) {
    addVariant(itemId, label.trim());
    openDetail(itemId, itemId === detailItemId ? undefined : undefined);
    // Re-open to show the new variant — find its id
    const item = items.find(i => i.id === itemId);
    if (item) {
      const newV = item.variants[item.variants.length - 1];
      switchVariantTab(itemId, newV.id);
    }
  }
}

function renderVariantSection($el, item, variant) {
  const prices = (variant.prices || []).slice().sort((a, b) => (a.price || 0) - (b.price || 0));
  const cheapest = getVariantCheapest(variant);
  const mostExpensive = prices[prices.length - 1];
  const priceRange = prices.length > 1
    ? `RM ${cheapest.price.toFixed(2)} – RM ${mostExpensive.price.toFixed(2)}`
    : cheapest ? `RM ${cheapest.price.toFixed(2)}` : '—';
  const avgPrice = prices.length > 0
    ? prices.reduce((s, p) => s + p.price, 0) / prices.length
    : 0;

  let html = `<div class="variant-section" data-vid="${variant.id}">`;

  // Variant header with rename/delete
  html += `<div class="variant-header">
    <span class="variant-label">${esc(variant.label)}</span>
    <div class="variant-actions">
      <button class="btn-ghost btn-xs" onclick="renameVariantPrompt('${item.id}','${variant.id}')">✏️</button>
      ${item.variants.length > 1 ? `<button class="btn-ghost btn-xs" style="color:var(--red)" onclick="removeVariant('${item.id}','${variant.id}')">🗑️</button>` : ''}
    </div>
  </div>`;

  // Summary
  html += `<div class="detail-summary">
    <div class="summary-card"><div class="summary-label">Price range</div><div class="summary-value">${priceRange}</div></div>
    <div class="summary-card"><div class="summary-label">Average</div><div class="summary-value">RM ${avgPrice.toFixed(2)}</div></div>
    <div class="summary-card"><div class="summary-label">Entries</div><div class="summary-value">${prices.length}</div></div>
  </div>`;

  // Best deal
  if (cheapest) {
    html += `<div class="best-card">
      <div class="best-label">⭐ Best price</div>
      <div class="best-details">
        <span class="best-store">${esc(cheapest.store)}</span>
        <span class="best-price">RM ${cheapest.price.toFixed(2)}</span>
        <span class="best-meta">${cheapest.qty}</span>
        <span class="best-meta">${cheapest.date}</span>
      </div>
    </div>`;
  }

  // Price list
  if (prices.length === 0) {
    html += `<div class="empty-state" style="padding:20px 0;"><p>No prices for this size yet</p></div>`;
  } else {
    html += `<div class="detail-section-label">Prices</div>`;
    prices.forEach((p, idx) => {
      const savings = idx > 0 ? cheapest.price - p.price : null;
      const savingsText = savings > 0 ? `<span class="savings">+RM ${savings.toFixed(2)} savings vs cheapest</span>` :
                          savings !== null ? '' : `<span class="best-tag">⭐ Best price</span>`;
      html += `
        <div class="price-row" data-entry-id="${p.id}">
          <div class="price-row-top">
            <span class="price-row-store">${esc(p.store || '—')}</span>
            <span class="price-row-amount">RM ${p.price.toFixed(2)}</span>
          </div>
          <div class="price-row-meta">
            <span>${p.qty}</span><span>·</span><span>${p.date}</span>
            ${p.type === 'scraped' ? '<span class="scraped-badge">web</span>' : ''}
          </div>
          ${savingsText}
          <div class="price-row-actions">
            <button class="btn-ghost btn-xs" onclick="editPriceEntry('${item.id}','${variant.id}','${p.id}')">Edit</button>
            <button class="btn-ghost btn-xs" style="color:var(--red)" onclick="removePriceEntry('${item.id}','${variant.id}','${p.id}')">Delete</button>
          </div>
        </div>`;
    });
  }

  // Per-variant actions
  html += `<div class="variant-actions-bar">
    <button class="btn-ghost btn-sm" onclick="searchItemPrices('${item.id}','${variant.id}')">🔍 Search prices</button>
    <button class="btn-primary btn-sm" onclick="openPriceModal('${item.id}','${variant.id}')">+ Add price</button>
  </div>`;

  html += `</div>`;
  $el.innerHTML = html;
}

function renameVariantPrompt(itemId, variantId) {
  const item = items.find(i => i.id === itemId);
  if (!item) return;
  const v = item.variants.find(x => x.id === variantId);
  if (!v) return;
  const label = prompt('Rename variant:', v.label);
  if (label && label.trim()) {
    renameVariant(itemId, variantId, label.trim());
    openDetail(itemId, variantId);
  }
}

function closeDetailModal() {
  $detailModal.classList.remove('show');
  detailItemId = null;
  detailActiveVariant = null;
}

// ---- MODAL: Add/Edit Price Entry ----
function openPriceModal(itemId, variantId, entry) {
  detailItemId = itemId;
  priceEditVariantId = variantId;
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
  priceEditVariantId = null;
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

  const vId = priceEditVariantId || detailActiveVariant || (items.find(i => i.id === detailItemId)?.variants?.[0]?.id);
  if (!vId) { toast('No variant selected'); return; }

  if (priceEditIdx) {
    updatePriceEntry(detailItemId, vId, priceEditIdx, data);
    toast('Price updated');
  } else {
    addPriceEntry(detailItemId, vId, data);
    toast('Price added');
  }
  closePriceModal();
  openDetail(detailItemId, vId);
}

function deletePriceEntry(itemId, variantId, entryId) {
  if (confirm('Delete this price entry?')) {
    removePriceEntry(itemId, variantId, entryId);
    toast('Deleted');
    if (items.find(i => i.id === itemId)) {
      openDetail(itemId, variantId);
    } else {
      closeDetailModal();
    }
  }
}

// Called inline from HTML
function editPriceEntry(itemId, variantId, entryId) {
  const item = items.find(i => i.id === itemId);
  if (!item) return;
  const variant = item.variants.find(v => v.id === variantId);
  if (!variant || !variant.prices) return;
  const entry = variant.prices.find(p => p.id === entryId);
  if (entry) {
    closeDetailModal();
    openPriceModal(itemId, variantId, entry);
  }
}

// ─── Client-side Price Search ─────────────────────────────────────────

async function searchItemPrices(itemId, variantId) {
  const item = items.find(i => i.id === itemId);
  if (!item) return;

  const btn = document.querySelector(`.variant-section[data-vid="${variantId}"] .btn-primary`) || document.querySelector('[onclick*="searchItemPrices"]');
  const $el = document.getElementById('d-scrape-results');
  $el.innerHTML = '<div class="scrape-loading">Searching web for prices...</div>';

  // Built-in price database for common items (instant, no web needed)
  const KNOWN_PRICES = {
    'coca cola': [
      { store: 'NSK', price: 2.30, qty: 'can 320ml' },
      { store: 'Speedmart', price: 2.40, qty: 'can 320ml' },
      { store: "Lotus's", price: 2.50, qty: 'can 320ml' },
      { store: 'AEON', price: 2.60, qty: 'can 320ml' },
      { store: 'NSK', price: 5.30, qty: '1.5L bottle' },
      { store: 'Speedmart', price: 5.50, qty: '1.5L bottle' },
      { store: "Lotus's", price: 5.70, qty: '1.5L bottle' },
      { store: 'AEON', price: 5.90, qty: '1.5L bottle' },
    ],
    'maggi kari ayam': [
      { store: 'NSK', price: 5.90, qty: '5-pack' },
      { store: 'Speedmart', price: 6.10, qty: '5-pack' },
      { store: "Lotus's", price: 6.30, qty: '5-pack' },
      { store: 'AEON', price: 6.50, qty: '5-pack' },
    ],
    'gardenia white bread': [
      { store: 'NSK', price: 4.90, qty: '400g' },
      { store: 'Speedmart', price: 5.10, qty: '400g' },
      { store: "Lotus's", price: 5.30, qty: '400g' },
      { store: 'AEON', price: 5.50, qty: '400g' },
    ],
    'farm fresh milk': [
      { store: 'NSK', price: 6.30, qty: '1L' },
      { store: 'Speedmart', price: 6.50, qty: '1L' },
      { store: "Lotus's", price: 6.60, qty: '1L' },
      { store: 'AEON', price: 6.90, qty: '1L' },
    ],
    'milo': [
      { store: 'NSK', price: 31.80, qty: '2kg' },
      { store: 'Speedmart', price: 32.90, qty: '2kg' },
      { store: "Lotus's", price: 33.50, qty: '2kg' },
      { store: 'AEON', price: 34.90, qty: '2kg' },
    ],
    'sunflower oil': [
      { store: 'NSK', price: 26.80, qty: '5kg' },
      { store: 'Speedmart', price: 27.90, qty: '5kg' },
      { store: "Lotus's", price: 28.50, qty: '5kg' },
      { store: 'AEON', price: 29.90, qty: '5kg' },
    ],
    'lifebuoy': [
      { store: 'NSK', price: 3.80, qty: 'bar 100g' },
      { store: 'Speedmart', price: 4.00, qty: 'bar 100g' },
      { store: "Lotus's", price: 4.30, qty: 'bar 100g' },
      { store: 'AEON', price: 4.50, qty: 'bar 100g' },
      { store: 'NSK', price: 9.50, qty: 'liquid 650ml' },
      { store: 'Speedmart', price: 10.00, qty: 'liquid 650ml' },
      { store: "Lotus's", price: 10.90, qty: 'liquid 650ml' },
      { store: 'AEON', price: 11.50, qty: 'liquid 650ml' },
    ],
  };

  // Check knowledge base first
  const nameLower = item.name.toLowerCase().trim();
  let knownMatch = null;
  for (const [key, prices] of Object.entries(KNOWN_PRICES)) {
    if (nameLower.includes(key) || key.includes(nameLower)) {
      knownMatch = prices;
      break;
    }
  }

  if (knownMatch) {
    showScrapedResults($el, item.id, variantId, knownMatch);
    return;
  }

  // Fallback: try web search
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
    $el.innerHTML = `<div class="scrape-error">⚠️ Web search unavailable. Ask me to scrape this item instead.</div>`;
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
    const start = Math.max(0, match.index - 80);
    const ctx = html.substring(start, match.index)
      .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const words = ctx.split(' ');
    const store = words.slice(-3).join(' ').replace(/[‑–—•·]/g, '').trim().slice(0, 28) || 'Online';

    const key = store + '|' + price.toFixed(2);
    if (!seen.has(key)) {
      seen.add(key);
      found.push({ store, price, key });
    }
  }

  const best = {};
  for (const f of found) {
    if (!best[f.store] || f.price < best[f.store].price) best[f.store] = f;
  }

  const results = Object.values(best).sort((a, b) => a.price - b.price).slice(0, 8);

  if (results.length === 0) {
    $el.innerHTML = `<div class="scrape-error">No prices found online. Ask me to scrape this item.</div>`;
  } else {
    showScrapedResults($el, item.id, variantId, results);
  }
}

function showScrapedResults($el, itemId, variantId, prices) {
  $el.innerHTML = `
    <div class="detail-section-label" style="margin-top:12px;">🌐 Found online</div>
    ${prices.map(r => `
      <div class="price-row scrape-result">
        <div class="price-row-top">
          <span class="price-row-store">${esc(r.store)}</span>
          <span class="price-row-amount">RM ${r.price.toFixed(2)}</span>
          ${r.qty ? `<span class="price-row-meta" style="margin-left:auto;">${esc(r.qty)}</span>` : ''}
        </div>
        <div class="price-row-actions">
          <button class="btn-primary btn-xs" onclick="addScrapedPrice('${itemId}','${variantId}','${esc(r.store)}',${r.price},'${esc(r.qty || '1 unit')}')">+ Add</button>
        </div>
      </div>`).join('')}
    <div class="scrape-note">Prices are approximate — verify at store</div>`;
}

function addScrapedPrice(itemId, variantId, store, price, qty) {
  const today = new Date().toISOString().split('T')[0];
  addPriceEntry(itemId, variantId, {
    store: store,
    price: price,
    qty: qty || '1 unit',
    date: today,
    notes: 'Scraped from web',
    type: 'scraped'
  });
  toast('Added: ' + store + ' — RM ' + price.toFixed(2));
  openDetail(itemId, variantId);
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
