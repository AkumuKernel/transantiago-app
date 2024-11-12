// paraderosService.js

const axios = require('axios');
const fs = require('fs');
const csv = require('csv-parser');
const path = require('path');
const { pool } = require('../database');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
require('dotenv').config();
const { Buffer } = require('buffer');


const BASE_URL = "https://www.red.cl/predictor/prediccion?t=%s&codsimt=%s&codser=";
const SESSION_URL = "https://www.red.cl/planifica-tu-viaje/cuando-llega/";
const outputFilePath2 = "ubicaciones_paraderos2.csv";

let session = "";
let codigosParaderos = [];

/**
 * Función para obtener la sesión necesaria
 */
async function getSession() {
  try {
    if (!session) {
      const response = await axios.get(SESSION_URL);
      const match = response.data.match(/\$jwt = '([A-Za-z0-9=-_]+)'/);
      if (match) {
        session = Buffer.from(match[1], "base64").toString("utf-8");
      }
    }
    return session;
  } catch (err) {
    console.error("Error obteniendo la sesión:", err);
    throw err;
  }
}

/**
 * Función para cargar los códigos de paraderos desde la API
 */
async function cargarCodigosParaderos() {
  try {
    const response = await axios.get(
      "https://www.red.cl/restservice_v2/rest/getparadas/all"
    );
    const data = response.data;

    // Convertir el objeto en un array de sus valores
    codigosParaderos = Object.values(data);

    console.log("Códigos de paraderos cargados:", codigosParaderos.length);
    return codigosParaderos;
  } catch (error) {
    console.error("Error al obtener los datos:", error);
    throw error;
  }
}

/**
 * Función para obtener paraderos con datos incompletos en el CSV
 */
function obtenerParaderosInvalidos(filePath) {
  return new Promise((resolve, reject) => {
    const paraderosInvalidos = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (data) => {
        if (!data.latitud || !data.longitud) {
          paraderosInvalidos.push(data.codigoParadero);
        }
      })
      .on('end', () => resolve(paraderosInvalidos))
      .on('error', (err) => reject(err));
  });
}

/**
 * Función para leer el archivo CSV y obtener array de paraderos
 */
function readParaderosCSV(filePath) {
  return new Promise((resolve, reject) => {
    const results = [];
    fs.createReadStream(filePath)
      .pipe(csv({ separator: ',' })) 
      .on('data', (data) => {
        if (data.codigoParadero && data.latitud && data.longitud) {
          results.push({
            paradero: data.codigoParadero.trim(),
            latitud: parseFloat(data.latitud),
            longitud: parseFloat(data.longitud),
          });
        } else {
          console.warn('Fila incompleta o inválida:', data);
        }
      })
      .on('end', () => resolve(results))
      .on('error', (err) => reject(err));
  });
}

/**
 * Función que inserta paraderos en la base de datos
 */
