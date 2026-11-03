'use strict';

// ============================================================
// DOM shortcuts
// ============================================================
const $ = (id) => document.getElementById(id);

const ui = {
  login: $('login'), loginForm: $('loginForm'), loginError: $('loginError'),
  usernameInput: $('usernameInput'), roomInput: $('roomInput'),
  app: $('app'), roomTitle: $('roomTitle'), meLabel: $('meLabel'),
  usersList: $('usersList'), leaveBtn: $('leaveBtn'),
  messages: $('messages'), typing: $('typing'),
  messageForm: $('messageForm'), messageInput: $('messageInput'), fileInput: $('fileInput'),
  startCallBtn: $('startCallBtn'), callPanel: $('callPanel'), videos: $('videos'),
  micBtn: $('micBtn'), camBtn: $('camBtn'), shareBtn: $('shareBtn'), hangupBtn: $('hangupBtn'),
};

// ============================================================
// State
// ============================================================
const state = {
  ws: null,
  me: null,           // { id, username }
  users: [],          // [{ id, username, inCall }]
  typingUsers: new Map(), // id -> username
};

// WebRTC state
const call = {
  localStream: null,
  screenStream: null,
  peers: new Map(),   // peerId -> RTCPeerConnection
};
const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

// ============================================================
// WebSocket connection
// ============================================================
function connect(username, room) {
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${protocol}://${location.host}/ws`);
  state.ws = ws;

  ws.onopen = () => send({ type: 'join', username, room });
  ws.onmessage = (event) => handleServerMessage(JSON.parse(event.data));
  ws.onclose = () => {
    if (state.ws !== ws) return; // we closed it on purpose
    resetSession();
    showLogin('Connection lost. Join again to continue.');
  };
}

function send(payload) {
  if (state.ws?.readyState === WebSocket.OPEN) state.ws.send(JSON.stringify(payload));
}

// One function per server message type
const serverHandlers = {
  joined({ me, room, users, history }) {
    state.me = me;
    state.users = users;
    ui.roomTitle.textContent = `# ${room}`;
    ui.meLabel.textContent = `You are ${me.username}`;
    ui.messages.innerHTML = '';
    history.forEach(renderMessage);
    renderUsers();
    ui.login.hidden = true;
    ui.app.hidden = false;
    ui.messageInput.focus();
  },

  users({ users }) {
    state.users = users;
    renderUsers();
  },

  message: (msg) => renderMessage(msg),
  system: ({ text }) => renderSystem(text),

  typing({ id, username, isTyping }) {
    if (isTyping) state.typingUsers.set(id, username);
    else state.typingUsers.delete(id);
    renderTyping();
  },

  error({ message }) {
    ui.loginError.textContent = message;
    if (!state.me) { state.ws?.close(); state.ws = null; }
  },

  // ----- video call -----
  async 'call-peers'({ peers }) {
    // I just joined the call: I call everyone who is already in it
    for (const peer of peers) await createPeer(peer.id, peer.username, true);
  },
  'call-user-left': ({ id }) => closePeer(id),
  signal: (msg) => handleSignal(msg),
};

function handleServerMessage(msg) {
  serverHandlers[msg.type]?.(msg);
}

// ============================================================
// Chat UI
// ============================================================
function formatTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function scrollToBottom() {
  ui.messages.scrollTop = ui.messages.scrollHeight;
}

function renderSystem(text) {
  const el = document.createElement('div');
  el.className = 'system';
  el.textContent = text; // textContent = safe against XSS
  ui.messages.append(el);
  scrollToBottom();
}

function renderMessage(msg) {
  if (msg.type === 'system') return renderSystem(msg.text);

  const mine = msg.from.id === state.me?.id;
  const wrapper = document.createElement('div');
  wrapper.className = `msg${mine ? ' mine' : ''}`;

  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.textContent = `${mine ? 'You' : msg.from.username} · ${formatTime(msg.ts)}`;

  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  if (msg.kind === 'file') bubble.append(renderFile(msg.file));
  else bubble.textContent = msg.text;

  wrapper.append(meta, bubble);
  ui.messages.append(wrapper);
  scrollToBottom();
}

