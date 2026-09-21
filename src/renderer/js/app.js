/**
 * ==============================================================================
 * PARADOU POS DESKTOP - COMPLETE BUSINESS ENGINE (JALON 3 & 4)
 * Dual Online / Offline, Cart, Options, Kilo, Carpet, Payments & Silent Printing
 * ==============================================================================
 */

// Application State
let appConfig = {
  serverUrl: 'http://paradou.test',
  terminalCode: 'POS-CAISSE-01',
  defaultPrinter: '',
  pricingMode: 'detail', // 'detail' | 'wholesale'
};

let catalogData = {
  targets: [],
  subcategories: [],
  services: [],
  items: [],
  clients: [],
  rubrics: {
    colors: [
      'argent', 'azur', 'beige', 'blanc', 'blanc cassé', 'bleu', 'bleu ciel', 
      'bleu marine', 'bleu turquoise', 'bordeaux', 'brun', 'châtain', 'écru', 
      'gris', 'indigo', 'ivoire', 'jaune', 'kaki', 'marron', 'mauve', 'noir', 
      'orange', 'rose', 'rouge', 'vert', 'vert eau', 'vert émeraude', 'vert olive', 'violet'
    ],
    defects: [
      'Bouton Brisé', 'Bouton Manquant', 'Bulle', 'Col Déchiré', 'Déchiré', 
      'Délavé', 'Manchette Déchirée', 'Marque de Repassage', 'Tissu Boulochage', 'Trou'
    ],
    stains: [
      'Aliments', 'Alcool', 'Boue', 'Café', 'Eau de Javel', 'Encre', 'Graisse', 
      'Maquillage', 'Moisissure', 'Parfum', 'Peinture', 'Rouille', 'Sang', 'Transpiration', 'Vin'
    ],
  },
  store_info: {
    name: 'MSK DRY PLUS',
    brand: 'PARADOU',
    slogan: 'Pressing - Blanchisserie - Tapis',
    phone: '0550 00 00 00',
    currency: 'DA',
  },
};

const COLOR_MAP = {
  'argent': { bg: '#c0c0c0', text: '#000000', border: '#a9a9a9' },
  'azur': { bg: '#007fff', text: '#ffffff', border: '#005fcf' },
  'beige': { bg: '#f5f5dc', text: '#000000', border: '#d2b48c' },
  'blanc': { bg: '#ffffff', text: '#000000', border: '#cbd5e1' },
  'blanc cassé': { bg: '#fcf6eb', text: '#000000', border: '#cbd5e1' },
  'bleu': { bg: '#2563eb', text: '#ffffff', border: '#1d4ed8' },
  'bleu ciel': { bg: '#bae6fd', text: '#000000', border: '#7dd3fc' },
  'bleu marine': { bg: '#0f172a', text: '#ffffff', border: '#334155' },
  'bleu turquoise': { bg: '#2dd4bf', text: '#000000', border: '#14b8a6' },
  'bordeaux': { bg: '#991b1b', text: '#ffffff', border: '#7f1d1d' },
  'brun': { bg: '#78350f', text: '#ffffff', border: '#451a03' },
  'châtain': { bg: '#a16207', text: '#ffffff', border: '#78350f' },
  'écru': { bg: '#f5f5f5', text: '#000000', border: '#e5e5e5' },
  'gris': { bg: '#4b5563', text: '#ffffff', border: '#374151' },
  'indigo': { bg: '#4338ca', text: '#ffffff', border: '#3730a3' },
  'ivoire': { bg: '#fffff0', text: '#000000', border: '#fde047' },
  'jaune': { bg: '#eab308', text: '#000000', border: '#ca8a04' },
  'kaki': { bg: '#854d0e', text: '#ffffff', border: '#a16207' },
  'marron': { bg: '#451a03', text: '#ffffff', border: '#291002' },
  'mauve': { bg: '#c084fc', text: '#000000', border: '#a855f7' },
  'noir': { bg: '#09090b', text: '#ffffff', border: '#3f3f46' },
  'orange': { bg: '#ea580c', text: '#ffffff', border: '#c2410c' },
  'rose': { bg: '#f472b6', text: '#ffffff', border: '#ec4899' },
  'rouge': { bg: '#dc2626', text: '#ffffff', border: '#b91c1c' },
  'vert': { bg: '#16a34a', text: '#ffffff', border: '#15803d' },
  'vert émeraude': { bg: '#059669', text: '#ffffff', border: '#047857' },
  'vert eau': { bg: '#a7f3d0', text: '#065f46', border: '#6ee7b7' },
  'vert olive': { bg: '#65a30d', text: '#ffffff', border: '#4d7c0f' },
  'violet': { bg: '#7c3aed', text: '#ffffff', border: '#6d28d9' },
};

let isOnline = false;
let isSyncing = false;
let selectedServiceId = null;
let selectedTargetId = null;
let selectedSubcategoryId = null;
let currentClient = { id: null, code: 'GUEST', name: 'Client Passage', discount_percent: 0 };
let cartItems = [];

// Auxiliary state for options modal
let pendingOptionItem = null;
let pendingOptionPrice = 0;
let currentOptions = {
  colors: [],
  defects: [],
  stains: [],
  notes: '',
  length: 2.0,
  width: 1.5,
  area: 3.0,
  weight: 5.0,
};

// Auxiliary state for checkout modal
let currentPaymentMode = 'cash'; // 'cash' | 'card' | 'credit'

