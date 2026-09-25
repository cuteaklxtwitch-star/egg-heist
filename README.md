# 🥚 Egg Heist

A multiplayer browser game. Run down a canyon full of sleeping guardians, steal their eggs, and bring them back to your base where they hatch into pets that earn you money. Other players can raid your nests — bonk them with your bat.

Built with Node.js, Socket.io (multiplayer) and three.js (3D). Runs in any browser, PC or phone.

## How to play

| Action | PC | Phone |
|---|---|---|
| Move | WASD | Joystick |
| Turn camera | Arrow keys, or drag with right (or left) mouse | Drag screen |
| Zoom | Mouse wheel | Pinch with two fingers |
| Slow mode (sneak) | Q or the toggle | Toggle |
| Interact (steal, sell, fuse) | E | E button |
| Swing bat | Click / F / Space | Swing button |

- **The canyon** has 16 zones: Meadow (Big Goose), Jungle (Gorilla), Desert (Sand Croc), Tundra (Emperor Penguin), Coral Reef (Giant Crab), Volcano (Lava Dragon), Candy Land (Gummy Bear), The Void (Void Serpent), Storm Peaks (Thunder Eagle), Crystal Caves (Crystal Wolf), Abyss Ocean (Titan Tortoise), Sun Kingdom (Solar Lion), Heaven (Sky Pegasus), Clockwork Factory (Mecha Crab), Dream Garden (Dream Owl) and The Omega Rift (Omega Dragon). Each guardian sleeps on a pile of eggs, and a sign shows the recommended speed.
- **Guardians only care about thieves.** You can walk right past them. Take an egg and only *that* guardian wakes up: it counts down 2 seconds, then chases you until you reach the **SAFEZONE** line or lose the egg. It runs exactly as fast as the recommended speed on its zone's sign; if you're slower than the sign, it gets **enraged** (1.5× faster). If it catches you, it takes the egg back. **Slow mode** just makes you walk slowly for careful moves.
- **Speed** only comes from your **treadmill**. Stand on it at your base to run in place. Upgrade it (15 levels) with the board next to it or in the Shop. Its look changes as it levels up: Basic, Sport, Crystal, Lava, Galaxy.
- **Your base:** walk in with an egg and it goes on a free nest, then hatches into a pet. Pets earn money every second.
- **Fuse Machine:** put in 3 eggs. 3 from the same zone → an egg from the next zone, or a 35% chance of a **fuse-only egg**. 3 of the same fuse-only egg → the next one up.
- **Fuse-only eggs** never appear in the canyon: Golden → Rainbow → Diamond → Cosmic → Celestial. They hatch exclusive pets (Unicorn, Diamond Dog, Celestial Dragon…).
- **Pet Fuser:** the pink machine. Walk up, press E, pick 3 pets and get a fuse-only egg back. Rarer pets give a better egg, and 3 pets of the same rarity (Rare or better) bumps it up one.
- **80 pets** across 18 animal types, up to the **Omega** rarity,: birds, bunnies, slimes, cats, foxes, dogs, lizards, dragons, frogs, penguins, bears, monkeys, pigs, turtles, crabs, owls, snakes and unicorns.
- **SELL stand:** sell the egg you're carrying. Sell pets from the Backpack.
- **Night** comes every 5 minutes: guardians sleep deeper and a Moon Egg appears somewhere in the canyon.
- **Index** shows every pet you've discovered. More players online = **Friend Boost** (+10% each, up to +50%).
- **Servers:** up to 8 players each. Press Play to join the first server with space (a new one opens when they're all full), or pick one from the list on the start screen. **Invite** copies a link to your server so friends land with you.

- **Rebirth** (Shop → Rebirth): reset money, speed and treadmill for a permanent +50% money and speed per rebirth. Pets, eggs, nests and gamepasses are kept.
- **Accounts:** username + password only (no email). Progress is saved online and can't be lost or edited. Signing up moves your guest progress into the account.
- **Gamepasses** (real money, Shop → Gamepasses): 2x Money (19,99 zł), VIP (29,99 zł: gold name, +20% money and speed), +5 Nests (14,99 zł). Paid by card or BLIK through Stripe. Needs an account and a ticked "a parent said yes" box.

## Setting up the database and payments (one time)

Everything runs on Render; nothing runs on your computer.

**1. Database (free, needed for accounts)**
1. Make a free account at neon.tech and create a project.
2. Copy the **connection string** (starts with `postgresql://`).
3. On Render → your service → **Environment** → add `DATABASE_URL` = that string. Save; Render redeploys.

The log then says `Database: Postgres`. Without it, accounts are kept in a file that Render wipes on every update.

**2. Stripe (for gamepasses)**
1. Make a Stripe account at stripe.com. It needs your business details (your jednoosobowa działalność) to take real payments.
2. **Settings → Payment methods:** make sure **Cards** and **BLIK** are on.
3. **Developers → API keys:** copy the **Secret key**. Start with the **test** key (`sk_test_…`).
4. **Developers → Webhooks → Add endpoint:** URL `https://YOUR-GAME.onrender.com/stripe/webhook`, events `checkout.session.completed` and `checkout.session.async_payment_succeeded`. Copy the **Signing secret** (`whsec_…`).
5. On Render → **Environment**, add `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`. The log then says `(payments on)`.
6. Test with card `4242 4242 4242 4242` (any future date, any CVC). When it works, switch both values to the **live** ones.

Optional: `PUBLIC_URL` = your game's address, if payment redirects ever go to the wrong address.

Kids play this game, so payments are made by a parent, and the buyer ticks that they want the item delivered right away (EU rules on digital items). Before going live, check your Stripe account's terms and, ideally, ask someone who knows EU consumer rules.

## Run locally

```bash
npm install
npm start
```

Open http://localhost:3000 (open two tabs to test multiplayer).

## Deploy on Render

Web Service (not Static Site), Language **Node**, Build `npm install`, Start `npm start`. Or **New → Blueprint** and it reads `render.yaml`.

Free plan sleeps after 15 min with no players; the first visit after that takes about a minute.

## Change the game

Everything balance-related is in `config.js`: zones, eggs, pets and their income, fuse rules, treadmill levels, shop prices, rebirth cost, gamepass prices, day/night length.

## Known limits

- Guests' progress is saved in their browser (can be lost or edited). Account progress is saved in the database.
- Up to 20 servers run inside one Render app (`MAX_SERVERS` in `index.js`). The free plan's small CPU may lag with lots of busy servers.
