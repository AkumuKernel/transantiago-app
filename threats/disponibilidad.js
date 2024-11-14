const express = require('express');
const router = express.Router();
const axios = require('axios');
const { insertData, connect, disconnect } = require('../database');
const turf = require("@turf/turf");

const disponibilidad = "https://api.uoct.cl/api/v1/waze/routes/zone/all";

router.get('/disponibilidad', async (req, res) => {
  try {
    await connect();
    const response = await axios.get(disponibilidad);
    
    // Accede a la propiedad `data` del objeto que contiene los datos requeridos
    const routes = response.data.data;

    const extractedData = routes.map(route => ({
      to_name: route.to_name,
      from_name: route.from_name,
      custom_label: route.custom_label,
      created_at: route.created_at,
      time: route.time,
      jam_level: route.jam_level,
      enabled: route.enabled,
      length: route.length
    }));
    
    for (const route of extractedData) {
      await insertDisponibilidad(route);  // Insertamos cada incidente en la base de datos
    }

    res.json(extractedData);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching data', error: error.message });
  } finally {
    console.log('Datos guardados en la tabla disponibilidad');
    // await disconnect(); // Descomentar si deseas cerrar la conexión
  }
});

async function insertDisponibilidad(data) {
  // Nombres de las calles
  const fromName = data.from_name;
  const toName = data.to_name;

  // Obtener el LineString de conexión entre las calles
  const connection = await connectStreets(fromName, toName);

  if (!connection) {
    console.warn(`No se pudo obtener conexión entre las calles '${fromName}' y '${toName}'`);
    return;  // Si no hay conexión (es decir, no se encuentran coordenadas), saltar esta inserción
  }

  try {
    const instruccion = {
      'tabla': 'disponibilidad',
      'datos': {
        'origen': data.from_name,
        'destino': data.to_name,
        'descripcion': data.custom_label,
        'fecha_creacion': data.created_at,
        'tiempo_trayecto': data.time,
        'nivel_congestion': data.jam_level,
        'habilitado': data.enabled,
        'largo_segmento': data.length,
        'geom': `ST_SetSRID(ST_GeomFromGeoJSON('${JSON.stringify(connection.geometry)}'), 4326)`
      },
      'conflict': `ON CONFLICT (origen, destino) DO UPDATE 
                   SET descripcion = EXCLUDED.descripcion,
                       fecha_creacion = EXCLUDED.fecha_creacion,
                       tiempo_trayecto = EXCLUDED.tiempo_trayecto,
                       nivel_congestion = EXCLUDED.nivel_congestion,
                       habilitado = EXCLUDED.habilitado,
                       largo_segmento = EXCLUDED.largo_segmento,
                       geom = EXCLUDED.geom`
    };
    await insertData(instruccion);
  } catch (error) {
    console.error(`Error al insertar los datos para: ${JSON.stringify(data)}`, error);
  }
}

async function connectStreets(fromName, toName) {
  // Obtener las geometrías de las dos calles
  const pointsFrom = await getStreetGeometry(fromName);
  const pointsTo = await getStreetGeometry(toName);

  // Si no se encuentran puntos para alguna de las calles, no continuamos
  if (pointsFrom.length === 0 || pointsTo.length === 0) {
    console.warn(`No se encontraron coordenadas para las calles '${fromName}' o '${toName}'`);
    return null;  // Si no se encuentran coordenadas, retornamos null
  }

  // Encontrar los puntos más cercanos entre ambas calles
  const [pointFrom, pointTo] = findClosestPoints(pointsFrom, pointsTo);

  // Crear una LineString que conecte los puntos más cercanos
  const connectionLine = turf.lineString([pointFrom.geometry.coordinates, pointTo.geometry.coordinates]);

  return connectionLine;
}

async function getStreetGeometry(streetName, areaName = "Santiago") {
  try {
    // Consulta de Overpass para obtener la geometría de la calle
    const query = `
      [out:json];
      area["name"="${areaName}"]->.searchArea;
      way["name"="${streetName}"](area.searchArea);
      out geom;
    `;
    
    const url = `http://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;
    const response = await axios.get(url);

    if (!response.data || !response.data.elements || response.data.elements.length === 0) {
      console.warn(`No se encontraron datos para la calle '${streetName}' en ${areaName}`);
      return [];  // Retornar un array vacío si no se encuentran resultados
    }

    // Obtener la geometría como una lista de puntos
    const points = response.data.elements
      .filter(element => element.geometry)
      .flatMap(element => element.geometry.map(coord => turf.point([coord.lon, coord.lat])));

    return points;
  } catch (error) {
    console.error(`Error al obtener datos para la calle '${streetName}':`, error);
    return [];  // Retornar un array vacío en caso de error
  }
}

function findClosestPoints(points1, points2) {
  // Encuentra el par de puntos más cercano entre dos listas de puntos
  let minDistance = Infinity;
  let closestPair = [null, null];
  
  points1.forEach(p1 => {
    points2.forEach(p2 => {
      const distance = turf.distance(p1, p2);
      if (distance < minDistance) {
        minDistance = distance;
        closestPair = [p1, p2];
      }
    });
  });

  return closestPair;
}

module.exports = router;