// ------------------------------------------------------------------------------
// INITIALIZATION
// ------------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
  initClock();

  // Load config from Desktop main process
  if (window.posDesktop && window.posDesktop.getConfig) {
    try {
      const cfg = await window.posDesktop.getConfig();
      appConfig = { ...appConfig, ...cfg };
      document.getElementById('terminal-code-display').textContent = appConfig.terminalCode;
      document.getElementById('cfg-server-url').value = appConfig.serverUrl;
      document.getElementById('cfg-terminal-code').value = appConfig.terminalCode;
    } catch (e) {
      console.warn('Config load error:', e);
    }
  }

  // Load cached catalog from local storage for instant offline boot
  loadLocalCatalogCache();

  // Initial watchdog check
  await checkNetworkStatus();

  // If online, refresh bootstrap from cloud
  if (isOnline) {
    await fetchBootstrapFromCloud();
  } else {
    renderUI();
  }

  // Start background watchdog (every 8 seconds)
  setInterval(checkNetworkStatus, 8000);

  // Update offline queue counter badge
  updateOfflineQueueBadge();

  // Set default delivery date (J+2)
  const deliveryDateInput = document.getElementById('chk-delivery-date');
  if (deliveryDateInput) {
    const d = new Date();
    d.setDate(d.getDate() + 2);
    deliveryDateInput.value = d.toISOString().split('T')[0];
  }
});

// ------------------------------------------------------------------------------
// CLOCK
// ------------------------------------------------------------------------------
function initClock() {
  const clockEl = document.getElementById('header-clock');
  const update = () => {
    const now = new Date();
    clockEl.textContent = now.toLocaleTimeString('fr-FR');
  };
  update();
  setInterval(update, 1000);
}

// ------------------------------------------------------------------------------
// NETWORK WATCHDOG & DUAL-MODE ENGINE
// ------------------------------------------------------------------------------
async function checkNetworkStatus() {
  const watchdogPill = document.getElementById('watchdog-pill');
  const watchdogLabel = document.getElementById('watchdog-label');

  let online = false;

  if (window.posDesktop && window.posDesktop.pingCloud) {
    const pingResult = await window.posDesktop.pingCloud(appConfig.serverUrl);
    online = pingResult && pingResult.online === true;
  } else {
    try {
      const res = await fetch(`${appConfig.serverUrl.replace(/\/$/, '')}/api/pos/ping`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      });
      online = res.ok;
    } catch {
      online = false;
    }
  }

  const wasOffline = !isOnline;
  isOnline = online;

  if (isSyncing) {
    watchdogPill.className = 'watchdog-pill syncing';
    watchdogLabel.textContent = 'SYNCHRONISATION...';
  } else if (online) {
    watchdogPill.className = 'watchdog-pill online';
    watchdogLabel.textContent = 'EN LIGNE (CLOUD)';

    if (wasOffline) {
      console.log('Reconnexion détectée ! Déclenchement de la synchronisation automatique...');
      syncPendingOfflineOrders();
    }
  } else {
    watchdogPill.className = 'watchdog-pill offline';
    watchdogLabel.textContent = 'MODE SECOURS (HORS-LIGNE)';
  }
}

// ------------------------------------------------------------------------------
// BOOTSTRAP & CACHE MANAGEMENT
// ------------------------------------------------------------------------------
function loadLocalCatalogCache() {
  try {
    const cached = localStorage.getItem('pos_catalog_cache');
    if (cached) {
      const parsed = JSON.parse(cached);
      catalogData = { ...catalogData, ...parsed };
    }
  } catch (e) {
    console.error('Local cache error:', e);
  }
}

async function fetchBootstrapFromCloud() {
  try {
    const res = await fetch(`${appConfig.serverUrl.replace(/\/$/, '')}/api/pos/bootstrap`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });

    if (res.ok) {
      const data = await res.json();
      if (data.success) {
        catalogData = {
          targets: data.targets || [],
          subcategories: data.subcategories || [],
          services: data.services || [],
          items: data.items || [],
          clients: data.clients || [],
          rubrics: data.rubrics || catalogData.rubrics,
          store_info: data.store_info || catalogData.store_info,
        };

        localStorage.setItem('pos_catalog_cache', JSON.stringify(catalogData));
        renderUI();
      }
    }
  } catch (err) {
    console.warn('Bootstrap fetch failed, using local cache:', err);
    renderUI();
  }
}

async function refreshBootstrapCache() {
  if (!isOnline) {
    alert('Impossible de rafraîchir le catalogue : la caisse est actuellement hors-ligne.');
    return;
  }
  await fetchBootstrapFromCloud();
  alert('Catalogue Cloud synchronisé avec succès !');
}

// ------------------------------------------------------------------------------
// UI RENDERING (3 COMPACT LEVELS)
// ------------------------------------------------------------------------------
function renderUI() {
  if (!selectedServiceId && catalogData.services.length > 0) {
    selectedServiceId = catalogData.services[0].id;
  }
  if (!selectedTargetId && catalogData.targets.length > 0) {
    selectedTargetId = catalogData.targets[0].id;
  }

  renderServices();
  renderTargetsAndSubcategories();
  renderArticles();
  renderCart();
}

