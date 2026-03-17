/**
 * Centralized CSS / ARIA selectors for every UI element in ReClaw.
 *
 * All selectors are plain strings suitable for Playwright's `page.$()`,
 * `page.click()`, `page.waitForSelector()`, etc.
 *
 * Prefer `aria-label` and `role` selectors wherever possible so the test
 * suite doubles as an accessibility regression check.
 */

// ---------------------------------------------------------------------------
// Sidebar / Navigation
// ---------------------------------------------------------------------------

export const SIDEBAR = {
  /** The sidebar <aside> element */
  container: 'aside[role="navigation"][aria-label="Main navigation"]',

  /** Navigation tab list */
  tablist: 'nav[role="tablist"][aria-label="Views"]',

  /** Individual nav tabs (primary) */
  chatTab: 'button[role="tab"][aria-label="Chat"]',
  findingsTab: 'button[role="tab"][aria-label="Findings"]',
  tasksTab: 'button[role="tab"][aria-label="Tasks"]',
  interviewsTab: 'button[role="tab"][aria-label="Interviews"]',
  contextTab: 'button[role="tab"][aria-label="Context"]',
  skillsTab: 'button[role="tab"][aria-label="Skills"]',

  /** "More views" toggle button (reveals secondary nav) */
  moreToggle: 'button[aria-label="More views"]',

  /** Secondary nav tabs (visible after clicking "More views") */
  metricsTab: 'button[role="tab"][aria-label="Metrics"]',
  historyTab: 'button[role="tab"][aria-label="History"]',
  settingsTab: 'button[role="tab"][aria-label="Settings"]',

  /** Helper to get a tab by view name */
  tab: (viewName) => `button[role="tab"][aria-label="${viewName}"]`,

  /** Active tab (whichever is currently selected) */
  activeTab: 'button[role="tab"][aria-selected="true"]',

  /** Collapse / expand sidebar toggle */
  collapseBtn: 'button[aria-label="Collapse sidebar"]',
  expandBtn: 'button[aria-label="Expand sidebar"]',

  /** Search button in sidebar */
  searchBtn: 'button[aria-label="Search findings (Cmd+K)"]',

  /** Projects section */
  projectsList: 'div[role="listbox"][aria-label="Projects"]',
  projectOption: 'button[role="option"]',
  activeProject: 'button[role="option"][aria-selected="true"]',
  projectByName: (name) =>
    `div[role="listbox"][aria-label="Projects"] button[role="option"]:has-text("${name}")`,

  /** Create new project button and input */
  createProjectBtn: 'button[aria-label="Create new project"]',
  newProjectInput: 'input[aria-label="New project name"]',
};

// ---------------------------------------------------------------------------
// Chat View
// ---------------------------------------------------------------------------

export const CHAT = {
  /** The outer chat container */
  container: ".flex-1.flex.flex-col",

  /** Empty state — no project selected */
  emptyNoProject: 'text="Select or create a project to start"',

  /** Empty state — ready to research */
  emptyReady: 'text="Ready to research!"',

  /** Message input textarea */
  messageInput: 'textarea[placeholder="Ask about your research, or drop files here..."]',

  /** Send button (the one with the Send icon) */
  sendButton: 'button:has(svg)',

  /** User messages */
  userMessage: ".ml-auto .rounded-2xl",

  /** Assistant messages */
  assistantMessage: ".mr-auto .rounded-2xl",

  /** Streaming indicator (thinking...) */
  thinkingIndicator: 'text="Thinking..."',

  /** Streaming content (has the streaming-cursor class) */
  streamingContent: ".streaming-cursor",

  /** Cancel / stop buttons */
  cancelBtn: 'button[aria-label="Cancel response"]',
  stopBtn: 'button[aria-label="Stop generating"]',

  /** File upload button */
  uploadBtn: 'button[title="Upload file"]',

  /** Hidden file input */
  fileInput: 'input[type="file"][accept=".pdf,.docx,.txt,.csv,.md"]',

  /** Error message area */
  errorMessage: ".bg-red-50, .bg-red-900\\/20",

  /** Source citations in a message */
  sources: ".border-t .text-xs",
};

// ---------------------------------------------------------------------------
// Findings View
// ---------------------------------------------------------------------------

