import type { IntentClassifier } from '../../services/winnowService.ts';
import {
  getSystemPrompt, getUserPromptTemplate, IntentClassificationSchema,
  getAppointmentDetailsSystemPrompt, AppointmentDetailsSchema,
} from '../../prompts/v1/identifyIntent.ts';
import { professionals } from '../../services/appointmentService.ts';
import type { LlmService } from '../../services/llmService.ts';
import type { GraphState } from '../graph.ts';

const MAX_HISTORY_MESSAGES = 4;

export function createIdentifyIntentNode(classificationClient: IntentClassifier, llmClient: LlmService) {
  return async (state: GraphState): Promise<Partial<GraphState>> => {
    console.log(`🔍 Identifying intent...`);
    try {
      const input = state.messages.at(-1)?.text;
      if (!input?.trim()) {
        throw new Error('No message available for intent identification');
      }
      const recentConversation = state.messages
        .slice(0, -1)
        .slice(-MAX_HISTORY_MESSAGES)
        .map(message => ({
          role: message.type === 'human' ? 'user' as const : 'assistant' as const,
          content: message.text,
        }));

      const systemPrompt = getSystemPrompt(professionals);
      const context = getUserPromptTemplate(
        input,
        recentConversation,
        state.patientName,
        {
          intent: state.intent,
          professionalId: state.professionalId,
          professionalName: state.professionalName,
          datetime: state.datetime,
          reason: state.reason,
        },
      );
      const result = await classificationClient.classifyIntent(
        systemPrompt,
        context,
        professionals,
      );
      if (!result.success) {
        throw new Error(result.error || 'Intent classification failed');
      }
      const classification = IntentClassificationSchema.parse(result.data);
      const { intent, professionalId } = classification;
      const professional = professionals.find(p => p.id === professionalId);
      if (professionalId !== null && !professional) {
        throw new Error(`Invalid professional choice: ${professionalId}`);
      }

      console.log(`✅ Intent identified: ${intent}`);

      let patientName = state.patientName?.trim();
      let datetime = state.datetime;
      let reason = state.reason;
      const patientNameProvided = classification.patientNameProvided;
      const datetimeProvided = classification.datetimeProvided;
      const reasonProvided = classification.reasonProvided;
      if (patientNameProvided || datetimeProvided || reasonProvided) {
        const extraction = await llmClient.generateStructured(
          getAppointmentDetailsSystemPrompt(),
          JSON.stringify({ ...context, professionals }),
          AppointmentDetailsSchema,
        );
        if (!extraction.success) {
          throw new Error(extraction.error || 'Appointment details extraction failed');
        }
        const extracted = AppointmentDetailsSchema.parse(extraction.data);
        if (patientNameProvided) patientName = extracted.patientName ?? patientName;
        if (datetimeProvided) datetime = extracted.datetime ?? datetime;
        if (reasonProvided) reason = extracted.reason ?? reason;
      }

      return {
        intent,
        professionalId: professional?.id ?? state.professionalId,
        professionalName: professional?.name ?? state.professionalName,
        ...(patientName ? { patientName } : {}),
        ...(datetime ? { datetime } : {}),
        ...(reason ? { reason } : {}),
        actionSuccess: undefined,
        actionError: undefined,
        appointmentData: undefined,
        availableSlots: undefined,
        error: undefined,
      };

    } catch (error) {
      console.error('❌ Error in identifyIntent node:', error);
      return {
        intent: 'unknown',
        actionSuccess: undefined,
        actionError: undefined,
        error: error instanceof Error ? error.message : 'Intent identification failed',
      };
    }
  };
}
