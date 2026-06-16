    function initCommissionTab() {
      const assetSel = document.getElementById('calcAssetSelect');
      if (!assetSel) return;
      
      const curVal = assetSel.value;
      
      let html = '<option value="">-- ดึงราคาจากทรัพย์สิน (ระบุหรือไม่ก็ได้) --</option>';
      DB.assets.forEach((a, i) => {
        if (a.status && a.status.includes('ขาย')) {
          const priceStr = a.price || '';
          const loc = a.location ? ` | ${a.location}` : '';
          html += `<option value="${i}">${a.name || 'ไม่มีชื่อ'}${loc} (${priceStr})</option>`;
        }
      });
      assetSel.innerHTML = html;
      
      if (curVal && parseInt(curVal) < DB.assets.length) {
        assetSel.value = curVal;
      } else {
        assetSel.value = '';
      }
      
      updateAllSplitAgentDropdowns();
      
      // If no split rows exist, create at least two default splits to be helpful
      const container = document.getElementById('calcSplitsContainer');
      if (container && container.children.length === 0) {
        addSplitRow(50);
        addSplitRow(50);
      }
      
      calculateCommission();
    }
    
    function onCalcAssetChange() {
      const idxVal = document.getElementById('calcAssetSelect').value;
      if (idxVal === '') return;
      const asset = DB.assets[parseInt(idxVal)];
      if (!asset) return;
      
      const priceStr = asset.price || '';
      const cleaned = priceStr.replace(/,/g, '');
      const match = cleaned.match(/\d+/);
      if (match) {
        document.getElementById('calcPrice').value = parseInt(match[0]);
        calculateCommission();
      }
    }
    
    function setCommissionRatePreset(rate) {
      document.getElementById('calcRate').value = rate;
      document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.textContent === rate + '%') {
          btn.classList.add('active');
        }
      });
      calculateCommission();
    }
    
    function setCalculationMode(mode) {
      calcMode = mode;
      document.getElementById('btnModeAddOn').classList.toggle('active', mode === 'addon');
      document.getElementById('btnModeNet').classList.toggle('active', mode === 'net');
      calculateCommission();
    }
    
    function toggleSplitFields() {
      const enabled = document.getElementById('calcEnableSplit').checked;
      document.getElementById('calcAddSplitBtn').style.display = enabled ? '' : 'none';
      document.getElementById('calcSplitsContainer').style.display = enabled ? '' : 'none';
      document.getElementById('outSplitsSection').style.display = enabled ? '' : 'none';
      calculateCommission();
    }
    
    function addSplitRow(defaultPercent = 0) {
      const container = document.getElementById('calcSplitsContainer');
      if (!container) return;
      
      const rowId = 'split-row-' + Date.now() + Math.random().toString(36).substr(2, 5);
      const row = document.createElement('div');
      row.className = 'split-row';
      row.id = rowId;
      
      let agentOptions = '<option value="custom">-- กรอกชื่อเอง --</option>';
      DB.agents.forEach((ag, idx) => {
        agentOptions += `<option value="${idx}">${ag.name || 'ไม่มีชื่อ'}${ag.company ? ' (' + ag.company + ')' : ''}</option>`;
      });
      
      row.innerHTML = `
        <div style="flex:2; display:flex; flex-direction:column; gap:4px;">
          <select class="cb-select split-agent-select" onchange="onSplitAgentChange('${rowId}')" style="margin-bottom:0; font-size:13px;">
            ${agentOptions}
          </select>
          <input type="text" class="split-name-input" placeholder="ระบุชื่อผู้รับส่วนแบ่ง" style="margin-top:6px; margin-bottom:0; font-size:12px; display:block;">
        </div>
        <div style="flex:1; display:flex; align-items:center; gap:8px;">
          <input type="number" class="split-percent-input" value="${defaultPercent}" min="0" max="100" step="0.5" oninput="onSplitPercentInputChange('${rowId}')" style="width:70px; margin-bottom:0; text-align:right; font-size:13px;">
          <span style="font-size:13px;">%</span>
        </div>
        <button type="button" class="split-del-btn" onclick="removeSplitRow('${rowId}')" title="ลบ">🗑️</button>
      `;
      
      container.appendChild(row);
      calculateCommission();
    }
    
    function removeSplitRow(rowId) {
      const el = document.getElementById(rowId);
      if (el) el.remove();
      calculateCommission();
    }
    
    function onSplitAgentChange(rowId) {
      const row = document.getElementById(rowId);
      if (!row) return;
      const sel = row.querySelector('.split-agent-select');
      const nameInput = row.querySelector('.split-name-input');
      
      if (sel.value === 'custom') {
        nameInput.style.display = 'block';
        nameInput.value = '';
      } else {
        nameInput.style.display = 'none';
        const agent = DB.agents[parseInt(sel.value)];
        nameInput.value = agent ? agent.name : '';
      }
      calculateCommission();
    }
    
    function onSplitPercentInputChange(rowId) {
      calculateCommission();
    }
    
    function updateAllSplitAgentDropdowns() {
      document.querySelectorAll('.split-row').forEach(row => {
        const sel = row.querySelector('.split-agent-select');
        if (!sel) return;
        const curVal = sel.value;
        
        let agentOptions = '<option value="custom">-- กรอกชื่อเอง --</option>';
        DB.agents.forEach((ag, idx) => {
          agentOptions += `<option value="${idx}">${ag.name || 'ไม่มีชื่อ'}${ag.company ? ' (' + ag.company + ')' : ''}</option>`;
        });
        sel.innerHTML = agentOptions;
        
        if (curVal === 'custom' || parseInt(curVal) < DB.agents.length) {
          sel.value = curVal;
        } else {
          sel.value = 'custom';
        }
      });
    }
    
    function calculateCommission() {
      const priceInput = document.getElementById('calcPrice');
      const rateInput = document.getElementById('calcRate');
      if (!priceInput || !rateInput) return;
      
      const basePrice = parseFloat(priceInput.value) || 0;
      const rate = parseFloat(rateInput.value) || 0;
      
      const priceThaiEl = document.getElementById('calcPriceThai');
      if (priceThaiEl) {
        priceThaiEl.textContent = basePrice > 0 ? `(${thaiBahtText(basePrice)})` : '';
      }
      
      let commissionAmount = 0;
      let totalPrice = 0;
      
      if (calcMode === 'addon') {
        commissionAmount = basePrice * (rate / 100);
        totalPrice = basePrice + commissionAmount;
      } else {
        if (rate >= 100) {
          totalPrice = 0;
          commissionAmount = 0;
        } else {
          totalPrice = basePrice / (1 - (rate / 100));
          commissionAmount = totalPrice - basePrice;
        }
      }
      
      const fmt = val => val.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      
      document.getElementById('outBasePrice').textContent = fmt(basePrice) + ' บาท';
      document.getElementById('outCommissionRate').textContent = rate + '%';
      document.getElementById('outCommissionAmount').textContent = fmt(commissionAmount) + ' บาท';
      document.getElementById('outTotalPrice').textContent = fmt(totalPrice) + ' บาท';
      
      const enableSplit = document.getElementById('calcEnableSplit').checked;
      const outSplitsSection = document.getElementById('outSplitsSection');
      const warningEl = document.getElementById('calcWarningText');
      
      if (enableSplit) {
        const splitRows = document.querySelectorAll('.split-row');
        const tb = document.getElementById('outSplitsTableBody');
        let totalPct = 0;
        let splitsHtml = '';
        
        splitRows.forEach(row => {
          const sel = row.querySelector('.split-agent-select');
          const nameInput = row.querySelector('.split-name-input');
          const pctInput = row.querySelector('.split-percent-input');
          
          let name = '';
          let bank = '';
          if (sel.value === 'custom') {
            name = nameInput.value || 'ผู้ร่วมงาน';
            bank = '-';
          } else {
            const agent = DB.agents[parseInt(sel.value)];
            name = agent ? agent.name : 'ผู้ร่วมงาน';
            bank = agent ? (agent.bank || '-') : '-';
          }
          
          const pct = parseFloat(pctInput.value) || 0;
          totalPct += pct;
          
          const amount = commissionAmount * (pct / 100);
          
          splitsHtml += `
            <tr style="border-bottom: 1px solid var(--border2);">
              <td style="padding: 8px 0;">
                <span style="font-weight:600; display:block;">${name}</span>
                <span style="font-size:10px; color:var(--text2);">ธนาคาร: ${bank}</span>
              </td>
              <td style="padding: 8px 0; text-align:right; font-weight:600;">${pct}%</td>
              <td style="padding: 8px 0; text-align:right; color:var(--gold); font-weight:600;">${fmt(amount)}</td>
            </tr>
          `;
        });
        
        if (tb) tb.innerHTML = splitsHtml || '<tr><td colspan="3" style="text-align:center; padding:12px; color:var(--text2);">กรุณาเพิ่มสัดส่วนส่วนแบ่ง</td></tr>';
        
        const totalShareEl = document.getElementById('outSplitsTotalShare');
        if (totalShareEl) {
          totalShareEl.textContent = `สัดส่วนรวม: ${totalPct}%`;
          totalShareEl.style.color = totalPct === 100 ? 'var(--gold)' : 'var(--red)';
        }
        
        if (warningEl) {
          warningEl.style.display = totalPct === 100 ? 'none' : 'block';
          warningEl.textContent = `⚠️ สัดส่วนส่วนแบ่งรวมกันเท่ากับ ${totalPct}% (ต้องเท่ากับ 100%)`;
        }
      } else {
        if (warningEl) warningEl.style.display = 'none';
      }
    }
    
    function resetCommissionCalculator() {
      document.getElementById('calcAssetSelect').value = '';
      document.getElementById('calcPrice').value = '';
      document.getElementById('calcPriceThai').textContent = '';
      document.getElementById('calcRate').value = '3';
      setCommissionRatePreset(3);
      setCalculationMode('addon');
      document.getElementById('calcEnableSplit').checked = false;
      toggleSplitFields();
      
      const container = document.getElementById('calcSplitsContainer');
      if (container) {
        container.innerHTML = '';
        addSplitRow(50);
        addSplitRow(50);
      }
      calculateCommission();
    }
    
    function copyCommissionSummary() {
      const priceInput = document.getElementById('calcPrice');
      const rateInput = document.getElementById('calcRate');
      if (!priceInput || !rateInput) return;
      
      const basePrice = parseFloat(priceInput.value) || 0;
      const rate = parseFloat(rateInput.value) || 0;
      if (basePrice <= 0) {
        alert('กรุณาระบุราคาทรัพย์สินก่อนคัดลอกสรุป');
        return;
      }
      
      const modeText = calcMode === 'addon' ? 'คิดเพิ่มบนราคาขาย (Add-on)' : 'คิดแบบหักหลังรับเน็ต (Net Seller)';
      
      let commissionAmount = 0;
      let totalPrice = 0;
      if (calcMode === 'addon') {
        commissionAmount = basePrice * (rate / 100);
        totalPrice = basePrice + commissionAmount;
      } else {
        totalPrice = basePrice / (1 - (rate / 100));
        commissionAmount = totalPrice - basePrice;
      }
      
      const fmt = val => val.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      
      const assetIdx = document.getElementById('calcAssetSelect').value;
      let assetName = 'ทั่วไป';
      if (assetIdx !== '') {
        const asset = DB.assets[parseInt(assetIdx)];
        if (asset) assetName = asset.name || 'ไม่มีชื่อ';
      }
      
      let txt = `💰 สรุปรายงานค่าคอมมิชชั่น (BENZ HOME Agency) 💰\n`;
      txt += `========================================\n`;
      txt += `ทรัพย์สิน/โครงการ: ${assetName}\n`;
      txt += `ราคาทรัพย์สุทธิ (ไม่รวมค่าคอม): ${fmt(basePrice)} บาท (${thaiBahtText(basePrice)})\n`;
      txt += `รูปแบบการคำนวณ: ${modeText}\n`;
      txt += `อัตราค่าคอมมิชชั่น: ${rate}%\n`;
      txt += `----------------------------------------\n`;
      txt += `✨ ค่าคอมมิชชั่นที่ได้รับ: ${fmt(commissionAmount)} บาท\n`;
      txt += `💵 ราคารวมค่าคอมมิชชั่น: ${fmt(totalPrice)} บาท\n`;
      
      const enableSplit = document.getElementById('calcEnableSplit').checked;
      if (enableSplit) {
        txt += `========================================\n`;
        txt += `👥 สัดส่วนส่วนแบ่งผู้ร่วมงาน:\n`;
        const splitRows = document.querySelectorAll('.split-row');
        let totalPct = 0;
        
        splitRows.forEach((row, i) => {
          const sel = row.querySelector('.split-agent-select');
          const nameInput = row.querySelector('.split-name-input');
          const pctInput = row.querySelector('.split-percent-input');
          
          let name = '';
          let bank = '';
          if (sel.value === 'custom') {
            name = nameInput.value || 'ผู้ร่วมงาน';
            bank = '-';
          } else {
            const agent = DB.agents[parseInt(sel.value)];
            name = agent ? agent.name : 'ผู้ร่วมงาน';
            bank = agent ? (agent.bank || '-') : '-';
          }
          
          const pct = parseFloat(pctInput.value) || 0;
          totalPct += pct;
          const amount = commissionAmount * (pct / 100);
          
          txt += `${i + 1}. ${name} (${pct}%): ${fmt(amount)} บาท\n`;
          if (bank !== '-') txt += `   [บัญชี: ${bank}]\n`;
        });
        txt += `----------------------------------------\n`;
        txt += `สัดส่วนส่วนแบ่งรวม: ${totalPct}%\n`;
      }
      txt += `========================================`;
      
      navigator.clipboard.writeText(txt).then(() => {
        showToast('📋 คัดลอกสรุปไปยังคลิปบอร์ดแล้ว!');
      }).catch(err => {
        alert('ไม่สามารถคัดลอกได้อัตโนมัติ กรุณาลองคัดลอกด้วยตนเอง');
      });
    }
    