// LEVEL 1: SERVICES
function renderServices() {
  const container = document.getElementById('services-bar');
  container.innerHTML = '';

  catalogData.services.forEach((s) => {
    const btn = document.createElement('button');
    btn.className = `service-btn ${selectedServiceId === s.id ? 'active' : ''}`;
    btn.textContent = s.name;
    btn.onclick = () => {
      selectedServiceId = s.id;
      renderServices();
      renderTargetsAndSubcategories();
      renderArticles();
    };
    container.appendChild(btn);
  });
}

// LEVEL 2: TARGETS & SUBCATEGORIES
function renderTargetsAndSubcategories() {
  const targetsGroup = document.getElementById('targets-group');
  const subcatsGroup = document.getElementById('subcats-group');
  const subcatDivider = document.getElementById('subcat-divider');

  targetsGroup.innerHTML = '';
  subcatsGroup.innerHTML = '';

  const currentService = catalogData.services.find((s) => s.id === selectedServiceId);
  const hideTargets = currentService && (currentService.code === 'blanchisserie' || currentService.code === 'au_kilo');

  if (hideTargets) {
    document.getElementById('targets-bar').style.display = 'none';
    return;
  } else {
    document.getElementById('targets-bar').style.display = 'flex';
  }

  catalogData.targets.forEach((t) => {
    const btn = document.createElement('button');
    btn.className = `target-btn ${selectedTargetId === t.id ? 'active' : ''}`;
    btn.textContent = t.name;
    btn.onclick = () => {
      selectedTargetId = t.id;
      selectedSubcategoryId = null;
      renderTargetsAndSubcategories();
      renderArticles();
    };
    targetsGroup.appendChild(btn);
  });

  const availableSubcats = catalogData.subcategories.filter((sub) => sub.garment_target_id === selectedTargetId);

  if (availableSubcats.length > 0) {
    subcatDivider.style.display = 'block';

    const allBtn = document.createElement('button');
    allBtn.className = `subcat-btn ${selectedSubcategoryId === null ? 'active' : ''}`;
    allBtn.textContent = 'Tous';
    allBtn.onclick = () => {
      selectedSubcategoryId = null;
      renderTargetsAndSubcategories();
      renderArticles();
    };
    subcatsGroup.appendChild(allBtn);

    availableSubcats.forEach((sub) => {
      const btn = document.createElement('button');
      btn.className = `subcat-btn ${selectedSubcategoryId === sub.id ? 'active' : ''}`;
      btn.textContent = sub.name;
      btn.onclick = () => {
        selectedSubcategoryId = sub.id;
        renderTargetsAndSubcategories();
        renderArticles();
      };
      subcatsGroup.appendChild(btn);
    });
  } else {
    subcatDivider.style.display = 'none';
  }
}

// ARTICLES GRID
function renderArticles() {
  const grid = document.getElementById('articles-grid');
  grid.innerHTML = '';

  const filteredItems = catalogData.items.filter((item) => {
    if (selectedTargetId && item.garment_target_id !== selectedTargetId) {
      return false;
    }
    if (selectedSubcategoryId !== null && item.garment_subcategory_id !== selectedSubcategoryId) {
      return false;
    }
    return true;
  });

  if (filteredItems.length === 0) {
    grid.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; color: var(--text-dim); padding: 40px;">Aucun article dans cette catégorie</div>`;
    return;
  }

  filteredItems.forEach((item) => {
    const card = document.createElement('div');
    card.className = 'article-card';

    let price = 0;
    if (item.prices && item.prices[selectedServiceId]) {
      price = item.prices[selectedServiceId];
    } else {
      const srv = catalogData.services.find((s) => s.id === selectedServiceId);
      price = srv ? parseFloat(srv.price || 0) : 0;
    }

    if (appConfig.pricingMode === 'wholesale') {
      price = Math.round(price * 0.85);
    }

    card.innerHTML = `
      <div class="article-title">${item.name}</div>
      <div class="article-price">${price} DA</div>
    `;

    // Click opens options modal (colors, defects, stains, carpet/kilo specs)
    card.onclick = () => openOptionsModal(item, price);
    grid.appendChild(card);
  });
}

// ------------------------------------------------------------------------------
// OPTIONS MODAL (COLORS, DEFECTS, STAINS, CARPET & KILO)
// ------------------------------------------------------------------------------
function openOptionsModal(item, price) {
  pendingOptionItem = item;
  pendingOptionPrice = price;

  const currentService = catalogData.services.find((s) => s.id === selectedServiceId);
  const serviceName = currentService ? currentService.name : 'Pressing';

  document.getElementById('opt-modal-title').textContent = item.name;
  document.getElementById('opt-modal-subtitle').textContent = `${serviceName} • Tarif de base : ${price} DA`;
  document.getElementById('opt-notes-input').value = '';

  // Reset options
  currentOptions = {
    colors: [],
    defects: [],
    stains: [],
    notes: '',
    length: 2.0,
    width: 1.5,
    area: 3.0,
    weight: item.standard_weight ? parseFloat(item.standard_weight) : 5.0,
  };

  // Special Carpet handling
  const isCarpet = (item.is_carpet) || (item.unit_type === 'm2') || (item.name && item.name.toLowerCase().includes('tapis'));
  const carpetSection = document.getElementById('opt-carpet-section');
  if (isCarpet) {
    carpetSection.style.display = 'block';
    calculateCarpetArea();
  } else {
    carpetSection.style.display = 'none';
  }

  // Special Kilo handling
  const isKilo = (currentService && (currentService.code === 'au_kilo' || currentService.name.toLowerCase().includes('kilo')));
  const kiloSection = document.getElementById('opt-kilo-section');
  if (isKilo) {
    kiloSection.style.display = 'block';
    document.getElementById('opt-kilo-weight').value = currentOptions.weight;
  } else {
    kiloSection.style.display = 'none';
  }

  // Render Colors Palette
  renderOptionsBadges('opt-colors-grid', catalogData.rubrics.colors || [], 'colors', true);
  // Render Defects
  renderOptionsBadges('opt-defects-grid', catalogData.rubrics.defects || [], 'defects', false);
  // Render Stains
  renderOptionsBadges('opt-stains-grid', catalogData.rubrics.stains || [], 'stains', false);

  document.getElementById('options-modal').classList.add('open');
}

