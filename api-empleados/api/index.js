const { createClient } = require("@libsql/client");

const db = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

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
        res.status(201).json({ message: "Trabajo creado" });
      } catch (err) {
        res.status(500).json({ error: "Error al crear trabajo" });
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
        await db.execute({
          sql: `INSERT INTO part_requests (id, part_name, car_brand_model, user_id, status) VALUES (?, ?, ?, ?, ?)` ,
          args: [id, part_name, car_brand_model, user_id, status || 'pending']
        });
        res.status(201).json({ message: "Petición de pieza creada" });
      } catch (err) {
        res.status(500).json({ error: "Error al crear petición de pieza" });
      }
    });
    return;
  }

  // Ruta por defecto
  res.status(404).json({ error: "Ruta no encontrada" });
}; 