function renderFile(file) {
  const type = file.mimetype || '';
  let el;
  if (type.startsWith('image/')) {
    el = document.createElement('img');
    el.src = file.url;
    el.alt = file.name;
  } else if (type.startsWith('video/')) {
    el = document.createElement('video');
    el.src = file.url;
    el.controls = true;
  } else if (type.startsWith('audio/')) {
    el = document.createElement('audio');
    el.src = file.url;
    el.controls = true;
  } else {
    el = document.createElement('a');
    el.href = file.url;
    el.target = '_blank';
    el.rel = 'noopener';
    el.textContent = `${file.name} (${Math.ceil(file.size / 1024)} KB)`;
  }
  return el;
}

function renderUsers() {
  ui.usersList.innerHTML = '';
  for (const user of state.users) {
    const li = document.createElement('li');
    const dot = document.createElement('span');
    dot.className = 'dot';
    const name = document.createElement('span');
    name.textContent = user.id === state.me?.id ? `${user.username} (you)` : user.username;
    li.append(dot, name);
    if (user.inCall) {
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = 'in call';
      li.append(badge);
    }
    ui.usersList.append(li);
  }
}

function renderTyping() {
  const names = [...state.typingUsers.values()];
  if (names.length === 0) ui.typing.textContent = '';
  else if (names.length === 1) ui.typing.textContent = `${names[0]} is typing…`;
  else ui.typing.textContent = `${names.join(', ')} are typing…`;
}

// ============================================================
// Chat actions
// ============================================================
ui.messageForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = ui.messageInput.value.trim();
  if (!text) return;
  send({ type: 'chat', text });
  send({ type: 'typing', isTyping: false });
  ui.messageInput.value = '';
});

// "is typing" indicator (debounced)
let typingTimer = null;
ui.messageInput.addEventListener('input', () => {
  send({ type: 'typing', isTyping: true });
  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => send({ type: 'typing', isTyping: false }), 1500);
});

// File upload: HTTP upload first, then announce it through the WebSocket
ui.fileInput.addEventListener('change', async () => {
  const file = ui.fileInput.files[0];
  ui.fileInput.value = '';
  if (!file) return;

  const form = new FormData();
  form.append('file', file);
  try {
    const res = await fetch('/api/upload', { method: 'POST', body: form });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    send({ type: 'file', file: data });
  } catch (err) {
    renderSystem(`Upload failed: ${err.message}`);
  }
});

// ============================================================
// Login / logout
// ============================================================
function showLogin(errorText = '') {
  ui.app.hidden = true;
  ui.login.hidden = false;
  ui.loginError.textContent = errorText;
}

function resetSession() {
  endCall(false);
  state.ws = null;
  state.me = null;
  state.users = [];
  state.typingUsers.clear();
  renderTyping();
}

ui.loginForm.addEventListener('submit', (e) => {
  e.preventDefault();
  ui.loginError.textContent = '';
  connect(ui.usernameInput.value.trim(), ui.roomInput.value.trim());
});

ui.leaveBtn.addEventListener('click', () => {
  const ws = state.ws;
  resetSession();   // sets state.ws = null first so onclose ignores this close
  ws?.close();
  showLogin();
});

// ============================================================
// Video call (WebRTC, mesh: every user connects to every other user)
//
// Flow:
//  1. I click "Start video call" -> get camera/mic -> send 'call-join'
//  2. Server replies 'call-peers' (people already in the call)
//  3. For each one I create an RTCPeerConnection and send an OFFER
//  4. They reply with an ANSWER; both sides exchange ICE candidates
//  5. 'signal' messages are just relayed by the server
// ============================================================
async function startCall() {
  if (call.localStream) return;
  try {
    call.localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  } catch (err) {
    renderSystem(`Cannot access camera/mic: ${err.message} (HTTPS or localhost is required)`);
    return;
  }
  addVideoTile('local', 'You', call.localStream, true);
  ui.callPanel.hidden = false;
  ui.app.classList.add('in-call');
  ui.startCallBtn.hidden = true;
  send({ type: 'call-join' });
}

function endCall(notifyServer = true) {
  if (notifyServer) send({ type: 'call-leave' });
  call.peers.forEach((_pc, id) => closePeer(id));
  call.localStream?.getTracks().forEach((t) => t.stop());
  call.screenStream?.getTracks().forEach((t) => t.stop());
  call.localStream = null;
  call.screenStream = null;
  ui.videos.innerHTML = '';
  ui.callPanel.hidden = true;
  ui.app.classList.remove('in-call');
  ui.startCallBtn.hidden = false;
  ui.micBtn.textContent = 'Mute';
  ui.camBtn.textContent = 'Camera off';
  ui.micBtn.classList.remove('off');
  ui.camBtn.classList.remove('off');
  ui.shareBtn.textContent = 'Share screen';
}

