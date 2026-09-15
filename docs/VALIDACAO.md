# Validação da entrega — 15/09/2026

## Resultado e alcance

O ZIP reúne o projeto, a identidade visual, a documentação, os scripts e os testes. **Não equivale a uma homologação de produção.** A tabela diferencia testes realmente executados de verificações pendentes por falta das dependências de framework no ambiente.

| Verificação | Resultado | Escopo |
|---|---|---|
| `npm test` | **50 aprovados, 0 falhas, 0 ignorados** | Regras, persistência, concorrência, segurança e handler HTTP da API |
| `npm run typecheck:core` | **Aprovado** | Servidor, tipos/utilitários compartilhados e testes do núcleo |
| `npm run test:syntax` | **43 arquivos; 0 erros de sintaxe** | Parsing TypeScript/TSX, incluindo componentes e E2E; não é a compilação Next |
| Sintaxe dos scripts `.mjs` | **Aprovada** | Verificação `node --check` |
| Scripts de configuração e recuperação | **Aprovados em testes locais** | Setup, reexecução sem perda, demonstração separada, backup, integridade, reset e revogação de sessão |
| Prévias visuais | **40 verificações sem estouro horizontal da página** | HTML/CSS estático de 20 visões em 1440×1040 e 390×844 |
| `npm install` | **Bloqueado pelo ambiente** | Falha DNS `EAI_AGAIN` ao acessar `registry.npmjs.org` |
| `npm run build` | **Não concluído** | Binário Next indisponível porque as dependências não puderam ser baixadas |
| Verificação completa de tipos Next/React | **Pendente** | Deve ser executada depois da instalação real dos pacotes |
| 5 cenários E2E Playwright | **Entregues; não executados** | Login, inventário inicial, cadastro pela interface, navegação móvel e logout |
| Docker/Compose e arquivos `.cmd` | **Entregues; não executados aqui** | Configuração para validação no ambiente de destino |

O teste de API chama o mesmo handler Web Request/Response exposto pelo adaptador Next, com um SQLite real. Ele testa o handler e as regras, **não** uma instância Next atendendo conexões HTTP.

As prévias foram renderizadas a partir dos componentes com um adaptador interno de inspeção, somente para gerar HTML estático e conferir o CSS em Chromium. Esse adaptador **não faz parte do projeto entregue**. Não foram testadas hidratação React, navegação interativa Next ou submissão de formulários por esse método. Os screenshots não devem ser interpretados como prova de um build executado.

## Ambiente usado

Linux, Node **22.16.0**, TypeScript **5.8.3** e tipos Node **22.19.7** na verificação final do núcleo. O Node emitiu avisos experimentais de SQLite/type stripping, mas os comandos acima terminaram conforme registrado.

Não foram utilizados banco ou credenciais reais da empresa. As bases de teste são temporárias ou em memória. Não há banco SQLite preenchido nem senha de produção no ZIP.

## Casos cobertos pelo núcleo

Inicialização com 70 unidades a conferir e dois caminhões sem placas inventadas; isolamento da demonstração; reserva atômica; índice SQL contra duas locações abertas da mesma unidade; conflitos independentes de motorista e caminhão; rollback da reserva quando a agenda falha; documentos/status de motorista e placa de caminhão; capacidade e conferência de inventário; datas; ciclo físico completo; retorno avariado e manutenção; ações fora de ordem; versões antigas; atribuição do motorista; serviço atrasado bloqueando o recurso; cancelamento e recebimentos; reagendamento; tentativas sem conclusão; idempotência; pagamentos parciais; estorno; bloqueios de manutenção; abertura declarada de locação existente; filtros por perfil; sessões; cookies; mesma origem; limites de corpo JSON; datas locais; exportação CSV; backup e concorrência entre processos.

A suíte também verifica gravação pela API, retransmissão de comando, logout com revogação e preservação de espaços em senhas. Consulte os arquivos `.test.ts` para asserções exatas. Não foi calculado percentual de cobertura.

## Evidências

- `validation/tests.log`: resultado completo dos 50 testes.
- `validation/typecheck-core.log`: verificação final do núcleo.
- `validation/syntax.log`: parsing dos 43 arquivos TypeScript/TSX.
- `validation/cli.log`: configuração, backup, reabertura e recuperação.
- `validation/visual-inspection.json`: tamanhos e estouro horizontal das prévias estáticas.
- `validation/npm-install.log` e `validation/next-build.log`: limitação de rede/dependências.
- `previews/`: prévias estáticas da identidade visual, com dados demonstrativos quando aplicável.

## Homologação no computador de destino

```bash
npm install
npm run doctor
npm run check
npx playwright install chromium
npm run test:e2e
```

Após os testes automáticos, valide com usuários de cada perfil: uma entrega e retirada completas, um reagendamento, uma tentativa não realizada, um retorno para manutenção, um recebimento parcial, um estorno autorizado e uma restauração de ensaio. Não use fotos, placas ou endereços fictícios como operação real.

O sucesso dos testes do núcleo não elimina a necessidade de compilar, executar a interface, revisar as regras com sua equipe e validar a infraestrutura antes de produção.
