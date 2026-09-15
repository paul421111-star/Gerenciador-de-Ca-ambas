# JR Caçambas

**Gestão operacional de locações, entregas, retiradas e retorno ao pátio.**

Projeto reestruturado em **Next.js App Router + React + TypeScript**, com API no mesmo servidor e banco SQLite persistente. Sua logo está incluída em `public/`. A base real começa com **70 caçambas e 2 caminhões**, sem inventar clientes, endereços, placas, capacidades ou distribuições.

## Comece aqui

No Windows, extraia o ZIP para uma pasta local, como `C:\Projetos\jr-cacambas`. Instale **Node.js 22.16 ou superior da linha 22** e abra `INSTALAR_E_INICIAR.cmd`. Na primeira execução, informe o nome, o e-mail e uma senha de pelo menos 12 caracteres para o administrador. A senha não vem pronta no projeto.

Pelo terminal, dentro da pasta que contém `package.json`:

```bash
npm install
npm run setup
npm run dev
```

Abra `http://localhost:3000` quando o terminal indicar que o servidor está pronto. Entre com as credenciais que você criou. Nas próximas vezes, basta `INICIAR.cmd` ou `npm run dev`.

**A instalação das dependências precisa de internet.** O ZIP não inclui `node_modules`, senha de produção ou banco preenchido.

## Experimentar antes de cadastrar a operação real

```bash
npm install
npm run demo
npm run dev:demo
```

Ou abra `INICIAR_DEMONSTRACAO.cmd`. A demonstração usa **`data/demo.sqlite`** e mostra um aviso amarelo permanente. A base real usa **`data/jr.sqlite`**. Não rode dois servidores na mesma porta. Cada base possui seu próprio administrador.

## Primeiros cadastros na base real

1. Em **Configurações**, informe empresa, contato e endereço do pátio. Defina prazo, preço-base e janela de serviço.
2. Em **Frota**, complete as placas reais de `CAM-01` e `CAM-02`. Cadastre os motoristas e confira seus dados.
3. Em **Controle de caçambas**, identifique as 70 unidades. Confira somente as presentes, vazias e aptas no pátio. Informe a capacidade real; faça lotes separados por capacidade.
4. Para caçambas que já estão em clientes, cadastre o cliente e use **Registrar locação existente**. Não marque essas unidades como disponíveis.
5. Cadastre acessos individuais em **Usuários e acessos**. Um cadastro de motorista, sozinho, não cria login.

## O que o projeto inclui

| Módulo | Escopo |
|---|---|
| Visão geral | Indicadores, distribuição, prazos vencidos e atividade recente |
| Locações | Reserva, entrega, coleta, retorno, cancelamento e abertura de operação existente |
| Agenda | Motorista e caminhão por etapa, horários, duração, reagendamento e conflitos |
| Caçambas | Identificação individual, capacidade, conferência, disponibilidade e manutenção |
| Mapa | Endereços e coordenadas cadastradas, destinos previstos separados dos locais atuais |
| Equipe e clientes | Contratante, responsável na obra, motorista executor e contato |
| Recebimentos | Lançamentos manuais, pagamentos parciais, saldo e estorno administrativo |
| Gestão | Manutenções, CSV, relatórios, histórico, ordem de serviço para impressão |
| Segurança | Sessões autenticadas, perfis ADMIN / DISPATCHER / DRIVER e restrições no servidor |

Fluxo físico:

```text
Reserva -> Em entrega -> No cliente -> Em retirada -> Retornando -> Retorno conferido
                                                                      |
                                                     disponível ou em manutenção
```

**A coleta não libera a caçamba.** A liberação depende do retorno, da descarga e da conferência no pátio. Entrega e retirada possuem datas previstas e datas efetivamente registradas separadas.

## Documentação

- [Instalação, Windows e solução de erros](docs/INSTALACAO.md)
- [Manual de operação](docs/OPERACAO.md)
- [Arquitetura, regras e manutenção do código](docs/ARQUITETURA.md)
- [Implantação, segurança e backup](docs/SEGURANCA-E-BACKUP.md)
- [API e integrações](docs/API.md)
- [Validações executadas e limitações](docs/VALIDACAO.md)

## Validação da entrega

Os **50 testes de regras, segurança e API passaram**, incluindo concorrência real entre processos. O núcleo TypeScript foi verificado. Também foram conferidas prévias estáticas do layout; isso **não equivale** a executar a aplicação React/Next inteira.

**A compilação completa e os testes E2E do Next não foram executados neste ambiente:** o acesso ao registro npm falhou com `EAI_AGAIN`. Os registros estão em `docs/validation/`. Antes de usar na operação real, execute em seu computador:

```bash
npm install
npm run doctor
npm run check
npx playwright install chromium
npm run test:e2e
```

O projeto inclui 5 cenários E2E com banco isolado; eles estão entregues para execução, não declarados como aprovados. `npm install` gerará o `package-lock.json`; ele não foi fabricado offline. Mantenha esse arquivo no seu Git após a instalação bem-sucedida.

## Hospedagem e limites do escopo

Use um servidor Node com **disco persistente**, ou o Docker Compose incluído, com uma instância da aplicação. A base foi projetada para instalação local/VPS, não para SQLite em armazenamento efêmero/serverless.

O mapa não é rastreamento contínuo. Não há geocodificação automática, sincronização offline, cobrança bancária Pix/cartão, nota fiscal, envio de WhatsApp, assinatura digital, upload de fotos ou roteirização otimizada. A impressão permite salvar PDF pelo navegador; não existe geração fiscal no backend. Essas integrações podem ser adicionadas posteriormente sem confundi-las com os recursos entregues.

Repositório: https://github.com/paul421111-star/Gerenciador-de-Ca-ambas
