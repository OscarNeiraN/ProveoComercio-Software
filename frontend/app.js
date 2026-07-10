const API = '';
const $ = id => document.getElementById(id);

let cart = [];
let activeCat = '';
let search = '';
let debounce = null;
let currentUser = null;
let authMode = 'login';

const fmt = n => '$' + Number(n || 0).toLocaleString('es-CL');

async function checkHealth() {
  try {
    const data = await fetchJSON('/api/health');
    const dot = $('dot');
    const dbOk = data.db && data.db.connected;

    if (data.status === 'ok') {
      dot.className = 'dot online';
      $('statusText').textContent = dbOk ? 'Inventario RDS conectado' : 'Backend OK';
    } else {
      dot.className = 'dot offline';
      $('statusText').textContent = 'Error de conexion';
    }
  } catch {
    $('dot').className = 'dot offline';
    $('statusText').textContent = 'Backend sin conexion';
    showError('No se puede conectar al backend. Revisa el contenedor.');
  }
}

function getAuthToken() {
  return localStorage.getItem('auth_token');
}

function setAuthToken(token) {
  if (token) localStorage.setItem('auth_token', token);
  else localStorage.removeItem('auth_token');
}

function updateAuthUI(user) {
  currentUser = user;
  const authBtn = $('authBtn');
  const logoutBtn = $('logoutBtn');
  if (user) {
    authBtn.textContent = `Hola, ${user.first_name}`;
    logoutBtn.hidden = false;
  } else {
    authBtn.textContent = 'Ingresar';
    logoutBtn.hidden = true;
  }
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
      result.textContent = `Contrasena invalida: ${passwordFailures.join(', ')}.`;
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
    categories.forEach(cat => {
      const btn = document.createElement('button');
      btn.className = 'pill';
      btn.dataset.cat = cat.id ?? cat;
      btn.textContent = cat.name ?? cat;
      btn.addEventListener('click', () => setCategory(cat.id ?? cat, btn));
      $('filters').appendChild(btn);
    });
  } catch {
    // Products still show their own error state.
  }
}

function setCategory(cat, btn) {
  activeCat = cat;
  document.querySelectorAll('.pill').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  loadProducts();
}

async function loadProducts() {
  hideError();
  $('grid').innerHTML = Array(6).fill('<div class="sk"></div>').join('');

  try {
    const params = new URLSearchParams();
    if (activeCat) params.set('category', activeCat);
    if (search) params.set('search', search);

    const data = await fetchJSON(`/api/products?${params}`);

    $('resultCount').textContent = `${data.total} producto${data.total !== 1 ? 's' : ''}`;
    $('syncTime').textContent = `sync ${new Date(data.synced_at).toLocaleTimeString('es-CL')} - ${data.source}`;

    renderProducts(data.products);
  } catch (err) {
    showError('Error al cargar productos: ' + err.message);
    $('grid').innerHTML = '<div class="empty">No se pudieron cargar los productos.</div>';
  }
}

function renderProducts(products) {
  if (!products.length) {
    $('grid').innerHTML = '<div class="empty">No se encontraron productos.</div>';
    return;
  }

  $('grid').innerHTML = products.map((p, i) => {
    let cls;
    let label;
    if (p.stock === 0) {
      cls = 'out';
      label = 'Sin stock';
    } else if (p.stock <= 8) {
      cls = 'low';
      label = `Solo ${p.stock} ud.`;
    } else {
      cls = 'ok';
      label = `${p.stock} disponibles`;
    }

    return `<article class="card" style="animation-delay:${i * 0.04}s">
      <span class="card-cat">${p.category}</span>
      <h2 class="card-name">${p.name}</h2>
      <span class="card-sku">${p.sku}</span>
      <div class="card-bottom">
        <span class="card-price">${fmt(p.price)}</span>
        <span class="badge ${cls}">${label}</span>
      </div>
      <button class="btn-add"
        data-id="${p.id}" data-name="${p.name}"
        data-price="${p.price}" data-sku="${p.sku}"
        ${p.stock === 0 ? 'disabled' : ''}>
        + Agregar al carrito
      </button>
    </article>`;
  }).join('');

  $('grid').querySelectorAll('.btn-add:not([disabled])').forEach(btn => {
    btn.addEventListener('click', () => addToCart({
      id: btn.dataset.id,
      name: btn.dataset.name,
      price: parseInt(btn.dataset.price, 10),
      sku: btn.dataset.sku,
    }));
  });
}

function addToCart(product) {
  const existing = cart.find(item => item.id === product.id);
  if (existing) existing.qty++;
  else cart.push({ ...product, qty: 1 });
  updateCartUI();
  openCart();
}

function removeFromCart(id) {
  cart = cart.filter(item => item.id !== id);
  updateCartUI();
}

