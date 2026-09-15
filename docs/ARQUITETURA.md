# Arquitetura e regras de negócio

## Decisões da estrutura

O protótipo anexado foi substituído por uma aplicação Next com backend persistente, e não apenas por uma nova camada visual. Não houve migração de uma base real: o anexo serviu de referência e a implantação real começa com inventário a conferir.

```text
src/
  app/
    layout.tsx                 HTML raiz, metadados e estilos
    login/                     Acesso público
    (app)/layout.tsx            Provider autenticado e shell
    (app)/[section]/            Módulos da aplicação
    (app)/ordem/[id]/           Ordem imprimível
    api/[...path]/route.ts      Adaptador de rotas HTTP Next
  components/                  Telas, formulários, mapa e navegação
  server/
    api.ts                     Handler HTTP testável sem framework
    service.ts                 Comandos e invariantes do domínio
    db.ts, schema.ts            SQLite, transações e esquema inicial
    auth.ts                    Senhas, sessões e proteção de login
    seed.ts                    Implantação real e demonstração
    validate.ts, http.ts        Validação, origem, JSON e respostas
  shared/                      Tipos, formatação e exportação
scripts/                       Setup, backup, recuperação e diagnóstico
tests/                         Regras, segurança, API e E2E
docs/                          Instalação, operação e evidências
public/                        Logo original, recorte de apresentação e favicon
```

Os formulários ficam centralizados em `components/forms.ts`, com campos tipados e submissão pela API. As regras definitivas ficam no servidor; esconder um botão não é tratado como autorização.

## Dados principais

`containers` representa unidades físicas. `trucks` e `drivers` representam recursos de execução. `customers` identifica contratantes. `rentals` armazena local, contato no local, datas previstas e efetivas, valor e estado. Cada locação tem dois `jobs`: entrega e retirada, com recursos independentes.

`rentalEvents` guarda o histórico operacional. `payments` preserva recebimentos e estornos. `maintenance` guarda indisponibilidades e resoluções. `users`, `sessions`, `loginAttempts`, `audit` e `commandReceipts` sustentam autenticação, rastreabilidade e idempotência.

As relações usam chaves estrangeiras. Um índice único parcial impede duas locações abertas para a mesma caçamba, mesmo que uma futura alteração de código tente ignorar a validação do serviço.

## Concorrência e consistência

Comandos mutáveis executam dentro de `BEGIN IMMEDIATE`. Reserva, agenda e eventos são gravados juntos ou revertidos juntos. Janelas sobrepostas de motorista e caminhão são rejeitadas separadamente. Uma operação ainda em andamento continua bloqueando o recurso mesmo se ultrapassar sua duração prevista.

Transições e reagendamentos recebem `version`, recusando uma edição sobre dados antigos. O frontend envia `Idempotency-Key` e o servidor relaciona a chave ao usuário e ao hash do comando. Repetir a mesma requisição retorna o resultado anterior; reutilizar a chave para outro conteúdo é rejeitado.

O cliente não presume sucesso quando a rede falha. Ele atualiza o snapshot depois de uma gravação e exibe erros. Há atualização periódica de 30 segundos enquanto a aba está visível. Não há WebSocket nem sincronização offline.

## Perfis

| Perfil | Escopo |
|---|---|
| ADMIN | Operação completa, configurações, contas, abertura de locações antigas, auditoria e estornos |
| DISPATCHER | Clientes, frota, motoristas, locações, agenda, manutenções, recebimentos e relatórios |
| DRIVER | Seus serviços atribuídos, endereços/contatos necessários, etapas permitidas e senha própria |

Para o motorista, o servidor filtra o snapshot e remove pagamentos, contas, auditoria, valores comerciais e dados cadastrais não necessários. O motorista não consegue executar um comando administrativo por chamar a API diretamente.

## Horário, dinheiro e local

Instantes são persistidos como ISO com fuso e exibidos em São Paulo. A conversão de campos locais é explícita. Datas inválidas, retirada anterior à janela de entrega e pares incompletos de coordenadas são bloqueados. Valores monetários são inteiros em centavos, evitando usar ponto flutuante para saldos.

O mapa é uma visualização Web Mercator de tiles externos, sem SDK comercial e sem chave de API. Uma lista acessível preserva endereços quando os tiles não estão disponíveis. Atribuição do OpenStreetMap permanece visível. Antes de ampliar significativamente o uso, escolha um provedor de tiles compatível com sua demanda e condições de uso.

## Evolução e limites técnicos

SQLite foi escolhido para entregar frontend, API e persistência sem conta de banco externo. Opera em arquivo local, com WAL, chaves estrangeiras, timeout de bloqueio e transações. Use uma instância de aplicação, disco persistente e backup externo.

A listagem atual retorna um snapshot; paginação de algumas telas é client-side. O histórico crescerá e pode exigir paginação no servidor, retenção de logs e migração para PostgreSQL quando houver maior escala. Não foi feito teste de carga ou dimensionamento de produção.

O esquema possui versão inicial. Mudanças futuras devem ser feitas com migrações incrementais e backup, nunca apagando o arquivo do banco. Não utilize a rotina de seed para migrar dados.

Sugestão de branch para incorporar esta entrega ao seu repositório:

```bash
git switch -c MelhoriasPlus
```

Não execute esse comando fora de um repositório existente. Guarde o protótipo em outra pasta/branch e compare antes de substituir a versão utilizada. Integrações bancárias, fiscais, GPS, fotos e assinatura devem ter autenticação, armazenamento, auditoria e testes próprios.

## Referências técnicas consultadas

Versões diretas foram fixadas em `package.json`: Next 16.3.5, React/React DOM 19.3.0 e TypeScript 5.8.3. Isso não substitui o lockfile das dependências transitivas nem comprova uma instalação executada.

- Next App Router / instalação: https://nextjs.org/docs/app/getting-started/installation
- Distribuição Next: https://www.npmjs.com/next
- React 19.3: https://react.dev/blog/2026/09/09/react-19-3
- SQLite no Node 22.16: https://nodejs.org/download/release/v22.16.0/docs/api/sqlite.html

Consulta em 15/09/2026. Consulte as correções de segurança antes de publicar ou atualizar o sistema.
