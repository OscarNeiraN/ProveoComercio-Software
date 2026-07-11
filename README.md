# ProveoComercio - Aplicacion

Este directorio contiene la aplicacion web: backend Node.js/Express, worker de procesamiento asincrono, frontend estatico servido por Nginx, y la imagen de migracion de base de datos. Es un repositorio independiente del de infraestructura (`Terraform`).

En produccion esto se despliega en AWS ECS Fargate. Este documento cubre unicamente el uso local con Docker Compose. Para infraestructura y despliegue en AWS, ver el README del repositorio `Terraform`.

## Estructura

- `backend/`: API REST (Express), worker de colas (SQS), generador de boletas DTE, envio de correo.
- `frontend/`: HTML, CSS y JS sin framework, servido por Nginx. En produccion Nginx hace de proxy hacia el backend interno.
- `migration/`: imagen usada una sola vez para importar un dump MySQL dentro de la VPC privada.
- `docker-compose.yml`: entorno local (backend + frontend).
- `docker-compose.ci.yml`: entorno efimero usado por el pipeline de CI para las pruebas DAST.
- `.github/workflows/`: pipelines de CI, CD y rollback manual.

## Requisitos

- Docker y Docker Compose.
- Node.js 20 (opcional, solo si se quiere correr el backend fuera de contenedores).

No se necesita MySQL, SMTP ni AWS configurados para levantar la aplicacion. El backend detecta que falta esa configuracion y responde en consecuencia (ver la seccion Configuracion).

## Configuracion

El backend lee sus variables desde `App/backend/.env`. Ese archivo no se sube al repositorio (esta en `.gitignore`) porque en un entorno real contendria credenciales reales. Hay que crearlo antes del primer arranque.

### Variables generales

| Variable | Descripcion |
|---|---|
| `PORT` | Puerto HTTP del backend. Por defecto 3000. |
| `NODE_ENV` | `development` o `production`. |
| `FRONTEND_URL` | Origen permitido por CORS. Si queda vacio, el backend acepta cualquier origen (`*`); no dejar vacio en produccion. |
| `JWT_SECRET` | Secreto para firmar tokens de sesion. Si no se define, usa un valor por defecto inseguro: definirlo siempre fuera de un entorno de prueba. |
| `HEALTHCHECK_DEEP` | `true` para que `/api/health` verifique la conexion a MySQL por defecto (sin esto, el chequeo profundo solo corre si se pide con `?deep=1`). |

### Base de datos (MySQL / RDS)

`DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`.

Si `DB_HOST`, `DB_NAME` o `DB_USER` no estan definidos, el backend arranca en modo sin base de datos: `/api/health` responde igual, pero todo lo que dependa de MySQL (login, registro, productos, ordenes) responde 503.

### Emisor de boletas (DTE Chile)

`RUT_EMISOR`, `RAZON_SOCIAL`, `GIRO`, `ACTECO`, `DIR_EMISOR`, `COMUNA_EMISOR`, `CIUDAD_EMISOR`.

Datos del emisor que se graban en el XML de la boleta. Si no se definen, se usan valores de relleno claramente identificables como no configurados.

### Correo (SMTP)

