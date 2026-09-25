import {
  SAFE_Z, CORRIDOR_HALF, MAX_PLAYERS, MAX_PETS, SPAWN, SELL_POS, FUSE_POS,
  ZONES, EGGS, PETS, nestZ, zoneStart, zoneEnd, WORLD_END_Z, petValue,
  weighted, rollZoneEgg, fuseResult, walkSpeed, SLOW_MULT, CARRY_MULT, SHOP, BAT, DAY,
  TREADMILL, treadmillPos, onTreadmill, treadBoardPos, PET_FUSE_POS, petFuseResult, PET_FUSE_TIME, FUSE_TIME, fmtTime,
  clampMove, plotCenter, insidePlot, nestPos, fmt, guardianSpeed, GUARDIAN_RAGE,
  REBIRTH, PASSES, moneyMult, speedMult, maxNestsFor, MAX_NESTS_WITH_PASS,
} from './config.js';

const TICK = 1 / 20;
const COLORS = ['#e6394a', '#3fa7ff', '#f5b82e', '#a45cff', '#2ec4b6', '#ff8c42', '#ff4f9a', '#8bd346'];
const FIELD_EGGS = 7;
const WAKE_DELAY = 2; // seconds a guardian takes to wake up before it chases you
const d2 = (ax, az, bx, bz) => (ax - bx) ** 2 + (az - bz) ** 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
let nextId = 1;
const uid = () => (nextId++).toString(36);

export class Game {
  constructor(io, id) {
    this.io = io;
    this.id = id;                 // server number
    this.room = `server-${id}`;   // socket.io room, so messages only go to players on this server
    this.emptySince = Date.now();
    this.players = new Map();
    this.plots = Array(MAX_PLAYERS).fill(null);
    this.guardians = ZONES.map((z, i) => ({ zone: i, x: 0, z: nestZ(i), r: Math.PI, state: 'sleep', target: null }));
    this.field = [];            // eggs lying in the canyon (and dropped ones)
    this.start = Date.now();
    this.wasNight = false;
    this.flip = false;
    this.lastSave = 0;
    for (let i = 0; i < ZONES.length; i++) for (let k = 0; k < FIELD_EGGS; k++) this.spawnFieldEgg(i);
    this.timer = setInterval(() => this.tick(), TICK * 1000);
  }

  get count() { return this.players.size; }
  get full() { return !this.plots.includes(null); }
  stop() { clearInterval(this.timer); }

  // ---------------- world ----------------
  cycle(now) {
    const t = ((now - this.start) / 1000) % DAY.cycle;
    const dayLen = DAY.cycle - DAY.night;
    return t < dayLen ? { night: false, left: dayLen - t } : { night: true, left: DAY.cycle - t };
  }

  spawnFieldEgg(zone, type = rollZoneEgg(zone)) {
    const a = Math.random() * Math.PI * 2, r = 5 + Math.random() * 10;
    this.field.push({
      id: uid(), type, zone,
      x: clamp(Math.cos(a) * r, -CORRIDOR_HALF + 2, CORRIDOR_HALF - 2),
      z: nestZ(zone) + Math.sin(a) * r,
      loose: 0,
    });
  }

