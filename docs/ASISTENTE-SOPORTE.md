# Asistente Moli: base preparada

La identidad se toma del JWT; el navegador y el modelo no eligen el usuario.
Una sesión canónica por cuenta unifica la pantalla de soporte y la burbuja.
Historial y referencias a viajes/servicios/pedidos se filtran por participante.
La cuenta, sus capacidades, saldo, bloqueo conductor, documentos y últimos diez
viajes, trabajos, pedidos y casos se consultan mediante proyecciones explícitas.
No se envían contraseñas, tokens, teléfonos de terceros, GPS, archivos ni chats
operativos. Los textos del usuario son datos, no instrucciones del sistema.

## Rutas

- GET /api/support/context: consulta propia, de solo lectura.
- POST /api/support/chat y /message: misma sesión e historial; compatibles con
  las pantallas actuales. Sin clave responde como consulta directa, no como IA.
- GET /api/support/history: mensajes en ambos formatos de frontend, solo propios.
- POST /api/support/claims: categoría lost_item/payment/service/account,
  descripción y referencia opcional; objeto perdido exige un viaje propio.
  Guarda caso pendiente y lo muestra en soporte administrativo; no contacta
  al conductor ni cambia dinero, aprobación de documentos o estados.
- POST /api/support/connect-dispatcher: solicitud explícita de revisión humana.

La pantalla incluye selección de servicio y formulario para crear el caso.
El modelo no tiene herramientas de escritura ni decide crear reclamos: lo hace
la persona con el botón Enviar caso a soporte. No se promete horario de respuesta.
Límite de veinte mensajes/solicitudes por cuenta por minuto, contado en MongoDB.

## Conectar después

Configurar OPENAI_API_KEY, OPENAI_SUPPORT_MODEL y SUPPORT_AI_ENABLED=true como
secretos del backend; nunca en EXPO_PUBLIC ni Git. Elegir un modelo disponible
en la cuenta y un presupuesto en OpenAI. Usa Responses API con store=false,
historial corto, máximo de salida y timeout. Esto no equivale a una garantía de
retención cero del proveedor. Fuente: https://developers.openai.com/api/docs/guides/migrate-to-responses

El conocimiento está en backend/support_knowledge.md y debe actualizarse al
cambiar políticas o funcionalidades. Incluye limitaciones reales de QA.
Antes de activar: probar con clave real, consentimiento/aviso de privacidad,
calidad de respuestas, instrucciones maliciosas, conflictos de reclamos, límites
de costo y operación humana. La integración externa no fue probada: solo el
adaptador con transporte simulado. No se hicieron llamadas pagas a OpenAI.

Esta base no implica que conozca todos los registros históricos. No hay búsqueda
libre en toda la base ni acceso a cuentas ajenas, ni resolución automática de pagos.
El historial legado de support_chats no se migró ni se mezcla sin revisión.
