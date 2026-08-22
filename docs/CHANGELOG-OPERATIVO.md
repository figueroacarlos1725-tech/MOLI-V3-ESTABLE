# Changelog operativo

## 2026-08-22 — Recuperación y preparación QA

- Se recuperó el repositorio estable y se abrió `qa/role-flow-hardening`.
- Se corrigió propagación del rol profesional en autenticación.
- Se corrigió creación administrativa de contraseñas y el filtrado de hashes.
- Se añadió la categoría base Trámites.
- Se confirmó el VPS compartido y se separó Moli de Comprax y del bot legado.
- Se añadió despliegue reproducible para backend/Mongo QA.
- El build QA excluye la dependencia privada `emergentintegrations`; el resto de la API permanece disponible y el soporte IA queda pendiente de migración.
- Se asignó un alias Mongo exclusivo a QA para evitar colisión DNS con el bot legado en la red compartida.
- Se documentaron producto, infraestructura, continuidad de Play y matriz de pruebas.
- Se confirmó en Play Console el acceso a pruebas abiertas/producción, Play App Signing y la versión máxima `1.0.21` (24) de `com.digigo.app`.
- Se creó una nueva upload key fuera del repositorio y se envió su certificado público para restablecer la clave de carga; Play Console dejó la solicitud en estado pendiente.
