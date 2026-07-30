
# Agent Activity Monitoring System – Functional Specification (v2.0)
*Static HTML/CSS/JS Web App + SQLite Database*

---

## **📄 Overview**

### **Purpose**
Provide **real-time visibility** into AI agent/subagent activity by:
1. Logging all actions to a **local SQLite database** (`activity_logs.db`).
2. Displaying logs in a **static web app** (no server required) with:
   - Hierarchical browsing (repo → branch → task → agent).
   - Time-spent visualizations (timeline, breakdown charts).
   - Interactive filtering and drill-down.

### **Key Features**
- **5 log types** (simplified for clarity and token efficiency).
- **Trace ID** for grouping related logs across agents.
- **Static frontend** (HTML/CSS/JS/Web Components) with **SQLite in the browser** (`sql.js`).
- **Interactive visualizations** (tree, timeline, bar/pie charts, heatmap).

---

## **🔹 1. Data Model (SQLite Database)**

### **Database File**
- **File:** `activity_logs.db` (placed in the same directory as `index.html`).
- **Table:** `logs` (single table for all logs).

### **Schema**

| Field               | Type      | Required | Default   | Description |
|---------------------|-----------|----------|-----------|-------------|
| `id`                | INTEGER   | Yes      | Auto-inc  | Primary key. |
| `timestamp`         | DATETIME  | Yes      | -         | UTC timestamp (YYYY-MM-DD HH:MM:SS). |
| `repo_name`         | TEXT      | Yes      | -         | Repository name (e.g., `my_app`). |
| `branch_name`       | TEXT      | Yes      | -         | Branch name (e.g., `main`). |
| `trace_id`          | TEXT      | No       | -         | UUID to group related logs (e.g., `abc123-xyz456`). |
| `parent_trace_id`   | TEXT      | No       | -         | Parent `trace_id` for nested operations. |
| `task_title`        | TEXT      | No       | -         | Task name (e.g., `Analyze Codebase`). |
| `agent_name`        | TEXT      | Yes      | -         | Agent name (e.g., `subagent_frontend`). |
| `agent_path`        | TEXT      | Yes      | -         | Full agent path (e.g., `lead_architect/subagent_frontend`). |
| `log_type`          | TEXT      | Yes      | -         | **One of 5 types:** `start`, `end`, `activity`, `issue`, `decision`. |
| `log_title`         | TEXT      | Yes      | -         | Concise title (e.g., `API rate limit hit`). |
| `log_description`   | TEXT      | Yes      | -         | Detailed description (e.g., `Hit GitHub API rate limit (429). Retrying...`). |
| `log_level`         | TEXT      | No       | `info`    | Severity: `debug`, `info`, `warning`, `error`. |
| `status`            | TEXT      | No       | -         | Task status: `pending`, `in_progress`, `failed`, `completed`. |
| `priority`          | TEXT      | No       | -         | Priority: `low`, `medium`, `high`, `critical`. |
| `user_id`           | TEXT      | Yes      | `admin`   | User ID (default: `admin`). |
| `tags`              | TEXT      | No       | -         | Comma-separated tags (e.g., `#api,#retry,#github`). |
| `error_details`     | TEXT      | No       | -         | Stack traces, error codes, or suggested fixes. |
| `resolved_by`       | TEXT      | No       | -         | Agent/user who resolved the issue. |
| `resolution_time`   | DATETIME  | No       | -         | When the issue was resolved. |
| `performance_metrics` | JSON    | No       | -         | Metrics like `{"duration_ms": 5000, "tokens_used": 1000}`. |
| `input_output_hash` | TEXT      | No       | -         | Hash of input/output data (for critical tasks). |

---

## **🔹 2. Log Types (Simplified to 5)**

### **When to Use Each Type**

| Log Type   | Use Case | Example Titles | Agent Action |
|------------|----------|----------------|---------------|
| **`start`** | Start of a task, subtask, or workflow. | "Started code analysis", "Began API call" | Log at the **beginning** of any work. |
| **`end`** | End of a task, subtask, or workflow (success or failure). | "Completed frontend scan", "Task failed" | Log when **finishing** a task. |
| **`activity`** | Any normal operation or action (default for most logs). | "Processed file X", "Called GitHub API" | Log for **routine actions**. |
| **`issue`** | Any problem, block, error, or retry attempt. | "API rate limit hit", "Retrying (2/3)" | Log for **all issues**. |
| **`decision`** | Any choice, escalation, or resolution. | "Chose approach X", "Escalated to Y" | Log for **decisions**. |