| Variable | Descripcion |
|---|---|
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_SECURE`, `MAIL_FROM` | Si `SMTP_HOST`, `SMTP_USER` o `SMTP_PASSWORD` faltan, el envio de correo no funciona a menos que `ALLOW_SIMULATED_MAIL=true`. |
| `ALLOW_SIMULATED_MAIL` | `true` permite que el backend "simule" el envio (lo deja registrado en el log del contenedor en vez de mandarlo de verdad) cuando no hay SMTP configurado. Util para desarrollo local y para el pipeline de CI. En produccion no deberia dejarse en `true` si se espera que los correos salgan de verdad. |

### Cola de pedidos (SQS)

| Variable | Descripcion |
|---|---|
| `SQS_QUEUE_URL` | Si esta vacio, el backend procesa la orden en el mismo request (sin cola) en vez de encolarla. |
| `AWS_REGION` | Region de SQS. Por defecto `us-east-1`. |
| `SQS_VISIBILITY_TIMEOUT_SECONDS`, `SQS_WAIT_TIME_SECONDS`, `SQS_MAX_MESSAGES` | Tuning del long polling del worker. Valores por defecto razonables si se dejan sin definir. |
| `WORKER_RECOVERY_INTERVAL_SECONDS`, `WORKER_RECOVERY_BATCH_SIZE` | Cada cuanto y cuantas ordenes revisa el worker por si quedaron a medio procesar fuera de SQS (por ejemplo, si el mensaje se perdio o el proceso se reinicio a mitad de una orden). |

Para desarrollo local sin AWS, dejar `SQS_QUEUE_URL` vacio: el backend procesa cada orden de forma sincrona apenas se crea, sin necesitar cola.

### Ejemplo minimo

Para levantar todo localmente, sin RDS ni SMTP reales:

```env
PORT=3000
NODE_ENV=development
FRONTEND_URL=http://localhost:8080
JWT_SECRET=un_secreto_largo_solo_para_desarrollo
ALLOW_SIMULATED_MAIL=true
```

Con esas variables el backend arranca en modo sin base de datos: el frontend carga, el health check responde, pero login, registro, catalogo y pedidos devuelven 503 hasta que se agreguen las variables `DB_*`.

Para probar el flujo completo (usuarios, catalogo, ordenes, boletas) hace falta un MySQL accesible. Se puede usar una instancia local corriendo aparte, o apuntar `DB_HOST` a una RDS real si se tiene una desplegada (ver README de `Terraform`).

## Levantar con Docker Compose

Desde `App/`:

```powershell
docker compose up --build
```

Esto construye las imagenes de backend y frontend y las levanta:

- Frontend: `http://localhost:8080`
- Backend: `http://localhost:3000/api/health`

El frontend no arranca hasta que el backend pase su health check (`depends_on` con `condition: service_healthy` en `docker-compose.yml`).

## Verificar que funciona

```powershell
curl http://localhost:3000/api/health
```

Responde JSON con `status`, si la base de datos esta conectada (`db.connected`, solo si se pide el chequeo profundo) y el modo (`mode`: `rds` o `unconfigured`).

Abrir `http://localhost:8080` en el navegador para ver el catalogo. Si el backend no tiene base de datos configurada, la pagina muestra el estado y el catalogo aparece vacio con un error claro, no una pantalla rota.

## Detener y limpiar

```powershell
docker compose down
```

Para borrar tambien los volumenes (si se agrego alguno propio, por ejemplo un MySQL local):

```powershell
docker compose down -v
```

## Correr el backend fuera de Docker

```powershell
cd backend
npm install
npm run dev
```

Requiere el mismo archivo `.env`. `npm run dev` usa nodemon (reinicia solo al guardar cambios). `npm start` lo corre sin nodemon.

## Tests

```powershell
cd backend
npm test
```

Corre las pruebas unitarias con el test runner nativo de Node (`node --test`). No requieren Docker ni base de datos: cubren logica pura (generacion y escapado del XML de boleta, calculo de folios).

## Pipeline de CI/CD

Los workflows viven en `.github/workflows/` y corren sobre este mismo repositorio (`App`).

- `ci.yml`: en cada push a `main` y cada pull request. Corre en orden: pruebas unitarias, SAST/SCA (`npm audit`, Snyk Open Source, Snyk Code, Semgrep, Trivy filesystem), y DAST (OWASP ZAP contra la app levantada con `docker-compose.ci.yml`, con una base MySQL real de prueba). Las pruebas unitarias bloquean el pipeline si fallan; los hallazgos de SAST/SCA/DAST quedan como warnings y artifacts, pero no frenan el despliegue.
- `cd.yml`: se dispara automaticamente cuando `ci.yml` termina bien en `main`, o a mano con `workflow_dispatch`. Construye las imagenes de backend y frontend, las escanea con Trivy, sube los reportes como artifacts, las publica en ECR y actualiza los tres servicios ECS (backend, worker, frontend) con la nueva revision aunque Trivy encuentre vulnerabilidades.
- `rollback.yml`: se dispara solo a mano (`workflow_dispatch`). Permite volver un servicio ECS especifico a una revision de task definition anterior sin tener que usar la consola de AWS ni memorizar comandos de AWS CLI. Muestra las ultimas revisiones disponibles (imagen y fecha) antes de aplicar el cambio.

