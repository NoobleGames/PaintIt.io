import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import path, { dirname } from 'path';

const app = express();
const server = http.createServer(app);
const io = new Server(server);

let players = {};
let drawnLines = [];
const voteCooldowns = {};

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

app.get('/', (req, res) => {
    const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>PaintIt.io</title>
        <link href="https://cdn.jsdelivr.net/npm/@simonwep/pickr@1.8.0/dist/themes/classic.min.css" rel="stylesheet">
        <style>
            body {
                margin: 0;
                font-family: Arial, sans-serif;
                background: linear-gradient(135deg, #0f2027, #203a43, #2c5364);
                color: white;
                overflow: hidden;
                height: 100vh;
            }
            #menu {
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                background: rgba(0, 0, 0, 0.85);
                padding: 40px;
                border-radius: 15px;
                box-shadow: 0 4px 10px rgba(0, 0, 0, 0.5);
                animation: fadeIn 1s ease-out;
            }
            #menu h1 {
                font-size: 2.5rem;
                color: #00d1ff;
                margin-bottom: 20px;
                animation: pulse 2s infinite;
            }
            #menu input {
                margin: 10px 0;
                padding: 15px;
                border: none;
                border-radius: 5px;
                outline: none;
                font-size: 16px;
                width: 250px;
                text-align: center;
            }
            #menu button {
                padding: 10px 30px;
                border: none;
                border-radius: 5px;
                background: #28a745;
                color: white;
                font-size: 18px;
                cursor: pointer;
                transition: background 0.2s ease, transform 0.2s ease;
            }
            #menu button:hover {
                background: #218838;
                transform: scale(1.05);
            }
            canvas {
                display: block;
            }
            #toolbar {
                position: fixed;
                top: 50%;
                left: 10px;
                transform: translateY(-50%);
                display: flex;
                flex-direction: column;
                gap: 10px;
                z-index: 10;
                display: none; /* Initially hidden */
            }
            .icon {
                width: 50px;
                height: 50px;
                background: rgba(255, 255, 255, 0.2);
                border-radius: 10px;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                transition: transform 0.2s ease, background 0.2s ease;
            }
            .icon:hover {
                transform: scale(1.1);
                background: rgba(255, 255, 255, 0.4);
            }
            .icon img {
                width: 24px;
                height: 24px;
            }
            @keyframes fadeIn {
                from {
                    opacity: 0;
                }
                to {
                    opacity: 1;
                }
            }
            @keyframes pulse {
                0%, 100% {
                    transform: scale(1);
                }
                50% {
                    transform: scale(1.1);
                }
            }
        </style>
    </head>
    <body>
        <div id="menu">
            <h1>PaintIt.io</h1>
            <input id="username" type="text" placeholder="Enter your username" />
            <button id="startButton">Start Game</button>
        </div>
        <div id="toolbar">
            <div id="colorIcon" class="icon">
                <div id="colorWheel"></div>
            </div>
            <div id="resetIcon" class="icon">
                <img src="https://img.icons8.com/ios-glyphs/30/ffffff/restart.png" alt="Reset" />
            </div>
        </div>
        <canvas id="gameCanvas" style="display: none;"></canvas>
        <script src="/socket.io/socket.io.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/@simonwep/pickr@1.8.0/dist/pickr.min.js"></script>
        <script>
            const menu = document.getElementById('menu');
            const toolbar = document.getElementById('toolbar');
            const canvas = document.getElementById('gameCanvas');
            const ctx = canvas.getContext('2d');
            const socket = io();

            let players = {};
            let drawnLines = [];
            let currentPlayer = null;
            let currentColor = '#ff0000';

            let dx = 0, dy = 0;
            let lastDrawPoint = null;
            let isDrawing = false;

            // Camera position
            let cameraX = 0, cameraY = 0;

            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;

            document.getElementById('startButton').addEventListener('click', () => {
                const username = document.getElementById('username').value.trim();
                if (username) {
                    socket.emit('joinGame', username);
                    menu.style.display = 'none';
                    canvas.style.display = 'block';
                    toolbar.style.display = 'flex';
                } else {
                    alert('Please enter a username!');
                }
            });

            socket.on('initialize', (data) => {
                players = data.players;
                drawnLines = data.drawnLines;
                currentPlayer = players[socket.id];
                drawAll();
            });

            socket.on('updatePlayers', (updatedPlayers) => {
                players = updatedPlayers;
                currentPlayer = players[socket.id];
                drawAll();
            });

            socket.on('drawLine', (line) => {
                drawnLines.push(line);
                drawAll();
            });

            socket.on('clearDrawing', () => {
                drawnLines = [];
                drawAll();
            });

            const pickr = Pickr.create({
                el: '#colorWheel',
                theme: 'classic',
                swatches: ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff'],
                default: currentColor,
                components: {
                    preview: true,
                    opacity: true,
                    hue: true,
                    interaction: {
                        hex: true,
                        rgba: true,
                    },
                }
            });

            pickr.on('change', (color) => {
                currentColor = color.toHEXA().toString();
            });

            document.getElementById('resetIcon').addEventListener('click', () => {
                const code = prompt('Enter reset code:');
                if (code === '1121') {
                    socket.emit('resetDrawing', code);
                } else {
                    alert('Incorrect code!');
                }
            });

            function drawAll() {
                ctx.clearRect(0, 0, canvas.width, canvas.height);

                ctx.save();
                ctx.translate(-cameraX, -cameraY);

                drawnLines.forEach(({ from, to, color }) => {
                    ctx.beginPath();
                    ctx.moveTo(from.x, from.y);
                    ctx.lineTo(to.x, to.y);
                    ctx.strokeStyle = color || '#ffffff';
                    ctx.lineWidth = 3;
                    ctx.stroke();
                });

                for (let id in players) {
                    const player = players[id];
                    ctx.beginPath();
                    ctx.arc(player.x, player.y, 15, 0, Math.PI * 2);
                    ctx.fillStyle = player.color || '#ffffff';
                    ctx.fill();
                }

                ctx.restore();
            }

            window.addEventListener('keydown', (e) => {
                if (e.key === 'w') dy = -1;
                if (e.key === 's') dy = 1;
                if (e.key === 'a') dx = -1;
                if (e.key === 'd') dx = 1;
                if (e.key === ' ') isDrawing = true;
            });

            window.addEventListener('keyup', (e) => {
                if (e.key === 'w' || e.key === 's') dy = 0;
                if (e.key === 'a' || e.key === 'd') dx = 0;
                if (e.key === ' ') isDrawing = false;
            });

            function updatePlayerPosition() {
                if (!currentPlayer) return;

                currentPlayer.x += dx * 5;
                currentPlayer.y += dy * 5;

                cameraX = currentPlayer.x - canvas.width / 2;
                cameraY = currentPlayer.y - canvas.height / 2;

                socket.emit('updatePosition', { x: currentPlayer.x, y: currentPlayer.y });
                drawAll();
            }

            function gameLoop() {
                updatePlayerPosition();

                if (isDrawing && currentPlayer) {
                    if (lastDrawPoint) {
                        const newLine = {
                            from: lastDrawPoint,
                            to: { x: currentPlayer.x, y: currentPlayer.y },
                            color: currentColor,
                        };
                        drawnLines.push(newLine);
                        socket.emit('drawLine', newLine);
                    }
                    lastDrawPoint = { x: currentPlayer.x, y: currentPlayer.y };
                } else {
                    lastDrawPoint = null;
                }

                requestAnimationFrame(gameLoop);
            }

            gameLoop();
        </script>
    </body>
    </html>
    `;
    res.send(htmlContent);
});

const PORT = process.env.PORT || 3000; // Use dynamic port if available, otherwise fall back to 3000
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    players[socket.id] = { id: socket.id, x: 0, y: 0, color: `#${Math.floor(Math.random() * 16777215).toString(16)}` };

    socket.emit('initialize', { players, drawnLines });
    socket.broadcast.emit('updatePlayers', players);

    socket.on('updatePosition', (pos) => {
        players[socket.id].x = pos.x;
        players[socket.id].y = pos.y;
        socket.broadcast.emit('updatePlayers', players);
    });

    socket.on('drawLine', (line) => {
        drawnLines.push(line);
        socket.broadcast.emit('drawLine', line);
    });

    socket.on('resetDrawing', (code) => {
        if (code === '1121') {
            drawnLines = [];
            io.emit('clearDrawing');
        }
    });

    socket.on('disconnect', () => {
        delete players[socket.id];
        io.emit('updatePlayers', players);
        console.log(`User disconnected: ${socket.id}`);
    });
});
