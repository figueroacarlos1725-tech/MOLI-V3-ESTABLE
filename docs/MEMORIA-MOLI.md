# Memoria viva de Moli

Última actualización: 2026-08-22

## Producto

Moli reúne movilidad y contratación de servicios en una misma identidad:

- Cliente/pasajero: solicita viajes, profesionales y trámites; sigue estados; cancela y califica.
- Conductor: se conecta, recibe ofertas de viaje y ejecuta el ciclo asignado/en camino/iniciado/completado.
- Profesional: configura perfil/categorías, recibe solicitudes, cotiza o acepta y ejecuta trabajos.
- Conductor + profesional: usa ambos módulos desde una misma sesión y una pantalla unificada de acceso.
- Admin/operador: administra usuarios, conductores y profesionales; observa demanda; realiza despacho manual; interviene en estados e incidencias.
- Comercio: solicita el alta comercial, completa datos y documentación, publica catálogo/productos, recibe pedidos y administra preparación/entrega.
- Marketplace: el cliente descubre comercios y productos, arma carrito, crea el pedido y sigue preparación, retiro o entrega. La entrega puede asignarse a un conductor Moli.

## Dirección de diseño y experiencia

- La experiencia visual de Moli toma como referencia la claridad premium y la confianza de Cabify junto con la rapidez operativa, visibilidad de estados y accesibilidad de DiDi, sin copiar identidad, recursos gráficos ni pantallas de ninguna marca.
- El lenguaje propio de Moli debe sentirse cercano, moderno y latinoamericano: superficies claras, color de marca usado con intención, tipografía muy legible, mapas protagonistas, tarjetas inferiores amplias, bordes suaves y una sola acción primaria evidente por estado.
- La pantalla inicial concentra los accesos a `Viaje`, `Moto`, `Profesional`, `Trámite` y `Marketplace` sin convertir el inicio en una grilla saturada. Los accesos frecuentes y la ubicación actual reducen pasos, pero cada flujo conserva contexto y salida clara.
- Solicitar un servicio sigue una progresión corta y consistente: necesidad/destino, opciones y precio estimado, método de pago, confirmación, búsqueda, revisión, asignación, servicio activo y calificación.
- Los estados vivos son el diferencial de Moli: tarjetas compactas muestran quién revisa, cuenta regresiva, siguiente búsqueda y aceptación mediante texto humano y animación discreta. Nunca se confunde `revisando` con `asignado`.
- En viajes se muestran antes de confirmar categoría, tiempo estimado, capacidad y precio transparente. Tras asignar se priorizan foto, identidad verificada, vehículo/patente, llegada, llamada/chat, compartir y seguridad.
- Profesionales, trámites, comercio y delivery reutilizan el mismo sistema visual de mapa, tarjetas, estados, pagos y soporte para que Moli se sienta como una sola aplicación y no como módulos separados.
- El conductor-profesional dispone de una bandeja operativa unificada con tarjetas visualmente diferenciadas por viaje, entrega, trabajo o trámite, filtros simples y una sola disponibilidad global configurable.
- Esa bandeja es la única pantalla operativa para una persona con múltiples capacidades: viajes de auto/moto/taxi, servicios profesionales, trámites, paquetería, envíos, reparto de Marketplace y futuras clases de trabajo. No se obliga a cambiar de cuenta ni a navegar por paneles separados; filtros, permisos y disponibilidad determinan qué oportunidades recibe.
- El diseño es accesible desde el inicio: contraste AA, blancos táctiles de al menos 44 px, texto escalable, lectores de pantalla, estados que no dependan únicamente del color y uso moderado de movimiento.
- Publicidad y promociones respetan el servicio principal: no cubren seguridad, navegación crítica, llamada, cancelación ni emergencias y mantienen siempre una salida clara conforme a la cuenta regresiva configurada.

### Regla operativa del Marketplace

