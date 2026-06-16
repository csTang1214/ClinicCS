// intent_actions.ts
import { Pool } from 'pg';
import { queryClinicContext, formatContextForLLM } from './pgvector_queries.js';

// You can inject the DB pool from the main file or make it a parameter
type ActionContext = {
  pool: Pool;
  userId?: string | number | null;     // authenticated patient id
  sessionId: string;
  message: string;
};

// Result that can be passed to the LLM or returned directly
export type ActionResult = {
  success: boolean;
  data?: any;
  message?: string;           // user-facing message or additional context
  error?: string;
};

// Action handler signature
export type IntentAction = (
  context: ActionContext
) => Promise<ActionResult>;

// Central registry of actions
export const intentActions: Record<string, IntentAction> = {
//   BOOKING: handleBooking,
//   RESCHEDULE: handleReschedule,
//   CANCELLATION: handleCancellation,
//   CLINIC_INFO: handleClinicInfo,
//   SERVICES: handleServices,
//   PAYMENT_BILLING: handlePaymentBilling,
//   INSURANCE: handleInsurance,
//   PRESCRIPTION_REFERRAL: handlePrescriptionReferral,
//   FEEDBACK_COMPLAINT: handleFeedback,
//   EMERGENCY: handleEmergency,
//   GENERAL_INQUIRY: handleGeneralInquiry,
//   OTHER: handleOther,
};

// Default fallback
export const defaultAction: IntentAction = async (context) => ({
  success: true,
  data: {},
  message: "I'll help you with that.",
});

/**
 * Generic RAG (Retrieval Augmented Generation) handler for any intent
 * Retrieves relevant clinic information and formats it for LLM augmentation
 */
export async function handleRAGIntent(
  intents: string | string[],
  context: ActionContext
): Promise<ActionResult> {
  const intentArray = Array.isArray(intents) ? intents : [intents];
  const { message, userId, sessionId } = context;

  try {
    // Query Chroma for relevant information based on intent(s)
    const queryResults = await queryClinicContext({
      intent: intentArray,
      message,
      userId,
    });

    // Format the results into a context string for the LLM
    const formattedContext = formatContextForLLM(queryResults);

    return {
      success: true,
      data: {
        intents: intentArray,
        augmentedContext: formattedContext,
        rawDocuments: queryResults.documents,
        sessionId,
      },
      message: formattedContext,
    };
  } catch (error) {
    console.error(`Error handling RAG for intents ${intentArray.join(', ')}:`, error);
    return {
      success: false,
      error: 'Failed to retrieve relevant information',
      message: 'Sorry, I had trouble retrieving the information you requested.',
    };
  }
}

/**
 * Execute the appropriate action for an intent
 */
export async function executeIntentAction(
  intent: string,
  context: ActionContext
): Promise<ActionResult> {
  const action = intentActions[intent] || defaultAction;
  try {
    return await action(context);
  } catch (err) {
    console.error(`Error executing action for intent ${intent}:`, err);
    return {
      success: false,
      error: 'Action execution failed',
      message: 'Sorry, I had trouble processing that request.',
    };
  }

  async function handleBooking(context: ActionContext): Promise<ActionResult> {
  return handleRAGIntent('BOOKING', context);
}
  async function handleClinicInfo(context: ActionContext): Promise<ActionResult> {
  return handleRAGIntent('CLINIC_INFO', context);
}
}