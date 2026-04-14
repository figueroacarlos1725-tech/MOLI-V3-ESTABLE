"""Legal pages and account management routes"""
from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.responses import HTMLResponse
from datetime import datetime, timezone

from database import db
from utils import get_current_user

router = APIRouter()


PRIVACY_POLICY_HTML = """<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Política de Privacidad - Moli</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; color: #333; line-height: 1.7; }
  h1 { color: #6B21A8; border-bottom: 2px solid #A855F7; padding-bottom: 10px; }
  h2 { color: #7C3AED; margin-top: 30px; }
  .updated { color: #666; font-size: 0.9em; }
  .contact { background: #F3E8FF; padding: 15px; border-radius: 10px; margin-top: 20px; }
  ul { padding-left: 20px; }
  li { margin-bottom: 8px; }
</style>
</head>
<body>
<h1>Política de Privacidad de Moli (Movete Libre)</h1>
<p class="updated">Última actualización: Junio 2025</p>

<h2>1. Información que recopilamos</h2>
<p>Moli recopila los siguientes datos personales para brindar el servicio de transporte:</p>
<ul>
  <li><strong>Datos de registro:</strong> Nombre completo, dirección de correo electrónico, número de teléfono celular y contraseña (almacenada de forma encriptada).</li>
  <li><strong>Ubicación:</strong> Coordenadas GPS en tiempo real mientras la aplicación está en uso, para conectar pasajeros con conductores cercanos y calcular rutas y tarifas.</li>
  <li><strong>Historial de viajes:</strong> Origen, destino, fecha, hora, tarifa y método de pago de cada viaje realizado.</li>
  <li><strong>Información del dispositivo:</strong> Modelo del dispositivo, sistema operativo, identificador único para envío de notificaciones push.</li>
  <li><strong>Documentos del conductor:</strong> Licencia de conducir, DNI, registro vehicular, seguro y antecedentes penales (solo para usuarios tipo conductor).</li>
</ul>

<h2>2. Uso de la información</h2>
<p>Utilizamos la información recopilada exclusivamente para:</p>
<ul>
  <li><strong>Conectar pasajeros con conductores</strong> disponibles en la zona.</li>
  <li><strong>Calcular rutas y tarifas</strong> precisas basadas en la distancia y duración del viaje.</li>
  <li><strong>Procesar pagos</strong> y mantener un registro de transacciones.</li>
  <li><strong>Garantizar la seguridad</strong> de pasajeros y conductores durante el viaje.</li>
  <li><strong>Enviar notificaciones</strong> sobre el estado del viaje, ofertas y actualizaciones importantes.</li>
  <li><strong>Verificar la identidad</strong> de los conductores y el cumplimiento de requisitos legales.</li>
  <li><strong>Mejorar el servicio</strong> mediante análisis estadísticos anonimizados.</li>
</ul>

<h2>3. Uso de la ubicación</h2>
<p>La ubicación se utiliza únicamente mientras la aplicación está en uso activo (primer plano). Para conductores en servicio, la ubicación puede actualizarse en segundo plano para mantener la disponibilidad del servicio. En ningún caso se rastrea la ubicación cuando la aplicación está cerrada.</p>

<h2>4. Compartición de datos</h2>
<ul>
  <li>Compartimos tu nombre y número de teléfono con el conductor/pasajero asignado a tu viaje, exclusivamente durante el viaje activo.</li>
  <li><strong>No vendemos, alquilamos ni compartimos tus datos personales con terceros</strong> con fines publicitarios o comerciales.</li>
  <li>Podemos compartir información con autoridades competentes cuando sea requerido por ley.</li>
</ul>

<h2>5. Seguridad de los datos</h2>
<p>Implementamos medidas de seguridad técnicas y organizativas para proteger tu información, incluyendo encriptación de contraseñas, comunicación cifrada (HTTPS) y acceso restringido a bases de datos.</p>

<h2>6. Retención de datos</h2>
<p>Conservamos tus datos mientras mantengas una cuenta activa en Moli. El historial de viajes se conserva por un período de 2 años con fines contables y legales. Puedes solicitar la eliminación de tu cuenta en cualquier momento.</p>

<h2>7. Eliminación de cuenta y datos</h2>
<p>Puedes eliminar tu cuenta directamente desde la aplicación en la sección de Perfil → Eliminar cuenta. Al eliminar tu cuenta:</p>
<ul>
  <li>Se eliminarán tus datos personales (nombre, email, teléfono).</li>
  <li>Se anonimizará tu historial de viajes.</li>
  <li>Se eliminarán los documentos subidos.</li>
  <li>Este proceso es irreversible.</li>
</ul>

<h2>8. Tus derechos</h2>
<p>Tenés derecho a acceder, rectificar, limitar y eliminar tus datos personales. Para ejercer estos derechos, contactanos a través de los canales indicados abajo.</p>

<h2>9. Cambios en esta política</h2>
<p>Nos reservamos el derecho de modificar esta política. Notificaremos los cambios significativos a través de la aplicación.</p>

<div class="contact">
  <h2>Contacto</h2>
  <p><strong>Moli - Movete Libre</strong></p>
  <p>Email: soporte@moliapp.com</p>
  <p>Catamarca, Argentina</p>
</div>
</body>
</html>"""


