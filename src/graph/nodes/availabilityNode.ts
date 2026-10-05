import { AppointmentService } from '../../services/appointmentService.ts';
import type { GraphState } from '../graph.ts';
import { z } from 'zod/v3';

const AvailabilityRequiredFieldsSchema = z.object({
  professionalId: z.number({ required_error: 'Professional ID is required' }),
  datetime: z.string({ required_error: 'Appointment day is required' }),
});

export function createAvailabilityNode(appointmentService: AppointmentService) {
  return async (state: GraphState): Promise<Partial<GraphState>> => {
    console.log('🔎 Listing available appointment times...');

    const validation = AvailabilityRequiredFieldsSchema.safeParse(state);
    if (!validation.success) {
      const error = validation.error.errors.map(issue => issue.message).join(', ');
      return { actionSuccess: false, actionError: error };
    }

    const day = new Date(validation.data.datetime);
    if (Number.isNaN(day.getTime())) {
      return {
        actionSuccess: false,
        actionError: 'Data inválida para consultar a disponibilidade',
      };
    }

    try {
      const availableSlots = appointmentService.listAvailableSlots(
        validation.data.professionalId,
        day,
      );

      return {
        actionSuccess: true,
        availableSlots,
      };
    } catch (error) {
      const actionError = error instanceof Error
        ? error.message
        : 'Não foi possível consultar a disponibilidade';

      console.log(`❌ Availability lookup failed: ${actionError}`);
      return { actionSuccess: false, actionError };
    }
  };
}
