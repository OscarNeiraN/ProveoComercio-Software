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

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

function emptyState(message) {
  return el('div', 'empty-state', message);
}

function skeletonList(count = 1) {
  const fragment = document.createDocumentFragment();
  for (let index = 0; index < count; index += 1) {
    fragment.append(el('div', 'skeleton'));
  }
  return fragment;
}

function sanitizeDownloadFilename(value) {
  const fallback = 'documento.xml';
  const filename = String(value || fallback).replace(/[\\/:*?"<>|]/g, '-').slice(0, 140).trim();
  return filename || fallback;
}

function safeImageUrl(value) {
  try {
    const url = new URL(String(value || ''), window.location.origin);
    const isSameOrigin = url.origin === window.location.origin;
    const isTrustedCdn = url.protocol === 'https:' && url.hostname === 'images.unsplash.com';
    return isSameOrigin || isTrustedCdn ? url.href : '';
  } catch {
    return '';
  }
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
  const safeOrderId = encodeURIComponent(String(orderId));
  const res = await fetch(`${API}/api/orders/${safeOrderId}/boleta`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  const blob = await res.blob();
  const disposition = res.headers.get('Content-Disposition') || '';
  const match = disposition.match(/filename="?([^"]+)"?/);
  const filename = sanitizeDownloadFilename(match ? match[1] : `documento-${orderId}.xml`);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  link.click();
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
      filters.append(btn);
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
  $('grid').replaceChildren(skeletonList(6));

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
    $('grid').replaceChildren(emptyState('No se pudieron cargar los productos.'));
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
    $('grid').replaceChildren(emptyState('No se encontraron productos.'));
    return;
  }

  const fragment = document.createDocumentFragment();
  products.forEach(product => {
    const badge = stockBadge(product);
    const disabled = Number(product.stock || 0) <= 0;
    const discount = Number(product.discount || 0);

    const card = el('article', 'product-card');
    const media = el('div', 'product-media');
    if (discount > 0) media.append(el('span', 'discount-badge', `-${discount}%`));

    const imageUrl = safeImageUrl(product.image_url);
    if (imageUrl) {
      const image = el('img');
      image.src = imageUrl;
      image.alt = String(product.name || 'Producto');
      image.loading = 'lazy';
      image.addEventListener('error', () => {
        media.classList.add('image-fallback');
        image.remove();
      }, { once: true });
      media.append(image);
    }

    const fallback = el(
      'div',
      'fallback-product',
      String(product.brand || product.category || 'P').slice(0, 2).toUpperCase(),
    );
    fallback.setAttribute('aria-hidden', 'true');
    media.append(fallback);

    const body = el('div', 'product-body');
    const meta = el('div', 'product-meta');
    meta.append(el('span', 'brand-name', product.brand || product.category || 'Marca'));
    meta.append(el('span', 'sku', product.sku || ''));

    const rating = el('div', 'rating-line');
    rating.append(el('span', 'stars', '*****'));
    rating.append(el('strong', null, Number(product.rating || 0).toFixed(1)));
    rating.append(el('small', null, `(${Number(product.reviews || 0)})`));

    const productLine = el('div', 'product-line');
    const priceBox = el('div');
    if (product.old_price) priceBox.append(el('span', 'old-price', fmt(product.old_price)));
    priceBox.append(el('span', 'price', fmt(product.price)));
    productLine.append(priceBox);
    productLine.append(el('span', `badge ${badge.cls}`, badge.text));

    const note = el('div', 'retail-note');
    note.append(el('span', null, 'Retiro o despacho'));
    note.append(el('strong', null, 'Compra protegida'));

    const addBtn = el('button', 'add-btn', 'Agregar al carrito');
    addBtn.type = 'button';
    addBtn.dataset.id = String(product.id);
    addBtn.disabled = disabled;

    body.append(
      meta,
      el('h2', null, product.name || 'Producto'),
      el('p', 'product-desc', product.description || ''),
      rating,
      productLine,
      note,
      addBtn,
    );
    card.append(media, body);
    fragment.append(card);
  });

  $('grid').replaceChildren(fragment);
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
    $('cartItems').replaceChildren(emptyState('Tu carrito esta vacio'));
    $('cartFooter').hidden = true;
    return;
  }

  const fragment = document.createDocumentFragment();
  cart.forEach(item => {
    const row = el('div', 'cart-item');
    const detail = el('div');
    detail.append(el('h3', null, item.name));
    detail.append(el('small', null, `${item.sku || ''} - ${fmt(item.price)} c/u - stock ${item.stock}`));

    const qtyControl = el('div', 'qty-control');
    const decBtn = el('button', null, '-');
    decBtn.type = 'button';
    decBtn.dataset.action = 'dec';
    decBtn.dataset.id = String(item.id);
    const incBtn = el('button', null, '+');
    incBtn.type = 'button';
    incBtn.dataset.action = 'inc';
    incBtn.dataset.id = String(item.id);
    incBtn.disabled = item.qty >= item.stock;
    qtyControl.append(decBtn, el('span', null, item.qty), incBtn);
    detail.append(qtyControl);

    const removeBtn = el('button', 'remove-btn', 'Quitar');
    removeBtn.type = 'button';
    removeBtn.dataset.action = 'remove';
    removeBtn.dataset.id = String(item.id);

    row.append(detail, removeBtn);
    fragment.append(row);
  });

  $('cartItems').replaceChildren(fragment);

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
  const fragment = document.createDocumentFragment();
  cart.forEach(item => {
    const row = el('div', 'checkout-item');
    const detail = el('div');
    detail.append(el('strong', null, `${item.qty} x ${item.name}`));
    detail.append(el('span', null, item.sku || ''));
    row.append(detail, el('strong', null, fmt(item.price * item.qty)));
    fragment.append(row);
  });
  $('checkoutItems').replaceChildren(fragment);
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
  const brand = el('div', 'checkout-logo');
  const brandText = el('div');
  brandText.append(el('strong', null, 'ProveoComercio'), el('span', null, 'Compra protegida'));
  brand.append(el('div', 'checkout-brand-mark', 'P'), brandText);

  const loader = el('div', 'checkout-loader');
  loader.setAttribute('aria-hidden', 'true');
  loader.append(el('span'), el('span'), el('span'));

  $('checkoutState').replaceChildren(
    brand,
    el('p', 'eyebrow', 'Checkout seguro'),
    el('h3', null, 'Procesando compra'),
    loader,
    el('p', 'checkout-state-copy', 'Estamos validando stock, registrando el pedido y preparando tu documento.'),
  );
}