async function insertParaderos(paraderos) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const insertQuery = `
      INSERT INTO paraderos (codigo, coordenadas)
      VALUES ($1, ST_SetSRID(ST_Point($2, $3), 4326))
      ON CONFLICT (codigo) DO NOTHING;
    `;

    for (const p of paraderos) {
      await client.query(insertQuery, [p.paradero, p.longitud, p.latitud]);
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error al insertar paraderos:', err);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Función que procesa e importa paraderos desde el archivo CSV
 */
async function processAndImportParaderos() {
  try {
    const csvFilePath = path.join(__dirname, outputFilePath2);
    
    // Verificar si el archivo existe, si no, crear uno vacío con los encabezados
    if (!fs.existsSync(csvFilePath)) {
      const csvWriter = createCsvWriter({
        path: csvFilePath,
        header: [
          { id: 'codigoParadero', title: 'codigoParadero' },
          { id: 'latitud', title: 'latitud' },
          { id: 'longitud', title: 'longitud' },
        ],
      });
      await csvWriter.writeRecords([]); // Escribir un archivo vacío con encabezados
      console.log(`Archivo CSV creado: ${outputFilePath2}`);
    }

    const paraderos = await readParaderosCSV(csvFilePath);

    if (paraderos.length === 0) {
      console.warn('No se encontraron paraderos en el archivo CSV.');
      return;
    }

    await insertParaderos(paraderos);

    console.log('Importación de paraderos completada.');
  } catch (error) {
    console.error('Error al procesar e importar paraderos:', error);
    throw error;
  }
}


/**
 * Función para obtener la ubicación de un paradero y guardarla
 */
async function obtenerUbicacionYGuardar(codigoParadero) {
  try {
    await getSession(); // Asegurar que la sesión esté establecida
    const stopID = codigoParadero;
    const url1 = BASE_URL.replace("%s", session).replace("%s", stopID);

    // Realizar la solicitud para obtener latitud y longitud
    const resp = await axios.get(url1);
    console.log("Respuesta de la API:", resp.data);
    const { x: lat, y: lon } = resp.data;

    if (!lat || !lon) {
      throw new Error('No se obtuvo latitud o longitud válidas.');
    }

    const paradero = {
      paradero: codigoParadero,
      latitud: lat,
      longitud: lon,
    };

    // Insertar o actualizar en la base de datos
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const insertQuery = `
        INSERT INTO paraderos (paradero, geom)
        VALUES ($1, ST_SetSRID(ST_Point($2, $3), 4326))
        ON CONFLICT (paradero) DO UPDATE SET geom = EXCLUDED.geom;
      `;

      await client.query(insertQuery, [paradero.paradero, paradero.longitud, paradero.latitud]);

      await client.query('COMMIT');
    } catch (dbError) {
      await client.query('ROLLBACK');
      throw dbError;
    } finally {
      client.release();
    }

    // Leer todos los registros del CSV
    const csvFilePath = outputFilePath2;
    let records = [];
    if (fs.existsSync(csvFilePath)) {
      records = await new Promise((resolve, reject) => {
        const results = [];
        fs.createReadStream(csvFilePath)
          .pipe(csv())
          .on('data', (data) => results.push(data))
          .on('end', () => resolve(results))
          .on('error', (err) => reject(err));
      });
    }

    // Actualizar o agregar el registro en el array
    const index = records.findIndex(r => r.codigoParadero === codigoParadero);
    if (index !== -1) {
      // Actualizar registro existente
      records[index].latitud = lat;
      records[index].longitud = lon;
    } else {
      // Agregar nuevo registro
      records.push({ codigoParadero, latitud: lat, longitud: lon });
    }

    // Escribir todos los registros nuevamente en el CSV
    const csvWriter = createCsvWriter({
      path: csvFilePath,
      header: [
        { id: 'codigoParadero', title: 'codigoParadero' },
        { id: 'latitud', title: 'latitud' },
        { id: 'longitud', title: 'longitud' },
      ],
    });

    await csvWriter.writeRecords(records);

    console.log(`Paradero ${codigoParadero} actualizado correctamente.`);

    return paradero;
  } catch (error) {
    console.error(
      `Error al obtener la ubicación del paradero ${codigoParadero}:`,
      error.message
    );
    return {
      codigoParadero,
      error: "Hubo un error al obtener la información del paradero",
    };
  }
}

/**
 * Función middleware para obtener la ubicación de un paradero y agregarla a la solicitud
 */
async function obtenerUbicacion(req, res, next) {
  try {
    await getSession(); // Asegurar que la sesión esté establecida
    const stopID = req.params.stopid || req.body.codigoParadero;
    const url1 = BASE_URL.replace("%s", session).replace("%s", stopID);

    // Realizar la solicitud para obtener latitud y longitud
    const resp = await axios.get(url1);
    const { x: lat, y: lon } = resp.data;

    let latitud = "",
      longitud = "",
      ref = "";

    if (resp.data) {
      latitud = lat;
      longitud = lon;
      ref = stopID;
    } else {
      console.log("No se encontraron datos para el paradero.");
    }

    req.ubicacion = { latitud, longitud, ref };

    next();
  } catch (error) {
    console.error(
      `Error al obtener la ubicación del paradero ${req.params.stopid}:`,
      error
    );
    res
      .status(400)
      .json({ error: "Hubo un error al obtener la información del paradero" });
  }
}

module.exports = {
  cargarCodigosParaderos,
  obtenerParaderosInvalidos,
  readParaderosCSV,
  insertParaderos,
  processAndImportParaderos,
  obtenerUbicacionYGuardar,
  obtenerUbicacion,
  codigosParaderos,
};