TERMS_HTML = """<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Términos y Condiciones - Moli</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; color: #333; line-height: 1.7; }
  h1 { color: #6B21A8; border-bottom: 2px solid #A855F7; padding-bottom: 10px; }
  h2 { color: #7C3AED; margin-top: 30px; }
  .updated { color: #666; font-size: 0.9em; }
  .contact { background: #F3E8FF; padding: 15px; border-radius: 10px; margin-top: 20px; }
</style>
</head>
<body>
<h1>Términos y Condiciones de Uso - Moli</h1>
<p class="updated">Última actualización: Junio 2025</p>

<h2>1. Descripción del servicio</h2>
<p>Moli (Movete Libre) es una plataforma tecnológica que actúa como <strong>intermediario</strong> entre pasajeros que necesitan transporte y conductores independientes que ofrecen el servicio de traslado. Moli <strong>no es una empresa de transporte</strong>; facilita la conexión entre ambas partes a través de la aplicación móvil.</p>
<p>El servicio prestado es de naturaleza <strong>física (transporte de personas)</strong>, no digital. Moli provee únicamente la herramienta tecnológica para coordinar dicho servicio.</p>

<h2>2. Registro y cuenta</h2>
<p>Para usar Moli, debés crear una cuenta con información veraz y actualizada. Sos responsable de mantener la confidencialidad de tu contraseña. Moli se reserva el derecho de suspender o cancelar cuentas que incumplan estos términos.</p>

<h2>3. Tipos de usuario</h2>
<ul>
  <li><strong>Pasajero:</strong> Solicita viajes a través de la aplicación. Acepta pagar la tarifa indicada al momento de la solicitud.</li>
  <li><strong>Conductor:</strong> Ofrece el servicio de transporte de manera independiente. Debe cumplir con todos los requisitos legales vigentes (licencia, seguro, documentación del vehículo).</li>
</ul>

<h2>4. Tarifas y pagos</h2>
<p>Las tarifas se calculan automáticamente según la distancia, duración y tipo de vehículo seleccionado. Moli cobra una comisión al conductor por cada viaje completado. Los métodos de pago disponibles incluyen efectivo y medios electrónicos cuando estén habilitados.</p>

<h2>5. Cancelaciones</h2>
<p>Tanto pasajeros como conductores pueden cancelar un viaje. Las cancelaciones realizadas después del período gratuito (configurado por la plataforma) pueden generar una penalización económica. Los conductores que acumulen cancelaciones excesivas pueden ser temporalmente bloqueados.</p>

<h2>6. Responsabilidades</h2>
<ul>
  <li><strong>Moli</strong> no es responsable por accidentes, daños, pérdidas de objetos o cualquier incidente ocurrido durante el viaje. Moli actúa exclusivamente como intermediario tecnológico.</li>
  <li><strong>El conductor</strong> es responsable del cumplimiento de las normas de tránsito, el estado del vehículo y la seguridad del pasajero durante el traslado.</li>
  <li><strong>El pasajero</strong> es responsable de su comportamiento durante el viaje y del pago de la tarifa acordada.</li>
</ul>

<h2>7. Conducta prohibida</h2>
<p>Está prohibido el uso de la plataforma para actividades ilegales, acoso, discriminación, fraude o cualquier acción que perjudique a otros usuarios o a la plataforma.</p>

<h2>8. Propiedad intelectual</h2>
<p>Todo el contenido de la aplicación Moli (diseño, código, marcas, logos) es propiedad exclusiva de Moli. Queda prohibida su reproducción sin autorización expresa.</p>

<h2>9. Modificaciones</h2>
<p>Moli puede modificar estos términos en cualquier momento. Los cambios entran en vigencia al ser publicados en la aplicación. El uso continuado del servicio implica la aceptación de los nuevos términos.</p>

<h2>10. Legislación aplicable</h2>
<p>Estos términos se rigen por las leyes de la República Argentina. Cualquier controversia será sometida a los tribunales competentes de la provincia de Catamarca.</p>

<div class="contact">
  <h2>Contacto</h2>
  <p><strong>Moli - Movete Libre</strong></p>
  <p>Email: soporte@moliapp.com</p>
  <p>Catamarca, Argentina</p>
</div>
</body>
</html>"""


