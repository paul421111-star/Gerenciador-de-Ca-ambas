# Instalação e primeiro acesso

## 1. Preparar a pasta

Extraia o ZIP completamente para uma pasta local, por exemplo `C:\Projetos\jr-cacambas`. Não execute arquivos de dentro da visualização do ZIP. Evite colocar o banco em pasta sincronizada por OneDrive/Dropbox ou unidade de rede.

Instale Node.js 22.16 ou superior da linha 22. Abra um **novo** terminal e confira:

```bash
node --version
npm --version
```

O projeto usa `node:sqlite`, incluído no Node, e scripts TypeScript executados com `--experimental-strip-types`. A versão testada aqui foi 22.16.0. Avisos `ExperimentalWarning` dessa versão não significam que um teste falhou.

## 2. Caminho mais simples no Windows

Abra `INSTALAR_E_INICIAR.cmd`. Ele instala dependências, executa a configuração inicial e inicia o servidor de desenvolvimento.

Você informará o e-mail, o nome e a senha do administrador. A senha precisa de 12 a 128 caracteres e será confirmada. Use uma senha longa e exclusiva. Nenhuma credencial padrão é publicada no projeto.

O navegador pode abrir antes de o servidor terminar de iniciar. Aguarde `Ready` no terminal e atualize a página. Mantenha a janela do terminal aberta. Para parar, pressione `Ctrl+C`.

Para iniciar novamente em outro dia, abra `INICIAR.cmd`.

## 3. Pelo terminal

No terminal do VS Code, Prompt de Comando ou Git Bash, entre na pasta extraída:

```bash
cd jr-cacambas
npm install
npm run setup
npm run dev
```

A página inicial é `http://localhost:3000`. O arquivo `.env` será criado a partir de `.env.example` durante `setup`, sem substituir um `.env` existente.

No PowerShell, caso apareça bloqueio de `npm.ps1`, use `npm.cmd install`, `npm.cmd run setup` e `npm.cmd run dev`, ou abra o Prompt de Comando. Não é necessário reduzir a política de segurança do computador.

O setup pode ser executado novamente: uma base já inicializada é preservada, sem recriar ou sobrescrever cadastros. Esquecer uma senha não exige apagar o banco.

## 4. Configuração local

Exemplo de `.env`:

```dotenv
APP_URL=http://localhost:3000
DATABASE_PATH=./data/jr.sqlite
BACKUP_DIR=./backups
```

`APP_URL` é a origem exata utilizada pelo navegador. Ela protege as operações de gravação contra requisições de outras origens. Ao mudar host ou porta, atualize o valor e reinicie o servidor.

Para testar pelo celular na mesma rede local, use o IP real do computador servidor em `APP_URL`, por exemplo `http://192.168.1.50:3000`, e acesse esse mesmo endereço nos dispositivos. O IP é apenas um exemplo. Libere a porta somente na rede privada confiável do seu firewall. Não exponha o servidor de desenvolvimento diretamente na internet. Geolocalização no celular pode exigir HTTPS.

Não configure `DATABASE_PATH` para a pasta `public/`. Não publique `.env`, dados ou backups no Git.

## 5. Modo demonstrativo

```bash
npm run demo
npm run dev:demo
```

O primeiro comando inicializa `data/demo.sqlite`. O segundo substitui `DATABASE_PATH` somente no processo iniciado, sem editar seu `.env`. A base real permanece separada. Para voltar à operação real, pare o servidor demonstrativo e execute `npm run dev`.

Os exemplos incluem clientes, motoristas, locações e pagamentos fictícios. A demonstração serve para explorar a interface; não deve ser convertida em base de produção nem usada como planejamento logístico real. A reutilização do setup preserva exemplos alterados; não reinicia o banco automaticamente.

## 6. Verificar antes do uso real

```bash
npm run doctor
npm run test:syntax
npm run typecheck:core
npm run check
npx playwright install chromium
npm run test:e2e
```

`check` executa a verificação de tipos completa, os testes do núcleo e a compilação Next. Os E2E usam a porta 3100 e um banco em `.test-data/e2e.sqlite`, recriado a cada rodada. Eles não utilizam `data/jr.sqlite`.

Depois de instalar com sucesso, mantenha `package-lock.json` no repositório. Em futuras instalações idênticas, use `npm ci`. Confira os avisos de segurança das dependências antes de publicar.

## 7. Problemas comuns

| Mensagem | Ação |
|---|---|
| `node` não reconhecido | Instale o Node compatível e reabra o terminal. |
| `ERR_UNKNOWN_BUILTIN_MODULE: node:sqlite` | A versão do Node é antiga. Confira `node --version`. |
| `EAI_AGAIN` / `ENOTFOUND` no npm | Confira internet, DNS e eventual proxy corporativo; tente a instalação novamente. Não desative validação TLS. |
| `next` não reconhecido | Execute `npm install` na pasta do `package.json`; não instale Next globalmente. |
| Porta 3000 ocupada | Encerre o outro servidor. Para usar 3001: atualize `APP_URL` e rode `npm run dev -- --port 3001`. |
| Sistema não inicializado | Execute `npm run setup` apontando para a mesma base usada pelo servidor. |
| Origem não autorizada | Confira host, protocolo e porta em `APP_URL`; reinicie o servidor e use exatamente a origem configurada. |
| E-mail ou senha incorretos | Confira qual base está aberta. A demonstração tem credenciais próprias. |
| Muitas tentativas | Aguarde o período de bloqueio informado. Evite tentativas automatizadas. |
| Nenhuma caçamba disponível | Na base real, as 70 unidades começam a conferir. Confirme fisicamente as que estiverem aptas no pátio. |
| Caminhão/motorista indisponível | Confira placa, status, habilitação cadastrada, janela de serviço e operações em andamento. |
| `SQLITE_BUSY` persistente | Evite múltiplas instâncias, ferramentas editando o banco e pasta sincronizada. Não apague o banco. |

## 8. Recuperar uma conta

Com acesso autorizado ao computador servidor, na pasta do projeto:

```bash
npm run admin:reset
```

Informe o e-mail exato e a nova senha. As sessões anteriores dessa conta serão revogadas. Para recuperar uma conta da base demonstrativa, aponte `DATABASE_PATH` para `./data/demo.sqlite` temporariamente no ambiente do comando; não altere o banco real por engano.

Para automações sem terminal interativo, `setup` e `admin:reset` aceitam `JR_ADMIN_EMAIL`, `JR_ADMIN_NAME` e `JR_ADMIN_PASSWORD` como variáveis temporárias. Não grave senhas no código, histórico compartilhado ou arquivo versionado.
