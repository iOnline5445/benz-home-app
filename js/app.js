    async function loadDB() {
      if (_fbReady && _db) {
        // ถ้า real-time sync ทำงานอยู่ onSnapshot จะ handle การอัพเดทเอง
        // แต่โหลดครั้งแรกเพื่อให้ข้อมูลพร้อมทันที
        if (!_realtimeSyncActive) {
          const { collection, getDocs } = window._firestoreLib;
          let anyFail = false;
          for (const col of ['assets', 'agents', 'customers', 'consignments', 'mktQueue', 'mktScheduleSlots', 'platformCredentials']) {
            try {
              const snap = await getDocs(collection(_db, col));
              if (col === 'mktScheduleSlots') {
                DB.mktScheduleSlots = snap.docs.map(d => d.data().time);
              } else {
                DB[col] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
              }
            } catch (e) { console.warn('loadDB Firebase fail:', col, e); anyFail = true; }
          }
          if (anyFail) showToast('⚠️ Firebase โหลดบางส่วนไม่ได้ — ใช้ cache', '#e05050');
          saveTolocalStorage();
        }
        // เปิด real-time sync (ถ้ายังไม่ได้เปิด)
        startRealtimeSync();
      } else {
        // Fallback: โหลดจาก localStorage
        loadFromlocalStorage();
        showToast('📦 ใช้ข้อมูล offline (localStorage)', '#5090e0');
      }
      updateFirebaseStatus();
      renderAssets(); renderAgents(); renderCustomers(); renderStats();
      updatePendingCountNotification();
      if (!_reminderInterval) {
        _reminderInterval = setInterval(checkScheduledQueueReminders, 30000);
      }
    }

    let _suppressSnapshot = false; // guard: suppress onSnapshot during our own write

    async function saveItem(colName, item, id = null) {
      if (!item.id) item.id = id || genId();
      if (_fbReady && _db) {
        try {
          const { collection, doc, setDoc } = window._firestoreLib;
          const ref = doc(collection(_db, colName), item.id);
          _suppressSnapshot = true;        // block onSnapshot re-render while we write
          await setDoc(ref, item);
          // release after snapshot window; then do ONE clean render from Firebase
          setTimeout(() => {
            _suppressSnapshot = false;
            // Re-sync from Firebase to ensure UI is accurate (no dupes, no missing)
            if (_fbReady && _db && window._firestoreLib) {
              const { collection: col2, getDocs: gd2 } = window._firestoreLib;
              for (const c of ['assets', 'agents', 'customers', 'consignments']) {
                gd2(col2(_db, c)).then(snap => {
                  DB[c] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                }).catch(() => { });
              }
              setTimeout(() => {
                saveTolocalStorage();
                renderAssets(); renderAgents(); renderCustomers(); if (typeof renderConsignments === 'function') renderConsignments(); renderStats(); populateCbSelect();
              }, 150);
            }
          }, 600);
        } catch (e) {
          _suppressSnapshot = false;
          console.warn('saveItem Firebase fail:', e);
          showToast('⚠️ Firebase บันทึกไม่ได้ — บันทึก offline', '#e05050');
        }
      }
      saveTolocalStorage();
      return item;
    }

    async function deleteItemFromDB(colName, id) {
      if (_fbReady && _db && id) {
        try {
          const { collection, doc, deleteDoc } = window._firestoreLib;
          await deleteDoc(doc(collection(_db, colName), id));
        } catch (e) { console.warn('deleteItem Firebase fail:', e); }
      }
      saveTolocalStorage();
    }

    async function saveDB() {
      if (_fbReady && _db) {
        _suppressSnapshot = true; // block onSnapshot during batch write
        for (const col of ['assets', 'agents', 'customers']) {
          try {
            const { collection, doc, setDoc, writeBatch } = window._firestoreLib;
            const batch = writeBatch(_db);
            DB[col].forEach(item => {
              if (!item.id) item.id = genId();
              const ref = doc(collection(_db, col), item.id);
              batch.set(ref, item);
            });
            await batch.commit();
          } catch (e) { console.warn('saveDB Firebase fail:', col, e); }
        }
        setTimeout(() => { _suppressSnapshot = false; }, 800);
      }
      saveTolocalStorage();
    }

    // ============================
    // FIREBASE AUTH SYNC (Users collection)
    // ============================
    async function saveAuthToFirebase() {
      if (!_fbReady || !_db) return;
      try {
        const { collection, doc, setDoc, writeBatch } = window._firestoreLib;
        const batch = writeBatch(_db);
        AUTH.users.forEach(u => {
          // normalize email lowercase ก่อน save ขึ้น Firebase
          const email = (u.email || '').toLowerCase().trim();
          const safeId = email.replace(/[.@]/g, '_');
          const ref = doc(collection(_db, 'users'), safeId);
          batch.set(ref, { ...u, email });
        });
        await batch.commit();
      } catch (e) { console.warn('saveAuthToFirebase fail:', e); }
    }

    async function hashPassword(plain) {
      if (!plain) return '';
      if (/^[a-f0-9]{64}$/i.test(plain)) return plain;
      const encoder = new TextEncoder();
      const data = encoder.encode(plain + 'benzhome_salt_2026');
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      return Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, '0')).join('');
    }

    function migrateUserFields(user) {
      if (!user) return user;
      if (user.role && !user.accessLevel) {
        const mapping = {
          'super_admin': { accessLevel: 'super_admin', businessRole: 'agent' },
          'admin':       { accessLevel: 'admin',       businessRole: 'agent' },
          'agent':       { accessLevel: 'member',      businessRole: 'agent' },
          'owner':       { accessLevel: 'member',      businessRole: 'owner' },
          'customer':    { accessLevel: 'member',      businessRole: 'customer' },
          'pending':     { accessLevel: 'member',      businessRole: 'agent', status: 'pending' },
          'rejected':    { accessLevel: 'member',      businessRole: 'agent', status: 'suspended' },
          'viewer':      { accessLevel: 'member',      businessRole: 'customer' },
        };
        const mapped = mapping[user.role] || mapping['viewer'];
        Object.assign(user, mapped);
        if (!user.status) user.status = 'active';
      }
      if (!user.accessLevel) user.accessLevel = 'member';
      if (!user.businessRole) user.businessRole = 'customer';
      if (!user.status) user.status = 'active';

      if (user.email) {
        const em = user.email.toLowerCase().trim();
        if (em === 'online.ibnn@gmail.com' || em === 'admin@benzhome.com') {
          user.accessLevel = 'super_admin';
          user.businessRole = 'agent';
          user.status = 'active';
        }
      }

      if (user.status === 'pending') {
        user.role = 'pending';
      } else if (user.status === 'suspended') {
        user.role = 'rejected';
      } else if (user.accessLevel === 'super_admin' || user.accessLevel === 'admin') {
        user.role = 'admin';
      } else {
        user.role = user.businessRole;
      }
      return user;
    }

    function getRoleUIBadge(accessLevel, businessRole, status) {
      if (status === 'pending') {
        return ['⏳ รออนุมัติ', 'role role-viewer'];
      }
      if (status === 'suspended') {
        return ['⛔ ระงับการใช้งาน', 'role role-viewer'];
      }
      if (accessLevel === 'super_admin') {
        return ['👑 Super Admin', 'role role-admin'];
      }
      if (accessLevel === 'admin') {
        return ['⭐ Admin', 'role role-admin'];
      }
      if (businessRole === 'agent') {
        return ['🏠 Agent', 'role role-agent'];
      }
      if (businessRole === 'owner') {
        return ['🏡 Owner', 'role role-agent'];
      }
      if (businessRole === 'customer') {
        return ['👤 Member', 'role role-viewer'];
      }
      return ['👁️ Viewer', 'role role-viewer'];
    }
    window.getRoleUIBadge = getRoleUIBadge;

    async function migrateOldAuthData() {
      if (!_fbReady || !_db) return;
      try {
        const { doc, getDoc, collection, setDoc } = window._firestoreLib;
        const oldRef = doc(_db, 'yb_auth', 'auth_data');
        const oldSnap = await getDoc(oldRef);
        if (oldSnap.exists()) {
          const oldData = oldSnap.data();
          if (oldData && Array.isArray(oldData.users)) {
            console.log('🔄 Found legacy auth_data. Migrating users...');
            for (const u of oldData.users) {
              if (u.email) {
                const email = u.email.toLowerCase().trim();
                const safeId = email.replace(/[.@]/g, '_');
                const userRef = doc(collection(_db, 'users'), safeId);
                const checkSnap = await getDoc(userRef);
                if (!checkSnap.exists()) {
                  let migratedUser = migrateUserFields(u);
                  if (email === 'online.ibnn@gmail.com' || email === 'admin@benzhome.com') {
                    migratedUser.accessLevel = 'super_admin';
                    migratedUser.businessRole = 'agent';
                    migratedUser.status = 'active';
                  }
                  await setDoc(userRef, { ...migratedUser, email });
                  console.log('Migrated user:', email);
                }
              }
            }
          }
        }
      } catch (e) {
        console.warn('migrateOldAuthData failed (might not exist):', e);
      }
    }

    function checkCurrentUserSessionSync() {
      if (!AUTH.current || !AUTH.users.length) return;
      const currentEmail = (AUTH.current.email || '').toLowerCase().trim();
      const updatedUser = AUTH.users.find(u => (u.email || '').toLowerCase().trim() === currentEmail);
      if (updatedUser) {
        const uMigrated = migrateUserFields({ ...updatedUser });
        const cMigrated = migrateUserFields({ ...AUTH.current });

        const accessChanged = uMigrated.accessLevel !== cMigrated.accessLevel;
        const roleChanged = uMigrated.businessRole !== cMigrated.businessRole;
        const statusChanged = uMigrated.status !== cMigrated.status;
        const nameChanged = uMigrated.displayname !== cMigrated.displayname;

        if (accessChanged || roleChanged || statusChanged || nameChanged) {
          console.log('🔄 User role/name updated. Re-applying permissions.');
          AUTH.current = { ...AUTH.current, ...uMigrated };
          saveSession(AUTH.current);
          applyRoleAccess(AUTH.current);
          
          // Update header name & role UI
          const headerName = document.getElementById('headerUserName');
          if (headerName) headerName.textContent = AUTH.current.displayname || AUTH.current.email;
          const roleEl = document.getElementById('headerUserRole');
          if (roleEl) {
            const [label, cls] = getRoleUIBadge(AUTH.current.accessLevel, AUTH.current.businessRole, AUTH.current.status);
            roleEl.textContent = label;
            roleEl.className = cls;
          }
          _renderPendingBanner(AUTH.current);

          // Re-render UI components that depend on permissions/role
          if (typeof renderAssets === 'function') renderAssets();
          if (typeof renderCustomers === 'function') renderCustomers();
        }
      }
    }
    window._checkCurrentUserSessionSync = checkCurrentUserSessionSync;

    async function loadAuthFromFirebase() {
      if (!_fbReady || !_db) return false;
      try {
        await migrateOldAuthData();
        const { collection, getDocs } = window._firestoreLib;
        const snap = await getDocs(collection(_db, 'users'));
        if (snap.docs.length > 0) {
          const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          // normalize: lowercase email, กรองเฉพาะ user ที่มี email ถูกต้อง
          const fbUsers = snap.docs.map(d => {
            const u = d.data();
            if (u.email) u.email = u.email.toLowerCase().trim();
            let migrated = migrateUserFields(u);
            // Force Super Admin email promotion
            if (migrated.email === 'online.ibnn@gmail.com' || migrated.email === 'admin@benzhome.com') {
              migrated.accessLevel = 'super_admin';
            }
            return migrated;
          }).filter(u => u.email && emailRe.test(u.email));

          if (fbUsers.length > 0) {
            AUTH.users = fbUsers;
            checkCurrentUserSessionSync();

            // ตรวจ hasAdmin หลัง sync
            const hasAdmin = AUTH.users.some(u => u.accessLevel === 'super_admin' || u.role === 'admin');
            if (!hasAdmin) {
              AUTH.users.unshift({
                email: 'admin@benzhome.com',
                password: 'e120a3092318cb7232959353914ea3df5ecddca18ff2eb269eb5d024b33aa0f3', // hashed admin1234
                displayname: 'ผู้ดูแลระบบ',
                accessLevel: 'super_admin',
                businessRole: 'agent',
                status: 'active',
                note: 'Super Admin',
                linkedAgentId: null
              });
            }
            // บันทึกลง localStorage (ไม่ sync กลับ Firebase เพื่อป้องกัน loop)
            localStorage.setItem('yb_auth', JSON.stringify({ users: AUTH.users }));
            return true;
          }
        }
      } catch (e) { console.warn('loadAuthFromFirebase fail:', e); }
      return false;
    }

    function saveAuth() {
      localStorage.setItem('yb_auth', JSON.stringify({ users: AUTH.users }));
      saveAuthToFirebase(); // async sync to Firebase
    }

    // บันทึกเฉพาะ localStorage ไม่ sync Firebase (ป้องกัน overwrite loop)
    function saveAuthLocal() {
      localStorage.setItem('yb_auth', JSON.stringify({ users: AUTH.users }));
    }

    // ============================
    // SESSION & REMEMBER KEYS — ต้องประกาศก่อน loadAuth() เรียก
    // ============================
    const REMEMBER_KEY = 'yb_remember';
    const SESSION_KEY = 'yb_session';

    function loadRemembered() {
      try {
        const s = localStorage.getItem(REMEMBER_KEY);
        if (!s) return;
        const { email, pw } = JSON.parse(s);
        document.getElementById('loginUsername').value = email || '';
        document.getElementById('loginPassword').value = pw || '';
        document.getElementById('rememberMe').checked = true;
      } catch (e) { }
    }

    function saveSession(user) {
      try {
        localStorage.setItem(SESSION_KEY, JSON.stringify({ email: (user.email || '').toLowerCase().trim(), pw: user.password }));
      } catch (e) { }
    }

    function clearSession() {
      localStorage.removeItem(SESSION_KEY);
    }

    // Helper: ทำ login จริง (ใช้ร่วมกันระหว่าง doLogin และ retry)
    function performLogin(found, remember) {
      found = migrateUserFields(found);
      const email = found.email;
      const pw = found.password;
      const errEl = document.getElementById('loginError');
      if (errEl) errEl.style.display = 'none';

      // ── บล็อก suspended ──
      if (found.status === 'suspended') {
        if (errEl) {
          errEl.style.display = 'flex';
          errEl.querySelector('#errorText') && (errEl.querySelector('#errorText').textContent =
            '❌ บัญชีของคุณถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ');
        }
        return;
      }

      if (remember) {
        localStorage.setItem(REMEMBER_KEY, JSON.stringify({ email, pw }));
      } else {
        localStorage.removeItem(REMEMBER_KEY);
      }
      AUTH.current = found;
      saveSession(found);
      document.getElementById('loginScreen').style.display = 'none';
      document.getElementById('appShell').style.display = 'block';

      // ── Header badge ──
      const headerName = document.getElementById('headerUserName');
      if (headerName) headerName.textContent = found.displayname || found.email;
      const roleEl = document.getElementById('headerUserRole');
      if (roleEl) {
        const [label, cls] = getRoleUIBadge(found.accessLevel, found.businessRole, found.status);
        roleEl.textContent = label;
        roleEl.className = cls;
      }

      applyRoleAccess(found);
      loadDB();
      updateSettingsProfileUI();

      // ── Banner: แจ้งเตือน pending ──
      _renderPendingBanner(found);
    }

    function _renderPendingBanner(userObj) {
      const user = migrateUserFields(userObj || AUTH.current);
      const isPending = user && user.status === 'pending';
      let banner = document.getElementById('pendingBanner');
      if (isPending) {
        if (!banner) {
          banner = document.createElement('div');
          banner.id = 'pendingBanner';
          banner.style.cssText = [
            'position:fixed;top:0;left:0;right:0;z-index:8000',
            'background:linear-gradient(90deg,#7a5800,#c9a84c,#7a5800)',
            'color:#fff;font-size:12px;font-weight:700',
            'padding:8px 16px;text-align:center',
            'display:flex;align-items:center;justify-content:center;gap:8px',
          ].join(';');
          banner.innerHTML = '<span>⏳ บัญชีของคุณอยู่ระหว่างรอการอนุมัติจาก Admin — บางฟีเจอร์ถูกจำกัดชั่วคราว</span>';
          document.body.prepend(banner);
          // เลื่อน app shell ลงให้พ้น banner
          const shell = document.getElementById('appShell');
          if (shell) shell.style.paddingTop = '36px';
        }
      } else {
        if (banner) {
          banner.remove();
          const shell = document.getElementById('appShell');
          if (shell) shell.style.paddingTop = '';
        }
      }
    }

    async function tryRestoreSession(fromFirebase) {
      try {
        const s = localStorage.getItem(SESSION_KEY);
        if (!s) return false;
        const raw = JSON.parse(s);
        const email = (raw.email || '').toLowerCase().trim();
        const pw = raw.pw;
        const hashedPw = await hashPassword(pw);

        let found = AUTH.users.find(u => (u.email || '').toLowerCase().trim() === email && 
          (u.password === pw || u.password === hashedPw)
        );

        if (!found) {
          if (fromFirebase) {
            clearSession(); return false;
          }
          if (!_fbReady) {
            clearSession(); return false;
          }
          return false;
        }

        // Auto-migrate local storage session to hash
        if (found.password === hashedPw && pw !== hashedPw) {
          console.log('🔄 Migrating session credentials to hash...');
          saveSession(found);
        }

        performLogin(found, false);
        return true;
      } catch (e) { clearSession(); return false; }
    }

    function loadAuth() {
      try {
        const s = localStorage.getItem('yb_auth');
        if (s) {
          const parsed = JSON.parse(s);
          if (parsed.users) {
            const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            parsed.users = parsed.users
              .map(u => {
                if (!u.email && u.username) u.email = u.username;
                if (u.email) u.email = u.email.toLowerCase().trim();
                return migrateUserFields(u);
              })
              .filter(u => u.email && emailRe.test(u.email));
          }
          AUTH = { users: parsed.users || [], current: null };
        }
      } catch (e) { console.warn('loadAuth error:', e); }
      const hasAdmin = AUTH.users.some(u => u.accessLevel === 'super_admin' || u.role === 'admin');
      if (!AUTH.users.length || !hasAdmin) {
        AUTH.users = AUTH.users.filter(u => u.role !== 'admin' && u.accessLevel !== 'super_admin');
        AUTH.users.unshift({
          email: 'admin@benzhome.com',
          password: 'e120a3092318cb7232959353914ea3df5ecddca18ff2eb269eb5d024b33aa0f3', // hashed admin1234
          displayname: 'ผู้ดูแลระบบ',
          accessLevel: 'super_admin',
          businessRole: 'agent',
          status: 'active',
          note: 'Super Admin',
          linkedAgentId: null
        });
        localStorage.setItem('yb_auth', JSON.stringify({ users: AUTH.users }));
      }
    }

    // โหลด auth ทันที จาก localStorage ก่อน
    loadAuth();

    // One-time migration: normalize email เป็น lowercase ทั้งหมดใน localStorage
    // แก้ข้อมูลเก่าที่อาจเคย save email ตัวใหญ่/เล็กไม่สม่ำเสมอ
    (function migrateEmailCase() {
      try {
        let changed = false;
        AUTH.users = AUTH.users.map(u => {
          const norm = (u.email || '').toLowerCase().trim();
          if (norm !== u.email) { changed = true; return { ...u, email: norm }; }
          return u;
        });
        if (changed) {
          localStorage.setItem('yb_auth', JSON.stringify({ users: AUTH.users }));
          console.log('✅ Email migration done (lowercase)');
        }
      } catch (e) { }
    })();

    (async function initApp() {
      loadRemembered(); // โหลด remembered credentials (กรอก form)
      // ลอง restore session ทันที (สำหรับ offline/localStorage mode)
      // ถ้า Firebase active จะเรียก tryRestoreSession อีกครั้งหลัง sync
      await tryRestoreSession();

      const storageMode = localStorage.getItem('yb_storage_mode') || 'firebase';
      const isFirebaseConfigured = FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.apiKey !== "YOUR_API_KEY" && FIREBASE_CONFIG.apiKey !== "";

      if (storageMode === 'firebase' && isFirebaseConfigured) {
        initFirebase().then(async (ok) => {
          if (ok) {
            const synced = await loadAuthFromFirebase();
            if (synced) console.log('✅ Auth synced from Firebase');
            // ตรวจ hasAdmin อีกครั้งหลัง sync
            const hasAdmin = AUTH.users.some(u => u.accessLevel === 'super_admin' || u.role === 'admin');
            if (!hasAdmin) {
              AUTH.users.unshift({
                email: 'admin@benzhome.com',
                password: 'e120a3092318cb7232959353914ea3df5ecddca18ff2eb269eb5d024b33aa0f3', // hashed admin1234
                displayname: 'ผู้ดูแลระบบ',
                accessLevel: 'super_admin',
                businessRole: 'agent',
                status: 'active',
                note: 'Super Admin',
                linkedAgentId: null
              });
              saveAuth();
            }
            // เริ่ม real-time sync อัตโนมัติ
            startRealtimeSync();
            // เริ่มระบบ scheduled backup
            initScheduledBackup();
          }
          updateFirebaseStatus();
          if (!AUTH.current) {
            await tryRestoreSession(true); // true = fromFirebase sync เสร็จแล้ว ลบ session ได้ถ้าหาไม่เจอ
          }
          if (!AUTH.current) {
            window.location.href = 'login.html';
          }
        });
      } else {
        console.log('📴 Running in Offline Local Mode');
        _fbReady = false;
        updateFirebaseStatus();
        initScheduledBackup();
        if (!AUTH.current) {
          await tryRestoreSession(false);
        }
        if (!AUTH.current) {
          window.location.href = 'login.html';
        }
      }
    })();

    function resetAuthData() {
      const cur = migrateUserFields(AUTH.current);
      if (!cur || cur.accessLevel !== 'super_admin') {
        alert('❌ ขออภัย เฉพาะผู้ดูแลระบบสูงสุด (Super Admin) เท่านั้นที่สามารถรีเซ็ตข้อมูลได้');
        return;
      }
      // แสดง users ที่มีอยู่ก่อน เพื่อ debug
      const userList = AUTH.users.map(u => u.email + ' [' + (u.accessLevel || u.role) + ']').join('\n') || '(ว่าง)';
      if (!confirm('รีเซ็ตข้อมูล User ทั้งหมด?\n\nUsers ปัจจุบัน:\n' + userList + '\n\n(จะสร้าง admin default ใหม่ email: admin@benzhome.com / admin1234)')) return;
      localStorage.removeItem('yb_auth');
      localStorage.removeItem('yb_session');
      AUTH = { users: [], current: null };
      loadAuth();
      document.getElementById('loginError').style.display = 'none';
      document.getElementById('loginUsername').value = 'admin@benzhome.com';
      document.getElementById('loginPassword').value = '';
      alert('✅ รีเซ็ตแล้ว\nกรุณา login ใหม่ด้วย\nEmail: admin@benzhome.com\nPassword: admin1234');
    }

    // ========================================================
    // UNIFIED SETTINGS HELPERS
    // ========================================================
    function switchSettingsTab(tabName, btn) {
      const cur = migrateUserFields(AUTH.current);
      const isSuperAdmin = cur && cur.accessLevel === 'super_admin';
      const isAdmin = cur && (cur.accessLevel === 'super_admin' || cur.accessLevel === 'admin');
      
      const superAdminTabs = ['reset', 'quota'];
      const adminTabs = ['users', 'firebase', 'backup', 'csv', 'platforms', 'bots'];
      
      if (superAdminTabs.includes(tabName) && !isSuperAdmin) {
        alert('❌ ขออภัย เฉพาะผู้ดูแลระบบสูงสุด (Super Admin) เท่านั้นที่สามารถเข้าถึงส่วนนี้ได้');
        switchSettingsTab('profile');
        return;
      }
      if (adminTabs.includes(tabName) && !isAdmin) {
        alert('❌ ขออภัย เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่สามารถเข้าถึงส่วนนี้ได้');
        switchSettingsTab('profile');
        return;
      }

      // Hide all sub-sections in settings
      document.querySelectorAll('.settings-section').forEach(s => s.classList.remove('active'));
      // Remove active class from all settings nav items
      document.querySelectorAll('.snav-item').forEach(b => b.classList.remove('active'));
      
      // Show target sub-section
      const target = document.getElementById('ssec-' + tabName);
      if (target) target.classList.add('active');
      
      // Mark nav button active
      if (btn) {
        btn.classList.add('active');
      } else {
        const btnId = 'snav-' + tabName;
        const el = document.getElementById(btnId);
        if (el) el.classList.add('active');
        else {
          const profileBtn = document.querySelector('.snav-item[onclick*="profile"]');
          if (profileBtn) profileBtn.classList.add('active');
        }
      }
      
      // Action when specific tabs are loaded
      if (tabName === 'users') {
        renderUsers();
      } else if (tabName === 'firebase') {
        loadFbConfigUI(true);
      } else if (tabName === 'backup') {
        loadBackupSettingsUI();
        updateBackupStatus();
      } else if (tabName === 'quota') {
        loadQuotaSettingsUI();
      } else if (tabName === 'platforms') {
        loadPlatformCredentials();
      }
    }

    // Load quota limit from localStorage or default to 5
    let _dailyQuotaLimit = parseInt(localStorage.getItem('yb_quota_limit')) || 5;

    function loadQuotaSettingsUI() {
      const input = document.getElementById('quotaLimitInput');
      if (input) input.value = _dailyQuotaLimit;
    }

    function saveQuotaLimit() {
      const val = parseInt(document.getElementById('quotaLimitInput').value);
      if (isNaN(val) || val < 1) {
        alert('❌ กรุณากรอกจำนวนโควตาที่ถูกต้อง (ขั้นต่ำ 1)');
        return;
      }
      _dailyQuotaLimit = val;
      localStorage.setItem('yb_quota_limit', val);
      alert('💾 บันทึกการตั้งค่าโควตาสำเร็จแล้ว: ' + val + ' เคสต่อวัน');
    }

    // ==========================================
    // PLATFORM CREDENTIALS & AUTOMATION SETTINGS
    // ==========================================
    function encryptVal(text, key) {
      if (!text) return "";
      try {
        return CryptoJS.AES.encrypt(text, key).toString();
      } catch (e) {
        console.error("Encryption failed:", e);
        return text;
      }
    }

    function decryptVal(cipher, key) {
      if (!cipher) return "";
      try {
        const bytes = CryptoJS.AES.decrypt(cipher, key);
        return bytes.toString(CryptoJS.enc.Utf8);
      } catch (e) {
        console.error("Decryption failed:", e);
        return "";
      }
    }

    function populateSettingsAgentSelect() {
      const sel = document.getElementById('botDefaultAgent');
      if (!sel) return;
      sel.innerHTML = '<option value="">-- ใช้ข้อมูลติดต่อจากทรัพย์สิน --</option>' +
        (DB.agents || []).map((ag) => `<option value="${ag.id}">${ag.name || 'ไม่มีชื่อ'}${ag.company ? ' (' + ag.company + ')' : ''}</option>`).join('');
    }

    function loadPlatformCredentials() {
      populateSettingsAgentSelect();

      const creds = DB.platformCredentials && DB.platformCredentials[0] ? DB.platformCredentials[0] : null;
      const keyInput = document.getElementById('botSecretKey');
      const key = keyInput ? keyInput.value : "BenzHomeAutoKey123";

      if (creds) {
        document.getElementById('botLviUser').value = creds.lviUser || "";
        document.getElementById('botLviPass').value = creds.lviPassEnc ? decryptVal(creds.lviPassEnc, key) : "";
        document.getElementById('botLviActive').checked = !!creds.lviActive;

        document.getElementById('botEnnxoUser').value = creds.ennxoUser || "";
        document.getElementById('botEnnxoPass').value = creds.ennxoPassEnc ? decryptVal(creds.ennxoPassEnc, key) : "";
        document.getElementById('botEnnxoActive').checked = !!creds.ennxoActive;

        if (document.getElementById('botFbUploadPostKey')) {
          document.getElementById('botFbUploadPostKey').value = creds.fbUploadPostKeyEnc ? decryptVal(creds.fbUploadPostKeyEnc, key) : "";
        }
        if (document.getElementById('botFbUploadPostProfile')) {
          document.getElementById('botFbUploadPostProfile').value = creds.fbUploadPostProfile || "";
        }
        if (document.getElementById('botFbUploadPostActive')) {
          document.getElementById('botFbUploadPostActive').checked = !!creds.fbUploadPostActive;
        }

        const pageSelect = document.getElementById('botFbPageSelect');
        if (pageSelect) {
          pageSelect.innerHTML = '<option value="">-- เลือกหน้าเพจ --</option>';
          const pages = creds.fbPagesList || [];
          pages.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = p.name;
            if (creds.fbPageSelect && creds.fbPageSelect === p.id) {
              opt.selected = true;
            }
            pageSelect.appendChild(opt);
          });
        }

        document.getElementById('botDefaultSource').value = creds.defaultSource || "asset_template";
        document.getElementById('botDefaultAgent').value = creds.defaultAgent || "";
        
        onBotSourceChange();
        
        const statusText = document.getElementById('cookieSyncStatus');
        if (statusText) {
          if (creds.cookiesSyncedAt) {
            statusText.textContent = "ซิงค์ล่าสุดเมื่อ: " + new Date(creds.cookiesSyncedAt).toLocaleString('th-TH');
          } else {
            statusText.textContent = "ยังไม่ได้ซิงค์คุกกี้";
          }
        }
      }
    }

    async function savePlatformCredentials() {
      const keyInput = document.getElementById('botSecretKey');
      const key = keyInput ? keyInput.value : "BenzHomeAutoKey123";
      if (!key) {
        alert("❌ กรุณากรอก Encryption Secret Key เพื่อความปลอดภัย");
        return;
      }

      const lviUser = document.getElementById('botLviUser').value;
      const lviPass = document.getElementById('botLviPass').value;
      const lviActive = document.getElementById('botLviActive').checked;

      const ennxoUser = document.getElementById('botEnnxoUser').value;
      const ennxoPass = document.getElementById('botEnnxoPass').value;
      const ennxoActive = document.getElementById('botEnnxoActive').checked;

      const fbUploadPostKey = document.getElementById('botFbUploadPostKey') ? document.getElementById('botFbUploadPostKey').value : "";
      const fbUploadPostProfile = document.getElementById('botFbUploadPostProfile') ? document.getElementById('botFbUploadPostProfile').value : "";
      const fbPageSelect = document.getElementById('botFbPageSelect') ? document.getElementById('botFbPageSelect').value : "";
      const fbUploadPostActive = document.getElementById('botFbUploadPostActive') ? document.getElementById('botFbUploadPostActive').checked : false;

      const defaultSource = document.getElementById('botDefaultSource').value;
      const defaultAgent = document.getElementById('botDefaultAgent').value;

      const lviPassEnc = lviPass ? encryptVal(lviPass, key) : "";
      const ennxoPassEnc = ennxoPass ? encryptVal(ennxoPass, key) : "";
      const fbUploadPostKeyEnc = fbUploadPostKey ? encryptVal(fbUploadPostKey, key) : "";

      const credsId = DB.platformCredentials && DB.platformCredentials[0] ? DB.platformCredentials[0].id : "main_creds";

      const credsObj = {
        id: credsId,
        lviUser,
        lviPassEnc,
        lviActive,
        ennxoUser,
        ennxoPassEnc,
        ennxoActive,
        fbUploadPostKeyEnc,
        fbUploadPostProfile,
        fbPageSelect,
        fbUploadPostActive,
        defaultSource,
        defaultAgent,
        cookiesSyncedAt: DB.platformCredentials && DB.platformCredentials[0] ? (DB.platformCredentials[0].cookiesSyncedAt || null) : null,
        cookies: DB.platformCredentials && DB.platformCredentials[0] ? (DB.platformCredentials[0].cookies || null) : null,
        fbPagesList: DB.platformCredentials && DB.platformCredentials[0] ? (DB.platformCredentials[0].fbPagesList || []) : []
      };

      await saveItem('platformCredentials', credsObj, credsId);

      if (!_realtimeSyncActive) {
        if (!DB.platformCredentials) DB.platformCredentials = [];
        DB.platformCredentials[0] = credsObj;
        saveTolocalStorage();
      }

      alert("💾 บันทึกการตั้งค่าแพลตฟอร์มบอทเรียบร้อยแล้วค่ะ");
    }

    function onBotSourceChange() {
      const select = document.getElementById('botDefaultSource');
      const warning = document.getElementById('botClipboardWarning');
      if (select && warning) {
        warning.style.display = (select.value === 'clipboard') ? 'block' : 'none';
      }
    }

    async function syncActiveCookies() {
      const statusText = document.getElementById('cookieSyncStatus');
      if (statusText) statusText.textContent = "กำลังซิงค์...";

      if (window.chrome && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ action: "syncCookies" }, async (response) => {
          if (response && response.success) {
            statusText.textContent = "ซิงค์สำเร็จ! เมื่อ: " + new Date().toLocaleString('th-TH');
            showToast("✅ ซิงค์คุกกี้สิทธิ์ล็อกอินสำเร็จ");
          } else {
            statusText.textContent = "ซิงค์ไม่สำเร็จ: " + (response ? response.error : "ไม่พบ Extension");
            showToast("❌ ซิงค์คุกกี้ล้มเหลว", "#e05050");
          }
        });
      } else {
        setTimeout(async () => {
          const credsId = DB.platformCredentials && DB.platformCredentials[0] ? DB.platformCredentials[0].id : "main_creds";
          const mockCookies = [
            { domain: ".livinginsider.com", name: "PHPSESSID", value: "mock_session_id_12345" },
            { domain: ".ennxo.com", name: "session", value: "mock_ennxo_session_98765" }
          ];
          
          if (!DB.platformCredentials) DB.platformCredentials = [];
          const currentCreds = DB.platformCredentials[0] || { id: credsId };
          currentCreds.cookies = mockCookies;
          currentCreds.cookiesSyncedAt = new Date().toISOString();
          DB.platformCredentials[0] = currentCreds;
          
          await saveItem('platformCredentials', currentCreds, credsId);
          
          if (statusText) statusText.textContent = "ซิงค์สำเร็จ (จำลอง)! เมื่อ: " + new Date().toLocaleString('th-TH');
          showToast("✅ ซิงค์คุกกี้สิทธิ์ล็อกอินสำเร็จ (Mock)");
        }, 1000);
      }
    }

    // Expose functions globally for HTML trigger
    window.savePlatformCredentials = savePlatformCredentials;
    window.onBotSourceChange = onBotSourceChange;
    window.syncActiveCookies = syncActiveCookies;

    function updateSettingsProfileUI() {
      const cur = AUTH.current;
      if (!cur) return;
      
      const nameEl = document.getElementById('profileName');
      const emailEl = document.getElementById('profileEmail');
      const avatarEl = document.getElementById('profileAvatar');
      
      if (nameEl) nameEl.textContent = cur.displayname || 'ผู้ใช้งาน';
      if (emailEl) emailEl.textContent = cur.email || '';
      
      if (avatarEl) {
        const initial = (cur.displayname || cur.email || '?').charAt(0).toUpperCase();
        avatarEl.textContent = initial;
      }

      // Update drawer user profile (for mobile views)
      const dNameEl = document.getElementById('drawerUserName');
      const dRoleEl = document.getElementById('drawerUserRole');
      const dAvatarEl = document.getElementById('drawerAvatar');
      
      if (dNameEl) dNameEl.textContent = cur.displayname || 'ผู้ใช้งาน';
      if (dRoleEl) {
        const u = migrateUserFields(cur);
        const [label, cls] = getRoleUIBadge(u.accessLevel, u.businessRole, u.status);
        dRoleEl.textContent = label;
      }
      if (dAvatarEl) {
        const initial = (cur.displayname || cur.email || '?').charAt(0).toUpperCase();
        dAvatarEl.textContent = initial;
      }
      
      // Update storage mode radio checked status
      const storageMode = localStorage.getItem('yb_storage_mode') || 'firebase';
      const rad = document.querySelector(`input[name="yb_storage_mode"][value="${storageMode}"]`);
      if (rad) rad.checked = true;
    }

    function toggleStorageMode(mode) {
      if (mode === 'firebase') {
        const isFirebaseConfigured = FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.apiKey !== "YOUR_API_KEY" && FIREBASE_CONFIG.apiKey !== "";
        if (!isFirebaseConfigured) {
          alert('⚠️ กรุณากรอก Firebase Configuration และเชื่อมต่อก่อนเปิดใช้งานโหมดคลาวด์');
          const localRad = document.querySelector('input[name="yb_storage_mode"][value="local"]');
          if (localRad) localRad.checked = true;
          return;
        }
      }
      localStorage.setItem('yb_storage_mode', mode);
      showToast('💾 เปลี่ยนโหมดจัดเก็บข้อมูลเป็น: ' + (mode === 'local' ? 'Offline Local' : 'Firebase Cloud'), '#50c878');
      
      if (confirm('🔄 ระบบจำเป็นต้องโหลดหน้าเว็บใหม่เพื่อใช้โหมดจัดเก็บข้อมูลใหม่ ต้องการโหลดทันทีหรือไม่?')) {
        location.reload();
      }
    }

    function confirmSystemReset() {
      const inp = document.getElementById('resetConfirmInput');
      if (!inp) return;
      if (inp.value !== 'CONFIRM') {
        alert('❌ กรุณาพิมพ์คำว่า CONFIRM ให้ถูกต้องเพื่อยืนยัน');
        return;
      }
      clearAllData();
      inp.value = '';
    }

    // ============================
    // SCHEDULED AUTO BACKUP
    // ============================
    const BACKUP_CONFIG_KEY = 'yb_backup_config';
    let _backupTimer = null;

    function getBackupConfig() {
      try {
        const s = localStorage.getItem(BACKUP_CONFIG_KEY);
        if (s) return JSON.parse(s);
      } catch (e) { }
      return { enabled: false, googleDriveScriptUrl: '', intervalHours: 24, lastBackup: null };
    }

    function saveBackupConfig(cfg) {
      localStorage.setItem(BACKUP_CONFIG_KEY, JSON.stringify(cfg));
    }

    function initScheduledBackup() {
      if (_backupTimer) clearInterval(_backupTimer);
      const cfg = getBackupConfig();
      if (!cfg.enabled || !cfg.googleDriveScriptUrl) return;
      // ตรวจว่าถึงเวลา backup หรือยัง
      checkAndRunBackup();
      // ตั้ง interval ทุก 30 นาทีเพื่อตรวจสอบ
      _backupTimer = setInterval(checkAndRunBackup, 30 * 60 * 1000);
      console.log('📅 Scheduled backup initialized, interval:', cfg.intervalHours, 'hours');
    }

    function checkAndRunBackup() {
      const cfg = getBackupConfig();
      if (!cfg.enabled || !cfg.googleDriveScriptUrl) return;
      const now = Date.now();
      const lastBackup = cfg.lastBackup || 0;
      const intervalMs = (cfg.intervalHours || 24) * 60 * 60 * 1000;
      if (now - lastBackup >= intervalMs) {
        runAutoBackup();
      }
    }

    async function runAutoBackup(manual = false) {
      const cfg = getBackupConfig();
      if (!cfg.googleDriveScriptUrl) {
        if (manual) alert('กรุณาตั้งค่า Google Drive Web App URL ก่อน');
        return;
      }
      const payload = {
        version: 2,
        exportedAt: new Date().toISOString(),
        DB: DB,
        users: AUTH.users
      };
      const jsonStr = JSON.stringify(payload, null, 2);
      const dateStr = new Date().toISOString().slice(0, 10);
      const filename = 'benzhome_backup_' + dateStr + '.json';

      // บันทึกเวลา backup
      cfg.lastBackup = Date.now();
      saveBackupConfig(cfg);

      let success = false;
      let errorMsg = '';

      // ส่งข้อมูลไป Google Drive
      try {
        // ใช้ Content-Type text/plain เพื่อหลีกเลี่ยง CORS Preflight OPTIONS request ใน Google Apps Script
        const response = await fetch(cfg.googleDriveScriptUrl, {
          method: 'POST',
          mode: 'cors',
          headers: {
            'Content-Type': 'text/plain'
          },
          body: JSON.stringify({
            filename: filename,
            content: jsonStr
          })
        });
        const resJson = await response.json();
        if (resJson && resJson.status === 'success') {
          success = true;
          console.log('✅ Auto Backup to Google Drive success, fileId:', resJson.fileId);
          showToast('📁 สำรองข้อมูลไป Google Drive สำเร็จ!', '#50c878');
        } else {
          errorMsg = resJson.message || 'Unknown error';
        }
      } catch (e) {
        errorMsg = e.message;
        console.warn('Google Drive backup fail:', e);
      }

      // Fallback: ถ้าเป็นแมนนวลแต่อัปโหลดขึ้น Google Drive ล้มเหลว ให้ดาวน์โหลดไฟล์ลงเครื่องแทน
      if (manual && !success) {
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        a.click();
        URL.revokeObjectURL(a.href);
        showToast('📥 ดาวน์โหลด Backup ลงเครื่องแล้ว (อัปโหลดล้มเหลว)', '#f0ad4e');
        if (errorMsg) {
          alert('ไม่สามารถอัปโหลดไปยัง Google Drive ได้:\n' + errorMsg);
        }
      }

      updateBackupStatus();
    }

    function saveBackupSettings() {
      const cfg = {
        enabled: document.getElementById('bs_enabled').checked,
        googleDriveScriptUrl: document.getElementById('bs_gdUrl').value.trim(),
        intervalHours: parseInt(document.getElementById('bs_interval').value) || 24,
        lastBackup: getBackupConfig().lastBackup
      };
      saveBackupConfig(cfg);
      initScheduledBackup();
      showToast('✅ บันทึกการตั้งค่า Backup แล้ว', '#50c878');
      updateBackupStatus();
    }

    function loadBackupSettingsUI() {
      const cfg = getBackupConfig();
      const el = id => document.getElementById(id);
      if (el('bs_enabled')) el('bs_enabled').checked = cfg.enabled;
      if (el('bs_gdUrl')) el('bs_gdUrl').value = cfg.googleDriveScriptUrl || '';
      if (el('bs_interval')) el('bs_interval').value = cfg.intervalHours || 24;
      updateBackupStatus();
    }

    function updateBackupStatus() {
      const el = document.getElementById('bs_lastBackup');
      if (!el) return;
      const cfg = getBackupConfig();
      if (cfg.lastBackup) {
        el.textContent = 'Backup ล่าสุด: ' + new Date(cfg.lastBackup).toLocaleString('th-TH');
      } else {
        el.textContent = 'ยังไม่เคย Backup';
      }
    }

    // ============================
    // BACKUP & RESTORE
    // ============================
    function backupAll() {
      const payload = {
        version: 2,
        exportedAt: new Date().toISOString(),
        DB: DB,
        users: AUTH.users
      };
      downloadJSON(payload, `benzhome_backup_${new Date().toISOString().slice(0, 10)}.json`);
    }

    function backupUsers() {
      const payload = { version: 2, exportedAt: new Date().toISOString(), users: AUTH.users };
      downloadJSON(payload, `benzhome_users_${new Date().toISOString().slice(0, 10)}.json`);
    }

    function downloadJSON(obj, filename) {
      const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
    }

    async function restoreBackup(event) {
      const file = event.target.files[0];
      if (!file) return;
      const text = await file.text();
      try {
        const data = JSON.parse(text);
        if (!data.version) { alert('ไฟล์ backup ไม่ถูกต้อง'); return; }
        if (!confirm(`⚠️ Restore จากไฟล์: ${file.name}\nExported: ${data.exportedAt || 'ไม่ทราบ'}\nข้อมูลปัจจุบันจะถูกแทนที่ ยืนยัน?`)) return;
        if (data.DB) {
          DB.assets = data.DB.assets || [];
          DB.agents = data.DB.agents || [];
          DB.customers = data.DB.customers || [];
          await saveDB();
          // Push assets ด้วย (saveDB ทำ agents+customers แต่ไม่รวม assets)
          if (_fbReady && _db) {
            const { collection, doc, setDoc, writeBatch } = window._firestoreLib;
            const batch = writeBatch(_db);
            DB.assets.forEach(item => {
              if (!item.id) item.id = genId();
              const ref = doc(collection(_db, 'assets'), item.id);
              batch.set(ref, item);
            });
            await batch.commit();
          }
          saveTolocalStorage();
        }
        if (data.users) {
          AUTH.users = data.users;
          saveAuth();
        }
        renderAssets(); renderAgents(); renderCustomers(); renderUsers(); renderStats();
        showToast('✅ Restore สำเร็จ!', '#50c878');
      } catch (e) { alert('Restore ไม่ได้: ' + e.message); }
      event.target.value = '';
    }

    async function forceSyncToFirebase() {
      if (!_fbReady || !_db) { alert('Firebase ยังไม่ได้เชื่อมต่อ'); return; }
      if (!confirm('⬆️ Push ข้อมูล local ทั้งหมดไปทับ Firebase?')) return;
      const { collection, doc, setDoc, writeBatch } = window._firestoreLib;
      for (const col of ['assets', 'agents', 'customers']) {
        const batch = writeBatch(_db);
        DB[col].forEach(item => {
          if (!item.id) item.id = genId();
          const ref = doc(collection(_db, col), item.id);
          batch.set(ref, item);
        });
        await batch.commit();
      }
      await saveAuthToFirebase();
      showToast('✅ Push ไป Firebase สำเร็จ!', '#50c878');
    }

    async function forceSyncFromFirebase() {
      if (!_fbReady || !_db) { alert('Firebase ยังไม่ได้เชื่อมต่อ'); return; }
      if (!confirm('⬇️ Pull ข้อมูลจาก Firebase ทับ local?')) return;
      await loadDB();
      await loadAuthFromFirebase();
      renderUsers();
      showToast('✅ Pull จาก Firebase สำเร็จ!', '#50c878');
    }

    // ============================
    // LOGIN / LOGOUT
    // ============================
    function toggleLoginPw() {
      const inp = document.getElementById('loginPassword');
      const btn = document.getElementById('togglePwBtn');
      if (inp.type === 'password') {
        inp.type = 'text';
        btn.textContent = '🙈';
        btn.title = 'ซ่อนรหัสผ่าน';
      } else {
        inp.type = 'password';
        btn.textContent = '👁️';
        btn.title = 'แสดงรหัสผ่าน';
      }
    }



    async function doLogin() {
      const email = document.getElementById('loginUsername').value.trim().toLowerCase();
      const pw = document.getElementById('loginPassword').value;
      const errEl = document.getElementById('loginError');
      const remember = document.getElementById('rememberMe').checked;

      console.log('🔐 Login attempt:', email);

      const hashedPw = await hashPassword(pw);

      // Try finding in current local auth list (supporting legacy plain text & hashed password)
      let found = AUTH.users.find(u => (u.email || '').toLowerCase().trim() === email && 
        (u.password === hashedPw || u.password === pw)
      );

      if (!found) {
        loadAuth();
        found = AUTH.users.find(u => (u.email || '').toLowerCase().trim() === email && 
          (u.password === hashedPw || u.password === pw)
        );
      }

      if (!found) {
        errEl.style.display = 'flex';
        return;
      }

      // Auto-migrate legacy plain text password to hash
      if (found.password === pw && found.password !== hashedPw) {
        console.log('🔄 Migrating user password to hash...');
        found.password = hashedPw;
        saveAuth();
      }

      performLogin(found, remember);
    }

    async function initFirebaseAuth() {
      if (window._firebaseAuth) return window._firebaseAuth;
      const isExtension = window.location.protocol === 'chrome-extension:';
      const sdkVer = '10.12.2';
      const base = isExtension ? './lib' : `https://www.gstatic.com/firebasejs/${sdkVer}`;
      try {
        const authMod = await import(`${base}/firebase-auth.js`);
        const { getAuth, signInWithPopup, GoogleAuthProvider, FacebookAuthProvider } = authMod;
        
        const appsMod = await import(`${base}/firebase-app.js`);
        const { getApps, initializeApp } = appsMod;
        const existingApps = getApps();
        const app = existingApps.length > 0 ? existingApps[0] : initializeApp(FIREBASE_CONFIG);
        const auth = getAuth(app);
        
        window._firebaseAuth = { auth, signInWithPopup, GoogleAuthProvider, FacebookAuthProvider };
        return window._firebaseAuth;
      } catch (e) {
        console.error('Failed to load Firebase Auth SDK:', e);
        throw new Error('ไม่สามารถโหลดไลบรารี Auth ของ Firebase ได้ค่ะ (ตรวจสอบอินเทอร์เน็ตหรือโฟลเดอร์ lib ใน Extension)');
      }
    }

    async function doLoginWithGoogle() {
      if (FIREBASE_CONFIG.apiKey === 'YOUR_API_KEY') {
        alert('❌ ระบบคลาวด์/Firebase ยังไม่ได้กำหนดค่า กรุณากรอกการตั้งค่า Firebase ก่อนใช้งานเข้าสู่ระบบด้วย Google ค่ะ');
        return;
      }
      
      const errEl = document.getElementById('loginError');
      errEl.style.display = 'none';
      
      try {
        const { auth, signInWithPopup, GoogleAuthProvider } = await initFirebaseAuth();
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        
        const result = await signInWithPopup(auth, provider);
        const user = result.user;
        const email = (user.email || '').toLowerCase().trim();
        const displayname = user.displayName || email.split('@')[0];
        
        let found = AUTH.users.find(u => (u.email || '').toLowerCase().trim() === email);
        
        if (!found && _fbReady) {
          await syncAuthFromFirebase();
          found = AUTH.users.find(u => (u.email || '').toLowerCase().trim() === email);
        }
        
        if (!found) {
          console.log('🆕 Google User not found in system. Registering automatically:', email);
          found = {
            email: email,
            password: 'google-auth-login-provider-oauth2',
            displayname: displayname,
            accessLevel: 'member',
            businessRole: 'customer',
            status: 'active',
            note: 'สมัครอัตโนมัติผ่าน Google Mail',
            linkedAgentId: null,
            socialProviders: {
              google: { uid: user.uid, email: email, displayName: displayname }
            }
          };
          
          AUTH.users.push(found);
        } else {
          if (!found.socialProviders) found.socialProviders = {};
          found.socialProviders.google = { uid: user.uid, email: email, displayName: displayname };
        }

        found = migrateUserFields(found);
        saveAuth();
        performLogin(found, true);
        
      } catch (e) {
        console.error('Google Sign-in Error:', e);
        errEl.style.display = 'flex';
        const errTextEl = errEl.querySelector('span') || errEl;
        errTextEl.textContent = '❌ ล็อกอินด้วย Google ผิดพลาด: ' + e.message;
      }
    }

    async function doLoginWithFacebook() {
      if (FIREBASE_CONFIG.apiKey === 'YOUR_API_KEY') {
        alert('❌ ระบบคลาวด์/Firebase ยังไม่ได้กำหนดค่า กรุณากรอกการตั้งค่า Firebase ก่อนใช้งานเข้าสู่ระบบด้วย Facebook ค่ะ');
        return;
      }
      
      const errEl = document.getElementById('loginError');
      errEl.style.display = 'none';
      
      try {
        const { auth, signInWithPopup, FacebookAuthProvider } = await initFirebaseAuth();
        const provider = new FacebookAuthProvider();
        
        const result = await signInWithPopup(auth, provider);
        const user = result.user;
        
        let email = user.email ? user.email.toLowerCase().trim() : '';
        if (!email && user.providerData && user.providerData[0]) {
          email = (user.providerData[0].email || '').toLowerCase().trim();
        }
        if (!email) {
          email = `${user.uid}@facebook.com`;
        }
        
        const displayname = user.displayName || email.split('@')[0];
        
        let found = AUTH.users.find(u => (u.email || '').toLowerCase().trim() === email);
        
        if (!found && _fbReady) {
          await syncAuthFromFirebase();
          found = AUTH.users.find(u => (u.email || '').toLowerCase().trim() === email);
        }
        
        if (!found) {
          console.log('🆕 Facebook User not found in system. Registering automatically:', email);
          found = {
            email: email,
            password: 'facebook-auth-login-provider-oauth2',
            displayname: displayname,
            accessLevel: 'member',
            businessRole: 'customer',
            status: 'active',
            note: 'สมัครอัตโนมัติผ่าน Facebook',
            linkedAgentId: null,
            socialProviders: {
              facebook: { uid: user.uid, email: email, displayName: displayname }
            }
          };
          
          AUTH.users.push(found);
        } else {
          if (!found.socialProviders) found.socialProviders = {};
          found.socialProviders.facebook = { uid: user.uid, email: email, displayName: displayname };
        }

        found = migrateUserFields(found);
        saveAuth();
        performLogin(found, true);
        
      } catch (e) {
        console.error('Facebook Sign-in Error:', e);
        errEl.style.display = 'flex';
        const errTextEl = errEl.querySelector('span') || errEl;
        errTextEl.textContent = '❌ ล็อกอินด้วย Facebook ผิดพลาด: ' + e.message;
      }
    }

    function doLogout() {
      if (!confirm('ยืนยันออกจากระบบ?')) return;
      AUTH.current = null;
      clearSession(); // ลบ session — reload จะไม่ auto-login
      // stop realtime sync
      if (typeof stopRealtimeSync === 'function') stopRealtimeSync();
      
      // Go to login.html
      window.location.href = 'login.html';
    }

    // ============================
    // ROLE-BASED ACCESS CONTROL
    // ============================
    // ============================
    // ROLE MATRIX CONSTANTS
    // ============================
    const ROLE = {
      SUPER_ADMIN: 'super_admin',
      ADMIN:       'admin',
      MEMBER:      'member',
      AGENT:       'agent',
      OWNER:       'owner',
      CUSTOMER:    'customer',
      PENDING:     'pending',
      SUSPENDED:   'suspended'
    };

    function applyRoleAccess(userObj) {
      const user = migrateUserFields(userObj || AUTH.current);
      
      const accessLevel = user ? user.accessLevel : 'member';
      const businessRole = user ? user.businessRole : 'customer';
      const status = user ? user.status : 'active';

      const isSuperAdmin = accessLevel === 'super_admin';
      const isAdmin      = accessLevel === 'super_admin' || accessLevel === 'admin';
      const isAgent      = businessRole === 'agent' && status === 'active';
      const isOwner      = businessRole === 'owner' && status === 'active';
      const isCustomer   = businessRole === 'customer' && status === 'active';
      const isPending    = status === 'pending';

      // Permissions
      const canPost        = isAdmin || isAgent || isOwner;
      const canSeeContacts = isAdmin || isAgent || isOwner || isCustomer;
      const canSeeCustomers= isAdmin || isAgent || isOwner;
      const canSeeCoAgents = isAdmin || isAgent;
      const canMarketing   = isAdmin || isAgent;
      const canCommission  = isAdmin || isAgent;
      const canClipboard   = isAdmin || isAgent;
      const canAdminPanel  = isAdmin;

      // Globals
      window._canPost        = canPost;
      window._canSeeContacts = canSeeContacts;
      window._canSeeCoAgents = canSeeCoAgents;
      window._canEdit        = canPost;
      window._canDelete      = isAdmin;

      window._canEditAsset = function(asset) {
        if (!AUTH.current) return false;
        const curr = migrateUserFields(AUTH.current);
        const currIsAdmin = curr.accessLevel === 'super_admin' || curr.accessLevel === 'admin';
        if (currIsAdmin) return true;
        
        // Agent or Owner can edit their own asset
        if (canPost && asset.creatorEmail && curr.email) {
          if (asset.creatorEmail.toLowerCase() === curr.email.toLowerCase()) return true;
        }
        if (canPost && asset.poster && curr.displayname) {
          if (asset.poster === curr.displayname) return true;
        }
        return false;
      };

      window._canDeleteAsset = function(asset) {
        if (!AUTH.current) return false;
        const curr = migrateUserFields(AUTH.current);
        const currIsAdmin = curr.accessLevel === 'super_admin' || curr.accessLevel === 'admin';
        if (currIsAdmin) return true;

        // Agent or Owner can delete their own asset
        if (canPost && asset.creatorEmail && curr.email) {
          if (asset.creatorEmail.toLowerCase() === curr.email.toLowerCase()) return true;
        }
        return false;
      };

      // UI Tab Visibility
      const _tab = (id, show) => { const el = document.getElementById(id); if (el) el.style.display = show ? '' : 'none'; };
      _tab('tabCustomers', canSeeCustomers);
      _tab('tabConsignments', canSeeCustomers);
      _tab('tabSettings',  true);
      _tab('tabClipboard', canClipboard);
      _tab('tabMarketing', canMarketing);
      _tab('tabCommission',canCommission);

      // Bottom nav (mobile)
      _tab('bnav-customers', canSeeCustomers);
      _tab('bnav-clipboard', canClipboard);
      _tab('bnav-marketing', canMarketing);

      // Settings admin-only nav items
      document.querySelectorAll('.settings-nav .admin-only').forEach(el => {
        el.style.display = canAdminPanel ? '' : 'none';
      });
      // Super admin-only elements
      document.querySelectorAll('.super-admin-only').forEach(el => {
        el.style.display = isSuperAdmin ? '' : 'none';
      });

      // pending users nav (admin only)
      const snavPending = document.getElementById('snav-pending');
      if (snavPending) snavPending.style.display = canAdminPanel ? '' : 'none';

      // Admin-only panels
      const _panel = (id, show) => { const el = document.getElementById(id); if (el) el.style.display = show ? '' : 'none'; };
      _panel('clearDataPanel',     isSuperAdmin); // Only super admin can reset
      _panel('importPanel',        canAdminPanel);
      _panel('exportPanel',        canAdminPanel);
      _panel('btnImportCustomerCSV', canAdminPanel);
      _panel('ssec-pending',       canAdminPanel);

      // Add buttons
      _panel('btnAddAsset',    canPost);
      _panel('btnAddCustomer', canSeeCustomers && (isAdmin || isAgent));
      _panel('btnAddConsignment', canSeeCustomers && (isAdmin || isAgent));

      // Mobile title
      if (window.innerWidth <= 768) {
        const titleEl = document.getElementById('mobileSectionTitle');
        if (titleEl) { titleEl.textContent = _sectionTitles['assets'] || ''; titleEl.style.display = 'block'; }
      }

      buildMoreDrawer(user);
      closeMoreDrawer();
    }

    // Build More drawer menu based on role
    function buildMoreDrawer(userObj) {
      const user = migrateUserFields(userObj || AUTH.current);
      const accessLevel = user ? user.accessLevel : 'member';
      const businessRole = user ? user.businessRole : 'customer';
      const status = user ? user.status : 'active';

      const isSuperAdmin = accessLevel === 'super_admin';
      const isAdmin      = accessLevel === 'super_admin' || accessLevel === 'admin';
      const isAgent      = businessRole === 'agent' && status === 'active';
      const isPending    = status === 'pending';

      const container = document.getElementById('moreDrawerItems');
      if (!container) return;

      const items = [];
      if (isAdmin || isAgent) {
        items.push({ icon: '📝', label: 'ฝากขาย/จำนอง', sub: 'รายการฝากขายและจำนองของลูกค้า', tab: 'consignments' });
        items.push({ icon: '💰', label: 'คำนวณค่าคอม', sub: 'คำนวณส่วนแบ่งค่าคอมมิชชั่น', tab: 'commission' });
      }
      if (isAdmin) {
        items.push({ icon: '⚙️', label: 'ตั้งค่าระบบ', sub: 'ผู้ใช้, Firebase, Backup, CSV', tab: 'settings' });
      } else if (isPending) {
        items.push({ icon: '⏳', label: 'รอการอนุมัติ', sub: 'บัญชีของคุณอยู่ระหว่างตรวจสอบ', tab: 'settings' });
      } else {
        items.push({ icon: '⚙️', label: 'ตั้งค่า', sub: 'บัญชีของฉัน & ข้อมูลระบบ', tab: 'settings' });
      }

      container.innerHTML = items.map(it => `
        <button onclick="switchTab('${it.tab}',null);updateBnav('${it.tab}');closeMoreDrawer();"
          style="display:flex;align-items:center;gap:14px;width:100%;background:transparent;border:none;
                 padding:14px 12px;border-radius:14px;cursor:pointer;font-family:inherit;
                 color:var(--text);text-align:left;-webkit-tap-highlight-color:transparent;
                 transition:background .15s;"
          onmouseover="this.style.background='var(--dark3)'" onmouseout="this.style.background='transparent'">
          <span style="font-size:28px;width:40px;text-align:center;flex-shrink:0;">${it.icon}</span>
          <span style="flex:1;">
            <span style="display:block;font-size:17px;font-weight:700;">${it.label}</span>
            <span style="display:block;font-size:12px;color:var(--text3);margin-top:2px;">${it.sub || ''}</span>
          </span>
          <span style="color:var(--text3);font-size:20px;font-weight:300;">›</span>
        </button>
      `).join('');

      const moreBtn = document.getElementById('bnav-more');
      if (moreBtn) moreBtn.style.display = '';
    }

    function toggleMoreDrawer() {
      const overlay = document.getElementById('moreDrawerOverlay');
      const drawer = document.getElementById('moreDrawer');
      const isOpen = drawer.style.display !== 'none';
      if (isOpen) {
        closeMoreDrawer();
      } else {
        overlay.style.display = 'block';
        drawer.style.display = 'block';
        // animate in
        drawer.style.transform = 'translateY(20px)';
        drawer.style.opacity = '0';
        drawer.style.transition = 'transform .22s cubic-bezier(.4,0,.2,1), opacity .2s';
        requestAnimationFrame(() => {
          drawer.style.transform = 'translateY(0)';
          drawer.style.opacity = '1';
        });
        // mark more button active
        const moreBtn = document.getElementById('bnav-more');
        if (moreBtn) moreBtn.classList.add('active');
      }
    }

    function closeMoreDrawer() {
      const overlay = document.getElementById('moreDrawerOverlay');
      const drawer = document.getElementById('moreDrawer');
      drawer.style.display = 'none';
      overlay.style.display = 'none';
      const moreBtn = document.getElementById('bnav-more');
      if (moreBtn) moreBtn.classList.remove('active');
    }

    // ============================
    // TABS
    // ============================
    const _sectionTitles = {
      assets: '🏠 ทรัพย์สิน',
      agents: '👤 Agent',
      customers: '🤝 ลูกค้า',
      consignments: '📝 ฝากขาย/จำนอง',
      clipboard: '📋 ClipB',
      marketing: '🚀 Auto-Post',
      settings: '⚙️ ตั้งค่า'
    };

    function updateBnav(t) {
      // Reset all bnav buttons (only real buttons, not hidden spans)
      document.querySelectorAll('.bnav-item').forEach(b => b.classList.remove('active'));
      // Mark the closest visible button active
      // For sub-tabs (agents, users, iedata) — mark "more" button active
      const mainTabs = ['assets', 'customers', 'clipboard', 'marketing'];
      const targetId = mainTabs.includes(t) ? 'bnav-' + t : 'bnav-more';
      const el = document.getElementById(targetId);
      if (el) el.classList.add('active');
      // update mobile section title
      const titleEl = document.getElementById('mobileSectionTitle');
      if (titleEl) {
        titleEl.textContent = _sectionTitles[t] || '';
        titleEl.style.display = window.innerWidth <= 768 ? 'block' : 'none';
      }
    }
    function switchTab(t, btn) {
      document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
      document.querySelectorAll('.htab').forEach(b => b.classList.remove('active'));
      const sec = document.getElementById('sec-' + t);
      if (sec) sec.classList.add('active');
      if (btn) btn.classList.add('active');
      updateBnav(t);
      if (t === 'assets') { renderAssets(); renderStats(); }
      if (t === 'customers') renderCustomers();
      if (t === 'consignments' && typeof renderConsignments === 'function') renderConsignments();
      if (t === 'clipboard') populateCbSelect();
      if (t === 'marketing') {
        populateMktSelect();
        requestNotificationPermission();
        switchMktSubtab(_activeMktSubtab || 'composer');
      }
      if (t === 'commission') {
        initCommissionTab();
      }
      if (t === 'commission') {
      initCommissionTab();
      }
      if (t === 'settings') {
      switchSettingsTab('profile');
      updateSettingsProfileUI();
      }
    }

    // ============================
    // STATS
    // ============================
    function setAssetView(v) {
      _assetView = v;
      _assetPage = 1;
      // highlight active btn
      ['card', 'table'].forEach(x => {
        const b = document.getElementById('btnAssetView' + x.charAt(0).toUpperCase() + x.slice(1));
        if (b) b.style.background = (x === v) ? 'var(--gold)' : '';
        if (b) b.style.color = (x === v) ? '#1a1208' : '';
      });
      renderAssets();
    }

    // ===== SEARCHABLE SELECT DECORATOR =====
    function initSearchableSelect(selectId, placeholderText = 'พิมพ์เพื่อค้นหา...') {
      const selectEl = document.getElementById(selectId);
      if (!selectEl) return;

      if (selectEl.dataset.searchableInitialized) return;
      selectEl.dataset.searchableInitialized = "true";

      // Hide native select
      selectEl.style.display = 'none';

      // Create container
      const container = document.createElement('div');
      container.className = 'searchable-select-container';
      if (selectEl.style.cssText) {
        container.style.cssText = selectEl.style.cssText;
        container.style.display = 'inline-flex';
      }
      container.style.position = 'relative';

      // Create input
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'searchable-select-input';
      input.placeholder = placeholderText;
      input.disabled = selectEl.disabled;
      input.autocomplete = 'off';

      // Create arrow
      const arrow = document.createElement('span');
      arrow.className = 'searchable-select-arrow';
      arrow.innerHTML = '▼';

      // Create dropdown
      const dropdown = document.createElement('div');
      dropdown.className = 'searchable-select-dropdown';
      dropdown.style.display = 'none';

      container.appendChild(input);
      container.appendChild(arrow);
      container.appendChild(dropdown);

      selectEl.parentNode.insertBefore(container, selectEl.nextSibling);

      let highlightedIndex = -1;

      function setHighlighted(index) {
        const visibleOptions = Array.from(dropdown.querySelectorAll('.searchable-select-option')).filter(el => el.style.display !== 'none');
        dropdown.querySelectorAll('.searchable-select-option').forEach(el => el.classList.remove('highlighted'));
        
        if (visibleOptions.length === 0) {
          highlightedIndex = -1;
          return;
        }
        
        if (index >= visibleOptions.length) index = 0;
        if (index < 0) index = visibleOptions.length - 1;
        
        highlightedIndex = index;
        const target = visibleOptions[highlightedIndex];
        if (target) {
          target.classList.add('highlighted');
          target.scrollIntoView({ block: 'nearest' });
        }
      }

      function rebuildOptions() {
        dropdown.innerHTML = '';
        const children = selectEl.children;
        
        for (let i = 0; i < children.length; i++) {
          const child = children[i];
          if (child.tagName === 'OPTGROUP') {
            const headerDiv = document.createElement('div');
            headerDiv.className = 'searchable-select-group-header';
            headerDiv.textContent = child.label;
            dropdown.appendChild(headerDiv);
            
            const groupOpts = child.children;
            for (let j = 0; j < groupOpts.length; j++) {
              createOptionDiv(groupOpts[j]);
            }
          } else if (child.tagName === 'OPTION') {
            createOptionDiv(child);
          }
        }
        updateInputValue();
      }

      function createOptionDiv(opt) {
        const optDiv = document.createElement('div');
        optDiv.className = 'searchable-select-option';
        optDiv.textContent = opt.textContent;
        optDiv.dataset.value = opt.value;
        
        if (opt.value === selectEl.value) {
          optDiv.classList.add('selected');
        }

        if (typeof FUTURE_STATIONS !== 'undefined' && FUTURE_STATIONS.has(opt.value)) {
          optDiv.classList.add('future-station');
        }

        optDiv.addEventListener('mousedown', (e) => {
          e.preventDefault();
          selectOption(opt.value, opt.textContent);
        });

        dropdown.appendChild(optDiv);
      }

      function selectOption(value, text) {
        selectEl.value = value;
        input.value = text;
        dropdown.style.display = 'none';
        container.classList.remove('open');
        selectEl.dispatchEvent(new Event('change', { bubbles: true }));
      }

      function updateInputValue() {
        const selectedOpt = selectEl.options[selectEl.selectedIndex];
        input.value = selectedOpt ? selectedOpt.textContent : '';
        dropdown.querySelectorAll('.searchable-select-option').forEach(div => {
          if (div.dataset.value === selectEl.value) {
            div.classList.add('selected');
          } else {
            div.classList.remove('selected');
          }
        });
      }

      function filterOptions(searchTerm) {
        const children = dropdown.children;
        let lastHeader = null;
        let visibleCountInGroup = 0;
        
        for (let i = 0; i < children.length; i++) {
          const child = children[i];
          if (child.classList.contains('searchable-select-group-header')) {
            if (lastHeader) {
              lastHeader.style.display = visibleCountInGroup > 0 ? '' : 'none';
            }
            lastHeader = child;
            visibleCountInGroup = 0;
            child.style.display = 'none';
          } else if (child.classList.contains('searchable-select-option')) {
            const text = child.textContent.toLowerCase();
            if (text.includes(searchTerm.toLowerCase())) {
              child.style.display = '';
              visibleCountInGroup++;
            } else {
              child.style.display = 'none';
            }
          }
        }
        if (lastHeader) {
          lastHeader.style.display = visibleCountInGroup > 0 ? '' : 'none';
        }
        setHighlighted(0);
      }

      // Input events
      input.addEventListener('focus', () => {
        if (selectEl.disabled) return;
        dropdown.style.display = 'block';
        container.classList.add('open');
        Array.from(dropdown.children).forEach(child => {
          child.style.display = '';
        });
        setHighlighted(-1);
        setTimeout(() => input.select(), 50);
      });

      input.addEventListener('blur', () => {
        setTimeout(() => {
          dropdown.style.display = 'none';
          container.classList.remove('open');
          updateInputValue();
        }, 150);
      });

      input.addEventListener('input', () => {
        filterOptions(input.value);
      });

      input.addEventListener('keydown', (e) => {
        if (dropdown.style.display === 'none') {
          if (e.key === 'ArrowDown' || e.key === 'Enter') {
            dropdown.style.display = 'block';
            container.classList.add('open');
            setHighlighted(0);
            e.preventDefault();
          }
          return;
        }

        const visibleOptions = Array.from(dropdown.querySelectorAll('.searchable-select-option')).filter(el => el.style.display !== 'none');

        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setHighlighted(highlightedIndex + 1);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setHighlighted(highlightedIndex - 1);
        } else if (e.key === 'Enter') {
          e.preventDefault();
          if (highlightedIndex >= 0 && highlightedIndex < visibleOptions.length) {
            const opt = visibleOptions[highlightedIndex];
            selectOption(opt.dataset.value, opt.textContent);
          }
        } else if (e.key === 'Escape') {
          e.preventDefault();
          dropdown.style.display = 'none';
          container.classList.remove('open');
          updateInputValue();
          input.blur();
        }
      });

      // Toggle arrow
      arrow.addEventListener('click', (e) => {
        e.stopPropagation();
        if (selectEl.disabled) return;
        if (dropdown.style.display === 'none') {
          input.focus();
        } else {
          input.blur();
        }
      });

      // Dynamic option list updates
      const observer = new MutationObserver(() => {
        rebuildOptions();
      });
      observer.observe(selectEl, { childList: true, subtree: true });

      // Attribute changes (disabled)
      const attrObserver = new MutationObserver((mutations) => {
        mutations.forEach(mutation => {
          if (mutation.attributeName === 'disabled') {
            input.disabled = selectEl.disabled;
            if (selectEl.disabled) {
              container.classList.add('disabled');
              dropdown.style.display = 'none';
              container.classList.remove('open');
            } else {
              container.classList.remove('disabled');
            }
          }
        });
      });
      attrObserver.observe(selectEl, { attributes: true });

      // Intercept property setter for 'value'
      const originalDescriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
      Object.defineProperty(selectEl, 'value', {
        get: function() {
          return originalDescriptor.get.call(this);
        },
        set: function(val) {
          originalDescriptor.set.call(this, val);
          updateInputValue();
        },
        configurable: true
      });

      rebuildOptions();
      if (selectEl.disabled) {
        container.classList.add('disabled');
      }
    }

    function initAllSearchableSelects() {
      initSearchableSelect('filterStartStation', 'สถานีเริ่มต้น');
      initSearchableSelect('filterEndStation', 'สถานีสิ้นสุด');
      initSearchableSelect('filterCustStartStation', 'สถานีเริ่มต้น');
      initSearchableSelect('filterCustEndStation', 'สถานีสิ้นสุด');
      initSearchableSelect('a_bts', '-- เลือกสถานี --');
      initSearchableSelect('cu_stationStart', 'ไม่ระบุ');
      initSearchableSelect('cu_stationEnd', 'ไม่ระบุ');
    }

    // Auto-calculate when start date changes
    document.addEventListener('DOMContentLoaded', function () {
      const startDateEl = document.getElementById('a_reservationDate');
      if (startDateEl) {
        startDateEl.addEventListener('change', calculateReservationEnd);
      }
      populateTrainLineSelects();
      populateAssetBtsSelect();
      initAllSearchableSelects();
      if (typeof initAIConfig === 'function') {
        initAIConfig();
      }
    });

    function renderUsers() {
      const tb = document.getElementById('userTable');
      const ml = document.getElementById('userMList');

      if (!AUTH.users.length) {
        tb.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:40px;color:var(--text3)">ยังไม่มีผู้ใช้</td></tr>`;
        if (ml) ml.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text3)">ยังไม่มีผู้ใช้</div>`;
        return;
      }

      // Desktop table
      tb.innerHTML = AUTH.users.map((u, i) => {
        const isMe = AUTH.current && AUTH.current.email === u.email;
        const linkedAgent = u.linkedAgentId ? (DB.agents.find(a => a.id === u.linkedAgentId) || null) : null;
        
        // Co-Agent status & default share
        const isAgentOrAdmin = (u.businessRole === 'agent' || u.accessLevel === 'admin' || u.accessLevel === 'super_admin' || u.businessRole === 'owner');
        const coDetails = isAgentOrAdmin 
          ? (u.coagent || (u.socialProviders && u.socialProviders.coagent ? u.socialProviders.coagent : { accept: true, defaultShare: 40 }))
          : null;
        const coText = coDetails 
          ? `<span style="color:${coDetails.accept ? 'var(--green)' : 'var(--text3)'};font-weight:700;">${coDetails.accept ? '✔️ รับ' : '❌ ไม่รับ'} (${coDetails.defaultShare || 40}%)</span>`
          : '<span style="color:var(--text3)">—</span>';

        let actionButtons = `
          <button class="btn btn-outline btn-sm" onclick="editUser(${i})">✏️ แก้ไข</button>
          ${!isMe ? `<button class="btn btn-danger btn-sm" onclick="deleteUser(${i})">🗑️</button>` : ''}
        `;
        
        // ถ้าเป็น pending ให้มีปุ่ม Approve / Reject ด่วน
        if (u.status === 'pending') {
          actionButtons = `
            <button class="btn btn-primary btn-sm" style="background:#5cb85c;border-color:#4cae4c;" onclick="approveAgentUser(${i})">✔️ อนุมัติ</button>
            <button class="btn btn-danger btn-sm" style="background:#d9534f;border-color:#d43f3a;" onclick="rejectAgentUser(${i})">❌ ปฏิเสธ</button>
            <button class="btn btn-outline btn-sm" onclick="editUser(${i})">✏️</button>
            ${!isMe ? `<button class="btn btn-danger btn-sm" onclick="deleteUser(${i})">🗑️</button>` : ''}
          `;
        }

        return `<tr>
          <td style="color:var(--text3)">${i + 1}</td>
          <td style="font-weight:600;font-size:13px">${u.email || '-'}${isMe ? ` <span style="font-size:11px;color:var(--gold)">(คุณ)</span>` : ''}<br>
            <span style="font-weight:400;color:var(--text3);font-size:12px">${u.displayname || ''}</span></td>
          <td style="font-size:13px;font-weight:600;">${u.phone || '-'}</td>
          <td style="font-size:12px;">${coText}</td>
          <td>${_roleBadge(u)}</td>
          <td style="font-size:12px">${linkedAgent ? `<span style="color:var(--green)">✅ ${linkedAgent.name}</span>` : '<span style="color:var(--text3)">—</span>'}</td>
          <td style="font-size:12px;color:var(--text3)">${u.note || '-'}</td>
          <td><div style="display:flex;gap:5px;flex-wrap:wrap;align-items:center;">
            ${actionButtons}
          </div></td>
        </tr>`;
      }).join('');

      // Mobile card list
      if (ml) ml.innerHTML = AUTH.users.map((u, i) => {
        const isMe = AUTH.current && AUTH.current.email === u.email;
        const linkedAgent = u.linkedAgentId ? (DB.agents.find(a => a.id === u.linkedAgentId) || null) : null;
        
        const isAgentOrAdmin = (u.businessRole === 'agent' || u.accessLevel === 'admin' || u.accessLevel === 'super_admin' || u.businessRole === 'owner');
        const coDetails = isAgentOrAdmin 
          ? (u.coagent || (u.socialProviders && u.socialProviders.coagent ? u.socialProviders.coagent : { accept: true, defaultShare: 40 }))
          : null;
        const coText = coDetails 
          ? `${coDetails.accept ? '✔️ รับ' : '❌ ไม่รับ'} (${coDetails.defaultShare || 40}%)`
          : '—';

        let actionButtons = `
          <button class="btn btn-outline" onclick="editUser(${i})">✏️ แก้ไข</button>
          ${!isMe ? `<button class="btn btn-danger" onclick="deleteUser(${i})">🗑️ ลบ</button>` : ''}
        `;
        
        if (u.status === 'pending') {
          actionButtons = `
            <button class="btn" style="background:#5cb85c;color:#fff;flex:1;" onclick="approveAgentUser(${i})">✔️ อนุมัติ</button>
            <button class="btn" style="background:#d9534f;color:#fff;flex:1;" onclick="rejectAgentUser(${i})">❌ ปฏิเสธ</button>
            <button class="btn btn-outline" style="padding:6px;" onclick="editUser(${i})">✏️</button>
            ${!isMe ? `<button class="btn btn-danger" style="padding:6px;" onclick="deleteUser(${i})">🗑️</button>` : ''}
          `;
        }

        return `<div class="m-card">
          <span class="m-card-num">#${i + 1}</span>
          <div class="m-card-top">
            <div style="flex:1;padding-right:40px">
              <div class="m-card-name">${u.displayname || u.email}${isMe ? ' <span style="font-size:12px;color:var(--gold)">(คุณ)</span>' : ''}</div>
              <div class="m-card-sub" style="font-size:12px">${u.email || ''}</div>
            </div>
            ${_roleBadge(u)}
          </div>
          <div class="m-card-row"><span class="m-card-label">📞 เบอร์โทร</span><span class="m-card-val" style="font-weight:600;">${u.phone || '-'}</span></div>
          <div class="m-card-row"><span class="m-card-label">🤝 Co-Agent</span><span class="m-card-val" style="font-weight:600;">${coText}</span></div>
          ${linkedAgent ? `<div class="m-card-row"><span class="m-card-label">🏠 Agent Profile</span><span class="m-card-val" style="color:var(--green)">✅ ${linkedAgent.name}</span></div>` : ''}
          ${u.note ? `<div class="m-card-row"><span class="m-card-label">📝 Note</span><span class="m-card-val" style="color:var(--text2);font-size:13px">${u.note}</span></div>` : ''}
          <div class="m-card-actions" style="display:flex;gap:5px;width:100%;">
            ${actionButtons}
          </div>
        </div>`;
      }).join('');

      // Update notification badge count dynamically
      updatePendingCountNotification();
    }

    function _roleBadge(userObj) {
      const u = migrateUserFields(userObj);
      const [label, cls] = getRoleUIBadge(u.accessLevel, u.businessRole, u.status);
      
      let bg = 'var(--border)';
      let fg = 'var(--text3)';
      let animation = '';

      if (u.status === 'pending') {
        bg = '#e8a020';
        fg = '#fff';
        animation = 'animation:pulse 1.5s infinite;';
      } else if (u.status === 'suspended') {
        bg = '#555';
        fg = '#fff';
      } else if (u.accessLevel === 'super_admin') {
        bg = 'linear-gradient(135deg, #FFD700, #FFA500)';
        fg = '#000';
      } else if (u.accessLevel === 'admin') {
        bg = 'var(--red)';
        fg = '#fff';
      } else if (u.businessRole === 'agent') {
        bg = 'var(--green)';
        fg = '#fff';
      } else if (u.businessRole === 'owner') {
        bg = 'var(--blue)';
        fg = '#fff';
      } else if (u.businessRole === 'customer') {
        bg = '#5bc0de';
        fg = '#fff';
      }

      return `<span style="background:${bg};color:${fg};padding:2px 6px;border-radius:4px;font-size:11px;font-weight:700;${animation}">${label}</span>`;
    }

    async function approveAgentUser(idx) {
      const u = AUTH.users[idx];
      if (!u) return;
      if (!confirm(`ยืนยันอนุมัติคุณ ${u.displayname || u.email} เป็น Agent หรือไม่?`)) return;

      u.status = 'active';
      u.businessRole = 'agent';
      u.note = `อนุมัติเป็น Agent เมื่อ ${new Date().toLocaleDateString('th-TH')}`;

      // extract co-agent configurations
      const extra = u.coagent || (u.socialProviders && u.socialProviders.coagent ? u.socialProviders.coagent : { accept: true, defaultShare: 40 });
      if (!u.coagent) u.coagent = { accept: extra.accept, defaultShare: extra.defaultShare || 40 };
      if (!u.socialProviders) u.socialProviders = {};
      if (!u.socialProviders.coagent) u.socialProviders.coagent = { accept: extra.accept, defaultShare: extra.defaultShare || 40 };

      // Automatically create matching Agent profile
      const newAgent = {
        id: genId(),
        name: u.displayname || u.email.split('@')[0],
        email: u.email,
        tel: u.phone || '',
        line: '',
        linelink: '',
        company: 'Benz Home Agent',
        coagent: extra.accept ? 'รับ' : 'ไม่รับ',
        coAgentDefaultShare: extra.defaultShare || 40,
        bank: '',
        fb: ''
      };

      DB.agents.push(newAgent);
      u.linkedAgentId = newAgent.id;

      saveAuth();
      await saveItem('agents', newAgent, newAgent.id);

      renderUsers();
      if (typeof populateMktSelect === 'function') populateMktSelect();
      alert(`✅ อนุมัติคุณ ${u.displayname} เป็น Agent เรียบร้อยแล้วค่ะ!`);
    }

    async function rejectAgentUser(idx) {
      const u = AUTH.users[idx];
      if (!u) return;
      if (!confirm(`ปฏิเสธการสมัครของ ${u.displayname || u.email} ใช่หรือไม่?`)) return;

      u.status = 'suspended';
      u.note = `ปฏิเสธการสมัครเมื่อ ${new Date().toLocaleDateString('th-TH')}`;

      saveAuth();
      renderUsers();
      alert(`❌ ปฏิเสธการสมัครของ ${u.displayname} เรียบร้อยค่ะ`);
    }

    function toggleLinkedAgent() {
      const bRole = document.getElementById('u_businessRole').value;
      const sect = document.getElementById('u_agentDetailsSection');
      if (sect) {
        sect.style.display = (bRole === 'agent' || bRole === 'owner') ? 'block' : 'none';
      }
    }

    function toggleUserCoagentShare(val, targetId) {
      const el = document.getElementById(targetId);
      if (el) {
        el.style.display = (val === 'รับ') ? '' : 'none';
      }
    }
    window.toggleUserCoagentShare = toggleUserCoagentShare;

    async function saveUser() {
      const email = document.getElementById('u_email').value.trim().toLowerCase();
      const pw = document.getElementById('u_password').value;
      const dname = document.getElementById('u_displayname').value.trim();
      const accessLevel = document.getElementById('u_accessLevel').value;
      const businessRole = document.getElementById('u_businessRole').value;
      const status = document.getElementById('u_status').value;
      const note = document.getElementById('u_note').value.trim();

      if (!email) { alert('กรุณาใส่อีเมล'); return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { alert('รูปแบบอีเมลไม่ถูกต้อง'); return; }

      // Super Admin protection guard:
      // A regular admin (not super admin) cannot assign accessLevel: admin or super_admin!
      const current = migrateUserFields(AUTH.current);
      if (current.accessLevel !== 'super_admin') {
        if (accessLevel === 'super_admin' || accessLevel === 'admin') {
          alert('❌ เฉพาะผู้ดูแลระบบสูงสุด (Super Admin) เท่านั้นที่สามารถแต่งตั้งสิทธิ์ผู้ดูแลระบบได้');
          return;
        }
      }

      let linkedAgentId = null;
      const isAgentOrOwner = (businessRole === 'agent' || businessRole === 'owner');

      if (isAgentOrOwner) {
        const ag = {
          name: dname || email.split('@')[0],
          company: document.getElementById('u_ag_company').value.trim(),
          coagent: document.getElementById('u_ag_coagent').value,
          coAgentDefaultShare: parseInt(document.getElementById('u_ag_coagentshare').value) || 40,
          tel: document.getElementById('u_ag_tel').value.trim(),
          fb: document.getElementById('u_ag_fb').value.trim(),
          email: email,
          line: document.getElementById('u_ag_line').value.trim(),
          linelink: document.getElementById('u_ag_linelink').value.trim(),
          bank: document.getElementById('u_ag_bank').value.trim()
        };

        if (editMode.idx >= 0) {
          const u = AUTH.users[editMode.idx];
          if (u.linkedAgentId) {
            ag.id = u.linkedAgentId;
            const agIdx = DB.agents.findIndex(x => x.id === u.linkedAgentId || x.name === u.linkedAgentId);
            if (agIdx >= 0) {
              DB.agents[agIdx] = ag;
            } else {
              DB.agents.push(ag);
            }
            await saveItem('agents', ag, ag.id);
            linkedAgentId = ag.id;
          } else {
            ag.id = genId();
            DB.agents.push(ag);
            await saveItem('agents', ag, ag.id);
            linkedAgentId = ag.id;
          }
        } else {
          ag.id = genId();
          DB.agents.push(ag);
          await saveItem('agents', ag, ag.id);
          linkedAgentId = ag.id;
        }
      } else {
        if (editMode.idx >= 0) {
          const u = AUTH.users[editMode.idx];
          if (u.linkedAgentId) {
            await deleteItemFromDB('agents', u.linkedAgentId);
            const agIdx = DB.agents.findIndex(x => x.id === u.linkedAgentId);
            if (agIdx >= 0) {
              DB.agents.splice(agIdx, 1);
            }
          }
        }
      }

      const telVal = document.getElementById('u_ag_tel').value.trim();
      const coagentVal = document.getElementById('u_ag_coagent').value;
      const coagentShareVal = parseInt(document.getElementById('u_ag_coagentshare').value) || 40;

      // Hash password if supplied
      let finalPw = undefined;
      if (pw) {
        finalPw = await hashPassword(pw);
      }

      const lineVal = document.getElementById('u_ag_line').value.trim();

      if (editMode.idx >= 0) {
        const u = AUTH.users[editMode.idx];
        u.email = email;
        u.displayname = dname;
        u.accessLevel = accessLevel;
        u.businessRole = businessRole;
        u.status = status;
        u.note = note;
        u.linkedAgentId = linkedAgentId;
        if (finalPw) u.password = finalPw;
        u.phone = telVal;
        
        if (!u.coagent) u.coagent = {};
        u.coagent.accept = (coagentVal === 'รับ');
        u.coagent.defaultShare = coagentShareVal;

        if (!u.socialProviders) u.socialProviders = {};
        u.socialProviders.coagent = { accept: (coagentVal === 'รับ'), defaultShare: coagentShareVal };
        if (lineVal) {
          u.socialProviders.line = { lineId: lineVal.replace(/^@/, '') };
        } else {
          delete u.socialProviders.line;
        }
      } else {
        if (!pw || pw.length < 6) { alert('Password ต้องมีอย่างน้อย 6 ตัวอักษร'); return; }
        if (AUTH.users.find(x => x.email === email)) { alert('อีเมลนี้มีในระบบแล้ว'); return; }
        
        const socialProvs = { coagent: { accept: (coagentVal === 'รับ'), defaultShare: coagentShareVal } };
        if (lineVal) {
          socialProvs.line = { lineId: lineVal.replace(/^@/, '') };
        }

        AUTH.users.push({ 
          email, 
          password: finalPw, 
          displayname: dname, 
          accessLevel,
          businessRole,
          status,
          note, 
          linkedAgentId,
          phone: telVal,
          coagent: { accept: (coagentVal === 'รับ'), defaultShare: coagentShareVal },
          socialProviders: socialProvs
        });
      }

      saveAuth();
      closeModal('user');
      renderUsers();
      if (typeof populateMktSelect === 'function') populateMktSelect();
      if (!_realtimeSyncActive) { saveTolocalStorage(); }
    }

    function editUser(i) {
      const u = migrateUserFields(AUTH.users[i]);
      document.getElementById('modalUserTitle').textContent = '✏️ แก้ไขผู้ใช้';
      document.getElementById('u_email').value = u.email || '';
      document.getElementById('u_password').value = '';
      document.getElementById('u_displayname').value = u.displayname || '';
      
      document.getElementById('u_accessLevel').value = u.accessLevel || 'member';
      document.getElementById('u_businessRole').value = u.businessRole || 'customer';
      document.getElementById('u_status').value = u.status || 'active';
      
      document.getElementById('u_note').value = u.note || '';
      document.getElementById('u_pw_hint').style.display = 'inline';

      // Super Admin protection guard for inputs
      const current = migrateUserFields(AUTH.current);
      const isSuperAdmin = current.accessLevel === 'super_admin';
      
      // Regular admin cannot change accessLevel dropdown
      document.getElementById('u_accessLevel').disabled = !isSuperAdmin;

      document.getElementById('u_ag_company').value = '';
      document.getElementById('u_ag_coagent').value = (u.coagent && u.coagent.accept === false) ? 'ไม่รับ' : 'รับ';
      const defaultShareVal = (u.coagent && u.coagent.defaultShare !== undefined) ? u.coagent.defaultShare : 40;
      document.getElementById('u_ag_coagentshare').value = defaultShareVal;
      toggleUserCoagentShare(document.getElementById('u_ag_coagent').value, 'u_ag_coagentshare_group');
      
      document.getElementById('u_ag_tel').value = u.phone || '';
      document.getElementById('u_ag_line').value = '';
      document.getElementById('u_ag_linelink').value = '';
      document.getElementById('u_ag_bank').value = '';
      document.getElementById('u_ag_fb').value = '';

      if (u.linkedAgentId) {
        const ag = DB.agents.find(x => x.id === u.linkedAgentId || x.name === u.linkedAgentId);
        if (ag) {
          document.getElementById('u_ag_company').value = ag.company || '';
          document.getElementById('u_ag_coagent').value = ag.coagent || 'รับ';
          const agShare = ag.coAgentDefaultShare !== undefined ? ag.coAgentDefaultShare : defaultShareVal;
          document.getElementById('u_ag_coagentshare').value = agShare;
          toggleUserCoagentShare(document.getElementById('u_ag_coagent').value, 'u_ag_coagentshare_group');
          document.getElementById('u_ag_tel').value = ag.tel || u.phone || '';
          document.getElementById('u_ag_line').value = ag.line || '';
          document.getElementById('u_ag_linelink').value = ag.linelink || '';
          document.getElementById('u_ag_bank').value = ag.bank || '';
          document.getElementById('u_ag_fb').value = ag.fb || '';
        }
      }

      // Populate social connection status display
      const socialSect = document.getElementById('u_socialStatusSection');
      if (socialSect) {
        socialSect.style.display = 'block';
        const provs = u.socialProviders || {};
        const statusGoogle = document.getElementById('u_social_status_google');
        const statusFacebook = document.getElementById('u_social_status_facebook');
        const statusLine = document.getElementById('u_social_status_line');
        
        if (statusGoogle) {
          statusGoogle.innerHTML = provs.google 
            ? `<span style="color:var(--green);font-weight:700;">🟢 Google Mail (เชื่อมแล้ว: ${provs.google.email || 'สำเร็จ'})</span>`
            : `<span style="color:var(--text3);">⚪ Google Mail (ยังไม่เชื่อม)</span>`;
        }
        if (statusFacebook) {
          statusFacebook.innerHTML = provs.facebook 
            ? `<span style="color:var(--green);font-weight:700;">🟢 Facebook (เชื่อมแล้ว: ${provs.facebook.displayName || 'สำเร็จ'})</span>`
            : `<span style="color:var(--text3);">⚪ Facebook (ยังไม่เชื่อม)</span>`;
        }
        if (statusLine) {
          let lineId = (provs.line && provs.line.lineId) || '';
          if (!lineId && u.linkedAgentId) {
            const ag = DB.agents.find(x => x.id === u.linkedAgentId || x.name === u.linkedAgentId);
            if (ag && ag.line) lineId = ag.line;
          }
          statusLine.innerHTML = lineId 
            ? `<span style="color:var(--green);font-weight:700;">🟢 Line ID (เชื่อมแล้ว: @${lineId.replace(/^@/, '')})</span>`
            : `<span style="color:var(--text3);">⚪ Line ID (ยังไม่เชื่อม)</span>`;
        }
        const uAgLine = document.getElementById('u_ag_line');
        if (uAgLine) {
          uAgLine.oninput = () => {
            const lineVal = uAgLine.value.trim().replace(/^@/, '');
            if (statusLine) {
              statusLine.innerHTML = lineVal
                ? `<span style="color:var(--green);font-weight:700;">🟢 Line ID (เชื่อมแล้ว: @${lineVal})</span>`
                : `<span style="color:var(--text3);">⚪ Line ID (ยังไม่เชื่อม)</span>`;
            }
          };
        }
      }

      toggleLinkedAgent();
      editMode = { type: 'user', idx: i };
      document.getElementById('modalUser').classList.add('open');
    }

    async function deleteUser(i) {
      const u = migrateUserFields(AUTH.users[i]);

      // Super Admin protection guard:
      // Regular admin cannot delete admin or super_admin!
      const current = migrateUserFields(AUTH.current);
      if (current.accessLevel !== 'super_admin') {
        if (u.accessLevel === 'super_admin' || u.accessLevel === 'admin') {
          alert('❌ ข้อผิดพลาด: เฉพาะผู้ดูแลระบบสูงสุด (Super Admin) เท่านั้นที่สามารถลบบัญชีผู้ดูแลระบบได้');
          return;
        }
      }

      if (!confirm(`ยืนยันลบ user "${u.email}"?`)) return;
      
      if (u.linkedAgentId) {
        await deleteItemFromDB('agents', u.linkedAgentId);
        const agIdx = DB.agents.findIndex(x => x.id === u.linkedAgentId);
        if (agIdx >= 0) {
          DB.agents.splice(agIdx, 1);
        }
      }
      
      AUTH.users.splice(i, 1);
      saveAuth();
      renderUsers();
      if (typeof populateMktSelect === 'function') populateMktSelect();
      if (!_realtimeSyncActive) { saveTolocalStorage(); }
    }

    async function doChangePw() {
      const oldPw = document.getElementById('cp_old').value;
      const newPw = document.getElementById('cp_new').value;
      const con = document.getElementById('cp_confirm').value;
      const errEl = document.getElementById('cp_error');
      const cur = AUTH.current;
      
      const hashedOldPw = await hashPassword(oldPw);
      if (cur.password !== oldPw && cur.password !== hashedOldPw) {
        errEl.textContent = 'รหัสผ่านปัจจุบันไม่ถูกต้อง';
        errEl.style.display = 'block';
        return;
      }
      if (!newPw || newPw.length < 6) {
        errEl.textContent = 'รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร';
        errEl.style.display = 'block';
        return;
      }
      if (newPw !== con) {
        errEl.textContent = 'รหัสผ่านใหม่ไม่ตรงกัน';
        errEl.style.display = 'block';
        return;
      }
      errEl.style.display = 'none';

      const hashedNewPw = await hashPassword(newPw);
      const idx = AUTH.users.findIndex(u => u.email.toLowerCase() === cur.email.toLowerCase());
      if (idx >= 0) {
        AUTH.users[idx].password = hashedNewPw;
        AUTH.current.password = hashedNewPw;
      }
      saveAuth();
      closeModal('changePw');
      alert('✅ เปลี่ยนรหัสผ่านสำเร็จ');
    }

    function renderProfileSettings() {
      const cur = AUTH.current;
      if (!cur) return;

      const user = AUTH.users.find(u => u.email === cur.email);
      if (!user) return;

      // Profile info
      const dnEl = document.getElementById('profDisplayName');
      const emEl = document.getElementById('profEmail');
      const roEl = document.getElementById('profRole');
      if (dnEl) dnEl.textContent = user.displayname || '-';
      if (emEl) emEl.textContent = user.email || '-';
      if (roEl) {
        const u = migrateUserFields(user);
        const [label, cls] = getRoleUIBadge(u.accessLevel, u.businessRole, u.status);
        roEl.textContent = label;
      }

      // Clear pw fields
      ['cp_old','cp_new','cp_confirm'].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = '';
      });
      const cpErr = document.getElementById('cp_error');
      if (cpErr) cpErr.style.display = 'none';

      const providers = user.socialProviders || {};

      // ── Google slot ──
      _renderModalSocialSlot(
        'statusGoogle', providers.google,
        'connectSocialAccountDrop("google")',
        'disconnectSocialAccountDrop("google")',
        providers.google ? (providers.google.email || providers.google.displayName || 'เชื่อมต่อแล้ว') : null
      );

      // ── Facebook slot ──
      _renderModalSocialSlot(
        'statusFacebook', providers.facebook,
        'connectSocialAccountDrop("facebook")',
        'disconnectSocialAccountDrop("facebook")',
        providers.facebook ? (providers.facebook.displayName || 'Facebook Account') : null
      );

      // ── Line slot (ถ้ามี element) ──
      const lineEl = document.getElementById('statusLine');
      if (lineEl) {
        let lineId = providers.line && providers.line.lineId ? providers.line.lineId : '';
        if (!lineId && user.linkedAgentId) {
          const ag = DB.agents.find(x => x.id === user.linkedAgentId || x.name === user.linkedAgentId);
          if (ag && ag.line) lineId = ag.line;
        }
        lineEl.innerHTML = '';
        if (lineId) {
          const badge = document.createElement('span');
          badge.style.cssText = 'color:#4caf50;font-size:11px;font-weight:700;margin-right:8px;';
          badge.textContent = '✔ @' + lineId;
          const editBtn = document.createElement('button');
          editBtn.className = 'btn btn-outline btn-sm';
          editBtn.style.cssText = 'font-size:10px;padding:2px 8px;';
          editBtn.textContent = '✏️ แก้ไข';
          editBtn.onclick = () => { closeProfileDropdown && closeProfileDropdown(); _editLineId(user); };
          lineEl.appendChild(badge);
          lineEl.appendChild(editBtn);
        } else {
          const addBtn = document.createElement('button');
          addBtn.className = 'btn btn-outline btn-sm';
          addBtn.style.cssText = 'font-size:10px;padding:2px 8px;border-color:var(--gold);color:var(--gold);';
          addBtn.textContent = '🔗 เพิ่ม Line ID';
          addBtn.onclick = () => _editLineId(user);
          lineEl.appendChild(addBtn);
        }
      }
    }

    async function _editLineId(user) {
      const currentLineId = (user.socialProviders && user.socialProviders.line && user.socialProviders.line.lineId) || '';
      const newLineId = prompt('กรุณากรอก Line ID ของคุณ:', currentLineId);
      if (newLineId === null) return; // user cancelled

      const cleaned = newLineId.trim().replace(/^@/, '');
      if (!user.socialProviders) user.socialProviders = {};
      if (cleaned) {
        user.socialProviders.line = { lineId: cleaned };
      } else {
        delete user.socialProviders.line;
      }

      // Also update matching agent profile if exists
      if (user.linkedAgentId) {
        let ag = DB.agents.find(x => x.id === user.linkedAgentId);
        if (ag) {
          ag.line = cleaned;
          await saveItem('agents', ag, ag.id);
        }
      }

      saveAuth();
      alert('✅ บันทึก Line ID สำเร็จแล้วค่ะ');
      renderDropdownProfile();
      renderProfileSettings();
    }

    // Helper: render a social slot in the modal using DOM (avoids innerHTML onclick issues)
    function _renderModalSocialSlot(elId, providerData, connectCall, disconnectCall, label) {
      const el = document.getElementById(elId);
      if (!el) return;
      el.innerHTML = '';

      if (providerData) {
        const badge = document.createElement('span');
        badge.style.cssText = 'color:#4caf50;font-size:11px;font-weight:700;margin-right:8px;white-space:nowrap;';
        badge.textContent = '✔ ' + (label || 'เชื่อมต่อแล้ว');

        const btn = document.createElement('button');
        btn.className = 'btn btn-danger btn-sm';
        btn.style.cssText = 'font-size:10px;padding:2px 8px;';
        btn.textContent = 'ยกเลิก';
        btn.setAttribute('onclick', disconnectCall);

        el.appendChild(badge);
        el.appendChild(btn);
      } else {
        const btn = document.createElement('button');
        btn.className = 'btn btn-outline btn-sm';
        btn.style.cssText = 'font-size:10px;padding:2px 10px;border-color:var(--gold);color:var(--gold);font-weight:700;';
        btn.textContent = '🔗 เชื่อมต่อ';
        btn.setAttribute('onclick', connectCall);

        el.appendChild(btn);
      }
    }


    async function connectSocialAccount(type) {
      if (FIREBASE_CONFIG.apiKey === 'YOUR_API_KEY') {
        alert('❌ ระบบคลาวด์/Firebase ยังไม่ได้กำหนดค่า กรุณากรอกการตั้งค่า Firebase ก่อนเชื่อมต่อบัญชีค่ะ');
        return;
      }
      
      try {
        const { auth, signInWithPopup, GoogleAuthProvider, FacebookAuthProvider } = await initFirebaseAuth();
        let provider;
        if (type === 'google') {
          provider = new GoogleAuthProvider();
          provider.setCustomParameters({ prompt: 'select_account' });
        } else if (type === 'facebook') {
          provider = new FacebookAuthProvider();
        }
        
        const result = await signInWithPopup(auth, provider);
        const user = result.user;
        const email = (user.email || '').toLowerCase().trim();
        const displayname = user.displayName || email.split('@')[0];
        
        const cur = AUTH.current;
        const found = AUTH.users.find(u => u.email === cur.email);
        if (found) {
          if (!found.socialProviders) found.socialProviders = {};
          found.socialProviders[type] = {
            uid: user.uid,
            email: email || `${user.uid}@facebook.com`,
            displayName: displayname
          };
          saveAuth();
          renderProfileSettings();
          alert(`✅ เชื่อมต่อบัญชี ${type === 'google' ? 'Google' : 'Facebook'} สำเร็จค่ะ`);
        }
      } catch (e) {
        console.error('Link account error:', e);
        alert(`❌ ไม่สามารถเชื่อมต่อบัญชีได้ค่ะ: ` + e.message);
      }
    }

    async function disconnectSocialAccount(type) {
      if (!confirm(`คุณต้องการยกเลิกการเชื่อมต่อบัญชี ${type === 'google' ? 'Google' : 'Facebook'} หรือไม่?`)) return;
      
      const cur = AUTH.current;
      const found = AUTH.users.find(u => u.email === cur.email);
      if (found && found.socialProviders && found.socialProviders[type]) {
        delete found.socialProviders[type];
        saveAuth();
        renderProfileSettings();
        alert(`✅ ยกเลิกการเชื่อมต่อบัญชี ${type === 'google' ? 'Google' : 'Facebook'} เรียบร้อยค่ะ`);
      }
    }

    window.doLoginWithFacebook = doLoginWithFacebook;
    window.renderProfileSettings = renderProfileSettings;
    window.connectSocialAccount = connectSocialAccount;
    window.disconnectSocialAccount = disconnectSocialAccount;

    // ============================
    // PROFILE DROPDOWN
    // ============================
    let _profileDropOpen = false;

    function toggleProfileDropdown() {
      _profileDropOpen ? closeProfileDropdown() : openProfileDropdown();
    }

    function openProfileDropdown() {
      const drop = document.getElementById('profileDropdown');
      const chevron = document.getElementById('profileDropChevron');
      if (!drop) return;
      drop.style.display = 'block';
      // Small animation
      drop.style.opacity = '0';
      drop.style.transform = 'translateY(-8px)';
      requestAnimationFrame(() => {
        drop.style.transition = 'opacity 0.18s ease, transform 0.18s ease';
        drop.style.opacity = '1';
        drop.style.transform = 'translateY(0)';
      });
      if (chevron) chevron.textContent = '▴';
      _profileDropOpen = true;
      renderDropdownProfile();
      // Close on outside click
      setTimeout(() => {
        document.addEventListener('click', _outsideClickHandler);
      }, 10);
    }

    function closeProfileDropdown() {
      const drop = document.getElementById('profileDropdown');
      const chevron = document.getElementById('profileDropChevron');
      if (!drop) return;
      drop.style.opacity = '0';
      drop.style.transform = 'translateY(-8px)';
      setTimeout(() => { drop.style.display = 'none'; drop.style.transition = ''; }, 180);
      if (chevron) chevron.textContent = '▾';
      _profileDropOpen = false;
      document.removeEventListener('click', _outsideClickHandler);
      // clear password fields
      ['drop_cp_old','drop_cp_new','drop_cp_confirm'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
      });
      const errEl = document.getElementById('drop_cp_error');
      if (errEl) errEl.style.display = 'none';
    }

    function _outsideClickHandler(e) {
      const wrapper = document.getElementById('profileDropdownWrapper');
      if (wrapper && !wrapper.contains(e.target)) {
        closeProfileDropdown();
      }
    }

    function renderDropdownProfile() {
      const cur = AUTH.current;
      if (!cur) return;
      const user = AUTH.users.find(u => u.email === cur.email);
      if (!user) return;

      const displayName = user.displayname || user.email || '-';
      const initial = (displayName.charAt(0) || '?').toUpperCase();

      // Avatar initial in badge & dropdown header
      const avatarBadge = document.getElementById('profileAvatarBadge');
      if (avatarBadge) avatarBadge.textContent = initial;
      const avatarDrop = document.getElementById('profileDropAvatar');
      if (avatarDrop) avatarDrop.textContent = initial;

      // Profile details
      const nameEl = document.getElementById('profileDropName');
      const emailEl = document.getElementById('profileDropEmail');
      const roleEl = document.getElementById('profileDropRole');
      if (nameEl) nameEl.textContent = displayName;
      if (emailEl) emailEl.textContent = user.email || '-';
      if (roleEl) {
        const u = migrateUserFields(user);
        const [label, cls] = getRoleUIBadge(u.accessLevel, u.businessRole, u.status);
        roleEl.textContent = label;
      }

      // Social connection status
      const providers = user.socialProviders || {};
      _renderDropSocialSlot('dropStatusGoogle', providers.google,
        () => connectSocialAccountDrop('google'), () => disconnectSocialAccountDrop('google'),
        providers.google ? (providers.google.email || providers.google.displayName || 'เชื่อมต่อแล้ว') : null
      );
      _renderDropSocialSlot('dropStatusFacebook', providers.facebook,
        () => connectSocialAccountDrop('facebook'), () => disconnectSocialAccountDrop('facebook'),
        providers.facebook ? (providers.facebook.displayName || 'Facebook Account') : null
      );

      // Populate agent profile section in dropdown
      const dropAgentSection = document.getElementById('dropAgentProfileSection');
      if (dropAgentSection) {
        const u = migrateUserFields(user);
        if (u.businessRole === 'agent' || u.accessLevel === 'admin' || u.accessLevel === 'super_admin' || u.businessRole === 'owner' || u.status === 'pending') {
          dropAgentSection.style.display = 'block';
          const linkedAgent = user.linkedAgentId ? DB.agents.find(a => a.id === user.linkedAgentId) : null;
          document.getElementById('drop_ag_company').value = linkedAgent ? (linkedAgent.company || '') : '';
          const dropCoagentVal = linkedAgent ? (linkedAgent.coagent || 'รับ') : 'รับ';
          document.getElementById('drop_ag_coagent').value = dropCoagentVal;
          const dropCoagentShareVal = linkedAgent ? (linkedAgent.coAgentDefaultShare || 40) : (user.coagent && user.coagent.defaultShare !== undefined ? user.coagent.defaultShare : 40);
          document.getElementById('drop_ag_coagentshare').value = dropCoagentShareVal;
          toggleUserCoagentShare(dropCoagentVal, 'drop_ag_coagentshare_group');
          document.getElementById('drop_ag_tel').value = linkedAgent ? (linkedAgent.tel || '') : (user.phone || '');
          document.getElementById('drop_ag_line').value = linkedAgent ? (linkedAgent.line || '') : '';
          document.getElementById('drop_ag_linelink').value = linkedAgent ? (linkedAgent.linelink || '') : '';
          document.getElementById('drop_ag_bank').value = linkedAgent ? (linkedAgent.bank || '') : '';
          document.getElementById('drop_ag_fb').value = linkedAgent ? (linkedAgent.fb || '') : '';
        } else {
          dropAgentSection.style.display = 'none';
        }
      }
    }

    function updatePendingCountNotification() {
      const cur = migrateUserFields(AUTH.current);
      if (!cur || (cur.accessLevel !== 'admin' && cur.accessLevel !== 'super_admin')) return;

      const pendingCount = AUTH.users.filter(u => migrateUserFields(u).status === 'pending').length;
      
      // Update Desktop Settings Tab
      const tabSettings = document.getElementById('tabSettings');
      if (tabSettings) {
        if (pendingCount > 0) {
          tabSettings.innerHTML = `⚙️ ตั้งค่า <span style="background:var(--red);color:#fff;border-radius:10px;padding:2px 7px;font-size:10px;margin-left:4px;font-weight:700;display:inline-block;line-height:1;box-shadow:0 2px 5px rgba(224,80,80,0.3);">คำขอ: ${pendingCount}</span>`;
        } else {
          tabSettings.innerHTML = `⚙️ ตั้งค่า`;
        }
      }

      // Update Mobile Drawer Settings button
      const drawerProfileBtn = document.getElementById('drawerProfile');
      if (drawerProfileBtn) {
        let badgeEl = drawerProfileBtn.querySelector('.badge-pending-count');
        if (pendingCount > 0) {
          if (!badgeEl) {
            badgeEl = document.createElement('span');
            badgeEl.className = 'badge-pending-count';
            badgeEl.style.cssText = 'font-size:10px;color:#fff;background:var(--red);padding:2px 6px;border-radius:10px;font-weight:700;margin-left:8px;';
            drawerProfileBtn.appendChild(badgeEl);
          }
          badgeEl.textContent = `รออนุมัติ: ${pendingCount}`;
          badgeEl.style.display = 'inline-block';
        } else if (badgeEl) {
          badgeEl.style.display = 'none';
        }
      }
    }
    window.updatePendingCountNotification = updatePendingCountNotification;

    async function saveAgentProfileFromDrop() {
      const cur = AUTH.current;
      if (!cur) return;
      const user = AUTH.users.find(u => u.email === cur.email);
      if (!user) return;

      const company = document.getElementById('drop_ag_company').value.trim();
      const coagent = document.getElementById('drop_ag_coagent').value;
      const coagentShare = parseInt(document.getElementById('drop_ag_coagentshare').value) || 40;
      const tel = document.getElementById('drop_ag_tel').value.trim();
      const line = document.getElementById('drop_ag_line').value.trim();
      const linelink = document.getElementById('drop_ag_linelink').value.trim();
      const bank = document.getElementById('drop_ag_bank').value.trim();
      const fb = document.getElementById('drop_ag_fb').value.trim();

      // Check if user has linkedAgentId
      let agentId = user.linkedAgentId;
      const u = migrateUserFields(user);
      if (!agentId && (u.businessRole === 'agent' || u.accessLevel === 'admin' || u.accessLevel === 'super_admin' || u.businessRole === 'owner' || u.status === 'pending')) {
        agentId = genId();
        user.linkedAgentId = agentId;
      }

      if (agentId) {
        let ag = DB.agents.find(x => x.id === agentId);
        if (!ag) {
          ag = { id: agentId };
          DB.agents.push(ag);
        }
        ag.name = user.displayname || user.email.split('@')[0];
        ag.email = user.email;
        ag.company = company;
        ag.coagent = coagent;
        ag.coAgentDefaultShare = coagentShare;
        ag.tel = tel;
        ag.line = line;
        ag.linelink = linelink;
        ag.bank = bank;
        ag.fb = fb;

        // update co-agent default share in user profile too
        if (!user.coagent) user.coagent = {};
        user.coagent.accept = (coagent === 'รับ');
        user.coagent.defaultShare = coagentShare;
        
        // Sync Line ID to socialProviders
        if (!user.socialProviders) user.socialProviders = {};
        user.socialProviders.coagent = { accept: (coagent === 'รับ'), defaultShare: coagentShare };
        if (line) {
          user.socialProviders.line = { lineId: line.replace(/^@/, '') };
        } else {
          delete user.socialProviders.line;
        }
        
        await saveItem('agents', ag, agentId);
      }

      // Save phone number directly into user credentials
      user.phone = tel;

      saveAuth();
      alert('✅ บันทึกข้อมูลส่วนตัวเรียบร้อยแล้วค่ะ!');
      renderDropdownProfile();
      if (u.accessLevel === 'admin' || u.accessLevel === 'super_admin') {
        renderUsers();
      }
    }
    window.saveAgentProfileFromDrop = saveAgentProfileFromDrop;

    function _renderDropSocialSlot(elId, providerData, connectFn, disconnectFn, label) {
      const el = document.getElementById(elId);
      if (!el) return;
      if (providerData) {
        el.innerHTML = '';
        const badge = document.createElement('span');
        badge.style.cssText = 'color:#4caf50;font-size:10px;font-weight:700;margin-right:6px;';
        badge.textContent = '✔ ' + (label || 'เชื่อมต่อแล้ว');
        const btn = document.createElement('button');
        btn.textContent = 'ยกเลิก';
        btn.style.cssText = 'font-size:10px;padding:2px 7px;border-radius:5px;border:1px solid #c44;background:rgba(200,50,50,0.12);color:#e55;cursor:pointer;';
        btn.onclick = disconnectFn;
        el.appendChild(badge);
        el.appendChild(btn);
      } else {
        el.innerHTML = '';
        const btn = document.createElement('button');
        btn.textContent = '🔗 เชื่อมต่อ';
        btn.style.cssText = 'font-size:10px;padding:3px 9px;border-radius:5px;border:1px solid var(--gold);background:rgba(192,120,0,0.12);color:var(--gold);cursor:pointer;font-weight:700;';
        btn.onclick = connectFn;
        el.appendChild(btn);
      }
    }

    function syncCoagentSplitUI(sharePct) {
      const splitEl = document.getElementById('a_coagentSplit');
      const shareEl = document.getElementById('a_coagentshare');
      const pctEl = document.getElementById('a_coagentshare_pct');
      if (!splitEl || !shareEl) return;

      const val = parseInt(sharePct) || 0;
      if (val === 40 || val === 50 || val === 30) {
        splitEl.value = String(val);
        shareEl.style.display = 'none';
        if (pctEl) pctEl.style.display = 'none';
        shareEl.value = val;
      } else {
        splitEl.value = 'custom';
        shareEl.style.display = 'inline-block';
        if (pctEl) pctEl.style.display = 'inline-block';
        shareEl.value = val;
      }
    }
    window.syncCoagentSplitUI = syncCoagentSplitUI;

    window.toggleCustomCoagent = function(val) {
      const shareEl = document.getElementById('a_coagentshare');
      const pctEl = document.getElementById('a_coagentshare_pct');
      if (!shareEl) return;
      if (val === 'custom') {
        shareEl.style.display = 'inline-block';
        if (pctEl) pctEl.style.display = 'inline-block';
        shareEl.value = 40;
      } else {
        shareEl.style.display = 'none';
        if (pctEl) pctEl.style.display = 'none';
        shareEl.value = parseInt(val) || 40;
      }
    };



    async function connectSocialAccountDrop(type) {
      if (FIREBASE_CONFIG.apiKey === 'YOUR_API_KEY') {
        alert('❌ Firebase ยังไม่ได้ตั้งค่า กรุณากรอก Firebase Config ก่อนค่ะ');
        return;
      }
      try {
        const { auth, signInWithPopup, GoogleAuthProvider, FacebookAuthProvider } = await initFirebaseAuth();
        let provider;
        if (type === 'google') {
          provider = new GoogleAuthProvider();
          provider.setCustomParameters({ prompt: 'select_account' });
        } else {
          provider = new FacebookAuthProvider();
        }
        const result = await signInWithPopup(auth, provider);
        const fbUser = result.user;
        let email = (fbUser.email || '').toLowerCase().trim();
        if (!email && fbUser.providerData && fbUser.providerData[0]) {
          email = (fbUser.providerData[0].email || '').toLowerCase().trim();
        }
        const displayName = fbUser.displayName || email || fbUser.uid;

        const cur = AUTH.current;
        const found = AUTH.users.find(u => u.email === cur.email);
        if (found) {
          if (!found.socialProviders) found.socialProviders = {};
          found.socialProviders[type] = { uid: fbUser.uid, email, displayName };
          saveAuth();
          renderDropdownProfile();
          renderProfileSettings(); // ซิงก์กับ modal ด้วย
          const label = type === 'google' ? 'Google Mail' : 'Facebook';
          alert(`✅ เชื่อมต่อ ${label} สำเร็จแล้วค่ะ`);
        }
      } catch (e) {
        console.error('Connect social error:', e);
        const label = type === 'google' ? 'Google' : 'Facebook';
        alert(`❌ เชื่อมต่อ ${label} ไม่สำเร็จ: ` + e.message);
      }
    }

    async function disconnectSocialAccountDrop(type) {
      const label = type === 'google' ? 'Google Mail' : 'Facebook';
      if (!confirm(`ยืนยันยกเลิกการเชื่อมต่อ ${label} หรือไม่?`)) return;
      const cur = AUTH.current;
      const found = AUTH.users.find(u => u.email === cur.email);
      if (found && found.socialProviders && found.socialProviders[type]) {
        delete found.socialProviders[type];
        saveAuth();
        renderDropdownProfile();
        renderProfileSettings();
        alert(`✅ ยกเลิกการเชื่อมต่อ ${label} เรียบร้อยค่ะ`);
      }
    }

    async function doChangePwDrop() {
      const oldPw = (document.getElementById('drop_cp_old').value || '').trim();
      const newPw = (document.getElementById('drop_cp_new').value || '').trim();
      const con   = (document.getElementById('drop_cp_confirm').value || '').trim();
      const errEl = document.getElementById('drop_cp_error');
      errEl.style.display = 'none';

      const cur = AUTH.current;
      if (!cur) return;

      // Social login users ไม่ใช้ password แบบปกติ
      const isSocialOnly = cur.password && (
        cur.password.includes('google-auth') || cur.password.includes('facebook-auth')
      );

      const hashedOldPw = await hashPassword(oldPw);
      if (!isSocialOnly && cur.password !== oldPw && cur.password !== hashedOldPw) {
        errEl.textContent = '❌ รหัสผ่านปัจจุบันไม่ถูกต้อง';
        errEl.style.display = 'block'; return;
      }
      if (!newPw || newPw.length < 6) {
        errEl.textContent = '❌ รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร';
        errEl.style.display = 'block'; return;
      }
      if (newPw !== con) {
        errEl.textContent = '❌ ยืนยันรหัสผ่านไม่ตรงกัน';
        errEl.style.display = 'block'; return;
      }

      const hashedNewPw = await hashPassword(newPw);
      const idx = AUTH.users.findIndex(u => u.email.toLowerCase() === cur.email.toLowerCase());
      if (idx >= 0) {
        AUTH.users[idx].password = hashedNewPw;
        AUTH.current.password = hashedNewPw;
      }
      saveAuth();
      closeProfileDropdown();
      alert('✅ เปลี่ยนรหัสผ่านสำเร็จแล้วค่ะ');
    }

    window.toggleProfileDropdown = toggleProfileDropdown;
    window.openProfileDropdown  = openProfileDropdown;
    window.closeProfileDropdown = closeProfileDropdown;
    window.renderDropdownProfile = renderDropdownProfile;
    window.doChangePwDrop = doChangePwDrop;
    window.connectSocialAccountDrop = connectSocialAccountDrop;
    window.disconnectSocialAccountDrop = disconnectSocialAccountDrop;

    // ============================
    // MODALS
    // ============================
    function openModal(t) {
      const modalId = 'modal' + t.charAt(0).toUpperCase() + t.slice(1);
      document.getElementById(modalId).classList.add('open');
      if (t !== 'user') editMode = { type: t, idx: -1 };
      if (t === 'changePw') renderProfileSettings();
      if (t === 'asset') {
        document.getElementById('modalAssetTitle').textContent = '🏠 เพิ่มทรัพย์สิน';
        // Clear all fields
        ['a_name', 'a_location', 'a_price', 'a_roomtype', 'a_area', 'a_floor', 'a_link', 'a_map', 'a_linkpic', 'a_postdate', 'a_updatedate', 'a_contact', 'a_note', 'a_reservationDate', 'a_reservationEndDate', 'a_bts', 'a_rentStartDate', 'a_rentPeriod', 'a_rentPeriodCustom', 'a_rentEndDate'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
        document.getElementById('a_status').value = 'เช่า';
        document.getElementById('a_type').value = 'คอนโด';
        document.getElementById('a_careContract').value = 'ยังไม่ทำ';
        document.getElementById('a_careRepair').value = 'ไม่มี';
        document.getElementById('a_careRent').value = 'ยังไม่เก็บ';
        document.getElementById('a_reservationPeriod').value = '';
        document.getElementById('a_active_available').checked = true;

        const curUser = AUTH.current ? AUTH.users.find(u => u.email === AUTH.current.email) : null;
        const userCoagent = curUser && (curUser.coagent || (curUser.socialProviders && curUser.socialProviders.coagent))
          ? (curUser.coagent || curUser.socialProviders.coagent)
          : { accept: true, defaultShare: 40 };
        const isCoagentAccept = userCoagent.accept !== false;
        document.getElementById('a_coagent').checked = isCoagentAccept;
        document.getElementById('a_coagent_controls').style.display = isCoagentAccept ? 'flex' : 'none';
        const defShare = userCoagent.defaultShare !== undefined ? userCoagent.defaultShare : 40;
        document.getElementById('a_coagentshare').value = defShare;
        if (typeof syncCoagentSplitUI === 'function') {
          syncCoagentSplitUI(defShare);
        }
        
        // Reset deal type radio
        const dealSoldEl = document.getElementById('a_deal_sold');
        if (dealSoldEl) dealSoldEl.checked = true;
        
        toggleReservationFields();
        // Set today's date
        const today = new Date().toISOString().slice(0, 10);
        document.getElementById('a_postdate').value = today;
        document.getElementById('a_updatedate').value = today;
        // Auto-set ผู้โพสต์เป็นชื่อผู้ใช้งานปัจจุบัน
        const currentUserName = AUTH.current ? (AUTH.current.displayname || AUTH.current.email || '') : '';
        populatePosterSelect(currentUserName);
      }
      if (t === 'customer') {
        document.getElementById('modalCustomerTitle').textContent = '🤝 เพิ่มลูกค้า';
        ['cu_name', 'cu_budget', 'cu_area', 'cu_floor', 'cu_contact', 'cu_linkpost', 'cu_note', 'cu_line', 'cu_stationStart', 'cu_stationEnd', 'cu_targetDate'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
        onCustModalTrainLineChange();
      }
      if (t === 'user') {
        document.getElementById('modalUserTitle').textContent = '👤 เพิ่มผู้ใช้งาน';
        document.getElementById('u_email').value = '';
        document.getElementById('u_password').value = '';
        document.getElementById('u_displayname').value = '';
        document.getElementById('u_role').value = 'agent';
        document.getElementById('u_note').value = '';
        document.getElementById('u_pw_hint').style.display = 'none';
        
        // Reset new agent profile inputs
        document.getElementById('u_ag_company').value = '';
        document.getElementById('u_ag_coagent').value = 'รับ';
        document.getElementById('u_ag_coagentshare').value = '40';
        toggleUserCoagentShare('รับ', 'u_ag_coagentshare_group');
        document.getElementById('u_ag_tel').value = '';
        document.getElementById('u_ag_line').value = '';
        document.getElementById('u_ag_linelink').value = '';
        document.getElementById('u_ag_bank').value = '';
        document.getElementById('u_ag_fb').value = '';

        toggleLinkedAgent();
        const socialSect = document.getElementById('u_socialStatusSection');
        if (socialSect) socialSect.style.display = 'none';
        editMode = { type: 'user', idx: -1 };
      }
    }
    function closeModal(t) { document.getElementById('modal' + t.charAt(0).toUpperCase() + t.slice(1)).classList.remove('open'); }

    // ============================
    // SAVE ASSET
    // ============================
    async function saveAsset() {
      const activeVal = document.querySelector('input[name="a_listingActive"]:checked');
      const a = {
        name: v('a_name'), location: v('a_location'), bts: v('a_bts'), status: v('a_status'), type: v('a_type'),
        price: v('a_price'), roomtype: v('a_roomtype'), area: v('a_area'), floor: v('a_floor'),
        link: v('a_link'), map: v('a_map'), linkpic: v('a_linkpic'), postdate: v('a_postdate'), updatedate: v('a_updatedate'),
        contact: v('a_contact'), poster: v('a_poster'), note: v('a_note'),
        listingActive: activeVal ? activeVal.value : 'available',
        careContract: v('a_careContract') || 'ยังไม่ทำ',
        careRepair: v('a_careRepair') || 'ไม่มี',
        careRent: v('a_careRent') || 'ยังไม่เก็บ',
        coagent: document.getElementById('a_coagent').checked,
        coagentshare: parseInt(document.getElementById('a_coagentshare').value) || 0
      };

      // Reset / Initialize deal & reservation fields
      a.reservationDate = '';
      a.reservationPeriod = '';
      a.reservationEndDate = '';
      a.closedDealType = '';
      a.rentStartDate = '';
      a.rentPeriod = '';
      a.rentPeriodCustom = '';
      a.rentEndDate = '';

      // เพิ่มข้อมูลการจอง (ถ้าเลือกสถานะ "จอง")
      if (a.listingActive === 'reserved') {
        a.reservationDate = v('a_reservationDate');
        a.reservationPeriod = v('a_reservationPeriod');
        a.reservationEndDate = v('a_reservationEndDate');
      } else if (a.listingActive === 'sold') {
        // เพิ่มข้อมูลการปิดดีลขาย/เช่า (ถ้าเลือกสถานะ "ขาย/เช่าไปแล้ว")
        const closedTypeEl = document.querySelector('input[name="a_closedDealType"]:checked');
        a.closedDealType = closedTypeEl ? closedTypeEl.value : 'sold';
        if (a.closedDealType === 'rented') {
          a.rentStartDate = v('a_rentStartDate');
          a.rentPeriod = v('a_rentPeriod');
          a.rentPeriodCustom = v('a_rentPeriodCustom');
          a.rentEndDate = v('a_rentEndDate');
        }
      }

      if (!a.name) { alert('❌ กรุณาใส่ชื่อโครงการ'); return; }
      if (!a.link) { alert('❌ กรุณาใส่ Link โครงการ/Facebook'); return; }
      if (editMode.idx >= 0) {
        const existing = DB.assets[editMode.idx];
        // ตรวจสอบสิทธิ์: เฉพาะเจ้าของโพสต์หรือ admin เท่านั้นถึงจะแก้ไขได้
        if (!window._canEditAsset(existing)) {
          alert('🔒 ไม่สามารถแก้ไขได้ — คุณไม่ใช่เจ้าของโพสต์นี้\nเฉพาะ Admin หรือผู้โพสต์เดิมเท่านั้นถึงจะแก้ไขได้');
          closeModal('asset');
          return;
        }
        a.id = existing.id || genId();
        // รักษา creatorEmail เดิมไว้
        a.creatorEmail = existing.creatorEmail || '';
        await saveItem('assets', a, a.id);
        if (!_realtimeSyncActive) {
          DB.assets[editMode.idx] = a;
          saveTolocalStorage();
          renderAssets(); populateCbSelect();
        }
      } else {
        // ตรวจสอบโควตารายวันสำหรับ Agent
        const cur = migrateUserFields(AUTH.current);
        const isAdmin = cur && (cur.accessLevel === 'super_admin' || cur.accessLevel === 'admin');
        if (cur && !isAdmin) {
          const todayStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
          const userEmail = cur.email ? cur.email.toLowerCase() : '';
          
          // นับเคสที่เอเจนต์คนนี้สร้างขึ้นในวันนี้
          const todayCount = DB.assets.filter(item => {
            const isSameUser = item.creatorEmail && item.creatorEmail.toLowerCase() === userEmail;
            const isSameDay = item.postdate && item.postdate === todayStr;
            return isSameUser && isSameDay;
          }).length;
          
          if (todayCount >= _dailyQuotaLimit) {
            alert(`🚨 โควตาลงประกาศฟรีของคุณเต็มแล้ว (${_dailyQuotaLimit} เคสต่อวัน) กรุณาติดต่อแอดมินเพื่อขยายโควตา`);
            return;
          }
        }

        // สร้างใหม่: บันทึก creatorEmail ของผู้สร้าง
        a.creatorEmail = AUTH.current ? AUTH.current.email : '';
        const saved = await saveItem('assets', a);
        if (!_realtimeSyncActive) {
          DB.assets.push(saved);
          saveTolocalStorage();
          renderAssets(); populateCbSelect();
        }
      }
      closeModal('asset');
      if (!_realtimeSyncActive) { renderStats(); }
    }

    // ============================
    // SAVE CUSTOMER
    // ============================
    async function saveCustomer() {
      const a = { name: v('cu_name'), status: v('cu_status'), type: v('cu_type'), budget: v('cu_budget'), area: v('cu_area'), floor: v('cu_floor'), contact: v('cu_contact'), linkpost: v('cu_linkpost'), note: v('cu_note'), line: v('cu_line'), stationStart: v('cu_stationStart'), stationEnd: v('cu_stationEnd'), targetDate: v('cu_targetDate') };
      if (!a.name) { alert('กรุณากรอกชื่อโครงการหรือชื่อลูกค้า'); return; }
      if (editMode.idx >= 0) {
        const existing = DB.customers[editMode.idx];
        a.id = existing.id || genId();
        await saveItem('customers', a, a.id);
        if (!_realtimeSyncActive) {
          DB.customers[editMode.idx] = a;
          renderCustomers();
        }
      } else {
        const saved = await saveItem('customers', a);
        if (!_realtimeSyncActive) {
          DB.customers.push(saved);
          renderCustomers();
        }
      }
      closeModal('customer');
      if (!_realtimeSyncActive) { saveTolocalStorage(); }
    }
    // ============================
    // DELETE
    // ============================
    async function deleteItem(type, idx) {
      const item = DB[type][idx];
      // ตรวจสอบสิทธิ์ลบทรัพย์สิน: เฉพาะเจ้าของโพสต์หรือ admin
      if (type === 'assets' && !window._canDeleteAsset(item)) {
        alert('🔒 ไม่สามารถลบได้ — คุณไม่ใช่เจ้าของโพสต์นี้\nโพสต์โดย: ' + (item.poster || 'ไม่ระบุ'));
        return;
      }
      if (!confirm('ยืนยันลบ?')) return;
      // BUG FIX: ถ้า item ไม่มี id (data เก่าที่ import มาโดยไม่มี id) ให้ assign id ก่อน delete จาก Firebase
      if (!item.id) item.id = genId();
      await deleteItemFromDB(type, item.id);
      DB[type].splice(idx, 1);
      saveTolocalStorage();
      renderAssets(); renderAgents(); renderCustomers(); renderStats();
    }

    // ============================
    // HELPERS
    // ============================
    // ============================
    // CLIPBOARD
    // ============================
    function populateCbSelect() {
      // just refresh the hidden select & rebuild dropdown items list
      // the actual dropdown is rendered by filterCbAssets()
      const searchEl = document.getElementById('cbAssetSearch');
      const hiddenEl = document.getElementById('cbAssetSelect');
      if (!searchEl || !hiddenEl) return;
      // If current value still valid keep it, else reset
      const curIdx = hiddenEl.value;
      if (curIdx !== '' && (!DB.assets[parseInt(curIdx)] || !DB.assets[parseInt(curIdx)].name)) {
        hiddenEl.value = '';
        searchEl.value = '';
        generateClipboard();
      }
      populateCbAgentSelect();
      if (typeof populateMktSelect === 'function') {
        populateMktSelect();
      }
    }

    // --- Searchable asset dropdown helpers ---
    function getCbAssetItems(query) {
      const q = (query || '').toLowerCase().trim();
      return DB.assets
        .map((a, i) => ({ a, i }))
        .filter(({ a }) => {
          const la = a.listingActive || 'available';
          if (la === 'sold') return false; // hide sold by default
          if (!q) return true;
          return (a.name || '').toLowerCase().includes(q) || (a.location || '').toLowerCase().includes(q) || (a.bts || '').toLowerCase().includes(q) || (a.status || '').toLowerCase().includes(q);
        })
        .sort((x, y) => {
          const dx = parseDateVal(x.a.postdate);
          const dy = parseDateVal(y.a.postdate);
          if (dx !== dy) return dy - dx;
          return y.i - x.i;
        });
    }

    function openCbDropdown() {
      filterCbAssets();
      document.getElementById('cbAssetDropdown').style.display = 'block';
    }
    function closeCbDropdown() {
      const dd = document.getElementById('cbAssetDropdown');
      if (dd) dd.style.display = 'none';
    }
    function filterCbAssets() {
      const q = document.getElementById('cbAssetSearch').value;
      const dd = document.getElementById('cbAssetDropdown');
      if (!dd) return;
      const items = getCbAssetItems(q);
      if (!items.length) {
        dd.innerHTML = `<div style="padding:12px 16px;color:var(--text3);font-size:13px;">ไม่พบทรัพย์สิน</div>`;
      } else {
        dd.innerHTML = items.map(({ a, i }) => {
          const la = a.listingActive || 'available';
          const laTag = la === 'reserved' ? ` <span style="font-size:10px;background:rgba(201,168,76,0.2);color:var(--gold);border-radius:3px;padding:1px 5px;">จอง</span>` :
                        la === 'sold' ? (a.closedDealType === 'rented' ? ` <span style="font-size:10px;background:rgba(80,200,120,0.2);color:var(--green);border-radius:3px;padding:1px 5px;">เช่าแล้ว</span>` : ` <span style="font-size:10px;background:rgba(224,80,80,0.2);color:var(--red);border-radius:3px;padding:1px 5px;">ขายแล้ว</span>`) : '';
          return `<div class="cb-asset-item" onclick="selectCbAsset(${i},'${(a.name || '').replace(/'/g, "\\'")} (${a.status || ''})')"
            style="padding:9px 14px;cursor:pointer;border-bottom:1px solid var(--border2);font-size:13px;display:flex;justify-content:space-between;align-items:center;">
            <span style="font-weight:600;color:var(--text)">${a.name || '(ไม่มีชื่อ)'}${laTag}</span>
            <span style="color:var(--text3);font-size:12px;">${a.status || ''} · ${a.location || ''}</span>
          </div>`;
        }).join('');
      }
      dd.style.display = 'block';
    }
    function selectCbAsset(idx, label) {
      document.getElementById('cbAssetSearch').value = label;
      document.getElementById('cbAssetSelect').value = idx;
      document.getElementById('cbAssetDropdown').style.display = 'none';
      generateClipboard();
    }
    function populateCbAgentSelect() {
      const sel = document.getElementById('cbAgentSelect');
      if (!sel) return;
      sel.innerHTML = '<option value="">-- ใช้ข้อมูลติดต่อจากทรัพย์สิน --</option>' +
        DB.agents.map((ag, i) => `<option value="${i}">${ag.name || 'ไม่มีชื่อ'}${ag.company ? ' (' + ag.company + ')' : ''}</option>`).join('');
    }
    function populatePosterSelect(currentVal) {
      const sel = document.getElementById('a_poster');
      if (!sel) return;
      sel.innerHTML = '<option value="">-- เลือก Agent --</option>' +
        DB.agents.map(ag => `<option value="${ag.name || ''}"${(ag.name && ag.name === currentVal) ? ' selected' : ''}>${ag.name || 'ไม่มีชื่อ'}${ag.company ? ' (' + ag.company + ')' : ''}</option>`).join('');
      if (currentVal && !DB.agents.find(ag => ag.name === currentVal)) {
        // value exists but not in list (old data) — add as option
        sel.innerHTML += `<option value="${currentVal}" selected>${currentVal}</option>`;
      }
      // Disable the select if the logged-in user is not an admin
      const cur = migrateUserFields(AUTH.current);
      const isAdmin = cur && (cur.accessLevel === 'super_admin' || cur.accessLevel === 'admin');
      if (cur && !isAdmin) {
        sel.disabled = true;
      } else {
        sel.disabled = false;
      }
    }
    function onCbAgentChange() {
      const agIdx = document.getElementById('cbAgentSelect').value;
      const preview = document.getElementById('cbAgentPreview');
      if (agIdx === '') {
        preview.style.display = 'none';
      } else {
        const ag = DB.agents[parseInt(agIdx)];
        let html = `<span style="color:var(--gold);font-weight:600;">👤 ${ag.name || ''}</span>`;
        if (ag.company) html += ` &nbsp;<span style="color:var(--text3)">${ag.company}</span>`;
        html += '<br>';
        if (ag.tel) html += `📞 ${ag.tel} &nbsp;`;
        if (ag.line) html += `💬 Line: ${ag.line} &nbsp;`;
        if (ag.linelink) html += `🔗 <a href="${ag.linelink}" style="color:var(--blue)">${ag.linelink}</a>`;
        preview.innerHTML = html;
        preview.style.display = 'block';
      }
      generateClipboard();
    }
    function getContactForClip(asset) {
      const agIdx = document.getElementById('cbAgentSelect').value;
      if (agIdx !== '') {
        const ag = DB.agents[parseInt(agIdx)];
        let c = '';
        if (ag.name) c += ag.name;
        if (ag.tel) c += (c ? ' ' : '') + ag.tel;
        if (ag.line) c += (c ? ' | ' : '') + `Line: ${ag.line}`;
        return c || asset.contact || '';
      }
      return asset.contact || '';
    }
    function generateClipboard() {
      const idx = document.getElementById('cbAssetSelect').value;
      const out = document.getElementById('cbOutput');
      if (idx === '') { out.textContent = 'เลือกทรัพย์สินเพื่อสร้าง Clipboard...'; return; }
      const a = DB.assets[parseInt(idx)];
      const contactOverride = getContactForClip(a);
      const lineAtInfo = getLineAtForClip();
      out.textContent = buildClipText(a, document.getElementById('cbTemplate').value,
        document.getElementById('cbContact').checked, document.getElementById('cbLink').checked,
        document.getElementById('cbMap').checked, document.getElementById('cbNote').checked,
        contactOverride, document.getElementById('cbLineAt').checked ? lineAtInfo : '',
        document.getElementById('cbLinkPic').checked);
    }
    function getLineAtForClip() {
      const agIdx = document.getElementById('cbAgentSelect').value;
      if (agIdx !== '') {
        const ag = DB.agents[parseInt(agIdx)];
        if (ag.linelink) return ag.linelink;
        if (ag.line) return ag.line;
      }
      return '';
    }
    function buildClipText(a, tmpl, showContact, showLink, showMap, showNote, contactOverride, lineAt, showLinkPic) {
      const contact = (contactOverride !== undefined) ? contactOverride : (a.contact || '');
      const st = a.status === 'ขาย' ? 'For Sale!! 🏷️' : a.status === 'เช่า' ? 'For Rent!! 🏠' : 'For Sale / Rent!! 🏷️🏠';
      if (tmpl === 'short') {
        let t = `${st}\n📌 ${a.name || ''}`;
        if (a.price) t += `\n💰 ${a.price}`;
        if (a.roomtype) t += `\n🛏️ ${a.roomtype}`;
        if (a.area) t += ` | 📐 ${a.area}`;
        if (a.floor) t += ` | 🏗️ ${a.floor}`;
        if (a.location) t += `\n📍 ทำเล: ${a.location}`;
        if (a.bts) t += `\n🚇 รถไฟฟ้า: ${a.bts}`;
        if (showContact && contact) t += `\n📞 ${contact}`;
        if (lineAt) t += `\n💚 Line@ : ${lineAt}`;
        if (showLink && a.link) t += `\n🔗 ${a.link}`;
        if (showLinkPic && a.linkpic) t += `\n🖼️ รูปภาพ: ${a.linkpic}`;
        return t;
      }
      if (tmpl === 'fb') {
        let t = `✨ ${st}\n━━━━━━━━━━━━━━━━━━━━\n🏢 ${a.name || ''}\n`;
        if (a.location) t += `📍 ทำเล: ${a.location}\n`;
        if (a.bts) t += `🚇 รถไฟฟ้า: ${a.bts}\n`;
        t += `━━━━━━━━━━━━━━━━━━━━\n`;
        if (a.price) t += `💰 ราคา: ${a.price}\n`;
        if (a.type) t += `🏗️ ประเภท: ${a.type}\n`;
        if (a.roomtype) t += `🛏️ ห้อง: ${a.roomtype}\n`;
        if (a.area) t += `📐 ขนาด: ${a.area}\n`;
        if (a.floor) t += `🏢 ชั้น: ${a.floor}\n`;
        if (showNote && a.note) t += `\n📝 รายละเอียด:\n${a.note}\n`;
        t += `━━━━━━━━━━━━━━━━━━━━\n`;
        if (showContact && contact) t += `📞 สนใจติดต่อ: ${contact}\n`;
        if (lineAt) t += `💚 Line@ : ${lineAt}\n`;
        if (showLink && a.link) t += `🔗 ${a.link}\n`;
        if (showMap && a.map) t += `📍 Map: ${a.map}\n`;
        if (showLinkPic && a.linkpic) t += `🖼️ ดูรูปภาพ: ${a.linkpic}\n`;
        t += `\n#อสังหา #คอนโด #${a.status || ''} #รับจัดหาที่พักอาศัยคอนโด #BenzHomeAgency`;
        return t;
      }
      if (tmpl === 'line') {
        let t = `🔔 ${st}\n\n🏡 ${a.name || ''}\n`;
        if (a.price) t += `💰 ราคา: ${a.price}\n`;
        if (a.roomtype || a.area) t += `📋 ${[a.roomtype, a.area].filter(Boolean).join(' | ')}\n`;
        if (a.floor) t += `🔢 ${a.floor}\n`;
        if (a.location) t += `📌 ทำเล: ${a.location}\n`;
        if (a.bts) t += `🚇 รถไฟฟ้า: ${a.bts}\n`;
        if (showNote && a.note) t += `\n${a.note}\n`;
        if (showContact && contact) t += `\n📞 ${contact}`;
        if (lineAt) t += `\n💚 Line@ : ${lineAt}`;
        if (showLink && a.link) t += `\n${a.link}`;
        if (showMap && a.map) t += `\n${a.map}`;
        if (showLinkPic && a.linkpic) t += `\n🖼️ ${a.linkpic}`;
        return t;
      }
      let t = `🏆 ${st}\nประกาศ${a.status === 'ขาย' ? 'ขาย' : a.status === 'เช่า' ? 'เช่า' : 'ขาย/เช่า'}${a.type || ''} ${a.name || ''}\n\n`;
      if (a.price) t += `💰 ราคา ${a.price}\n`;
      if (a.roomtype) t += `🛏️ ${a.roomtype}\n`;
      if (a.area) t += `📐 ขนาด ${a.area}\n`;
      if (a.floor) t += `🏢 ${a.floor}\n`;
      if (a.location) t += `📍 ทำเล: ${a.location}\n`;
      if (a.bts) t += `🚇 รถไฟฟ้า: ${a.bts}\n`;
      if (showNote && a.note) t += `\n📝 รายละเอียด:\n${a.note}\n`;
      if (showContact && contact) t += `\n📞 สนใจโทร/ไลน์: ${contact}\n`;
      if (lineAt) t += `💚 Line@ : ${lineAt}\n`;
      if (showLink && a.link) t += `🔗 ${a.link}\n`;
      if (showMap && a.map) t += `📍 Map: ${a.map}\n`;
      if (showLinkPic && a.linkpic) t += `🖼️ ดูรูปภาพ: ${a.linkpic}\n`;
      return t;
    }

    // ============================
    // EXPORT CSV
    // ============================
    const CSV_HEADERS = {
      assets: ['No', 'ชื่อโครงการ', 'ทำเล', 'สถานะ', 'ประเภท', 'ราคา', 'ประเภทห้อง', 'ขนาด', 'ชั้นตึก', 'Contact', 'Link', 'Map', 'วันที่โพสต์', 'วันที่อัปเดต', 'หมายเหตุ', 'Link Pic', 'ผู้โพสต์'],
      agents: ['No', 'ชื่อAgent', 'บริษัท', 'Co-Agent', 'เบอร์', 'Facebook', 'E-Mail', 'LineID', 'LinkLine', 'เลขบัญชี'],
      customers: ['No', 'ชื่อลูกค้า/โครงการ', 'สถานะ', 'ประเภท', 'งบประมาณ', 'ขนาดห้อง', 'ชั้น', 'Contact', 'Note', 'Link Post']
    };

    function exportCSV(type) {
      if (type === 'all') {
        // Export all 3 separately
        exportCSV('assets'); exportCSV('agents'); exportCSV('customers');
        return;
      }
      let rows = [], fname = '';
      if (type === 'assets') {
        rows = DB.assets.map((a, i) => [i + 1, a.name, a.location, a.status, a.type, a.price, a.roomtype, a.area, a.floor, a.contact, a.link, a.map, a.postdate, a.updatedate, a.note, a.linkpic, a.poster].map(csvEscape).join(','));
        fname = 'yb_assets.csv';
      } else if (type === 'agents') {
        rows = DB.agents.map((a, i) => [i + 1, a.name, a.company, a.coagent, a.tel, a.fb, a.email, a.line, a.linelink, a.bank].map(csvEscape).join(','));
        fname = 'yb_agents.csv';
      } else if (type === 'customers') {
        rows = DB.customers.map((a, i) => [i + 1, a.name, a.status, a.type, a.budget, a.area, a.floor, a.contact, a.note, a.linkpost].map(csvEscape).join(','));
        fname = 'yb_customers.csv';
      }
      const content = [CSV_HEADERS[type].map(csvEscape).join(','), ...rows].join('\n');
      downloadCSV(content, fname);
    }

    // ============================
    // IMPORT CSV
    // ============================
    function importCSV(event, type) {
      const file = event.target.files[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = async e => {
        try {
          const { headers, rows } = parseCSV(e.target.result);
          if (!headers.length) { alert('ไฟล์ว่างหรือรูปแบบไม่ถูกต้อง'); return; }

          // BUG FIX: หยุด real-time listener ชั่วคราวระหว่าง import
          // เพื่อป้องกัน onSnapshot ดึงข้อมูลเก่าจาก Firebase มาทับก่อน push เสร็จ
          const wasRealtime = _realtimeSyncActive;
          if (wasRealtime) stopRealtimeSync();

          let imported = 0;
          const today = new Date().toISOString().slice(0, 10);

          if (type === 'assets') {
            const hi = n => headers.findIndex(h => h === n);
            const iName = hi('ชื่อโครงการ'), iLoc = hi('ทำเล'), iSt = hi('สถานะ'), iTy = hi('ประเภท'),
              iPr = hi('ราคา'), iRm = hi('ประเภทห้อง'), iAr = hi('ขนาด'), iFl = hi('ชั้นตึก'),
              iCt = hi('Contact'), iLk = hi('Link'), iMp = hi('Map'), iPd = hi('วันที่โพสต์'), iUd = hi('วันที่อัปเดต'), iNt = hi('หมายเหตุ'),
              iLp = hi('Link Pic'), iPo = hi('ผู้โพสต์');
            rows.forEach(r => {
              if (r.length < 2) return;
              const a = {
                id: genId(), // BUG FIX: assign id ทันที ป้องกัน duplicate
                name: iName >= 0 ? r[iName] : '', location: iLoc >= 0 ? r[iLoc] : '', status: iSt >= 0 ? r[iSt] : 'ขาย',
                type: iTy >= 0 ? r[iTy] : 'คอนโด', price: iPr >= 0 ? r[iPr] : '', roomtype: iRm >= 0 ? r[iRm] : '',
                area: iAr >= 0 ? r[iAr] : '', floor: iFl >= 0 ? r[iFl] : '', contact: iCt >= 0 ? r[iCt] : '',
                link: iLk >= 0 ? r[iLk] : '', map: iMp >= 0 ? r[iMp] : '', postdate: iPd >= 0 ? r[iPd] : today,
                updatedate: iUd >= 0 ? r[iUd] : today, note: iNt >= 0 ? r[iNt] : '',
                linkpic: iLp >= 0 ? r[iLp] : '', poster: iPo >= 0 ? r[iPo] : '',
                listingActive: 'available'
              };
              if (a.name) { DB.assets.push(a); imported++; }
            });
          } else if (type === 'agents') {
            const hi = n => headers.findIndex(h => h === n);
            const iNm = hi('ชื่อAgent'), iCo = hi('บริษัท'), iCa = hi('Co-Agent'), iTl = hi('เบอร์'),
              iFb = hi('Facebook'), iEm = hi('E-Mail'), iLn = hi('LineID'), iLl = hi('LinkLine'), iBk = hi('เลขบัญชี');
            rows.forEach(r => {
              if (r.length < 2) return;
              const a = {
                id: genId(), // BUG FIX: assign id ทันที
                name: iNm >= 0 ? r[iNm] : '', company: iCo >= 0 ? r[iCo] : '', coagent: iCa >= 0 ? r[iCa] : 'ไม่รับ',
                tel: iTl >= 0 ? r[iTl] : '', fb: iFb >= 0 ? r[iFb] : '', email: iEm >= 0 ? r[iEm] : '',
                line: iLn >= 0 ? r[iLn] : '', linelink: iLl >= 0 ? r[iLl] : '', bank: iBk >= 0 ? r[iBk] : ''
              };
              if (a.name) { DB.agents.push(a); imported++; }
            });
          } else if (type === 'customers') {
            const hi = n => headers.findIndex(h => h === n);
            const iNm = hi('ชื่อลูกค้า/โครงการ'), iSt = hi('สถานะ'), iTy = hi('ประเภท'), iBd = hi('งบประมาณ'),
              iAr = hi('ขนาดห้อง'), iFl = hi('ชั้น'), iCt = hi('Contact'), iNt = hi('Note'), iLk = hi('Link Post');
            rows.forEach(r => {
              if (r.length < 2) return;
              const a = {
                id: genId(), // BUG FIX: assign id ทันที
                name: iNm >= 0 ? r[iNm] : '', status: iSt >= 0 ? r[iSt] : '', type: iTy >= 0 ? r[iTy] : '',
                budget: iBd >= 0 ? r[iBd] : '', area: iAr >= 0 ? r[iAr] : '', floor: iFl >= 0 ? r[iFl] : '',
                contact: iCt >= 0 ? r[iCt] : '', note: iNt >= 0 ? r[iNt] : '', linkpost: iLk >= 0 ? r[iLk] : ''
              };
              if (a.name) { DB.customers.push(a); imported++; }
            });
          }

          // BUG FIX: save ก่อน แล้วค่อย re-enable realtime sync
          await saveDB();
          saveTolocalStorage();

          // re-enable realtime sync หลัง push เสร็จ
          if (wasRealtime) {
            setTimeout(() => startRealtimeSync(), 1500);
          }

          showToast(`✅ Import สำเร็จ! นำเข้า ${imported} รายการ`, '#50c878');
          renderAssets(); renderAgents(); renderCustomers(); populateCbSelect(); renderStats();
        } catch (err) { alert('เกิดข้อผิดพลาด: ' + err.message); }
      };
      reader.readAsText(file, 'UTF-8');
      event.target.value = '';
    }

    // ============================
    // CLEAR ALL
    // ============================
    async function clearAllData() {
      const cur = migrateUserFields(AUTH.current);
      if (!cur || cur.accessLevel !== 'super_admin') { alert('เฉพาะผู้ดูแลระบบสูงสุด (Super Admin) เท่านั้น'); return; }
      if (!confirm('⚠️ ยืนยันลบข้อมูลทั้งหมด?\nการกระทำนี้ไม่สามารถย้อนกลับได้')) return;
      DB = { assets: [], agents: [], customers: [] };
      saveTolocalStorage();
      if (_fbReady && _db) {
        try {
          const { collection, getDocs, writeBatch, doc } = window._firestoreLib;
          for (const col of ['assets', 'agents', 'customers']) {
            const snap = await getDocs(collection(_db, col));
            const batch = writeBatch(_db);
            snap.docs.forEach(d => batch.delete(doc(collection(_db, col), d.id)));
            if (snap.docs.length > 0) await batch.commit();
          }
        } catch (e) { console.warn('clearAllData Firebase fail:', e); }
      }
      renderAssets(); renderAgents(); renderCustomers(); populateCbSelect(); renderStats();
      showToast('🗑️ ลบข้อมูลทั้งหมดแล้ว', '#e05050');
    }

    // ============================
    // THEME PANEL (Global constants, state, and apply/load/save are in global-state.js)
    // ============================

    function syncTPUI() {
      // color
      THEME_COLORS.forEach(c => {
        const el = document.getElementById('tpColor-' + c);
        if (el) el.classList.toggle('active', c === TP.color);
      });
      // font
      ['Sarabun', 'Prompt', 'Kanit', 'Noto Sans'].forEach(f => {
        const el = document.getElementById('tpFont-' + f);
        if (el) el.classList.toggle('active', f === TP.font);
      });
      // sliders
      const fsEl = document.getElementById('tpFontSize');
      const rEl = document.getElementById('tpRadius');
      if (fsEl) { fsEl.value = TP.fontSize; document.getElementById('tpFontSizeVal').textContent = TP.fontSize + 'px'; }
      if (rEl) { rEl.value = TP.radius; document.getElementById('tpRadiusVal').textContent = TP.radius + 'px'; }
      // btn size
      ['S', 'M', 'L', 'XL'].forEach(s => {
        const el = document.getElementById('tpSize-' + s);
        if (el) el.classList.toggle('active', s === TP.btnSize);
      });
      // toggles
      const tog = (id, val) => { const el = document.getElementById(id); if (el) el.classList.toggle('on', val); };
      tog('tpToggleShadow', TP.shadow);
      tog('tpToggleAnim', TP.anim);
      tog('tpToggleBorder', TP.border);
    }

    function openThemePanel() {
      syncTPUI();
      document.getElementById('themePanel').classList.add('open');
      document.getElementById('themePanelOverlay').classList.add('open');
    }
    function closeThemePanel() {
      document.getElementById('themePanel').classList.remove('open');
      document.getElementById('themePanelOverlay').classList.remove('open');
    }

    function tpSelectColor(c) { TP.color = c; syncTPUI(); applyTP(); }
    function tpSelectFont(f) { TP.font = f; syncTPUI(); applyTP(); }
    function tpSelectSize(s) { TP.btnSize = s; syncTPUI(); applyTP(); }
    function tpApplySize() {
      TP.fontSize = parseInt(document.getElementById('tpFontSize').value);
      TP.radius = parseInt(document.getElementById('tpRadius').value);
      document.getElementById('tpFontSizeVal').textContent = TP.fontSize + 'px';
      document.getElementById('tpRadiusVal').textContent = TP.radius + 'px';
      applyTP();
    }
    function tpToggle(key) {
      const map = { shadow: 'tpToggleShadow', anim: 'tpToggleAnim', border: 'tpToggleBorder' };
      TP[key] = !TP[key];
      const el = document.getElementById(map[key]);
      if (el) el.classList.toggle('on', TP[key]);
      applyTP();
    }
    function tpSave() {
      saveTP();
      closeThemePanel();
      // show brief toast
      const t = document.createElement('div');
      t.textContent = '✅ บันทึก Theme แล้ว!';
      Object.assign(t.style, {
        position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)',
        background: 'var(--gold)', color: '#0D0D0D', padding: '10px 22px',
        borderRadius: '30px', fontWeight: '700', fontSize: '14px', zIndex: '9999',
        boxShadow: '0 4px 20px rgba(0,0,0,.4)', transition: 'opacity .4s'
      });
      document.body.appendChild(t);
      setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 400); }, 1800);
    }
    function tpReset() {
      TP = { color: 'light', font: 'Sarabun', fontSize: 14, radius: 10, btnSize: 'M', shadow: true, anim: true, border: true };
      syncTPUI(); applyTP(); saveTP();
    }

    // Legacy setTheme kept for login screen buttons
    function setTheme(theme) { TP.color = theme; applyTP(); saveTP(); }
    function importSampleData() {
      if (!confirm('โหลดข้อมูลตัวอย่าง? (ข้อมูลจะถูกเพิ่มเข้ามา)')) return;
      const today = new Date().toISOString().slice(0, 10);
      const sample = {
        assets: [
          { name: 'บ้านกลางเมือง พระราม 9', location: 'พระราม 9', status: 'เช่า', type: 'ทาวน์โฮม', price: '45,000 บาท/เดือน', roomtype: '3 ห้องนอน, 2 ห้องน้ำ', area: '152 ตร.ม.', floor: '3 ชั้น', link: 'https://www.facebook.com/share/p/1Dj9Ja8WGq/', map: 'https://maps.app.goo.gl/p3RExr2hWfMjjk366', contact: 'คุณแบ็ท 064-654-9935', note: 'มัดจำ 2 เดือน + ค่าเช่าล่วงหน้า 1 เดือน เฟอร์นิเจอร์ครบ', postdate: today, updatedate: today, linkpic: '', poster: 'Benz' },
          { name: 'IDEO พระราม 9', location: 'Rama 9 - Asoke', status: 'เช่า/ขาย', type: 'คอนโด', price: '19,000 บาท/เดือน | ขาย 3.99 ล้าน', roomtype: '1 ห้องนอน 1 ห้องน้ำ', area: '31.6 ตร.ม.', floor: 'ชั้น 15', link: 'https://www.facebook.com/share/p/1CE33PWtn5/', map: '', contact: 'แพรว มาโร 082-243-5968', note: 'เฟอร์นิเจอร์ครบ พร้อมเข้าอยู่', postdate: today, updatedate: today, linkpic: '', poster: 'Benz' },
          { name: 'The Saint Residences', location: 'อโศก', status: 'เช่า', type: 'คอนโด', price: '24,000 บาท/เดือน', roomtype: '2 ห้องนอน 1 ห้องน้ำ', area: '44 ตร.ม.', floor: 'ตึก A ชั้น 34', link: 'https://www.facebook.com/share/p/1HQiSPZeVM/', map: 'https://maps.app.goo.gl/1PJeweuHxXZ1X9uS9', contact: 'คุณณัฐพล (เบนซ์) 098-256-5995', note: 'ฟรีแม่บ้านเดือนละ 1 ครั้ง วิวสวย ทิศเหนือ', postdate: today, updatedate: today, linkpic: '', poster: 'Benz' },
          { name: 'ศุภาลัย เวอเรนด้า พระราม 9', location: 'พระราม 9', status: 'เช่า/ขาย', type: 'คอนโด', price: '17,000/เดือน | ขาย 3.49 ล้าน', roomtype: '1 ห้องนอน 1 ห้องน้ำ', area: '41.5 ตร.ม.', floor: 'ชั้น 29 ตึก A', link: '', map: 'https://maps.app.goo.gl/yvx9U2EXFqJYMZMd9', contact: 'มิ้น 084-366-7190 Line: imint1988', note: 'ราคาลดพิเศษ พร้อมเข้าอยู่ทันที', postdate: today, updatedate: today, linkpic: '', poster: 'Benz' },
          { name: 'Lumpini Suite Phetchaburi', location: 'เพชรบุรี-อโศก', status: 'เช่า', type: 'คอนโด', price: '12,500 บาท/เดือน', roomtype: '1 ห้องนอน 1 ห้องน้ำ', area: '28 ตร.ม.', floor: 'ชั้น 8', link: '', map: '', contact: 'คุณเบนซ์ 084-152-9289', note: 'ใกล้ BTS Phetchaburi เดิน 3 นาที', postdate: today, updatedate: today, linkpic: '', poster: 'Benz' },
          { name: 'บ้านเดี่ยว หมู่บ้านธาราทอง', location: 'ลาดพร้าว', status: 'ขาย', type: 'บ้านเดี่ยว', price: '8,500,000 บาท', roomtype: '3 ห้องนอน 2 ห้องน้ำ', area: '200 ตร.ม. ที่ดิน 60 ตร.ว.', floor: '2 ชั้น', link: '', map: '', contact: 'คุณอรุณ 081-234-5678', note: 'สภาพดี ตกแต่งใหม่ ลานจอดรถ 2 คัน', postdate: today, updatedate: today, linkpic: '', poster: 'Benz' },
        ],
        agents: [
          { name: 'กรองเกียรติ (เบนซ์)', company: 'BENZ HOME Agency', coagent: 'รับ', tel: '084-152-9289', fb: 'BENZ HOME Agency', email: 'online.ibnn@gmail.com', line: '54445', linelink: '@677ubanx', bank: 'กสิกรไทย# 054-154-0849' },
          { name: 'สมหญิง (หญิง)', company: 'BENZ HOME Agency', coagent: 'รับ', tel: '081-999-8888', fb: '', email: '', line: 'ying_agent', linelink: '', bank: 'ไทยพาณิชย์# 123-456-789' },
        ],
        customers: [
          { name: 'คุณวิทยา สุขดี', status: 'กำลังหา', type: 'เช่า', budget: '15,000-20,000/เดือน', area: '30-45 ตร.ม.', floor: '10+', contact: '081-111-2222', note: 'ต้องการใกล้ BTS/MRT พระราม 9 หรืออโศก', linkpost: '' },
          { name: 'คุณมาลี รักสวย', status: 'ตัดสินใจ', type: 'ซื้อ', budget: '3-5 ล้านบาท', area: '35-50 ตร.ม.', floor: 'ไม่จำกัด', contact: '089-333-4444 Line: malee_r', note: 'ชอบโครงการใหม่ มีสระว่ายน้ำ', linkpost: '' },
          { name: 'คุณธนา พรหมดี', status: 'ปิดดีล', type: 'เช่า', budget: '25,000/เดือน', area: '40-60 ตร.ม.', floor: 'สูง', contact: 'Line: thana_p', note: 'เช่า The Saint Residences แล้ว', linkpost: '' },
        ]
      };
      DB.assets = [...DB.assets, ...sample.assets];
      DB.agents = [...DB.agents, ...sample.agents];
      DB.customers = [...DB.customers, ...sample.customers];
      saveDB(); renderAssets(); renderAgents(); renderCustomers(); populateCbSelect(); renderStats();
      alert(`✅ โหลดข้อมูลตัวอย่างแล้ว!\n🏠 ${sample.assets.length} ทรัพย์สิน\n👤 ${sample.agents.length} Agent\n🤝 ${sample.customers.length} ลูกค้า`);
    }

    let calcMode = 'addon'; // 'addon' or 'net'

    function renderAgents() {
      // Stub to maintain compatibility with legacy hooks and Firebase listeners
    }
    window.renderAgents = renderAgents;

    async function fetchFacebookPagesFromUploadPost() {
      const apiKeyInput = document.getElementById('botFbUploadPostKey');
      const profileInput = document.getElementById('botFbUploadPostProfile');
      if (!apiKeyInput || !profileInput) return;

      const apiKey = apiKeyInput.value.trim();
      const profile = profileInput.value.trim();

      if (!apiKey) {
        alert("❌ กรุณากรอก API Key ของ Upload-Post ก่อนค่ะ");
        return;
      }
      if (!profile) {
        alert("❌ กรุณากรอกชื่อ Profile (user) ก่อนค่ะ");
        return;
      }

      // Check if event is defined
      const evt = typeof event !== 'undefined' ? event : null;
      const btn = evt ? evt.target : null;
      if (btn) {
        btn.disabled = true;
        btn.textContent = "⌛ กำลังดึงข้อมูล...";
      }

      try {
        const url = `https://api.upload-post.com/api/uploadposts/facebook/pages?user=${encodeURIComponent(profile)}`;
        const res = await fetch(url, {
          method: 'GET',
          headers: {
            'Authorization': `Apikey ${apiKey}`
          }
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.message || `HTTP ${res.status}`);
        }

        const data = await res.json();
        const pages = data.pages || data || [];
        
        const pageSelect = document.getElementById('botFbPageSelect');
        if (pageSelect) {
          pageSelect.innerHTML = '<option value="">-- เลือกหน้าเพจ --</option>';
          pages.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = p.name;
            pageSelect.appendChild(opt);
          });
        }

        // Save pages list to database so we don't have to fetch every time
        const keyInput = document.getElementById('botSecretKey');
        const key = keyInput ? keyInput.value : "BenzHomeAutoKey123";
        
        const credsId = DB.platformCredentials && DB.platformCredentials[0] ? DB.platformCredentials[0].id : "main_creds";
        const existingCreds = DB.platformCredentials && DB.platformCredentials[0] ? DB.platformCredentials[0] : {};
        
        const credsObj = {
          ...existingCreds,
          id: credsId,
          fbPagesList: pages.map(p => ({ id: p.id, name: p.name }))
        };

        await saveItem('platformCredentials', credsObj, credsId);
        if (!_realtimeSyncActive) {
          if (!DB.platformCredentials) DB.platformCredentials = [];
          DB.platformCredentials[0] = credsObj;
          saveTolocalStorage();
        }

        alert(`✅ ดึงข้อมูลเพจสำเร็จ! พบทั้งหมด ${pages.length} เพจค่ะ กรุณากดเลือกเพจและกดบันทึกตั้งค่าบอทเพื่อบันทึกข้อมูลนะค่ะ`);
      } catch (e) {
        console.error("Fetch Facebook pages error:", e);
        alert(`❌ ไม่สามารถดึงรายชื่อเพจได้: ${e.message}`);
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.textContent = "🔄 ดึงรายชื่อเพจ";
        }
      }
    }
    window.fetchFacebookPagesFromUploadPost = fetchFacebookPagesFromUploadPost;
    