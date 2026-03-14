# ReClaw UI Audit Report

**Date:** 2026-03-14  
**Auditor:** UI Audit Agent  
**Scope:** All 19 frontend components (.tsx files)  
**Reference:** UI-DESIGN.md specification, Nielsen's 10 Heuristics, WCAG 2.1

---

## Executive Summary

The ReClaw frontend is a solid foundation with good component structure, dark mode support, and a research-native workflow. However, it has significant gaps in **accessibility**, **error handling**, **responsive design**, and **user control**. The codebase uses consistent patterns (Zustand stores, lucide-react icons, Tailwind CSS) but several spec-defined features are missing or stubbed. Overall: **6.2/10** average across components.

### Top 5 Critical Issues

1. **No ARIA labels or roles anywhere** — screen reader users cannot navigate the app
2. **No keyboard navigation support** beyond basic tab order — no focus traps in modals, no arrow key navigation
3. **Event listener leak in page.tsx** — `window.addEventListener` called on every render without cleanup
4. **No confirm dialogs for destructive actions** — delete task, rollback version happen instantly
5. **No responsive/mobile layout** — spec calls for bottom nav on narrow screens; not implemented

---

## Component-by-Component Audit

### 1. `app/layout.tsx` — Score: 6/10

**What it does:** Root layout with metadata.

| Heuristic | Score | Notes |
|-----------|-------|-------|
| Accessibility | ⚠️ | `lang="en"` is set ✅. No skip-to-content link. No global focus styles defined. |
| Consistency | ✅ | Clean, minimal layout wrapper |

**Issues:**
- No `<ErrorBoundary>` wrapping children at root level — unhandled errors crash the whole app
- No `<meta name="viewport">` for mobile responsiveness (may be in globals.css or Next.js default)
- No global announcement region for screen readers (`aria-live`)

**Recommendations:**
- Wrap `{children}` in `<ErrorBoundary>`
- Add skip-to-content link: `<a href="#main-content" className="sr-only focus:not-sr-only">`
- Add `aria-live="polite"` region for dynamic announcements

---

### 2. `app/page.tsx` — Score: 4/10

**What it does:** Main app shell — orchestrates sidebar, main view, right panel, status bar.

| Heuristic | Score | Notes |
|-----------|-------|-------|
| Visibility of system status | ⚠️ | StatusBar and ToastNotification present, but no loading state between view switches |
| User control & freedom | ❌ | No breadcrumbs, no browser back/forward (no URL routing) |
| Flexibility | ✅ | Cmd+K search shortcut |
| Error prevention | ❌ | No error boundary around `renderView()` |

**Critical Bug:** 
```tsx
// This adds a NEW listener on EVERY render — massive memory leak!
if (typeof window !== "undefined") {
  window.addEventListener("keydown", (e) => { ... });
}
```
This should be in a `useEffect` with cleanup.

**Issues:**
- No URL-based routing — browser back/forward buttons don't work, can't share deep links
- No transition animation between views
- No loading skeleton shown while switching views
- `renderView()` has no error boundary — one component crash kills everything

**Recommendations:**
- **Fix the event listener leak immediately** — move to `useEffect` with return cleanup
- Implement URL routing (Next.js App Router or query params) for view state
- Wrap `renderView()` in `<ErrorBoundary>`
- Add view transition loading state
- Add breadcrumbs or view title in the header area

---

### 3. `components/chat/ChatView.tsx` — Score: 7/10

**What it does:** The conversational interface — the default and most important view.

| Heuristic | Score | Notes |
|-----------|-------|-------|
| Visibility of system status | ✅ | Streaming indicator, "Thinking..." state, error display |
| Match with real world | ✅ | Chat bubble metaphor, familiar messaging patterns |
| User control | ⚠️ | Can't cancel a streaming response, no message editing/deletion |
| Error prevention | ⚠️ | Send disabled when empty/streaming ✅, but no file type/size validation feedback |
| Recognition vs recall | ✅ | Good placeholder text, source citations inline |
| Aesthetic design | ✅ | Clean, max-width constrained, clear user/agent distinction |

**Issues:**
- No `aria-label` on any buttons (file upload, send)
- No `role="log"` on messages container, no `aria-live` for new messages
- Textarea doesn't auto-resize (fixed `rows={1}` with max-height)
- File upload has no progress indicator, no size limit warning, no error toast on failure
- Can't cancel a streaming response
- No drag-and-drop for files (spec mentions it)
- No voice input button (spec mentions 🎤)
- Empty state for no project is good ✅
- Empty state for no messages is good ✅

