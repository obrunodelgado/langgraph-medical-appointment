import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { it } from 'node:test';
import { WinnowService } from '../src/services/winnowService.ts';
import { createIdentifyIntentNode } from '../src/graph/nodes/identifyIntentNode.ts';
import { professionals } from '../src/services/appointmentService.ts';
import { HumanMessage } from 'langchain';
import type { LlmService } from '../src/services/llmService.ts';

function answers(overrides = {}) {
  return { answers: {
    intent: { type: 'choice', choice: 'schedule' },
    professionalId: { type: 'choice', choice: '1' },
    patientNameProvided: { type: 'choice', choice: 'false' },
    datetimeProvided: { type: 'choice', choice: 'false' },
    reasonProvided: { type: 'choice', choice: 'false' },
    ...overrides,
  } };
}

async function withServer(status: number, body: unknown, run: (client: WinnowService, requests: any[]) => Promise<void>) {
  const requests: any[] = [];
  const server = createServer(async (req, res) => {
    let input = '';
    for await (const chunk of req) input += chunk;
    requests.push({ path: req.url, method: req.method, headers: req.headers, body: JSON.parse(input) });
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const client = new WinnowService({ baseURL: `http://127.0.0.1:${address.port}/v1/`, model: 'Winnow-12B', apiKey: 'test-key' });
  try {
    await run(client, requests);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

it('posts typed decisions to systemone and preserves appointment context through the real node', async () => {
  await withServer(200, answers(), async (client, requests) => {
    const llm = { async generateStructured() { throw new Error('No detail extraction expected'); } } as unknown as LlmService;
    const node = createIdentifyIntentNode(client, llm);
    const result = await node({
      messages: [new HumanMessage('Quero agendar com Dr. Alicio')],
      patientName: 'Maria', datetime: '2026-12-10T16:00:00Z', reason: 'check-up',
    });
    assert.equal(result.intent, 'schedule');
    assert.equal(result.professionalId, 1);
    assert.equal(result.patientName, 'Maria');
    assert.equal(result.datetime, '2026-12-10T16:00:00Z');
    assert.equal(result.reason, 'check-up');
    assert.equal(requests.length, 1);
    const request = requests[0];
    assert.equal(request.path, '/v1/systemone');
    assert.equal(request.method, 'POST');
    assert.equal(request.headers.authorization, 'Bearer test-key');
    assert.equal(request.body.model, 'Winnow-12B');
    assert.equal(request.body.state.context.known_patient_name, 'Maria');
    assert.equal(request.body.questions.professionalId.criteria['1'], 'Dr. Alicio da Silva (Cardiologia)');
    assert.equal(Object.keys(request.body.questions).length, 5);
    assert.ok(!('messages' in request.body));
    assert.ok(!('response_format' in request.body));
  });
});

it('maps true choices and an unspecified professional to the classification contract', async () => {
  await withServer(200, answers({
    professionalId: { type: 'choice', choice: 'none' },
    patientNameProvided: { type: 'choice', choice: 'true' },
    datetimeProvided: { type: 'choice', choice: 'true' },
    reasonProvided: { type: 'choice', choice: 'true' },
  }), async client => {
    const result = await client.classifyIntent('rules', { question: 'Sou Maria, amanhã às 16h, check-up' }, professionals);
    assert.deepEqual(result, { success: true, data: {
      intent: 'schedule', professionalId: null,
      patientNameProvided: true, datetimeProvided: true, reasonProvided: true,
    } });
  });
});

it('rejects missing answers and choices outside the submitted alternatives', async () => {
  for (const body of [answers({ intent: { type: 'choice', choice: 'invalid' } }), { answers: {} }]) {
    await withServer(200, body, async client => {
      const result = await client.classifyIntent('rules', {}, professionals);
      assert.equal(result.success, false);
      if (!result.success) assert.match(result.error, /Invalid or missing Winnow answer: intent/);
    });
  }
});

it('reports a missing decision endpoint and server failures without accepting a classification', async () => {
  for (const status of [404, 500]) {
    await withServer(status, { error: 'Unavailable' }, async client => {
      const result = await client.classifyIntent('rules', {}, professionals);
      assert.equal(result.success, false);
      if (!result.success) {
        assert.match(result.error, new RegExp(`HTTP ${status}`));
        if (status === 404) assert.match(result.error, /winnow-inference/);
      }
    });
  }
});

it('reports LM Studio unsupported endpoint errors even when HTTP status is 200', async () => {
  await withServer(200, { error: 'Unexpected endpoint or method. (POST /v1/systemone)' }, async client => {
    const result = await client.classifyIntent('rules', {}, professionals);
    assert.equal(result.success, false);
    if (!result.success) assert.match(result.error, /Unexpected endpoint or method/);
  });
});
