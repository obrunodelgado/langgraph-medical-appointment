const today = new Date();
const todayAtElevenAM = new Date(today);
todayAtElevenAM.setUTCHours(11, 0, 0, 0);

const tomorrow = new Date();
tomorrow.setDate(today.getDate() + 1);
const tomorrowAtTwoPM = new Date(tomorrow);
tomorrowAtTwoPM.setUTCHours(14, 0, 0, 0);

export const professionals = [
    {
        id: 1,
        name: 'Dr. Alicio da Silva',
        specialty: 'Cardiologia',
    },
    {
        id: 2,
        name: 'Dra. Ana Pereira',
        specialty: 'Dermatologia',
    },
    {
        id: 3,
        name: 'Dra. Isabella de Paula',
        specialty: 'Neurologia',
    },
];


const appointments = [
    {
        date: todayAtElevenAM.toISOString(),
        patientName: 'Joao da Silva',
        reason: 'check-up regular',
        professionalId: professionals[0].id
    },
    {
        date: tomorrowAtTwoPM.toISOString(),
        patientName: 'Luana Costa',
        reason: 'Erupção cutânea',
        professionalId: professionals[1].id
    },
]


export class AppointmentService {

    listAvailableSlots(professionalId: number, date: Date): string[] {
        if (!professionals.some(professional => professional.id === professionalId)) {
            throw new Error('Profissional não encontrado');
        }

        const day = new Date(date);
        const slots = Array.from({ length: 9 }, (_, index) => {
            const slot = new Date(day);
            slot.setUTCHours(9 + index, 0, 0, 0);
            return slot;
        });

        return slots
            .filter(slot => this.checkAvailability(professionalId, slot))
            .map(slot => slot.toISOString());
    }

    getAppointmentsForProfessional(professionalId: number, date: Date, patientName?: string) {
        return appointments.find(appointment =>
            appointment.professionalId === professionalId &&
            new Date(appointment.date).getTime() === date.getTime() &&
            (!patientName || appointment.patientName === patientName)
        );
    }

    checkAvailability(professionalId: number, date: Date): boolean {
        const alreadyBooked = this.getAppointmentsForProfessional(professionalId, date);
        return !alreadyBooked; // Returns true if available (not booked), false if booked
    }

    bookAppointment(professionalId: number, date: Date, patientName: string, reason: string) {
        if (!this.checkAvailability(professionalId, date)) {
            throw new Error('Horário indisponível para este profissional');
        }

        const newAppointment = {
            date: date.toISOString(),
            patientName,
            reason,
            professionalId
        };

        appointments.push(newAppointment);
        return newAppointment;
    }
    cancelAppointment(professionalId: number, patientName: string, date: Date) {
        const hasBooked = this.getAppointmentsForProfessional(professionalId, date, patientName);
        if (!hasBooked) {
            throw new Error('Agendamento não encontrado para cancelamento');
        }

        const index = appointments.indexOf(hasBooked);
        appointments.splice(index, 1);
    }

}
