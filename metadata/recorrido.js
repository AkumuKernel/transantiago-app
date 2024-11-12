// recorrido.js

const express = require('express');
const router = express.Router();
const axios = require('axios');
const { pool } = require('../database');
const { obtenerServicios } = require('../service/serviciosService');
require('dotenv').config();

const recorridoUrl = "https://www.red.cl/restservice_v2/rest/conocerecorrido?codsint=";

// Ruta para obtener el recorrido desde la base de datos
//Para 'ida': /recorrido/B28?direccion=ida
//Para 'vuelta': /recorrido/B28?direccion=vuelta
router.get('/recorrido/:id', async (req, res) => {
    const { id } = req.params; // 'id' es el código del servicio (recorrido)
    const { direccion } = req.query; // 'direccion' puede ser 'ida' o 'vuelta'

    try {
        const geoJson = await obtenerRecorridoDesdeBD(id, direccion);

        if (geoJson) {
            res.status(200).json(geoJson);
        } else {
            res.status(404).json({ message: 'Recorrido no encontrado en la base de datos.' });
        }
    } catch (error) {
        console.error('Error al obtener el recorrido desde la base de datos:', error);
        res.status(500).json({ message: 'Error al obtener el recorrido.', error });
    }
});


// Procesar Recorridos
async function obtenerDatosYProcesar(url, direccion) {
    try {
        // Hacer la solicitud para obtener el JSON
        const response = await axios.get(url);
        const data = response.data;

        let recorridoData;
        if (direccion === 'ida') {
            recorridoData = data.ida;
        } else if (direccion === 'vuelta') {
            recorridoData = data.regreso;
        } else {
            throw new Error('Dirección inválida. Debe ser "ida" o "vuelta".');
        }

        // Verificar que recorridoData existe
        if (!recorridoData || !recorridoData.path || !recorridoData.paraderos) {
            throw new Error(`No se encontraron datos de ${direccion} para el servicio.`);
        }

        // Extraemos el path y los códigos de paraderos
        const path = recorridoData.path;
        const paraderosCodigos = recorridoData.paraderos.map(p => p.cod);

        // Obtener los paraderos desde la base de datos
        const client = await pool.connect();
        const paraderos = [];

        for (const codigoParadero of paraderosCodigos) {
            const resParadero = await client.query(
                `SELECT codigo, ST_X(coordenadas::geometry) AS longitud, ST_Y(coordenadas::geometry) AS latitud
                 FROM paraderos WHERE codigo = $1`,
                [codigoParadero]
            );
            
            if (resParadero.rows.length > 0) {
                const paradero = resParadero.rows[0];
                paraderos.push({
                    cod: paradero.codigo,
                    pos: [paradero.latitud, paradero.longitud]
                });
            } else {
                console.warn(`Paradero ${codigoParadero} no encontrado en la base de datos.`);
            }
        }

        client.release();

        // Ahora 'paraderos' es un array con la información necesaria

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
            let inicio = encontrarIndiceMasCercano(paraderos[i].pos, path);
            let fin = encontrarIndiceMasCercano(paraderos[i + 1].pos, path);
        
            // Si inicio y fin son iguales, expandir el segmento
            if (inicio === fin) {
                if (inicio > 0) {
                    inicio -= 1;
                }
                if (fin < path.length - 1) {
                    fin += 1;
                }
            }
        
            let segmentoPath;
            if (inicio <= fin) {
                segmentoPath = path.slice(inicio, fin + 1);
            } else {
                segmentoPath = path.slice(fin, inicio + 1).reverse();
            }
        
        
            // Verificar que segmentoPath tenga al menos dos puntos
            if (segmentoPath.length < 2) {
                console.warn(`Segmento entre ${paraderos[i].cod} y ${paraderos[i + 1].cod} tiene menos de dos puntos. Se omitirá.`);
                continue;
            }
        
            // Agregar Point del paradero actual
            geoJsonFeatures.push({
                type: "Feature",
                geometry: {
                    type: "Point",
                    coordinates: [paraderos[i].pos[1], paraderos[i].pos[0]] // [lon, lat]
                },
                properties: {
                    description: `${paraderos[i].cod}`
                }
            });
        
            // Agregar LineString entre el paradero actual y el siguiente
            geoJsonFeatures.push({
                type: "Feature",
                geometry: {
                    type: "LineString",
                    coordinates: segmentoPath.map(([lat, lon]) => [lon, lat]) // [lon, lat]
                },
                properties: {
                    description: `${paraderos[i].cod} ${paraderos[i + 1].cod}`
                }
            });
        
            // Agregar Point del siguiente paradero
            geoJsonFeatures.push({
                type: "Feature",
                geometry: {
                    type: "Point",
                    coordinates: [paraderos[i + 1].pos[1], paraderos[i + 1].pos[0]] // [lon, lat]
                },
                properties: {
                    description: `${paraderos[i + 1].cod}`
                }
            });
        }
        

        // Construir el GeoJSON
        const geoJson = {
            type: "FeatureCollection",
            features: geoJsonFeatures,
            properties: {
                direccion: direccion
            }
        };

        return geoJson;

    } catch (error) {
        console.error('Error al obtener los datos:', error);
        throw error; // Re-lanzar el error para manejarlo en la llamada superior
    }
}

