# Five-Education Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a read-only “我的五育” dashboard backed by the authenticated Nanjing University five-education API.

**Architecture:** Add a focused Python client that exchanges the existing CASTGC for a temporary `ndwy.nju.edu.cn` session, normalizes `/dztml/wdwy`, and returns a safe response through one authenticated FastAPI route. Render that response in a dedicated React component with a dependency-free SVG radar chart and existing design tokens.

**Tech Stack:** Python 3.11+, FastAPI, urllib/cookiejar, React 19, TypeScript, SVG, CSS, pytest, Node test runner.

---

## File map

- Create `backend/app/five_education.py`: CAS exchange, allowlisted redirects, JSON validation, safe normalization.
- Create `tests/test_five_education.py`: parser, CAS host validation, zero and malformed data tests.
- Modify `backend/app/main.py`: instantiate the client and expose `/api/five-education/overview`.
- Create `frontend/src/five-education.ts`: deterministic radar geometry and display helpers.
- Create `frontend/tests/five-education.test.mjs`: radar and zero-threshold tests.
- Create `frontend/src/components/FiveEducation.tsx`: loading, error, empty, chart, module and detail UI.
- Modify `frontend/src/components/CampusServices.tsx`: replace the five-education placeholder.
- Modify `frontend/src/types.ts`: stable API types.
- Modify `frontend/src/styles.css`: responsive dashboard styles using current tokens.
- Modify `frontend/src/components/About.tsx`: privacy statement for five-education data.
- Modify `tests/test_frontend_controls.py`: integration and sensitive-field regression checks.
- Modify `docs/superpowers/specs/2026-07-16-five-education-dashboard-design.md`: mark approved.

### Task 1: Normalize real five-education data

**Files:**
- Create: `tests/test_five_education.py`
- Create: `backend/app/five_education.py`

- [ ] **Step 1: Write failing normalization tests**

Create a sanitized payload fixture containing `dbzt`, `njhds`, `njrs`, `mkList`, `dpj`, and `ypj`, then assert:

```python
result = normalize_five_education(PAYLOAD, fetched_at=1_700_000_000)
assert result["summary"] == {
    "totalActivities": 15,
    "laborTotalDuration": 8.5,
    "evaluatedCount": 3,
    "evaluationTotal": 4,
    "evaluationRate": 0.75,
}
assert result["dimensions"][0] == {
    "key": "moral", "label": "德", "personalCount": 2, "cohortAverage": 1.5,
}
assert result["growthModules"][2]["requiredDuration"] == 0
assert result["growthModules"][2]["achieved"] is False
assert "xh" not in repr(result)
assert "wdhdMe" not in repr(result)
```

Also test a positive zero-threshold duration is achieved, all-zero evaluation returns `0`, malformed `mksc` raises `FiveEducationError`, and unexpected redirect hosts are rejected.

- [ ] **Step 2: Run tests and verify RED**

Run: `.venv/bin/pytest -q tests/test_five_education.py`

Expected: collection fails because `backend.app.five_education` does not exist.

- [ ] **Step 3: Implement the normalized model**

Implement these public units:

```python
class FiveEducationError(RuntimeError):
    def __init__(self, message: str, *, auth_expired: bool = False): ...

def normalize_five_education(payload: dict[str, Any], *, fetched_at: int) -> dict[str, Any]: ...

class FiveEducationClient:
    async def overview(self, castgc: str) -> dict[str, Any]:
        return await asyncio.to_thread(self._overview, castgc)
```

Use `CookieJar`, a `CASTGC` cookie scoped to `/authserver`, and a redirect handler allowing only `authserver.nju.edu.cn` and `ndwy.nju.edu.cn`. Visit the fixed CAS login URL, require the final host to be `ndwy.nju.edu.cn`, then request `https://ndwy.nju.edu.cn/dztml/wdwy` with `Accept: application/json`.

Normalization rules:

```python
DIMENSIONS = (
    ("moral", "德", "dhds", "d"),
    ("intellectual", "智", "zhds", "z"),
    ("physical", "体", "thds", "t"),
    ("aesthetic", "美", "mhds", "m"),
    ("labor", "劳", "lhds", "l"),
)
cohort_average = round(cohort_total / cohort_size, 1) if cohort_size > 0 else 0
achieved = actual_duration > 0 and actual_duration >= required_duration
evaluation_rate = evaluated / total if total else 0
```

