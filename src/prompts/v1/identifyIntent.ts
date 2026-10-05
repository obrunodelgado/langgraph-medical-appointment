import { z } from 'zod/v3';

export const IntentSchema = z.object({
  intent: z.enum(['schedule', 'cancel', 'availability', 'unknown']).describe('The user intent'),
  professionalId: z.number().optional().describe('ID of the medical professional'),
  professionalName: z.string().optional().describe('Name of the medical professional'),
  datetime: z.string().optional().describe('Requested day or appointment date and time in ISO format'),
  patientName: z.string().optional().describe('Patient name extracted from question'),
  reason: z.string().optional().describe('Reason for appointment (for scheduling)'),
});

export type IntentData = z.infer<typeof IntentSchema>;

export const PatientNameSchema = z.object({
  patientName: z.string().trim().min(1).nullable()
    .describe('Patient name provided in the latest user message, or null if absent'),
});

export const getPatientNameSystemPrompt = () => [
  'Extract only the patient name supplied or corrected in the latest user message.',
  'Use recent conversation to understand replies to a request for the patient name.',
  'The patient may be the user or someone the user is booking for.',
  'Do not extract the doctor name, copy a name from an assistant message, or invent a name.',
  'Do not return an old name unless the user supplies it again in the latest message.',
  'Return patientName as null if the latest message does not provide a patient name.',
].join(' ');

export const AppointmentDetailsSchema = PatientNameSchema.extend({
  datetime: z.string().nullable().describe('Updated ISO date (YYYY-MM-DD) or full ISO datetime, or null if absent'),
  reason: z.string().trim().min(1).nullable().describe('Appointment reason supplied in the latest message, or null if absent'),
});

export const getAppointmentDetailsSystemPrompt = () => [
  getPatientNameSystemPrompt(),
  'Also extract the appointment date/time and reason supplied or corrected in the latest message.',
  'Use current_date to resolve relative dates and recent_conversation to understand short replies.',
  'Use known_appointment.datetime to combine a new time with the known day, or a new day with the known time.',
  'If only a day is provided and no time is known, return YYYY-MM-DD. Never invent a time.',
  'For a full datetime use ISO 8601 with a timezone. This appointment service uses UTC for unqualified times.',
  'Return datetime or reason as null when that field is not supplied or corrected in the latest message.',
  'Do not treat suggested dates, times or reasons from assistant messages as user selections.',
].join(' ');

type Professional = {
  id: number;
  name: string;
  specialty: string;
};

export const IntentClassificationSchema = z.object({
  intent: IntentSchema.shape.intent,
  professionalId: z.number().int().nullable()
    .describe('ID from the supplied professionals list, or null if unspecified or ambiguous'),
  patientNameProvided: z.boolean().describe('Latest user message supplies or corrects the patient name'),
  datetimeProvided: z.boolean().describe('Latest user message supplies, selects or corrects an appointment day or time'),
  reasonProvided: z.boolean().describe('Latest user message supplies or corrects the appointment reason'),
});

export const getSystemPrompt = (professionals: Professional[]) => [
  'Classify the latest user question and return only the requested structured output.',
  'schedule: book a new medical appointment / agendar consulta.',
  'cancel: cancel an existing medical appointment / cancelar consulta.',
  'availability: ask for free appointment times / consultar horários disponíveis.',
  'unknown: unrelated question or no clear appointment intent.',
  'Use recent_conversation and known_appointment.intent to resolve follow-ups supplying missing details.',
  'An unrelated message must be unknown even when a previous appointment intent is known.',
  'Select professionalId only from the supplied list. Use history and known_appointment for omitted references.',
  'Return professionalId as null if unspecified, ambiguous or absent from the list.',
  'Set the Provided flags only when the latest user message supplies, selects or corrects that field.',
  'Use history to understand short replies, but never mark a field as provided solely because it appears in history or known_appointment.',
  'A patient name can be a reply to a name request; doctor names are not patient names.',
  'A date/time can be a relative day or a selection of a suggested slot.',
  'A reason can be a symptom or the purpose of the appointment. In particular, check-up, checkup, exame de rotina, retorno and revisão are appointment reasons: set reasonProvided to true when the latest message includes them.',
  'Example: Quero agendar com Dr. Alicio, sou Maria Santos, amanhã às 16h para check-up => intent schedule, professionalId 1, patientNameProvided true, datetimeProvided true, reasonProvided true.',
  `Professionals: ${JSON.stringify(professionals)}`,
].join(' ');

type ConversationTurn = {
  role: 'user' | 'assistant';
  content: string;
};

/** Context shared by classification and appointment detail extraction. */
export const getUserPromptTemplate = (
  question: string,
  recentConversation: ConversationTurn[] = [],
  knownPatientName?: string,
  knownAppointment: Partial<IntentData> = {},
) => {
  return {
    question,
    recent_conversation: recentConversation,
    known_patient_name: knownPatientName,
    known_appointment: knownAppointment,
    current_date: new Date().toISOString(),
  };
};
