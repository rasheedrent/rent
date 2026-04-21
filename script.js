// =====================
// Core Data
// =====================
let appData = {
    settings: { maxLoginAttempts: 3, notifyDays: 7, ownerEmail: '', ownerWhatsapp: '', emailjsServiceId: '', emailjsTemplateId: '', emailjsPublicKey: '', notificationLang: 'ar', password: 'admin123' },
    tenants: [], contracts: [], payments: [], paymentRecords: [], activity: []
};
let loginAttempts = 0;
let confirmCallback = null;
let selectedPaymentMethod = null;
let countdownIntervals = [];
let editingId = {}; // For editing flags

// =====================
// Helpers
// =====================
const $ = id => document.getElementById(id);
const loadData = () => { const saved = localStorage.getItem('rentalAppData'); if (saved) appData = { ...appData, ...JSON.parse(saved) }; };
const saveData = () => localStorage.setItem('rentalAppData', JSON.stringify(appData));
const formatDate = d => d ? new Date(d).toLocaleDateString('ar-SA') : '-';
const showToast = (msg, type = 'success') => { const t = $('toast'); $('toastMessage').textContent = msg; t.className = `toast show ${type}`; setTimeout(() => t.classList.remove('show'), 2000); };
const addLog = a => { appData.activity.unshift({ a, d: new Date().toISOString() }); if(appData.activity.length > 50) appData.activity.pop(); saveData(); };

// =====================
// Navigation & Auth
// =====================
function navigateTo(page) {
    $$('.nav-item').forEach(i => i.classList.remove('active'));
    $$(`[data-page="${page}"]`)?.classList.add('active');
    $$('.page').forEach(p => p.classList.add('hidden'));
    $(`page-${page}`)?.classList.remove('hidden');
    if (window.innerWidth < 768) $('sidebar').classList.remove('open');
}

function handleLogin(e) {
    e.preventDefault();
    const err = $('loginError');
    const warn = $('attemptsWarning');
    if ($('username').value === 'admin' && $('password').value === appData.settings.password) {
        $('loginScreen').classList.add('hidden');
        $('mainApp').classList.remove('hidden');
        loginAttempts = 0;
        initApp();
    } else {
        loginAttempts++;
        err.textContent = 'بيانات الدخول غير صحيحة';
        err.classList.remove('hidden');
        const rem = appData.settings.maxLoginAttempts - loginAttempts;
        if (rem > 0) {
            $('remainingAttempts').textContent = rem;
            warn.classList.remove('hidden');
        } else {
            err.textContent = 'تم حظر الدخول';
            $('loginForm button').disabled = true;
        }
    }
}

// =====================
// Init & Render
// =====================
function initApp() {
    loadData();
    renderDash();
    renderTenants();
    renderContracts();
    renderPayments();
    updateSelects();
    renderCountdown();
    renderHistory();
    loadSettings();
    startTimers();
}

function renderDash() {
    $('totalTenants').textContent = appData.tenants.length;
    $('activeContracts').textContent = appData.contracts.filter(c => new Date(c.endDate) > new Date()).length;
    $('totalRent').textContent = appData.contracts.reduce((s, c) => s + (parseFloat(c.amount) || 0), 0).toLocaleString();
    const upc = appData.payments.filter(p => p.status !== 'paid' && new Date(p.dueDate) > new Date() && Math.ceil((new Date(p.dueDate) - new Date()) / 86400000) <= appData.settings.notifyDays).length;
    $('upcomingCount').textContent = upc;

    // Quick View
    const qc = $('quickCountdown');
    qc.innerHTML = '';
    appData.payments.filter(p => p.status !== 'paid' && new Date(p.dueDate) > new Date()).sort((a,b) => new Date(a.dueDate) - new Date(b.dueDate)).slice(0, 3).forEach(p => {
        const t = appData.tenants.find(x => x.id === p.tenantId);
        const d = Math.ceil((new Date(p.dueDate) - new Date()) / 86400000);
        qc.innerHTML += `<div class="glass rounded-lg p-3"><div class="flex justify-between"><span class="font-medium text-sm">${t?.name || 'غير محدد'}</span><span class="badge ${d<=3?'badge-danger':'badge-success'}">${d} يوم</span></div><div class="text-xs text-gray-400 mt-1">${parseFloat(p.amount).toLocaleString()} ر.س</div></div>`;
    });
    if(!qc.innerHTML) qc.innerHTML = '<p class="text-gray-500 text-xs col-span-3 text-center">لا يوجد دفعات قريبة</p>';

    // Recent Activity
    const rp = $('recentPayments');
    rp.innerHTML = '';
    appData.activity.slice(0, 5).forEach(l => {
        rp.innerHTML += `<div class="flex justify-between items-center text-gray-300"><span>${l.a}</span><span class="text-xs text-gray-500">${new Date(l.d).toLocaleString('ar-SA')}</span></div>`;
    });
    if(!rp.innerHTML) rp.innerHTML = '<p class="text-gray-500 text-xs">لا يوجد نشاط</p>';
}

