import React from "react";
import { motion } from "framer-motion";

export default function ModernTemplate({ cvData }) {
  const { name = "", email = "", phone = "", location = "", summary = "", experience = [], education = [], skills = [] } = cvData || {};

  return (
    <div className="max-w-2xl mx-auto bg-white p-12 space-y-6">
      {/* Header with accent */}
      {name && (
        <div className="border-l-4 border-blue-600 pl-6">
          <h1 className="text-4xl font-bold text-gray-900">{name}</h1>
          <div className="flex flex-wrap gap-4 text-sm text-gray-600 mt-2">
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
        <div>
          <p className="text-gray-700 leading-relaxed text-sm">{summary}</p>
        </div>
      )}

      {/* Experience */}
      {experience.length > 0 && (
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-gray-900 pb-2 border-b-2 border-blue-600">Experience</h2>
          <div className="space-y-4 mt-4">
            {experience.map((exp, i) => (
              <div key={i}>
                <div className="flex justify-between items-start">
                  <h3 className="text-sm font-bold text-gray-900">{exp.title}</h3>
                  <span className="text-xs text-gray-500">{exp.start_date}{exp.end_date && ` - ${exp.end_date}`}</span>
                </div>
                <p className="text-sm text-gray-600">{exp.company}</p>
                {exp.description && <p className="text-xs text-gray-600 mt-1">{exp.description}</p>}
                {exp.achievements && exp.achievements.length > 0 && (
                  <ul className="text-xs text-gray-600 mt-2 ml-4 space-y-1">
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
          <h2 className="text-sm font-bold uppercase tracking-wider text-gray-900 pb-2 border-b-2 border-blue-600">Education</h2>
          <div className="space-y-3 mt-4">
            {education.map((edu, i) => (
              <div key={i}>
                <div className="flex justify-between items-start">
                  <h3 className="text-sm font-bold text-gray-900">{edu.degree}</h3>
                  <span className="text-xs text-gray-500">{edu.graduation_date}</span>
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
          <h2 className="text-sm font-bold uppercase tracking-wider text-gray-900 pb-2 border-b-2 border-blue-600">Skills</h2>
          <div className="flex flex-wrap gap-2 mt-4">
            {skills.map((skill, i) => (
              <span key={i} className="px-3 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">{skill}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}