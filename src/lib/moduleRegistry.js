/**
 * Module Registry v1.0
 * Maps backend modes to UI components
 * Backend controls what's shown; UI only renders
 */

import React, { lazy, Suspense } from 'react';

// Lazy load components for code splitting
const LiveCVPreview = lazy(() => import('../components/cv/LiveCVPreview'));
const InlineCVPreview = lazy(() => import('../components/cv/InlineCVPreview'));
const LiveInterviewPrep = lazy(() => import('../components/interview/LiveInterviewPrep'));

// Fallback loading component
const ModuleLoader = () => (
  <div className="p-4 bg-slate-100 rounded-lg animate-pulse">
    <div className="h-4 bg-slate-300 rounded w-3/4 mb-2" />
    <div className="h-4 bg-slate-300 rounded w-1/2" />
  </div>
);

// Error boundary for module failures
class ModuleErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Module error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-600 text-sm">Failed to load module</p>
          <button
            onClick={() => this.setState({ hasError: false })}
            className="mt-2 text-xs text-red-500 underline"
          >
            Retry
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Module Registry Definition
 * Each entry defines how to render a mode
 */
export const MODULE_REGISTRY = {
  cv: {
    name: 'CV Builder',
    icon: 'FileText',
    component: LiveCVPreview,
    inlineComponent: InlineCVPreview,
    acceptsData: ['cv', 'resume', 'profile'],
    defaultPosition: { x: 100, y: 100 },
    defaultSize: { width: 600, height: 800 },
    actions: ['edit', 'export.pdf', 'export.markdown', 'copy'],
  },
  
  interview: {
    name: 'Interview Prep',
    icon: 'MessageSquare',
    component: LiveInterviewPrep,
    acceptsData: ['interview', 'questions', 'prep'],
    defaultPosition: { x: 120, y: 120 },
    defaultSize: { width: 500, height: 600 },
    actions: ['practice', 'save', 'share'],
  },
  
  outreach: {
    name: 'Outreach',
    icon: 'Send',
    component: null, // TODO: Create OutreachModule
    acceptsData: ['outreach', 'message', 'email'],
    defaultPosition: { x: 140, y: 140 },
    defaultSize: { width: 500, height: 500 },
    actions: ['edit', 'copy', 'requestSend'],
    requireConfirmation: true,
  },
  
  chat: {
    name: 'Chat',
    icon: 'MessageCircle',
    component: null, // Default chat view
    acceptsData: [],
    defaultPosition: null, // Not a floating module
    actions: [],
  },
};

/**
 * Get module config by type
 */
export function getModuleConfig(type) {
  return MODULE_REGISTRY[type] || null;
}

/**
 * Check if a module type exists
 */
export function isValidModuleType(type) {
  return type in MODULE_REGISTRY;
}

/**
 * Get all available module types
 */
export function getAvailableModules() {
  return Object.keys(MODULE_REGISTRY);
}

/**
 * Render a module component with error boundary and suspense
 */
export function renderModule(type, props = {}) {
  const config = getModuleConfig(type);
  
  if (!config || !config.component) {
    return (
      <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
        <p className="text-yellow-700 text-sm">Unknown module type: {type}</p>
      </div>
    );
  }
  
  const Component = config.component;
  
  return (
    <ModuleErrorBoundary>
      <Suspense fallback={<ModuleLoader />}>
        <Component {...props} />
      </Suspense>
    </ModuleErrorBoundary>
  );
}

/**
 * Render inline preview (for non-floating use)
 */
export function renderInlineModule(type, props = {}) {
  const config = getModuleConfig(type);
  
  if (!config) {
    return null;
  }
  
  const Component = config.inlineComponent || config.component;
  
  if (!Component) {
    return null;
  }
  
  return (
    <ModuleErrorBoundary>
      <Suspense fallback={<ModuleLoader />}>
        <Component {...props} inline />
      </Suspense>
    </ModuleErrorBoundary>
  );
}

/**
 * Module action handlers
 * These dispatch user actions back to the system
 */
export const MODULE_ACTIONS = {
  // CV actions
  'cv.edit': (deliverable, dispatch) => {
    dispatch({
      type: 'CV_EDIT_REQUESTED',
      payload: { deliverableId: deliverable.id, data: deliverable.data },
    });
  },
  
  'cv.export.pdf': (deliverable, dispatch) => {
    // Trigger PDF generation/download
    console.log('Export PDF:', deliverable);
  },
  
  'cv.export.markdown': (deliverable, dispatch) => {
    // Copy markdown to clipboard
    navigator.clipboard?.writeText(deliverable.data.markdown || '');
  },
  
  'cv.copy': (deliverable, dispatch) => {
    navigator.clipboard?.writeText(JSON.stringify(deliverable.data.json, null, 2));
  },
  
  // Interview actions
  'interview.practice': (deliverable, dispatch) => {
    dispatch({
      type: 'INTERVIEW_PRACTICE_REQUESTED',
      payload: { deliverableId: deliverable.id, questions: deliverable.data.questions },
    });
  },
  
  'interview.save': (deliverable, dispatch) => {
    // Save to local storage or backend
    localStorage.setItem(`interview-${deliverable.id}`, JSON.stringify(deliverable.data));
  },
  
  // Outreach actions
  'outreach.edit': (deliverable, dispatch) => {
    dispatch({
      type: 'OUTREACH_EDIT_REQUESTED',
      payload: { deliverableId: deliverable.id, messages: deliverable.data.messages },
    });
  },
  
  'outreach.copy': (deliverable, dispatch) => {
    const text = deliverable.data.messages?.map(m => m.body).join('\n\n---\n\n') || '';
    navigator.clipboard?.writeText(text);
  },
  
  'outreach.requestSend': (deliverable, dispatch) => {
    // This triggers a CONFIRM_REQUIRED event flow
    dispatch({
      type: 'OUTREACH_SEND_REQUESTED',
      payload: { 
        deliverableId: deliverable.id,
        requireConfirmation: true,
        messages: deliverable.data.messages,
      },
    });
  },
};

/**
 * Execute a module action
 */
export function executeModuleAction(actionName, deliverable, dispatch) {
  const handler = MODULE_ACTIONS[actionName];
  
  if (!handler) {
    console.warn(`Unknown module action: ${actionName}`);
    return;
  }
  
  handler(deliverable, dispatch);
}

/**
 * Get available actions for a module type
 */
export function getModuleActions(type) {
  const config = getModuleConfig(type);
  return config?.actions || [];
}

export default {
  MODULE_REGISTRY,
  getModuleConfig,
  isValidModuleType,
  getAvailableModules,
  renderModule,
  renderInlineModule,
  executeModuleAction,
  getModuleActions,
  MODULE_ACTIONS,
};
