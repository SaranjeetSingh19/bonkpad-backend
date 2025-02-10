import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import { createServer } from 'http';
import { Server } from 'socket.io';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';

// Configure __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const prisma = new PrismaClient();
const app = express();
const PORT = process.env.PORT || 5000;

const allowedOrigins = [
  'https://bonkpad-psi.vercel.app', // Production frontend
  'http://localhost:5173' // Local development
];



// Update CORS middleware
app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

// Create HTTP server and Socket.IO instance
const httpServer = createServer(app);


const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"]
  },
  maxHttpBufferSize: 1e8, // Allow larger files (100MB)
});

//app.use(cors());
app.use(express.json());

// Store active users and their socket IDs
const activeUsers = new Map();

// Socket.IO connection handler
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  // Register user
  socket.on('register', (username) => {
    activeUsers.set(username, socket.id);
    console.log(`User ${username} registered with socket ID ${socket.id}`);
  });

  // Listen for messages/files
  socket.on('sendMessage', ({ sender, receiver, message, file }) => {
    const receiverSocketId = activeUsers.get(receiver);

    if (receiverSocketId) {
      // Send message/file to receiver
      io.to(receiverSocketId).emit('receiveMessage', { sender, message, file });
      console.log(`Data sent from ${sender} to ${receiver}`);
    } else {
      console.log(`Receiver ${receiver} not found`);
    }
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    for (const [username, socketId] of activeUsers.entries()) {
      if (socketId === socket.id) {
        activeUsers.delete(username);
        console.log(`User ${username} disconnected`);
        break;
      }
    }
  });
});

// File upload endpoint
// app.post('/upload', upload.single('file'), (req, res) => {
//   if (!req.file) {
//     return res.status(400).json({ message: 'No file uploaded' });
//   }

//   // Return the file URL
//   const fileUrl = `http://localhost:5000/uploads/${req.file.filename}`;
//   res.status(200).json({ fileUrl });
// });

// Existing username check endpoint
app.post('/check-username', async (req, res) => {
  const { username } = req.body;

  try {
    const existingUser = await prisma.user.findUnique({
      where: { username },
    });

    if (existingUser) {
      let counter = 1;
      let newUsername = `${username}${counter}`;

      while (await prisma.user.findUnique({ where: { username: newUsername } })) {
        counter++;
        newUsername = `${username}${counter}`;
      }

      return res.status(409).json({
        message: 'Username taken',
        suggestion: newUsername,
      });
    }

    const user = await prisma.user.create({
      data: { username },
    });

    res.status(200).json({ username: user.username });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Recipient username check endpoint
app.post('/check-recipient', async (req, res) => {
  const { username } = req.body;

  try {
    const user = await prisma.user.findUnique({
      where: { username },
    });

    if (user) {
      res.status(200).json({ exists: true });
    } else {
      res.status(200).json({ exists: false });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Start the server
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Uploads directory: ${path.join(__dirname, 'uploads')}`);
});