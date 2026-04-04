# sysarcsim

A browser-based game where you play as a system architect. Build system architectures by connecting components to satisfy user demand.

## Tech Stack

- **Vanilla JS + HTML5 Canvas** — no framework, no build step, runs directly in the browser
- Zero dependencies

## Interface

| Area | Description |
|------|-------------|
| **Desk** | Canvas surface where you build your architecture |
| **Sidebar** | Catalog of available system elements |
| **Controls** | Bottom panel with basic game controls |

## How to Play

1. A **User Demand** element is preset on the desk — it defines what the user needs (e.g. a website).
2. Drag elements from the sidebar onto the desk.
3. Connect an element's **output** to another element's **input** by drawing a line between them.
4. Connections are type-checked — only matching types can be connected (e.g. `SQL` output → `SQL` input).
5. Satisfy all inputs on the User Demand element to **win the level**.

## Game Rules

- Each element has typed inputs and outputs.
- An output can only connect to an input of the same type.
- The level is complete when all demand inputs are satisfied by a valid chain of connected elements.
- Preset elements (User Demand) cannot be moved or removed.

## Latency

Each element has an optional `latency` value (default: `1`). The **latency counter** on a consumer shows the critical-path sum of all upstream elements — click it to highlight that path in blue.

When a demand defines `requiredLatency`, the counter shows `current/limit` and pulses red if the limit is exceeded. The level cannot be won until the path is short enough.

## Level 1 Example

**Goal:** satisfy a `WebSite` demand.

**Preset element:**
- `User Demand` — input: `WebSite`

**Available elements:**

| Element | Outputs | Inputs |
|---------|---------|--------|
| Web Server | `WebSite` | `SQL`, `Storage` |
| Database | `SQL` | `Storage` |
| Storage | `Storage` | — |

**Solution:** `Storage` → `Database` → `Web Server` → `User Demand`
