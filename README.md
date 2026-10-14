# 🍧 Mont' Açaí — Sistema PDV, Balança & Controle de Materiais

![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white)
![TailwindCSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![Firebase](https://img.shields.io/badge/Firebase_Firestore-FFCA28?style=for-the-badge&logo=firebase&logoColor=black)
![Vercel](https://img.shields.io/badge/Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white)

Sistema web completo de **Ponto de Venda (PDV)**, **controle de pesagem em balança**, **auditoria de estoque de materiais descartáveis** e **sincronização em tempo real na nuvem** desenvolvido sob medida para a loja **Mont' Açaí**.

🔗 **Acesse o sistema online:** [https://vendas-mont-acai.vercel.app/](https://vendas-mont-acai.vercel.app/)

---

## 💻 Linguagens e Tecnologias Utilizadas

O projeto foi estruturado utilizando tecnologias web modernas, leves e com banco de dados em tempo real na nuvem, mantendo operação ininterrupta no caixa mesmo se houver queda de internet:

| Linguagem / Tecnologia | Finalidade no Projeto |
| :--- | :--- |
| **HTML5 (`index.html`)** | Estruturação semântica do painel de PDV, indicadores executivos, tabelas de auditoria e modais de gestão. |
| **CSS3 (`style.css`) & Tailwind CSS** | Estilização com paleta fosca personalizada (*Matte Dark Plum*), responsividade para desktop/tablet/celular e layout otimizado para impressão/PDF (`@media print`). |
| **JavaScript ES6+ (`app.js`)** | Lógica de negócios, cálculos financeiros em tempo real, controle de estoque de copos/colheres/tampas, autenticação por senha da proprietária e exportação de relatórios (WhatsApp, CSV e Impressão). |
| **Google Firebase Firestore (v10 SDK)** | Banco de dados na nuvem NoSQL em tempo real (`southamerica-east1`), sincronizando vendas, estoque e caixas entre múltiplos aparelhos (celular da proprietária + computador do balcão) com persistência offline via IndexedDB. |
| **Web Storage API (`localStorage`)** | Camada de redundância e fallback local instantâneo (0ms de carregamento) para dados, estoque e configurações. |

---

## ✨ Principais Funcionalidades

### 🛒 1. Operação de Balcão (Tela Principal Limpa & Foco no Atendimento)
- **Tela Principal Simplificada:** Mantém na tela inicial apenas o **Formulário de Novos Lançamentos** e a **Conferência do Último Lançamento Realizado** (para conferência imediata do peso, valor e insumos do atendimento recém-concluído).
- **Registro de Vendas e Consumo Interno:** Alternância rápida entre vendas para clientes e consumo da equipe (que dá baixa no estoque e no peso sem distorcer o faturamento em R$).
- **Seleção de Recipientes:** `Copo de 500ml`, `Copo de 700ml` e `Isopor de 500ml Térmico`.
- **Aferição de Peso (Gramas):** Registro do peso exato da balança com cálculo automático.
- **Baixa Automática de Insumos por Pedido:** Quantidade de **copos/isopores**, **colheres descartáveis** e **tampas** entregues ao cliente.
- **Meios de Pagamento:** Classificação por `PIX`, `Débito`, `Crédito` e `Dinheiro`.

### 🔒 2. Área Exclusiva da Proprietária (Protegida por Senha)
- **Painel Gerencial Completo:** Todas as informações estratégicas e confidenciais ficam guardadas dentro do acesso da proprietária:
  - **Faturamento e Indicadores Financeiros:** Receita bruta do dia, ticket médio por atendimento e peso total comercializado.
  - **Controle de Estoque em Tempo Real:** Quantidade inicial, saídas em vendas, saídas em consumo/perda e saldo restante de copos (500ml e 700ml), isopores (500ml), colheres e tampas.
  - **Histórico Completo de Lançamentos:** Listagem detalhada com filtros e opções protegidas para editar valores ou excluir registros.
  - **Ações Gerenciais:** Abastecer/ajustar estoque inicial, registrar perdas avulsas, gerar relatórios de fechamento e fechar o caixa do dia.
  - **Proteção Total por Senha:** Exige a senha da proprietária para desbloquear o painel gerencial, editar vendas, alterar estoque ou reabrir caixas fechados.

### 📊 3. Relatório de Fechamento de Caixa & Auditoria
- **Painel Visual Detalhado:** Indicadores de Receita Bruta, Ticket Médio, Preço Médio por Kg (`R$/kg`), tabela financeira por forma de pagamento e tabela de auditoria física de materiais.
- **Resumo Formatado para WhatsApp:** Cópia com 1 clique do fechamento completo para envio à gerência.
- **Exportação para Excel (`.csv`) e Impressão / PDF:** Download de planilha compatível com Excel e layout de impressão limpo.

### 📅 4. Controle Diário de Caixa por Data (Aberto / Fechado)
- **Seletor de Data da Venda:** Permite registrar as vendas com a data exata da pesagem (padrão no dia de hoje).
- **Fechamento do Caixa do Dia:** Ao concluir todos os atendimentos do turno/dia, a operadora fecha o caixa daquela data.
- **Bloqueio Automático:** Dias com caixa fechado ficam bloqueados contra novos lançamentos ou alterações acidentais.
- **Reabertura Protegida por Senha:** Se for necessário alterar ou lançar algo em um dia já fechado, o sistema exige a senha da proprietária para desbloquear o dia.
- **Filtro de Histórico e Métricas:** Navegação e conferência rápida por dia específico ou consolidado geral.

### ☁️ 5. Sincronização em Tempo Real na Nuvem (Google Firebase Firestore)
- **Sincronização Multi-Dispositivo Instantânea:** A proprietária pode acompanhar as vendas e o faturamento em tempo real pelo celular enquanto o atendimento ocorre no computador do balcão.
- **Badges de Conexão no Topo:** Indicação visual de `☁️ Nuvem Ao Vivo`, `☁️ Sincronizando...` ou `☁️ Modo Offline`.
- **Persistência Offline Resiliente:** Graças à persistência do SDK Firebase e redundância com `localStorage`, a loja nunca para de funcionar mesmo se faltar internet no balcão. As operações são gravadas localmente e sincronizadas automaticamente quando o sinal restabelecer.
- **Migração Transparente:** Os lançamentos feitos anteriormente no navegador são migrados automaticamente para a nuvem no primeiro acesso.

---

## 📁 Estrutura de Arquivos

```text
Vendas-Mont-Acai/
├── index.html        # Interface principal do PDV, modais e estrutura semântica
├── style.css         # Estilos customizados, paleta Matte Dark Plum e regras de impressão (@media print)
├── app.js            # Lógica de estado, sincronização Firebase, controle de estoque e autenticação
├── firestore.rules   # Regras de segurança e integridade do Cloud Firestore
└── README.md         # Documentação técnica e guia do projeto
```

---

## 🚀 Como Executar Localmente

1. Clone o repositório:
   ```bash
   git clone git@github.com:karla08C/Vendas-Mont-Acai.git
   ```
2. Acesse a pasta do projeto:
   ```bash
   cd Vendas-Mont-Acai
   ```
3. Abra o arquivo `index.html` diretamente no navegador (ou execute `start index.html` no terminal Windows).

---

## 👩‍💻 Autora

Desenvolvido por **Karla Castro** ([@karla08C](https://github.com/karla08C)).
