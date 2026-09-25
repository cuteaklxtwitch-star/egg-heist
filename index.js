import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { Game } from './game.js';
import { MAX_PLAYERS, PASSES } from './config.js';
import * as db from './db.js';

// Every file sits in one folder, so we only hand out the ones the browser needs.
const dir = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.set('trust proxy', 1);
const server = http.createServer(app);
const io = new Server(server);

// ---------------- Stripe (real-money gamepasses) ----------------
// Needs these environment variables on Render:
//   STRIPE_SECRET_KEY      (sk_test_... while testing, sk_live_... when real)
//   STRIPE_WEBHOOK_SECRET  (whsec_... from the webhook you create in Stripe)
let stripe = null;
if (process.env.STRIPE_SECRET_KEY) {
  const { default: Stripe } = await import('stripe');
  stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
}

// The webhook needs the raw request body, so it comes before express.json().
app.post('/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!stripe) return res.status(503).send('Stripe not configured');
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);
  } catch (e) {
    return res.status(400).send('Bad signature');
  }
  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    const s = event.data.object;
    const userId = Number(s.metadata?.userId), pass = s.metadata?.pass;
    if (s.payment_status === 'paid' && userId && PASSES[pass]) {
      try {
        const isNew = await db.addPass(userId, pass, s.id);
        if (isNew) {
          console.log(`Gamepass ${pass} granted to user ${userId}`);
          // if they're playing right now, turn it on straight away
          for (const g of games.values()) {
            for (const p of g.players.values()) if (p.userId === userId) g.grantPass(p, pass);
          }
        }
      } catch (e) {
        console.error('Could not grant pass', e);
        return res.status(500).send('retry');
      }
    }
  }
  res.json({ received: true });
});

app.use(express.json({ limit: '200kb' }));

const send = (file, type) => (_req, res) => res.type(type).sendFile(path.join(dir, file));
app.get('/', send('index.html', 'html'));
app.get('/style.css', send('style.css', 'css'));
app.get('/main.js', send('main.js', 'js'));
app.get('/config.js', send('config.js', 'js'));
app.use('/vendor/three', express.static(path.join(dir, 'node_modules/three/build')));
app.get('/health', (_req, res) => res.send('ok'));

// ---------------- accounts ----------------
// Username + password only (no email, no real names) to keep kids' data to a minimum.
const attempts = new Map(); // ip -> [timestamps], simple brute-force protection
function tooMany(ip) {
  const now = Date.now();
  const list = (attempts.get(ip) || []).filter((t) => now - t < 60000);
  list.push(now);
  attempts.set(ip, list);
  return list.length > 10;
}
const validName = (u) => typeof u === 'string' && /^[A-Za-z0-9_]{3,16}$/.test(u);
const validPass = (p) => typeof p === 'string' && p.length >= 6 && p.length <= 100;
const bearer = (req) => (req.headers.authorization || '').replace(/^Bearer /, '');
const safe = (fn) => (req, res) => fn(req, res).catch((e) => { console.error(e); res.status(500).json({ error: 'Server error — try again.' }); });

app.post('/api/signup', safe(async (req, res) => {
  if (tooMany(req.ip)) return res.status(429).json({ error: 'Too many tries — wait a minute.' });
  const { username, password, save } = req.body || {};
  if (!validName(username)) return res.status(400).json({ error: 'Username: 3-16 letters, numbers or _' });
  if (!validPass(password)) return res.status(400).json({ error: 'Password needs at least 6 characters.' });
  // the guest progress from this browser moves into the new account
  const user = await db.createUser(username, db.hashPassword(password), save && typeof save === 'object' ? save : null);
  if (!user) return res.status(409).json({ error: 'That username is taken.' });
  res.json({ token: await db.createSession(user.id), username: user.username });
}));

app.post('/api/login', safe(async (req, res) => {
  if (tooMany(req.ip)) return res.status(429).json({ error: 'Too many tries — wait a minute.' });
  const { username, password } = req.body || {};
  const user = validName(username) && typeof password === 'string' ? await db.getUserByName(username) : null;
  if (!user || !db.checkPassword(password, user.passHash)) return res.status(401).json({ error: 'Wrong username or password.' });
  res.json({ token: await db.createSession(user.id), username: user.username });
}));

app.post('/api/logout', safe(async (req, res) => {
  await db.deleteSession(bearer(req));
  res.json({ ok: true });
}));

app.get('/api/me', safe(async (req, res) => {
  const user = await db.userByToken(bearer(req));
  if (!user) return res.status(401).json({ error: 'Not logged in' });
  res.json({ username: user.username, passes: user.passes });
}));

