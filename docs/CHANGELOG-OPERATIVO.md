# Changelog operativo

## 2026-09-06 — Portada Moli Play Premium

- Se aprobó e implementó la nueva dirección visual de la portada cliente: fondo crema con profundidad, buscador elevado, CTA táctil, hero verificado y categorías tipo misión.
- Los profesionales disponibles muestran avatar, estado en línea, insignia verificada, reputación y trabajos completados.
- El color primario global pasa a naranja vivo `#FF5A1F` con profundidad `#E9480B`, manteniendo carbón y verde semántico.

## 2026-09-06 — Paquete visual de oficios

- Se incorporó `Moli Oficios v1` con ocho ilustraciones originales y transparentes para categorías profesionales.
- La portada cliente ahora muestra retratos ficticios en profesionales disponibles y el nuevo emblema de herramientas verificadas.
- Los recursos fueron optimizados a 512 × 512 px para mantener calidad visual sin cargar los originales de alta resolución en la aplicación.

## 2026-09-06 — Acceso orientado a profesionales y trámites

- Se reemplazó el selector de módulos posterior al login del cliente por la portada aprobada: búsqueda, solicitud principal de profesional, categorías, prestadores disponibles y acceso destacado a trámites; Viajes y Market quedan como accesos secundarios.
- La portada consume un listado autenticado y reducido de profesionales disponibles que no expone teléfono, email, domicilio ni coordenadas.
- Se corrigió el proxy `/api/` del frontend web QA: el login y las comprobaciones de versión vuelven a llegar al backend aun cuando la URL pública no se incrusta durante el export de Expo.
- Se adaptaron splash, bienvenida e ingreso a la identidad visual aprobada para el foco inicial en oficios/profesionales y trámites.
- El ingreso principal continúa usando correo y contraseña, con formularios desplazables y adaptables a pantallas pequeñas.
- El alta usa verificación por email de forma predeterminada; WhatsApp quedó oculto detrás de una bandera de entorno hasta disponer de API y plantilla aprobada.
- Se incorporó el acceso visual por Google detrás de configuración explícita. No se habilita ni simula OAuth mientras falten las credenciales propias de Moli.
- Se mantuvieron intactos el paquete Android `com.digigo.app`, `versionCode` y la configuración de firma/Play.

## 2026-08-22 — Admin: campañas, comisiones y capacidades