### **Rules for Agents**
1. **Default to `activity`** unless the log is a `start`, `end`, `issue`, or `decision`.
2. **Never log sensitive data** (API keys, PII, tokens, etc.).
3. **Use `issue` for all problems** (blocks, retries, errors). Add context in `log_description` or `tags`.
4. **Use `decision` for all choices** (including escalations or resolutions).

---

## **🔹 3. Agent Instructions (Copy-Paste into Prompts)**

### **📌 Generic Instructions for ALL Agents**

#### **🔹 When to Log**
You **MUST** log in these scenarios (use the `Log_Reporter` tool):
1. **Task Lifecycle:**
   - At the **start** of any task/subtask/workflow → Use `log_type: start`.
   - At the **end** of any task/subtask/workflow → Use `log_type: end`.
2. **Normal Operations:**
   - For **any significant action** (e.g., file processing, data analysis) → Use `log_type: activity`.
   - For **external calls** (APIs, databases, tools) → Use `log_type: activity`.
3. **Problems:**
   - For **any issue, block, error, or retry** → Use `log_type: issue`.
     - Include: Error details, what you tried, and why it failed.
4. **Decisions:**
   - For **any choice, escalation, or resolution** → Use `log_type: decision`.
     - Include: The decision, rationale, and who/what it affects.

#### **🔹 What to Include in Every Log**
For **every log entry**, you **MUST** provide:
- `repo_name`: Name of the repository (required).
- `branch_name`: Name of the branch (required).
- `agent_name`: Your agent’s name (required).
- `agent_path`: Full path of your agent (e.g., `lead_architect/subagent_1`) (required).
- `task_title`: Title of the task (if applicable).
- `log_type`: **One of 5 types** (`start`, `end`, `activity`, `issue`, `decision`).
- `log_title`: A **concise title** (e.g., "API rate limit hit").
- `log_description`: A **detailed description** (e.g., "Hit GitHub API rate limit (429). Retrying with exponential backoff.").
- `trace_id`: **Only if provided** by a parent agent or context. Do **NOT** generate your own.
- `tags`: Optional comma-separated tags (e.g., `#api,#retry,#github`).

#### **🔹 Trace ID Rules for ALL Agents**
- If you are **given a `trace_id`** (e.g., by a parent agent or from context):
  - **Use it for all logs** related to the current operation.
  - **Pass it to any subagents or tools** you invoke for the same operation.
- If you are **NOT given a `trace_id`**:
  - **Do NOT generate one**. Leave `trace_id` empty.

#### **🔹 What NOT to Log**
- **Never log sensitive data**, such as:
  - API keys, passwords, or tokens.
  - Personally Identifiable Information (PII) or proprietary data.
- Avoid logging **large payloads** (e.g., full file contents). Use hashes (`input_output_hash`) instead.

#### **🔹 How to Log (Example)**
Use the `Log_Reporter` tool to submit logs. Example:
```plaintext
Log_Reporter.write(
  repo_name="my_repo",
  branch_name="main",
  agent_name="subagent_frontend",
  agent_path="lead_architect/subagent_frontend",
  task_title="Analyze Codebase",
  log_type="issue",               // One of: start, end, activity, issue, decision
  log_title="API rate limit hit",
  log_description="Hit GitHub API rate limit (429). Retrying with exponential backoff.",
  trace_id="abc123",             // Only if provided
  tags="#api,#retry,#github"
)
```

---

### **🏗️ Additional Instructions for the Lead Architect Agent**

#### **🔹 When to Generate a New `trace_id`**
Generate a **new `trace_id`** (UUIDv4) in these scenarios:
1. **Starting a new task/workflow** that involves multiple steps or agents.
   - Example: "Analyze entire codebase" (spawns subagents for frontend/backend).
2. **Initiating a subtask** that is independent but part of a larger task.
   - Example: Spawning subagents to process different parts of a task in parallel.
3. **Starting a cross-cutting operation** (e.g., a multi-step API call chain or decision tree).
4. **Encountering a block/error** that requires a resolution workflow.
5. **Making a critical decision** that triggers follow-up actions.