- Cada comercio aprobado dispone de un panel operativo propio, inspirado en PedidosYa: alerta de pedido nuevo, aceptar/rechazar, tiempo estimado, preparación, pedido listo, repartidor asignado, retiro y entrega.
- En el checkout, el cliente elige entre `retiro_en_local` o `delivery_moli`.
- Un pedido con retiro en el local no genera solicitud de conductor ni costo de envío; el comercio lo marca listo y el cliente confirma el retiro.
- Un pedido con delivery Moli genera el despacho cuando el comercio lo marca listo. El sistema busca automáticamente al conductor habilitado, conectado y disponible más cercano al comercio, respetando prioridad por tipo de vehículo.
- Primera ronda: se ofrece exclusivamente a motos cercanas, ordenadas por distancia.
- Si ninguna moto está disponible o acepta dentro del tiempo configurado, el despacho amplía la oferta a autos, taxis y otras clases habilitadas para delivery, también ordenadas por cercanía.
- Si el pedido es delivery y no hay conductores disponibles, permanece en cola de despacho y se reintenta al conectarse uno; la interfaz nunca debe prometer asignación instantánea.
- El mismo conductor usa su sesión Moli habitual y recibe una tarjeta de “Entrega de pedido”, sin otra cuenta ni aplicación.
- Para delivery, la relación pedido-entrega debe ser idempotente: un pedido genera una sola solicitud activa, una sola asignación y una sola liquidación, incluso ante reintentos o doble toque.

## Pagos, alias y comisiones

- Métodos admitidos en viajes, trabajos/trámites y Marketplace: `efectivo`, `transferencia` y `mercadopago`.
- Conductores, profesionales y comercios pueden registrar sus propios datos de cobro permitidos, incluido alias de transferencia. Esos datos se validan, pueden desactivarse y solo se muestran a las partes de una operación asignada.
- El checkout o solicitud debe mostrar con claridad quién recibe cada componente: servicio/productos, costo de envío, propina y comisión, sin exponer credenciales privadas.
- Moli cobra comisión a los conductores por todos los servicios que realizan.
- En Marketplace, el administrador elige la política de comisión: `solo_conductor` o `conductor_y_comercio`. Las tasas del conductor y del comercio se configuran por separado.
- El panel administrador configura comisiones por módulo, tipo de servicio, comercio o conductor cuando corresponda; también mínimos, vigencia, impuestos/recargos y excepciones auditadas.
- Cada operación financiera debe tener referencia única e idempotente. Reintentos, dobles toques o webhooks repetidos no pueden duplicar comisión, saldo, devolución ni ganancia.
- Efectivo y transferencia requieren estado de confirmación/conciliación; Mercado Pago requiere webhook verificado y credenciales fuera de Git.
- Efectivo o transferencia directa no significan que la plataforma haya cobrado: el receptor cobra el bruto y Moli registra su comisión como deuda/liquidación. Una transferencia necesita confirmación de las partes o intervención auditada; una captura de pantalla por sí sola no prueba el pago.
- En Marketplace, la comisión del conductor se calcula sobre el componente de entrega y la del comercio sobre el subtotal de productos; nunca se cobra por error al conductor sobre la mercadería.
- Toda operación guarda una copia de la regla de comisión y los datos de cobro vigentes al aceptarse. Cambios posteriores en Admin solo afectan operaciones nuevas.
- El panel financiero de Admin incluye resumen, métodos por módulo, matriz de comisiones, simulador, versiones, pagos/liquidaciones, alias, conciliación y auditoría. Los secretos de Mercado Pago se muestran únicamente como “configurado” y nunca se devuelven completos.

## Publicidad y campañas

