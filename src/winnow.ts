import { WinnowService } from './services/winnowService.ts';
import { getSystemPrompt, getUserPromptTemplate } from './prompts/v1/identifyIntent.ts';
import { professionals } from './services/appointmentService.ts';

const client = new WinnowService();
const result = await client.classifyIntent(
  getSystemPrompt(professionals),
  getUserPromptTemplate('Quero agendar com Dr. Alicio, sou Maria Santos, amanhã às 16h para check-up'),
  professionals,
);
if (!result.success) throw new Error(result.error);
console.log('Winnow classification:', result.data);
