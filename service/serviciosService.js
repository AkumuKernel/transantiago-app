const { pool } = require('../database');
const axios = require('axios');

require('dotenv').config();


// Función para importar los servicios
async function importarServicios() {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
  
      // Hacer la solicitud a la API para obtener los IDs de servicios
      const response = await axios.get('https://www.red.cl/restservice_v2/rest/getservicios/all');
      const servicios = response.data; // Esto debería ser un array de IDs
  
      // Verificar que los datos sean un array
      if (!Array.isArray(servicios)) {
        throw new Error('La respuesta de la API no es un array de servicios.');
      }
  
      // Preparar la consulta de inserción
      const insertValues = servicios.map((id) => [id]);
  
      // Generar la consulta parametrizada
      const placeholders = insertValues.map(
        (_, i) => `($${i + 1})`
      ).join(', ');
  
      const query = `
        INSERT INTO servicios (id)
        VALUES ${placeholders}
        ON CONFLICT (id) DO NOTHING
      `;
  
      // Aplanar el array de valores
      const flatValues = insertValues.flat();
  
      // Ejecutar la consulta
      await client.query(query, flatValues);
  
      await client.query('COMMIT');
      console.log('Servicios importados exitosamente.');
      return { message: 'Servicios importados exitosamente.' };
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Error al importar servicios:', err);
      throw err;
    } finally {
      client.release();
    }
  }
  // Función para obtener todos los servicios desde la base de datos
async function obtenerServicios() {
  const client = await pool.connect();
  try {
      const res = await client.query('SELECT id FROM servicios');
      return res.rows.map(row => row.id);
  } catch (error) {
      console.error('Error al obtener los servicios:', error);
      throw error;
  } finally {
      client.release();
  }
}


  
  module.exports = { importarServicios, obtenerServicios} ;