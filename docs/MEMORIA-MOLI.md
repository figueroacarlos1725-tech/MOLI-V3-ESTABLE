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
- El repositorio recuperado declaraba `com.moli.movelibre`; no cambiar el paquete ni publicar hasta alinear identidad, firma de subida y continuidad de versionCode.
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