function renderCountdown() {
    const c = $('countdownList');
    c.innerHTML = '';
    const items = appData.payments.filter(p => p.status !== 'paid' && new Date(p.dueDate) > new Date()).sort((a,b) => new Date(a.dueDate) - new Date(b.dueDate));
    
    $('countdownDot').classList.toggle('hidden', items.length === 0);

    items.forEach(p => {
        const t = appData.tenants.find(x => x.id === p.tenantId);
        c.innerHTML += `
        <div class="countdown-container fade-in" id="cd-${p.id}">
            <div class="flex justify-between mb-2">
                <div><h3 class="font-bold">${t?.name || 'غير محدد'}</h3><p class="text-xs text-gray-400">${t?.phone || ''}</p></div>
                <div class="text-left"><span class="text-lg font-black text-emerald-400">${parseFloat(p.amount).toLocaleString()}</span><span class="text-xs text-gray-400 block">${formatDate(p.dueDate)}</span></div>
            </div>
            <div class="countdown-numbers" id="tmr-${p.id}">
                <div class="countdown-unit"><span class="countdown-value" id="d-${p.id}">00</span><span class="countdown-label">يوم</span></div>
                <div class="countdown-unit"><span class="countdown-value" id="h-${p.id}">00</span><span class="countdown-label">ساعة</span></div>
                <div class="countdown-unit"><span class="countdown-value" id="m-${p.id}">00</span><span class="countdown-label">دقيقة</span></div>
                <div class="countdown-unit"><span class="countdown-value" id="s-${p.id}">00</span><span class="countdown-label">ثانية</span></div>
            </div>
            <div class="flex gap-2 mt-3">
                <button class="btn-primary flex-1 text-xs" type="button" onclick="openPay('${p.id}')">تسجيل الدفع</button>
                <button class="btn-secondary text-xs" type="button" onclick="notify('wa', '${p.id}')">واتساب</button>
                <button class="btn-secondary text-xs" type="button" onclick="notify('mail', '${p.id}')">إيميل</button>
            </div>
        </div>`;
    });
    if(!items.length) c.innerHTML = '<div class="glass rounded-xl p-8 text-center text-gray-400">لا توجد دفعات قادمة</div>';
}

function startTimers() {
    countdownIntervals.forEach(i => clearInterval(i));
    countdownIntervals = [];
    appData.payments.forEach(p => {
        if(p.status === 'paid') return;
        const tick = () => {
            const diff = new Date(p.dueDate) - new Date();
            if(diff <= 0) return;
            const D = Math.floor(diff / 86400000);
            const H = Math.floor((diff % 86400000) / 3600000);
            const M = Math.floor((diff % 3600000) / 60000);
            const S = Math.floor((diff % 60000) / 1000);
            if($(`d-${p.id}`)) $(`d-${p.id}`).textContent = String(D).padStart(2, '0');
            if($(`h-${p.id}`)) $(`h-${p.id}`).textContent = String(H).padStart(2, '0');
            if($(`m-${p.id}`)) $(`m-${p.id}`).textContent = String(M).padStart(2, '0');
            if($(`s-${p.id}`)) $(`s-${p.id}`).textContent = String(S).padStart(2, '0');
        };
        tick();
        countdownIntervals.push(setInterval(tick, 1000));
    });
}