// Insertar el recorrido en las tablas 'tramos_ruta' y 'recorridos'
async function insertarRecorrido(geoJson, servicio, direccion) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Obtener todos los LineStrings (segmentos de ruta)
        const recorridosFeatures = geoJson.features.filter(
            (feature) => feature.geometry.type === 'LineString'
        );

        // Insertar cada segmento en 'tramos_ruta' y asociarlo con el servicio y direccion
        for (let i = 0; i < recorridosFeatures.length; i++) {
            const feature = recorridosFeatures[i];
            const description = feature.properties.description;
            const [origen, destino] = description.split(' ');

            const coordinates = feature.geometry.coordinates;

            // Verificar que coordinates tenga al menos dos puntos
            if (coordinates.length < 2) {
                console.warn(`Segmento entre ${origen} y ${destino} tiene menos de dos puntos. Se omitirá.`);
                continue;
            }

            const lineStringWKT = `LINESTRING(${coordinates
                .map((coord) => `${coord[0]} ${coord[1]}`)
                .join(', ')})`;

            // Calcular la distancia en metros usando ST_Length
            const distanciaResult = await client.query(
                `SELECT ST_Length(ST_Transform(ST_GeomFromText($1, 4326)::geometry, 3857)) AS distancia`,
                [lineStringWKT]
            );
            const distancia = distanciaResult.rows[0].distancia;

            // Insertar en la tabla 'tramos_ruta'
            const insertTramoResult = await client.query(
                `INSERT INTO tramos_ruta (origen, destino, distancia, geom)
                 VALUES ($1, $2, $3, ST_GeomFromText($4, 4326))
                 RETURNING id`,
                [origen, destino, distancia, lineStringWKT]
            );

            const tramo_ruta_id = insertTramoResult.rows[0].id;

            // Insertar en la tabla 'recorridos' con el 'orden' y 'direccion'
            await client.query(
                `INSERT INTO recorridos (servicio, tramo_ruta_id, orden, direccion)
                 VALUES ($1, $2, $3, $4)`,
                [servicio, tramo_ruta_id, i, direccion]
            );
        }

        await client.query('COMMIT');
        console.log(`Recorrido de ${direccion} insertado exitosamente.`);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error al insertar recorrido:', err);
        throw err;
    } finally {
        client.release();
    }
}

