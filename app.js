/**
 * Mont' Açaí - Sistema PDV, Balança & Controle de Materiais
 * Lógica principal de vendas, auditoria de estoque (copos, isopores, colheres e tampas),
 * autenticação da proprietária e geração de relatórios.
 */

// Opções de embalagens
const PACKAGING_OPTIONS = [
  { id: 'copo_500', label: 'Copo de 500', volume: '500ml', icon: 'cup' },
  { id: 'copo_700', label: 'Copo de 700', volume: '700ml', icon: 'cup' },
  { id: 'isopor_500', label: 'Isopor de 500', volume: '500ml Térmico', icon: 'box' },
];

// Catálogo de Todos os Materiais Controlados pela Proprietária
const MATERIALS_CATALOG = [
  { key: 'copo_500', label: 'Copo de 500', unit: 'un', defaultStock: 100 },
  { key: 'copo_700', label: 'Copo de 700', unit: 'un', defaultStock: 100 },
  { key: 'isopor_500', label: 'Isopor de 500', unit: 'un', defaultStock: 50 },
  { key: 'colheres', label: 'Colheres Descartáveis', unit: 'un', defaultStock: 250 },
  { key: 'tampas', label: 'Tampas', unit: 'un', defaultStock: 150 },
];

// Formas de Pagamento
const PAYMENT_METHODS = [
  { id: 'PIX', label: 'PIX' },
  { id: 'DEBITO', label: 'Débito' },
  { id: 'CREDITO', label: 'Crédito' },
  { id: 'DINHEIRO', label: 'Dinheiro' },
];

// Estado Geral da Aplicação
const state = {
  transactions: [],
  initialStock: {
    copo_500: 100,
    copo_700: 100,
    isopor_500: 50,
    colheres: 250,
    tampas: 150,
  },
  isOwnerLoggedIn: false,
  ownerPassword: '1234',
  pendingOwnerAction: null,
  editingTxId: null,
  currentType: 'VENDA', // 'VENDA' | 'CONSUMO_INTERNO'
  selectedPackaging: PACKAGING_OPTIONS[0],
  selectedPayment: PAYMENT_METHODS[0].label,
  activeFilter: 'TODOS',
  customLogo: null,
};

