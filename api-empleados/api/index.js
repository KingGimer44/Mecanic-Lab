const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
const port = 3000;

app.use(cors());
app.use(bodyParser.json());

const db = new sqlite3.Database('./database.db', (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password TEXT,
            role TEXT,
            expo_push_token TEXT
        )`);
        db.run(`CREATE TABLE IF NOT EXISTS jobs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            client_name TEXT,
            car_brand_model TEXT,
            issue_description TEXT,
            is_completed INTEGER DEFAULT 0,
            user_id INTEGER,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )`);
        db.run(`CREATE TABLE IF NOT EXISTS objectives (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id INTEGER,
            description TEXT,
            is_completed INTEGER DEFAULT 0,
            FOREIGN KEY (job_id) REFERENCES jobs(id)
        )`);
        db.run(`CREATE TABLE IF NOT EXISTS part_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id INTEGER,
            user_id INTEGER,
            part_name TEXT,
            request_date TEXT,
            is_urgent INTEGER DEFAULT 0,
            FOREIGN KEY (job_id) REFERENCES jobs(id),
            FOREIGN KEY (user_id) REFERENCES users(id)
        )`);
        db.run(`CREATE TABLE IF NOT EXISTS parts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            is_available INTEGER DEFAULT 0
        )`);
        db.run(`CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            title TEXT,
            message TEXT,
            is_read INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )`);
        db.run(`CREATE TABLE IF NOT EXISTS job_finalization_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id INTEGER,
            user_id INTEGER,
            request_date DATETIME DEFAULT CURRENT_TIMESTAMP,
            is_approved INTEGER DEFAULT 0,
            FOREIGN KEY (job_id) REFERENCES jobs(id),
            FOREIGN KEY (user_id) REFERENCES users(id)
        )`);
    }
});

// Helper function to send push notifications
async function sendPushNotification(token, title, message) {
    if (!token) {
        console.log('No Expo push token for user, skipping push notification.');
        return;
    }

    const notification = {
        to: token,
        title: title,
        body: message,
        sound: 'default',
    };

    try {
        await fetch('https://exp.host/--/api/v2/push/send', {
            method: 'POST',
            headers: {
                Accept: 'application/json',
                'Accept-encoding': 'gzip, deflate',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(notification),
        });
        console.log('Push notification sent successfully.');
    } catch (error) {
        console.error('Error sending push notification:', error);
    }
}

// GET all jobs
app.get('/api/jobs', (req, res) => {
    db.all('SELECT * FROM jobs', [], (err, rows) => {
        if (err) {
            res.status(400).json({ "error": err.message });
            return;
        }
        res.json(rows);
    });
});

// POST a new job
app.post('/api/jobs', (req, res) => {
    const { client_name, car_brand_model, issue_description, user_id } = req.body;
    db.run(
        'INSERT INTO jobs (client_name, car_brand_model, issue_description, user_id) VALUES (?, ?, ?, ?)',
        [client_name, car_brand_model, issue_description, user_id],
        function (err) {
            if (err) {
                res.status(400).json({ "error": err.message });
                return;
            }
            const jobId = this.lastID;
            // Notify admins about new job
            db.all('SELECT expo_push_token FROM users WHERE role = "admin"', [], (err, admins) => {
                if (err) {
                    console.error('Error fetching admin tokens:', err.message);
                    return;
                }
                admins.forEach(admin => {
                    sendPushNotification(admin.expo_push_token, 'Nuevo Trabajo Creado', `Se ha creado un nuevo trabajo para ${client_name}.`);
                    db.run('INSERT INTO notifications (user_id, title, message) VALUES (?, ?, ?)',
                        [admin.id, 'Nuevo Trabajo Creado', `Se ha creado un nuevo trabajo para ${client_name}.`]);
                });
            });
            res.status(201).json({ id: jobId, client_name, car_brand_model, issue_description, user_id });
        }
    );
});

// GET objectives for a specific job
app.get('/api/objectives/:job_id', (req, res) => {
    const { job_id } = req.params;
    db.all('SELECT * FROM objectives WHERE job_id = ?', [job_id], (err, rows) => {
        if (err) {
            res.status(400).json({ "error": err.message });
            return;
        }
        res.json(rows);
    });
});

// POST a new objective
app.post('/api/objectives', (req, res) => {
    const { job_id, description } = req.body;
    db.run(
        'INSERT INTO objectives (job_id, description) VALUES (?, ?)',
        [job_id, description],
        function (err) {
            if (err) {
                res.status(400).json({ "error": err.message });
                return;
            }
            res.status(201).json({ id: this.lastID, job_id, description });
        }
    );
});

// PUT (update) an objective
app.put('/api/objectives/:id', (req, res) => {
    const { id } = req.params;
    const { is_completed } = req.body;
    db.run(
        'UPDATE objectives SET is_completed = ? WHERE id = ?',
        [is_completed, id],
        function (err) {
            if (err) {
                res.status(400).json({ "error": err.message });
                return;
            }
            if (this.changes === 0) {
                res.status(404).json({ "error": "Objective not found." });
            } else {
                res.json({ message: 'Objective updated successfully.', changes: this.changes });
            }
        }
    );
});

// GET all part requests
app.get('/api/part_requests', (req, res) => {
    db.all('SELECT * FROM part_requests', [], (err, rows) => {
        if (err) {
            res.status(400).json({ "error": err.message });
            return;
        }
        res.json(rows);
    });
});

// POST a new part request
app.post('/api/part_requests', (req, res) => {
    const { job_id, user_id, part_name, is_urgent } = req.body;
    const request_date = new Date().toISOString();

    db.serialize(() => {
        db.run(
            'INSERT INTO part_requests (job_id, user_id, part_name, request_date, is_urgent) VALUES (?, ?, ?, ?, ?)',
            [job_id, user_id, part_name, request_date, is_urgent],
            function (err) {
                if (err) {
                    res.status(400).json({ "error": err.message });
                    return;
                }
                const partRequestId = this.lastID;

                // Also insert into 'parts' table with is_available = 0
                db.run(
                    'INSERT INTO parts (name, is_available) VALUES (?, ?)',
                    [part_name, 0],
                    function (err) {
                        if (err) {
                            res.status(400).json({ "error": err.message });
                            return;
                        }
                        const newPartId = this.lastID;
                        // Notify admins about new part request
                        db.all('SELECT id, expo_push_token FROM users WHERE role = "admin"', [], (err, admins) => {
                            if (err) {
                                console.error('Error fetching admin tokens:', err.message);
                                return;
                            }
                            admins.forEach(admin => {
                                sendPushNotification(admin.expo_push_token, 'Nueva Solicitud de Pieza', `Se ha solicitado la pieza "${part_name}" para el trabajo ${job_id}.`);
                                db.run('INSERT INTO notifications (user_id, title, message) VALUES (?, ?, ?)',
                                    [admin.id, 'Nueva Solicitud de Pieza', `Se ha solicitado la pieza "${part_name}" para el trabajo ${job_id}.`]);
                            });
                        });
                        res.status(201).json({ id: partRequestId, job_id, user_id, part_name, request_date, is_urgent, newPartId });
                    }
                );
            }
        );
    });
});

// GET all parts
app.get('/api/parts', (req, res) => {
    db.all('SELECT * FROM parts', [], (err, rows) => {
        if (err) {
            res.status(400).json({ "error": err.message });
            return;
        }
        res.json(rows);
    });
});

// PUT (update) a part's availability
app.put('/api/parts/:id', (req, res) => {
    const { id } = req.params;
    const { is_available } = req.body;
    console.log(`Received PUT for /api/parts/${id} with is_available: ${is_available}`);

    db.run(
        'UPDATE parts SET is_available = ? WHERE id = ?',
        [is_available ? 1 : 0, id],
        function (err) {
            if (err) {
                console.error('Error updating part availability:', err.message);
                res.status(400).json({ "error": err.message });
                return;
            }
            if (this.changes === 0) {
                res.status(404).json({ "error": "Part not found." });
            } else {
                console.log(`Part ${id} updated, changes: ${this.changes}`);
                // Notify user who requested the part that it's now available
                db.get('SELECT user_id, part_name FROM part_requests WHERE id = (SELECT MAX(id) FROM part_requests WHERE part_name = (SELECT name FROM parts WHERE id = ?))', [id], (err, partRequest) => {
                    if (err) {
                        console.error('Error fetching part request for notification:', err.message);
                        return;
                    }
                    if (partRequest && partRequest.user_id) {
                        db.get('SELECT expo_push_token FROM users WHERE id = ?', [partRequest.user_id], (err, user) => {
                            if (err) {
                                console.error('Error fetching user token for notification:', err.message);
                                return;
                            }
                            if (user && user.expo_push_token) {
                                sendPushNotification(user.expo_push_token, 'Pieza Disponible', `La pieza "${partRequest.part_name}" ya está disponible.`);
                                db.run('INSERT INTO notifications (user_id, title, message) VALUES (?, ?, ?)',
                                    [partRequest.user_id, 'Pieza Disponible', `La pieza "${partRequest.part_name}" ya está disponible.`]);
                            }
                        });
                    }
                });
                res.json({ message: 'Part updated successfully.', changes: this.changes });
            }
        }
    );
});

// NEW: DELETE a part
app.delete('/api/parts/:id', (req, res) => {
    const { id } = req.params;
    let deletedPartName;

    db.get('SELECT name FROM parts WHERE id = ?', [id], (err, row) => {
        if (err) {
            res.status(400).json({ "error": err.message });
            return;
        }
        if (!row) {
            res.status(404).json({ "error": "Part not found." });
            return;
        }
        deletedPartName = row.name;

        db.run('DELETE FROM parts WHERE id = ?', [id], function (err) {
            if (err) {
                res.status(400).json({ "error": err.message });
                return;
            }
            if (this.changes === 0) {
                res.status(404).json({ "error": "Part not found." });
            } else {
                // Notify all admins about the deleted part
                db.all('SELECT id, expo_push_token FROM users WHERE role = "admin"', [], (err, admins) => {
                    if (err) {
                        console.error('Error fetching admin tokens for deletion notification:', err.message);
                        return;
                    }
                    admins.forEach(admin => {
                        sendPushNotification(admin.expo_push_token, 'Pieza Eliminada', `La pieza "${deletedPartName}" ha sido eliminada por un administrador.`);
                        db.run('INSERT INTO notifications (user_id, title, message) VALUES (?, ?, ?)',
                            [admin.id, 'Pieza Eliminada', `La pieza "${deletedPartName}" ha sido eliminada por un administrador.`]);
                    });
                });
                res.json({ message: 'Part deleted successfully.', changes: this.changes, deleted_part_name: deletedPartName });
            }
        });
    });
});

// GET notifications for a user
app.get('/api/notifications/:user_id', (req, res) => {
    const { user_id } = req.params;
    db.all('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC', [user_id], (err, rows) => {
        if (err) {
            res.status(400).json({ "error": err.message });
            return;
        }
        res.json(rows);
    });
});

// PUT (mark as read) a notification
app.put('/api/notifications/:id/read', (req, res) => {
    const { id } = req.params;
    db.run('UPDATE notifications SET is_read = 1 WHERE id = ?', [id], function (err) {
        if (err) {
            res.status(400).json({ "error": err.message });
            return;
        }
        if (this.changes === 0) {
            res.status(404).json({ "error": "Notification not found." });
        } else {
            res.json({ message: 'Notification marked as read.', changes: this.changes });
        }
    });
});

// POST user registration
app.post('/api/register', (req, res) => {
    const { username, password, role, expo_push_token } = req.body;
    db.run(
        'INSERT INTO users (username, password, role, expo_push_token) VALUES (?, ?, ?, ?)',
        [username, password, role || 'user', expo_push_token],
        function (err) {
            if (err) {
                res.status(400).json({ "error": err.message });
                return;
            }
            res.status(201).json({ id: this.lastID, username, role: role || 'user' });
        }
    );
});

// POST user login
app.post('/api/login', (req, res) => {
    const { username, password, expo_push_token } = req.body;
    db.get('SELECT * FROM users WHERE username = ? AND password = ?', [username, password], (err, row) => {
        if (err) {
            res.status(400).json({ "error": err.message });
            return;
        }
        if (!row) {
            res.status(401).json({ "error": "Invalid credentials." });
            return;
        }

        // Update Expo push token if provided
        if (expo_push_token && row.expo_push_token !== expo_push_token) {
            db.run('UPDATE users SET expo_push_token = ? WHERE id = ?', [expo_push_token, row.id], (updateErr) => {
                if (updateErr) {
                    console.error('Error updating Expo push token:', updateErr.message);
                } else {
                    console.log('Expo push token updated for user:', row.username);
                }
            });
        }
        res.json({ user: { id: row.id, username: row.username, role: row.role } });
    });
});

// POST a job finalization request (for normal users)
app.post('/api/job_finalization_requests', (req, res) => {
    const { job_id, user_id } = req.body;
    db.run(
        'INSERT INTO job_finalization_requests (job_id, user_id) VALUES (?, ?)',
        [job_id, user_id],
        function (err) {
            if (err) {
                res.status(400).json({ "error": err.message });
                return;
            }
            const requestId = this.lastID;
            // Notify admins about new finalization request
            db.get('SELECT client_name, car_brand_model FROM jobs WHERE id = ?', [job_id], (err, job) => {
                if (err) {
                    console.error('Error fetching job details for finalization notification:', err.message);
                    return;
                }
                const jobTitle = job ? `${job.client_name} - ${job.car_brand_model}` : `ID ${job_id}`;
                db.all('SELECT id, expo_push_token FROM users WHERE role = "admin"', [], (err, admins) => {
                    if (err) {
                        console.error('Error fetching admin tokens:', err.message);
                        return;
                    }
                    admins.forEach(admin => {
                        sendPushNotification(admin.expo_push_token, 'Solicitud de Finalización de Trabajo', `El usuario ha solicitado la finalización del trabajo: ${jobTitle}.`);
                        db.run('INSERT INTO notifications (user_id, title, message) VALUES (?, ?, ?)',
                            [admin.id, 'Solicitud de Finalización de Trabajo', `El usuario ha solicitado la finalización del trabajo: ${jobTitle}.`]);
                    });
                });
                res.status(201).json({ id: requestId, job_id, user_id, message: 'Job finalization request submitted.' });
            });
        }
    );
});

// PUT approve job finalization request (for admins)
app.put('/api/job_finalization_requests/:id/approve', (req, res) => {
    const { id } = req.params;
    db.get('SELECT job_id, user_id FROM job_finalization_requests WHERE id = ?', [id], (err, request) => {
        if (err) {
            res.status(400).json({ "error": err.message });
            return;
        }
        if (!request) {
            res.status(404).json({ "error": "Finalization request not found." });
            return;
        }

        db.serialize(() => {
            db.run('UPDATE job_finalization_requests SET is_approved = 1 WHERE id = ?', [id], function (err) {
                if (err) {
                    res.status(400).json({ "error": err.message });
                    return;
                }
                db.run('UPDATE jobs SET is_completed = 1 WHERE id = ?', [request.job_id], function (err) {
                    if (err) {
                        res.status(400).json({ "error": err.message });
                        return;
                    }
                    // Notify user who made the request
                    db.get('SELECT expo_push_token FROM users WHERE id = ?', [request.user_id], (err, user) => {
                        if (err) {
                            console.error('Error fetching user token for approval notification:', err.message);
                            return;
                        }
                        if (user && user.expo_push_token) {
                            sendPushNotification(user.expo_push_token, 'Solicitud Aprobada', 'Tu solicitud de finalización de trabajo ha sido aprobada.');
                            db.run('INSERT INTO notifications (user_id, title, message) VALUES (?, ?, ?)',
                                [request.user_id, 'Solicitud Aprobada', 'Tu solicitud de finalización de trabajo ha sido aprobada.']);
                        }
                    });
                    res.json({ message: 'Job finalization request approved and job marked as completed.' });
                });
            });
        });
    });
});

// PUT reject job finalization request (for admins)
app.put('/api/job_finalization_requests/:id/reject', (req, res) => {
    const { id } = req.params;
    db.get('SELECT job_id, user_id FROM job_finalization_requests WHERE id = ?', [id], (err, request) => {
        if (err) {
            res.status(400).json({ "error": err.message });
            return;
        }
        if (!request) {
            res.status(404).json({ "error": "Finalization request not found." });
            return;
        }

        db.run('DELETE FROM job_finalization_requests WHERE id = ?', [id], function (err) {
            if (err) {
                res.status(400).json({ "error": err.message });
                return;
            }
            // Notify user who made the request
            db.get('SELECT expo_push_token FROM users WHERE id = ?', [request.user_id], (err, user) => {
                if (err) {
                    console.error('Error fetching user token for rejection notification:', err.message);
                    return;
                }
                if (user && user.expo_push_token) {
                    sendPushNotification(user.expo_push_token, 'Solicitud Rechazada', 'Tu solicitud de finalización de trabajo ha sido rechazada.');
                    db.run('INSERT INTO notifications (user_id, title, message) VALUES (?, ?, ?)',
                        [request.user_id, 'Solicitud Rechazada', 'Tu solicitud de finalización de trabajo ha sido rechazada.']);
                }
            });
            res.json({ message: 'Job finalization request rejected.' });
        });
    });
});


// PUT (update) a job to be completed directly (for admins)
app.put('/api/jobs/:id/finalize', (req, res) => {
    const { id } = req.params;
    db.run(
        'UPDATE jobs SET is_completed = 1 WHERE id = ?',
        [id],
        function (err) {
            if (err) {
                res.status(400).json({ "error": err.message });
                return;
            }
            if (this.changes === 0) {
                res.status(404).json({ "error": "Job not found." });
            } else {
                res.json({ message: 'Job marked as completed successfully.', changes: this.changes });
            }
        }
    );
});


app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
