# Configuración de Resend

Variables privadas del backend Render:

EMAIL_PROVIDER=resend
RESEND_API_KEY=(clave con permiso de envío)
RESEND_FROM=Moli <onboarding@resend.dev>
RESEND_TEST_RECIPIENT=molicatamarca@gmail.com

Sin dominio se permite únicamente el correo de la cuenta Resend. No activar registro público por email en este modo. Tras verificar dominio, cambiar RESEND_FROM por una dirección del dominio; no hace falta RESEND_TEST_RECIPIENT para remitentes propios.

Probar POST /api/registration/otp/request con channel=email, purpose=register, teléfono internacional y correo autorizado. Verificar recepción y luego /api/registration/otp/verify; el código vence en diez minutos. No guardar códigos ni claves en Git o capturas. Un fallo del proveedor no devuelve estado sent.

La recuperación de contraseña todavía no está implementada. La aceptación por Resend no garantiza entrega en bandeja; comprobar recepción real.
