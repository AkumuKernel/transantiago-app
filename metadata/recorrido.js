const express = require('express');
const router = express.Router();
const axios = require('axios');
require('dotenv').config();
const { insertData, connect, disconnect } = require('../database');

const recorrido = "https://www.red.cl/restservice_v2/rest/conocerecorrido?codsint=";
const url1="https://www.red.cl/restservice_v2/rest/getservicios/all";

//obtenerRutasAuto(url1, recorrido);

router.get('/recorrido/:id', async (req, res) => {
    const {id} = req.params;
    const paso = recorrido + id;

    try{
        const data = await obtenerDatosYProcesar(paso);

        if(data){
            //console.log(data);
            res.status(200).json(data);
            const puntos = data.features.filter(f => f.geometry.type === 'Point');
            //res.render('rutas', { puntos , geoJson: JSON.stringify(data), latitud: puntos[0].geometry.coordinates[1], longitud: puntos[0].geometry.coordinates[0]  });
        } else {
            res.status(404).json( { message: 'Datos no encontrados'} );
        }
    }
    catch(error){
        res.status(500).json({ message: 'Error en la importación de datos.', error});
    }
    finally{

    }
});

async function obtenerRutasAuto(url1, recorrido) {
  try {
    await connect();
      const response1 = await axios.get(url1);
      const ids = response1.data; // Suponiendo que la respuesta es un array de IDs

      // Asegúrate de que ids es un array
      if (!Array.isArray(ids)) {
          throw new Error('La respuesta no contiene un array de IDs.');
      }

      // Iterar sobre cada ID
      for (const id of ids) {
          const url2 = recorrido + id; // Construir la URL para cada ID
          const data = await obtenerDatosYProcesar(url2);

          // Solo intenta insertar si data es válido
          if (data) {
              await insertCalles(data);
          } else {
            await disconnect();
              console.warn(`No se encontraron datos para el ID: ${id}`);
          }
      }
      await disconnect();
  } catch (error) {
      console.error('Error al obtener los datos:', error.response ? error.response.data : error.message);
  }
}

// Función para insertar datos en PostgreSQL
async function insertCalles(data) {
  for (const feature of data.features) {
      // Verificar que sea un LineString
      if (feature.geometry.type !== 'LineString') {
          console.warn(`El tipo de geometría no es LineString: ${feature.geometry.type}`);
          continue; // Pasar al siguiente feature
      }

      const coordinates = feature.geometry.coordinates;
      const descriptionParts = feature.properties.description.split(' ');

      // Verificar que haya exactamente 2 partes en la descripción
      if (descriptionParts.length !== 2) {
          console.warn(`La descripción no contiene exactamente 2 partes: ${feature.properties.description}`);
          continue; // Pasar al siguiente feature
      }

      const origen = descriptionParts[0]; // Primer elemento
      const destino = descriptionParts[1]; // Segundo elemento

      // Construir el WKT para el LineString
      const geom = `LINESTRING(${coordinates.map(coord => `${coord[0]} ${coord[1]}`).join(', ')})`;

      const instruccion = {
          'tabla': 'calles',
          'datos': {
              'origen': origen,
              'destino': destino,
              'geom': geom // Se pasa el WKT directamente
          },
      };

      // Invocar la función externa insertData
      try {
          await insertData(instruccion);
      } catch (error) {
          console.error(`Error al insertar en calles:`, error);
      }
  }
}

// Procesar Recorridos
async function obtenerDatosYProcesar(url) {
    try {
      // Hacer la solicitud para obtener el JSON
      const response = await axios.get(url);
      const data = response.data;
      
      // Imprimir la respuesta para verificar su estructura
      //console.log('Respuesta de la API:', data);

      // Verificar que la respuesta tiene la estructura esperada
      if (!data.ida || !data.ida.path || !data.ida.paraderos) {
        throw new Error('La respuesta no contiene la estructura esperada.');
    }

      // Extraemos el path y los paraderos
      const path = data.ida.path;
      const paraderos = data.ida.paraderos.map(p => p.pos);
  
      // Función para encontrar el índice más cercano en el path
      function encontrarIndiceMasCercano(coordenadas, path) {
        let indiceMasCercano = 0;
        let distanciaMinima = Infinity;
        for (let i = 0; i < path.length; i++) {
          const [lat, lon] = path[i];
          const distancia = Math.sqrt(
            Math.pow(coordenadas[0] - lat, 2) + Math.pow(coordenadas[1] - lon, 2)
          );
          if (distancia < distanciaMinima) {
            distanciaMinima = distancia;
            indiceMasCercano = i;
          }
        }
        return indiceMasCercano;
      }
  
      // Crear el array de GeoJSON Features
      const geoJsonFeatures = [];
      
      for (let i = 0; i < paraderos.length - 1; i++) {
        const inicio = encontrarIndiceMasCercano(paraderos[i], path);
        const fin = encontrarIndiceMasCercano(paraderos[i + 1], path);
        const segmentoPath = path.slice(inicio, fin + 1);
  
        // Agregar Point del paradero
        geoJsonFeatures.push({
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: [paraderos[i][1], paraderos[i][0]] // long, lat
          },
          properties: {
            description: `${data.ida.paraderos[i].cod}`
          }
        });
  
        // Agregar LineString
        geoJsonFeatures.push({
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: segmentoPath.map(([lat, lon]) => [lon, lat])
          },
          properties: {
            description: `${data.ida.paraderos[i].cod} ${data.ida.paraderos[i + 1].cod}`
          }
        });
  
        // Agregar Point del siguiente paradero
        geoJsonFeatures.push({
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: [paraderos[i + 1][1], paraderos[i + 1][0]] // long, lat
          },
          properties: {
            description: `${data.ida.paraderos[i+1].cod}`
          }
        });
      }
  
      // Imprimir los Features de GeoJSON generados
      const geoJson = {
        type: "FeatureCollection",
        features: geoJsonFeatures
      };
  
      //console.log(JSON.stringify(geoJson, null, 2));
      return geoJson;
  
    } catch (error) {
      console.error('Error al obtener los datos:', error);
    }
  }

  module.exports = router;