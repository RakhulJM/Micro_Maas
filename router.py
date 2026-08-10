import pandas as pd
from geopy.distance import geodesic

# ==========================================
# 1. LOAD LOCAL DATA
# ==========================================
transit_nodes = pd.read_csv('bus_stops.csv')

# Speeds (km per minute)
WALK_SPEED = 0.08    # ~4.8 km/h
AUTO_SPEED = 0.40    # ~24 km/h (Shared Auto/Traffic)
BUS_SPEED = 0.50     # ~30 km/h (City Bus)

# CO2 Emissions (Grams per km)
CO2_WALK = 0
CO2_AUTO = 80        # Shared auto footprint
CO2_BUS = 50         # Shared bus footprint
CO2_CAR = 192        # Solo driving (for comparison)

# ==========================================
# 2. ROUTING ALGORITHM (MULTI-HOP DEMO)
# ==========================================
def run_presentation_demo():
    print("\n" + "="*50)
    print("   MaaS UNIFIED ROUTING ENGINE (PILOT: ERODE)")
    print("="*50)
    
    # Define the student's exact starting point (Hostel)
    hostel_loc = (11.2725, 77.6070)
    print(f"Calculating multi-hop route from KEC Hostel to Erode Railway Station...\n")
    
    total_time = 0
    total_cost = 0
    total_co2 = 0
    total_car_co2 = 0
    
    # Fetch nodes from the CSV
    gate = transit_nodes.iloc[0] # T1: Kongu Campus Gate
    p_stand = transit_nodes.iloc[1] # T2: Perundurai Bus Stand
    e_stand = transit_nodes.iloc[2] # T3: Erode Bus Stand
    railway = transit_nodes.iloc[3] # T4: Erode Railway Station
    
    # --- LEG 1: Walk (Hostel to Gate) ---
    dist_1 = geodesic(hostel_loc, (gate['lat'], gate['lon'])).km
    time_1 = dist_1 / WALK_SPEED
    total_time += time_1
    total_car_co2 += (dist_1 * CO2_CAR)
    print(f"Leg 1 (Walk): Walk {dist_1:.2f} km to {gate['stop_name']}.")
    print(f"   -> Time: {time_1:.0f} mins | Fare: Rs 0 | CO2: 0g")

    # --- LEG 2: Auto/Shared Van (Gate to Perundurai BS) ---
    dist_2 = geodesic((gate['lat'], gate['lon']), (p_stand['lat'], p_stand['lon'])).km
    time_2 = dist_2 / AUTO_SPEED
    fare_2 = 40  # User requested Rs 30-50
    co2_2 = dist_2 * CO2_AUTO
    total_time += time_2
    total_cost += fare_2
    total_co2 += co2_2
    total_car_co2 += (dist_2 * CO2_CAR)
    print(f"Leg 2 (Rapido): Ride {dist_2:.2f} km to {p_stand['stop_name']}.")
    print(f"   -> Time: {time_2:.0f} mins | Fare: Rs {fare_2} | CO2: {co2_2:.0f}g")

    # --- LEG 3: City Bus (Perundurai BS to Erode BS) ---
    dist_3 = geodesic((p_stand['lat'], p_stand['lon']), (e_stand['lat'], e_stand['lon'])).km
    time_3 = dist_3 / BUS_SPEED
    fare_3 = 15  # User requested Rs 15
    co2_3 = dist_3 * CO2_BUS
    total_time += time_3
    total_cost += fare_3
    total_co2 += co2_3
    total_car_co2 += (dist_3 * CO2_CAR)
    print(f"Leg 3 (Bus): Take City Bus {dist_3:.2f} km to {e_stand['stop_name']}.")
    print(f"   -> Time: {time_3:.0f} mins | Fare: Rs {fare_3} | CO2: {co2_3:.0f}g")

    # --- LEG 4: Minibus/Town Bus (Erode BS to Railway Station) ---
    dist_4 = geodesic((e_stand['lat'], e_stand['lon']), (railway['lat'], railway['lon'])).km
    time_4 = dist_4 / BUS_SPEED
    fare_4 = 5  # User requested Rs 5
    co2_4 = dist_4 * CO2_BUS
    total_time += time_4
    total_cost += fare_4
    total_co2 += co2_4
    total_car_co2 += (dist_4 * CO2_CAR)
    print(f"Leg 4 (Bus): Take Connect Bus {dist_4:.2f} km to {railway['stop_name']}.")
    print(f"   -> Time: {time_4:.0f} mins | Fare: Rs {fare_4} | CO2: {co2_4:.0f}g\n")

    # --- FINAL SUMMARY ---
    print("=========================================")
    print("         MULTIMODAL TRIP SUMMARY         ")
    print("=========================================")
    print(f"Total Travel Time : {total_time:.0f} minutes")
    print(f"Unified MaaS Fare : Rs {total_cost:.2f} (Single Checkout)")
    print(f"Total CO2 Emitted : {total_co2:.0f}g")
    
    saved_co2 = total_car_co2 - total_co2
    print(f"GREEN IMPACT      : You saved {saved_co2:.0f}g of CO2 compared to driving a car!")
    print("=========================================\n")

if __name__ == "__main__":
    run_presentation_demo()