function renderOptionsBadges(containerId, list, type, isColor) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';

  list.forEach((val) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-secondary';
    btn.style.padding = '4px 10px';
    btn.style.fontSize = '12px';
    btn.style.borderRadius = '6px';
    btn.style.cursor = 'pointer';

    if (isColor && COLOR_MAP[val.toLowerCase()]) {
      const c = COLOR_MAP[val.toLowerCase()];
      btn.style.backgroundColor = c.bg;
      btn.style.color = c.text;
      btn.style.border = `1px solid ${c.border}`;
      btn.style.fontWeight = 'bold';
    }

    btn.textContent = val;

    btn.onclick = () => {
      const idx = currentOptions[type].indexOf(val);
      if (idx > -1) {
        currentOptions[type].splice(idx, 1);
        btn.style.transform = 'scale(1)';
        btn.style.outline = 'none';
      } else {
        currentOptions[type].push(val);
        btn.style.transform = 'scale(1.05)';
        btn.style.outline = '2px solid #6366f1';
      }
    };

    container.appendChild(btn);
  });
}

function calculateCarpetArea() {
  const l = parseFloat(document.getElementById('opt-carpet-length').value) || 0;
  const w = parseFloat(document.getElementById('opt-carpet-width').value) || 0;
  const area = parseFloat((l * w).toFixed(2));
  currentOptions.length = l;
  currentOptions.width = w;
  currentOptions.area = area;
  document.getElementById('opt-carpet-area').textContent = `${area} m²`;
}

function calculateKiloPrice() {
  const wt = parseFloat(document.getElementById('opt-kilo-weight').value) || 0;
  currentOptions.weight = wt;
}

function closeOptionsModal() {
  document.getElementById('options-modal').classList.remove('open');
}

function confirmOptionsAndAddToCart() {
  if (!pendingOptionItem) return;

  const currentService = catalogData.services.find((s) => s.id === selectedServiceId);
  const serviceName = currentService ? currentService.name : 'Pressing';
  currentOptions.notes = document.getElementById('opt-notes-input').value.trim();

  const isCarpet = (pendingOptionItem.is_carpet) || (pendingOptionItem.unit_type === 'm2') || (pendingOptionItem.name && pendingOptionItem.name.toLowerCase().includes('tapis'));
  const isKilo = (currentService && (currentService.code === 'au_kilo' || currentService.name.toLowerCase().includes('kilo')));

  let finalUnitPrice = pendingOptionPrice;
  let finalQty = 1;
  let totalPrice = pendingOptionPrice;

  if (isCarpet) {
    calculateCarpetArea();
    finalUnitPrice = pendingOptionPrice;
    totalPrice = Math.round(pendingOptionPrice * currentOptions.area);
  } else if (isKilo) {
    calculateKiloPrice();
    finalQty = currentOptions.weight;
    totalPrice = Math.round(pendingOptionPrice * currentOptions.weight);
  }

  cartItems.push({
    garment_item_id: pendingOptionItem.id,
    service_id: selectedServiceId,
    name: pendingOptionItem.name,
    service_name: serviceName,
    quantity: finalQty,
    unit_price: finalUnitPrice,
    total_price: totalPrice,
    is_carpet: isCarpet,
    length: isCarpet ? currentOptions.length : null,
    width: isCarpet ? currentOptions.width : null,
    area: isCarpet ? currentOptions.area : null,
    weight: isKilo ? currentOptions.weight : null,
    colors: [...currentOptions.colors],
    defects: [...currentOptions.defects],
    stains: [...currentOptions.stains],
    notes: currentOptions.notes || null,
  });

  closeOptionsModal();
  renderCart();
}

// ------------------------------------------------------------------------------
// CART OPERATIONS
// ------------------------------------------------------------------------------
function updateCartItemQty(index, delta) {
  if (!cartItems[index]) return;
  cartItems[index].quantity += delta;
  if (cartItems[index].quantity <= 0) {
    cartItems.splice(index, 1);
  } else {
    cartItems[index].total_price = cartItems[index].quantity * cartItems[index].unit_price;
  }
  renderCart();
}

function clearCart() {
  cartItems = [];
  renderCart();
}

