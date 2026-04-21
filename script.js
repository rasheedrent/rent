// =============================================
// نظام إدارة الإيجارات - نسخة الإنتاج النهائية
// =============================================

var appData = { users: [], contracts: [], notifications: [], settings: { notifyEmail: '', notifyDays: 7, emailJs: {} }, loginAttempts: 0, lockoutUntil: 0 };
var currentSession = null, sessionTimer = null, sessionSeconds = 1800;
var countdownInterval = null, autoCheckInterval = null;
var pendingPayment = null, notifiedPayments = {};

// =------------ الأمان =============
function hashPassword(pw) { var s = pw + '_rent_salt_2024', h = 0; for (var i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h = h & h; } var hex = ''; var sh = Math.abs(h); for (var j = 0; j < 8; j++) hex += ((sh >> (j * 4)) & 0xF).toString(16); var r = ''; var c = hex + btoa(s).replace(/=/g, '').substring(0, 16); for (var k = 0; k < c.length; k++) r += String.fromCharCode(c.charCodeAt(k) ^ (k * 7 + 3)); return btoa(r).replace(/=/g, ''); }
function generateId() { return Date.now().toString(36) + Math.random().toString(36).substr(2, 9); }

// =------------ الإشعارات =============
function requestNotifPermission() { if (!('Notification' in window)) return; Notification.requestPermission().then(perm => updateNotifPermUI(perm)); }
function updateNotifPermUI(perm) { var el = document.getElementById('notifPermStatus'); if (el) { el.textContent = perm === 'granted' ? 'مفعّلة' : 'غير مفعّلة'; el.style.color = perm === 'granted' ? 'var(--primary)' : 'var(--muted)'; } }
function sendBrowserNotif(t, b) { if (Notification.permission === 'granted') new Notification(t, { body: b, icon: '🏠' }); }

// =------------ EmailJS =============
function initEmailJS() { if (appData.settings.emailJs && appData.settings.emailJs.userId) try { emailjs.init(appData.settings.emailJs.userId); } catch (e) { } }
function sendAutoEmail(tenant, prop, amt, due) {
    var cfg = appData.settings.emailJs;
    if (!cfg.serviceId || !cfg.templateId || !cfg.ownerEmail) return;
    var arMsg = "تذكير بإيجار العقار: " + prop + "، المبلغ: " + formatCurrency(amt);
    var enMsg = "Rent Reminder for property: " + prop + ", Amount: " + formatCurrency(amt);
    var params = { to_email: cfg.ownerEmail, tenant_name: tenant, property: prop, amount: formatCurrency(amt), due_date: formatDate(due), message: arMsg + "\n\n" + enMsg };
    emailjs.send(cfg.serviceId, cfg.templateId, params).then(() => console.log('Email Sent')).catch(e => console.log('Email Error', e));
}

// =------------ البيانات =============
function generatePayments(c) {
    var pays = [], start = new Date(c.startDate), end = new Date(c.endDate);
    var freq = { monthly: 1, quarterly: 3, semiannual: 6, annual: 12 };
    var m = freq[c.frequency] || 1, now = new Date(), cur = new Date(start), idx = 0;
    while (cur < end) {
        var dd = new Date(cur), status = 'pending', pd = null, pm = null;
        if (dd <= now) { var diff = Math.floor((now - dd) / 86400000); status = diff > 5 ? 'overdue' : 'paid'; pd = status === 'paid' ? dd.toISOString().split('T')[0] : null; pm = status === 'paid' ? 'system' : null; }
        pays.push({ id: generateId(), index: idx, amount: c.amount, dueDate: dd.toISOString().split('T')[0], status, paidDate: pd, paymentMethod: pm, notified: false });
        cur.setMonth(cur.getMonth() + m); idx++;
    } return pays;
}

