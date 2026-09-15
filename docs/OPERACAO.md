# Manual de operação

## Identificar as 70 caçambas

Os códigos iniciais são `JR-001` a `JR-070`. Associe cada código a uma identificação física durável no equipamento. O cadastro individual evita que a quantidade total esconda a ausência de uma unidade.

O estado inicial **A conferir** significa local/situação ainda não confirmados. Não significa pátio. Informe a capacidade real em metros cúbicos. Em lotes, selecione somente unidades com a mesma capacidade que estejam presentes, descarregadas, inspecionadas e aptas para nova locação.

## Caçambas já instaladas antes do sistema

O administrador utiliza **Registrar locação existente**. Escolha uma caçamba a conferir, cliente, endereço, responsável, capacidade, data e horário declarados da entrega anterior e recursos responsáveis. Programe a retirada futura.

Essa abertura fica registrada como informação declarada na implantação, não como rastreamento ou evento capturado na data anterior. As unidades já locadas não devem passar pela conferência de disponibilidade no pátio.

## Criar uma locação

Cadastre o contratante em **Clientes**. Na locação, o contato da obra pode ser diferente do contato do cliente. O endereço do serviço é salvo separadamente; editar o cadastro do cliente não muda automaticamente o local da caçamba.

Selecione uma caçamba disponível. Informe entrega e retirada previstas, motorista e caminhão de **cada** etapa, duração da janela de serviço, preço combinado e observações. Uma locação utiliza uma caçamba; para duas unidades no mesmo endereço, crie duas locações.

A janela de agenda deve incluir o deslocamento, atendimento, descarga e retorno necessários. O sistema não calcula duração de trajetos. Não reserve simultaneamente o mesmo caminhão para serviços que ele não pode cumprir.

A reserva bloqueia a unidade imediatamente. O sistema não antecipa disponibilidade com base apenas na retirada prevista de outra locação. Isso evita dupla locação quando há atraso no retorno.

## Executar as etapas

| Ação | Quando registrar | Efeito |
|---|---|---|
| Iniciar entrega | Quando o motorista efetivamente inicia o serviço | Operação em entrega e caçamba em trânsito |
| Confirmar entrega | Quando a caçamba está instalada no local | Grava entrega efetiva e recebedor; situação no cliente |
| Iniciar retirada | Quando o motorista efetivamente inicia a retirada | Caminhão ocupado; caçamba ainda no cliente |
| Confirmar coleta | Quando a caçamba foi recolhida | Grava coleta; equipamento retornando, ainda indisponível |
| Conferir retorno | Após retorno, descarga e inspeção | Conclui locação e libera a unidade, ou abre manutenção por avaria |

O horário efetivo usa o relógio do servidor. As telas apresentam os horários no fuso **America/Sao_Paulo**. A previsão não é substituída pela data efetiva.

O perfil motorista confirma somente a etapa atribuída a ele. Administrador e operação podem registrar etapas pela central. Quem executa o registro fica no histórico; a atribuição do motorista permanece na programação.

## Serviço não realizado

Durante entrega ou retirada, use **Serviço não realizado / registrar tentativa**. Informe o motivo e confirme o retorno da equipe exigido pelo formulário. A tentativa é preservada no histórico e o serviço volta a aguardar programação. A caçamba permanece reservada quando a entrega não ocorreu, ou no cliente quando a retirada não ocorreu.

Não confirme falsamente uma entrega ou coleta apenas para avançar a tela. A aplicação não oferece edição irrestrita das datas efetivas após confirmação.

## Reagendamento, cancelamento e avarias

Reagende serviços ainda programados, informando um motivo. O sistema revalida conflitos e preserva as alterações no histórico. Trocar prazo não muda automaticamente o preço.

O cancelamento normal é permitido na reserva, antes do início da entrega. Recebimentos válidos impedem o cancelamento: o administrador deve resolver o financeiro e registrar o estorno interno quando cabível. O estorno não devolve dinheiro no banco.

Manutenção bloqueia a disponibilidade. Para liberar, registre a resolução e o custo. O cadastro não permite simplesmente trocar uma caçamba locada para disponível.

## Mapa e endereços

Uma caçamba no cliente aparece na lista mesmo sem coordenadas. Para um marcador preciso, informe latitude e longitude. O botão de localização, quando oferecido, captura **o dispositivo de quem registra**, com permissão do navegador; só use estando no ponto correto.

**Destinos previstos** são opcionais e visualmente diferenciados; não indicam a posição atual. Caçambas em retorno não continuam marcadas no endereço antigo como se estivessem lá. O mapa usa imagens externas do OpenStreetMap, exige internet e oferece links para abrir o local no Google Maps. Não há rastreador GPS permanente.

## Recebimentos e relatórios

Valores são guardados em centavos inteiros. Registre cada pagamento com data, forma e observação. Pagamentos parciais reduzem o saldo; um lançamento maior que o saldo é bloqueado. O histórico financeiro conserva estornos com motivo.

O financeiro é **manual**: escolher Pix ou cartão descreve a forma informada, não processa uma cobrança. Total contratado e recebido não representam lucro. Manutenção possui custos registrados, mas o sistema não é contabilidade completa.

Relatórios distinguem períodos de criação de locação, pagamento e agendamento. Confira a legenda antes de comparar valores. Exportações CSV usam UTF-8, separador `;` e proteção contra interpretação de textos como fórmulas.

Na ordem de serviço, **Imprimir / salvar PDF** abre o diálogo do navegador. Escolha impressora ou salvar em PDF. As linhas de assinatura são para preenchimento manual e não constituem assinatura digital.

## Encerramento do dia

Confira retiradas atrasadas, serviços em andamento e caçambas retornando. Reconcile o pátio físico com o cadastro, revise recebimentos e execute o backup. Não altere datas apenas para eliminar alertas.
