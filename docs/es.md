# OVHcloud SMS

## Presentación

Esta integración envía las notificaciones de Gladys por SMS mediante la
[API SMS de OVHcloud](https://www.ovhcloud.com/es-es/sms/), a cualquier número
de móvil y cualquier operador. Cada usuario de Gladys introduce su propio
número; el administrador introduce una sola vez las claves de la API de
OVHcloud para la casa.

También aporta:

- tres **disparadores de escena**: SMS no enviado, SMS recibido, pocos
  créditos;
- dos **acciones de escena**: enviar un SMS a cualquier número (incluso a
  alguien que no es usuario de Gladys), leer la cuenta SMS;
- dos **widgets de panel**: la cuenta SMS y los SMS recibidos.

![Los dos widgets de la integración: la cuenta SMS con sus créditos y los últimos SMS recibidos (ilustración generada, no una captura de pantalla)](https://raw.githubusercontent.com/William-De71/gladys-ovhcloud-sms/main/docs/assets/widgets.es.png)

Transporte: **nube**. Los textos y los números de teléfono pasan por la API
de OVHcloud (`eu.api.ovh.com` o `ca.api.ovh.com`) y después por los
operadores móviles.

## Requisitos previos

- Gladys Assistant **5.3.0** o posterior.
- Una cuenta de OVHcloud con una **cuenta SMS** (un pack de SMS, contratado
  en el área de cliente, apartado Telecom → SMS) y créditos. Cada SMS consume
  créditos, más para un texto largo o un número extranjero.
- Opcional: un **remitente** creado y validado en el área de cliente (un
  nombre como `GLADYS` o un número virtual). Sin él, los SMS salen de un
  número corto al que los destinatarios pueden responder.
- Opcional, para recibir SMS: un **número virtual**, o las respuestas al
  número corto.

## Configuración

1. En Gladys, abra **Integraciones → OVHcloud SMS → Configuración**.
2. Elija la **región de la API** de su cuenta de OVHcloud (Europa o Canadá).
3. Pulse **Crear las claves** de su región. Inicie sesión en OVHcloud: los
   permisos que necesita la integración ya están rellenados (`GET /sms`,
   `GET /sms/*`, `POST /sms/*/jobs`). Dé un nombre y una descripción a la
   aplicación, elija la validez **Unlimited** y cree las claves.
4. Copie la **clave de aplicación**, el **secreto de aplicación** y la
   **clave de consumidor** en la configuración y guarde.
5. Pulse **Probar la conexión**: muestra la cuenta SMS, sus créditos, sus
   remitentes y el que se usa. **Enviar un SMS de prueba** comprueba toda la
   cadena.
6. Cada usuario abre el bloque **Mi cuenta** de la misma pantalla e
   introduce su **número de móvil**.

| Campo                        | Uso                                                                                        |
| ---------------------------- | ------------------------------------------------------------------------------------------ |
| Región de la API             | Europa (ovh.com, ovhcloud.com) o Canadá (ovh.ca)                                           |
| Clave de aplicación          | En la página de creación de claves                                                         |
| Secreto de aplicación        | En la página de creación de claves, guardado cifrado                                       |
| Clave de consumidor          | En la página de creación de claves, guardada cifrada                                       |
| Cuenta SMS                   | Opcional: `sms-xx12345-1`, solo si la cuenta de OVHcloud tiene varias                      |
| Remitente                    | Opcional: un remitente activo; vacío = el primero activo o el número corto                 |
| Prefijo del país por defecto | Se añade a los números sin prefijo (`33` por defecto: 06… pasa a ser +336…)                |
| Aviso de pocos créditos      | Por debajo de este número de créditos, «Pocos créditos» se activa una vez (20 por defecto) |
| Leer los SMS recibidos       | Lee los SMS recibidos cada 30 segundos, para «SMS recibido» y el widget                    |

La integración nunca añade la mención «STOP» que OVHcloud añade a los SMS
publicitarios: las notificaciones de una casa no son publicidad.

## Uso

### Notificaciones

Toda notificación de Gladys dirigida a un usuario que ha introducido un número
sale por SMS: alarmas, acciones de escena «Enviar un mensaje», respuestas de
Gladys. Una imagen adjunta a un mensaje se descarta (un SMS solo lleva texto).

### Disparadores de escena

| Disparador     | Cuándo se activa                                                                                              | Variables                                     |
| -------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| SMS no enviado | Con el primer fallo de una notificación, y de nuevo solo después de que un SMS haya pasado (nunca en bucle)   | causa, código HTTP, error, número enmascarado |
| SMS recibido   | Con cada SMS nuevo de la cuenta, filtrado por remitente y primera palabra («Leer los SMS recibidos» activado) | remitente, texto, primera palabra, fecha      |
| Pocos créditos | Los créditos han bajado del umbral; de nuevo solo después de una recarga por encima                           | créditos restantes, umbral, cuenta SMS        |

**No use nunca «SMS recibido» para abrir una puerta o desactivar una
alarma**: cualquiera puede enviar un SMS con un número falsificado.

### Acciones de escena

- **Enviar un SMS a un número**: uno o varios números separados por comas y
  un texto (se admiten variables de escena). Devuelve los SMS enviados, los
  números rechazados, los créditos usados y restantes.
- **Leer la cuenta SMS**: devuelve los créditos restantes, los SMS enviados y
  recibidos este mes y la cuenta SMS.

### Ejemplos de escenas

- _Cuando salta la alarma_ → enviar un SMS al vecino: «Alarma en casa,
  ¿puedes echar un vistazo?».
- _Cuando quedan pocos créditos_ → enviar un mensaje al administrador: «Solo
  quedan {{triggerEvent.data.credits_left}} créditos SMS».
- _Cuando se recibe un SMS que empieza por ESTADO desde mi número_ → leer las
  temperaturas y responder con «Enviar un SMS a un número» a
  `{{triggerEvent.data.sender}}`.

### Widgets de panel

- **SMS de OVHcloud**: créditos restantes (naranja cerca del umbral, rojo por
  debajo), estado de la API, SMS enviados y recibidos este mes, remitente,
  umbral y último fallo.
- **SMS recibidos**: los últimos SMS recibidos; toque uno para leerlo entero.

## Solución de problemas

- **«OVHcloud rechaza las claves»**: compruebe la región, la clave y el
  secreto de aplicación, y que la clave de consumidor se validó (la página de
  creación debe terminar con éxito) y no ha caducado ni se ha revocado.
- **«A la clave de consumidor le faltan permisos»**: cree una clave nueva con
  el enlace de la configuración, que rellena los tres permisos.
- **«Ninguna cuenta SMS utilizable»**: contrate un pack de SMS, o introduzca
  el nombre de servicio si su cuenta de OVHcloud tiene varias cuentas SMS
  (las muestra «Probar la conexión»).
- **«Remitente rechazado»**: el remitente de la configuración aún no está
  activo (pendiente de validación): vacíe el campo para usar la elección
  automática.
- **No llega ningún SMS**: la recepción necesita un número virtual o las
  respuestas al número corto; compruebe que «Leer los SMS recibidos» está
  activado.
- **Registros**: Integraciones → OVHcloud SMS → pestaña Supervisión. Los
  números aparecen enmascarados; las claves nunca aparecen.