### GitHub Secrets y variables que necesita este repositorio

| Nombre | Descripcion |
|---|---|
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`, `AWS_REGION` | Credenciales AWS. `AWS_SESSION_TOKEN` es obligatorio en AWS Academy Learner Lab (la sesion vence cada pocas horas) y puede quedar vacio en una cuenta AWS normal con credenciales permanentes. |
| `SNYK_TOKEN` | Token de autenticacion de Snyk. Debe ir como GitHub Secret. |
| `SNYK_ORG` | Organizacion de Snyk usada por `snyk test`, `snyk monitor` y `snyk code test`. Recomendado como GitHub Actions Variable porque no es una credencial. El workflow tambien acepta `SNYK_ORG` como Secret, pero los enlaces publicados se codifican para evitar que GitHub los reemplace por `***`. |

En Snyk se publica `proveocomercio-software-dependencies` para dependencias detectadas desde la raiz con `--all-projects`. El analisis Snyk Code se ejecuta en CI como gate y queda en los artifacts `snyk-code.json` y `snyk-code.sarif`. Para ver preview de codigo en Snyk Web UI, el repositorio debe importarse desde la integracion GitHub de Snyk; los proyectos Code creados solamente por CLI pueden mostrar hallazgos sin preview de codigo.

### Snyk Code con preview de codigo

Para que Snyk permita abrir el codigo fuente dentro de la UI:

1. En Snyk, ir a `Settings > Integrations > Source control`.
2. Configurar la integracion de GitHub si aun no esta configurada.
3. Ir a `Projects > Add project > GitHub`.
4. Importar `OscarNeiraN/ProveoComercio-Software`.
5. Si existe el proyecto antiguo `proveocomercio-software-code`, eliminarlo para evitar confusion; ese fue creado por CLI y puede mostrar `Code preview not available`.

Los nombres de cluster, servicios y task definitions de ECS estan hardcodeados como variables de entorno dentro de `cd.yml` y `rollback.yml` (no son secretos, son configuracion): `proveocomercio-cluster`, `proveocomercio-frontend-service`, `proveocomercio-backend-service`, `proveocomercio-worker-service`, y las familias de task definition correspondientes.

## Notas sobre las imagenes Docker

- `backend/Dockerfile`: corre como usuario no root (`USER node`). `backend/.dockerignore` excluye `node_modules`, `.env`, tests y reportes de seguridad del build context, para que no queden copiados dentro de la imagen.
- `frontend/Dockerfile`: Nginx sirviendo los archivos estaticos y haciendo proxy de `/api` hacia el backend (`BACKEND_UPSTREAM`, inyectado por Terraform en produccion; en local, docker-compose usa el nombre de servicio `backend` directamente via `nginx.conf.template`).

## Troubleshooting

**Backend responde 503 en casi todo excepto `/api/health`.**
Faltan `DB_HOST`, `DB_NAME` o `DB_USER` en `backend/.env`. Es el comportamiento esperado sin base de datos configurada, no un error.

**El correo de confirmacion nunca llega.**
Si no hay SMTP configurado y `ALLOW_SIMULATED_MAIL` no es `true`, el envio falla con un error explicito en el log. Si `ALLOW_SIMULATED_MAIL=true`, el correo no se envia de verdad: queda registrado en el log del contenedor backend.

**El frontend no arranca.**
`docker-compose.yml` hace que el frontend espere a que el backend pase su healthcheck. Si el backend no levanta (por ejemplo, un `.env` invalido), revisar los logs del backend primero: `docker compose logs backend`.
