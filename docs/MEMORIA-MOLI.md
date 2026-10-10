# Memoria viva de Moli

Última actualización: 2026-09-10

## Validación integral del prestador

- El mapa unificado recibe oportunidades de viajes, entregas, trámites y trabajos según los interruptores persistidos del prestador.
- Trabajos y trámites se presentan con zona aproximada y revisión exclusiva de 35 segundos; la dirección exacta continúa protegida hasta la asignación. Desde la oferta se puede rechazar, aceptar o enviar contrapropuesta.
- Una aceptación abre dentro del mismo centro el seguimiento premium: mapa y ruta, identidad del cliente, acceso a comunicación, ganancia estimada, avance de estados y cancelación con advertencia de penalidad.
- El script reproducible `scripts/qa_core_flows.ps1` crea identidades efímeras de QA y valida por API: publicación, privacidad previa, revisión, aceptación, inicio, doble confirmación de finalización y calificación para trabajos/trámites; además valida despacho cercano, aceptación, llegada, inicio, finalización y calificación de viaje.

## Negociación de profesionales y trámites

- Al revisar una solicitud, el profesional obtiene un bloqueo exclusivo de 35 segundos.
- Puede aceptar el presupuesto, rechazar o iniciar una contrapropuesta. Cada turno del cliente/profesional dura 35 segundos y el máximo es tres rondas.
- El estado persistido es `negotiating`, con `negotiation_round`, `negotiation_turn`, `negotiation_price` y `negotiation_deadline`.
- Si vence el turno, se rechaza o finalizan tres rondas sin acuerdo, el trabajo vuelve a `open` para continuar buscando otro profesional.
- La dirección exacta solo se revela después de quedar `assigned`.

## Envíos: Enviar y Recibir

- Enviar usa la ubicación actual como retiro y solicita el destino.
- Recibir solicita primero el punto de retiro y usa la ubicación actual como destino.
- Tanto retiro como entrega pueden editarse antes de confirmar.

## Seguimiento persistente de viajes

- Una solicitud de viaje pendiente continúa activa cuando el cliente minimiza la búsqueda y vuelve a `/modules`.
- `GET /api/rides/request/active` reconstruye la búsqueda pendiente autenticada e incluye el conductor que la está revisando cuando existe una oferta activa.
- El inicio muestra una tarjeta flotante para los estados buscando, conductor revisando, aceptado, conductor llegando y viaje iniciado. Al tocarla abre `/solicitar-viaje`.
- En la pantalla de búsqueda, la acción superior minimiza; la cancelación explícita queda fija abajo y llama al endpoint de cancelación.

## Enfoque de lanzamiento aprobado

- La experiencia pública se centra primero en oficios/profesionales y trámites. Viajes, delivery y Marketplace se conservan para etapas posteriores y no deben eliminarse.
- La identidad aprobada usa naranja cálido Moli, carbón, fondos blancos/grises cálidos, tarjetas redondeadas y sombras suaves; la navegación debe resultar familiar para usuarios de apps de movilidad sin copiar marca ni recursos de terceros.
- El acceso de esta etapa es correo más contraseña, con Google como alternativa una vez vinculadas credenciales OAuth propias de Moli.
- WhatsApp queda oculto por defecto mediante `EXPO_PUBLIC_WHATSAPP_AUTH_ENABLED`; su implementación permanece preparada para habilitarse cuando exista API y plantilla aprobada.
- Google sólo se habilita cuando `EXPO_PUBLIC_GOOGLE_AUTH_ENABLED=true` y `EXPO_PUBLIC_GOOGLE_AUTH_URL` contiene el inicio OAuth operativo. Sin esa configuración, la interfaz informa que falta la vinculación y no simula autenticación.

## Estado de Google Play

