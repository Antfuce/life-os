import React from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function FloatingModule({ title, children, onClose, position = { x: 0, y: 0 } }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.8, y: 20 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      style={{
        position: "fixed",
        left: typeof position.x === "number" ? `${position.x}px` : position.x,
        top: typeof position.y === "number" ? `${position.y}px` : position.y,
      }}
      drag
      dragMomentum={false}
      className="bg-white/80 backdrop-blur-md border border-white/60 rounded-2xl shadow-2xl max-w-md p-6 z-30"
    >
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-neutral-800">{title}</h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="h-6 w-6 p-0"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>
      <div className="max-h-96 overflow-y-auto">
        {children}
      </div>
    </motion.div>
  );
}