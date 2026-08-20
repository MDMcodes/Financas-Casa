(function(){
  const STORAGE_KEY = 'household-ledger-transactions-v1';
  const CAT_STORAGE_KEY = 'household-ledger-categories-v1';
  const monthNames = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];

  const DEFAULT_CATEGORIES = [
    'Moradia', 'Alimentação', 'Transporte', 'Saúde', 'Lazer',
    'Educação', 'Contas fixas', 'Salário', 'Outros'
  ];

  const dom = {};
  const element = id => dom[id] || (dom[id] = document.getElementById(id));
  const setVisible = (id, visible, display = 'block') => {
    element(id).style.display = visible ? display : 'none';
  };
  const setText = (id, text) => {
    element(id).textContent = text;
  };

  // Estado principal da aplicação.
  // transactions guarda todos os lançamentos e categories guarda as opções do seletor.
  let transactions = loadData();
  let categories = loadCategories();
  let currentDate = new Date();
  currentDate.setDate(1);

  // ===== Carregamento e persistência de dados =====
  // Aqui o app salva e lê os dados no localStorage do navegador.
  // Isso permite manter as informações mesmo após recarregar a página.
  function loadCategories(){
    try{
      const raw = localStorage.getItem(CAT_STORAGE_KEY);
      if(raw) return JSON.parse(raw);
      const seeded = DEFAULT_CATEGORIES.map((nome,i) => ({ id: 'c' + i, nome }));
      localStorage.setItem(CAT_STORAGE_KEY, JSON.stringify(seeded));
      return seeded;
    }catch(e){
      console.error('Erro ao ler categorias:', e);
      return DEFAULT_CATEGORIES.map((nome,i) => ({ id: 'c' + i, nome }));
    }
  }

  function saveCategories(){
    try{
      localStorage.setItem(CAT_STORAGE_KEY, JSON.stringify(categories));
      if(typeof scheduleAutoPush === 'function') scheduleAutoPush();
    }catch(e){
      console.error('Erro ao salvar categorias:', e);
    }
  }

  // Atualiza o seletor de categoria com as opções atuais.
  // Também tenta manter a categoria selecionada antes da recriação da lista.
  function renderCategorySelect(){
    const select = document.getElementById('categoria');
    const prevValue = select.value;
    select.innerHTML = '';
    categories.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.nome;
      opt.textContent = c.nome;
      select.appendChild(opt);
    });
    if(categories.some(c => c.nome === prevValue)){
      select.value = prevValue;
    }
  }

  // Monta a lista visual do gerenciador de categorias.
  // Cada item pode ser removido individualmente pelo botão da lixeira.
  function renderCategoryManager(){
    const list = document.getElementById('catList');
    list.innerHTML = '';
    categories.forEach(c => {
      const li = document.createElement('li');
      li.className = 'cat-row';
      li.innerHTML = `
        <div class="cat-info">
          <div class="cat-nome">${escapeHtml(c.nome)}</div>
        </div>
        <button type="button" class="del-btn" data-catid="${c.id}" aria-label="Excluir categoria">🗑</button>
      `;
      list.appendChild(li);
    });
  }

  // Lê a lista de transações armazenada no navegador.
  function loadData(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    }catch(e){
      console.error('Erro ao ler dados salvos:', e);
      return [];
    }
  }

  // Salva os lançamentos no localStorage e dispara sincronização automática, se existir.
  function saveData(){
    try{
      localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
      if(typeof scheduleAutoPush === 'function') scheduleAutoPush();
    }catch(e){
      console.error('Erro ao salvar dados:', e);
      alert('Não foi possível salvar os dados neste navegador.');
    }
  }

  // Formata valores em moeda brasileira, ex: R$ 1.234,56.
  function fmtBRL(n){
    return n.toLocaleString('pt-BR', { style:'currency', currency:'BRL' });
  }

  // Gera a chave do mês para comparar datas em formato YYYY-MM.
  function monthKey(d){
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
  }

  // Pega a chave do mês da transação a partir da sua data.
  function txMonthKey(tx){
    return tx.data.slice(0,7);
  }

  // Soma o saldo até o mês informado, somando receitas e subtraindo despesas.
  function cumulativeBalanceUpTo(mKey){
    let total = 0;
    transactions.forEach(t => {
      if(txMonthKey(t) <= mKey){
        total += (t.tipo === 'receita' ? t.valor : -t.valor);
      }
    });
    return total;
  }

  // ===== Renderização dos dados na tela =====
  // Esta função atualiza o mês atual, os totais do mês e a lista de lançamentos.
  // Também recalcula o saldo acumulado e monta os gráficos de barras por categoria.
  function render(){
    setText('monthLabel', monthNames[currentDate.getMonth()] + ' de ' + currentDate.getFullYear());

    const mKey = monthKey(currentDate);
    const monthTx = transactions
      .filter(t => txMonthKey(t) === mKey)
      .sort((a,b) => b.data.localeCompare(a.data));

    let receitas = 0, despesas = 0;
    monthTx.forEach(t => {
      if(t.tipo === 'receita') receitas += t.valor;
      else despesas += t.valor;
    });
    const netMes = receitas - despesas;
    const saldoAcumulado = cumulativeBalanceUpTo(mKey);
    const saldoAnterior = saldoAcumulado - netMes;

    setText('valReceitas', fmtBRL(receitas));
    setText('valDespesas', fmtBRL(despesas));
    const saldoEl = element('valSaldo');
    saldoEl.textContent = fmtBRL(saldoAcumulado);
    saldoEl.style.color = saldoAcumulado < 0 ? 'var(--red)' : 'var(--ink)';

    setText('saldoSub', 'vindo do mês anterior: ' + fmtBRL(saldoAnterior));

    const list = element('ledgerList');
    list.innerHTML = '';
    setVisible('emptyState', !monthTx.length);

    monthTx.forEach(t => {
      const li = document.createElement('li');
      li.className = 'ledger-row';
      const dataFmt = new Date(t.data + 'T00:00:00').toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit'});
      const parcelaTag = t.parcelaTotal ? `<span class="tag tag-parcela">${t.parcelaAtual}/${t.parcelaTotal}</span>` : '';
      li.innerHTML = `
        <div class="ledger-main">
          <div class="desc">${escapeHtml(t.descricao)}</div>
          <div class="meta"><span class="tag">${escapeHtml(t.categoria)}</span>${parcelaTag}<span>${dataFmt}</span></div>
        </div>
        <div class="ledger-amount ${t.tipo}">${t.tipo === 'despesa' ? '-' : '+'} ${fmtBRL(t.valor)}</div>
        <div class="row-actions">
          <button class="edit-btn" data-id="${t.id}" aria-label="Editar lançamento">✏️</button>
          <button class="del-btn" data-id="${t.id}" aria-label="Excluir lançamento">🗑</button>
        </div>
      `;
      list.appendChild(li);
    });

    renderBreakdown(monthTx, 'despesa', 'breakdown', 'emptyBreakdown');
    renderBreakdown(monthTx, 'receita', 'breakdownReceitas', 'emptyBreakdownReceitas', true);
  }

  function renderBreakdown(monthTx, tipo, targetId, emptyId, income = false){
    const entries = monthTx
      .filter(t => t.tipo === tipo)
      .sort((a,b) => b.valor - a.valor);
    const target = element(targetId);
    target.innerHTML = '';
    setVisible(emptyId, !entries.length);

    const maxValue = entries.length ? entries[0].valor : 1;
    entries.forEach(t => {
      const pct = Math.max(4, Math.round((t.valor / maxValue) * 100));
      const label = `${t.descricao} - ${t.categoria}`;
      const row = document.createElement('div');
      row.className = 'breakdown-row';
      row.innerHTML = `
        <div class="bd-top"><span>${escapeHtml(label)}</span><span class="amt">${fmtBRL(t.valor)}</span></div>
        <div class="bar-track"><div class="bar-fill${income ? ' income' : ''}" style="width:${pct}%"></div></div>
      `;
      target.appendChild(row);
    });
  }

  // Escapa strings antes de inserir em HTML para evitar quebrar a página com caracteres especiais.
  function escapeHtml(str){
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ===== Navegação por mês =====
  // Botões para avançar ou voltar um mês na visão principal.
  document.getElementById('prevMonth').addEventListener('click', () => {
    currentDate.setMonth(currentDate.getMonth() - 1);
    render();
  });
  document.getElementById('nextMonth').addEventListener('click', () => {
    currentDate.setMonth(currentDate.getMonth() + 1);
    render();
  });

  // ===== Lógica de parcelamento =====
  // Essas funções ajudam a criar parcelas e ajustar datas para cada item do parcelamento.
  function addMonthsClamped(dateStr, monthsToAdd){
    const [y, m, d] = dateStr.split('-').map(Number);
    const target = new Date(y, (m - 1) + monthsToAdd, 1);
    const daysInTarget = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    target.setDate(Math.min(d, daysInTarget));
    return target.getFullYear() + '-' + String(target.getMonth()+1).padStart(2,'0') + '-' + String(target.getDate()).padStart(2,'0');
  }

  function splitInstallments(total, n){
    const normalizedTotal = Number(total) || 0;
    const normalizedN = Number(n) || 0;
    if(normalizedN <= 0) return [];
    const values = [];
    for(let i = 0; i < normalizedN; i++){
      values.push(normalizedTotal);
    }
    return values;
  }

  function readTransactionForm(){
    return {
      tipo: document.querySelector('input[name="tipo"]:checked').value,
      descricao: element('desc').value.trim(),
      valor: parseFloat(element('valor').value),
      data: element('data').value,
      categoria: element('categoria').value,
      isParcelado: element('isParcelado').checked,
      numParcelas: parseInt(element('numParcelas').value, 10) || 0,
      editTxId: element('editTxId').value,
      editGroupId: element('editGroupId').value
    };
  }

  // Reseta o formulário para o estado inicial de criação de um novo lançamento.
  function formResetState(){
    document.getElementById('txForm').reset();
    document.getElementById('editTxId').value = '';
    document.getElementById('editGroupId').value = '';
    document.getElementById('formTitle').textContent = 'Novo lançamento';
    document.getElementById('submitTxBtn').textContent = 'Adicionar lançamento';
    document.getElementById('tipoDespesa').checked = true;
    const numParcelasInput = document.getElementById('numParcelas');
    numParcelasInput.value = '2';
    numParcelasInput.disabled = true;
    document.getElementById('parcelaFields').style.display = 'none';
    document.getElementById('parcelaNote').style.display = 'none';
    document.getElementById('data').valueAsDate = new Date();
    updateParcelaLabels();
    updateParcelaPreview();
  }

  // Preenche o formulário com os dados de uma transação para edição.
  function fillFormWithTransaction(tx){
    formResetState();
    document.getElementById('editTxId').value = tx.id;
    document.getElementById('editGroupId').value = '';
    document.getElementById('desc').value = tx.descricao || '';
    document.getElementById('valor').value = tx.valor;
    document.getElementById('data').value = tx.data;
    document.getElementById('categoria').value = tx.categoria || '';
    const isDespesa = tx.tipo === 'despesa';
    document.getElementById('tipoDespesa').checked = isDespesa;
    document.getElementById('tipoReceita').checked = !isDespesa;
    const isParcelado = Boolean(tx.grupoId);
    document.getElementById('isParcelado').checked = isParcelado;
    const totalParcelas = tx.parcelaTotal || 1;
    const numParcelasInput = document.getElementById('numParcelas');
    numParcelasInput.value = totalParcelas;
    numParcelasInput.disabled = !isParcelado;
    document.getElementById('parcelaFields').style.display = isParcelado ? 'grid' : 'none';
    document.getElementById('parcelaNote').style.display = isParcelado ? 'block' : 'none';
    document.getElementById('formTitle').textContent = isParcelado ? 'Editar parcela do parcelamento' : 'Editar lançamento';
    document.getElementById('submitTxBtn').textContent = 'Salvar alterações';
    updateParcelaLabels();
    updateParcelaPreview();
    openSheet();
  }

  // Gera um identificador único para agrupar parcelas de um mesmo parcelamento.
  function genGroupId(){
    return 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2,6);
  }

  // Atualiza o texto de pré-visualização do parcelamento para o usuário ver o valor por parcela.
  function updateParcelaPreview(){
    const checked = document.getElementById('isParcelado').checked;
    const n = parseInt(document.getElementById('numParcelas').value, 10) || 0;
    const total = parseFloat(document.getElementById('valor').value) || 0;
    const preview = document.getElementById('parcelaPreview');
    const hint = document.getElementById('valorHint');
    const isDespesa = document.getElementById('tipoDespesa').checked;

    if(checked && n >= 2 && total > 0){
      preview.textContent = n + 'x de ' + fmtBRL(total);
      hint.textContent = isDespesa ? 'Valor de cada parcela' : 'Valor de cada parcela';
    } else {
      preview.textContent = '—';
      hint.textContent = '';
    }
  }

  // Ajusta o texto da label conforme o tipo de lançamento.
  function updateParcelaLabels(){
    const isDespesa = document.getElementById('tipoDespesa').checked;
    document.getElementById('parcelaLabelText').textContent = isDespesa ? 'Compra parcelada' : 'Recebimento parcelado (venda a prazo)';
  }

  // Quando o checkbox de parcelamento é ativado/desativado, ajusta a interface do formulário.
  document.getElementById('isParcelado').addEventListener('change', function(){
    const numParcelasInput = document.getElementById('numParcelas');
    numParcelasInput.disabled = !this.checked;
    if(!this.checked){
      numParcelasInput.value = '2';
    }
    document.getElementById('parcelaFields').style.display = this.checked ? 'grid' : 'none';
    document.getElementById('parcelaNote').style.display = this.checked ? 'block' : 'none';
    updateParcelaPreview();
  });
  document.getElementById('numParcelas').addEventListener('input', updateParcelaPreview);
  document.getElementById('valor').addEventListener('input', updateParcelaPreview);
  document.querySelectorAll('input[name="tipo"]').forEach(r => {
    r.addEventListener('change', function(){
      updateParcelaLabels();
      updateParcelaPreview();
    });
  });

  // ===== Envio do formulário =====
  // Aqui acontece a criação, edição e parcelamento dos lançamentos.
  document.getElementById('txForm').addEventListener('submit', function(e){
    e.preventDefault();
    const {
      tipo, descricao, valor, data, categoria, isParcelado,
      numParcelas, editTxId, editGroupId
    } = readTransactionForm();

    if(!descricao || !valor || !data){ return; }

    if(editGroupId){
      const groupTxs = transactions.filter(t => t.grupoId === editGroupId).sort((a,b) => a.parcelaAtual - b.parcelaAtual);
      const groupValues = splitInstallments(valor, numParcelas || groupTxs.length || 1);
      groupTxs.forEach((tx, index) => {
        const target = transactions.find(item => item.id === tx.id);
        if(!target) return;
        target.tipo = tipo;
        target.descricao = descricao;
        target.valor = groupValues[index] || valor;
        target.data = addMonthsClamped(data, index);
        target.categoria = categoria;
        target.grupoId = editGroupId;
        target.parcelaAtual = index + 1;
        target.parcelaTotal = numParcelas || groupTxs.length;
      });
    } else if(editTxId){
      const tx = transactions.find(t => t.id === editTxId);
      if(tx){
        tx.tipo = tipo;
        tx.descricao = descricao;
        tx.valor = valor;
        tx.data = data;
        tx.categoria = categoria;
        if(isParcelado && numParcelas >= 2){
          const existingGroup = tx.grupoId || genGroupId();
          tx.grupoId = existingGroup;
          tx.parcelaAtual = tx.parcelaAtual || 1;
          tx.parcelaTotal = numParcelas;
        } else if(tx.grupoId && !isParcelado){
          tx.grupoId = undefined;
          tx.parcelaAtual = undefined;
          tx.parcelaTotal = undefined;
        }
      }
    } else if(isParcelado && numParcelas >= 2){
      const values = splitInstallments(valor, numParcelas);
      const grupoId = genGroupId();
      for(let i = 0; i < numParcelas; i++){
        transactions.push({
          id: Date.now().toString(36) + Math.random().toString(36).slice(2,6) + i,
          tipo, descricao, valor: values[i],
          data: addMonthsClamped(data, i),
          categoria,
          grupoId, parcelaAtual: i + 1, parcelaTotal: numParcelas
        });
      }
    } else {
      transactions.push({
        id: Date.now().toString(36) + Math.random().toString(36).slice(2,6),
        tipo, descricao, valor, data, categoria
      });
    }
    saveData();

    // jump view to the month of the new entry (1ª parcela)
    const [y,m] = data.split('-').map(Number);
    currentDate = new Date(y, m-1, 1);

    formResetState();
    closeSheet();
    render();
  });

  // ===== Edição e exclusão =====
  // A lista principal também trata ações de editar e apagar lançamentos.
  // Se o item for parte de um parcelamento, o usuário pode escolher modificar/excluir toda a série.
  document.getElementById('ledgerList').addEventListener('click', function(e){
    const editBtn = e.target.closest('.edit-btn');
    if(editBtn){
      const id = editBtn.getAttribute('data-id');
      const tx = transactions.find(t => t.id === id);
      if(!tx) return;
      if(tx.grupoId && transactions.filter(t => t.grupoId === tx.grupoId).length > 1){
        const editarTudo = confirm(
          'Esta é a parcela ' + tx.parcelaAtual + ' de ' + tx.parcelaTotal + '.\n\n' +
          'Clique OK para editar TODAS as parcelas desta compra, ou Cancelar para editar apenas esta parcela.'
        );
        if(editarTudo){
          const group = transactions.filter(t => t.grupoId === tx.grupoId).sort((a,b) => a.parcelaAtual - b.parcelaAtual);
          const first = group[0];
          formResetState();
          document.getElementById('editGroupId').value = tx.grupoId;
          document.getElementById('editTxId').value = '';
          document.getElementById('desc').value = first.descricao;
          document.getElementById('valor').value = first.valor;
          document.getElementById('data').value = first.data;
          document.getElementById('categoria').value = first.categoria;
          document.getElementById('tipoDespesa').checked = first.tipo === 'despesa';
          document.getElementById('tipoReceita').checked = first.tipo === 'receita';
          document.getElementById('isParcelado').checked = true;
          const numParcelasInput = document.getElementById('numParcelas');
          numParcelasInput.value = first.parcelaTotal;
          numParcelasInput.disabled = false;
          document.getElementById('parcelaFields').style.display = 'grid';
          document.getElementById('parcelaNote').style.display = 'block';
          document.getElementById('formTitle').textContent = 'Editar parcelamento';
          document.getElementById('submitTxBtn').textContent = 'Salvar alterações';
          updateParcelaLabels();
          updateParcelaPreview();
          openSheet();
          return;
        }
      }
      fillFormWithTransaction(tx);
      return;
    }

    const btn = e.target.closest('.del-btn');
    if(!btn) return;
    const id = btn.getAttribute('data-id');
    const tx = transactions.find(t => t.id === id);
    if(!tx) return;

    if(tx.grupoId){
      const excluirTudo = confirm(
        'Esta é a parcela ' + tx.parcelaAtual + ' de ' + tx.parcelaTotal + '.\n\n' +
        'Clique OK para excluir TODAS as parcelas desta compra, ou Cancelar para excluir apenas esta parcela.'
      );
      if(excluirTudo){
        transactions = transactions.filter(t => t.grupoId !== tx.grupoId);
      } else {
        transactions = transactions.filter(t => t.id !== id);
      }
    } else {
      transactions = transactions.filter(t => t.id !== id);
    }
    saveData();
    render();
  });

  // ===== Painel do formulário mobile =====
  // Abre e fecha o formulário em estilo sheet, útil em telas menores.
  const formPanel = document.getElementById('form-panel');
  function openSheet(options = {}){
    const { scrollToForm = false } = options;
    formPanel.classList.add('open');
    if(scrollToForm && window.innerWidth <= 760){
      formPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }
  function closeSheet(){
    formPanel.classList.remove('open');
  }
  document.getElementById('fabAdd').addEventListener('click', () => openSheet({ scrollToForm: true }));
  document.getElementById('sheetClose').addEventListener('click', closeSheet);

  // ===== Gerenciamento de categorias =====
  // Abre ou fecha o painel de categorias para criar e remover itens da lista.
  document.getElementById('openCatManager').addEventListener('click', function(){
    const panel = document.getElementById('catManagerPanel');
    const isOpen = panel.style.display !== 'none';
    panel.style.display = isOpen ? 'none' : 'block';
    if(!isOpen) panel.scrollIntoView({ behavior:'smooth', block:'nearest' });
  });

  // Adiciona uma nova categoria no sistema.
  document.getElementById('catForm').addEventListener('submit', function(e){
    e.preventDefault();
    const nomeInput = document.getElementById('catNome');
    const nome = nomeInput.value.trim();
    if(!nome) return;

    if(categories.some(c => c.nome.toLowerCase() === nome.toLowerCase())){
      alert('Já existe uma categoria com esse nome.');
      return;
    }

    categories.push({ id: 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2,5), nome });
    saveCategories();
    renderCategorySelect();
    renderCategoryManager();
    this.reset();
    document.getElementById('categoria').value = nome;
  });

  // Remove uma categoria e mostra confirmação para evitar exclusão acidental.
  document.getElementById('catList').addEventListener('click', function(e){
    const btn = e.target.closest('.del-btn');
    if(!btn) return;
    const catId = btn.getAttribute('data-catid');
    const cat = categories.find(c => c.id === catId);
    if(!cat) return;

    const emUso = transactions.some(t => t.categoria === cat.nome);
    const msg = emUso
      ? `A categoria "${cat.nome}" está sendo usada em lançamentos existentes. Eles vão manter o nome da categoria, mas ela sairá da lista de opções. Excluir mesmo assim?`
      : `Excluir a categoria "${cat.nome}"?`;
    if(!confirm(msg)) return;

    categories = categories.filter(c => c.id !== catId);
    saveCategories();
    renderCategorySelect();
    renderCategoryManager();
    render();
  });

  // ===== Backup local =====
  // Exporta todos os dados para um arquivo JSON no computador do usuário.
  document.getElementById('exportBackup').addEventListener('click', function(){
    const payload = {
      app: 'financas-casa',
      exportedAt: new Date().toISOString(),
      transactions,
      categories
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const dateStr = new Date().toISOString().slice(0,10);
    a.href = url;
    a.download = `backup-financas-casa-${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    document.getElementById('backupStatus').textContent = 'Backup exportado agora há pouco. Guarde o arquivo em um lugar seguro.';
  });

  // Importa um backup JSON e substitui os dados locais com confirmação do usuário.
  document.getElementById('importBackup').addEventListener('change', function(e){
    const file = e.target.files[0];
    if(!file) return;
    const statusEl = document.getElementById('backupStatus');
    const reader = new FileReader();
    reader.onload = function(evt){
      try{
        const data = JSON.parse(evt.target.result);
        if(!Array.isArray(data.transactions) || !Array.isArray(data.categories)){
          throw new Error('formato inválido');
        }
        const quando = data.exportedAt ? new Date(data.exportedAt).toLocaleString('pt-BR') : 'data desconhecida';
        const confirmMsg = `Esse backup tem ${data.transactions.length} lançamento(s) e foi exportado em ${quando}.\n\nIsso vai SUBSTITUIR todos os dados salvos neste navegador agora. Quer continuar?`;
        if(!confirm(confirmMsg)){ e.target.value = ''; return; }

        transactions = data.transactions;
        categories = data.categories;
        saveData();
        saveCategories();
        renderCategorySelect();
        renderCategoryManager();
        render();
        statusEl.textContent = 'Backup importado com sucesso.';
      }catch(err){
        alert('Não foi possível ler esse arquivo. Verifique se é um backup .json exportado por este site.');
      } finally {
        e.target.value = '';
      }
    };
    reader.readAsText(file);
  });

  // ===================== Sincronização com o Google Drive =====================
  // Essa parte conecta o app ao Google Drive para salvar backups na nuvem,
  // permitindo importar/exportar dados de forma centralizada.
  const DRIVE_CLIENT_ID_KEY = 'household-ledger-drive-client-id';
  const DRIVE_AUTO_SYNC_KEY = 'household-ledger-drive-autosync';
  const DRIVE_CONNECTED_KEY = 'household-ledger-drive-connected';
  const DRIVE_FILE_NAME = 'financas-casa-backup.json';
  const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

  let driveClientId = localStorage.getItem(DRIVE_CLIENT_ID_KEY) || '';
  let driveTokenClient = null;
  let driveAccessToken = null;
  let driveFileId = null;
  let driveAutoSync = localStorage.getItem(DRIVE_AUTO_SYNC_KEY) === 'true';
  let drivePushTimer = null;
  let driveIsAutoAttempt = false;

  // Retorna o elemento que mostra a mensagem de status do Drive.
  function driveStatusEl(){ return document.getElementById('driveStatusText'); }

  // Atualiza a interface de sincronização conforme o estado da conexão.
  function renderDriveUI(){
    const setupEl = document.getElementById('driveSetup');
    const connectedEl = document.getElementById('driveConnected');

    if(!driveClientId){
      setupEl.style.display = 'block';
      connectedEl.style.display = 'none';
      return;
    }
    setupEl.style.display = 'none';
    connectedEl.style.display = 'block';

    const connectBtn = document.getElementById('driveConnectBtn');
    const pushBtn = document.getElementById('drivePushBtn');
    const pullBtn = document.getElementById('drivePullBtn');
    const disconnectBtn = document.getElementById('driveDisconnectBtn');
    const autoSyncWrap = document.getElementById('autoSyncWrap');
    const autoSyncToggle = document.getElementById('autoSyncToggle');

    if(driveAccessToken){
      connectBtn.style.display = 'none';
      pushBtn.style.display = 'inline-flex';
      pullBtn.style.display = 'inline-flex';
      disconnectBtn.style.display = 'inline-flex';
      autoSyncWrap.style.display = 'flex';
      autoSyncToggle.checked = driveAutoSync;
    } else {
      connectBtn.style.display = 'inline-flex';
      pushBtn.style.display = 'none';
      pullBtn.style.display = 'none';
      disconnectBtn.style.display = 'none';
      autoSyncWrap.style.display = 'none';
    }
  }

  // Escreve uma mensagem no painel de status do Drive.
  function setDriveStatus(text){
    const el = driveStatusEl();
    if(el) el.textContent = text;
  }

  // Espera a biblioteca do Google carregar antes de tentar conectar.
  function ensureGisLoaded(cb){
    if(window.google && window.google.accounts && window.google.accounts.oauth2){ cb(); return; }
    let tries = 0;
    const iv = setInterval(() => {
      tries++;
      if(window.google && window.google.accounts && window.google.accounts.oauth2){
        clearInterval(iv);
        cb();
      } else if(tries > 40){
        clearInterval(iv);
        setDriveStatus('Não foi possível carregar a biblioteca do Google. Verifique sua conexão e recarregue a página.');
      }
    }, 250);
  }

  // Inicia o cliente OAuth do Google para pedir acesso ao Drive.
  function initDriveTokenClient(){
    if(!driveClientId) return;
    ensureGisLoaded(() => {
      driveTokenClient = google.accounts.oauth2.initTokenClient({
        client_id: driveClientId,
        scope: DRIVE_SCOPE,
        callback: handleDriveTokenResponse
      });

      // If the user connected before, try to reconnect silently (no login prompt)
      if(localStorage.getItem(DRIVE_CONNECTED_KEY) === 'true'){
        driveIsAutoAttempt = true;
        setDriveStatus('Reconectando à sua conta do Google Drive...');
        driveTokenClient.requestAccessToken({ prompt: '' });
      }
    });
  }

  // Trata a resposta da autenticação do Google e define o token de acesso.
  function handleDriveTokenResponse(resp){
    const wasAuto = driveIsAutoAttempt;
    driveIsAutoAttempt = false;

    if(resp.error){
      driveAccessToken = null;
      if(wasAuto){
        // Silent reconnect failed (session expired, cookies blocked, etc.) — just ask for a normal click, no scary error.
        setDriveStatus('Sua sessão anterior expirou. Clique em "Conectar ao Google Drive" pra continuar de onde parou.');
      } else {
        setDriveStatus('Não foi possível conectar: ' + resp.error + '. Tente novamente.');
      }
      renderDriveUI();
      return;
    }
    driveAccessToken = resp.access_token;
    localStorage.setItem(DRIVE_CONNECTED_KEY, 'true');
    setDriveStatus('Conectado. Procurando seu backup no Drive...');
    renderDriveUI();
    driveFindOrPrepareFile();
  }

  // Faz chamadas à API do Drive com o token de autenticação do usuário.
  async function driveApiFetch(url, options){
    options = options || {};
    options.headers = Object.assign({}, options.headers, {
      'Authorization': 'Bearer ' + driveAccessToken
    });
    const res = await fetch(url, options);
    if(res.status === 401){
      driveAccessToken = null;
      renderDriveUI();
      setDriveStatus('Sua sessão do Drive expirou. Clique em "Conectar ao Google Drive" de novo.');
      throw new Error('token expirado');
    }
    return res;
  }

  // Procura o arquivo de backup no Drive e tenta criar um se não existir.
  async function driveFindOrPrepareFile(){
    try{
      const q = encodeURIComponent(`name='${DRIVE_FILE_NAME}' and trashed=false`);
      const res = await driveApiFetch(`https://www.googleapis.com/drive/v3/files?q=${q}&spaces=drive&fields=files(id,name,modifiedTime)`);
      const data = await res.json();
      if(data.files && data.files.length){
        driveFileId = data.files[0].id;
        setDriveStatus('Conectado. Backup encontrado no Drive (modificado em ' + new Date(data.files[0].modifiedTime).toLocaleString('pt-BR') + '). Use "Baixar do Drive" pra trazer esses dados, ou "Enviar para o Drive" pra subir os dados daqui.');
      } else {
        driveFileId = null;
        setDriveStatus('Conectado. Nenhum backup encontrado ainda no Drive — clique em "Enviar para o Drive" pra criar o primeiro.');
      }
    }catch(err){
      console.error(err);
    }
  }

  // Cria um novo arquivo JSON no Drive com os dados atuais do app.
  async function driveCreateFile(content){
    const metadata = { name: DRIVE_FILE_NAME, mimeType: 'application/json' };
    const boundary = 'ledgerbound' + Date.now();
    const body =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\nContent-Type: application/json\r\n\r\n${content}\r\n` +
      `--${boundary}--`;
    const res = await driveApiFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body
    });
    const data = await res.json();
    return data.id;
  }

  // Atualiza o conteúdo de um arquivo do Drive já existente.
  async function driveUpdateFile(fileId, content){
    await driveApiFetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: content
    });
  }

  // Envia os dados locais para o Drive.
  async function drivePush(silent){
    if(!driveAccessToken){ return; }
    try{
      const payload = JSON.stringify({
        app: 'financas-casa',
        exportedAt: new Date().toISOString(),
        transactions,
        categories
      }, null, 2);

      if(driveFileId){
        await driveUpdateFile(driveFileId, payload);
      } else {
        driveFileId = await driveCreateFile(payload);
      }
      setDriveStatus('Sincronizado com o Drive às ' + new Date().toLocaleTimeString('pt-BR') + '.');
    }catch(err){
      console.error(err);
      if(!silent) setDriveStatus('Não foi possível enviar para o Drive agora. Tente de novo em instantes.');
    }
  }

  // Carrega os dados do backup do Drive para o navegador, com confirmação.
  async function drivePull(){
    if(!driveAccessToken) return;
    if(!driveFileId){
      alert('Ainda não existe nenhum backup no Drive pra baixar. Use "Enviar para o Drive" primeiro.');
      return;
    }
    try{
      const res = await driveApiFetch(`https://www.googleapis.com/drive/v3/files/${driveFileId}?alt=media`);
      const data = await res.json();
      if(!Array.isArray(data.transactions) || !Array.isArray(data.categories)){
        throw new Error('formato inválido');
      }
      const confirmMsg = `O backup do Drive tem ${data.transactions.length} lançamento(s), exportado em ${data.exportedAt ? new Date(data.exportedAt).toLocaleString('pt-BR') : 'data desconhecida'}.\n\nIsso vai SUBSTITUIR os dados salvos neste navegador. Continuar?`;
      if(!confirm(confirmMsg)) return;

      transactions = data.transactions;
      categories = data.categories;
      saveData();
      saveCategories();
      renderCategorySelect();
      renderCategoryManager();
      render();
      setDriveStatus('Dados baixados do Drive com sucesso.');
    }catch(err){
      console.error(err);
      setDriveStatus('Não foi possível baixar o backup do Drive agora.');
    }
  }

  // Agenda uma sincronização automática após mudanças, evitando muitas requisições seguidas.
  function scheduleAutoPush(){
    if(!driveAutoSync || !driveAccessToken) return;
    clearTimeout(drivePushTimer);
    drivePushTimer = setTimeout(() => drivePush(true), 1200);
  }

  // Salva o Client ID do Google e inicializa a conexão.
  document.getElementById('saveClientId').addEventListener('click', function(){
    const val = document.getElementById('driveClientIdInput').value.trim();
    if(!val){ return; }
    driveClientId = val;
    localStorage.setItem(DRIVE_CLIENT_ID_KEY, driveClientId);
    renderDriveUI();
    initDriveTokenClient();
  });

  // Permite alterar o Client ID do Google e resetar a sessão atual.
  document.getElementById('editClientId').addEventListener('click', function(){
    driveClientId = '';
    driveAccessToken = null;
    driveFileId = null;
    localStorage.removeItem(DRIVE_CLIENT_ID_KEY);
    localStorage.removeItem(DRIVE_CONNECTED_KEY);
    document.getElementById('driveClientIdInput').value = '';
    renderDriveUI();
  });

  // Conecta o usuário à conta do Google para autorizar o acesso ao Drive.
  document.getElementById('driveConnectBtn').addEventListener('click', function(){
    if(!driveTokenClient){ initDriveTokenClient(); }
    setTimeout(() => {
      if(driveTokenClient){
        driveTokenClient.requestAccessToken({ prompt: driveAccessToken ? '' : 'consent' });
      }
    }, 300);
  });

  // Botões de sincronização: enviar, baixar e desconectar do Drive.
  document.getElementById('drivePushBtn').addEventListener('click', () => drivePush(false));
  document.getElementById('drivePullBtn').addEventListener('click', () => drivePull());

  document.getElementById('driveDisconnectBtn').addEventListener('click', function(){
    if(driveAccessToken && window.google && google.accounts && google.accounts.oauth2){
      google.accounts.oauth2.revoke(driveAccessToken, () => {});
    }
    driveAccessToken = null;
    driveFileId = null;
    localStorage.removeItem(DRIVE_CONNECTED_KEY);
    renderDriveUI();
    setDriveStatus('Desconectado.');
  });

  // Ativa ou desativa a sincronização automática com o Drive.
  document.getElementById('autoSyncToggle').addEventListener('change', function(){
    driveAutoSync = this.checked;
    localStorage.setItem(DRIVE_AUTO_SYNC_KEY, driveAutoSync ? 'true' : 'false');
    if(driveAutoSync) drivePush(true);
  });

  // Se já houver um Client ID salvo, inicializa a integração imediatamente.
  if(driveClientId){
    document.getElementById('driveClientIdInput').value = driveClientId;
    initDriveTokenClient();
  }
  renderDriveUI();
  // ===================== /Google Drive sync =====================

  // Default date field to today
  formResetState();
  document.getElementById('data').valueAsDate = new Date();
  updateParcelaLabels();

  renderCategorySelect();
  renderCategoryManager();
  render();
})();
