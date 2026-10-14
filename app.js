/**
 * Mont' Açaí - Sistema PDV, Balança & Controle de Materiais
 * Lógica principal de vendas, auditoria de estoque (copos, isopores, colheres e tampas),
 * controle diário de fechamento de caixa por data, autenticação da proprietária,
 * relatórios executivos e sincronização em tempo real na nuvem via Google Firebase Firestore.
 */

// ==========================================================================
// 1. CONFIGURAÇÃO DO GOOGLE FIREBASE FIRESTORE
// ==========================================================================
const firebaseConfig = {
  apiKey: "AIzaSyBlcd0csh9q2CKuV8QgdNY7BYytZ7U_Cyk",
  authDomain: "vendas-mont-acai.firebaseapp.com",
  projectId: "vendas-mont-acai",
  storageBucket: "vendas-mont-acai.firebasestorage.app",
  messagingSenderId: "894605670474",
  appId: "1:894605670474:web:7f3265df72ad0d67168eb3",
  measurementId: "G-V1LKD0LDFP"
};

let db = null;
let isCloudActive = false;

// ==========================================================================
// 2. CONSTANTES DO SISTEMA E OPÇÕES DE PRODUTO
// ==========================================================================

// Opções de recipientes e embalagens
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

// Utilitários de Data Local
function getTodayLocalDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDisplayDate(isoDateStr) {
  if (!isoDateStr || isoDateStr === 'TODOS') return 'Todas as Datas';
  const parts = isoDateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return isoDateStr;
}

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
  closedDays: {}, // Mapeamento { 'YYYY-MM-DD': { closedAt: '19:40', closedDate: 'YYYY-MM-DD' } }
  selectedDate: getTodayLocalDate(), // Data ativa no formulário de vendas
  viewFilterDate: getTodayLocalDate(), // Data ativa para exibição no histórico e métricas
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
  if (!toast || !msgEl) return;
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

// ==========================================================================
// 3. SINCRONIZAÇÃO EM NUVEM (FIREBASE FIRESTORE) + LOCALSTORAGE BACKUP
// ==========================================================================

function updateCloudBadge(status, customText) {
  const badge = document.getElementById('cloud-sync-badge');
  const dot = document.getElementById('cloud-dot');
  const text = document.getElementById('cloud-status-text');
  if (!badge || !dot || !text) return;

  if (status === 'connected') {
    badge.className = 'inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-[#112922] text-[#6ee7b7] border border-[#1e483b] transition';
    dot.className = 'w-1.5 h-1.5 rounded-full bg-[#34d399] mr-1.5';
    text.textContent = '☁️ Nuvem Ao Vivo';
    badge.title = 'Conectado ao Firebase Firestore: os dados sincronizam entre todos os aparelhos em tempo real.';
  } else if (status === 'syncing') {
    badge.className = 'inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-[#14232c] text-[#67e8f9] border border-[#21404e] transition';
    dot.className = 'w-1.5 h-1.5 rounded-full bg-[#22d3ee] mr-1.5 animate-pulse';
    text.textContent = customText || '☁️ Sincronizando...';
  } else if (status === 'offline') {
    badge.className = 'inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-[#2b2213] text-[#fcd34d] border border-[#483719] transition';
    dot.className = 'w-1.5 h-1.5 rounded-full bg-[#fbbf24] mr-1.5';
    text.textContent = '☁️ Modo Offline';
    badge.title = 'Sem conexão com a internet. Lançamentos gravados localmente que serão sincronizados ao reconectar.';
  } else if (status === 'rule-error') {
    badge.className = 'inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-[#2e1a22] text-rose-300 border border-[#4a2634] transition';
    dot.className = 'w-1.5 h-1.5 rounded-full bg-rose-400 mr-1.5';
    text.textContent = '☁️ Nuvem (Regras)';
    badge.title = 'Banco Firestore precisa de autorização na aba Regras do Console.';
  }
}

// Inicializa o Firebase Firestore com persistência offline e listeners em tempo real
function initFirestoreSync() {
  updateCloudBadge('syncing', '☁️ Conectando...');

  try {
    if (typeof firebase === 'undefined') {
      console.warn('SDK do Firebase não carregado no navegador. Operando em modo local.');
      updateCloudBadge('offline');
      return;
    }

    if (!firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
    }

    db = firebase.firestore();

    // Habilita persistência offline inteligente no IndexedDB do navegador
    db.enablePersistence({ synchronizeTabs: true }).catch(err => {
      if (err.code === 'failed-precondition') {
        console.warn('Múltiplas abas abertas, persistência ativada em uma delas.');
      } else if (err.code === 'unimplemented') {
        console.warn('Navegador não suporta persistência offline do Firestore.');
      }
    });

    isCloudActive = true;
    listenToCloudData();

  } catch (err) {
    console.error('Falha ao conectar ao Firebase:', err);
    updateCloudBadge('offline');
  }
}

