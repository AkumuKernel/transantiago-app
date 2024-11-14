SELECT * FROM pgr_dijkstra(
    'SELECT id, origen, destino, distancia AS cost FROM recorridos',
    start_id,  -- ID del paradero de inicio
    end_id,     -- ID del paradero de destino
    directed := false
);

SELECT * FROM pgr_dijkstra(
    'SELECT id, origen, destino, distancia AS cost FROM recorridos',
    'PC437',  -- ID del paradero de inicio
    'PC795',     -- ID del paradero de destino
    false
);