- El administrador dispone de un módulo profesional de campañas estilo historias/interstitial.
- Una campaña admite imagen o video, título/texto opcional, botón, URL externa permitida o destino interno de Marketplace (comercio o producto).
- El administrador configura audiencia y contexto: clientes de viajes, clientes de trabajos/trámites, profesionales, conductores y usuarios de Marketplace.
- También configura disparadores, por ejemplo al iniciar un viaje, una solicitud de trámite/trabajo o una etapa elegida del Marketplace.
- La pieza muestra una cuenta regresiva configurable y recién después habilita la `X` para cerrar. Debe tener límites razonables y nunca impedir acciones críticas, seguridad, soporte ni una emergencia.
- Se configuran fecha de inicio/fin, prioridad, cantidad máxima de impresiones por usuario, frecuencia, intervalo entre vistas y máximo por sesión/día.
- Los destinos internos usan deep links controlados: al tocar un producto o comercio, la app abre directamente su pantalla dentro del Marketplace.
- Se registran impresiones, cierres, clics, conversiones y errores sin guardar datos sensibles innecesarios. La selección de campaña y el conteo deben ser atómicos para respetar límites.
- Ya existe un módulo legado de banners con contratos duplicados e incompatibles. Debe migrarse a una única API de campañas conservando compatibilidad temporal; los banners antiguos no se activan automáticamente durante la migración.
- Las campañas siguen estados `borrador`, `programada`, `activa`, `pausada`, `finalizada` y `archivada`; el servidor decide la pieza elegible y reserva cada impresión de forma idempotente.
- Videos comienzan silenciados, tienen poster/fallback y no reproducen audio automáticamente. Si falla el contenido, se habilita el cierre inmediato.
- URLs externas solo admiten HTTPS validado; productos y comercios usan destinos internos tipados, nunca esquemas arbitrarios provenientes del panel.

## Comunicación, revisión y privacidad de domicilios

- Moli incorporará llamadas de voz dentro de la aplicación entre participantes de un servicio aceptado y activo. La experiencia no expone números telefónicos personales ni deriva automáticamente a la aplicación de teléfono.
- La primera versión usa WebRTC para el audio, señalización autenticada por WebSocket y servidores STUN/TURN administrados. Cada llamada requiere autorización corta vinculada al viaje, trabajo, trámite o pedido y registra únicamente estados operativos: `sonando`, `aceptada`, `rechazada`, `finalizada` o `perdida`.
- Las llamadas se habilitan solo para las partes asignadas mientras la operación está vigente. Deben incluir permisos de micrófono, aviso de llamada entrante, bloqueo/reporte y corte automático al vencer la relación. No se graban por defecto.
- El chat entre cliente y profesional admite texto e imágenes. Las imágenes se almacenan como objetos privados, no como Base64 en Mongo; se validan tipo, tamaño y dimensiones, se genera miniatura, se eliminan metadatos EXIF/GPS y se entregan mediante URLs temporales solo a participantes autorizados.
- Los chats no permiten intercambiar datos de contacto para eludir la plataforma. Teléfonos, WhatsApp, correos, enlaces sociales y patrones equivalentes detectados en texto se sustituyen en el servidor por contenido protegido; la interfaz los representa difuminados/no legibles y explica que la comunicación debe continuar dentro de Moli.
- La misma protección analiza imágenes mediante OCR antes de publicarlas. Si se detecta contacto, la imagen completa o la región sensible queda bloqueada/difuminada hasta revisión. El archivo original nunca se entrega al otro participante. La moderación conserva motivos y auditoría sin exponer el dato detectado en paneles comunes.
- El filtrado no debe impedir información operativa legítima ni comunicaciones de emergencia. Admin define reglas, excepciones auditadas y canal de apelación; llamada y chat internos permanecen disponibles para que ocultar contactos no deje a las partes incomunicadas.
- La dirección exacta y las coordenadas precisas de un trabajo o trámite son datos protegidos. Antes de la aceptación, el profesional recibe únicamente barrio/zona aproximada y una ubicación deliberadamente degradada; nunca domicilio, referencias privadas ni coordenadas exactas.
- La redacción se aplica en el backend a listados, detalles, notificaciones push y eventos WebSocket. Ocultar el domicilio solamente en la interfaz no se considera una protección válida. Admin/operador y el cliente propietario conservan acceso según sus permisos; el profesional asignado obtiene el destino exacto recién después de aceptar.
- Durante la búsqueda solo un profesional puede mantener la revisión de una solicitud mediante un bloqueo atómico y con vencimiento. El cliente ve mensajes en vivo como “Juan está revisando tu solicitud”, “Juan aceptó tu solicitud” o “Juan dejó pasar; estamos buscando otro profesional”.
- Si el profesional rechaza o vence el tiempo de revisión, el servidor libera la solicitud, avisa al cliente y la ofrece al siguiente candidato sin revelar identidades innecesarias ni crear asignaciones duplicadas.
- El mismo modelo de revisión interactiva se aplica a solicitudes de auto, moto, taxi y demás categorías de movilidad. Mientras un conductor mantiene la oferta bloqueada, el pasajero ve una tarjeta compacta del tipo “Carlos está viendo tu viaje”, con nombre, foto, categoría/vehículo y cuenta regresiva; este estado no implica asignación.
- Si ese conductor rechaza o agota el tiempo, la tarjeta cambia a “Buscando otro conductor” y la oferta pasa al siguiente candidato. Solo al aceptar se transforma en conductor asignado y se habilitan los datos operativos completos, el seguimiento y la comunicación del viaje.
- Las imágenes adjuntas a una solicitud previa a la aceptación también se consideran sensibles: se limita su acceso, se elimina geolocalización incrustada y se evita mostrar contenido que revele el domicilio cuando la finalidad pueda cumplirse con una vista reducida o moderada.