// Escuta alterações em tempo real no Firestore e sincroniza com a interface
function listenToCloudData() {
  if (!db) return;

  // 1. Escuta Coleção de Transações (Vendas e Consumos)
  db.collection('transactions').onSnapshot(
    (snapshot) => {
      const cloudList = [];
      snapshot.forEach((doc) => {
        cloudList.push({ id: doc.id, ...doc.data() });
      });

      // 1. Mapa de transações da nuvem
      const cloudMap = new Map();
      cloudList.forEach((tx) => {
        if (tx && tx.id) cloudMap.set(tx.id, tx);
      });

      // 2. Proteção Total dos Registros Anteriores:
      // Se houver qualquer lançamento registrado anteriormente neste navegador que ainda
      // não esteja na nuvem, ele é preservado e enviado automaticamente para o Firestore.
      if (Array.isArray(state.transactions)) {
        state.transactions.forEach((localTx) => {
          if (localTx && localTx.id && !cloudMap.has(localTx.id)) {
            cloudMap.set(localTx.id, localTx);
            db.collection('transactions').doc(localTx.id).set(localTx).catch((e) => {
              console.warn('Migração de venda local para nuvem:', e.message);
            });
          }
        });
      }

      // 3. Lista unificada e consolidada (nuvem + registros locais)
      const mergedList = Array.from(cloudMap.values());
      mergedList.sort((a, b) => {
        const idA = a.id || '';
        const idB = b.id || '';
        return idB.localeCompare(idA);
      });

      state.transactions = mergedList;
      try {
        localStorage.setItem('acai_flow_v3', JSON.stringify(state.transactions));
      } catch (_) {}

      updateCloudBadge('connected');
      calculateMetrics();
      renderTransactions();
      renderLastTransaction();
    },
    (error) => {
      console.warn('Aviso de sincronização do Firestore:', error.message);
      if (error.code === 'permission-denied') {
        updateCloudBadge('rule-error');
      } else {
        updateCloudBadge('offline');
      }
    }
  );

  // 2. Escuta Estoque Inicial de Materiais
  db.collection('settings').doc('stock').onSnapshot((doc) => {
    if (doc.exists) {
      const data = doc.data();
      state.initialStock = { ...state.initialStock, ...data };
      try {
        localStorage.setItem('mont_acai_stock_v1', JSON.stringify(state.initialStock));
      } catch (_) {}
      calculateMetrics();
      renderOwnerMaterialsPanel();
    } else {
      // Se não existir na nuvem ainda, faz backup do estoque local da loja para a nuvem
      if (state.initialStock) {
        db.collection('settings').doc('stock').set(state.initialStock).catch(() => {});
      }
    }
  }, (err) => console.warn('Erro ao sincronizar estoque:', err.message));

  // 3. Escuta Fechamento de Caixas por Data
  db.collection('settings').doc('closed_days').onSnapshot((doc) => {
    if (doc.exists) {
      const data = doc.data();
      state.closedDays = { ...state.closedDays, ...data };
      try {
        localStorage.setItem('mont_acai_closed_days_v1', JSON.stringify(state.closedDays));
      } catch (_) {}
      checkDateStatus(state.selectedDate);
    } else {
      // Se não existir na nuvem ainda, faz backup dos caixas fechados para a nuvem
      if (state.closedDays && Object.keys(state.closedDays).length > 0) {
        db.collection('settings').doc('closed_days').set(state.closedDays).catch(() => {});
      }
    }
  }, (err) => console.warn('Erro ao sincronizar dias fechados:', err.message));

  // 4. Escuta Senha da Proprietária e Configurações Gerais
  db.collection('settings').doc('security').onSnapshot((doc) => {
    if (doc.exists) {
      const data = doc.data();
      if (data.ownerPassword) {
        state.ownerPassword = data.ownerPassword;
        try {
          localStorage.setItem('mont_acai_owner_pw', state.ownerPassword);
        } catch (_) {}
      }
    } else {
      // Se não existir na nuvem ainda, faz backup da senha atual para a nuvem
      if (state.ownerPassword) {
        db.collection('settings').doc('security').set({ ownerPassword: state.ownerPassword }).catch(() => {});
      }
    }
  }, (err) => console.warn('Erro ao sincronizar segurança:', err.message));
}

