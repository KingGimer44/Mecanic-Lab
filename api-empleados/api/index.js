const { createClient } = require("@libsql/client");

const db = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

// --- Función para enviar notificaciones push ---
async function sendPushNotification(pushToken, title, body, data = {}) {
  const message = {
    to: pushToken,
    sound: 'default',
    title,
    body,
    data,
  };

  await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Accept-encoding': 'gzip, deflate',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(message),
  });
}

module.exports = async (req, res) => {
  // Parsear método y ruta
  const { method, url } = req;
  // Quitar query params
  const cleanUrl = url.split('?')[0];

  // --- USERS ---
  if (method === "GET" && cleanUrl === "/api/users") {
    try {
      const result = await db.execute("SELECT * FROM users");
      res.status(200).json(result.rows);
    } catch (err) {
      res.status(500).json({ error: "Error al obtener usuarios" });
    }
    return;
  }
  if (method === "POST" && cleanUrl === "/api/users") {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", async () => {
      try {
        const { id, name, email, password, role } = JSON.parse(body);
        await db.execute({
          sql: `INSERT INTO users (id, name, email, password, role) VALUES (?, ?, ?, ?, ?)` ,
          args: [id, name, email, password, role || 'user']
        });
        res.status(201).json({ message: "Usuario creado" });
      } catch (err) {
        res.status(500).json({ error: "Error al crear usuario" });
      }
    });
    return;
  }

  // --- USERS (SAVE PUSH TOKEN) ---
  if (method === "POST" && cleanUrl === "/api/users/save-push-token") {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", async () => {
      try {
        const { userId, pushToken } = JSON.parse(body);
        if (!userId || !pushToken) {
          return res.status(400).json({ error: "userId y pushToken son requeridos." });
        }
        // Actualizar el push_token para el usuario
        await db.execute({
          sql: `UPDATE users SET push_token = ? WHERE id = ?`,
          args: [pushToken, userId]
        });
        res.status(200).json({ message: "Push token guardado exitosamente." });
      } catch (err) {
        console.error("Error al guardar push token:", err);
        res.status(500).json({ error: "Error al guardar push token." });
      }
    });
    return;
  }

  // --- JOBS ---
  if (method === "GET" && cleanUrl === "/api/jobs") {
    try {
      const result = await db.execute("SELECT * FROM jobs");
      res.status(200).json(result.rows);
    } catch (err) {
      res.status(500).json({ error: "Error al obtener trabajos" });
    }
    return;
  }
  if (method === "POST" && cleanUrl === "/api/jobs") {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", async () => {
      try {
        const { id, client_name, car_brand_model, issue_description, progress, user_id } = JSON.parse(body);
        await db.execute({
          sql: `INSERT INTO jobs (id, client_name, car_brand_model, issue_description, progress, user_id) VALUES (?, ?, ?, ?, ?, ?)` ,
          args: [id, client_name, car_brand_model, issue_description, progress || 0, user_id]
        });

        // --- NOTIFICACIÓN PARA EL ADMIN: Nuevo trabajo creado ---
        const adminResult = await db.execute(`SELECT id, push_token FROM users WHERE role = 'admin' LIMIT 1`);
        if (adminResult.rows.length > 0) {
          const adminUser = adminResult.rows[0];
          const adminUserId = adminUser.id;
          const notificationMessage = `Se ha creado un nuevo trabajo para ${client_name} (${car_brand_model}).`;
          const notificationId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
          await db.execute({
            sql: `INSERT INTO notifications (id, user_id, message, type, related_id) VALUES (?, ?, ?, ?, ?)`,
            args: [notificationId, adminUserId, notificationMessage, 'new_job', id]
          });
          // Enviar push notification al admin
          if (adminUser.push_token) {
            await sendPushNotification(adminUser.push_token, 'Nuevo Trabajo', notificationMessage);
          }
        }

        res.status(201).json({ message: "Trabajo creado y notificación enviada al admin" });
      } catch (err) {
        console.error("Error al crear trabajo o enviar notificación:", err);
        res.status(500).json({ error: "Error al crear trabajo" });
      }
    });
    return;
  }

  // --- JOBS (PUT to finalize) ---
  if (method === "PUT" && cleanUrl.startsWith("/api/jobs/") && cleanUrl.endsWith("/finalize")) {
    const jobId = cleanUrl.split('/')[cleanUrl.split('/').length - 2]; // Extraer el ID del trabajo
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", async () => {
      try {
        const { is_completed } = JSON.parse(body);
        if (is_completed === undefined) {
          return res.status(400).json({ error: "El campo 'is_completed' es requerido para la actualización." });
        }

        await db.execute({
          sql: `UPDATE jobs SET is_completed = ? WHERE id = ?`,
          args: [is_completed ? 1 : 0, jobId]
        });
        res.status(200).json({ message: "Trabajo finalizado correctamente" });
      } catch (err) {
        console.error("Error al finalizar el trabajo:", err);
        res.status(500).json({ error: "Error al finalizar el trabajo" });
      }
    });
    return;
  }

  // --- OBJECTIVES ---
  if (method === "GET" && cleanUrl === "/api/objectives") {
    try {
      const result = await db.execute("SELECT * FROM objectives");
      res.status(200).json(result.rows);
    } catch (err) {
      res.status(500).json({ error: "Error al obtener objetivos" });
    }
    return;
  }
  if (method === "POST" && cleanUrl === "/api/objectives") {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", async () => {
      try {
        const { id, job_id, description, is_completed } = JSON.parse(body);
        await db.execute({
          sql: `INSERT INTO objectives (id, job_id, description, is_completed) VALUES (?, ?, ?, ?)` ,
          args: [id, job_id, description, is_completed || false]
        });
        res.status(201).json({ message: "Objetivo creado" });
      } catch (err) {
        res.status(500).json({ error: "Error al crear objetivo" });
      }
    });
    return;
  }

  // --- PARTS ---
  if (method === "GET" && cleanUrl === "/api/parts") {
    try {
      const result = await db.execute("SELECT * FROM parts");
      res.status(200).json(result.rows);
    } catch (err) {
      res.status(500).json({ error: "Error al obtener piezas" });
    }
    return;
  }
  if (method === "POST" && cleanUrl === "/api/parts") {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", async () => {
      try {
        const { id, name, is_available } = JSON.parse(body);
        await db.execute({
          sql: `INSERT INTO parts (id, name, is_available) VALUES (?, ?, ?)` ,
          args: [id, name, is_available || true]
        });
        res.status(201).json({ message: "Pieza creada" });
      } catch (err) {
        res.status(500).json({ error: "Error al crear pieza" });
      }
    });
    return;
  }

