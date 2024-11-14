const express = require('express');
const router = express.Router();
const axios = require('axios');
const { insertData, connect, disconnect } = require('../database');

const metro = "https://www.metro.cl/api/estadoRedDetalle.php";
const ubicaciones = "https://www.metro.cl/api/estaciones.php";

function buscarPorCodigo(data, codigo) {
  return data.estaciones.find(estacion => estacion.codigo === codigo);
}

router.get('/metro', async (req, res) => {
    try {
        await connect();
        const data = await obtenerEstadosMetro(metro, ubicaciones);

        if(data){
            console.log('OK');
            res.status(200).json(data);
        } else {
            res.status(404).json( { message: 'Datos no encontrados'} );
        }
    } catch (error) {
        console.error('Error en la importación:', error);
        res.status(500).json({ message: 'Error en la importación de datos.' });
    } finally {
      console.log('Datos guardados en la tabla metro')
      // await disconnect();
    }
});

async function insertMetro(nombre, codigo, estado, combinacion, linea, coordenadas) {
  try {
      const coords = coordenadas.split(",");
      // Inserta o actualiza los datos en la tabla metro
      const instruccion = {
          'tabla': 'metro',
          'datos': {
              'nombre': nombre,
              'codigo': codigo,
              'estado': estado,
              'combinacion': combinacion,
              'linea':  linea,
              'geom': `POINT(${coords[1]} ${coords[0]})`
          },
          'conflict': `ON CONFLICT (codigo) DO UPDATE 
                       SET nombre = EXCLUDED.nombre,
                           estado = EXCLUDED.estado,
                           combinacion = EXCLUDED.combinacion,
                           linea = EXCLUDED.linea`
      };
      await insertData(instruccion);
  } catch (error) {
      console.error(`Error al insertar el estado de la estacion ${nombre}:`, error);
  }
}

// Metro
async function obtenerEstadosMetro(url, url2) {
    try {
      const response = await axios.get(url);
      const data = response.data;

      const response2 = await axios.get(url2);
      const estaciones = response2.data;
  
      // Llama a la función que procesa los datos del JSON
      const datosProcesados = obtenerDatosServicios(data, estaciones);
      // console.log(datosProcesados);
      return datosProcesados;
  
    } catch (error) {
      console.error("Error al obtener los datos:", error);
    }
  }
  
  function obtenerDatosServicios(data, point) {
    const resultado = [];

    const lineas = Object.keys(data);
  
    lineas.forEach((linea) => {
      const estaciones = data[linea].estaciones;
  
      estaciones.forEach((estacion) => {
        const coordenadas = buscarPorCodigo(point, estacion.codigo).coordenadas;
        const estacionData = {
          nombre: estacion.nombre,
          codigo: estacion.codigo,
          estado: estacion.estado,
          combinacion: estacion.combinacion,
          linea: linea,
          coordenadas: coordenadas
        };
        resultado.push(estacionData);

        insertMetro(estacion.nombre, estacion.codigo, estacion.estado, estacion.combinacion, linea, coordenadas);

      });

    });
  
    return resultado;
  }

module.exports = router;