// Carrega dados locais do navegador (para abertura instantânea em 0ms)
function loadAppData() {
  try {
    const savedPw = localStorage.getItem('mont_acai_owner_pw');
    if (savedPw) state.ownerPassword = savedPw;

    const savedStock = localStorage.getItem('mont_acai_stock_v1');
    if (savedStock) {
      state.initialStock = { ...state.initialStock, ...JSON.parse(savedStock) };
    }

    const savedClosed = localStorage.getItem('mont_acai_closed_days_v1');
    if (savedClosed) {
      state.closedDays = JSON.parse(savedClosed) || {};
    } else {
      state.closedDays = {};
    }

    const raw = localStorage.getItem('acai_flow_v3');
    if (raw) {
      state.transactions = JSON.parse(raw);
      state.transactions.forEach(tx => {
        if (!tx.date) tx.date = getTodayLocalDate();
      });
    } else {
      state.transactions = [];
    }
  } catch (e) {
    state.transactions = [];
    state.closedDays = {};
  }
}

// Salva transações localmente e na nuvem
function saveTransactionsLocally() {
  try {
    localStorage.setItem('acai_flow_v3', JSON.stringify(state.transactions));
  } catch (e) {
    console.error('Falha de armazenamento local de vendas:', e);
  }
}

// Salva estoque localmente e na nuvem
function saveStock() {
  try {
    localStorage.setItem('mont_acai_stock_v1', JSON.stringify(state.initialStock));
  } catch (e) {
    console.error('Erro ao salvar estoque local:', e);
  }

  if (db) {
    db.collection('settings').doc('stock').set(state.initialStock).catch(err => {
      console.warn('Erro ao salvar estoque na nuvem:', err.message);
    });
  }
}

// Salva dias fechados localmente e na nuvem
function saveClosedDays() {
  try {
    localStorage.setItem('mont_acai_closed_days_v1', JSON.stringify(state.closedDays));
  } catch (e) {
    console.error('Erro ao salvar dias fechados local:', e);
  }

  if (db) {
    db.collection('settings').doc('closed_days').set(state.closedDays).catch(err => {
      console.warn('Erro ao salvar dias fechados na nuvem:', err.message);
    });
  }
}

// ==========================================================================
// 4. LÓGICA DE INTERFACE, CONTROLE DE CAIXA E MATERIAIS
// ==========================================================================

