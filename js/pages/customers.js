    // ============================
    // ASSETS
    // ============================
    // ---- state ----
    let _assetPage = 1;
    const _assetPageSize = 20;
    let _assetView = 'card'; // 'card' | 'table'
    let _custPage = 1;
    const _custPageSize = 20;
    let _custView = 'table'; // 'table' | 'card'

    function clearPriceFilter() {
      document.getElementById('filterPriceMin').value = '';
      document.getElementById('filterPriceMax').value = '';
      _assetPage = 1;
      renderAssets();
    }
    function onCustTrainLineChange() {
      const line = document.getElementById('filterCustTrainLine').value;
      const startSel = document.getElementById('filterCustStartStation');
      const endSel = document.getElementById('filterCustEndStation');
      
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
      renderCustomers();
    }

    function clearCustomerFilters() {
      const mn = document.getElementById('customerPriceMin');
      const mx = document.getElementById('customerPriceMax');
      const qs = document.getElementById('customerSearch');
      if (mn) mn.value = '';
      if (mx) mx.value = '';
      if (qs) qs.value = '';
      const lineFilter = document.getElementById('filterCustTrainLine');
      if (lineFilter) {
        lineFilter.value = '';
        onCustTrainLineChange();
      }
      _custPage = 1;
      renderCustomers();
    }

    function setCustView(v) {
      _custView = v;
      _custPage = 1;
      ['table', 'card'].forEach(x => {
        const b = document.getElementById('btnCustView' + x.charAt(0).toUpperCase() + x.slice(1));
        if (b) b.style.background = (x === v) ? 'var(--gold)' : '';
        if (b) b.style.color = (x === v) ? '#1a1208' : '';
      });
      renderCustomers();
    }

    function onCustModalTrainLineChange() {
      const line = document.getElementById('cu_line').value;
      const startSel = document.getElementById('cu_stationStart');
      const endSel = document.getElementById('cu_stationEnd');
      
      startSel.innerHTML = '<option value="">ไม่ระบุ</option>';
      endSel.innerHTML = '<option value="">ไม่ระบุ</option>';
      
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
    }

    function _buildPager(currentPage, totalPages, onPage, containerId) {
      const el = document.getElementById(containerId);
      if (!el) return;
      if (totalPages <= 1) { el.innerHTML = ''; return; }
      const maxBtn = 7;
      let pages = [];
      if (totalPages <= maxBtn) {
        for (let i = 1; i <= totalPages; i++) pages.push(i);
      } else {
        pages = [1];
        let lo = Math.max(2, currentPage - 2);
        let hi = Math.min(totalPages - 1, currentPage + 2);
        if (lo > 2) pages.push('…');
        for (let i = lo; i <= hi; i++) pages.push(i);
        if (hi < totalPages - 1) pages.push('…');
        pages.push(totalPages);
      }
      const btn = (label, page, active, disabled) =>
        `<button onclick="${disabled || typeof page !== 'number' ? '' : onPage + '(' + page + ')'}"
          style="min-width:34px;height:34px;border-radius:8px;border:1px solid ${active ? 'var(--gold)' : 'var(--border)'};
          background:${active ? 'var(--gold)' : 'var(--dark3)'};color:${active ? '#1a1208' : 'var(--text)'};
          font-weight:${active ? '700' : '400'};cursor:${disabled ? 'default' : 'pointer'};
          font-size:13px;padding:0 6px;font-family:inherit;transition:.15s;"
          ${disabled ? 'disabled' : ''}>${label}</button>`;
      el.innerHTML =
        btn('‹', currentPage - 1, false, currentPage === 1) +
        pages.map(p => typeof p === 'number' ? btn(p, p, p === currentPage, false) : `<span style="padding:0 4px;color:var(--text3)">…</span>`).join('') +
        btn('›', currentPage + 1, false, currentPage === totalPages) +
        `<span style="font-size:13px;color:var(--text3);margin-left:6px;">หน้า ${currentPage}/${totalPages} (ทั้งหมด)</span>`;
    }
    function _goAssetPage(p) { _assetPage = p; renderAssets(); }
    function _goCustPage(p) { _custPage = p; renderCustomers(); }

    // Toggle reservation fields visibility
    // ============================
    function renderCustomers() {
      const q = (document.getElementById('customerSearch')?.value || '').toLowerCase();
      const priceMin = parseFloat(document.getElementById('customerPriceMin')?.value) || null;
      const priceMax = parseFloat(document.getElementById('customerPriceMax')?.value) || null;

      const lineFilter = document.getElementById('filterCustTrainLine')?.value || '';
      const startFilter = document.getElementById('filterCustStartStation')?.value || '';
      const endFilter = document.getElementById('filterCustEndStation')?.value || '';

      let list = DB.customers.filter(a => {
        const mQ = !q || (a.name || '').toLowerCase().includes(q) || (a.contact || '').toLowerCase().includes(q) || (a.type || '').toLowerCase().includes(q);
        let mPrice = true;
        if (priceMin || priceMax) {
          const pNum = parseFloat((a.budget || '').replace(/[^\d.]/g, ''));
          if (!isNaN(pNum)) {
            if (priceMin && pNum < priceMin) mPrice = false;
            if (priceMax && pNum > priceMax) mPrice = false;
          }
        }

        let mStation = true;
        if (lineFilter) {
          if (a.line && a.line !== lineFilter) {
            mStation = false;
          } else if (a.line === lineFilter && startFilter && endFilter) {
            const stations = TRANSIT_LINES[lineFilter] || [];
            const fIdx1 = stations.indexOf(startFilter);
            const fIdx2 = stations.indexOf(endFilter);
            if (fIdx1 !== -1 && fIdx2 !== -1) {
              const fMin = Math.min(fIdx1, fIdx2);
              const fMax = Math.max(fIdx1, fIdx2);
              
              let cMin = 0, cMax = stations.length - 1; // default to whole line if customer didn't specify
              if (a.stationStart) {
                const s1 = stations.indexOf(a.stationStart);
                if (s1 !== -1) cMin = s1;
              }
              if (a.stationEnd) {
                const s2 = stations.indexOf(a.stationEnd);
                if (s2 !== -1) cMax = s2;
              }
              // Adjust cMin and cMax to be correctly ordered
              const trueCMin = Math.min(cMin, cMax);
              const trueCMax = Math.max(cMin, cMax);
              
              // Overlap check
              if (trueCMax < fMin || trueCMin > fMax) {
                mStation = false;
              }
            }
          }
        }

        return mQ && mPrice && mStation;
      });

      // Sort: Newest first (highest index in DB.customers)
      list.sort((x, y) => DB.customers.indexOf(y) - DB.customers.indexOf(x));

      const totalPages = Math.max(1, Math.ceil(list.length / _custPageSize));
      if (_custPage > totalPages) _custPage = totalPages;
      const paged = list.slice((_custPage - 1) * _custPageSize, _custPage * _custPageSize);

      _buildPager(_custPage, totalPages, '_goCustPage', 'customerPaginationTop');

      const tb = document.getElementById('customerTable');
      const ml = document.getElementById('customerMList');
      const tbWrap = document.getElementById('customerTableWrap');
      const canEdit = window._canEdit !== false;
      const canDelete = window._canDelete !== false;

      const effectiveView = (window.innerWidth <= 768) ? 'card' : _custView;

      if (effectiveView === 'card') {
        // CARD VIEW (mobile-style)
        if (tb) tb.innerHTML = '';
        if (tbWrap) tbWrap.style.display = 'none';
        if (ml) {
          ml.style.display = 'block';
          if (!paged.length) {
            ml.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text3)">ไม่พบลูกค้าที่ตรงกับเงื่อนไข</div>';
            return;
          }
          ml.innerHTML = paged.map(a => {
            const ri = DB.customers.indexOf(a);
            const badge = a.status === 'ขาย' ? 'badge-sale' : a.status === 'เช่า' ? 'badge-rent' : 'badge-both';
            return `<div class="m-card">
              <span class="m-card-num">#${ri + 1}</span>
              <div class="m-card-top">
                <div>
                  <div class="m-card-name">${a.name || '-'}</div>
                  <div class="m-card-sub">${a.type || ''}</div>
                </div>
                <span class="badge ${badge}">${a.status || '-'}</span>
              </div>
              ${a.budget ? `<div class="m-card-row"><span class="m-card-label">💰 งบ</span><span class="m-card-val gold">${a.budget}</span></div>` : ''}
              ${a.line ? `
              <div class="m-card-row">
                <span class="m-card-label">🚇 รถไฟฟ้า</span>
                <span class="m-card-val" style="font-size:13px;">
                  <span style="color:var(--gold);font-weight:600;">${a.line}</span>
                  ${a.stationStart || a.stationEnd ? `
                    <div style="font-size:12px;color:var(--text2);margin-top:2.5px;">
                      📍 ${a.stationStart || 'ไม่ระบุ'} ➡️ ${a.stationEnd || 'ไม่ระบุ'}
                    </div>
                  ` : ''}
                </span>
              </div>
              ` : ''}
              ${a.targetDate ? `<div class="m-card-row"><span class="m-card-label">📅 วันที่ต้องการ</span><span class="m-card-val" style="color:var(--gold);font-weight:600;">${a.targetDate}</span></div>` : ''}
              ${a.contact ? `<div class="m-card-row"><span class="m-card-label">📞 Contact</span><span class="m-card-val">${a.contact}</span></div>` : ''}
              ${a.note ? `<div class="m-card-row"><span class="m-card-label">📝 Note</span><span class="m-card-val" style="font-size:13px;color:var(--text2)">${a.note}</span></div>` : ''}
              <div class="m-card-actions">
                ${a.linkpost ? `<a class="btn btn-outline" href="${a.linkpost}" target="_blank" style="flex:1;justify-content:center;display:flex;align-items:center;min-height:42px;font-size:14px;border-radius:10px;text-decoration:none;">🔗 Post</a>` : ''}
                ${canEdit ? `<button class="btn btn-outline" onclick="editCustomer(${ri})">✏️ แก้ไข</button>` : ''}
                ${canDelete ? `<button class="btn btn-danger" onclick="deleteItem('customers',${ri})">🗑️</button>` : ''}
              </div>
            </div>`;
          }).join('');
        }
      } else {
        // TABLE VIEW
        if (ml) { ml.innerHTML = ''; ml.style.display = 'none'; }
        if (tbWrap) tbWrap.style.display = '';
        if (!tb) return;
        if (!paged.length) {
          tb.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:40px;color:var(--text3)">ไม่พบลูกค้าที่ตรงกับเงื่อนไข</td></tr>';
          return;
        }
        tb.innerHTML = paged.map(a => {
          const ri = DB.customers.indexOf(a);
          const badge = a.status === 'ขาย' ? 'badge-sale' : a.status === 'เช่า' ? 'badge-rent' : 'badge-both';
          return `<tr>
            <td style="color:var(--text3)">${ri + 1}</td>
            <td style="font-weight:600">${a.name || '-'}</td>
            <td><span class="badge ${badge}">${a.status || '-'}</span></td>
            <td>${a.type || '-'}</td>
            <td style="color:var(--gold)">${a.budget || '-'}</td>
            <td>${a.contact || '-'}</td>
            <td style="font-size:12px">${a.linkpost ? `<a href="${a.linkpost}" target="_blank" style="color:var(--blue)">🔗 Link</a>` : '-'}</td>
            <td style="font-size:12px;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${a.targetDate ? `📅 ${a.targetDate} | ` : ''}${a.note || '-'}</td>
            <td><div style="display:flex;gap:5px">
              ${canEdit ? `<button class="btn btn-outline btn-sm" onclick="editCustomer(${ri})">✏️</button>` : ''}
              ${canDelete ? `<button class="btn btn-danger btn-sm" onclick="deleteItem('customers',${ri})">🗑️</button>` : ''}
            </div></td>
          </tr>`;
        }).join('');

        // Mobile cards alongside table (for small screens, show cards instead)
        if (ml) ml.innerHTML = paged.map(a => {
          const ri = DB.customers.indexOf(a);
          const badge = a.status === 'ขาย' ? 'badge-sale' : a.status === 'เช่า' ? 'badge-rent' : 'badge-both';
          return `<div class="m-card">
            <span class="m-card-num">#${ri + 1}</span>
            <div class="m-card-top">
              <div>
                <div class="m-card-name">${a.name || '-'}</div>
                <div class="m-card-sub">${a.type || ''}</div>
              </div>
              <span class="badge ${badge}">${a.status || '-'}</span>
            </div>
            ${a.budget ? `<div class="m-card-row"><span class="m-card-label">💰 งบ</span><span class="m-card-val gold">${a.budget}</span></div>` : ''}
            ${a.line ? `
            <div class="m-card-row">
              <span class="m-card-label">🚇 รถไฟฟ้า</span>
              <span class="m-card-val" style="font-size:13px;">
                <span style="color:var(--gold);font-weight:600;">${a.line}</span>
                ${a.stationStart || a.stationEnd ? `
                  <div style="font-size:12px;color:var(--text2);margin-top:2.5px;">
                    📍 ${a.stationStart || 'ไม่ระบุ'} ➡️ ${a.stationEnd || 'ไม่ระบุ'}
                  </div>
                ` : ''}
              </span>
            </div>
            ` : ''}
            ${a.targetDate ? `<div class="m-card-row"><span class="m-card-label">📅 วันที่ต้องการ</span><span class="m-card-val" style="color:var(--gold);font-weight:600;">${a.targetDate}</span></div>` : ''}
            ${a.contact ? `<div class="m-card-row"><span class="m-card-label">📞 Contact</span><span class="m-card-val">${a.contact}</span></div>` : ''}
            ${a.note ? `<div class="m-card-row"><span class="m-card-label">📝 Note</span><span class="m-card-val" style="font-size:13px;color:var(--text2)">${a.note}</span></div>` : ''}
            <div class="m-card-actions">
              ${a.linkpost ? `<a class="btn btn-outline" href="${a.linkpost}" target="_blank" style="flex:1;justify-content:center;display:flex;align-items:center;min-height:42px;font-size:14px;border-radius:10px;text-decoration:none;">🔗 Post</a>` : ''}
              ${canEdit ? `<button class="btn btn-outline" onclick="editCustomer(${ri})">✏️ แก้ไข</button>` : ''}
              ${canDelete ? `<button class="btn btn-danger" onclick="deleteItem('customers',${ri})">🗑️</button>` : ''}
            </div>
          </div>`;
        }).join('');
      }
    }


    function editCustomer(i) {
      const a = DB.customers[i];
      document.getElementById('modalCustomerTitle').textContent = '✏️ แก้ไขลูกค้า';
      setV('cu_name', a.name); setV('cu_status', a.status); setV('cu_type', a.type);
      setV('cu_budget', a.budget); setV('cu_area', a.area); setV('cu_floor', a.floor);
      setV('cu_contact', a.contact); setV('cu_linkpost', a.linkpost); setV('cu_note', a.note);
      setV('cu_line', a.line);
      onCustModalTrainLineChange();
      setV('cu_stationStart', a.stationStart);
      setV('cu_stationEnd', a.stationEnd);
      setV('cu_targetDate', a.targetDate || '');
      editMode = { type: 'customer', idx: i };
      document.getElementById('modalCustomer').classList.add('open');
    }

    function copyGuestRequestLink() {
      let url = window.location.href.split('?')[0].split('#')[0];
      if (url.endsWith('index.html')) {
        url = url.replace('index.html', 'request.html');
      } else if (url.endsWith('/')) {
        url = url + 'request.html';
      } else {
        const lastSlash = url.lastIndexOf('/');
        url = url.substring(0, lastSlash + 1) + 'request.html';
      }
      // Add cache buster to force browser to load fresh page code from server
      url = url + '?v=' + Date.now();
      navigator.clipboard.writeText(url).then(() => {
        if (typeof showToast === 'function') {
          showToast('📋 คัดลอกลิงก์ฝากหาทรัพย์สำหรับส่งให้ลูกค้าแล้ว!', '#50c878');
        } else {
          alert('📋 คัดลอกลิงก์สำเร็จ:\n' + url);
        }
      }).catch(() => {
        alert('คัดลอกลิงก์ส่งลูกค้า:\n' + url);
      });
    }
