# CampusMaaS

**Micro_Maas** is a campus-focused **Mobility-as-a-Service (MaaS)** prototype for planning and coordinating end-to-end journeys inside a college environment.

Instead of treating navigation, food, printing, schedules, and campus events as separate utilities, CampusMaaS combines them into one time-aware mobility experience.

## Current Prototype

The repository now includes an **Astro 5 dashboard** with an interactive map and a first-pass journey view.

### Dashboard

- Interactive Leaflet map with OpenStreetMap tiles
- Campus location markers
- Sample journey route
- Hostel → Print Center → Canteen → Academic Block flow
- Journey timeline with departure and arrival times
- "Use my location" support
- Map zoom controls
- Responsive desktop and mobile UI
- Foundation for integrating the real college map data

### Existing MaaS logic

The original Python prototype is preserved and includes:

- Graph-based route modelling with NetworkX
- Route calculation with Dijkstra's shortest-path algorithm
- Bus-stop data in CSV format
- Scooter availability data in JSON format
- Travel time, fare, and CO₂ comparison logic

## Project Direction

CampusMaaS is designed around the idea:

```
Current Location
      ↓
Daily Schedule
      ↓
Required Tasks / Services
      ↓
Mobility Modes
      ↓
Route & Time Optimizer
      ↓
Complete Journey
      ↓
Unified Payment
```

A student's trip can therefore become:

```
Hostel
  ↓
Print assignment
  ↓
Collect pre-ordered food
  ↓
Attend event
  ↓
Reach classroom on time
```

The planner can later account for:

- Walking
- Campus shuttle/bus
- Bicycle or other campus mobility
- Printing
- Food pickup
- Academic timetable
- Events and special-day schedules
- User-defined activities
- Service waiting times
- Accessibility requirements
- Unified campus payments

## Tech Stack

### Frontend

- **Astro 5**
- **TypeScript**
- **Leaflet**
- **OpenStreetMap**

### Existing routing prototype

- **Python**
- **Pandas**
- **NetworkX**
- **Geopy**

## Repository Structure

```
Micro_Maas/
├── src/
│   ├── layouts/
│   │   └── MainLayout.astro
│   ├── pages/
│   │   └── index.astro
│   └── styles/
│       └── global.css
│
├── public/
│   └── favicon.svg
│
├── ad_router.py
├── router.py
├── bus_stops.csv
├── scooters.json
│
├── astro.config.mjs
├── package.json
├── tsconfig.json
└── README.md
```

## Run the Astro Dashboard

Clone the repository:

```bash
git clone https://github.com/ATITYARAM/Micro_Maas.git
cd Micro_Maas
```

Install frontend dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Then open the local URL printed by Astro.

Build for production:

```bash
npm run build
```

Preview the production build:

```bash
npm run preview
```

## Run the Python Routing Prototype

Create a virtual environment:

```bash
python3 -m venv .venv
source .venv/bin/activate
```

Windows:

```bash
.venv\Scripts\activate
```

Install dependencies:

```bash
pip install pandas networkx geopy
```

Run the graph-based MaaS demo:

```bash
python3 ad_router.py
```

Run the route calculator:

```bash
python3 router.py
```

Deactivate the environment:

```bash
deactivate
```

## College Map Integration

The dashboard currently uses sample campus coordinates so the interface can be developed before the final map data is integrated.

The next map-data stage is to add the real college geometry, preferably as:

- **GeoJSON** for buildings, paths, and points
- **KML/KMZ** when sourced from Google Earth
- Coordinate data for important campus locations

Recommended model:

```
Buildings  → Polygon
Roads/Paths → LineString
Locations   → Point
```

These map objects will later feed the mobility and routing engine.

## Planned Architecture

```
                    CampusMaaS UI
                         │
                         ▼
                    MaaS API Layer
                         │
        ┌────────────────┼────────────────┐
        ▼                ▼                ▼
   Campus Map        Schedule         Services
        │                │                │
        └────────────────┼────────────────┘
                         ▼
                 Mobility Engine
                         │
                         ▼
                  Route Optimizer
                         │
              ┌──────────┼──────────┐
              ▼          ▼          ▼
           Walking     Shuttle    Bicycle
              │          │          │
              └──────────┼──────────┘
                         ▼
                 Journey + Payment
```

## Evaluation Goals

The final prototype will be evaluated using campus field scenarios and/or suitable synthetic datasets for:

- **Accuracy** — route and arrival-time prediction
- **Reliability** — behaviour when services or routes change
- **Cost-effectiveness** — travel and service costs
- **Scalability** — increasing users, locations, and mobility modes
- **Social impact** — reduced waiting, missed activities, and navigation friction
- **Industrial potential** — adaptability to universities, corporate campuses, hospitals, and other large managed environments

## Project Status

**Current:** Astro dashboard + interactive map foundation + existing Python MaaS routing prototype.

**Next:** Integrate the actual college map, map-aware campus routing, real campus locations/services, timetable-aware trip planning, and unified payment flow.

## License

This project is currently a prototype for development and evaluation.
