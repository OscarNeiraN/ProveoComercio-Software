const API = '';
const $ = id => document.getElementById(id);

let cart = [];
let activeCat = '';
let search = '';
let debounce = null;
let currentUser = null;
let authMode = 'login';
let productsById = new Map();

const fmt = value => '$' + Number(value || 0).toLocaleString('es-CL');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getAuthToken() {
  return localStorage.getItem('auth_token');
}

function setAuthToken(token) {
  if (token) localStorage.setItem('auth_token', token);
  else localStorage.removeItem('auth_token');
}

async function fetchJSON(path, opts = {}) {
  const token = getAuthToken();
  const headers = { ...opts.headers };
  if (opts.body) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(API + path, { ...opts, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

async function fetchDocument(orderId) {
  const token = getAuthToken();
  const res = await fetch(`${API}/api/orders/${orderId}/boleta`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  const blob = await res.blob();
  const disposition = res.headers.get('Content-Disposition') || '';
  const match = disposition.match(/filename="?([^"]+)"?/);
  const filename = match ? match[1] : `documento-${orderId}.xml`;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function showError(message) {
  $('errorMsg').textContent = message;
  $('errorBanner').hidden = false;
}

function hideError() {
  $('errorBanner').hidden = true;
}

function updateAuthUI(user) {
  currentUser = user;
  $('ordersBtn').hidden = !user;
  $('logoutBtn').hidden = !user;
  $('authBtn').textContent = user ? `Hola, ${user.first_name}` : 'Ingresar';
}

async function loadUser() {
  const token = getAuthToken();
  if (!token) {
    updateAuthUI(null);
    return;
  }

  try {
    const data = await fetchJSON('/api/me');
    updateAuthUI(data.user);
  } catch {
    setAuthToken(null);
    updateAuthUI(null);
  }
}

function openAuthModal(mode = 'login') {
  authMode = mode;
  $('authWrap').hidden = false;
  $('authTitle').textContent = mode === 'register' ? 'Crear cuenta' : 'Iniciar sesion';
  $('authEyebrow').textContent = mode === 'register' ? 'Registro' : 'Cuenta';
  $('loginPanel').hidden = mode === 'register';
  $('registerPanel').hidden = mode !== 'register';
  $('tabLogin').classList.toggle('active', mode === 'login');
  $('tabRegister').classList.toggle('active', mode === 'register');
  $('authResult').hidden = true;
}

function closeAuthModal() {
  $('authWrap').hidden = true;
}

function validatePasswordPolicy({ password, email, first_name, last_name }) {
  const failures = [];
  const value = String(password || '');
  const normalized = value.toLowerCase();
  const localPart = String(email || '').split('@')[0].toLowerCase();
  const identityTokens = [localPart, first_name, last_name]
    .map(token => String(token || '').trim().toLowerCase())
    .filter(token => token.length >= 3);

  if (value.length < 12) failures.push('minimo 12 caracteres');
  if (value.length > 128) failures.push('maximo 128 caracteres');
  if (!/[a-z]/.test(value)) failures.push('una minuscula');
  if (!/[A-Z]/.test(value)) failures.push('una mayuscula');
  if (!/[0-9]/.test(value)) failures.push('un numero');
  if (!/[^A-Za-z0-9]/.test(value)) failures.push('un simbolo');
  if (/\s/.test(value)) failures.push('sin espacios');
  if (identityTokens.some(token => normalized.includes(token))) {
    failures.push('no incluir nombre, apellido ni email');
  }
  return failures;
}

async function submitAuth() {
  const result = $('authResult');
  result.hidden = true;
  const path = authMode === 'register' ? '/api/register' : '/api/login';
  const payload = authMode === 'register'
    ? {
        email: $('regEmail').value.trim(),
        password: $('regPassword').value,
        first_name: $('regFirstName').value.trim(),
        last_name: $('regLastName').value.trim(),
      }
    : {
        email: $('loginEmail').value.trim(),
        password: $('loginPassword').value,
      };

  if (authMode === 'register') {
    const passwordFailures = validatePasswordPolicy(payload);
    if (passwordFailures.length) {
      result.hidden = false;
      result.className = 'order-result err';
      result.textContent = `Password invalido: ${passwordFailures.join(', ')}.`;
      return;
    }
  }

  try {
    const data = await fetchJSON(path, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    setAuthToken(data.token);
    updateAuthUI(data.user);
    closeAuthModal();
  } catch (err) {
    result.hidden = false;
    result.className = 'order-result err';
    result.textContent = err.message;
  }
}

function logout() {
  setAuthToken(null);
  updateAuthUI(null);
}

async function loadCategories() {
  try {
    const { categories } = await fetchJSON('/api/categories');
    const filters = $('filters');
    categories.forEach(cat => {
      const value = cat.id ?? cat;
      const btn = document.createElement('button');
      btn.className = 'filter-chip';
      btn.dataset.cat = value;
      btn.type = 'button';
      btn.textContent = cat.name ?? cat;
      filters.appendChild(btn);
    });
  } catch {
    // El catalogo mostrara su propio estado de error.
  }
}

function setCategory(cat) {
  activeCat = cat;
  document.querySelectorAll('.filter-chip').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.cat === cat);
  });
  loadProducts();
}

async function loadProducts() {
  hideError();
  $('grid').innerHTML = Array(6).fill('<div class="skeleton"></div>').join('');

  try {
    const params = new URLSearchParams();
    if (activeCat) params.set('category', activeCat);
    if (search) params.set('search', search);

    const suffix = params.toString() ? `?${params}` : '';
    const data = await fetchJSON(`/api/products${suffix}`);
    productsById = new Map(data.products.map(product => [String(product.id), product]));

    $('resultCount').textContent = String(data.total);
    $('syncTime').textContent = 'Ahora';
    renderProducts(data.products);
    reconcileCartWithStock();
  } catch (err) {
    showError('Error al cargar productos: ' + err.message);
    $('grid').innerHTML = '<div class="empty-state">No se pudieron cargar los productos.</div>';
  }
}

function stockBadge(product) {
  const stock = Number(product.stock || 0);
  if (stock <= 0) return { cls: 'out', text: 'Sin stock' };
  if (stock <= 5) return { cls: 'low', text: `Quedan ${stock}` };
  return { cls: 'ok', text: `${stock} disponibles` };
}

function renderProducts(products) {
  if (!products.length) {
    $('grid').innerHTML = '<div class="empty-state">No se encontraron productos.</div>';
    return;
  }

  $('grid').innerHTML = products.map(product => {
    const badge = stockBadge(product);
    const disabled = Number(product.stock || 0) <= 0 ? 'disabled' : '';
    const discount = Number(product.discount || 0);
    const oldPrice = product.old_price ? `<span class="old-price">${fmt(product.old_price)}</span>` : '';
    const discountBadge = discount > 0 ? `<span class="discount-badge">-${discount}%</span>` : '';
    const image = product.image_url
      ? `<img src="${esc(product.image_url)}" alt="${esc(product.name)}" loading="lazy" onerror="this.closest('.product-media').classList.add('image-fallback');this.remove();">`
      : '';

    return `
      <article class="product-card">
        <div class="product-media">
          ${discountBadge}
          ${image}
          <div class="fallback-product" aria-hidden="true">${esc((product.brand || product.category || 'P').slice(0, 2).toUpperCase())}</div>
        </div>
        <div class="product-body">
          <div class="product-meta">
            <span class="brand-name">${esc(product.brand || product.category)}</span>
            <span class="sku">${esc(product.sku)}</span>
          </div>
          <h2>${esc(product.name)}</h2>
          <p class="product-desc">${esc(product.description)}</p>
          <div class="rating-line">
            <span class="stars">★★★★★</span>
            <strong>${Number(product.rating || 0).toFixed(1)}</strong>
            <small>(${Number(product.reviews || 0)})</small>
          </div>
          <div class="product-line">
            <div>
              ${oldPrice}
              <span class="price">${fmt(product.price)}</span>
            </div>
            <span class="badge ${badge.cls}">${esc(badge.text)}</span>
          </div>
          <div class="retail-note">
            <span>Retiro o despacho</span>
            <strong>Compra protegida</strong>
          </div>
          <button class="add-btn" data-id="${esc(product.id)}" type="button" ${disabled}>
            Agregar al carrito
          </button>
        </div>
      </article>`;
  }).join('');
}

function addToCart(productId) {
  const product = productsById.get(String(productId));
  if (!product) return;

  const stock = Number(product.stock || 0);
  const existing = cart.find(item => item.id === String(product.id));
  const currentQty = existing ? existing.qty : 0;
  if (currentQty >= stock) {
    showError(`No hay mas stock disponible para ${product.name}.`);
    return;
  }

  if (existing) existing.qty += 1;
  else {
    cart.push({
      id: String(product.id),
      sku: product.sku,
      name: product.name,
      price: Number(product.price),
      stock,
      qty: 1,
    });
  }

  updateCartUI();
  openCart();
}

function reconcileCartWithStock() {
  cart = cart
    .map(item => {
      const product = productsById.get(String(item.id));
      if (!product) return item;
      return {
        ...item,
        name: product.name,
        price: Number(product.price),
        stock: Number(product.stock || 0),
        qty: Math.min(item.qty, Number(product.stock || 0)),
      };
    })
    .filter(item => item.qty > 0);
  updateCartUI();
}

function changeCartQty(productId, delta) {
  const item = cart.find(entry => entry.id === String(productId));
  if (!item) return;
  item.qty = Math.max(0, Math.min(item.stock, item.qty + delta));
  if (item.qty === 0) cart = cart.filter(entry => entry.id !== String(productId));
  updateCartUI();
}

function cartTotals() {
  return {
    count: cart.reduce((sum, item) => sum + item.qty, 0),
    subtotal: cart.reduce((sum, item) => sum + item.price * item.qty, 0),
  };
}

function updateCartUI() {
  const totals = cartTotals();
  $('cartCount').textContent = String(totals.count);
  $('cartSubtitle').textContent = totals.count ? `${totals.count} unidades` : 'Sin productos';

  if (!cart.length) {
    $('cartItems').innerHTML = '<div class="empty-state">Tu carrito esta vacio</div>';
    $('cartFooter').hidden = true;
    return;
  }

  $('cartItems').innerHTML = cart.map(item => `
    <div class="cart-item">
      <div>
        <h3>${esc(item.name)}</h3>
        <small>${esc(item.sku)} - ${fmt(item.price)} c/u - stock ${item.stock}</small>
        <div class="qty-control">
          <button type="button" data-action="dec" data-id="${esc(item.id)}">-</button>
          <span>${item.qty}</span>
          <button type="button" data-action="inc" data-id="${esc(item.id)}" ${item.qty >= item.stock ? 'disabled' : ''}>+</button>
        </div>
      </div>
      <button class="remove-btn" type="button" data-action="remove" data-id="${esc(item.id)}">Quitar</button>
    </div>`).join('');

  $('cartSubtotal').textContent = fmt(totals.subtotal);
  $('cartTotal').textContent = fmt(totals.subtotal);
  $('cartFooter').hidden = false;
}

function openCart() {
  $('cartPanel').classList.add('open');
  $('overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeCart() {
  $('cartPanel').classList.remove('open');
  $('overlay').classList.remove('open');
  document.body.style.overflow = '';
}

function renderCheckoutItems() {
  const totals = cartTotals();
  $('checkoutItems').innerHTML = cart.map(item => `
    <div class="checkout-item">
      <div>
        <strong>${esc(item.qty)} x ${esc(item.name)}</strong>
        <span>${esc(item.sku)}</span>
      </div>
      <strong>${fmt(item.price * item.qty)}</strong>
    </div>`).join('');
  $('checkoutTotal').textContent = fmt(totals.subtotal);
}

function toggleRutField() {
  const isFactura = $('docType').value === '33';
  $('rutField').style.display = isFactura ? 'block' : 'none';
  if (!isFactura) $('rutReceptor').value = '';
}

function openCheckout() {
  if (!currentUser) {
    openAuthModal('login');
    return;
  }
  if (!cart.length) return;

  closeCart();
  $('checkoutWrap').hidden = false;
  $('checkoutGrid').hidden = false;
  $('checkoutState').hidden = true;
  $('orderResult').hidden = true;
  $('btnConfirm').disabled = false;
  $('btnConfirm').textContent = 'Crear pedido';
  $('docType').value = '39';
  toggleRutField();
  $('fName').value = `${currentUser.first_name} ${currentUser.last_name}`;
  $('fEmail').value = currentUser.email;
  renderCheckoutItems();
}

function closeCheckout() {
  $('checkoutWrap').hidden = true;
}

function showCheckoutProcessing() {
  $('checkoutGrid').hidden = true;
  $('checkoutState').hidden = false;
  $('checkoutState').className = 'checkout-state processing';
  $('checkoutState').innerHTML = `
    <div class="checkout-logo">
      <div class="checkout-brand-mark">P</div>
      <div>
        <strong>ProveoComercio</strong>
        <span>Compra protegida</span>
      </div>
    </div>
    <p class="eyebrow">Checkout seguro</p>
    <h3>Procesando compra</h3>
    <div class="checkout-loader" aria-hidden="true">
      <span></span>
      <span></span>
      <span></span>
    </div>
    <p class="checkout-state-copy">Estamos validando stock, registrando el pedido y preparando tu documento.</p>
  `;
}

function showCheckoutSuccess(data, documentName, mailText) {
  $('checkoutGrid').hidden = true;
  $('checkoutState').hidden = false;
  $('checkoutState').className = 'checkout-state success';
  $('checkoutState').innerHTML = `
    <div class="checkout-logo compact">
      <div class="checkout-brand-mark">P</div>
      <div>
        <strong>ProveoComercio</strong>
        <span>Pedido confirmado</span>
      </div>
    </div>
    <div class="success-ring" aria-hidden="true">
      <svg viewBox="0 0 48 48">
        <path d="M14 25.5 21 32l14-17"></path>
      </svg>
    </div>
    <p class="eyebrow">ProveoComercio</p>
    <h3>Pago exitoso</h3>
    <p class="checkout-state-copy">Tu compra fue registrada correctamente.</p>
    <div class="success-summary">
      <div>
        <span>Pedido</span>
        <strong>${esc(data.order_ref || data.order_id)}</strong>
      </div>
      <div>
        <span>Total</span>
        <strong>${fmt(data.total)}</strong>
      </div>
      <div>
        <span>Documento</span>
        <strong>${esc(documentName)} ${data.boleta?.folio ? `folio ${esc(data.boleta.folio)}` : 'pendiente'}</strong>
      </div>
      <div>
        <span>Correo</span>
        <strong>${esc(mailText)}</strong>
      </div>
    </div>
    <div class="success-actions">
      <button class="primary-btn inline" type="button" id="successOrdersBtn">Ver mis pedidos</button>
      <button class="ghost-light-btn" type="button" id="successContinueBtn">Seguir comprando</button>
    </div>
  `;

  $('successOrdersBtn').addEventListener('click', () => {
    closeCheckout();
    loadOrders(true);
  });
  $('successContinueBtn').addEventListener('click', closeCheckout);
}

function restoreCheckoutFormWithError(message) {
  $('checkoutState').hidden = true;
  $('checkoutGrid').hidden = false;
  const result = $('orderResult');
  result.hidden = false;
  result.className = 'order-result err';
  result.textContent = message;
}

async function submitOrder() {
  const result = $('orderResult');
  const docType = Number($('docType').value);
  const rut = $('rutReceptor').value.trim();
  const address = {
    street: $('fStreet').value.trim(),
    number: $('fNumber').value.trim(),
    apartment: $('fApt').value.trim(),
    commune: $('fCommune').value.trim(),
    region: $('fRegion').value.trim(),
  };

  if (!address.street || !address.number || !address.commune || !address.region) {
    result.hidden = false;
    result.className = 'order-result err';
    result.textContent = 'Completa calle, numero, comuna y region.';
    return;
  }
  if (docType === 33 && !rut) {
    result.hidden = false;
    result.className = 'order-result err';
    result.textContent = 'La factura requiere RUT receptor.';
    return;
  }

  $('btnConfirm').disabled = true;
  $('btnConfirm').textContent = 'Procesando compra...';
  showCheckoutProcessing();

  try {
    const startedAt = Date.now();
    const data = await fetchJSON('/api/orders', {
      method: 'POST',
      body: JSON.stringify({
        tipo_dte: docType,
        rut_receptor: rut,
        address,
        items: cart.map(item => ({
          product_id: Number(item.id),
          quantity: item.qty,
        })),
      }),
    });
    await sleep(Math.max(0, 2200 - (Date.now() - startedAt)));

    const documentName = data.document_label || (docType === 33 ? 'Factura' : 'Boleta');
    const mailText = data.queued
      ? 'Se enviara al correo registrado'
      : data.mail?.messageId
        ? `Enviado a ${data.mail.to}`
        : data.mail?.simulated
          ? 'Simulado en ambiente local'
          : 'Listo para envio';

    showCheckoutSuccess(data, documentName, mailText);

    cart = [];
    updateCartUI();
    await loadProducts();
    loadOrders(false);
  } catch (err) {
    restoreCheckoutFormWithError(err.message);
  } finally {
    $('btnConfirm').disabled = false;
    $('btnConfirm').textContent = 'Crear pedido';
  }
}

function orderStatusClass(order) {
  if (order.processing_status === 'failed' || order.mail_status === 'failed' || order.stock_status === 'failed') {
    return 'failed';
  }
  if (order.processing_status === 'completed') return 'completed';
  return order.processing_status || 'pending';
}

function orderStatusText(order) {
  if (order.processing_status === 'failed') return 'Fallido';
  if (order.processing_status === 'processing') return 'Procesando';
  if (order.processing_status === 'queued') return 'En cola';
  if (order.processing_status === 'completed') {
    if (order.mail_status === 'sent') return 'Correo enviado';
    if (order.mail_status === 'simulated') return 'Correo simulado';
    if (order.mail_status === 'failed') return 'Correo fallido';
    return 'Completado';
  }
  return 'Pendiente';
}

function renderOrders(orders) {
  if (!orders.length) {
    $('ordersList').innerHTML = '<div class="empty-state">Aun no tienes pedidos.</div>';
    return;
  }

  $('ordersList').innerHTML = orders.map(order => `
    <article class="order-card">
      <div class="order-head">
        <div>
          <h4>${esc(order.order_ref || order.id)}</h4>
          <small>${esc(order.document_label)}${order.boleta_folio ? ` folio ${esc(order.boleta_folio)}` : ' pendiente'} - ${new Date(order.created_at).toLocaleString('es-CL')}</small>
        </div>
        <span class="status-pill ${orderStatusClass(order)}">${esc(orderStatusText(order))}</span>
      </div>
      ${order.items.map(item => `
        <div class="order-line">
          <div>
            <strong>${esc(item.quantity)} x ${esc(item.name)}</strong>
            <span>${esc(item.sku || '')}</span>
          </div>
          <strong>${fmt(item.subtotal)}</strong>
        </div>`).join('')}
      <div class="order-actions">
        <strong>${fmt(order.total)}</strong>
        ${order.boleta_folio ? `<button class="download-btn" type="button" data-order-id="${esc(order.id)}">Descargar XML</button>` : ''}
      </div>
    </article>`).join('');
}

async function loadOrders(openModal = true) {
  if (!currentUser) {
    openAuthModal('login');
    return;
  }

  try {
    if (openModal) {
      $('ordersWrap').hidden = false;
      $('ordersList').innerHTML = '<div class="skeleton"></div>';
    }
    const data = await fetchJSON('/api/orders?limit=20');
    renderOrders(data.orders);
  } catch (err) {
    if (openModal) {
      $('ordersWrap').hidden = false;
      $('ordersList').innerHTML = `<div class="notice danger">${esc(err.message)}</div>`;
    }
  }
}

function closeOrders() {
  $('ordersWrap').hidden = true;
}

$('grid').addEventListener('click', event => {
  const btn = event.target.closest('.add-btn');
  if (btn) addToCart(btn.dataset.id);
});

$('filters').addEventListener('click', event => {
  const btn = event.target.closest('.filter-chip');
  if (btn) setCategory(btn.dataset.cat || '');
});

$('cartItems').addEventListener('click', event => {
  const btn = event.target.closest('button[data-action]');
  if (!btn) return;
  if (btn.dataset.action === 'inc') changeCartQty(btn.dataset.id, 1);
  if (btn.dataset.action === 'dec') changeCartQty(btn.dataset.id, -1);
  if (btn.dataset.action === 'remove') {
    cart = cart.filter(item => item.id !== String(btn.dataset.id));
    updateCartUI();
  }
});

$('ordersList').addEventListener('click', async event => {
  const btn = event.target.closest('.download-btn');
  if (!btn) return;
  btn.disabled = true;
  const previous = btn.textContent;
  btn.textContent = 'Descargando';
  try {
    await fetchDocument(btn.dataset.orderId);
  } catch (err) {
    showError('No se pudo descargar el documento: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = previous;
  }
});

$('cartBtn').addEventListener('click', openCart);
$('cartClose').addEventListener('click', closeCart);
$('overlay').addEventListener('click', closeCart);
$('btnCheckout').addEventListener('click', openCheckout);
$('btnModalClose').addEventListener('click', closeCheckout);
$('btnConfirm').addEventListener('click', submitOrder);
$('docType').addEventListener('change', toggleRutField);
$('authBtn').addEventListener('click', () => {
  if (currentUser) loadOrders(true);
  else openAuthModal('login');
});
$('logoutBtn').addEventListener('click', logout);
$('ordersBtn').addEventListener('click', () => loadOrders(true));
$('btnOrdersClose').addEventListener('click', closeOrders);
$('btnAuthClose').addEventListener('click', closeAuthModal);
$('btnAuthSubmit').addEventListener('click', submitAuth);
$('tabLogin').addEventListener('click', () => openAuthModal('login'));
$('tabRegister').addEventListener('click', () => openAuthModal('register'));
$('homeBtn').addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
$('heroCatalogBtn').addEventListener('click', () => $('grid').scrollIntoView({ behavior: 'smooth', block: 'start' }));
$('heroOrdersBtn').addEventListener('click', () => {
  if (currentUser) loadOrders(true);
  else openAuthModal('login');
});

document.querySelectorAll('[data-jump-cat]').forEach(button => {
  button.addEventListener('click', () => {
    const cat = button.dataset.jumpCat;
    const filter = [...document.querySelectorAll('.filter-chip')].find(btn => btn.dataset.cat === cat);
    if (filter) setCategory(cat);
    else {
      activeCat = cat;
      loadProducts();
    }
    $('grid').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
});

$('searchInput').addEventListener('input', event => {
  search = event.target.value.trim();
  $('clearBtn').classList.toggle('show', search.length > 0);
  clearTimeout(debounce);
  debounce = setTimeout(loadProducts, 250);
});

$('clearBtn').addEventListener('click', () => {
  $('searchInput').value = '';
  search = '';
  $('clearBtn').classList.remove('show');
  loadProducts();
});

(async () => {
  updateCartUI();
  toggleRutField();
  await loadUser();
  await loadCategories();
  await loadProducts();
})();
