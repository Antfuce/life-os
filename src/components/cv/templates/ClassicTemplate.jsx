import React from "react";

export default function ClassicTemplate({ cvData }) {
  const { name = "", email = "", phone = "", location = "", summary = "", experience = [], education = [], skills = [] } = cvData || {};

  return (
    <div className="max-w-2xl mx-auto bg-white p-12 space-y-5 font-serif">
      {/* Header */}
      {name && (
        <div className="text-center border-b-2 border-gray-800 pb-4">
          <h1 className="text-3xl font-bold text-gray-900">{name}</h1>
          <div className="flex justify-center gap-3 text-xs text-gray-700 mt-2">
            {email && <span>{email}</span>}
            {phone && <span>•</span>}
            {phone && <span>{phone}</span>}
            {location && <span>•</span>}
            {location && <span>{location}</span>}
          </div>
        </div>
      )}

      {/* Summary */}
      {summary && (
        <div className="text-center">
          <p className="text-sm text-gray-700 leading-relaxed">{summary}</p>
        </div>
      )}

      {/* Experience */}
      {experience.length > 0 && (
        <div>
          <h2 className="text-sm font-bold uppercase text-gray-900 mb-3">Professional Experience</h2>
          <div className="space-y-3">
            {experience.map((exp, i) => (
              <div key={i}>
                <div className="flex justify-between">
                  <span className="font-bold text-sm text-gray-900">{exp.title}</span>
                  <span className="text-xs text-gray-600">{exp.start_date}{exp.end_date && ` – ${exp.end_date}`}</span>
                </div>
                <p className="text-sm text-gray-600 italic">{exp.company}</p>
                {exp.description && <p className="text-xs text-gray-700 mt-1">{exp.description}</p>}
                {exp.achievements && exp.achievements.length > 0 && (
                  <ul className="text-xs text-gray-700 mt-2 ml-4 space-y-1">
                    {exp.achievements.map((ach, j) => (
                      <li key={j} className="list-disc">{ach}</li>
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
        <div>
          <h2 className="text-sm font-bold uppercase text-gray-900 mb-3">Education</h2>
          <div className="space-y-2">
            {education.map((edu, i) => (
              <div key={i}>
                <div className="flex justify-between">
                  <span className="font-bold text-sm text-gray-900">{edu.degree}</span>
                  <span className="text-xs text-gray-600">{edu.graduation_date}</span>
                </div>
                <p className="text-sm text-gray-600">{edu.institution}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Skills */}
      {skills.length > 0 && (
        <div>
          <h2 className="text-sm font-bold uppercase text-gray-900 mb-2">Skills</h2>
          <p className="text-xs text-gray-700">{skills.join(" • ")}</p>
        </div>
      )}
    </div>
  );
}