#### **🔹 When to Propagate `trace_id`**
- **Pass the `trace_id`** to all subagents, tools, or operations that are part of the **same logical workflow**. 
- **Do NOT reuse a `trace_id`** for unrelated operations. Generate a new one instead.

#### **🔹 When to Use `parent_trace_id`**
- If a subtask/operation is **nested under a parent operation**, include the parent’s `trace_id` as `parent_trace_id`. 
  - Example:
    - Parent task: `trace_id = "abc123"` (Analyze Codebase).
    - Subtask: `trace_id = "def456"`, `parent_trace_id = "abc123"` (Analyze Frontend).

#### **🔹 Example Workflow for Lead Architect**
```plaintext
// 1. Start a task to analyze a codebase
trace_id = generate_uuid_v4()  // e.g., "abc123"
Log_Reporter.write(
  repo_name="my_repo",
  branch_name="main",
  agent_name="lead_architect",
  agent_path="lead_architect",
  task_title="Analyze Codebase",
  log_type="start",
  log_title="Began codebase analysis",
  trace_id="abc123"
)

// 2. Spawn subagents for frontend/backend analysis
// Pass trace_id="abc123" to both subagents

// 3. Subagent_frontend encounters an error
// Subagent_frontend logs:
Log_Reporter.write(
  repo_name="my_repo",
  branch_name="main",
  agent_name="subagent_frontend",
  agent_path="lead_architect/subagent_frontend",
  task_title="Analyze Codebase",
  log_type="issue",
  log_title="API rate limit hit",
  log_description="Hit GitHub API rate limit (429).",
  trace_id="abc123",  // Inherited from parent
  tags="#api,#retry"
)

// 4. Lead Architect generates a new trace_id for error resolution
new_trace_id = generate_uuid_v4()  // e.g., "def456"
Log_Reporter.write(
  repo_name="my_repo",
  branch_name="main",
  agent_name="lead_architect",
  agent_path="lead_architect",
  task_title="Analyze Codebase",
  log_type="decision",
  log_title="Switching to fallback DB",
  log_description="GitHub API unavailable. Using local cache.",
  trace_id="def456",
  parent_trace_id="abc123",  // Links to parent task
  tags="#fallback,#decision"
)

// 5. Complete the task
Log_Reporter.write(
  repo_name="my_repo",
  branch_name="main",
  agent_name="lead_architect",
  agent_path="lead_architect",
  task_title="Analyze Codebase",
  log_type="end",
  log_title="Analysis complete",
  trace_id="abc123"
)
```

---

## **🔹 4. Web App Requirements**

### **📂 File Structure**
```
agent_activity_monitor/
├── index.html          # Main HTML file
├── styles.css          # CSS styles
├── app.js              # Main JavaScript logic
├── components/         # Web Components
│   ├── log-tree.js     # Hierarchical tree view
│   ├── log-timeline.js # Timeline view
│   ├── log-chart.js    # Time breakdown chart
│   ├── log-heatmap.js   # Agent activity heatmap
│   └── log-details.js  # Log details panel
└── activity_logs.db    # SQLite database (user-provided)
```

---

