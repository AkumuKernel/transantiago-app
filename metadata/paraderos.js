const express = require('express');
const router = express.Router();
const axios = require('axios');
require('dotenv').config();
const xlsx = require('xlsx');
const path = require('path');
const fs = require('fs');
const proj4 = require('proj4');
const { insertData, connect, disconnect } = require('../database');

const paraderos = "https://www.dtpm.cl/descargas/poss24/2024-11-09_consolidado_Registro-Paradas_anual.xlsx";

const utmToWgs84 = proj4('EPSG:32719', 'EPSG:4326'); // 32719 está basado en coordenadas UTM y 4326 está basado en las coordenadas WGS84

// Función para insertar datos en PostgreSQL
async function insertParadero(codigoParadero, lon, lat, servicios, comuna) {
    try {
        // Verificar si las coordenadas son válidas
        if (isNaN(lon) || isNaN(lat)) {
            throw new Error(`Coordenadas inválidas para el paradero ${codigoParadero}: lon ${lon}, lat ${lat}`);
        }
        
        // Inserta o actualiza los datos en la tabla paraderos
        const instruccion = {
            'tabla': 'paraderos',
            'datos': {
                'codigo': codigoParadero,
                'geom':  `POINT(${lon} ${lat})`,
                'servicios': JSON.stringify(servicios),
                'comuna': comuna
            },
            'conflict': 'ON CONFLICT (codigo) DO UPDATE SET servicios = paraderos.servicios || EXCLUDED.servicios' // Combina servicios si ya existe
        };
        await insertData(instruccion);
    } catch (error) {
        console.error(`Error al insertar el paradero ${codigoParadero}:`, error);
    }
}

// Ruta para manejar la subida de datos
router.get('/paraderos', async (req, res) => {
    try {
        await connect();
        const data = await downloadAndProcess(paraderos); // Cambia el nombre de la variable a "paraderos"

        if (data) {
            res.status(200).json(data);
        } else {
            res.status(404).json({ message: 'No se encontraron datos.' });
        }
    } catch (error) {
        console.error('Error en la importación:', error);
        res.status(500).json({ message: 'Error en la importación de datos.' });
    } finally {
        console.log('Datos guardados en la tabla paraderos')
        // await disconnect();
    }
});

// Procesar archivos XLSX
async function downloadAndProcess(url) {
  // Definir rutas de archivo
  const xlsxPath = path.join(__dirname, '2024-11-09_consolidado_Registro-Paradas_anual.xlsx');
  try {
    // Paso 1: Descargar el archivo XLSX
    const response = await axios({
      url,
      method: 'GET',
      responseType: 'arraybuffer'
    });
    fs.writeFileSync(xlsxPath, response.data);

    // Paso 2: Leer y procesar el archivo XLSX
    const workbook = xlsx.readFile(xlsxPath);
    const sheetName = workbook.SheetNames[0]; // Primera hoja
    const sheet = workbook.Sheets[sheetName];

    // Convertir a JSON y saltar las primeras dos filas
    let data = xlsx.utils.sheet_to_json(sheet, { header: 1 });

    // Ordenar los datos según la columna de Paraderos
    data = data.slice(1).sort((a, b) => {
        if (a[7] < b[7]) return -1;
        if (a[7] > b[7]) return 1;
        return 0;
      });  

    // Crear un objeto GeoJSON para almacenar resultados
    const geoJsonData = {
        type: "FeatureCollection",
        features: []
    };

    // Procesar filas del archivo, comenzando desde la fila 2 (ignorando encabezado)
    data.forEach(row => {
        const codigoParadero = row[7];
        const comuna = row[8];
        const codigoUsuario = row[2];
        const sentidoServicio = row[3];
        const variante = row[4] ? row[4] : '';

        // Las coordenadas están un UTM y hay que pasarlas a WGS84
        const x = parseFloat(row[12]) ? parseFloat(row[12]) : 0;
        const y = parseFloat(row[13]) ? parseFloat(row[13]): 0;


        if (codigoParadero && codigoUsuario && sentidoServicio && x > 0 && y > 0 && codigoParadero != 'POR DEFINIR') {
            // Se pasan las coordenadas a WGS84
            const [lon, lat] = utmToWgs84.forward([x, y]);
            // Crear el objeto que incluirá código usuario y el campo `name`
            let usuarioObj = {}
            usuarioObj = {
                codigoUsuario,
                name: `${codigoUsuario}${sentidoServicio === 'Ida' ? 'I' : 'R'}${variante}`
            };
            
            // Buscar si el paradero ya existe en `features`
            let paraderoFeature = geoJsonData.features.find(feature => feature.properties.codigoParadero === codigoParadero);

            // Si el paradero ya existe, agregar el objeto usuario al array `usuarios`
            if (paraderoFeature) {
                // Si el paradero ya existe, agregar el objeto usuario a la lista de `servicios`
                paraderoFeature.properties.servicios.push(usuarioObj);
            } else {
                // Si no existe, crear una nueva característica para el paradero
                paraderoFeature = {
                    type: "Feature",
                    geometry: {
                        type: "Point",
                        coordinates: [lon, lat]
                    },
                    properties: {
                        codigoParadero,
                        servicios: [usuarioObj],
                        comuna
                    }
                };
                geoJsonData.features.push(paraderoFeature);
            }
            // Paso 3: Insertar datos en la base de datos.
            insertParadero(codigoParadero, lon, lat, [usuarioObj], comuna);
        }
    });

    // Paso 4: Devolver el resultado en formato JSON
    return geoJsonData;

  } catch (error) {
    console.error('Error al procesar el archivo:', error);
  } finally {
    // Limpieza: Eliminar archivos temporales si fueron definidos
    if (xlsxPath && fs.existsSync(xlsxPath)) {
      fs.unlinkSync(xlsxPath);
    }
  }
}

module.exports = router;