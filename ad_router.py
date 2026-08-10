import networkx as nx

def build_maas_graph():
    # 1. Initialize a "Directed Graph" (a map of nodes and connections)
    G = nx.DiGraph()

    # 2. Add Nodes (Locations)
    nodes = ["KEC Hostel", "Campus Gate", "Perundurai BS", "Erode BS", "Railway Station"]
    G.add_nodes_from(nodes)

    # 3. Add Edges (Travel Options between locations)
    # Format: (Start, End, dict of attributes: mode, time_mins, cost_rs, co2_g)
    
    # Options from Hostel to Gate
    G.add_edge("KEC Hostel", "Campus Gate", mode="Walk", time=15, cost=0, co2=0)
    G.add_edge("KEC Hostel", "Campus Gate", mode="Auto", time=3, cost=40, co2=50)

    # Options from Gate to Perundurai BS
    G.add_edge("Campus Gate", "Perundurai BS", mode="Bus", time=10, cost=10, co2=100)
    G.add_edge("Campus Gate", "Perundurai BS", mode="Auto", time=6, cost=80, co2=250)

    # Options from Perundurai BS to Erode BS
    G.add_edge("Perundurai BS", "Erode BS", mode="City Bus", time=35, cost=15, co2=400)
    G.add_edge("Perundurai BS", "Erode BS", mode="Taxi", time=25, cost=300, co2=1200)

    # Options from Erode BS to Railway Station
    G.add_edge("Erode BS", "Railway Station", mode="Minibus", time=10, cost=5, co2=50)
    G.add_edge("Erode BS", "Railway Station", mode="Walk", time=25, cost=0, co2=0)
    G.add_edge("Erode BS", "Railway Station", mode="Auto", time=5, cost=60, co2=100)

    return G

def find_best_route(G, origin, destination, optimization_preference):
    print(f"\n Searching for the {optimization_preference.upper()} route from {origin} to {destination}...")
    
    try:
        # This is the real magic: Dijkstra's Algorithm finds the shortest path dynamically
        # It looks at the 'weight' (either cost or time) to make its decision
        path = nx.shortest_path(G, source=origin, target=destination, weight=optimization_preference)
        
        # Calculate totals
        total_time = 0
        total_cost = 0
        
        print("-" * 40)
        for i in range(len(path)-1):
            start_node = path[i]
            end_node = path[i+1]
            # Get the details of the edge the algorithm chose
            edge_data = G[start_node][end_node] 
            
            total_time += edge_data['time']
            total_cost += edge_data['cost']
            
            print(f"Leg {i+1}: Take {edge_data['mode']} from {start_node} -> {end_node}")
            print(f"       (Time: {edge_data['time']} mins | Cost: ₹{edge_data['cost']})")
            
        print("-" * 40)
        print(f" FINAL OPTIMIZED RESULT:")
        print(f"   Total Time: {total_time} minutes")
        print(f"   Total Cost: ₹{total_cost}")
        print("=" * 50)
        
    except nx.NetworkXNoPath:
        print("No route could be found between these locations.")

if __name__ == "__main__":
    print("=" * 50)
    print("   DYNAMIC MaaS ROUTING ENGINE (GRAPH-BASED)")
    print("=" * 50)
    
    # Build the city map
    city_graph = build_maas_graph()
    
    # 1. Ask the algorithm to find the CHEAPEST possible route
    find_best_route(city_graph, "KEC Hostel", "Railway Station", optimization_preference="cost")
    
    # 2. Ask the algorithm to find the FASTEST possible route
    find_best_route(city_graph, "KEC Hostel", "Railway Station", optimization_preference="time")