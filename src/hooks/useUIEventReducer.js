/**
 * UI Event Reducer v1.0
 * Single source of truth for UI state based on backend events
 */

import { useReducer, useCallback } from 'react';

export const UI_EVENT_TYPES = {
  TEXT_DELTA: 'text.delta',
  TEXT_DONE: 'text.done',
  SPEAKER_CHANGE: 'speaker.change',
  MODE_ACTIVATE: 'mode.activate',
  MODE_DEACTIVATE: 'mode.deactivate',
  DELIVERABLE_CV: 'deliverable.cv',
  DELIVERABLE_INTERVIEW: 'deliverable.interview',
  DELIVERABLE_OUTREACH: 'deliverable.outreach',
  ERROR: 'error',
  STATUS: 'status',
  CONFIRM_REQUIRED: 'confirm.required',
  ACTION_APPROVAL_STATE: 'action.approval.state',
  ACTION_AUDIT: 'action.audit',
  CALL_RUNTIME_STATE: 'call.runtime.state',
  VOICE_CONFIG: 'voice.config',
  TURN_STATE: 'turn.state',
  DONE: 'done',
};

// Initial state
const initialState = {
  // Conversation
  messages: [],
  currentMessage: '',
  isStreaming: false,

  // Speaker
  currentSpeaker: 'both',

  // Mode/Modules
  activeModes: {}, // { cv: {...}, interview: {...} }
  floatingModules: [],

  // Deliverables
  deliverables: [],

  // Status/Error
  status: null, // { type, message, progress }
  error: null,

  // Confirmation gates
  pendingConfirmation: null, // { actionId, message, details, onConfirm, onCancel }

  // Action approval/audit
  actionApprovals: {}, // { [actionId]: { state, ... } }
  actionAuditTrail: [],

  // Call runtime
  callRuntime: {
    state: 'idle', // idle|connecting|connected|reconnecting|failed|ended
    mode: 'realtime', // realtime|browser-fallback|text
    provider: null,
    lastTransitionAt: null,
  },
  voiceConfig: {
    persona: 'both',
    label: 'Balanced Core',
    voiceProfileId: null,
    clonedVoice: false,
    synthesisAllowed: true,
    policyId: null,
  },
  turnRuntime: {
    owner: 'none', // none|user|agent
    turnId: null,
    state: 'idle', // idle|listening|thinking|speaking
    timing: null,
  },

  // Meta
  conversationId: null,
  contractVersion: '1.0',
};

