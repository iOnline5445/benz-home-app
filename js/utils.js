    function saveTolocalStorage() {
      try { localStorage.setItem(LS_KEY, JSON.stringify(DB)); } catch (e) { console.warn('localStorage save fail', e); }
    }

    function loadFromlocalStorage() {
      try {
        const s = localStorage.getItem(LS_KEY);
        if (s) {
          const d = JSON.parse(s);
          DB.assets = d.assets || [];
          DB.agents = d.agents || [];
          DB.customers = d.customers || [];
          DB.consignments = d.consignments || [];
          DB.mktQueue = d.mktQueue || [];
          DB.mktScheduleSlots = d.mktScheduleSlots || ['09:00', '12:00', '15:00', '18:00'];
        }
      } catch (e) { }
    }

    function showToast(msg, color) {
      const t = document.createElement('div');
      t.textContent = msg;
      Object.assign(t.style, {
        position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)',
        background: color || 'var(--gold)', color: '#fff', padding: '10px 22px', borderRadius: '30px',
        fontWeight: '700', fontSize: '13px', zIndex: '9999', boxShadow: '0 4px 20px rgba(0,0,0,.4)', transition: 'opacity .4s', whiteSpace: 'nowrap'
      });
      document.body.appendChild(t);
      setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 400); }, 2000);
    }

    function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

    function _roleBadge(role) {
      if (role === 'admin') return '<span class="badge badge-admin">⭐ Admin</span>';
      if (role === 'agent') return '<span class="badge badge-both">🏠 Agent</span>';
      return '<span class="badge badge-user2">👁️ Viewer</span>';
    }
    function _roleLabel(role) {
      if (role === 'admin') return '⭐ Admin';
      if (role === 'agent') return '🏠 Agent';
      return '👁️ Viewer';
    }

    function v(id) { const el = document.getElementById(id); return el ? el.value.trim() : ''; }
    function setV(id, val) { const el = document.getElementById(id); if (el) el.value = val || ''; }
    function parseDateVal(dStr) {
      if (!dStr) return 0;
      if (dStr.includes('/')) {
        const p = dStr.split('/');
        if (p.length === 3) {
          if (p[0].length === 4) {
            return new Date(p[0], p[1] - 1, p[2]).getTime() || 0;
          } else {
            return new Date(p[2], p[1] - 1, p[0]).getTime() || 0;
          }
        }
      } else if (dStr.includes('-')) {
        const p = dStr.split('-');
        if (p.length === 3) {
          if (p[0].length === 4) {
            return new Date(p[0], p[1] - 1, p[2]).getTime() || 0;
          } else {
            return new Date(p[2], p[1] - 1, p[0]).getTime() || 0;
          }
        }
      }
      const prs = Date.parse(dStr);
      return isNaN(prs) ? 0 : prs;
    }

    function escapeHtml(str) {
      return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    }
    function quickClip(idx) {
      const a = DB.assets[idx];
      document.getElementById('clipPreviewText').textContent = buildClipText(a, 'full', true, true, true, true, a.contact || '', '', true);
      document.getElementById('modalClipPreview').classList.add('open');
    }
    function copyClipboard() {
      const txt = document.getElementById('cbOutput').textContent;
      if (txt && txt !== 'เลือกทรัพย์สินเพื่อสร้าง Clipboard...') {
        navigator.clipboard.writeText(txt).then(() => {
          const msg = document.getElementById('copyMsg');
          msg.style.display = 'inline'; setTimeout(() => msg.style.display = 'none', 2000);
        });
      }
    }
    function copyFromPreview() {
      const txt = document.getElementById('clipPreviewText').textContent;
      navigator.clipboard.writeText(txt).then(() => { closeModal('clipPreview'); alert('คัดลอกแล้ว!'); });
    }

    // ============================
    // CSV HELPERS
    // ============================
    function csvEscape(v) { return '"' + (String(v || '').replace(/"/g, '""')) + '"'; }
    // RFC-4180 compliant CSV parser - handles quoted multiline cells, commas, special chars
    function parseCSV(text) {
      // Strip BOM
      if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
      // Normalise line endings
      text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

      const rows = [];
      let cur = '';
      let inQ = false;
      let fields = [];

      for (let i = 0; i <= text.length; i++) {
        const ch = i < text.length ? text[i] : null;

        if (ch === '"') {
          if (!inQ) {
            inQ = true;
          } else if (i + 1 < text.length && text[i + 1] === '"') {
            cur += '"'; i++;
          } else {
            inQ = false;
          }
        } else if ((ch === ',' || ch === null || ch === '\n') && !inQ) {
          fields.push(cur.trim());
          cur = '';
          if (ch === '\n' || ch === null) {
            if (fields.join('').trim() !== '') rows.push(fields);
            fields = [];
          }
        } else {
          if (ch !== null) cur += ch;
        }
      }

      if (!rows.length) return { headers: [], rows: [] };
      const headers = rows[0];
      return { headers, rows: rows.slice(1) };
    }
    // Legacy thin wrapper kept for safety
    function parseCSVLine(line) {
      const r = parseCSV(line);
      return r.rows[0] || line.split(',').map(s => s.trim());
    }
    function downloadCSV(content, filename) {
      const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
    }

    function cap2(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

    // Init
    (function () {
      loadTP();
      // Migrate old yb_theme key
      const old = localStorage.getItem('yb_theme');
      if (old && !localStorage.getItem('yb_tp')) TP.color = old;
      applyTP();
      // Inject logo
      (function injectLogo() {
        const logoEl = document.getElementById('headerLogoImg');
        if (logoEl) {
          logoEl.src = 'icon.png';
          logoEl.onerror = function() {
            const wrap = document.querySelector('.logo-img-wrap');
            if (wrap) {
              wrap.innerHTML = '<div class="logo">BENZ HOME Agency <span>ระบบจัดการอสังหาริมทรัพย์</span></div>';
            }
          };
        }
      })();
    })();

    function thaiBahtText(num) {
      if (num === null || num === undefined || isNaN(num)) return '';
      num = parseFloat(num).toFixed(2);
      if (num === '0.00') return 'ศูนย์บาทถ้วน';
      
      const numberWords = ['ศูนย์', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
      const positionWords = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน', 'ล้าน'];
      
      const parts = num.split('.');
      const bahtStr = parts[0];
      const satangStr = parts[1];
      
      let text = '';
      
      function convertGroup(val) {
        let groupText = '';
        const len = val.length;
        for (let i = 0; i < len; i++) {
          const digit = parseInt(val.charAt(i));
          const pos = len - i - 1;
          if (digit !== 0) {
            if (pos === 1 && digit === 2) {
              groupText += 'ยี่สิบ';
            } else if (pos === 1 && digit === 1) {
              groupText += 'สิบ';
            } else if (pos === 0 && digit === 1 && len > 1 && val.charAt(i - 1) !== '0') {
              groupText += 'เอ็ด';
            } else {
              groupText += numberWords[digit] + positionWords[pos];
            }
          }
        }
        return groupText;
      }
      
      let tempBaht = bahtStr;
      let millionCount = 0;
      while (tempBaht.length > 0) {
        const take = tempBaht.length > 6 ? tempBaht.length - 6 : 0;
        const chunk = tempBaht.slice(take);
        tempBaht = tempBaht.slice(0, take);
        
        let chunkText = convertGroup(chunk);
        if (chunkText !== '') {
          text = chunkText + positionWords[6].repeat(millionCount) + text;
        }
        millionCount++;
      }
      
      if (text !== '') {
        text += 'บาท';
      }
      
      if (satangStr === '00') {
        text += 'ถ้วน';
      } else {
        const satangVal = parseInt(satangStr);
        text += convertGroup(satangStr) + 'สตางค์';
      }
      return text;
    }
    
    // End of main init
  