@router.get("/api/legal/privacy", response_class=HTMLResponse)
async def get_privacy_policy():
    """Public privacy policy page"""
    return HTMLResponse(content=PRIVACY_POLICY_HTML, status_code=200)


@router.get("/api/legal/terms", response_class=HTMLResponse)
async def get_terms():
    """Public terms and conditions page"""
    return HTMLResponse(content=TERMS_HTML, status_code=200)


@router.delete("/api/auth/delete-account")
async def delete_account(
    confirmation: str = Query(..., description="Must be 'ELIMINAR' to confirm"),
    user: dict = Depends(get_current_user)
):
    """Delete user account and anonymize all data"""
    if confirmation != "ELIMINAR":
        raise HTTPException(status_code=400, detail="Escribí 'ELIMINAR' para confirmar la eliminación de tu cuenta")
    
    user_id = user["user_id"]
    now = datetime.now(timezone.utc)
    
    # Anonymize user record (keep for audit trail but remove PII)
    await db.users.update_one(
        {"user_id": user_id},
        {"$set": {
            "name": "Usuario eliminado",
            "email": f"deleted_{user_id}@removed.moli",
            "phone": "",
            "profile_picture": None,
            "password": "DELETED",
            "is_deleted": True,
            "deleted_at": now,
        }}
    )
    
    # Delete driver documents if driver
    if user["user_type"] == "driver":
        await db.driver_documents.delete_many({"driver_id": user_id})
        await db.drivers.update_one(
            {"driver_id": user_id},
            {"$set": {"is_online": False, "is_available": False, "is_blocked": True, "block_reason": "account_deleted"}}
        )
    
    # Anonymize chat messages
    await db.chat_messages.update_many(
        {"sender_id": user_id},
        {"$set": {"sender_name": "Usuario eliminado"}}
    )
    
    # Delete push tokens
    await db.push_tokens.delete_many({"user_id": user_id})
    
    # Delete saved locations
    await db.saved_locations.delete_many({"user_id": user_id})
    
    # Delete balance record
    await db.user_balances.delete_one({"user_id": user_id})
    
    # Log the deletion
    await db.audit_log.insert_one({
        "action": "account_deleted",
        "target_user_id": user_id,
        "admin_id": user_id,
        "changes": {"is_deleted": True},
        "created_at": now,
        "source": "user_self"
    })
    
    return {
        "status": "deleted",
        "message": "Tu cuenta ha sido eliminada exitosamente. Todos tus datos personales han sido removidos."
    }
