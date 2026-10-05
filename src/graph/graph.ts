import type { IntentClassifier } from '../services/winnowService.ts';
import {
  MemorySaver,
  StateGraph,
  START,
  END,
  MessagesZodMeta,
} from "@langchain/langgraph";
import { withLangGraph } from "@langchain/langgraph/zod";
import type { BaseMessage } from '@langchain/core/messages';

import { createSchedulerNode } from './nodes/schedulerNode.ts';
import { createCancellerNode } from './nodes/cancellerNode.ts';
import { createAvailabilityNode } from './nodes/availabilityNode.ts';
import { createIdentifyIntentNode} from "./nodes/identifyIntentNode.ts";
import { createMessageGeneratorNode } from "./nodes/messageGeneratorNode.ts";

import { z } from "zod/v3";
import { LlmService } from "../services/llmService.ts";
import { AppointmentService } from "../services/appointmentService.ts";

const AppointmentStateAnnotation = z.object({
  messages: withLangGraph(
    z.custom<BaseMessage[]>(),
    MessagesZodMeta),

  patientName: z.string().optional(),

  intent: z.enum(['schedule', 'cancel', 'availability', 'unknown']).optional(),
  professionalId: z.number().optional(),
  professionalName: z.string().optional(),
  datetime: z.string().optional(),
  availableSlots: z.array(z.string()).optional(),
  reason: z.string().optional(),

  actionSuccess: z.boolean().optional(),
  actionError: z.string().optional(),
  appointmentData: z.any().optional(),

  error: z.string().optional(),
});

export type GraphState = z.infer<typeof AppointmentStateAnnotation>;

export function buildAppointmentGraph(
  llmClient: LlmService,
  appoinmentService: AppointmentService,
  classificationClient: IntentClassifier
) {

  // Keeps each conversation's graph state available across invocations
  // while this process is running.
  const checkpointer = new MemorySaver();

  // Build workflow graph
  const workflow = new StateGraph({
    stateSchema: AppointmentStateAnnotation,
  })
    .addNode('identifyIntent', createIdentifyIntentNode(classificationClient, llmClient))
    .addNode('schedule', createSchedulerNode(appoinmentService))
    .addNode('cancel', createCancellerNode(appoinmentService))
    .addNode('availability', createAvailabilityNode(appoinmentService))
    .addNode('message', createMessageGeneratorNode(llmClient))

    // Flow
    .addEdge(START, 'identifyIntent')

    // Route based on intent
    .addConditionalEdges(
      'identifyIntent',
      (state: GraphState): string => {
        if (state.error || !state.intent || state.intent === 'unknown') {
          return 'message';
        }

        console.log(`➡️  Routing based on intent: ${state.intent}`);
        return state.intent
      },
      {
        schedule: 'schedule',
        cancel: 'cancel',
        availability: 'availability',
        message: 'message',
      }
    )

    .addEdge('schedule', 'message')
    .addEdge('cancel', 'message')
    .addEdge('availability', 'message')
    .addEdge('message', END);

  return workflow.compile({ checkpointer });
}