export const FINDINGS = {
  /** Page heading */
  heading: 'text="Findings"',

  /** Double Diamond phase tabs */
  phaseTablist: 'div[role="tablist"][aria-label="Double Diamond phases"]',
  phaseTab: (phase) =>
    `div[role="tablist"][aria-label="Double Diamond phases"] button[role="tab"]:has-text("${phase}")`,
  activePhaseTab:
    'div[role="tablist"][aria-label="Double Diamond phases"] button[role="tab"][aria-selected="true"]',

  /** Summary stat cards */
  statCard: (label) => `.text-center:has(p:text("${label}"))`,
  nuggetsStat: '.text-center:has(p:text("Nuggets"))',
  factsStat: '.text-center:has(p:text("Facts"))',
  insightsStat: '.text-center:has(p:text("Insights"))',
  recommendationsStat: '.text-center:has(p:text("Recommendations"))',

  /** Collapsible sections */
  sectionHeader: (name) => `button:has(span:text("${name}"))`,
  insightsSection: 'button:has(span:text("Insights"))',
  recommendationsSection: 'button:has(span:text("Recommendations"))',
  factsSection: 'button:has(span:text("Facts"))',
  nuggetsSection: 'button:has(span:text("Nuggets"))',

  /** Finding items inside expanded sections */
  findingItem: ".hover\\:bg-slate-50, .hover\\:bg-slate-800\\/30",

  /** Count badges on sections */
  sectionCount: ".rounded-full.text-xs",
};

// ---------------------------------------------------------------------------
// Tasks / Kanban Board
// ---------------------------------------------------------------------------

export const TASKS = {
  /** Page heading */
  heading: 'text="Tasks"',

  /** Kanban columns — select by the status label text */
  column: (statusLabel) =>
    `.border-t-4:has(h3:text("${statusLabel}"))`,
  backlogColumn: '.border-t-slate-400',
  inProgressColumn: '.border-t-blue-500',
  inReviewColumn: '.border-t-yellow-500',
  doneColumn: '.border-t-green-500',

  /** Task cards (draggable items) */
  taskCard: '[draggable="true"]',
  taskByTitle: (title) => `[draggable="true"]:has-text("${title}")`,

  /** Add task button (the + inside each column) */
  addTaskBtn: ".border-t-4 button:has(svg)",

  /** New task input */
  newTaskInput: 'input[placeholder="Task title..."]',

  /** Expanded task details */
  editBtn: 'text="Edit"',
  deleteBtn: 'text="Delete"',

  /** Delete confirmation dialog */
  deleteConfirmTitle: 'text="Delete Task"',
};

// ---------------------------------------------------------------------------
// Skills View
// ---------------------------------------------------------------------------

export const SKILLS = {
  /** Page heading */
  heading: 'h2:text("Skills")',

  /** Top-level tabs */
  catalogTab: 'button:text("Catalog")',
  proposalsTab: 'button:text("Self-Evolution")',
  createTab: 'button:text("Create New")',

  /** Phase filter pills */
  phaseFilter: (phase) =>
    `button.capitalize:text("${phase}")`,

  /** Search input */
  searchInput: 'input[placeholder="Search skills..."]',

  /** Skill list items */
  skillRow: ".bg-white.dark\\:bg-slate-800.rounded-xl",
  skillByName: (displayName) =>
    `.rounded-xl:has(span:text("${displayName}"))`,

  /** Expanded skill actions */
  runBtn: 'button:has-text("Run")',
  editSkillBtn: 'button:has-text("Edit")',
  deleteSkillBtn: 'button:has-text("Delete")',

  /** Toggle enabled/disabled */
  enableToggle: 'button[title="Disable"], button[title="Enable"]',

  /** Proposal cards */
  approveBtn: 'button:has-text("Approve")',
  rejectBtn: 'button:has-text("Reject")',

  /** Create form fields */
  nameInput: 'input[placeholder*="stakeholder-mapping"]',
  displayNameInput: 'input[placeholder*="Stakeholder Mapping"]',
  descriptionInput: 'textarea[placeholder="What does this skill do?"]',
  createSkillBtn: 'button:has-text("Create Skill")',
};

// ---------------------------------------------------------------------------
// Context Editor View
// ---------------------------------------------------------------------------

