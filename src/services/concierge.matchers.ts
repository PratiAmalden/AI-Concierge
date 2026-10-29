import type { ChatMessage, ConciergeReply } from "../types/concierge.js";
import { 
  CONCIERGE_INTRO_REPLY, 
  GREETING_REPLY, 
  ACKNOWLEDGEMENT_REPLY, 
  FOLLOW_UP_CLARIFICATION_REPLY
} from "./concierge.prompts.js";

function fixedReply(reply: string): ConciergeReply {
  return {
    reply,
    confidence: 1,
    topic: "learning-support",
    handoff: false,
  };
}
/** Returns deterministic responses to social turns and questions about the concierge itself. */
export function getConversationalReply(message: string): ConciergeReply | undefined {
  const cleanMessage = message.trim().toLowerCase();
  
  if (/^(hi|hello|hey|hiya|good morning|good afternoon|good evening)(\s+there)?[\s!.,?]*$/.test(cleanMessage)) {
    return fixedReply(GREETING_REPLY);
  }
  if (/^(thanks|thank you|thanks a lot|thank you very much|thanks that helps|thank you that helps|got it|okay|ok|that helps|that makes sense|great|perfect)[\s!.,?]*$/.test(cleanMessage)) {
    return fixedReply(ACKNOWLEDGEMENT_REPLY);
  }
  if (/^(bye|goodbye|see you|talk to you later)[\s!.,?]*$/.test(cleanMessage)) {
    return fixedReply("Goodbye! I hope you find the information you need.");
  }

  if (!/^(what do you do|what can you do|who are you|what are you|what is your role|what do you help with|what can you help me with)[\s!.,?]*$/.test(cleanMessage)) {
    return undefined;
  }

  return fixedReply(CONCIERGE_INTRO_REPLY);
}

/** Handles context dependent follow ups smoothly. */
export function getNoEvidenceReply(
  message: string,
  history: readonly ChatMessage[],
): ConciergeReply | undefined {
  const isContextDependentFollowUp = history.length > 0
    && message.split(" ").length <= 12
    && /\b(it|that|there|them|those|more|which one|what about|and then)\b/.test(message);
  
  if (isContextDependentFollowUp) {
    return fixedReply(FOLLOW_UP_CLARIFICATION_REPLY);
  }

  return undefined;
}