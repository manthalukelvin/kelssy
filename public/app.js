const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

async function api(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    credentials: 'same-origin'
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.code = data.code;
    err.status = res.status;
    throw err;
  }
  return data;
}

// ---------- Auth ----------
async function checkAuth() {
  try {
    const { authenticated } = await api('/api/auth/status');
    if (authenticated) {
      $('#loginScreen').classList.add('hidden');
      $('#appShell').classList.remove('hidden');
      await bootApp();
    } else {
      $('#loginScreen').classList.remove('hidden');
      $('#appShell').classList.add('hidden');
    }
  } catch {
    $('#loginScreen').classList.remove('hidden');
  }
}

$('#loginForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const password = $('#loginPassword').value;
  const btn = $('#loginBtn');
  const errEl = $('#loginError');
  btn.disabled = true;
  errEl.classList.add('hidden');
  try {
    await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ password }) });
    toast('Welcome back');
    await checkAuth();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  } finally {
    btn.disabled = false;
  }
});

$('#logoutBtn')?.addEventListener('click', async () => {
  await api('/api/auth/logout', { method: 'POST' });
  location.reload();
});

// ---------- Navigation ----------
$$('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    $$('.nav-item').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const view = btn.dataset.view;
    $$('.view').forEach(v => v.classList.remove('active'));
    $(`#view-${view}`)?.classList.add('active');
    if (view === 'queue' || view === 'library') loadPosts();
    if (view === 'activity') loadActivity();
    if (view === 'agent') loadAgentConfig();
    if (view === 'connections') loadConnections();
    if (view === 'growth') loadGrowthSummary();
    if (view === 'schedule') loadSchedule();
  });
});