// =====================
// CRUD Operations
// =====================
function renderTenants() {
    const tb = $('tenantsTable');
    tb.innerHTML = '';
    appData.tenants.forEach(t => {
        tb.innerHTML += `<tr><td class="font-medium">${t.name}</td><td>${t.phone}</td><td>${t.email || '-'}</td><td>${t.address || '-'}</td><td><button class="action-btn success" onclick="editTenant('${t.id}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg></button> <button class="action-btn danger" onclick="del('t', '${t.id}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg></button></td></tr>`;
    });
    if(!appData.tenants.length) tb.innerHTML = '<tr><td colspan="5" class="text-center text-gray-500 p-4">لا يوجد مستأجرين</td></tr>';
}

function openTenantModal(id = null) {
    $('tenantForm').reset();
    if(id) {
        const t = appData.tenants.find(x => x.id === id);
        $('tenantId').value = t.id;
        $('tenantName').value = t.name;
        $('tenantPhone').value = t.phone;
        $('tenantEmail').value = t.email || '';
        $('tenantAddress').value = t.address || '';
        $('tenantModalTitle').textContent = 'تعديل مستأجر';
        editingId.tenant = id;
    } else {
        editingId.tenant = null;
        $('tenantModalTitle').textContent = 'إضافة مستأجر';
    }
    $('tenantModal').classList.add('show');
}

function saveTenant(e) {
    e.preventDefault();
    const t = {
        id: editingId.tenant || Date.now().toString(),
        name: $('tenantName').value,
        phone: $('tenantPhone').value,
        email: $('tenantEmail').value,
        address: $('tenantAddress').value
    };
    const idx = appData.tenants.findIndex(x => x.id === t.id);
    if(idx >= 0) appData.tenants[idx] = t;
    else appData.tenants.push(t);
    addLog(`حفظ مستأجر: ${t.name}`);
    saveData();
    renderTenants();
    updateSelects();
    $('tenantModal').classList.remove('show');
    showToast('تم الحفظ');
}

// Simplified similar functions for Contracts and Payments
function renderContracts() {
    const tb = $('contractsTable'); tb.innerHTML = '';
    const types = { monthly: 'شهري', quarterly: 'ربع سنوي', semiannual: 'نصف سنوي', annual: 'سنوي' };
    appData.contracts.forEach(c => {
        const t = appData.tenants.find(x => x.id === c.tenantId);
        const active = new Date(c.endDate) > new Date();
        tb.innerHTML += `<tr><td>${c.number}</td><td>${t?.name || '-'}</td><td>${c.property}</td><td>${parseFloat(c.amount).toLocaleString()}</td><td>${types[c.paymentType]}</td><td>${formatDate(c.startDate)}</td><td>${formatDate(c.endDate)}</td><td><span class="badge ${active?'badge-success':'badge-danger'}">${active?'نشط':'منتهي'}</span></td><td><button class="action-btn success" onclick="editContract('${c.id}')">E</button> <button class="action-btn danger" onclick="del('c', '${c.id}')">X</button></td></tr>`;
    });
    if(!appData.contracts.length) tb.innerHTML = '<tr><td colspan="9" class="text-center text-gray-500 p-4">لا يوجد عقود</td></tr>';
}

function openContractModal(id = null) {
    $('contractForm').reset(); updateSelects();
    if(id) {
        const c = appData.contracts.find(x => x.id === id);
        $('contractId').value = c.id; $('contractNumber').value = c.number; $('contractTenant').value = c.tenantId;
        $('contractProperty').value = c.property; $('contractAmount').value = c.amount;
        $('contractPaymentType').value = c.paymentType; $('contractStartDate').value = c.startDate;
        $('contractEndDate').value = c.endDate; editingId.contract = id;
    } else { editingId.contract = null; $('contractNumber').value = 'CTR-' + Date.now().toString().slice(-6); }
    $('contractModal').classList.add('show');
}

function saveContract(e) {
    e.preventDefault();
    const c = {
        id: editingId.contract || Date.now().toString(),
        number: $('contractNumber').value, tenantId: $('contractTenant').value,
        property: $('contractProperty').value, amount: $('contractAmount').value,
        paymentType: $('contractPaymentType').value, startDate: $('contractStartDate').value,
        endDate: $('contractEndDate').value
    };
    const idx = appData.contracts.findIndex(x => x.id === c.id);
    if(idx >= 0) appData.contracts[idx] = c; else appData.contracts.push(c);
    addLog(`حفظ عقد: ${c.number}`);
    saveData(); renderContracts(); $('contractModal').classList.remove('show'); showToast('تم الحفظ');
}