// --- PARTS (PUT to update availability) ---
  if (method === "PUT" && cleanUrl.startsWith("/api/parts/")) {
    const partId = cleanUrl.split("/").pop(); // Extraer el ID de la pieza de la URL
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", async () => {
      try {
        const { is_available } = JSON.parse(body);
        console.log("PUT /api/parts/:id - partId:", partId);
        console.log("PUT /api/parts/:id - received is_available:", is_available);

        if (is_available === undefined) {
          return res.status(400).json({ error: "Campo 'is_available' es requerido para la actualización." });
        }

        const availabilityValue = is_available ? 1 : 0;
        console.log("PUT /api/parts/:id - converting to DB value:", availabilityValue);
        const sqlQuery = `UPDATE parts SET is_available = ? WHERE id = ?`;
        console.log("PUT /api/parts/:id - SQL Query:", sqlQuery, "Args:", [availabilityValue, partId]);

        await db.execute({
          sql: sqlQuery,
          args: [availabilityValue, partId]
        });

        // --- NOTIFICACIÓN PARA EL USUARIO: Pieza disponible ---
        if (is_available) { // Solo enviar notificación cuando se marca como disponible
            const partRequestResult = await db.execute({
                sql: `SELECT user_id, part_name FROM part_requests WHERE id = ?`,
                args: [partId]
            });

            if (partRequestResult.rows.length > 0) {
                const requester = partRequestResult.rows[0];
                const requesterUserId = requester.user_id;
                const requestedPartName = requester.part_name;
                const notificationMessage = `Tu pieza "${requestedPartName}" ya está disponible.`;
                const notificationId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

                await db.execute({
                    sql: `INSERT INTO notifications (id, user_id, message, type, related_id) VALUES (?, ?, ?, ?, ?)`,
                    args: [notificationId, requesterUserId, notificationMessage, 'part_available', partId]
                });
                // Enviar push notification al usuario
                const userResult = await db.execute({ sql: `SELECT push_token FROM users WHERE id = ?`, args: [requesterUserId] });
                if (userResult.rows.length > 0 && userResult.rows[0].push_token) {
                    await sendPushNotification(userResult.rows[0].push_token, 'Pieza Disponible', notificationMessage);
                }
            }
        }

        res.status(200).json({ message: "Disponibilidad de pieza actualizada correctamente" });
      } catch (err) {
        console.error("Error al actualizar la disponibilidad de la pieza:", err);
        res.status(500).json({ error: "Error al actualizar la disponibilidad de la pieza" });
      }
    });
    return;
  }

  // --- PART REQUESTS ---
  if (method === "GET" && cleanUrl === "/api/part_requests") {
    try {
      const result = await db.execute("SELECT * FROM part_requests");
      res.status(200).json(result.rows);
    } catch (err) {
      res.status(500).json({ error: "Error al obtener peticiones de piezas" });
    }
    return;
  }
  if (method === "POST" && cleanUrl === "/api/part_requests") {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", async () => {
      try {
        const { id, part_name, car_brand_model, user_id, status } = JSON.parse(body);
        
        // Insertar en part_requests
        await db.execute({
          sql: `INSERT INTO part_requests (id, part_name, car_brand_model, user_id, status) VALUES (?, ?, ?, ?, ?)` ,
          args: [id, part_name, car_brand_model, user_id, status || 'pending']
        });

        // Insertar en parts también, con is_available en false inicialmente
        await db.execute({
          sql: `INSERT INTO parts (id, name, is_available) VALUES (?, ?, ?)` ,
          args: [id, part_name, false] // Al solicitarla, inicialmente NO está disponible
        });

        // --- NOTIFICACIÓN PARA EL ADMIN: Nueva petición de pieza ---
        const adminResult = await db.execute(`SELECT id, push_token FROM users WHERE role = 'admin' LIMIT 1`);
        if (adminResult.rows.length > 0) {
          const adminUser = adminResult.rows[0];
          const adminUserId = adminUser.id;
          const notificationMessage = `Nueva petición de pieza: ${part_name} para ${car_brand_model}.`;
          const notificationId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
          await db.execute({
            sql: `INSERT INTO notifications (id, user_id, message, type, related_id) VALUES (?, ?, ?, ?, ?)`,
            args: [notificationId, adminUserId, notificationMessage, 'part_request', id]
          });
          // Enviar push notification al admin
          if (adminUser.push_token) {
            await sendPushNotification(adminUser.push_token, 'Nueva Petición de Pieza', notificationMessage);
          }
        }

        res.status(201).json({ message: "Petición de pieza creada y pieza añadida a inventario (no disponible), notificación enviada" });
      } catch (err) {
        console.error("Error al crear petición de pieza o añadir a inventario:", err);
        res.status(500).json({ error: "Error al crear petición de pieza o añadir a inventario" });
      }
    });
    return;
  }

  // --- JOB FINALIZATION REQUESTS ---
  if (method === "POST" && cleanUrl === "/api/job_finalization_requests") {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", async () => {
      try {
        const { id, job_id, user_id, status, request_message } = JSON.parse(body);
        await db.execute({
          sql: `INSERT INTO job_finalization_requests (id, job_id, user_id, status, request_message) VALUES (?, ?, ?, ?, ?)` ,
          args: [id, job_id, user_id, status || 'pending', request_message]
        });

        // --- NOTIFICACIÓN PARA EL ADMIN: Solicitud de finalización de trabajo ---
        const adminResult = await db.execute(`SELECT id, push_token FROM users WHERE role = 'admin' LIMIT 1`);
        if (adminResult.rows.length > 0) {
          const adminUser = adminResult.rows[0];
          const adminUserId = adminUser.id;
          const notificationId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
          await db.execute({
            sql: `INSERT INTO notifications (id, user_id, message, type, related_id) VALUES (?, ?, ?, ?, ?)`,
            args: [notificationId, adminUserId, request_message, 'job_finalization_request', id]
          });
          // Enviar push notification al admin
          if (adminUser.push_token) {
            await sendPushNotification(adminUser.push_token, 'Solicitud de Finalización', request_message);
          }
        }

        res.status(201).json({ message: "Solicitud de finalización de trabajo creada y notificación enviada al admin" });
      } catch (err) {
        console.error("Error al crear solicitud de finalización de trabajo o enviar notificación:", err);
        res.status(500).json({ error: "Error al crear solicitud de finalización de trabajo" });
      }
    });
    return;
  }

  // --- JOB FINALIZATION REQUESTS (PUT to approve/reject) ---
  if (method === "PUT" && cleanUrl.startsWith("/api/job_finalization_requests/")) {
    const requestId = cleanUrl.split('/')[cleanUrl.split('/').length - 2]; // Extraer el ID de la solicitud
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", async () => {
      try {
        let statusToSet;
        let messageToUser;

        if (cleanUrl.endsWith("/approve")) {
          statusToSet = 'approved';
          // Obtener job_id y user_id de la solicitud para finalizar el trabajo y notificar al usuario
          const requestResult = await db.execute({ sql: `SELECT job_id, user_id FROM job_finalization_requests WHERE id = ?`, args: [requestId] });
          if (requestResult.rows.length > 0) {
            const { job_id, user_id } = requestResult.rows[0];
            // Marcar el trabajo como completado
            await db.execute({ sql: `UPDATE jobs SET is_completed = ? WHERE id = ?`, args: [true, job_id] });
            // Obtener detalles del trabajo para la notificación
            const jobResult = await db.execute({ sql: `SELECT client_name, car_brand_model FROM jobs WHERE id = ?`, args: [job_id] });
            const jobName = jobResult.rows[0]?.client_name + ' - ' + jobResult.rows[0]?.car_brand_model;
            messageToUser = `Tu solicitud para finalizar el trabajo "${jobName}" ha sido APROBADA.`;
            // Notificar al usuario
            const notificationId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
            await db.execute({ sql: `INSERT INTO notifications (id, user_id, message, type, related_id) VALUES (?, ?, ?, ?, ?)`, args: [notificationId, user_id, messageToUser, 'job_finalization_approved', job_id] });
            // Enviar push notification al usuario
            const userResult = await db.execute({ sql: `SELECT push_token FROM users WHERE id = ?`, args: [user_id] });
            if (userResult.rows.length > 0 && userResult.rows[0].push_token) {
                await sendPushNotification(userResult.rows[0].push_token, 'Solicitud Aprobada', messageToUser);
            }
          } else {
            return res.status(404).json({ error: "Solicitud no encontrada para aprobar" });
          }
        } else if (cleanUrl.endsWith("/reject")) {
          statusToSet = 'rejected';
          // Obtener user_id y job_id de la solicitud para notificar al usuario
          const requestResult = await db.execute({ sql: `SELECT job_id, user_id FROM job_finalization_requests WHERE id = ?`, args: [requestId] });
          if (requestResult.rows.length > 0) {
            const { job_id, user_id } = requestResult.rows[0];
            // Obtener detalles del trabajo para la notificación
            const jobResult = await db.execute({ sql: `SELECT client_name, car_brand_model FROM jobs WHERE id = ?`, args: [job_id] });
            const jobName = jobResult.rows[0]?.client_name + ' - ' + jobResult.rows[0]?.car_brand_model;
            messageToUser = `Tu solicitud para finalizar el trabajo "${jobName}" ha sido RECHAZADA.`;
            // Notificar al usuario
            const notificationId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
            await db.execute({ sql: `INSERT INTO notifications (id, user_id, message, type, related_id) VALUES (?, ?, ?, ?, ?)`, args: [notificationId, user_id, messageToUser, 'job_finalization_rejected', job_id] });
            // Enviar push notification al usuario
            const userResult = await db.execute({ sql: `SELECT push_token FROM users WHERE id = ?`, args: [user_id] });
            if (userResult.rows.length > 0 && userResult.rows[0].push_token) {
                await sendPushNotification(userResult.rows[0].push_token, 'Solicitud Rechazada', messageToUser);
            }
          } else {
            return res.status(404).json({ error: "Solicitud no encontrada para rechazar" });
          }
        } else {
          return res.status(400).json({ error: "Ruta de acción no válida para la solicitud de finalización." });
        }

        // Actualizar el estado de la solicitud de finalización
        await db.execute({
          sql: `UPDATE job_finalization_requests SET status = ? WHERE id = ?`,
          args: [statusToSet, requestId]
        });

        res.status(200).json({ message: `Solicitud ${statusToSet} correctamente.` });
      } catch (err) {
        console.error(`Error al ${statusToSet} la solicitud de finalización:`, err);
        res.status(500).json({ error: `Error al ${statusToSet} la solicitud de finalización.` });
      }
    });
    return;
  }

  // --- NOTIFICATIONS ---
  if (method === "GET" && cleanUrl === "/api/notifications") {
    try {
      const userId = req.url.split('?')[1]?.split('=')[1]; // Extrae el user_id de los query params
      if (!userId) {
        return res.status(400).json({ error: "El parámetro 'user_id' es requerido." });
      }
      const result = await db.execute({
        sql: `SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC`,
        args: [userId]
      });
      res.status(200).json(result.rows);
    } catch (err) {
      console.error("Error al obtener notificaciones:", err);
      res.status(500).json({ error: "Error al obtener notificaciones" });
    }
    return;
  }

  // --- LOGIN ---
  if (method === "POST" && cleanUrl === "/api/login") {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", async () => {
      try {
        const { email, password } = JSON.parse(body);

        // Buscar el usuario en la base de datos por email y contraseña
        // ¡ADVERTENCIA!: En una aplicación real, las contraseñas nunca deben almacenarse ni compararse en texto plano.
        // Debes usar un hash seguro (ej. bcrypt) para almacenar y verificar contraseñas.
        const result = await db.execute({
          sql: `SELECT id, name, email, role FROM users WHERE email = ? AND password = ?`,
          args: [email, password]
        });

        if (result.rows.length > 0) {
          // Usuario encontrado, inicio de sesión exitoso
          const user = result.rows[0];
          res.status(200).json({ message: "Inicio de sesión exitoso", user: user });
        } else {
          // Credenciales inválidas
          res.status(401).json({ error: "Credenciales inválidas" });
        }
      } catch (err) {
        console.error("Error en el inicio de sesión:", err);
        res.status(500).json({ error: "Error al intentar iniciar sesión" });
      }
    });
    return;
  }

  // --- OBJECTIVES (PUT to update) ---
  if (method === "PUT" && cleanUrl.startsWith("/api/objectives/")) {
    const objectiveId = cleanUrl.split("/").pop(); // Extraer el ID del objetivo de la URL
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", async () => {
      try {
        const { is_completed } = JSON.parse(body);
        if (is_completed === undefined) {
          return res.status(400).json({ error: "Campo 'is_completed' es requerido para la actualización." });
        }

        await db.execute({
          sql: `UPDATE objectives SET is_completed = ? WHERE id = ?`,
          args: [is_completed ? 1 : 0, objectiveId] // Asegura que se guarda 1 o 0
        });
        res.status(200).json({ message: "Objetivo actualizado correctamente" });
      } catch (err) {
        console.error("Error al actualizar objetivo:", err);
        res.status(500).json({ error: "Error al actualizar objetivo" });
      }
    });
    return;
  }

  // Ruta por defecto
  res.status(404).json({ error: "Ruta no encontrada" });
}; 