function initDefaultData() {
    var y = new Date().getFullYear();
    appData.users = [{ username: 'admin', passwordHash: hashPassword('admin123'), role: 'admin' }];
    appData.contracts = [
        { id: generateId(), tenantName: 'أحمد محمد', phone: '0501234567', email: 'a@a.com', property: 'الرياض - شقة', amount: 3000, frequency: 'monthly', startDate: y + '-01-01', endDate: (y + 1) + '-01-01', notes: '', status: 'active', payments: [] },
        { id: generateId(), tenantName: 'سارة خالد', phone: '0559876543', email: 's@b.com', property: 'جدة - فيلا', amount: 45000, frequency: 'quarterly', startDate: y + '-03-01', endDate: (y + 1) + '-03-01', notes: '', status: 'active', payments: [] }
    ];
    appData.contracts.forEach(c => c.payments = generatePayments(c));
    saveData();
}
function saveData() { try { localStorage.setItem('rentAppData', JSON.stringify(appData)); } catch (e) { } }
function loadData() { try { var d = localStorage.getItem('rentAppData'); if (d) { var p = JSON.parse(d); appData = { ...appData, ...p }; if (!appData.settings.emailJs) appData.settings.emailJs = {}; } else initDefaultData(); } catch (e) { initDefaultData(); } }

// =------------ تسجيل الدخول =============
function handleLogin() {
    var u = document.getElementById('loginUser').value.trim();
    var p = document.getElementById('loginPass').value;
    var err = document.getElementById('loginError');
    var lockMsg = document.getElementById('lockoutMsg');

    if (appData.lockoutUntil && Date.now() < appData.lockoutUntil) {
        var r = Math.ceil((appData.lockoutUntil - Date.now()) / 1000);
        err.textContent = 'مقفل. انتظر ' + r + ' ثانية'; err.style.display = 'block'; return;
    }
    err.style.display = 'none'; lockMsg.style.display = 'none';
    if (!u || !p) { err.textContent = 'أدخل البيانات'; err.style.display = 'block'; return; }

    var h = hashPassword(p), user = appData.users.find(x => x.username === u && x.passwordHash === h);

    if (user) {
        appData.loginAttempts = 0; appData.lockoutUntil = 0; saveData();
        currentSession = { username: user.username };
        sessionStorage.setItem('rentSession', JSON.stringify(currentSession));
        document.getElementById('loginUser').value = ''; document.getElementById('loginPass').value = '';
        showApp();
    } else {
        appData.loginAttempts++;
        if (appData.loginAttempts >= 5) {
            appData.lockoutUntil = Date.now() + 60000;
            err.textContent = 'تم القفل!'; lockMsg.textContent = 'انتظر دقيقة'; lockMsg.style.display = 'block';
        } else {
            err.textContent = 'خطأ! المتبقي: ' + (5 - appData.loginAttempts); err.style.display = 'block';
        } saveData();
    }
}

function handleLogout() { currentSession = null; sessionStorage.removeItem('rentSession'); clearInterval(sessionTimer); clearInterval(countdownInterval); clearInterval(autoCheckInterval); document.getElementById('app').style.display = 'none'; document.getElementById('loginScreen').style.display = 'flex'; }
function showApp() { document.getElementById('loginScreen').style.display = 'none'; document.getElementById('app').style.display = 'block'; document.getElementById('currentUserDisplay').textContent = currentSession.username; resetSessionTimer(); initEmailJS(); navigate('dashboard'); startTimers(); }

// =------------ مؤقتات =============
function resetSessionTimer() { sessionSeconds = 1800; clearInterval(sessionTimer); sessionTimer = setInterval(() => { sessionSeconds--; document.getElementById('sessionTimer').textContent = Math.floor(sessionSeconds / 60) + ':' + (sessionSeconds % 60).toString().padStart(2, '0'); if (sessionSeconds <= 0) handleLogout(); }, 1000); }
function startTimers() { startCountdown(); setInterval(() => checkAndNotify(true), 60000); setTimeout(() => checkAndNotify(), 500); }