### **🎨 UI Layout**
```
+-------------------------------------------------------------------------------------+
| [Agent Activity Monitor]                    [Repo: ▼] [Branch: ▼] [Agent: ▼]    |
+-------------------------------------------------------------------------------------+
| +-------------------------------------------+-------------------------------------+ |
| |                                           |                                     | |
| |  [Hierarchical Tree View]                |  [Timeline View]                     | |
| |  +--[my_repo]▶                            |  +-------------------------------+ | |
| |  |   +--[main]▶                          |  | subagent_frontend |■■■■■■ 40m | | |
| |  |   |   +--[Analyze Codebase]▶        |  | subagent_backend  |■■■■■■■■ 50m| | |
| |  |   |   |   +--[subagent_frontend]▶   |  +-------------------------------+ | |
| |  |   |   |   +--[subagent_backend]▶    |  [■=5m] [Zoom: ▼]                | | |
| |  |   |   +--[Generate Report]          |                                     | |
| |  |   |                                   |  [Time Breakdown Chart]             | |
| |  |   +--[dev]▶                            |  +-------------------------------+ | |
| |  |       +--[Fix Bug]                   |  | activity  | ████████ 70%        | | |
| |  |                                   |  | issue     | ████ 20%            | | |
| |  +-----------------------------------+  | decision  | ██ 10%              | | |
| |                                           +-------------------------------+ | |
| +-------------------------------------------+-------------------------------------+ |
| | [Logs List Panel] (Appears when clicking an item)                              | |
| | +-------------------------------+                                            | |
| | | Timestamp       | Type   | Title       | Duration |                       | |
| | +-------------------------------+                                            | |
| | | 14:20:00        | issue  | API rate limit | 10m      |                       | |
| | | 14:25:00        | activity| Retrying API   | 5m       |                       | |
| | | 14:30:00        | activity| Processed files| 15m      |                       | |
| | +-------------------------------+                                            | |
+-------------------------------------------------------------------------------------+
| [Log Details Panel] (Appears when double-clicking a log row)                       |
+-------------------------------------------------------------------------------------+
| Timestamp: 2026-07-30 14:20:00 | Log Type: issue | Title: API rate limit                |
|-------------------------------------------------------------------------------------|
| Description: Hit GitHub API rate limit (429). Retrying with exponential backoff.   |
| Agent: subagent_frontend | Trace ID: abc123 | Tags: #api,#retry,#github           |
| Performance Metrics: {"duration_ms": 600000}                                    |
+-------------------------------------------------------------------------------------+
```

---

### **📊 Visualizations (Detailed Specs)**

#### **1. Hierarchical Tree View**
- **Purpose:** Browse logs from **repo → branch → task → agent**. 
- **Data:** Group logs by `repo_name`, `branch_name`, `task_title`, `agent_name`.
- **Features:**
  - **Collapsible nodes** (click `▶` to expand/collapse).
  - **Color-coding** by time spent (darker = longer duration).
  - **Hover tooltips:** Show `total time` and `log count` for each node.
  - **Click a node:** Expands the **logs list panel** below the tree.

#### **2. Timeline View**
- **Purpose:** Visualize **when and how long** each agent/task took.
- **Type:** Gantt-like chart (horizontal bars = duration).
- **Data:** `timestamp`, `duration` (calculated from `start`/`end` logs), `agent_name`, `log_type`.
- **Features:**
  - **Parallel vs. sequential:** Overlapping bars = agents working in parallel.
  - **Color-coding:**
    - Green: `start`, `end`, `activity`
    - Red: `issue`
    - Blue: `decision`
  - **Hover tooltips:** Show log details (`title`, `description`, `timestamp`).
  - **Zoom:** Click and drag to zoom into a time range.
  - **Click a bar:** Expands the **logs list panel** below the timeline.

#### **3. Time Breakdown Chart**
- **Purpose:** Show **where time is spent** across agents/tasks.
- **Type:** Stacked bar chart (time per agent) or pie chart (time by `log_type`).
- **Data:** `duration` (from `start`/`end` logs), grouped by `agent_name` or `log_type`.
- **Features:**
  - **Click a bar/segment:** Expands the **logs list panel** for that agent/type.
  - **Hover tooltips:** Show exact time and percentage.

#### **4. Agent Activity Heatmap (Optional)**
- **Purpose:** Show **when agents are active** over time.
- **Type:** Calendar-like heatmap (rows = agents, columns = time).
- **Data:** `timestamp`, `agent_name`, `duration`.
- **Features:**
  - **Click a cell:** Expands the **logs list panel** for that agent/time.
  - **Hover tooltips:** Show agent name and time range.

---

### **🖱️ Interactions**

#### **1. Click Behavior (Single-Click)**
- **Action:** Click any **node (tree)**, **bar (timeline/chart)**, or **cell (heatmap)**.
- **Result:**
  - **Expands the logs list panel** directly below the visualization.
  - **Filters the logs list** to show only logs for the clicked item.
  - **Highlights** the clicked item (bold border + light background).
  - **Dims unrelated items** in the visualization (e.g., gray out other bars in the timeline).

#### **2. Double-Click Behavior**
- **Action:** Double-click a **row in the logs list panel**.
- **Result:**
  - **Expands the log details panel** on the right (or replaces the current details panel).
  - Shows **full log details** (all fields from the `logs` table).