// ---------- Studio ----------
$('#generateBtn')?.addEventListener('click', async () => {
  const btn = $('#generateBtn');
  btn.disabled = true;
  btn.innerHTML = '<span>◌</span> Generating…';
  try {
    const body = {
      platform: $('#genPlatform').value,
      contentType: $('#genType').value,
      objective: $('#genObjective').value,
      tone: $('#genTone').value,
      topic: $('#genTopic').value.trim(),
      audience: $('#genAudience').value.trim()
    };
    if (!body.topic) throw new Error('Please enter a topic / brief');
    const { post } = await api('/api/generate', { method: 'POST', body: JSON.stringify(body) });
    currentPost = post;
    $('#resultTitle').textContent = `${post.platform} · ${post.contentType}`;
    $('#resultBadge').textContent = post.status.replace('_', ' ');
    $('#resultBadge').className = 'badge ' + (post.status === 'pending_approval' ? 'pending' : 'approved');
    $('#resultContent').value = post.content;
    $('#resultActions').style.display = 'flex';
    toast('Content generated');
    updateCounts();
  } catch (err) {
    toast(err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span>✦</span> Generate with agent';
  }
});

let currentPost = null;
$('#copyResultBtn')?.addEventListener('click', () => {
  navigator.clipboard.writeText($('#resultContent').value);
  toast('Copied');
});
$('#saveToQueueBtn')?.addEventListener('click', () => {
  toast(currentPost ? 'Already saved to library / queue' : 'Nothing to save');
});

// ---------- Posts / Queue / Library ----------
async function loadPosts() {
  try {
    const { posts } = await api('/api/posts');
    const pending = posts.filter(p => p.status === 'pending_approval');
    const all = posts;

    $('#queueCount').textContent = pending.length;
    $('#libraryCount').textContent = all.length;

    const render = (list, targetId) => {
      const el = $(targetId);
      if (!list.length) {
        el.innerHTML = '<div class="card muted">No items yet.</div>';
        return;
      }
      el.innerHTML = list.map(p => `
        <article class="list-item" data-id="${p.id}">
          <header>
            <div>
              <strong>${p.platform}</strong> · ${p.contentType || 'post'}
              <div class="meta">${p.brand || ''} · ${new Date(p.createdAt || p.updatedAt).toLocaleString()}
                ${p.publishResult ? ` · published → ${p.publishResult.provider}` : ''}
              </div>
            </div>
            <span class="badge ${p.status === 'pending_approval' ? 'pending' : p.status === 'approved' || p.status === 'published' ? 'approved' : ''}">${(p.status || '').replace('_', ' ')}</span>
          </header>
          <div class="content-preview">${escapeHtml((p.content || '').slice(0, 400))}</div>
          <div class="actions">
            ${p.status === 'pending_approval' ? `<button class="btn small primary" data-action="approve">Approve</button>
            <button class="btn small" data-action="reject">Reject</button>` : ''}
            ${p.status === 'approved' || p.status === 'published' ? `
              <button class="btn small" data-action="attach-media">Attach media</button>
              <button class="btn small primary" data-action="publish-meta">→ Instagram</button>
              <button class="btn small primary" data-action="publish-facebook">→ Facebook Page</button>
              <button class="btn small primary" data-action="publish-tiktok">→ TikTok</button>
              <button class="btn small primary" data-action="publish-youtube">→ YouTube</button>
            ` : ''}
            <button class="btn small ghost" data-action="delete">Delete</button>
          </div>
          ${p.localMediaUrl || p.mediaUrl ? `<div class="meta">Media: ${escapeHtml(p.mediaUrl || p.localMediaUrl || '')}</div>` : ''}
        </article>
      `).join('');

      el.querySelectorAll('[data-action]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.closest('.list-item').dataset.id;
          const action = btn.dataset.action;
          try {
            if (action === 'delete') {
              await api(`/api/posts/${id}`, { method: 'DELETE' });
              toast('Deleted');
              loadPosts();
              return;
            }
            if (action === 'approve' || action === 'reject') {
              const status = action === 'approve' ? 'approved' : 'rejected';
              const res = await api(`/api/posts/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
              if (res.autoPublish && !res.autoPublish.skipped) {
                toast(res.autoPublish.error ? `Approved (auto-publish failed: ${res.autoPublish.error})` : 'Approved & auto-published');
              } else {
                toast(status === 'approved' ? 'Approved' : 'Rejected');
              }
              loadPosts();
              return;
            }
            if (action === 'attach-media') {
              const input = document.createElement('input');
              input.type = 'file';
              input.accept = 'image/*,video/*';
              input.onchange = async () => {
                const file = input.files?.[0];
                if (!file) return;
                const fd = new FormData();
                fd.append('file', file);
                fd.append('postId', id);
                try {
                  const res = await fetch('/api/upload', { method: 'POST', body: fd, credentials: 'same-origin' });
                  const data = await res.json();
                  if (!res.ok) throw new Error(data.error || 'Upload failed');
                  toast(`Uploaded ${data.upload.originalName}`);
                  loadPosts();
                } catch (err) { toast(err.message); }
              };
              input.click();
              return;
            }
            if (action === 'publish-meta' || action === 'publish-tiktok' || action === 'publish-youtube' || action === 'publish-facebook') {
              const provider = action === 'publish-meta' ? 'meta'
                : action === 'publish-tiktok' ? 'tiktok'
                : action === 'publish-facebook' ? 'facebook'
                : 'youtube';
              let mediaUrl = null;
              let mediaType = 'IMAGE';
              let privacyLevel = provider === 'tiktok' ? 'SELF_ONLY' : 'unlisted';
              let localPath = null;

              if (provider === 'youtube') {
                privacyLevel = prompt('YouTube privacy: unlisted, public, or private', 'unlisted') || 'unlisted';
              } else if (provider === 'facebook') {
                mediaUrl = prompt('Optional public HTTPS image URL (leave empty for text-only post):', '') || null;
                if (mediaUrl && !/^https:\/\//i.test(mediaUrl)) {
                  toast('URL must start with https://');
                  return;
                }
              } else {
                mediaUrl = prompt(
                  'Public HTTPS media URL (leave empty to use attached upload + PUBLIC_BASE_URL):',
                  ''
                );
                if (mediaUrl && !/^https:\/\//i.test(mediaUrl)) {
                  toast('URL must start with https://');
                  return;
                }
                if (provider === 'meta') {
                  const isVideo = (mediaUrl && /\.(mp4|mov|webm)(\?|$)/i.test(mediaUrl)) || confirm('Reel/video? OK=Reel, Cancel=Image');
                  mediaType = isVideo ? 'REELS' : 'IMAGE';
                } else {
                  const priv = prompt('TikTok privacy: SELF_ONLY, FOLLOWER_OF_CREATOR, MUTUAL_FOLLOW_FRIENDS, PUBLIC_TO_EVERYONE', 'SELF_ONLY');
                  if (priv) privacyLevel = priv.trim();
                }
              }

              btn.disabled = true;
              const prev = btn.textContent;
              btn.textContent = 'Publishing…';
              try {
                const result = await api(`/api/publish/${id}`, {
                  method: 'POST',
                  body: JSON.stringify({ provider, mediaUrl: mediaUrl || undefined, mediaType, privacyLevel, localPath })
                });
                if (provider === 'meta') toast(`Instagram · ${result.mediaId}`);
                else if (provider === 'tiktok') toast(`TikTok · ${result.publishId}`);
                else if (provider === 'facebook') toast(`Facebook Page · ${result.postId}`);
                else toast(`YouTube · ${result.videoId || result.url}`);
                loadPosts();
              } catch (err) {
                toast(err.message);
                btn.disabled = false;
                btn.textContent = prev;
              }
            }
          } catch (err) { toast(err.message); }
        });
      });
    };

    render(pending, '#queueList');
    render(all, '#libraryList');
  } catch (err) {
    toast(err.message);
  }
}

function updateCounts() {
  loadPosts();
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ---------- Agent config ----------
const PLATFORM_OPTIONS = ['Facebook', 'Instagram', 'TikTok', 'YouTube', 'X'];

async function loadAgentConfig() {
  try {
    const { config } = await api('/api/agent/config');
    $('#agentMode').value = config.mode || 'semi-auto';
    $('#agentFreq').value = config.postingFrequency || 'daily';
    $('#agentApproval').checked = config.approvalRequired !== false;
    $('#agentGeneral').value = config.generalInstructions || '';

    const instr = config.actionInstructions || {};
    $('#instr-createPost').value = instr.createPost || '';
    $('#instr-createImagePrompt').value = instr.createImagePrompt || '';
    $('#instr-createVideoScript').value = instr.createVideoScript || '';
    $('#instr-analyseGrowth').value = instr.analyseGrowth || '';
    $('#instr-learnFromOthers').value = instr.learnFromOthers || '';

    const enabled = new Set(config.platformsEnabled || []);
    const chips = $('#platformChips');
    chips.innerHTML = PLATFORM_OPTIONS.map(p =>
      `<button type="button" class="chip ${enabled.has(p) ? 'on' : ''}" data-p="${p}">${p}</button>`
    ).join('');
    chips.querySelectorAll('.chip').forEach(c => {
      c.addEventListener('click', () => c.classList.toggle('on'));
    });
  } catch (err) { toast(err.message); }
}

$('#saveAgentBtn')?.addEventListener('click', async () => {
  try {
    const platformsEnabled = [...$('#platformChips').querySelectorAll('.chip.on')].map(c => c.dataset.p);
    const body = {
      mode: $('#agentMode').value,
      postingFrequency: $('#agentFreq').value,
      approvalRequired: $('#agentApproval').checked,
      generalInstructions: $('#agentGeneral').value,
      platformsEnabled,
      actionInstructions: {
        createPost: $('#instr-createPost').value,
        createImagePrompt: $('#instr-createImagePrompt').value,
        createVideoScript: $('#instr-createVideoScript').value,
        analyseGrowth: $('#instr-analyseGrowth').value,
        learnFromOthers: $('#instr-learnFromOthers').value
      }
    };
    await api('/api/agent/config', { method: 'PUT', body: JSON.stringify(body) });
    toast('Agent configuration saved');
  } catch (err) { toast(err.message); }
});

$('#runTickBtn')?.addEventListener('click', async () => {
  try {
    const result = await api('/api/agent/run-tick', { method: 'POST', body: JSON.stringify({ force: true }) });
    if (result.ran) {
      toast('Agent created new content');
      loadPosts();
    } else {
      toast(result.reason || 'Tick skipped');
    }
  } catch (err) { toast(err.message); }
});

// ---------- Growth ----------
async function loadGrowthSummary() {
  try {
    const { posts } = await api('/api/posts');
    const withM = posts.filter(p => p.metrics);
    const totals = withM.reduce((a, p) => {
      const m = p.metrics || {};
      a.views += Number(m.views || 0);
      a.likes += Number(m.likes || 0);
      a.comments += Number(m.comments || 0);
      a.reach += Number(m.reach || 0);
      return a;
    }, { views: 0, likes: 0, comments: 0, reach: 0 });

    $('#growthSummary').innerHTML = `
      <div class="stat"><b>${posts.length}</b><span>Total pieces</span></div>
      <div class="stat"><b>${posts.filter(p => p.status === 'pending_approval').length}</b><span>Pending</span></div>
      <div class="stat"><b>${totals.views}</b><span>Views (tracked)</span></div>
      <div class="stat"><b>${totals.likes}</b><span>Likes</span></div>
      <div class="stat"><b>${totals.comments}</b><span>Comments</span></div>
    `;
  } catch {}
}

$('#analyseGrowthBtn')?.addEventListener('click', async () => {
  const btn = $('#analyseGrowthBtn');
  btn.disabled = true;
  $('#growthInsights').textContent = 'Analysing…';
  try {
    const result = await api('/api/agent/analyse-growth', { method: 'POST', body: '{}' });
    $('#growthInsights').textContent = result.insights || 'No insights returned';
    loadGrowthSummary();
  } catch (err) {
    $('#growthInsights').textContent = err.message;
  } finally {
    btn.disabled = false;
  }
});

// ---------- Learn ----------
$('#learnBtn')?.addEventListener('click', async () => {
  const text = $('#learnText').value.trim();
  if (text.length < 40) return toast('Paste more content');
  const btn = $('#learnBtn');
  btn.disabled = true;
  try {
    const { analysis } = await api('/api/agent/learn', {
      method: 'POST',
      body: JSON.stringify({ postsText: text, goal: $('#learnGoal').value })
    });
    const box = $('#learnResult');
    box.textContent = analysis;
    box.classList.remove('hidden');
  } catch (err) { toast(err.message); }
  finally { btn.disabled = false; }
});

// ---------- Activity ----------
async function loadActivity() {
  try {
    const { log } = await api('/api/activity');
    const el = $('#activityList');
    if (!log.length) {
      el.innerHTML = '<div class="card muted">No activity yet.</div>';
      return;
    }
    el.innerHTML = log.map(e => `
      <div class="list-item">
        <header>
          <strong>${e.type}</strong>
          <span class="meta">${new Date(e.at).toLocaleString()}</span>
        </header>
        <div class="meta">${escapeHtml(e.summary || '')}</div>
      </div>
    `).join('');
  } catch (err) { toast(err.message); }
}

// ---------- Connections ----------
async function loadConnections() {
  try {
    const data = await api('/api/connections');
    const { connections, googleConfigured, metaConfigured, tiktokConfigured, facebookConfigured } = data;
    const el = $('#connectionsList');
    const cards = [];

    // ----- YouTube -----
    const g = connections.google;
    cards.push(`
      <div class="list-item" data-provider="google">
        <header>
          <strong>YouTube (Google)</strong>
          <span class="badge ${g ? 'approved' : ''}">${g ? 'Connected' : 'Not connected'}</span>
        </header>
        <div class="meta">
          ${g
            ? `Connected as <strong>${escapeHtml(g.accountName || 'YouTube')}</strong>
               ${g.email ? ' · ' + escapeHtml(g.email) : ''}
               ${g.channel ? `<br>Channel: ${escapeHtml(g.channel.title || '')} · ${g.channel.subscriberCount || '?'} subs · ${g.channel.viewCount || '?'} views` : ''}
               <br>Connected at ${g.connectedAt ? new Date(g.connectedAt).toLocaleString() : '—'}`
            : (googleConfigured
                ? 'Credentials detected. Click Connect to authorize.'
                : 'Add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_REDIRECT_URI in .env first.')}
        </div>
        <div class="actions">
          ${g
            ? `<button class="btn small" data-action="yt-stats">Refresh stats</button>
               <button class="btn small ghost" data-disconnect="google">Disconnect</button>`
            : `<button class="btn small primary" data-connect="google" ${googleConfigured ? '' : 'disabled'}>Connect YouTube</button>`}
        </div>
        <div class="insights-box hidden" id="ytStatsBox" style="margin-top:12px"></div>
      </div>
    `);

    // ----- Meta / Instagram -----
    const m = connections.meta;
    cards.push(`
      <div class="list-item" data-provider="meta">
        <header>
          <strong>Instagram / Meta</strong>
          <span class="badge ${m ? 'approved' : ''}">${m ? 'Connected' : 'Not connected'}</span>
        </header>
        <div class="meta">
          ${m
            ? `Connected as <strong>@${escapeHtml(m.accountName || m.extra?.username || 'Instagram')}</strong>
               ${m.extra?.mediaCount != null ? ` · ${m.extra.mediaCount} media` : ''}
               ${m.extra?.accountType ? ` · ${escapeHtml(m.extra.accountType)}` : ''}
               <br>Connected at ${m.connectedAt ? new Date(m.connectedAt).toLocaleString() : '—'}`
            : (metaConfigured
                ? 'Credentials detected. Uses Business Login for Instagram. Publishing scopes may require App Review.'
                : 'Add META_APP_ID, META_APP_SECRET and META_REDIRECT_URI in .env first.')}
        </div>
        <div class="actions">
          ${m
            ? `<button class="btn small" data-action="meta-profile">Refresh profile</button>
               <button class="btn small ghost" data-disconnect="meta">Disconnect</button>`
            : `<button class="btn small primary" data-connect="meta" ${metaConfigured ? '' : 'disabled'}>Connect Instagram</button>`}
        </div>
        <div class="insights-box hidden" id="metaProfileBox" style="margin-top:12px"></div>
      </div>
    `);

    // ----- Facebook Page -----
    const fb = connections.facebook;
    cards.push(`
      <div class="list-item" data-provider="facebook">
        <header>
          <strong>Facebook Page</strong>
          <span class="badge ${fb ? 'approved' : ''}">${fb ? 'Connected' : 'Not connected'}</span>
        </header>
        <div class="meta">
          ${fb
            ? `Page: <strong>${escapeHtml(fb.accountName || 'Facebook Page')}</strong>
               ${fb.extra?.pageCount ? ` · ${fb.extra.pageCount} page(s) available` : ''}
               ${fb.extra?.category ? ` · ${escapeHtml(fb.extra.category)}` : ''}
               <br>Connected at ${fb.connectedAt ? new Date(fb.connectedAt).toLocaleString() : '—'}
               <br><span style="opacity:.8">Publishing needs pages_manage_posts (App Review for live mode).</span>`
            : (facebookConfigured
                ? 'Uses the same Meta app credentials. Click Connect, then pick a Page you manage.'
                : 'Add META_APP_ID + META_APP_SECRET (same as Instagram) and register Facebook redirect URI.')}
        </div>
        <div class="actions">
          ${fb
            ? `<button class="btn small" data-action="fb-page">Refresh page info</button>
               <button class="btn small ghost" data-disconnect="facebook">Disconnect</button>`
            : `<button class="btn small primary" data-connect="facebook" ${facebookConfigured ? '' : 'disabled'}>Connect Facebook Page</button>`}
        </div>
        <div class="insights-box hidden" id="fbPageBox" style="margin-top:12px"></div>
      </div>
    `);

    // ----- TikTok -----
    const t = connections.tiktok;
    cards.push(`
      <div class="list-item" data-provider="tiktok">
        <header>
          <strong>TikTok</strong>
          <span class="badge ${t ? 'approved' : ''}">${t ? 'Connected' : 'Not connected'}</span>
        </header>
        <div class="meta">
          ${t
            ? `Connected as <strong>${escapeHtml(t.accountName || 'TikTok')}</strong>
               ${t.extra?.followerCount != null ? ` · ${Number(t.extra.followerCount).toLocaleString()} followers` : ''}
               ${t.extra?.videoCount != null ? ` · ${t.extra.videoCount} videos` : ''}
               <br>Connected at ${t.connectedAt ? new Date(t.connectedAt).toLocaleString() : '—'}
               <br><span style="opacity:.8">Note: public Direct Post requires TikTok app audit.</span>`
            : (tiktokConfigured
                ? 'Credentials detected. Click Connect. Public posting needs audit; private/SELF_ONLY works in sandbox.'
                : 'Add TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET and TIKTOK_REDIRECT_URI in .env first.')}
        </div>
        <div class="actions">
          ${t
            ? `<button class="btn small" data-action="tt-profile">Refresh profile</button>
               <button class="btn small ghost" data-disconnect="tiktok">Disconnect</button>`
            : `<button class="btn small primary" data-connect="tiktok" ${tiktokConfigured ? '' : 'disabled'}>Connect TikTok</button>`}
        </div>
        <div class="insights-box hidden" id="ttProfileBox" style="margin-top:12px"></div>
      </div>
    `);

    el.innerHTML = cards.join('');

    // Connect buttons
    el.querySelectorAll('[data-connect]').forEach(btn => {
      btn.addEventListener('click', () => {
        window.location.href = `/api/oauth/${btn.dataset.connect}/start`;
      });
    });

    // Disconnect buttons
    el.querySelectorAll('[data-disconnect]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const provider = btn.dataset.disconnect;
        try {
          await api(`/api/connections/${provider}/disconnect`, { method: 'POST' });
          toast(`${provider} disconnected`);
          loadConnections();
        } catch (err) { toast(err.message); }
      });
    });

    // Stats / profile buttons
    el.querySelector('[data-action="yt-stats"]')?.addEventListener('click', async () => {
      const box = $('#ytStatsBox');
      box.classList.remove('hidden');
      box.textContent = 'Loading…';
      try {
        const stats = await api('/api/youtube/stats');
        if (!stats.channel) { box.textContent = stats.message || 'No channel data'; return; }
        const c = stats.channel;
        box.textContent = [
          `Title: ${c.title}`,
          `Custom URL: ${c.customUrl || '—'}`,
          `Subscribers: ${c.subscriberCount?.toLocaleString?.() ?? c.subscriberCount}`,
          `Total views: ${c.viewCount?.toLocaleString?.() ?? c.viewCount}`,
          `Videos: ${c.videoCount}`
        ].join('\n');
      } catch (err) { box.textContent = err.message; }
    });

    el.querySelector('[data-action="meta-profile"]')?.addEventListener('click', async () => {
      const box = $('#metaProfileBox');
      box.classList.remove('hidden');
      box.textContent = 'Loading…';
      try {
        const { profile } = await api('/api/meta/profile');
        box.textContent = [
          `Username: @${profile.username || '—'}`,
          `Name: ${profile.name || '—'}`,
          `Account type: ${profile.accountType || '—'}`,
          `Media count: ${profile.mediaCount ?? '—'}`
        ].join('\n');
      } catch (err) { box.textContent = err.message; }
    });

    el.querySelector('[data-action="tt-profile"]')?.addEventListener('click', async () => {
      const box = $('#ttProfileBox');
      box.classList.remove('hidden');
      box.textContent = 'Loading…';
      try {
        const { profile } = await api('/api/tiktok/profile');
        box.textContent = [
          `Display name: ${profile.displayName || '—'}`,
          `Followers: ${profile.followerCount?.toLocaleString?.() ?? profile.followerCount ?? '—'}`,
          `Following: ${profile.followingCount ?? '—'}`,
          `Likes: ${profile.likesCount?.toLocaleString?.() ?? profile.likesCount ?? '—'}`,
          `Videos: ${profile.videoCount ?? '—'}`,
          profile.bio ? `\n${profile.bio}` : ''
        ].join('\n');
      } catch (err) { box.textContent = err.message; }
    });

    el.querySelector('[data-action="fb-page"]')?.addEventListener('click', async () => {
      const box = $('#fbPageBox');
      box.classList.remove('hidden');
      box.textContent = 'Loading…';
      try {
        const { page } = await api('/api/facebook/page');
        box.textContent = [
          `Name: ${page.name || '—'}`,
          `Category: ${page.category || '—'}`,
          `Followers: ${page.followersCount ?? page.fanCount ?? '—'}`,
          page.link ? `Link: ${page.link}` : ''
        ].filter(Boolean).join('\n');
      } catch (err) { box.textContent = err.message; }
    });
  } catch (err) { toast(err.message); }
}

// ---------- Schedule ----------
async function loadSchedule() {
  try {
    const { schedule: items } = await api('/api/schedule');
    const el = $('#scheduleList');
    if (!items?.length) {
      el.innerHTML = '<div class="card muted">No scheduled items.</div>';
      return;
    }
    el.innerHTML = items.map(i => `
      <div class="list-item">
        <header>
          <strong>${escapeHtml(i.provider || 'any')} · ${escapeHtml(i.status)}</strong>
          <span class="meta">${new Date(i.runAt).toLocaleString()}</span>
        </header>
        <div class="meta">Post ${escapeHtml(i.postId)}${i.error ? ' · ' + escapeHtml(i.error) : ''}</div>
        <div class="actions">
          ${i.status === 'scheduled' ? `<button class="btn small ghost" data-cancel-sched="${i.id}">Cancel</button>` : ''}
        </div>
      </div>
    `).join('');
    el.querySelectorAll('[data-cancel-sched]').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          await api(`/api/schedule/${btn.dataset.cancelSched}`, { method: 'DELETE' });
          toast('Cancelled');
          loadSchedule();
        } catch (err) { toast(err.message); }
      });
    });
  } catch (err) { toast(err.message); }
}

$('#refreshScheduleBtn')?.addEventListener('click', loadSchedule);
$('#schedCreateBtn')?.addEventListener('click', async () => {
  try {
    const postId = $('#schedPostId').value.trim();
    const local = $('#schedRunAt').value;
    if (!postId || !local) return toast('Post ID and datetime required');
    const runAt = new Date(local).toISOString();
    await api('/api/schedule', {
      method: 'POST',
      body: JSON.stringify({
        postId,
        runAt,
        provider: $('#schedProvider').value,
        mediaUrl: $('#schedMediaUrl').value.trim() || undefined
      })
    });
    toast('Scheduled');
    loadSchedule();
  } catch (err) { toast(err.message); }
});

// ---------- Comment suggestions ----------
$('#commentSuggestBtn')?.addEventListener('click', async () => {
  const btn = $('#commentSuggestBtn');
  btn.disabled = true;
  try {
    const data = await api('/api/comments/suggest', {
      method: 'POST',
      body: JSON.stringify({
        originalPost: $('#commentPostCtx').value,
        comment: $('#commentText').value,
        platform: $('#commentPlatform').value
      })
    });
    const box = $('#commentResults');
    box.classList.remove('hidden');
    box.innerHTML = (data.replies || []).map((r, i) =>
      `<div style="margin-bottom:10px"><strong>${i + 1}.</strong> ${escapeHtml(r)}
       <button class="btn small ghost" data-copy="${escapeHtml(r)}" style="margin-left:8px">Copy</button></div>`
    ).join('') || escapeHtml(data.raw || 'No replies');
    box.querySelectorAll('[data-copy]').forEach(b => {
      b.addEventListener('click', () => {
        navigator.clipboard.writeText(b.dataset.copy);
        toast('Copied');
      });
    });
  } catch (err) { toast(err.message); }
  finally { btn.disabled = false; }
});

// ---------- Image generation ----------
$('#imageGenBtn')?.addEventListener('click', async () => {
  const btn = $('#imageGenBtn');
  btn.disabled = true;
  btn.textContent = 'Generating…';
  const box = $('#imageResult');
  box.classList.remove('hidden');
  box.textContent = 'Working…';
  try {
    const data = await api('/api/images/generate', {
      method: 'POST',
      body: JSON.stringify({
        prompt: $('#imagePrompt').value,
        postId: $('#imagePostId').value.trim() || undefined
      })
    });
    if (data.relativeUrl) {
      box.innerHTML = `<p>Saved · model ${escapeHtml(data.model || '')}</p>
        <img src="${data.relativeUrl}" alt="generated" style="max-width:100%;border-radius:12px;margin-top:10px">
        <p class="meta">${escapeHtml(data.relativeUrl)}</p>`;
    } else {
      box.textContent = JSON.stringify(data, null, 2);
    }
  } catch (err) {
    box.textContent = err.message + (err.code ? ` (${err.code})` : '');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Generate image';
  }
});

// ---------- Diagnostics ----------
$('#runDiagnoseBtn')?.addEventListener('click', async () => {
  try {
    const data = await api('/api/diagnose');
    const lines = data.checks.map(c => `${c.ok ? '✓' : '✗'} ${c.name}: ${c.detail}`).join('\n');
    $('#diagnoseResult').textContent = `${data.ok ? 'All core checks passed.' : 'Some checks failed.'}\n\n${lines}\n\n${data.advice}`;
  } catch (err) {
    $('#diagnoseResult').textContent = err.message;
  }
});

// ---------- Boot ----------
async function bootApp() {
  try {
    const health = await api('/api/health');
    const pill = $('#geminiStatus');
    if (health.geminiConfigured) {
      pill.textContent = 'Gemini · ready';
      pill.classList.add('ok');
    } else {
      pill.textContent = 'Gemini · not configured';
      pill.classList.add('bad');
    }
  } catch {
    $('#geminiStatus').textContent = 'API · offline';
    $('#geminiStatus').classList.add('bad');
  }
  loadPosts();
  loadAgentConfig();
}

checkAuth();