function updateCartUI() {
  const total = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  const count = cart.reduce((sum, item) => sum + item.qty, 0);
  $('cartCount').textContent = count;

  if (!cart.length) {
    $('cartItems').innerHTML = '<div class="cart-empty">Tu carrito esta vacio</div>';
    $('cartFooter').hidden = true;
    return;
  }

  $('cartItems').innerHTML = cart.map(item => `
    <div class="cart-item">
      <div class="ci-info">
        <div class="ci-name">${item.qty > 1 ? `(${item.qty}x) ` : ''}${item.name}</div>
        <div class="ci-price">${fmt(item.price * item.qty)}</div>
      </div>
      <button class="ci-rm" data-id="${item.id}">x</button>
    </div>`).join('');

  $('cartItems').querySelectorAll('.ci-rm').forEach(btn => {
    btn.addEventListener('click', () => removeFromCart(btn.dataset.id));
  });

  $('cartTotal').textContent = fmt(total);
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

async function submitOrder() {
  if (!currentUser) {
    alert('Debes iniciar sesion para confirmar el pedido');
    openAuthModal('login');
    return;
  }

  const btn = $('btnConfirm');
  const result = $('orderResult');
  const address = {
    street: $('fStreet').value.trim(),
    number: $('fNumber').value.trim(),
    apartment: $('fApt').value.trim(),
    commune: $('fCommune').value.trim(),
    region: $('fRegion').value.trim(),
  };

  if (!address.street || !address.number || !address.commune || !address.region) {
    result.className = 'order-result err';
    result.textContent = 'Completa calle, numero, comuna y region para el envio.';
    result.hidden = false;
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Procesando pedido...';
  result.hidden = true;

  try {
    const data = await fetchJSON('/api/orders', {
      method: 'POST',
      body: JSON.stringify({
        items: cart.map(item => ({
          product_id: parseInt(item.id, 10),
          sku: item.sku,
          name: item.name,
          quantity: item.qty,
          unit_price: item.price,
        })),
        address,
      }),
    });

    const mailMsg = data.mail?.simulated
      ? ' (correo simulado - configura SMTP)'
      : data.mail?.messageId ? ` - correo enviado a ${data.mail.to}` : '';
    result.className = 'order-result ok';
    result.innerHTML = data.queued
      ? `Pedido <strong>${data.order_ref || data.order_id.slice(0, 8)}</strong> recibido. Se procesara en segundo plano. Total: ${fmt(data.total)}`
      : `Orden <strong>${data.order_ref || data.order_id.slice(0, 8)}</strong> creada. Total: ${fmt(data.total)}<br/>Boleta DTE folio ${data.boleta?.folio || '-'}${mailMsg}`;
    result.hidden = false;
    cart = [];
    updateCartUI();
    loadProducts();
  } catch (err) {
    result.className = 'order-result err';
    result.textContent = 'Error: ' + err.message;
    result.hidden = false;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Confirmar pedido';
  }
}

async function fetchJSON(path, opts = {}) {
  const token = getAuthToken();
  const headers = {
    'Content-Type': 'application/json',
    ...opts.headers,
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(API + path, {
    headers,
    ...opts,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

function showError(msg) {
  $('errorMsg').textContent = msg;
  $('errorBanner').hidden = false;
}

function hideError() {
  $('errorBanner').hidden = true;
}

$('cartBtn').addEventListener('click', openCart);
$('cartClose').addEventListener('click', closeCart);
$('overlay').addEventListener('click', closeCart);

$('btnCheckout').addEventListener('click', () => {
  if (!currentUser) {
    openAuthModal('login');
    return;
  }
  closeCart();
  $('modalWrap').hidden = false;
  $('orderResult').hidden = true;
  $('fName').value = `${currentUser.first_name} ${currentUser.last_name}`;
  $('fEmail').value = currentUser.email;
});

$('btnModalClose').addEventListener('click', () => { $('modalWrap').hidden = true; });
$('btnConfirm').addEventListener('click', submitOrder);
$('authBtn').addEventListener('click', () => openAuthModal('login'));
$('logoutBtn').addEventListener('click', logout);
$('tabLogin').addEventListener('click', () => openAuthModal('login'));
$('tabRegister').addEventListener('click', () => openAuthModal('register'));
$('btnAuthClose').addEventListener('click', closeAuthModal);
$('btnAuthSubmit').addEventListener('click', submitAuth);

$('searchInput').addEventListener('input', event => {
  search = event.target.value.trim();
  $('clearBtn').classList.toggle('show', search.length > 0);
  clearTimeout(debounce);
  debounce = setTimeout(loadProducts, 320);
});

$('clearBtn').addEventListener('click', () => {
  $('searchInput').value = '';
  search = '';
  $('clearBtn').classList.remove('show');
  loadProducts();
});

document.querySelector('.pill[data-cat=""]').addEventListener('click', function onAllClick() {
  setCategory('', this);
});

(async () => {
  await checkHealth();
  await loadUser();
  await loadCategories();
  await loadProducts();
})();