- Se reemplazó la pantalla legacy de banners por el gestor de campañas seguro conectado a `/api/admin/ads/campaigns`.
- Se agregaron destinos externos exclusivamente HTTPS y destinos internos validados a comercios/productos activos de Marketplace.
- Se expusieron segmentación, disparadores, cuenta regresiva, cierre, cooldown y límites por usuario/sesión/operación.
- Se agregó lectura de la última versión de reglas de comisión Marketplace y edición separada para conductor y comercio.
- Se corrigieron etiquetas administrativas y candidatos del despacho manual según capacidades explícitas.
- Se añadió prueba del colapso determinista de versiones de comisión. No se modificaron secretos ni entornos externos.

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
- Se creó una nueva upload key fuera del repositorio y se envió su certificado público para restablecer la clave de carga. Play Console confirmó que la nueva clave entra en vigencia el 2026-08-24 a las 06:06 UTC; hasta entonces bloquea la carga de AAB/APK.
- Play Console confirmó acceso a producción para `com.digigo.app` y habilitación de pruebas abiertas. El segmento abierto aún requiere seleccionar países/regiones, cargar la versión, revisar la vista previa y enviarla a revisión.
- Se configuró Argentina como único país segmentado para la prueba abierta. El cambio quedó guardado en Descripción general de la publicación y se enviará a revisión junto con la próxima versión, no por separado.
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
- Se consolidó una única bandeja operativa para usuarios multirrol: viajes, trabajos, trámites, paquetería, envíos y reparto se reciben en la misma pantalla, sin cambiar de cuenta o módulo.
- Se definió protección antielusión en chats: teléfonos y otros contactos se redactan en servidor y se muestran difuminados; las imágenes pasan por OCR y bloqueo/difuminado antes de ser accesibles al destinatario.
- Se implementó hardening de trabajos/trámites: autorización, privacidad del domicilio, revisión y aceptación atómicas, FSM, cancelación y calificación segura.
- Se implementó el núcleo Marketplace con aprobación comercial, catálogo, carrito mono-comercio, retiro/delivery, prioridad moto con fallback y liquidación de comisiones idempotente.
- Se implementó la API unificada de campañas con targeting, frecuencia, countdown, métricas y destinos HTTPS/Marketplace validados.
- Se agregó registro telefónico con OTP por WhatsApp, capacidades múltiples, cola de aprobación administrativa y auditoría, configurable sin guardar credenciales en Git.
- Se eliminó la clave predeterminada insegura del adaptador WhatsApp legado.
- Android quedó configurado como `com.digigo.app`, versión `1.0.22` (25), con perfiles separados para APK QA y AAB de tienda; la carga continúa bloqueada hasta aprobarse la nueva upload key.
- El OTP de alta se amplió a teléfono más email, canal seleccionable WhatsApp/email, fallback automático e inicio de sesión sin contraseña con tokens de propósito único.
- Se configuró en el entorno QA, sin exponer secretos, el proveedor Resend ya disponible en Comprax; ambas aplicaciones permanecen aisladas a nivel de datos.
- Se completó la interfaz de alta con teléfono, email, OTP WhatsApp/email, fallback, capacidades múltiples y aprobación administrativa.
- Se añadió el MVP móvil de Marketplace, el panel operativo de comercio y la bandeja unificada para prestadores multirrol.
- Se añadieron listados públicos de comercios aprobados y una bandeja de pedidos aislada por propietario del comercio.
- Se crearon seis identidades maestras de QA en el VPS y se validaron login, trabajo profesional y pedido Marketplace mediante la API real; sus claves permanecen fuera de Git.
- Se aprobó y aplicó el nuevo sistema visual Moli: naranja cálido `#FF7733`, carbón `#202124`, superficies blancas/grises cálidas, mapas claros, sombras suaves y marca naranja/negra propia.
- Se rediseñaron acceso, movilidad, bandeja multirrol, trabajos, Marketplace y administración; el selector de vehículo ahora utiliza iconos reutilizables propios en lugar de emojis.
- Se corrigió la búsqueda de destinos: cuando Google no entrega resultados, la API usa OpenStreetMap/Nominatim con consultas codificadas y cabecera identificable.
- El checkout cliente de Marketplace geocodifica delivery mediante la API unificada, conserva una clave idempotente por intento y abre una pantalla de confirmación/seguimiento tras crear la orden.
- Se añadieron endpoints autenticados para que cada cliente liste y consulte únicamente sus propios pedidos de Marketplace.
- El selector de módulos ahora muestra Moli Trámites y abre el formulario con la categoría de trámites preseleccionada.
- Perfil cliente usa diálogos compatibles con web para métodos de pago y cierre de sesión, manteniendo el color primario `#FF7733`.
- Se corrigieron los accesos de la bandeja multirrol: Trámites conserva su filtro y Delivery/Paquetería ya no redirigen al inicio de Viajes.
- Se agregó la bandeja de repartos Marketplace con privacidad preaceptación, aceptación exclusiva y avance controlado hasta entrega.
- El control `GO` conserva un área táctil estable, rol accesible y estado de carga; el pulso quedó limitado a una capa decorativa.
- Billetera permite solicitar retiros por alias mediante una operación pendiente e idempotente que valida saldo disponible.
- Se agregó una imagen web QA con configuración nginx `try_files ... /index.html` para evitar rutas internas 404.
- Se conectó la API unificada de campañas con los flujos cliente de viaje, trabajo, trámite, comercio y pedido; la app muestra imagen/video, respeta countdown/frecuencia del servidor y limita la navegación a HTTPS o destinos Marketplace tipados.