// Reducer
function uiEventReducer(state, action) {
  const { type, payload } = action;

  switch (type) {
    case UI_EVENT_TYPES.TEXT_DELTA: {
      return {
        ...state,
        currentMessage: payload.fullText || (state.currentMessage + payload.delta),
        isStreaming: true,
      };
    }

    case UI_EVENT_TYPES.TEXT_DONE: {
      const newMessage = {
        id: payload.messageId || Date.now(),
        role: 'assistant',
        content: payload.fullText || state.currentMessage,
        speaker: payload.speaker || state.currentSpeaker,
        timestamp: Date.now(),
      };

      return {
        ...state,
        messages: [...state.messages, newMessage],
        currentMessage: '',
        isStreaming: false,
      };
    }

    case UI_EVENT_TYPES.SPEAKER_CHANGE: {
      return {
        ...state,
        currentSpeaker: payload.speaker || 'both',
      };
    }

    case UI_EVENT_TYPES.MODE_ACTIVATE: {
      const { mode, context, position } = payload;

      // Add to active modes
      const newActiveModes = {
        ...state.activeModes,
        [mode]: { active: true, context, activatedAt: Date.now() },
      };

      // Add floating module if position provided
      let newModules = state.floatingModules;
      if (position) {
        const exists = state.floatingModules.some(m => m.type === mode);
        if (!exists) {
          newModules = [
            ...state.floatingModules,
            {
              id: `${mode}-${Date.now()}`,
              type: mode,
              position,
              data: context || {},
            },
          ];
        }
      }

      return {
        ...state,
        activeModes: newActiveModes,
        floatingModules: newModules,
      };
    }

    case UI_EVENT_TYPES.MODE_DEACTIVATE: {
      const { mode } = payload;
      const { [mode]: _, ...remainingModes } = state.activeModes;

      return {
        ...state,
        activeModes: remainingModes,
        floatingModules: state.floatingModules.filter(m => m.type !== mode),
      };
    }

    case UI_EVENT_TYPES.DELIVERABLE_CV:
    case UI_EVENT_TYPES.DELIVERABLE_INTERVIEW:
    case UI_EVENT_TYPES.DELIVERABLE_OUTREACH: {
      const deliverable = {
        id: `${payload.type}-${Date.now()}`,
        type: payload.type,
        data: payload.data,
        actions: payload.actions || [],
        createdAt: Date.now(),
      };

      return {
        ...state,
        deliverables: [...state.deliverables, deliverable],
      };
    }

    case UI_EVENT_TYPES.ERROR: {
      return {
        ...state,
        error: {
          code: payload.code,
          message: payload.message,
          recoverable: payload.recoverable,
          details: payload.details,
        },
        isStreaming: false,
      };
    }

    case UI_EVENT_TYPES.STATUS: {
      return {
        ...state,
        status: {
          type: payload.type,
          message: payload.message,
          progress: payload.progress,
        },
      };
    }

    case UI_EVENT_TYPES.CONFIRM_REQUIRED: {
      const confirmationState = {
        actionId: payload.actionId,
        state: 'pending_approval',
        riskTier: payload.riskTier || 'high-risk-external-send',
        message: payload.message,
        details: payload.details,
        timeout: payload.timeout,
        startedAt: payload.startedAt || Date.now(),
        expiresAt: payload.expiresAt,
      };

      return {
        ...state,
        pendingConfirmation: {
          actionId: payload.actionId,
          message: payload.message,
          details: payload.details,
          onConfirm: payload.onConfirm,
          onCancel: payload.onCancel,
          timeout: payload.timeout,
          expiresAt: payload.expiresAt,
        },
        actionApprovals: {
          ...state.actionApprovals,
          [payload.actionId]: confirmationState,
        },
      };
    }

    case UI_EVENT_TYPES.ACTION_APPROVAL_STATE: {
      const actionId = payload.actionId;
      const current = state.actionApprovals[actionId] || {};
      const nextState = {
        ...current,
        ...payload,
      };

      const shouldClosePending = state.pendingConfirmation?.actionId === actionId
        && payload.state !== 'pending_approval';

      return {
        ...state,
        pendingConfirmation: shouldClosePending ? null : state.pendingConfirmation,
        actionApprovals: {
          ...state.actionApprovals,
          [actionId]: nextState,
        },
      };
    }

    case UI_EVENT_TYPES.ACTION_AUDIT: {
      return {
        ...state,
        actionAuditTrail: [...state.actionAuditTrail, payload],
      };
    }

    case UI_EVENT_TYPES.CALL_RUNTIME_STATE: {
      return {
        ...state,
        callRuntime: {
          ...state.callRuntime,
          ...payload,
          lastTransitionAt: Date.now(),
        },
      };
    }

    case UI_EVENT_TYPES.VOICE_CONFIG: {
      return {
        ...state,
        voiceConfig: {
          ...state.voiceConfig,
          ...payload,
        },
      };
    }

    case UI_EVENT_TYPES.TURN_STATE: {
      return {
        ...state,
        turnRuntime: {
          ...state.turnRuntime,
          ...payload,
        },
      };
    }

    case UI_EVENT_TYPES.DONE: {
      return {
        ...state,
        isStreaming: false,
        status: null,
        conversationId: payload.conversationId || state.conversationId,
      };
    }

    // User actions
    case 'USER_SEND_MESSAGE': {
      const userMessage = {
        id: Date.now(),
        role: 'user',
        content: payload.text,
        timestamp: Date.now(),
      };

      return {
        ...state,
        messages: [...state.messages, userMessage],
        isStreaming: true,
        error: null,
      };
    }

    case 'USER_CLEAR_CONVERSATION': {
      return {
        ...initialState,
        conversationId: payload?.conversationId || null,
      };
    }

    case 'USER_CONFIRM_ACTION': {
      return {
        ...state,
        pendingConfirmation: null,
      };
    }

    case 'USER_CANCEL_ACTION': {
      return {
        ...state,
        pendingConfirmation: null,
      };
    }

    case 'OUTREACH_SEND_REQUESTED': {
      const ts = Date.now();
      const deliverableId = payload?.deliverableId || 'unknown';
      const messages = Array.isArray(payload?.messages) ? payload.messages : [];
      const count = messages.length;
      const actionId = payload?.actionId || `outreach-send-${deliverableId}-${ts}`;
      const riskTier = payload?.riskTier || 'high-risk-external-send';

      const confirmationState = {
        actionId,
        state: 'pending_approval',
        riskTier,
        message: `Send ${count || 'these'} outreach ${count === 1 ? 'message' : 'messages'}? This action requires your confirmation.`,
        details: {
          action: 'outreach.send',
          callTimestamp: ts,
          deliverableId,
          messages,
        },
        timeout: payload?.timeout,
        startedAt: ts,
      };

      return {
        ...state,
        pendingConfirmation: {
          actionId,
          message: confirmationState.message,
          details: confirmationState.details,
          timeout: confirmationState.timeout,
        },
        actionApprovals: {
          ...state.actionApprovals,
          [actionId]: confirmationState,
        },
      };
    }

    case 'UPDATE_MODULE_POSITION': {
      return {
        ...state,
        floatingModules: state.floatingModules.map(m =>
          m.id === payload.moduleId
            ? { ...m, position: payload.position }
            : m
        ),
      };
    }

    case 'CLOSE_MODULE': {
      return {
        ...state,
        floatingModules: state.floatingModules.filter(m => m.id !== payload.moduleId),
      };
    }

    default:
      return state;
  }
}

