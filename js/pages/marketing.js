    // ============================
    // MARKETING HELPERS (Buffer-Style Queue & Scheduling)
    // ============================
    let _activeMktSubtab = 'composer';
    let _reminderInterval = null;
    let _editingQueueIdx = -1;
    let _activeBanners = {};

    function switchMktSubtab(subTab) {
      _activeMktSubtab = subTab;
      // update buttons active state
      ['composer', 'queue', 'schedule'].forEach(x => {
        const btn = document.getElementById('mktSubtab' + x.charAt(0).toUpperCase() + x.slice(1));
        const view = document.getElementById('mktSubSec-' + x);
        if (btn) btn.classList.toggle('active', x === subTab);
        if (view) view.style.display = (x === subTab) ? '' : 'none';
      });
      // trigger renders
      if (subTab === 'queue') {
        renderMktQueue();
      }
      if (subTab === 'schedule') {
        renderMktSlots();
      }
    }

    function populateMktSelect() {
      const searchEl = document.getElementById('mktAssetSearch');
      const hiddenEl = document.getElementById('mktAssetSelect');
      if (!searchEl || !hiddenEl) return;
      const curIdx = hiddenEl.value;
      if (curIdx !== '' && (!DB.assets[parseInt(curIdx)] || !DB.assets[parseInt(curIdx)].name)) {
        hiddenEl.value = '';
        searchEl.value = '';
        generateMarketingCopy();
      }
      populateMktAgentSelect();
      updateMktQueueBadge();
    }

    function getMktAssetItems(query) {
      const q = (query || '').toLowerCase().trim();
      return DB.assets
        .map((a, i) => ({ a, i }))
        .filter(({ a }) => {
          const la = a.listingActive || 'available';
          if (la === 'sold') return false;
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

    function openMktDropdown() {
      filterMktAssets();
      document.getElementById('mktAssetDropdown').style.display = 'block';
    }

    function closeMktDropdown() {
      const dd = document.getElementById('mktAssetDropdown');
      if (dd) dd.style.display = 'none';
    }

    function filterMktAssets() {
      const q = document.getElementById('mktAssetSearch').value;
      const dd = document.getElementById('mktAssetDropdown');
      if (!dd) return;
      const items = getMktAssetItems(q);
      if (!items.length) {
        dd.innerHTML = `<div style="padding:12px 16px;color:var(--text3);font-size:13px;">ไม่พบทรัพย์สิน</div>`;
      } else {
        dd.innerHTML = items.map(({ a, i }) => {
          const la = a.listingActive || 'available';
          const laTag = la === 'reserved' ? ` <span style="font-size:10px;background:rgba(201,168,76,0.2);color:var(--gold);border-radius:3px;padding:1px 5px;">จอง</span>` :
                        la === 'sold' ? (a.closedDealType === 'rented' ? ` <span style="font-size:10px;background:rgba(80,200,120,0.2);color:var(--green);border-radius:3px;padding:1px 5px;">เช่าแล้ว</span>` : ` <span style="font-size:10px;background:rgba(224,80,80,0.2);color:var(--red);border-radius:3px;padding:1px 5px;">ขายแล้ว</span>`) : '';
          return `<div class="cb-asset-item" onclick="selectMktAsset(${i},'${(a.name || '').replace(/'/g, "\\'")} (${a.status || ''})')"
            style="padding:9px 14px;cursor:pointer;border-bottom:1px solid var(--border2);font-size:13px;display:flex;justify-content:space-between;align-items:center;">
            <span style="font-weight:600;color:var(--text)">${a.name || '(ไม่มีชื่อ)'}${laTag}</span>
            <span style="color:var(--text3);font-size:12px;">${a.status || ''} · ${a.location || ''}</span>
          </div>`;
        }).join('');
      }
      dd.style.display = 'block';
    }

    function selectMktAsset(idx, label) {
      document.getElementById('mktAssetSearch').value = label;
      document.getElementById('mktAssetSelect').value = idx;
      document.getElementById('mktAssetDropdown').style.display = 'none';
      generateMarketingCopy();
    }

    function populateMktAgentSelect() {
      const sel = document.getElementById('mktAgentSelect');
      if (sel) {
        sel.innerHTML = '<option value="">-- ใช้ข้อมูลติดต่อจากทรัพย์สิน --</option>' +
          (DB.agents || []).map((ag, i) => `<option value="${i}">${ag.name || 'ไม่มีชื่อ'}${ag.company ? ' (' + ag.company + ')' : ''}</option>`).join('');
      }
      const composerSel = document.getElementById('mktComposerAgent');
      if (composerSel) {
        composerSel.innerHTML = '<option value="">-- ใช้ข้อมูลติดต่อจากทรัพย์สิน --</option>' +
          (DB.agents || []).map((ag) => `<option value="${ag.id}">${ag.name || 'ไม่มีชื่อ'}${ag.company ? ' (' + ag.company + ')' : ''}</option>`).join('');
      }
    }

    function onMktAgentChange() {
      const agIdx = document.getElementById('mktAgentSelect').value;
      const preview = document.getElementById('mktAgentPreview');
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
      generateMarketingCopy();
    }

    function getContactForMkt(asset) {
      const agIdx = document.getElementById('mktAgentSelect').value;
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

    function getLineAtForMkt() {
      const agIdx = document.getElementById('mktAgentSelect').value;
      if (agIdx !== '') {
        const ag = DB.agents[parseInt(agIdx)];
        if (ag.linelink) return ag.linelink;
        if (ag.line) return ag.line;
      }
      return '';
    }

    function generateMarketingCopy() {
      const idx = document.getElementById('mktAssetSelect').value;
      const el = document.getElementById('mktComposerText');
      if (!el) return;
      if (idx === '') { el.value = ''; return; }
      const a = DB.assets[parseInt(idx)];
      const contactOverride = getContactForMkt(a);
      const lineAtInfo = getLineAtForMkt();
      el.value = buildClipText(a, document.getElementById('mktTemplate').value,
        document.getElementById('mktContact').checked, document.getElementById('mktLink').checked,
        document.getElementById('mktMap').checked, document.getElementById('mktNote').checked,
        contactOverride, document.getElementById('mktLineAt').checked ? lineAtInfo : '',
        document.getElementById('mktLinkPic').checked);
    }

    function renderMktQueue() {
      const qContainer = document.getElementById('mktQueueContainer');
      if (!qContainer) return;

      const queuedItems = (DB.mktQueue || [])
        .filter(q => q.status === 'queued')
        .sort((a, b) => new Date(a.scheduledTime) - new Date(b.scheduledTime));

      if (!queuedItems.length) {
        qContainer.innerHTML = `
          <div class="empty" style="padding:40px;background:var(--dark2);border:1px solid var(--border);border-radius:10px;">
            <div class="ico" style="font-size:36px;margin-bottom:10px;">📅</div>
            <div style="font-weight:600;">ไม่มีโพสต์ที่รอลงประกาศ</div>
            <div style="font-size:12px;color:var(--text3);margin-top:4px;">สร้างโพสต์ใหม่และเพิ่มเข้าคิวจัดตารางเวลาได้ที่แท็บ "สร้างโพสต์"</div>
          </div>`;
      } else {
        let html = '<div class="queue-timeline">';
        queuedItems.forEach((q) => {
          const dt = new Date(q.scheduledTime);
          const timeStr = dt.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.';
          const dateStr = dt.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
          
          const today = new Date();
          const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
          let relativeDay = dateStr;
          if (dt.toDateString() === today.toDateString()) relativeDay = 'วันนี้';
          else if (dt.toDateString() === tomorrow.toDateString()) relativeDay = 'พรุ่งนี้';

          const chanBadges = (q.channels || []).map(ch => {
            const label = ch === 'livinginsider' ? 'Livinginsider' :
                          ch === 'ennxo' ? 'ENNXO' :
                          ch === 'facebook' ? 'Facebook' : ch;
            return `<span class="queue-chan-badge queue-chan-${ch}">${label}</span>`;
          }).join(' ');

          const idxInDb = DB.mktQueue.indexOf(q);

          html += `
            <div class="queue-item">
              <div class="queue-time-badge">🕒 ${relativeDay}, ${timeStr}</div>
              <div class="queue-card">
                <div class="queue-header">
                  <div class="queue-title">🏠 ${q.assetName || 'ทรัพย์สิน'}</div>
                  <div class="queue-channels">${chanBadges}</div>
                </div>
                <div class="queue-body-text">${escapeHtml(q.content || '')}</div>
                <div class="queue-footer">
                  <div class="queue-poster-info">👤 โพสต์โดย: ${q.posterName || 'เอเจนต์'}</div>
                  <div style="display:flex;gap:6px;">
                    <button class="btn btn-primary btn-sm" onclick="handleQueuePostNow(${idxInDb})" style="padding:4px 10px;font-size:11px;">🚀 โพสต์เลย</button>
                    <button class="btn btn-outline btn-sm" onclick="handleQueueEdit(${idxInDb})" style="padding:4px 8px;font-size:11px;">✏️</button>
                    <button class="btn btn-danger btn-sm" onclick="handleQueueDelete(${idxInDb})" style="padding:4px 8px;font-size:11px;">🗑️</button>
                  </div>
                </div>
              </div>
            </div>`;
        });
        html += '</div>';
        qContainer.innerHTML = html;
      }
      
      updateMktQueueBadge();
      renderMktSentHistory();
    }

    function renderMktSentHistory() {
      const sContainer = document.getElementById('mktSentContainer');
      if (!sContainer) return;

      const sentItems = (DB.mktQueue || [])
        .filter(q => q.status === 'sent')
        .sort((a, b) => new Date(b.scheduledTime) - new Date(a.scheduledTime));

      if (!sentItems.length) {
        sContainer.innerHTML = `<div style="text-align:center;padding:20px;color:var(--text3);">ยังไม่มีประวัติโพสต์</div>`;
      } else {
        sContainer.innerHTML = sentItems.map((q, i) => {
          const dt = new Date(q.scheduledTime);
          const timeStr = dt.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.';
          const dateStr = dt.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
          const chanBadges = (q.channels || []).map(ch => {
            return `<span class="queue-chan-badge queue-chan-${ch}" style="font-size:9px;padding:1px 4px;">${ch.toUpperCase()}</span>`;
          }).join(' ');

          const idxInDb = DB.mktQueue.indexOf(q);

          return `
            <div style="background:var(--dark);border:1px solid var(--border);border-radius:8px;padding:10px;margin-bottom:8px;">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                <span style="font-weight:600;color:var(--green)">✅ โพสต์สำเร็จ</span>
                <span style="color:var(--text3);font-size:10px;">${dateStr}, ${timeStr}</span>
              </div>
              <div style="font-weight:600;margin-bottom:4px;color:var(--text)">🏠 ${q.assetName}</div>
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <div style="display:flex;gap:2px;">${chanBadges}</div>
                <button class="btn btn-outline btn-sm" onclick="handleQueueDelete(${idxInDb})" style="padding:2px 6px;font-size:10px;">🗑️</button>
              </div>
            </div>`;
        }).join('');
      }
    }

    function updateMktQueueBadge() {
      const badge = document.getElementById('mktQueueCount');
      if (!badge) return;
      const count = (DB.mktQueue || []).filter(q => q.status === 'queued').length;
      if (count > 0) {
        badge.textContent = count;
        badge.style.display = 'inline-block';
      } else {
        badge.style.display = 'none';
      }
    }

    function renderMktSlots() {
      const container = document.getElementById('mktSlotList');
      if (!container) return;
      const slots = (DB.mktScheduleSlots || []).slice().sort();
      if (!slots.length) {
        container.innerHTML = `<div style="font-size:12px;color:var(--text3);padding:8px 0;">ไม่มีช่วงเวลาโพสต์รายวัน กรุณาเพิ่มด้านล่าง</div>`;
      } else {
        container.innerHTML = slots.map(slot => `
          <div class="slot-item">
            <span>🕒 ${slot}</span>
            <button class="slot-del-btn" onclick="handleDeleteScheduleSlot('${slot}')">×</button>
          </div>
        `).join('');
      }
    }

    async function handleAddScheduleSlot() {
      const input = document.getElementById('mktNewSlotTime');
      if (!input || !input.value) return;
      const time = input.value;
      if ((DB.mktScheduleSlots || []).includes(time)) {
        alert('มีเวลาโพสต์นี้อยู่แล้วค่ะ');
        return;
      }
      if (!DB.mktScheduleSlots) DB.mktScheduleSlots = [];
      
      const slotObj = { id: 'slot_' + time.replace(':', '_'), time: time };
      await saveItem('mktScheduleSlots', slotObj, slotObj.id);
      
      if (!_realtimeSyncActive) {
        DB.mktScheduleSlots.push(time);
        saveTolocalStorage();
        renderMktSlots();
      }
      input.value = '';
    }

    async function handleDeleteScheduleSlot(time) {
      if (!confirm(`ต้องการลบเวลาโพสต์ ${time} หรือไม่?`)) return;
      const id = 'slot_' + time.replace(':', '_');
      await deleteItemFromDB('mktScheduleSlots', id);
      
      if (!_realtimeSyncActive) {
        DB.mktScheduleSlots = (DB.mktScheduleSlots || []).filter(x => x !== time);
        saveTolocalStorage();
        renderMktSlots();
      }
    }

    function calculateNextQueueTime() {
      const slots = (DB.mktScheduleSlots || ['09:00', '12:00', '15:00', '18:00']).slice().sort();
      if (!slots.length) {
        const now = new Date();
        now.setHours(now.getHours() + 1);
        now.setMinutes(0); now.setSeconds(0); now.setMilliseconds(0);
        return now.toISOString();
      }

      const now = new Date();
      const bookedTimes = (DB.mktQueue || [])
        .filter(q => q.status === 'queued' && q.scheduledTime)
        .map(q => new Date(q.scheduledTime).getTime());

      for (let dayOffset = 0; dayOffset < 30; dayOffset++) {
        const candidateDate = new Date(now.getTime() + dayOffset * 24 * 60 * 60 * 1000);
        const yyyy = candidateDate.getFullYear();
        const mm = String(candidateDate.getMonth() + 1).padStart(2, '0');
        const dd = String(candidateDate.getDate()).padStart(2, '0');

        for (const slotTime of slots) {
          const [hh, min] = slotTime.split(':');
          const candidate = new Date(yyyy, parseInt(mm) - 1, parseInt(dd), parseInt(hh), parseInt(min), 0, 0);
          
          if (candidate.getTime() > now.getTime()) {
            const isBooked = bookedTimes.some(bt => Math.abs(bt - candidate.getTime()) < 60000);
            if (!isBooked) {
              return candidate.toISOString();
            }
          }
        }
      }
      const fallback = new Date();
      fallback.setHours(fallback.getHours() + 1);
      return fallback.toISOString();
    }

    async function postToFacebookViaAPI(text, imageLink) {
      const creds = DB.platformCredentials && DB.platformCredentials[0] ? DB.platformCredentials[0] : null;
      if (!creds || !creds.fbUploadPostActive) {
        console.log("Facebook Auto-Post is not active or configured.");
        return false;
      }

      const keyInput = document.getElementById('botSecretKey');
      const key = keyInput ? keyInput.value : "BenzHomeAutoKey123";
      
      const apiKey = creds.fbUploadPostKeyEnc ? decryptVal(creds.fbUploadPostKeyEnc, key) : "";
      const profile = creds.fbUploadPostProfile || "";
      const pageId = creds.fbPageSelect || "";

      if (!apiKey || !profile) {
        alert("❌ ระบบโพสต์ Facebook อัตโนมัติเปิดใช้งานอยู่ แต่ยังไม่ได้กำหนดค่า API Key หรือ Profile ในหน้าตั้งค่าแผงควบคุมค่ะ");
        return false;
      }

      showToast("⏳ กำลังดำเนินการโพสต์ลง Facebook...");

      try {
        let url = 'https://api.upload-post.com/api/upload_text';
        let body;
        let headers = {
          'Authorization': `Apikey ${apiKey}`
        };

        if (imageLink) {
          url = 'https://api.upload-post.com/api/upload_photos';
          const formData = new FormData();
          formData.append('user', profile);
          formData.append('platform[]', 'facebook');
          formData.append('title', text);
          if (imageLink.startsWith('data:')) {
            try {
              const arr = imageLink.split(',');
              const mime = arr[0].match(/:(.*?);/)[1];
              const bstr = atob(arr[1]);
              let n = bstr.length;
              const u8arr = new Uint8Array(n);
              while (n--) {
                u8arr[n] = bstr.charCodeAt(n);
              }
              const blob = new Blob([u8arr], { type: mime });
              formData.append('photos[]', blob, 'image.jpg');
            } catch (err) {
              formData.append('photos[]', imageLink);
            }
          } else {
            formData.append('photos[]', imageLink);
          }
          if (pageId) {
            formData.append('facebook_page_id', pageId);
          }
          body = formData;
        } else {
          headers['Content-Type'] = 'application/json';
          body = JSON.stringify({
            user: profile,
            platform: ['facebook'],
            title: text,
            facebook_page_id: pageId || undefined
          });
        }

        const res = await fetch(url, {
          method: 'POST',
          headers: headers,
          body: body
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.message || `HTTP ${res.status}`);
        }

        const resData = await res.json();
        showToast("✅ โพสต์ Facebook สำเร็จแล้วค่ะ!");
        return true;
      } catch (e) {
        console.error("Facebook post error:", e);
        alert(`❌ เกิดข้อผิดพลาดในการโพสต์ลง Facebook: ${e.message}`);
        return false;
      }
    }

    async function handleComposerShareNow() {
      const text = document.getElementById('mktComposerText').value;
      if (!text) { alert('กรุณาเขียนประกาศก่อนค่ะ'); return; }
      
      const channels = [];
      document.querySelectorAll('input[name="mkt_channels"]:checked').forEach(cb => {
        channels.push(cb.value);
      });
      if (!channels.length) { alert('กรุณาเลือกช่องทางลงประกาศอย่างน้อย 1 ช่องทาง'); return; }

      navigator.clipboard.writeText(text);

       const assetIdxVal = document.getElementById('mktAssetSelect').value;
       const assetIdx = assetIdxVal !== '' ? parseInt(assetIdxVal) : -1;
       const asset = assetIdx >= 0 ? DB.assets[assetIdx] : null;
       const imageLink = asset ? asset.linkpic : '';

       if (channels.includes('facebook')) {
         postToFacebookViaAPI(text, imageLink);
       }

       channels.forEach(ch => {
         let url = '';
         if (ch === 'livinginsider') url = 'https://www.livinginsider.com/post_property.html';
         if (ch === 'ennxo') url = 'https://www.ennxo.com/อสังหาริมทรัพย์';
         if (url) window.open(url, '_blank');
       });

      const agentIdxVal = document.getElementById('mktAgentSelect').value;
      const agentIdx = agentIdxVal !== '' ? parseInt(agentIdxVal) : -1;
      const agent = agentIdx >= 0 ? DB.agents[agentIdx] : null;

      const qItem = {
        id: genId(),
        assetId: asset ? asset.id : '',
        assetName: asset ? asset.name : 'ข้อความทั่วไป',
        content: text,
        channels: channels,
        scheduledTime: new Date().toISOString(),
        status: 'sent',
        agentId: agent ? agent.id : '',
        template: document.getElementById('mktTemplate').value,
        posterName: AUTH.current ? (AUTH.current.displayname || AUTH.current.email) : 'เอเจนต์'
      };

      await saveItem('mktQueue', qItem, qItem.id);
      if (!_realtimeSyncActive) {
        DB.mktQueue.push(qItem);
        saveTolocalStorage();
        renderMktQueue();
      }

      showToast('🚀 คัดลอกและเปิดหน้าโพสต์แล้ว!');
      if (_editingQueueIdx >= 0) {
        const idToDelete = DB.mktQueue[_editingQueueIdx].id;
        await deleteItemFromDB('mktQueue', idToDelete);
        if (!_realtimeSyncActive) {
          DB.mktQueue.splice(_editingQueueIdx, 1);
          saveTolocalStorage();
          renderMktQueue();
        }
      }
      _editingQueueIdx = -1;
      clearComposer();
    }

    async function handleComposerAddToQueue() {
      const text = document.getElementById('mktComposerText').value;
      if (!text) { alert('กรุณาเขียนประกาศก่อนค่ะ'); return; }
      
      const channels = [];
      document.querySelectorAll('input[name="mkt_channels"]:checked').forEach(cb => {
        channels.push(cb.value);
      });
      if (!channels.length) { alert('กรุณาเลือกช่องทางลงประกาศอย่างน้อย 1 ช่องทาง'); return; }

      const assetIdxVal = document.getElementById('mktAssetSelect').value;
      const assetIdx = assetIdxVal !== '' ? parseInt(assetIdxVal) : -1;
      const asset = assetIdx >= 0 ? DB.assets[assetIdx] : null;

      const agentIdxVal = document.getElementById('mktAgentSelect').value;
      const agentIdx = agentIdxVal !== '' ? parseInt(agentIdxVal) : -1;
      const agent = agentIdx >= 0 ? DB.agents[agentIdx] : null;

      let scheduledTime;
      if (_editingQueueIdx >= 0) {
        scheduledTime = DB.mktQueue[_editingQueueIdx].scheduledTime || calculateNextQueueTime();
      } else {
        scheduledTime = calculateNextQueueTime();
      }

      const qItem = {
        id: _editingQueueIdx >= 0 ? DB.mktQueue[_editingQueueIdx].id : genId(),
        assetId: asset ? asset.id : '',
        assetName: asset ? asset.name : 'ข้อความทั่วไป',
        content: text,
        channels: channels,
        scheduledTime: scheduledTime,
        status: 'queued',
        agentId: agent ? agent.id : '',
        template: document.getElementById('mktTemplate').value,
        posterName: AUTH.current ? (AUTH.current.displayname || AUTH.current.email) : 'เอเจนต์',
        runOnCloud: document.getElementById('mktRunOnCloud').checked,
        targetAgentId: document.getElementById('mktComposerAgent').value
      };

      await saveItem('mktQueue', qItem, qItem.id);
      if (!_realtimeSyncActive) {
        if (_editingQueueIdx >= 0) {
          DB.mktQueue[_editingQueueIdx] = qItem;
        } else {
          DB.mktQueue.push(qItem);
        }
        saveTolocalStorage();
        renderMktQueue();
      }

      showToast(_editingQueueIdx >= 0 ? '✅ แก้ไขคิวโพสต์สำเร็จ' : '✅ เพิ่มคิวโพสต์สำเร็จ');
      _editingQueueIdx = -1;
      clearComposer();
      switchMktSubtab('queue');
    }

    async function handleComposerScheduleCustom() {
      const text = document.getElementById('mktComposerText').value;
      if (!text) { alert('กรุณาเขียนประกาศก่อนค่ะ'); return; }
      
      const channels = [];
      document.querySelectorAll('input[name="mkt_channels"]:checked').forEach(cb => {
        channels.push(cb.value);
      });
      if (!channels.length) { alert('กรุณาเลือกช่องทางลงประกาศอย่างน้อย 1 ช่องทาง'); return; }

      const customTimeInput = document.getElementById('mktCustomTime').value;
      if (!customTimeInput) { alert('กรุณาเลือกวันและเวลาที่ต้องการโพสต์'); return; }
      const scheduledTime = new Date(customTimeInput).toISOString();

      const assetIdxVal = document.getElementById('mktAssetSelect').value;
      const assetIdx = assetIdxVal !== '' ? parseInt(assetIdxVal) : -1;
      const asset = assetIdx >= 0 ? DB.assets[assetIdx] : null;

      const agentIdxVal = document.getElementById('mktAgentSelect').value;
      const agentIdx = agentIdxVal !== '' ? parseInt(agentIdxVal) : -1;
      const agent = agentIdx >= 0 ? DB.agents[agentIdx] : null;

      const qItem = {
        id: _editingQueueIdx >= 0 ? DB.mktQueue[_editingQueueIdx].id : genId(),
        assetId: asset ? asset.id : '',
        assetName: asset ? asset.name : 'ข้อความทั่วไป',
        content: text,
        channels: channels,
        scheduledTime: scheduledTime,
        status: 'queued',
        agentId: agent ? agent.id : '',
        template: document.getElementById('mktTemplate').value,
        posterName: AUTH.current ? (AUTH.current.displayname || AUTH.current.email) : 'เอเจนต์',
        runOnCloud: document.getElementById('mktRunOnCloud').checked,
        targetAgentId: document.getElementById('mktComposerAgent').value
      };

      await saveItem('mktQueue', qItem, qItem.id);
      if (!_realtimeSyncActive) {
        if (_editingQueueIdx >= 0) {
          DB.mktQueue[_editingQueueIdx] = qItem;
        } else {
          DB.mktQueue.push(qItem);
        }
        saveTolocalStorage();
        renderMktQueue();
      }

      showToast('✅ ตั้งเวลาประกาศสำเร็จ');
      _editingQueueIdx = -1;
      clearComposer();
      switchMktSubtab('queue');
    }

    async function handleQueuePostNow(idx) {
      const q = DB.mktQueue[idx];
      navigator.clipboard.writeText(q.content);

      let imageLink = '';
      if (q.assetId) {
        const asset = DB.assets.find(a => a.id === q.assetId);
        if (asset && asset.linkpic) {
          imageLink = asset.linkpic;
        }
      }

      if (q.channels && q.channels.includes('facebook')) {
        postToFacebookViaAPI(q.content, imageLink);
      }
      
      q.channels.forEach(ch => {
        let url = '';
        if (ch === 'livinginsider') url = 'https://www.livinginsider.com/post_property.html';
        if (ch === 'ennxo') url = 'https://www.ennxo.com/อสังหาริมทรัพย์';
        if (url) window.open(url, '_blank');
      });

      q.status = 'sent';
      q.scheduledTime = new Date().toISOString();

      await saveItem('mktQueue', q, q.id);
      if (!_realtimeSyncActive) {
        saveTolocalStorage();
        renderMktQueue();
      }
      showToast('🚀 ดึงคิวและเปิดช่องทางการโพสต์แล้ว!');
    }

    function handleQueueEdit(idx) {
      const q = DB.mktQueue[idx];
      _editingQueueIdx = idx;
      
      switchMktSubtab('composer');
      
      const checkboxes = document.querySelectorAll('input[name="mkt_channels"]');
      checkboxes.forEach(cb => {
        cb.checked = (q.channels || []).includes(cb.value);
      });
      
      const assetIdx = DB.assets.findIndex(a => a.id === q.assetId);
      if (assetIdx >= 0) {
        const a = DB.assets[assetIdx];
        document.getElementById('mktAssetSelect').value = assetIdx;
        document.getElementById('mktAssetSearch').value = `${a.name} (${a.status})`;
      } else {
        document.getElementById('mktAssetSelect').value = '';
        document.getElementById('mktAssetSearch').value = '';
      }
      
      const agentIdx = DB.agents.findIndex(ag => ag.id === q.agentId);
      document.getElementById('mktAgentSelect').value = agentIdx >= 0 ? agentIdx : '';
      onMktAgentChange();
      
      document.getElementById('mktTemplate').value = q.template || 'fb';
      document.getElementById('mktComposerText').value = q.content || '';
      document.getElementById('mktRunOnCloud').checked = q.runOnCloud !== false;
      document.getElementById('mktComposerAgent').value = q.targetAgentId || '';
      
      if (q.scheduledTime) {
        const dt = new Date(q.scheduledTime);
        const tzoffset = dt.getTimezoneOffset() * 60000;
        const localISOTime = (new Date(dt.getTime() - tzoffset)).toISOString().slice(0, 16);
        document.getElementById('mktCustomTime').value = localISOTime;
      }
      
      showToast('✏️ กำลังแก้ไขโพสต์ในคิว...');
    }

    async function handleQueueDelete(idx) {
      if (!confirm('ยืนยันลบคิวโพสต์นี้?')) return;
      const item = DB.mktQueue[idx];
      await deleteItemFromDB('mktQueue', item.id);
      if (!_realtimeSyncActive) {
        DB.mktQueue.splice(idx, 1);
        saveTolocalStorage();
        renderMktQueue();
      }
    }

    function clearComposer() {
      document.getElementById('mktAssetSelect').value = '';
      document.getElementById('mktAssetSearch').value = '';
      document.getElementById('mktAgentSelect').value = '';
      document.getElementById('mktAgentPreview').style.display = 'none';
      document.getElementById('mktComposerText').value = '';
      document.getElementById('mktCustomTime').value = '';
      document.getElementById('mktRunOnCloud').checked = true;
      document.getElementById('mktComposerAgent').value = '';
      const checkboxes = document.querySelectorAll('input[name="mkt_channels"]');
      checkboxes.forEach(cb => cb.checked = true);
    }

    function onComposerChange() {
      generateMarketingCopy();
    }

    function checkScheduledQueueReminders() {
      if (!DB.mktQueue) return;
      const now = new Date();
      const dueItems = DB.mktQueue.filter(q => q.status === 'queued' && !q.runOnCloud && new Date(q.scheduledTime) <= now);
      
      dueItems.forEach(q => {
        if (Notification.permission === 'granted') {
          const n = new Notification(`🚨 ถึงเวลาโพสต์อสังหาฯ แล้ว!`, {
            body: `โครงการ: ${q.assetName} (คลิกเพื่อเปิดหน้าโพสต์)`,
            icon: 'favicon.ico'
          });
          n.onclick = () => {
            window.focus();
            const idx = DB.mktQueue.indexOf(q);
            if (idx >= 0) handleQueuePostNow(idx);
          };
        }
        showPersistentDueBanner(q);
      });
    }

    function showPersistentDueBanner(q) {
      if (_activeBanners[q.id]) return;
      
      const banner = document.createElement('div');
      banner.id = 'banner-' + q.id;
      _activeBanners[q.id] = banner;

      Object.assign(banner.style, {
        position: 'fixed',
        top: '20px',
        right: '20px',
        background: 'var(--dark2)',
        border: '2px solid var(--gold)',
        borderRadius: '10px',
        padding: '16px',
        width: '320px',
        zIndex: '10000',
        boxShadow: 'var(--shadow)',
        color: 'var(--text)',
        fontSize: '13px',
        fontFamily: 'inherit'
      });
      
      const idx = DB.mktQueue.indexOf(q);

      banner.innerHTML = `
        <div style="font-weight:700;color:var(--gold);margin-bottom:6px;display:flex;justify-content:space-between;align-items:center;">
          <span>🚨 ถึงกำหนดเวลาโพสต์แล้ว!</span>
          <button onclick="dismissDueBanner('${q.id}')" style="background:none;border:none;color:var(--text3);cursor:pointer;font-weight:700;font-size:14px;">×</button>
        </div>
        <div style="font-weight:600;margin-bottom:10px;">🏠 ${q.assetName}</div>
        <div style="display:flex;gap:6px;justify-content:flex-end;">
          <button class="btn btn-outline btn-sm" onclick="dismissDueBanner('${q.id}')" style="padding:4px 8px;font-size:11px;">ละเว้น</button>
          <button class="btn btn-primary btn-sm" onclick="handleBannerPostNow('${q.id}', ${idx})" style="padding:4px 12px;font-size:11px;">🚀 โพสต์เลย</button>
        </div>
      `;
      document.body.appendChild(banner);
    }

    window.dismissDueBanner = function(id) {
      const banner = _activeBanners[id];
      if (banner) {
        banner.remove();
        delete _activeBanners[id];
      }
    };

    window.handleBannerPostNow = function(id, idx) {
      handleQueuePostNow(idx);
      window.dismissDueBanner(id);
    };

    function requestNotificationPermission() {
      if (Notification.permission === 'default') {
        Notification.requestPermission();
      }
    }

    // ============================
    // GEMINI AI CONFIG
    // ============================
    function initAIConfig() {
      const apiKey = localStorage.getItem('gemini_api_key') || '';
      const input = document.getElementById('ai_geminiApiKey');
      if (input) {
        input.value = apiKey;
      }
    }

    function saveAIConfig() {
      const input = document.getElementById('ai_geminiApiKey');
      if (!input) return;
      const key = input.value.trim();
      localStorage.setItem('gemini_api_key', key);
      const statusEl = document.getElementById('aiConfigStatus');
      if (statusEl) {
        statusEl.textContent = '💾 บันทึกสิทธิ์การเข้าใช้งาน AI เรียบร้อยแล้ว';
        statusEl.style.color = 'var(--green)';
        setTimeout(() => { statusEl.textContent = ''; }, 3000);
      }
      showToast('🤖 บันทึก Gemini API Key สำเร็จ!');
    }

    async function testAIConnection() {
      const input = document.getElementById('ai_geminiApiKey');
      if (!input) return;
      const apiKey = input.value.trim();
      if (!apiKey) {
        alert('กรุณากรอก Gemini API Key ก่อนทดสอบค่ะ');
        return;
      }
      
      const statusEl = document.getElementById('aiConfigStatus');
      if (statusEl) {
        statusEl.textContent = '⏳ กำลังทดสอบเชื่อมต่อ...';
        statusEl.style.color = 'var(--gold)';
      }
      
      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: 'ทดสอบสั้นๆ ตอบสั้นๆ ว่า OK' }] }]
          })
        });
        
        if (response.ok) {
          const data = await response.json();
          if (statusEl) {
            statusEl.textContent = '✅ เชื่อมต่อ AI สำเร็จ!';
            statusEl.style.color = 'var(--green)';
          }
          const textResponse = data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0] ? data.candidates[0].content.parts[0].text : 'ไม่มีข้อความ';
          alert('✅ เชื่อมต่อ Gemini API สำเร็จ!\nระบบตอบกลับ: ' + textResponse);
        } else {
          const errData = await response.json();
          if (statusEl) {
            statusEl.textContent = '❌ เชื่อมต่อ AI ผิดพลาด';
            statusEl.style.color = 'var(--red)';
          }
          alert('❌ เชื่อมต่อผิดพลาด: ' + (errData.error?.message || response.statusText));
        }
      } catch (e) {
        if (statusEl) {
          statusEl.textContent = '❌ การเชื่อมต่อล้มเหลว';
          statusEl.style.color = 'var(--red)';
        }
        alert('❌ ไม่สามารถเชื่อมต่อ API ได้: ' + e.message);
      }
    }

    async function generateMarketingCopyWithAI() {
      const assetIdxVal = document.getElementById('mktAssetSelect').value;
      if (assetIdxVal === '') {
        alert('กรุณาเลือกทรัพย์สินก่อนเขียนข้อความด้วย AI ค่ะ');
        return;
      }
      
      const apiKey = localStorage.getItem('gemini_api_key') || '';
      if (!apiKey) {
        alert('❌ ยังไม่ได้ตั้งค่า Gemini API Key\nกรุณาไปที่แท็บ "ตั้งค่า" -> "ตั้งค่า Gemini AI" เพื่อใส่ API Key ก่อนใช้งานค่ะ');
        return;
      }
      
      const assetIdx = parseInt(assetIdxVal);
      const a = DB.assets[assetIdx];
      
      const tone = document.getElementById('mktAiTone').value;
      const highlights = document.getElementById('mktAiHighlights').value.trim();
      
      // Get contact details if selected
      const contactOverride = getContactForMkt(a);
      const lineAtInfo = getLineAtForMkt();
      const showContact = document.getElementById('mktContact').checked;
      const showLineAt = document.getElementById('mktLineAt').checked;
      
      let contactInfoText = '';
      if (showContact && contactOverride) {
        contactInfoText += `\n📞 สนใจติดต่อ/สอบถามเพิ่มเติม: ${contactOverride}`;
      }
      if (showLineAt && lineAtInfo) {
        contactInfoText += `\n💬 Line ID/Link: ${lineAtInfo}`;
      }

      // UI States
      const btn = document.getElementById('btnMktAiGenerate');
      const loading = document.getElementById('mktAiLoading');
      const textOutput = document.getElementById('mktComposerText');
      
      if (btn) btn.disabled = true;
      if (loading) loading.style.display = 'block';
      
      // Build prompt
      let toneGuideline = '';
      if (tone === 'luxury') {
        toneGuideline = 'เขียนในสไตล์ หรูหรา พรีเมียม ดูหรูหรามีระดับ ใช้ภาษาที่สุภาพและดึงดูดกลุ่มลูกค้าที่มีกำลังซื้อสูง เน้นความเหนือระดับ ความสะดวกสบาย และวัสดุอุปกรณ์ตกแต่งที่พรีเมียม';
      } else if (tone === 'value') {
        toneGuideline = 'เขียนในสไตล์ เน้นความคุ้มค่า น่าลงทุน ราคาดีคุ้มเงิน เน้นวิเคราะห์ความคุ้มค่าของการอยู่อาศัยหรือปล่อยเช่า ชี้ให้เห็นถึงความคุ้มค่าเมื่อเทียบกับโครงการอื่นในทำเลเดียวกัน';
      } else if (tone === 'urgent') {
        toneGuideline = 'เขียนในสไตล์ เร่งด่วน กระตุ้นความสนใจ (Call to Action) ใช้พาดหัวที่ตื่นเต้น ดึงดูดสายตา เช่น หลุดจอง! ด่วน! ราคาต่ำกว่าตลาด เพื่อกระตุ้นให้ผู้ซื้อทักแชทหรือโทรติดต่อทันที';
      } else if (tone === 'friendly') {
        toneGuideline = 'เขียนในสไตล์ อบอุ่น เป็นกันเอง เล่าเรื่องความน่าอยู่ เหมาะสำหรับการสร้างครอบครัวหรือการพักผ่อนอย่างมีความสุข บรรยายความรู้สึกอบอุ่นเสมือนบ้านจริง';
      }
      
      let prompt = `คุณคือเอเจนต์อสังหาริมทรัพย์มืออาชีพของทีม BENZ HOME Agency
กรุณาช่วยเขียนข้อความโฆษณาโพสต์สำหรับขายหรือเช่าอสังหาริมทรัพย์ชิ้นนี้ โดยอ้างอิงจากข้อมูลด้านล่าง:

ข้อมูลอสังหาริมทรัพย์:
- ชื่อโครงการ/ทรัพย์สิน: ${a.name || 'ไม่ระบุ'}
- ประเภท: ${a.type || 'ไม่ระบุ'}
- รูปแบบประกาศ: ${a.status || 'เช่า/ขาย'}
- ราคา/ค่าเช่า: ${a.price || 'ไม่ระบุ'}
- ขนาดห้อง/จำนวนห้อง: ${a.roomtype || 'ไม่ระบุ'} (พื้นที่: ${a.area || 'ไม่ระบุ'} ตร.ม., ชั้น: ${a.floor || 'ไม่ระบุ'})
- ทำเลที่ตั้ง: ${a.location || 'ไม่ระบุ'}
${a.bts ? `- ใกล้สถานีรถไฟฟ้า: 🚇 ${a.bts}` : ''}
${highlights ? `- จุดเด่นพิเศษที่ต้องเน้น: ${highlights}` : ''}

แนวทางในการเขียน:
1. ${toneGuideline}
2. เขียนให้น่าสนใจ มีการเว้นบรรทัดให้อ่านง่าย สอดแทรกอิโมจิ (Emoji) ที่เหมาะสมอย่างลงตัว
3. สรุปรายละเอียดทรัพย์สินและสิ่งอำนวยความสะดวกให้ครบถ้วน น่าดึงดูด
4. โพสต์เป็นภาษาไทยทั้งหมด ไม่ต้องพาดหัวอารัมภบทหรือมีคำทักทายกับฉัน (ผู้สั่งงาน) ให้เขียนตัวเนื้อหาโพสต์โฆษณาออกมาทันที
5. ท้ายโพสต์กรุณาใส่ข้อมูลติดต่อตามนี้: ${contactInfoText || 'ข้อมูลติดต่อระบุในโปรไฟล์'}
`;

      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }]
          })
        });
        
        if (response.ok) {
          const data = await response.json();
          const generatedText = data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0] ? data.candidates[0].content.parts[0].text : '';
          
          if (generatedText && textOutput) {
            textOutput.value = generatedText;
            showToast('🤖 AI เจนสคริปต์โฆษณาสำเร็จ!');
          } else {
            alert('ไม่สามารถดึงข้อความจาก AI ได้');
          }
        } else {
          const errData = await response.json();
          alert('❌ AI เขียนโพสต์ไม่สำเร็จ: ' + (errData.error?.message || response.statusText));
        }
      } catch (e) {
        alert('❌ เกิดข้อผิดพลาดในการเชื่อมต่อ AI: ' + e.message);
      } finally {
        if (btn) btn.disabled = false;
        if (loading) loading.style.display = 'none';
      }
    }

    // ============================
    // CANVAS POSTER CREATOR
    // ============================
    let _posterBgImage = null;
    let _loadedQrImage = null;
    let _currentQrData = '';

    function getAgentQrData() {
      const lineText = document.getElementById('posterLine').value.trim();
      const phoneText = document.getElementById('posterPhone').value.trim();
      
      if (lineText) {
        if (lineText.startsWith('http')) return lineText;
        if (lineText.startsWith('@')) return `https://line.me/R/ti/p/~${lineText.replace('@', '')}`;
        return `https://line.me/ti/p/${lineText}`;
      }
      if (phoneText) {
        return `tel:${phoneText}`;
      }
      return 'https://www.google.com';
    }

    function openPosterCreator() {
      const assetIdxVal = document.getElementById('mktAssetSelect').value;
      if (assetIdxVal === '') {
        alert('กรุณาเลือกทรัพย์สินก่อนสร้างรูปภาพโปรโมตค่ะ');
        return;
      }
      
      const assetIdx = parseInt(assetIdxVal);
      const a = DB.assets[assetIdx];
      
      // Get Agent Contact Info
      let phone = '';
      let line = '';
      const agIdxVal = document.getElementById('mktAgentSelect').value;
      if (agIdxVal !== '') {
        const ag = DB.agents[parseInt(agIdxVal)];
        phone = ag.tel || '';
        line = ag.line || '';
      } else {
        phone = a.contact || '';
      }

      // Populate Inputs
      document.getElementById('posterTitle').value = a.name || '';
      document.getElementById('posterPrice').value = `${a.status === 'เช่า' ? 'เช่า' : 'ขาย'} ${a.price || ''}`;
      
      let subDetails = [];
      if (a.roomtype) subDetails.push(a.roomtype);
      if (a.area) subDetails.push(`${a.area} ตร.ม.`);
      if (a.floor) subDetails.push(`ชั้น ${a.floor}`);
      document.getElementById('posterSub').value = subDetails.join(' · ');
      
      document.getElementById('posterBts').value = a.bts ? `🚇 สถานี ${a.bts}` : (a.location || '');
      document.getElementById('posterPhone').value = phone;
      document.getElementById('posterLine').value = line;
      
      // Clear file input
      document.getElementById('posterBgInput').value = '';
      _posterBgImage = null;
      _currentQrData = '';
      _loadedQrImage = null;

      // Reset template selection & badge
      document.getElementById('posterTemplate').value = 'classic-gold';
      document.getElementById('posterBadge').value = 'none';

      openModal('posterCreator');
      drawPoster();
    }

    function loadPosterBgImage(e) {
      const file = e.target.files[0];
      if (!file) return;
      
      const reader = new FileReader();
      reader.onload = function(event) {
        const img = new Image();
        img.onload = function() {
          _posterBgImage = img;
          drawPoster();
        };
        img.src = event.target.result;
      };
      reader.readAsDataURL(file);
    }

    function drawPoster() {
      const canvas = document.getElementById('posterCanvas');
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      const w = canvas.width;
      const h = canvas.height;
      
      ctx.clearRect(0, 0, w, h);
      
      const template = document.getElementById('posterTemplate').value || 'classic-gold';
      const badge = document.getElementById('posterBadge').value || 'none';
      
      // Load QR Code dynamically if changed
      const qrData = getAgentQrData();
      if (qrData !== _currentQrData) {
        _currentQrData = qrData;
        _loadedQrImage = null; // reset while loading
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = function() {
          _loadedQrImage = img;
          drawPoster(); // Redraw once loaded
        };
        img.src = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(qrData)}`;
      }

      // 1. Draw Background
      if (_posterBgImage) {
        const imgW = _posterBgImage.width;
        const imgH = _posterBgImage.height;
        const imgRatio = imgW / imgH;
        const canvasRatio = w / h;
        
        let drawW, drawH, drawX, drawY;
        if (imgRatio > canvasRatio) {
          drawH = h;
          drawW = h * imgRatio;
          drawX = (w - drawW) / 2;
          drawY = 0;
        } else {
          drawW = w;
          drawH = w / imgRatio;
          drawX = 0;
          drawY = (h - drawH) / 2;
        }
        ctx.drawImage(_posterBgImage, drawX, drawY, drawW, drawH);
      } else {
        // Fallback backgrounds depending on template
        if (template === 'minimal-light') {
          const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
          bgGrad.addColorStop(0, '#FAF9F6');
          bgGrad.addColorStop(1, '#EAE5D8');
          ctx.fillStyle = bgGrad;
          ctx.fillRect(0, 0, w, h);
          
          // Subtle abstract shape
          ctx.strokeStyle = 'rgba(192, 120, 0, 0.05)';
          ctx.lineWidth = 1;
          for (let i = 0; i < 800; i += 40) {
            ctx.beginPath();
            ctx.moveTo(i, 0);
            ctx.lineTo(w, h - i);
            ctx.stroke();
          }
        } else if (template === 'vibrant-tech') {
          const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
          bgGrad.addColorStop(0, '#050716');
          bgGrad.addColorStop(1, '#0C0F2B');
          ctx.fillStyle = bgGrad;
          ctx.fillRect(0, 0, w, h);
          
          // Sci-fi grid
          ctx.strokeStyle = 'rgba(0, 240, 255, 0.05)';
          ctx.lineWidth = 1;
          for (let i = 0; i < w; i += 60) {
            ctx.beginPath();
            ctx.moveTo(i, 0);
            ctx.lineTo(i, h);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(0, i);
            ctx.lineTo(w, i);
            ctx.stroke();
          }
        } else { // classic-gold
          const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
          bgGrad.addColorStop(0, '#1A1813');
          bgGrad.addColorStop(1, '#080808');
          ctx.fillStyle = bgGrad;
          ctx.fillRect(0, 0, w, h);
          
          ctx.strokeStyle = 'rgba(201, 168, 76, 0.08)';
          ctx.lineWidth = 2;
          for (let i = 0; i < 6; i++) {
            ctx.beginPath();
            ctx.arc(w / 2, h / 2, 100 + i * 80, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
      }
      
      // 2. Bottom Overlay Gradient (For text contrast)
      const overlayGrad = ctx.createLinearGradient(0, h * 0.4, 0, h);
      if (template === 'minimal-light') {
        overlayGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
        overlayGrad.addColorStop(0.3, 'rgba(250, 248, 242, 0.5)');
        overlayGrad.addColorStop(0.7, 'rgba(250, 248, 242, 0.92)');
        overlayGrad.addColorStop(1, 'rgba(250, 248, 242, 0.99)');
      } else if (template === 'vibrant-tech') {
        overlayGrad.addColorStop(0, 'rgba(5, 7, 22, 0)');
        overlayGrad.addColorStop(0.3, 'rgba(5, 7, 22, 0.45)');
        overlayGrad.addColorStop(0.7, 'rgba(5, 7, 22, 0.88)');
        overlayGrad.addColorStop(1, 'rgba(5, 7, 22, 0.98)');
      } else { // classic-gold
        overlayGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
        overlayGrad.addColorStop(0.3, 'rgba(0, 0, 0, 0.4)');
        overlayGrad.addColorStop(0.7, 'rgba(0, 0, 0, 0.85)');
        overlayGrad.addColorStop(1, 'rgba(0, 0, 0, 0.98)');
      }
      ctx.fillStyle = overlayGrad;
      ctx.fillRect(0, h * 0.4, w, h * 0.6);
      
      // 3. Borders & Frames
      if (template === 'minimal-light') {
        ctx.strokeStyle = '#33302A';
        ctx.lineWidth = 14;
        ctx.strokeRect(7, 7, w - 14, h - 14);
        
        ctx.strokeStyle = '#C9A84C'; // accent gold line
        ctx.lineWidth = 2;
        ctx.strokeRect(18, 18, w - 36, h - 36);
      } else if (template === 'vibrant-tech') {
        // Cyan tech border
        ctx.strokeStyle = '#00F0FF';
        ctx.lineWidth = 10;
        ctx.strokeRect(5, 5, w - 10, h - 10);
        
        // Cyber corner lines
        ctx.fillStyle = '#00F0FF';
        ctx.fillRect(15, 15, 40, 6);
        ctx.fillRect(15, 15, 6, 40);
        ctx.fillRect(w - 55, 15, 40, 6);
        ctx.fillRect(w - 21, 15, 6, 40);
        ctx.fillRect(15, h - 21, 40, 6);
        ctx.fillRect(15, h - 55, 6, 40);
        ctx.fillRect(w - 55, h - 21, 40, 6);
        ctx.fillRect(w - 21, h - 55, 6, 40);
      } else { // classic-gold
        ctx.strokeStyle = '#C9A84C';
        ctx.lineWidth = 14;
        ctx.strokeRect(7, 7, w - 14, h - 14);
        
        ctx.fillStyle = '#C9A84C';
        ctx.fillRect(20, 20, 20, 20);
        ctx.fillRect(w - 40, 20, 20, 20);
        ctx.fillRect(20, h - 40, 20, 20);
        ctx.fillRect(w - 40, h - 40, 20, 20);
      }
      
      // 4. Brand Header Badge (Top Left)
      if (template === 'minimal-light') {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.fillRect(35, 35, 320, 60);
        ctx.strokeStyle = '#33302A';
        ctx.lineWidth = 2;
        ctx.strokeRect(35, 35, 320, 60);
        ctx.fillStyle = '#1A1506';
      } else if (template === 'vibrant-tech') {
        ctx.fillStyle = 'rgba(5, 7, 22, 0.85)';
        ctx.fillRect(35, 35, 320, 60);
        ctx.strokeStyle = '#00F0FF';
        ctx.lineWidth = 2;
        ctx.strokeRect(35, 35, 320, 60);
        ctx.fillStyle = '#00F0FF';
      } else { // classic-gold
        ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
        ctx.fillRect(35, 35, 320, 60);
        ctx.strokeStyle = '#C9A84C';
        ctx.lineWidth = 2;
        ctx.strokeRect(35, 35, 320, 60);
        ctx.fillStyle = '#F0EDE6';
      }
      ctx.font = 'bold 22px Prompt, Kanit, Arial';
      ctx.textAlign = 'center';
      ctx.fillText('BENZ HOME AGENCY', 195, 73);
      
      // 5. Draw Status Badge Ribbon (Top Right)
      if (badge !== 'none') {
        let badgeColor1 = '#E05050'; // default red
        let badgeColor2 = '#991111';
        let badgeText = '';
        
        if (badge === 'hot-deal') {
          badgeColor1 = '#E05050';
          badgeColor2 = '#A81818';
          badgeText = '🔥 HOT DEAL';
        } else if (badge === 'quick-move') {
          badgeColor1 = '#C9A84C';
          badgeColor2 = '#9A7530';
          badgeText = '📦 ย้ายเข้าด่วน';
        } else if (badge === 'under-market') {
          badgeColor1 = '#5090E0';
          badgeColor2 = '#195BA0';
          badgeText = '💎 ต่ำกว่าราคาตลาด';
        } else if (badge === 'closed') {
          badgeColor1 = '#7A7060';
          badgeColor2 = '#444038';
          badgeText = '🔒 SOLD / RENTED';
        }
        
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.4)';
        ctx.shadowBlur = 10;
        
        const badgeW = 280;
        const badgeH = 54;
        const badgeX = w - badgeW - 35;
        const badgeY = 38;
        
        const badgeGrad = ctx.createLinearGradient(badgeX, badgeY, badgeX + badgeW, badgeY + badgeH);
        badgeGrad.addColorStop(0, badgeColor1);
        badgeGrad.addColorStop(1, badgeColor2);
        
        ctx.fillStyle = badgeGrad;
        ctx.beginPath();
        ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 12);
        ctx.fill();
        
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 22px Prompt, Kanit, Arial';
        ctx.textAlign = 'center';
        ctx.fillText(badgeText, badgeX + badgeW / 2, badgeY + 34);
        ctx.restore();
      }
      
      // 6. Text Contents (Bottom Area)
      const titleText = document.getElementById('posterTitle').value || 'โครงการอสังหาฯ';
      const priceText = document.getElementById('posterPrice').value || 'ราคาพิเศษ';
      const subText = document.getElementById('posterSub').value || '';
      const btsText = document.getElementById('posterBts').value || '';
      
      const phoneText = document.getElementById('posterPhone').value || '';
      const lineText = document.getElementById('posterLine').value || '';

      ctx.textAlign = 'left';
      if (template === 'minimal-light') {
        ctx.fillStyle = '#1A1506';
      } else if (template === 'vibrant-tech') {
        ctx.fillStyle = '#FFFFFF';
      } else {
        ctx.fillStyle = '#FFFFFF';
      }
      ctx.font = 'bold 54px Prompt, Kanit, Arial';
      ctx.fillText(titleText, 60, h - 330);
      
      if (template === 'minimal-light') {
        ctx.fillStyle = '#C07800';
      } else if (template === 'vibrant-tech') {
        ctx.fillStyle = '#FFE500';
      } else {
        ctx.fillStyle = '#C9A84C';
      }
      ctx.font = '900 68px Prompt, Kanit, Arial';
      ctx.fillText(priceText, 60, h - 245);
      
      if (template === 'minimal-light') {
        ctx.fillStyle = '#5A5040';
      } else if (template === 'vibrant-tech') {
        ctx.fillStyle = '#8FA0B8';
      } else {
        ctx.fillStyle = '#E1DCD3';
      }
      ctx.font = '500 32px Prompt, Kanit, Arial';
      ctx.fillText(subText, 60, h - 185);
      
      if (btsText) {
        if (template === 'minimal-light') {
          ctx.fillStyle = '#0077CC';
        } else if (template === 'vibrant-tech') {
          ctx.fillStyle = '#00F0FF';
        } else {
          ctx.fillStyle = '#5090E0';
        }
        ctx.font = 'bold 30px Prompt, Kanit, Arial';
        ctx.fillText(btsText, 60, h - 130);
      }
      
      // 7. Divider Line
      if (template === 'minimal-light') {
        ctx.strokeStyle = 'rgba(51, 48, 42, 0.2)';
      } else if (template === 'vibrant-tech') {
        ctx.strokeStyle = 'rgba(0, 240, 255, 0.3)';
      } else {
        ctx.strokeStyle = 'rgba(201, 168, 76, 0.4)';
      }
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(60, h - 90);
      ctx.lineTo(w - 240, h - 90);
      ctx.stroke();
      
      if (template === 'minimal-light') {
        ctx.fillStyle = '#33302A';
      } else if (template === 'vibrant-tech') {
        ctx.fillStyle = '#8FA0B8';
      } else {
        ctx.fillStyle = '#B8B0A0';
      }
      ctx.font = 'bold 24px Prompt, Kanit, Arial';
      let contactStr = '';
      if (phoneText) contactStr += `📞 สนใจติดต่อ: ${phoneText}  `;
      if (lineText) contactStr += `💬 Line: ${lineText}`;
      ctx.fillText(contactStr || 'ติดต่อสอบถามรายละเอียดเพิ่มเติม', 60, h - 50);

      // 8. Draw QR Code
      const qrSize = 150;
      const qrX = w - 210;
      const qrY = h - 210;
      
      if (_loadedQrImage) {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(qrX, qrY, qrSize, qrSize);
        
        if (template === 'minimal-light') {
          ctx.strokeStyle = '#33302A';
        } else if (template === 'vibrant-tech') {
          ctx.strokeStyle = '#00F0FF';
        } else {
          ctx.strokeStyle = '#C9A84C';
        }
        ctx.lineWidth = 4;
        ctx.strokeRect(qrX, qrY, qrSize, qrSize);
        
        ctx.drawImage(_loadedQrImage, qrX + 6, qrY + 6, qrSize - 12, qrSize - 12);
      } else {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(qrX, qrY, qrSize, qrSize);
        
        if (template === 'minimal-light') {
          ctx.strokeStyle = '#33302A';
        } else if (template === 'vibrant-tech') {
          ctx.strokeStyle = '#00F0FF';
        } else {
          ctx.strokeStyle = '#C9A84C';
        }
        ctx.lineWidth = 4;
        ctx.strokeRect(qrX, qrY, qrSize, qrSize);
        
        ctx.fillStyle = '#5A5040';
        ctx.font = '13px Prompt, Kanit, Arial';
        ctx.textAlign = 'center';
        ctx.fillText('⏳ กำลังโหลด QR...', qrX + qrSize / 2, qrY + qrSize / 2 + 5);
      }
      
      if (template === 'minimal-light') {
        ctx.fillStyle = '#33302A';
      } else if (template === 'vibrant-tech') {
        ctx.fillStyle = '#00F0FF';
      } else {
        ctx.fillStyle = '#FFFFFF';
      }
      ctx.font = 'bold 16px Prompt, Kanit, Arial';
      ctx.textAlign = 'center';
      ctx.fillText('SCAN ME', qrX + qrSize / 2, qrY - 10);
    }

    function downloadPosterImage() {
      const canvas = document.getElementById('posterCanvas');
      if (!canvas) return;
      
      const title = document.getElementById('posterTitle').value || 'asset';
      const link = document.createElement('a');
      link.download = `poster_${title.replace(/\s+/g, '_')}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      showToast('🎨 ดาวน์โหลดรูปภาพโพสต์เรียบร้อย!');
    }

    async function sharePosterImage() {
      const canvas = document.getElementById('posterCanvas');
      if (!canvas) return;

      if (!navigator.share) {
        alert('เบราว์เซอร์นี้ไม่รองรับการแชร์ไฟล์ภาพโดยตรงค่ะ คุณสามารถดาวน์โหลดรูปภาพและคัดลอกแคปชันไปแชร์แทนได้เลยค่ะ');
        return;
      }

      const title = document.getElementById('posterTitle').value || 'property';
      const text = document.getElementById('mktComposerText').value || '';

      try {
        canvas.toBlob(async (blob) => {
          if (!blob) {
            alert('ไม่สามารถประมวลผลไฟล์ภาพได้ค่ะ');
            return;
          }
          const file = new File([blob], `poster_${title.replace(/\s+/g, '_')}.png`, { type: 'image/png' });
          
          const shareData = {
            files: [file],
            title: title,
            text: text
          };

          if (navigator.canShare && navigator.canShare(shareData)) {
            await navigator.share(shareData);
            showToast('📲 แชร์เรียบร้อย!');
          } else {
            alert('อุปกรณ์นี้ไม่รองรับการแชร์ไฟล์ภาพประเภทนี้ค่ะ');
          }
        }, 'image/png');
      } catch (e) {
        console.error('Error sharing:', e);
        alert('เกิดข้อผิดพลาดในการแชร์ค่ะ: ' + e.message);
      }
    }

    window.saveAIConfig = saveAIConfig;
    window.testAIConnection = testAIConnection;
    window.initAIConfig = initAIConfig;
    window.generateMarketingCopyWithAI = generateMarketingCopyWithAI;
    window.openPosterCreator = openPosterCreator;
    window.loadPosterBgImage = loadPosterBgImage;
    window.drawPoster = drawPoster;
    window.downloadPosterImage = downloadPosterImage;
    window.sharePosterImage = sharePosterImage;

