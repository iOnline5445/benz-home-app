    function initFirebase() {
      return new Promise((resolve) => {
        // ถ้ารันบน Chrome Extension ให้โหลดจากโฟลเดอร์ lib ในเครื่อง (เพื่อความปลอดภัย CSP)
        // ถ้ารันบนเว็บปกติ (เช่น GitHub Pages / localhost) ให้โหลดผ่าน CDN ของ Google ตามเดิม
        const isExtension = window.location.protocol === 'chrome-extension:';
        const sdkVer = '10.12.2';
        const base = isExtension ? './lib' : `https://www.gstatic.com/firebasejs/${sdkVer}`;

        Promise.all([
          import(`${base}/firebase-app.js`),
          import(`${base}/firebase-firestore.js`)
        ]).then(([appMod, fsMod]) => {
          const { initializeApp, getApps } = appMod;
          const { getFirestore, collection, doc, getDocs, getDoc, setDoc, deleteDoc, writeBatch, onSnapshot } = fsMod;

          if (FIREBASE_CONFIG.apiKey === 'YOUR_API_KEY') {
            console.warn('⚠️ Firebase config ยังไม่ได้กรอก — ใช้ localStorage แทน');
            resolve(false); return;
          }

          // ป้องกัน initialize ซ้ำ
          const existingApps = getApps();
          const app = existingApps.length > 0 ? existingApps[0] : initializeApp(FIREBASE_CONFIG);
          _db = getFirestore(app);
          window._db = _db;
          window._firestoreLib = { collection, doc, getDocs, getDoc, setDoc, deleteDoc, writeBatch, onSnapshot };
          _fbReady = true;
          console.log('✅ Firebase connected');
          resolve(true);
        }).catch(err => {
          console.warn('⚠️ Firebase load failed:', err, '— ใช้ localStorage แทน');
          resolve(false);
        });
      });
    }

    // ============================
    // REAL-TIME SYNC (onSnapshot)
    // ============================
    let _realtimeSyncActive = false;

    function startRealtimeSync() {
      if (_realtimeSyncActive || !_fbReady || !_db) return;
      _realtimeSyncActive = true;

      const { collection, onSnapshot } = window._firestoreLib;
      const cols = ['assets', 'agents', 'customers', 'consignments', 'mktQueue', 'mktScheduleSlots', 'users', 'systemSettings'];

      // unsubscribe listeners เก่าก่อน
      _unsubscribeListeners.forEach(fn => fn());
      _unsubscribeListeners = [];

      cols.forEach(col => {
        const unsub = onSnapshot(collection(_db, col), (snap) => {
          // Skip if we just wrote to Firebase ourselves (avoid duplicate render)
          if (_suppressSnapshot) return;
          if (col === 'mktScheduleSlots') {
            DB.mktScheduleSlots = snap.docs.map(d => d.data().time);
          } else if (col === 'users') {
            const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            const fbUsers = snap.docs.map(d => {
              const u = d.data();
              if (u.email) u.email = u.email.toLowerCase().trim();
              return u;
            }).filter(u => u.email && emailRe.test(u.email));

            if (fbUsers.length > 0) {
              AUTH.users = fbUsers;
              const hasAdmin = AUTH.users.some(u => u.role === 'admin');
              if (!hasAdmin) {
                AUTH.users.unshift({ email: 'admin@benzhome.com', password: 'admin1234', displayname: 'ผู้ดูแลระบบ', role: 'admin', note: 'Super Admin', linkedAgentId: null });
              }
              localStorage.setItem('yb_auth', JSON.stringify({ users: AUTH.users }));

              if (typeof window._checkCurrentUserSessionSync === 'function') {
                window._checkCurrentUserSessionSync();
              }
              if (typeof renderUsers === 'function') renderUsers();
            }
          } else {
            DB[col] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          }
          saveTolocalStorage();
          // render ตามที่เปลี่ยน
          if (col === 'assets') { renderAssets(); renderStats(); populateCbSelect(); }
          if (col === 'agents') { renderAgents(); populateCbSelect(); }
          if (col === 'customers') renderCustomers();
          if (col === 'consignments') { if (typeof renderConsignments === 'function') renderConsignments(); }
          if (col === 'systemSettings') { if (typeof loadSystemSettingsUI === 'function') loadSystemSettingsUI(); }
          if (col === 'mktQueue') { renderMktQueue(); updateMktQueueBadge(); }
          if (col === 'mktScheduleSlots') renderMktSlots();
          updateSyncBadge();
        }, (err) => {
          console.warn('onSnapshot error:', col, err);
        });
        _unsubscribeListeners.push(unsub);
      });

      updateSyncBadge();
      console.log('🔄 Real-time sync started');
    }

    function stopRealtimeSync() {
      _unsubscribeListeners.forEach(fn => fn());
      _unsubscribeListeners = [];
      _realtimeSyncActive = false;
      updateSyncBadge();
    }

    function updateSyncBadge() {
      const el = document.getElementById('realtimeSyncBadge');
      if (!el) return;
      if (_realtimeSyncActive) {
        el.textContent = '🟢 Real-time Sync เปิดอยู่';
        el.style.color = 'var(--green)';
      } else {
        el.textContent = '⚫ Real-time Sync ปิด';
        el.style.color = 'var(--text3)';
      }
    }

    // ============================
    // STORAGE LAYER (Firebase → localStorage fallback)
    // ============================
    const LS_KEY = 'yb_db';

    // ============================
    function updateFirebaseStatus() {
      const el = document.getElementById('fbStatusDot');
      const txt = document.getElementById('fbStatusText');
      if (!el) return;
      
      if (_fbReady) {
        el.style.background = '#0077CC'; // blue dot for online
        txt.textContent = 'Firebase Online 🌐';
      } else {
        el.style.background = '#e05050'; // red dot for offline
        txt.textContent = 'Offline 📴';
      }
      
      // Update config status in settings panel
      const cfgStatus = document.getElementById('fbConfigStatus');
      if (cfgStatus) {
        if (_fbReady) {
          cfgStatus.textContent = '🔵 เชื่อมต่อคลาวด์สำเร็จ' + (_realtimeSyncActive ? ' + Real-time Sync' : '');
          cfgStatus.style.color = '#0077CC';
        } else {
          cfgStatus.textContent = '🔴 ออฟไลน์ (ข้อมูลจัดเก็บในเครื่องชั่วคราว)';
          cfgStatus.style.color = '#e05050';
        }
      }
      updateSyncBadge();
    }

    // ============================
    // FIREBASE CONFIG UI
    // ============================
    const FB_CONFIG_KEY = 'yb_fb_config';

    function saveFbConfig() {
      const cfg = {
        apiKey: document.getElementById('fb_apiKey').value.trim(),
        authDomain: document.getElementById('fb_authDomain').value.trim(),
        projectId: document.getElementById('fb_projectId').value.trim(),
        storageBucket: document.getElementById('fb_storageBucket').value.trim(),
        messagingSenderId: document.getElementById('fb_messagingSenderId').value.trim(),
        appId: document.getElementById('fb_appId').value.trim()
      };
      if (!cfg.apiKey || !cfg.projectId) { alert('กรุณากรอก API Key และ Project ID อย่างน้อย'); return; }
      localStorage.setItem(FB_CONFIG_KEY, JSON.stringify(cfg));
      
      // Auto-enable Firebase mode when saving config
      localStorage.setItem('yb_storage_mode', 'firebase');
      
      document.getElementById('fbConfigStatus').textContent = '✅ บันทึกแล้ว — กำลังเปิดใช้งานคลาวด์...';
      // Reload page เพื่อ init Firebase ใหม่
      setTimeout(() => location.reload(), 800);
    }

    async function testFirebaseConnection() {
      if (!_fbReady || !_db) {
        alert('❌ ระบบเชื่อมต่อ Firebase ล้มเหลวตั้งแต่ตอนโหลด\n\nสาเหตุที่เป็นไปได้:\n1. คุณยังไม่ได้กด "บันทึกและเชื่อมต่อ Firebase"\n2. ข้อมูล API Key หรือ Project ID ผิดรูปแบบจนเชื่อมต่อไม่ได้');
        return;
      }
      const st = document.getElementById('fbConfigStatus');
      const oldText = st.textContent;
      st.textContent = 'กำลังทดสอบการเชื่อมต่อ... ⏳';
      st.style.color = 'var(--gold)';
      try {
        const { collection, getDocs } = window._firestoreLib;
        await getDocs(collection(_db, 'users'));
        st.textContent = '✅ เชื่อมต่อและอ่านข้อมูลสำเร็จ!';
        st.style.color = 'var(--green)';
        alert('✅ การเชื่อมต่อ Firebase สมบูรณ์!\nระบบสามารถอ่านข้อมูลจาก Firestore ได้อย่างถูกต้องครับ');
      } catch (e) {
        st.textContent = '❌ มีปัญหาการเชื่อมต่อ';
        st.style.color = 'var(--red)';
        alert('❌ พบปัญหาการเชื่อมต่อ Firebase:\n\n' + e.message + '\n\nสาเหตุที่พบบ่อย:\n1. ยังไม่ได้ตั้งค่า Rules ของ Firestore ให้เป็นแบบ public (allow read, write: if true;)\n2. Project ID ผิด หรือโดเมนผิด\n3. ฐานข้อมูล Firestore Database อาจจะยังไม่ได้กดสร้าง (Create Database) ใน Firebase Console');
      }
      setTimeout(() => { if(st.textContent.includes('สำเร็จ') || st.textContent.includes('ปัญหา')) { st.textContent = oldText; st.style.color = 'var(--green)'; } }, 6000);
    }

    async function uploadBackupToFirebase() {
      if (!_fbReady || !_db) {
        alert('❌ ต้องเชื่อมต่อ Firebase ให้สำเร็จก่อนครับ'); return;
      }
      const bStr = localStorage.getItem('yb_backup_DB');
      if (!bStr) {
        alert('❌ ไม่พบข้อมูล Backup ภายในเครื่องนี้ครับ (หรืออาจจะยังไม่เคยมีข้อมูลในโหมด Offline)'); return;
      }
      if (!confirm('ยืนยันที่จะอัปโหลดข้อมูล Backup (ที่มีอยู่ในเครื่อง) ขึ้นไปยัง Firebase หรือไม่?\n\n(ระบบจะนำข้อมูล ทรัพย์สิน ลูกค้า ที่เคยเซฟไว้ในเครื่องนี้ อัปโหลดไปเก็บในคลาวด์เพื่อให้ทุกเครื่องเห็นตรงกัน)')) return;
      
      const st = document.getElementById('fbConfigStatus');
      const oldText = st.textContent;
      st.textContent = 'กำลังอัปโหลดข้อมูลขึ้นคลาวด์... ⏳';
      st.style.color = '#50c878';
      try {
        const backupData = JSON.parse(bStr);
        const { collection, doc, setDoc } = window._firestoreLib;
        let count = 0;
        for (const col of ['assets', 'customers', 'agents']) {
          if (backupData[col] && backupData[col].length > 0) {
            for (const item of backupData[col]) {
              const id = item.id || (col.charAt(0).toUpperCase() + Date.now() + Math.random().toString(36).substr(2,5));
              item.id = id;
              const ref = doc(collection(_db, col), id);
              await setDoc(ref, item);
              count++;
            }
          }
        }
        if (count === 0) {
          alert('⚠️ ใน Backup ภายในเครื่องไม่มีข้อมูลเลยครับ');
          st.textContent = oldText;
          return;
        }
        alert(`✅ อัปโหลดสำเร็จ!\nนำเข้าข้อมูลจำนวน ${count} รายการขึ้นคลาวด์เรียบร้อยแล้ว ระบบจะซิงค์ข้อมูลให้ทันทีครับ`);
        st.textContent = '✅ อัปโหลดเสร็จสิ้น';
      } catch (e) {
        console.error(e);
        st.textContent = '❌ อัปโหลดผิดพลาด';
        st.style.color = 'var(--red)';
        alert('❌ เกิดข้อผิดพลาดในการอัปโหลด: ' + e.message);
      }
      setTimeout(() => { st.textContent = oldText; st.style.color = 'var(--green)'; }, 5000);
    }

    function loadFbConfigUI(silent = false) {
      try {
        const s = localStorage.getItem(FB_CONFIG_KEY);
        if (!s) {
          if (!silent) alert('ยังไม่มี Firebase config ที่บันทึกไว้');
          return;
        }
        const cfg = JSON.parse(s);
        document.getElementById('fb_apiKey').value = cfg.apiKey || '';
        document.getElementById('fb_authDomain').value = cfg.authDomain || '';
        document.getElementById('fb_projectId').value = cfg.projectId || '';
        document.getElementById('fb_storageBucket').value = cfg.storageBucket || '';
        document.getElementById('fb_messagingSenderId').value = cfg.messagingSenderId || '';
        document.getElementById('fb_appId').value = cfg.appId || '';
        if (!silent) document.getElementById('fbConfigStatus').textContent = '✅ โหลด config แล้ว';
      } catch (e) { if (!silent) alert('โหลด config ไม่ได้: ' + e.message); }
    }

    function clearLocalFbConfig() {
      if (confirm('คุณต้องการล้างการตั้งค่า Firebase ที่เคยเซฟในเครื่องนี้ และกลับไปใช้ค่าเริ่มต้นระบบใช่หรือไม่?')) {
        localStorage.removeItem(FB_CONFIG_KEY);
        alert('ล้างการตั้งค่าเรียบร้อยแล้ว ระบบจะโหลดหน้าจอใหม่ครับ');
        location.reload();
      }
    }

    // ============================
    // OFFLINE SYNC QUEUE
    // ============================
    const SYNC_QUEUE_KEY = 'yb_sync_queue';

    function getSyncQueue() {
      try {
        const q = localStorage.getItem(SYNC_QUEUE_KEY);
        return q ? JSON.parse(q) : [];
      } catch (e) {
        return [];
      }
    }

    function saveSyncQueue(queue) {
      try {
        localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue));
      } catch (e) {
        console.warn('Failed to save sync queue:', e);
      }
    }

    function addToSyncQueue(action, colName, itemId, data) {
      const queue = getSyncQueue();
      if (action === 'save') {
        const idx = queue.findIndex(q => q.action === 'save' && q.colName === colName && q.itemId === itemId);
        if (idx !== -1) {
          queue[idx].data = data;
          queue[idx].timestamp = Date.now();
          saveSyncQueue(queue);
          updateSyncBadge();
          return;
        }
      }
      queue.push({ action, colName, itemId, data, timestamp: Date.now() });
      saveSyncQueue(queue);
      updateSyncBadge();
    }

    let _isSyncingQueue = false;

    async function syncPendingQueue() {
      const storageMode = localStorage.getItem('yb_storage_mode') || 'firebase';
      if (storageMode === 'local' || !_fbReady || !_db || !window._firestoreLib) return;
      if (_isSyncingQueue) return;

      const queue = getSyncQueue();
      if (queue.length === 0) return;

      _isSyncingQueue = true;
      console.log(`🔄 Processing ${queue.length} offline operations...`);

      const { collection, doc, setDoc, deleteDoc } = window._firestoreLib;
      let successCount = 0;
      let failedCount = 0;

      const currentQueue = [...queue];

      for (const op of currentQueue) {
        try {
          if (op.action === 'save') {
            const ref = doc(collection(_db, op.colName), op.itemId);
            await setDoc(ref, op.data);
          } else if (op.action === 'delete') {
            const ref = doc(collection(_db, op.colName), op.itemId);
            await deleteDoc(ref);
          }
          successCount++;
          
          const freshQueue = getSyncQueue();
          const freshIdx = freshQueue.findIndex(q => q.action === op.action && q.colName === op.colName && q.itemId === op.itemId);
          if (freshIdx !== -1) {
            freshQueue.splice(freshIdx, 1);
            saveSyncQueue(freshQueue);
          }
        } catch (err) {
          console.warn(`Sync failed for ${op.colName}/${op.itemId}:`, err);
          failedCount++;
          break;
        }
      }

      _isSyncingQueue = false;
      updateSyncBadge();

      if (successCount > 0) {
        console.log(`✅ Synced ${successCount} offline items to Firebase Cloud!`);
        if (typeof showToast === 'function') {
          showToast(`🔄 อัปเดตข้อมูลย้อนหลังสำเร็จ ${successCount} รายการ!`, '#50c878');
        }
        if (window.loadDB) {
          window.loadDB();
        }
      }
    }

    function updateSyncBadge() {
      const el = document.getElementById('realtimeSyncBadge');
      if (!el) return;
      const queue = getSyncQueue();
      if (queue.length > 0) {
        el.style.background = '#e8a020'; 
        el.style.color = '#fff';
        el.textContent = `🔄 รอการซิงก์ออฟไลน์ ${queue.length} รายการ`;
      } else {
        const storageMode = localStorage.getItem('yb_storage_mode') || 'firebase';
        if (storageMode === 'local') {
          el.style.background = '#555';
          el.style.color = '#ccc';
          el.textContent = '⚫ Local Only';
        } else if (_realtimeSyncActive) {
          el.style.background = '#50c878';
          el.style.color = '#fff';
          el.textContent = '🟢 Real-time Sync เปิด';
        } else {
          el.style.background = '#555';
          el.style.color = '#ccc';
          el.textContent = '⚫ Real-time Sync ปิด';
        }
      }
    }

    // Auto sync check on online and interval
    window.addEventListener('online', () => {
      console.log('🌐 Connection restored. Syncing queue...');
      const storageMode = localStorage.getItem('yb_storage_mode') || 'firebase';
      const isFirebaseConfigured = FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.apiKey !== "YOUR_API_KEY" && FIREBASE_CONFIG.apiKey !== "";
      if (storageMode === 'firebase' && isFirebaseConfigured) {
        initFirebase().then((ok) => {
          if (ok) {
            updateFirebaseStatus();
            syncPendingQueue();
          }
        });
      }
    });

    setInterval(syncPendingQueue, 15000);

    window.addToSyncQueue = addToSyncQueue;
    window.syncPendingQueue = syncPendingQueue;
    window.updateSyncBadge = updateSyncBadge;

