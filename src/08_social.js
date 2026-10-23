
/* ============================================================================
   ACCOUNTS + FRIENDS (Supabase Auth + tables profiles / friends / presence / invites)
   Email + password accounts with a unique username and a friend code. Friends see whether you're
   online and which room you're in (row-level security keeps that to accepted friends only), and
   can invite each other into rooms.
   ========================================================================== */
const USERNAME_RE = /^[A-Za-z0-9_]{3,16}$/;
const Social = {
  user: null, profile: null, friends: [], incoming: [], outgoing: [], ready: false, _room: undefined, _seenInv: new Set(),
  async init() {
    if (!GAME.supa) return;
    try {
      const c = await Online.client();
      const { data } = await c.auth.getSession();
      await this.setUser(data && data.session ? data.session.user : null);
      c.auth.onAuthStateChange((_e, s) => { this.setUser(s ? s.user : null); });
    } catch (e) { console.warn('accounts', e); }
    this.ready = true; UI.refreshSocial();
    setInterval(() => this.tick(), 3000);
  },
  async db() { return Online.client(); },
  async setUser(u) {
    if ((u ? u.id : null) === (this.user ? this.user.id : null) && (this.profile || !u)) return;
    this.user = u || null; this.profile = null; this.friends = []; this.incoming = []; this.outgoing = [];
    if (u) {
      const c = await this.db();
      const { data } = await c.from('profiles').select('id,username,friend_code').eq('id', u.id).maybeSingle();
      this.profile = data || null;
      if (data) { Settings.name = data.username; saveSettings(); const nm = $('#inName'); if (nm) nm.value = data.username; }
      this._room = undefined; this.tick(); this.refresh();
    }
    UI.refreshSocial();
  },
  code() { return this.profile ? 'TW-' + this.profile.friend_code : ''; },
  // ---- account -------------------------------------------------------------------------------
  async usernameFree(name) {
    const c = await this.db();
    const { data } = await c.from('profiles').select('id').ilike('username', name.replace(/[\\%_]/g, m => '\\' + m)).limit(1);
    return !(data && data.length);
  },
  async signUp(email, password, username) {
    username = String(username || '').trim();
    if (!USERNAME_RE.test(username)) throw new Error('Usernames are 3-16 letters, numbers or _.');
    if (String(password || '').length < 8) throw new Error('Use a password of at least 8 characters.');
    if (!(await this.usernameFree(username))) throw new Error('That username is taken.');
    const c = await this.db();
    const { data, error } = await c.auth.signUp({ email: String(email).trim(), password, options: { data: { username }, emailRedirectTo: GAME.site } });
    if (error) throw new Error(/Database error/i.test(error.message) ? 'That username is taken or not allowed.' : error.message);
    return { confirm: !data.session };
  },
  async signIn(email, password) {
    const c = await this.db();
    const { error } = await c.auth.signInWithPassword({ email: String(email).trim(), password });
    if (error) throw new Error(/not confirmed/i.test(error.message) ? 'Confirm your email first: check your inbox for the link.' : /invalid/i.test(error.message) ? 'Wrong email or password.' : error.message);
  },
  async resetPassword(email) {
    const c = await this.db();
    const { error } = await c.auth.resetPasswordForEmail(String(email).trim(), { redirectTo: GAME.site });
    if (error) throw new Error(error.message);
  },
  async signOut() {
    try { if (this.user) { const c = await this.db(); await c.from('presence').update({ room: null }).eq('id', this.user.id); await c.auth.signOut(); } } catch (e) { }
    await this.setUser(null);
  },
  // ---- friends ------------------------------------------------------------------------------
  online(f) { return f.seen && Date.now() - new Date(f.seen).getTime() < 100000; },
  async refresh() {
    if (!this.user || this._busy) return; this._busy = true;
    try {
      const c = await this.db(), me = this.user.id;
      const { data: fr } = await c.from('friends').select('a,b,status');
      const rows = fr || [], ids = [...new Set(rows.map(r => r.a === me ? r.b : r.a))];
      const profs = new Map();
      if (ids.length) { const { data } = await c.from('profiles').select('id,username').in('id', ids); for (const p of data || []) profs.set(p.id, p.username); }
      const acc = rows.filter(r => r.status === 'accepted').map(r => r.a === me ? r.b : r.a), pres = new Map();
      if (acc.length) { const { data } = await c.from('presence').select('id,room,mode,v,seen').in('id', acc); for (const p of data || []) pres.set(p.id, p); }
      this.friends = acc.map(id => Object.assign({ id, username: profs.get(id) || '?' }, pres.get(id) || {})).sort((x, y) => this.online(y) - this.online(x) || x.username.localeCompare(y.username));
      this.incoming = rows.filter(r => r.status === 'pending' && r.b === me).map(r => ({ id: r.a, username: profs.get(r.a) || '?' }));
      this.outgoing = rows.filter(r => r.status === 'pending' && r.a === me).map(r => ({ id: r.b, username: profs.get(r.b) || '?' }));
      // room invites from the last 10 minutes
      const { data: inv } = await c.from('invites').select('id,from_id,room,created_at').eq('to_id', me).gt('created_at', new Date(Date.now() - 600000).toISOString()).order('created_at', { ascending: false }).limit(5);
      for (const i of inv || []) if (!this._seenInv.has(i.id)) { this._seenInv.add(i.id); if (!(Net.online && Net.code === i.room)) UI.showInvite({ id: i.id, from: profs.get(i.from_id) || 'A friend', room: i.room }); }
    } catch (e) { console.warn('friends', e); }
    this._busy = false; UI.refreshSocial();
  },
  // tell friends where we are (on room changes, and every 45 s so we count as online)
  async tick() {
    if (!this.user) return;
    const room = Net.online && Net.code && Net.code !== 'SOLO' ? Net.code : null, t = now();
    if (room !== this._room || t - (this._beat || 0) > 45) {
      this._room = room; this._beat = t;
      try { const c = await this.db(); await c.from('presence').upsert({ id: this.user.id, room, mode: room ? modeLabel() : null, v: GAME.version }); } catch (e) { }
    }
    if (t - (this._ref || 0) > (UI.open === 'friends' ? 6 : 15) && !document.hidden) { this._ref = t; this.refresh(); }
  },
  async addFriend(q) {
    if (!this.user) throw new Error('Sign in first.');
    q = String(q || '').trim(); if (!q) return;
    const c = await this.db(), code = q.toUpperCase().replace(/^TW-?/, '');
    let target = null;
    if (/^[0-9A-F]{6}$/.test(code)) { const { data } = await c.from('profiles').select('id,username').eq('friend_code', code).maybeSingle(); target = data; }
    if (!target && USERNAME_RE.test(q)) { const { data } = await c.from('profiles').select('id,username').ilike('username', q.replace(/[\\%_]/g, m => '\\' + m)).maybeSingle(); target = data; }
    if (!target) throw new Error('No player with that username or friend code.');
    if (target.id === this.user.id) throw new Error("That's you!");
    if (this.friends.some(f => f.id === target.id)) throw new Error(`You and ${target.username} are already friends.`);
    if (this.incoming.some(f => f.id === target.id)) { await this.accept(target.id); return `You and ${target.username} are now friends.`; }
    const { error } = await c.from('friends').insert({ a: this.user.id, b: target.id });
    if (error) throw new Error(/duplicate/i.test(error.message) ? `You already sent ${target.username} a request.` : error.message);
    this.refresh(); return `Friend request sent to ${target.username}.`;
  },
  async accept(id) { const c = await this.db(); await c.from('friends').update({ status: 'accepted' }).eq('a', id).eq('b', this.user.id); this.refresh(); },
  async remove(id) { const c = await this.db(), me = this.user.id; await c.from('friends').delete().or(`and(a.eq.${me},b.eq.${id}),and(a.eq.${id},b.eq.${me})`); this.refresh(); },
  async invite(f) {
    if (!(Net.online && Net.code)) throw new Error('Host or join a room first.');
    const c = await this.db(); const { error } = await c.from('invites').insert({ to_id: f.id, room: Net.code });
    if (error) throw new Error(/slow down/i.test(error.message) ? 'Slow down a little.' : error.message);
  },
  async dismissInvite(id) { try { const c = await this.db(); await c.from('invites').delete().eq('id', id); } catch (e) { } },
  join(room) { const was = Game.state === 'playing'; if (was) Game.toLobby(true); UI.closeMenu(); setTimeout(() => Game.joinRoom(room), was ? 600 : 0); },
};
