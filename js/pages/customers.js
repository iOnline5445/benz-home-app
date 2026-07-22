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
    function checkCustomerMatchAsset(c, asset) {
      if (!c || !asset) return false;
      if (asset.listingActive === 'sold') return false;

      // 1. สถานะที่ต้องการ (Status Match)
      const assetStatus = (asset.status || '').trim();
      const custStatus = (c.status || '').trim();
      let statusMatch = false;
      if (!custStatus || custStatus === 'เช่าหรือซื้อ ก็ได้' || custStatus === 'เช่า/ขาย') {
        statusMatch = true;
      } else if (custStatus === 'เช่า') {
        statusMatch = (assetStatus === 'เช่า');
      } else if (custStatus === 'ซื้อทรัพย์') {
        statusMatch = (assetStatus === 'ขาย');
      } else if (custStatus === 'ขายทรัพย์') {
        statusMatch = (assetStatus === 'ขาย');
      } else {
        // Fallback for older values
        if (custStatus === 'ขาย') {
          statusMatch = (assetStatus === 'ขาย');
        } else {
          statusMatch = (custStatus === assetStatus);
        }
      }
      if (!statusMatch) return false;

      // 2. ประเภททรัพย์สิน (Type Match: คอนโด, บ้านเดี่ยว, ฯลฯ)
      const assetType = (asset.type || '').trim();
      const custType = (c.type || '').trim();
      if (custType) {
        const typeMatch = assetType.includes(custType) || custType.includes(assetType);
        if (!typeMatch) return false;
      }

      // 3. ราคา & งบประมาณสูงสุด (Price & Maximum Budget)
      const custBudget = parsePriceValue(c.budget);
      const assetPrice = parsePriceValue(asset.price);
      if (custBudget > 0 && assetPrice > 0) {
        if (assetPrice > custBudget) return false;
      }

      // 4. แนวรถไฟฟ้า & สถานี & ทำเลที่ตั้ง (Electric Train Line, Station & Location)
      if (c.line) {
        const stations = TRANSIT_LINES[c.line] || [];
        const assetBts = (asset.bts || '').trim();
        const assetLoc = (asset.location || '').trim();

        const cleanStationName = (st) => (st || '').replace(/^(BTS|MRT|ARL|SRT)\s*/i, '').trim();

        if (c.stationStart && c.stationEnd) {
          const cIdx1 = stations.indexOf(c.stationStart);
          const cIdx2 = stations.indexOf(c.stationEnd);
          if (cIdx1 !== -1 && cIdx2 !== -1) {
            const minIdx = Math.min(cIdx1, cIdx2);
            const maxIdx = Math.max(cIdx1, cIdx2);
            const validStations = stations.slice(minIdx, maxIdx + 1);

            const btsMatch = validStations.includes(assetBts);
            const locMatch = validStations.some(st => {
              const clean = cleanStationName(st);
              return clean && assetLoc.includes(clean);
            });

            if (!btsMatch && !locMatch) return false;
          }
        } else if (c.stationStart) {
          const cleanStart = cleanStationName(c.stationStart);
          const btsMatch = assetBts === c.stationStart || (cleanStart && assetBts.includes(cleanStart));
          const locMatch = cleanStart && assetLoc.includes(cleanStart);

          if (!btsMatch && !locMatch) return false;
        } else {
          const btsMatch = stations.includes(assetBts);
          const locMatch = stations.some(st => {
            const clean = cleanStationName(st);
            return clean && assetLoc.includes(clean);
          });

          if (!btsMatch && !locMatch) return false;
        }
      }

      return true;
    }

    function renderCustomers() {
      const q = (document.getElementById('customerSearch')?.value || '').toLowerCase();
      const priceMin = parseFloat(document.getElementById('customerPriceMin')?.value) || null;
      const priceMax = parseFloat(document.getElementById('customerPriceMax')?.value) || null;

      const lineFilter = document.getElementById('filterCustTrainLine')?.value || '';
      const startFilter = document.getElementById('filterCustStartStation')?.value || '';
      const endFilter = document.getElementById('filterCustEndStation')?.value || '';

      const cur = (typeof migrateUserFields === 'function') ? migrateUserFields(AUTH.current) : (AUTH.current || {});
      const isOwner = cur.businessRole === 'owner' && cur.accessLevel === 'member';

      let list = DB.customers.filter(a => {
        // If owner, check if the customer matches at least one of their properties
        if (isOwner) {
          const ownerEmail = (cur.email || '').toLowerCase().trim();
          const ownerDName = cur.displayname || '';
          
          const ownerAssets = DB.assets.filter(ast => {
            if (ast.creatorEmail && ownerEmail && ast.creatorEmail.toLowerCase() === ownerEmail) return true;
            if (ast.poster && ownerDName && ast.poster === ownerDName) return true;
            return false;
          });
          
          if (!ownerAssets.length) return false;
          
          const matchesAny = ownerAssets.some(ast => checkCustomerMatchAsset(a, ast));
          if (!matchesAny) return false;
        }

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

      function getTimestampFromId(id) {
        if (!id) return 0;
        if (id.startsWith('C')) {
          const numStr = id.slice(1).match(/^\d+/);
          return numStr ? parseInt(numStr[0], 10) : 0;
        }
        const base36Str = id.substring(0, 8);
        const parsed = parseInt(base36Str, 36);
        if (!isNaN(parsed) && parsed > 1000000000000) {
          return parsed;
        }
        return 0;
      }

      // Sort: Newest first (by parsed timestamp, with index fallback)
      list.sort((x, y) => {
        const tx = getTimestampFromId(x.id);
        const ty = getTimestampFromId(y.id);
        if (tx !== ty) {
          return ty - tx;
        }
        return DB.customers.indexOf(y) - DB.customers.indexOf(x);
      });

      const totalPages = Math.max(1, Math.ceil(list.length / _custPageSize));
      if (_custPage > totalPages) _custPage = totalPages;
      const paged = list.slice((_custPage - 1) * _custPageSize, _custPage * _custPageSize);

      _buildPager(_custPage, totalPages, '_goCustPage', 'customerPaginationTop');

      const tb = document.getElementById('customerTable');
      const ml = document.getElementById('customerMList');
      const tbWrap = document.getElementById('customerTableWrap');
      const canEdit = window._canEdit === true;
      const canDelete = window._canDelete === true;

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
              ${a.contact ? `<div class="m-card-row"><span class="m-card-label">📞 Contact</span><span class="m-card-val">${window._canSeeContacts ? a.contact : '🔒 เฉพาะ Agent ที่อนุมัติแล้ว'}</span></div>` : ''}
              ${a.note ? `<div class="m-card-row"><span class="m-card-label">📝 Note</span><span class="m-card-val" style="font-size:13px;color:var(--text2)">${a.note}</span></div>` : ''}
              <div class="m-card-actions">
                ${a.linkpost ? `<a class="btn btn-outline" href="${a.linkpost}" target="_blank" style="flex:1;justify-content:center;display:flex;align-items:center;min-height:42px;font-size:14px;border-radius:10px;text-decoration:none;">🔗 Post</a>` : ''}
                <button class="btn btn-outline" style="border-color:var(--gold);color:var(--gold);" onclick="showAssetMatchesForCustomer(${ri})">🔍 จับคู่ห้องว่าง</button>
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
          tb.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:40px;color:var(--text3)">ไม่พบลูกค้าที่ตรงกับเงื่อนไข</td></tr>';
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
            <td>${window._canSeeContacts ? (a.contact || '-') : '🔒 เฉพาะ Agent ที่อนุมัติแล้ว'}</td>
            <td style="font-size:12px">${a.linkpost ? `<a href="${a.linkpost}" target="_blank" style="color:var(--blue)">🔗 Link</a>` : '-'}</td>
            <td style="font-size:12px;color:var(--gold);font-weight:600">${a.targetDate || '-'}</td>
            <td style="font-size:12px;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${a.note || '-'}</td>
            <td><div style="display:flex;gap:5px">
              <button class="btn btn-outline btn-sm" style="border-color:var(--gold);color:var(--gold);" onclick="showAssetMatchesForCustomer(${ri})" title="จับคู่ทรัพย์สิน">🔍 จับคู่</button>
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
            ${a.contact ? `<div class="m-card-row"><span class="m-card-label">📞 Contact</span><span class="m-card-val">${window._canSeeContacts ? a.contact : '🔒 เฉพาะ Agent ที่อนุมัติแล้ว'}</span></div>` : ''}
            ${a.note ? `<div class="m-card-row"><span class="m-card-label">📝 Note</span><span class="m-card-val" style="font-size:13px;color:var(--text2)">${a.note}</span></div>` : ''}
            <div class="m-card-actions">
              ${a.linkpost ? `<a class="btn btn-outline" href="${a.linkpost}" target="_blank" style="flex:1;justify-content:center;display:flex;align-items:center;min-height:42px;font-size:14px;border-radius:10px;text-decoration:none;">🔗 Post</a>` : ''}
              <button class="btn btn-outline" style="border-color:var(--gold);color:var(--gold);" onclick="showAssetMatchesForCustomer(${ri})">🔍 จับคู่ห้องว่าง</button>
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
          showToast('📋 คัดลอกลิงก์ฝากทรัพย์/หาทรัพย์สำหรับส่งให้ลูกค้าแล้ว!', '#50c878');
        } else {
          alert('📋 คัดลอกลิงก์สำเร็จ:\n' + url);
        }
      }).catch(() => {
        alert('คัดลอกลิงก์ส่งลูกค้า:\n' + url);
      });
    }

    // ========================================================
    // SMART MATCHING FUNCTIONS (Property-Customer Matcher)
    // ========================================================
    function parsePriceValue(priceStr) {
      if (!priceStr) return 0;
      let str = priceStr.toString().replace(/[^\d.]/g, '');
      let val = parseFloat(str);
      if (isNaN(val)) return 0;
      
      if (priceStr.toString().includes('ล้าน')) {
        val = val * 1000000;
      }
      return val;
    }

    function showAssetMatchesForCustomer(custIdx) {
      const customer = DB.customers[custIdx];
      if (!customer) return;
      
      document.getElementById('modalMatchingTitle').textContent = `🔍 ทรัพย์สินที่ตรงความต้องการ: ${customer.name || 'ไม่ระบุ'}`;
      
      const custBudget = parsePriceValue(customer.budget);
      const custStatus = customer.status; 
      const custType = customer.type; 
      const custLine = customer.line; 
      const custStart = customer.stationStart;
      const custEnd = customer.stationEnd;
      
      const matches = DB.assets.filter(a => checkCustomerMatchAsset(customer, a));
      
      const summaryText = document.getElementById('matchingSummaryText');
      summaryText.innerHTML = `
        👤 ลูกค้า: <strong>${customer.name || '-'}</strong> | 
        ความต้องการ: <span class="badge ${custStatus === 'ขาย' ? 'badge-sale' : custStatus === 'เช่า' ? 'badge-rent' : 'badge-both'}">${custStatus || '-'}</span> ${custType || ''} | 
        งบประมาณ: <span style="color:var(--gold); font-weight:700;">${customer.budget || 'ไม่จำกัด'}</span><br>
        🚇 เส้นทาง: <strong>${custLine || 'ทุกสาย'}</strong> 
        ${custStart || custEnd ? `(สถานี ${custStart || 'ไม่ระบุ'} - ${custEnd || 'ไม่ระบุ'})` : ''}
        <div style="margin-top:8px; color:var(--gold); font-weight:700;">🎯 พบทรัพย์สินที่เหมาะสมทั้งหมด ${matches.length} รายการ:</div>
      `;
      
      const header = document.getElementById('matchingTableHeader');
      header.innerHTML = `
        <th style="width:30px">#</th>
        <th>ชื่อทรัพย์สิน</th>
        <th>ประเภท</th>
        <th>ราคา/ค่าเช่า</th>
        <th>ทำเล/สถานี</th>
        <th>ข้อมูลติดต่อ</th>
        <th>การจัดการ</th>
      `;
      
      const tbody = document.getElementById('matchingTableBody');
      const tableWrap = document.getElementById('matchingTableWrap');
      const emptyMsg = document.getElementById('matchingEmptyMessage');
      
      if (matches.length > 0) {
        tableWrap.style.display = 'block';
        emptyMsg.style.display = 'none';
        
        tbody.innerHTML = matches.map((a, i) => {
          const ri = DB.assets.indexOf(a);
          return `
            <tr>
              <td style="color:var(--text3);">${i + 1}</td>
              <td style="font-weight:600; color:var(--text);">${a.name || '-'}</td>
              <td>${a.type || '-'}</td>
              <td style="color:var(--gold); font-weight:700;">${a.price || '-'}</td>
              <td>${a.location || '-'}${a.bts ? `<br><small style="color:var(--blue); font-weight:600;">🚇 ${a.bts}</small>` : ''}</td>
              <td style="font-size:12px;">${window._canSeeContacts ? (a.contact || '-') : '🔒 เฉพาะ Agent ที่อนุมัติแล้ว'}</td>
              <td>
                <div style="display:flex; gap:4px;">
                  ${a.link ? `<a href="${a.link}" target="_blank" class="btn btn-outline btn-sm" style="padding:4px 8px;">🔗</a>` : ''}
                  <button class="btn btn-blue btn-sm" onclick="closeModal('matching'); switchTab('marketing', null); updateBnav('marketing'); selectMktAsset(${ri}, '${(a.name || '').replace(/'/g, "\\'")} (${a.status || ''})');" style="padding:4px 8px; font-size:11px;">🚀 ดึงเขียนโพสต์</button>
                </div>
              </td>
            </tr>
          `;
        }).join('');
      } else {
        tableWrap.style.display = 'none';
        emptyMsg.style.display = 'block';
      }
      
      openModal('matching');
    }

    function showCustomerMatchesForAsset(assetIdx) {
      const asset = DB.assets[assetIdx];
      if (!asset) return;
      
      document.getElementById('modalMatchingTitle').textContent = `🤝 ค้นหาผู้ซื้อ/เช่าที่เหมาะสมสำหรับ: ${asset.name || 'ไม่ระบุ'}`;
      
      const assetPrice = parsePriceValue(asset.price);
      const assetStatus = asset.status; 
      const assetType = asset.type; 
      const assetBts = asset.bts;
      
      const matches = DB.customers.filter(c => checkCustomerMatchAsset(c, asset));
      
      const summaryText = document.getElementById('matchingSummaryText');
      summaryText.innerHTML = `
        🏠 ทรัพย์สิน: <strong>${asset.name || '-'}</strong> | 
        สถานะ: <span class="badge ${assetStatus === 'ขาย' ? 'badge-sale' : assetStatus === 'เช่า' ? 'badge-rent' : 'badge-both'}">${assetStatus || '-'}</span> ${assetType || ''} | 
        ราคาเสนอขาย/เช่า: <span style="color:var(--gold); font-weight:700;">${asset.price || '-'}</span><br>
        📍 ทำเล: <strong>${asset.location || '-'}</strong> ${assetBts ? `(🚇 สถานี ${assetBts})` : ''}
        <div style="margin-top:8px; color:var(--gold); font-weight:700;">🎯 พบลูกค้าที่น่าจะสนใจอสังหาริมทรัพย์นี้ ${matches.length} รายการ:</div>
      `;
      
      const header = document.getElementById('matchingTableHeader');
      header.innerHTML = `
        <th style="width:30px">#</th>
        <th>ชื่อลูกค้า/โครงการที่สนใจ</th>
        <th>สถานะที่ต้องการ</th>
        <th>งบประมาณสูงสุด</th>
        <th>แนวรถไฟฟ้า</th>
        <th>ช่องทางติดต่อ</th>
        <th>หมายเหตุ</th>
      `;
      
      const tbody = document.getElementById('matchingTableBody');
      const tableWrap = document.getElementById('matchingTableWrap');
      const emptyMsg = document.getElementById('matchingEmptyMessage');
      
      if (matches.length > 0) {
        tableWrap.style.display = 'block';
        emptyMsg.style.display = 'none';
        
        tbody.innerHTML = matches.map((c, i) => {
          const badge = c.status === 'ขาย' ? 'badge-sale' : c.status === 'เช่า' ? 'badge-rent' : 'badge-both';
          return `
            <tr>
              <td style="color:var(--text3);">${i + 1}</td>
              <td style="font-weight:600; color:var(--text);">${c.name || '-'}</td>
              <td><span class="badge ${badge}">${c.status || '-'}</span></td>
              <td style="color:var(--gold); font-weight:700;">${c.budget || '-'}</td>
              <td>${c.line || 'ไม่ระบุ'}${c.stationStart || c.stationEnd ? `<br><small style="color:var(--text3);">📍 ${c.stationStart || 'ไม่ระบุ'} - ${c.stationEnd || 'ไม่ระบุ'}</small>` : ''}</td>
              <td style="font-size:12px;">${window._canSeeContacts ? (c.contact || '-') : '🔒 เฉพาะ Agent ที่อนุมัติแล้ว'}</td>
              <td style="font-size:12px; color:var(--text2); max-width:150px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${c.note || ''}">${c.note || '-'}</td>
            </tr>
          `;
        }).join('');
      } else {
        tableWrap.style.display = 'none';
        emptyMsg.style.display = 'block';
      }
      
      openModal('matching');
    }

    window.showAssetMatchesForCustomer = showAssetMatchesForCustomer;
    window.showCustomerMatchesForAsset = showCustomerMatchesForAsset;
    window.parsePriceValue = parsePriceValue;
