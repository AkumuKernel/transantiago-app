// subidas.js
const express = require("express");
const router = express.Router();
const axios = require("axios");
const unzipper = require("unzipper");
const xlsb = require("xlsx");
const path = require("path");
const fs = require("fs");
const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_DATABASE,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

const subidasURL =
  "https://www.dtpm.cl/descargas/modelos_y_matrices/tablas_subidas_bajadas_abr24.zip";

// Función para importar datos en la base de datos
async function importarDataSubidas() {
  const result = await pool.query("SELECT COUNT(*) FROM subidas");
  if (parseInt(result.rows[0].count) > 0) {
    console.log("Datos ya existen en la base de datos.");
    return;
  }

  const data = await downloadAndProcessZip(subidasURL);
  if (!data) return;

  for (const paradero in data) {
    const { comuna, valores } = data[paradero];
    console.log("Insertando datos para el paradero:", paradero);
    console.log("Comuna:", comuna);
    console.log("Valores:", valores);
    // Inserción en la base de datos con todas las columnas de la tabla
    const query = `
  INSERT INTO subidas (paradero, comuna, "5:30:00", "6:00:00", "6:30:00", "7:00:00", "7:30:00",
                       "8:00:00", "8:30:00", "9:00:00", "9:30:00", "10:00:00", "10:30:00", 
                       "11:00:00", "11:30:00", "12:00:00", "12:30:00", "13:00:00", "13:30:00",
                       "14:00:00", "14:30:00", "15:00:00", "15:30:00", "16:00:00", "16:30:00",
                       "17:00:00", "17:30:00", "18:00:00", "18:30:00", "19:00:00", "19:30:00",
                       "20:00:00", "20:30:00", "21:00:00", "21:30:00", "22:00:00", "22:30:00", 
                       "23:00:00", "23:30:00")
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
          $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, 
          $39)
  ON CONFLICT (paradero) DO NOTHING;
`;

    // Valores con cada columna de tiempo representada
    const values = [
      paradero,
      comuna,
      valores["5:30:00"],
      valores["6:00:00"],
      valores["6:30:00"],
      valores["7:00:00"],
      valores["7:30:00"],
      valores["8:00:00"],
      valores["8:30:00"],
      valores["9:00:00"],
      valores["9:30:00"],
      valores["10:00:00"],
      valores["10:30:00"],
      valores["11:00:00"],
      valores["11:30:00"],
      valores["12:00:00"],
      valores["12:30:00"],
      valores["13:00:00"],
      valores["13:30:00"],
      valores["14:00:00"],
      valores["14:30:00"],
      valores["15:00:00"],
      valores["15:30:00"],
      valores["16:00:00"],
      valores["16:30:00"],
      valores["17:00:00"],
      valores["17:30:00"],
      valores["18:00:00"],
      valores["18:30:00"],
      valores["19:00:00"],
      valores["19:30:00"],
      valores["20:00:00"],
      valores["20:30:00"],
      valores["21:00:00"],
      valores["21:30:00"],
      valores["22:00:00"],
      valores["22:30:00"],
      valores["23:00:00"],
      valores["23:30:00"],
    ];

    // Ejecuta la consulta de inserción
    await pool.query(query, values);
  }
  console.log("Datos importados a la base de datos.");
}

// Función para procesar el archivo zip y extraer los datos
async function downloadAndProcessZip(url) {
  // Definir rutas de archivo
  const zipPath = path.join(__dirname, "tablas_subidas_bajadas_abr24.zip");
  const xlsbPath = path.join(
    __dirname,
    "tablas_subidas_bajadas_abr24/2024.04-Matriz_sub_SS_MH.xlsb"
  );

  try {
    // Paso 1: Descargar el archivo ZIP
    const response = await axios({ url, responseType: "stream" });
    // Paso 2: Extraer el archivo XLSB
    await new Promise((resolve, reject) => {
      const writer = fs.createWriteStream(zipPath);
      response.data.pipe(writer);
      writer.on("finish", resolve);
      writer.on("error", reject);
    });

    await fs
      .createReadStream(zipPath)
      .pipe(unzipper.Extract({ path: __dirname }))
      .promise();

    // Paso 3: Leer y procesar el archivo XLSB
    const workbook = xlsb.readFile(xlsbPath);
    const sheetName = workbook.SheetNames[1];
    const sheet = workbook.Sheets[sheetName];
    // Convertir a JSON y saltar las primeras dos filas
    let data = xlsb.utils.sheet_to_json(sheet, { header: 1 }).slice(2);
    // Definir las columnas que queremos conservar
    const indicesRelevantes = {
      Comuna: 1,
      paradero: 2,
      "5:30:00": 18,
      "6:00:00": 19,
      "6:30:00": 20,
      "7:00:00": 21,
      "7:30:00": 22,
      "8:00:00": 23,
      "8:30:00": 24,
      "9:00:00": 25,
      "9:30:00": 26,
      "10:00:00": 27,
      "10:30:00": 28,
      "11:00:00": 29,
      "11:30:00": 30,
      "12:00:00": 31,
      "12:30:00": 32,
      "13:00:00": 33,
      "13:30:00": 34,
      "14:00:00": 35,
      "14:30:00": 36,
      "15:00:00": 37,
      "15:30:00": 38,
      "16:00:00": 39,
      "16:30:00": 40,
      "17:00:00": 41,
      "17:30:00": 42,
      "18:00:00": 43,
      "18:30:00": 44,
      "19:00:00": 45,
      "19:30:00": 46,
      "20:00:00": 47,
      "20:30:00": 48,
      "21:00:00": 49,
      "21:30:00": 50,
      "22:00:00": 51,
      "22:30:00": 52,
      "23:00:00": 53,
      "23:30:00": 54,
    };
    // Paso 4: Sumar valores y filtrar por paradero
    const resultado = data.reduce((acumulador, fila) => {
      const paradero = fila[indicesRelevantes["paradero"]];
      if (paradero == "" || paradero == null) return acumulador;

      if (!acumulador[paradero]) {
        acumulador[paradero] = {
          comuna: fila[indicesRelevantes["Comuna"]],
          valores: {},
        };
      }

      Object.keys(indicesRelevantes)
        .slice(2) // Desde el tercer índice
        .forEach((columna) => {
          const valor = fila[indicesRelevantes[columna]]; // Obtener el valor
          acumulador[paradero].valores[columna] =
            (acumulador[paradero].valores[columna] || 0) +
            (valor !== undefined ? valor : 0);
        });

      return acumulador;
    }, {});
    // Paso 5: Devolver el resultado en formato JSON
    return resultado;
  } catch (error) {
    console.error("Error al procesar el archivo:", error);
  } finally {
    if (zipPath && fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
    if (xlsbPath && fs.existsSync(xlsbPath)) fs.unlinkSync(xlsbPath);
  }
}

// Ruta para cargar datos manualmente
router.get("/actualizar-datos", async (req, res) => {
  try {
    await importarDataSubidas();
    res.status(200).json({
      message: "Datos actualizados exitosamente en la base de datos.",
    });
  } catch (error) {
    console.error("Error al cargar los datos en la base de datos:", error);
    res.status(500).json({
      error: "Hubo un error al cargar los datos en la base de datos.",
    });
  }
});

// Ruta para obtener datos de subidas
router.get("/subidas", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM subidas");
    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error al obtener datos:", error);
    res.status(500).json({ message: "Error al obtener datos." });
  }
});

// Exportar tanto el router como la función importData
module.exports = { router, importarDataSubidas };
