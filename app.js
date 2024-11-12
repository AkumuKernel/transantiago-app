// app.js

const express = require("express");
const { engine } = require("express-handlebars");
const axios = require("axios");
const fs = require("fs");
const csv = require("csv-parser");
const path = require("path");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;
const { Buffer } = require("buffer");
require("dotenv").config();

// Importar el servicio de paraderos
const paraderosService = require("./service/paraderosService");
const serviciosService = require("./service/serviciosService");

// Importar Archivos Viejos
const old = require("./appOld");

// Importar archivos de metadata
const paraderos = require('./metadata/paraderos');
const {router: recorrido, cargarRutasDeServicios} = require("./metadata/recorrido");
const recorridov2 = require('./metadata/recorridov2');
const {
  router: subidasRouter,
  importarDataSubidas,
} = require("./metadata/subidas");
const espera = require("./metadata/espera");
const aglomeracion = require("./metadata/aglomeracion");

// Importar archivos de amenazas
const metro = require('./threats/metro');
const alerts = require('./threats/alerts');
const traffic = require('./threats/traffic');
const disponibilidad = require('./threats/disponibilidad');
const incidentes = require('./threats/incidentes');
const trafficGoogle = require('./threats/trafficGoogle');

const app = express();
const PORT = process.env.PORT || 3000;

// Nombre del archivo CSV para guardar las ubicaciones
const outputFilePath2 = "ubicaciones_paraderos2.csv";

// Función para leer CSV y devolver los datos
function readCSV(filePath) {
  return new Promise((resolve, reject) => {
    const results = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on("data", (data) => results.push(data))
      .on("end", () => resolve(results))
      .on("error", (err) => reject(err));
  });
}

// Configurar Handlebars
app.engine(
  "hbs",
  engine({
    extname: ".hbs",
    defaultLayout: "main",
    layoutsDir: path.join(__dirname, "views", "layouts"),
    partialsDir: path.join(__dirname, "views", "partials"),
    helpers: {
      json: function (context) {
        return JSON.stringify(context);
      },
      baseUrl: () => {
        return ""; // Aquí podrías agregar la base URL si es necesario
      },
    },
  })
);
app.set("view engine", "hbs");
app.set("views", path.join(__dirname, "views"));

// Middleware para parsear datos del formulario
app.use(express.urlencoded({ extended: true }));

// Middleware estático para servir archivos estáticos desde la carpeta 'assets'
app.use(express.static(path.join(__dirname, "assets")));

// Rutas
app.get("/", (req, res) => {
  res.render("home");
});

// Ruta para buscar paraderos
app.post("/buscar", paraderosService.obtenerUbicacion, async (req, res) => {
  const codigoParadero = req.body.codigoParadero
    ? req.body.codigoParadero
    : req.ubicacion.ref;
  // Capturar el parámetro GET horaSeleccionada, si existe
  const horaSeleccionada = req.body.time;

  let formattedTimeInit, formattedTimeFinal;

  if (horaSeleccionada) {
    const date = horaSeleccionada.split(":");
    const hora = date[0];
    const minuto = date[1];
    // Utilizar la hora seleccionada en formato "HH:mm:00"
    formattedTimeInit = `${horaSeleccionada}`;
    formattedTimeFinal = `${hora}:${parseInt(minuto) + 29}:59`;
  } else {
    // Utilizar la hora actual en formato "HH:mm:00"
    const currentTime = new Date();
    const currentHour = currentTime.getHours();
    const currentMinutes = currentTime.getMinutes();

    formattedTimeInit = `${currentHour.toString().padStart(2, "0")}:${(
      Math.floor(currentMinutes / 30) * 30
    )
      .toString()
      .padStart(2, "0")}:00`;
    formattedTimeFinal = `${currentHour.toString().padStart(2, "0")}:${(
      Math.floor(currentMinutes / 30) * 30 +
      29
    )
      .toString()
      .padStart(2, "0")}:59`;
  }

  const data = await readCSV("predicted_density_matrix.csv");

  // Buscar el paradero y el valor correspondiente a la hora actual
  const paraderoData = data.find((row) => row.paradero === codigoParadero);
  const densidadActual = paraderoData
    ? paraderoData[formattedTimeInit] || 0
    : 0;
  const comuna = paraderoData ? paraderoData["Comuna"] || 0 : 0;

  try {
    res.render("result", {
      codigoParadero,
      latitud: req.ubicacion.latitud,
      longitud: req.ubicacion.longitud,
      hora: `${formattedTimeInit} a ${formattedTimeFinal}`,
      densidad: densidadActual,
      comuna: comuna,
    });
  } catch (error) {
    console.error("Error al obtener la ubicación del paradero:", error);
    res.render("result", {
      codigoParadero,
      error: "Hubo un error al obtener la información del paradero",
    });
  }
});