async function cargarRutasDeServicios() {
    try {
        const servicios = await obtenerServicios();
        console.log(`Se encontraron ${servicios.length} servicios.`);

        for (const servicio of servicios) {
            const url = recorridoUrl + servicio;
            try {
                const geoJsonIda = await obtenerDatosYProcesar(url, 'ida');
                const geoJsonVuelta = await obtenerDatosYProcesar(url, 'vuelta');


                if (geoJsonIda) {
                    await insertarRecorrido(geoJsonIda, servicio, 'ida');
                    console.log(`Recorrido de ida del servicio ${servicio} insertado correctamente.`);
                } else {
                    console.warn(`No se encontraron datos de ida para el servicio ${servicio}.`);
                }
                
                if (geoJsonVuelta) {
                    await insertarRecorrido(geoJsonVuelta, servicio, 'vuelta');
                    console.log(`Recorrido de vuelta del servicio ${servicio} insertado correctamente.`);
                } else {
                    console.warn(`No se encontraron datos de vuelta para el servicio ${servicio}.`);
                }
                
            } catch (error) {
                console.error(`Error al procesar el servicio ${servicio}:`, error.message);
                // Puedes decidir si quieres continuar con el siguiente servicio o detener el proceso
                continue; // Continuar con el siguiente servicio
            }
        }

        console.log('Carga de rutas de servicios completada.');
    } catch (error) {
        console.error('Error al cargar las rutas de los servicios:', error);
        throw error;
    }
}

// Función para obtener el recorrido desde la base de datos y generar el GeoJSON
async function obtenerRecorridoDesdeBD(servicio, direccion) {
    const client = await pool.connect();
    try {
        // Obtener los tramos del servicio y direccion especificados
        const res = await client.query(
            `SELECT tramos_ruta.origen, tramos_ruta.destino, ST_AsGeoJSON(tramos_ruta.geom) AS geom_json
             FROM recorridos
             INNER JOIN tramos_ruta ON recorridos.tramo_ruta_id = tramos_ruta.id
             WHERE recorridos.servicio = $1 AND recorridos.direccion = $2
             ORDER BY recorridos.orden`,
            [servicio, direccion]
        );

        if (res.rows.length === 0) {
            console.warn(`No se encontraron tramos para el servicio ${servicio}.`);
            return null;
        }

        const features = [];

        // Mapear paraderos para evitar consultas redundantes
        const paraderosSet = new Set();
        res.rows.forEach(row => {
            paraderosSet.add(row.origen);
            paraderosSet.add(row.destino);
        });

        // Obtener las coordenadas de los paraderos
        const paraderosArray = Array.from(paraderosSet);
        const resParaderos = await client.query(
            `SELECT codigo, ST_X(coordenadas::geometry) AS longitud, ST_Y(coordenadas::geometry) AS latitud
             FROM paraderos
             WHERE codigo = ANY($1)`,
            [paraderosArray]
        );

        const paraderosMap = {};
        for (const paradero of resParaderos.rows) {
            paraderosMap[paradero.codigo] = [paradero.longitud, paradero.latitud];
        }

        for (const row of res.rows) {
            // Agregar Point del paradero de origen
            const origenCoords = paraderosMap[row.origen];
            if (origenCoords) {
                features.push({
                    type: "Feature",
                    geometry: {
                        type: "Point",
                        coordinates: origenCoords // [lon, lat]
                    },
                    properties: {
                        description: `${row.origen}`
                    }
                });
            } else {
                console.warn(`Coordenadas no encontradas para el paradero ${row.origen}.`);
            }

            // Agregar LineString del tramo
            const geom = JSON.parse(row.geom_json);
            features.push({
                type: "Feature",
                geometry: geom, // Geometría del tramo ya en GeoJSON
                properties: {
                    description: `${row.origen} ${row.destino}`
                }
            });

            // Agregar Point del paradero de destino
            const destinoCoords = paraderosMap[row.destino];
            if (destinoCoords) {
                features.push({
                    type: "Feature",
                    geometry: {
                        type: "Point",
                        coordinates: destinoCoords // [lon, lat]
                    },
                    properties: {
                        description: `${row.destino}`
                    }
                });
            } else {
                console.warn(`Coordenadas no encontradas para el paradero ${row.destino}.`);
            }
        }

        const geoJson = {
            type: "FeatureCollection",
            features: features
        };

        return geoJson;
    } catch (error) {
        console.error('Error al obtener el recorrido desde la base de datos:', error);
        throw error;
    } finally {
        client.release();
    }
}

module.exports = {
    router,
    cargarRutasDeServicios
};
