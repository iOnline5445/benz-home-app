    // ============================
    // AGENTS
    // ============================
    let _agentView = 'table'; // 'table' | 'card'

    function setAgentView(v) {
      _agentView = v;
      ['card', 'table'].forEach(x => {
        const b = document.getElementById('btnAgentView' + x.charAt(0).toUpperCase() + x.slice(1));
        if (b) b.style.background = (x === v) ? 'var(--gold)' : '';
        if (b) b.style.color = (x === v) ? '#1a1208' : '';
      });
      renderAgents();
    }

    function renderAgents() {
      const q = document.getElementById('agentSearch').value.toLowerCase();
      let list = DB.agents.filter(a => !q || (a.name || '').toLowerCase().includes(q) || (a.email || '').toLowerCase().includes(q));
      const tb = document.getElementById('agentTable');
      const ml = document.getElementById('agentMList');
      const tbWrap = document.getElementById('agentTableWrap');

      // Highlight active button when loaded
      ['card', 'table'].forEach(x => {
        const b = document.getElementById('btnAgentView' + x.charAt(0).toUpperCase() + x.slice(1));
        if (b) b.style.background = (x === _agentView) ? 'var(--gold)' : '';
        if (b) b.style.color = (x === _agentView) ? '#1a1208' : '';
      });

      const effectiveView = (window.innerWidth <= 768) ? 'card' : _agentView;

      if (effectiveView === 'table' && tbWrap) {
        if (ml) ml.style.display = 'none';
        tbWrap.style.display = '';
        if (!list.length) {
          tb.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:40px;color:var(--text3)">ยังไม่มีข้อมูล Agent</td></tr>`;
          return;
        }
        tb.innerHTML = list.map(a => {
          const ri = DB.agents.indexOf(a);
          return `<tr>
            <td style="color:var(--text3)">${ri + 1}</td>
            <td style="font-weight:600">${a.name || '-'}</td>
            <td>${a.company || '-'}</td>
            <td><span class="badge ${a.coagent === 'รับ' ? 'badge-both' : 'badge-sale'}">${a.coagent || '-'}</span></td>
            <td>${a.tel || '-'}</td>
            <td style="font-size:12px">${a.email ? `<a href="mailto:${a.email}" style="color:var(--blue)">${a.email}</a>` : '-'}</td>
            <td>${a.line || '-'}</td>
            <td>${a.linelink ? `<a href="${a.linelink.startsWith('http') ? a.linelink : 'https://line.me/ti/p/' + a.linelink}" target="_blank" style="color:var(--green)">${a.linelink}</a>` : '-'}</td>
            <td style="font-size:12px">${a.bank || '-'}</td>
            <td><div style="display:flex;gap:5px">
              <button class="btn btn-outline btn-sm" onclick="editAgent(${ri})">✏️</button>
              <button class="btn btn-danger btn-sm" onclick="deleteItem('agents',${ri})">🗑️</button>
            </div></td>
          </tr>`;
        }).join('');
      } else {
        if (tbWrap) tbWrap.style.display = 'none';
        if (ml) ml.style.display = 'block';
        if (!list.length) {
          if (ml) ml.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text3)">ยังไม่มีข้อมูล Agent</div>`;
          return;
        }
        ml.innerHTML = list.map(a => {
          const ri = DB.agents.indexOf(a);
          const coB = a.coagent === 'รับ' ? 'badge-both' : 'badge-sale';
          return `<div class="m-card">
            <span class="m-card-num">#${ri + 1}</span>
            <div class="m-card-top">
              <div>
                <div class="m-card-name">${a.name || '-'}</div>
                <div class="m-card-sub">${a.company || ''}</div>
              </div>
              <span class="badge ${coB}" style="margin-top:2px">Co-Agent: ${a.coagent || '-'}</span>
            </div>
            ${a.tel ? `<div class="m-card-row"><span class="m-card-label">📞 เบอร์</span><span class="m-card-val"><a href="tel:${a.tel}" style="color:var(--text)">${a.tel}</a></span></div>` : ''}
            ${a.email ? `<div class="m-card-row"><span class="m-card-label">📧 Email</span><span class="m-card-val"><a href="mailto:${a.email}" style="color:var(--blue);font-size:13px">${a.email}</a></span></div>` : ''}
            ${a.line ? `<div class="m-card-row"><span class="m-card-label">💬 Line ID</span><span class="m-card-val">${a.line}</span></div>` : ''}
            ${a.linelink ? `<div class="m-card-row"><span class="m-card-label">🔗 Line@</span><span class="m-card-val"><a href="${a.linelink.startsWith('http') ? a.linelink : 'https://line.me/ti/p/' + a.linelink}" target="_blank" style="color:var(--green)">${a.linelink}</a></span></div>` : ''}
            ${a.bank ? `<div class="m-card-row"><span class="m-card-label">🏦 บัญชี</span><span class="m-card-val">${a.bank}</span></div>` : ''}
            <div class="m-card-actions">
              <button class="btn btn-outline" onclick="editAgent(${ri})">✏️ แก้ไข</button>
              <button class="btn btn-danger" onclick="deleteItem('agents',${ri})">🗑️ ลบ</button>
            </div>
          </div>`;
        }).join('');
      }
    }

    // ============================
    // CUSTOMERS
    function editAgent(i) {
      const a = DB.agents[i];
      document.getElementById('modalAgentTitle').textContent = '✏️ แก้ไข Agent';
      setV('ag_name', a.name); setV('ag_company', a.company); setV('ag_coagent', a.coagent);
      setV('ag_tel', a.tel); setV('ag_fb', a.fb); setV('ag_email', a.email || '');
      setV('ag_line', a.line); setV('ag_linelink', a.linelink); setV('ag_bank', a.bank);
      editMode = { type: 'agent', idx: i };
      document.getElementById('modalAgent').classList.add('open');
    }