#### **3. Logs List Panel**
- **Location:** Below the visualization (tree/timeline/chart/heatmap).
- **Content:**
  - Table with columns: `Timestamp | Type | Title | Duration | Agent`.
  - **Sortable** by clicking column headers.
  - **Search/filter box** at the top (filter by any column).

#### **4. Log Details Panel**
- **Location:** Right side of the screen (replaces previous details if open).
- **Content:** All fields from the log entry:
  - `timestamp`, `repo_name`, `branch_name`, `trace_id`, `parent_trace_id`, `task_title`, `agent_name`, `agent_path`, `log_type`, `log_title`, `log_description`, `log_level`, `status`, `priority`, `user_id`, `tags`, `error_details`, `resolved_by`, `resolution_time`, `performance_metrics`, `input_output_hash`.

#### **5. Filtering**
- **Global Filters (Top Bar):**
  - Dropdowns for `repo_name`, `branch_name`, `agent_name`, `log_type`, `user_id`.
  - Date range picker (start/end timestamps).
  - Text search box (searches `log_title` and `log_description`).
- **Behavior:** Applies to **all visualizations** (tree, timeline, charts, heatmap).

#### **6. Export**
- **Button:** "Export Logs" in the top bar.
- **Formats:** CSV or JSON.
- **Scope:** Exports **filtered logs** (respects current filters).

---

## **🔹 5. Technical Architecture**

