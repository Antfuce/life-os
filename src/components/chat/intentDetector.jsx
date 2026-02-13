/**
 * Deterministic intent detection based on keywords.
 * This REPLACES relying on the LLM to detect intent.
 */

export function detectIntent(userMessage) {
  const msg = userMessage.toLowerCase();

  // CV/Resume intent
  if (/cv|resume|experience|achievement|skill|education|background|qualification|work history|job title|employment|added.*role|describe.*role/i.test(msg)) {
    return "cv_building";
  }

  // Interview prep intent
  if (/interview|prepare.*interview|interview.*question|mock.*interview|behavioral|tell.*about.*yourself|weakness|strength|star method/i.test(msg)) {
    return "interview_prep";
  }

  // Career path intent
  if (/career.*path|next.*role|career.*goal|advance|promotion|growth|skill.*develop|learning|road.*map|where.*go|future|target.*role/i.test(msg)) {
    return "career_path";
  }

  // Job search intent
  if (/job.*search|looking.*job|apply|application|search.*position|openings|job.*market|apply.*for|recruiter/i.test(msg)) {
    return "job_search";
  }

  // Networking intent
  if (/network|connection|connect|contact|reach.*out|introduction|meet.*people|linkedin|professional.*community/i.test(msg)) {
    return "networking";
  }

  // Social intent
  if (/friend|social|event|community|meet|people|hobby|interest|social.*life|weekend|hang.*out|club|group/i.test(msg)) {
    return "social";
  }

  // Travel intent
  if (/travel|trip|destination|visit|country|city|vacation|abroad|passport|flight|location|relocation|move.*to/i.test(msg)) {
    return "travel";
  }

  // Default to general
  return "general";
}

export function selectPersona(intent) {
  switch (intent) {
    case "cv_building":
    case "job_search":
      return "antonio"; // Direct, tactical
    case "interview_prep":
    case "career_path":
      return "mariana"; // Thoughtful, exploratory
    case "networking":
    case "social":
      return "both"; // Both perspectives useful
    default:
      return "both";
  }
}

export function selectMode(intent) {
  switch (intent) {
    case "cv_building":
      return "cv";
    case "interview_prep":
      return "interview";
    case "career_path":
      return "career_path";
    default:
      return null;
  }
}