- La ficha existente es `Moli` con package `com.digigo.app`; no se debe crear otra aplicación.
- Google Play ya otorgó acceso a producción, por lo que no corresponde repetir la etapa de verificadores de prueba cerrada.
- La nueva clave de carga entra en vigencia el 2026-08-24 a las 06:06 UTC (03:06 de Argentina). Play bloquea cargas nuevas hasta ese momento.
- La próxima entrega prevista es `1.0.22` con `versionCode 25`, en el segmento de prueba abierta existente, inicialmente limitada a Argentina. Antes del envío se deben verificar firma, SDK objetivo y AAB.

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
- El panel Admin de Publicidad consume ahora la API unificada de campañas: crea imagen/video/producto, exige sponsor externo HTTPS o destino interno tipado a comercio/producto, configura audiencia, superficie, disparador, cuenta regresiva, frecuencia y límites. Las campañas nuevas quedan en borrador antes de activarse.
- El panel Admin de Pagos expone la política Marketplace `solo conductor` o `conductor y comercio`, con tasas y mínimos separados. Cada guardado crea una versión nueva y los pedidos conservan su snapshot financiero.
- Usuarios y despacho manual interpretan capacidades explícitas: comercio/profesional ya no se presenta ni se ofrece como conductor salvo que también tenga una capacidad real de movilidad/delivery.
- El geocodificador de destinos usa fallback Google→OpenStreetMap; el cliente no depende de la geocodificación nativa del dispositivo para crear un delivery.
- Después del checkout, Marketplace conserva el pedido creado y abre una vista autenticada de confirmación/seguimiento; un cliente solo puede consultar sus propias órdenes.
- Moli Trámites aparece como módulo cliente independiente y reutiliza el flujo seguro de trabajos con la categoría `tramites` preseleccionada.

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

El registro móvil exige teléfono y email. El canal `auto` intenta WhatsApp y utiliza correo como respaldo; también puede elegirse email explícitamente. Los perfiles con capacidades operativas quedan pendientes de aprobación administrativa, mientras el cliente sin capacidades puede habilitarse directamente.

## Sistema visual aprobado

- Identidad propia Moli con inspiración general en interfaces de movilidad simples y profesionales, sin copiar marcas o activos de terceros.
- Color primario naranja vivo `#FF5A1F`, con profundidad `#E9480B`; texto carbón `#202124`; fondos crema/blancos; verde reservado para éxito, verificación o disponibilidad.
- La portada cliente aprobada adopta un lenguaje visual de gamificación profesional: controles táctiles con volumen, sombras suaves, tarjetas de oficios tipo misión, buscador protagonista, destellos discretos y métricas de confianza. La interfaz no usa públicamente las palabras `Play` ni `Premium`; la gamificación debe sentirse atractiva, nunca infantil ni confundir estados operativos.
- El encabezado cliente usa una sola marca tipográfica Moli, seguida por notificaciones y avatar. Trámites, Viajes y Market reutilizan las mismas insignias naranjas, profundidad y jerarquía de los oficios para evitar módulos visualmente incompletos.
- Viajes y Trámites cuentan con iconos 3D propios: auto con ruta/pin y carpeta documental con ubicación/verificación. El selector de ubicación para trabajos y trámites comparte el mismo lenguaje visual, con pin Moli animado, controles de mapa limpios, tarjeta inferior elevada y CTA naranja con profundidad.
- Marketplace cuenta con una tienda barrial 3D propia. La selección de categoría de trabajos reutiliza retratos, insignias naranjas y tarjetas con profundidad en una grilla adaptable, evitando listados extensos de símbolos genéricos.
- La portada no depende de descubrir un carrusel: debajo de la tarjeta principal de Profesionales muestra accesos verticales visibles para Viajes, Trámites y Enviar/Recibir paquetería. Envíos abre directamente el modo delivery y usa una motocicleta 3D propia.
- La búsqueda de profesionales es persistente: el cliente puede minimizarla y seguir usando la portada. Las solicitudes activas aparecen en una tarjeta flotante con acceso al detalle; los cambios `revisando` y `aceptado` se actualizan por WebSocket, tienen respaldo por consulta periódica y generan push cuando hay token disponible.
- La campana cliente abre un centro de actividad propio; los eventos de revisión, rechazo y aceptación se guardan aunque no exista token push. Desde el detalle abierto por la tarjeta flotante, el cliente puede cancelar una solicitud abierta o en revisión mediante confirmación compatible con web y móvil.
- El presupuesto mínimo de publicación es ARS 15.000 para oficios y ARS 10.000 para Trámites; ambos se validan en la interfaz y la API.
- En trabajos y trámites aceptados, si cancela el cliente se cobra el 10% del presupuesto. El profesional dispone de 2 minutos desde la aceptación para cancelar sin multa; después se cobra el mismo 10%. Cada cancelación penalizada suma una falta y la tercera bloquea la cuenta completa, incluida su disponibilidad como profesional o conductor, hasta revisión administrativa.
- Mapas principales claros, rutas y pines naranjas, tarjetas flotantes con bordes finos y sombras suaves.
- Logo naranja/negro y vehículos Auto/Moto/Taxi/Delivery/Paquetería representados por componentes propios reutilizables.
- El paquete visual `Moli Oficios v1` usa ilustraciones 3D semirrealistas propias para electricista, plomería, limpieza, pintura, jardinería, carpintería, mecánica y tecnología. Incluye un emblema de herramientas con check verificado y retratos ficticios para los profesionales de demostración; evita fotografías o activos de terceros.

