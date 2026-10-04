# MaaS Prototype v1

## Files

```text
router.py
ad_router.py
bus_stops.csv
scooters.json
```

## `ad_router.py`

Graph-based routing using NetworkX.

Uses:

```text
Dijkstra shortest path
```

Optimization:

```text
time
cost
```

Nodes:

```text
KEC Hostel
Campus Gate
Perundurai BS
Erode BS
Railway Station
```

Edge data:

```text
mode
time
cost
co2
```

Run:

```bash
python3 ad_router.py
```

---

## `router.py`

Fixed multi-leg Erode route calculation.

Uses:

```text
Pandas
Geopy
```

Flow:

```text
KEC Hostel
→ Campus Gate
→ Perundurai BS
→ Erode BS
→ Erode Railway Station
```

Calculates:

```text
distance
time
fare
CO2
```

Run:

```bash
python3 router.py
```

---

## `bus_stops.csv`

Transit coordinate data.

```text
stop_id
stop_name
lat
lon
```

Current stops:

```text
T1  Kongu Campus Gate
T2  Perundurai Bus Stand
T3  Erode Bus Stand
T4  Erode Railway Station
```

---

## `scooters.json`

Local scooter data.

```text
id
lat
lon
battery
```

Currently not connected to the routing logic.

---

## Dependencies

```bash
pip install pandas networkx geopy
```

## Main Engineering

```text
CSV / JSON
   ↓
Mobility Data
   ↓
Graph / Coordinates
   ↓
Routing
   ↓
Time + Cost + CO2
   ↓
Trip Result
```
