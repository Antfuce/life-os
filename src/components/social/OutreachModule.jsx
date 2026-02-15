import React from "react";
import { motion } from "framer-motion";
import { Send, Copy, Pencil } from "lucide-react";

function normalizeMessages(data = {}) {
  const raw = Array.isArray(data.messages) ? data.messages : [];
  return raw
    .map((m, idx) => {
      if (typeof m === "string") {
        return { id: `msg-${idx}`, channel: "message", body: m };
      }
      return {
        id: m.id || `msg-${idx}`,
        channel: m.channel || m.type || "message",
        subject: m.subject || "",
        body: m.body || m.text || "",
      };
    })
    .filter((m) => m.body);
}

export default function OutreachModule({ deliverable, onAction, inline = false }) {
  const data = deliverable?.data || {};
  const actions = deliverable?.actions || [];
  const messages = normalizeMessages(data);

  if (messages.length === 0) return null;

  const handleAction = (actionName, e) => {
    if (e) e.stopPropagation();
    if (onAction && deliverable) onAction(actionName, deliverable);
  };

  const canEdit = actions.some((a) => a.action === "outreach.edit");
  const canCopy = actions.some((a) => a.action === "outreach.copy");
  const canSend = actions.some((a) => a.action === "outreach.requestSend");

  if (inline) {
    return (
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="my-3 p-3 bg-gradient-to-r from-blue-50 to-white border border-blue-100 rounded-xl">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-neutral-800">Outreach drafts ready</p>
            <p className="text-xs text-neutral-500">{messages.length} personalized messages</p>
          </div>
          <div className="flex gap-1">
            {canCopy && <button onClick={(e) => handleAction("outreach.copy", e)} className="px-2 py-1 text-xs rounded bg-white border border-neutral-200">Copy</button>}
            {canSend && <button onClick={(e) => handleAction("outreach.requestSend", e)} className="px-2 py-1 text-xs rounded bg-blue-600 text-white">Review Send</button>}
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} className="w-full h-full bg-white rounded-2xl border border-neutral-200 flex flex-col">
      <div className="px-5 py-4 border-b border-neutral-100 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-neutral-800">Outreach Drafts</h3>
          <p className="text-[11px] text-neutral-500">{messages.length} messages generated</p>
        </div>
        <div className="flex gap-2">
          {canEdit && (
            <button onClick={(e) => handleAction("outreach.edit", e)} className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded border border-neutral-200 hover:bg-neutral-50">
              <Pencil className="w-3 h-3" /> Edit
            </button>
          )}
          {canCopy && (
            <button onClick={(e) => handleAction("outreach.copy", e)} className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded border border-neutral-200 hover:bg-neutral-50">
              <Copy className="w-3 h-3" /> Copy
            </button>
          )}
          {canSend && (
            <button onClick={(e) => handleAction("outreach.requestSend", e)} className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded bg-blue-600 text-white hover:bg-blue-700">
              <Send className="w-3 h-3" /> Confirm Send
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-3">
        {messages.map((msg, idx) => (
          <article key={msg.id || idx} className="rounded-lg border border-neutral-200 p-3">
            <div className="text-[11px] uppercase tracking-wide text-neutral-500 mb-2">{msg.channel}</div>
            {msg.subject && <p className="text-sm font-medium text-neutral-800 mb-2">Subject: {msg.subject}</p>}
            <p className="text-sm text-neutral-700 whitespace-pre-wrap">{msg.body}</p>
          </article>
        ))}
      </div>
    </motion.div>
  );
}
