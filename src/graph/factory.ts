import { config } from '../config.ts';
import { WinnowService } from '../services/winnowService.ts';
import { AppointmentService } from '../services/appointmentService.ts';
import { LlmService } from '../services/llmService.ts';
import { buildAppointmentGraph } from './graph.ts';

export async function buildGraph() {
  const llmClient = new LlmService(config);
  const classificationClient = new WinnowService();
  const appointmentService = new AppointmentService();
  return buildAppointmentGraph(llmClient, appointmentService, classificationClient);
}

export const graph = async () => {
  return await buildGraph();
};
