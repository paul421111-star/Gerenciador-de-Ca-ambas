# API do JR Caçambas

A API está na mesma origem da interface e é servida por Next Route Handlers em runtime Node. Não existe backend separado para iniciar.

| Método / rota | Finalidade |
|---|---|
| GET `/api/health` | Resposta pública de disponibilidade HTTP |
| POST `/api/login` | Autentica e define a cookie de sessão |
| GET `/api/snapshot` | Retorna os dados permitidos para a conta autenticada |
| POST `/api/command` | Executa um comando transacional autorizado |
| POST `/api/logout` | Revoga a sessão e limpa a cookie |

POST exige `Origin` igual ao `APP_URL` configurado. Login e comandos recebem `Content-Type: application/json`. Login tem limite de 4 KiB; comandos, 64 KiB. Não publique um segredo de integração no frontend.

## Formato de comando

```json
{
  "action": "createCustomer",
  "payload": {
    "name": "Cliente exemplo",
    "contact": "Responsavel exemplo",
    "phone": "11900000000"
  }
}
```

O header `Idempotency-Key` precisa ser uma chave nova por ação lógica, preservada na retransmissão do mesmo comando após falha de rede. A interface usa um identificador aleatório. Reutilizar uma chave com conteúdo diferente é rejeitado.

Sucesso retorna um objeto `{ "message": "...", "id": "..." }`, com `id` quando aplicável. Erros retornam `{ "error": "..." }`. A interface deve conferir o status HTTP, não apenas a existência de JSON.

## Comandos

`createCustomer`, `updateCustomer`, `createDriver`, `updateDriver`, `createTruck`, `updateTruck`, `createContainer`, `updateContainer`, `confirmInventory`, `createRental`, `importActiveRental`, `transitionRental`, `rescheduleJob`, `addPayment`, `voidPayment`, `startMaintenance`, `finishMaintenance`, `createUser`, `setUserActive`, `changePassword`, `saveSettings`.

Os payloads completos e suas validações estão em `src/server/service.ts`. Os exemplos de utilização da interface estão em `src/components/forms.ts`. Tipos compartilhados ficam em `src/shared/types.ts`.

Exemplo de transição, usando o `id` e `version` atuais obtidos do snapshot:

```json
{
  "action": "transitionRental",
  "payload": {
    "id": "ID_REAL_DA_LOCACAO",
    "version": 1,
    "action": "start_delivery"
  }
}
```

**Confira `forms.ts` e o caso `transitionRental` antes de integrar:** campos adicionais variam conforme a etapa. Entrega concluída exige recebedor, retorno exige condição e tentativas/cancelamentos exigem justificativas. O exemplo não substitui a validação do contrato atual.

Não há API key externa, webhook de pagamento ou autenticação de terceiros nesta versão. Integrações externas devem ser implementadas separadamente com escopo, credenciais e testes específicos, sem enfraquecer as verificações de origem da interface.