// =------------ العداد =============
function startCountdown() { renderCountdown('dashCountdown', 4); renderCountdown('fullCountdown', null); setInterval(() => updateCountdown(), 1000); }
function updateCountdown() { document.querySelectorAll('.cc-num[data-type="s"]').forEach(el => { let due = el.closest('.countdown-card').dataset.due; if (!due) return; let diff = Math.abs(new Date(due) - new Date()); el.textContent = Math.floor((diff % 60000) / 1000); }); }
function renderCountdown(id, limit) {
    var container = document.getElementById(id); if (!container) return;
    var items = getAllPayments().filter(p => p.status !== 'paid').sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
    if (limit) items = items.slice(0, limit);
    if (items.length === 0) { container.innerHTML = '<div class="empty-state">لا توجد دفعات</div>'; return; }
    container.innerHTML = items.map(p => {
        let due = new Date(p.dueDate), now = new Date();
        let diff = Math.abs(due - now), days = Math.floor(diff / 86400000), hrs = Math.floor((diff % 86400000) / 3600000), min = Math.floor((diff % 3600000) / 60000), sec = Math.floor((diff % 60000) / 1000);
        let cls = p.status === 'overdue' ? 'overdue-card' : days <= 3 ? 'urgent' : '';
        return `<div class="countdown-card ${cls}" data-due="${p.dueDate}">
            <div class="cc-status">${p.status === 'overdue' ? 'متأخر' : days === 0 ? 'اليوم' : 'قادم'}</div>
            <div class="cc-top"><div><div class="cc-tenant">${p.tenantName}</div><div class="cc-property">${p.property}</div></div><div class="cc-amount">${formatCurrency(p.amount)}</div></div>
            <div class="cc-countdown"><div class="cc-unit"><span class="cc-num">${days}</span><span class="cc-label">ي</span></div><div class="cc-unit"><span class="cc-num">${hrs}</span><span class="cc-label">س</span></div><div class="cc-unit"><span class="cc-num">${min}</span><span class="cc-label">د</span></div><div class="cc-unit"><span class="cc-num" data-type="s">${sec}</span><span class="cc-label">ث</span></div></div>
            <div class="cc-actions no-print">
                <button class="btn btn-sm btn-primary" onclick="openPaymentModal('${p.contractId}',${p.index})"><i class="fas fa-check"></i> دفع</button>
                <button class="btn btn-sm btn-secondary" onclick="sendReminder('${p.contractId}')"><i class="fas fa-envelope"></i></button>
                <button class="btn btn-sm btn-whatsapp" onclick="sendWhatsAppReminder('${p.contractId}')"><i class="fab fa-whatsapp"></i></button>
            </div>
        </div>`;
    }).join('');
}

// =------------ التنقل =============
function navigate(v) {
    ['dashboard', 'contracts', 'payments', 'countdown', 'notifications', 'reports', 'settings'].forEach(id => document.getElementById(id + 'View').style.display = id === v ? 'block' : 'none');
    document.querySelectorAll('.nav-item').forEach(btn => btn.classList.toggle('active', btn.dataset.view === v));
    document.getElementById('pageTitle').textContent = { dashboard: 'الرئيسية', contracts: 'العقود', payments: 'المدفوعات', countdown: 'العداد', notifications: 'الإشعارات', reports: 'التقارير', settings: 'الإعدادات' }[v];
    closeSidebar();
    if (v === 'dashboard') renderDashboard(); else if (v === 'contracts') renderContracts(); else if (v === 'payments') renderPayments(); else if (v === 'reports') populateSelect();
}
document.querySelectorAll('.nav-item[data-view]').forEach(btn => btn.onclick = () => navigate(btn.dataset.view));
function toggleSidebar() { document.getElementById('sidebar').classList.toggle('open'); document.getElementById('sidebarOverlay').classList.toggle('show'); }
function closeSidebar() { document.getElementById('sidebar').classList.remove('open'); document.getElementById('sidebarOverlay').classList.remove('show'); }