Never return `xh`, `wdhdMe`, upstream cookies, raw payload, raw HTML, or internal query strings.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `.venv/bin/pytest -q tests/test_five_education.py`

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/app/five_education.py tests/test_five_education.py
git commit -m "feat: add five-education data client"
```

### Task 2: Expose the authenticated overview API

**Files:**
- Modify: `backend/app/main.py`
- Modify: `tests/test_five_education.py`

- [ ] **Step 1: Write the failing route test**

Monkeypatch the client and create a valid session through the existing session store:

```python
async def fake_overview(castgc: str):
    assert castgc == "CASTGC-test"
    return {"fetchedAt": 1, "dimensions": [], "summary": {}}

monkeypatch.setattr(main.five_education, "overview", fake_overview)
response = client.get("/api/five-education/overview", cookies={SESSION_COOKIE: token})
assert response.status_code == 200
```

Add tests mapping `auth_expired=True` to 401 and ordinary upstream failures to 502.

- [ ] **Step 2: Run the route tests and verify RED**

Run: `.venv/bin/pytest -q tests/test_five_education.py -k route`

Expected: 404 because the route does not exist.

- [ ] **Step 3: Add client wiring and route**

In `backend/app/main.py`:

```python
five_education = FiveEducationClient()

@app.get("/api/five-education/overview")
async def five_education_overview(
    session: Annotated[Session, Depends(current_session)],
) -> dict[str, Any]:
    try:
        return await five_education.overview(session.castgc)
    except FiveEducationError as error:
        raise HTTPException(
            status_code=401 if error.auth_expired else 502,
            detail=str(error),
        ) from error
```

- [ ] **Step 4: Verify the route tests**

Run: `.venv/bin/pytest -q tests/test_five_education.py tests/test_security.py`

Expected: all tests pass and security tests remain green.

- [ ] **Step 5: Commit**

```bash
git add backend/app/main.py tests/test_five_education.py
git commit -m "feat: expose five-education overview API"
```

### Task 3: Build dependency-free radar helpers

**Files:**
- Create: `frontend/src/five-education.ts`
- Create: `frontend/tests/five-education.test.mjs`
- Modify: `frontend/src/types.ts`

- [ ] **Step 1: Write failing geometry tests**

```javascript
const values = [2, 4, 6, 8, 10]
const maxima = [10, 10, 10, 10, 10]
const points = radarPoints(values, maxima, 100, 100, 80)
assert.equal(points.length, 5)
assert.ok(points.every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y)))
assert.deepEqual(radarPoints([0, 0, 0, 0, 0], [0, 0, 0, 0, 0], 100, 100, 80), [
  { x: 100, y: 100 }, { x: 100, y: 100 }, { x: 100, y: 100 },
  { x: 100, y: 100 }, { x: 100, y: 100 },
])
assert.equal(moduleProgress({ actualDuration: 3, requiredDuration: 0 }), null)
```

- [ ] **Step 2: Run tests and verify RED**

Run: `npm run test:unit --prefix frontend`

Expected: module import failure for `five-education.ts`.

- [ ] **Step 3: Implement helpers and types**

Export `radarPoints`, `radarPolygon`, `moduleProgress`, and `formatDuration`. Clamp ratios to `[0, 1]`; when a maximum is zero return the center point; when the required duration is not positive return `null`.

Add `FiveEducationOverview`, `FiveEducationDimension`, and `FiveEducationGrowthModule` types matching the design document exactly.

- [ ] **Step 4: Verify frontend unit tests**

Run: `npm run test:unit --prefix frontend`

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/five-education.ts frontend/tests/five-education.test.mjs frontend/src/types.ts
git commit -m "feat: add five-education chart helpers"
```

### Task 4: Render the five-education dashboard

**Files:**
- Create: `frontend/src/components/FiveEducation.tsx`
- Modify: `frontend/src/components/CampusServices.tsx`
- Modify: `frontend/src/styles.css`
- Modify: `tests/test_frontend_controls.py`