  // ---------------- join / leave ----------------
  join(socket, data = {}) {
    if (this.players.has(socket.id)) return;
    const plot = this.plots.findIndex((p) => p === null);
    if (plot === -1) return false;
    // data.account = { userId, username, passes } for logged-in players (their save comes from the database)
    const acc = data.account || null;
    const passes = acc ? acc.passes.filter((x) => PASSES[x]) : [];
    const s = sanitize(data.save, passes);
    const now = Date.now();
    const name = acc ? acc.username : String(data.name || 'Player').replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 16) || 'Player';
    const c = plotCenter(plot);
    const p = {
      id: socket.id, socket, name, plot, color: COLORS[plot],
      x: c.x - c.side * 10, z: c.z, rot: c.side > 0 ? -Math.PI / 2 : Math.PI / 2,
      input: { x: 0, z: 0 }, slow: false,
      money: s.money, stat: s.stat, tread: s.tread, nests: s.nests, onTread: false, rebirths: s.rebirths,
      userId: acc ? acc.userId : null, passes,
      nestEggs: Array(MAX_NESTS_WITH_PASS).fill(null),
      pets: s.pets, index: new Set(s.index),
      fuse: s.fuse, fuseResult: s.fuseResult, fuseAt: s.fuseResult ? now + s.fuseLeft * 1000 : 0,
      petFuse: s.petFuse, petFuseAt: s.petFuse ? now + s.petFuseLeft * 1000 : 0,
      carry: null, stunUntil: 0, swingReadyAt: 0, swingAt: 0, warnAt: 0,
    };
    s.nestEggs.forEach((e, i) => { if (e && i < p.nests) p.nestEggs[i] = { type: e.type, hatchAt: now + e.left * 1000 }; });
    for (const id of p.pets) p.index.add(id);
    this.plots[plot] = p.id;
    this.players.set(p.id, p);
    socket.join(this.room);
    socket.emit('welcome', { id: p.id, plot, server: this.id, account: acc ? acc.username : null });
    socket.to(this.room).emit('toast', { text: `${name} joined the game!`, kind: 'big' });
    this.toast(p, 'Stand on your treadmill to get speed, then run into the canyon and steal eggs!');
    return true;
  }

  leave(socket) {
    const p = this.players.get(socket.id);
    if (!p) return;
    this.dropCarry(p, 'leave');
    if (p.userId && this.onSave) this.onSave(p.userId, this.makeSave(p, Date.now()));
    this.io.to(this.room).emit('toast', { text: `${p.name} left the game.`, kind: 'info' });
    this.plots[p.plot] = null;
    this.players.delete(p.id);
    socket.leave(this.room);
    if (!this.players.size) this.emptySince = Date.now();
    for (const o of this.players.values()) if (o.carry?.from?.owner === p.id) o.carry.from = null;
    for (const g of this.guardians) if (g.target === p.id) { g.target = null; g.state = 'return'; }
  }

  // ---------------- actions ----------------
  setInput(socket, v) {
    const p = this.players.get(socket.id);
    if (!p || !v) return;
    let x = Number(v.x) || 0, z = Number(v.z) || 0;
    const l = Math.hypot(x, z);
    if (l > 1) { x /= l; z /= l; }
    p.input.x = x; p.input.z = z;
  }

  setSlow(socket, on) {
    const p = this.players.get(socket.id);
    if (p) p.slow = !!on;
  }

  interact(socket) {
    const p = this.players.get(socket.id);
    const now = Date.now();
    if (!p || now < p.stunUntil) return;
    const near = (pos, r) => d2(p.x, p.z, pos.x, pos.z) < r * r;

    // sell stand
    if (p.carry && near(SELL_POS, 6)) {
      const e = EGGS[p.carry.type];
      if (p.carry.from) this.notifyStolen(p, p.carry);
      p.money += e.value;
      p.carry = null;
      return this.toast(p, `Sold ${e.name} for $${fmt(e.value)}`, 'money');
    }
    // fuse machine
    if (near(FUSE_POS, 6)) {
      if (p.carry) {
        if (p.fuseResult || p.fuse.length >= 3) return this.toast(p, 'The Fuse Machine is busy.');
        if (p.carry.from) this.notifyStolen(p, p.carry);
        p.fuse.push(p.carry.type);
        p.carry = null;
        if (p.fuse.length === 3) {
          p.fuseResult = fuseResult(p.fuse);
          p.fuseAt = now + FUSE_TIME * 1000;
          this.toast(p, `Fusing… come back in ${fmtTime(FUSE_TIME)}.`);
        } else {
          this.toast(p, `Fuse Machine ${p.fuse.length}/3`);
        }
        return;
      }
      if (p.fuseResult) {
        if (now < p.fuseAt) return this.toast(p, `Still fusing — ${fmtTime((p.fuseAt - now) / 1000)} left.`);
        const t = p.fuseResult;
        p.carry = { type: t, left: EGGS[t].hatch * 1000, from: null };
        p.fuse = []; p.fuseResult = null;
        return this.toast(p, `You got a ${EGGS[t].name}! Take it home.`, 'big');
      }
      if (p.fuse.length) {
        const t = p.fuse.pop();
        p.carry = { type: t, left: EGGS[t].hatch * 1000, from: null };
        return this.toast(p, `Took the ${EGGS[t].name} back out.`);
      }
    }
    // Pet Fuser: collect the egg (choosing pets happens in the Pet Fuser window)
    if (!p.carry && p.petFuse && near(PET_FUSE_POS, 6)) {
      if (now < p.petFuseAt) return this.toast(p, `Pets still fusing — ${fmtTime((p.petFuseAt - now) / 1000)} left.`);
      const t = p.petFuse;
      p.carry = { type: t, left: EGGS[t].hatch * 1000, from: null };
      p.petFuse = null;
      return this.toast(p, `You got a ${EGGS[t].name}! Take it home.`, 'big');
    }
    // treadmill upgrade board at home
    if (near(treadBoardPos(p.plot), 3.5)) return this.buy(socket, 'tread');
    // steal from someone's nest
    if (!p.carry) {
      for (let pl = 0; pl < this.plots.length; pl++) {
        const ownerId = this.plots[pl];
        if (!ownerId || pl === p.plot || !insidePlot(pl, p.x, p.z)) continue;
        const owner = this.players.get(ownerId);
        let best = -1, bd = 3.4 * 3.4;
        owner.nestEggs.forEach((e, n) => {
          if (!e) return;
          const np = nestPos(pl, n);
          const dd = d2(p.x, p.z, np.x, np.z);
          if (dd < bd) { bd = dd; best = n; }
        });
        if (best < 0) return;
        const e = owner.nestEggs[best];
        owner.nestEggs[best] = null;
        p.carry = { type: e.type, left: Math.max(0, e.hatchAt - now), from: { owner: owner.id, nest: best } };
        this.toast(owner, `${p.name} is stealing your ${EGGS[e.type].name}! Hit them with your bat!`, 'alert');
        return;
      }
    }
  }

  swing(socket) {
    const p = this.players.get(socket.id);
    const now = Date.now();
    if (!p || now < p.swingReadyAt || now < p.stunUntil) return;
    p.swingReadyAt = now + BAT.cooldown * 1000;
    p.swingAt = now;
    let target = null, bd = BAT.range ** 2;
    for (const o of this.players.values()) {
      if (o === p || now < o.stunUntil) continue;
      const dd = d2(p.x, p.z, o.x, o.z);
      if (dd < bd) { bd = dd; target = o; }
    }
    if (!target) return;
    const dx = target.x - p.x, dz = target.z - p.z, l = Math.hypot(dx, dz) || 1;
    [target.x, target.z] = clampMove(target.x, target.z, target.x + (dx / l) * BAT.knock, target.z + (dz / l) * BAT.knock);
    target.stunUntil = now + BAT.stun * 1000;
    this.io.to(this.room).emit('fx', { type: 'bonk', x: target.x, z: target.z });
    if (target.carry) {
      this.dropCarry(target, 'bat');
      this.toast(target, `${p.name} bonked you and you dropped the egg!`, 'alert');
    }
  }

  buy(socket, what) {
    const p = this.players.get(socket.id);
    if (!p) return;
    if (what === 'tread') {
      if (p.tread >= TREADMILL.maxLevel) return this.toast(p, 'Your treadmill is maxed out!');
      const cost = TREADMILL.cost(p.tread);
      if (p.money < cost) return this.toast(p, `Need $${fmt(cost)} to upgrade.`);
      p.money -= cost; p.tread++;
      const tierUp = TREADMILL.tier(p.tread) !== TREADMILL.tier(p.tread - 1);
      this.toast(p, tierUp ? `NEW ${TREADMILL.tiers[TREADMILL.tier(p.tread)].toUpperCase()} TREADMILL! +${fmt(TREADMILL.gain(p.tread) * speedMult(p.rebirths, p.passes))} speed/s`
        : `Treadmill level ${p.tread}! +${fmt(TREADMILL.gain(p.tread) * speedMult(p.rebirths, p.passes))} speed/s`, tierUp ? 'big' : 'money');
    } else if (what === 'nest') {
      if (p.nests >= maxNestsFor(p.passes)) return this.toast(p, p.passes.includes('nests') ? 'All nests built.' : 'All nests built! The +5 Nests gamepass unlocks more.');
      const cost = SHOP.nestCost(p.nests);
      if (p.money < cost) return this.toast(p, `Need $${fmt(cost)}.`);
      p.money -= cost; p.nests++;
      this.toast(p, `New nest built (${p.nests}/${maxNestsFor(p.passes)}).`, 'money');
    }
  }

  rebirth(socket) {
    const p = this.players.get(socket.id);
    if (!p) return;
    const cost = REBIRTH.cost(p.rebirths);
    if (p.money < cost) return this.toast(p, `You need $${fmt(cost)} to rebirth.`);
    if (p.carry) return this.toast(p, 'Put down the egg you are carrying first.');
    p.rebirths++;
    p.money = 0; p.stat = 0; p.tread = 1;
    const c = plotCenter(p.plot);
    p.x = c.x - c.side * 10; p.z = c.z;
    this.toast(p, `REBIRTH ${p.rebirths}! You now get x${fmt(1 + REBIRTH.boost * p.rebirths)} money and speed forever.`, 'big');
    this.io.to(this.room).emit('toast', { text: `${p.name} just rebirthed (Rebirth ${p.rebirths})!`, kind: 'big' });
    this.io.to(this.room).emit('fx', { type: 'hatch', x: p.x, z: p.z, big: true });
    if (p.userId && this.onSave) this.onSave(p.userId, this.makeSave(p, Date.now()));
  }

  // called when a Stripe payment for this player comes in while they're online
  grantPass(p, pass) {
    if (!PASSES[pass] || p.passes.includes(pass)) return;
    p.passes = [...p.passes, pass];
    if (pass === 'nests') p.nests = Math.min(MAX_NESTS_WITH_PASS, p.nests + 5);
    this.toast(p, `Thank you! ${PASSES[pass].icon} ${PASSES[pass].name} is now active.`, 'big');
    this.io.to(this.room).emit('fx', { type: 'hatch', x: p.x, z: p.z, big: true });
    if (this.onSave) this.onSave(p.userId, this.makeSave(p, Date.now()));
  }

  petFuseStart(socket, list) {
    const p = this.players.get(socket.id);
    if (!p || !Array.isArray(list)) return;
    if (d2(p.x, p.z, PET_FUSE_POS.x, PET_FUSE_POS.z) > 8 * 8) return this.toast(p, 'Walk up to the Pet Fuser first.');
    if (p.petFuse) return this.toast(p, 'The Pet Fuser is busy.');
    // list = [{ i, id }] (index + pet id). If the pet list changed meanwhile, the ids won't match and we stop.
    const idx = [...new Set(list.map((x) => Number(x?.i)))].filter((i, k) => Number.isInteger(i) && i >= 0 && i < p.pets.length && p.pets[i] === list[k]?.id);
    if (idx.length !== 3) return this.toast(p, 'Your pets changed — pick them again.');
    const ids = idx.map((i) => p.pets[i]);
    idx.sort((a, b) => b - a).forEach((i) => p.pets.splice(i, 1));
    p.petFuse = petFuseResult(ids);
    p.petFuseAt = Date.now() + PET_FUSE_TIME * 1000;
    this.toast(p, `Fusing ${ids.map((id) => PETS[id].name).join(' + ')}… come back in ${fmtTime(PET_FUSE_TIME)}!`);
  }

  sellPet(socket, data) {
    const p = this.players.get(socket.id);
    const i = Number(data?.i);
    if (!p || !Number.isInteger(i) || i < 0 || i >= p.pets.length) return;
    if (p.pets[i] !== data?.id) return this.toast(p, 'Your pets changed — try again.');
    const id = p.pets.splice(i, 1)[0];
    p.money += petValue(id);
    this.toast(p, `Sold ${PETS[id].name} for $${fmt(petValue(id))}`, 'money');
  }

  sellWeakPets(socket) {
    const p = this.players.get(socket.id);
    if (!p) return;
    let total = 0, n = 0;
    p.pets = p.pets.filter((id) => {
      if (PETS[id].rarity === 'Common' || PETS[id].rarity === 'Uncommon') { total += petValue(id); n++; return false; }
      return true;
    });
    p.money += total;
    this.toast(p, n ? `Sold ${n} pets for $${fmt(total)}` : 'No Common or Uncommon pets to sell.', 'money');
  }

  // ---------------- helpers ----------------
  toast(p, text, kind = 'info') { p.socket.emit('toast', { text, kind }); }

  notifyStolen(thief, carry) {
    const victim = this.players.get(carry.from.owner);
    if (victim) this.toast(victim, `${thief.name} stole your ${EGGS[carry.type].name}!`, 'alert');
    carry.from = null;
  }

  // reason: 'bat' (drops on the ground), 'guardian' (egg goes back to its field), 'leave'
  dropCarry(p, reason, zoneHint = -1) {
    const c = p.carry;
    if (!c) return;
    p.carry = null;
    const owner = c.from && this.players.get(c.from.owner);
    if (owner) {
      const slot = owner.nestEggs[c.from.nest] === null ? c.from.nest
        : owner.nestEggs.findIndex((e, i) => e === null && i < owner.nests);
      if (slot >= 0) { owner.nestEggs[slot] = { type: c.type, hatchAt: Date.now() + c.left }; return; }
    }
    if (reason === 'bat') {
      this.field.push({ id: uid(), type: c.type, zone: -1, x: p.x, z: p.z, loose: Date.now() + 45000, left: c.left });
    } else {
      let z = EGGS[c.type].zone;
      if (z >= ZONES.length) z = zoneHint;
      if (z >= 0) this.spawnFieldEgg(z, c.type);
    }
  }

  income(p) {
    let s = 0;
    for (const id of p.pets) s += PETS[id].income;
    return s * this.friendBoost() * moneyMult(p.rebirths, p.passes);
  }

  friendBoost() { return 1 + Math.min(0.5, (this.players.size - 1) * 0.1); }

  // ---------------- simulation ----------------
  tick() {
    const now = Date.now();
    const dt = TICK;
    const cyc = this.cycle(now);

    if (cyc.night && !this.wasNight) {
      const z = 1 + Math.floor(Math.random() * Math.min(7, ZONES.length - 1)); // Moon Egg lands somewhere in zones 2-8
      this.spawnFieldEgg(z, 'moon');
      this.io.to(this.room).emit('toast', { text: `Night has fallen… a Moon Egg appeared in ${ZONES[z].name}!`, kind: 'big' });
    }
    this.wasNight = cyc.night;

    // refill the canyon
    for (let i = 0; i < ZONES.length; i++) {
      const count = this.field.filter((e) => e.zone === i && e.type !== 'moon').length;
      if (count < FIELD_EGGS && Math.random() < dt / 2.5) this.spawnFieldEgg(i);
    }
    // loose eggs that nobody picks up roll back home
    for (const e of this.field) {
      if (e.loose && now > e.loose) {
        e.loose = 0;
        const z = EGGS[e.type].zone;
        if (z < ZONES.length) { e.zone = z; e.x = clamp((Math.random() - 0.5) * 24, -17, 17); e.z = nestZ(z) + (Math.random() - 0.5) * 20; }
        else e.loose = now + 45000; // special eggs just stay where they fell
      }
    }
    this.field = this.field.filter((e) => !e.dead);

    for (const p of this.players.values()) {
      // move
      let speed = walkSpeed(p.stat) * (p.slow ? SLOW_MULT : 1) * (p.carry ? CARRY_MULT : 1);
      if (now < p.stunUntil) speed = 0;
      const ox = p.x, oz = p.z;
      [p.x, p.z] = clampMove(ox, oz, p.x + p.input.x * speed * dt, p.z + p.input.z * speed * dt);
      const moved = Math.hypot(p.x - ox, p.z - oz);
      if (moved > 0.001) p.rot = Math.atan2(p.x - ox, p.z - oz);
      // treadmill: standing on your own one runs in place and gives speed
      p.onTread = onTreadmill(p.plot, p.x, p.z) && now >= p.stunUntil;
      if (p.onTread) {
        p.stat += TREADMILL.gain(p.tread) * speedMult(p.rebirths, p.passes) * dt;
        if (Math.hypot(p.input.x, p.input.z) < 0.1) {
          const t = treadmillPos(p.plot);
          p.z += (t.z - p.z) * 0.3;                 // settle onto the middle of the belt
          p.rot = t.side > 0 ? -Math.PI / 2 : Math.PI / 2;
        }
      }

      // pick up eggs from the canyon / ground
      if (!p.carry && now >= p.stunUntil) {
        const i = this.field.findIndex((e) => d2(p.x, p.z, e.x, e.z) < 3.2 * 3.2);
        if (i >= 0) {
          const e = this.field[i];
          this.field.splice(i, 1);
          p.carry = { type: e.type, left: e.left ?? EGGS[e.type].hatch * 1000, from: null, guardZone: e.zone }; // guardZone: whose egg this is (-1 = nobody's)
          if (e.zone >= 0) this.wake(this.guardians[e.zone], p, true); // taking an egg always wakes its guardian, even in slow mode
          if (e.type === 'moon') this.io.to(this.room).emit('toast', { text: `${p.name} grabbed the Moon Egg!`, kind: 'big' });
        }
      }

      // drop off at home
      if (p.carry && insidePlot(p.plot, p.x, p.z)) {
        const slot = p.nestEggs.findIndex((e, i) => e === null && i < p.nests);
        if (slot >= 0) {
          if (p.carry.from) this.notifyStolen(p, p.carry);
          p.nestEggs[slot] = { type: p.carry.type, hatchAt: now + p.carry.left };
          p.carry = null;
        } else if (now > p.warnAt) {
          p.warnAt = now + 4000;
          this.toast(p, 'All your nests are full! Buy more in the Shop or sell the egg.');
        }
      }

      // hatching
      p.nestEggs.forEach((e, i) => {
        if (!e || now < e.hatchAt) return;
        if (p.pets.length >= MAX_PETS) {
          if (now > p.warnAt) { p.warnAt = now + 6000; this.toast(p, `Pet limit reached (${MAX_PETS}). Sell some pets to hatch more.`); }
          return;
        }
        const pet = weighted(EGGS[e.type].pets);
        p.pets.push(pet);
        const isNew = !p.index.has(pet);
        p.index.add(pet);
        p.nestEggs[i] = null;
        this.toast(p, `${EGGS[e.type].name} hatched: ${PETS[pet].name} (${PETS[pet].rarity})${isNew ? ' — NEW!' : ''}`, isNew ? 'big' : 'info');
        const np = nestPos(p.plot, i);
        this.io.to(this.room).emit('fx', { type: 'hatch', x: np.x, z: np.z, rarity: PETS[pet].rarity });
      });

      p.money += this.income(p) * dt;
    }

    // guardians
    for (const g of this.guardians) {
      const Z = ZONES[g.zone].guardian;
      if (g.state === 'sleep') continue; // sleeping guardians only wake when someone takes their egg
      if (g.state === 'wake') {
        // waking up: stands still for a few seconds so you get a head start
        const t = this.players.get(g.target);
        if (!t || t.carry?.guardZone !== g.zone) { g.state = 'return'; g.target = null; continue; }
        g.r = Math.atan2(t.x - g.x, t.z - g.z);
        if (now >= g.chaseAt) g.state = 'chase';
        continue;
      }
      const base = guardianSpeed(g.zone); // same speed as the sign on the zone
      let tx = 0, tz = nestZ(g.zone), speed = base;
      if (g.state === 'chase') {
        const t = this.players.get(g.target);
        const tooSlow = t && t.stat < ZONES[g.zone].rec;
        // only chase someone who is carrying THIS guardian's egg, all the way to the SAFEZONE
        if (!t || t.carry?.guardZone !== g.zone || t.z < SAFE_Z + 1 || now < t.stunUntil) {
          g.state = 'return'; g.target = null;
        } else {
          tx = t.x; tz = t.z;
          speed = tooSlow ? base * GUARDIAN_RAGE : base;
          if (d2(t.x, t.z, g.x, g.z) < (2 + Z.scale * 1.1) ** 2) {
            // caught!
            const dx = t.x - g.x, dz = t.z - g.z, l = Math.hypot(dx, dz) || 1;
            [t.x, t.z] = clampMove(t.x, t.z, t.x + (dx / l) * 6, t.z - 16);
            t.stunUntil = now + 1200;
            this.io.to(this.room).emit('fx', { type: 'bonk', x: t.x, z: t.z });
            if (t.carry) { this.dropCarry(t, 'guardian', g.zone); this.toast(t, `The ${Z.name} caught you and took the egg back!`, 'alert'); }
            else this.toast(t, `The ${Z.name} caught you!`, 'alert');
            g.state = 'return'; g.target = null;
          }
        }
      }
      const dx = tx - g.x, dz = tz - g.z, l = Math.hypot(dx, dz);
      if (g.state === 'return' && l < 1) { g.state = 'sleep'; g.r = Math.PI; continue; }
      if (l > 0.01) {
        const step = Math.min(l, speed * dt);
        g.x = clamp(g.x + (dx / l) * step, -CORRIDOR_HALF + 3, CORRIDOR_HALF - 3);
        g.z = clamp(g.z + (dz / l) * step, SAFE_Z + 2, WORLD_END_Z - 3);
        g.r = Math.atan2(dx, dz);
      }
    }

    this.broadcast(now, cyc);
    if (now - this.lastSave > 5000) {
      this.lastSave = now;
      this.saveTick = (this.saveTick || 0) + 1;
      for (const p of this.players.values()) {
        if (!p.userId) p.socket.emit('save', this.makeSave(p, now));
        else if (this.saveTick % 4 === 0 && this.onSave) this.onSave(p.userId, this.makeSave(p, now)); // every 20s
      }
    }
  }

  wake(g, p, stole = false) {
    const name = ZONES[g.zone].guardian.name;
    // a thief always becomes the target, even if the guardian was busy with someone else
    if (stole && (g.state === 'chase' || g.state === 'wake')) {
      if (g.target !== p.id) { g.target = p.id; this.toast(p, `The ${name} saw you take its egg! RUN!`, 'alert'); }
      return;
    }
    if (g.state === 'chase' || g.state === 'wake') return;
    g.state = 'wake';
    g.target = p.id;
    g.chaseAt = Date.now() + WAKE_DELAY * 1000;
    const slow = p.stat < ZONES[g.zone].rec ? ` You're slower than ${fmt(ZONES[g.zone].rec)} speed — it's ENRAGED!` : '';
    this.toast(p, (stole ? `You took the ${name}'s egg! It's waking up… RUN!` : `The ${name} is waking up… RUN!`) + slow, 'alert');
  }

  broadcast(now, cyc) {
    if (!this.players.size) return;
    this.flip = !this.flip;
    if (!this.flip) return; // 10 Hz
    const r2 = (v) => Math.round(v * 100) / 100;
    const snap = {
      players: [...this.players.values()].map((p) => ({
        id: p.id, n: p.name, c: p.color, pl: p.plot, x: r2(p.x), z: r2(p.z), r: r2(p.rot),
        cy: p.carry?.type || null, st: now < p.stunUntil, sl: p.slow, sw: now - p.swingAt < 350, tr: p.onTread,
        m: Math.floor(p.money), sp: Math.floor(p.stat), rb: p.rebirths, vip: p.passes.includes('vip'),
        tg: TREADMILL.gain(p.tread) * speedMult(p.rebirths, p.passes),
      })),
      guardians: this.guardians.map((g) => ({ x: r2(g.x), z: r2(g.z), r: r2(g.r), s: g.state, w: g.state === 'wake' ? Math.ceil((g.chaseAt - now) / 1000) : 0 })),
      eggs: this.field.map((e) => ({ id: e.id, t: e.type, x: r2(e.x), z: r2(e.z) })),
      plots: this.plots.map((id) => {
        if (!id) return null;
        const p = this.players.get(id);
        return {
          o: id, n: p.nests, p: p.pets, t: p.tread,
          e: p.nestEggs.map((e) => e && { t: e.type, h: Math.max(0, Math.ceil((e.hatchAt - now) / 1000)) }),
        };
      }),
      cyc: { night: cyc.night, left: Math.ceil(cyc.left) },
    };
    const fb = Math.round((this.friendBoost() - 1) * 100);
    for (const p of this.players.values()) {
      p.socket.emit('s', {
        ...snap,
        me: {
          money: Math.floor(p.money), stat: Math.floor(p.stat), tread: p.tread, nests: p.nests,
          inc: this.income(p), fb, fuse: p.fuse, fr: p.fuseResult,
          fl: p.fuseResult ? Math.max(0, Math.ceil((p.fuseAt - now) / 1000)) : 0,
          pfr: p.petFuse, pfl: p.petFuse ? Math.max(0, Math.ceil((p.petFuseAt - now) / 1000)) : 0,
          index: [...p.index], swingCd: Math.max(0, (p.swingReadyAt - now) / 1000),
          rebirths: p.rebirths, passes: p.passes, account: !!p.userId, maxNests: maxNestsFor(p.passes),
          mm: moneyMult(p.rebirths, p.passes), sm: speedMult(p.rebirths, p.passes),
        },
      });
    }
  }

  makeSave(p, now) {
    return {
      money: Math.floor(p.money), stat: Math.floor(p.stat), tread: p.tread, nests: p.nests, rebirths: p.rebirths,
      nestEggs: p.nestEggs.map((e) => e && { type: e.type, left: Math.max(0, Math.ceil((e.hatchAt - now) / 1000)) }),
      pets: p.pets, index: [...p.index],
      fuse: p.fuse, fuseResult: p.fuseResult, fuseLeft: p.fuseResult ? Math.max(0, Math.ceil((p.fuseAt - now) / 1000)) : 0,
      petFuse: p.petFuse, petFuseLeft: p.petFuse ? Math.max(0, Math.ceil((p.petFuseAt - now) / 1000)) : 0,
    };
  }
}

