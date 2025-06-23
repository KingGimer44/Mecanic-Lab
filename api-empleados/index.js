// index.js
const express = require("express");
const cors = require("cors");
const { createClient } = require("@libsql/client");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

// Configura conexión a Turso/libSQL
const db = createClient({
  url: process.env.DATABASE_URL,
});

// Ruta de prueba
app.get("/", (req, res) => {
  res.send("API Funcionando 🚀");
});

// --- USERS ---
app.get("/users", async (req, res) => {
  try {
    const result = await db.execute("SELECT * FROM users");
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error al obtener usuarios");
  }
});

app.post("/users", async (req, res) => {
  const { id, name, email, password, role } = req.body;
  try {
    await db.execute({
      sql: `INSERT INTO users (id, name, email, password, role) VALUES (?, ?, ?, ?, ?)` ,
      args: [id, name, email, password, role || 'user']
    });
    res.status(201).send("Usuario creado");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error al crear usuario");
  }
});

// --- JOBS ---
app.get("/jobs", async (req, res) => {
  try {
    const result = await db.execute("SELECT * FROM jobs");
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error al obtener trabajos");
  }
});

app.post("/jobs", async (req, res) => {
  const { id, client_name, car_brand_model, issue_description, progress, user_id } = req.body;
  try {
    await db.execute({
      sql: `INSERT INTO jobs (id, client_name, car_brand_model, issue_description, progress, user_id) VALUES (?, ?, ?, ?, ?, ?)` ,
      args: [id, client_name, car_brand_model, issue_description, progress || 0, user_id]
    });
    res.status(201).send("Trabajo creado");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error al crear trabajo");
  }
});

// --- OBJECTIVES ---
app.get("/objectives", async (req, res) => {
  try {
    const result = await db.execute("SELECT * FROM objectives");
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error al obtener objetivos");
  }
});

app.post("/objectives", async (req, res) => {
  const { id, job_id, description, is_completed } = req.body;
  try {
    await db.execute({
      sql: `INSERT INTO objectives (id, job_id, description, is_completed) VALUES (?, ?, ?, ?)` ,
      args: [id, job_id, description, is_completed || false]
    });
    res.status(201).send("Objetivo creado");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error al crear objetivo");
  }
});

// --- PARTS ---
app.get("/parts", async (req, res) => {
  try {
    const result = await db.execute("SELECT * FROM parts");
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error al obtener piezas");
  }
});

app.post("/parts", async (req, res) => {
  const { id, name, is_available } = req.body;
  try {
    await db.execute({
      sql: `INSERT INTO parts (id, name, is_available) VALUES (?, ?, ?)` ,
      args: [id, name, is_available || true]
    });
    res.status(201).send("Pieza creada");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error al crear pieza");
  }
});

// --- PART REQUESTS ---
app.get("/part_requests", async (req, res) => {
  try {
    const result = await db.execute("SELECT * FROM part_requests");
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error al obtener peticiones de piezas");
  }
});

app.post("/part_requests", async (req, res) => {
  const { id, part_name, car_brand_model, user_id, status } = req.body;
  try {
    await db.execute({
      sql: `INSERT INTO part_requests (id, part_name, car_brand_model, user_id, status) VALUES (?, ?, ?, ?, ?)` ,
      args: [id, part_name, car_brand_model, user_id, status || 'pending']
    });
    res.status(201).send("Petición de pieza creada");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error al crear petición de pieza");
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});
