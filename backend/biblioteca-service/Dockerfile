# syntax=docker/dockerfile:1
# Imagen multi-etapa de biblioteca-service (estandares §36).
# CONTEXTO DE CONSTRUCCION: la carpeta backend/ (hace falta el pom padre):
#   docker build -f backend/biblioteca-service/Dockerfile backend
# En docker-compose: build: { context: ./backend, dockerfile: biblioteca-service/Dockerfile }

# ---- Etapa 1: compilar ------------------------------------------------------
FROM maven:3.9.9-eclipse-temurin-17 AS build
WORKDIR /src
COPY pom.xml lombok.config ./
COPY discovery-service/pom.xml discovery-service/pom.xml
COPY gateway-service/pom.xml gateway-service/pom.xml
COPY auth-service/pom.xml auth-service/pom.xml
COPY biblioteca-service/pom.xml biblioteca-service/pom.xml
RUN mvn -B -q -pl biblioteca-service -am dependency:go-offline -DskipTests || true
COPY biblioteca-service/src biblioteca-service/src
# Las pruebas corren en CI (mvn clean verify); aqui solo se empaqueta.
RUN mvn -B -q -pl biblioteca-service -am package -DskipTests -Djacoco.skip=true

# ---- Etapa 2: ejecutar ------------------------------------------------------
FROM eclipse-temurin:17-jre-jammy
RUN apt-get update && apt-get install -y --no-install-recommends wget     && rm -rf /var/lib/apt/lists/*     && groupadd --system --gid 10001 app && useradd --system --uid 10001 --gid app --home /app app
WORKDIR /app
COPY --from=build /src/biblioteca-service/target/biblioteca-service-0.0.1-SNAPSHOT.jar app.jar
USER app
ENV TZ=America/Bogota
EXPOSE 8925
HEALTHCHECK --interval=15s --timeout=5s --start-period=60s --retries=10     CMD wget -qO- http://localhost:8925/biblioteca/actuator/health || exit 1
ENTRYPOINT ["java", "-Duser.timezone=America/Bogota", "-jar", "app.jar"]