function formatBRL(val) {
  return (Number(val) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatKg(grams) {
  return ((Number(grams) || 0) / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

function showToast(message) {
  const toast = document.getElementById('toast-notification');
  const msgEl = document.getElementById('toast-message');
  msgEl.textContent = message;
  toast.classList.remove('translate-y-20', 'opacity-0', 'pointer-events-none');
  setTimeout(() => {
    toast.classList.add('translate-y-20', 'opacity-0', 'pointer-events-none');
  }, 3200);
}

function getPackageKeyByLabel(label) {
  const found = PACKAGING_OPTIONS.find(p => p.label === label);
  return found ? found.id : null;
}

function loadAppData() {
  try {
    const savedPw = localStorage.getItem('mont_acai_owner_pw');
    if (savedPw) state.ownerPassword = savedPw;

    const savedStock = localStorage.getItem('mont_acai_stock_v1');
    if (savedStock) {
      state.initialStock = { ...state.initialStock, ...JSON.parse(savedStock) };
    }

    const raw = localStorage.getItem('acai_flow_v3');
    if (raw) {
      state.transactions = JSON.parse(raw);
    } else {
      state.transactions = [];
    }
  } catch (e) {
    state.transactions = [];
  }
}

function saveTransactions() {
  try {
    localStorage.setItem('acai_flow_v3', JSON.stringify(state.transactions));
  } catch (e) {
    console.error('Falha de armazenamento:', e);
  }
}

function saveStock() {
  try {
    localStorage.setItem('mont_acai_stock_v1', JSON.stringify(state.initialStock));
  } catch (e) {
    console.error('Erro ao salvar estoque:', e);
  }
}

function computeMaterialsUsage() {
  const usage = {};
  MATERIALS_CATALOG.forEach(mat => {
    usage[mat.key] = {
      key: mat.key,
      label: mat.label,
      initial: Number(state.initialStock[mat.key]) || 0,
      soldOut: 0,
      internalOut: 0,
      totalOut: 0,
      remaining: 0,
    };
  });

  state.transactions.forEach(tx => {
    const isVenda = tx.type === 'VENDA';
    const qty = Number(tx.quantity) || 0;
    const spoons = tx.spoons !== undefined ? Number(tx.spoons) : qty;
    const lids = tx.lids !== undefined ? Number(tx.lids) : 0;

    if (tx.extraMaterialKey && usage[tx.extraMaterialKey]) {
      usage[tx.extraMaterialKey].internalOut += qty;
    } else {
      const pkgKey = tx.packageKey || getPackageKeyByLabel(tx.packaging);
      if (pkgKey && usage[pkgKey]) {
        if (isVenda) usage[pkgKey].soldOut += qty;
        else usage[pkgKey].internalOut += qty;
      }
    }

    if (spoons > 0) {
      if (isVenda) usage.colheres.soldOut += spoons;
      else usage.colheres.internalOut += spoons;
    }
    if (lids > 0) {
      if (isVenda) usage.tampas.soldOut += lids;
      else usage.tampas.internalOut += lids;
    }
  });

  Object.values(usage).forEach(item => {
    item.totalOut = item.soldOut + item.internalOut;
    item.remaining = Math.max(0, item.initial - item.totalOut);
  });

  return usage;
}

function renderOwnerMaterialsPanel() {
  const grid = document.getElementById('materials-stock-grid');
  if (!grid) return;

  const usage = computeMaterialsUsage();
  grid.innerHTML = Object.values(usage).map(item => {
    const isLow = item.remaining <= 15;
    return `
      <div class="surface-card-subtle p-3.5 rounded-xl border ${isLow ? 'border-amber-700/70' : 'border-[#262030]'} flex flex-col justify-between space-y-2">
        <div>
          <div class="flex items-center justify-between gap-1">
            <span class="text-xs font-bold text-slate-100">${item.label}</span>
            ${isLow ? `<span class="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800">Baixo</span>` : ''}
          </div>
          <span class="text-[10px] text-slate-500 block">Inicial: ${item.initial} un</span>
        </div>

        <div class="pt-1 border-t border-[#221d2b] flex items-baseline justify-between">
          <div>
            <span class="text-[10px] text-slate-400 block">Saíram Hoje</span>
            <span class="text-sm font-bold text-rose-300">-${item.totalOut} un</span>
          </div>
          <div class="text-right">
            <span class="text-[10px] text-slate-400 block">Restam</span>
            <span class="text-base font-extrabold ${isLow ? 'text-[#fcd34d]' : 'text-[#6ee7b7]'}">${item.remaining} un</span>
          </div>
        </div>

        <div class="text-[10px] text-slate-500 flex justify-between">
          <span>Venda: ${item.soldOut}</span>
          <span>Int./Perda: ${item.internalOut}</span>
        </div>
      </div>
    `;
  }).join('');
}

function calculateMetrics() {
  let revenue = 0;
  let salesCount = 0;
  let soldUnits = 0;
  let totalWeightSold = 0;

  state.transactions.forEach(tx => {
    const qty = Number(tx.quantity) || 0;
    const weightTotal = (Number(tx.weight) || 0) * qty;

    if (tx.type === 'VENDA') {
      revenue += (Number(tx.total) || 0);
      salesCount += 1;
      soldUnits += qty;
      totalWeightSold += weightTotal;
    }
  });

  const usage = computeMaterialsUsage();
  const totalCupsOut = usage.copo_500.totalOut + usage.copo_700.totalOut + usage.isopor_500.totalOut;
  const avgTicket = salesCount > 0 ? (revenue / salesCount) : 0;

  document.getElementById('metric-revenue').textContent = `R$ ${formatBRL(revenue)}`;
  document.getElementById('metric-avg-ticket').textContent = `Ticket médio: R$ ${formatBRL(avgTicket)}`;
  document.getElementById('metric-sold-units').textContent = `${totalCupsOut} un`;
  document.getElementById('metric-cups-breakdown').textContent = `${soldUnits} vendas • ${totalCupsOut - soldUnits} interno`;
  document.getElementById('metric-total-weight').textContent = `${formatKg(totalWeightSold)} kg`;
  document.getElementById('metric-weight-grams').textContent = `${totalWeightSold.toLocaleString('pt-BR')}g pesados`;
  document.getElementById('metric-spoons-out').textContent = `${usage.colheres.totalOut} colheres`;
  document.getElementById('metric-lids-out').textContent = `${usage.tampas.totalOut} tampas utilizadas`;
  document.getElementById('tx-counter-text').textContent = `${state.transactions.length} registros gravados`;

  renderOwnerMaterialsPanel();
}

function renderPackagingButtons() {
  const container = document.getElementById('packaging-options');
  container.innerHTML = '';

  PACKAGING_OPTIONS.forEach(pkg => {
    const isSelected = state.selectedPackaging.id === pkg.id;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `p-3 rounded-xl text-center border text-xs font-semibold transition scale-tap flex flex-col items-center justify-center gap-1 ${
      isSelected 
        ? 'border-[#6b37ab] bg-[#2a1d3d] text-slate-100'
        : 'border-[#262030] bg-[#14111a] text-slate-400 hover:border-[#352d42] hover:text-slate-200'
    }`;

    const iconSvg = pkg.icon === 'box'
      ? `<svg class="w-5 h-5 ${isSelected ? 'text-purple-300' : 'text-slate-500'}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>`
      : `<svg class="w-5 h-5 ${isSelected ? 'text-purple-300' : 'text-slate-500'}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 8l1.5 12a2 2 0 002 2h5a2 2 0 002-2L18 8M5 8h14M9 4h6"/></svg>`;

    btn.innerHTML = `
      ${iconSvg}
      <span class="leading-tight mt-0.5">${pkg.label}</span>
      <span class="text-[10px] text-slate-500 font-normal">${pkg.volume}</span>
    `;
    btn.onclick = () => {
      state.selectedPackaging = pkg;
      renderPackagingButtons();
    };
    container.appendChild(btn);
  });
}

function renderPaymentButtons() {
  const container = document.getElementById('payment-methods');
  container.innerHTML = '';

  PAYMENT_METHODS.forEach(pm => {
    const isSelected = state.selectedPayment === pm.label;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `py-2.5 px-2 rounded-xl border text-xs font-semibold text-center transition scale-tap flex items-center justify-center gap-1 ${
      isSelected
        ? 'border-[#3b6e5c] bg-[#1c2e28] text-[#6ee7b7]'
        : 'border-[#262030] bg-[#14111a] text-slate-400 hover:border-[#352d42] hover:text-slate-200'
    }`;
    btn.textContent = pm.label;
    btn.onclick = () => {
      state.selectedPayment = pm.label;
      renderPaymentButtons();
    };
    container.appendChild(btn);
  });
}

function updateSubtotal() {
  const qtyInput = document.getElementById('input-qty');
  const valInput = document.getElementById('input-val');
  const subtotalEl = document.getElementById('display-subtotal');
  const formulaEl = document.getElementById('display-formula');

  const qty = parseInt(qtyInput.value, 10) || 1;
  const unitVal = parseFloat(valInput.value) || 0;

  if (state.currentType === 'CONSUMO_INTERNO') {
    subtotalEl.textContent = 'R$ 0,00';
    formulaEl.textContent = `${qty}x consumo interno (baixa apenas estoque)`;
  } else {
    const total = qty * unitVal;
    subtotalEl.textContent = `R$ ${formatBRL(total)}`;
    formulaEl.textContent = `${qty}x de R$ ${formatBRL(unitVal)}`;
  }
}

function setupTypeToggle() {
  const vendaBtn = document.getElementById('type-venda-btn');
  const consumoBtn = document.getElementById('type-consumo-btn');
  const valInput = document.getElementById('input-val');
  const paymentContainer = document.getElementById('payment-method-container');
  const notesLabel = document.getElementById('notes-label');
  const notesInput = document.getElementById('input-notes');

  vendaBtn.onclick = () => {
    state.currentType = 'VENDA';
    vendaBtn.className = 'py-2.5 px-3 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-2 bg-[#4c2478] text-white scale-tap';
    consumoBtn.className = 'py-2.5 px-3 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-2 text-slate-400 hover:text-slate-200 scale-tap';
    
    valInput.disabled = false;
    if (valInput.value === '0.00') valInput.value = '';
    paymentContainer.style.display = 'block';
    notesLabel.textContent = 'Observação (Opcional)';
    notesInput.placeholder = 'Ex: Morango e leite ninho, sem calda...';
    updateSubtotal();
  };

  consumoBtn.onclick = () => {
    state.currentType = 'CONSUMO_INTERNO';
    consumoBtn.className = 'py-2.5 px-3 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-2 bg-[#6b4c1b] text-amber-100 scale-tap';
    vendaBtn.className = 'py-2.5 px-3 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-2 text-slate-400 hover:text-slate-200 scale-tap';
    
    valInput.disabled = true;
    valInput.value = '0.00';
    paymentContainer.style.display = 'none';
    notesLabel.textContent = 'Colaborador / Motivo do Consumo';
    notesInput.placeholder = 'Ex: Lanche da tarde (João)';
    updateSubtotal();
  };
}

function resetEditMode() {
  state.editingTxId = null;
  document.getElementById('form-header-title').innerHTML = `
    <svg class="w-5 h-5 text-purple-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v3m0 0v3m0-3h3m-3-3H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
    Novo Lançamento
  `;
  document.getElementById('form-mode-badge').textContent = 'Balança & Materiais';
  document.getElementById('form-mode-badge').className = 'text-[11px] text-slate-300 font-medium bg-[#251f30] px-2.5 py-1 rounded-md border border-[#342c44]';
  document.getElementById('btn-submit-text').textContent = 'Confirmar e Dar Baixa nos Materiais';
  document.getElementById('btn-cancel-edit').classList.add('hidden');

  document.getElementById('input-weight').value = '';
  if (state.currentType === 'VENDA') document.getElementById('input-val').value = '';
  document.getElementById('input-qty').value = '1';
  document.getElementById('input-spoons').value = '1';
  document.getElementById('input-lids').value = '0';
  document.getElementById('input-notes').value = '';
  updateSubtotal();
}

function handleCreateTransaction() {
  const weightInput = document.getElementById('input-weight');
  const valInput = document.getElementById('input-val');
  const qtyInput = document.getElementById('input-qty');
  const spoonsInput = document.getElementById('input-spoons');
  const lidsInput = document.getElementById('input-lids');
  const notesInput = document.getElementById('input-notes');

  const weight = parseFloat(weightInput.value);
  const val = parseFloat(valInput.value);
  const qty = parseInt(qtyInput.value, 10) || 1;
  const spoons = Math.max(0, parseInt(spoonsInput.value, 10) || 0);
  const lids = Math.max(0, parseInt(lidsInput.value, 10) || 0);

  if (!weight || weight <= 0) {
    showToast('Informe o peso aferido na balança (em gramas)!');
    weightInput.focus();
    return;
  }

  if (state.currentType === 'VENDA' && (isNaN(val) || val <= 0)) {
    showToast('Informe o valor da venda!');
    valInput.focus();
    return;
  }

  const isVenda = state.currentType === 'VENDA';
  const finalPrice = isVenda ? val : 0;

  if (state.editingTxId) {
    const index = state.transactions.findIndex(t => t.id === state.editingTxId);
    if (index !== -1) {
      state.transactions[index] = {
        ...state.transactions[index],
        packaging: state.selectedPackaging.label,
        packageKey: state.selectedPackaging.id,
        weight: weight,
        quantity: qty,
        spoons: spoons,
        lids: lids,
        unitPrice: finalPrice,
        total: qty * finalPrice,
        type: state.currentType,
        paymentMethod: isVenda ? state.selectedPayment : 'Consumo Equipe',
        notes: notesInput.value.trim(),
      };
      saveTransactions();
      renderTransactions();
      calculateMetrics();
      resetEditMode();
      showToast('Venda alterada com sucesso pela proprietária!');
      return;
    }
  }

  const now = new Date();
  const timeFormatted = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  const newTx = {
    id: 'tx-' + Date.now(),
    timestamp: timeFormatted,
    packaging: state.selectedPackaging.label,
    packageKey: state.selectedPackaging.id,
    weight: weight,
    quantity: qty,
    spoons: spoons,
    lids: lids,
    unitPrice: finalPrice,
    total: qty * finalPrice,
    type: state.currentType,
    paymentMethod: isVenda ? state.selectedPayment : 'Consumo Equipe',
    notes: notesInput.value.trim(),
  };

  state.transactions.unshift(newTx);
  saveTransactions();
  renderTransactions();
  calculateMetrics();

  resetEditMode();
  showToast(isVenda ? 'Venda e saída de materiais registradas!' : 'Consumo interno e materiais registrados!');
}

// Exige SEMPRE digitar a senha da proprietária para editar ou excluir vendas
function promptOwnerPasswordAlways(title, subtitle, actionCallback) {
  state.pendingOwnerAction = actionCallback;
  document.getElementById('auth-modal-title').textContent = title || 'Senha da Proprietária';
  document.getElementById('auth-modal-subtitle').textContent = subtitle || 'Digite a senha para autorizar esta operação';
  document.getElementById('input-owner-password').value = '';
  document.getElementById('modal-owner-login').classList.remove('hidden');
  document.getElementById('input-owner-password').focus();
}

window.editTx = function(id) {
  const tx = state.transactions.find(t => t.id === id);
  if (!tx) return;
  if (tx.extraMaterialKey) {
    showToast('Baixas avulsas de material só podem ser excluídas.');
    return;
  }

  promptOwnerPasswordAlways(
    'Editar Venda / Lançamento',
    'Somente a proprietária pode editar. Digite a senha:',
    () => {
      state.editingTxId = tx.id;
      const pkg = PACKAGING_OPTIONS.find(p => p.id === tx.packageKey || p.label === tx.packaging) || PACKAGING_OPTIONS[0];
      state.selectedPackaging = pkg;
      renderPackagingButtons();

      if (tx.type === 'VENDA') {
        document.getElementById('type-venda-btn').click();
        state.selectedPayment = tx.paymentMethod || 'PIX';
        renderPaymentButtons();
        document.getElementById('input-val').value = tx.unitPrice;
      } else {
        document.getElementById('type-consumo-btn').click();
      }

      document.getElementById('input-weight').value = tx.weight;
      document.getElementById('input-qty').value = tx.quantity || 1;
      document.getElementById('input-spoons').value = tx.spoons !== undefined ? tx.spoons : (tx.quantity || 1);
      document.getElementById('input-lids').value = tx.lids || 0;
      document.getElementById('input-notes').value = tx.notes || '';

      document.getElementById('form-header-title').innerHTML = `<span class="text-[#fcd34d]">✏️ Editando Venda (${tx.timestamp})</span>`;
      document.getElementById('form-mode-badge').textContent = 'Modo Edição';
      document.getElementById('form-mode-badge').className = 'text-[11px] text-[#fcd34d] font-semibold bg-[#2e2518] px-2.5 py-1 rounded-md border border-[#453722]';
      document.getElementById('btn-submit-text').textContent = 'Salvar Alterações da Venda';
      document.getElementById('btn-cancel-edit').classList.remove('hidden');

      updateSubtotal();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      showToast('Modo de edição liberado. Altere os dados ao lado e clique em Salvar.');
    }
  );
};

window.deleteTx = function(id) {
  promptOwnerPasswordAlways(
    'Excluir Venda / Lançamento',
    'Somente a proprietária pode excluir. Digite a senha:',
    () => {
      state.transactions = state.transactions.filter(t => t.id !== id);
      if (state.editingTxId === id) resetEditMode();
      saveTransactions();
      renderTransactions();
      calculateMetrics();
      showToast('Registro excluído com autorização da proprietária.');
    }
  );
};

function renderTransactions() {
  const listContainer = document.getElementById('tx-list-container');
  const filtered = state.transactions.filter(tx => {
    if (state.activeFilter === 'TODOS') return true;
    return tx.type === state.activeFilter;
  });

  if (filtered.length === 0) {
    listContainer.innerHTML = `
      <div class="py-14 text-center text-slate-500">
        <svg class="w-10 h-10 mx-auto text-slate-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"/></svg>
        <p class="text-xs">Nenhum lançamento encontrado para este filtro.</p>
      </div>
    `;
    return;
  }

  listContainer.innerHTML = filtered.map(tx => {
    const isVenda = tx.type === 'VENDA';
    const qty = Number(tx.quantity) || 1;
    const spoons = tx.spoons !== undefined ? Number(tx.spoons) : qty;
    const lids = tx.lids !== undefined ? Number(tx.lids) : 0;
    const totalItemWeight = (Number(tx.weight) || 0) * qty;
    const weightFormatted = tx.weight ? `${qty > 1 ? `${qty}x ${tx.weight}g (${totalItemWeight}g)` : `${tx.weight}g`}` : 'Baixa Material';

    return `
      <div class="py-3 px-2 flex items-center justify-between gap-3 group hover:bg-[#15121c] rounded-xl transition">
        <div class="space-y-1">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="font-semibold text-sm text-slate-100">${qty > 1 && !tx.extraMaterialKey ? `${qty}x ` : ''}${tx.packaging || 'Açaí'}</span>
            ${tx.weight ? `
              <span class="px-2 py-0.5 text-[10px] font-medium rounded-md bg-[#221f2e] text-slate-300 border border-[#312c42]">
                ${weightFormatted}
              </span>
            ` : ''}
            ${spoons > 0 ? `
              <span class="px-2 py-0.5 text-[10px] font-medium rounded-md bg-[#2a2317] text-[#fcd34d] border border-[#3d3220]">
                ${spoons} colher${spoons > 1 ? 'es' : ''}
              </span>
            ` : ''}
            ${lids > 0 ? `
              <span class="px-2 py-0.5 text-[10px] font-medium rounded-md bg-[#261e36] text-purple-200 border border-[#382b4f]">
                ${lids} tampa${lids > 1 ? 's' : ''}
              </span>
            ` : ''}
            <span class="px-2 py-0.5 text-[10px] font-semibold rounded-md ${
              isVenda
                ? 'bg-[#1d2e28] text-[#6ee7b7] border border-[#2b473d]'
                : 'bg-[#2e2518] text-[#fcd34d] border border-[#453722]'
            }">
              ${isVenda ? 'Venda' : 'Consumo / Baixa'}
            </span>
          </div>
          <div class="text-xs text-slate-400 flex flex-wrap items-center gap-1.5">
            <span>${tx.paymentMethod}</span>
            ${tx.notes ? `<span>•</span> <span class="text-slate-400 italic text-[11px]">"${tx.notes}"</span>` : ''}
          </div>
        </div>

        <div class="flex items-center gap-1.5">
          <div class="text-right mr-1.5">
            <div class="text-sm font-bold ${isVenda ? 'text-[#6ee7b7]' : 'text-slate-400'}">
              ${isVenda ? `R$ ${formatBRL(tx.total)}` : 'R$ 0,00'}
            </div>
            <div class="text-[10px] text-slate-500">${tx.timestamp}</div>
          </div>
          ${!tx.extraMaterialKey ? `
            <button onclick="editTx('${tx.id}')" title="Editar Venda (Exige Senha da Proprietária)" class="text-slate-400 hover:text-purple-300 p-1.5 hover:bg-[#241e2e] rounded-lg transition scale-tap flex items-center gap-1 border border-transparent hover:border-[#382e4a]">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
            </button>
          ` : ''}
          <button onclick="deleteTx('${tx.id}')" title="Excluir Venda (Exige Senha da Proprietária)" class="text-slate-400 hover:text-rose-400 p-1.5 hover:bg-[#241e2e] rounded-lg transition scale-tap flex items-center gap-1 border border-transparent hover:border-rose-900/50">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function updateOwnerUI() {
  const panel = document.getElementById('owner-materials-panel');
  const roleBadge = document.getElementById('role-badge');
  const btnLabel = document.getElementById('btn-owner-label');

  if (state.isOwnerLoggedIn) {
    panel.classList.remove('hidden');
    roleBadge.className = 'inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-semibold bg-[#35234d] text-purple-200 border border-[#4c346e]';
    roleBadge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-purple-300 mr-1.5"></span>Modo Proprietária Ativo`;
    btnLabel.textContent = 'Painel da Proprietária (Ativo)';
    renderOwnerMaterialsPanel();
  } else {
    panel.classList.add('hidden');
    roleBadge.className = 'inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-semibold bg-[#232f29] text-[#6ee7b7] border border-[#2f4239]';
    roleBadge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-[#34d399] mr-1.5"></span>Modo Balcão (PDV)`;
    btnLabel.textContent = 'Login Proprietária';
  }
}

function buildReportData() {
  const now = new Date();
  const dateStr = now.toLocaleDateString('pt-BR');
  const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  const timestamps = state.transactions.map(t => t.timestamp).filter(Boolean);
  const firstTime = timestamps.length > 0 ? timestamps[timestamps.length - 1] : timeStr;
  const lastTime = timestamps.length > 0 ? timestamps[0] : timeStr;

  let revenue = 0;
  let salesTxCount = 0;
  let soldUnits = 0;
  let soldWeight = 0;
  let internalUnits = 0;
  let internalWeight = 0;

  const payments = {};
  PAYMENT_METHODS.forEach(pm => {
    payments[pm.label] = { count: 0, total: 0 };
  });

  const internalItems = [];

  state.transactions.forEach(tx => {
    const qty = Number(tx.quantity) || 1;
    const itemWeight = (Number(tx.weight) || 0) * qty;

    if (tx.type === 'VENDA') {
      const val = Number(tx.total) || 0;
      revenue += val;
      salesTxCount += 1;
      soldUnits += qty;
      soldWeight += itemWeight;

      const pm = tx.paymentMethod || 'Outros';
      if (!payments[pm]) payments[pm] = { count: 0, total: 0 };
      payments[pm].count += 1;
      payments[pm].total += val;
    } else {
      if (!tx.extraMaterialKey) {
        internalUnits += qty;
      }
      internalWeight += itemWeight;
      internalItems.push(tx);
    }
  });

  const materialsUsage = computeMaterialsUsage();
  const totalCupsOut = materialsUsage.copo_500.totalOut + materialsUsage.copo_700.totalOut + materialsUsage.isopor_500.totalOut;
  const avgTicket = salesTxCount > 0 ? (revenue / salesTxCount) : 0;
  const avgPricePerKg = soldWeight > 0 ? (revenue / (soldWeight / 1000)) : 0;
  const totalWeightOut = soldWeight + internalWeight;

  return {
    dateStr,
    timeStr,
    firstTime,
    lastTime,
    revenue,
    salesTxCount,
    soldUnits,
    soldWeight,
    internalUnits,
    internalWeight,
    avgTicket,
    avgPricePerKg,
    totalWeightOut,
    totalCupsOut,
    payments,
    materialsUsage,
    internalItems,
    totalRecords: state.transactions.length
  };
}

function populateClosingReport() {
  const data = buildReportData();

  document.getElementById('report-badge-date').textContent = data.dateStr;
  document.getElementById('report-period-subtitle').textContent =
    `Mont' Açaí • Turno das ${data.firstTime} às ${data.lastTime} (${data.totalRecords} lançamentos)`;

  document.getElementById('rep-kpi-revenue').textContent = `R$ ${formatBRL(data.revenue)}`;
  document.getElementById('rep-kpi-sales-count').textContent = `${data.salesTxCount} vendas (${data.soldUnits} copos/isop.)`;
  document.getElementById('rep-kpi-ticket').textContent = `R$ ${formatBRL(data.avgTicket)}`;
  document.getElementById('rep-kpi-price-kg').textContent = `Média: R$ ${formatBRL(data.avgPricePerKg)} / kg`;
  document.getElementById('rep-kpi-packages').textContent = `${data.totalCupsOut} un`;
  document.getElementById('rep-kpi-packages-detail').textContent = `${data.soldUnits} venda • ${data.totalCupsOut - data.soldUnits} int./perda`;
  document.getElementById('rep-kpi-spoons').textContent = `${data.materialsUsage.colheres.totalOut} colheres`;
  document.getElementById('rep-kpi-lids').textContent = `${data.materialsUsage.tampas.totalOut} tampas saídas`;

  const matRows = Object.values(data.materialsUsage).map(mat => {
    return `
      <tr class="text-slate-200">
        <td class="py-2.5 font-semibold">${mat.label}</td>
        <td class="py-2.5 text-center text-slate-400">${mat.initial} un</td>
        <td class="py-2.5 text-center text-slate-300">${mat.soldOut} un</td>
        <td class="py-2.5 text-center ${mat.internalOut > 0 ? 'text-[#fcd34d]' : 'text-slate-500'}">${mat.internalOut} un</td>
        <td class="py-2.5 text-center font-bold text-rose-300">-${mat.totalOut} un</td>
        <td class="py-2.5 text-right font-bold text-[#6ee7b7]">${mat.remaining} un</td>
      </tr>
    `;
  }).join('');
  document.getElementById('rep-table-materials-audit').innerHTML = matRows;

  const paymentRows = Object.entries(data.payments).map(([method, info]) => {
    const pct = data.revenue > 0 ? ((info.total / data.revenue) * 100).toFixed(1).replace('.', ',') : '0,0';
    return `
      <tr class="text-slate-200">
        <td class="py-2.5 font-semibold">${method}</td>
        <td class="py-2.5 text-center text-slate-400">${info.count}</td>
        <td class="py-2.5 text-center text-slate-400">${pct}%</td>
        <td class="py-2.5 text-right font-bold ${info.total > 0 ? 'text-[#6ee7b7]' : 'text-slate-500'}">R$ ${formatBRL(info.total)}</td>
      </tr>
    `;
  }).join('');

  document.getElementById('rep-table-payments').innerHTML = paymentRows + `
    <tr class="border-t border-[#2f283d] text-slate-100 font-bold bg-[#1a1624]">
      <td class="py-2.5 pl-2">TOTAL RECEBIDO</td>
      <td class="py-2.5 text-center">${data.salesTxCount}</td>
      <td class="py-2.5 text-center">100%</td>
      <td class="py-2.5 pr-2 text-right text-[#6ee7b7]">R$ ${formatBRL(data.revenue)}</td>
    </tr>
  `;

  document.getElementById('rep-internal-summary-badge').textContent =
    `${data.internalItems.length} ocorrências`;

  const internalContainer = document.getElementById('rep-internal-list');
  if (data.internalItems.length === 0) {
    internalContainer.innerHTML = `<p class="text-slate-500 italic">Nenhum consumo interno ou perda avulsa registrada neste turno.</p>`;
  } else {
    internalContainer.innerHTML = data.internalItems.map(item => {
      const qty = Number(item.quantity) || 1;
      const spoons = item.spoons || 0;
      const w = (Number(item.weight) || 0) * qty;
      return `
        <div class="flex items-center justify-between py-1.5 border-b border-[#201b29] last:border-none">
          <div>
            <span class="text-slate-200 font-medium">${qty}x ${item.packaging}</span>
            ${spoons > 0 ? `<span class="text-[#fcd34d] text-[11px] ml-1">(+${spoons} colher)</span>` : ''}
            <span class="text-slate-500 mx-1">•</span>
            <span class="text-slate-300">${item.notes || 'Sem observação'}</span>
          </div>
          <div class="text-right text-slate-400 font-mono text-[11px]">
            ${w > 0 ? `${w}g • ` : ''}${item.timestamp}
          </div>
        </div>
      `;
    }).join('');
  }

  let txt = `====================================\n`;
  txt += `🍧 *FECHAMENTO & ESTOQUE - MONT' AÇAÍ*\n`;
  txt += `====================================\n`;
  txt += `📅 *Data:* ${data.dateStr} (${data.firstTime} às ${data.lastTime})\n`;
  txt += `🧾 *Atendimentos:* ${data.totalRecords} lançamentos (${data.salesTxCount} vendas)\n\n`;

  txt += `------------------------------------\n`;
  txt += `💰 *1. RESUMO FINANCEIRO*\n`;
  txt += `------------------------------------\n`;
  txt += `• *Faturamento Bruto:* R$ ${formatBRL(data.revenue)}\n`;
  txt += `• *Ticket Médio:* R$ ${formatBRL(data.avgTicket)}\n`;
  txt += `• *Peso Total Vendido:* ${formatKg(data.soldWeight)} kg (${data.soldWeight}g)\n\n`;

  txt += `*Por Forma de Pagamento:*\n`;
  for (const [method, info] of Object.entries(data.payments)) {
    txt += `  ▸ ${method}: R$ ${formatBRL(info.total)} (${info.count}x)\n`;
  }

  txt += `\n------------------------------------\n`;
  txt += `📦 *2. CONTROLE DE MATERIAIS (PROPRIETÁRIA)*\n`;
  txt += `------------------------------------\n`;
  Object.values(data.materialsUsage).forEach(mat => {
    txt += `• *${mat.label}:*\n`;
    txt += `  Inicial: ${mat.initial} | Saíram: -${mat.totalOut} (${mat.soldOut} venda / ${mat.internalOut} int.) | *Restam: ${mat.remaining} un*\n`;
  });

  if (data.internalItems.length > 0) {
    txt += `\n------------------------------------\n`;
    txt += `👤 *3. CONSUMO INTERNO / BAIXAS AVULSAS*\n`;
    txt += `------------------------------------\n`;
    data.internalItems.forEach(item => {
      const qty = Number(item.quantity) || 1;
      const w = (Number(item.weight) || 0) * qty;
      txt += `  ▸ [${item.timestamp}] ${qty}x ${item.packaging}${w > 0 ? ` (${w}g)` : ''} - ${item.notes || 'Equipe'}\n`;
    });
  }

  txt += `====================================`;

  document.getElementById('report-text-area').value = txt;
}

function exportTransactionsCSV() {
  if (state.transactions.length === 0) {
    showToast('Não há registros para exportar.');
    return;
  }

  const headers = ['Horario', 'Tipo', 'Recipiente_Material', 'Qtd_Recipientes', 'Colheres_Saidas', 'Tampas_Saidas', 'Peso_Total_g', 'Valor_Total_RS', 'Forma_Pagamento', 'Observacao'];
  const rows = state.transactions.map(tx => {
    const qty = Number(tx.quantity) || 1;
    const spoons = tx.spoons !== undefined ? Number(tx.spoons) : qty;
    const lids = tx.lids !== undefined ? Number(tx.lids) : 0;
    const wTotal = (Number(tx.weight) || 0) * qty;
    const vTotal = (Number(tx.total) || 0).toFixed(2).replace('.', ',');
    const notesClean = (tx.notes || '').replace(/;/g, ',').replace(/"/g, "'");

    return [
      tx.timestamp,
      tx.type,
      tx.packaging,
      qty,
      spoons,
      lids,
      wTotal,
      vTotal,
      tx.paymentMethod,
      `"${notesClean}"`
    ].join(';');
  });

  const csvContent = '\uFEFF' + headers.join(';') + '\n' + rows.join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const today = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `fechamento-mont-acai-${today}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Planilha CSV baixada com sucesso!');
}

function setupLogoManager() {
  const logoInput = document.getElementById('logo-input');
  const logoDisplayContainer = document.getElementById('logo-display-container');
  const btnTrigger = document.getElementById('btn-trigger-upload');
  const btnRemove = document.getElementById('btn-remove-logo');
  const customImg = document.getElementById('custom-logo-img');
  const defaultIcon = document.getElementById('default-logo-icon');

  function applyLogo(dataUrl) {
    if (dataUrl) {
      customImg.src = dataUrl;
      customImg.classList.remove('hidden');
      defaultIcon.classList.add('hidden');
      btnRemove.classList.remove('hidden');
      btnRemove.classList.add('flex');
    } else {
      customImg.src = '';
      customImg.classList.add('hidden');
      defaultIcon.classList.remove('hidden');
      btnRemove.classList.add('hidden');
      btnRemove.classList.remove('flex');
    }
  }

  try {
    const savedLogo = localStorage.getItem('mont_acai_logo_v1');
    if (savedLogo) {
      state.customLogo = savedLogo;
      applyLogo(savedLogo);
    }
  } catch (err) {
    console.warn('Erro ao carregar logo salva:', err);
  }

  const openPicker = () => logoInput.click();
  logoDisplayContainer.addEventListener('click', openPicker);
  if (btnTrigger) btnTrigger.addEventListener('click', openPicker);

  logoInput.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast('Por favor, selecione um arquivo de imagem válido.');
      return;
    }

    if (file.size > 3 * 1024 * 1024) {
      showToast('A imagem deve ter até 3MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target.result;
      try {
        localStorage.setItem('mont_acai_logo_v1', base64);
        state.customLogo = base64;
        applyLogo(base64);
        showToast('Logo do Mont\' Açaí atualizada!');
      } catch (storageError) {
        showToast('Imagem muito grande para armazenamento local.');
      }
    };
    reader.readAsDataURL(file);
    logoInput.value = '';
  });

  btnRemove.addEventListener('click', (e) => {
    e.stopPropagation();
    try {
      localStorage.removeItem('mont_acai_logo_v1');
    } catch (_) {}
    state.customLogo = null;
    applyLogo(null);
    showToast('Logo padrão restaurada.');
  });
}

window.onload = function() {
  loadAppData();
  setupLogoManager();
  renderPackagingButtons();
  renderPaymentButtons();
  setupTypeToggle();
  updateSubtotal();
  calculateMetrics();
  renderTransactions();

  const qtyInput = document.getElementById('input-qty');
  const spoonsInput = document.getElementById('input-spoons');
  const lidsInput = document.getElementById('input-lids');

  document.getElementById('qty-plus').onclick = () => {
    const nextQty = (parseInt(qtyInput.value, 10) || 1) + 1;
    qtyInput.value = nextQty;
    spoonsInput.value = nextQty;
    updateSubtotal();
  };
  document.getElementById('qty-minus').onclick = () => {
    const val = parseInt(qtyInput.value, 10) || 1;
    if (val > 1) {
      qtyInput.value = val - 1;
      spoonsInput.value = val - 1;
    }
    updateSubtotal();
  };
  qtyInput.oninput = updateSubtotal;

  document.getElementById('spoons-plus').onclick = () => {
    spoonsInput.value = (parseInt(spoonsInput.value, 10) || 0) + 1;
  };
  document.getElementById('spoons-minus').onclick = () => {
    const val = parseInt(spoonsInput.value, 10) || 0;
    if (val > 0) spoonsInput.value = val - 1;
  };

  document.getElementById('lids-plus').onclick = () => {
    lidsInput.value = (parseInt(lidsInput.value, 10) || 0) + 1;
  };
  document.getElementById('lids-minus').onclick = () => {
    const val = parseInt(lidsInput.value, 10) || 0;
    if (val > 0) lidsInput.value = val - 1;
  };

  document.getElementById('input-val').oninput = updateSubtotal;
  document.getElementById('btn-submit-tx').onclick = handleCreateTransaction;
  document.getElementById('btn-cancel-edit').onclick = resetEditMode;

  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.filter-btn').forEach(b => {
        b.className = 'filter-btn px-3 py-1 rounded-lg text-slate-400 hover:text-slate-200';
      });
      btn.className = 'filter-btn px-3 py-1 rounded-lg bg-[#2d243d] text-slate-100 font-semibold';
      state.activeFilter = btn.dataset.filter;
      renderTransactions();
    };
  });

  const loginModal = document.getElementById('modal-owner-login');
  const pwInput = document.getElementById('input-owner-password');

  document.getElementById('btn-owner-access').onclick = () => {
    if (state.isOwnerLoggedIn) {
      const panel = document.getElementById('owner-materials-panel');
      panel.scrollIntoView({ behavior: 'smooth' });
    } else {
      promptOwnerPasswordAlways(
        'Acesso da Proprietária',
        'Controle de estoque, copos, colheres e caixa',
        () => {
          state.isOwnerLoggedIn = true;
          updateOwnerUI();
          showToast('Bem-vinda! Painel da Proprietária liberado.');
        }
      );
    }
  };

  document.getElementById('btn-close-login').onclick = () => {
    loginModal.classList.add('hidden');
    state.pendingOwnerAction = null;
  };

  function handleConfirmLogin() {
    if (pwInput.value === state.ownerPassword) {
      loginModal.classList.add('hidden');
      if (state.pendingOwnerAction) {
        const fn = state.pendingOwnerAction;
        state.pendingOwnerAction = null;
        fn();
      } else {
        state.isOwnerLoggedIn = true;
        updateOwnerUI();
        showToast('Bem-vinda! Painel da Proprietária liberado.');
      }
    } else {
      showToast('Senha incorreta! Apenas a proprietária pode realizar esta ação.');
      pwInput.select();
    }
  }

  document.getElementById('btn-confirm-login').onclick = handleConfirmLogin;
  pwInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleConfirmLogin();
  });

  document.getElementById('btn-owner-logout').onclick = () => {
    state.isOwnerLoggedIn = false;
    updateOwnerUI();
    showToast('Modo Proprietária bloqueado. De volta ao Modo Balcão.');
  };

  const stockModal = document.getElementById('modal-stock-adjust');
  document.getElementById('btn-open-stock-modal').onclick = () => {
    MATERIALS_CATALOG.forEach(mat => {
      document.getElementById(`stock-${mat.key}`).value = state.initialStock[mat.key] || 0;
    });
    stockModal.classList.remove('hidden');
  };
  document.getElementById('btn-close-stock-modal').onclick = () => stockModal.classList.add('hidden');
  document.getElementById('btn-cancel-stock').onclick = () => stockModal.classList.add('hidden');
  document.getElementById('btn-save-stock').onclick = () => {
    MATERIALS_CATALOG.forEach(mat => {
      const val = parseInt(document.getElementById(`stock-${mat.key}`).value, 10);
      state.initialStock[mat.key] = isNaN(val) ? 0 : Math.max(0, val);
    });
    saveStock();
    calculateMetrics();
    stockModal.classList.add('hidden');
    showToast('Estoque inicial de materiais atualizado!');
  };

  document.getElementById('btn-register-loss').onclick = () => {
    const matKey = document.getElementById('extra-loss-item').value;
    const qty = Math.max(1, parseInt(document.getElementById('extra-loss-qty').value, 10) || 1);
    const reason = document.getElementById('extra-loss-reason').value.trim() || 'Baixa avulsa / perda';
    const matObj = MATERIALS_CATALOG.find(m => m.key === matKey);
    const now = new Date();
    const timeFormatted = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    const lossTx = {
      id: 'tx-' + Date.now(),
      timestamp: timeFormatted,
      packaging: `Baixa: ${matObj ? matObj.label : matKey}`,
      extraMaterialKey: matKey,
      weight: 0,
      quantity: matKey === 'colheres' || matKey === 'tampas' ? 0 : qty,
      spoons: matKey === 'colheres' ? qty : 0,
      lids: matKey === 'tampas' ? qty : 0,
      unitPrice: 0,
      total: 0,
      type: 'CONSUMO_INTERNO',
      paymentMethod: 'Baixa de Material',
      notes: `${qty}x ${matObj ? matObj.label : ''} (${reason})`,
    };

    if (matKey !== 'colheres' && matKey !== 'tampas') {
      lossTx.quantity = qty;
    }

    state.transactions.unshift(lossTx);
    saveTransactions();
    renderTransactions();
    calculateMetrics();
    document.getElementById('extra-loss-qty').value = '1';
    document.getElementById('extra-loss-reason').value = '';
    showToast('Baixa avulsa de material registrada!');
  };

  const pwModal = document.getElementById('modal-change-password');
  document.getElementById('btn-open-password-modal').onclick = () => {
    document.getElementById('input-new-pw').value = '';
    pwModal.classList.remove('hidden');
  };
  document.getElementById('btn-close-pw-modal').onclick = () => pwModal.classList.add('hidden');
  document.getElementById('btn-save-pw').onclick = () => {
    const newPw = document.getElementById('input-new-pw').value.trim();
    if (newPw.length < 3) {
      showToast('A senha deve ter pelo menos 3 caracteres.');
      return;
    }
    state.ownerPassword = newPw;
    try {
      localStorage.setItem('mont_acai_owner_pw', newPw);
    } catch (_) {}
    pwModal.classList.add('hidden');
    showToast('Senha da proprietária alterada com sucesso!');
  };

  const clearModal = document.getElementById('modal-clear-shift');
  document.getElementById('btn-open-clear-modal').onclick = () => {
    promptOwnerPasswordAlways(
      'Zerar Turno e Fechar Caixa',
      'Somente a proprietária pode zerar o turno. Digite a senha:',
      () => {
        clearModal.classList.remove('hidden');
      }
    );
  };
  document.getElementById('btn-cancel-modal').onclick = () => {
    clearModal.classList.add('hidden');
  };
  document.getElementById('btn-confirm-clear').onclick = () => {
    const currentUsage = computeMaterialsUsage();
    Object.values(currentUsage).forEach(item => {
      state.initialStock[item.key] = item.remaining;
    });
    saveStock();

    state.transactions = [];
    resetEditMode();
    saveTransactions();
    renderTransactions();
    calculateMetrics();
    clearModal.classList.add('hidden');
    showToast('Turno zerado! Saldo restante de materiais mantido para o próximo turno.');
  };

  const reportModal = document.getElementById('modal-report');
  const reportTextArea = document.getElementById('report-text-area');
  const tabVisual = document.getElementById('tab-report-visual');
  const tabText = document.getElementById('tab-report-text');
  const viewVisual = document.getElementById('report-visual-view');
  const viewText = document.getElementById('report-text-view');

  tabVisual.onclick = () => {
    tabVisual.className = 'flex-1 py-2 px-3 rounded-lg text-xs font-semibold bg-[#2d243d] text-white transition';
    tabText.className = 'flex-1 py-2 px-3 rounded-lg text-xs font-semibold text-slate-400 hover:text-slate-200 transition';
    viewVisual.classList.remove('hidden');
    viewText.classList.add('hidden');
  };

  tabText.onclick = () => {
    tabText.className = 'flex-1 py-2 px-3 rounded-lg text-xs font-semibold bg-[#2d243d] text-white transition';
    tabVisual.className = 'flex-1 py-2 px-3 rounded-lg text-xs font-semibold text-slate-400 hover:text-slate-200 transition';
    viewText.classList.remove('hidden');
    viewVisual.classList.add('hidden');
  };

  document.getElementById('btn-export-report').onclick = () => {
    populateClosingReport();
    reportModal.classList.remove('hidden');
  };
  document.getElementById('btn-close-report').onclick = () => {
    reportModal.classList.add('hidden');
  };

  document.getElementById('btn-copy-report').onclick = async () => {
    populateClosingReport();
    try {
      await navigator.clipboard.writeText(reportTextArea.value);
      showToast('Resumo copiado para colar no WhatsApp!');
    } catch (err) {
      viewText.classList.remove('hidden');
      reportTextArea.select();
      document.execCommand('copy');
      showToast('Resumo copiado para a área de transferência!');
    }
  };

  document.getElementById('btn-print-report').onclick = () => {
    tabVisual.click();
    window.print();
  };

  document.getElementById('btn-export-csv').onclick = exportTransactionsCSV;
};
