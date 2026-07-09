    function renderStats() {
      const s = DB.assets;

      // นับจำนวนทรัพย์สินที่จอง
      const reservedAssets = s.filter(a => a.listingActive === 'reserved');

      // นับทรัพย์สินที่ใกล้ครบรอบ (7 วันหรือน้อยกว่า)
      const today = new Date();
      const upcomingExpiry = reservedAssets.filter(a => {
        if (!a.reservationEndDate) return false;
        const endDate = new Date(a.reservationEndDate);
        const daysLeft = Math.ceil((endDate - today) / (1000 * 60 * 60 * 24));
        return daysLeft >= 0 && daysLeft <= 7;
      });

      // นับทรัพย์สินที่ครบรอบแล้ว
      const expiredReservations = reservedAssets.filter(a => {
        if (!a.reservationEndDate) return false;
        const endDate = new Date(a.reservationEndDate);
        const daysLeft = Math.ceil((endDate - today) / (1000 * 60 * 60 * 24));
        return daysLeft < 0;
      });

      document.getElementById('assetStats').innerHTML = `
    <div class="stat-box"><div class="num">${s.length}</div><div class="lbl">ทรัพย์สินทั้งหมด</div></div>
    <div class="stat-box"><div class="num">${s.filter(a => a.status && a.status.includes('ขาย')).length}</div><div class="lbl">ขาย</div></div>
    <div class="stat-box"><div class="num">${s.filter(a => a.status && a.status.includes('เช่า')).length}</div><div class="lbl">เช่า</div></div>
    <div class="stat-box"><div class="num">${s.filter(a => a.type === 'คอนโด').length}</div><div class="lbl">คอนโด</div></div>
    <div class="stat-box" style="${reservedAssets.length > 0 ? 'background:rgba(201,168,76,0.1);border-color:var(--gold);' : ''}"><div class="num" style="color:var(--gold);">${reservedAssets.length}</div><div class="lbl">📌 จอง</div></div>
    ${upcomingExpiry.length > 0 ? `<div class="stat-box" style="background:rgba(201,168,76,0.15);border-color:var(--gold);cursor:pointer;" onclick="showReservationAlerts()"><div class="num" style="color:var(--gold);">${upcomingExpiry.length}</div><div class="lbl">⚠️ ใกล้ครบรอบ</div></div>` : ''}
    ${expiredReservations.length > 0 ? `<div class="stat-box" style="background:rgba(224,80,80,0.15);border-color:var(--red);cursor:pointer;" onclick="showReservationAlerts()"><div class="num" style="color:var(--red);">${expiredReservations.length}</div><div class="lbl">🚨 ครบรอบแล้ว</div></div>` : ''}
  `;
    }

    // แสดงรายการแจ้งเตือนการจอง
    function showReservationAlerts() {
      const s = DB.assets;
      const reservedAssets = s.filter(a => a.listingActive === 'reserved');
      const today = new Date();

      const alerts = reservedAssets.map(a => {
        if (!a.reservationEndDate) return null;
        const endDate = new Date(a.reservationEndDate);
        const daysLeft = Math.ceil((endDate - today) / (1000 * 60 * 60 * 24));

        if (daysLeft < 0) {
          return { asset: a, daysLeft, status: 'expired', message: '🚨 ครบรอบแล้ว' };
        } else if (daysLeft <= 7) {
          return { asset: a, daysLeft, status: 'warning', message: `⚠️ ครบรอบในอีก ${daysLeft} วัน` };
        }
        return null;
      }).filter(x => x !== null);

      if (alerts.length === 0) {
        alert('ไม่มีการจองที่ใกล้ครบรอบหรือครบรอบแล้ว');
        return;
      }

      let message = '🔔 การแจ้งเตือนการจอง\n\n';
      alerts.forEach(alert => {
        const color = alert.status === 'expired' ? '🔴' : '🟡';
        message += `${color} ${alert.asset.name}\n`;
        message += `   ${alert.message}\n`;
        message += `   วันครบรอบ: ${new Date(alert.asset.reservationEndDate).toLocaleDateString('th-TH')}\n\n`;
      });

      alert(message);
    }

    function toggleReservationFields() {
      const reservedRadio = document.getElementById('a_active_reserved');
      const soldRadio = document.getElementById('a_active_sold');
      const reservationFields = document.getElementById('reservationFields');
      const closedDealTypeFields = document.getElementById('closedDealTypeFields');
      const rentContractFields = document.getElementById('rentContractFields');
      const dealRentedRadio = document.getElementById('a_deal_rented');

      // Hide all by default
      if (reservationFields) reservationFields.style.display = 'none';
      if (closedDealTypeFields) closedDealTypeFields.style.display = 'none';
      if (rentContractFields) rentContractFields.style.display = 'none';

      if (reservedRadio && reservedRadio.checked) {
        if (reservationFields) reservationFields.style.display = 'block';
      } else if (soldRadio && soldRadio.checked) {
        if (closedDealTypeFields) closedDealTypeFields.style.display = 'block';
        if (dealRentedRadio && dealRentedRadio.checked) {
          if (rentContractFields) rentContractFields.style.display = 'block';
        }
      }
    }

    // Calculate reservation end date (UTC-safe)
    function calculateReservationEnd() {
      const startDateEl = document.getElementById('a_reservationDate');
      const periodEl = document.getElementById('a_reservationPeriod');
      const endDateEl = document.getElementById('a_reservationEndDate');

      if (!startDateEl || !periodEl || !endDateEl) return;

      const startDate = startDateEl.value;
      const periodDays = parseInt(periodEl.value);

      if (startDate && periodDays) {
        const parts = startDate.split('-');
        const end = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
        end.setUTCDate(end.getUTCDate() + periodDays);
        endDateEl.value = end.toISOString().slice(0, 10);
      } else {
        endDateEl.value = '';
      }
    }

    // Calculate rent end date (UTC-safe)
    function calculateRentEnd() {
      const startDateEl = document.getElementById('a_rentStartDate');
      const periodEl = document.getElementById('a_rentPeriod');
      const customPeriodContainer = document.getElementById('customRentPeriodContainer');
      const customPeriodEl = document.getElementById('a_rentPeriodCustom');
      const endDateEl = document.getElementById('a_rentEndDate');

      if (!startDateEl || !periodEl || !endDateEl) return;

      const startDate = startDateEl.value;
      const periodVal = periodEl.value;
      
      let months = 0;
      if (periodVal === 'custom') {
        if (customPeriodContainer) customPeriodContainer.style.display = 'block';
        months = parseInt(customPeriodEl.value) || 0;
      } else {
        if (customPeriodContainer) customPeriodContainer.style.display = 'none';
        months = parseInt(periodVal) || 0;
      }

      if (startDate && months > 0) {
        const parts = startDate.split('-');
        const end = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
        end.setUTCMonth(end.getUTCMonth() + months);
        endDateEl.value = end.toISOString().slice(0, 10);
      } else {
        endDateEl.value = '';
      }
    }

    // ===== DYNAMIC POPULATION HELPERS =====
    function populateTrainLineSelects() {
      const trainLineSelects = [
        { id: 'filterTrainLine', defaultText: '🚇 ทุกสายรถไฟฟ้า' },
        { id: 'filterCustTrainLine', defaultText: '🚇 ทุกสายรถไฟฟ้า' },
        { id: 'cu_line', defaultText: 'ไม่ระบุ' }
      ];

      trainLineSelects.forEach(selInfo => {
        const el = document.getElementById(selInfo.id);
        if (!el) return;
        
        let html = `<option value="">${selInfo.defaultText}</option>`;
        Object.keys(TRANSIT_LINES).forEach(lineName => {
          html += `<option value="${lineName}">${lineName}</option>`;
        });
        el.innerHTML = html;
      });
    }

    function populateAssetBtsSelect() {
      const selectEl = document.getElementById('a_bts');
      if (!selectEl) return;
      
      selectEl.innerHTML = '<option value="">-- เลือกสถานี --</option>';
      
      Object.keys(TRANSIT_LINES).forEach(lineName => {
        const optgroup = document.createElement('optgroup');
        optgroup.label = lineName;
        
        const uniqueStations = [...new Set(TRANSIT_LINES[lineName])];
        uniqueStations.forEach(st => {
          const opt = document.createElement('option');
          opt.value = st;
          opt.textContent = st;
          optgroup.appendChild(opt);
        });
        selectEl.appendChild(optgroup);
      });
    }

    function onTrainLineChange() {
      const line = document.getElementById('filterTrainLine').value;
      const startSel = document.getElementById('filterStartStation');
      const endSel = document.getElementById('filterEndStation');
      
      startSel.innerHTML = '<option value="">สถานีเริ่มต้น</option>';
      endSel.innerHTML = '<option value="">สถานีสิ้นสุด</option>';
      
      if (line && TRANSIT_LINES[line]) {
        startSel.disabled = false;
        endSel.disabled = false;
        TRANSIT_LINES[line].forEach(st => {
          startSel.innerHTML += `<option value="${st}">${st}</option>`;
          endSel.innerHTML += `<option value="${st}">${st}</option>`;
        });
      } else {
        startSel.disabled = true;
        endSel.disabled = true;
      }
      renderAssets();
    }

    function clearAssetFilters() {
      document.getElementById('assetSearch').value = '';
      document.getElementById('filterPriceMin').value = '';
      document.getElementById('filterPriceMax').value = '';
      document.getElementById('filterStatus').value = '';
      document.getElementById('filterListingActive').value = 'active';
      document.getElementById('filterType').value = '';
      const lineFilter = document.getElementById('filterTrainLine');
      if (lineFilter) {
        lineFilter.value = '';
        onTrainLineChange();
      }
      renderAssets();
    }

    function renderAssets() {
      const q = (document.getElementById('assetSearch')?.value || '').toLowerCase();
      const st = document.getElementById('filterStatus')?.value || '';
      const ty = document.getElementById('filterType')?.value || '';
      const laFilter = document.getElementById('filterListingActive')?.value ?? 'active';
      const priceMin = parseFloat(document.getElementById('filterPriceMin')?.value) || null;
      const priceMax = parseFloat(document.getElementById('filterPriceMax')?.value) || null;
      
      const lineFilter = document.getElementById('filterTrainLine')?.value || '';
      const startFilter = document.getElementById('filterStartStation')?.value || '';
      const endFilter = document.getElementById('filterEndStation')?.value || '';

      let list = DB.assets.filter(a => {
        const mQ = !q || (a.name || '').toLowerCase().includes(q) || (a.location || '').toLowerCase().includes(q) || (a.bts || '').toLowerCase().includes(q);
        const mS = !st || a.status === st;
        const mT = !ty || (a.type || '').includes(ty);
        const la = a.listingActive || 'available';
        let mLA = true;
        if (laFilter === 'active') {
          mLA = la !== 'sold';
        } else if (laFilter === 'reserved') {
          mLA = la === 'reserved';
        } else if (laFilter === 'sold_all' || laFilter === 'sold') {
          mLA = la === 'sold';
        } else if (laFilter === 'sold_deal') {
          mLA = la === 'sold' && (a.closedDealType || 'sold') === 'sold';
        } else if (laFilter === 'rented_deal') {
          mLA = la === 'sold' && a.closedDealType === 'rented';
        }
        
        let mPrice = true;
        if (priceMin || priceMax) {
          const pNum = parseFloat((a.price || '').replace(/[^\d.]/g, ''));
          if (!isNaN(pNum)) {
            if (priceMin && pNum < priceMin) mPrice = false;
            if (priceMax && pNum > priceMax) mPrice = false;
          }
        }
        
        let mStation = true;
        if (lineFilter) {
          const stations = TRANSIT_LINES[lineFilter] || [];
          if (startFilter && endFilter) {
            const idx1 = stations.indexOf(startFilter);
            const idx2 = stations.indexOf(endFilter);
            if (idx1 !== -1 && idx2 !== -1) {
              const minIdx = Math.min(idx1, idx2);
              const maxIdx = Math.max(idx1, idx2);
              const validStations = stations.slice(minIdx, maxIdx + 1);
              mStation = validStations.includes(a.bts);
            }
          } else {
            // If line selected but not a full range, just check if asset is in that line
            mStation = stations.includes(a.bts);
          }
        }

        return mQ && mS && mT && mLA && mPrice && mStation;
      });

      // Sort: Newest first (by postdate descending, then by original array index descending)
      list.sort((x, y) => {
        const dx = parseDateVal(x.postdate);
        const dy = parseDateVal(y.postdate);
        if (dx !== dy) return dy - dx;
        return DB.assets.indexOf(y) - DB.assets.indexOf(x);
      });

      const totalPages = Math.max(1, Math.ceil(list.length / _assetPageSize));
      if (_assetPage > totalPages) _assetPage = totalPages;
      const paged = list.slice((_assetPage - 1) * _assetPageSize, _assetPage * _assetPageSize);

      // pagination bar
      _buildPager(_assetPage, totalPages, '_goAssetPage', 'assetPaginationTop');
      _buildPager(_assetPage, totalPages, '_goAssetPage', 'assetPaginationBottom');

      const cardEl = document.getElementById('assetCards');
      const tableEl = document.getElementById('assetTable');
      const tableBody = document.getElementById('assetTableBody');
      
      const effectiveView = (window.innerWidth <= 768) ? 'card' : _assetView;

      // view toggle: card vs table
      if (effectiveView === 'table' && tableEl && tableBody) {
        if (cardEl) cardEl.style.display = 'none';
        tableEl.style.display = '';
        if (!paged.length) {
          tableBody.innerHTML = '<tr><td colspan="11" style="text-align:center;padding:40px;color:var(--text3)">ไม่พบทรัพย์สินที่ตรงกับเงื่อนไข</td></tr>';
          renderStats(); return;
        }
        const canEdit = window._canEdit === true;
        const canDelete = window._canDelete === true;
        tableBody.innerHTML = paged.map(a => {
          const ri = DB.assets.indexOf(a);
          const la = a.listingActive || 'available';
          const badge = a.status === 'ขาย' ? 'badge-sale' : a.status === 'เช่า' ? 'badge-rent' : 'badge-both';
          
          let laBadge = '✅';
          if (la === 'sold') {
            laBadge = a.closedDealType === 'rented' ? '🔑' : '🔴';
          } else if (la === 'reserved') {
            laBadge = '⏳';
          }
          
          let daysAlert = '';
          if (la === 'reserved' && a.reservationEndDate) {
            const dl = Math.ceil((new Date(a.reservationEndDate) - new Date()) / (864e5));
            if (dl <= 0) daysAlert = '<span style="color:var(--red);font-size:11px;font-weight:700;">🚨ครบรอบ</span>';
            else if (dl <= 7) daysAlert = `<span style="color:var(--gold);font-size:11px;font-weight:700;">⚠️${dl}วัน</span>`;
          } else if (la === 'sold' && a.closedDealType === 'rented' && a.rentEndDate) {
            const dl = Math.ceil((new Date(a.rentEndDate) - new Date()) / (864e5));
            if (dl <= 0) daysAlert = '<span style="color:var(--red);font-size:11px;font-weight:700;">🚨หมดสัญญา</span>';
            else if (dl <= 30) daysAlert = `<span style="color:var(--gold);font-size:11px;font-weight:700;">⚠️หมดสัญญา(${dl}วัน)</span>`;
          }
          const isOwner = (typeof window._canEditAsset === 'function') ? window._canEditAsset(a) : false;
          const ownerBadge = isOwner ? '' : '<span style="font-size:10px;color:var(--text3);" title="โพสต์โดยผู้อื่น">🔒</span>';
          const hasEditPermission = isOwner || canEdit;

          const careContract = a.careContract || 'ยังไม่ทำ';
          const careRepair = a.careRepair || 'ไม่มี';
          const careRent = a.careRent || 'ยังไม่เก็บ';
          
          const contractBadge = careContract === 'เสร็จสิ้น' ? '<span style="color:var(--green);font-weight:700;">สัญญา:เสร็จ</span>' :
                               careContract === 'ดำเนินการ' ? '<span style="color:var(--gold);font-weight:700;">สัญญา:ทำอยู่</span>' :
                               '<span style="color:var(--text3);">สัญญา:ยังไม่ทำ</span>';
                               
          const repairBadge = careRepair === 'เสร็จสิ้น' ? '<span style="color:var(--green);font-weight:700;">ซ่อม:เสร็จ</span>' :
                             careRepair === 'ดำเนินการ' ? '<span style="color:var(--gold);font-weight:700;">ซ่อม:ทำอยู่</span>' :
                             '<span style="color:var(--text3);">ซ่อม:ไม่มี</span>';
                             
          const rentBadge = careRent === 'เสร็จสิ้น' ? '<span style="color:var(--green);font-weight:700;">ค่าเช่า:เสร็จ</span>' :
                           careRent === 'ดำเนินการ' ? '<span style="color:var(--gold);font-weight:700;">ค่าเช่า:เก็บอยู่</span>' :
                           '<span style="color:var(--text3);">ค่าเช่า:ยังไม่เก็บ</span>';

          const careInfo = `<div style="font-size:11px;line-height:1.4;white-space:nowrap;">
            ${contractBadge}<br>
            ${repairBadge}<br>
            ${rentBadge}
          </div>`;

          return `<tr${la === 'sold' ? ' style="opacity:0.6;"' : ''}>
            <td style="color:var(--text3)">${ri + 1}</td>
            <td style="font-weight:600">
              <div style="display:flex;align-items:center;gap:8px;">
                ${a.linkpic ? 
                  `<img src="${a.linkpic}" style="width:40px;height:30px;object-fit:cover;border-radius:4px;${hasEditPermission ? 'cursor:pointer;' : ''}" ${hasEditPermission ? `onclick="triggerCardUpload(${ri})" title="คลิกเพื่อเปลี่ยนรูปภาพ"` : 'title="รูปภาพทรัพย์สิน"'}>` : 
                  `<div style="width:40px;height:30px;background:var(--dark3);border:1px solid var(--border);border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:14px;${hasEditPermission ? 'cursor:pointer;' : ''}" ${hasEditPermission ? `onclick="triggerCardUpload(${ri})" title="คลิกเพื่ออัปโหลดรูปภาพ"` : ''}>🏢</div>`
                }
                <div>
                  ${a.name || '-'} ${daysAlert}
                </div>
              </div>
            </td>
            <td><span class="badge ${badge}">${a.status || '-'}</span> ${laBadge}</td>
            <td>${a.type || '-'}</td>
            <td style="color:var(--gold);white-space:nowrap">${a.price || '-'}</td>
            <td>${a.roomtype || '-'}</td>
            <td>${a.location || '-'}${a.bts ? `<br><small style="color:var(--blue);font-weight:600;">🚇 ${a.bts}</small>` : ''}</td>
            <td style="font-size:12px">${window._canSeeContacts ? (a.contact || '-') : '🔒 เฉพาะ Agent ที่อนุมัติแล้ว'}</td>
            <td>${a.poster || '-'} ${ownerBadge}</td>
            <td>${careInfo}</td>
            <td><div style="display:flex;gap:4px">
              ${a.linkpic ? `<a href="${a.linkpic}" target="_blank" class="btn btn-purple btn-sm" style="display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;padding:0;border-radius:8px;" title="ดูรูปภาพ">🖼️</a>` : ''}
              ${hasEditPermission ? `<button class="btn btn-outline btn-sm" onclick="triggerCardUpload(${ri})" style="display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;padding:0;border-radius:8px;border-color:var(--gold);color:var(--gold);" title="อัปโหลด/เปลี่ยนรูปภาพ">📤</button>` : ''}
              ${a.link ? `<a href="${a.link}" target="_blank" class="btn btn-outline btn-sm" style="display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;padding:0;border-radius:8px;" title="ลิงก์รายละเอียด">🔗</a>` : ''}
              <button class="btn btn-outline btn-sm" style="border-color:var(--gold);color:var(--gold);font-size:12px;padding:6px 10px;border-radius:8px;font-weight:600;" onclick="showCustomerMatchesForAsset(${ri})" title="จับคู่ลูกค้า">🤝 จับคู่</button>
              <button class="btn btn-outline btn-sm" onclick="editAsset(${ri})" style="display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;padding:0;border-radius:8px;" title="แก้ไข">✏️</button>
              ${(isOwner || canDelete) ? `<button class="btn btn-danger btn-sm" onclick="deleteItem('assets',${ri})" style="display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;padding:0;border-radius:8px;" title="ลบ">🗑️</button>` : ''}
            </div></td>
          </tr>`;
        }).join('');
      } else {
        // CARD VIEW
        if (tableEl) tableEl.style.display = 'none';
        if (cardEl) cardEl.style.display = '';
        if (!paged.length) {
          cardEl.innerHTML = '<div class="empty"><div class="ico">🏚️</div><div>ยังไม่มีข้อมูลทรัพย์สิน</div><div style="font-size:13px;margin-top:6px;color:var(--text3)">กด "+ เพิ่มทรัพย์สิน" เพื่อเริ่มต้น</div></div>';
          renderStats(); return;
        }
        const canEdit = window._canEdit === true;
        const canDelete = window._canDelete === true;
        cardEl.innerHTML = paged.map(a => {
          const ri = DB.assets.indexOf(a);
          const badge = a.status === 'ขาย' ? 'badge-sale' : a.status === 'เช่า' ? 'badge-rent' : 'badge-both';
          const la = a.listingActive || 'available';
          
          let laBadge = '';
          if (la === 'sold') {
            if (a.closedDealType === 'rented') {
              laBadge = '<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;background:rgba(80,200,120,0.15);color:var(--green);margin-left:4px;">🔑 เช่าแล้ว</span>';
            } else {
              laBadge = '<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;background:rgba(224,80,80,0.15);color:var(--red);margin-left:4px;">🔴 ขายแล้ว</span>';
            }
          } else if (la === 'reserved') {
            laBadge = '<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;background:rgba(201,168,76,0.15);color:var(--gold);margin-left:4px;">⏳ จอง</span>';
          }

          let reservationAlert = '';
          if (la === 'reserved' && a.reservationEndDate) {
            const dl = Math.ceil((new Date(a.reservationEndDate) - new Date()) / (864e5));
            if (dl <= 0) reservationAlert = '<div style="background:rgba(224,80,80,0.1);border:1px solid var(--red);border-radius:8px;padding:8px 12px;margin-top:8px;font-size:12px;color:var(--red);font-weight:600;">🚨 ครบรอบการจองแล้ว!</div>';
            else if (dl <= 7) reservationAlert = `<div style="background:rgba(201,168,76,0.1);border:1px solid var(--gold);border-radius:8px;padding:8px 12px;margin-top:8px;font-size:12px;color:var(--gold);font-weight:600;">⚠️ ครบรอบในอีก ${dl} วัน</div>`;
          } else if (la === 'sold' && a.closedDealType === 'rented' && a.rentEndDate) {
            const dl = Math.ceil((new Date(a.rentEndDate) - new Date()) / (864e5));
            if (dl <= 0) reservationAlert = '<div style="background:rgba(224,80,80,0.1);border:1px solid var(--red);border-radius:8px;padding:8px 12px;margin-top:8px;font-size:12px;color:var(--red);font-weight:600;">🚨 สัญญาเช่าหมดอายุแล้ว!</div>';
            else if (dl <= 30) reservationAlert = `<div style="background:rgba(201,168,76,0.1);border:1px solid var(--gold);border-radius:8px;padding:8px 12px;margin-top:8px;font-size:12px;color:var(--gold);font-weight:600;">⚠️ สัญญาเช่าหมดอายุในอีก ${dl} วัน</div>`;
          }

          const isOwner = (typeof window._canEditAsset === 'function') ? window._canEditAsset(a) : false;
          const ownerBadge = isOwner ? '<span style="font-size:10px;color:var(--green);margin-left:4px;">✅ ของคุณ</span>' : '<span style="font-size:10px;color:var(--text3);margin-left:4px;">🔒</span>';
          
          let rentDateRow = '';
          if (la === 'sold' && a.closedDealType === 'rented' && a.rentEndDate) {
            try {
              const d = new Date(a.rentEndDate);
              rentDateRow = `<div class="card-row" style="font-size:12px;display:flex;justify-content:between;margin-top:4px;"><span class="label" style="color:var(--text3);">📅 หมดสัญญาเช่า</span><span class="value" style="color:var(--green);font-weight:600;">${d.toLocaleDateString('th-TH')}</span></div>`;
            } catch (e) {
              rentDateRow = `<div class="card-row" style="font-size:12px;display:flex;justify-content:between;margin-top:4px;"><span class="label" style="color:var(--text3);">📅 หมดสัญญาเช่า</span><span class="value" style="color:var(--green);font-weight:600;">${a.rentEndDate}</span></div>`;
            }
          }

          const canEdit = window._canEdit === true;
          const hasEditPermission = isOwner || canEdit;

          let imgHtml = '';
          if (a.linkpic) {
            imgHtml = `
              <div class="card-media" style="position:relative;height:180px;border-radius:12px 12px 0 0;overflow:hidden;background:#252528;${hasEditPermission ? 'cursor:pointer;' : ''}"
                   ${hasEditPermission ? `onclick="triggerCardUpload(${ri})"` : ''}
                   ${hasEditPermission ? 'title="คลิกเพื่ออัปโหลด/เปลี่ยนรูปภาพ"' : ''}>
                <img src="${a.linkpic}" alt="${a.name}" style="width:100%;height:100%;object-fit:cover;transition:transform 0.3s ease;">
                ${hasEditPermission ? `
                <div class="media-overlay" style="position:absolute;inset:0;background:rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity 0.2s;color:#fff;font-size:13px;font-weight:600;gap:6px;">
                  📷 เปลี่ยนรูปภาพ
                </div>` : ''}
                <div style="position:absolute;top:10px;left:10px;display:flex;gap:4px;flex-wrap:wrap;z-index:2;">
                  <span class="badge ${badge}" style="box-shadow: 0 4px 10px rgba(0,0,0,0.3);">${a.status || ''}</span>
                  ${laBadge}
                </div>
              </div>
            `;
          } else {
            imgHtml = `
              <div class="card-media" style="position:relative;height:140px;border-radius:12px 12px 0 0;overflow:hidden;
                          background:linear-gradient(135deg, var(--dark2), var(--dark3));display:flex;align-items:center;justify-content:center;color:var(--text3);${hasEditPermission ? 'cursor:pointer;' : ''}"
                   ${hasEditPermission ? `onclick="triggerCardUpload(${ri})"` : ''}
                   ${hasEditPermission ? 'title="คลิกเพื่ออัปโหลดรูปภาพ"' : ''}>
                <div style="text-align:center;">
                  <span style="font-size:42px;display:block;margin-bottom:6px;filter:grayscale(0.2);">🏢</span>
                  <span style="font-size:11px;letter-spacing:1px;color:var(--text3);text-transform:uppercase;">${hasEditPermission ? '📷 คลิกเพื่ออัปโหลดรูปภาพ' : 'Benz Home Premium'}</span>
                </div>
                <div style="position:absolute;top:10px;left:10px;display:flex;gap:4px;flex-wrap:wrap;">
                  <span class="badge ${badge}" style="box-shadow: 0 4px 10px rgba(0,0,0,0.3);">${a.status || ''}</span>
                  ${laBadge}
                </div>
              </div>
            `;
          }

          return `
            <div class="card premium-asset-card" style="display:flex;flex-direction:column;border-radius:12px;background:var(--dark2);border:1px solid var(--border);transition:transform 0.2s, box-shadow 0.2s;overflow:hidden;${la === 'sold' ? 'opacity:0.6;' : ''}">
              ${imgHtml}
              <div class="card-body" style="padding:16px;flex:1;display:flex;flex-direction:column;gap:12px;">
                <div>
                  <div style="font-size:13px;color:var(--text3);font-weight:600;margin-bottom:2px;">${a.type || 'ไม่ระบุประเภท'}</div>
                  <h3 class="card-title" style="font-size:17px;font-weight:700;color:var(--text);margin:0;line-height:1.4;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${a.name || '(ไม่มีชื่อ)'}</h3>
                </div>
                
                <div style="display:flex;align-items:baseline;gap:6px;">
                  <span style="font-size:12px;color:var(--text3);">เริ่มต้น</span>
                  <span class="price-tag" style="font-size:22px;font-weight:800;color:var(--gold);line-height:1;">${a.price || '-'}</span>
                </div>

                <div style="display:grid;grid-template-columns:repeat(2, 1fr);gap:8px;font-size:13px;border-top:1px solid var(--border);border-bottom:1px solid var(--border);padding:8px 0;color:var(--text2);">
                  <div style="display:flex;align-items:center;gap:6px;">
                    <span>🛌</span>
                    <span style="font-weight:500;">${a.roomtype || 'สตูดิโอ'}</span>
                  </div>
                  <div style="display:flex;align-items:center;gap:6px;">
                    <span>📐</span>
                    <span style="font-weight:500;">${a.area || '-'}</span>
                  </div>
                  <div style="display:flex;align-items:center;gap:6px;">
                    <span>🏗️</span>
                    <span style="font-weight:500;">ชั้น ${a.floor || '-'}</span>
                  </div>
                  <div style="display:flex;align-items:center;gap:6px;">
                    <span>🚇</span>
                    <span style="font-weight:500;color:var(--blue);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${a.bts || 'ไม่ระบุสถานี'}</span>
                  </div>
                </div>

                <div style="font-size:13px;display:flex;flex-direction:column;gap:4px;">
                  <div style="display:flex;justify-content:between;align-items:center;gap:8px;">
                    <span style="color:var(--text3);flex-shrink:0;">📍 ทำเล</span>
                    <span style="color:var(--text2);text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;">${a.location || '-'}</span>
                  </div>
                  <div style="display:flex;justify-content:between;align-items:center;gap:8px;">
                    <span style="color:var(--text3);flex-shrink:0;">📞 ติดต่อ</span>
                    <span style="color:var(--text2);font-weight:600;text-align:right;flex:1;">${window._canSeeContacts ? a.contact : '🔒 เฉพาะ Agent ที่อนุมัติแล้ว'}</span>
                  </div>
                  ${(a.coagent && window._canSeeCoAgents) ? `
                  <div style="display:flex;justify-content:between;align-items:center;gap:8px;">
                    <span style="color:var(--text3);flex-shrink:0;">🤝 Co-Agent</span>
                    <span style="color:var(--gold);font-weight:700;text-align:right;flex:1;">รับ (${a.coagentshare || 40}%)</span>
                  </div>` : ''}
                  ${a.poster ? `
                  <div style="display:flex;justify-content:between;align-items:center;gap:8px;">
                    <span style="color:var(--text3);flex-shrink:0;">👤 โพสต์โดย</span>
                    <span style="color:var(--text2);text-align:right;flex:1;">${a.poster} ${ownerBadge}</span>
                  </div>` : ''}
                </div>

                <div style="border-top:1px dashed var(--border);padding-top:8px;font-size:12px;margin-top:auto;">
                  <div style="font-weight:700;color:var(--gold);margin-bottom:6px;">🛠️ สถานะดูแลหลังปิดดีล</div>
                  <div style="display:flex;gap:6px;flex-wrap:wrap;">
                    <span class="care-badge care-${(a.careContract || 'ยังไม่ทำ') === 'เสร็จสิ้น' ? 'green' : (a.careContract || 'ยังไม่ทำ') === 'ดำเนินการ' ? 'gold' : 'grey'}">สัญญา: ${a.careContract || 'ยังไม่ทำ'}</span>
                    <span class="care-badge care-${(a.careRepair || 'ไม่มี') === 'เสร็จสิ้น' ? 'green' : (a.careRepair || 'ไม่มี') === 'ดำเนินการ' ? 'gold' : 'grey'}">ซ่อม: ${a.careRepair || 'ไม่มี'}</span>
                    <span class="care-badge care-${(a.careRent || 'ยังไม่เก็บ') === 'เสร็จสิ้น' ? 'green' : (a.careRent || 'ยังไม่เก็บ') === 'ดำเนินการ' ? 'gold' : 'grey'}">ค่าเช่า: ${a.careRent || 'ยังไม่เก็บ'}</span>
                  </div>
                </div>
                ${la === 'reserved' && a.reservationEndDate ? `<div class="card-row" style="font-size:12px;display:flex;justify-content:between;margin-top:4px;"><span class="label" style="color:var(--text3);">🔔 ครบรอบจอง</span><span class="value" style="color:var(--gold);font-weight:600;">${new Date(a.reservationEndDate).toLocaleDateString('th-TH')}</span></div>` : ''}
                ${rentDateRow}
                ${reservationAlert}
              </div>
              <div class="card-footer" style="padding:12px 16px;background:var(--dark3);border-top:1px solid var(--border);display:flex;gap:6px;flex-wrap:wrap;justify-content:end;align-items:center;">
                ${a.linkpic ? `<a href="${a.linkpic}" target="_blank" class="btn btn-purple btn-sm" style="display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;padding:0;border-radius:8px;" title="ดูรูปภาพ">🖼️</a>` : ''}
                ${hasEditPermission ? `<button class="btn btn-outline btn-sm" onclick="triggerCardUpload(${ri})" style="display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;padding:0;border-radius:8px;border-color:var(--gold);color:var(--gold);" title="อัปโหลด/เปลี่ยนรูปภาพ">📤</button>` : ''}
                ${a.link ? `<a href="${a.link}" target="_blank" class="btn btn-outline btn-sm" style="display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;padding:0;border-radius:8px;" title="ลิงก์รายละเอียด">🔗</a>` : ''}
                ${a.map ? `<a href="${a.map}" target="_blank" class="btn btn-outline btn-sm" style="display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;padding:0;border-radius:8px;" title="พิกัดแผนที่">📍</a>` : ''}
                <button class="btn btn-blue btn-sm" onclick="quickClip(${ri})" style="font-size:12px;padding:6px 10px;border-radius:8px;font-weight:600;">📋 คัดลอก</button>
                <button class="btn btn-outline btn-sm" style="border-color:var(--gold);color:var(--gold);font-size:12px;padding:6px 10px;border-radius:8px;font-weight:600;" onclick="showCustomerMatchesForAsset(${ri})">🤝 จับคู่</button>
                <button class="btn btn-outline btn-sm" onclick="editAsset(${ri})" style="display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;padding:0;border-radius:8px;" title="แก้ไข">✏️</button>
                ${(isOwner || canDelete) ? `<button class="btn btn-danger btn-sm" onclick="deleteItem('assets',${ri})" style="display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;padding:0;border-radius:8px;" title="ลบ">🗑️</button>` : ''}
              </div>
            </div>
          `;
        }).join('');
      }
      renderStats();
    }


    function editAsset(i) {
      const a = DB.assets[i];
      // ตรวจสอบสิทธิ์: เฉพาะเจ้าของโพสต์หรือ admin เท่านั้นถึงจะแก้ไขได้
      if (!window._canEditAsset(a)) {
        alert('🔒 ขออภัยค่ะ คุณไม่มีสิทธิ์แก้ไขทรัพย์สินนี้เนื่องจากถูกโพสต์โดยเอเจนต์ท่านอื่น (สิทธิ์การแก้ไขเฉพาะผู้ดูแลระบบหรือเจ้าของโพสต์เท่านั้นค่ะ)\n\nโพสต์โดย: ' + (a.poster || 'ไม่ระบุ'));
        return;
      }
      document.getElementById('modalAssetTitle').textContent = '✏️ แก้ไขทรัพย์สิน';
      setV('a_name', a.name); setV('a_location', a.location); setV('a_bts', a.bts); setV('a_status', a.status); setV('a_type', a.type);
      setV('a_price', a.price); setV('a_roomtype', a.roomtype); setV('a_area', a.area); setV('a_floor', a.floor);
      setV('a_link', a.link); setV('a_map', a.map); setV('a_linkpic', a.linkpic); setV('a_postdate', a.postdate); setV('a_updatedate', a.updatedate);
      
      // โหลดพรีวิวรูปภาพ
      const previewContainer = document.getElementById('a_pic_preview_container');
      const previewImg = document.getElementById('a_pic_preview');
      if (previewContainer && previewImg) {
        if (a.linkpic) {
          previewImg.src = a.linkpic;
          previewContainer.style.display = 'block';
        } else {
          previewImg.src = '';
          previewContainer.style.display = 'none';
        }
      }
      
      setV('a_contact', a.contact); setV('a_note', a.note);
      const isCoagent = a.coagent !== false;
      document.getElementById('a_coagent').checked = isCoagent;
      document.getElementById('a_coagent_controls').style.display = isCoagent ? 'flex' : 'none';
      const shareVal = a.coagentshare !== undefined ? a.coagentshare : 40;
      setV('a_coagentshare', shareVal);
      if (typeof window.syncCoagentSplitUI === 'function') {
        window.syncCoagentSplitUI(shareVal);
      }
      populatePosterSelect(a.poster || '');
      setV('a_careContract', a.careContract || 'ยังไม่ทำ');
      setV('a_careRepair', a.careRepair || 'ไม่มี');
      setV('a_careRent', a.careRent || 'ยังไม่เก็บ');

      // set listing active radio
      const la = a.listingActive || 'available';
      const laEl = document.getElementById('a_active_' + la);
      if (laEl) laEl.checked = true; else document.getElementById('a_active_available').checked = true;

      // โหลดข้อมูลการจอง (ถ้ามี)
      if (a.reservationDate) setV('a_reservationDate', a.reservationDate);
      if (a.reservationPeriod) setV('a_reservationPeriod', a.reservationPeriod);
      if (a.reservationEndDate) setV('a_reservationEndDate', a.reservationEndDate);

      // โหลดข้อมูลการปิดดีลเช่า (ถ้ามี)
      const cdt = a.closedDealType || 'sold';
      const cdtEl = document.getElementById('a_deal_' + cdt);
      if (cdtEl) cdtEl.checked = true; else document.getElementById('a_deal_sold').checked = true;

      setV('a_rentStartDate', a.rentStartDate || '');
      setV('a_rentPeriod', a.rentPeriod || '');
      setV('a_rentPeriodCustom', a.rentPeriodCustom || '');
      setV('a_rentEndDate', a.rentEndDate || '');

      calculateRentEnd();
      toggleReservationFields();

      editMode = { type: 'asset', idx: i };
      document.getElementById('modalAsset').classList.add('open');
    }

    function triggerCardUpload(idx) {
      const a = DB.assets[idx];
      if (!window._canEditAsset(a)) {
        alert('🔒 ขออภัยค่ะ คุณไม่มีสิทธิ์แก้ไขทรัพย์สินนี้เนื่องจากถูกโพสต์โดยเอเจนต์ท่านอื่น (สิทธิ์การแก้ไขเฉพาะผู้ดูแลระบบหรือเจ้าของโพสต์เท่านั้นค่ะ)\n\nโพสต์โดย: ' + (a.poster || 'ไม่ระบุ'));
        return;
      }

      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = function(e) {
        const file = e.target.files[0];
        if (!file) return;

        showToast('⏳ กำลังประมวลผลรูปภาพ...', 'var(--gold)');

        window.compressImage(file, 800, 800, 0.7, async function(base64Url) {
          a.linkpic = base64Url;
          
          try {
            await saveItem('assets', a, a.id);
            if (!window._realtimeSyncActive) {
              DB.assets[idx] = a;
              saveTolocalStorage();
              renderAssets();
            }
            showToast('✅ อัปโหลดรูปภาพสำเร็จ!', 'var(--green)');
          } catch (err) {
            console.error(err);
            showToast('❌ อัปโหลดผิดพลาด: ' + err.message, 'var(--red)');
          }
        });
      };
      input.click();
    }
    window.triggerCardUpload = triggerCardUpload;
