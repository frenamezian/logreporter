
# Agent Activity Monitoring System - Functional Specification & Architecture

## Overview
This document describes the functional specification and technical architecture for a **local, static web app** to monitor the activity of AI agents and subagents. The system logs agent actions to a SQLite database and provides a dashboard to visualize and manage these logs.

---

## 1. Functional Specification

### 1.1 Data Model (SQLite Database)
The system uses a single SQLite database file (`activity_logs.db`) with a `logs` table containing the following fields:

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `id` | INTEGER | Yes | Auto-increment | Primary key |
| `timestamp` | DATETIME | Yes | - | UTC timestamp of the log entry |
| `repo_name` | TEXT | Yes | - | Name of the repository |
| `branch_name` | TEXT | Yes | - | Name of the branch |
| `trace_id` | TEXT | No | - | UUID to group related logs |
| `parent_trace_id` | TEXT | No | - | UUID for hierarchical traceability |
| `task_title` | TEXT | No | - | Title of the task (if applicable) |
| `agent_name` | TEXT | Yes | - | Name of the agent |
| `agent_path` | TEXT | Yes | - | Full path of the agent (e.g., `lead_architect/subagent_1/nested_subagent_3`) |
| `log_title` | TEXT | Yes | - | Title of the log entry |
| `log_description` | TEXT | Yes | - | Description of the log entry |
| `log_type` | TEXT | Yes | - | Type of log (enum: `workflow_start`, `workflow_end`, `activity`, `issue_with_resolution`, `block`, `summary`, `decision`, `escalation`, `retry`, `resource_access`) |
| `log_level` | TEXT | No | - | Log level (enum: `debug`, `info`, `warning`, `error`) |
| `status` | TEXT | No | - | Status of the task (enum: `pending`, `in_progress`, `failed`, `completed`) |
| `priority` | TEXT | No | - | Priority of the task (enum: `low`, `medium`, `high`, `critical`) |
| `user_id` | TEXT | Yes | `admin` | User ID (default: `admin`) |
| `tags` | TEXT | No | - | Comma-separated list of custom tags (e.g., `#urgent,#experimental`) |
| `error_details` | TEXT | No | - | Stack traces, error codes, or suggested fixes |
| `resolved_by` | TEXT | No | - | Agent or user who resolved the issue |
| `resolution_time` | DATETIME | No | - | When the issue was resolved |
| `performance_metrics` | JSON | No | - | Execution time, CPU/memory usage, tokens consumed, etc. |
| `input_output_hash` | TEXT | No | - | Hash of input/output data for critical tasks |

---

### 1.2 Log_Reporter Tool

#### Functionality
- **Write Logs:**
  - Asynchronously writes log records to the SQLite database.
  - Includes a **retry mechanism** to handle concurrent write conflicts (e.g., exponential backoff).
  - Validates required fields (`repo_name`, `branch_name`, `agent_name`, `log_type`, `log_title`, `log_description`).
  - Automatically populates `timestamp`, `user_id` (default: `admin`), and `agent_path`.

- **Log Types:**
  - **Mandatory Logging Points for Agents:**
    - Start/end of every task (`workflow_start`, `workflow_end`).
    - Before/after calling external tools or APIs (`resource_access`).
    - When encountering errors, retries, or blocks (`issue_with_resolution`, `block`, `retry`).
    - When making critical decisions (`decision`).
    - When escalating issues (`escalation`).
  - Agents **must not log** sensitive data (e.g., PII, API keys) or proprietary information.

- **Agent Instructions:**
  - Include **generic guidelines** for when and how to log, such as:
    - *"Log the start and end of every task."*
    - *"For blocks or issues, include the error, what you tried, and why it failed."*
    - *"Use `decision` logs to explain critical choices and their rationale."*
    - *"Tag logs with contextual keywords (e.g., `#urgent`, `#data_cleaning`)."*

---

### 1.3 Web App

#### Pages and Features
- **Logs Dashboard:**
  - Displays logs **grouped by repository and task** in a collapsible hierarchy.
  - **Refresh on demand** (e.g., via a "Refresh Logs" button) or **polling** (e.g., check for file changes every 5 seconds).
  - **Filtering options** by:
    - Repository, branch, task title, agent name, log type, log level, status, priority, user_id, tags, date range.
    - Full-text search in `log_title` and `log_description`.
  - **Visualizations:**
    - Timeline view for logs related to a specific `trace_id` or task.
    - Dependency graph to visualize agent hierarchies (`agent_path`).

