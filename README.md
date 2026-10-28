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

## Campus calendar

- `/events` opens with a moving event carousel and a map preview drawn from the same local campus GeoJSON used by CampusMaaS.
- The month grid highlights campus events and personal plans; selecting a day opens its agenda.
- Students can create, edit, and delete personal plans. Plans are stored in the current browser with local storage and do not sync across devices.
- If the current month has no upcoming events or plans, the calendar opens on the next month containing an event. The **Today** button returns to the current date.
- `/events/:slug` provides event details, a downloadable `.ics` calendar invite, optional registration/source links, and a link to navigate to the venue on the campus map.
- When an event has a registration or source URL, the carousel links directly to it. Otherwise, it opens the event details page.
- Event venue navigation preselects the destination; the user selects Point A on the map to calculate a route.

### Demo-data limitation

The current `src/data/events.json` entries are sample data for UI development. They are labelled as demo listings and are not verified college announcements. No live official events feed or registration system is connected. Confirm event information through official campus channels before attending.
