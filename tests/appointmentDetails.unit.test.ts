import assert from 'node:assert/strict';
import { it } from 'node:test';
import { HumanMessage } from 'langchain';
import { buildAppointmentGraph } from '../src/graph/graph.ts';
import { createIdentifyIntentNode } from '../src/graph/nodes/identifyIntentNode.ts';
import { createSchedulerNode } from '../src/graph/nodes/schedulerNode.ts';
import { AppointmentService } from '../src/services/appointmentService.ts';
import type { IntentClassifier } from '../src/services/winnowService.ts';
import type { LlmService } from '../src/services/llmService.ts';

type Answers = { patient?: boolean; datetime?: boolean; reason?: boolean; professional?: string };
function fakeClassifier(turns: Answers[], contexts: unknown[] = []) {
  return {
    async classifyIntent(_system: string, input: unknown) {
      contexts.push(input);
      const turn = turns.shift();
      assert.ok(turn, 'Unexpected classification call');
      return { success: true, data: {
        intent: 'schedule',
        professionalId: turn.professional ? Number(turn.professional) : null,
        patientNameProvided: !!turn.patient,
        datetimeProvided: !!turn.datetime,
        reasonProvided: !!turn.reason,
      } };
    },
  } satisfies IntentClassifier;
}

it('collects required fields over several invocations of the same thread', async () => {
  const contexts: any[] = [];
  const details = [
    { patientName: 'Maria Santos', datetime: null, reason: null },
    { patientName: null, datetime: '2026-12-10', reason: null },
    { patientName: null, datetime: '2026-12-10T16:00:00Z', reason: 'check-up' },
  ];
  const classifier = fakeClassifier([
    { patient: true, professional: '1' },
    { datetime: true },
    { datetime: true, reason: true },
    {},
  ], contexts);
  const client = {
    async generateStructured(_system: string, _input: string, schema: any) {
      if ('message' in schema.shape) return { success: true, data: { message: 'Informe os dados que faltam.' } };
      const data = details.shift();
      assert.ok(data);
      return { success: true, data };
    },
  } as unknown as LlmService;
  const bookings: unknown[][] = [];
  const service = new AppointmentService();
  service.bookAppointment = (...args) => {
    bookings.push(args);
    return { professionalId: args[0], date: args[1].toISOString(), patientName: args[2], reason: args[3] };
  };
  const graph = buildAppointmentGraph(client, service, classifier);
  const invoke = (question: string, threadId = 'details') => graph.invoke(
    { messages: [new HumanMessage(question)] },
    { configurable: { thread_id: threadId } },
  );
  await invoke('Sou Maria Santos, quero agendar com Dr. Alicio');
  const day = await invoke('Dia 10 de dezembro');
  assert.equal(day.patientName, 'Maria Santos');
  assert.equal(day.professionalId, 1);
  assert.equal(day.datetime, '2026-12-10');
  assert.equal(day.actionSuccess, false);
  assert.equal(bookings.length, 0, 'A day without a time must not book an appointment');
  const scheduled = await invoke('Às 16h, para check-up');
  assert.equal(scheduled.actionSuccess, true);
  assert.equal(scheduled.actionError, undefined);
  assert.equal(scheduled.reason, 'check-up');
  assert.equal(bookings.length, 1);
  assert.equal(contexts[2].known_appointment.datetime, '2026-12-10');
  assert.equal(contexts[2].known_patient_name, 'Maria Santos');
  const otherThread = await invoke('Quero agendar uma consulta', 'other');
  assert.equal(otherThread.patientName, undefined);
  assert.equal(otherThread.datetime, undefined);
  assert.equal(bookings.length, 1);
});

it('preserves omitted details and accepts explicit corrections', async () => {
  const node = createIdentifyIntentNode(
    fakeClassifier([{ datetime: true, reason: true, professional: '2' }]),
    { async generateStructured() {
      return { success: true, data: { patientName: null, datetime: '2026-12-11T15:00:00Z', reason: 'retorno' } };
    } } as unknown as LlmService,
  );
  const result = await node({
    messages: [new HumanMessage('Troque para Dra. Ana, dia 11 às 15h, retorno')],
    patientName: 'Maria Santos', professionalId: 1,
    professionalName: 'Dr. Alicio da Silva', datetime: '2026-12-10T16:00:00Z', reason: 'check-up',
  });
  assert.equal(result.patientName, 'Maria Santos');
  assert.equal(result.professionalId, 2);
  assert.equal(result.datetime, '2026-12-11T15:00:00Z');
  assert.equal(result.reason, 'retorno');
});

it('rejects a day without a time before calling the booking service', async () => {
  const service = new AppointmentService();
  service.bookAppointment = () => { throw new Error('Booking must not be called'); };
  const result = await createSchedulerNode(service)({
    messages: [], professionalId: 1, patientName: 'Maria', datetime: '2026-12-10',
  });
  assert.equal(result.actionSuccess, false);
  assert.equal(result.actionError, 'Informe o dia e o horário da consulta');
});

it('rejects a professional outside the list before extracting details', async () => {
  const node = createIdentifyIntentNode(
    fakeClassifier([{ professional: '999', patient: true }]),
    { async generateStructured() { throw new Error('Extraction must not be called'); } } as unknown as LlmService,
  );
  const result = await node({ messages: [new HumanMessage('Quero agendar uma consulta')] });
  assert.equal(result.intent, 'unknown');
  assert.equal(result.error, 'Invalid professional choice: 999');
});

it('returns a classification error without reusing the previous intent', async () => {
  const node = createIdentifyIntentNode(
    { async classifyIntent() { return { success: false, error: 'Model unavailable' }; } },
    {} as LlmService,
  );
  const result = await node({ messages: [new HumanMessage('Cancele a consulta')], intent: 'schedule', actionSuccess: true });
  assert.equal(result.intent, 'unknown');
  assert.equal(result.error, 'Model unavailable');
  assert.equal(result.actionSuccess, undefined);
});