- **Log Maintenance Page:**
  - **Delete logs** based on:
    - Repository, branch, and/or date ranges.
    - Confirmation dialog before deletion.
  - **Export logs** (CSV/JSON) for offline analysis.

- **Metrics Dashboard:**
  - Overview of:
    - Active/paused/failed tasks.
    - Most common blocks or issues.
    - Average task duration (from `performance_metrics`).

---

### 1.4 Non-Functional Requirements
- **Retention:** Logs are retained **until manually deleted** via the maintenance page.
- **Concurrency:** SQLite write conflicts are handled via **retry mechanisms** in the `Log_Reporter`.
- **Security:**
  - No login required for now (local HTML use only).
  - All tables include `user_id` for future multi-user support.
  - Logs are **GDPR-compliant by design** (no sensitive data logged).
- **Performance:**
  - Asynchronous logging to avoid blocking agents.
  - Lightweight web app for local use.

---

## 2. Technical Architecture

### 2.1 System Overview
The system consists of:
1. **Agents** (Python-based, with `Log_Reporter` tool).
2. **SQLite Database** (`activity_logs.db`).
3. **Static Web App** (HTML, CSS, JavaScript, Web Components).

```
┌─────────────┐       ┌─────────────────┐       ┌─────────────────────┐
│   Agents     │──────▶│  SQLite DB       │◀──────│   Static Web App     │
│ (Log_Reporter)│       │ (activity_logs.db)│       │ (HTML/CSS/JS/Web     │
└─────────────┘       └─────────────────┘       │  Components)         │
                                                  └─────────────────────┘
```

---

### 2.2 Static Frontend
- **No Backend Server:** The web app runs entirely in the browser.
- **File Access:**
  - The user manually places the `activity_logs.db` file in the same directory as `index.html`.
  - The app uses the **File System Access API** or a file input dialog to load the DB file.
- **SQLite in the Browser:**
  - Uses **sql.js** (SQLite compiled to WebAssembly) to query the DB file client-side.
- **Web Components:**
  - Reusable UI elements (e.g., `<log-table>`, `<log-filter>`, `<log-chart>`).
- **Data Flow:**
  - All filtering, search, and visualization logic runs **client-side** in JavaScript.
  - **No live updates**: Uses polling or manual refresh to update the dashboard.

---

### 2.3 Tech Stack

| Component          | Technology                          |
|--------------------|-------------------------------------|
| **Frontend**       | HTML, CSS, JavaScript, Web Components |
| **Database**       | SQLite (via `sql.js` or `better-sqlite3-wasm`) |
| **File Access**    | File System Access API or `<input type="file">` |
| **Charts**         | Lightweight libraries like Chart.js |
| **Styling**        | Plain CSS or a minimal framework    |

---

### 2.4 Limitations
- **Browser Security:** Modern browsers restrict direct filesystem access. The **File System Access API** (Chrome/Edge) or **file input** (all browsers) are required to read the DB file.
  - Users must **explicitly select the DB file** each time they open the app (or use a persistent file handle if the browser supports it).
- **No Concurrent Writes:** If multiple agents write to the DB while the app is open, the browser won’t see changes until the page is refreshed or the file is reloaded.
- **No Authentication:** Since it’s local-only, no login is needed.

---

## 3. Future Considerations
- **Multi-User Support:** Add authentication and user-specific log filtering if the app is deployed to a server.
- **Real-Time Updates:** Use WebSockets or Server-Sent Events (SSE) if a backend is introduced later.
- **Advanced Visualizations:** Integrate more powerful charting libraries (e.g., D3.js) for complex dashboards.

---

## 4. Glossary
- **Agent Path:** Full hierarchical path of an agent (e.g., `lead_architect/subagent_1/nested_subagent_3`).
- **Trace ID:** UUID used to group related logs across agents or tasks.
- **GDPR-Compliant:** Ensures no sensitive or personal data is logged.
- **Web Components:** Native browser APIs for creating reusable custom elements.
- **SQLite WASM:** WebAssembly port of SQLite for client-side database operations.