// Verifica e atualiza os elementos de UI com base no status do caixa da data
function checkDateStatus(dateStr) {
  const isClosed = Boolean(state.closedDays[dateStr]);
  const statusBadge = document.getElementById('day-cash-status-badge');
  const reopenBtn = document.getElementById('btn-reopen-day');
  const closedBanner = document.getElementById('closed-day-banner');
  const submitBtn = document.getElementById('btn-submit-tx');
  const inputWeight = document.getElementById('input-weight');
  const inputVal = document.getElementById('input-val');
  const inputNotes = document.getElementById('input-notes');
  const modalDateLabel = document.getElementById('modal-close-date-label');
  const topActiveDate = document.getElementById('top-active-date');

  if (topActiveDate) {
    topActiveDate.textContent = formatDisplayDate(dateStr);
  }

  if (modalDateLabel) {
    modalDateLabel.textContent = formatDisplayDate(dateStr);
  }

  if (isClosed) {
    // Caixa Fechado
    if (statusBadge) {
      statusBadge.className = 'px-2 py-0.5 text-[10px] font-bold rounded bg-rose-950 text-rose-300 border border-rose-800 flex items-center gap-1';
      statusBadge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-rose-400"></span>🔒 Caixa Fechado`;
    }
    if (reopenBtn) reopenBtn.classList.remove('hidden');
    if (closedBanner) closedBanner.classList.remove('hidden');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.classList.add('opacity-40', 'cursor-not-allowed');
    }
    if (inputWeight) inputWeight.disabled = true;
    if (inputVal) inputVal.disabled = true;
    if (inputNotes) inputNotes.disabled = true;
  } else {
    // Caixa Aberto
    if (statusBadge) {
      statusBadge.className = 'px-2 py-0.5 text-[10px] font-bold rounded bg-emerald-950 text-emerald-300 border border-emerald-800 flex items-center gap-1';
      statusBadge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>● Caixa Aberto`;
    }
    if (reopenBtn) reopenBtn.classList.add('hidden');
    if (closedBanner) closedBanner.classList.add('hidden');
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.classList.remove('opacity-40', 'cursor-not-allowed');
    }
    if (inputWeight) inputWeight.disabled = false;
    if (inputVal && state.currentType === 'VENDA') inputVal.disabled = false;
    if (inputNotes) inputNotes.disabled = false;
  }
}

// Renderiza o card "Último Lançamento Realizado" na tela principal
function renderLastTransaction() {
  const contentEl = document.getElementById('last-tx-content');
  const emptyEl = document.getElementById('last-tx-empty');
  const badgeEl = document.getElementById('last-tx-badge');
  if (!contentEl || !emptyEl) return;

  const lastTx = state.transactions.length > 0 ? state.transactions[0] : null;

  if (!lastTx) {
    contentEl.classList.add('hidden');
    emptyEl.classList.remove('hidden');
    if (badgeEl) {
      badgeEl.className = 'px-2.5 py-0.5 text-[10px] font-semibold rounded bg-[#1f1b29] text-slate-400 border border-[#2f283d]';
      badgeEl.textContent = 'Aguardando';
    }
    return;
  }

  emptyEl.classList.add('hidden');
  contentEl.classList.remove('hidden');

  const isVenda = lastTx.type === 'VENDA';
  const qty = Number(lastTx.quantity) || 1;
  const spoons = lastTx.spoons !== undefined ? Number(lastTx.spoons) : qty;
  const lids = lastTx.lids !== undefined ? Number(lastTx.lids) : 0;
  const totalWeight = (Number(lastTx.weight) || 0) * qty;

  const amountEl = document.getElementById('last-tx-amount');
  const typeBadgeEl = document.getElementById('last-tx-type-badge');
  const timeEl = document.getElementById('last-tx-time');
  const pkgEl = document.getElementById('last-tx-pkg');
  const weightEl = document.getElementById('last-tx-weight');
  const paymentEl = document.getElementById('last-tx-payment');
  const dateEl = document.getElementById('last-tx-date');
  const spoonsEl = document.getElementById('last-tx-spoons');
  const lidsEl = document.getElementById('last-tx-lids');
  const qtyEl = document.getElementById('last-tx-qty');
  const notesContainer = document.getElementById('last-tx-notes-container');
  const notesEl = document.getElementById('last-tx-notes');

  if (amountEl) {
    if (isVenda) {
      amountEl.textContent = `R$ ${formatBRL(lastTx.total)}`;
      amountEl.className = 'text-2xl font-black text-[#6ee7b7] block mt-0.5';
    } else {
      amountEl.textContent = 'Consumo Interno';
      amountEl.className = 'text-xl font-bold text-[#fcd34d] block mt-0.5';
    }
  }

  if (typeBadgeEl) {
    if (isVenda) {
      typeBadgeEl.textContent = 'Venda Cliente';
      typeBadgeEl.className = 'inline-block px-2.5 py-1 text-[11px] font-bold rounded-lg bg-[#1e2e28] text-[#6ee7b7] border border-[#2b473d]';
    } else {
      typeBadgeEl.textContent = 'Consumo Equipe';
      typeBadgeEl.className = 'inline-block px-2.5 py-1 text-[11px] font-bold rounded-lg bg-[#2e2518] text-[#fcd34d] border border-[#453722]';
    }
  }

  if (timeEl) timeEl.textContent = lastTx.timestamp || '--:--';
  if (pkgEl) pkgEl.textContent = `${qty > 1 && !lastTx.extraMaterialKey ? `${qty}x ` : ''}${lastTx.packaging || 'Açaí'}`;
  if (weightEl) {
    weightEl.textContent = lastTx.weight ? `${qty > 1 ? `${qty}x ${lastTx.weight}g (${totalWeight}g)` : `${lastTx.weight}g`}` : 'Baixa de Material';
  }
  if (paymentEl) paymentEl.textContent = lastTx.paymentMethod || 'Dinheiro';
  if (dateEl) dateEl.textContent = formatDisplayDate(lastTx.date || getTodayLocalDate());

  if (spoonsEl) spoonsEl.textContent = `${spoons} colher${spoons > 1 ? 'es' : ''}`;
  if (lidsEl) lidsEl.textContent = `${lids} tampa${lids > 1 ? 's' : ''}`;
  if (qtyEl) qtyEl.textContent = `${qty}x recipiente${qty > 1 ? 's' : ''}`;

  if (notesContainer && notesEl) {
    if (lastTx.notes && lastTx.notes.trim()) {
      notesEl.textContent = `"${lastTx.notes.trim()}"`;
      notesContainer.classList.remove('hidden');
    } else {
      notesContainer.classList.add('hidden');
    }
  }

  if (badgeEl) {
    badgeEl.className = 'px-2.5 py-0.5 text-[10px] font-semibold rounded bg-[#1e2823] text-[#6ee7b7] border border-[#2b4237]';
    badgeEl.textContent = `● Registrado às ${lastTx.timestamp}`;
  }
}

// Retorna as transações filtradas pela data de visualização no histórico gerencial
function getTransactionsForCurrentView() {
  if (state.viewFilterDate === 'TODOS') {
    return state.transactions;
  }
  return state.transactions.filter(t => (t.date || getTodayLocalDate()) === state.viewFilterDate);
}

function computeMaterialsUsage(filteredTxList) {
  const targetList = filteredTxList || getTransactionsForCurrentView();
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

  targetList.forEach(tx => {
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
            <span class="text-[10px] text-slate-400 block">Saíram</span>
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

  const txList = getTransactionsForCurrentView();

  txList.forEach(tx => {
    const qty = Number(tx.quantity) || 0;
    const weightTotal = (Number(tx.weight) || 0) * qty;

    if (tx.type === 'VENDA') {
      revenue += (Number(tx.total) || 0);
      salesCount += 1;
      soldUnits += qty;
      totalWeightSold += weightTotal;
    }
  });

  const usage = computeMaterialsUsage(txList);
  const totalCupsOut = usage.copo_500.totalOut + usage.copo_700.totalOut + usage.isopor_500.totalOut;
  const avgTicket = salesCount > 0 ? (revenue / salesCount) : 0;

  const revEl = document.getElementById('metric-revenue');
  const avgEl = document.getElementById('metric-avg-ticket');
  const unitsEl = document.getElementById('metric-sold-units');
  const cupsBreakdownEl = document.getElementById('metric-cups-breakdown');
  const weightEl = document.getElementById('metric-total-weight');
  const gramsEl = document.getElementById('metric-weight-grams');
  const spoonsEl = document.getElementById('metric-spoons-out');
  const lidsEl = document.getElementById('metric-lids-out');
  const countEl = document.getElementById('tx-counter-text');

  if (revEl) revEl.textContent = `R$ ${formatBRL(revenue)}`;
  if (avgEl) avgEl.textContent = `Ticket médio: R$ ${formatBRL(avgTicket)}`;
  if (unitsEl) unitsEl.textContent = `${totalCupsOut} un`;
  if (cupsBreakdownEl) cupsBreakdownEl.textContent = `${soldUnits} vendas • ${totalCupsOut - soldUnits} interno`;
  if (weightEl) weightEl.textContent = `${formatKg(totalWeightSold)} kg`;
  if (gramsEl) gramsEl.textContent = `${totalWeightSold.toLocaleString('pt-BR')}g pesados`;
  if (spoonsEl) spoonsEl.textContent = `${usage.colheres.totalOut} colheres`;
  if (lidsEl) lidsEl.textContent = `${usage.tampas.totalOut} tampas utilizadas`;
  if (countEl) countEl.textContent = `${txList.length} registros gravados`;

  renderOwnerMaterialsPanel();
}

function renderPackagingButtons() {
  const container = document.getElementById('packaging-options');
  if (!container) return;
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
  if (!container) return;
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
    
    // Habilitar apenas se o caixa não estiver fechado
    if (!state.closedDays[state.selectedDate]) {
      valInput.disabled = false;
    }
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
  document.getElementById('form-mode-badge').textContent = 'Balança & Balcão';
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
  // Bloqueio estrito se o dia selecionado já estiver fechado
  if (state.closedDays[state.selectedDate]) {
    showToast(`O caixa do dia ${formatDisplayDate(state.selectedDate)} está fechado. Reabra o caixa com a senha para lançar.`);
    return;
  }

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
      const updatedTx = {
        ...state.transactions[index],
        date: state.selectedDate,
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

      state.transactions[index] = updatedTx;
      saveTransactionsLocally();

      // Salva no Firestore
      if (db) {
        db.collection('transactions').doc(updatedTx.id).set(updatedTx).catch(err => {
          console.warn('Erro ao atualizar no Firestore:', err.message);
        });
      }

      renderTransactions();
      calculateMetrics();
      renderLastTransaction();
      resetEditMode();
      showToast('Venda alterada com sucesso pela proprietária!');
      return;
    }
  }

  const now = new Date();
  const timeFormatted = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  const newTx = {
    id: 'tx-' + Date.now(),
    date: state.selectedDate, // Salva na data selecionada no seletor
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
  saveTransactionsLocally();

  // Salva no Firestore na nuvem
  if (db) {
    db.collection('transactions').doc(newTx.id).set(newTx).catch(err => {
      console.warn('Erro ao gravar no Firestore:', err.message);
    });
  }

  // Sincroniza visualização do dia para o dia do lançamento se estiver em outra data
  if (state.viewFilterDate !== 'TODOS' && state.viewFilterDate !== state.selectedDate) {
    state.viewFilterDate = state.selectedDate;
    const filterInput = document.getElementById('filter-view-date');
    if (filterInput) filterInput.value = state.selectedDate;
    updateFilterBadge();
  }

  renderTransactions();
  calculateMetrics();
  renderLastTransaction();

  resetEditMode();
  showToast(isVenda ? 'Venda registrada com sucesso!' : 'Consumo interno registrado com sucesso!');
}

// Modal universal que EXIGE SEMPRE a senha da proprietária
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

  const txDate = tx.date || getTodayLocalDate();
  if (state.closedDays[txDate]) {
    showToast(`O caixa de ${formatDisplayDate(txDate)} está fechado. Reabra o caixa deste dia para editar.`);
    return;
  }

  promptOwnerPasswordAlways(
    'Editar Venda / Lançamento',
    'Somente a proprietária pode editar vendas. Digite a senha:',
    () => {
      state.editingTxId = tx.id;
      const pkg = PACKAGING_OPTIONS.find(p => p.id === tx.packageKey || p.label === tx.packaging) || PACKAGING_OPTIONS[0];
      state.selectedPackaging = pkg;
      renderPackagingButtons();

      // Ajusta data do formulário para a data original da venda
      state.selectedDate = txDate;
      const dateInput = document.getElementById('input-sale-date');
      if (dateInput) dateInput.value = state.selectedDate;
      checkDateStatus(state.selectedDate);

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

      document.getElementById('form-header-title').innerHTML = `<span class="text-[#fcd34d]">✏️ Editando Lançamento (${tx.timestamp})</span>`;
      document.getElementById('form-mode-badge').textContent = 'Modo Edição';
      document.getElementById('form-mode-badge').className = 'text-[11px] text-[#fcd34d] font-semibold bg-[#2e2518] px-2.5 py-1 rounded-md border border-[#453722]';
      document.getElementById('btn-submit-text').textContent = 'Salvar Alterações da Venda';
      document.getElementById('btn-cancel-edit').classList.remove('hidden');

      updateSubtotal();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      showToast('Modo de edição liberado pela proprietária!');
    }
  );
};

window.deleteTx = function(id) {
  const tx = state.transactions.find(t => t.id === id);
  if (!tx) return;

  const txDate = tx.date || getTodayLocalDate();
  if (state.closedDays[txDate]) {
    showToast(`O caixa de ${formatDisplayDate(txDate)} está fechado. Reabra o caixa deste dia para excluir.`);
    return;
  }

  promptOwnerPasswordAlways(
    'Excluir Venda / Lançamento',
    'Somente a proprietária pode excluir vendas. Digite a senha:',
    () => {
      state.transactions = state.transactions.filter(t => t.id !== id);
      if (state.editingTxId === id) resetEditMode();
      saveTransactionsLocally();

      // Deleta do Firestore na nuvem
      if (db) {
        db.collection('transactions').doc(id).delete().catch(err => {
          console.warn('Erro ao deletar no Firestore:', err.message);
        });
      }

      renderTransactions();
      calculateMetrics();
      renderLastTransaction();
      showToast('Registro excluído com autorização da proprietária.');
    }
  );
};

function renderTransactions() {
  const listContainer = document.getElementById('tx-list-container');
  if (!listContainer) return;

  const filtered = getTransactionsForCurrentView().filter(tx => {
    if (state.activeFilter === 'TODOS') return true;
    return tx.type === state.activeFilter;
  });

  if (filtered.length === 0) {
    listContainer.innerHTML = `
      <div class="py-12 text-center text-slate-500">
        <svg class="w-9 h-9 mx-auto text-slate-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"/></svg>
        <p class="text-xs">Nenhum lançamento encontrado para a data/filtro selecionado.</p>
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
    const txDateFormatted = formatDisplayDate(tx.date || getTodayLocalDate());

    return `
      <div class="py-2.5 px-2 flex items-center justify-between gap-3 group hover:bg-[#1a1524] rounded-xl transition">
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
            <span class="text-purple-300 font-medium">${txDateFormatted}</span>
            <span>•</span>
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
    if (panel) panel.classList.remove('hidden');
    if (roleBadge) {
      roleBadge.className = 'inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-semibold bg-[#35234d] text-purple-200 border border-[#4c346e]';
      roleBadge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-purple-300 mr-1.5"></span>Modo Proprietária Ativo`;
    }
    if (btnLabel) btnLabel.textContent = 'Painel da Proprietária (Ativo)';
    renderOwnerMaterialsPanel();
    calculateMetrics();
    renderTransactions();
    if (panel) panel.scrollIntoView({ behavior: 'smooth' });
  } else {
    if (panel) panel.classList.add('hidden');
    if (roleBadge) {
      roleBadge.className = 'inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-semibold bg-[#232f29] text-[#6ee7b7] border border-[#2f4239]';
      roleBadge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-[#34d399] mr-1.5"></span>Modo Balcão (PDV)`;
    }
    if (btnLabel) btnLabel.textContent = 'Login Proprietária';
  }
}

