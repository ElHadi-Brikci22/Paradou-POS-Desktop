/**
 * ==============================================================================
 * PARADOU POS DESKTOP - CORE CLIENT APPLICATION (DUAL ONLINE/OFFLINE ENGINE)
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
  store_info: {
    name: 'MSK DRY PLUS',
    brand: 'PARADOU',
    slogan: 'Pressing - Blanchisserie - Tapis',
    phone: '0550 00 00 00',
    currency: 'DA',
  },
};

let isOnline = false;
let isSyncing = false;
let selectedServiceId = null;
let selectedTargetId = null;
let selectedSubcategoryId = null;
let currentClient = { id: null, code: 'GUEST', name: 'Client Passage', discount_percent: 0 };
let cartItems = [];

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

  // Load cached catalog from local storage first for instant launch
  loadLocalCatalogCache();

  // Initial watchdog check
  await checkNetworkStatus();

  // If online, refresh bootstrap from central server
  if (isOnline) {
    await fetchBootstrapFromCloud();
  } else {
    renderUI();
  }

  // Start background watchdog (every 8 seconds)
  setInterval(checkNetworkStatus, 8000);

  // Update offline queue counter badge
  updateOfflineQueueBadge();
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
    // Fallback browser fetch ping
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

    // Trigger auto-sync if we just transitioned from offline to online!
    if (wasOffline) {
      console.log('Reconnexion détectée ! Lancement de la synchronisation automatique...');
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
          store_info: data.store_info || catalogData.store_info,
        };

        // Persist to local cache for offline reliability
        localStorage.setItem('pos_catalog_cache', JSON.stringify(catalogData));
        renderUI();
      }
    }
  } catch (err) {
    console.warn('Bootstrap fetch failed, relying on local cache:', err);
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

// LEVEL 2: TARGETS & SUBCATEGORIES (Merged 1 Line)
function renderTargetsAndSubcategories() {
  const targetsGroup = document.getElementById('targets-group');
  const subcatsGroup = document.getElementById('subcats-group');
  const subcatDivider = document.getElementById('subcat-divider');

  targetsGroup.innerHTML = '';
  subcatsGroup.innerHTML = '';

  // Current selected service check (e.g. Blanchisserie or Au Kilo)
  const currentService = catalogData.services.find((s) => s.id === selectedServiceId);
  const hideTargets = currentService && (currentService.code === 'blanchisserie' || currentService.code === 'au_kilo');

  if (hideTargets) {
    document.getElementById('targets-bar').style.display = 'none';
    return;
  } else {
    document.getElementById('targets-bar').style.display = 'flex';
  }

  // Render Target buttons
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

  // Render Subcategories for selectedTargetId
  const availableSubcats = catalogData.subcategories.filter((sub) => sub.garment_target_id === selectedTargetId);

  if (availableSubcats.length > 0) {
    subcatDivider.style.display = 'block';

    // "Tous" button
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
    // Target filter
    if (selectedTargetId && item.garment_target_id !== selectedTargetId) {
      return false;
    }
    // Subcategory filter
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

    // Calculate price for selected service
    let price = 0;
    if (item.prices && item.prices[selectedServiceId]) {
      price = item.prices[selectedServiceId];
    } else {
      // Fallback service price
      const srv = catalogData.services.find((s) => s.id === selectedServiceId);
      price = srv ? parseFloat(srv.price || 0) : 0;
    }

    if (appConfig.pricingMode === 'wholesale') {
      price = Math.round(price * 0.85); // 15% discount for wholesale
    }

    card.innerHTML = `
      <div class="article-title">${item.name}</div>
      <div class="article-price">${price} DA</div>
    `;

    card.onclick = () => addItemToCart(item, price);
    grid.appendChild(card);
  });
}

// ------------------------------------------------------------------------------
// CART OPERATIONS
// ------------------------------------------------------------------------------
function addItemToCart(item, unitPrice) {
  const service = catalogData.services.find((s) => s.id === selectedServiceId);
  const serviceName = service ? service.name : 'Pressing';

  // Check if item already exists in cart with same service
  const existing = cartItems.find((ci) => ci.garment_item_id === item.id && ci.service_id === selectedServiceId);

  if (existing) {
    existing.quantity += 1;
    existing.total_price = existing.quantity * existing.unit_price;
  } else {
    cartItems.push({
      garment_item_id: item.id,
      service_id: selectedServiceId,
      name: item.name,
      service_name: serviceName,
      quantity: 1,
      unit_price: unitPrice,
      total_price: unitPrice,
    });
  }

  renderCart();
}

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

  const totalPieces = cartItems.reduce((acc, ci) => acc + ci.quantity, 0);
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
    div.innerHTML = `
      <div class="cart-item-header">
        <span class="cart-item-name">${ci.name}</span>
        <span class="cart-item-service">${ci.service_name}</span>
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
// CHECKOUT, OFFLINE QUEUEING & SILENT PRINTING
// ------------------------------------------------------------------------------
async function checkoutOrder() {
  if (cartItems.length === 0) {
    alert('Le panier est vide !');
    return;
  }

  const subtotal = cartItems.reduce((acc, ci) => acc + ci.total_price, 0);
  const discountPercent = currentClient.discount_percent || 0;
  const discountAmount = Math.round((subtotal * discountPercent) / 100);
  const total = subtotal - discountAmount;

  // Generate unique UUID and sequential ticket number
  const orderUuid = generateUUID();
  const ticketNumber = generateLocalTicketNumber();

  const orderData = {
    uuid: orderUuid,
    ticket_number: ticketNumber,
    pos_terminal_code: appConfig.terminalCode,
    client_id: currentClient.id,
    client_name: currentClient.name,
    order_date: new Date().toISOString(),
    total_amount: total,
    paid_amount: total, // Default cash paid in full
    balance_amount: 0,
    discount_percent: discountPercent,
    discount_amount: discountAmount,
    items: cartItems.map((ci) => ({
      service_id: ci.service_id,
      garment_item_id: ci.garment_item_id,
      name: ci.name,
      service_name: ci.service_name,
      quantity: ci.quantity,
      unit_price: ci.unit_price,
      total_price: ci.total_price,
    })),
    synced: false,
    created_at: new Date().toISOString(),
  };

  // 1. Save locally to offline queue first (bulletproof data persistence)
  saveOrderToLocalQueue(orderData);

  // 2. Trigger Silent Thermal Receipt Printing (80mm)
  printReceipt(orderData);

  // 3. If Online, attempt immediate sync to Cloud
  if (isOnline) {
    syncPendingOfflineOrders();
  }

  // Clear cart and prepare for next customer
  clearCart();
  updateOfflineQueueBadge();
}

// Generate UUID v4
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Generate sequential ticket number with terminal prefix
function generateLocalTicketNumber() {
  let counter = parseInt(localStorage.getItem('pos_ticket_counter') || '1000', 10) + 1;
  localStorage.setItem('pos_ticket_counter', counter.toString());
  const prefix = appConfig.terminalCode.replace('POS-', 'C');
  return `${prefix}-${counter}`;
}

// Offline Queue Management
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

// Synchronize all pending orders with Cloud API
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
        // Mark synced orders
        const syncedUuids = new Set(
          data.results.filter((r) => r.status === 'success' || r.status === 'already_synced').map((r) => r.uuid)
        );

        queue.forEach((o) => {
          if (syncedUuids.has(o.uuid)) {
            o.synced = true;
          }
        });

        localStorage.setItem('pos_orders_queue', JSON.stringify(queue));
        console.log(`${syncedUuids.size} commande(s) synchronisée(s) avec le Cloud.`);
      }
    }
  } catch (err) {
    console.error('Erreur lors de la synchronisation:', err);
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
// SILENT THERMAL TICKET PRINTING (80mm ESC/POS)
// ------------------------------------------------------------------------------
function printReceipt(order) {
  const store = catalogData.store_info;
  const dateStr = new Date(order.order_date).toLocaleString('fr-FR');

  const itemsHtml = order.items
    .map(
      (item) => `
    <tr>
      <td style="text-align: left; padding: 2px 0;">${item.name} (${item.service_name})</td>
      <td style="text-align: center;">${item.quantity}</td>
      <td style="text-align: right;">${item.total_price} DA</td>
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
          font-size: 20px;
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

      <div>Date: ${dateStr}</div>
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

      <div class="text-right bold" style="font-size: 14px;">
        TOTAL RÉGLÉ : ${order.total_amount} DA
      </div>

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
  } else {
    // In browser preview: open in popup or console
    console.log('Ticket généré (Silent Print prêt) :', order.ticket_number);
  }
}

// ------------------------------------------------------------------------------
// SETTINGS & CLIENT MODALS
// ------------------------------------------------------------------------------
async function openSettingsModal() {
  document.getElementById('settings-modal').classList.add('open');

  // Load printer list if running in Electron Desktop
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

function openClientModal() {
  document.getElementById('client-modal').classList.add('open');
  filterClientsList();
}

function closeClientModal() {
  document.getElementById('client-modal').classList.remove('open');
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

function toggleFullscreen() {
  if (window.posDesktop && window.posDesktop.toggleFullscreen) {
    window.posDesktop.toggleFullscreen();
  }
}