// Ruta GET para obtener y mostrar las ubicaciones desde el CSV
app.get("/map", async (req, res) => {
  // Capturar el parámetro GET horaSeleccionada, si existe
  const horaSeleccionada = req.query.time;

  let formattedTimeInit, formattedTimeFinal;

  if (horaSeleccionada) {
    const date = horaSeleccionada.split(":");
    const hora = date[0];
    const minuto = date[1];
    // Utilizar la hora seleccionada en formato "HH:mm:00"
    formattedTimeInit = `${horaSeleccionada}`;
    formattedTimeFinal = `${hora}:${parseInt(minuto) + 29}:59`;
  } else {
    // Utilizar la hora actual en formato "HH:mm:00"
    const currentTime = new Date();
    const currentHour = currentTime.getHours();
    const currentMinutes = currentTime.getMinutes();

    formattedTimeInit = `${currentHour.toString().padStart(2, "0")}:${(
      Math.floor(currentMinutes / 30) * 30
    )
      .toString()
      .padStart(2, "0")}:00`;
    formattedTimeFinal = `${currentHour.toString().padStart(2, "0")}:${(
      Math.floor(currentMinutes / 30) * 30 +
      29
    )
      .toString()
      .padStart(2, "0")}:59`;
  }
  const dataPredicha = await readCSV("predicted_density_matrix.csv");
  try {
    // Verificar si existe el archivo CSV de ubicaciones
    if (!fs.existsSync(outputFilePath2)) {
      return res.status(400).send("No se encontraron ubicaciones guardadas.");
    }

    // Leer el archivo CSV y obtener los registros
    const ubicaciones = [];
    fs.createReadStream(outputFilePath2)
    .pipe(csv())
    .on("data", (row) => {
      // Buscar el paradero y el valor correspondiente a la hora actual
      let paradero = row.codigoParadero;
      const paraderoData = dataPredicha.find(
        (row) => row.paradero === paradero
      );
      const densidadActual = paraderoData
        ? paraderoData[formattedTimeInit] || 0
        : 0;
      const comuna = paraderoData ? paraderoData["Comuna"] || 0 : 0;
      let ubicacion = {
        codigoParadero: row.codigoParadero,
        latitud: parseFloat(row.latitud),
        longitud: parseFloat(row.longitud),
        densidad: densidadActual,
        comuna: comuna,
      };
      ubicaciones.push(ubicacion);
    })
    .on("end", () => {
      // Mostrar las ubicaciones obtenidas en la consola
      //console.log('Ubicaciones obtenidas:', ubicaciones);
      console.log("OK");
      // Verificar el número de ubicaciones obtenidas
      if (ubicaciones.length === 0) {
        console.error("No se encontraron ubicaciones en el archivo CSV.");
        return res
          .status(400)
          .send("No se encontraron ubicaciones en el archivo CSV.");
      }

      // Renderizar la vista con las ubicaciones encontradas
      res.render("map", {
        ubicaciones,
        hora: `${formattedTimeInit} a ${formattedTimeFinal}`,
      });
    });
  } catch (error) {
    console.error("Error al leer el archivo CSV de ubicaciones:", error);
    res.status(500).send("Error al leer el archivo CSV de ubicaciones.");
  }
});