## Operación unificada de prestadores

- La bandeja multirrol usa accesos tipados: viajes abre movilidad; trabajos y trámites abren el mapa profesional con su filtro; paquetería y Marketplace Delivery abren una bandeja de entregas separada.
- La dirección final de un delivery se redacta hasta que el conductor acepta. Después puede avanzar de forma atómica por `asignada → retirada → en camino → entregada`, reflejando el estado en el pedido.
- La disponibilidad de viajes usa un botón estable y semántico, compatible con automatización y lectores de pantalla; las animaciones decorativas no transforman su blanco táctil.
- Los retiros de saldo generan solicitudes auditables e idempotentes en estado pendiente. No descuentan ni transfieren fondos hasta aprobación administrativa y respetan saldo comprometido por solicitudes anteriores.
- El frontend web QA se sirve con fallback SPA: actualizar o compartir una ruta interna devuelve `index.html` en lugar de un 404 de nginx.

## Campañas en la experiencia cliente

- El cliente consulta la decisión publicitaria del servidor al iniciar un viaje, trabajo o trámite, al abrir un comercio y después de crear un pedido.
- El servidor conserva la autoridad sobre elegibilidad, frecuencia y límite por entidad; la app respeta la cuenta regresiva antes de habilitar la X y reporta impresión, clic, cierre y errores.
- Las creatividades admiten imagen o video. Los únicos destinos admitidos en el cliente son HTTPS y rutas internas tipadas a comercio o producto; un producto promocionado se destaca al abrir su tienda.

## Presentación de disponibilidad en Viajes

- La portada de Viajes usa el mismo sistema visual naranja/crema de Moli: buscador elevado, controles redondeados, profundidad suave, identidad de módulo y una acción principal inequívoca.
- Mientras el cliente todavía no publicó una solicitud se muestran autos y motos cercanos como una representación orientativa para dar contexto al mapa. La interfaz lo aclara y esas posiciones no se consideran conductores asignables ni una promesa de disponibilidad real.
- Al existir una solicitud o un viaje activo desaparece la representación orientativa y el mapa muestra exclusivamente los datos operativos entregados por el backend.
- Los vehículos del mapa se presentan como recortes transparentes sin fondo decorativo y reducen su tamaño progresivamente al alejar el zoom para no ocultar calles ni puntos de interés. Los puntos operativos usan el pin naranja/carbón propio de Moli.
- Administración y Despacho tienen guardas de interfaz independientes basadas en sesión y rol, además de la autorización del backend. Un cliente o prestador nunca debe renderizar esas vistas por navegación directa, historial o enlace equivocado.
- La pantalla de búsqueda de conductor comparte una composición responsive en web y móvil: mapa superior, panel crema elevado, radar Moli, progreso legible, resumen y acciones. La M del radar usa un latido moderado mientras busca y detiene la animación al encontrar conductor, pedir continuación o abandonar la fase.
- Para enlaces externos y QA, el flujo cliente de pedir viaje usa `/solicitar-viaje`; `/rides` es exclusivamente Historial de viajes. La entrada dedicada exige una sesión de tipo cliente antes de renderizar el solicitador.

