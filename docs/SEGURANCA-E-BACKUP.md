# Implantação, segurança e backup

## Condições antes da produção

Esta entrega não foi homologada em um servidor de produção. Instale dependências, rode `npm run check`, execute os E2E e valide um ciclo real controlado antes de depender exclusivamente do aplicativo. Confira DNS, HTTPS, permissões, relógio do servidor, logs, restauração e acessos de cada perfil.

Use **uma instância Next em servidor Node com armazenamento persistente**. Não use esta configuração SQLite em funções serverless, múltiplas réplicas ou pasta compartilhada de rede. O arquivo do banco e seus arquivos auxiliares precisam permanecer no disco entre reinícios e deploys.

## Execução Node

Depois da instalação, configure `APP_URL` com a origem HTTPS pública, `DATABASE_PATH` com um caminho persistente fora da pasta de versões e `BACKUP_DIR` com pasta protegida.

```bash
npm run setup
npm run check
npm run start
```

O start exige uma compilação bem-sucedida. Coloque o processo sob um gerenciador de serviços e um proxy reverso HTTPS. Restrinja a porta interna 3000 à rede/host do proxy. Não exponha `npm run dev` na internet.

A cookie de sessão usa `Secure` em produção. Por isso, publicar em HTTP pode impedir login. Não remova a proteção para contornar esse problema: configure HTTPS corretamente.

## Docker Compose

Na pasta do projeto, crie `.env` com a origem do seu domínio, por exemplo:

```dotenv
APP_URL=https://gestao.seu-dominio.com.br
```

O domínio é ilustrativo. Configure seu domínio real e o proxy antes de liberar acesso.

```bash
docker compose build
docker compose run --rm app npm run setup
docker compose up -d
```

O Compose guarda o banco no volume `jr_data` e os backups em `jr_backups`. A porta está publicada em `127.0.0.1:3000`, para um proxy instalado no mesmo host. Se o proxy estiver em outro contêiner, adapte a rede explicitamente. Não abra a porta indiscriminadamente.

O `Dockerfile` usa usuário não root na execução. A construção exige internet para baixar a imagem base e pacotes. Docker/Compose não foram executados no ambiente da entrega. Após gerar e versionar um lockfile válido, troque `npm install` por `npm ci` no processo de construção para instalação reproduzível.

**Nunca execute `docker compose down -v` na operação real:** isso remove os volumes. Atualize com backup, nova construção e `docker compose up -d` preservando os volumes.

O endpoint `/api/health` confirma que a API responde. Ele não atesta que o inventário foi conferido, que o backup existe ou que a base foi inicializada.

## Controles implementados

Senhas são derivadas com scrypt e salt aleatório. Não são armazenadas em texto puro. Espaços nas senhas não são removidos. Sessões usam tokens aleatórios e guardam somente seu hash no banco, com validade de 12 horas. A cookie é HttpOnly e SameSite=Strict; em produção, Secure.

O login possui bloqueio temporário por conta após tentativas inválidas. A API exige mesma origem em gravações, valida JSON e tamanho do corpo, revalida permissões e não retorna SQL ou stack trace ao cliente. Consultas mutáveis utilizam parâmetros, não concatenação de entrada do usuário.

Os headers incluem proteções de tipo de conteúdo, iframe, referência e política de conteúdo. A CSP ainda permite scripts inline para o funcionamento do Next; não é uma política estrita baseada em nonce. Não há MFA, SSO ou rate limiting global por IP no proxy. Avalie essas camadas antes de exposição ampla.

O histórico da aplicação não é um log externo imutável: quem possui acesso administrativo ao arquivo SQLite pode alterá-lo. Proteja o servidor e o acesso ao banco.

## Fazer backup

Com a base correta configurada:

```bash
npm run backup
```

O script utiliza `VACUUM INTO`, incluindo dados confirmados no WAL, e verifica a integridade da cópia. Ele informa o arquivo criado em `BACKUP_DIR`. Uma base ausente ou ainda não inicializada é recusada.

Em Docker:

```bash
docker compose exec -T app npm run backup
docker compose cp app:/app/backups/. ./backup-export
```

Copie o backup para outro equipamento/armazenamento protegido e mantenha retenções adequadas ao seu processo. **Backup no mesmo disco não protege contra perda do servidor.** O projeto não agenda backups automaticamente nem envia arquivos para a nuvem.

Para automatizar, configure o agendador do seu sistema operacional depois de testar o comando com a mesma conta de serviço e variáveis. Monitore falhas e execute uma restauração de ensaio. Não considere a existência do arquivo suficiente.

## Restaurar com segurança

1. Pare a aplicação e confirme que não há processo usando o banco.
2. Preserve uma cópia do estado atual, incluindo seus arquivos `-wal` e `-shm` quando existirem. Não copie apenas o arquivo principal de uma base em uso.
3. Em um diretório de teste, confira o backup e os dados esperados. Use `npm run db:check -- caminho/do/backup.sqlite`.
4. Com os processos parados, coloque a cópia consistente no caminho `DATABASE_PATH`. Remova/mova os arquivos auxiliares antigos associados à base substituída para que não sejam reutilizados com o backup; não apague arquivos auxiliares de uma base em uso.
5. Confira proprietário/permissões, reinicie, entre no sistema e valide quantidades, locações abertas e últimos recebimentos. Registre o ponto no tempo restaurado.

Em Docker, faça o mesmo procedimento no volume persistente com suporte de quem administra o host. Não importe um arquivo de demonstração por engano. Restaurar um backup também restaura usuários, senhas e sessões daquela data; revise acessos e revogue sessões conforme seu plano de resposta.

## Dados pessoais

Nomes, contatos, endereços e coordenadas devem ser acessíveis somente à equipe autorizada. Defina prazos de guarda, finalidade, acesso a exportações e descarte com os responsáveis da empresa. Não insira documentos ou observações desnecessários. Os tiles e links externos enviam requisições ao provedor quando utilizados; considere isso em sua orientação de privacidade.