function renderPayments() {
    const tb = $('paymentsTable'); tb.innerHTML = '';
    const st = { paid: 'مدفوع', pending: 'قيد الانتظار', overdue: 'متأخر' };
    appData.payments.forEach(p => {
        const t = appData.tenants.find(x => x.id === p.tenantId);
        tb.innerHTML += `<tr><td>#${p.id.slice(-4)}</td><td>${t?.name || '-'}</td><td>${parseFloat(p.amount).toLocaleString()}</td><td>${formatDate(p.date)}</td><td>${formatDate(p.dueDate)}</td><td><span class="badge badge-${p.status==='paid'?'success':p.status==='overdue'?'danger':'warning'}">${st[p.status]}</span></td><td>${p.status !== 'paid' ? `<button class="action-btn success" onclick="openPay('${p.id}')">$</button>` : ''} <button class="action-btn info" onclick="editPayment('${p.id}')">E</button> <button class="action-btn danger" onclick="del('p', '${p.id}')">X</button></td></tr>`;
    });
    if(!appData.payments.length) tb.innerHTML = '<tr><td colspan="7" class="text-center text-gray-500 p-4">لا يوجد مدفوعات</td></tr>';
}

function openPaymentModal(id = null) {
    $('paymentForm').reset(); updateSelects();
    if(id) {
        const p = appData.payments.find(x => x.id === id);
        $('paymentId').value = p.id; $('paymentTenant').value = p.tenantId; $('paymentAmount').value = p.amount;
        $('paymentDate').value = p.date; $('paymentDueDate').value = p.dueDate; $('paymentStatus').value = p.status;
        editingId.payment = id;
    } else { editingId.payment = null; $('paymentDate').value = new Date().toISOString().split('T')[0]; }
    $('paymentModal').classList.add('show');
}

function savePayment(e) {
    e.preventDefault();
    const p = {
        id: editingId.payment || Date.now().toString(),
        tenantId: $('paymentTenant').value, amount: $('paymentAmount').value,
        date: $('paymentDate').value, dueDate: $('paymentDueDate').value, status: $('paymentStatus').value
    };
    const idx = appData.payments.findIndex(x => x.id === p.id);
    if(idx >= 0) appData.payments[idx] = p; else appData.payments.push(p);
    addLog(`حفظ دفعة: ${p.amount}`);
    saveData(); renderPayments(); renderCountdown(); startTimers(); $('paymentModal').classList.remove('show'); showToast('تم الحفظ');
}

// =====================
// Payment Process & History
// =====================
function openPay(id) {
    const p = appData.payments.find(x => x.id === id);
    const t = appData.tenants.find(x => x.id === p.tenantId);
    $('processPaymentId').value = id;
    $('processTenantName').textContent = t?.name || '-';
    $('processAmount').textContent = parseFloat(p.amount).toLocaleString() + ' ر.س';
    $('transferDetails').classList.add('hidden');
    selectedPaymentMethod = null;
    $$('.payment-method-btn').forEach(b => b.classList.remove('selected'));
    $('processPaymentModal').classList.add('show');
}

function confirmPay() {
    if(!selectedPaymentMethod) return showToast('اختر طريقة الدفع', 'error');
    const id = $('processPaymentId').value;
    const p = appData.payments.find(x => x.id === id);
    const t = appData.tenants.find(x => x.id === p.tenantId);
    
    appData.paymentRecords.push({
        id: Date.now().toString(), paymentId: id, tenantId: p.tenantId, amount: p.amount,
        method: selectedPaymentMethod, date: new Date().toISOString(),
        ref: selectedPaymentMethod === 'transfer' ? $('transferReference').value : '',
        bank: selectedPaymentMethod === 'transfer' ? $('transferBank').value : ''
    });
    
    p.status = 'paid';
    addLog(`دفع ${selectedPaymentMethod === 'cash' ? 'كاش' : 'حوالة'}: ${p.amount} - ${t?.name}`);
    saveData();
    $('processPaymentModal').classList.remove('show');
    renderPayments(); renderCountdown(); renderHistory(); renderDash();
    showToast('تم التسجيل');
}