## Panel unificado y flujo premium de Trámites

- El prestador multirrol dispone de una portada única para Viajes, Envíos, Trámites y Trabajos, con disponibilidad general, accesos tipados, oportunidades y preferencias persistentes de actividad y radio.
- Una sesión de conductor o conductor-profesional entra directamente al Centro de oportunidades. La pantalla de módulos es exclusiva del cliente y no debe volver a aparecer como un segundo inicio operativo.
- La disponibilidad se gobierna desde un único control global del Centro de oportunidades; las actividades son filtros de recepción, no portadas adicionales con controles GO independientes.
- Los interruptores de actividad persisten inmediatamente. Si un conductor activa Trabajos o Trámites sin perfil profesional, se abre el alta de especialidades; al guardarla se incorpora la capacidad profesional a su misma cuenta.
- Cliente y prestador comparten un menú lateral premium con identidad Moli, rol visible y rutas separadas según permisos.
- El alta de un trámite es un asistente de cuatro pasos: lugar de la gestión, necesidad de retiro previo, confirmación de puntos y detalle/documentación. El presupuesto mínimo permanece en $10.000.
- Los puntos exactos, direcciones y adjuntos de un trámite son privados antes de la asignación. El backend los redacta de las vistas para profesionales no asignados.
- Después de publicar, el trámite reutiliza la negociación segura de 35 segundos, hasta tres contrapropuestas, estados del servicio, cancelaciones y calificación del flujo de trabajos.

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
# Actualización operativa 2026-09-11

- El despacho automático de viajes usa una cohorte amplia de conductores cercanos compatibles (hasta 50 por ronda). La selección sigue ordenada por proximidad/tipo de vehículo, pero la oportunidad se comunica simultáneamente.
- Revisar una oportunidad crea un bloqueo exclusivo y atómico de 35 segundos. Solo ese conductor puede aceptar o rechazar; la aceptación también se reclama atómicamente para impedir dobles asignaciones.
- Los demás conductores reciben estados explícitos de “otro conductor está revisando” y “otro conductor tomó esta oportunidad”, y vuelven al mapa sin perder su disponibilidad global.
- Antes de aceptar solo se comparten coordenadas aproximadas; el recorrido exacto se libera al ganador.
- Cancelaciones de viajes: ambas partes disponen de un período gratuito configurable (por defecto un minuto). Fuera de ese período se registra motivo y multa económica; por defecto la tercera cancelación penalizada dentro de la ventana configurada bloquea la cuenta. Importes, cantidad, ventana y duración del bloqueo se administran desde Configuración.
- Si el cliente elige “conductor muy lejos” o “no quiero este conductor”, puede relanzar la misma solicitud; el conductor cancelado queda expresamente excluido y el cliente conserva origen, destino, modalidad y pago.
- El alta de proveedores guarda un estado independiente por capacidad (`provisional`, `approved` o `rejected`). Una capacidad nueva puede operar provisoriamente durante 24 horas desde el registro; vencido ese plazo, el servidor impide conectarse o tomar trabajos hasta la aprobación. Rechazar una capacidad no afecta las otras capacidades aprobadas de la misma cuenta.
- Los comercios también reciben 24 horas provisorias: durante ese plazo pueden preparar catálogo y operar; luego solo son visibles y operativos si Admin aprobó el comercio. Los clientes comunes continúan con activación automática.
- El inicio administrativo abre directamente el Despacho premium unificado. La pantalla combina viajes y solicitudes profesionales en una cola tipada, muestra conductores conectados sobre el mapa, actualiza datos cada 10 segundos y conserva acciones reales de asignación manual, cancelación y creación de viaje. Las aprobaciones pendientes se exponen como alertas con acceso directo al Centro de aprobaciones.
- El login web debe mostrar errores en línea, además de cualquier alerta nativa móvil, y normalizar el correo con recorte de espacios y minúsculas. Un rechazo de autenticación nunca puede quedar sin respuesta visual.

