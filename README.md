# Consultas médicas com LangGraph e modelos locais

Projeto didático de agendamento, cancelamento e consulta de horários disponíveis por linguagem natural. Uma API Fastify executa um grafo LangGraph com dois modelos locais: Winnow-12B para classificação e Qwen para extração de dados e geração de mensagens.

Usa como base o projeto [03-medical-appointment-z](https://github.com/unipds-engenharia-de-ia-aplicada/engenharia-de-software-com-ia-aplicada/tree/main/modulo02-integracao-apis-llms/03-medical-appointment-z) da pós-graduação de Inteligência Artificial Aplicada da UNIPDS.

## Requisitos

- Node.js **24.10.0 ou superior**, conforme `package.json`.
- npm.
- LM Studio com `qwen/qwen3.8-27b` carregado e servidor iniciado.
- Servidor `winnow-inference` iniciado com Winnow-12B carregado.
- Mac da série M*

Os comandos de instalação do Winnow abaixo são para macOS com Apple Silicon.

### Hardware

Para executar os dois modelos na mesma máquina, use as seguintes recomendações de dimensionamento. Elas são estimativas para este projeto, não mínimos oficiais nem uma configuração validada em teste de desempenho.

| Recurso | Recomendação |
| --- | --- |
| Mac | Apple Silicon (M1 ou posterior), com aceleração Metal |
| Memória unificada | **48 GB ou mais** para Winnow-12B Q8 e Qwen 27B quantizado em 4 bits, com contextos moderados; **64 GB ou mais** para maior folga |
| Armazenamento | SSD com **60 GB livres ou mais** para uma versão Q4 do Qwen, Winnow, dependências e compilação; outras quantizações ou cópias dos modelos exigem mais espaço |

O [LM Studio recomenda 16 GB ou mais de RAM](https://lmstudio.ai/docs/app/system-requirements) para uso geral, mas isso não dimensiona os dois modelos deste projeto. O [guia do Winnow](https://github.com/EldanRing/winnow-inference/blob/main/docs/INSTALL.md) registra uma verificação de capacidade em M4 Pro com 24 GB usando um checkpoint anterior, também sem o Qwen carregado.

Como referência de armazenamento, o [Qwen3.8-27B GGUF do ggml-org](https://huggingface.co/ggml-org/Qwen3.8-27B-GGUF/tree/main) ocupa aproximadamente 19 GB em Q4_K_M ou 28,6 GB em Q8_0. Esses tamanhos não incluem o cache de contexto nem a memória do runtime. A recomendação de 48 GB considera os pesos dos dois modelos e uma margem para esses custos e o sistema operacional; o consumo real varia com a quantização, o contexto e as requisições simultâneas.

Antes de carregar o Qwen, consulte a [estimativa de memória do LM Studio](https://lmstudio.ai/docs/cli/local-models/load) com `lms load --estimate-only <model_key> --context-length 8192`, substituindo `<model_key>` pela chave do modelo baixado. Considere também a memória ocupada pelo Winnow.

## Servidores e modelos

| Serviço | Endereço padrão | Responsabilidade |
| --- | --- | --- |
| API do projeto | `http://localhost:3000/chat` | Receber mensagens e executar o grafo |
| Winnow, via `winnow-inference` | `http://127.0.0.1:8091/v1/systemone` | Classificar intenção, profissional e dados fornecidos |
| Qwen, via LM Studio | `http://127.0.0.1:1234/v1/chat/completions` | Extrair nome, data e motivo; gerar a resposta |

O `WinnowService` faz um POST HTTP com `state` e cinco `questions` tipadas como `choice`. As respostas identificam a intenção (`schedule`, `cancel`, `availability` ou `unknown`), o profissional e se a última mensagem fornece nome do paciente, data/horário ou motivo da consulta.

O Qwen utiliza `ChatOpenAI` e `createAgent` com `providerStrategy` para respostas estruturadas. O cliente `LlmService` está configurado para acessar o LM Studio.

## Instalação do projeto

Na pasta deste projeto:

```bash
npm install
cp .env.example .env
```

Se você já tem um `.env`, edite o arquivo existente para preservar sua configuração.

## Instalação do Winnow no macOS

Instale as ferramentas de linha de comando do Xcode se ainda não estiverem disponíveis:

```bash
xcode-select --install
```

Com o Homebrew instalado, prepare as dependências e clone o servidor em uma pasta separada:

```bash
brew install python cmake openssl@3

mkdir -p ~/projetos
cd ~/projetos
git clone https://github.com/EldanRing/winnow-inference.git
cd winnow-inference

python3 scripts/setup.py --profile apple-silicon --text-only
```

O setup verifica os requisitos, baixa e valida os pesos Q8 e compila o runtime com Metal. Reserve aproximadamente 20 GB de espaço livre para o modelo e a compilação. O modo `--text-only` dispensa o projetor de visão. Veja as opções no [guia de instalação](https://github.com/EldanRing/winnow-inference/blob/main/docs/INSTALL.md).

Inicie o servidor com contexto de 8.192 tokens para começar os testes de classificação:

```bash
python3 scripts/serve.py \
  --profile apple-silicon \
  --text-only \
  --context 8192
```

Aguarde o carregamento e mantenha esse terminal aberto. O servidor escuta em `127.0.0.1:8091`.

## Configuração

Configure o `.env` do projeto:

```dotenv
# Qwen no LM Studio
LM_STUDIO_BASE_URL=http://127.0.0.1:1234/v1
LM_STUDIO_API_KEY=lm-studio
LM_STUDIO_MODEL=qwen/qwen3.8-27b

# Winnow no servidor winnow-inference
WINNOW_BASE_URL=http://127.0.0.1:8091/v1
WINNOW_MODEL=Winnow-12B
WINNOW_API_KEY=

# Rastreamento opcional
LANGCHAIN_TRACING_V2=false
LANGCHAIN_PROJECT=03-medical-appointment
```

A URL `WINNOW_BASE_URL` deve terminar em `/v1`: o cliente acrescenta `/systemone`. `WINNOW_API_KEY` pode ficar vazio no servidor local sem autenticação; quando preenchido, o cliente envia `Authorization: Bearer ...`.

Use o identificador exato do modelo carregado no LM Studio em `LM_STUDIO_MODEL`. Para habilitar o rastreamento, configure uma chave válida em `LANGSMITH_API_KEY` e altere `LANGCHAIN_TRACING_V2` para `true`. O `.env.example` inclui placeholders de rastreamento que devem ser ajustados.

Reinicie o processo do projeto depois de alterar o `.env`.

As seis variáveis `LM_STUDIO_*` e `WINNOW_*` são validadas com Zod em `src/env.ts` e disponibilizadas no objeto tipado `env`. Variáveis ausentes usam os valores padrão definidos no schema; URLs devem usar HTTP ou HTTPS, e os nomes dos modelos não podem ficar em branco. `WINNOW_API_KEY` aceita uma string vazia. Uma configuração inválida interrompe a inicialização com um erro de validação.

## Execução

Com os dois servidores de modelos em execução, teste primeiro a classificação:

```bash
node --env-file=.env src/winnow.ts
```

O script envia um pedido de agendamento de exemplo e imprime a classificação do Winnow. Ele não agenda uma consulta nem chama o Qwen.

Inicie a API:

```bash
npm start
```

Para desenvolvimento com reinício automático e debugger:

```bash
npm run dev
```

## API de conversação

Envie `POST /chat` com `question` e `threadId`. A mensagem precisa ter pelo menos 10 caracteres; `threadId` deve ter de 1 a 200 caracteres e não pode conter apenas espaços.

```bash
curl http://localhost:3000/chat \
  -H 'Content-Type: application/json' \
  -d '{
    "threadId": "consulta-maria",
    "question": "Sou Maria Santos e quero agendar com Dr. Alicio para amanhã às 16h para check-up"
  }'
```

Reutilize o mesmo `threadId` ao fornecer dados que faltam ou corrigir informações:

```bash
curl http://localhost:3000/chat \
  -H 'Content-Type: application/json' \
  -d '{
    "threadId": "consulta-maria",
    "question": "Troque o horário para amanhã às 15h"
  }'
```

A API retorna o estado do grafo, incluindo `messages`, `intent`, dados da consulta e indicadores como `actionSuccess`, `actionError`, `availableSlots` ou `error`. Consulte esses campos para saber se a operação foi concluída; uma resposta HTTP 200 não garante sucesso no agendamento.

## Comportamento do fluxo

O nó `identifyIntent` consulta o Winnow com a última mensagem, até quatro mensagens anteriores e os dados conhecidos da consulta. Quando a mensagem fornece nome, data/horário ou motivo, o Qwen extrai os valores correspondentes.

A intenção encaminha o fluxo para `schedule`, `cancel` ou `availability`. Mensagens sem intenção reconhecida e erros de classificação seguem para `message`. Ao final, o Qwen gera a mensagem de resposta.

- Agendamento e cancelamento exigem profissional, paciente e data completa com horário e fuso.
- Um dia sem horário permanece no estado para coleta posterior; ele não é suficiente para agendar.
- A consulta de disponibilidade exige profissional e dia.
- Dados omitidos nas mensagens seguintes são preservados; dados fornecidos explicitamente podem corrigir os anteriores.
- O prompt atual trata horários sem fuso explícito como UTC. Informe o fuso desejado na mensagem quando necessário.

O histórico é separado por `threadId` e armazenado em memória com `MemorySaver`. Consultas e disponibilidade também são simuladas em memória. Reiniciar a aplicação perde o histórico e as alterações na agenda; não há banco de dados.

## Testes

Execute os testes locais de coleta de dados e contrato HTTP do Winnow:

```bash
node --test tests/appointmentDetails.unit.test.ts tests/winnow.unit.test.ts
```

Esses testes usam respostas controladas e um servidor HTTP temporário em localhost. Não exigem modelos carregados. Cobrem continuidade da conversa, correções de dados, validação de campos, rota e payload de `/v1/systemone`, respostas inválidas e erros do servidor.

`npm test` inclui os testes E2E. Atualmente, `tests/router.e2e.test.ts` ainda envia requisições sem o `threadId` obrigatório e precisa ser atualizado antes de servir como validação completa do fluxo real.

O script `src/winnow.ts` permite verificar a classificação no modelo real. A aprovação dos testes locais não comprova a qualidade da classificação ou o fluxo completo com o Qwen.

## Arquivos principais

| Arquivo | Responsabilidade |
| --- | --- |
| `src/config.ts` | Configuração dos dois servidores |
| `src/index.ts` / `src/server.ts` | Inicialização da API e rota `/chat` |
| `src/graph/factory.ts` | Construção dos clientes e do grafo |
| `src/graph/graph.ts` | Estado, memória e roteamento |
| `src/graph/nodes/` | Classificação, operações da agenda e resposta |
| `src/services/winnowService.ts` | Cliente HTTP de decisões do Winnow |
| `src/services/llmService.ts` | Cliente estruturado do Qwen |
| `src/services/appointmentService.ts` | Profissionais e agenda em memória |
| `src/prompts/v1/` | Prompts e schemas de classificação, extração e resposta |
| `src/winnow.ts` | Teste manual da classificação real |

## Diagnóstico rápido

| Erro | Verificação |
| --- | --- |
| `Missing command: cmake` | Execute `brew install cmake openssl@3` e repita o setup |
| `fetch failed` ao chamar o Winnow | Confirme que `scripts/serve.py` está aberto e que `WINNOW_BASE_URL` aponta para `8091/v1` |
| `Unexpected endpoint or method. (POST /v1/systemone)` | A requisição provavelmente foi enviada ao LM Studio; use o servidor `winnow-inference` |
| Erro de geração estruturada do Qwen | Verifique o modelo carregado e a resposta de `/v1/chat/completions`, incluindo `content` e `reasoning_content` |
| HTTP 400 em `/chat` | Confira `question` e `threadId` conforme o contrato da API |

## Licença

MIT. O servidor Winnow e os pesos dos modelos têm seus próprios termos, disponíveis nos respectivos repositórios.