**Recommendations:**
- Add `aria-label="Send message"` to send button, `aria-label="Upload file"` to paperclip
- Add `role="log" aria-live="polite"` to messages container
- Implement auto-resize textarea
- Add cancel button during streaming
- Add drag-and-drop file zone
- Show file upload progress toast
- Add max file size validation with user feedback

---

### 4. `components/common/DarkModeToggle.tsx` — Score: 8/10

**What it does:** Light/dark theme toggle.

| Heuristic | Score | Notes |
|-----------|-------|-------|
| Visibility | ✅ | Icon changes to reflect current mode |
| Match with real world | ✅ | Sun/moon metaphor universally understood |
| Consistency | ✅ | Respects system preference on first load |

**Issues:**
- `title` attribute is set ✅ but no `aria-label` — `title` is not reliable for screen readers
- No `aria-pressed` state to indicate current mode
- Flash of wrong theme possible on SSR (no blocking script)

**Recommendations:**
- Add `aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}`
- Add `aria-pressed={dark}` or use `role="switch"`
- Consider a blocking `<script>` in `<head>` to prevent flash

---

### 5. `components/common/ErrorBoundary.tsx` — Score: 7/10

**What it does:** Catches React errors, shows fallback UI.

| Heuristic | Score | Notes |
|-----------|-------|-------|
| Error recovery | ✅ | "Try Again" button resets error state |
| Visibility | ✅ | Clear error icon and message |
| Help | ⚠️ | Shows raw error message but no guidance on what to do |

**Issues:**
- "Try Again" just clears the error state — if the underlying issue persists, it'll just error again
- No error reporting (only `console.error`)
- No `role="alert"` on error display
- Custom `fallback` prop is good ✅

**Recommendations:**
- Add `role="alert"` to error container
- Add "Report this issue" or "Copy error details" button
- Consider a "Go back to chat" escape hatch
- Add retry count to prevent infinite error loops

---

### 6. `components/common/LoadingSkeleton.tsx` — Score: 8/10

**What it does:** Provides skeleton loading placeholders (card, list, chat variants).

| Heuristic | Score | Notes |
|-----------|-------|-------|
| Visibility of system status | ✅ | Pulse animation communicates loading clearly |
| Consistency | ✅ | Reusable variants for different contexts |
| Accessibility | ⚠️ | No `aria-busy` or `aria-label="Loading"` |

**Issues:**
- No `aria-busy="true"` on skeleton containers
- No screen reader text (e.g., `<span className="sr-only">Loading...</span>`)
- Not actually used in most components — many use custom inline loading states instead

**Recommendations:**
- Add `aria-busy="true"` and `role="status"` with sr-only "Loading" text
- Use these consistently across all components instead of ad-hoc loading states
- Add a `TableSkeleton` variant for metrics/findings

---

### 7. `components/common/SearchModal.tsx` — Score: 7/10

**What it does:** Global search modal (Cmd+K) across all findings.

| Heuristic | Score | Notes |
|-----------|-------|-------|
| Flexibility | ✅ | Cmd+K shortcut, ESC to close |
| Recognition vs recall | ✅ | Type icons, color coding, highlight matches |
| Visibility | ✅ | Loading spinner, empty state messages, keyboard hints |
| User control | ⚠️ | No arrow key navigation through results |

**Issues:**
- **Duplicate Cmd+K listener** — both `page.tsx` and `SearchModal.tsx` listen for the same shortcut
- No `role="dialog"` or `aria-modal="true"` on the modal
- No focus trap — Tab can escape the modal to background elements
- No `aria-label="Search"` on the modal
- Search is client-side filtering only (fetches ALL findings, then filters) — won't scale
- No result click action — clicking a result does nothing (no navigation)
- Backdrop click doesn't close the modal
- No arrow key navigation through results
- No "recent searches" or "suggested searches"

**Recommendations:**
- Add `role="dialog" aria-modal="true" aria-label="Search findings"`
- Implement focus trap (trap Tab within modal)
- Add backdrop click to close
- Add arrow key navigation with `aria-activedescendant`
- Make results clickable — navigate to the finding in context
- Remove duplicate Cmd+K listener from `page.tsx`
- Add debounced search-as-you-type instead of Enter-to-search