- [ ] **Step 1: Write failing frontend integration assertions**

Extend `tests/test_frontend_controls.py` to require:

```python
assert "<FiveEducation onUnauthorized={onUnauthorized}" in campus
assert "api.cached<FiveEducationOverview>('/api/five-education/overview'" in component
assert 'aria-label="五育活动分布雷达图"' in component
assert "同年级平均" in component
assert "成长模块" in component
assert "劳育构成" in component
assert "updateSearchMks" not in component
assert "wdhdMe" not in component
```

- [ ] **Step 2: Run integration test and verify RED**

Run: `.venv/bin/pytest -q tests/test_frontend_controls.py -k five_education`

Expected: failure because `FiveEducation.tsx` is missing and the placeholder remains.

- [ ] **Step 3: Implement the component**

`FiveEducation` accepts `onUnauthorized`. On mount it calls:

```typescript
api.cached<FiveEducationOverview>('/api/five-education/overview', { ttl: 5 * 60_000 })
```

The refresh button repeats the call with `{ ttl: 5 * 60_000, force: true }`. A 401 calls `onUnauthorized`; other errors render the stable message and original-system link.

Render:

- three summary cells;
- accessible SVG radar polygons and a five-row numeric comparison list;
- growth module rows with progress only when `moduleProgress` is non-null;
- labor breakdown;
- read-only interest tags;
- evaluation count and rate;
- fetched time and fixed `https://ndwy.nju.edu.cn/dztml/#/` link.

Replace `ServicePreparation` under the `five` tab with `FiveEducation` and pass `onUnauthorized` from `Shell` through `CampusServices`.

- [ ] **Step 4: Add responsive CSS**

Use `.five-education-*` selectors, existing `--line`, `--purple`, `--muted`, `--radius`, and `--hairline-shadow`. Desktop uses a two-column chart/status layout; mobile stacks every region and must not create page-level horizontal scrolling. Use only existing fonts and no gradient chart fills.

- [ ] **Step 5: Verify targeted tests, lint, and build**

Run:

```bash
.venv/bin/pytest -q tests/test_frontend_controls.py
npm run test:unit --prefix frontend
npm run lint --prefix frontend
npm run build --prefix frontend
```

Expected: all commands pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/FiveEducation.tsx frontend/src/components/CampusServices.tsx frontend/src/styles.css tests/test_frontend_controls.py
git commit -m "feat: render five-education dashboard"
```

### Task 5: Privacy, live validation, and final verification

**Files:**
- Modify: `frontend/src/components/About.tsx`
- Modify: `docs/superpowers/specs/2026-07-16-five-education-dashboard-design.md`
- Modify: `README.md`

- [ ] **Step 1: Update privacy and local documentation**

State that five-education data is queried on demand, cached in browser memory for five minutes, and not written to the personal profile database. Mark the design status `已批准并实现` and list five-education overview under current local features without changing the published v1.1.7 release claim.

- [ ] **Step 2: Run full automated verification**

Run:

```bash
.venv/bin/pytest -q
npm run lint --prefix frontend
npm run test:unit --prefix frontend
npm run build --prefix frontend
git diff --check
```

Expected: zero failures and zero whitespace errors.

- [ ] **Step 3: Reload the persistent local service**

Restart only the `cn.nanyong.zhike.dev` LaunchAgent, confirm `127.0.0.1:8000/api/health`, and do not replace it with a conversation-bound foreground server.

- [ ] **Step 4: Browser QA with the real endpoint**

Verify `校园服务 → 五育系统` at 1440×1000 and 390×844:

- page identity and nonblank content;
- real activity values render without exposing student ID;
- radar and numeric list agree;
- refresh updates `fetchedAt`;
- no framework overlay or relevant console error;
- no clipping or horizontal overflow;
- original-system link is fixed HTTPS.

Capture screenshots outside the repository and inspect them against the approved visual companion design.

- [ ] **Step 5: Commit final local documentation**

```bash
git add frontend/src/components/About.tsx README.md docs/superpowers/specs/2026-07-16-five-education-dashboard-design.md
git commit -m "docs: document five-education privacy"
```

Do not push unless the user explicitly requests it in a later message.