async function createPeer(peerId, username, isInitiator) {
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  call.peers.set(peerId, pc);

  // Send my camera/mic to this peer
  call.localStream.getTracks().forEach((track) => pc.addTrack(track, call.localStream));

  // Send my network candidates to this peer
  pc.onicecandidate = (e) => {
    if (e.candidate) send({ type: 'signal', to: peerId, data: { candidate: e.candidate } });
  };

  // Show the peer's video when it arrives
  pc.ontrack = (e) => addVideoTile(peerId, username, e.streams[0], false);

  pc.onconnectionstatechange = () => {
    if (['failed', 'closed'].includes(pc.connectionState)) closePeer(peerId);
  };

  if (isInitiator) {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    send({ type: 'signal', to: peerId, data: { description: pc.localDescription } });
  }
  return pc;
}

async function handleSignal({ from, username, data }) {
  if (!call.localStream) return; // I'm not in the call

  let pc = call.peers.get(from);
  if (!pc) pc = await createPeer(from, username, false);

  try {
    if (data.description) {
      await pc.setRemoteDescription(data.description);
      if (data.description.type === 'offer') {
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        send({ type: 'signal', to: from, data: { description: pc.localDescription } });
      }
    } else if (data.candidate) {
      await pc.addIceCandidate(data.candidate);
    }
  } catch (err) {
    console.error('Signal error:', err);
  }
}

function closePeer(peerId) {
  call.peers.get(peerId)?.close();
  call.peers.delete(peerId);
  document.getElementById(`tile-${peerId}`)?.remove();
}

function addVideoTile(id, label, stream, muted) {
  let tile = document.getElementById(`tile-${id}`);
  if (!tile) {
    tile = document.createElement('div');
    tile.id = `tile-${id}`;
    tile.className = 'tile';
    const video = document.createElement('video');
    video.autoplay = true;
    video.playsInline = true;
    video.muted = muted; // mute my own preview to avoid echo
    const name = document.createElement('span');
    name.className = 'label';
    name.textContent = label;
    tile.append(video, name);
    ui.videos.append(tile);
  }
  tile.querySelector('video').srcObject = stream;
}

// ----- call controls -----
function toggleTrack(kind, button, onText, offText) {
  const track = call.localStream?.getTracks().find((t) => t.kind === kind);
  if (!track) return;
  track.enabled = !track.enabled;
  button.textContent = track.enabled ? onText : offText;
  button.classList.toggle('off', !track.enabled);
}

ui.startCallBtn.addEventListener('click', startCall);
ui.hangupBtn.addEventListener('click', () => endCall());
ui.micBtn.addEventListener('click', () => toggleTrack('audio', ui.micBtn, 'Mute', 'Unmute'));
ui.camBtn.addEventListener('click', () => toggleTrack('video', ui.camBtn, 'Camera off', 'Camera on'));

// Screen sharing: swap the video track sent to every peer
ui.shareBtn.addEventListener('click', async () => {
  if (!call.localStream) return;

  if (call.screenStream) return stopScreenShare();

  try {
    call.screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
  } catch {
    return; // user cancelled
  }
  const screenTrack = call.screenStream.getVideoTracks()[0];
  replaceVideoTrack(screenTrack);
  screenTrack.onended = stopScreenShare; // browser's "Stop sharing" button
  ui.shareBtn.textContent = 'Stop sharing';
});

function stopScreenShare() {
  call.screenStream?.getTracks().forEach((t) => t.stop());
  call.screenStream = null;
  const cameraTrack = call.localStream?.getVideoTracks()[0];
  if (cameraTrack) replaceVideoTrack(cameraTrack);
  ui.shareBtn.textContent = 'Share screen';
}

function replaceVideoTrack(track) {
  call.peers.forEach((pc) => {
    const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
    sender?.replaceTrack(track);
  });
  const preview = document.querySelector('#tile-local video');
  if (preview) preview.srcObject = new MediaStream([track]);
}
