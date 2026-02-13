import React from "react";

export default function MinimalTemplate({ cvData }) {
  const { name = "", email = "", phone = "", location = "", summary = "", experience = [], education = [], skills = [] } = cvData || {};

  return (
    <div className="max-w-2xl mx-auto bg-white p-12">
      {/* Header */}
      {name && (
        <div className="mb-6">
          <h1 className="text-2xl font-light text-gray-900 tracking-tight">{name}</h1>
          <div className="flex gap-2 text-xs text-gray-600 mt-2">
            {email && <span>{email}</span>}
            {phone && <span>·</span>}
            {phone && <span>{phone}</span>}
            {location && <span>·</span>}
            {location && <span>{location}</span>}
          </div>
        </div>
      )}

      {/* Summary */}
      {summary && (
        <p className="text-xs text-gray-700 leading-relaxed mb-6">{summary}</p>
      )}

      {/* Experience */}
      {experience.length > 0 && (
        <div className="mb-6">
          <h2 className="text-xs font-semibold text-gray-900 uppercase tracking-wider mb-3">Experience</h2>
          <div className="space-y-3">
            {experience.map((exp, i) => (
              <div key={i}>
                <div className="flex justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold text-gray-900">{exp.title}</p>
                    <p className="text-xs text-gray-600">{exp.company}</p>
                  </div>
                  <span className="text-xs text-gray-500 whitespace-nowrap">{exp.start_date}–{exp.end_date || 'Now'}</span>
                </div>
                {exp.description && <p className="text-xs text-gray-600 mt-1">{exp.description}</p>}
                {exp.achievements && exp.achievements.length > 0 && (
                  <ul className="text-xs text-gray-600 mt-1 ml-2 space-y-0.5">
                    {exp.achievements.map((ach, j) => (
                      <li key={j}>— {ach}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Education */}
      {education.length > 0 && (
        <div className="mb-6">
          <h2 className="text-xs font-semibold text-gray-900 uppercase tracking-wider mb-3">Education</h2>
          <div className="space-y-2">
            {education.map((edu, i) => (
              <div key={i} className="flex justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold text-gray-900">{edu.degree}</p>
                  <p className="text-xs text-gray-600">{edu.institution}</p>
                </div>
                <span className="text-xs text-gray-500">{edu.graduation_date}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Skills */}
      {skills.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold text-gray-900 uppercase tracking-wider mb-2">Skills</h2>
          <p className="text-xs text-gray-700">{skills.join(" · ")}</p>
        </div>
      )}
    </div>
  );
}