// Saves live in the player's browser — clean them so a broken save can't crash the server.
function sanitize(s, passes = []) {
  const out = { money: 50, stat: 0, tread: 1, rebirths: 0, nests: SHOP.startNests, nestEggs: [], pets: [], index: [], fuse: [], fuseResult: null, fuseLeft: 0, petFuse: null, petFuseLeft: 0 };
  if (!s || typeof s !== 'object') return out;
  const num = (v, a, b, d) => (Number.isFinite(Number(v)) ? clamp(Number(v), a, b) : d);
  out.money = num(s.money, 0, 1e30, 50);
  out.stat = num(s.stat, 0, 1e25, 0);
  out.tread = Math.floor(num(s.tread, 1, TREADMILL.maxLevel, 1));
  out.nests = Math.floor(num(s.nests, SHOP.startNests, maxNestsFor(passes), SHOP.startNests));
  out.rebirths = Math.floor(num(s.rebirths, 0, 1000, 0));
  if (Array.isArray(s.nestEggs)) {
    out.nestEggs = s.nestEggs.slice(0, out.nests).map((e) => (e && EGGS[e.type] ? { type: e.type, left: num(e.left, 0, EGGS[e.type].hatch, EGGS[e.type].hatch) } : null));
  }
  if (Array.isArray(s.pets)) out.pets = s.pets.filter((id) => PETS[id]).slice(0, MAX_PETS);
  if (Array.isArray(s.index)) out.index = s.index.filter((id) => PETS[id]);
  if (Array.isArray(s.fuse)) out.fuse = s.fuse.filter((t) => EGGS[t]).slice(0, 3);
  if (s.fuseResult && EGGS[s.fuseResult]) { out.fuseResult = s.fuseResult; out.fuseLeft = num(s.fuseLeft, 0, FUSE_TIME, 0); }
  if (s.petFuse && EGGS[s.petFuse]) { out.petFuse = s.petFuse; out.petFuseLeft = num(s.petFuseLeft, 0, PET_FUSE_TIME, 0); }
  return out;
}