// =------------ أدوات =============
function formatCurrency(n) { return n.toLocaleString('ar-SA') + ' ر.س'; }
function formatDate(d) { return new Date(d).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' }); }
function getAllPayments() { return appData.contracts.flatMap(c => c.payments.map(p => ({ ...p, contractId: c.id, tenantName: c.tenantName, property: c.property }))); }

// =------------ لوحة التحكم =============
function renderDashboard() {
    let p = getAllPayments(), now = new Date();
    document.getElementById('statsGrid').innerHTML = `
        <div class="stat-card"><div class="stat-icon" style="background:var(--primary-l);color:var(--primary)"><i class="fas fa-file"></i></div><div class="stat-info"><h3>${appData.contracts.length}</h3><span>عقود</span></div></div>
        <div class="stat-card"><div class="stat-icon" style="background:var(--accent-l);color:var(--accent)"><i class="fas fa-coins"></i></div><div class="stat-info"><h3>${formatCurrency(p.filter(x => x.status === 'paid' && new Date(x.paidDate).getMonth() === now.getMonth()).reduce((s, x) => s + x.amount, 0))}</h3><span>إيرادات الشهر</span></div></div>
        <div class="stat-card"><div class="stat-icon" style="background:var(--danger-l);color:var(--danger)"><i class="fas fa-exclamation"></i></div><div class="stat-info"><h3>${p.filter(x => x.status === 'overdue').length}</h3><span>متأخرات</span></div></div>
        <div class="stat-card"><div class="stat-icon" style="background:#3b82f620;color:#3b82f6"><i class="fas fa-clock"></i></div><div class="stat-info"><h3>${p.filter(x => x.status === 'pending').length}</h3><span>قادمة</span></div></div>
    `;
    renderCountdown('dashCountdown', 4);
}

// =------------ العقود =============
function renderContracts() {
    let s = (document.getElementById('contractSearch')?.value || '').toLowerCase();
    let data = appData.contracts.filter(c => c.tenantName.toLowerCase().includes(s) || c.property.toLowerCase().includes(s));
    document.getElementById('contractsTable').innerHTML = data.length ? data.map((c, i) => `<tr>
        <td>${i + 1}</td><td><strong>${c.tenantName}</strong><br><span style="font-size:11px;color:var(--muted)">${c.phone}</span></td>
        <td>${c.property}</td><td>${formatCurrency(c.amount)}</td><td>${{ monthly: 'شهري', quarterly: 'ربعي', annual: 'سنوي' }[c.frequency]}</td>
        <td>${formatDate(c.startDate)}</td><td>${formatDate(c.endDate)}</td>
        <td><span class="badge-status badge-${c.status === 'active' ? 'active' : 'expired'}">${c.status === 'active' ? 'نشط' : 'منتهي'}</span></td>
        <td class="no-print">
            <button class="btn btn-icon btn-secondary" onclick="editContract('${c.id}')"><i class="fas fa-edit"></i></button>
            <button class="btn btn-icon btn-danger" onclick="confirmDelete('${c.id}')"><i class="fas fa-trash"></i></button>
        </td>
    </tr>`).join('') : '<tr><td colspan="9" style="text-align:center">لا توجد بيانات</td></tr>';
}
function openContractModal() {
    document.getElementById('editContractId').value = '';
    document.getElementById('contractModalTitle').textContent = 'إضافة عقد جديد';
    ['cTenantName', 'cPhone', 'cEmail', 'cProperty', 'cAmount', 'cNotes'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('cFrequency').value = 'monthly';
    document.getElementById('cStartDate').value = ''; document.getElementById('cEndDate').value = '';
    document.getElementById('contractModal').classList.add('show');
}
function editContract(id) { let c = appData.contracts.find(x => x.id === id); if (!c) return; document.getElementById('editContractId').value = id; document.getElementById('contractModalTitle').textContent = 'تعديل'; document.getElementById('cTenantName').value = c.tenantName; document.getElementById('cPhone').value = c.phone; document.getElementById('cEmail').value = c.email; document.getElementById('cProperty').value = c.property; document.getElementById('cAmount').value = c.amount; document.getElementById('cFrequency').value = c.frequency; document.getElementById('cStartDate').value = c.startDate; document.getElementById('cEndDate').value = c.endDate; document.getElementById('cNotes').value = c.notes; document.getElementById('contractModal').classList.add('show'); }
function saveContract() {
    let id = document.getElementById('editContractId').value, obj = {
        tenantName: document.getElementById('cTenantName').value.trim(), phone: document.getElementById('cPhone').value.trim(), email: document.getElementById('cEmail').value.trim(),
        property: document.getElementById('cProperty').value.trim(), amount: parseFloat(document.getElementById('cAmount').value), frequency: document.getElementById('cFrequency').value,
        startDate: document.getElementById('cStartDate').value, endDate: document.getElementById('cEndDate').value, notes: document.getElementById('cNotes').value.trim()
    };
    if (!obj.tenantName || !obj.property || !obj.amount || !obj.startDate) { showToast('أكمل البيانات', 'error'); return; }
    if (id) { let idx = appData.contracts.findIndex(x => x.id === id); if (idx > -1) { appData.contracts[idx] = { ...appData.contracts[idx], ...obj, status: new Date(obj.endDate) > new Date() ? 'active' : 'expired' }; appData.contracts[idx].payments = generatePayments(appData.contracts[idx]); } }
    else { let nc = { ...obj, id: generateId(), status: 'active', payments: [] }; nc.payments = generatePayments(nc); appData.contracts.push(nc); }
    saveData(); closeModal('contractModal'); renderContracts(); showToast('تم الحفظ', 'success');
}
function confirmDelete(id) { document.getElementById('confirmDeleteBtn').onclick = () => { appData.contracts = appData.contracts.filter(x => x.id !== id); saveData(); closeModal('deleteModal'); renderContracts(); }; document.getElementById('deleteModal').classList.add('show'); }

// =------------ المدفوعات =============
function renderPayments() {
    let st = document.getElementById('payFilterStatus')?.value || 'all', src = document.getElementById('paySearch')?.value?.toLowerCase() || '';
    let data = getAllPayments().filter(p => (st === 'all' || p.status === st) && (p.tenantName.toLowerCase().includes(src) || p.property.toLowerCase().includes(src)));
    document.getElementById('paymentsTable').innerHTML = data.length ? data.map(p => `<tr>
        <td>${p.tenantName}</td><td>${p.property}</td><td>${formatCurrency(p.amount)}</td><td>${formatDate(p.dueDate)}</td>
        <td><span class="badge-status badge-${p.status}">${{ paid: 'مدفوع', pending: 'قادم', overdue: 'متأخر' }[p.status]}</span></td>
        <td>${p.paymentMethod ? { hawala: 'حوالة', cash: 'كاش', system: 'نظام' }[p.paymentMethod] : '—'}</td><td>${p.paidDate ? formatDate(p.paidDate) : '—'}</td>
        <td class="no-print">${p.status !== 'paid' ? `<button class="btn btn-sm btn-primary" onclick="openPaymentModal('${p.contractId}',${p.index})">تسجيل</button>` : '✓'}</td>
    </tr>`).join('') : '<tr><td colspan="8" style="text-align:center">لا توجد بيانات</td></tr>';
}

// =------------ نافذة الدفع (مصلحة) =============
function openPaymentModal(cid, idx) {
    pendingPayment = { cid, idx };
    document.getElementById('paymentModal').classList.add('show');
}
function confirmPaymentMethod(method) {
    if (!pendingPayment) return;
    let contract = appData.contracts.find(c => c.id === pendingPayment.cid);
    if (!contract) return;
    let payment = contract.payments.find(p => p.index === pendingPayment.idx);
    if (!payment) return;

    payment.status = 'paid';
    payment.paidDate = new Date().toISOString().split('T')[0];
    payment.paymentMethod = method;
    
    saveData();
    closeModal('paymentModal');
    showToast('تم تسجيل الدفع (' + (method === 'hawala' ? 'حوالة' : 'كاش') + ')', 'success');
    renderDashboard();
    renderPayments();
    startCountdown();
}

// =------------ الإشعارات =============
function checkAndNotify(silent) {
    let days = appData.settings.notifyDays || 7; now = new Date();
    getAllPayments().forEach(p => {
        if (p.status === 'pending') {
            let diff = Math.ceil((new Date(p.dueDate) - now) / 86400000);
            if (diff >= 0 && diff <= days && !p.notified) {
                appData.notifications.unshift({ id: generateId(), tenantName: p.tenantName, property: p.property, amount: p.amount, daysLeft: diff, read: false });
                let c = appData.contracts.find(x => x.id === p.contractId); if (c) { let pay = c.payments.find(x => x.id === p.id); if (pay) pay.notified = true; }
                if (diff <= 3) sendAutoEmail(p.tenantName, p.property, p.amount, p.dueDate);
            }
        }
    });
    saveData(); updateNotifBadge(); if (!silent) showToast('تم الفحص', 'info');
}
function renderNotifications() {
    let el = document.getElementById('notifList');
    el.innerHTML = appData.notifications.length ? appData.notifications.map(n => `<div class="notif-item" onclick="this.classList.add('read')">
        <div class="notif-text"><h4>${n.tenantName}</h4><p>${n.property} | ${formatCurrency(n.amount)} | متبقي ${n.daysLeft} يوم</p></div>
        <div class="actions-group no-print">
            <button class="btn btn-icon btn-sm btn-secondary" onclick="event.stopPropagation();sendEmailN('${n.id}')"><i class="fas fa-envelope"></i></button>
            <button class="btn btn-icon btn-sm btn-whatsapp" onclick="event.stopPropagation();sendWhatsAppN('${n.id}')"><i class="fab fa-whatsapp"></i></button>
        </div>
    </div>`).join('') : '<div class="empty-state">لا توجد إشعارات</div>';
    updateNotifBadge();
}
function updateNotifBadge() { let u = appData.notifications.filter(n => !n.read).length; let b = document.getElementById('notifCount'); b.style.display = u ? 'flex' : 'none'; b.textContent = u; }

// =------------ التواصل (ثنائي اللغة) =============
function sendReminder(cid) { let c = appData.contracts.find(x => x.id === cid); if (!c) return; window.open(`mailto:${c.email || ''}?subject=تذكير إيجار&body=${encodeURIComponent('سلام عليكم ' + c.tenantName + '، تذكير بإيجار ' + c.property + ' مبلغ ' + formatCurrency(c.amount))}`, '_blank'); }
function sendWhatsAppReminder(cid) {
    let c = appData.contracts.find(x => x.id === cid);
    if (!c) return;
    let ph = c.phone ? c.phone.replace(/^0/, '966') : '';
    if (!ph) { showToast('لا يوجد رقم جوال', 'error'); return; }
    
    // رسالة ثنائية اللغة
    var msgAr = 'السلام عليكم ' + c.tenantName + '،\nنود تذكيركم بسداد إيجار عقار: ' + c.property + '\nالمبلغ: ' + formatCurrency(c.amount) + '\nتاريخ الاستحقاق: ' + formatDate(c.dueDate);
    var msgEn = '\n\n--- English ---\nDear ' + c.tenantName + ',\nReminder for rent of: ' + c.property + '\nAmount: ' + formatCurrency(c.amount) + '\nDue Date: ' + formatDate(c.dueDate);
    
    window.open(`https://wa.me/${ph}?text=${encodeURIComponent(msgAr + msgEn)}`, '_blank');
}
function sendEmailN(id) { let n = appData.notifications.find(x => x.id === id); if (!n) return; window.open(`mailto:?subject=تذكير&body=${encodeURIComponent('تذكير لـ ' + n.tenantName + ' - ' + n.property)}`, '_blank'); }
function sendWhatsAppN(id) { let n = appData.notifications.find(x => x.id === id); if (!n) return; window.open(`https://wa.me/?text=${encodeURIComponent('تذكير لـ ' + n.tenantName + ' - ' + n.property)}`, '_blank'); }

// =------------ التقارير =============
function populateSelect() { let sel = document.getElementById('tenantReportSelect'); sel.innerHTML = '<option value="">اختر...</option>' + [...new Set(appData.contracts.map(c => c.tenantName))].map(n => `<option>${n}</option>`).join(''); }
function generateTenantStatement() {
    let name = document.getElementById('tenantReportSelect').value; if (!name) return;
    let data = getAllPayments().filter(p => p.tenantName === name);
    let total = data.reduce((s, p) => s + p.amount, 0);
    let paid = data.filter(p => p.status === 'paid').reduce((s, p) => s + p.amount, 0);
    document.getElementById('reportTitle').textContent = 'كشف حساب: ' + name;
    document.getElementById('reportContent').innerHTML = `
        <div style="margin-bottom:20px; padding:10px; background:#f0f0f0; color:#000; border-radius:8px; display:flex; justify-content:space-around" class="no-print">
            <div><strong>المستحق:</strong> ${formatCurrency(total)}</div><div><strong>المدفوع:</strong> ${formatCurrency(paid)}</div><div><strong>المتبقي:</strong> ${formatCurrency(total - paid)}</div>
        </div>
        <div class="table-wrapper"><table><thead><tr><th>التاريخ</th><th>المبلغ</th><th>الحالة</th><th>الطريقة</th></tr></thead><tbody>
        ${data.map(p => `<tr><td>${formatDate(p.dueDate)}</td><td>${formatCurrency(p.amount)}</td><td>${p.status === 'paid' ? 'مدفوع' : 'غير مدفوع'}</td><td>${p.paymentMethod || '—'}</td></tr>`).join('')}
        </tbody></table></div>`;
    document.getElementById('reportOutput').style.display = 'block';
}
function generateReport(type) {
    let title = '', content = '';
    if (type === 'contracts') { title = 'تقرير العقود'; content = `<table><thead><tr><th>#</th><th>المستأجر</th><th>العقار</th><th>المبلغ</th><th>الحالة</th></tr></thead><tbody>${appData.contracts.map((c, i) => `<tr><td>${i + 1}</td><td>${c.tenantName}</td><td>${c.property}</td><td>${formatCurrency(c.amount)}</td><td>${c.status}</td></tr>`).join('')}</tbody></table>`; }
    else if (type === 'payments') { title = 'تقرير المدفوعات'; let all = getAllPayments(); content = `<table><thead><tr><th>المستأجر</th><th>المبلغ</th><th>التاريخ</th><th>الحالة</th></tr></thead><tbody>${all.map(p => `<tr><td>${p.tenantName}</td><td>${formatCurrency(p.amount)}</td><td>${formatDate(p.dueDate)}</td><td>${p.status}</td></tr>`).join('')}</tbody></table>`; }
    else if (type === 'overdue') { title = 'المتأخرات'; let all = getAllPayments().filter(p => p.status === 'overdue'); content = `<table><thead><tr><th>المستأجر</th><th>المبلغ</th><th>تاريخ الاستحقاق</th></tr></thead><tbody>${all.map(p => `<tr><td>${p.tenantName}</td><td>${formatCurrency(p.amount)}</td><td>${formatDate(p.dueDate)}</td></tr>`).join('')}</tbody></table>`; }
    document.getElementById('reportTitle').textContent = title;
    document.getElementById('reportContent').innerHTML = content;
    document.getElementById('reportOutput').style.display = 'block';
}

// =------------ الإعدادات =============
function loadSettings() { document.getElementById('notifyDays').value = appData.settings.notifyDays || 7; document.getElementById('emailJsUserId').value = appData.settings.emailJs?.userId || ''; document.getElementById('emailJsServiceId').value = appData.settings.emailJs?.serviceId || ''; document.getElementById('emailJsTemplateId').value = appData.settings.emailJs?.templateId || ''; document.getElementById('ownerEmail').value = appData.settings.emailJs?.ownerEmail || ''; updateNotifPermUI(Notification.permission); }
function saveSettings() { appData.settings.notifyDays = parseInt(document.getElementById('notifyDays').value); saveData(); showToast('تم', 'success'); }
function saveEmailSettings() { appData.settings.emailJs = { userId: document.getElementById('emailJsUserId').value, serviceId: document.getElementById('emailJsServiceId').value, templateId: document.getElementById('emailJsTemplateId').value, ownerEmail: document.getElementById('ownerEmail').value }; saveData(); initEmailJS(); showToast('تم حفظ البريد', 'success'); }
function changePassword() { let o = document.getElementById('oldPass').value, n = document.getElementById('newPass').value, c = document.getElementById('confirmPass').value; let u = appData.users.find(x => x.username === currentSession.username); if (!u || u.passwordHash !== hashPassword(o)) return showToast('خطأ في الحالية', 'error'); if (n !== c) return showToast('غير متطابقة', 'error'); u.passwordHash = hashPassword(n); saveData(); showToast('تم التغيير', 'success'); }

// =------------ أدوات مساعدة =============
function closeModal(id) { document.getElementById(id).classList.remove('show'); }
function showToast(msg, type) { let c = document.getElementById('toastContainer'); let t = document.createElement('div'); t.className = 'toast toast-' + type; t.innerHTML = `<i class="fas fa-${type === 'success' ? 'check' : 'exclamation'}"></i> ${msg}`; c.appendChild(t); setTimeout(() => t.remove(), 3000); }

// =------------ النسخ الاحتياطي =============
function backupData() { let d = localStorage.getItem('rentAppData'); if (!d) return; let a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([d], { type: 'app/json' })); a.download = 'backup.json'; a.click(); }
function restoreData(e) { let f = e.target.files[0]; if (!f) return; let r = new FileReader(); r.onload = ev => { try { appData = JSON.parse(ev.target.result); saveData(); location.reload(); } catch (err) { showToast('خطأ في الملف', 'error'); } }; r.readAsText(f); }

// =------------ التشغيل =============
(function init() {
    loadData();
    let ss = sessionStorage.getItem('rentSession');
    if (ss) { currentSession = JSON.parse(ss); showApp(); }
    else { document.getElementById('loginScreen').style.display = 'flex'; }
})();