## Repositorio y rama de recuperación

- Repositorio: `figueroacarlos1725-tech/MOLI-V3-ESTABLE`
- Rama inicial de saneamiento: `qa/role-flow-hardening`
- La versión recuperada requiere validación integral antes de considerarse nuevamente estable.

## Hallazgos corregidos en la rama QA

- La respuesta de autenticación omitía `is_professional`, impidiendo conservar correctamente el rol combinado en el cliente.
- La creación de usuarios desde admin guardaba un campo de contraseña incompatible con el login.
- Se agregó la categoría base `tramites` para solicitudes profesionales.
- Las proyecciones administrativas excluyen tanto contraseñas antiguas como hashes.
- `emergentintegrations` es una dependencia privada del entorno original. QA la excluye del build; solo queda indisponible el soporte IA hasta sustituir el proveedor.
- Trabajos y trámites aplican autorización por participante, revisión/aceptación atómicas, máquina de estados, calificación única y redacción del domicilio desde el servidor.
- Los chats redactan teléfonos, correos, enlaces y contactos antes de almacenarlos o entregarlos; el texto original sensible no se conserva en mensajes nuevos.
- El despacho informa al pasajero qué conductor está revisando con cuenta regresiva y entrega solo coordenadas aproximadas antes de aceptar.
- Se incorporó el núcleo backend de Marketplace: comercio y aprobación, catálogo, carrito, retiro/delivery, prioridad moto, estados de pago y comisiones idempotentes.
- Se incorporó el backend unificado de campañas con targeting, frecuencia, cuenta regresiva, destinos seguros, métricas e importación controlada de banners legados.

## Registro y aprobación por WhatsApp