// ---------------- buying a gamepass ----------------
app.post('/api/checkout', safe(async (req, res) => {
  if (!stripe) return res.status(503).json({ error: "The shop isn't open yet — payments are not set up." });
  const user = await db.userByToken(bearer(req));
  if (!user) return res.status(401).json({ error: 'Log in first so the pass is saved to your account.' });
  const pass = req.body?.pass;
  if (!PASSES[pass]) return res.status(400).json({ error: 'Unknown item.' });
  if (user.passes.includes(pass)) return res.status(400).json({ error: 'You already own this.' });
  const origin = process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      // payment methods (card, BLIK, …) are the ones switched on in your Stripe Dashboard
      line_items: [{
        quantity: 1,
        price_data: {
          currency: 'pln',
          unit_amount: PASSES[pass].price,
          product_data: { name: `Egg Heist — ${PASSES[pass].name}`, description: PASSES[pass].desc },
        },
      }],
      metadata: { userId: String(user.id), pass },
      client_reference_id: String(user.id),
      success_url: `${origin}/?paid=${pass}`,
      cancel_url: `${origin}/?paid=cancel`,
      custom_text: { submit: { message: `Digital item for Egg Heist account "${user.username}". It is added right after payment.` } },
    });
    res.json({ url: session.url });
  } catch (e) {
    console.error('Stripe checkout error', e.message);
    res.status(500).json({ error: 'Could not start the payment. Try again later.' });
  }
}));

// ---------------- servers ----------------
// Many game servers run inside this one app. Each has room for MAX_PLAYERS players.
const MAX_SERVERS = 20;               // raise if your Render plan has CPU to spare
const EMPTY_CLOSE_MS = 60 * 1000;     // extra servers close after being empty this long
const games = new Map();
let nextId = 1;

function createGame() {
  if (games.size >= MAX_SERVERS) return null;
  const g = new Game(io, nextId++);
  g.onSave = (userId, save) => db.saveProgress(userId, save).catch((e) => console.error('save failed', e.message));
  games.set(g.id, g);
  return g;
}

function serverList() {
  return [...games.values()].map((g) => ({ id: g.id, players: g.count, max: MAX_PLAYERS }));
}
function pushServerList() { io.to('lobby').emit('servers', serverList()); }

setInterval(() => {
  for (const g of games.values()) {
    if (g.id !== 1 && g.count === 0 && Date.now() - g.emptySince > EMPTY_CLOSE_MS) { g.stop(); games.delete(g.id); }
  }
  pushServerList();
}, 5000);

io.on('connection', (socket) => {
  socket.join('lobby');
  socket.emit('servers', serverList());
  const game = () => socket.data.game;

  // data.server: a server number, 'new' for a fresh server, or nothing for "any server with space"
  // data.token: log-in token (optional). Logged-in players load their progress from the database.
  socket.on('join', async (data = {}) => {
    if (game() || socket.data.joining) return;
    socket.data.joining = true;
    try {
      let account = null, save = data.save;
      if (data.token) {
        const user = await db.userByToken(data.token);
        if (!user) return socket.emit('loggedOut');
        // already playing somewhere else? kick the old copy so progress isn't doubled
        for (const g of games.values()) {
          for (const p of [...g.players.values()]) {
            if (p.userId === user.id) {
              await db.saveProgress(user.id, g.makeSave(p, Date.now()));
              p.socket.emit('kicked', 'You joined from another tab or device.');
              g.leave(p.socket); p.socket.data.game = null;
            }
          }
        }
        const fresh = await db.getUser(user.id); // re-read after the kick saved the latest progress
        account = { userId: user.id, username: user.username, passes: fresh.passes };
        save = fresh.save;
      }
      let g = null;
      if (data.server === 'new') {
        g = createGame();
        if (!g) return socket.emit('joinError', 'Too many servers are open right now. Pick one from the list.');
      } else if (data.server) {
        g = games.get(Number(data.server));
        if (!g) return socket.emit('joinError', 'That server has closed. Pick another one!');
        if (g.full) return socket.emit('joinError', `Server ${g.id} is full (${MAX_PLAYERS}/${MAX_PLAYERS}). Pick another one!`);
      } else {
        g = [...games.values()].find((x) => !x.full) || createGame();
        if (!g) return socket.emit('joinError', 'Every server is full right now. Try again in a minute!');
      }
      if (g.join(socket, { ...data, save, account })) {
        socket.data.game = g;
        socket.leave('lobby');
        pushServerList();
      }
    } catch (e) {
      console.error('join failed', e);
      socket.emit('joinError', 'Something went wrong joining. Try again.');
    } finally {
      socket.data.joining = false;
    }
  });

  socket.on('input', (v) => game()?.setInput(socket, v));
  socket.on('slow', (on) => game()?.setSlow(socket, on));
  socket.on('interact', () => game()?.interact(socket));
  socket.on('swing', () => game()?.swing(socket));
  socket.on('buy', (w) => game()?.buy(socket, w));
  socket.on('rebirth', () => game()?.rebirth(socket));
  socket.on('sellPet', (d) => game()?.sellPet(socket, d));
  socket.on('sellWeak', () => game()?.sellWeakPets(socket));
  socket.on('petFuse', (list) => game()?.petFuseStart(socket, list));
  socket.on('disconnect', () => {
    const g = game();
    if (g) { g.leave(socket); pushServerList(); }
  });
});

await db.initDb();
createGame(); // Server 1 is always open
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Egg Heist running on http://localhost:${PORT}${stripe ? ' (payments on)' : ' (payments off)'}`));