function renderHistory() {
    const c = $('paymentTimeline'); c.innerHTML = '';
    let cash = 0, trans = 0;
    appData.paymentRecords.forEach(r => {
        r.method === 'cash' ? cash += parseFloat(r.amount) : trans += parseFloat(r.amount);
    });
    $('totalCash').textContent = cash.toLocaleString() + ' ر.س';
    $('totalTransfer').textContent = trans.toLocaleString() + ' ر.س';
    $('grandTotal').textContent = (cash + trans).toLocaleString() + ' ر.س';

    const filter = $('historyFilter').value;
    let data = [...appData.paymentRecords].reverse();
    if(filter !== 'all') data = data.filter(r => r.method === filter);

    data.forEach(r => {
        const t = appData.tenants.find(x => x.id === r.tenantId);
        c.innerHTML += `<div class="timeline-item ${r.method}"><div class="flex justify-between"><span class="font-medium">${t?.name || '-'}</span><span class="text-emerald-400">${parseFloat(r.amount).toLocaleString()} ر.س</span></div><div class="text-xs text-gray-500 mt-1 flex justify-between"><span>${r.method === 'cash' ? 'كاش' : 'حوالة'} - ${formatDate(r.date)}</span><span>${r.ref || ''}</span></div></div>`;
    });
    if(!data.length) c.innerHTML = '<p class="text-gray-500 text-center p-4">لا يوجد سجل</p>';
}

// =====================
// Notifications & Utils
// =====================
function notify(type, pid) {
    const p = appData.payments.find(x => x.id === pid);
    const t = appData.tenants.find(x => x.id === p.tenantId);
    if(!t) return showToast('لا يوجد مستأجر', 'error');
    const msg = `مرحباً ${t.name}، تذكير بسداد الإيجار ${parseFloat(p.amount).toLocaleString()} ر.س بتاريخ ${formatDate(p.dueDate)}`;
    if(type === 'wa') {
        if(!t.phone) return showToast('لا يوجد رقم هاتف', 'error');
        window.open(`https://wa.me/${t.phone.replace(/\D/g,'')}?text=${encodeURIComponent(msg)}`, '_blank');
    } else {
        if(!t.email) return showToast('لا يوجد بريد', 'error');
        window.location.href = `mailto:${t.email}?subject=تذكير إيجار&body=${encodeURIComponent(msg)}`;
    }
    addLog(`إرسال تذكير ${type==='wa'?'واتساب':'إيميل'} لـ ${t.name}`);
}

function updateSelects() {
    const sels = [$('contractTenant'), $('paymentTenant'), $('tenantReportSelect')];
    sels.forEach(s => {
        if(!s) return;
        s.innerHTML = '<option value="">اختر المستأجر</option>';
        appData.tenants.forEach(t => s.innerHTML += `<option value="${t.id}">${t.name}</option>`);
    });
}

function del(type, id) {
    const msgs = { t: 'حذف المستأجر؟', c: 'حذف العقد؟', p: 'حذف الدفعة؟' };
    showConfirm(msgs[type], () => {
        if(type === 't') { appData.tenants = appData.tenants.filter(x => x.id !== id); appData.contracts = appData.contracts.filter(x => x.tenantId !== id); appData.payments = appData.payments.filter(x => x.tenantId !== id); }
        if(type === 'c') appData.contracts = appData.contracts.filter(x => x.id !== id);
        if(type === 'p') appData.payments = appData.payments.filter(x => x.id !== id);
        saveData(); initApp(); showToast('تم الحذف');
    });
}