function buildReportData() {
  const targetDate = state.viewFilterDate === 'TODOS' ? getTodayLocalDate() : state.viewFilterDate;
  const dateFormatted = formatDisplayDate(targetDate);
  const now = new Date();
  const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  const txList = getTransactionsForCurrentView();
  const timestamps = txList.map(t => t.timestamp).filter(Boolean);
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

  txList.forEach(tx => {
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

  const materialsUsage = computeMaterialsUsage(txList);
  const totalCupsOut = materialsUsage.copo_500.totalOut + materialsUsage.copo_700.totalOut + materialsUsage.isopor_500.totalOut;
  const avgTicket = salesTxCount > 0 ? (revenue / salesTxCount) : 0;
  const avgPricePerKg = soldWeight > 0 ? (revenue / (soldWeight / 1000)) : 0;
  const totalWeightOut = soldWeight + internalWeight;

  return {
    dateStr: dateFormatted,
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
    totalRecords: txList.length
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
    internalContainer.innerHTML = `<p class="text-slate-500 italic">Nenhum consumo interno ou perda avulsa registrada nesta data.</p>`;
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
  const targetList = getTransactionsForCurrentView();
  if (targetList.length === 0) {
    showToast('Não há registros para exportar nesta data.');
    return;
  }

  const headers = ['Data', 'Horario', 'Tipo', 'Recipiente_Material', 'Qtd_Recipientes', 'Colheres_Saidas', 'Tampas_Saidas', 'Peso_Total_g', 'Valor_Total_RS', 'Forma_Pagamento', 'Observacao'];
  const rows = targetList.map(tx => {
    const qty = Number(tx.quantity) || 1;
    const spoons = tx.spoons !== undefined ? Number(tx.spoons) : qty;
    const lids = tx.lids !== undefined ? Number(tx.lids) : 0;
    const wTotal = (Number(tx.weight) || 0) * qty;
    const vTotal = (Number(tx.total) || 0).toFixed(2).replace('.', ',');
    const notesClean = (tx.notes || '').replace(/;/g, ',').replace(/"/g, "'");

    return [
      tx.date || getTodayLocalDate(),
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
  const dateSuffix = state.viewFilterDate === 'TODOS' ? 'todos' : state.viewFilterDate;
  a.href = url;
  a.download = `fechamento-mont-acai-${dateSuffix}.csv`;
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

function updateFilterBadge() {
  const badge = document.getElementById('filter-date-badge');
  if (!badge) return;
  if (state.viewFilterDate === 'TODOS') {
    badge.textContent = 'Todas as Datas';
  } else if (state.viewFilterDate === getTodayLocalDate()) {
    badge.textContent = 'Hoje';
  } else {
    badge.textContent = formatDisplayDate(state.viewFilterDate);
  }
}

// ==========================================================================
// 5. INICIALIZAÇÃO E EVENTOS
// ==========================================================================

window.onload = function() {
  loadAppData();
  setupLogoManager();

  // Configuração inicial do Seletor de Data de Venda
  const saleDateInput = document.getElementById('input-sale-date');
  if (saleDateInput) {
    saleDateInput.value = state.selectedDate;
    saleDateInput.onchange = (e) => {
      state.selectedDate = e.target.value || getTodayLocalDate();
      checkDateStatus(state.selectedDate);
    };
  }

  // Botão de Reabrir Caixa do Dia Fechado (Exige Senha)
  const reopenDayBtn = document.getElementById('btn-reopen-day');
  if (reopenDayBtn) {
    reopenDayBtn.onclick = () => {
      promptOwnerPasswordAlways(
        'Reabrir Caixa do Dia',
        `Digite a senha da proprietária para REABRIR o caixa de ${formatDisplayDate(state.selectedDate)}:`,
        () => {
          delete state.closedDays[state.selectedDate];
          saveClosedDays();
          checkDateStatus(state.selectedDate);
          calculateMetrics();
          renderTransactions();
          renderLastTransaction();
          showToast(`Caixa de ${formatDisplayDate(state.selectedDate)} reaberto com sucesso!`);
        }
      );
    };
  }

  // Atalho rápido de acesso à proprietária na tela principal
  const quickOwnerBtn = document.getElementById('btn-quick-owner-login');
  if (quickOwnerBtn) {
    quickOwnerBtn.onclick = () => {
      document.getElementById('btn-owner-access').click();
    };
  }

  // Filtros de Data do Histórico (Dentro do Painel da Proprietária)
  const filterDateInput = document.getElementById('filter-view-date');
  if (filterDateInput) {
    filterDateInput.value = state.viewFilterDate;
    filterDateInput.onchange = (e) => {
      state.viewFilterDate = e.target.value || getTodayLocalDate();
      updateFilterBadge();
      calculateMetrics();
      renderTransactions();
    };
  }

  const btnFilterToday = document.getElementById('btn-filter-today');
  if (btnFilterToday) {
    btnFilterToday.onclick = () => {
      state.viewFilterDate = getTodayLocalDate();
      if (filterDateInput) filterDateInput.value = state.viewFilterDate;
      updateFilterBadge();
      calculateMetrics();
      renderTransactions();
    };
  }

  const btnFilterAllDates = document.getElementById('btn-filter-all-dates');
  if (btnFilterAllDates) {
    btnFilterAllDates.onclick = () => {
      state.viewFilterDate = 'TODOS';
      updateFilterBadge();
      calculateMetrics();
      renderTransactions();
    };
  }

  renderPackagingButtons();
  renderPaymentButtons();
  setupTypeToggle();
  updateSubtotal();
  checkDateStatus(state.selectedDate);
  calculateMetrics();
  renderTransactions();
  renderLastTransaction();
  updateFilterBadge();

  // Conecta ao Google Firebase Firestore em tempo real
  initFirestoreSync();

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
      if (panel) panel.scrollIntoView({ behavior: 'smooth' });
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
      date: state.selectedDate,
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
    saveTransactionsLocally();

    // Salva na nuvem Firestore
    if (db) {
      db.collection('transactions').doc(lossTx.id).set(lossTx).catch(err => {
        console.warn('Erro ao salvar baixa no Firestore:', err.message);
      });
    }

    renderTransactions();
    calculateMetrics();
    renderLastTransaction();
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

    // Salva na nuvem Firestore
    if (db) {
      db.collection('settings').doc('security').set({ ownerPassword: newPw }).catch(err => {
        console.warn('Erro ao salvar senha no Firestore:', err.message);
      });
    }

    pwModal.classList.add('hidden');
    showToast('Senha da proprietária alterada com sucesso!');
  };

  // Fechamento de Caixa do Dia
  const clearModal = document.getElementById('modal-clear-shift');
  document.getElementById('btn-open-clear-modal').onclick = () => {
    if (state.closedDays[state.selectedDate]) {
      showToast(`O caixa de ${formatDisplayDate(state.selectedDate)} já está fechado.`);
      return;
    }
    const labelEl = document.getElementById('modal-close-date-label');
    if (labelEl) labelEl.textContent = formatDisplayDate(state.selectedDate);
    clearModal.classList.remove('hidden');
  };

  document.getElementById('btn-cancel-modal').onclick = () => {
    clearModal.classList.add('hidden');
  };

  document.getElementById('btn-confirm-clear').onclick = () => {
    const targetDate = state.selectedDate;
    const now = new Date();
    const timeFormatted = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    // Registra que a data foi finalizada e fechada
    state.closedDays[targetDate] = {
      closedAt: timeFormatted,
      closedDate: targetDate,
      timestamp: Date.now()
    };
    saveClosedDays();

    // Atualiza saldo dos materiais se for o dia de hoje
    const currentUsage = computeMaterialsUsage();
    Object.values(currentUsage).forEach(item => {
      state.initialStock[item.key] = item.remaining;
    });
    saveStock();

    checkDateStatus(state.selectedDate);
    calculateMetrics();
    renderTransactions();
    renderLastTransaction();
    clearModal.classList.add('hidden');
    showToast(`Caixa de ${formatDisplayDate(targetDate)} fechado com sucesso!`);
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