- El alta comienza verificando un teléfono en formato internacional mediante un código de seis dígitos enviado por la API de WhatsApp de Moli Tecnologías.
- Teléfono y email son obligatorios para el alta. El usuario elige recibir el OTP por WhatsApp o email; el modo automático intenta WhatsApp y usa email como respaldo mientras las plantillas de Meta no estén habilitadas.
- El mismo mecanismo permite iniciar sesión sin contraseña. El OTP se emite con propósito separado (`register` o `login`), se consume una sola vez y nunca sirve para otra operación.
- Comprax actúa únicamente como proveedor/canal de mensajería cuando se configure su endpoint; Moli no lee ni reutiliza la base de datos de Comprax.
- Para QA, Moli reutiliza únicamente el proveedor de correo Resend ya contratado y configurado en Comprax, copiando la credencial a su propio entorno secreto del VPS. No lee datos, usuarios ni colecciones de Comprax.
- Los códigos vencen, tienen límite de intentos, espera entre reenvíos y se guardan mediante digest seguro. URLs, claves y plantillas del proveedor viven fuera de Git.
- Un cliente sin capacidades operativas queda habilitado al verificar el teléfono y completar sus datos. Conductores, profesionales, gestores de trámites, repartidores y comercios quedan `pending` hasta revisión de Admin.
- Una misma persona selecciona múltiples capacidades: viajes, moto, taxi, profesional, trámites, paquetería, delivery y comercio. Admin visualiza la solicitud, documentación, vehículo y capacidades, y aprueba o rechaza con motivo y auditoría.

## Infraestructura

- VPS compartido: `95.111.238.35`, Ubuntu 24.04, acceso administrativo por SSH.
- Comprax: `/srv/apps/comprix`; es producción independiente y queda fuera del alcance de Moli.
- Existe un sistema legado `/root/moli-bot` con contenedores `moli-*`; su API se identifica como “Moli WhatsApp Bot API” y no es la app móvil recuperada.
- Entorno nuevo: `/srv/apps/moli-qa`, Compose `moli-qa`, Mongo/volumen separados, acceso previsto por `/moli-qa/` detrás del Caddy compartido.
- Las credenciales viven solo fuera de Git. Si una clave se compartió por chat, debe tratarse como temporal y rotarse antes de producción.

## Google Play

- Cuenta/desarrollador seleccionada por Carlo: aplicación llamada “Moli”.
- Paquete publicado observado: `com.digigo.app`.
- Alpha cerrada observada: versión `1.0.21`, versionCode `24`, API objetivo 36.
- El repositorio recuperado declaraba `com.moli.movelibre`; la rama QA ya alineó Android a `com.digigo.app`, pero no se publica hasta verificar la nueva firma de subida y la continuidad completa.
- El 2026-08-22 se generó una nueva clave de carga bajo control de Carlo y se envió a Play Console la solicitud de restablecimiento, con motivo “se fue de la empresa un desarrollador con acceso al almacén de claves”. La clave privada y su contraseña permanecen fuera de Git. Play Console confirmó que la solicitud está pendiente; el plazo habitual informado por Google es de unas 48 horas.
- Próximo artefacto previsto: `1.0.22`, versionCode `25`, paquete `com.digigo.app`, AAB para prueba abierta. No cargar hasta que Play confirme la activación del nuevo certificado y el backend de destino esté validado.

## Matriz de QA prevista

- Admin QA
- Cliente QA
- Conductor QA
- Profesional QA
- Conductor-profesional QA
- Comercio QA
- Cliente Marketplace QA

Los datos concretos de acceso se guardan en un almacén local/seguro, nunca en este archivo. Cada flujo debe registrar IDs de prueba, estados recorridos, resultado y defecto encontrado sin copiar tokens.

## Próximos hitos

1. Levantar y verificar backend/Mongo aislados.
2. Crear identidades QA mediante APIs reales.
3. Automatizar viajes, trabajos, trámites y despacho manual.
4. Implementar y automatizar alta de comercio, catálogo, carrito, pedido, preparación y entrega del Marketplace.
5. Corregir fallas y ejecutar regresión.
6. Construir APK de prueba apuntando a QA.
7. Alinear `applicationId`, versionCode y firma con Play Console.
8. Generar AAB y publicar primero en pista de prueba con autorización final.
9. Implementar comunicación segura: llamadas de voz, imágenes privadas en chat, revisión interactiva y redacción de domicilios antes de la aceptación.
