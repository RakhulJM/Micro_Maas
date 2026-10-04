# MaaS Prototype v1

> Python engineering prototype for multi-modal mobility routing and trip calculation.

## Overview

This repository contains a lightweight **Mobility-as-a-Service (MaaS) routing prototype** built around local mobility data.

The current implementation focuses on:

- Graph-based route optimization
- Travel-time optimization
- Cost optimization
- Geographic distance calculation
- Multi-leg journey calculation
- Fare calculation
- CO₂ estimation
- Local scooter availability data

The prototype currently uses **static local datasets** and simplified transport parameters.

---

## Repository Structure

```text
maas-prototype-v1/
│
├── ad_router.py       # Graph-based route optimization
├── router.py          # Geospatial multi-leg trip calculation
├── bus_stops.csv      # Transit stop coordinates
├── scooters.json      # Scooter availability data
└── README.md
```

---

## Engineering Implementation

### 1. Graph Routing — `ad_router.py`

`ad_router.py` builds a directed graph using **NetworkX**.

The graph contains these locations:

```text
KEC Hostel
     ↓
Campus Gate
     ↓
Perundurai BS
     ↓
Erode BS
     ↓
Railway Station
```

Each connection contains transport information such as:

```text
Mode
Travel Time
Cost
CO₂
```

The program uses NetworkX shortest-path routing with different edge weights.

### Optimization Modes

```text
cost → cheapest route
time → fastest route
```

The program runs both optimization cases and prints the selected route together with total time and cost.

> The current graph uses `nx.DiGraph`, so when multiple edges are added between the same two locations, the later edge replaces the earlier edge. The current implementation therefore represents one active edge per direction rather than a true multi-edge transport graph.

---

## 2. Geospatial Routing — `router.py`

`router.py` performs a fixed multi-stage journey calculation from the KEC Hostel area to Erode Railway Station.

The program loads transit coordinates from:

```text
bus_stops.csv
```

It uses:

- **Pandas** for reading the CSV
- **Geopy** for geographic distance calculation

### Journey Flow

```text
KEC Hostel
    |
    | Walk
    v
Campus Gate
    |
    | Auto / Shared Transport
    v
Perundurai Bus Stand
    |
    | City Bus
    v
Erode Bus Stand
    |
    | Bus
    v
Erode Railway Station
```

For each leg, the program calculates:

```text
Distance
Travel Time
Fare
CO₂
```

The final output contains:

```text
Total Travel Time
Unified MaaS Fare
Total CO₂
CO₂ saved compared with car travel
```

---

## 3. Transit Dataset — `bus_stops.csv`

The current dataset contains four transit locations:

| ID | Stop |
|---|---|
| T1 | Kongu Campus Gate |
| T2 | Perundurai Bus Stand |
| T3 | Erode Bus Stand |
| T4 | Erode Railway Station |

CSV structure:

```text
stop_id,stop_name,lat,lon
```

Example:

```text
T1,Kongu Campus Gate,11.2741,77.6075
```

---

## 4. Scooter Dataset — `scooters.json`

`scooters.json` stores prototype scooter availability information.

Each scooter contains:

```text
id
lat
lon
battery
```

Example:

```json
{
  "id": "S-101",
  "lat": 11.2730,
  "lon": 77.6080,
  "battery": 85
}
```

The scooter dataset is currently stored as local mobility data and is not yet integrated into the routing calculations.

---

## Calculation Model

### Transport Speeds

`router.py` uses fixed prototype speeds:

| Mode | Speed |
|---|---:|
| Walking | 0.08 km/min |
| Auto | 0.40 km/min |
| Bus | 0.50 km/min |

Travel time is calculated as:

```text
time = distance / speed
```

### CO₂ Factors

The prototype uses fixed values:

| Mode | CO₂ |
|---|---:|
| Walking | 0 g/km |
| Auto | 80 g/km |
| Bus | 50 g/km |
| Car comparison | 192 g/km |

These are prototype values used for engineering comparison.

---

## Technologies

```text
Python
Pandas
NetworkX
Geopy
CSV
JSON
```

### Libraries

```text
pandas
networkx
geopy
```

---

## Program Flow

```text
                LOCAL DATA
                    |
          +---------+---------+
          |                   |
          v                   v
    bus_stops.csv        scooters.json
          |
          v
   Mobility Coordinates
          |
          v
   Routing / Calculation
          |
      +---+---+
      |       |
      v       v
   Time     Cost
      |       |
      +---+---+
          |
          v
      Trip Result
```

---

## Running the Prototype

Install the required libraries:

```bash
pip install pandas networkx geopy
```

Run the graph router:

```bash
python3 ad_router.py
```

Run the geospatial routing demo:

```bash
python3 router.py
```

---

## Current Engineering Scope

Implemented:

```text
✓ Directed mobility graph
✓ Shortest-path routing
✓ Time-based optimization
✓ Cost-based optimization
✓ CSV transit data
✓ Geographic distance calculation
✓ Multi-leg journey calculation
✓ Fare calculation
✓ CO₂ estimation
✓ Scooter data storage
```

Not implemented in the current repository:

```text
✗ Live transit APIs
✗ Real-time vehicle tracking
✗ Traffic integration
✗ Dynamic re-routing
✗ Database backend
✗ Booking
✗ Payment
✗ Authentication
✗ Machine-learning prediction
✗ Web/mobile interface
```

---

## Prototype Extension

The existing routing layer can later be extended with additional mobility data and dynamic transport information.

```text
Static Mobility Data
        ↓
Routing Graph
        ↓
Route Optimization
        ↓
Real-Time Mobility Data
        ↓
Dynamic Routing
        ↓
MaaS Application
```

---

## Project Status

**Engineering Prototype — In Development**

The current repository is focused on the **mobility-data and routing layer** of the MaaS concept.
