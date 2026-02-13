/**
 * Validates and corrects LLM responses.
 * Ensures chat_message always exists, fixes broken JSON, extracts data safely.
 */

export function validateAndFixResponse(rawResponse) {
  let response = rawResponse;

  // Ensure we have a valid object
  if (!response || typeof response !== "object") {
    response = {};
  }

  // CRITICAL: chat_message is required
  if (!response.chat_message || typeof response.chat_message !== "string") {
    response.chat_message = "I got a bit scrambled there. Let's keep going!";
  }

  // Trim chat_message to 3 lines max
  response.chat_message = response.chat_message
    .split("\n")
    .slice(0, 3)
    .join("\n")
    .trim();

  // Validate persona
  if (!["antonio", "mariana", "both"].includes(response.persona)) {
    response.persona = "both";
  }

  // Validate intent (should already be set by detectIntent, but fallback)
  const validIntents = ["cv_building", "interview_prep", "career_path", "job_search", "networking", "social", "travel", "general"];
  if (!response.intent || !validIntents.includes(response.intent)) {
    response.intent = "general";
  }

  // Validate memories
  if (!Array.isArray(response.memories)) {
    response.memories = [];
  } else {
    response.memories = response.memories
      .filter(m => m && m.key && m.value && m.category)
      .map(m => ({
        category: ["career", "lifestyle", "travel", "social"].includes(m.category) ? m.category : "career",
        key: String(m.key).substring(0, 50),
        value: String(m.value).substring(0, 500)
      }))
      .slice(0, 5); // Max 5 new memories per message
  }

  // Validate CV data
  if (!response.cv_data || typeof response.cv_data !== "object") {
    response.cv_data = null;
  } else {
    response.cv_data = validateCVData(response.cv_data);
  }

  // Validate other arrays
  if (!Array.isArray(response.interview_questions)) {
    response.interview_questions = [];
  }
  if (!Array.isArray(response.career_path)) {
    response.career_path = [];
  }
  if (!Array.isArray(response.context_used)) {
    response.context_used = [];
  }

  return response;
}

/**
 * Validates CV data structure against Candidate entity schema.
 * Returns null if invalid, otherwise returns cleaned CV data.
 */
function validateCVData(cvData) {
  if (!cvData || typeof cvData !== "object") return null;

  const cleaned = {};

  // Personal
  if (cvData.personal && typeof cvData.personal === "object") {
    cleaned.personal = {
      name: cvData.personal.name ? String(cvData.personal.name).trim().substring(0, 100) : undefined,
      email: cvData.personal.email ? String(cvData.personal.email).trim().substring(0, 100) : undefined,
      phone: cvData.personal.phone ? String(cvData.personal.phone).trim().substring(0, 50) : undefined,
      location: cvData.personal.location ? String(cvData.personal.location).trim().substring(0, 100) : undefined,
      linkedin: cvData.personal.linkedin ? String(cvData.personal.linkedin).trim().substring(0, 200) : undefined,
      portfolio: cvData.personal.portfolio ? String(cvData.personal.portfolio).trim().substring(0, 200) : undefined
    };
    // Remove undefined values
    Object.keys(cleaned.personal).forEach(k => cleaned.personal[k] === undefined && delete cleaned.personal[k]);
  }

  // Summary
  if (cvData.summary && typeof cvData.summary === "string") {
    cleaned.summary = cvData.summary.trim().substring(0, 500);
  }

  // Experience
  if (Array.isArray(cvData.experience)) {
    cleaned.experience = cvData.experience
      .filter(exp => exp && exp.title && exp.company)
      .map(exp => ({
        title: String(exp.title).trim().substring(0, 100),
        company: String(exp.company).trim().substring(0, 100),
        location: exp.location ? String(exp.location).trim().substring(0, 100) : undefined,
        start_date: exp.start_date ? String(exp.start_date).trim().substring(0, 50) : undefined,
        end_date: exp.end_date ? String(exp.end_date).trim().substring(0, 50) : undefined,
        current: Boolean(exp.current),
        description: exp.description ? String(exp.description).trim().substring(0, 500) : undefined,
        achievements: Array.isArray(exp.achievements)
          ? exp.achievements
              .map(a => String(a).trim().substring(0, 200))
              .filter(a => a.length > 0)
              .slice(0, 10)
          : undefined
      }))
      .slice(0, 20);
  } else {
    cleaned.experience = [];
  }

  // Education
  if (Array.isArray(cvData.education)) {
    cleaned.education = cvData.education
      .filter(edu => edu && edu.degree && edu.institution)
      .map(edu => ({
        degree: String(edu.degree).trim().substring(0, 200),
        institution: String(edu.institution).trim().substring(0, 150),
        location: edu.location ? String(edu.location).trim().substring(0, 100) : undefined,
        start_date: edu.start_date ? String(edu.start_date).trim().substring(0, 50) : undefined,
        graduation_date: edu.graduation_date ? String(edu.graduation_date).trim().substring(0, 50) : undefined,
        gpa: edu.gpa ? String(edu.gpa).trim().substring(0, 20) : undefined,
        description: edu.description ? String(edu.description).trim().substring(0, 300) : undefined
      }))
      .slice(0, 10);
  } else {
    cleaned.education = [];
  }

  // Skills
  if (Array.isArray(cvData.skills)) {
    cleaned.skills = cvData.skills
      .map(s => String(s).trim().substring(0, 100))
      .filter(s => s.length > 0)
      .slice(0, 20);
  } else {
    cleaned.skills = [];
  }

  // Certifications (optional)
  if (Array.isArray(cvData.certifications)) {
    cleaned.certifications = cvData.certifications
      .map(c => String(c).trim().substring(0, 200))
      .filter(c => c.length > 0)
      .slice(0, 10);
  }

  // Languages (optional)
  if (Array.isArray(cvData.languages)) {
    cleaned.languages = cvData.languages
      .filter(lang => lang && lang.language)
      .map(lang => ({
        language: String(lang.language).trim().substring(0, 50),
        proficiency: ["Native", "Fluent", "Intermediate", "Basic"].includes(lang.proficiency) ? lang.proficiency : "Intermediate"
      }))
      .slice(0, 10);
  }

  // Return null if no meaningful data
  if (
    (!cleaned.personal || Object.keys(cleaned.personal).length === 0) &&
    (!cleaned.summary || cleaned.summary.length === 0) &&
    (!cleaned.experience || cleaned.experience.length === 0) &&
    (!cleaned.education || cleaned.education.length === 0) &&
    (!cleaned.skills || cleaned.skills.length === 0)
  ) {
    return null;
  }

  return cleaned;
}