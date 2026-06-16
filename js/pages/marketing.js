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
      if (!sel) return;
      sel.innerHTML = '<option value="">-- ใช้ข้อมูลติดต่อจากทรัพย์สิน --</option>' +
        DB.agents.map((ag, i) => `<option value="${i}">${ag.name || 'ไม่มีชื่อ'}${ag.company ? ' (' + ag.company + ')' : ''}</option>`).join('');
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
            const label = ch === 'ddproperty' ? 'DDproperty' :
                          ch === 'livinginsider' ? 'Livinginsider' :
                          ch === 'fazwaz' ? 'FazWaz' :
                          ch === 'zmyhome' ? 'ZmyHome' :
                          ch === 'ennxo' ? 'ENNXO' : ch;
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

    async function handleComposerShareNow() {
      const text = document.getElementById('mktComposerText').value;
      if (!text) { alert('กรุณาเขียนประกาศก่อนค่ะ'); return; }
      
      const channels = [];
      document.querySelectorAll('input[name="mkt_channels"]:checked').forEach(cb => {
        channels.push(cb.value);
      });
      if (!channels.length) { alert('กรุณาเลือกช่องทางลงประกาศอย่างน้อย 1 ช่องทาง'); return; }

      navigator.clipboard.writeText(text);

      channels.forEach(ch => {
        let url = '';
        if (ch === 'ddproperty') url = 'https://www.ddproperty.com/ลงประกาศอสังหาริมทรัพย์';
        if (ch === 'livinginsider') url = 'https://www.livinginsider.com/post_property.html';
        if (ch === 'fazwaz') url = 'https://www.fazwaz.co.th/list-your-property';
        if (ch === 'zmyhome') url = 'https://zmyhome.com/post';
        if (ch === 'ennxo') url = 'https://www.ennxo.com/อสังหาริมทรัพย์';
        if (url) window.open(url, '_blank');
      });

      const assetIdxVal = document.getElementById('mktAssetSelect').value;
      const assetIdx = assetIdxVal !== '' ? parseInt(assetIdxVal) : -1;
      const asset = assetIdx >= 0 ? DB.assets[assetIdx] : null;

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
        posterName: AUTH.current ? (AUTH.current.displayname || AUTH.current.email) : 'เอเจนต์'
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
        posterName: AUTH.current ? (AUTH.current.displayname || AUTH.current.email) : 'เอเจนต์'
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
      
      q.channels.forEach(ch => {
        let url = '';
        if (ch === 'ddproperty') url = 'https://www.ddproperty.com/ลงประกาศอสังหาริมทรัพย์';
        if (ch === 'livinginsider') url = 'https://www.livinginsider.com/post_property.html';
        if (ch === 'fazwaz') url = 'https://www.fazwaz.co.th/list-your-property';
        if (ch === 'zmyhome') url = 'https://zmyhome.com/post';
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
      const checkboxes = document.querySelectorAll('input[name="mkt_channels"]');
      checkboxes.forEach(cb => cb.checked = true);
    }

    function onComposerChange() {
      generateMarketingCopy();
    }

    function checkScheduledQueueReminders() {
      if (!DB.mktQueue) return;
      const now = new Date();
      const dueItems = DB.mktQueue.filter(q => q.status === 'queued' && new Date(q.scheduledTime) <= now);
      
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

