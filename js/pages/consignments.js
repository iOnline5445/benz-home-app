(function() {
  let _activeConsignmentsList = [];
  let _editingConsignId = null;

  // ============================
  // RENDER CONSIGNMENTS
  // ============================
  function renderConsignments() {
    const list = DB.consignments || [];
    const searchVal = (document.getElementById('consignSearch')?.value || '').toLowerCase().trim();
    const filterService = document.getElementById('filterConsignService')?.value || '';
    const filterStatus = document.getElementById('filterConsignStatus')?.value || '';

    // 1. Filter items
    _activeConsignmentsList = list.filter(item => {
      const matchSearch = !searchVal || 
        (item.propertyName || '').toLowerCase().includes(searchVal) ||
        (item.location || '').toLowerCase().includes(searchVal) ||
        (item.senderName || '').toLowerCase().includes(searchVal) ||
        (item.contact || '').toLowerCase().includes(searchVal) ||
        (item.note || '').toLowerCase().includes(searchVal);

      const matchService = !filterService || item.serviceType === filterService;
      const matchStatus = !filterStatus || item.status === filterStatus;

      return matchSearch && matchService && matchStatus;
    });

    // Sort by createdAt descending
    _activeConsignmentsList.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

    // 2. Update Statistics counters
    const totalCount = list.length;
    const newCount = list.filter(item => item.status === 'ใหม่' || !item.status).length;
    const pendingCount = list.filter(item => item.status === 'รอดำเนินการ').length;
    const completedCount = list.filter(item => item.status === 'สำเร็จ').length;

    if (document.getElementById('statConsignTotal')) document.getElementById('statConsignTotal').textContent = totalCount;
    if (document.getElementById('statConsignNew')) document.getElementById('statConsignNew').textContent = newCount;
    if (document.getElementById('statConsignPending')) document.getElementById('statConsignPending').textContent = pendingCount;
    if (document.getElementById('statConsignCompleted')) document.getElementById('statConsignCompleted').textContent = completedCount;

    // 3. Render PC Table View
    const tbody = document.getElementById('consignTable');
    if (tbody) {
      if (!_activeConsignmentsList.length) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;color:var(--text3);padding:30px;">📭 ไม่มีข้อมูลรายการฝากขาย/จำนอง</td></tr>`;
      } else {
        tbody.innerHTML = _activeConsignmentsList.map((item, idx) => {
          // Badges styling
          let serviceClass = 'queue-chan-badge';
          if (item.serviceType === 'ฝากขาย') serviceClass += ' queue-chan-ddproperty'; // red
          else if (item.serviceType === 'ฝากเช่า') serviceClass += ' queue-chan-livinginsider'; // blue
          else serviceClass += ' queue-chan-ennxo'; // purple

          let statusClass = 'queue-chan-badge';
          if (item.status === 'ใหม่') statusClass += ' queue-chan-ddproperty'; // red
          else if (item.status === 'รอดำเนินการ') statusClass += ' queue-chan-zmyhome'; // orange/yellow
          else if (item.status === 'ติดต่อแล้ว') statusClass += ' queue-chan-livinginsider'; // blue
          else if (item.status === 'สำเร็จ') statusClass += ' queue-chan-fazwaz'; // green

          const photoHtml = item.photoLink 
            ? `<a href="${item.photoLink}" target="_blank" class="btn btn-outline" style="padding:4px 8px;font-size:11px;min-height:auto;gap:3px;">🔗 ดูรูป</a>`
            : `<span style="color:var(--text3);font-size:11px;">ไม่มีรูป</span>`;

          const dateStr = item.createdAt ? new Date(item.createdAt).toLocaleDateString('th-TH', {day:'2-digit', month:'short', year:'2-digit'}) : '-';

          return `
            <tr>
              <td><span class="${serviceClass}" style="display:inline-block;padding:2px 8px;border-radius:4px;color:#fff;">${item.serviceType || 'ฝากขาย'}</span></td>
              <td><span style="font-weight:600;color:var(--text2);">${item.propertyType || '-'}</span></td>
              <td>
                <div style="font-weight:700;color:var(--text);">${escapeHtml(item.propertyName || '-')}</div>
                <div style="font-size:11px;color:var(--text3);margin-top:2px;">📍 ${escapeHtml(item.location || '-')}</div>
                ${item.note ? `<div style="font-size:11px;color:var(--gold);margin-top:2px;font-style:italic;">💬 ${escapeHtml(item.note)}</div>` : ''}
              </td>
              <td><span style="font-weight:700;color:var(--gold);">${escapeHtml(item.price || '-')}</span></td>
              <td style="color:var(--text2);">${escapeHtml(item.size || '-')}</td>
              <td>
                <div style="font-weight:600;color:var(--text2);">${escapeHtml(item.senderName || '-')}</div>
                <div style="font-size:11px;color:var(--text3);margin-top:2px;">📞 ${escapeHtml(item.contact || '-')}</div>
              </td>
              <td>${photoHtml}</td>
              <td><span class="${statusClass}" style="display:inline-block;padding:2px 8px;border-radius:4px;color:#fff;">${item.status || 'ใหม่'}</span></td>
              <td>
                <div style="display:flex;gap:6px;flex-wrap:wrap;">
                  <button class="btn btn-primary" onclick="convertToAsset(${idx})" style="padding:4px 8px;font-size:11px;min-height:auto;background:var(--gold)!important;color:#1a1208!important;font-weight:700;">⚡ สร้างทรัพย์</button>
                  <button class="btn btn-outline" onclick="editConsignment(${idx})" style="padding:4px 8px;font-size:11px;min-height:auto;">✏️ แก้ไข</button>
                  <button class="btn btn-outline" onclick="deleteConsignment(${idx})" style="padding:4px 8px;font-size:11px;min-height:auto;color:var(--red);border-color:rgba(224,80,80,0.3);">🗑️</button>
                </div>
              </td>
            </tr>
          `;
        }).join('');
      }
    }

    // 4. Render Mobile Cards View
    const mList = document.getElementById('consignMList');
    if (mList) {
      if (!_activeConsignmentsList.length) {
        mList.innerHTML = `<div style="text-align:center;color:var(--text3);padding:30px;background:var(--dark2);border-radius:12px;">📭 ไม่มีข้อมูลรายการฝากขาย/จำนอง</div>`;
      } else {
        mList.innerHTML = _activeConsignmentsList.map((item, idx) => {
          let serviceClass = 'queue-chan-badge';
          if (item.serviceType === 'ฝากขาย') serviceClass += ' queue-chan-ddproperty';
          else if (item.serviceType === 'ฝากเช่า') serviceClass += ' queue-chan-livinginsider';
          else serviceClass += ' queue-chan-ennxo';

          let statusClass = 'queue-chan-badge';
          if (item.status === 'ใหม่') statusClass += ' queue-chan-ddproperty';
          else if (item.status === 'รอดำเนินการ') statusClass += ' queue-chan-zmyhome';
          else if (item.status === 'ติดต่อแล้ว') statusClass += ' queue-chan-livinginsider';
          else if (item.status === 'สำเร็จ') statusClass += ' queue-chan-fazwaz';

          const photoHtml = item.photoLink 
            ? `<a href="${item.photoLink}" target="_blank" class="btn btn-outline" style="padding:4px 8px;font-size:11px;min-height:auto;gap:3px;margin-top:6px;display:inline-flex;">🔗 เปิดลิงก์รูปภาพ</a>`
            : '';

          return `
            <div class="m-card" style="position:relative;border:1px solid var(--border);border-radius:12px;padding:14px;margin-bottom:10px;background:var(--dark2);">
              <div style="display:flex;justify-content:between;align-items:center;margin-bottom:8px;gap:8px;">
                <span class="${serviceClass}" style="padding:2px 8px;border-radius:4px;color:#fff;font-size:11px;font-weight:700;">${item.serviceType}</span>
                <span class="${statusClass}" style="padding:2px 8px;border-radius:4px;color:#fff;font-size:11px;font-weight:700;margin-left:auto;">${item.status || 'ใหม่'}</span>
              </div>
              <div style="font-size:15px;font-weight:800;color:var(--text);margin-bottom:4px;">${escapeHtml(item.propertyName)}</div>
              <div style="font-size:12px;color:var(--text3);margin-bottom:8px;">📍 ${escapeHtml(item.location)}</div>
              
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:12px;background:var(--dark3);padding:8px;border-radius:6px;margin-bottom:10px;">
                <div>ประเภท: <span style="font-weight:600;color:var(--text);">${item.propertyType || '-'}</span></div>
                <div>ราคา: <span style="font-weight:700;color:var(--gold);">${item.price || '-'}</span></div>
                <div>ขนาด: <span style="font-weight:600;color:var(--text);">${item.size || '-'}</span></div>
                <div>รายละเอียด: <span style="color:var(--text2);">${item.details || '-'}</span></div>
              </div>

              <div style="font-size:12px;border-top:1px solid var(--border2);padding-top:8px;margin-bottom:10px;">
                <div style="font-weight:700;color:var(--text2);">ผู้ฝาก: ${escapeHtml(item.senderName)}</div>
                <div style="color:var(--text3);margin-top:2px;">📞 ${escapeHtml(item.contact)}</div>
                ${item.note ? `<div style="font-size:11px;color:var(--gold);margin-top:4px;font-style:italic;">💬 ${escapeHtml(item.note)}</div>` : ''}
                ${photoHtml}
              </div>

              <div style="display:flex;gap:6px;justify-content:end;border-top:1px solid var(--border2);padding-top:8px;">
                <button class="btn btn-primary" onclick="convertToAsset(${idx})" style="padding:6px 10px;font-size:12px;background:var(--gold)!important;color:#1a1208!important;font-weight:700;min-height:auto;">⚡ สร้างทรัพย์</button>
                <button class="btn btn-outline" onclick="editConsignment(${idx})" style="padding:6px 10px;font-size:12px;min-height:auto;">✏️ แก้ไข</button>
                <button class="btn btn-outline" onclick="deleteConsignment(${idx})" style="padding:6px 10px;font-size:12px;min-height:auto;color:var(--red);border-color:rgba(224,80,80,0.2);">🗑️ ลบ</button>
              </div>
            </div>
          `;
        }).join('');
      }
    }
  }

  // ============================
  // OPEN & EDIT MODAL
  // ============================
  function openConsignmentAddModal() {
    _editingConsignId = null;

    // Reset all fields
    document.getElementById('cs_serviceType').value = 'ฝากขาย';
    document.getElementById('cs_propertyType').value = 'คอนโด';
    document.getElementById('cs_propertyName').value = '';
    document.getElementById('cs_location').value = '';
    document.getElementById('cs_price').value = '';
    document.getElementById('cs_size').value = '';
    document.getElementById('cs_details').value = '';
    document.getElementById('cs_senderName').value = '';
    document.getElementById('cs_contact').value = '';
    document.getElementById('cs_photoLink').value = '';
    document.getElementById('cs_status').value = 'ใหม่';
    document.getElementById('cs_note').value = '';

    document.getElementById('modalConsignmentTitle').textContent = '📝 เพิ่มรายการฝากขาย/จำนอง';
    document.getElementById('modalConsignment').classList.add('open');
  }

  function editConsignment(idx) {
    const cs = _activeConsignmentsList[idx];
    if (!cs) return;

    _editingConsignId = cs.id;

    // Fill Modal Inputs
    document.getElementById('cs_serviceType').value = cs.serviceType || 'ฝากขาย';
    document.getElementById('cs_propertyType').value = cs.propertyType || 'คอนโด';
    document.getElementById('cs_propertyName').value = cs.propertyName || '';
    document.getElementById('cs_location').value = cs.location || '';
    document.getElementById('cs_price').value = cs.price || '';
    document.getElementById('cs_size').value = cs.size || '';
    document.getElementById('cs_details').value = cs.details || '';
    document.getElementById('cs_senderName').value = cs.senderName || '';
    document.getElementById('cs_contact').value = cs.contact || '';
    document.getElementById('cs_photoLink').value = cs.photoLink || '';
    document.getElementById('cs_status').value = cs.status || 'ใหม่';
    document.getElementById('cs_note').value = cs.note || '';

    // Set Modal Title
    document.getElementById('modalConsignmentTitle').textContent = '📝 แก้ไขรายการฝากขาย/จำนอง';

    // Open Modal
    document.getElementById('modalConsignment').classList.add('open');
  }

  // ============================
  // SAVE CONSIGNMENT
  // ============================
  async function saveConsignment() {
    const isNew = !_editingConsignId;
    const docId = _editingConsignId || (Date.now().toString(36) + Math.random().toString(36).slice(2, 7));

    const propertyName = document.getElementById('cs_propertyName').value.trim();
    const location = document.getElementById('cs_location').value.trim();
    const price = document.getElementById('cs_price').value.trim();
    const senderName = document.getElementById('cs_senderName').value.trim();
    const contact = document.getElementById('cs_contact').value.trim();

    if (!propertyName || !location || !price || !senderName || !contact) {
      alert('❌ กรุณากรอกข้อมูลในช่องที่จำเป็น (*) ให้ครบถ้วน');
      return;
    }

    const updatedData = {
      id: docId,
      serviceType: document.getElementById('cs_serviceType').value,
      propertyType: document.getElementById('cs_propertyType').value,
      propertyName: propertyName,
      location: location,
      price: price,
      size: document.getElementById('cs_size').value.trim(),
      details: document.getElementById('cs_details').value.trim(),
      senderName: senderName,
      contact: contact,
      photoLink: document.getElementById('cs_photoLink').value.trim(),
      status: document.getElementById('cs_status').value,
      note: document.getElementById('cs_note').value.trim(),
      createdAt: isNew ? new Date().toISOString() : (_activeConsignmentsList.find(c => c.id === _editingConsignId)?.createdAt || new Date().toISOString())
    };

    try {
      await saveItem('consignments', updatedData, docId);
      
      // Fallback manual local update
      if (isNew) {
        if (!DB.consignments) DB.consignments = [];
        DB.consignments.push(updatedData);
      } else {
        const localIdx = DB.consignments.findIndex(c => c.id === _editingConsignId);
        if (localIdx >= 0) DB.consignments[localIdx] = updatedData;
      }
      saveTolocalStorage();
      
      closeModal('consignment');
      renderConsignments();
      showToast(isNew ? '💾 เพิ่มรายการฝากขายเรียบร้อยแล้ว' : '💾 บันทึกการแก้ไขข้อมูลฝากเรียบร้อยแล้ว');
    } catch (err) {
      alert('❌ บันทึกไม่สำเร็จ: ' + err.message);
    }
  }

  // ============================
  // DELETE CONSIGNMENT
  // ============================
  async function deleteConsignment(idx) {
    const cs = _activeConsignmentsList[idx];
    if (!cs) return;

    if (!confirm(`⚠️ ยืนยันการลบรายการฝากของ "${cs.propertyName}" ของผู้ฝาก "${cs.senderName}"?\nการลบนี้จะไม่สามารถยกเลิกได้`)) return;

    try {
      await deleteItemFromDB('consignments', cs.id);
      
      // Fallback manual local filter
      DB.consignments = DB.consignments.filter(c => c.id !== cs.id);
      saveTolocalStorage();
      
      renderConsignments();
      showToast('🗑️ ลบรายการฝากเรียบร้อยแล้ว');
    } catch (err) {
      alert('❌ ลบไม่สำเร็จ: ' + err.message);
    }
  }

  // ============================
  // CONVERT CONSIGNMENT TO ACTIVE ASSET
  // ============================
  function convertToAsset(idx) {
    const cs = _activeConsignmentsList[idx];
    if (!cs) return;

    // 1. Open the Asset Creation Modal (Clears fields)
    openModal('asset');

    // 2. Override fields with consignment data
    document.getElementById('a_name').value = cs.propertyName || '';
    document.getElementById('a_location').value = cs.location || '';
    document.getElementById('a_price').value = cs.price || '';
    document.getElementById('a_area').value = cs.size || '';
    document.getElementById('a_roomtype').value = cs.details || '';
    
    // Map serviceType to status
    if (cs.serviceType === 'ฝากเช่า') {
      document.getElementById('a_status').value = 'เช่า';
    } else {
      document.getElementById('a_status').value = 'ขาย';
    }

    // Map propertyType
    const propTypes = ['คอนโด', 'บ้านเดี่ยว', 'ทาวน์โฮม', 'ที่ดิน', 'อาคารพาณิชย์', 'อื่นๆ'];
    if (propTypes.includes(cs.propertyType)) {
      document.getElementById('a_type').value = cs.propertyType;
    } else {
      document.getElementById('a_type').value = 'อื่นๆ';
    }

    const linkPicEl = document.getElementById('a_linkpic');
    if (linkPicEl) {
      linkPicEl.value = cs.photoLink || '';
      linkPicEl.dispatchEvent(new Event('input'));
    }
    document.getElementById('a_contact').value = `ผู้ฝาก: คุณ${cs.senderName || '-'} (ช่องทางติดต่อ: ${cs.contact || '-'})`;
    
    const formattedNote = `[ข้อมูลฝากขายต้นทาง: ${cs.serviceType}]
รายละเอียดเพิ่มเติม: ${cs.details || '-'}
หมายเหตุผู้ฝาก: ${cs.note || '-'}`;
    document.getElementById('a_note').value = formattedNote;

    // Set today as postdate
    const todayStr = new Date().toISOString().slice(0, 10);
    document.getElementById('a_postdate').value = todayStr;
    document.getElementById('a_updatedate').value = todayStr;

    // Highlight that this is derived
    document.getElementById('modalAssetTitle').innerHTML = `🏠 เพิ่มทรัพย์สิน <span style="color:var(--gold); font-size:13px; font-weight:normal;">(ดึงจากข้อมูลฝากขาย/จำนอง)</span>`;

    showToast('⚡ ดึงข้อมูลฝากขายมาเรียบร้อยแล้ว! กรุณาตรวจสอบก่อนกดบันทึก');
  }

  // ============================
  // HTML ESCAPER
  // ============================
  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, "&amp;")
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;")
              .replace(/"/g, "&quot;")
              .replace(/'/g, "&#039;");
  }

  function filterConsignByStatus(status) {
    const statusSelect = document.getElementById('filterConsignStatus');
    if (statusSelect) {
      statusSelect.value = status;
      renderConsignments();
    }
  }

  // Expose to window context
  window.renderConsignments = renderConsignments;
  window.openConsignmentAddModal = openConsignmentAddModal;
  window.editConsignment = editConsignment;
  window.saveConsignment = saveConsignment;
  window.deleteConsignment = deleteConsignment;
  window.convertToAsset = convertToAsset;
  window.filterConsignByStatus = filterConsignByStatus;

})();