// Ruta para renderizar el mapa de la ruta específica mostrando ambos sentidos
app.get("/ver-ruta/:id", async (req, res) => {
  const busCode = req.params.id;
  try {
    console.log("Obteniendo datos de la micro", req.params);
    console.log(busCode);
    
    // Definir las direcciones a obtener
    const direcciones = ['ida', 'vuelta'];
    
    // Crear un array de promesas para las solicitudes de ambas direcciones
    const solicitudes = direcciones.map(direccion => {
      return axios.get(
        `http://localhost:${PORT}/metadata/recorrido/${busCode}?direccion=${direccion}`
      ).then(response => ({
        direccion,
        data: response.data
      })).catch(error => {
        console.warn(`No se pudo obtener datos de ${direccion} para el servicio ${busCode}:`, error.message);
        return {
          direccion,
          data: null
        };
      });
    });
    
    // Esperar a que todas las solicitudes se completen
    const resultados = await Promise.all(solicitudes);
    
    // Construir el objeto con ambos recorridos
    const routeData = {};
    resultados.forEach(result => {
      if (result.data) {
        routeData[result.direccion] = result.data;
      }
    });
    
    // Pasar ambos recorridos a la vista
    res.render("ruta", { routeData: JSON.stringify(routeData), busCode });
  } catch (error) {
    console.error(`Error al obtener datos de la micro ${busCode}:`, error);
    res.status(500).send("No se pudo obtener la ruta.");
  }
});


// Ruta para obtener y almacenar ubicaciones de paraderos
app.get("/obtener-ubicaciones", async (req, res) => {
  try {
    await paraderosService.cargarCodigosParaderos();

    const codigosParaderos = paraderosService.codigosParaderos;

    if (codigosParaderos.length === 0) {
      return res.status(400).send("No se encontraron códigos de paradero.");
    }

    const ubicaciones = [];

    // Obtener y guardar la ubicación de cada paradero
    for (const codigoParadero of codigosParaderos) {
      const ubicacion = await paraderosService.obtenerUbicacionYGuardar(
        codigoParadero
      );
      ubicaciones.push(ubicacion);
    }

    res.json({ message: "Ubicaciones obtenidas y guardadas exitosamente." });
  } catch (error) {
    console.error("Error al obtener y guardar paraderos:", error);
    res.status(500).json({ error: "Hubo un error al procesar la solicitud." });
  }
});

// Ruta para obtener la ubicación de un paradero específico
app.get(
  "/paradero/:stopid",
  paraderosService.obtenerUbicacion,
  (req, res) => {
    res.json({ lat: req.ubicacion.latitud, lon: req.ubicacion.longitud });
  }
);

// Usar rutas
app.use("/old", old);

// Metadata
app.use('/metadata', paraderos);
app.use('/metadata', recorrido);
app.use('/metadata', recorridov2);
app.use('/metadata', subidas);
app.use('/metadata', espera);
app.use('/metadata', aglomeracion);


// Amenazas
app.use("/threats", metro);
app.use("/threats", alerts);
app.use("/threats", traffic);
app.use("/threats", disponibilidad);
app.use("/threats", trafficGoogle);

// Ruta para cargar datos en la base de datos manualmente
app.get("/importar-datos", async (req, res) => {
  try {
    await importarDataSubidas();
    await serviciosService.importarServicios();
    await paraderosService.processAndImportParaderos();
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

app.get('/cargar-rutas', async (req, res) => {
  try {
      await cargarRutasDeServicios();
      res.status(200).json({ message: 'Carga de rutas completada.' });
  } catch (error) {
      console.error('Error al cargar las rutas:', error);
      res.status(500).json({ message: 'Error al cargar las rutas.', error });
  }
});
// Ruta para corregir paraderos inválidos
app.get("/corregir-paraderos-invalidos", async (req, res) => {
  try {
    const csvFilePath = path.join(__dirname, outputFilePath2); // Ajusta la ruta si es necesario
    const paraderosInvalidos =
      await paraderosService.obtenerParaderosInvalidos(csvFilePath);

    if (paraderosInvalidos.length === 0) {
      return res
        .status(200)
        .json({ message: "No hay paraderos inválidos para corregir." });
    }

    // Procesar cada paradero inválido
    for (const codigoParadero of paraderosInvalidos) {
      console.log(`Intentando corregir el paradero: ${codigoParadero}`);
      await paraderosService.obtenerUbicacionYGuardar(codigoParadero);
    }

    res
      .status(200)
      .json({ message: "Paraderos inválidos procesados y corregidos." });
  } catch (error) {
    console.error("Error al corregir paraderos inválidos:", error);
    res.status(500).json({
      message: "Error al corregir paraderos inválidos.",
      error: error.message,
    });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
