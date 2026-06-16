import { Tool } from '@langchain/core/tools';
import { handleRAGIntent } from './intent_actions.js';
import { Pool } from 'pg';

// SQL Query Functions for Appointment Management

/**
 * Book a new appointment in the database
 */
async function bookAppointmentSQL(
  pool: Pool,
  patientId: number,
  doctorId: number,
  appointmentDate: string,
  durationMinutes: number = 30,
  notes?: string
): Promise<{ success: boolean; appointmentId?: number; error?: string }> {
  try {
    const result = await pool.query(
      `INSERT INTO appointments (patient_id, doctor_id, appointment_date, duration_minutes, status, notes)
       VALUES ($1, $2, $3, $4, 'scheduled', $5)
       RETURNING id, appointment_date, status`,
      [patientId, doctorId, appointmentDate, durationMinutes, notes || null]
    );
    
    if (result.rows.length > 0) {
      return {
        success: true,
        appointmentId: result.rows[0].id,
      };
    }
    return { success: false, error: 'Failed to create appointment' };
  } catch (error) {
    console.error('Error booking appointment:', error);
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Cancel an existing appointment
 */
async function cancelAppointmentSQL(
  pool: Pool,
  appointmentId: number,
  cancellationReason?: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const result = await pool.query(
      `UPDATE appointments 
       SET status = 'cancelled', notes = CASE 
         WHEN notes IS NULL THEN $2 
         ELSE notes || ' | Cancellation: ' || $2 
       END
       WHERE id = $1 AND status != 'cancelled'
       RETURNING id, status`,
      [appointmentId, cancellationReason || 'Cancelled by patient']
    );
    
    if (result.rows.length > 0) {
      return {
        success: true,
        message: `Appointment ${appointmentId} has been cancelled`,
      };
    }
    return { success: false, error: 'Appointment not found or already cancelled' };
  } catch (error) {
    console.error('Error cancelling appointment:', error);
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Reschedule an existing appointment to a new date/time
 */
async function rescheduleAppointmentSQL(
  pool: Pool,
  appointmentId: number,
  newAppointmentDate: string,
  newDoctorId?: number,
  rescheduleReason?: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const result = await pool.query(
      `UPDATE appointments 
       SET appointment_date = $2, 
           doctor_id = COALESCE($3, doctor_id),
           notes = CASE 
             WHEN notes IS NULL THEN $4 
             ELSE notes || ' | Rescheduled: ' || $4 
           END
       WHERE id = $1 AND status IN ('scheduled', 'rescheduled')
       RETURNING id, appointment_date, status`,
      [appointmentId, newAppointmentDate, newDoctorId || null, rescheduleReason || 'Rescheduled by patient']
    );
    
    if (result.rows.length > 0) {
      return {
        success: true,
        message: `Appointment ${appointmentId} has been rescheduled to ${result.rows[0].appointment_date}`,
      };
    }
    return { success: false, error: 'Appointment not found or cannot be rescheduled' };
  } catch (error) {
    console.error('Error rescheduling appointment:', error);
    return { success: false, error: (error as Error).message };
  }
}

export class BookingTool extends Tool {
  name = 'book_appointment';
  description = `Books a new medical appointment at the clinic. Use this when the user wants to:
- Schedule a new appointment
- Book an appointment with a specific doctor or service
- Request a specific date, time, or time slot
- Ask about appointment availability and scheduling

Input format: JSON with patient_id, doctor_id, appointment_date (ISO 8601), and optional notes`;

  constructor(private pool: Pool) {
    super();
  }

  async _call(input: string): Promise<string> {
    try {
      const params = JSON.parse(input);
      const { patient_id, doctor_id, appointment_date, duration_minutes = 30, notes } = params;

      if (!patient_id || !doctor_id || !appointment_date) {
        return JSON.stringify({
          success: false,
          error: 'Missing required fields: patient_id, doctor_id, appointment_date',
        });
      }

      const result = await bookAppointmentSQL(
        this.pool,
        patient_id,
        doctor_id,
        appointment_date,
        duration_minutes,
        notes
      );

      return JSON.stringify(result);
    } catch (error) {
      return JSON.stringify({
        success: false,
        error: `Error parsing input or booking appointment: ${(error as Error).message}`,
      });
    }
  }
}

export class CancelAppointmentTool extends Tool {
  name = 'cancel_appointment';
  description = `Cancels an existing medical appointment. Use this when the user wants to:
- Cancel an appointment
- Remove/delete a scheduled appointment
- Provide a cancellation reason

Input format: JSON with appointment_id and optional cancellation_reason`;

  constructor(private pool: Pool) {
    super();
  }

  async _call(input: string): Promise<string> {
    try {
      const params = JSON.parse(input);
      const { appointment_id, cancellation_reason } = params;

      if (!appointment_id) {
        return JSON.stringify({
          success: false,
          error: 'Missing required field: appointment_id',
        });
      }

      const result = await cancelAppointmentSQL(
        this.pool,
        appointment_id,
        cancellation_reason
      );

      return JSON.stringify(result);
    } catch (error) {
      return JSON.stringify({
        success: false,
        error: `Error parsing input or cancelling appointment: ${(error as Error).message}`,
      });
    }
  }
}

export class RescheduleAppointmentTool extends Tool {
  name = 'reschedule_appointment';
  description = `Reschedules an existing medical appointment to a new date/time. Use this when the user wants to:
- Change an appointment date or time
- Move appointment to a different doctor
- Reschedule with a reason

Input format: JSON with appointment_id, new_appointment_date (ISO 8601), optional new_doctor_id, and optional reschedule_reason`;

  constructor(private pool: Pool) {
    super();
  }

  async _call(input: string): Promise<string> {
    try {
      const params = JSON.parse(input);
      const { appointment_id, new_appointment_date, new_doctor_id, reschedule_reason } = params;

      if (!appointment_id || !new_appointment_date) {
        return JSON.stringify({
          success: false,
          error: 'Missing required fields: appointment_id, new_appointment_date',
        });
      }

      const result = await rescheduleAppointmentSQL(
        this.pool,
        appointment_id,
        new_appointment_date,
        new_doctor_id,
        reschedule_reason
      );

      return JSON.stringify(result);
    } catch (error) {
      return JSON.stringify({
        success: false,
        error: `Error parsing input or rescheduling appointment: ${(error as Error).message}`,
      });
    }
  }
}

export class ClinicalInfoTool extends Tool {
  name = 'get_clinic_info';
  description = `Retrieves clinic hours, location, contact info, policies, and general information. Use this when the user asks about:
- Clinic hours and when we're open/closed
- Location and directions
- Contact information (phone, email, address)
- Clinic services and team members
- General clinic policies and procedures
"`;

  constructor(private pool: Pool) {
    super();
  }

  async _call(input: string): Promise<string> {
    const result = await handleRAGIntent('CLINIC_INFO', { 
      pool: this.pool, 
      message: input, 
      userId: null, 
      sessionId: 'agent-session' 
    });
    return JSON.stringify(result);
  }
}

// Add similar tools for INSURANCE, MEDICAL, etc.