const express = require('express');
const cors = require('cors');
const app = express();
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const WebSocket = require('ws');

app.use(cors());
app.use(express.json());

// MongoDB connection
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.45ykh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();
    const db = client.db('task-management');
    const tasksCollection = db.collection('Tasks');

    // Fetch tasks
    app.get('/task', async (req, res) => {
      try {
        const tasks = await tasksCollection.find().sort({ order: 1 }).toArray(); 
        console.log('Fetched tasks:', tasks);
        res.status(200).json(tasks);
      } catch (err) {
        res.status(500).json({ message: 'Error fetching tasks' });
      }
    });

    app.get('/tasks/:email', async (req, res) => {
      try {
          const email = req.params.email;
          const tasks = await tasksCollection.find({ email: email }).sort({ order: 1 }).toArray(); 
          console.log(`Fetched tasks for ${email}:`, tasks);
          res.status(200).json(tasks);
      } catch (err) {
          console.error("Error fetching tasks:", err);
          res.status(500).json({ message: 'Error fetching tasks' });
      }
  });
  

    // Create task
    app.post('/tasks', async (req, res) => {
      try {
        const task = req.body;

        // Set initial order based on the existing tasks in the category
        const lastTask = await tasksCollection.find({ category: task.category }).sort({ order: -1 }).limit(1).toArray();
        task.order = lastTask.length > 0 ? lastTask[0].order + 1 : 1;

        const result = await tasksCollection.insertOne(task);

        // Broadcast new task to WebSocket clients
        broadcast({ type: 'TASK_CREATED', task });

        res.send(result);
      } catch (error) {
        console.error('Post Task:', error.message);
        res.status(500).send({ error: 'Failed to post task' });
      }
    });

    // Update task (including order)
    app.put('/tasks/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const updatedFields = req.body;

        const result = await tasksCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updatedFields }
        );

        if (result.modifiedCount === 0) {
          return res.status(404).json({ error: 'Task not found or no changes applied' });
        }

        res.json({ message: 'Task updated successfully' });
      } catch (error) {
        console.error('Update Task Error:', error.message);
        res.status(500).send({ error: 'Failed to update task' });
      }
    });

    // Delete task
    app.delete('/tasks/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const result = await tasksCollection.deleteOne({ _id: new ObjectId(id) });

        if (result.deletedCount > 0) {
          // Broadcast task deletion
          broadcast({ type: 'TASK_DELETED', taskId: id });
        }

        res.send(result);
      } catch (error) {
        console.error('Delete Task:', error.message);
        res.status(500).send({ error: 'Failed to delete task' });
      }
    });

    console.log('Successfully connected to MongoDB!');
  } catch (error) {
    console.error('Error connecting to MongoDB:', error);
  }
}

run().catch(console.error);

// WebSocket Server
const server = app.listen(process.env.PORT || 5000, () => {
  console.log(`Server running on port ${process.env.PORT || 5000}`);
});

const wss = new WebSocket.Server({ server });

function broadcast(message) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
}

// Root endpoint
app.get('/', (req, res) => {
  res.send('Task management system is ready!');
});
