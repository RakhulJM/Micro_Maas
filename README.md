# Predictive & Risk-Aware Mobility-as-a-Service

> A unified Mobility-as-a-Service platform for reliable, intelligent, and multi-modal journey planning.

## Overview

**Mobility-as-a-Service (MaaS)** integrates multiple transportation modes into a single digital platform, enabling users to plan and manage an entire journey through one application.

This project aims to develop a MaaS platform that integrates transport modes such as **bus, metro/train, cab/auto, cycling, and walking** while going beyond conventional route planning.

The proposed system focuses on **journey reliability and risk-aware decision making** by considering factors such as travel time, cost, transfers, delays, uncertainty, and arrival deadlines.

Instead of simply asking:

> *"What is the fastest route?"*

the system aims to answer:

> **"Which journey is most likely to get me to my destination on time?"**

---

## Problem Statement

Current transportation services are often distributed across multiple platforms. Users may need separate applications for route planning, transport information, ticket booking, and payments.

Existing journey planners primarily focus on parameters such as **shortest distance, estimated travel time, or cost**, while uncertainty caused by delays, congestion, and transfer failures can significantly affect the actual journey.

This project aims to develop a unified MaaS platform that integrates multiple transport modes and provides **reliability-aware journey recommendations** based on predicted travel conditions and user requirements.

---

## Proposed Approach

The system will:

* Integrate multiple transportation modes into a common mobility model.
* Provide end-to-end multi-modal journey planning.
* Model travel time, cost, transfers, and transportation uncertainty.
* Estimate journey and transfer risks.
* Recommend routes based on user preferences and arrival requirements.
* Adapt recommendations when disruptions occur.
* Provide unified booking and payment capabilities.
* Evaluate journey reliability against conventional route-planning approaches.

---

## Research Direction

The primary research direction is **predictive and risk-aware multi-modal journey planning**.

A journey is represented as a sequence of transportation segments:

```text
Source
  |
  v
Bus
  |
  v
Metro
  |
  v
Walking
  |
  v
Destination
```

Each segment can have different:

* Travel time
* Cost
* Delay probability
* Transfer time
* Reliability
* Environmental impact

The system uses these factors to evaluate possible journey outcomes and recommend an appropriate route.

---

## System Architecture

```text
                  USER
                   |
                   v
          +-------------------+
          |   MaaS Frontend   |
          +---------+---------+
                    |
                    v
          +-------------------+
          |     API Layer     |
          +---------+---------+
                    |
        +-----------+-----------+
        |           |           |
        v           v           v
     Journey      Risk       Booking
     Planner      Engine      Service
        |           |           |
        +-----------+-----------+
                    |
                    v
          +-------------------+
          |   Mobility Data   |
          +---------+---------+
                    |
        +-----------+-----------+
        |           |           |
        v           v           v
      Bus         Metro        Cab
```

---

## Planned Modules

### 1. Mobility Data Management

Management and normalization of transportation routes, stops, schedules, fares, and availability.

### 2. Multi-Modal Journey Planner

Generates possible journeys using multiple transportation modes.

### 3. Route Optimization Engine

Evaluates routes based on travel time, cost, transfers, and other constraints.

### 4. Journey Risk Engine

Estimates the probability of delays, missed transfers, and arrival-time uncertainty.

### 5. Recommendation Engine

Ranks available journeys according to user preferences and reliability.

### 6. Dynamic Re-Routing

Generates alternative routes when disruptions or unexpected delays occur.

### 7. Booking and Unified Payment

Provides a single journey booking and payment experience across supported transport modes.

### 8. Evaluation Module

Measures route accuracy, reliability, response time, cost-effectiveness, and scalability.

---

## Technology Stack

### Frontend

* React
* Tailwind CSS

### Backend

* Node.js
* Express.js

### Data and Database

* PostgreSQL
* Python
* Pandas

### Algorithms

* Dijkstra / A*
* Multi-Criteria Route Optimization
* Travel-Time Prediction
* Risk Estimation

### APIs and Data Sources

* GTFS / public transportation datasets
* Maps and geolocation APIs
* Weather data
* Simulated real-time transportation data