---

### 8. `components/common/SettingsView.tsx` — Score: 6/10

**What it does:** Shows system status, hardware info, model recommendations, available models.

| Heuristic | Score | Notes |
|-----------|-------|-------|
| Visibility | ✅ | Connection status with color coding, hardware details clear |
| Match with real world | ✅ | RAM in GB, CPU cores, intuitive labels |
| User control | ❌ | Can't change settings — it's read-only! No model switching. |
| Error recovery | ⚠️ | Error silently caught, user sees nothing if fetch fails |

**Issues:**
- No ability to change active model (the spec shows this as a settings view)
- No ability to configure watched folders, embed model, etc.
- No error state shown to user — just `console.error`
- Refresh button has no feedback (no loading state when clicked)
- No `aria-label` on any elements
- "Available Models" cards have no action (can't select a model)

**Recommendations:**
- Add model switching capability
- Show error state when API calls fail (not just console.error)
- Add loading state to refresh button
- Add configuration sections: watched folders, embed model, API keys
- Add `aria-label` to status indicators

---

### 9. `components/common/ToastNotification.tsx` — Score: 8/10

**What it does:** Non-intrusive toast notifications driven by WebSocket events.

| Heuristic | Score | Notes |
|-----------|-------|-------|
| Visibility | ✅ | Color-coded, icon-distinguished, auto-dismiss with sticky option |
| User control | ✅ | Dismiss button on each toast |
| Consistency | ✅ | Consistent visual language for all event types |
| Aesthetic | ✅ | Clean, non-intrusive positioning |

**Issues:**
- No `role="alert"` or `aria-live="assertive"` on toast container
- No animation on dismiss (instant removal)
- Toasts positioned at `bottom-16 right-4` — may overlap with StatusBar on small screens
- Suggestion toasts are sticky (duration=0) but have no dedicated action buttons (spec shows [Yes] [Not now] [Never])
- No `tabIndex` on toasts — can't Tab to them
- Max 5 visible is good ✅

**Recommendations:**
- Add `role="status" aria-live="polite"` to toast container (or `aria-live="assertive"` for errors)
- Add slide-out animation on dismiss
- Add action buttons to suggestion toasts per spec
- Check overlap with StatusBar on different screen sizes
- Make toasts focusable for keyboard users

---

### 10. `components/common/VersionHistory.tsx` — Score: 6/10

**What it does:** Git-like version history with expandable entries and rollback.

| Heuristic | Score | Notes |
|-----------|-------|-------|
| Visibility | ✅ | Grouped by date, agent vs user badges, file counts |
| User control | ⚠️ | Rollback button exists but no confirmation dialog! |
| Error recovery | ⚠️ | Rollback button is present but appears non-functional (no onClick handler) |
| Match with real world | ✅ | Git-like commit history is familiar to developers |

**Issues:**
- **Rollback button has no `onClick` handler** — it's decorative only
- No confirmation dialog before rollback
- No diff view (spec mentions [View Diff])
- No `aria-expanded` on expandable entries
- Loading state uses `<History>` icon spinning — `animate-spin` on a non-circular icon looks wrong
- Empty state is good ✅

**Recommendations:**
- Implement rollback functionality with confirmation dialog
- Add `aria-expanded={isExpanded}` to toggle buttons
- Implement diff view
- Use `<Loader2>` for loading spinner instead of `<History>`
- Add `role="button"` and keyboard support to expandable rows

---

### 11. `components/findings/AtomicDrilldown.tsx` — Score: 6/10

**What it does:** Modal showing the atomic research evidence chain for a finding.

| Heuristic | Score | Notes |
|-----------|-------|-------|
| Visibility | ✅ | Breadcrumb shows chain: Recommendations → Insights → Facts → Nuggets → Sources |
| Match with real world | ✅ | Atomic research model well-represented |
| User control | ✅ | Back/close button, clear modal structure |
| Error prevention | ⚠️ | Empty catch blocks `catch(() => {})` — errors silently swallowed |

**Issues:**
- No `role="dialog" aria-modal="true"` on modal
- No focus trap
- No ESC to close
- Backdrop click doesn't close the modal
- `buildChain()` is a stub — just slices arrays instead of following actual relationships
- Empty state text is helpful ✅
- No loading state while fetching findings data
- All four API calls happen in parallel (good) but errors are silently swallowed

**Recommendations:**
- Add `role="dialog" aria-modal="true" aria-label="Evidence chain"`
- Add focus trap and ESC to close
- Add backdrop click to close
- Show loading skeleton while data loads
- Implement proper relationship-based chain building
- Show error state instead of swallowing errors

---

### 12. `components/findings/FindingsView.tsx` — Score: 7/10

**What it does:** The "Crown Jewel" — research findings organized by phase with expandable sections.

| Heuristic | Score | Notes |
|-----------|-------|-------|
| Visibility | ✅ | Summary stats, phase tabs with counts, confidence indicators |
| Recognition vs recall | ✅ | Phase tabs, section headers, finding metadata |
| Consistency | ✅ | Consistent card patterns with metadata display |
| Error prevention | ⚠️ | `console.error` only — no user-facing error state |

**Issues:**
- No `aria-selected` on phase tabs, no `role="tablist"` / `role="tab"` / `role="tabpanel"`
- No `aria-expanded` on accordion sections
- No keyboard navigation for phase tabs (arrow keys)
- Errors silently logged — user sees nothing if API fails
- No loading skeleton while data fetches
- No sorting or filtering within sections
- Good empty state per section ✅
- Summary stats grid may not render well on very small screens

**Recommendations:**
- Add proper ARIA tab pattern: `role="tablist"`, `role="tab"`, `role="tabpanel"`
- Add `aria-expanded` to accordion buttons
- Add loading skeleton
- Add error state with retry
- Add sort/filter controls (by confidence, date, source)
- Add "Add finding manually" button

---

### 13. `components/interviews/InterviewView.tsx` — Score: 6/10

**What it does:** Interview/transcript viewer with file browser, transcript parsing, and nugget sidebar.

| Heuristic | Score | Notes |
|-----------|-------|-------|
| Visibility | ✅ | Tags with counts, nugget extraction indicators, file tabs |
| Match with real world | ✅ | Speaker/timestamp format, interview metaphors |
| User control | ⚠️ | Upload works, but no delete file, no rename, no reorder |
| Flexibility | ✅ | Tag filtering, quick action buttons |
| Error prevention | ⚠️ | Silent error handling throughout |

**Issues:**
- **No audio playback** — spec shows audio player with play/pause and sync to transcript
- No click-to-highlight for manual nugget tagging (spec feature)
- Quick action buttons at bottom have no `onClick` handlers — they're decorative
- `handleFileSelect` uses fake placeholder text instead of fetching actual content
- No `aria-label` on any buttons or interactive elements
- Right sidebar (280px fixed) isn't responsive — will squeeze on smaller screens
- No way to delete uploaded files
- Tag filter "All" button is good ✅
- Transcript parsing is robust (3 patterns) ✅

**Recommendations:**
- Implement audio playback with transcript sync
- Implement click-to-highlight for manual nugget tagging
- Wire up quick action buttons to actual functionality
- Fetch actual file content in `handleFileSelect`
- Add `aria-label` to all buttons
- Make sidebar collapsible for responsive behavior
- Add file deletion capability

---

### 14. `components/kanban/KanbanBoard.tsx` — Score: 7/10

**What it does:** Drag-and-drop task board with four columns.

| Heuristic | Score | Notes |
|-----------|-------|-------|
| Visibility | ✅ | Color-coded columns, progress bars, task counts |
| User control | ✅ | Drag-and-drop, create tasks, delete tasks, expand details |
| Match with real world | ✅ | Familiar Kanban metaphor |
| Flexibility | ⚠️ | HTML drag-and-drop only — no keyboard DnD, no touch support |
| Error prevention | ⚠️ | Delete has no confirmation dialog |

**Issues:**
- **No keyboard-accessible drag-and-drop** — completely inaccessible without a mouse
- No confirmation before deleting a task
- Task creation in non-backlog columns has a race condition (creates then immediately moves)
- No `aria-label` on columns, cards, or buttons
- `GripVertical` icon suggests drag but provides no accessible alternative
- Horizontal scroll (`overflow-x-auto`) but no scroll indicator
- New task input supports Enter (submit) and Escape (cancel) — good ✅
- Progress bars are visual-only — no text alternative for screen readers

**Recommendations:**
- Add keyboard-accessible move: select task → use arrow keys or dropdown to change column
- Add confirmation dialog for delete: "Delete task [title]? This can't be undone."
- Add `aria-label` to columns: `aria-label="Backlog - 3 tasks"`
- Add `aria-roledescription="draggable"` to task cards
- Add screen reader text for progress bars
- Add touch-friendly drag support (consider `@dnd-kit/core`)
- Fix race condition in non-backlog task creation

---

### 15. `components/layout/RightPanel.tsx` — Score: 7/10

**What it does:** Contextual side panel that changes content based on active view.

| Heuristic | Score | Notes |
|-----------|-------|-------|
| Visibility | ✅ | Contextual content changes appropriately per view |
| User control | ✅ | Collapsible with toggle button |
| Recognition vs recall | ✅ | Section headers, clear labels, helpful guidance text |
| Consistency | ✅ | Consistent card pattern across contexts |

**Issues:**
- No `aria-label` on panel or toggle buttons
- Collapsed state shows a narrow button but no tooltip (has `title` ✅)
- Error handling: empty `catch(() => {})` on all API calls
- No loading state while fetching data
- `renderInterviewContext` and `renderMetricsContext` not implemented (falls through to chat context)
- `contextMap` uses JSX return type annotation — should be `React.ReactNode`

**Recommendations:**
- Add `aria-label="Context panel"` to the aside
- Add loading skeletons for data
- Implement interview and metrics context views
- Handle API errors with user feedback
- Add `role="complementary"` to the aside

---

### 16. `components/layout/Sidebar.tsx` — Score: 7/10

**What it does:** Left navigation with project list, nav items, and search shortcut.

| Heuristic | Score | Notes |
|-----------|-------|-------|
| Visibility | ✅ | Active state highlighting, project phase display, collapse/expand |
| User control | ✅ | Collapsible sidebar, project creation, search access |
| Recognition vs recall | ✅ | Icons + labels, keyboard shortcut hint (⌘K) |
| Consistency | ✅ | Consistent nav item pattern |
| Aesthetic | ✅ | Clean, well-organized sections |

**Issues:**
- No `nav aria-label="Main navigation"` on the nav element
- No `role="navigation"` on the aside
- No `aria-current="page"` on active nav item
- No keyboard shortcut to toggle sidebar
- Can't delete or rename projects
- Can't reorder projects
- No project search/filter when list gets long
- Collapsed mode hides project list entirely — no way to switch projects when collapsed
- New project input supports Enter but not Escape to cancel

**Recommendations:**
- Add `role="navigation" aria-label="Main navigation"` to nav
- Add `aria-current="page"` to active view button
- Add Escape to cancel new project creation
- Add project rename/delete in a context menu
- Show project initials in collapsed mode for quick switching
- Add keyboard shortcut (e.g., Cmd+B) to toggle sidebar

---

### 17. `components/layout/StatusBar.tsx` — Score: 6/10

**What it does:** Bottom bar showing connection status and agent activity.

| Heuristic | Score | Notes |
|-----------|-------|-------|
| Visibility | ✅ | Connection and agent status clearly shown |
| Match with real world | ✅ | WiFi icon for connection, CPU for agent |

**Issues:**
- No `role="status"` or `aria-live` for dynamic status updates
- No memory/disk usage display (spec shows this as useful)
- File processed status auto-clears after 3 seconds — too fast for slow readers
- No click action to get more details about agent activity
- Version number is hardcoded `v0.1.0`

**Recommendations:**
- Add `role="status" aria-live="polite"` to the footer
- Make status bar clickable to expand agent activity log
- Add system resource indicators
- Make auto-clear timeout configurable or dismissible
- Pull version from package.json

---

### 18. `components/metrics/MetricsView.tsx` — Score: 6/10

**What it does:** Quantitative metrics dashboard with benchmarks and research coverage.

| Heuristic | Score | Notes |
|-----------|-------|-------|
| Visibility | ✅ | Trend indicators, color-coded status, benchmark comparisons |
| Help & documentation | ✅ | Excellent instructional empty state with specific examples |
| Match with real world | ✅ | Industry-standard metrics (SUS, NPS, task completion) |
| User control | ❌ | Entirely read-only — can't add custom metrics |

**Issues:**
- All metric values are hardcoded placeholders (`"—"`) — not connected to actual data
- No ability to input or import metric data
- No historical trend charts (spec shows these)
- Research coverage section depends on `summary` data but no loading state
- No `aria-label` on metric cards or progress bars
- Trend icons are visual-only — no text alternative for screen readers
- Good instructional empty state ✅
- Research coverage bars have no text alternative for screen readers

**Recommendations:**
- Connect metrics to actual data from skills/API
- Add ability to manually input metrics
- Add trend charts (line charts over time)
- Add loading skeleton for summary section
- Add `aria-label` to metric cards and progress bars
- Add screen reader text for trend indicators: "Trending up", "Trending down"

---

### 19. `components/projects/ContextEditor.tsx` — Score: 7/10

**What it does:** Editor for project context layers (company, project, guardrails).

| Heuristic | Score | Notes |
|-----------|-------|-------|
| Visibility | ✅ | Save feedback ("Saved!"), character count, expand/collapse |
| Recognition vs recall | ✅ | Excellent placeholder text with examples |
| Error prevention | ⚠️ | No unsaved changes warning when navigating away |
| Help & documentation | ✅ | "How context layers work" section is excellent |
| User control | ✅ | Save per-section or save all |

**Issues:**
- No unsaved changes detection — user can navigate away and lose edits
- No `aria-expanded` on section toggles
- Textarea placeholder text is very long — could be moved to a help tooltip
- No auto-save or draft saving
- Error on save shows only in console — no user feedback
- Eye/EyeOff icons for expand/collapse are semantically wrong (they suggest visibility, not expand)
- No undo/redo support
- No markdown preview

**Recommendations:**
- Add unsaved changes warning (beforeunload event or visual indicator)
- Add `aria-expanded` to section buttons
- Replace Eye/EyeOff with ChevronDown/ChevronRight for expand/collapse
- Add auto-save with debounce
- Show error toast on save failure
- Add character limit guidance
- Add undo support (Cmd+Z restores previous saved state)

---

## Cross-Cutting Issues

### Accessibility (WCAG) — Grade: D (3/10)

| WCAG Criterion | Status | Notes |
|----------------|--------|-------|
| 1.1.1 Non-text Content | ❌ | No alt text on icons used as buttons, no aria-labels |
| 1.3.1 Info and Relationships | ❌ | No semantic roles (tablist, dialog, navigation, log) |
| 1.4.3 Contrast | ⚠️ | Tailwind defaults are generally OK, but `text-slate-400` on `bg-slate-50` may fail AA |
| 2.1.1 Keyboard | ❌ | Modals have no focus trap, no keyboard DnD, no arrow key navigation |
| 2.4.1 Bypass Blocks | ❌ | No skip navigation link |
| 2.4.3 Focus Order | ⚠️ | Natural DOM order is reasonable, but no explicit focus management |
| 2.4.7 Focus Visible | ⚠️ | `focus:ring` on inputs ✅, but buttons lack visible focus styles |
| 3.3.1 Error Identification | ❌ | Errors logged to console only in most components |
| 4.1.2 Name, Role, Value | ❌ | No ARIA names, roles, or states on interactive elements |

**Recommendation:** Create an accessibility utilities file with:
- `FocusTrap` component for modals
- `VisuallyHidden` component for screen reader text
- Standard `aria-label` patterns as constants
- Focus management hooks

### State Handling — Grade: B- (6/10)

| State | Coverage | Notes |
|-------|----------|-------|
| Empty states | ✅ Good | Most components have "no project" and "no data" states |
| Loading states | ⚠️ Mixed | Settings and History use loading; Chat, Findings, Metrics don't |
| Error states | ❌ Poor | Almost all errors go to `console.error` only |

**Recommendation:** Standardize state handling with a `<DataLoader>` wrapper component that handles loading, error, and empty states consistently.

### Responsive Design — Grade: D (3/10)

| Breakpoint | Status | Notes |
|------------|--------|-------|
| Wide (1440px+) | ✅ | Three-panel layout works |
| Medium (1024-1440) | ⚠️ | Right panel collapsible, but sidebar isn't responsive |
| Narrow (<1024) | ❌ | No mobile layout at all |
| Touch | ❌ | No touch-friendly drag-and-drop, no gesture support |

**Spec requires:** Bottom navigation on narrow screens, collapsible panels — neither implemented.

**Recommendation:** Add responsive breakpoints with Tailwind's `lg:` / `md:` prefixes and implement a mobile navigation component.

### Missing UI Patterns

| Pattern | Status | Notes |
|---------|--------|-------|
| Confirm dialogs | ❌ | Delete task, rollback version — no confirmation |
| Tooltips | ⚠️ | HTML `title` used in places, but no rich tooltips |
| Breadcrumbs | ❌ | Only in AtomicDrilldown (static, not navigable) |
| Undo | ❌ | No undo for any action |
| Notification badge | ❌ | Spec shows 🔔 in header — not implemented |
| User menu | ❌ | Spec shows 👤 in header — not implemented |
| Phase selector | ❌ | Spec shows [Phase: Discover ▾] in header — not implemented |
| Dashboard view | ❌ | Spec lists 📊 Dashboard in nav — not implemented |
| Knowledge Base | ❌ | Spec lists 📚 Knowledge Base in nav — not implemented |
| Agents/Skills nav | ❌ | Spec lists 🤖 Agents and 🧩 Skills in sidebar — not implemented |

### Navigation Analysis

**Can user reach all views?** Yes — all implemented views accessible via sidebar nav.

**Dead ends?** 
- Search results are not clickable (dead end)
- Quick action buttons in InterviewView are not wired up (dead end)
- Rollback button in VersionHistory has no handler (dead end)
- Clicking a finding opens AtomicDrilldown, but there's no action from there (partial dead end)

**Missing navigation features:**
- No browser back/forward (no URL routing)
- No breadcrumb trail
- No "Back to..." links in drill-down views
- No keyboard shortcuts for view switching (e.g., Cmd+1 for Chat)

---

## Component Score Summary

| Component | Score | Priority Issues |
|-----------|-------|-----------------|
| layout.tsx | 6/10 | No ErrorBoundary, no skip-nav |
| page.tsx | 4/10 | **Event listener leak**, no routing, no error boundary |
| ChatView.tsx | 7/10 | No ARIA, no cancel streaming, no DnD files |
| DarkModeToggle.tsx | 8/10 | Minor ARIA issues |
| ErrorBoundary.tsx | 7/10 | No role="alert", no error reporting |
| LoadingSkeleton.tsx | 8/10 | Not used consistently, no ARIA |
| SearchModal.tsx | 7/10 | No focus trap, no result actions, duplicate listener |
| SettingsView.tsx | 6/10 | Read-only, no error state |
| ToastNotification.tsx | 8/10 | No ARIA live region, no action buttons on suggestions |
| VersionHistory.tsx | 6/10 | Rollback non-functional, no diffs, no ARIA |
| AtomicDrilldown.tsx | 6/10 | No focus trap, stub chain building, no loading |
| FindingsView.tsx | 7/10 | No ARIA tabs, no loading, no error state |
| InterviewView.tsx | 6/10 | No audio, stub actions, no highlight |
| KanbanBoard.tsx | 7/10 | No keyboard DnD, no delete confirm |
| RightPanel.tsx | 7/10 | Missing context views, no loading |
| Sidebar.tsx | 7/10 | No ARIA nav, no project management |
| StatusBar.tsx | 6/10 | No ARIA live, no interactivity |
| MetricsView.tsx | 6/10 | All placeholder data, no input |
| ContextEditor.tsx | 7/10 | No unsaved warning, wrong icons |
| **Average** | **6.4/10** | |

---

## Priority Action Plan

### P0 — Fix Immediately (Bugs)
1. **Fix event listener leak in `page.tsx`** — memory leak on every render
2. **Remove duplicate Cmd+K listener** — conflicts between page.tsx and SearchModal

### P1 — Critical UX (Next Sprint)
3. Add focus traps to all modals (SearchModal, AtomicDrilldown)
4. Add confirmation dialogs for destructive actions (delete task, rollback)
5. Add error states to all components (replace `console.error`)
6. Add `role="dialog"` and `aria-modal="true"` to all modals
7. Wrap `renderView()` in `<ErrorBoundary>` in page.tsx

### P2 — Accessibility (Next 2 Sprints)
8. Add `aria-label` to all icon-only buttons across the app
9. Add `role="navigation"`, `role="tablist"`, `role="log"`, `role="status"` semantics
10. Implement keyboard navigation for Kanban, tabs, and search results
11. Add skip-to-content link
12. Add visible focus styles to all interactive elements

### P3 — Feature Gaps (Backlog)
13. Implement URL-based routing for deep linking and back/forward
14. Add responsive/mobile layout with bottom navigation
15. Wire up stub buttons (quick actions, rollback)
16. Implement audio playback in InterviewView
17. Add drag-and-drop file upload in ChatView
18. Connect MetricsView to actual data

---

*End of audit. Generated 2026-03-14.*
