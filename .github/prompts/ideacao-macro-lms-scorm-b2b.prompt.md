---
name: "Ideacao Macro LMS SCORM 2004 B2B"
description: "Estrutura uma visao macro de produto para LMS B2B com compatibilidade SCORM 2004, separando frente e backend"
argument-hint: "Contexto, publico, restricoes, prazo e prioridade"
agent: "plan"
---
Atue como Product Strategist e Solution Architect para uma LMS B2B compativel com SCORM 2004.

Objetivo:
- Construir uma visao macro inicial para fins de estudo, separando claramente frente e backend.
- Nao detalhar implementacao de baixo nivel nesta etapa.
- Assumir arquitetura multi-tenant com isolamento logico por organizacao.
- Assumir controle de usuarios via banco de dados nesta fase inicial.

Como usar os argumentos do usuario:
- Trate os argumentos recebidos como contexto principal do problema.
- Se faltarem dados criticos, explicite suposicoes de forma clara.

Entregue a resposta em portugues com as secoes abaixo:

1. Visao do Produto B2B
- Proposta de valor para empresas/escolas
- Perfis de cliente (comprador, administrador, instrutor, aluno)
- Problemas que resolve no contexto corporativo/educacional

2. Escopo Macro do MVP
- Modulos essenciais do MVP
- O que fica fora do MVP
- Criterios de sucesso do MVP

3. Requisitos de Compatibilidade SCORM 2004
- Capacidades minimas obrigatorias
- Fluxo de upload/importacao, lancamento e rastreio de progresso
- Eventos e dados minimos acompanhados (tentativa, status, score, completion)
- Riscos de interoperabilidade entre pacotes de fornecedores diferentes

4. Arquitetura em Alto Nivel - Frontend
- Aplicacoes e superfices (portal admin, area do aluno, player)
- Responsabilidades de UX, autenticacao de sessao e experiencia de consumo
- Principais integracoes com backend

5. Arquitetura em Alto Nivel - Backend
- Servicos principais (usuarios, cursos, matriculas, progresso, relatorios)
- Persistencia de dados e armazenamento de pacotes SCORM
- Estrategia de controle de usuarios via DB por hora (autenticacao, autorizacao e papeis)
- APIs e contratos de integracao com frontend
- Observabilidade, auditoria e trilha de eventos

6. Modelo de Dados Conceitual
- Entidades centrais e relacoes
- Dados minimos para progresso, nota, tentativa, conclusao e rastreio por organizacao

7. NFRs e Governanca
- Seguranca e privacidade (foco B2B)
- Escalabilidade multi-tenant com isolamento logico por tenant
- Confiabilidade, monitoramento e rastreabilidade

8. Roadmap Inicial
- Fase 0: Descoberta e validacao
- Fase 1: MVP
- Fase 2: Evolucao

9. Riscos e Mitigacoes
- Top 5 riscos
- Mitigacoes propostas para cada risco

10. Proximos Passos Praticos
- Backlog inicial em epicos separados por frontend e backend
- Decisoes que precisam de validacao antes da execucao

Regras de qualidade:
- Seja objetivo e estruturado.
- Nao invente requisitos sem marcar como suposicao.
- Priorize clareza para tomada de decisao.
- Evite codigo e detalhes de implementacao nesta etapa.
- Mantenha foco em B2B e compatibilidade SCORM 2004.
