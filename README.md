# La Biblioteca AH

Biblioteca personal de libros y audiolibros (Anderson y Samy). Servicio web en Docker en el servidor de casa,
usado desde Safari (iPhone), Chrome (Android) y el PC por Tailscale.

- Plan: `documentación/plan-maestro.md`
- Contratos entre componentes: `documentación/contratos.md`
- Bitácora: `seguimiento/bitacora.md`

| Carpeta | Qué es |
|---|---|
| `backend/` | Spring Boot 3.2 (discovery, gateway, auth, biblioteca-service) |
| `taller/` | Python + FastAPI: conversión de documentos y generación de voz |
| `frontend/` | Expo (web) |
