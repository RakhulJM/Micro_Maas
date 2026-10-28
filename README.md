# Micro_Maas

## Clone

```bash
git clone https://github.com/RakhulJM/Micro_Maas.git
cd Micro_Maas
```

## Install and run

```bash
npm install
npm run dev
```

## Build and check

```bash
npm run check
npm run build
npm run preview
```

## Project

Campus MaaS includes the campus map, pedestrian paths, gates, access rules, student routing, and campus services.

## User map

The `/user` page is the end-user campus map. It provides:

- Point A and Point B selection
- Walking route calculation on the active pedestrian network
- Campus gate access-rule checking
- Male/Female selection for gender-specific access rules
- No developer or map-editing controls

## Campus events

- `/events` lists upcoming campus activities and supports filtering by category, department, and date.
- Event listings can be saved in the current browser using local storage.
- `/events/:slug` provides event details, a downloadable `.ics` calendar invite, and a link to navigate to the venue on the campus map.
- Event venue navigation preselects the destination; the user selects Point A on the map to calculate a route.

### Demo-data limitation

The current `src/data/events.json` entries are sample data for UI development. They are labelled as demo listings and are not verified college announcements. No live official events feed or registration system is connected. Confirm event information through official campus channels before attending.