function showConfirm(msg, cb) { $('confirmMessage').textContent = msg; $('confirmModal').classList.add('show'); confirmCallback = cb; }
function loadSettings() { $('maxLoginAttempts').value = appData.settings.maxLoginAttempts; $('notifyDays').value = appData.settings.notifyDays; $('ownerEmail').value = appData.settings.ownerEmail; $('ownerWhatsapp').value = appData.settings.ownerWhatsapp; $('emailjsServiceId').value = appData.settings.emailjsServiceId; $('emailjsTemplateId').value = appData.settings.emailjsTemplateId; $('emailjsPublicKey').value = appData.settings.emailjsPublicKey; $('notificationLang').value = appData.settings.notificationLang; }
function saveSettings() { appData.settings.maxLoginAttempts = parseInt($('maxLoginAttempts').value); appData.settings.notifyDays = parseInt($('notifyDays').value); appData.settings.ownerEmail = $('ownerEmail').value; appData.settings.ownerWhatsapp = $('ownerWhatsapp').value; appData.settings.emailjsServiceId = $('emailjsServiceId').value; appData.settings.emailjsTemplateId = $('emailjsTemplateId').value; appData.settings.emailjsPublicKey = $('emailjsPublicKey').value; appData.settings.notificationLang = $('notificationLang').value; if($('newPassword').value) appData.settings.password = $('newPassword').value; saveData(); showToast('تم الحفظ'); }
function printReport(type) { /* Basic implementation */ $('reportContent').innerHTML = `<h1>تقرير ${type}</h1><p>تم إنشاؤه بتاريخ ${new Date().toLocaleDateString('ar-SA')}</p><pre>${JSON.stringify(appData[type], null, 2)}</pre>`; $('reportPreview').classList.remove('hidden'); setTimeout(window.print, 300); }

// =====================
// Event Listeners
// =====================
document.addEventListener('DOMContentLoaded', () => {
    loadData();
    // Login
    $('loginForm').addEventListener('submit', handleLogin);
    $('logoutBtn').addEventListener('click', () => showConfirm('تسجيل الخروج؟', () => { $('mainApp').classList.add('hidden'); $('loginScreen').classList.remove('hidden'); $('loginForm').reset(); loginAttempts = 0; }));
    
    // Navigation
    $$('.nav-item').forEach(i => i.addEventListener('click', function() { navigateTo(this.dataset.page); }));
    $$('.nav-link').forEach(i => i.addEventListener('click', function() { navigateTo(this.dataset.target); }));
    $('menuToggle').addEventListener('click', () => $('sidebar').classList.toggle('open'));

    // Modals
    $$('.modal-close').forEach(b => b.addEventListener('click', () => $(b.dataset.modal).classList.remove('show')));
    $('confirmYesBtn').addEventListener('click', () => { if(confirmCallback) confirmCallback(); $('confirmModal').classList.remove('show'); });
    $('confirmNoBtn').addEventListener('click', () => $('confirmModal').classList.remove('show'));

    // Forms
    $('addTenantBtn').addEventListener('click', () => openTenantModal());
    $('tenantForm').addEventListener('submit', saveTenant);
    $('addContractBtn').addEventListener('click', () => openContractModal());
    $('contractForm').addEventListener('submit', saveContract);
    $('addPaymentBtn').addEventListener('click', () => openPaymentModal());
    $('paymentForm').addEventListener('submit', savePayment);

    // Process Payment
    $$('.payment-method-btn').forEach(b => b.addEventListener('click', function() { selectedPaymentMethod = this.dataset.method; $$('.payment-method-btn').forEach(x=>x.classList.remove('selected')); this.classList.add('selected'); $('transferDetails').classList.toggle('hidden', this.dataset.method !== 'transfer'); }));
    $('confirmPaymentBtn').addEventListener('click', confirmPay);
    $('cancelProcessPaymentBtn').addEventListener('click', () => $('processPaymentModal').classList.remove('show'));

    // History & Settings
    $('historyFilter').addEventListener('change', renderHistory);
    $('saveSettingsBtn').addEventListener('click', saveSettings);

    // Reports
    $$('.report-btn').forEach(b => b.addEventListener('click', () => printReport(b.dataset.type)));
    $('printTenantReportBtn').addEventListener('click', () => printReport('tenants')); // Simplified
    $('createBackupBtn').addEventListener('click', () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(appData, null, 2)])); a.download = 'backup.json'; a.click(); showToast('تم التصدير'); });
    $('restoreBackupBtn').addEventListener('click', () => $('backupFile').click());
    $('backupFile').addEventListener('change', e => { const r = new FileReader(); r.onload = ev => { try { appData = JSON.parse(ev.target.result); saveData(); initApp(); showToast('تم الاستعادة'); } catch { showToast('خطأ', 'error'); }}; r.readAsText(e.target.files[0]); });
});

// Global Aliases for inline events (kept minimal for simplicity)
window.editTenant = id => openTenantModal(id);
window.editContract = id => openContractModal(id);
window.editPayment = id => openPaymentModal(id);
window.del = del;
window.openPay = openPay;
window.notify = notify;