function showCheckoutSuccess(data, documentName, mailText) {
  $('checkoutGrid').hidden = true;
  $('checkoutState').hidden = false;
  $('checkoutState').className = 'checkout-state success';
  const brand = el('div', 'checkout-logo compact');
  const brandText = el('div');
  brandText.append(el('strong', null, 'ProveoComercio'), el('span', null, 'Pedido confirmado'));
  brand.append(el('div', 'checkout-brand-mark', 'P'), brandText);

  const ring = el('div', 'success-ring');
  ring.setAttribute('aria-hidden', 'true');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 48 48');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M14 25.5 21 32l14-17');
  svg.append(path);
  ring.append(svg);

  const summary = el('div', 'success-summary');
  [
    ['Pedido', data.order_ref || data.order_id],
    ['Total', fmt(data.total)],
    ['Documento', `${documentName} ${data.boleta?.folio ? `folio ${data.boleta.folio}` : 'pendiente'}`],
    ['Correo', mailText],
  ].forEach(([label, value]) => {
    const row = el('div');
    row.append(el('span', null, label), el('strong', null, value));
    summary.append(row);
  });

  const actions = el('div', 'success-actions');
  const ordersBtn = el('button', 'primary-btn inline', 'Ver mis pedidos');
  ordersBtn.type = 'button';
  ordersBtn.id = 'successOrdersBtn';
  const continueBtn = el('button', 'ghost-light-btn', 'Seguir comprando');
  continueBtn.type = 'button';
  continueBtn.id = 'successContinueBtn';
  actions.append(ordersBtn, continueBtn);

  $('checkoutState').replaceChildren(
    brand,
    ring,
    el('p', 'eyebrow', 'ProveoComercio'),
    el('h3', null, 'Pago exitoso'),
    el('p', 'checkout-state-copy', 'Tu compra fue registrada correctamente.'),
    summary,
    actions,
  );

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
  if (['processing', 'queued', 'pending'].includes(order.processing_status)) return order.processing_status;
  return 'pending';
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
    $('ordersList').replaceChildren(emptyState('Aun no tienes pedidos.'));
    return;
  }

  const fragment = document.createDocumentFragment();
  orders.forEach(order => {
    const card = el('article', 'order-card');
    const head = el('div', 'order-head');
    const titleBox = el('div');
    titleBox.append(el('h4', null, order.order_ref || order.id));
    const createdAt = order.created_at ? new Date(order.created_at).toLocaleString('es-CL') : 'fecha no disponible';
    const documentText = `${order.document_label || 'Documento'}${order.boleta_folio ? ` folio ${order.boleta_folio}` : ' pendiente'} - ${createdAt}`;
    titleBox.append(el('small', null, documentText));
    head.append(titleBox, el('span', `status-pill ${orderStatusClass(order)}`, orderStatusText(order)));

    card.append(head);
    (order.items || []).forEach(item => {
      const line = el('div', 'order-line');
      const detail = el('div');
      detail.append(el('strong', null, `${item.quantity} x ${item.name}`));
      detail.append(el('span', null, item.sku || ''));
      line.append(detail, el('strong', null, fmt(item.subtotal)));
      card.append(line);
    });

    const actions = el('div', 'order-actions');
    actions.append(el('strong', null, fmt(order.total)));
    if (order.boleta_folio) {
      const downloadBtn = el('button', 'download-btn', 'Descargar XML');
      downloadBtn.type = 'button';
      downloadBtn.dataset.orderId = String(order.id);
      actions.append(downloadBtn);
    }
    card.append(actions);
    fragment.append(card);
  });

  $('ordersList').replaceChildren(fragment);
}

async function loadOrders(openModal = true) {
  if (!currentUser) {
    openAuthModal('login');
    return;
  }

  try {
    if (openModal) {
      $('ordersWrap').hidden = false;
      $('ordersList').replaceChildren(skeletonList(1));
    }
    const data = await fetchJSON('/api/orders?limit=20');
    renderOrders(data.orders);
  } catch (err) {
    if (openModal) {
      $('ordersWrap').hidden = false;
      $('ordersList').replaceChildren(el('div', 'notice danger', err.message));
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