// Hook
export function useUIEventReducer(initial = {}) {
  const [state, dispatch] = useReducer(uiEventReducer, { ...initialState, ...initial });

  // Process SSE event from backend
  const processEvent = useCallback((event) => {
    if (!event || !event.type) return;

    // Handle both structured events and legacy events
    const eventType = event.type;
    const payload = event.payload || event;

    dispatch({ type: eventType, payload });
  }, [dispatch]);

  // Batch process multiple events
  const processEvents = useCallback((events) => {
    events.forEach(processEvent);
  }, [processEvent]);

  // User actions
  const sendMessage = useCallback((text) => {
    dispatch({ type: 'USER_SEND_MESSAGE', payload: { text } });
  }, [dispatch]);

  const clearConversation = useCallback((conversationId) => {
    dispatch({ type: 'USER_CLEAR_CONVERSATION', payload: { conversationId } });
  }, [dispatch]);

  const confirmAction = useCallback((actionId) => {
    dispatch({ type: 'USER_CONFIRM_ACTION', payload: { actionId } });
  }, [dispatch]);

  const cancelAction = useCallback((actionId) => {
    dispatch({ type: 'USER_CANCEL_ACTION', payload: { actionId } });
  }, [dispatch]);

  const updateModulePosition = useCallback((moduleId, position) => {
    dispatch({ type: 'UPDATE_MODULE_POSITION', payload: { moduleId, position } });
  }, [dispatch]);

  const closeModule = useCallback((moduleId) => {
    dispatch({ type: 'CLOSE_MODULE', payload: { moduleId } });
  }, [dispatch]);

  return {
    state,
    dispatch,
    processEvent,
    processEvents,
    sendMessage,
    clearConversation,
    confirmAction,
    cancelAction,
    updateModulePosition,
    closeModule,
  };
}

export default useUIEventReducer;
