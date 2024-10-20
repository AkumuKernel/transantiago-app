const express = require("express");
const router = express.Router();
const axios = require("axios");

// UOCT Waze Routes API
const disponibilidad = "https://api.uoct.cl/api/v1/waze/routes/zone/all";

// Geocoding and Routing APIs
const geocodingApiUrl = "https://nominatim.openstreetmap.org/search";
const routingApiUrl = "https://router.project-osrm.org/route/v1/driving";

// Function to geocode a location name
async function geocodeLocation(locationName) {
  try {
    const response = await axios.get(geocodingApiUrl, {
      params: {
        q: `${locationName}, Santiago, Chile`,
        format: "json",
        limit: 1,
      },
    });
    if (response.data && response.data.length > 0) {
      const { lat, lon } = response.data[0];
      return [parseFloat(lon), parseFloat(lat)]; // [longitude, latitude]
    } else {
      throw new Error(`No coordinates found for ${locationName}`);
    }
  } catch (error) {
    console.error("Geocoding error:", error.message);
    throw error;
  }
}

// Function to get route geometry between two coordinates
async function getRouteGeometry(startCoord, endCoord) {
  try {
    const response = await axios.get(
      `${routingApiUrl}/${startCoord.join(",")};${endCoord.join(",")}`,
      {
        params: {
          geometries: "geojson",
          overview: "full",
        },
      }
    );
    if (
      response.data &&
      response.data.routes &&
      response.data.routes.length > 0
    ) {
      return response.data.routes[0].geometry.coordinates;
    } else {
      throw new Error("No route found");
    }
  } catch (error) {
    console.error("Routing error:", error.message);
    throw error;
  }
}

router.get("/disponibilidad", async (req, res) => {
  try {
    const response = await axios.get(disponibilidad);

    // Access the `data` property that contains the required data
    const routes = response.data.data;

    const geoJsonFeatures = [];

    for (const route of routes) {
      try {
        // Geocode from_name and to_name
        const fromCoord = await geocodeLocation(route.from_name);
        const toCoord = await geocodeLocation(route.to_name);

        // Get route geometry
        const routeCoordinates = await getRouteGeometry(fromCoord, toCoord);

        // Create GeoJSON Feature
        const feature = {
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: routeCoordinates,
          },
          properties: {
            id: route.id,
            name: route.name,
            jam_level: route.jam_level,
            time: route.time,
            historic_time: route.historic_time,
            length: route.length,
            from_name: route.from_name,
            to_name: route.to_name,
            custom_label: route.custom_label,
            updated_at: route.updated_at,
          },
        };

        geoJsonFeatures.push(feature);
      } catch (error) {
        console.error(`Error processing route ID ${route.id}:`, error.message);
        // Continue processing other routes even if one fails
      }
    }

    const geoJson = {
      type: "FeatureCollection",
      features: geoJsonFeatures,
    };

    res.status(200).json(geoJson);
  } catch (error) {
    console.error("Error fetching UOCT data:", error.message);
    res
      .status(500)
      .json({ message: "Error fetching UOCT data.", error: error.message });
  }
});

module.exports = router;
