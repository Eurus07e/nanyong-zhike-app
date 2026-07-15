# Five Education Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refine the existing five-education dashboard and add a secure, detailed, read-only view of the authenticated student's current-term activities.

**Architecture:** Extend `FiveEducationClient` with a separately testable activity normalizer and authenticated activity loader. Expose a dedicated API, then keep filtering/sorting and detail disclosure in the React page so interaction stays instant and lightweight.

**Tech Stack:** FastAPI, urllib/CookieJar, React 19, TypeScript, plain CSS, Lucide icons, Node test runner, pytest.

---

### Task 1: Activity contract and normalization

**Files:**
- Modify: `tests/test_five_education.py`
- Modify: `backend/app/five_education.py`

- [ ] Add failing tests for current-period metadata, detailed activity field mapping, null-safe dates, and exclusion of `xhgh`, `name`, `wxh`, CASTGC and raw nested objects.
- [ ] Run `.venv/bin/pytest tests/test_five_education.py -q` and confirm the new tests fail because the normalizer is absent.
- [ ] Implement `normalize_five_education_activities()` with an explicit response whitelist and stable Chinese status labels.
- [ ] Re-run the focused tests and commit the passing contract.

### Task 2: Authenticated activity loading and API

**Files:**
- Modify: `backend/app/five_education.py`
- Modify: `backend/app/main.py`
- Modify: `tests/test_five_education.py`

- [ ] Add failing tests for menu discovery from `/ctx`, current-period extraction, `.me` scoping, activity request parameters, 401 handling and 502 mapping.
- [ ] Run the focused tests and confirm failure.
- [ ] Add `FiveEducationClient.activities()` using the existing temporary CookieJar, Base64-decoded menu metadata, the legacy current-period page and the read-only `ajaxList` endpoint.
- [ ] Add `GET /api/five-education/activities` with the same authentication/error policy as the overview endpoint.
- [ ] Re-run focused backend tests and commit.

### Task 3: Frontend activity helpers and page structure

**Files:**
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/five-education.ts`
- Modify: `frontend/tests/five-education.test.mjs`
- Modify: `frontend/src/components/FiveEducation.tsx`
- Modify: `tests/test_frontend_controls.py`

- [ ] Add failing unit tests for keyword/status filtering, chronological sorting and invalid-date fallback; add static assertions for source placement, one external link, no interest block and activity disclosure.
- [ ] Run frontend unit and focused pytest tests and confirm failure.
- [ ] Add the activity response types and pure filter/sort/date helpers.
- [ ] Refactor the page header source placement, enlarge the radar area, retain decimal averages, remove interests and the duplicate footer link.
- [ ] Add the current-term activity table/cards, controls and expandable detail rows.
- [ ] Re-run focused tests and commit.

### Task 4: Guide image and page-scoped visual system

**Files:**
- Create: `frontend/public/five-education-labor-guide.png`
- Modify: `frontend/src/components/FiveEducation.tsx`
- Modify: `frontend/src/styles.css`

- [ ] Copy the supplied guide image without recompression and verify its checksum and dimensions.
- [ ] Add a keyboard-accessible modal opened from the labor section, with one icon/text command and no inert controls.
- [ ] Replace only `.five-*` styles with the approved restrained purple/gray hierarchy; increase small typography, enlarge the left radar, tighten the right values table and keep responsive layouts stable.
- [ ] Run lint, unit tests and production build, then commit.

### Task 5: Real-data and visual verification

**Files:**
- Modify: `README.md`
- Modify: `交接.md` (gitignored local handoff)

- [ ] Reload the existing LaunchAgent without stopping its persistent configuration and verify `/api/health`.
- [ ] Verify the real activities API returns the current 8 records and that its serialized response contains no user identifiers or authentication material.
- [ ] In the browser verify desktop and 390x844 layouts, filters, sorting, detail expansion, guide modal, refresh, source placement and the absence of a duplicate external link.
- [ ] Compare implementation screenshots to the supplied reference images and record the fidelity ledger.
- [ ] Update local documentation, run full pytest, frontend unit tests, lint, build and `git diff --check`, then keep the branch local without pushing.