function renderCart() {
  const list = document.getElementById('cart-items-list');
  const countEl = document.getElementById('cart-count');
  list.innerHTML = '';

  const totalPieces = cartItems.reduce((acc, ci) => acc + (ci.is_carpet ? 1 : ci.quantity), 0);
  countEl.textContent = `${totalPieces} article${totalPieces > 1 ? 's' : ''}`;

  if (cartItems.length === 0) {
    list.innerHTML = `<div class="cart-empty-message">Le panier est vide.<br>Sélectionnez un article à gauche.</div>`;
    updateSummary(0);
    return;
  }

  let subtotal = 0;

  cartItems.forEach((ci, index) => {
    subtotal += ci.total_price;
    const div = document.createElement('div');
    div.className = 'cart-item';

    // Tags badges string
    let tagsHtml = '';
    if (ci.colors && ci.colors.length > 0) {
      tagsHtml += `<span class="discount-badge" style="background: rgba(99, 102, 241, 0.2); color: #a5b4fc;">🎨 ${ci.colors.join(', ')}</span>`;
    }
    if (ci.defects && ci.defects.length > 0) {
      tagsHtml += `<span class="discount-badge" style="background: rgba(239, 68, 68, 0.2); color: #f87171;">⚠️ ${ci.defects.join(', ')}</span>`;
    }
    if (ci.stains && ci.stains.length > 0) {
      tagsHtml += `<span class="discount-badge" style="background: rgba(245, 158, 11, 0.2); color: #fbbf24;">⚡ ${ci.stains.join(', ')}</span>`;
    }
    if (ci.is_carpet) {
      tagsHtml += `<span class="discount-badge" style="background: rgba(16, 185, 129, 0.2); color: #34d399;">📐 ${ci.length}m &times; ${ci.width}m (${ci.area}m²)</span>`;
    }
    if (ci.weight) {
      tagsHtml += `<span class="discount-badge" style="background: rgba(59, 130, 246, 0.2); color: #60a5fa;">⚖️ ${ci.weight} Kg</span>`;
    }

    div.innerHTML = `
      <div class="cart-item-header">
        <span class="cart-item-name">${ci.name}</span>
        <span class="cart-item-service">${ci.service_name}</span>
      </div>
      <div style="display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px;">
        ${tagsHtml}
      </div>
      <div class="cart-item-controls">
        <div class="qty-controls">
          <button class="qty-btn" onclick="updateCartItemQty(${index}, -1)">-</button>
          <span class="qty-val">${ci.quantity}</span>
          <button class="qty-btn" onclick="updateCartItemQty(${index}, 1)">+</button>
        </div>
        <div class="cart-item-price">${ci.total_price} DA</div>
      </div>
    `;
    list.appendChild(div);
  });

  updateSummary(subtotal);
}

function updateSummary(subtotal) {
  const discountPercent = currentClient.discount_percent || 0;
  const discountAmount = Math.round((subtotal * discountPercent) / 100);
  const total = Math.max(0, subtotal - discountAmount);

  document.getElementById('summary-subtotal').textContent = `${subtotal} DA`;
  document.getElementById('summary-discount').textContent = `${discountAmount} DA (${discountPercent}%)`;
  document.getElementById('summary-total').textContent = `${total} DA`;
}

function setPricingMode(mode) {
  appConfig.pricingMode = mode;
  document.getElementById('btn-mode-detail').className = `switch-btn ${mode === 'detail' ? 'active' : ''}`;
  document.getElementById('btn-mode-wholesale').className = `switch-btn ${mode === 'wholesale' ? 'active' : ''}`;
  renderArticles();
}

// ------------------------------------------------------------------------------
// CHECKOUT & PAYMENT MODAL
// ------------------------------------------------------------------------------
function checkoutOrder() {
  if (cartItems.length === 0) {
    alert('Le panier est vide !');
    return;
  }

  const subtotal = cartItems.reduce((acc, ci) => acc + ci.total_price, 0);
  const discountPercent = currentClient.discount_percent || 0;
  const discountAmount = Math.round((subtotal * discountPercent) / 100);
  const total = Math.max(0, subtotal - discountAmount);

  document.getElementById('chk-total-display').textContent = `${total} DA`;
  document.getElementById('chk-client-display').textContent = currentClient.name;
  document.getElementById('chk-items-count').textContent = `${cartItems.length} article(s)`;

  // Default received exact
  document.getElementById('chk-received-amount').value = total;
  calculateChange();

  document.getElementById('checkout-modal').classList.add('open');
}

function closeCheckoutModal() {
  document.getElementById('checkout-modal').classList.remove('open');
}

function calculateChange() {
  const subtotal = cartItems.reduce((acc, ci) => acc + ci.total_price, 0);
  const discountPercent = currentClient.discount_percent || 0;
  const discountAmount = Math.round((subtotal * discountPercent) / 100);
  const total = Math.max(0, subtotal - discountAmount);

  const received = parseFloat(document.getElementById('chk-received-amount').value) || 0;
  const change = Math.max(0, received - total);
  document.getElementById('chk-change-display').textContent = `${change} DA`;
}

function setReceivedExact() {
  const subtotal = cartItems.reduce((acc, ci) => acc + ci.total_price, 0);
  const discountPercent = currentClient.discount_percent || 0;
  const discountAmount = Math.round((subtotal * discountPercent) / 100);
  const total = Math.max(0, subtotal - discountAmount);
  document.getElementById('chk-received-amount').value = total;
  calculateChange();
}

function setReceivedAmount(val) {
  document.getElementById('chk-received-amount').value = val;
  calculateChange();
}

function setPayMode(mode) {
  currentPaymentMode = mode;
  document.getElementById('pay-mode-cash').classList.toggle('active', mode === 'cash');
  document.getElementById('pay-mode-card').classList.toggle('active', mode === 'card');
  document.getElementById('pay-mode-credit').classList.toggle('active', mode === 'credit');

  if (mode === 'credit') {
    document.getElementById('chk-received-amount').value = 0;
    calculateChange();
  }
}