### Development

* Git
* GitHub
* REST APIs
* Docker

---

## Data Model

The initial mobility dataset will contain information such as:

```text
Transport Mode
     |
     +-- Stops
     +-- Routes
     +-- Schedules
     +-- Fares
     +-- Travel Times
     +-- Delay Information
```

The data will be normalized into a common representation so that different transportation modes can be processed by the same journey-planning engine.

---

## Research and Innovation

The project is being developed with a focus on identifying a **research gap in existing MaaS and multi-modal transportation systems**.

The investigation will study:

* Existing MaaS platforms
* Multi-modal route optimization
* Travel-time prediction
* Transportation uncertainty
* Transfer-risk modelling
* Arrival-deadline planning
* Dynamic re-routing
* Existing patents and prior art

The final technical contribution will be refined based on findings from the literature and prior-art study.

> The project does not claim patent novelty until a formal prior-art and patentability analysis has been completed.

---

## Current Progress

### Phase 1 — Research and Problem Definition

* [x] Define MaaS problem
* [x] Identify project scope
* [x] Define initial research direction
* [ ] Literature survey
* [ ] Existing-system comparison
* [ ] Patent/prior-art investigation
* [ ] Finalize research gap

### Phase 2 — 30% Prototype

* [ ] Mobility dataset
* [ ] PostgreSQL database
* [ ] Backend APIs
* [ ] Mobility graph
* [ ] Basic route engine
* [ ] Initial MaaS interface
* [ ] Route comparison

### Phase 3 — Intelligent MaaS

* [ ] Travel-time prediction
* [ ] Journey-risk estimation
* [ ] Multi-criteria optimization
* [ ] Dynamic re-routing

### Phase 4 — MaaS Services

* [ ] Journey booking
* [ ] Unified payment
* [ ] Digital journey pass
* [ ] Real-time notifications

### Phase 5 — Evaluation

* [ ] Accuracy testing
* [ ] Reliability testing
* [ ] Cost-effectiveness analysis
* [ ] Scalability testing
* [ ] Environmental impact analysis
* [ ] Social and industrial impact analysis

---

## Evaluation Metrics

| Metric                   | Purpose                                          |
| ------------------------ | ------------------------------------------------ |
| Route Accuracy           | Correctness of recommended routes                |
| Arrival Prediction Error | Difference between predicted and actual arrival  |
| Deadline Success Rate    | Probability of reaching before the required time |
| Transfer Failure Rate    | Frequency of missed transfers                    |
| Response Time            | System performance                               |
| Cost                     | Economic efficiency                              |
| CO₂ Impact               | Environmental efficiency                         |
| Scalability              | Performance under increasing users and data      |

---

## Sustainable Development Goals

### SDG 9 — Industry, Innovation and Infrastructure

Promotes digital infrastructure and intelligent transportation systems.

### SDG 11 — Sustainable Cities and Communities

Supports efficient, connected, and accessible urban mobility.

### SDG 13 — Climate Action

Encourages efficient use of public and shared transportation and enables comparison of environmental impact.

---

## Project Roadmap

```text
Problem Definition
       |
       v
Literature Survey
       |
       v
Existing System Analysis
       |
       v
Patent / Prior-Art Study
       |
       v
Research Gap
       |
       v
Technical Design
       |
       v
Mobility Dataset
       |
       v
Route Engine
       |
       v
MaaS Interface
       |
       v
Risk and Prediction Engine
       |
       v
Dynamic Re-Routing
       |
       v
Booking and Payment
       |
       v
Testing and Evaluation
       |
       v
Deployment
```

---

## Project Team

**Multidisciplinary Project — III Year, V Semester**

**Department of Computer Science and Engineering**
**Kongu Engineering College**

### Team Members

* Rakhul M
* Kaviamudhan K S

### Supervisor

Ms. Geetha M

---

## Project Status

**Currently under development**

This repository will be progressively updated as the research, architecture, implementation, testing, and evaluation phases are completed.

---

## License

To be decided based on the project's research and intellectual-property requirements.
