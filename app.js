const GITHUB_API = 'https://api.github.com/repos/Fport1/modpacklauncher/releases/latest';

// ── OS detection ───────────────────────────────────────────────────────────────

function detectOS() {
  const ua = navigator.userAgent;
  const platform = navigator.platform || '';

  if (/Win/i.test(platform) || /Windows/i.test(ua)) return 'windows';

  if (/Mac/i.test(platform) || /Macintosh/i.test(ua)) {
    // Apple Silicon reports arm in userAgentData, or we fall back to a canvas check
    if (navigator.userAgentData) {
      const brands = navigator.userAgentData.brands || [];
      // userAgentData doesn't expose arch directly in all browsers, so we use
      // the high-entropy API when available
      return navigator.userAgentData.getHighEntropyValues?.(['architecture'])
        .then(h => h.architecture === 'arm' ? 'mac-arm' : 'mac-x64')
        .catch(() => 'mac-x64');
    }
    return Promise.resolve('mac-x64');
  }

  if (/Linux/i.test(platform) || /Linux/i.test(ua)) return 'linux';

  return 'unknown';
}

async function getOS() {
  const result = detectOS();
  return result instanceof Promise ? await result : result;
}

// ── Asset matching ─────────────────────────────────────────────────────────────

function findAssets(assets) {
  const found = { windows: null, macX64: null, macArm: null, linux: null };

  for (const asset of assets) {
    const name = asset.name;
    const url  = asset.browser_download_url;

    if (name.endsWith('.exe') && !name.endsWith('.blockmap')) {
      found.windows = url;
    } else if (name.endsWith('.dmg')) {
      if (/arm64/i.test(name)) {
        found.macArm = url;
      } else {
        // x64 dmg may have no arch suffix or explicit x64
        found.macX64 = url;
      }
    } else if (name.endsWith('.AppImage')) {
      found.linux = url;
    }
  }

  return found;
}

// ── UI helpers ─────────────────────────────────────────────────────────────────

function setLink(id, url) {
  const el = document.getElementById(id);
  if (!el) return;
  if (url) {
    el.href = url;
    el.classList.remove('loading', 'unavailable');
  } else {
    el.href = '#';
    el.classList.add('unavailable');
    el.textContent = 'No disponible';
  }
}

function setVersion(version) {
  const tag = version.replace(/^v/, '');
  ['hero-version', 'dl-version'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = `v${tag}`;
  });
}

function markCurrentOS(os) {
  const map = {
    windows:  'card-windows',
    'mac-x64': 'card-mac-x64',
    'mac-arm': 'card-mac-arm',
    linux:    'card-linux',
  };
  const cardId = map[os];
  if (cardId) {
    document.getElementById(cardId)?.classList.add('current-os');
  }
}

function updateMainButton(os, assets) {
  const btn   = document.getElementById('main-download-btn');
  const label = document.getElementById('btn-label');
  if (!btn || !label) return;

  const labels = {
    windows:   ['Windows (.exe)', assets.windows],
    'mac-x64': ['macOS Intel (.dmg)', assets.macX64],
    'mac-arm': ['macOS Apple Silicon (.dmg)', assets.macArm],
    linux:     ['Linux (.AppImage)', assets.linux],
    unknown:   ['Ver todas las plataformas', null],
  };

  const [text, url] = labels[os] || labels.unknown;
  label.textContent = text;

  if (url) {
    btn.onclick = () => { window.location.href = url; };
  } else {
    btn.onclick = () => {
      document.getElementById('all-downloads')
        ?.scrollIntoView({ behavior: 'smooth' });
    };
  }
}

function showToast() {
  const toast = document.getElementById('toast');
  if (toast) toast.classList.remove('hidden');
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function downloadForCurrentOS() {
  const os = await getOS();
  const cardMap = {
    windows:   'dl-windows',
    'mac-x64': 'dl-mac-x64',
    'mac-arm': 'dl-mac-arm',
    linux:     'dl-linux',
  };
  const linkId = cardMap[os];
  if (linkId) {
    const link = document.getElementById(linkId);
    if (link && link.href && link.href !== '#' && !link.classList.contains('unavailable')) {
      link.click();
      return;
    }
  }
  document.getElementById('all-downloads')?.scrollIntoView({ behavior: 'smooth' });
}

async function init() {
  // Show loading state on all download buttons
  ['dl-windows', 'dl-mac-x64', 'dl-mac-arm', 'dl-linux'].forEach(id => {
    document.getElementById(id)?.classList.add('loading');
  });

  try {
    const resp = await fetch(GITHUB_API);
    if (!resp.ok) throw new Error(`GitHub API ${resp.status}`);
    const data = await resp.json();

    const version = data.tag_name || 'unknown';
    const assets  = findAssets(data.assets || []);

    setVersion(version);
    setLink('dl-windows',  assets.windows);
    setLink('dl-mac-x64',  assets.macX64);
    setLink('dl-mac-arm',  assets.macArm);
    setLink('dl-linux',    assets.linux);

    // Open mac guide on mac download clicks
    ['dl-mac-x64', 'dl-mac-arm'].forEach(id => {
      document.getElementById(id)?.addEventListener('click', flashMacGuide);
    });

    const os = await getOS();
    markCurrentOS(os);
    updateMainButton(os, assets);

    if (!assets.windows && !assets.macX64 && !assets.macArm && !assets.linux) {
      showToast();
    }
  } catch (err) {
    console.error('Error fetching release:', err);
    setVersion('—');
    ['dl-windows', 'dl-mac-x64', 'dl-mac-arm', 'dl-linux'].forEach(id => {
      document.getElementById(id)?.classList.remove('loading');
      document.getElementById(id)?.classList.add('unavailable');
    });
    const label = document.getElementById('btn-label');
    if (label) label.textContent = 'Ver en GitHub';
    const btn = document.getElementById('main-download-btn');
    if (btn) btn.onclick = () => {
      window.open('https://github.com/Fport1/modpacklauncher/releases', '_blank');
    };
  }
}

document.addEventListener('DOMContentLoaded', init);

function flashMacGuide() {
  const guide = document.getElementById('mac-guide');
  if (!guide) return;
  guide.open = true;
  guide.scrollIntoView({ behavior: 'smooth', block: 'start' });
  guide.classList.remove('flash');
  void guide.offsetWidth; // force reflow to restart animation
  guide.classList.add('flash');
}

function copyMacCmd() {
  const cmd = document.getElementById('mac-cmd')?.textContent;
  if (!cmd) return;
  navigator.clipboard.writeText(cmd).then(() => {
    const btn = document.querySelector('.copy-btn');
    if (!btn) return;
    btn.textContent = '¡Copiado!';
    setTimeout(() => { btn.textContent = 'Copiar'; }, 2000);
  });
}
