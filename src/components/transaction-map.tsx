"use client";

import { useEffect, useState, useRef } from "react";
import { parseTransactionLocation } from "@/lib/parse-transaction-location";

type MapState =
  | { status: "loading" }
  | { status: "none" }
  | { status: "found"; lat: number; lon: number; label: string };

// Helper to normalize noisy Dutch bank and transaction strings
function cleanTransactionName(rawName: string): string {
  let cleaned = rawName;

  // 1. Strip processor prefixes like BCK*, STG*, BEA*, POS*
  cleaned = cleaned.replace(/^[A-Z0-9]{2,4}\*/i, "");

  // 2. Strip delivery/payment platforms (e.g., "via Takeaway.com", "via Uber Eats", "via PayPal")
  cleaned = cleaned.replace(/\s+via\s+[\w\.-]+/i, "");

  // 3. Strip delivery/payment platforms (e.g., "via Takeaway.com", "via Uber Eats", "via PayPal")
  cleaned = cleaned.replace(/\s+B.V.\s+[\w\.-]+/i, "");

  // 3. Fix rigid brand names OpenStreetMap chokes on without punctuation
  if (/mcdonalds/i.test(cleaned) && !cleaned.includes("'")) {
    cleaned = cleaned.replace(/mcdonalds/i, "McDonald's");
  }

  // 4. Remove store numbers, terminal IDs, or dates (3+ digits in a row)
  cleaned = cleaned.replace(/\b\d{3,}\b/g, "");

  // 5. Clean up spaces
  return cleaned.replace(/\s+/g, " ").trim();
}

export function TransactionMap({ name }: { name: string }) {
  const [state, setState] = useState<MapState>({ status: "loading" });
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;

    async function geocode(query: string) {
      if (!query || query.trim().length < 2) return null;
      
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=nl&q=${encodeURIComponent(query)}&email=your_email@example.com`;
      
      console.log("Map Debug: Fetching geocode for ->", query);
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (!res.ok) return null;
      
      const data = (await res.json()) as Array<{ lat: string; lon: string }>;
      return data && data.length > 0 ? data[0] : null;
    }

    (async () => {
      try {
        const parsed = parseTransactionLocation(name);
        const cleanedBrand = cleanTransactionName(name);
        const citySuffix = parsed?.city ? `, ${parsed.city}` : "";
        
        // Extract just the first main word of the brand (e.g., "Etos Timmer" -> "Etos")
        const coreBrandWord = cleanedBrand.split(" ")[0];

        // Create an intelligent cascade of queries to attempt in sequence
        const queriesToTry: string[] = [];

        // 1. Try whatever the regex parser cleanly separated first
        if (parsed?.query) queriesToTry.push(parsed.query);

        if (parsed?.city) {
          // 2. Try: Cleaned Brand + City (e.g., "HEMA, Ochten")
          queriesToTry.push(`${cleanedBrand}${citySuffix}`);
          
          // 3. Try fallback: Just the first brand word + City (e.g., "Etos, Ochten")
          if (cleanedBrand.split(" ").length > 1) {
            queriesToTry.push(`${coreBrandWord}${citySuffix}`);
          }
        }

        // 4. Try the pure cleaned brand globally
        queriesToTry.push(cleanedBrand);

        // 5. Hard absolute fallback: Just show the city center if we know it
        if (parsed?.city) {
          queriesToTry.push(`${parsed.city}, Nederland`);
        }

        // Execute queries in order until one hits
        let hit = null;
        let usedQuery = "";

        for (const query of queriesToTry) {
          if (hit) break;
          // Skip exact duplicate queries if they happen to overlap
          if (query === usedQuery) continue; 
          
          hit = await geocode(query);
          if (hit) usedQuery = query;
        }

        if (cancelled) return;

        if (hit) {
          console.log(`Map Debug: Success using query: [${usedQuery}]`);
          setState({ 
            status: "found", 
            lat: parseFloat(hit.lat), 
            lon: parseFloat(hit.lon), 
            label: parsed?.label || cleanedBrand 
          });
        } else {
          console.log("Map Debug: All search strategies failed for:", name);
          setState({ status: "none" });
        }
      } catch (error) {
        console.error("Map Debug: Error in search pipeline:", error);
        if (!cancelled) setState({ status: "none" });
      }
    })();

    return () => { cancelled = true; };
  }, [name]);

  // 2. Handle Leaflet Initialization
  useEffect(() => {
    if (state.status !== "found" || !mapRef.current) return;

    const mapContainer = mapRef.current;
    let map: any;

    (async () => {
      const L = await import("leaflet");

      if (mapInstance.current) {
        mapInstance.current.remove();
      }

      map = L.map(mapContainer, {
        center: [state.lat, state.lon],
        zoom: 14,
        zoomControl: false,
        attributionControl: false
      });

      mapInstance.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);

      const customIcon = L.divIcon({
        html: `
          <div class="relative flex items-center justify-center w-8 h-8">
            <span class="absolute inline-flex w-full h-full rounded-full bg-blue-600 animate-ping opacity-75"></span>
            <div class="w-4 h-4 bg-blue-500 rounded-full shadow-md"></div>
          </div>
        `,
        className: "",
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      });

      L.marker([state.lat, state.lon], { icon: customIcon }).addTo(map);
    })();

    return () => {
      if (map) {
        map.remove();
        mapInstance.current = null;
      }
    };
  }, [state]);

  if (state.status === "none") return null;

  if (state.status === "loading") {
    return <div className="h-36 rounded-xl bg-foreground/[0.04] animate-pulse" />;
  }

  return (
    <div className="space-y-1.5">      
      <div 
        ref={mapRef} 
        className="h-36 w-full rounded-xl overflow-hidden z-0" 
      />
      
      <div className="flex justify-between items-center gap-2">
        <p className="text-xs text-muted-foreground truncate">{state.label}</p>
        <span className="text-[10px] text-muted-foreground/40 shrink-0">© OpenStreetMap</span>
      </div>
    </div>
  );
}