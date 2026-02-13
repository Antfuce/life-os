import { motion } from "framer-motion";

const personaColors = {
  antonio: "text-amber-600",
  mariana: "text-violet-600",
  user: "text-neutral-700",
};

export default function MessageWhisper({ message }) {
  const isUser = message.role === "user";
  const color = isUser ? personaColors.user : personaColors[message.persona] || "text-neutral-600";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={`text-sm leading-relaxed ${color}`}
    >
      {isUser ? (
        <span className="font-medium">You: {message.content}</span>
      ) : (
        <span>{message.content}</span>
      )}
    </motion.div>
  );
}