### **📦 Frontend**
- **Tech Stack:** Plain HTML, CSS, JavaScript, Web Components.
- **SQLite in Browser:** Use [`sql.js`](https://sql.js.org/) to query the local `activity_logs.db` file.
- **File Access:**
  - Use the **File System Access API** (Chrome/Edge) or `<input type="file">` (fallback) to load `activity_logs.db`.
  - Example:
    ```html
    <input type="file" id="dbFileInput" accept=".db,.sqlite" />
    <script>
      document.getElementById('dbFileInput').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        const db = await initSqlJs({ location: 'sql-wasm.wasm' });
        const sqlDb = await db.open(new Uint8Array(await file.arrayBuffer()));
        // Query the database here
      });
    </script>
    ```
- **Web Components:**
  - Define custom elements for each visualization (e.g., `<log-tree>`, `<log-timeline>`).
  - Example:
    ```javascript
    class LogTree extends HTMLElement {
      connectedCallback() {
        this.innerHTML = `<div class="tree-view"></div>`;
        this.loadData();
      }
      async loadData() {
        // Query logs from SQLite and render tree
      }
    }
    customElements.define('log-tree', LogTree);
    ```

### **🗃️ Database**
- **Schema:** See [Section 2](#-2-data-model-sqlite-database).
- **Queries:**
  - **Tree View:** `SELECT * FROM logs GROUP BY repo_name, branch_name, task_title, agent_name ORDER BY timestamp`
  - **Timeline:** `SELECT * FROM logs WHERE repo_name = ? AND branch_name = ? ORDER BY timestamp`
  - **Time Breakdown:** `SELECT agent_name, SUM(duration) FROM logs GROUP BY agent_name`

### **📁 File Structure**
```
agent_activity_monitor/
├── index.html          # Main page
├── styles.css          # Global styles
├── app.js              # Main app logic (file loading, filtering)
├── components/
│   ├── log-tree.js     # Hierarchical tree view
│   ├── log-timeline.js # Timeline visualization
│   ├── log-chart.js    # Bar/pie charts
│   ├── log-heatmap.js   # Heatmap
│   └── log-details.js  # Log details panel
├── lib/
│   ├── sql-wasm.wasm   # SQL.js WASM file
│   └── sql.js          # SQL.js library
└── activity_logs.db    # User-provided SQLite DB
```

---

## **🔹 6. Non-Functional Requirements**
- **Retention:** Logs are retained until manually deleted via the **Log Maintenance Page**. 
- **Concurrency:** SQLite write conflicts are handled via **retry mechanisms** in the `Log_Reporter`.
- **Security:**
  - No login required (local use only).
  - All tables include `user_id` for future multi-user support.
  - **GDPR-compliant:** No sensitive data logged.
- **Performance:**
  - Asynchronous logging to avoid blocking agents.
  - Lightweight web app (optimized for local use).

---

## **🔹 7. Log Maintenance Page**
- **Purpose:** Allow users to **delete logs** based on filters.
- **Features:**
  - **Filters:** `repo_name`, `branch_name`, `date range` (start/end).
  - **Action:** "Delete Selected Logs" button (with confirmation dialog).
  - **Export:** "Export Filtered Logs" (CSV/JSON).

---

## **🔹 8. Implementation Notes**

### **📌 For the Developer**
1. **SQLite in the Browser:**
   - Use `sql.js` to load and query `activity_logs.db` client-side.
   - Example query:
     ```javascript
     const logs = sqlDb.exec(`
       SELECT * FROM logs 
       WHERE repo_name = 'my_repo' AND branch_name = 'main' 
       ORDER BY timestamp
     `);
     ```
2. **Time Calculations:**
   - For `duration`, calculate the difference between `start` and `end` logs for the same `task_title` + `agent_name` + `trace_id`.
3. **Web Components:**
   - Use **Shadow DOM** for encapsulation.
   - Dispatch **custom events** for interactions (e.g., `log-selected`).
4. **Styling:**
   - Use CSS Grid/Flexbox for layouts.
   - Color scheme:
     - `start`/`end`/`activity`: Green (`#4CAF50`)
     - `issue`: Red (`#F44336`)
     - `decision`: Blue (`#2196F3`)
5. **Performance:**
   - **Lazy-load** logs (e.g., fetch only the first 100 logs, load more on scroll).
   - **Debounce** search/filter inputs to avoid excessive queries.

### **📌 For the User**
1. **Setup:**
   - Place `activity_logs.db` in the same folder as `index.html`.
   - Open `index.html` in a modern browser (Chrome/Edge/Firefox).
2. **Usage:**
   - Select the `activity_logs.db` file when prompted.
   - Browse logs using the **tree view**, **timeline**, or **charts**. 
   - Click any item to see its logs, double-click a log to see details.

---

## **🔹 9. Example Agent Prompt**
Here’s how to **integrate the logging instructions** into an agent’s prompt:

---
```
You are an AI agent working on the [TASK_NAME] task in the [REPO_NAME] repository, branch [BRANCH_NAME].
Your agent name is [AGENT_NAME] and your full path is [AGENT_PATH].
You have access to a Log_Reporter tool to log your activities to a SQLite database.

### Logging Rules:
1. You MUST log the following:
   - At the start of any task/subtask/workflow: Use log_type="start".
   - At the end of any task/subtask/workflow: Use log_type="end".
   - For any normal operation or action: Use log_type="activity".
   - For any problem, block, error, or retry: Use log_type="issue".
   - For any choice, escalation, or resolution: Use log_type="decision".

2. For every log, include:
   - repo_name: "[REPO_NAME]"
   - branch_name: "[BRANCH_NAME]"
   - agent_name: "[AGENT_NAME]"
   - agent_path: "[AGENT_PATH]"
   - task_title: "[TASK_NAME]" (if applicable)
   - log_type: One of "start", "end", "activity", "issue", "decision"
   - log_title: A concise title (e.g., "API rate limit hit")
   - log_description: A detailed description (e.g., "Hit GitHub API rate limit (429). Retrying...")
   - trace_id: "[TRACE_ID]" (only if provided by a parent agent)
   - tags: Comma-separated tags (e.g., "#api,#retry")

3. Trace ID Rules:
   - If you are given a trace_id, use it for all related logs and pass it to subagents.
   - If you are NOT given a trace_id, do NOT generate one.

4. NEVER log sensitive data (API keys, PII, tokens, etc.).

5. Example log:
Log_Reporter.write(
  repo_name="[REPO_NAME]",
  branch_name="[BRANCH_NAME]",
  agent_name="[AGENT_NAME]",
  agent_path="[AGENT_PATH]",
  task_title="[TASK_NAME]",
  log_type="issue",
  log_title="API rate limit hit",
  log_description="Hit GitHub API rate limit (429). Retrying with exponential backoff.",
  trace_id="[TRACE_ID]",
  tags="#api,#retry"
)

### Special Rules for Lead Architect:
- Generate a new trace_id (UUIDv4) when:
  - Starting a new task/workflow involving multiple agents.
  - Initiating a subtask or cross-cutting operation.
  - Encountering a block/error requiring resolution.
  - Making a critical decision.
- Pass the trace_id to all subagents for the same operation.
- Use parent_trace_id to link nested operations to their parent.

Now begin your task.
```
