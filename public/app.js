// public/app.js
// Simple chat client for Aero DJ Assistant

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('chat-form');
  const input = document.getElementById('msg');
  const messages = document.getElementById('messages');
  const downloadList = document.getElementById('downloaded-list');
  const refreshBtn = document.getElementById('refresh-downloads');

  function addMessage(text, from = 'user') {
    const li = document.createElement('li');
    li.className = `chat-${from}`;
    li.textContent = text;
    messages.appendChild(li);
    messages.scrollTop = messages.scrollHeight;
  }

  async function sendMessage(msg) {
    addMessage(msg, 'user');
    try {
      const resp = await fetch('/api/dj/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg })
      });
      const data = await resp.json();
      if (data && data.response && data.response.text) {
        addMessage(data.response.text, 'assistant');
      } else if (data && data.error) {
        addMessage(`⚠️ ${data.error}`, 'assistant');
      } else {
        addMessage("Sorry, I didn't understand that.", 'assistant');
      }
    } catch (e) {
      console.error('Assistant error:', e);
      addMessage('Error contacting the assistant.', 'assistant');
    }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const userMsg = input.value.trim();
    if (!userMsg) return;
    input.value = '';
    input.disabled = true;
    await sendMessage(userMsg);
    input.disabled = false;
    input.focus();
  });

  // ----- Downloaded Tracks UI -----
  async function loadDownloads() {
    downloadList.innerHTML = '';
    try {
      const resp = await fetch('/api/downloaded');
      const data = await resp.json();
      const tracks = data.tracks || [];
      tracks.forEach(track => {
        const li = document.createElement('li');
        li.textContent = `${track.title} – ${track.artist} (${track.album}) [${track.duration}]`;
        const delBtn = document.createElement('button');
        delBtn.textContent = 'Delete';
        delBtn.addEventListener('click', () => handleDelete(track.id));
        li.appendChild(delBtn);
        downloadList.appendChild(li);
      });
    } catch (e) {
      console.error('Failed to load downloads', e);
    }
  }

  async function handleDelete(id) {
    const removeOnly = confirm('Remove from list only? Click Cancel to also delete local file (if any).');
    // Currently we only store metadata; the same DELETE works for both choices.
    try {
      const resp = await fetch(`/api/downloaded/${id}`, { method: 'DELETE' });
      const result = await resp.json();
      if (result.success) {
        loadDownloads();
      } else {
        alert('Deletion failed');
      }
    } catch (e) {
      console.error('Delete error', e);
    }
  }

  refreshBtn.addEventListener('click', loadDownloads);
  // Initial load
  loadDownloads();
});
