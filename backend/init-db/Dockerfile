# Postgres de La Biblioteca AH con el script de creacion de bases incluido.
# Se hornea en la imagen (no bind mount) porque en casa solo se cargan imagenes con docker load,
# y porque Docker Desktop no ve carpetas de unidades de red.
FROM postgres:14.15
COPY --chmod=0444 init-databases.sql /docker-entrypoint-initdb.d/