export const CONTEXT = {
  /** Page heading */
  heading: 'text="Project Context"',

  /** Save all button */
  saveAllBtn: 'button:has-text("Save All")',

  /** Section headers (accordion toggles) */
  companySection: 'button:has(h3:text("Company Context"))',
  projectSection: 'button:has(h3:text("Project Context"))',
  guardrailsSection: 'button:has(h3:text("Guardrails"))',

  /** Textarea editors (visible when section is expanded) */
  companyTextarea: 'textarea[placeholder*="Describe your company"]',
  projectTextarea: 'textarea[placeholder*="Describe this specific research"]',
  guardrailsTextarea: 'textarea[placeholder*="Set rules and boundaries"]',

  /** Per-section save links */
  saveCompanyBtn: 'button:text("Save Company Context")',
  saveProjectBtn: 'button:text("Save Project Context")',
  saveGuardrailsBtn: 'button:text("Save Guardrails & Instructions")',
};

// ---------------------------------------------------------------------------
// Settings View
// ---------------------------------------------------------------------------

export const SETTINGS = {
  /** Page heading */
  heading: 'text="Settings"',

  /** Section cards */
  systemStatusCard: 'h3:has-text("System Status")',
  hardwareCard: 'h3:has-text("Hardware")',
  recommendedModelCard: 'h3:has-text("Recommended Model")',
  availableModelsCard: 'h3:has-text("Available Models")',
  pullModelCard: 'h3:has-text("Pull New Model")',

  /** Model switch buttons */
  switchModelBtn: 'button:text("Switch")',
  activeModelBadge: 'span:text("Active")',

  /** Pull model input */
  pullModelInput: 'input[placeholder*="qwen3:7b"]',

  /** Refresh button */
  refreshBtn: 'button:has-text("Refresh")',
};

// ---------------------------------------------------------------------------
// Modals / Dialogs
// ---------------------------------------------------------------------------

export const MODALS = {
  /** Generic modal overlay (the dark backdrop) */
  overlay: ".fixed.inset-0.bg-black\\/50, .fixed.inset-0.bg-black\\/60",

  /** Confirm dialog */
  confirmDialog: ".fixed.inset-0 .rounded-xl.shadow-xl",
  confirmBtn: (label) => `button:text("${label}")`,
  cancelBtn: 'button:text("Cancel")',

  /** Search modal */
  searchModal: ".fixed.inset-0 .rounded-2xl.shadow-2xl",
  searchInput: 'input[placeholder="Search findings, nuggets, insights..."]',
  searchClose: ".fixed.inset-0 .rounded-2xl button:has(svg)",
};

// ---------------------------------------------------------------------------
// Onboarding Wizard
// ---------------------------------------------------------------------------

export const ONBOARDING = {
  /** Wizard overlay */
  overlay: ".fixed.inset-0.bg-black\\/60",

  /** Progress bar segments */
  progressBar: ".flex.gap-1.p-4 .rounded-full",

  /** Step 0: Welcome */
  welcomeHeading: 'text="Welcome to ReClaw"',
  getStartedBtn: 'button:has-text("Get Started")',

  /** Step 1: Create project */
  projectNameInput: 'input[placeholder*="Onboarding Redesign"]',
  createProjectBtn: 'button:has-text("Create Project")',

  /** Step 2: Context */
  companyInput: 'textarea[placeholder*="B2B SaaS"]',
  goalsInput: 'textarea[placeholder*="Understand why users"]',
  saveContextBtn: 'button:has-text("Save & Continue"), button:has-text("Skip for Now")',

  /** Step 3: Upload */
  uploadBtn: 'button:has-text("Click to upload files")',
  finishBtn: 'button:has-text("Start Researching"), button:has-text("Skip & Explore")',

  /** Back button (common to steps 1-3) */
  backBtn: 'button:has-text("Back")',
};

// ---------------------------------------------------------------------------
// Toast Notifications
// ---------------------------------------------------------------------------

export const TOAST = {
  /** Toast container (bottom-right) */
  container: ".fixed.bottom-16.right-4",

  /** Individual toast elements */
  toast: ".animate-fade-in.border-l-4",

  /** Toast by type */
  success: ".border-green-500",
  warning: ".border-yellow-500",
  info: ".border-blue-500",
  agent: ".border-reclaw-500",
  file: ".border-purple-500",
  suggestion: ".border-amber-500",

  /** Dismiss button inside a toast */
  dismissBtn: 'button[aria-label="Dismiss notification"]',
};

// ---------------------------------------------------------------------------
// Status Bar
// ---------------------------------------------------------------------------

export const STATUS_BAR = {
  container: 'footer, [role="status"]',
};
