# Memoria viva de Moli

Última actualización: 2026-08-22

## Producto

Moli reúne movilidad y contratación de servicios en una misma identidad:

- Cliente/pasajero: solicita viajes, profesionales y trámites; sigue estados; cancela y califica.
- Conductor: se conecta, recibe ofertas de viaje y ejecuta el ciclo asignado/en camino/iniciado/completado.
- Profesional: configura perfil/categorías, recibe solicitudes, cotiza o acepta y ejecuta trabajos.
- Conductor + profesional: usa ambos módulos desde una misma sesión y una pantalla unificada de acceso.
- Admin/operador: administra usuarios, conductores y profesionales; observa demanda; realiza despacho manual; interviene en estados e incidencias.

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

Los datos concretos de acceso se guardan en un almacén local/seguro, nunca en este archivo. Cada flujo debe registrar IDs de prueba, estados recorridos, resultado y defecto encontrado sin copiar tokens.

## Próximos hitos

1. Levantar y verificar backend/Mongo aislados.
2. Crear identidades QA mediante APIs reales.
3. Automatizar viajes, trabajos, trámites y despacho manual.
4. Corregir fallas y ejecutar regresión.
5. Construir APK de prueba apuntando a QA.
6. Alinear `applicationId`, versionCode y firma con Play Console.
7. Generar AAB y publicar primero en pista de prueba con autorización final.