## QA y correcciones integrales — 2026-10-10

- QA cloud publicado en Render Free con base Atlas M0 temporal exclusiva. La conservación de la base requiere claim humano; no usarla como producción. El VPS existente permanece sin modificaciones.
- Rama `qa/client-flow-fixes`: se corrigen errores de formulario invisibles en web, salida de negociación hacia seguimiento, selección explícita de ubicación, adjuntos transportables y límites; controles táctiles y teclado Android.
- Inicio cliente sin estadísticas ni perfiles inventados; “Ver todos” operativo. Entradas cliente/prestador protegidas por sesión/rol. La obtención de ubicación no bloquea cargar las oportunidades.
- Chat compartido reconoce rideId y jobId; historial con consulta de respaldo, errores visibles y notificaciones abren el servicio correspondiente. WebSocket requiere JWT coincidente con usuario; se elimina envío arbitrario a terceros y ubicación de clientes.
- Checkout reserva stock y crea pedido en una transacción Mongo. Reintentos idempotentes no vuelven a descontar; cancelación/rechazo restituyen una vez. Transiciones se autorizan por participante; el cliente no puede aceptar su propio pedido.
- Pruebas locales aisladas en `moli_fix_qa`: viajes completos/calificación/cancelación y redispatch, trabajos y trámites con confirmación doble, stock concurrente, chat realtime/historial y accesos ajenos. Se mantienen como pendientes la validación Android real, mapas/GPS, cámara, push/segundo plano, OTP/OAuth y pagos externos.
- MongoDB de despliegue debe ofrecer transacciones (Atlas replica set). SMTP bloqueado en Render Free: configurar email por HTTP antes de validar registro con OTP. Nunca declarar pago real con pruebas de efectivo ficticio.
- Segunda regresión del 10/10: mapa web de servicios comunica el pin elegido al formulario y GPS tiene espera limitada. Se verificó en navegador publicación, contrapropuesta de $16.000, aceptación y precio acordado. Chat permanece disponible durante confirmación pendiente.
- Se unificó la calificación de viajes: JSON actual y query legado, solo participantes de viaje completado, rango 1–5 y una calificación por parte mediante reclamo atómico. Las pantallas conservan el formulario y muestran errores de guardado.
- Etapas de viajes autorizadas al conductor (aceptado→llegó→inició→completó); cancelación de participantes solo mientras activo. Un reclamo excluye efectos económicos simultáneos. Si falla una liquidación parcialmente aplicada, queda marcada para conciliación operativa, sin reintento automático que duplique cobros. Esto no sustituye validar fallos transaccionales ni pagos externos antes de producción.
- Comisiones y multas profesionales usan precio acordado; el ganador de la transición de confirmación es el único que aplica comisión y suma trabajos. El panel muestra precio acordado en lugar de una ganancia calculada con una tasa distinta. El detalle informa si el usuario ya calificó.
- Render API y web usan `qa/client-flow-fixes`; el build Python incluye `websockets==17.2`. Se validaron en cloud historial y eventos autenticados, negativos de permisos, stock concurrente, restitución e idempotencia. Evidencias QA se mantienen fuera del repositorio, sin secretos.
- Prueba visual de viaje detectó que reingresar al Centro de oportunidades ocultaba el viaje activo. El centro consulta la API y ofrece «Continuar viaje activo» aun cuando las preferencias de nuevas ofertas estén pausadas.
