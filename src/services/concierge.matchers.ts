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

export type ConversationAudience = "trainee" | "volunteer";

/** Returns the latest audience the user explicitly chose in this conversation. */
export function getConversationAudience(
  history: readonly ChatMessage[],
): ConversationAudience | undefined {
  let audience: ConversationAudience | undefined;
  let awaitingAudienceChoice = false;

  for (const message of history) {
    if (message.role === "assistant") {
      awaitingAudienceChoice = /\btrainee\b/i.test(message.content)
        && /\bvolunteer(?:ing)?\b/i.test(message.content)
        && /\b(are you asking|which|or)\b/i.test(message.content);
      continue;
    }

    const userAudience = getExplicitAudience(message.content, awaitingAudienceChoice);
    if (userAudience !== undefined) audience = userAudience;
    awaitingAudienceChoice = false;
  }

  return audience;
}

function getExplicitAudience(
  message: string,
  awaitingAudienceChoice: boolean,
): ConversationAudience | undefined {
  const cleanMessage = message.trim().toLowerCase();
  if (awaitingAudienceChoice && /^(?:i(?:'m| am) asking about )?(?:a )?(trainee|student|volunteer)$/i.test(cleanMessage)) {
    return /volunteer/i.test(cleanMessage) ? "volunteer" : "trainee";
  }
  if (/\b(i(?:'m| am)|i want to be|i'd like to be|i am applying as|i want to apply as)\s+(?:a\s+)?(trainee|student)\b/i.test(message)) {
    return "trainee";
  }
  if (/\b(i(?:'m| am)|i want to be|i'd like to be|i am applying as|i want to apply as)\s+(?:a\s+)?volunteer\b|\bi want to volunteer\b/i.test(message)) {
    return "volunteer";
  }
  return undefined;
}

/** Applies narrow policy boundaries the FAQs don't leave to model interpretation. */
export function getPolicyBoundaryReply(message: string): ConciergeReply | undefined {
  const cleanMessage = message.toLowerCase();
  const mentionsDevice = /\b(laptop|computer|tablet|device|itp)\b/.test(cleanMessage);

  if (/\b(tablet|ipad)\b/.test(cleanMessage)
    && /\b(?:instead of|rather than|use|work on|compatible)\b/.test(cleanMessage)) {
    return {
      reply: "The Trainee FAQ says you need a laptop or computer for Intro to Digital. I can't confirm that a tablet will meet the course requirements.",
      confidence: 1,
      topic: "cyf-training",
      handoff: false,
    };
  }

  if ((mentionsDevice || /\btechnical problems?\b/.test(cleanMessage))
    && /\b(?:broken|faulty|stop(?:s|ped) working|not working|technical problems?|technical issues?|repair|fix)\b/.test(cleanMessage)) {
    return {
      reply: `The Trainee FAQ doesn't specify what to do or who to contact ${
        mentionsDevice ? "if a CYF laptop has a technical problem" : "for technical problems"
      }. Please contact CYF through its official website or Signposts for current support.`,
      confidence: 1,
      topic: "learning-support",
      handoff: true,
    };
  }

  const asksAboutChildAttendance = /\b(bab(?:y|ies)|child(?:ren)?|kids?|infants?|toddlers?)\b/.test(cleanMessage)
    && /\b(?:bring|attend|come|join|take|allowed|permitted)\b/.test(cleanMessage)
    && /\b(?:class(?:es)?|session|lesson|course|in person)\b/.test(cleanMessage);
  if (asksAboutChildAttendance) {
    return {
      reply: "The Trainee FAQ doesn't say whether babies or children may attend classes. Its childcare-expense rules are separate and don't confirm permission to bring a child. Please check with the Pastoral team about your circumstances before attending.",
      confidence: 1,
      topic: "learning-support",
      handoff: true,
    };
  }

  return undefined;
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