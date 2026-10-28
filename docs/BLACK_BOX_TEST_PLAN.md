# CampusMaaS Black-Box Test Plan

## Scope

This plan validates user-visible behaviour and business rules without relying on implementation details. Run it against the local development server and the intended deployment environment. Do not mark a scenario passed until the expected result is observed.

## Test data and policy safety

- Use only campus-approved gate schedules and access policies.
- The current configuration has a generic **students** policy for Gate 06 and Gate 09. It does not yet define separate **boys** and **girls** policies. The app should therefore apply generic student policies to both groups; it must not imply that different gender-specific rules exist.
- Do not invent or assume gender-based restrictions. Add subgroup-specific rules only when confirmed by the college.

## A. Map and route planning

| ID | Scenario | Expected result |
|---|---|---|
| MAP-01 | Open the user map with all required map files available | Map renders and the user can interact with it. |
| MAP-02 | Choose two points connected by the pedestrian network | A continuous route is displayed with plausible distance and duration. |
| MAP-03 | Choose a point far from any routable path | The app gives a clear recovery message or safe route result; it must not silently invent a path. |
| MAP-04 | Choose identical start and destination points | The app handles the zero-length trip gracefully. |
| MAP-05 | Choose points on disconnected path components | The app reports no valid route instead of drawing a misleading connection. |
| MAP-06 | Reload after map data changes | Updated data loads consistently without stale or duplicate layers. |

## B. Gate and access policies

| ID | Scenario | Expected result |
|---|---|---|
| ACCESS-01 | Select Male, then route with only generic student policies configured | Generic student rules apply. |
| ACCESS-02 | Select Female, then route with only generic student policies configured | The same applicable generic student rules apply. |
| ACCESS-03 | Add an approved boys-specific rule in a test environment | It affects the boys group without unintentionally changing girls or other groups. |
| ACCESS-04 | Add an approved girls-specific rule in a test environment | It affects the girls group without unintentionally changing boys or other groups. |
| ACCESS-05 | Route through Gate 09 outside all configured windows | Gate 09 is not recommended as an available gate for a student. |
| ACCESS-06 | Route through Gate 09 inside a configured window | The gate is eligible, subject to all other constraints. |
| ACCESS-07 | Test exactly at the opening and closing minute | Boundary behaviour matches the college-approved interpretation of inclusive/exclusive times. |
| ACCESS-08 | Apply a path denial to a path in the route | The route avoids that path or reports that no valid route exists. |
| ACCESS-09 | Apply a directional in or out rule | Only the relevant entry/exit movement is restricted; verify this explicitly before relying on directional policies. |
| ACCESS-10 | Disable a policy | The disabled policy has no effect. |
| ACCESS-11 | Two active policies conflict | The result follows a documented priority/conflict rule and never exposes a prohibited route. |

## C. Food and printing services

| ID | Scenario | Expected result |
|---|---|---|
| SERVICE-01 | Open the services panel | Enabled vendor categories and options load with meaningful availability status. |
| SERVICE-02 | Open each food option | The matching menu loads; no menu is missing or shared accidentally with another service. |
| SERVICE-03 | Submit an empty food order | The order is rejected with a clear message. |
| SERVICE-04 | Submit a valid order | The order has the correct items, quantities, prices, total, and service reference. |
| SERVICE-05 | Submit an unavailable or disabled option | The order is rejected. |
| SERVICE-06 | Set a vendor offline or busy | The user sees the correct status and cannot place an order where the business rules disallow it. |
| SERVICE-07 | Reload order history | The order remains available and its status is consistent. |
| SERVICE-08 | Change an order from placed to preparing to ready | Only permitted status transitions succeed. |
| SERVICE-09 | Attempt completion before ready | The transition is rejected. |
| SERVICE-10 | Try to confirm collection as a different user | The request is rejected. |
| SERVICE-11 | Cancel an order in each status | Only allowed cancellations succeed and the user sees the final state. |

## D. Persistence, privacy, and deployment

| ID | Scenario | Expected result |
|---|---|---|
| OPS-01 | Restart the local server after creating an order | Expected order persistence is confirmed. |
| OPS-02 | Run the production build and preview it | Map, service pages, and navigation render without relying on development-only endpoints. |
| OPS-03 | Call data-changing endpoints without required input | The request fails safely with a clear error. |
| OPS-04 | Open public map assets | Private order records and user identifiers are not exposed. |
| OPS-05 | Submit malformed JSON or invalid policy values | The request is rejected without corrupting existing data. |
| OPS-06 | Use the app on a narrow viewport and keyboard-only | Main navigation, gender/group selection, ordering, and errors remain usable. |

## Exit criteria

- All critical route, access, and order scenarios pass in the target environment.
- Any failed scenario is recorded with steps, expected result, actual result, and environment.
- The production build is tested separately from the development server.
- Campus-approved policy owners confirm gate times and subgroup-specific rules.
- No scenario is reported as passed based only on source-code inspection.
