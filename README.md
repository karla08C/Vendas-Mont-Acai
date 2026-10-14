# 🍧 Mont' Açaí — Sistema PDV, Balança & Controle de Materiais

![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white)
![TailwindCSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![Vercel](https://img.shields.io/badge/Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white)

Sistema web completo de **Ponto de Venda (PDV)**, **controle de pesagem em balança** e **auditoria de estoque de materiais descartáveis** desenvolvido sob medida para a loja **Mont' Açaí**.

🔗 **Acesse o sistema online:** [https://vendas-mont-acai.vercel.app/](https://vendas-mont-acai.vercel.app/)

---

## 💻 Linguagens e Tecnologias Utilizadas

O projeto foi estruturado utilizando tecnologias web modernas, leves e sem dependência de servidores externos para garantir funcionamento rápido direto no navegador do caixa:

| Linguagem / Tecnologia | Finalidade no Projeto |
| :--- | :--- |
| **HTML5 (`index.html`)** | Estruturação semântica do painel de PDV, indicadores executivos, tabelas de auditoria e modais de gestão. |
| **CSS3 (`style.css`) & Tailwind CSS** | Estilização com paleta fosca personalizada (*Matte Dark Plum*), responsividade para desktop/tablet/celular e layout otimizado para impressão/PDF (`@media print`). |
| **JavaScript ES6+ (`app.js`)** | Lógica de negócios, cálculos financeiros em tempo real, controle de estoque de copos/colheres/tampas, autenticação por senha da proprietária e exportação de relatórios (WhatsApp, CSV e Impressão). |
| **Web Storage API (`localStorage`)** | Persistência local automática de vendas, estoque inicial de materiais, senha da proprietária e logotipo da loja. |

---

## ✨ Principais Funcionalidades

### 🛒 1. Operação de Balcão (PDV & Balança)
- **Registro de Vendas e Consumo Interno:** Alternância rápida entre vendas para clientes e consumo da equipe (que dá baixa no estoque e no peso sem distorcer o faturamento em R$).
- **Seleção de Recipientes:** `Copo de 500ml`, `Copo de 700ml` e `Isopor de 500ml Térmico`.
- **Aferição de Peso (Gramas):** Registro do peso exato da balança com soma automática em quilogramas (`kg`) e gramas (`g`).
- **Baixa Automática de Insumos por Pedido:** Controle individual da quantidade de **copos/isopores**, **colheres descartáveis** e **tampas** entregues em cada atendimento.
- **Meios de Pagamento:** Classificação por `PIX`, `Débito`, `Crédito` e `Dinheiro`.

### 🔒 2. Área Exclusiva da Proprietária (Protegida por Senha)
- **Controle de Estoque em Tempo Real:** Acompanhamento da quantidade inicial, total que saiu no dia (em vendas e consumo interno) e **saldo restante no balcão** para:
  - Copos de 500ml
  - Copos de 700ml
  - Isopores de 500ml
  - Colheres Descartáveis
  - Tampas
- **Alerta de Reposição:** Indicador automático quando o saldo de qualquer material fica abaixo do limite de segurança.
- **Baixa Avulsa / Perda:** Registro rápido para materiais avariados (ex.: copo amassado) ou saídas avulsas.
- **Proteção por Senha em Ações Críticas:** Somente a proprietária (mediante digitação de senha) pode **editar uma venda**, **excluir um lançamento** ou **zerar o turno**.

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

---


## 📁 Estrutura de Arquivos

```text
Vendas-Mont-Acai/
├── index.html   # Interface principal do PDV, modais e estrutura semântica
├── style.css    # Estilos customizados, paleta Matte Dark Plum e regras de impressão (@media print)
├── app.js       # Lógica de estado, cálculos, controle de estoque, autenticação e relatórios
└── README.md    # Documentação técnica e guia do projeto
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
