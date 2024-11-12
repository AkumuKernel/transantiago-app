-- Extensión para GeoJson
CREATE EXTENSION IF NOT EXISTS postgis;

-- Extensión para dijkstra
CREATE EXTENSION IF NOT EXISTS pgrouting;


--Extensión para UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
-------------------------------------------------------------------------------------------------------------------------------------------
--Aglomeracion
CREATE TABLE aglomeracion (
    paradero VARCHAR(255) PRIMARY KEY,                          --Código paradero
    comuna VARCHAR(255),                                        --Comuna del paradero
    "5:30:00" FLOAT,
    "6:00:00" FLOAT,
    "6:30:00" FLOAT,
    "7:00:00" FLOAT,
    "7:30:00" FLOAT,
    "8:00:00" FLOAT,
    "8:30:00" FLOAT,
    "9:00:00" FLOAT,
    "9:30:00" FLOAT,
    "10:00:00" FLOAT,
    "10:30:00" FLOAT,
    "11:00:00" FLOAT,
    "11:30:00" FLOAT,
    "12:00:00" FLOAT,
    "12:30:00" FLOAT,
    "13:00:00" FLOAT,
    "13:30:00" FLOAT,
    "14:00:00" FLOAT,
    "14:30:00" FLOAT,
    "15:00:00" FLOAT,
    "15:30:00" FLOAT,
    "16:00:00" FLOAT,
    "16:30:00" FLOAT,
    "17:00:00" FLOAT,
    "17:30:00" FLOAT,
    "18:00:00" FLOAT,
    "18:30:00" FLOAT,
    "19:00:00" FLOAT,
    "19:30:00" FLOAT,
    "20:00:00" FLOAT,
    "20:30:00" FLOAT,
    "21:00:00" FLOAT,
    "21:30:00" FLOAT,
    "22:00:00" FLOAT,
    "22:30:00" FLOAT,
    "23:00:00" FLOAT,
    "23:30:00" FLOAT
);
-------------------------------------------------------------------------------------------------------------------------------------
--Subidas
CREATE TABLE subidas (
    paradero VARCHAR(255) PRIMARY KEY,                          --Código del paradero
    comuna VARCHAR(255),                                        --Comuna del paradero
    "5:30:00" FLOAT,
    "6:00:00" FLOAT,
    "6:30:00" FLOAT,
    "7:00:00" FLOAT,
    "7:30:00" FLOAT,
    "8:00:00" FLOAT,
    "8:30:00" FLOAT,
    "9:00:00" FLOAT,
    "9:30:00" FLOAT,
    "10:00:00" FLOAT,
    "10:30:00" FLOAT,
    "11:00:00" FLOAT,
    "11:30:00" FLOAT,
    "12:00:00" FLOAT,
    "12:30:00" FLOAT,
    "13:00:00" FLOAT,
    "13:30:00" FLOAT,
    "14:00:00" FLOAT,
    "14:30:00" FLOAT,
    "15:00:00" FLOAT,
    "15:30:00" FLOAT,
    "16:00:00" FLOAT,
    "16:30:00" FLOAT,
    "17:00:00" FLOAT,
    "17:30:00" FLOAT,
    "18:00:00" FLOAT,
    "18:30:00" FLOAT,
    "19:00:00" FLOAT,
    "19:30:00" FLOAT,
    "20:00:00" FLOAT,
    "20:30:00" FLOAT,
    "21:00:00" FLOAT,
    "21:30:00" FLOAT,
    "22:00:00" FLOAT,
    "22:30:00" FLOAT,
    "23:00:00" FLOAT,
    "23:30:00" FLOAT
);

------------------------------------------------------------------------------------------------------------------------------------------
--Infraestructura

#Recorridos
CREATE TABLE recorridos (
    codigo VARCHAR(50) PRIMARY KEY,
    geom geometry(LINESTRING, 4326) -- Usamos el tipo LINESTRING con SRID 4326 (WGS 84)
);
#Paraderos
CREATE TABLE paraderos (
    codigo VARCHAR(50) PRIMARY KEY,                             --Código del paradero
    geom GEOMETRY(Point, 4326),                          --Coordenadas del paradero         
    servicios JSONB            
);
--Tramos ruta
CREATE TABLE tramos_ruta (
    id SERIAL PRIMARY KEY,                                      --Identificador único
    origen VARCHAR(10) REFERENCES paraderos(codigo),            --Paradero de origen
    destino VARCHAR(10) REFERENCES paraderos(codigo),           --Paradero de destino
    distancia DOUBLE PRECISION,                                 --Peso de la arista, puede ser la distancia entre los paraderos
    geom GEOMETRY(LineString, 4326)                             --Coordenadas que unen los paraderos
);
----------------------------------------------------------------------------------------------------------------------------------------
-- servicios
CREATE TABLE servicios (
    id VARCHAR(10) PRIMARY KEY
);

-- Espera
CREATE TABLE espera (
    id SERIAL PRIMARY KEY,                                      -- Identificador único
    paradero VARCHAR(20) NOT NULL REFERENCES paraderos(codigo), -- Código del paradero consultado
    servicio VARCHAR(10) NOT NULL REFERENCES servicios(id),     -- Recorrido de bus en camino
    bus VARCHAR(20) NOT NULL,                                   -- Identificador del bus
    distancia INT NOT NULL,                                     -- Distancia (en metros) del bus al paradero consultado
    llegada_min INT NOT NULL,                                   -- Tiempo mínimo estimado de llegada del bus
    llegada_max INT NOT NULL,                                   -- Tiempo máximo estimado de llegada del bus
    consulta TIMESTAMP DEFAULT CURRENT_TIMESTAMP                -- Tiempo en el que se realizó la consulta
);

----------------------------------------------------------------------------------------------------------------------------------------
--Alertas
CREATE TABLE alertas (
    uuid UUID PRIMARY KEY,                                      --ID único del reporte
    calle VARCHAR(100),                                         --Calle donde se origina el incidente
    tipo VARCHAR(50),                                           --Tipo de alerta (policia, tráfico, calle cerrada)
    subtipo VARCHAR(50),                                        --Subtipo (alta congestión)
    descripcion TEXT,                                           --Descripción del reporte
    geom GEOGRAPHY(POINT, 4326)                                 --Coordenadas del reporte
);
------------------------------------------------------------------------------------------------------------------------------------------
--Metro
CREATE TABLE metro (
    id SERIAL PRIMARY KEY,                                      --Identificador único
    nombre VARCHAR(255) NOT NULL,                               --Nombre de la estación
    codigo VARCHAR(10) NOT NULL UNIQUE,                         --Código único para la estación (siglas)
    estado VARCHAR(1) NOT NULL,                                 --Estado de la estación
    combinacion VARCHAR(10),                                    --Línea con la que se combina (puede ser NULL)
    linea VARCHAR(10) NOT NULL                                  --Línea a la que pertenece la estación
);
------------------------------------------------------------------------------------------------------------------------------------------
--Tráfico_Waze
CREATE TABLE trafico (
    id SERIAL PRIMARY KEY,                                      --Identificador único
    geom GEOMETRY(LineString, 4326),                            --Coordenadas del incidente
    descripcion VARCHAR(255),                                   --Tipo de incidente (trabajos, policia, congestion)
    creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP                --Hora de creación del incidente
);

-------------------------------------------------------------------
