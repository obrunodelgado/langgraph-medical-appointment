import { z } from 'zod/v3';
import { winnowConfig } from '../config.ts';
import { IntentClassificationSchema } from '../prompts/v1/identifyIntent.ts';

type Professional = { id: number; name: string; specialty: string };
type Classification = z.infer<typeof IntentClassificationSchema>;
type ClassificationResult =
  | { success: true; data: Classification }
  | { success: false; error: string };

export interface IntentClassifier {
  classifyIntent(instructions: string, context: unknown, professionals: Professional[]): Promise<ClassificationResult>;
}

type ChoiceQuestion = {
  type: 'choice';
  instructions: string;
  criteria: Record<string, string | null>;
};

const ChoiceAnswerSchema = z.object({ type: z.literal('choice'), choice: z.string() });
const ResponseSchema = z.object({ answers: z.record(ChoiceAnswerSchema) });

export class WinnowService implements IntentClassifier {
  private config: typeof winnowConfig;

  constructor(configOverride = winnowConfig) {
    this.config = configOverride;
  }

  async classifyIntent(instructions: string, context: unknown, professionals: Professional[]): Promise<ClassificationResult> {
    const flag = (field: string): ChoiceQuestion => ({
      type: 'choice',
      instructions: `Following the classification rules, is ${field} supplied, selected or corrected in the latest user message? Use history only to interpret that message.`,
      criteria: { true: 'Yes, supplied in the latest user message', false: 'No, absent from the latest user message' },
    });
    const questions: Record<string, ChoiceQuestion> = {
      intent: {
        type: 'choice',
        instructions: 'Following the classification rules, which intent describes the latest user message? Use conversation and known appointment to interpret follow-ups.',
        criteria: {
          schedule: 'Book a new medical appointment or supply missing booking details',
          cancel: 'Cancel an existing medical appointment',
          availability: 'Ask for available appointment dates or times',
          unknown: 'Unrelated message or no clear appointment intent',
        },
      },
      professionalId: {
        type: 'choice',
        instructions: 'Which listed medical professional does the user mean? Use conversation and known appointment for omitted references. Choose none if unspecified or ambiguous.',
        criteria: {
          none: 'No specified or unambiguous medical professional',
          ...Object.fromEntries(professionals.map(p => [String(p.id), `${p.name} (${p.specialty})`])),
        },
      },
      patientNameProvided: flag('the patient name (not the doctor name)'),
      datetimeProvided: flag('an appointment day or time'),
      reasonProvided: flag('the appointment reason, including check-up, retorno or revisão'),
    };

    try {
      const endpoint = `${this.config.baseURL.replace(/\/+$/, '')}/systemone`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {}),
        },
        body: JSON.stringify({ model: this.config.model, state: { instructions, context, professionals }, questions }),
        signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok) {
        throw new Error(`Winnow /v1/systemone returned HTTP ${response.status}${response.status === 404 ? ': verify WINNOW_BASE_URL points to winnow-inference with the decision API enabled' : ''}`);
      }
      const payload: unknown = await response.json();
      const serverError = z.object({ error: z.string() }).safeParse(payload);
      if (serverError.success) {
        throw new Error(`Winnow /v1/systemone: ${serverError.data.error}`);
      }
      const { answers } = ResponseSchema.parse(payload);
      for (const [name, question] of Object.entries(questions)) {
        const answer = answers[name];
        if (!answer || !Object.hasOwn(question.criteria, answer.choice)) {
          throw new Error(`Invalid or missing Winnow answer: ${name}`);
        }
      }
      return { success: true, data: IntentClassificationSchema.parse({
        intent: answers.intent!.choice,
        professionalId: answers.professionalId!.choice === 'none' ? null : Number(answers.professionalId!.choice),
        patientNameProvided: answers.patientNameProvided!.choice === 'true',
        datetimeProvided: answers.datetimeProvided!.choice === 'true',
        reasonProvided: answers.reasonProvided!.choice === 'true',
      }) };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
}
