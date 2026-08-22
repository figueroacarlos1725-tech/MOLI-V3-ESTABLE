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
- Se restringió el registro público a los roles `rider` y `driver`; administradores y operadores ya no pueden autogenerarse desde la API pública.
- Se confirmó que el repositorio recuperado no incluye Marketplace. Se agregó al alcance obligatorio el rol comercio, aprobación administrativa, catálogo, carrito, pedidos y entrega mediante conductores Moli.
- Se fijó la operación del Marketplace: panel comercial estilo PedidosYa, entrega Moli obligatoria y despacho automático al conductor en línea/disponible más cercano sin restringirlo a auto, moto o taxi.
- Se definió prioridad escalonada para delivery: primera ronda solo motos cercanas; sin disponibilidad o aceptación, ampliar a autos, taxis y demás vehículos habilitados.
- Se aclaró el fulfillment del Marketplace: el cliente puede elegir retiro en el local o delivery Moli; solo delivery genera despacho y costo de envío.
- Se definieron efectivo, transferencia y Mercado Pago; alias propios para prestadores/comercios; y comisiones administrables por módulo, incluida política Marketplace para conductor solo o conductor más comercio.
- Se añadió al alcance un módulo administrador de campañas tipo historias con imagen/video, cuenta regresiva, cierre posterior, frecuencia configurable, botón y deep links a comercios/productos del Marketplace.
- Se documentó la arquitectura financiera idempotente: deuda de comisión para cobros directos, bases separadas de delivery/mercadería, reglas versionadas, conciliación y panel financiero profesional.
- Se auditó el sistema legado de banners: existen endpoints y esquemas incompatibles, cierre inmediato, video simulado y ausencia de frecuencia/métricas; se definió migración compatible hacia campañas administradas por servidor.
- Se definió comunicación dentro de Moli: llamadas de voz WebRTC sin revelar teléfonos y chat cliente-profesional con imágenes privadas, validadas y sin metadatos GPS.
- Se estableció como regla de seguridad que un profesional no reciba domicilio ni coordenadas exactas antes de aceptar; la redacción debe ejecutarse en API, notificaciones y WebSocket, no solo en la interfaz.
- Se diseñó la revisión interactiva y exclusiva de solicitudes: el cliente verá quién está revisando, si aceptó o si la solicitud pasó al siguiente profesional, con bloqueo atómico y vencimiento para evitar dobles asignaciones.
- Se extendió la revisión interactiva a viajes de auto, moto, taxi y demás categorías: tarjeta compacta de conductor revisando, cuenta regresiva, transición a búsqueda del siguiente y asignación únicamente después de aceptar.
- Se fijó la dirección UX/UI: combinar claridad premium y confianza tipo Cabify con velocidad operativa y estados visibles tipo DiDi, bajo una identidad Moli propia, accesible y compartida por movilidad, profesionales, trámites y Marketplace.