// ------------------------------------------------------------------------------
// FINAL ORDER SUBMISSION & DUAL SYNC
// ------------------------------------------------------------------------------
async function validateAndPrintFinalOrder() {
  const subtotal = cartItems.reduce((acc, ci) => acc + ci.total_price, 0);
  const discountPercent = currentClient.discount_percent || 0;
  const discountAmount = Math.round((subtotal * discountPercent) / 100);
  const total = Math.max(0, subtotal - discountAmount);

  const received = parseFloat(document.getElementById('chk-received-amount').value) || 0;
  const isExpress = document.getElementById('chk-is-express').checked;
  const targetDeliveryDate = document.getElementById('chk-delivery-date').value;

  const paidAmount = currentPaymentMode === 'credit' ? 0 : Math.min(total, received);
  const balanceAmount = Math.max(0, total - paidAmount);

  const orderUuid = generateUUID();
  const ticketNumber = generateLocalTicketNumber();

  const orderData = {
    uuid: orderUuid,
    ticket_number: ticketNumber,
    pos_terminal_code: appConfig.terminalCode,
    client_id: currentClient.id,
    client_code: currentClient.code,
    client_name: currentClient.name,
    order_date: new Date().toISOString(),
    target_delivery_date: targetDeliveryDate,
    total_amount: total,
    paid_amount: paidAmount,
    balance_amount: balanceAmount,
    discount_percent: discountPercent,
    discount_amount: discountAmount,
    is_express: isExpress,
    status: 'pending',
    items: cartItems.map((ci) => ({
      service_id: ci.service_id,
      garment_item_id: ci.garment_item_id,
      name: ci.name,
      service_name: ci.service_name,
      quantity: ci.quantity,
      unit_price: ci.unit_price,
      total_price: ci.total_price,
      colors: ci.colors || [],
      defects: ci.defects || [],
      stains: ci.stains || [],
      notes: ci.notes || null,
      length: ci.length,
      width: ci.width,
      area: ci.area,
      weight: ci.weight,
    })),
    synced: false,
    created_at: new Date().toISOString(),
  };

  // 1. Save locally to offline queue (guarantees zero data loss)
  saveOrderToLocalQueue(orderData);

  // 2. Silent Thermal Print : Customer receipt + Garment hanger tags
  printReceipt(orderData);
  printGarmentTags(orderData);

  // 3. Trigger immediate Cloud Sync if Online
  if (isOnline) {
    syncPendingOfflineOrders();
  }

  // Close modal and reset
  closeCheckoutModal();
  clearCart();
  updateOfflineQueueBadge();
}

// UUID v4 Generator
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function generateLocalTicketNumber() {
  let counter = parseInt(localStorage.getItem('pos_ticket_counter') || '1000', 10) + 1;
  localStorage.setItem('pos_ticket_counter', counter.toString());
  const prefix = appConfig.terminalCode.replace('POS-', 'C');
  return `${prefix}-${counter}`;
}

// Queue
function getLocalOrderQueue() {
  try {
    return JSON.parse(localStorage.getItem('pos_orders_queue') || '[]');
  } catch {
    return [];
  }
}

function saveOrderToLocalQueue(order) {
  const queue = getLocalOrderQueue();
  queue.push(order);
  localStorage.setItem('pos_orders_queue', JSON.stringify(queue));
}

function updateOfflineQueueBadge() {
  const queue = getLocalOrderQueue();
  const pending = queue.filter((o) => !o.synced);
  const badge = document.getElementById('offline-queue-badge');
  const countEl = document.getElementById('offline-queue-count');

  if (pending.length > 0) {
    badge.style.display = 'block';
    countEl.textContent = `${pending.length} commande${pending.length > 1 ? 's' : ''}`;
  } else {
    badge.style.display = 'none';
  }
}

