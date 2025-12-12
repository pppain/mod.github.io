/* script.js
   Güncelleme: admin tarafından chat banı özelliği eklendi (kullanıcılar yalnızca chat yazamaz / medya gönderemez),
   chat fotoğraf/video yükleme düzeltildi (Firebase Storage kullanımı),
   kullanıcı menüsüne boş href'li buton desteği eklendi.
   Tüm önceki özellikler korunmuştur.

   2025-12-03 - Yeni güncelleme:
   - Bakım / sunucu kapalı durumlarında tam ekran, görsel ağırlıklı ve güçlü bir overlay gösterme eklendi (xxx.png arkaplan).
   - Ana ekranda çapraz köşeye mini bir buton eklendi; tıklayınca hızlı tıklama/bet menüsü açılıyor.
   - Mevcut tüm fonksiyonellik korunmuş, yeni UI elemanları mevcut iş akışına entegre edilmiştir.
   - 2025-12-03+ : Kromatik (chromatic) parlayan isimler eklendi: siyah, mavi, yeşil, mor, kan-kırmızısı.
*/
// script.js - leaderboard + small UI helpers
// Assumes firebase has been initialized and `db` is available (see index.html).

(function(){
  // Safe references to DOM
  const topListEl = document.getElementById('leaderboardTop15');
  const highestListEl = document.getElementById('leaderboardHighestBalances');

  function formatCurrency(v){
    const n = Number(v) || 0;
    // Show with $ sign and two decimals
    return '$' + n.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2});
  }

  function createLeaderNode(rank, user){
    // user: { username, displayName, balance, avatarUrl }
    const li = document.createElement('li');
    li.className = 'leader-item';
    li.setAttribute('data-user-id', user.id || '');

    const left = document.createElement('div');
    left.className = 'leader-left';

    const avatar = document.createElement('div');
    avatar.className = 'leader-avatar';
    if (user.avatarUrl){
      avatar.style.backgroundImage = `url(${user.avatarUrl})`;
      avatar.style.backgroundSize = 'cover';
      avatar.style.backgroundPosition = 'center';
      avatar.textContent = '';
    } else {
      // fallback initials
      const name = user.displayName || user.username || 'U';
      avatar.textContent = (name[0] || 'U').toUpperCase();
    }

    const nameWrap = document.createElement('div');
    const nameEl = document.createElement('div');
    nameEl.className = 'leader-username';
    nameEl.textContent = user.displayName || user.username || 'Anon';

    const subEl = document.createElement('div');
    subEl.style.fontSize = '0.82rem';
    subEl.style.color = 'var(--text-muted)';
    subEl.textContent = user.username ? `@${user.username}` : '';

    nameWrap.appendChild(nameEl);
    nameWrap.appendChild(subEl);

    left.appendChild(avatar);
    left.appendChild(nameWrap);

    const balance = document.createElement('div');
    balance.className = 'leader-balance';
    balance.textContent = formatCurrency(user.balance);

    li.appendChild(left);
    li.appendChild(balance);

    // click => open user profile (if path exists), safe fallback to console
    li.addEventListener('click', () => {
      if (user.id) {
        // try to open internal profile route; adjust as needed
        if (window.openUserProfile) {
          window.openUserProfile(user.id);
        } else {
          // fallback: open new tab to /u/:id if exists
          const url = `/u/${user.id}`;
          window.location.href = url;
        }
      } else {
        console.log('Clicked leaderboard item for', user);
      }
    });

    return li;
  }

  function renderTopList(container, docs){
    if (!container) return;
    container.innerHTML = '';
    if (!docs || docs.length === 0){
      const p = document.createElement('p');
      p.style.color = 'var(--text-muted)';
      p.textContent = 'Henüz kullanıcı bulunamadı.';
      container.appendChild(p);
      return;
    }
    docs.forEach((doc, idx) => {
      const data = doc.data ? doc.data() : doc;
      const user = {
        id: doc.id || data.id,
        username: data.username || data.handle || data.email && data.email.split('@')[0],
        displayName: data.displayName || data.name || data.username,
        balance: Number(data.balance || data.coins || data.amount || 0),
        avatarUrl: data.avatarUrl || data.photoURL || ''
      };
      const node = createLeaderNode(idx+1, user);
      container.appendChild(node);
    });
  }

  // Real-time listener for top 15 balances
  function startTop15Listener(){
    if (!window.db || !db.collection) {
      console.warn('Firestore "db" not available yet.');
      return;
    }
    try {
      // We expect a "users" collection with a numeric "balance" field.
      db.collection('users').orderBy('balance','desc').limit(15)
        .onSnapshot(snapshot => {
          renderTopList(topListEl, snapshot.docs);
          // Also mirror to highest balances list (same data but different id)
          renderTopList(highestListEl, snapshot.docs);
        }, err => {
          console.error('Leaderboard snapshot error', err);
        });
    } catch (e){
      console.error('Error starting leaderboard listener', e);
    }
  }

  // If db is not ready yet, wait for auth/firebase to complete
  function waitForDbAndStart(timeout = 5000){
    if (window.db && typeof db.collection === 'function') {
      startTop15Listener();
      return;
    }
    // Poll a short time
    const start = Date.now();
    const iv = setInterval(() => {
      if (window.db && typeof db.collection === 'function'){
        clearInterval(iv);
        startTop15Listener();
        return;
      }
      if (Date.now() - start > timeout){
        clearInterval(iv);
        // Try once more using window.db (maybe it's defined slightly later)
        if (window.db && typeof db.collection === 'function') startTop15Listener();
        else console.warn('Firestore db not available after wait — leaderboard won\'t load automatically.');
      }
    }, 200);
  }

  // Start when DOM ready
  document.addEventListener('DOMContentLoaded', () => {
    waitForDbAndStart(8000);
  });

  // Export for debugging
  window._leaderboard = {
    start: startTop15Listener,
    renderTopList,
    formatCurrency
  };

})();
(function(){
  // ########################### SABİTLER ###########################
  const LOGGED_IN_KEY = 'bio_logged_in_user_v9';
  const ADMIN_LOGGED_IN_KEY = 'bio_admin_logged_in_v9';
  const PRICE = 0.10;
  const COOLDOWN_MS = 1500;
  const DEFAULT_MIN_WITHDRAWAL = 2500.00; // güncellendi: 2500$
  const DEFAULT_DAILY_CLICK_LIMIT = 100;
  const DEFAULT_DAILY_EARNINGS_LIMIT = 20.00;
  const ONLINE_THRESHOLD_MS = 90 * 1000; // son 90s içinde görünen => çevrimiçi

  // Firebase global (init in HTML)
  // Ensure storage variable exists safely (some pages may not include storage SDK)
  if (typeof storage === 'undefined') {
    try {
      // avoid redeclaring const/let in environments where storage is defined
      // use var to create in global scope if missing
      if (typeof firebase !== 'undefined' && firebase.storage) {
        var storage = firebase.storage();
      } else {
        var storage = null;
      }
    } catch (e) {
      var storage = null;
    }
  }

  // ########################### GENEL YARDIMCILAR ###########################
  async function hashPassword(pass) {
    const encoder = new TextEncoder();
    const data = encoder.encode(pass);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // --- Yeni yardımcı: chromatic renk çözümleyici ---
  // Accepts flashyColor tokens like 'chrom-blue' or hex/normal color.
  function parseFlashyColorToken(colorToken) {
    if (!colorToken || typeof colorToken !== 'string') return { isChromatic: false, cssColor: colorToken || '#00A3FF', chromaType: null };
    const t = colorToken.trim().toLowerCase();
    if (t.startsWith('chrom-')) {
      const chromaType = t.slice(6);
      // fallback base colors for non-visual css fallback
      const fallbackMap = {
        'black': '#0b0b0b',
        'blue': '#00A3FF',
        'green': '#00FF8C',
        'purple': '#9a59ff',
        'red': '#8B0000'
      };
      return { isChromatic: true, cssColor: fallbackMap[chromaType] || '#00A3FF', chromaType };
    }
    // not chromatic, treat as color hex or name
    return { isChromatic: false, cssColor: colorToken, chromaType: null };
  }

  async function getUsers() {
    try {
      const snapshot = await db.collection('users').get();
      const users = {};
      snapshot.forEach(doc => {
        users[doc.id] = doc.data();
      });
      Object.keys(users).forEach(k => {
        const u = users[k] || {};
        if (typeof u.role !== 'string') u.role = 'user';
        if (!Array.isArray(u.withdrawalRequests)) u.withdrawalRequests = [];
        if (!Array.isArray(u.betRequests)) u.betRequests = []; // new: bet requests
        u.balance = typeof u.balance === 'number' ? u.balance : 0;
        u.clicks = typeof u.clicks === 'number' ? u.clicks : 0;
        u.dailyClicks = typeof u.dailyClicks === 'number' ? u.dailyClicks : 0;
        u.dailyEarnings = typeof u.dailyEarnings === 'number' ? u.dailyEarnings : 0;
        if (!u.dailyDate) u.dailyDate = todayDateKey();
        if (typeof u.premium !== 'boolean') u.premium = false;
        if (typeof u.isBanned !== 'boolean') u.isBanned = false;
        if (typeof u.isChatBanned !== 'boolean') u.isChatBanned = false; // chat-ban flag
        if (typeof u.appliedCoupon !== 'string') u.appliedCoupon = '';
        if (!u.activeCoupon) u.activeCoupon = null;
        // new: persist appliedCouponPercent on user (helps show percent on withdraw requests)
        if (typeof u.appliedCouponPercent !== 'number') u.appliedCouponPercent = 0;
        if (typeof u.profileName !== 'string') u.profileName = u.username || '';
        if (typeof u.profileColor !== 'string') u.profileColor = '#00A3FF';
        if (typeof u.flashyName !== 'string') u.flashyName = '';
        if (typeof u.flashyColor !== 'string') u.flashyColor = '';
        if (typeof u.flashyAnimated !== 'boolean') u.flashyAnimated = false;
        if (typeof u.lastSeen !== 'number') u.lastSeen = 0;
      });
      return users;
    } catch (e) {
      console.error("Kullanıcı verisi yüklenirken hata oluştu:", e);
      return {};
    }
  }

  async function saveUser(username, userData) {
    try {
      await db.collection('users').doc(username).set(userData);
    } catch (e) {
      console.error("Kullanıcı kaydedilirken hata:", e);
    }
  }

  async function getLoggedInUser() {
    const username = localStorage.getItem(LOGGED_IN_KEY);
    if (!username) return null;
    try {
      const userDoc = await db.collection('users').doc(username).get();
      if (!userDoc.exists) return null;
      const ud = userDoc.data();
      // Ensure username exists on object for later usage
      if (!ud.username) ud.username = username;
      if (typeof ud.profileName !== 'string') ud.profileName = username;
      if (typeof ud.profileColor !== 'string') ud.profileColor = '#00A3FF';
      if (typeof ud.flashyName !== 'string') ud.flashyName = '';
      if (typeof ud.flashyColor !== 'string') ud.flashyColor = '';
      if (typeof ud.flashyAnimated !== 'boolean') ud.flashyAnimated = false;
      if (typeof ud.lastSeen !== 'number') ud.lastSeen = 0;
      if (typeof ud.appliedCouponPercent !== 'number') ud.appliedCouponPercent = 0;
      if (!Array.isArray(ud.betRequests)) ud.betRequests = [];
      if (typeof ud.isChatBanned !== 'boolean') ud.isChatBanned = false;
      return ud;
    } catch (e) {
      console.error('getLoggedInUser hata:', e);
      return null;
    }
  }

  function setLoggedInUser(user) {
      localStorage.setItem(LOGGED_IN_KEY, user ? (user.username || '') : '');
  }

  async function getSettings() {
    try {
      const doc = await db.collection('meta').doc('settings').get();
      if (!doc.exists) {
        const defaults = {
          dailyClickLimit: DEFAULT_DAILY_CLICK_LIMIT,
          dailyEarningsLimit: DEFAULT_DAILY_EARNINGS_LIMIT,
          minWithdrawalAmount: DEFAULT_MIN_WITHDRAWAL,
          coupons: [],
          maintenance: { enabled: false, reason: '', since: null, scheduledAt: null },
          announcements: [],
          server: { closed: false, reason: '', since: null, scheduledAt: null } // server control
        };
        await saveSettings(defaults);
        return defaults;
      }
      let parsed = doc.data();
      if (typeof parsed.dailyClickLimit !== 'number') parsed.dailyClickLimit = DEFAULT_DAILY_CLICK_LIMIT;
      if (typeof parsed.dailyEarningsLimit !== 'number') parsed.dailyEarningsLimit = DEFAULT_DAILY_EARNINGS_LIMIT;
      if (typeof parsed.minWithdrawalAmount !== 'number') parsed.minWithdrawalAmount = DEFAULT_MIN_WITHDRAWAL;
      if (!Array.isArray(parsed.coupons)) parsed.coupons = [];
      if (!parsed.maintenance) parsed.maintenance = { enabled: false, reason: '', since: null, scheduledAt: null };
      if (!Array.isArray(parsed.announcements)) parsed.announcements = [];
      if (!parsed.server) parsed.server = { closed: false, reason: '', since: null, scheduledAt: null };
      return parsed;
    } catch (e) {
      console.error("Ayarlar yüklenirken hata:", e);
      return {
        dailyClickLimit: DEFAULT_DAILY_CLICK_LIMIT,
        dailyEarningsLimit: DEFAULT_DAILY_EARNINGS_LIMIT,
        minWithdrawalAmount: DEFAULT_MIN_WITHDRAWAL,
        coupons: [],
        maintenance: { enabled: false, reason: '', since: null, scheduledAt: null },
        announcements: [],
        server: { closed: false, reason: '', since: null, scheduledAt: null }
      };
    }
  }

  async function saveSettings(s) {
    try { await db.collection('meta').doc('settings').set(s); } catch (e) { console.error("Ayarlar kaydedilirken hata:", e); }
  }

  async function getDefaultDailyClickLimit() {
    try {
      const s = await getSettings();
      return typeof s.dailyClickLimit === 'number' ? s.dailyClickLimit : DEFAULT_DAILY_CLICK_LIMIT;
    } catch (e) {
      return DEFAULT_DAILY_CLICK_LIMIT;
    }
  }
  async function getDefaultDailyEarningsLimit() {
    try {
      const s = await getSettings();
      return typeof s.dailyEarningsLimit === 'number' ? s.dailyEarningsLimit : DEFAULT_DAILY_EARNINGS_LIMIT;
    } catch (e) {
      return DEFAULT_DAILY_EARNINGS_LIMIT;
    }
  }
  async function getMinWithdrawalAmount() {
    try {
      const s = await getSettings();
      return typeof s.minWithdrawalAmount === 'number' ? s.minWithdrawalAmount : DEFAULT_MIN_WITHDRAWAL;
    } catch (e) {
      return DEFAULT_MIN_WITHDRAWAL;
    }
  }
  async function getMaintenanceInfo() {
    try {
      const s = await getSettings();
      // If a scheduledAt is set and the time is reached, enable maintenance automatically.
      if (s.maintenance && s.maintenance.scheduledAt) {
        try {
          const scheduled = Number(s.maintenance.scheduledAt);
          if (!isNaN(scheduled) && scheduled <= Date.now()) {
            s.maintenance.enabled = true;
            s.maintenance.since = s.maintenance.scheduledAt;
            s.maintenance.scheduledAt = null;
            await saveSettings(s);
          }
        } catch(e){}
      }
      // If server scheduledAt is set and the time is reached, apply server closed
      if (s.server && s.server.scheduledAt) {
        try {
          const scheduled = Number(s.server.scheduledAt);
          if (!isNaN(scheduled) && scheduled <= Date.now()) {
            s.server.closed = true;
            s.server.since = s.server.scheduledAt;
            s.server.scheduledAt = null;
            await saveSettings(s);
          }
        } catch(e){}
      }
      return s.maintenance || { enabled: false, reason: '', since: null, scheduledAt: null };
    } catch (e) {
      return { enabled: false, reason: '', since: null, scheduledAt: null };
    }
  }

  function formatMoney(n){ return '$' + Number(n || 0).toFixed(2); }
  function pulse(el){ if (!el || !el.animate) return; el.animate([{ transform:'scale(1)' },{ transform:'scale(1.07)', opacity:0.95 },{ transform:'scale(1)' }],{ duration:260, easing:'cubic-bezier(.2,.8,.2,1)' }); }

  function todayDateKey(){ return new Date().toISOString().slice(0,10); }

  const IBAN_REGEX = /^[A-Z]{2}\d{2}[A-Z0-9]{1,30}$/i;
  const TR_IBAN_REGEX = /^TR\d{24}$/i;
  function normalizeIban(raw){ return raw ? raw.replace(/\s+/g, '').toUpperCase() : ''; }
  function prettyIban(raw){
    const s = normalizeIban(raw);
    if (s.length === 0) return '';
    let formatted = s.match(/.{1,4}/g).join(' ');
    return formatted.trim();
  }
  function ibanMod97(iban) {
    const rearranged = iban.slice(4) + iban.slice(0,4);
    let expanded = '';
    for (let i=0;i<rearranged.length;i++){
      const ch = rearranged[i];
      if (ch >= 'A' && ch <= 'Z') {
        expanded += (ch.charCodeAt(0) - 55).toString();
      } else {
        expanded += ch;
      }
    }
    let remainder = 0;
    let str = expanded;
    while (str.length) {
      const piece = (remainder.toString() + str.slice(0, 9));
      remainder = parseInt(piece, 10) % 97;
      str = str.slice(9);
    }
    return remainder === 1;
  }
  function validateIban(raw){
    const n = normalizeIban(raw);
    if (!n) return false;
    if (n.startsWith('TR')) {
        if (!TR_IBAN_REGEX.test(n)) return false;
        if (n.length !== 26) return false;
        try { return ibanMod97(n); } catch(e) { return false; }
    }
    if (!IBAN_REGEX.test(n) || n.length < 15 || n.length > 34) return false;
    try { return ibanMod97(n); } catch(e) { return false; }
  }

  async function getAnnouncements(){ const s = await getSettings(); return Array.isArray(s.announcements) ? s.announcements : []; }
  async function saveAnnouncements(arr){ const s = await getSettings(); s.announcements = arr; await saveSettings(s); }
  function generateId(prefix=''){ return prefix + Date.now().toString(36) + Math.random().toString(36).substring(2,8); }

  // localUserKey fixed: do not call async getLoggedInUser here
  function localUserKey() {
    const username = localStorage.getItem(LOGGED_IN_KEY);
    if (username) return username;
    let deviceId = localStorage.getItem('bio_device_id_v1');
    if (!deviceId) { deviceId = 'dev_' + generateId(); localStorage.setItem('bio_device_id_v1', deviceId); }
    return deviceId;
  }

  // Improved findCoupon: case-insensitive and always returns coupon object from fresh settings
  async function findCoupon(code){
    if (!code) return null;
    const s = await getSettings();
    if (!Array.isArray(s.coupons)) return null;
    const upper = code.toString().trim().toUpperCase();
    return s.coupons.find(c => (c.code || '').toString().toUpperCase() === upper) || null;
  }
  function isCouponValid(coupon){
    if (!coupon) return false;
    if (coupon.uses !== null && typeof coupon.uses === 'number' && coupon.uses <= 0) return false;
    return true;
  }

  function showToast(message, isSuccess = true, timeout = 3800) {
    const toastContainer = document.getElementById('toastContainer');
    if (!toastContainer) return;
    const t = document.createElement('div');
    t.className = 'toast ' + (isSuccess ? 'success' : 'error');
    t.innerHTML = `<div style="font-size:1.2rem">${isSuccess ? '✅' : '⚠️'}</div><div style="flex:1">${message}</div>`;
    toastContainer.appendChild(t);
    setTimeout(() => {
      t.style.transition = 'opacity .25s, transform .25s';
      t.style.opacity = '0';
      t.style.transform = 'translateY(10px)';
      setTimeout(() => t.remove(), 300);
    }, timeout);
  }

  function ensureUserFields(user) {
    if (!user) return;
    if (typeof user.role !== 'string') user.role = 'user';
    if (typeof user.appliedCoupon !== 'string') user.appliedCoupon = '';
    if (!user.withdrawalRequests) user.withdrawalRequests = [];
    if (!user.betRequests) user.betRequests = [];
    if (typeof user.activeCoupon === 'undefined') user.activeCoupon = null;
    if (typeof user.appliedCouponPercent !== 'number') user.appliedCouponPercent = 0;
    if (typeof user.profileName !== 'string') user.profileName = user.username || '';
    if (typeof user.profileColor !== 'string') user.profileColor = '#00A3FF';
    if (typeof user.flashyName !== 'string') user.flashyName = '';
    if (typeof user.flashyColor !== 'string') user.flashyColor = '';
    if (typeof user.flashyAnimated !== 'boolean') user.flashyAnimated = false;
    if (typeof user.lastSeen !== 'number') user.lastSeen = 0;
    if (typeof user.isChatBanned !== 'boolean') user.isChatBanned = false;
  }
  function ensureDailyFields(user) {
    if (!user) return;
    if (!user.dailyDate) user.dailyDate = todayDateKey();
    if (typeof user.dailyClicks !== 'number') user.dailyClicks = 0;
    if (typeof user.dailyEarnings !== 'number') user.dailyEarnings = 0;
    if (typeof user.premium !== 'boolean') user.premium = false;
  }
  async function resetDailyIfNeeded(user) {
    if (!user) return;
    ensureDailyFields(user);
    const today = todayDateKey();
    if (user.dailyDate !== today) {
      user.dailyDate = today;
      user.dailyClicks = 0;
      user.dailyEarnings = 0;
      await saveUser(user.username, user);
    }
  }
  function calculateMoney(user){ return Number(user.balance || 0); }

  function clearExpiredUserCoupon(user) {
    if (!user || !user.activeCoupon) return;
    if (user.activeCoupon.expiresAt && user.activeCoupon.expiresAt <= Date.now()) {
      saveUserSpecificData('activeCoupon', null);
    }
  }

  async function saveUserSpecificData(key, value) {
      const user = await getLoggedInUser();
      if (!user) return;
      user[key] = value;
      await saveUser(user.username, user);
  }

  // Presence heartbeat to show online users
  let presenceInterval = null;
  async function markPresence(username) {
    if (!username) return;
    try {
      const docRef = db.collection('users').doc(username);
      await docRef.update({ lastSeen: Date.now() }).catch(async () => {
        await docRef.set({ lastSeen: Date.now() }, { merge: true });
      });
    } catch (e) { console.warn('presence error', e); }
  }
  function startPresence(username) {
    if (!username) return;
    if (presenceInterval) clearInterval(presenceInterval);
    markPresence(username);
    presenceInterval = setInterval(() => markPresence(username), 20000);
    window.addEventListener('beforeunload', () => {
      try { db.collection('users').doc(username).update({ lastSeen: Date.now() }); } catch(e){}
    });
  }

  // Announcement animation: full screen attention overlay
  function showAnnouncementAnimation(title, message, durationMs = 1600) {
    try {
      const container = document.getElementById('announceAnimContainer');
      if (!container) return;
      const wrapper = document.createElement('div');
      wrapper.className = 'announce-anim show';
      wrapper.innerHTML = `<div class="announce-anim-inner" role="dialog" aria-live="assertive" aria-atomic="true" style="padding:18px 22px; text-align:center;">
        <h2 style="margin:0; font-size:1.8rem; font-weight:900;">${escapeHtml(title)}</h2>
        <p style="margin:8px 0 0 0; font-size:1rem;">${escapeHtml(message)}</p>
      </div>`;
      container.appendChild(wrapper);
      setTimeout(() => {
        wrapper.classList.remove('show');
        wrapper.classList.add('hide');
        setTimeout(() => wrapper.remove(), 600);
      }, durationMs);
    } catch (e) { console.warn('announceAnim error', e); }
  }
  window.showAnnouncementAnimation = showAnnouncementAnimation;

  // ------------------ Chat (improved: support flashy RGB/rainbow & media & chromatic) -------------------
  let chatUnsubscribe = null;

  // helper: find user by display name if raw lookup failed
  function findUserByDisplayNameOrFlashy(rawName, usersMap) {
    if (!rawName || !usersMap) return null;
    const keys = Object.keys(usersMap);
    rawName = (rawName || '').toString();
    for (const k of keys) {
      const u = usersMap[k] || {};
      if ((u.profileName && u.profileName === rawName) || (u.flashyName && u.flashyName === rawName)) return u;
    }
    return null;
  }

  async function initChat(userObj) {
    const chatMessages = document.getElementById('chatMessages');
    const chatInput = document.getElementById('chatInput') || document.getElementById('chatMessage');
    const chatSendBtn = document.getElementById('chatSendBtn') || document.getElementById('sendChatBtn');

    if (!chatMessages || !chatInput || !chatSendBtn) return;

    if (chatUnsubscribe) {
      try { chatUnsubscribe(); } catch(e){}
    }

    chatUnsubscribe = db.collection('chat')
      .orderBy('timestamp', 'asc')
      .limitToLast(400)
      .onSnapshot(async (snapshot) => {
        chatMessages.innerHTML = '';
        const usersMap = await getUsers(); // map by username
        snapshot.forEach(doc => {
          const msg = doc.data() || {};
          const rawUsername = msg.user || msg.username || 'Anon';
          const text = msg.text || msg.message || '';
          const ts = msg.timestamp && msg.timestamp.toDate ? msg.timestamp.toDate() : (msg.timestamp ? new Date(msg.timestamp) : null);
          // try lookup by raw username (username key), else attempt to find by display name or flashyName
          let u = usersMap[rawUsername] || findUserByDisplayNameOrFlashy(rawUsername, usersMap);
          // Sometimes chat docs carry username as profileName; if msg.user exists, prefer that mapping
          if (!u && msg.user) u = usersMap[msg.user] || null;

          // fallback to empty object
          u = u || {};

          const displayName = (u.flashyName && u.flashyName.length) ? u.flashyName : (msg.username || u.profileName || rawUsername);

          // parse flashy color tokens (including new 'chrom-...' values)
          const parsed = parseFlashyColorToken((u.flashyColor && u.flashyColor.length) ? u.flashyColor : (msg.usernameColor || u.profileColor || '#00A3FF'));
          const color = parsed.cssColor;
          const isChromatic = parsed.isChromatic;
          const chromaType = parsed.chromaType;

          const isMe = (userObj && (rawUsername === userObj.username || displayName === (userObj.profileName || userObj.username)));
          const div = document.createElement('div');
          div.className = 'chat-message' + (isMe ? ' me' : '');

          if (isChromatic) {
            // Chromatic (kromatik) special handling: add classes and animated gradient styles via CSS
            let inner = `<span class="username chromatic chrom-${escapeHtml(chromaType)}">${escapeHtml(displayName)}:</span> ${escapeHtml(text)}`;
            if (msg.mediaUrl) {
              if ((msg.mediaType || '').startsWith('image')) {
                inner += `<div class="chat-media" style="margin-top:8px;"><img src="${escapeHtml(msg.mediaUrl)}" alt="image" /></div>`;
              } else if ((msg.mediaType || '').startsWith('video')) {
                inner += `<div class="chat-media" style="margin-top:8px;"><video controls src="${escapeHtml(msg.mediaUrl)}"></video></div>`;
              } else {
                inner += `<div class="chat-media" style="margin-top:8px;"><a href="${escapeHtml(msg.mediaUrl)}" target="_blank" rel="noopener">Medya</a></div>`;
              }
            }
            inner += ts ? ` <span class="msg-time">${ts.toLocaleTimeString()}</span>` : '';
            div.innerHTML = inner;
            if (u.flashyAnimated) {
              div.classList.add('glow','chromatic');
              // set a CSS var fallback color to maintain glow intensity
              div.style.setProperty('--glow-color', color);
            }
          } else if (u.flashyColor === 'rgb' || (u.flashyColor && u.flashyColor.toLowerCase() === 'rgb')) {
            // rainbow animated text (legacy 'rgb' token)
            let inner = `<span class="username rainbow-text">${escapeHtml(displayName)}:</span> ${escapeHtml(text)}`;
            if (msg.mediaUrl) {
              if ((msg.mediaType || '').startsWith('image')) {
                inner += `<div class="chat-media" style="margin-top:8px;"><img src="${escapeHtml(msg.mediaUrl)}" alt="image" /></div>`;
              } else if ((msg.mediaType || '').startsWith('video')) {
                inner += `<div class="chat-media" style="margin-top:8px;"><video controls src="${escapeHtml(msg.mediaUrl)}"></video></div>`;
              } else {
                inner += `<div class="chat-media" style="margin-top:8px;"><a href="${escapeHtml(msg.mediaUrl)}" target="_blank" rel="noopener">Medya</a></div>`;
              }
            }
            inner += ts ? ` <span class="msg-time">${ts.toLocaleTimeString()}</span>` : '';
            div.innerHTML = inner;
          } else {
            // regular colored name (may be animated glow)
            const safeColor = escapeHtml(color);
            const nameStyle = `color:${safeColor}; font-weight:800;`;
            let inner = `<span class="username" style="${nameStyle}">${escapeHtml(displayName)}:</span> ${escapeHtml(text)}`;
            if (msg.mediaUrl) {
              if ((msg.mediaType || '').startsWith('image')) {
                inner += `<div class="chat-media" style="margin-top:8px;"><img src="${escapeHtml(msg.mediaUrl)}" alt="image" /></div>`;
              } else if ((msg.mediaType || '').startsWith('video')) {
                inner += `<div class="chat-media" style="margin-top:8px;"><video controls src="${escapeHtml(msg.mediaUrl)}"></video></div>`;
              } else {
                inner += `<div class="chat-media" style="margin-top:8px;"><a href="${escapeHtml(msg.mediaUrl)}" target="_blank" rel="noopener">Medya</a></div>`;
              }
            }
            inner += ts ? ` <span class="msg-time">${ts.toLocaleTimeString()}</span>` : '';
            div.innerHTML = inner;
            if (u.flashyAnimated) {
              div.classList.add('glow');
              div.style.setProperty('--glow-color', color);
            }
          }

          chatMessages.appendChild(div);
        });
        chatMessages.scrollTop = chatMessages.scrollHeight;
      });

    const sendMessage = () => {
      const text = (chatInput.value || '').trim();
      if (userObj && userObj.isChatBanned) {
        showToast('Sohbete yazma izniniz engellendi.', false);
        return;
      }
      if (!text || !userObj) return;
      const payload = {
        username: userObj.profileName || userObj.username,
        usernameColor: userObj.profileColor || '#00A3FF',
        text: text,
        user: userObj.username,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
      };
      db.collection('chat').add(payload).catch(err => console.error('chat send error', err));
      chatInput.value = '';
    };

    // remove previous listeners safely
    chatSendBtn.removeEventListener('click', sendMessage);
    chatSendBtn.addEventListener('click', sendMessage);
    chatInput.removeEventListener('keypress', handleKey);
    function handleKey(e){ if (e.key === 'Enter') sendMessage(); }
    chatInput.addEventListener('keypress', handleKey);
  }

  // -------------- Yeni: Fullscreen maintenance overlay ve diagonal mini buton + hızlı tıklama menüsü --------------
  // Not: Mevcut yapı bozulmasın diye DOM elementleri varsa kullanılır, yoksa dinamik eklenir.

  // Show or hide full-screen maintenance overlay based on settings
  async function updateFullScreenMaintenance() {
    try {
      const s = await getSettings();
      const overlay = ensureFullScreenOverlay();
      const diagBtn = ensureDiagMiniBtn();
      // If server closed or maintenance enabled => show overlay prominently
      const showForMaintenance = !!(s.maintenance && s.maintenance.enabled);
      const showForServerClosed = !!(s.server && s.server.closed);
      if (showForMaintenance || showForServerClosed) {
        const info = showForMaintenance ? s.maintenance : s.server;
        const title = showForServerClosed ? 'SUNUCU KAPALI' : 'SİSTEM BAKIMDA';
        const message = (info && info.reason) ? info.reason : (showForServerClosed ? 'Sunucu şu anda kapalı. Lütfen daha sonra tekrar deneyin.' : 'Sistem üzerinde bakım çalışması yapılıyor. Bir süre sonra tekrardan deneyiniz.');
        overlay.querySelector('.fsm-title').textContent = title;
        overlay.querySelector('.fsm-msg').textContent = message;
        // set since text
        overlay.querySelector('.fsm-meta').textContent = info && info.since ? `Başlangıç: ${new Date(info.since).toLocaleString()}` : '';
        overlay.classList.add('show');
        // also make maintenanceBanner visible (existing UI) and keep them consistent
        const maintenanceBanner = document.getElementById('maintenanceBanner');
        if (maintenanceBanner) {
          maintenanceBanner.style.display = 'flex';
          // enhance banner with icon when showing
          const mr = maintenanceBanner.querySelector('.maintenance-reason');
          if (mr) mr.style.fontWeight = '900';
        }
        // show diagonal mini button but disable quick menu actions (if server closed force disabled)
        if (diagBtn) {
          diagBtn.style.display = 'block';
          if (showForServerClosed) {
            diagBtn.classList.add('disabled');
            diagBtn.title = 'Sunucu kapalı - eylemler devre dışı';
          } else {
            diagBtn.classList.remove('disabled');
            diagBtn.title = 'Hızlı tıklama menüsünü aç';
          }
        }
      } else {
        overlay.classList.remove('show');
        const maintenanceBanner = document.getElementById('maintenanceBanner');
        if (maintenanceBanner) maintenanceBanner.style.display = 'none';
        if (diagBtn) diagBtn.style.display = 'none';
        // ensure quick menu closed
        const q = document.getElementById('quickClickMenu');
        if (q) q.classList.remove('open');
      }
    } catch (e) {
      console.warn('updateFullScreenMaintenance error', e);
    }
  }

  // Ensure overlay element exists in DOM and return it
  function ensureFullScreenOverlay() {
    let overlay = document.getElementById('fullScreenMaintOverlay');
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'fullScreenMaintOverlay';
    overlay.className = 'fullscreen-maintenance-overlay';
    overlay.innerHTML = `
      <div class="fsm-inner" role="dialog" aria-live="assertive" aria-atomic="true">
        <div class="fsm-content">
          <div class="fsm-left">
            <div style="display:flex; align-items:center; gap:14px;">
              <div style="width:68px;height:68px;border-radius:14px;background:linear-gradient(90deg,#ff9a00,#ffd400);display:flex;align-items:center;justify-content:center;color:#021122;font-weight:900;font-size:2.2rem;">🔧</div>
              <div>
                <h1 class="fsm-title">SİSTEM BAKIMDA</h1>
                <div class="fsm-meta" style="margin-top:6px;color:var(--text-muted);font-size:0.95rem;"></div>
              </div>
            </div>
            <p class="fsm-msg" style="margin-top:12px;">Sistem bakımı nedeniyle kısıtlı. Geri dönüşte size haber verilecektir.</p>
            <div style="margin-top:18px; display:flex; gap:8px;">
              <button id="fsmContactBtn" class="fsm-cta">Destek İletişim</button>
              <button id="fsmCloseBtn" class="fsm-close" aria-hidden="true">Kapat</button>
              <button id="fsmMoreBtn" class="fsm-close" aria-hidden="true" title="Detaylı Durum">Detay</button>
            </div>
          </div>
          <div class="fsm-right" aria-hidden="true">
            <!-- görsel arka plan için xxx.png kullanılıyor -->
            <div class="fsm-visual" style="background-image:url('xxx.png');"></div>
          </div>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    // Hook buttons
    const c = document.getElementById('fsmContactBtn');
    if (c) c.addEventListener('click', () => showToast('Lütfen yönetici ile iletişime geçin.', true, 5000));
    const close = document.getElementById('fsmCloseBtn');
    if (close) close.addEventListener('click', () => { overlay.classList.remove('show'); });
    const more = document.getElementById('fsmMoreBtn');
    if (more) more.addEventListener('click', async () => {
      const s = await getSettings();
      const info = (s.maintenance && s.maintenance.enabled) ? s.maintenance : s.server;
      showAnnouncementAnimation(info && info.reason ? (info.reason) : 'Durum bilgisi yok', 'Bu bildiri daha ayrıntılı durumu gösterir.', 2400);
    });

    return overlay;
  }

  // Ensure diagonal mini button exists
  function ensureDiagMiniBtn() {
    let btn = document.getElementById('diagMiniBtn');
    if (btn) return btn;
    btn = document.createElement('button');
    btn.id = 'diagMiniBtn';
    btn.className = 'diag-mini-btn';
    btn.title = 'Hızlı tıklamalar';
    btn.innerHTML = `<span class="diag-ico">⚡</span>`;
    document.body.appendChild(btn);
    // quick menu container
    const menu = document.createElement('div');
    menu.id = 'quickClickMenu';
    menu.className = 'quick-click-menu';
    menu.innerHTML = `
      <div class="qcm-inner">
        <button id="qcmClickBtn" class="qcm-action">Tıkla ve Kazan</button>
        <div style="display:flex; gap:8px; margin-top:8px;">
          <button id="qcmOddBtn" class="qcm-action qcm-small">TEK</button>
          <button id="qcmEvenBtn" class="qcm-action qcm-small">ÇİFT</button>
        </div>
      </div>`;
    document.body.appendChild(menu);

    // Toggle behavior
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (btn.classList.contains('disabled')) {
        showToast('Bu işlem şu anda devre dışı.', false);
        return;
      }
      menu.classList.toggle('open');
      // position menu near button (already styled via CSS), but ensure menu closed on outside click
      setTimeout(() => {
        document.addEventListener('click', handleOutsideQuickMenu, { once: true });
      }, 30);
    });

    function handleOutsideQuickMenu(ev) {
      const target = ev.target;
      if (!menu.contains(target) && target !== btn) {
        menu.classList.remove('open');
      }
    }

    // Hook quick menu buttons to actual actions (if available)
    menu.querySelector('#qcmClickBtn').addEventListener('click', async () => {
      const mainClick = document.getElementById('clickBtn');
      if (mainClick && !mainClick.disabled) mainClick.click();
      else showToast('Tıklama şu anda mümkün değil.', false);
    });
    menu.querySelector('#qcmOddBtn').addEventListener('click', async () => {
      const odd = document.getElementById('betOddBtn');
      const stake = document.getElementById('betAmountInput');
      if (stake && (!stake.value || Number(stake.value) <= 0)) {
        // try set default
        stake.value = Math.max(1, Number(stake.value) || 10);
      }
      if (odd) odd.click();
    });
    menu.querySelector('#qcmEvenBtn').addEventListener('click', async () => {
      const even = document.getElementById('betEvenBtn');
      const stake = document.getElementById('betAmountInput');
      if (stake && (!stake.value || Number(stake.value) <= 0)) {
        stake.value = Math.max(1, Number(stake.value) || 10);
      }
      if (even) even.click();
    });

    return btn;
  }

  // -------------- End: Fullscreen maintenance + quick menu --------------

  function todayKey(){ return todayDateKey(); }

  // ... (the rest of the original code continues unchanged) ...
  // For readability we keep the original functions below exactly as before but we also call updateFullScreenMaintenance at key points.

  async function initApp(){
    const mainContent = document.getElementById('mainContent');
    const authView = document.getElementById('authView');

    const clickBtn = document.getElementById('clickBtn');
    const cooldownText = document.getElementById('cooldownText');
    const displayName = document.getElementById('displayName');
    const avatar = document.getElementById('avatar');
    const logoutBtn = document.getElementById('logoutBtn');
    const logoutUsername = document.getElementById('logoutUsername');
    const clickFill = document.getElementById('clickFill');
    const earnFill = document.getElementById('earnFill');
    const clickRemainText = document.getElementById('clickRemainText');
    const earnRemainText = document.getElementById('earnRemainText');
    const profilePremiumBadge = document.getElementById('profilePremiumBadge');
    const activeCouponArea = document.getElementById('activeCouponArea');

    const authForm = document.getElementById('authForm');
    const authUsernameInput = document.getElementById('authUsername');
    const authPasswordInput = document.getElementById('authPassword');
    const authMessage = document.getElementById('authMessage');

    const maintenanceBanner = document.getElementById('maintenanceBanner');
    const maintenanceReasonText = document.getElementById('maintenanceReasonText');
    const maintenanceSinceText = document.getElementById('maintenanceSinceText');

    const announcementBanner = document.getElementById('announcementBanner');
    const announcementTitleText = document.getElementById('announcementTitleText');
    const announcementMsgText = document.getElementById('announcementMsgText');

    const firstname = document.getElementById('firstname');
    const lastname = document.getElementById('lastname');
    const bankSelect = document.getElementById('bankSelect');
    const ibanInput = document.getElementById('ibanInput');
    const ibanInvalid = document.getElementById('ibanInvalid');
    const clearIban = document.getElementById('clearIban');
    const couponInput = document.getElementById('couponInput');
    const applyCouponBtn = document.getElementById('applyCouponBtn');
    const couponInfo = document.getElementById('couponInfo');
    const withdrawBtn = document.getElementById('withdrawBtn');
    const minWithdrawalText = document.getElementById('minWithdrawalText');

    const successOverlay = document.getElementById('successOverlay');
    const successDetails = document.getElementById('successDetails');

    // Profile modal elements
    const profileEditBtn = document.getElementById('profileEditBtn');
    const profileModal = document.getElementById('profileModal');
    const profileNameInput = document.getElementById('profileNameInput');
    const profileColorInputs = document.getElementsByName('profileColor');
    const saveProfileBtn = document.getElementById('saveProfileBtn');
    const closeProfileBtn = document.getElementById('closeProfileBtn');

    // Chat toggles
    const chatCloseBtn = document.getElementById('chatClose');
    const chatOpenBtn = document.getElementById('chatOpenBtn');
    const chatWidget = document.getElementById('chatMessages') ? document.getElementById('chatMessages').parentElement : null;
    const chatFileInput = document.getElementById('chatFileInput');

    // Tek/Çift elements
    const betAmountInput = document.getElementById('betAmountInput');
    const betOddBtn = document.getElementById('betOddBtn');
    const betEvenBtn = document.getElementById('betEvenBtn');

    let isAuthModeLogin = true;
    let cooldownTimer = null;
    let user = await getLoggedInUser();
    let isCooldown = false;
    let prevAnnouncementId = null;

    // Ban overlay element reference
    let banOverlayEl = null;

    window.switchAuthMode = () => {
      isAuthModeLogin = !isAuthModeLogin;
      const authTitle = document.getElementById('authTitle');
      const authSubmitBtn = document.getElementById('authSubmitBtn');
      const switchText = document.getElementById('switchText');
      authTitle.textContent = isAuthModeLogin ? 'Kullanıcı Girişi' : 'Kullanıcı Kayıt';
      authSubmitBtn.textContent = isAuthModeLogin ? 'Giriş Yap' : 'Kayıt Ol';
      switchText.innerHTML = isAuthModeLogin ? 'Hesabınız yok mu? <button type="button" onclick="window.switchAuthMode()" style="background:none;border:none;color:var(--accent-primary);cursor:pointer;">Kayıt Ol</button>' : 'Hesabınız var mı? <button type="button" onclick="window.switchAuthMode()" style="background:none;border:none;color:var(--accent-primary);cursor:pointer;">Giriş Yap</button>';
    };

    function createBanOverlay(reason, by, at) {
      const overlay = document.createElement('div');
      overlay.id = 'banOverlay';
      overlay.style.position = 'fixed';
      overlay.style.left = '0';
      overlay.style.top = '0';
      overlay.style.right = '0';
      overlay.style.bottom = '0';
      overlay.style.display = 'flex';
      overlay.style.justifyContent = 'center';
      overlay.style.alignItems = 'center';
      overlay.style.zIndex = '6000';
      overlay.style.background = 'linear-gradient(180deg, rgba(8,10,14,0.96), rgba(2,6,12,0.98))';
      overlay.style.backdropFilter = 'blur(4px)';
      overlay.innerHTML = `
        <div style="text-align:center; max-width:860px; margin: 0 20px; padding:28px; border-radius:14px; border:1px solid rgba(255,255,255,0.04); animation: banPop .7s cubic-bezier(.2,.9,.3,1);">
          <div style="font-size:4.6rem; color:var(--accent-danger); margin-bottom:8px;">⛔</div>
          <h2 style="margin:0; font-size:2.0rem; color:var(--text-high); font-weight:900;">HESABINIZ ASKIYA ALINDI</h2>
          <p style="margin-top:10px; color:var(--text-muted); font-size:1rem; line-height:1.4;">${escapeHtml(reason || 'Yönetici tarafından bir işlem nedeniyle kısıtlandı.')}</p>
          <div style="margin-top:12px; color:var(--text-muted); font-size:0.9rem;">Yetkili: ${escapeHtml(by || 'admin')} • ${at ? new Date(at).toLocaleString() : ''}</div>
          <div style="margin-top:18px;">
            <button id="banOverlayContact" style="padding:10px 14px; border-radius:8px; border:none; background:var(--accent-primary); color:#021122;">Destek ile İletişime Geç</button>
          </div>
        </div>
      `;
      return overlay;
    }

    function showBanOverlayUI(banInfo) {
      removeBanOverlayUI();
      banOverlayEl = createBanOverlay(banInfo?.reason, banInfo?.by, banInfo?.at);
      document.body.appendChild(banOverlayEl);
      // disable interactive controls
      if (clickBtn) clickBtn.disabled = true;
      if (withdrawBtn) withdrawBtn.disabled = true;
      const chatInput = document.getElementById('chatInput');
      if (chatInput) chatInput.disabled = true;
      const chatSend = document.getElementById('chatSendBtn');
      if (chatSend) chatSend.disabled = true;
      const fileInput = document.getElementById('chatFileInput');
      if (fileInput) fileInput.disabled = true;
      // hook contact button to maybe open support or show toast
      const contact = document.getElementById('banOverlayContact');
      if (contact) contact.onclick = () => { showToast('Lütfen yönetici ile iletişime geçin.', false); };
    }

    function removeBanOverlayUI() {
      const existing = document.getElementById('banOverlay');
      if (existing) existing.remove();
      banOverlayEl = null;
      // re-enable clickable items if user exists and not banned
      if (user && !user.isBanned) {
        if (clickBtn) clickBtn.disabled = false;
        if (withdrawBtn) withdrawBtn.disabled = user.balance < (getMinWithdrawalAmount || DEFAULT_MIN_WITHDRAWAL);
        const chatInput = document.getElementById('chatInput');
        if (chatInput) chatInput.disabled = false;
        const chatSend = document.getElementById('chatSendBtn');
        if (chatSend) chatSend.disabled = false;
        const fileInput = document.getElementById('chatFileInput');
        if (fileInput) fileInput.disabled = !!(user.isChatBanned);
      }
    }

    async function loadUser() {
      user = await getLoggedInUser();
      if (user) {
        ensureUserFields(user);
        ensureDailyFields(user);
        await resetDailyIfNeeded(user);
        clearExpiredUserCoupon(user);
        await updateUI();
        mainContent.style.display = 'grid';
        authView.style.display = 'none';
        startPresence(user.username);
        try { await initChat(user); } catch(e){ console.warn('initChat failed', e); }
      } else {
        mainContent.style.display = 'none';
        authView.style.display = 'block';
      }
      renderOnlineUsers(); // refresh online users list
    }

    async function updateUI() {
      if (!user) return;
      const display = (user.flashyName && user.flashyName.length) ? user.flashyName : (user.profileName || user.username);
      displayName.textContent = display;
      const initials = (display.split(' ').map(s => s[0] || '').join('').slice(0,2)).toUpperCase();
      avatar.textContent = initials || (user.username.slice(0,2)).toUpperCase();
      try {
        const rawColor = (user.flashyColor && user.flashyColor.length) ? user.flashyColor : (user.profileColor || '#00A3FF');
        const parsed = parseFlashyColorToken(rawColor);
        const c = parsed.cssColor;
        const isChromatic = parsed.isChromatic;
        const chromaType = parsed.chromaType;

        // reset classes
        avatar.classList.remove('glow-avatar');
        avatar.classList.remove('chromatic','chrom-black','chrom-blue','chrom-green','chrom-purple','chrom-red');

        if (isChromatic) {
          avatar.classList.add('chromatic', `chrom-${chromaType}`);
          avatar.style.removeProperty('background');
          avatar.style.removeProperty('border');
          // set fallback variable for glow
          avatar.style.setProperty('--glow-color', c);
          avatar.classList.add('chromatic');
        } else {
          avatar.style.background = `linear-gradient(135deg, ${c}22, ${c}10)`;
          avatar.style.border = `1px solid ${c}33`;
        }

        if (user.flashyColor === 'rgb' || user.flashyAnimated) {
          avatar.classList.add('glow-avatar');
          avatar.style.setProperty('--glow-color', (user.flashyColor === 'rgb' ? '#FFD400' : c));
        } else {
          if (!isChromatic) {
            avatar.classList.remove('glow-avatar');
            avatar.style.removeProperty('--glow-color');
          }
        }
      } catch(e){}
      logoutUsername.textContent = user.username;
      const clickCountEl = document.getElementById('clickCount');
      const moneyEl = document.getElementById('moneyEarned');
      clickCountEl.textContent = user.clicks;
      moneyEl.textContent = formatMoney(user.balance);
      profilePremiumBadge.style.display = user.premium ? 'inline-block' : 'none';

      const clickLimit = await getDefaultDailyClickLimit();
      const earnLimit = await getDefaultDailyEarningsLimit();

      const clickPercent = Math.min((user.dailyClicks || 0) / clickLimit * 100, 100);
      const earnPercent = Math.min((user.dailyEarnings || 0) / earnLimit * 100, 100);

      if (clickFill) clickFill.style.width = `${isFinite(clickPercent) ? clickPercent : 0}%`;
      if (earnFill) earnFill.style.width = `${isFinite(earnPercent) ? earnPercent : 0}%`;

      clickRemainText.textContent = `${user.dailyClicks}/${user.premium ? '∞' : clickLimit}`;
      earnRemainText.textContent = `${formatMoney(user.dailyEarnings)}/${user.premium ? '∞' : formatMoney(earnLimit)}`;

      const s = await getSettings();
      if (s.server && s.server.closed) {
        // show server closed banner on top as announcement-like
        const reason = s.server.reason || 'Sunucu kapalı.';
        const since = s.server.since ? `Başlangıç: ${new Date(s.server.since).toLocaleString()}` : '';
        const banner = document.getElementById('announcementBanner');
        if (banner) {
          banner.style.display = 'flex';
          announcementTitleText.innerText = 'SUNUCU KAPALI';
          announcementMsgText.innerText = `${reason} ${since}`;
        }
      }

      const min = await getMinWithdrawalAmount();
      if (withdrawBtn) withdrawBtn.disabled = user.balance < min || (await isServerClosed());
      if (withdrawBtn) withdrawBtn.textContent = `${formatMoney(user.balance)} Çekim Talep Et`;
      if (minWithdrawalText) minWithdrawalText.textContent = formatMoney(min);

      if (user.activeCoupon) {
        activeCouponArea.innerHTML = `<span class="badge coupon-active-badge">Aktif Bonus: ${user.activeCoupon.multiplier}x (${Math.max(0, Math.floor((user.activeCoupon.expiresAt - Date.now()) / 1000))}s kalan)</span>`;
      } else if (user.appliedCoupon) {
        // if a balance coupon was applied earlier, show it in UI with percent
        activeCouponArea.innerHTML = `<span class="badge coupon-active-badge">Uygulanan Kupon: ${escapeHtml(user.appliedCoupon)} ${user.appliedCouponPercent>0?`(+${user.appliedCouponPercent}%)`:''}</span>`;
      } else {
        activeCouponArea.innerHTML = '';
      }

      // Check ban state and show overlay if needed
      if (user.isBanned) {
        const info = user.banInfo || {};
        showBanOverlayUI(info);
      } else {
        removeBanOverlayUI();
      }

      // Also ensure chat file input disabled state if user is chat-banned
      const fileInput = document.getElementById('chatFileInput');
      if (fileInput) fileInput.disabled = !!(user.isChatBanned);

      // Update full-screen maintenance overlay visibility using current settings
      try { updateFullScreenMaintenance(); } catch(e){}
    }

    async function isServerClosed() {
      const s = await getSettings();
      return !!(s.server && s.server.closed);
    }

    async function handleClick() {
      const maint = await getMaintenanceInfo();
      const s = await getSettings();
      if (s.server && s.server.closed) { showToast('Sunucu kapalı — tıklamalar devre dışı.', false); return; }
      if (maint.enabled) { showToast('Şu anda bakım var — tıklamalar devre dışı.', false); return; }
      if (isCooldown || !user || user.isBanned) return;
      const limits = await getUserLimits(user);
      if (!limits.isUnlimited && (user.dailyClicks >= limits.clickLimit || user.dailyEarnings >= limits.earnLimit)) {
        showToast('Günlük limit aşıldı.', false);
        return;
      }
      isCooldown = true;
      if (clickBtn) clickBtn.disabled = true;
      if (cooldownText) cooldownText.style.display = 'inline';
      let earn = PRICE;
      if (user.activeCoupon && user.activeCoupon.type === 'click_bonus' && user.activeCoupon.expiresAt > Date.now()) {
        earn *= user.activeCoupon.multiplier;
      }
      user.clicks += 1;
      user.dailyClicks += 1;
      user.balance += earn;
      user.dailyEarnings += earn;
      pulse(clickBtn);
      await saveUser(user.username, user);
      await updateUI();
      cooldownTimer = setTimeout(() => {
        isCooldown = false;
        if (clickBtn) clickBtn.disabled = false;
        if (cooldownText) cooldownText.style.display = 'none';
      }, COOLDOWN_MS);
    }

    if (clickBtn) clickBtn.addEventListener('click', handleClick);

    // helper: getUserLimits considering premium
    async function getUserLimits(u) {
      const clickLimit = await getDefaultDailyClickLimit();
      const earnLimit = await getDefaultDailyEarningsLimit();
      return {
        isUnlimited: !!u.premium,
        clickLimit,
        earnLimit
      };
    }

    if (authForm) authForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = authUsernameInput.value.trim().toLowerCase();
      const password = authPasswordInput.value;
      if (!username || !password) { authMessage.style.display = 'block'; authMessage.textContent = 'Tüm alanlar zorunlu.'; return; }
      const hashedPass = await hashPassword(password);
      // login or signup depending on current auth mode (reliable)
      const isLogin = !!isAuthModeLogin;
      if (isLogin) {
        const userDoc = await db.collection('users').doc(username).get();
        if (!userDoc.exists || userDoc.data().hashedPassword !== hashedPass) {
          authMessage.style.display = 'block';
          authMessage.textContent = 'Yanlış kullanıcı adı veya şifre.';
          return;
        }
        setLoggedInUser({username});
        await loadUser();
      } else {
        const userDoc = await db.collection('users').doc(username).get();
        if (userDoc.exists) {
          authMessage.style.display = 'block';
          authMessage.textContent = 'Kullanıcı adı zaten alınmış.';
          return;
        }
        const newUser = {
          username,
          hashedPassword: hashedPass,
          balance: 0,
          clicks: 0,
          dailyClicks: 0,
          dailyEarnings: 0,
          dailyDate: todayDateKey(),
          premium: false,
          isBanned: false,
          isChatBanned: false,
          role: 'user',
          appliedCoupon: '',
          appliedCouponPercent: 0,
          withdrawalRequests: [],
          betRequests: [],
          activeCoupon: null,
          profileName: username,
          profileColor: '#FFD400',
          flashyName: '',
          flashyColor: '',
          flashyAnimated: false,
          lastSeen: Date.now()
        };
        await saveUser(username, newUser);
        setLoggedInUser(newUser);
        await loadUser();
      }
    });

    if (logoutBtn) logoutBtn.addEventListener('click', async () => {
      localStorage.removeItem(LOGGED_IN_KEY);
      if (chatUnsubscribe) try { chatUnsubscribe(); } catch(e){}
      if (presenceInterval) clearInterval(presenceInterval);
      await loadUser();
    });

    if (clearIban) {
      clearIban.addEventListener('click', () => {
        ibanInput.value = '';
        ibanInvalid.style.display = 'none';
      });
    }

    if (ibanInput) {
      ibanInput.addEventListener('input', () => {
        const valid = validateIban(ibanInput.value);
        ibanInvalid.style.display = valid ? 'none' : 'block';
        ibanInvalid.textContent = valid ? '' : 'Geçersiz IBAN formatı.';
      });
    }

    // Chat file upload handling (uses Firebase Storage if available)
    if (chatFileInput) {
      chatFileInput.addEventListener('change', async (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        // refresh current user
        user = await getLoggedInUser();
        if (!user) { showToast('Önce giriş yapın', false); chatFileInput.value = ''; return; }
        if (user.isChatBanned) { showToast('Sohbete yazma/medya yükleme izniniz engellendi.', false); chatFileInput.value = ''; return; }
        if (!storage) {
          showToast('Dosya yükleme yapılamıyor (storage yapılandırılmamış).', false);
          chatFileInput.value = '';
          return;
        }
        try {
          showToast('Medya yükleniyor...', true, 10000);
          const path = `chat_media/${Date.now()}_${(file.name || 'upload').replace(/[^\w.\-]/g,'_')}`;
          const ref = storage.ref().child(path);
          const uploadTask = ref.put(file);
          uploadTask.on('state_changed', snapshot => {
            // optional: could show progress
          }, err => {
            console.error('upload error', err);
            showToast('Yükleme başarısız: ' + (err.message || err), false);
            chatFileInput.value = '';
          }, async () => {
            const url = await uploadTask.snapshot.ref.getDownloadURL();
            const type = (file.type || '').split('/')[0];
            await db.collection('chat').add({
              username: user.profileName || user.username,
              usernameColor: user.profileColor || '#00A3FF',
              text: '',
              mediaUrl: url,
              mediaType: file.type || (type === 'image' ? 'image/*' : 'file'),
              user: user.username,
              timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
            showToast('Medya gönderildi.', true);
            chatFileInput.value = '';
          });
        } catch (err) {
          console.error('chat file send error', err);
          showToast('Medya gönderilemedi.', false);
          chatFileInput.value = '';
        }
      });
      // Add drag & drop support for mobile/desktop (progressive)
      const chatCard = document.getElementById('publicChatCard');
      if (chatCard) {
        ['dragenter','dragover'].forEach(evt => {
          chatCard.addEventListener(evt, (e) => { e.preventDefault(); chatCard.classList.add('dragover'); }, false);
        });
        ['dragleave','drop'].forEach(evt => {
          chatCard.addEventListener(evt, (e) => { e.preventDefault(); chatCard.classList.remove('dragover'); }, false);
        });
        chatCard.addEventListener('drop', (e) => {
          const dt = e.dataTransfer;
          if (dt && dt.files && dt.files[0]) {
            const f = dt.files[0];
            // set file input and trigger change
            try {
              const dataTransfer = new DataTransfer();
              dataTransfer.items.add(f);
              chatFileInput.files = dataTransfer.files;
              const ev = new Event('change', { bubbles: true });
              chatFileInput.dispatchEvent(ev);
            } catch (err) {
              console.warn('drop to input failed', err);
            }
          }
        });
      }
    }

    if (withdrawBtn) withdrawBtn.addEventListener('click', async () => {
      // withdraw handler (checks server closed)
      const s = await getSettings();
      if (s.server && s.server.closed) { showToast('Sunucu kapalı — çekimler devre dışı.', false); return; }
      // rest handled in handleWithdraw function
      await handleWithdrawInternal();
    });

    async function handleWithdrawInternal() {
      if (!user) { showToast('Giriş yapın', false); return; }
      const amount = user.balance;
      const s = await getSettings();
      const min = s.minWithdrawalAmount || DEFAULT_MIN_WITHDRAWAL;
      if (amount < min) { showToast('Yeterli bakiye yok.', false); return; }
      const first = firstname.value.trim();
      const last = lastname.value.trim();
      const bank = bankSelect.value;
      const iban = normalizeIban(ibanInput.value);
      if (!first || !last || !bank || !validateIban(iban)) {
        showToast('Tüm çekim bilgileri zorunlu ve IBAN geçerli olmalı.', false);
        return;
      }
      // Determine coupon bonus percent for this withdraw:
      let couponBonusPercent = 0;
      // If user has an active balance coupon applied earlier, use its percent stored on user
      if (user.appliedCoupon && typeof user.appliedCouponPercent === 'number' && user.appliedCouponPercent > 0) {
        couponBonusPercent = user.appliedCouponPercent;
      } else {
        // Fallback: try to find coupon object by applied code (in case percent wasn't stored)
        if (user.appliedCoupon) {
          const cp = await findCoupon(user.appliedCoupon);
          if (cp && cp.type === 'balance') couponBonusPercent = cp.percent || 0;
        }
      }

      const id = generateId('req_');
      const req = {
        id,
        username: user.username,
        amount,
        originalBalance: amount,
        bank,
        iban,
        firstName: first,
        lastName: last,
        createdAt: new Date().toISOString(),
        status: 'pending',
        couponApplied: user.appliedCoupon || '',
        couponBonusPercent: couponBonusPercent
      };
      user.withdrawalRequests.push(req);
      user.balance = 0;
      // Clear applied coupon after withdraw so it isn't reused accidentally
      user.appliedCoupon = '';
      user.appliedCouponPercent = 0;
      await saveUser(user.username, user);
      successDetails.innerHTML = `ID: ${id}<br>Kullanıcı: ${user.username}<br>Tutar: ${formatMoney(amount)}${couponBonusPercent>0?` (+${couponBonusPercent}% kupon)`:''}<br>Banka: ${bank}<br>IBAN: ${prettyIban(iban)}<br>Tarih: ${new Date().toLocaleString()}`;
      successOverlay.style.display = 'flex';
      await updateUI();
    }

    window.closeSuccessOverlay = () => { successOverlay.style.display = 'none'; };

    // Improved applyCoupon: load latest settings, validate and atomically decrement usage in settings
    async function applyCoupon() {
      const codeRaw = (couponInput.value || '').trim();
      const code = codeRaw.toUpperCase();
      if (!code) { couponInfo.textContent = 'Kupon kodu boş.'; return; }
      // fetch latest settings (we'll update settings if needed)
      const s = await getSettings();
      if (!Array.isArray(s.coupons) || s.coupons.length === 0) {
        couponInfo.textContent = 'Kupon bulunamadı.'; return;
      }
      const idx = s.coupons.findIndex(c => (c.code || '').toString().toUpperCase() === code);
      if (idx === -1) { couponInfo.textContent = 'Geçersiz kupon.'; return; }
      const coupon = s.coupons[idx];

      // validate uses
      if (coupon.uses !== null && typeof coupon.uses === 'number' && coupon.uses <= 0) {
        couponInfo.textContent = 'Kupon kullanım hakkı dolmuş.'; return;
      }

      // Refresh current user data (in case it changed)
      user = await getLoggedInUser();
      if (!user) { couponInfo.textContent = 'Giriş yapın.'; return; }
      ensureUserFields(user);

      try {
        if (coupon.type === 'balance') {
          // persist coupon on user so withdraw uses it and also apply immediate bonus to current balance (if any)
          const pct = Number(coupon.percent) || 0;
          user.appliedCoupon = code;
          user.appliedCouponPercent = pct;
          if (pct > 0 && user.balance > 0) {
            // give immediate bonus to current balance (UX-friendly)
            const bonus = user.balance * (pct / 100);
            user.balance += bonus;
          }
        } else if (coupon.type === 'click_bonus') {
          const multiplier = Number(coupon.multiplier) || 1;
          const durationSeconds = parseInt(coupon.durationSeconds || 0, 10) || 0;
          if (multiplier <= 1 || durationSeconds <= 0) {
            couponInfo.textContent = 'Geçersiz tıklama bonusu ayarları.'; return;
          }
          user.activeCoupon = {
            type: 'click_bonus',
            multiplier: multiplier,
            expiresAt: Date.now() + durationSeconds * 1000,
            originCode: code
          };
        } else {
          couponInfo.textContent = 'Bilinmeyen kupon tipi.'; return;
        }

        // decrement uses in settings if applicable and persist settings
        if (coupon.uses !== null && typeof coupon.uses === 'number') {
          s.coupons[idx].uses = Math.max(0, coupon.uses - 1);
        }
        await saveSettings(s);

        // save user
        await saveUser(user.username, user);
        await updateUI();
        couponInfo.textContent = 'Kupon uygulandı!';
        couponInput.value = '';
        showToast('Kupon başarıyla uygulandı.', true);
      } catch (err) {
        console.error('applyCoupon error', err);
        couponInfo.textContent = 'Kupon uygulanırken hata oluştu.';
      }
    }

    if (applyCouponBtn) applyCouponBtn.addEventListener('click', applyCoupon);

    async function renderMaintenanceBanner() {
      const maint = await getMaintenanceInfo();
      if (maint.enabled) {
        if (maintenanceReasonText) maintenanceReasonText.textContent = maint.reason || 'Bakım devam ediyor.';
        if (maintenanceSinceText) maintenanceSinceText.textContent = maint.since ? `Başlangıç: ${new Date(maint.since).toLocaleString()}` : '';
        if (maintenanceBanner) maintenanceBanner.style.display = 'block';
      } else {
        if (maintenanceBanner) maintenanceBanner.style.display = 'none';
      }
      // Update the powerful overlay too
      try { updateFullScreenMaintenance(); } catch(e){}
    }

    if (document.getElementById('closeMaintBannerBtn')) document.getElementById('closeMaintBannerBtn').addEventListener('click', () => maintenanceBanner.style.display = 'none');

    async function renderAnnouncementsInApp() {
      const anns = await getAnnouncements();
      const visibleAnns = anns.filter(a => a.visible && (!a.expiresAt || a.expiresAt > Date.now()));
      if (visibleAnns.length > 0) {
        const newActive = visibleAnns[0];
        if (announcementBanner) {
          announcementBanner.style.display = 'flex';
          const stickyHtml = newActive.sticky ? `<span style="background:var(--accent-primary); color:#021122; padding:4px 8px; border-radius:8px; margin-right:8px; font-weight:700;">STICKY</span>` : '';
          announcementTitleText.innerHTML = `${stickyHtml}${newActive.title}`;
          announcementMsgText.innerHTML = newActive.message;
        }
        if (!prevAnnouncementId || prevAnnouncementId !== newActive.id) {
          try { showAnnouncementAnimation(newActive.title, newActive.message, 1600); } catch(e){}
          prevAnnouncementId = newActive.id;
        }
      } else {
        if (announcementBanner) announcementBanner.style.display = 'none';
        prevAnnouncementId = null;
      }
    }

    if (document.getElementById('closeAnnouncementBtn')) document.getElementById('closeAnnouncementBtn').addEventListener('click', () => announcementBanner.style.display = 'none');

    // PROFILE EDIT handling
    if (profileEditBtn && profileModal) {
      profileEditBtn.addEventListener('click', async () => {
        if (!user) { showToast('Lütfen önce giriş yapın.', false); return; }
        profileNameInput.value = user.profileName || user.username;
        // set radios
        const color = user.profileColor || '#FFD400';
        for (const r of profileColorInputs) r.checked = (r.value.toLowerCase() === color.toLowerCase());
        profileModal.style.display = 'flex';
      });
    }
    if (closeProfileBtn && profileModal) {
      closeProfileBtn.addEventListener('click', () => profileModal.style.display = 'none');
    }
    if (saveProfileBtn) {
      saveProfileBtn.addEventListener('click', async () => {
        if (!user) return;
        const newName = (profileNameInput.value || '').trim();
        let newColor = null;
        for (const r of profileColorInputs) { if (r.checked) { newColor = r.value; break; } }
        if (!newColor) newColor = '#FFD400';
        if (!newName) { showToast('İsim boş olamaz', false); return; }
        user.profileName = newName;
        user.profileColor = newColor;
        await saveUser(user.username, user);
        await updateUI();
        profileModal.style.display = 'none';
        showToast('Profil güncellendi', true);
      });
    }

    // Chat toggle show/hide
    if (chatCloseBtn && chatWidget) {
      chatCloseBtn.addEventListener('click', () => {
        const wrapper = document.getElementById('publicChatCard') || chatWidget.parentElement;
        if (wrapper) wrapper.style.display = 'none';
        if (chatOpenBtn) chatOpenBtn.style.display = 'block';
      });
    }
    if (chatOpenBtn && chatWidget) {
      chatOpenBtn.addEventListener('click', () => {
        const wrapper = document.getElementById('publicChatCard') || chatWidget.parentElement;
        if (wrapper) wrapper.style.display = 'block';
        chatOpenBtn.style.display = 'none';
      });
      chatOpenBtn.style.display = 'none';
    }

    // Online users list (small UI)
    async function renderOnlineUsers() {
      try {
        const users = await getUsers();
        const now = Date.now();
        const arr = Object.values(users).filter(u => (now - (u.lastSeen || 0)) <= ONLINE_THRESHOLD_MS);
        arr.sort((a,b) => (b.lastSeen||0) - (a.lastSeen||0));
        const el = document.getElementById('onlineUsersList');
        if (!el) return;
        if (arr.length === 0) { el.innerHTML = '<div style="color:var(--text-muted)">Kimse çevrimiçi değil.</div>'; return; }
        let out = '<ul style="list-style:none; padding-left:0; margin:0;">';
        arr.forEach(u => {
          const name = escapeHtml(u.profileName || u.username);
          const color = u.profileColor || '#FFD400';
          out += `<li style="display:flex; align-items:center; gap:10px; padding:8px; border-bottom:1px solid rgba(255,255,255,0.02);">
                    <div style="width:36px;height:36px;border-radius:8px;background:${color}22; display:flex; align-items:center; justify-content:center; font-weight:700; color:${color};">${escapeHtml((u.profileName||u.username).slice(0,2).toUpperCase())}</div>
                    <div style="flex:1;"><div style="font-weight:700;">${name}</div><div style="font-size:0.85rem; color:var(--text-muted);">Son: ${new Date(u.lastSeen).toLocaleTimeString()}</div></div>
                    <div><button onclick="window.startPrivateChat('${u.username}')" style="padding:6px 8px; border-radius:8px; background:var(--accent-primary); color:#021122; border:none;">Özel Sohbet</button></div>
                  </li>`;
        });
        out += '</ul>';
        el.innerHTML = out;
      } catch(e){ console.warn('renderOnlineUsers', e); }
    }
    window.startPrivateChat = async (targetUsername) => {
      if (!user) { showToast('Önce giriş yapın', false); return; }
      const doc = await db.collection('users').doc(targetUsername).get();
      if (!doc.exists) { showToast('Kullanıcı bulunamadı', false); return; }
      const target = doc.data();
      openPrivateChat(user, target);
    };
    setInterval(renderOnlineUsers, 15000);

    await loadUser();
    await renderMaintenanceBanner();
    await renderAnnouncementsInApp();

    // listen for server scheduled activation (safety)
    setInterval(async () => {
      const s = await getSettings();
      if (s.server && s.server.scheduledAt) {
        if (Number(s.server.scheduledAt) <= Date.now()) {
          s.server.closed = true;
          s.server.since = s.server.scheduledAt;
          s.server.scheduledAt = null;
          await saveSettings(s);
          showToast('Planlı sunucu kapanışı gerçekleşti.', true);
          // Ensure overlay updated
          try { updateFullScreenMaintenance(); } catch(e){}
        }
      }
    }, 30000);

    // Watch meta settings for realtime changes (announcements/server)
    db.collection('meta').doc('settings').onSnapshot(async () => {
      await renderMaintenanceBanner();
      await renderAnnouncementsInApp();
      await updateUI();
      // Make sure overlay is synced
      try { updateFullScreenMaintenance(); } catch(e){}
    });

    // watch user's doc for live updates
    if (user) {
      db.collection('users').doc(user.username).onSnapshot((doc) => {
        if (doc.exists) {
          user = doc.data();
          updateUI();
        }
      });
    }

    // ----------------- Tek/Çift Oyunu Handlers -----------------
    async function placeBet(choice) {
      if (!user) { showToast('Önce giriş yapın.', false); return; }
      if (user.isBanned) { showToast('Hesabınız banlı.', false); return; }
      const s = await getSettings();
      if (s.server && s.server.closed) { showToast('Sunucu kapalı — bahis devre dışı.', false); return; }
      const val = parseFloat((betAmountInput && betAmountInput.value) || '0');
      if (!isFinite(val) || val <= 0) { showToast('Geçerli bir bahis miktarı girin.', false); return; }
      if (val > user.balance) { showToast('Yeterli bakiye yok.', false); return; }

      // Deduct stake immediately
      user.balance = Number(user.balance) - Number(val);
      // persist deduction
      await saveUser(user.username, user);
      await updateUI();

      // determine random number 0..99 inclusive, parity: even => 'even', odd => 'odd'
      const rand = Math.floor(Math.random() * 100);
      const resultParity = (rand % 2 === 0) ? 'even' : 'odd';
      const won = (choice === resultParity);

      if (!won) {
        showToast(`Kaybettiniz! (Sayı: ${rand} — ${resultParity}) Bahis tutarı düşüldü.`, false);
        // record a losing bet entry locally for audit (optional)
        const bet = {
          id: generateId('bet_'),
          username: user.username,
          stake: val,
          choice,
          result: resultParity,
          resultNumber: rand,
          status: 'lost',
          createdAt: new Date().toISOString()
        };
        user.betRequests = user.betRequests || [];
        user.betRequests.push(bet);
        await saveUser(user.username, user);
        await updateUI();
        return;
      } else {
        // create pending bet request for admin approval; payout is stake * 2
        const payout = Number(val) * 2;
        const betReq = {
          id: generateId('bet_'),
          username: user.username,
          stake: val,
          payout: payout,
          choice,
          result: resultParity,
          resultNumber: rand,
          status: 'pending',
          createdAt: new Date().toISOString()
        };
        user.betRequests = user.betRequests || [];
        user.betRequests.push(betReq);
        await saveUser(user.username, user);
        showToast(`Tebrikler! Kazandınız (Sayı: ${rand}). Ödeme admin onayı bekliyor.`, true);
        await updateUI();
        return;
      }
    }

    if (betOddBtn) betOddBtn.addEventListener('click', async () => placeBet('odd'));
    if (betEvenBtn) betEvenBtn.addEventListener('click', async () => placeBet('even'));

    // ---------------- Admin realtime watch for settings end ----------------

    // (the rest of initApp continues unchanged)
  } // end initApp

  // -------------------- Admin init (server scheduling + RGB flashy + ban reason + chat-ban) ------------------
  async function initAdmin(){
    const adminPanelView = document.getElementById('adminPanelView');
    const adminAuthView = document.getElementById('adminAuthView');
    const adminEmailInput = document.getElementById('adminEmailInput');
    const adminPasswordInput = document.getElementById('adminPasswordInput');
    const adminAuthSubmit = document.getElementById('adminAuthSubmit');
    const adminAuthClose = document.getElementById('adminAuthClose');
    const adminAuthMessage = document.getElementById('adminAuthMessage');
    const adminUsername = document.getElementById('adminUsername');
    const adminAmount = document.getElementById('adminAmount');
    const adminAddBtn = document.getElementById('adminAddBtn');
    const adminTakeBtn = document.getElementById('adminTakeBtn');
    const adminBanBtn = document.getElementById('adminBanBtn');
    const adminPremiumBtn = document.getElementById('adminPremiumBtn');
    const adminMakeModBtn = document.getElementById('adminMakeModBtn');
    const adminClearChatBtn = document.getElementById('adminClearChatBtn'); // NEW
    const adminChatBanBtn = document.getElementById('adminChatBanBtn'); // NEW: chat ban
    const adminMessage = document.getElementById('adminMessage');
    const settingDailyClick = document.getElementById('settingDailyClick');
    const settingDailyEarn = document.getElementById('settingDailyEarn');
    const settingMinWithdraw = document.getElementById('settingMinWithdraw');
    const saveSettingsBtn = document.getElementById('saveSettingsBtn');
    const maintenanceReasonInput = document.getElementById('maintenanceReasonInput');
    const enableMaintenanceBtn = document.getElementById('enableMaintenanceBtn');
    const disableMaintenanceBtn = document.getElementById('disableMaintenanceBtn');
    const maintenanceStatusText = document.getElementById('maintenanceStatusText');
    const maintenanceStartInput = document.getElementById('maintenanceStartInput');
    const scheduleMaintenanceBtn = document.getElementById('scheduleMaintenanceBtn');
    const cancelScheduledMaintenanceBtn = document.getElementById('cancelScheduledMaintenanceBtn');
    const couponCodeInput = document.getElementById('couponCodeInput');
    const couponPercentInput = document.getElementById('couponPercentInput');
    const couponTypeInput = document.getElementById('couponTypeInput');
    const couponMultiplierInput = document.getElementById('couponMultiplierInput');
    const couponDurationInput = document.getElementById('couponDurationInput');
    const couponUsesInput = document.getElementById('couponUsesInput');
    const createCouponBtn = document.getElementById('createCouponBtn');
    const couponList = document.getElementById('couponList');
    const announceTitleInput = document.getElementById('announceTitleInput');
    const announceMsgInput = document.getElementById('announceMsgInput');
    const announceExpiresInput = document.getElementById('announceExpiresInput');
    const announceStickyInput = document.getElementById('announceStickyInput');
    const createAnnouncementBtn = document.getElementById('createAnnouncementBtn');
    const adminAnnouncementList = document.getElementById('adminAnnouncementList');
    const userListBody = document.getElementById('userListBody');
    const requestsBody = document.getElementById('requestsBody');
    const leaderboardList = document.getElementById('leaderboardList');
    const bottomAdminBar = document.getElementById('bottomAdminBar');

    // Insert server control and flashy UI (already handled earlier in original code)
    (function ensureServerUI(){
      if (document.getElementById('serverControlCard')) return;
      const wrapper = document.createElement('div');
      wrapper.className = 'card';
      wrapper.id = 'serverControlCard';
      wrapper.style.padding = '12px';
      wrapper.innerHTML = `
        <h3 style="margin-top:0; color:var(--text-muted); font-size:0.95rem;">Sunucu Kontrolleri (Admin)</h3>
        <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
          <div style="flex:1; min-width:200px;">
            <div id="serverStatusText" style="font-weight:700; color:var(--text-muted);">Yükleniyor...</div>
          </div>
          <div style="display:flex; gap:8px; align-items:center;">
            <button id="closeServerBtn" style="padding:8px 12px; background:#ff6b6b; color:#08121a; border-radius:8px; border:none;">Sunucuyu Kapat</button>
            <button id="openServerBtn" style="padding:8px 12px; background:var(--accent-success); color:#021122; border-radius:8px; border:none;">Sunucuyu Aç</button>
          </div>
        </div>
        <div style="display:flex; gap:8px; margin-top:8px; align-items:center;">
          <input id="serverReasonInput" placeholder="Kapatma nedeni (isteğe bağlı)" style="flex:1; padding:8px;" />
        </div>
        <div style="display:flex; gap:8px; margin-top:8px; align-items:center;">
          <label style="min-width:120px;">Planla kapanış (zaman)</label>
          <input id="serverScheduleInput" type="datetime-local" style="padding:8px; border-radius:8px;" />
          <button id="serverScheduleBtn" style="padding:8px 12px; background:var(--accent-primary); color:#021122; border-radius:8px; border:none;">Planla Kapanış</button>
          <button id="serverCancelScheduleBtn" style="padding:8px 12px; background:rgba(255,255,255,0.03); color:var(--text-muted); border-radius:8px; border:1px solid var(--border-soft);">Planı İptal Et</button>
        </div>
      `;
      const container = document.getElementById('adminPanelView');
      if (container) container.insertBefore(wrapper, container.children[4] || null);

      document.getElementById('closeServerBtn').onclick = async () => {
        const s = await getSettings();
        s.server.closed = true;
        s.server.reason = document.getElementById('serverReasonInput').value.trim() || 'Sunucu kapatıldı.';
        s.server.since = Date.now();
        s.server.scheduledAt = null;
        await saveSettings(s);
        showToast('Sunucu kapatıldı.', true);
        renderAdminPanel();
      };
      document.getElementById('openServerBtn').onclick = async () => {
        const s = await getSettings();
        s.server.closed = false;
        s.server.reason = '';
        s.server.since = null;
        s.server.scheduledAt = null;
        await saveSettings(s);
        showToast('Sunucu açıldı.', true);
        renderAdminPanel();
      };
      document.getElementById('serverScheduleBtn').onclick = async () => {
        const dt = document.getElementById('serverScheduleInput').value;
        if (!dt) { showToast('Zaman seçin', false); return; }
        const when = new Date(dt).getTime();
        if (isNaN(when) || when <= Date.now()) { showToast('Gelecek bir zaman seçin', false); return; }
        const s = await getSettings();
        s.server.scheduledAt = when;
        s.server.reason = document.getElementById('serverReasonInput').value.trim() || 'Planlı kapatma';
        await saveSettings(s);
        showToast('Sunucu kapanışı planlandı.', true);
        renderAdminPanel();
      };
      document.getElementById('serverCancelScheduleBtn').onclick = async () => {
        const s = await getSettings();
        s.server.scheduledAt = null;
        await saveSettings(s);
        showToast('Sunucu kapanışı planı iptal edildi.', true);
        renderAdminPanel();
      };
    })();

    (function ensureFlashyUI(){
      if (document.getElementById('flashyCard')) return;
      const card = document.createElement('div');
      card.className = 'card';
      card.id = 'flashyCard';
      card.style.padding = '12px';
      card.innerHTML = `
        <h3 style="margin-top:0; color:var(--text-muted); font-size:0.95rem;">Rengarenk İsim Atama (Admin)</h3>
        <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
          <input id="flashTargetInput" placeholder="kullanıcı (username)" style="padding:8px; min-width:200px;" />
          <input id="flashNameInput" placeholder="Görünen renkli isim" style="padding:8px; min-width:200px;" />
          <select id="flashColorSelect" style="padding:8px; min-width:140px;">
            <option value="#FFD400">Sarı</option>
            <option value="#FF9A00">Turuncu</option>
            <option value="#800000">Bordo</option>
            <option value="#FFFFFF">Beyaz</option>
            <option value="#00A3FF">Mavi</option>
            <option value="#FF69B4">Pembe</option>
            <option value="rgb">RGB (Rainbow)</option>
            <option value="chrom-black">Kromatik • Siyah</option>
            <option value="chrom-blue">Kromatik • Mavi</option>
            <option value="chrom-green">Kromatik • Yeşil</option>
            <option value="chrom-purple">Kromatik • Mor</option>
            <option value="chrom-red">Kromatik • Kan Kırmızısı</option>
          </select>
          <label style="display:flex; align-items:center; gap:8px;"><input type="checkbox" id="flashAnimatedCheckbox" /> Parıldasın</label>
          <button id="applyFlashBtn" style="padding:8px 12px; background:var(--accent-primary); color:#021122; border-radius:8px; border:none;">Uygula</button>
          <button id="clearFlashBtn" style="padding:8px 12px; background:rgba(255,255,255,0.03); color:var(--text-muted); border-radius:8px; border:1px solid var(--border-soft);">Kaldır</button>
        </div>
        <p style="margin-top:8px; color:var(--text-muted); font-size:0.85rem;">Rengarenk isim, genel chat ve profile üzerinde görünür.</p>
      `;
      const container = document.getElementById('adminPanelView');
      if (container) container.insertBefore(card, container.children[5] || null);

      document.getElementById('applyFlashBtn').onclick = async () => {
        const target = document.getElementById('flashTargetInput').value.trim().toLowerCase();
        const name = document.getElementById('flashNameInput').value.trim();
        const color = document.getElementById('flashColorSelect').value;
        const animated = document.getElementById('flashAnimatedCheckbox').checked;
        if (!target) { showToast('Kullanıcı adı girin.', false); return; }
        const doc = await db.collection('users').doc(target).get();
        if (!doc.exists) { showToast('Kullanıcı bulunamadı.', false); return; }
        const u = doc.data();
        u.flashyName = name || u.profileName || u.username;
        u.flashyColor = color || '#FFD400';
        u.flashyAnimated = !!animated;
        await saveUser(target, u);
        showToast('Rengarenk isim uygulandı.', true);
        renderUsersTable();
      };
      document.getElementById('clearFlashBtn').onclick = async () => {
        const target = document.getElementById('flashTargetInput').value.trim().toLowerCase();
        if (!target) { showToast('Kullanıcı adı girin.', false); return; }
        const doc = await db.collection('users').doc(target).get();
        if (!doc.exists) { showToast('Kullanıcı bulunamadı.', false); return; }
        const u = doc.data();
        u.flashyName = '';
        u.flashyColor = '';
        u.flashyAnimated = false;
        await saveUser(target, u);
        showToast('Renkli isim kaldırıldı.', true);
        renderUsersTable();
      };
    })();

    auth.onAuthStateChanged(async (user) => {
      if (user) {
        const adminDoc = await db.collection('meta').doc('admins').get();
        const adminList = adminDoc.data()?.uids || [];
        if (adminList.includes(user.uid)) {
          localStorage.setItem('bio_admin_logged_in_v9', 'true');
          adminAuthView.style.display = 'none';
          adminPanelView.style.display = 'flex';
          if (bottomAdminBar) bottomAdminBar.style.display = 'flex';
          renderAdminPanel();
          setTimeout(() => { try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e){} }, 60);
        } else {
          await auth.signOut();
          localStorage.removeItem('bio_admin_logged_in_v9');
          adminAuthMessage.style.display = 'block';
          adminAuthMessage.textContent = 'Admin yetkiniz yok.';
        }
      } else {
        localStorage.removeItem('bio_admin_logged_in_v9');
        adminAuthView.style.display = 'flex';
        adminPanelView.style.display = 'none';
        if (bottomAdminBar) bottomAdminBar.style.display = 'none';
      }
    });

    async function handleAdminLogin(e) {
      e.preventDefault();
      const email = adminEmailInput.value.trim();
      const password = adminPasswordInput.value;
      if (!email || !password) { adminAuthMessage.style.display = 'block'; adminAuthMessage.textContent = 'Email ve şifre zorunlu.'; return; }
      try {
        await auth.signInWithEmailAndPassword(email, password);
      } catch (e) {
        adminAuthMessage.style.display = 'block';
        adminAuthMessage.textContent = 'Giriş başarısız: ' + e.message;
      }
    }

    if (adminAuthSubmit) adminAuthSubmit.addEventListener('click', handleAdminLogin);
    if (adminAuthClose) adminAuthClose.addEventListener('click', () => adminAuthView.style.display = 'none');

    window.logoutAdmin = async () => {
      await auth.signOut();
    };

    async function renderAdminPanel() {
      const s = await getSettings();
      if (settingDailyClick) settingDailyClick.value = s.dailyClickLimit;
      if (settingDailyEarn) settingDailyEarn.value = s.dailyEarningsLimit;
      if (settingMinWithdraw) settingMinWithdraw.value = s.minWithdrawalAmount;
      if (maintenanceStatusText) {
        if (s.maintenance.enabled) maintenanceStatusText.textContent = `Bakım aktif. Başlangıç: ${s.maintenance.since ? new Date(s.maintenance.since).toLocaleString() : 'bilinmiyor'}`;
        else if (s.maintenance.scheduledAt) maintenanceStatusText.textContent = `Planlı bakım: ${new Date(Number(s.maintenance.scheduledAt)).toLocaleString()}`;
        else maintenanceStatusText.textContent = 'Bakım kapalı.';
      }
      // server status update
      const serverStatusText = document.getElementById('serverStatusText');
      if (serverStatusText) {
        serverStatusText.textContent = s.server && s.server.closed ? `Kapalı — ${s.server.reason || ''}` : (s.server && s.server.scheduledAt ? `Planlı kapanış: ${new Date(Number(s.server.scheduledAt)).toLocaleString()}` : 'Açık');
      }
      renderUsersTable();
      renderRequestsTable();
      renderBetRequestsTable(); // NEW: show bet requests
      renderCouponsListAdmin();
      renderAdminAnnouncements();
      renderLeaderboard();

      // Ensure admin page sees overlay as well (in case admin needs to preview)
      try { updateFullScreenMaintenance(); } catch(e){}
    }

    async function performAdminAction(action) {
      const username = adminUsername.value.trim().toLowerCase();
      const amount = parseFloat(adminAmount.value) || 0;
      const banReasonInput = document.getElementById('adminBanReasonInput');
      let banReason = banReasonInput ? banReasonInput.value.trim() : '';
      if (!username) { adminMessage.style.display = 'block'; adminMessage.textContent = 'Kullanıcı adı girin.'; return; }
      const userDoc = await db.collection('users').doc(username).get();
      if (!userDoc.exists) { adminMessage.style.display = 'block'; adminMessage.textContent = 'Kullanıcı bulunamadı.'; return; }
      let u = userDoc.data();
      switch (action) {
        case 'add':
          u.balance += amount;
          break;
        case 'take':
          u.balance = 0;
          break;
        case 'ban':
          // toggle ban; if we're banning now, capture reason (input or prompt)
          if (!u.isBanned) {
            if (!banReason) banReason = prompt('Ban nedeni (isteğe bağlı):', '') || '';
            u.isBanned = true;
            u.banInfo = { reason: banReason, by: (auth.currentUser && auth.currentUser.email) ? auth.currentUser.email : 'admin', at: Date.now() };
          } else {
            // unban
            u.isBanned = false;
            u.banInfo = null;
          }
          break;
        case 'chatban':
          // toggle only chat ban (prevents sending messages and media)
          u.isChatBanned = !u.isChatBanned;
          // optionally record meta
          u.chatBanInfo = u.isChatBanned ? { by: (auth.currentUser && auth.currentUser.email) ? auth.currentUser.email : 'admin', at: Date.now() } : null;
          break;
        case 'premium':
          u.premium = !u.premium;
          break;
        case 'mod':
          u.role = u.role === 'mod' ? 'user' : 'mod';
          break;
      }
      await saveUser(username, u);
      adminMessage.style.display = 'block';
      adminMessage.textContent = 'İşlem tamamlandı.';
      renderAdminPanel();
    }

    if (adminAddBtn) adminAddBtn.addEventListener('click', () => performAdminAction('add'));
    if (adminTakeBtn) adminTakeBtn.addEventListener('click', () => performAdminAction('take'));
    if (adminBanBtn) adminBanBtn.addEventListener('click', () => performAdminAction('ban'));
    if (adminChatBanBtn) adminChatBanBtn.addEventListener('click', () => performAdminAction('chatban'));
    if (adminPremiumBtn) adminPremiumBtn.addEventListener('click', () => performAdminAction('premium'));
    if (adminMakeModBtn) adminMakeModBtn.addEventListener('click', () => performAdminAction('mod'));

    // NEW: adminClearChatBtn -> deletes all documents in 'chat' collection in batches
    if (adminClearChatBtn) {
      adminClearChatBtn.addEventListener('click', async () => {
        if (!confirm('Genel sohbeti tamamen sıfırlamak istediğinize emin misiniz? Bu işlem geri alınamaz.')) return;
        try {
          showToast('Sohbet temizleniyor... Lütfen bekleyin.', true, 10000);
          // delete in batches
          const snapshot = await db.collection('chat').get();
          if (snapshot.empty) {
            showToast('Sohbet zaten boş.', true);
            return;
          }
          const batches = [];
          let batch = db.batch();
          let ops = 0;
          for (const doc of snapshot.docs) {
            batch.delete(doc.ref);
            ops++;
            // commit every 450 ops to be safe (Firestore batch limit 500)
            if (ops >= 450) {
              batches.push(batch.commit());
              batch = db.batch();
              ops = 0;
            }
          }
          if (ops > 0) batches.push(batch.commit());
          await Promise.all(batches);
          showToast('Genel sohbet başarıyla sıfırlandı.', true);
        } catch (err) {
          console.error('Sohbet sıfırlama hatası', err);
          showToast('Sohbet sıfırlanırken hata oluştu: ' + (err.message || err), false);
        }
      });
    }

    if (saveSettingsBtn) saveSettingsBtn.addEventListener('click', async () => {
      const s = await getSettings();
      s.dailyClickLimit = parseInt(settingDailyClick.value) || DEFAULT_DAILY_CLICK_LIMIT;
      s.dailyEarningsLimit = parseFloat(settingDailyEarn.value) || DEFAULT_DAILY_EARNINGS_LIMIT;
      s.minWithdrawalAmount = parseFloat(settingMinWithdraw.value) || DEFAULT_MIN_WITHDRAWAL;
      await saveSettings(s);
      showToast('Ayarlar kaydedildi.', true);
      renderAdminPanel();
      // sync overlay change
      try { updateFullScreenMaintenance(); } catch(e){}
    });

    if (enableMaintenanceBtn) enableMaintenanceBtn.addEventListener('click', async () => {
      const s = await getSettings();
      s.maintenance.enabled = true;
      s.maintenance.reason = maintenanceReasonInput.value.trim();
      s.maintenance.since = Date.now();
      s.maintenance.scheduledAt = null;
      await saveSettings(s);
      showToast('Bakım etkinleştirildi.', true);
      renderAdminPanel();
    });

    if (disableMaintenanceBtn) disableMaintenanceBtn.addEventListener('click', async () => {
      const s = await getSettings();
      s.maintenance.enabled = false;
      s.maintenance.reason = '';
      s.maintenance.since = null;
      s.maintenance.scheduledAt = null;
      await saveSettings(s);
      showToast('Bakım devre dışı bırakıldı.', true);
      renderAdminPanel();
    });

    if (scheduleMaintenanceBtn) scheduleMaintenanceBtn.addEventListener('click', async () => {
      const dt = maintenanceStartInput.value;
      if (!dt) { showToast('Başlangıç zamanı seçin.', false); return; }
      const when = new Date(dt).getTime();
      if (isNaN(when) || when <= Date.now()) { showToast('Gelecek bir zaman seçin', false); return; }
      const s = await getSettings();
      s.maintenance.scheduledAt = when;
      s.maintenance.reason = maintenanceReasonInput.value.trim();
      await saveSettings(s);
      showToast('Bakım planlandı.', true);
      renderAdminPanel();
    });
    if (cancelScheduledMaintenanceBtn) cancelScheduledMaintenanceBtn.addEventListener('click', async () => {
      const s = await getSettings();
      s.maintenance.scheduledAt = null;
      await saveSettings(s);
      showToast('Planlı bakım iptal edildi.', true);
      renderAdminPanel();
    });

    // Poll every 30s to activate scheduled maintenance and server scheduled close (safety)
    setInterval(async () => {
      const s = await getSettings();
      if (s.maintenance && s.maintenance.scheduledAt) {
        if (Number(s.maintenance.scheduledAt) <= Date.now()) {
          s.maintenance.enabled = true;
          s.maintenance.since = s.maintenance.scheduledAt;
          s.maintenance.scheduledAt = null;
          await saveSettings(s);
          showToast('Planlı bakım başladı.', true);
          renderAdminPanel();
        }
      }
      if (s.server && s.server.scheduledAt) {
        if (Number(s.server.scheduledAt) <= Date.now()) {
          s.server.closed = true;
          s.server.since = s.server.scheduledAt;
          s.server.scheduledAt = null;
          await saveSettings(s);
          showToast('Planlı sunucu kapanışı gerçekleşti.', true);
          renderAdminPanel();
        }
      }
      // ensure overlay status synced
      try { updateFullScreenMaintenance(); } catch(e){}
    }, 30000);

    if (createCouponBtn) createCouponBtn.addEventListener('click', async () => {
      const rawCode = (couponCodeInput.value || '').trim();
      if (!rawCode) { showToast('Kupon kodu girin.', false); return; }
      const code = rawCode.toUpperCase();
      const type = couponTypeInput.value;
      const uses = couponUsesInput.value ? parseInt(couponUsesInput.value,10) : null;

      let percent = 0;
      let multiplier = 1;
      let durationSeconds = null;

      if (type === 'balance') {
        percent = parseFloat(couponPercentInput.value) || 0;
        if (percent <= 0) { showToast('Bakiye bonusu için % değeri girin.', false); return; }
      } else if (type === 'click_bonus') {
        multiplier = parseFloat(couponMultiplierInput.value) || 1;
        durationSeconds = parseInt(couponDurationInput.value) || 0;
        if (multiplier <= 1 || durationSeconds <= 0) { showToast('Tıklama bonusu için geçerli çarpan ve süre girin.', false); return; }
      } else {
        showToast('Geçersiz kupon tipi.', false);
        return;
      }

      const s = await getSettings();
      if (s.coupons.find(c => (c.code || '').toString().toUpperCase() === code)) { showToast('Aynı kod zaten mevcut.', false); return; }
      const cobj = {
        code,
        percent: type === 'balance' ? percent : 0,
        uses: uses === null ? null : (isNaN(uses) ? null : uses),
        createdAt: new Date().toISOString(),
        type,
        multiplier: type === 'click_bonus' ? multiplier : 1,
        durationSeconds: type === 'click_bonus' ? durationSeconds : null
      };
      s.coupons.push(cobj);
      await saveSettings(s);
      couponCodeInput.value = ''; couponPercentInput.value = ''; couponUsesInput.value = ''; couponMultiplierInput.value = '2'; couponDurationInput.value = '60';
      renderCouponsListAdmin();
      showToast(`Kupon ${code} oluşturuldu.`, true);
    });

    async function renderCouponsListAdmin(){
      const el = couponList;
      const s = await getSettings();
      if (!el) return;
      if (!s.coupons.length) { el.innerHTML = '<div style="color:var(--text-muted)">Kupon yok.</div>'; return; }
      let out = '<ul style="padding-left:18px; margin:0;">';
      s.coupons.forEach((c) => {
        let info = c.type === 'balance' ? `+${c.percent}% (çekim)` : `${c.multiplier}x tıklama — ${c.durationSeconds}s`;
        out += `<li>${c.code} — ${info} ${c.uses!==null?`— Kalan: ${c.uses}`:''} <button onclick="window.removeCoupon('${c.code}')">Kaldır</button></li>`;
      });
      out += '</ul>';
      el.innerHTML = out;
    }

    window.removeCoupon = async (code) => {
      const s = await getSettings();
      s.coupons = s.coupons.filter(c => (c.code||'').toString().toUpperCase() !== (code||'').toString().toUpperCase());
      await saveSettings(s);
      renderCouponsListAdmin();
      showToast('Kupon kaldırıldı.', true);
    };

    function createAnnouncement(title, message, durationSeconds, sticky) {
      if (!title || !message) return { ok:false, msg:'Başlık ve mesaj gerekli.' };
      const id = generateId('ann_');
      const createdAt = new Date().toISOString();
      const expiresAt = durationSeconds > 0 ? Date.now() + durationSeconds*1000 : null;
      return { ok:true, ann: { id, title: title.trim(), message: message.trim(), createdAt, expiresAt, sticky: !!sticky, visible: true } };
    }

    if (createAnnouncementBtn) createAnnouncementBtn.addEventListener('click', async () => {
      const title = announceTitleInput.value.trim();
      const msg = announceMsgInput.value.trim();
      const duration = parseInt(announceExpiresInput.value) || 0;
      const sticky = announceStickyInput.checked;
      const res = createAnnouncement(title, msg, duration, sticky);
      if (!res.ok) { showToast(res.msg, false); return; }
      const s = await getSettings();
      s.announcements.unshift(res.ann);
      await saveSettings(s);
      announceTitleInput.value = ''; announceMsgInput.value = ''; announceExpiresInput.value = ''; announceStickyInput.checked = false;
      renderAdminAnnouncements();
      try { showAnnouncementAnimation(res.ann.title, res.ann.message); } catch(e){}
      showToast('Duyuru oluşturuldu.', true);
    });

    async function renderAdminAnnouncements() {
      const s = await getSettings();
      const anns = s.announcements;
      if (!adminAnnouncementList) return;
      if (!anns.length) { adminAnnouncementList.innerHTML = '<div style="color:var(--text-muted)">Henüz duyuru yok.</div>'; return; }
      let out = '<ul style="padding-left:18px; margin:0;">';
      anns.forEach(a => {
        const expiresText = a.expiresAt ? ` — Son: ${new Date(a.expiresAt).toLocaleString()}` : '';
        out += `<li style="margin-bottom:10px; padding:8px; background: linear-gradient(90deg,#0bdfff22,#00ffb222); border-radius:8px;">
                  <div style="display:flex; align-items:center; gap:8px;">
                    <strong style="flex:1">${a.title}</strong>
                    ${a.sticky?'<span style="background:var(--accent-primary); padding:4px 8px; border-radius:6px; color:#021122; font-weight:700;">STICKY</span>':''}
                  </div>
                  <div style="margin-top:6px; color:var(--text-muted)">${a.message}</div>
                  <div style="margin-top:8px; font-size:0.85rem; color:rgba(0,0,0,0.55)">${new Date(a.createdAt).toLocaleString()}${expiresText}</div>
                  <div style="margin-top:6px;">
                    <button onclick="window.adminToggleAnnouncement('${a.id}')">${a.visible? 'Gizle' : 'Yayımla'}</button>
                    <button onclick="window.adminRemoveAnnouncement('${a.id}')">Kaldır</button>
                  </div>
                </li>`;
      });
      out += '</ul>';
      adminAnnouncementList.innerHTML = out;
    }

    window.adminRemoveAnnouncement = async (id) => { const s = await getSettings(); s.announcements = s.announcements.filter(a => a.id === id ? false : true); await saveSettings(s); renderAdminAnnouncements(); showToast('Duyuru kaldırıldı.', true); };
    window.adminToggleAnnouncement = async (id) => { const s = await getSettings(); const ann = s.announcements.find(a => a.id === id); if (ann) ann.visible = !ann.visible; await saveSettings(s); renderAdminAnnouncements(); showToast('Duyuru durumu güncellendi.', true); };

    async function renderUsersTable() {
      const users = await getUsers();
      let rows = '';
      Object.values(users).forEach(u => {
        const visibleName = (u.flashyName && u.flashyName.length) ? u.flashyName : (u.profileName || u.username);
        const styleColor = (u.flashyColor && u.flashyColor.length && u.flashyColor !== 'rgb') ? ` style="color:${u.flashyColor}; font-weight:800;"` : '';
        rows += `
          <tr>
            <td${styleColor}>${visibleName}${u.flashyColor === 'rgb' ? ' <small style="margin-left:6px; color:var(--accent-primary);">🌈</small>':''}</td>
            <td>${formatMoney(u.balance)}</td>
            <td>${u.clicks}</td>
            <td>${u.isBanned ? 'Banned' : 'Active'}</td>
            <td>${u.premium ? 'Evet' : 'Hayır'}</td>
            <td>${u.role}</td>
            <td>
              <button onclick="window.handleUserAction('${u.username}', 'ban')">Ban/Unban</button>
              <button onclick="window.handleUserAction('${u.username}', 'premium')">Premium</button>
              <button onclick="window.handleUserAction('${u.username}', 'addBalance')">Bakiye Ekle</button>
              <button onclick="window.handleUserAction('${u.username}', 'chatban')" style="margin-left:6px;">Chat Ban</button>
            </td>
          </tr>
        `;
      });
      if (userListBody) userListBody.innerHTML = rows || '<tr><td colspan="7">Kullanıcı yok.</td></tr>';
    }

    window.handleUserAction = async (username, action) => {
      const amount = prompt('Miktar girin (bakiye için):', '10');
      const userDoc = await db.collection('users').doc(username).get();
      let u = userDoc.data();
      if (action === 'ban') {
        // ask reason
        if (!u.isBanned) {
          const reason = prompt('Ban nedeni (isteğe bağlı):', '') || '';
          u.isBanned = true;
          u.banInfo = { reason, by: (auth.currentUser && auth.currentUser.email) ? auth.currentUser.email : 'admin', at: Date.now() };
        } else {
          u.isBanned = false;
          u.banInfo = null;
        }
      }
      if (action === 'premium') u.premium = !u.premium;
      if (action === 'addBalance') u.balance += parseFloat(amount) || 0;
      if (action === 'chatban') {
        u.isChatBanned = !u.isChatBanned;
        u.chatBanInfo = u.isChatBanned ? { by: (auth.currentUser && auth.currentUser.email) ? auth.currentUser.email : 'admin', at: Date.now() } : null;
      }
      await saveUser(username, u);
      showToast('İşlem tamamlandı.', true);
      renderAdminPanel();
    };

    // ---------------- Admin: Bet requests rendering & actions ----------------
    async function renderBetRequestsTable() {
      const elContainer = document.getElementById('betRequestsBody');
      if (!elContainer) return;
      const users = await getUsers();
      const all = [];
      Object.entries(users).forEach(([username, u]) => {
        if (Array.isArray(u.betRequests)) {
          u.betRequests.forEach(b => {
            all.push({...b, username});
          });
        }
      });
      if (all.length === 0) {
        elContainer.innerHTML = '<tr><td colspan="8" style="text-align:center; color:var(--text-muted); padding:20px;">Henüz Tek/Çift talebi yok.</td></tr>';
        return;
      }
      all.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
      let rows = '';
      all.forEach(r => {
        const statusColor = r.status === 'approved' ? 'var(--accent-success)' :
                           r.status === 'rejected' ? 'var(--accent-danger)' :
                           r.status === 'pending' ? 'orange' : 'gray';
        const statusText = r.status === 'pending' ? 'Bekliyor' :
                          r.status === 'approved' ? 'Onaylandı' :
                          r.status === 'rejected' ? 'Reddedildi' : (r.status || '');
        rows += `
          <tr style="font-size:0.92rem;">
            <td><code style="font-size:0.8rem;">${(r.id||'').slice(0, 12)}</code></td>
            <td><strong>${r.username}</strong></td>
            <td style="color:var(--accent-success); font-weight:600;">${formatMoney(r.stake)}</td>
            <td>${r.choice.toUpperCase()}</td>
            <td>${r.resultNumber} (${r.result})</td>
            <td style="font-size:0.8rem;">${new Date(r.createdAt).toLocaleString('tr-TR')}</td>
            <td><span style="color:${statusColor}; font-weight:600;">${statusText}</span></td>
            <td>
              ${r.status === 'pending' ? `
                <button onclick="handleBetRequestAction('${r.id}', 'approve')" style="padding:5px 9px; font-size:0.8rem; background:var(--accent-success); color:#000; border:none; border-radius:6px; cursor:pointer;">Onayla</button>
                <button onclick="handleBetRequestAction('${r.id}', 'reject')" style="padding:5px 9px; font-size:0.8rem; background:var(--accent-danger); color:white; border:none; border-radius:6px; margin-left:4px; cursor:pointer;">Reddet</button>
              ` : `
                <button onclick="handleBetRequestAction('${r.id}', 'remove')" style="padding:5px 9px; font-size:0.8rem; background:rgba(255,255,255,0.1); color:var(--text-muted); border:1px solid var(--border-soft); border-radius:6px; cursor:pointer;">Kaldır</button>
              `}
            </td>
          </tr>
        `;
      });
      elContainer.innerHTML = rows;
    }
const snowContainer = document.getElementById('snow-container');

// --- KAR TANELERİ AYARLARI ---
const numberOfSnowflakes = 80; // Daha az kar tanesi
const snowflakeChars = ['❄', '❅', '❆', '✨']; // Farklı kar tanesi veya parıltı karakterleri

function createSnowflake() {
    const snowflake = document.createElement('div');
    snowflake.classList.add('falling-item', 'snowflake');
    snowflake.innerHTML = snowflakeChars[Math.floor(Math.random() * snowflakeChars.length)];

    const startX = Math.random() * 100;
    snowflake.style.left = `${startX}vw`; 

    const size = Math.random() * 0.7 + 0.3; // 0.3 ile 1.0 arasında bir değer
    snowflake.style.fontSize = `${size}em`;
    snowflake.style.opacity = Math.random() * 0.7 + 0.3; // Daha az opak

    const duration = Math.random() * 12 + 6; // 6 ile 18 saniye arası
    snowflake.style.animationDuration = `${duration}s`;

    const delay = Math.random() * 12;
    snowflake.style.animationDelay = `-${delay}s`;

    snowContainer.appendChild(snowflake);

    setTimeout(() => {
        snowflake.remove();
        createSnowflake();
    }, (duration + delay) * 1000); 
}

// Kar tanelerini oluştur
for (let i = 0; i < numberOfSnowflakes; i++) {
    createSnowflake();
}

// --- PARA TANELERİ AYARLARI ---
const numberOfMoney = 20; // Daha az para (hafif yağmur için)
const moneyChars = ['💲', '💰', '$', '€', '£', '¥']; // Farklı para birimi sembolleri

function createMoney() {
    const moneyItem = document.createElement('div');
    moneyItem.classList.add('falling-item', 'money');
    moneyItem.innerHTML = moneyChars[Math.floor(Math.random() * moneyChars.length)];

    const startX = Math.random() * 100;
    moneyItem.style.left = `${startX}vw`; 

    const size = Math.random() * 0.8 + 0.7; // 0.7 ile 1.5 arasında daha büyük
    moneyItem.style.fontSize = `${size}em`;
    moneyItem.style.opacity = Math.random() * 0.8 + 0.4; // Biraz daha opak

    const duration = Math.random() * 10 + 7; // 7 ile 17 saniye arası (kar tanelerinden biraz daha yavaş olabilir)
    moneyItem.style.animationDuration = `${duration}s`;

    const delay = Math.random() * 15;
    moneyItem.style.animationDelay = `-${delay}s`;

    snowContainer.appendChild(moneyItem);

    setTimeout(() => {
        moneyItem.remove();
        createMoney();
    }, (duration + delay) * 1000); 
}

// Para tanelerini oluştur
for (let i = 0; i < numberOfMoney; i++) {
    createMoney();
}
    window.handleBetRequestAction = async (betId, action) => {
      if (!confirm(`${action === 'approve' ? 'Onayla' : action === 'reject' ? 'Reddet' : 'Kaldır'} mı?`)) return;
      const users = await getUsers();
      let found = false;
      for (const username in users) {
        const u = users[username];
        if (!Array.isArray(u.betRequests)) continue;
        u.betRequests = u.betRequests.map(b => {
          if (b.id !== betId) return b;
          found = true;
          if (action === 'approve') {
            b.status = 'approved';
            b.approvedAt = new Date().toISOString();
            // credit payout to user's balance
            u.balance = (u.balance || 0) + (b.payout || 0);
          } else if (action === 'reject') {
            b.status = 'rejected';
            b.rejectedAt = new Date().toISOString();
            // no credit (stake already deducted at bet time)
          } else if (action === 'remove') {
            return null;
          }
          return b;
        }).filter(Boolean);
        users[username] = u;
      }
      if (!found) {
        showToast('Talep bulunamadı!', false);
        return;
      }
      for (const username in users) {
        await saveUser(username, users[username]);
      }
      showToast(`Talep ${action === 'approve' ? 'onaylandı' : action === 'reject' ? 'reddedildi' : 'kaldırıldı'}!`, true);
      renderBetRequestsTable();
      renderRequestsTable();
      renderUsersTable();
      renderLeaderboard();
    };

    // ---------------- Admin: end ----------------

  } // end initAdmin

  document.addEventListener('DOMContentLoaded', () => {
    const isApp = !!document.getElementById('mainContent');
    const isAdmin = !!document.getElementById('adminPanelView');
    try {
      if (isAdmin) initAdmin();
      if (isApp) initApp();
    } catch (e) {
      console.error('Init error', e);
    }
  });

  async function renderRequestsTable() {
    const requestsBody = document.getElementById('requestsBody');
    if (!requestsBody) return;

    const users = await getUsers();
    const allRequests = [];

    Object.entries(users).forEach(([username, u]) => {
      if (Array.isArray(u.withdrawalRequests)) {
        u.withdrawalRequests.forEach(r => {
          allRequests.push({ ...r, username });
        });
      }
    });

    if (allRequests.length === 0) {
      requestsBody.innerHTML = '<tr><td colspan="8" style="text-align:center; color:var(--text-muted); padding:20px;">Henüz çekim talebi yok.</td></tr>';
      return;
    }

    allRequests.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    let rows = '';
    allRequests.forEach(r => {
      const statusColor = r.status === 'approved' ? 'var(--accent-success)' :
                         r.status === 'rejected' ? 'var(--accent-danger)' :
                         'orange';
      const statusText = r.status === 'pending' ? 'Bekliyor' :
                        r.status === 'approved' ? 'Onaylandı' :
                        r.status === 'rejected' ? 'Reddedildi' : 'Kaldırıldı';

      const bonusText = r.couponBonusPercent > 0 ? ` (+${r.couponBonusPercent}% bonus)` : '';

      rows += `
        <tr style="font-size:0.92rem;">
          <td><code style="font-size:0.8rem;">${(r.id||'').slice(0, 12)}</code></td>
          <td><strong>${r.username}</strong></td>
          <td style="color:var(--accent-success); font-weight:600;">
            ${formatMoney(r.amount)}${bonusText}
          </td>
          <td>${r.firstName || ''} ${r.lastName || ''}</td>
          <td>${r.bank || ''}<br><small style="color:#00ffb2;">${prettyIban(r.iban || '')}</small></td>
          <td style="font-size:0.8rem;">${new Date(r.createdAt).toLocaleString('tr-TR')}</td>
          <td><span style="color:${statusColor}; font-weight:600;">${statusText}</span></td>
          <td>
            ${r.status === 'pending' ? `
              <button onclick="handleRequestAction('${r.id}', 'approve')" style="padding:5px 9px; font-size:0.8rem; background:var(--accent-success); color:#000; border:none; border-radius:6px; cursor:pointer;">Onayla</button>
              <button onclick="handleRequestAction('${r.id}', 'reject')" style="padding:5px 9px; font-size:0.8rem; background:var(--accent-danger); color:white; border:none; border-radius:6px; margin-left:4px; cursor:pointer;">Reddet</button>
            ` : `

              <button onclick="handleRequestAction('${r.id}', 'remove')" style="padding:5px 9px; font-size:0.8rem; background:rgba(255,255,255,0.1); color:var(--text-muted); border:1px solid var(--border-soft); border-radius:6px; cursor:pointer;">Kaldır</button>
            `}
          </td>
        </tr>
      `;
    });

    requestsBody.innerHTML = rows;
  }

  async function renderLeaderboard() {
    const leaderboardList = document.getElementById('leaderboardList');
    if (!leaderboardList) return;

    const users = Object.values(await getUsers());
    if (users.length === 0) {
      leaderboardList.innerHTML = '<li style="color:var(--text-muted);">Henüz kullanıcı yok.</li>';
      return;
    }

    users.sort((a, b) => (b.balance || 0) - (a.balance || 0));

    const top15 = users.slice(0, 15);
    let html = '';

    top15.forEach((u, i) => {
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '';
      const premiumBadge = u.premium ? ' <span style="background:#FFD400; color:#000; padding:2px 8px; border-radius:6px; font-size:0.7rem; margin-left:6px;">PREMIUM</span>' : '';
      const bannedBadge = u.isBanned ? ' <span style="background:#FF4080; color:white; padding:2px 8px; border-radius:6px; font-size:0.7rem; margin-left:6px;">BANLI</span>' : '';

      const displayName = (u.flashyName && u.flashyName.length) ? u.flashyName : (u.profileName || u.username);

      html += `<li style="margin-bottom:8px;">
        <strong>${i+1}. ${escapeHtml(displayName)}</strong>${premiumBadge}${bannedBadge} → <strong style="color:var(--accent-success);">${formatMoney(u.balance)}</strong>
        ${medal ? `<span style="margin-left:8px; font-size:1.4rem;">${medal}</span>` : ''}
      </li>`;
    });

    leaderboardList.innerHTML = html || '<li style="color:var(--text-muted);">Veri yok.</li>';
  }

  window.handleRequestAction = async (requestId, action) => {
    if (!confirm(`${action === 'approve' ? 'Onayla' : action === 'reject' ? 'Reddet' : 'Kaldır'} mı?`)) return;

    const users = await getUsers();
    let found = false;

    for (const username in users) {
      const u = users[username];
      if (!Array.isArray(u.withdrawalRequests)) continue;

      u.withdrawalRequests = u.withdrawalRequests.map(req => {
        if (req.id !== requestId) return req;
        found = true;

        if (action === 'approve') {
          req.status = 'approved';
          req.approvedAt = new Date().toISOString();
        } else if (action === 'reject') {
          req.status = 'rejected';
          req.rejectedAt = new Date().toISOString();
          u.balance = (req.originalBalance || 0) + (u.balance || 0);
        } else if (action === 'remove') {
          return null;
        }
        return req;
      }).filter(Boolean);

      users[username] = u;
    }

    if (!found) {
      showToast('Talep bulunamadı!', false);
      return;
    }

    for (const username in users) {
      await saveUser(username, users[username]);
    }

    showToast(`Talep ${action === 'approve' ? 'onaylandı' : action === 'reject' ? 'reddedildi' : 'kaldırıldı'}!`, true);
    renderRequestsTable();
    renderLeaderboard();
  };

  // Private DM implementation (kept from previous)
  let currentDmUnsub = null;
  function dmIdFor(a, b) { const pair = [a,b].sort(); return 'dm_' + pair.join('__'); }
  async function openPrivateChat(currentUser, targetUserObj) {
    const dmModal = document.getElementById('privateChatModal');
    if (!dmModal) { showToast('DM modal mevcut değil', false); return; }
    const dmTitle = document.getElementById('dmTitle');
    const dmMessages = document.getElementById('dmMessages');
    const dmInput = document.getElementById('dmInput');
    const dmSendBtn = document.getElementById('dmSendBtn');
    const chatId = dmIdFor(currentUser.username, targetUserObj.username);
    dmTitle.textContent = `Özel: ${targetUserObj.profileName || targetUserObj.username}`;
    dmMessages.innerHTML = '<div style="color:var(--text-muted)">Yükleniyor...</div>';
    dmModal.style.display = 'flex';

    if (currentDmUnsub) try { currentDmUnsub(); } catch(e){}
    currentDmUnsub = db.collection('privateChats').doc(chatId).collection('messages').orderBy('timestamp','asc').limitToLast(500)
      .onSnapshot(snap => {
        dmMessages.innerHTML = '';
        snap.forEach(doc => {
          const m = doc.data() || {};
          const who = m.fromName || m.from || 'Anon';
          const color = m.fromColor || '#00A3FF';
          const div = document.createElement('div');
          div.className = 'chat-message' + (m.from === currentUser.username ? ' me' : '');
          div.innerHTML = `<span class="username" style="color:${escapeHtml(color)}">${escapeHtml(who)}:</span> ${escapeHtml(m.text || '')}`;
          dmMessages.appendChild(div);
        });
        dmMessages.scrollTop = dmMessages.scrollHeight;
      });

    const sendDm = async () => {
      const text = (dmInput.value || '').trim();
      if (!text) return;
      const payload = {
        from: currentUser.username,
        fromName: currentUser.profileName || currentUser.username,
        fromColor: currentUser.profileColor || '#00A3FF',
        to: targetUserObj.username,
        text,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
      };
      await db.collection('privateChats').doc(chatId).collection('messages').add(payload).catch(e => console.error(e));
      dmInput.value = '';
    };

    dmSendBtn.onclick = sendDm;
    dmInput.onkeypress = (e) => { if (e.key === 'Enter') sendDm(); };
    document.getElementById('closeDmBtn').onclick = () => {
      dmModal.style.display = 'none';
      if (currentDmUnsub) try { currentDmUnsub(); } catch(e){}
    };
  }
const snowContainer = document.getElementById('snow-container');
const numberOfSnowflakes = 100; // Kaç tane kar tanesi istediğinizi belirleyin

function createSnowflake() {
    const snowflake = document.createElement('div');
    snowflake.classList.add('snowflake');
    // İçerik olarak bir karakter (örneğin yıldız, nokta veya kar tanesi simgesi)
    snowflake.innerHTML = '❄'; 

    // Rastgele başlangıç pozisyonu (Genişlik)
    const startX = Math.random() * 100;
    snowflake.style.left = `${startX}vw`; 

    // Rastgele boyut ve opaklık
    const size = Math.random() * 0.5 + 0.5; // 0.5 ile 1.0 arasında bir değer
    snowflake.style.fontSize = `${size}em`;
    snowflake.style.opacity = Math.random();

    // Rastgele düşme süresi (Animasyonun hızı)
    const duration = Math.random() * 10 + 5; // 5 ile 15 saniye arası
    snowflake.style.animationDuration = `${duration}s`;

    // Rastgele gecikme (Animasyonun ne zaman başlayacağı)
    const delay = Math.random() * 10;
    snowflake.style.animationDelay = `-${delay}s`; // Negatif değerle hemen başlar

    snowContainer.appendChild(snowflake);

    // Kar tanesi ekranın altından düştükten sonra onu kaldır ve yenisini oluştur (Döngü için)
    setTimeout(() => {
        snowflake.remove();
        createSnowflake(); // Yeni bir tane oluştur
    }, (duration + delay) * 1000); 
}

// Belirtilen sayıda kar tanesini oluşturmak için döngü
for (let i = 0; i < numberOfSnowflakes; i++) {
    createSnowflake();
}
  // small utility to escape html
  function escapeHtml(s) {
    if (s === null || typeof s === 'undefined') return '';
    return String(s).replace(/[&<>"'`=\/]/g, function (c) {
      return {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
        '/': '&#x2F;',
        '=': '&#x3D;',
        '`': '&#x60;'
      }[c];
    });
  }

})();