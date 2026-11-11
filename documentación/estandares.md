# Estándares de desarrollo — La Biblioteca AH

> Norma obligatoria del proyecto. Sale de los proyectos de referencia de Anderson (HexaQuantum, FrontHexa,
> dropshipping, tienda-web, servidor-personal, Pomodoro) y de Oh Churus, que es la vara de medir
> (cobertura bloqueante, Flyway, pruebas de arquitectura). Donde esos proyectos tienen fallos conocidos, aquí se corrigen.
> Versión 1 — 2026-11-10.

## Proceso
1. Plan aprobado antes de codificar (archivos, cambios, riesgos, cómo se valida). Cambios mínimos. Ante la duda, preguntar con opciones A/B.
2. Bitácora en el repo (`seguimiento/bitacora.md`): una entrada por sesión con **tabla de decisiones (Decisión | Elección | Motivo)**, compilaciones con fecha y resultado, pendientes. Lo obsoleto va a `seguimiento/archivo/`.
3. **Commits convencionales** `tipo(alcance): descripción` en español (`feat(biblioteca): …`, `fix(#12): …`), validados por hook `commit-msg` (`.githooks/`).
4. Renombrar siempre con `git mv`.
5. Cada endpoint nuevo o modificado se refleja en la colección Postman (`collection/`, una carpeta por servicio, variables sin tokens reales) y en la spec OpenAPI publicada.

## Seguridad y configuración
6. **Ningún secreto en git**: solo `.env.ejemplo`; CI falla si hay un `.env` trackeado y corre **gitleaks**.
7. Secretos sin valor por defecto (`${VAR:?falta VAR}` en compose; fallo temprano con mensaje claro en el código). Valores no secretos sí con defecto (`${MONGO…:localhost}` estilo).
8. Puertos internos solo en `127.0.0.1`; hacia afuera solo por Tailscale.
9. CORS con lista explícita (`CORS_ALLOWED_ORIGINS`), nunca `*` con credenciales.
10. JWT HMAC256 con roles; un token inválido o caducado da **401 JSON**, nunca 500. `anyRequest().authenticated()` al final. Actuator expuesto solo `health`.
11. Ningún endpoint recibe `userId` en el cuerpo; aislamiento entre usuarios probado.
12. Zona horaria **America/Bogota** en JVM (`-Duser.timezone`), BD y frontend.

## Backend (Spring Boot)
13. Paquetes: `controller / service (+impl) / repository (+custom +Impl) / dto/{input,output,filter} / entity / mapper / util / config / security / exception / enums / client / event`.
14. Convención de la casa (se mantiene por consistencia con Oh Churus y HexaQuantum): endpoints **POST** `/v1/{recurso}/{save,get/{id},all,delete/{id}}`, `ResultDTO{correct,message,errorCode,object}`, `PageDTO{page,size,totalPage,totalElements,list}` (20 por defecto, máximo 200). **Excepción documentada**: binarios por GET con `Range`.
15. Catálogo de `errorCode` documentado (`documentación/codigos-de-error.md`): 0 OK, 101 duplicado, 102 no encontrado, 103 error de proceso, 120 dato requerido, 401/403 seguridad, 503 almacenamiento no disponible.
16. Mensajes: enum `Message.Msj` + `messages_es.properties` vía `MessageSource` (no hay language-service: dos usuarios, un idioma; si un día se necesita, la clave ya existe). **Nada de textos escritos a mano en el código.**
17. `ValidationUtils` centralizado que lanza `ValidationException`; `@RestControllerAdvice` global la traduce a `ResultDTO`.
18. Entidades con `active` (borrado lógico donde aplique), `creation`, `lastUpdate`, `idModifiedBy`; la auditoría **no** sale en los DTO de salida. Unicidad de negocio en BD **y** en el servicio.
19. Mapeo con **MapStruct** en servicios nuevos (sin mezclar con ModelMapper dentro de un mismo servicio; auth-service conserva el patrón heredado).
20. **Flyway** `V{n}__descripcion.sql` con `ddl-auto=validate`. Nunca `update`, nunca `show-sql` en producción.
21. Cambios de entidades del dominio registrados por **evento asíncrono** (`EntityChangeEvent` + `@Async @EventListener`) en una tabla de cambios; un fallo de auditoría nunca tumba la operación y queda en log.
22. Llamadas entre servicios con `RestClient` y **timeouts explícitos** (5 s conexión / 30 s lectura), JWT propagado, sin tokens internos sin caché.
23. Logs con SLF4J, nunca `System.out`/`printStackTrace`; **ID de correlación** (`X-Request-Id`) generado en el gateway, propagado y puesto en el MDC. Ninguna excepción se traga sin log.
24. springdoc/OpenAPI con `@Tag`, `@Operation`, `@Schema(example)`; spec publicada en `documentación/api/` y comparada por test (`LaSpecPublicadaEstaAlDiaTest`).