// Auto Sync Engine
async function syncPendingOfflineOrders() {
  const queue = getLocalOrderQueue();
  const pending = queue.filter((o) => !o.synced);

  if (pending.length === 0) return;

  isSyncing = true;
  checkNetworkStatus();

  try {
    const payload = {
      terminal_code: appConfig.terminalCode,
      orders: pending.map((o) => ({
        uuid: o.uuid,
        pos_terminal_code: o.pos_terminal_code,
        ticket_number: o.ticket_number,
        client_id: o.client_id,
        total_amount: o.total_amount,
        paid_amount: o.paid_amount,
        balance_amount: o.balance_amount,
        discount_percent: o.discount_percent,
        discount_amount: o.discount_amount,
        target_delivery_date: o.target_delivery_date,
        is_express: o.is_express,
        order_date: o.order_date,
        items: o.items,
      })),
    };

    const res = await fetch(`${appConfig.serverUrl.replace(/\/$/, '')}/api/pos/sync/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.success && data.results) {
        const syncedUuids = new Set(
          data.results.filter((r) => r.status === 'success' || r.status === 'already_synced').map((r) => r.uuid)
        );

        queue.forEach((o) => {
          if (syncedUuids.has(o.uuid)) {
            o.synced = true;
          }
        });

        localStorage.setItem('pos_orders_queue', JSON.stringify(queue));
      }
    }
  } catch (err) {
    console.error('Erreur synchronisation commandes:', err);
  } finally {
    isSyncing = false;
    checkNetworkStatus();
    updateOfflineQueueBadge();
  }
}

async function manualSyncTrigger() {
  await checkNetworkStatus();
  if (!isOnline) {
    alert('La caisse est hors-ligne. Impossible de synchroniser actuellement.');
    return;
  }
  await syncPendingOfflineOrders();
  await fetchBootstrapFromCloud();
  alert('Synchronisation terminée avec succès !');
}

// ------------------------------------------------------------------------------
// SILENT THERMAL PRINTING (80mm RECEIPT & TAGS)
// ------------------------------------------------------------------------------
function printReceipt(order) {
  const store = catalogData.store_info;
  const dateStr = new Date(order.order_date).toLocaleString('fr-FR');
  const deliveryStr = order.target_delivery_date ? new Date(order.target_delivery_date).toLocaleDateString('fr-FR') : 'J+2';

  const itemsHtml = order.items
    .map(
      (item) => `
    <tr>
      <td style="text-align: left; padding: 3px 0;">
        <span style="font-weight: bold;">${item.name}</span> (${item.service_name})
        ${item.colors && item.colors.length ? `<br><small style="color: #444;">Couleur: ${item.colors.join(', ')}</small>` : ''}
        ${item.defects && item.defects.length ? `<br><small style="color: #666;">Défaut: ${item.defects.join(', ')}</small>` : ''}
      </td>
      <td style="text-align: center; vertical-align: top; padding: 3px 0;">${item.quantity}</td>
      <td style="text-align: right; vertical-align: top; padding: 3px 0; font-weight: bold;">${item.total_price} DA</td>
    </tr>
  `
    )
    .join('');

  const receiptHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        @page { margin: 0; size: 80mm auto; }
        body {
          font-family: 'Courier New', monospace;
          width: 72mm;
          margin: 0 auto;
          padding: 8px 0;
          color: #000;
          font-size: 12px;
          line-height: 1.3;
        }
        .text-center { text-align: center; }
        .text-right { text-align: right; }
        .bold { font-weight: bold; }
        .divider { border-top: 1px dashed #000; margin: 6px 0; }
        .ticket-number-box {
          border: 2px solid #000;
          padding: 6px;
          margin: 6px 0;
          text-align: center;
          font-size: 22px;
          font-weight: 900;
          letter-spacing: 2px;
        }
        table { width: 100%; border-collapse: collapse; margin: 6px 0; }
      </style>
    </head>
    <body>
      <div class="text-center bold" style="font-size: 16px;">${store.brand}</div>
      <div class="text-center">${store.name}</div>
      <div class="text-center" style="font-size: 10px;">${store.slogan}</div>
      <div class="text-center" style="font-size: 10px;">Tél: ${store.phone}</div>

      <div class="divider"></div>

      <div class="ticket-number-box">
        TICKET #${order.ticket_number}
      </div>

      <div>Date dépôt: ${dateStr}</div>
      <div>Retrait prévu: <span class="bold">${deliveryStr}</span> ${order.is_express ? '⚡ [EXPRESS]' : ''}</div>
      <div>Client: <span class="bold">${order.client_name}</span></div>
      <div>Terminal: ${order.pos_terminal_code}</div>

      <div class="divider"></div>

      <table>
        <thead>
          <tr style="border-bottom: 1px solid #000;">
            <th style="text-align: left;">Article</th>
            <th>Qté</th>
            <th style="text-align: right;">Total</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>

      <div class="divider"></div>

      <div class="text-right">Total : ${order.total_amount} DA</div>
      <div class="text-right">Montant Réglé : ${order.paid_amount} DA</div>
      ${order.balance_amount > 0 ? `<div class="text-right bold" style="color: #000; font-size: 14px;">RESTE À PAYER : ${order.balance_amount} DA</div>` : `<div class="text-right bold">SOLDE : ENTIÈREMENT RÉGLÉ</div>`}

      <div class="divider"></div>
      <div class="text-center" style="font-size: 10px; margin-top: 6px;">
        Merci pour votre confiance !<br>
        À bientôt chez ${store.brand}.
      </div>
    </body>
    </html>
  `;

  if (window.posDesktop && window.posDesktop.silentPrint) {
    window.posDesktop.silentPrint(receiptHtml, appConfig.defaultPrinter);
  }
}

// Thermal Hanger Tag Printing (Giant ticket number for each garment)
function printGarmentTags(order) {
  let tagIndex = 1;
  const totalPieces = order.items.reduce((sum, it) => sum + (it.is_carpet ? 1 : it.quantity), 0);

  order.items.forEach((item) => {
    const qty = item.is_carpet ? 1 : item.quantity;
    for (let q = 0; q < qty; q++) {
      const tagHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            @page { margin: 0; size: 80mm auto; }
            body {
              font-family: Arial, sans-serif;
              width: 72mm;
              margin: 0 auto;
              padding: 8px 0;
              text-align: center;
              border-bottom: 2px dashed #000;
            }
            .giant-number {
              font-size: 42px;
              font-weight: 900;
              letter-spacing: 3px;
              margin: 4px 0;
            }
            .item-line { font-size: 14px; font-weight: bold; }
            .details { font-size: 11px; margin-top: 2px; }
          </style>
        </head>
        <body>
          <div style="font-size: 12px; font-weight: bold;">PARADOU - ÉTIQUETTE CINTRE (${tagIndex}/${totalPieces})</div>
          <div class="giant-number">${order.ticket_number}</div>
          <div class="item-line">${item.name} - ${item.service_name}</div>
          <div class="details">Client: ${order.client_name}</div>
          ${item.colors && item.colors.length ? `<div class="details">Couleur: ${item.colors.join(', ')}</div>` : ''}
          ${item.defects && item.defects.length ? `<div class="details">Défaut: ${item.defects.join(', ')}</div>` : ''}
        </body>
        </html>
      `;

      if (window.posDesktop && window.posDesktop.silentPrint) {
        window.posDesktop.silentPrint(tagHtml, appConfig.defaultPrinter);
      }
      tagIndex++;
    }
  });
}

// ------------------------------------------------------------------------------
// NEW CLIENT & SELECTION
// ------------------------------------------------------------------------------
function openClientModal() {
  document.getElementById('client-modal').classList.add('open');
  filterClientsList();
}

function closeClientModal() {
  document.getElementById('client-modal').classList.remove('open');
}

function openNewClientModal() {
  document.getElementById('new-client-name').value = '';
  document.getElementById('new-client-phone').value = '';
  document.getElementById('new-client-discount').value = '0';
  document.getElementById('new-client-address').value = '';
  document.getElementById('new-client-modal').classList.add('open');
}

function closeNewClientModal() {
  document.getElementById('new-client-modal').classList.remove('open');
}

async function saveNewClient() {
  const name = document.getElementById('new-client-name').value.trim();
  const phone = document.getElementById('new-client-phone').value.trim();
  const discount = parseInt(document.getElementById('new-client-discount').value, 10) || 0;
  const address = document.getElementById('new-client-address').value.trim();

  if (!name) {
    alert('Veuillez renseigner le nom du client.');
    return;
  }

  const localId = `LOCAL-${Date.now()}`;
  const newClient = {
    id: localId,
    code: `CLI-${Math.floor(1000 + Math.random() * 9000)}`,
    name: name,
    phone: phone,
    discount_percent: discount,
    address: address,
    credit: 0,
  };

  catalogData.clients.unshift(newClient);
  localStorage.setItem('pos_catalog_cache', JSON.stringify(catalogData));

  // Select as active client
  currentClient = newClient;
  document.getElementById('current-client-name').textContent = newClient.name;
  document.getElementById('current-client-discount').textContent = `Remise ${newClient.discount_percent}%`;

  closeNewClientModal();
  closeClientModal();
  renderCart();

  // If online, immediately sync client to Cloud API
  if (isOnline) {
    try {
      await fetch(`${appConfig.serverUrl.replace(/\/$/, '')}/api/pos/sync/clients`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ clients: [newClient] }),
      });
    } catch (e) {
      console.warn('Sync new client deferred:', e);
    }
  }
}

function filterClientsList() {
  const query = document.getElementById('client-search-input').value.toLowerCase().trim();
  const listEl = document.getElementById('clients-modal-list');
  listEl.innerHTML = '';

  const clients = (catalogData.clients || []).filter(
    (c) => c.name.toLowerCase().includes(query) || (c.phone && c.phone.includes(query))
  );

  clients.slice(0, 30).forEach((c) => {
    const item = document.createElement('button');
    item.className = 'client-btn';
    item.style.width = '100%';
    item.style.justifyContent = 'space-between';
    item.innerHTML = `
      <span>${c.name} ${c.phone ? `(${c.phone})` : ''}</span>
      <span class="discount-badge">Remise ${c.discount_percent || 0}%</span>
    `;
    item.onclick = () => {
      currentClient = c;
      document.getElementById('current-client-name').textContent = c.name;
      document.getElementById('current-client-discount').textContent = `Remise ${c.discount_percent || 0}%`;
      closeClientModal();
      renderCart();
    };
    listEl.appendChild(item);
  });
}

function selectGuestClient() {
  currentClient = { id: null, code: 'GUEST', name: 'Client Passage', discount_percent: 0 };
  document.getElementById('current-client-name').textContent = 'Client Passage';
  document.getElementById('current-client-discount').textContent = 'Remise 0%';
  closeClientModal();
  renderCart();
}

// ------------------------------------------------------------------------------
// SETTINGS MODAL
// ------------------------------------------------------------------------------
async function openSettingsModal() {
  document.getElementById('settings-modal').classList.add('open');

  if (window.posDesktop && window.posDesktop.getPrinters) {
    const printers = await window.posDesktop.getPrinters();
    const select = document.getElementById('cfg-printer-select');
    select.innerHTML = '<option value="">Sélectionner une imprimante thermique...</option>';

    printers.forEach((p) => {
      const opt = document.createElement('option');
      opt.value = p.name;
      opt.textContent = `${p.displayName} ${p.isDefault ? '(Par défaut)' : ''}`;
      if (p.name === appConfig.defaultPrinter) {
        opt.selected = true;
      }
      select.appendChild(opt);
    });
  }
}

function closeSettingsModal() {
  document.getElementById('settings-modal').classList.remove('open');
}

async function saveSettings() {
  appConfig.serverUrl = document.getElementById('cfg-server-url').value.trim();
  appConfig.terminalCode = document.getElementById('cfg-terminal-code').value.trim();
  appConfig.defaultPrinter = document.getElementById('cfg-printer-select').value;

  document.getElementById('terminal-code-display').textContent = appConfig.terminalCode;

  if (window.posDesktop && window.posDesktop.saveConfig) {
    await window.posDesktop.saveConfig(appConfig);
  }

  closeSettingsModal();
  checkNetworkStatus();
}

function toggleFullscreen() {
  if (window.posDesktop && window.posDesktop.toggleFullscreen) {
    window.posDesktop.toggleFullscreen();
  }
}