## Pruebas (una sola puerta: si no pasa, no entra)
25. JUnit 5 con `@Nested` + `@DisplayName`, **aserciones de valor exacto**, nombres de prueba en español que describen el comportamiento (`UnTokenRobadoNoBastaTest`).
26. Testcontainers `postgres:14` con Flyway real para repositorios y consultas; Karate para la API por gateway (perfil `-Pkarate`).
27. **JaCoCo bloqueante en `verify`**: líneas ≥ 0.90, ramas ≥ 0.80 en servicios con lógica; `lombok.config` con `addLombokGeneratedAnnotation`.
28. Pruebas de arquitectura: ningún endpoint sin dueño, todo controller devuelve el contrato, ningún `userId` en el cuerpo, ningún archivo servido sin dueño.
29. Taller (Python): pytest con corpus generado, `ruff` (lint + formato) y `mypy` sin errores; cobertura ≥ 85%.
30. Frontend: Jest + Testing Library junto al código (`__tests__`), pruebas transversales de contraste AA (AAA en texto de lectura), nombres accesibles y objetivos táctiles ≥ 44 px; `tsc --noEmit` limpio.

## Frontend
31. Variables de entorno validadas con **zod** al arrancar (`src/config/entorno.ts`, estilo t3-env).
32. Formularios con esquemas **zod** (`src/validaciones/*`).
33. Alias de ruta (`@componentes`, `@servicios`, `@pantallas`, `@tema`…), atomic design, servicios de API por microservicio.
34. ESLint estricto (`@typescript-eslint/no-explicit-any` activo) + Prettier (comillas simples, sin punto y coma, ancho 120, imports ordenados).
35. Nada que dependa solo del color; respeta "Reducir movimiento".

## DevOps
36. Dockerfiles **multi-etapa**, imagen base con versión fija, **usuario no root**, `HEALTHCHECK`, `.dockerignore` — en Java, Python y frontend.
37. Compose base + `docker-compose.override.yml` solo para diferencias locales; `depends_on: condition: service_healthy`; límites de memoria.
38. CI (`.github/workflows/ci.yml`): versiones fijadas en `env`, `concurrency` que cancela la ejecución anterior, `LANG=C.UTF-8`, jobs: secretos (env + gitleaks), backend `mvn -B clean verify`, taller `ruff + mypy + pytest`, frontend `lint + tsc + jest`. Sonar en workflow aparte: mide, no decide.
39. Respaldos con `pg_dump -Fc` + globals + sha256 + rotación, y `restore` simétrico; scripts idempotentes que imprimen una línea final `RESUMEN:` o `FALLA:`, con modo simulación antes de ejecutar.

## Anti-patrones prohibidos (vistos en proyectos previos)
Secretos o dumps commiteados · contraseñas por defecto en el código · `ddl-auto=update` · `ApplicationTests` vacíos como única prueba ·
`System.out` · `catch (Exception ignored)` · token interno pedido en cada llamada · filtro JWT que devuelve 500 ·
CORS `*` con credenciales · `allow-bean-definition-overriding` como parche · contenedores como root sin healthcheck ·
versiones de Node distintas entre etapas · librerías comunes que nadie usa.
